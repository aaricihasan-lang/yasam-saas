-- =============================================================================
-- 20280103000800_auth_audit_retention_disposal_f2h.sql
--
-- GİRİŞ GÜVENLİĞİ F2-H — denetim kayıtları için KONTROLLÜ imha / anonimleştirme altyapısı.
-- BAĞIMLILIK: 000000 … 000700. EKLEYİCİ. Bu migration HİÇBİR kaydı silmez / değiştirmez; politika satırları
-- "karar_bekliyor" kalır; ZAMANLAYICI YOK (yürütme yalnız Owner'ın elle başlattığı tek bir çağrıdır).
--
-- AKIŞ (her adım Owner'ın MFA'lı, ≤30 dk taze oturumu; geri döndürülemez adımlar ayrıca işleme özel kanıt):
--   1) Politika: auth_retention_policy_set — süre (30–36500 gün) + hukuki gerekçe (≥10 karakter) + yöntem.
--      Kanıt: step-up 'retention_policy' (hedef = tablo kimliği). Karar veren / tarih kaydedilir. Yöntem tabloya
--      uygun olmalı (security_events YALNIZ 'silme': kullanıcı FK'si nedeniyle anonimleştirme gerçek anonimlik değildir).
--   2) Önizleme (salt-okunur sayım): auth_retention_preview — kesim tarihi SABİTLENİR, aday / yasal saklama
--      nedeniyle hariç sayıları ve politika parmak izi kaydedilir → çalıştırma 'previewed' (1 saat geçerli).
--   3) Yürütme: auth_retention_execute — AYRI açık onay: step-up 'retention_execute' (hedef = çalıştırma) + onay
--      cümlesi "<tablo> <yöntem> <sayı>". TEK işlemde: politika ve çalıştırma satır kilidi, politika parmak izi
--      değişmemiş, aday sayısı önizlemeyle AYNI olmalı; değilse HİÇBİR satır değişmez ('failed'). Hata → alt işlem
--      geri alınır, durum 'failed' + hata kodu yazılır (kısmi imha YOK). Paralel ikinci yürütme 'not_previewed'.
--   4) İptal: auth_retention_cancel. Yasal saklama (legal hold): auth_retention_hold_set / _release — askıdaki
--      kişinin / cihazın satırları imha EDİLMEZ.
--   Değiştirilemez denetim tabloları (auth_device_decisions, auth_recovery_events) sıradan işlemlere KAPALI kalır:
--   append-only tetikleyicisi yalnız (a) bu işlemde yürüyen bir imha çalıştırması varsa (auth_retention_context,
--   txid'e bağlı; API rolüne kapalı), (b) o çalıştırmanın tablosu ise, (c) satır kesim tarihinden eskiyse ve
--   (d) DELETE yalnız 'silme' / UPDATE yalnız tam anonimleştirme biçimindeyse izin verir.
--   Anonimleştirme: kişi / cihaz kimlikleri sabit sıfır kimliğe, serbest metin / ayrıntı boşa; olay türü ve tarih kalır.
--   Her adım auth_retention_log'a (yalnız eklenebilir; kişisel veri yok — sayılar, tablo, yöntem, aktör) yazılır.
--
-- GÜVENLİK: SECURITY DEFINER + search_path=''; tablolar RLS açık, policy yok, API rollerine kapalı.
-- İDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.
-- ROLLBACK: append-only tetikleyici fonksiyonlarını 000300 / 000500 gövdelerine geri yükle; yeni tablolar zararsız.
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 800;
  v_known   constant integer := 1200;
  v_reg     integer;
  v_fp      integer := -1;
  v_missing text;
  r         record;
BEGIN
  -- 1) Kayıt (her doğrusal F2 migration'ı COMMIT'ten önce yazar).
  IF to_regprocedure('public.auth_f2_schema_level()') IS NOT NULL THEN
    EXECUTE 'SELECT public.auth_f2_schema_level()' INTO v_reg;
  END IF;
  -- 2) Katalog parmak izleri (kayıttan bağımsız ikinci kaynak).
  FOR r IN SELECT * FROM (VALUES
      (0, to_regprocedure('public.auth_is_owner_admin(uuid)') IS NOT NULL),
      (100, to_regclass('public.auth_mfa_challenges') IS NOT NULL),
      (300, to_regclass('public.auth_trusted_devices') IS NOT NULL),
      (400, to_regclass('public.auth_email_otps') IS NOT NULL),
      (500, to_regclass('public.auth_recovery_codes') IS NOT NULL),
      (600, EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'auth_owner_session_stale')),
      (700, to_regclass('public.auth_audit_retention_policy') IS NOT NULL),
      (800, to_regclass('public.auth_retention_holds') IS NOT NULL),
      (900, to_regprocedure('public.user_sessions_user_id_immutable()') IS NOT NULL),
      (1000, to_regclass('public.auth_session_device_proofs') IS NOT NULL),
      (1100, to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL),
      (1200, to_regprocedure('public.auth_email_provider_allowed(text)') IS NOT NULL)
    ) AS t(lvl, present) ORDER BY lvl LOOP
    IF r.present THEN
      v_fp := greatest(v_fp, r.lvl);
    ELSIF r.lvl < v_me THEN
      v_missing := concat_ws(',', v_missing, lpad(r.lvl::text, 6, '0'));
    END IF;
  END LOOP;
  IF coalesce(v_reg, -1) > v_me OR v_fp > v_me THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: % daha yeni bir F2 aşamasının üzerine YENİDEN UYGULANAMAZ (kayıt=%, katalog=%). Owner korumalı fonksiyonlar eski gövdeye dönerdi; hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0')
      USING ERRCODE = 'YF201';
  END IF;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: SIRA HATASI — % uygulanmadan önce eksik aşama(lar): %. Hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), v_missing USING ERRCODE = 'YF202';
  END IF;
  IF (v_reg IS NULL AND v_fp >= 0) OR (v_reg IS NOT NULL AND v_reg <= v_known AND v_reg <> v_fp) THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: ŞEMA SAPMASI — kayıt (%) ile katalog parmak izi (%) çelişiyor; insan incelemesi gerekli. Hiçbir değişiklik yapılmadı.',
      coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0') USING ERRCODE = 'YF203';
  END IF;
END $f2guard$;
-- <<< F2 MİGRATION KORUMASI

-- ── 1) Step-up işlem listesi: + retention_policy / retention_execute ──────────
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_step_up_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_step_up_chk
  CHECK ((purpose = 'step_up') = (step_action IS NOT NULL AND step_target IS NOT NULL AND step_session_id IS NOT NULL)
     AND (step_action IS NULL OR step_action IN ('device_approve', 'mfa_disable', 'recovery_execute', 'retention_policy', 'retention_execute')));

-- Step-up başlatma: gövde 000700 ile AYNI, yalnız izinli işlem listesi genişledi.
CREATE OR REPLACE FUNCTION public.auth_owner_step_up_begin(p_actor_token text, p_action text, p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   timestamptz := now();
  v_s     record;
  v_open  integer;
  v_id    uuid;
  v_nonce text;
  v_codes text[] := ARRAY[]::text[];
  v_c     text;
  v_match text;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL OR v_s.mfa_method IS NULL OR NOT public.auth_is_owner_admin(v_s.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF public.auth_session_fresh_mfa(p_actor_token, 30) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('device_approve', 'mfa_disable', 'recovery_execute', 'retention_policy', 'retention_execute') OR p_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mfa:' || v_s.user_id::text, 0));
  UPDATE public.auth_mfa_challenges SET state = 'expired'
   WHERE user_id = v_s.user_id AND state IN ('pending', 'verified') AND expires_at <= v_now;
  SELECT count(*) INTO v_open FROM public.auth_mfa_challenges
   WHERE user_id = v_s.user_id AND purpose = 'step_up' AND state IN ('pending', 'verified');
  IF v_open >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_many_open');
  END IF;
  -- QR nonce (192 bit) + 3 farklı 2 haneli kod (1 doğru) — auth_mfa_begin (F2-C) ile aynı üretim.
  v_nonce := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  WHILE coalesce(array_length(v_codes, 1), 0) < 3 LOOP
    v_c := lpad(((get_byte(extensions.gen_random_bytes(1), 0) * 100) / 256)::text, 2, '0');
    IF NOT (v_c = ANY (v_codes)) THEN
      v_codes := v_codes || v_c;
    END IF;
  END LOOP;
  v_match := v_codes[1 + (get_byte(extensions.gen_random_bytes(1), 0) % 3)];
  INSERT INTO public.auth_mfa_challenges (user_id, purpose, browser_secret_hash, client_channel, created_at, expires_at,
                                          qr_nonce_hash, match_code, match_options, step_action, step_target, step_session_id)
  VALUES (v_s.user_id, 'step_up', encode(sha256(extensions.gen_random_bytes(32)), 'hex'), 'desktop_web', v_now, v_now + interval '5 minutes',
          encode(sha256(convert_to(v_nonce, 'UTF8')), 'hex'), v_match, v_codes, p_action, p_target, v_s.session_id)
  RETURNING id INTO v_id;
  PERFORM public.auth_recovery_log(v_s.user_id, v_s.user_id, 'step_up_requested',
                                   jsonb_build_object('challenge_id', v_id, 'action', p_action, 'target', p_target));
  RETURN jsonb_build_object('ok', true, 'challenge_id', v_id, 'expires_at', v_now + interval '5 minutes',
    'qr_nonce', v_nonce, 'match_code', v_match,
    'has_device', EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.user_id = v_s.user_id AND d.state = 'active'),
    'email_verified', (SELECT u.email_verified_at IS NOT NULL FROM public.users u WHERE u.id = v_s.user_id));
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_step_up_begin(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owner_step_up_begin(text, text, uuid) TO service_role;

-- ── 2) Politika tablosu ek kuralları ─────────────────────────────────────────
-- security_events kullanıcı FK'si taşır → anonimleştirme gerçek anonimlik sağlamaz; yalnız silme.
ALTER TABLE public.auth_audit_retention_policy DROP CONSTRAINT IF EXISTS auth_audit_retention_method_table_chk;
ALTER TABLE public.auth_audit_retention_policy ADD CONSTRAINT auth_audit_retention_method_table_chk
  CHECK (table_name <> 'security_events' OR disposal_method IN ('karar_bekliyor', 'silme'));

-- ── 3) Yasal saklama (legal hold), çalıştırmalar, bağlam, kayıt ───────────────
CREATE TABLE IF NOT EXISTS public.auth_retention_holds (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hold_type   text NOT NULL CHECK (hold_type IN ('subject_user', 'device')),
  subject_id  uuid NOT NULL,
  reason      text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  released_by uuid,
  released_at timestamptz,
  CONSTRAINT auth_retention_holds_release_chk CHECK ((released_at IS NULL) = (released_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_retention_holds_active ON public.auth_retention_holds (hold_type, subject_id) WHERE released_at IS NULL;
ALTER TABLE public.auth_retention_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_retention_holds FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.auth_retention_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name         text NOT NULL CHECK (table_name IN ('auth_device_decisions', 'auth_recovery_events', 'security_events')),
  disposal_method    text NOT NULL CHECK (disposal_method IN ('silme', 'anonimlestirme')),
  retention_days     integer NOT NULL,
  policy_fingerprint text NOT NULL CHECK (policy_fingerprint ~ '^[0-9a-f]{32}$'),
  cutoff             timestamptz NOT NULL,
  candidate_count    bigint NOT NULL CHECK (candidate_count >= 0),
  held_count         bigint NOT NULL CHECK (held_count >= 0),
  state              text NOT NULL DEFAULT 'previewed' CHECK (state IN ('previewed', 'completed', 'cancelled', 'failed', 'expired')),
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  executed_by        uuid,
  executed_at        timestamptz,
  affected_count     bigint,
  error_code         text CHECK (error_code IS NULL OR error_code ~ '^[a-z_0-9]{2,60}$'),
  CONSTRAINT auth_retention_runs_ttl_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 hour'),
  CONSTRAINT auth_retention_runs_done_chk CHECK (state <> 'completed' OR (executed_at IS NOT NULL AND affected_count IS NOT NULL))
);
-- Tablo başına aynı anda tek önizlenmiş çalıştırma.
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_retention_runs_open ON public.auth_retention_runs (table_name) WHERE state = 'previewed';
ALTER TABLE public.auth_retention_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_retention_runs FROM PUBLIC, anon, authenticated, service_role;

-- Yürüyen imha işaretçisi: YALNIZ auth_retention_execute'un kendi işleminde (txid) var; işlem bitmeden silinir.
CREATE TABLE IF NOT EXISTS public.auth_retention_context (
  txid    bigint PRIMARY KEY,
  run_id  uuid NOT NULL
);
ALTER TABLE public.auth_retention_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_retention_context FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.auth_retention_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id     uuid,
  table_name text,
  action     text NOT NULL CHECK (action IN ('policy_set', 'preview', 'execute', 'execute_failed', 'cancel', 'expire', 'hold_set', 'hold_release')),
  actor_id   uuid,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_retention_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_retention_log FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.auth_retention_log_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'auth_retention_log yalnız eklenebilir' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_log_append_only() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS auth_retention_log_append_only_trg ON public.auth_retention_log;
CREATE TRIGGER auth_retention_log_append_only_trg BEFORE UPDATE OR DELETE ON public.auth_retention_log
  FOR EACH ROW EXECUTE FUNCTION public.auth_retention_log_append_only();

-- ── 4) İç yardımcılar ────────────────────────────────────────────────────────
-- Bu işlemde yürüyen imha çalıştırması (yoksa boş).
CREATE OR REPLACE FUNCTION public.auth_retention_active_run()
RETURNS TABLE (table_name text, disposal_method text, cutoff timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.table_name, r.disposal_method, r.cutoff
    FROM public.auth_retention_context c JOIN public.auth_retention_runs r ON r.id = c.run_id
   WHERE c.txid = txid_current()
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.auth_retention_active_run() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_retention_zero_uuid() RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;
REVOKE ALL ON FUNCTION public.auth_retention_zero_uuid() FROM PUBLIC, anon, authenticated, service_role;

-- Politika parmak izi: süre / gerekçe / yöntem / karar kimliği — önizlemeden sonra değişirse yürütme reddedilir.
CREATE OR REPLACE FUNCTION public.auth_retention_policy_fp(p_table text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT md5(coalesce(p.retention_days::text, '') || '|' || coalesce(p.legal_basis, '') || '|' || p.disposal_method || '|' ||
             coalesce(p.decided_by::text, '') || '|' || coalesce(p.decided_at::text, ''))
    FROM public.auth_audit_retention_policy p WHERE p.table_name = p_table;
$$;
REVOKE ALL ON FUNCTION public.auth_retention_policy_fp(text) FROM PUBLIC, anon, authenticated, service_role;

-- Aday sayısı (yasal saklama hariç) ve yasal saklama nedeniyle hariç tutulan sayı.
CREATE OR REPLACE FUNCTION public.auth_retention_count(p_table text, p_cutoff timestamptz, OUT candidates bigint, OUT held bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_table = 'auth_recovery_events' THEN
    SELECT count(*) FILTER (WHERE NOT h), count(*) FILTER (WHERE h) INTO candidates, held FROM (
      SELECT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL AND x.hold_type = 'subject_user'
                       AND (x.subject_id = e.subject_user_id OR x.subject_id = e.actor_id)) AS h
        FROM public.auth_recovery_events e
       WHERE e.created_at < p_cutoff AND e.subject_user_id <> public.auth_retention_zero_uuid()) s;
  ELSIF p_table = 'auth_device_decisions' THEN
    SELECT count(*) FILTER (WHERE NOT h), count(*) FILTER (WHERE h) INTO candidates, held FROM (
      SELECT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL
                       AND ((x.hold_type = 'device' AND x.subject_id = d.device_id) OR (x.hold_type = 'subject_user' AND x.subject_id = d.actor_id))) AS h
        FROM public.auth_device_decisions d
       WHERE d.created_at < p_cutoff AND d.device_id <> public.auth_retention_zero_uuid()) s;
  ELSIF p_table = 'security_events' THEN
    SELECT count(*) FILTER (WHERE NOT h), count(*) FILTER (WHERE h) INTO candidates, held FROM (
      SELECT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL AND x.hold_type = 'subject_user'
                       AND x.subject_id = s0.user_id) AS h
        FROM public.security_events s0 WHERE s0.created_at < p_cutoff) s;
  ELSE
    RAISE EXCEPTION 'auth_retention_count: bilinmeyen tablo' USING ERRCODE = 'invalid_parameter_value';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_count(text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

-- Taze MFA'lı Owner aktörü (değilse NULL).
CREATE OR REPLACE FUNCTION public.auth_retention_owner(p_actor_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN public.auth_is_owner_admin(f) THEN f END FROM (SELECT public.auth_session_fresh_mfa(p_actor_token, 30) AS f) x;
$$;
REVOKE ALL ON FUNCTION public.auth_retention_owner(text) FROM PUBLIC, anon, authenticated, service_role;

-- Tablo kimliği (step-up hedefi için sabit uuid).
CREATE OR REPLACE FUNCTION public.auth_retention_table_uuid(p_table text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT md5('yasam-retention:' || p_table)::uuid $$;
GRANT EXECUTE ON FUNCTION public.auth_retention_table_uuid(text) TO service_role;

-- ── 5) Değiştirilemez denetim tetikleyicileri: YALNIZ yürüyen imha çalıştırması için dar istisna ──
CREATE OR REPLACE FUNCTION public.auth_recovery_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.auth_retention_active_run();
  IF r.table_name = 'auth_recovery_events' AND OLD.created_at < r.cutoff THEN
    IF TG_OP = 'DELETE' AND r.disposal_method = 'silme' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND r.disposal_method = 'anonimlestirme'
       AND NEW.id = OLD.id AND NEW.event = OLD.event AND NEW.created_at = OLD.created_at
       AND NEW.subject_user_id = public.auth_retention_zero_uuid() AND NEW.actor_id IS NULL AND NEW.detail = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'auth_recovery_events yalnız eklenebilir' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_events_append_only() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_device_decisions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.auth_retention_active_run();
  IF r.table_name = 'auth_device_decisions' AND OLD.created_at < r.cutoff THEN
    IF TG_OP = 'DELETE' AND r.disposal_method = 'silme' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND r.disposal_method = 'anonimlestirme'
       AND NEW.id = OLD.id AND NEW.decision = OLD.decision AND NEW.created_at = OLD.created_at
       AND NEW.verification_method IS NOT DISTINCT FROM OLD.verification_method
       AND NEW.fingerprint_confirmed = OLD.fingerprint_confirmed
       AND NEW.device_id = public.auth_retention_zero_uuid() AND NEW.actor_id = public.auth_retention_zero_uuid() AND NEW.note IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'auth_device_decisions yalnız eklenebilir' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.auth_device_decisions_append_only() FROM PUBLIC, anon, authenticated, service_role;

-- ── 6) Politika (Owner + taze MFA + işleme özel kanıt) ───────────────────────
CREATE OR REPLACE FUNCTION public.auth_retention_policy_set(
  p_actor_token text, p_table text, p_retention_days integer, p_legal_basis text, p_disposal_method text, p_note text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
  v_proof uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auth_audit_retention_policy WHERE table_name = p_table) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_table');
  END IF;
  IF p_disposal_method NOT IN ('silme', 'anonimlestirme') OR p_retention_days IS NULL OR p_retention_days NOT BETWEEN 30 AND 36500
     OR p_legal_basis IS NULL OR length(btrim(p_legal_basis)) NOT BETWEEN 10 AND 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  IF p_table = 'security_events' AND p_disposal_method <> 'silme' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'method_not_allowed');
  END IF;
  v_proof := public.auth_step_up_lock(p_actor_token, 'retention_policy', public.auth_retention_table_uuid(p_table));
  IF v_proof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'retention_policy', 'target', public.auth_retention_table_uuid(p_table));
  END IF;
  -- Açık önizleme varsa geçersizleşir (parmak izi değişecek).
  UPDATE public.auth_retention_runs SET state = 'cancelled' WHERE table_name = p_table AND state = 'previewed';
  UPDATE public.auth_audit_retention_policy
     SET retention_days = p_retention_days, legal_basis = btrim(p_legal_basis), disposal_method = p_disposal_method,
         decided_by = v_actor, decided_at = now(), note = left(nullif(btrim(coalesce(p_note, '')), ''), 1000)
   WHERE table_name = p_table;
  PERFORM public.auth_step_up_consume(v_proof);
  INSERT INTO public.auth_retention_log (table_name, action, actor_id, detail)
  VALUES (p_table, 'policy_set', v_actor, jsonb_build_object('retention_days', p_retention_days, 'method', p_disposal_method));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_policy_set(text, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_policy_set(text, text, integer, text, text, text) TO service_role;

-- ── 7) Önizleme (salt sayım; kesim sabitlenir) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_retention_preview(p_actor_token text, p_table text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
  p public.auth_audit_retention_policy%ROWTYPE;
  v_cutoff timestamptz;
  v_c record;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT * INTO p FROM public.auth_audit_retention_policy WHERE table_name = p_table FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_table');
  END IF;
  IF p.retention_days IS NULL OR p.disposal_method = 'karar_bekliyor' OR p.legal_basis IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'policy_undecided');
  END IF;
  UPDATE public.auth_retention_runs SET state = 'expired' WHERE table_name = p_table AND state = 'previewed' AND expires_at <= now();
  IF EXISTS (SELECT 1 FROM public.auth_retention_runs WHERE table_name = p_table AND state = 'previewed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'preview_exists');
  END IF;
  v_cutoff := now() - make_interval(days => p.retention_days);
  SELECT * INTO v_c FROM public.auth_retention_count(p_table, v_cutoff);
  INSERT INTO public.auth_retention_runs (table_name, disposal_method, retention_days, policy_fingerprint, cutoff,
                                          candidate_count, held_count, created_by, expires_at)
  VALUES (p_table, p.disposal_method, p.retention_days, public.auth_retention_policy_fp(p_table), v_cutoff,
          v_c.candidates, v_c.held, v_actor, now() + interval '1 hour')
  RETURNING id INTO v_id;
  INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id, detail)
  VALUES (v_id, p_table, 'preview', v_actor, jsonb_build_object('candidates', v_c.candidates, 'held', v_c.held, 'method', p.disposal_method));
  RETURN jsonb_build_object('ok', true, 'run_id', v_id, 'table', p_table, 'method', p.disposal_method, 'cutoff', v_cutoff,
    'candidates', v_c.candidates, 'held', v_c.held, 'expires_at', now() + interval '1 hour',
    'confirm_text', p_table || ' ' || p.disposal_method || ' ' || v_c.candidates);
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_preview(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_preview(text, text) TO service_role;

-- ── 8) Yürütme (geri döndürülemez; ayrı açık onay + kanıt; tek işlem) ────────
CREATE OR REPLACE FUNCTION public.auth_retention_execute(p_actor_token text, p_run_id uuid, p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
  v_run public.auth_retention_runs%ROWTYPE;
  p public.auth_audit_retention_policy%ROWTYPE;
  v_proof uuid;
  v_c record;
  v_n bigint := 0;
  v_err text;
  zero constant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT * INTO v_run FROM public.auth_retention_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.state <> 'previewed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_previewed');
  END IF;
  IF v_run.expires_at <= now() THEN
    UPDATE public.auth_retention_runs SET state = 'expired' WHERE id = v_run.id;
    INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id) VALUES (v_run.id, v_run.table_name, 'expire', v_actor);
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  IF p_confirm IS DISTINCT FROM (v_run.table_name || ' ' || v_run.disposal_method || ' ' || v_run.candidate_count) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'confirm_mismatch');
  END IF;
  v_proof := public.auth_step_up_lock(p_actor_token, 'retention_execute', v_run.id);
  IF v_proof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'retention_execute', 'target', v_run.id);
  END IF;
  SELECT * INTO p FROM public.auth_audit_retention_policy WHERE table_name = v_run.table_name FOR UPDATE;

  BEGIN
    IF public.auth_retention_policy_fp(v_run.table_name) IS DISTINCT FROM v_run.policy_fingerprint
       OR p.disposal_method IS DISTINCT FROM v_run.disposal_method OR p.retention_days IS NULL THEN
      RAISE EXCEPTION 'policy_changed' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_c FROM public.auth_retention_count(v_run.table_name, v_run.cutoff);
    IF v_c.candidates <> v_run.candidate_count THEN
      RAISE EXCEPTION 'count_mismatch' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.auth_retention_context (txid, run_id) VALUES (txid_current(), v_run.id);

    IF v_run.table_name = 'auth_recovery_events' THEN
      IF v_run.disposal_method = 'silme' THEN
        DELETE FROM public.auth_recovery_events e
         WHERE e.created_at < v_run.cutoff AND e.subject_user_id <> zero
           AND NOT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL AND x.hold_type = 'subject_user'
                             AND (x.subject_id = e.subject_user_id OR x.subject_id = e.actor_id));
      ELSE
        UPDATE public.auth_recovery_events e SET subject_user_id = zero, actor_id = NULL, detail = '{}'::jsonb
         WHERE e.created_at < v_run.cutoff AND e.subject_user_id <> zero
           AND NOT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL AND x.hold_type = 'subject_user'
                             AND (x.subject_id = e.subject_user_id OR x.subject_id = e.actor_id));
      END IF;
    ELSIF v_run.table_name = 'auth_device_decisions' THEN
      IF v_run.disposal_method = 'silme' THEN
        DELETE FROM public.auth_device_decisions d
         WHERE d.created_at < v_run.cutoff AND d.device_id <> zero
           AND NOT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL
                             AND ((x.hold_type = 'device' AND x.subject_id = d.device_id) OR (x.hold_type = 'subject_user' AND x.subject_id = d.actor_id)));
      ELSE
        UPDATE public.auth_device_decisions d SET device_id = zero, actor_id = zero, note = NULL
         WHERE d.created_at < v_run.cutoff AND d.device_id <> zero
           AND NOT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL
                             AND ((x.hold_type = 'device' AND x.subject_id = d.device_id) OR (x.hold_type = 'subject_user' AND x.subject_id = d.actor_id)));
      END IF;
    ELSE
      DELETE FROM public.security_events s0
       WHERE s0.created_at < v_run.cutoff
         AND NOT EXISTS (SELECT 1 FROM public.auth_retention_holds x WHERE x.released_at IS NULL AND x.hold_type = 'subject_user'
                           AND x.subject_id = s0.user_id);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> v_run.candidate_count THEN
      RAISE EXCEPTION 'affected_mismatch' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.auth_retention_context WHERE txid = txid_current();
  EXCEPTION WHEN OTHERS THEN
    -- Alt işlem geri alındı: HİÇBİR satır değişmedi (kısmi imha yok). Bağlam satırı da geri alındı.
    v_err := CASE WHEN SQLERRM IN ('policy_changed', 'count_mismatch', 'affected_mismatch') THEN SQLERRM ELSE 'sql_' || lower(SQLSTATE) END;
    UPDATE public.auth_retention_runs SET state = 'failed', error_code = v_err, executed_by = v_actor, executed_at = now() WHERE id = v_run.id;
    -- Çalıştırma kalıcı olarak 'failed' → bu çalıştırmaya bağlı kanıt artık kullanılamaz; açık bırakılmaz.
    PERFORM public.auth_step_up_consume(v_proof);
    INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id, detail)
    VALUES (v_run.id, v_run.table_name, 'execute_failed', v_actor, jsonb_build_object('error', v_err));
    RETURN jsonb_build_object('ok', false, 'code', 'failed', 'error', v_err);
  END;

  UPDATE public.auth_retention_runs SET state = 'completed', executed_by = v_actor, executed_at = now(), affected_count = v_n WHERE id = v_run.id;
  PERFORM public.auth_step_up_consume(v_proof);
  INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id, detail)
  VALUES (v_run.id, v_run.table_name, 'execute', v_actor,
          jsonb_build_object('method', v_run.disposal_method, 'affected', v_n, 'held', v_c.held, 'cutoff', v_run.cutoff));
  RETURN jsonb_build_object('ok', true, 'affected', v_n, 'held', v_c.held, 'method', v_run.disposal_method);
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_execute(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_execute(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_retention_cancel(p_actor_token text, p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
  v_run public.auth_retention_runs%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  UPDATE public.auth_retention_runs SET state = 'cancelled' WHERE id = p_run_id AND state = 'previewed' RETURNING * INTO v_run;
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_previewed');
  END IF;
  INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id) VALUES (v_run.id, v_run.table_name, 'cancel', v_actor);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_cancel(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_cancel(text, uuid) TO service_role;

-- ── 9) Yasal saklama (Owner + taze MFA; ekleme yetkiyi daraltır → kanıt istemez; kaldırma kanıt ister) ──
CREATE OR REPLACE FUNCTION public.auth_retention_hold_set(p_actor_token text, p_hold_type text, p_subject_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
  v_id bigint;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_hold_type NOT IN ('subject_user', 'device') OR p_subject_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  INSERT INTO public.auth_retention_holds (hold_type, subject_id, reason, created_by)
  VALUES (p_hold_type, p_subject_id, btrim(p_reason), v_actor)
  ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;
  -- Açık önizlemeler geçersiz (aday sayısı değişti).
  UPDATE public.auth_retention_runs SET state = 'cancelled' WHERE state = 'previewed';
  INSERT INTO public.auth_retention_log (action, actor_id, detail) VALUES ('hold_set', v_actor, jsonb_build_object('hold_id', v_id, 'type', p_hold_type));
  RETURN jsonb_build_object('ok', true, 'changed', true, 'hold_id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_hold_set(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_hold_set(text, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_retention_hold_release(p_actor_token text, p_hold_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
  v_proof uuid;
  v_n integer;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  -- Saklamayı KALDIRMAK imhayı mümkün kılar → politika kanıtı gibi işleme özel kanıt (hedef: tablo-bağımsız sabit kimlik).
  v_proof := public.auth_step_up_lock(p_actor_token, 'retention_policy', public.auth_retention_table_uuid('hold:' || p_hold_id::text));
  IF v_proof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'retention_policy',
                              'target', public.auth_retention_table_uuid('hold:' || p_hold_id::text));
  END IF;
  UPDATE public.auth_retention_holds SET released_at = now(), released_by = v_actor WHERE id = p_hold_id AND released_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  UPDATE public.auth_retention_runs SET state = 'cancelled' WHERE state = 'previewed';
  PERFORM public.auth_step_up_consume(v_proof);
  INSERT INTO public.auth_retention_log (action, actor_id, detail) VALUES ('hold_release', v_actor, jsonb_build_object('hold_id', p_hold_id));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_hold_release(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_hold_release(text, bigint) TO service_role;

-- ── 10) Owner görünümü (kişisel veri / satır içeriği YOK) ─────────────────────
CREATE OR REPLACE FUNCTION public.auth_retention_overview(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  UPDATE public.auth_retention_runs SET state = 'expired' WHERE state = 'previewed' AND expires_at <= now();
  RETURN jsonb_build_object('ok', true,
    'policies', (SELECT coalesce(jsonb_agg(jsonb_build_object('table', p.table_name, 'data_class', p.data_class, 'retention_days', p.retention_days,
                   'legal_basis', p.legal_basis, 'method', p.disposal_method, 'decided_at', p.decided_at, 'note', p.note,
                   'target', public.auth_retention_table_uuid(p.table_name),
                   'total', r.total_rows, 'past_retention', r.past_retention) ORDER BY p.table_name), '[]'::jsonb)
                 FROM public.auth_audit_retention_policy p
                 LEFT JOIN public.auth_audit_retention_report() r ON r.table_name = p.table_name),
    'open_runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'table', table_name, 'method', disposal_method, 'cutoff', cutoff,
                   'candidates', candidate_count, 'held', held_count, 'expires_at', expires_at,
                   'confirm_text', table_name || ' ' || disposal_method || ' ' || candidate_count) ORDER BY created_at DESC), '[]'::jsonb)
                  FROM public.auth_retention_runs WHERE state = 'previewed'),
    'recent_runs', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb) FROM (
                  SELECT jsonb_build_object('id', id, 'table', table_name, 'method', disposal_method, 'state', state, 'candidates', candidate_count,
                           'affected', affected_count, 'error', error_code, 'created_at', created_at, 'executed_at', executed_at) x
                    FROM public.auth_retention_runs WHERE state <> 'previewed' ORDER BY created_at DESC LIMIT 20) y),
    'holds', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', hold_type, 'subject_id', subject_id, 'reason', reason,
                   'created_at', created_at, 'release_target', public.auth_retention_table_uuid('hold:' || id::text)) ORDER BY id), '[]'::jsonb)
              FROM public.auth_retention_holds WHERE released_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_overview(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_overview(text) TO service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 800 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
