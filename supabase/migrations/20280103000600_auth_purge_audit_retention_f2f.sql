-- =============================================================================
-- 20280103000600_auth_purge_audit_retention_f2f.sql
--
-- GİRİŞ GÜVENLİĞİ F2-F — (1) kalıcı silme × güvenlik denetimi saklama, (2) Owner yüksek riskli işlemlerinde
-- TAZE ikinci doğrulama. BAĞIMLILIK: 000000 → 000100 → 000300 → 000400 → 000500. EKLEYİCİ; veri SİLMEZ.
--
-- (1) KÖK NEDEN: admin_purge_archived_expert (20271009100000; DEĞİŞTİRİLMEZ) `user_id uuid` kolonu olan her tabloyu
--     ve tenant tablolarını siler; silinemeyen satır kalırsa her şeyi geri alır (fail-closed). F2'nin iki
--     yalnız-eklenebilir denetim tablosu bu döngüyü kilitliyordu:
--       * auth_device_decisions → auth_trusted_devices'a ON DELETE CASCADE FK: cihaz silinince karar satırını
--         silmeye çalışır, append-only tetikleyici reddeder → cihazı olan uzman HİÇ silinemez.
--       * auth_recovery_events.user_id (uuid) → purge doğrudan DELETE dener, append-only reddeder.
--     ÇÖZÜM (güvenlik geçmişi KORUNUR, denetim koruması KALDIRILMAZ, purge fonksiyonuna dokunulmaz):
--       * auth_device_decisions.device_id FK'si kaldırılır (değer korunur; kayıt cihazdan bağımsız denetim
--         kanıtıdır). Cihaz / hesap silinse de karar geçmişi kalır; UPDATE/DELETE yasağı aynen sürer.
--       * auth_recovery_events.user_id → subject_user_id (kayıt öznesi; hesaba FK YOK, zaten yoktu). Purge'ün
--         kullanıcı-tablosu keşfine girmez → satırlar korunur. Satırlarda adres / kod / özet yoktur (takma kimlik).
--     Saklama süresi (KVKK) Owner kararıdır; bu migration yalnız SAKLAR (geri döndürülebilir yön), hiçbir şey silmez.
--
-- (2) Owner hesabı ele geçirilirse (çalınmış oturum çerezi) en kısa devralma zincirleri: başka kullanıcının
--     MFA zorunluluğunu kapatmak, saldırganın cihazını onaylamak, kurtarma talebi açmak / yürütmek. Bu dört işlem
--     artık MFA'lı Owner oturumunun SON 30 DAKİKA içinde açılmış olmasını ister (yeniden giriş = parola + ikinci
--     doğrulama). Önceki yetki / ret kodları aynen korunur: kontrol yalnız "MFA'lı ama bayat Owner oturumu"
--     durumunda devreye girer ('fresh_mfa_required'). Gövdeler DEĞİŞMEZ: mevcut fonksiyon *_core adına taşınır,
--     aynı imzalı ince sarmalayıcı önce tazelik denetler sonra çekirdeği çağırır.
--
-- GÜVENLİK: SECURITY DEFINER + search_path=''; çekirdekler service_role'e KAPALI.
-- İDEMPOTENT: IF [NOT] EXISTS / CREATE OR REPLACE / to_regprocedure guard'lı yeniden adlandırma.
-- ROLLBACK: sarmalayıcıları DROP edip *_core'ları eski adlarına ALTER FUNCTION ... RENAME; olay kolonu / karar FK'si
--   geri dönüşü YALNIZ kalıcı silinmiş hesaba ait denetim satırı YOKKEN (aksi hâlde FK eklenemez — veri silinmez).
-- NOT: 000500 bu dosyadan SONRA yeniden çalıştırılamaz (eski kolon adını kullanır); production'da migration'lar
--   bir kez ve sırayla uygulanır.
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 600;
  v_known   constant integer := 1300;
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
      (1200, to_regprocedure('public.auth_email_provider_allowed(text)') IS NOT NULL),
      (1300, to_regprocedure('public.auth_owner_kit_locked_count(uuid)') IS NOT NULL)
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

-- ── 1) auth_device_decisions: cihaz FK'si kaldırılır (karar geçmişi cihazdan bağımsız) ─────────────────────
ALTER TABLE public.auth_device_decisions DROP CONSTRAINT IF EXISTS auth_device_decisions_device_id_fkey;
COMMENT ON COLUMN public.auth_device_decisions.device_id IS
  'Karar verilen cihaz (FK YOK: cihaz / hesap kalıcı silinse de değiştirilemez karar geçmişi korunur — F2-F).';

-- ── 2) auth_recovery_events: user_id → subject_user_id (purge keşfi dışında; satırlar korunur) ─────────────
ALTER TABLE public.auth_recovery_events ADD COLUMN IF NOT EXISTS subject_user_id uuid;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'auth_recovery_events' AND column_name = 'user_id') THEN
    -- Taşıma tek seferlik ve aynı işlemde: değiştirilemezlik tetikleyicisi YALNIZ bu kopya için geçici kapalı.
    ALTER TABLE public.auth_recovery_events DISABLE TRIGGER auth_recovery_events_append_only_trg;
    EXECUTE 'UPDATE public.auth_recovery_events SET subject_user_id = user_id WHERE subject_user_id IS NULL';
    ALTER TABLE public.auth_recovery_events ENABLE TRIGGER auth_recovery_events_append_only_trg;
  END IF;
END $$;
ALTER TABLE public.auth_recovery_events DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.auth_recovery_events ALTER COLUMN subject_user_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_recovery_events_subject ON public.auth_recovery_events (subject_user_id, created_at DESC);
COMMENT ON COLUMN public.auth_recovery_events.subject_user_id IS
  'Olayın öznesi olan hesap (FK YOK; hesap kalıcı silinse de denetim satırı korunur — F2-F).';

-- Olay tablosunu kullanan F2-E fonksiyonları: gövdeler 000500 ile AYNI, yalnız kolon adı subject_user_id.
CREATE OR REPLACE FUNCTION public.auth_recovery_log(p_user_id uuid, p_actor_id uuid, p_event text, p_detail jsonb)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.auth_recovery_events (subject_user_id, actor_id, event, detail)
  VALUES (p_user_id, p_actor_id, p_event, coalesce(p_detail, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.auth_recovery_log(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_codes_generate(p_actor_token text, p_code_hashes text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor   uuid := public.auth_session_actor(p_actor_token, true);
  v_user    public.users%ROWTYPE;
  v_n       integer;
  v_revoked integer;
  v_batch   uuid := gen_random_uuid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('recovery:' || v_actor::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = v_actor;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true
     OR lower(btrim(coalesce(v_user.role::text, ''))) NOT IN ('admin', 'expert') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_code_hashes IS NULL OR cardinality(p_code_hashes) <> 10
     OR (SELECT count(DISTINCT h) FROM unnest(p_code_hashes) h WHERE h ~ '^[0-9a-f]{64}$') <> 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  SELECT count(*) INTO v_n FROM public.auth_recovery_events
   WHERE subject_user_id = v_actor AND event = 'codes_generated' AND created_at > now() - interval '24 hours';
  IF v_n >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', 3600);
  END IF;

  UPDATE public.auth_recovery_codes
     SET state = 'revoked', revoked_at = now(), revoke_reason = 'regenerated'
   WHERE user_id = v_actor AND kind = 'user' AND state = 'active';
  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash)
  SELECT v_actor, 'user', v_batch, h FROM unnest(p_code_hashes) h;

  PERFORM public.auth_recovery_log(v_actor, v_actor, 'codes_generated', jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked));
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_actor, 'recovery_codes_generated', 'high',
          CASE WHEN v_revoked > 0 THEN 'Kurtarma kodları yenilendi (eski kodlar geçersiz)' ELSE 'Kurtarma kodları oluşturuldu' END,
          jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked));
  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch, 'count', 10, 'revoked', v_revoked);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_codes_generate(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_codes_generate(text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_status(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s     record;
  v_owner boolean;
  v_kind  text;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  v_owner := public.auth_is_owner_admin(v_s.user_id);
  -- Süresi geçmiş bekleyen dava → expired (yalnız bu kullanıcınınki).
  UPDATE public.auth_recovery_cases SET state = 'expired', closed_at = now()
   WHERE user_id = v_s.user_id AND state = 'waiting' AND expires_at <= now();
  IF v_s.mfa_method = 'recovery_code' THEN
    SELECT rc.kind INTO v_kind FROM public.auth_mfa_challenges c
      JOIN public.auth_recovery_codes rc ON rc.id = c.recovery_code_id
     WHERE c.id = v_s.challenge_id;
  END IF;
  RETURN jsonb_build_object('ok', true,
    'is_owner', v_owner,
    'session_method', v_s.mfa_method,
    'session_recovery_kind', v_kind,
    'owner_bootstrap_available', coalesce(v_owner AND v_kind = 'owner_offline' AND v_s.created_at > now() - interval '30 minutes'
        AND NOT EXISTS (SELECT 1 FROM public.auth_recovery_events e
                         WHERE e.subject_user_id = v_s.user_id AND e.event = 'owner_offline_bootstrap'
                           AND e.detail->>'session_id' = v_s.session_id::text), false),
    'codes_active', (SELECT count(*) FROM public.auth_recovery_codes WHERE user_id = v_s.user_id AND kind = 'user' AND state = 'active'),
    'codes_generated_at', (SELECT max(created_at) FROM public.auth_recovery_codes WHERE user_id = v_s.user_id AND kind = 'user' AND state = 'active'),
    'codes_last_used_at', (SELECT max(used_at) FROM public.auth_recovery_codes WHERE user_id = v_s.user_id AND kind IN ('user', 'case_ticket')),
    'owner_offline_active', CASE WHEN v_owner THEN (SELECT count(*) FROM public.auth_recovery_codes
                                                     WHERE user_id = v_s.user_id AND kind = 'owner_offline' AND state = 'active') END,
    'open_case', (SELECT jsonb_build_object('id', c.id, 'opened_at', c.opened_at, 'not_before', c.not_before)
                    FROM public.auth_recovery_cases c WHERE c.user_id = v_s.user_id AND c.state = 'waiting' LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_status(text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_owner_offline_bootstrap(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s    record;
  v_kind text;
  v_code text;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL OR v_s.mfa_method IS DISTINCT FROM 'recovery_code' OR NOT public.auth_is_owner_admin(v_s.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT rc.kind INTO v_kind FROM public.auth_mfa_challenges c
    JOIN public.auth_recovery_codes rc ON rc.id = c.recovery_code_id
   WHERE c.id = v_s.challenge_id AND rc.user_id = v_s.user_id;
  IF v_kind IS DISTINCT FROM 'owner_offline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF v_s.created_at <= now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_session');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-bootstrap:' || v_s.user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.auth_recovery_events e
              WHERE e.subject_user_id = v_s.user_id AND e.event = 'owner_offline_bootstrap' AND e.detail->>'session_id' = v_s.session_id::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_issued');
  END IF;
  UPDATE public.auth_owner_bootstrap_codes SET expires_at = least(expires_at, now())
   WHERE owner_id = v_s.user_id AND used_at IS NULL AND expires_at > now();
  v_code := substr(public.auth_recovery_random_code(), 1, 20);
  INSERT INTO public.auth_owner_bootstrap_codes (owner_id, code_hash, created_at, expires_at)
  VALUES (v_s.user_id, encode(sha256(convert_to('yasam-bootstrap:' || v_code, 'UTF8')), 'hex'), now(), now() + interval '15 minutes');
  PERFORM public.auth_recovery_log(v_s.user_id, v_s.user_id, 'owner_offline_bootstrap', jsonb_build_object('session_id', v_s.session_id));
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_s.user_id, 'owner_bootstrap_issued', 'critical', 'Owner ilk cihaz kodu üretildi (çevrimdışı kurtarma oturumu)',
          jsonb_build_object('session_id', v_s.session_id));
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', now() + interval '15 minutes');
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_offline_bootstrap(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owner_offline_bootstrap(text) TO service_role;

-- ── 3) Owner yüksek riskli işlemleri: taze ikinci doğrulama ───────────────────────────────────────────────
-- MFA'lı (mfa_method dolu), aktif, süresi geçmemiş VE son p_minutes dakikada açılmış oturumun sahibi.
CREATE OR REPLACE FUNCTION public.auth_session_fresh_mfa(p_token text, p_minutes integer)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.user_id FROM public.user_sessions s
    JOIN public.users u ON u.id = s.user_id AND u.active IS TRUE
   WHERE p_token IS NOT NULL AND btrim(p_token) <> '' AND s.session_token = p_token
     AND s.is_active = true AND s.session_state = 'active'
     AND (s.expires_at IS NULL OR s.expires_at > now())
     AND s.mfa_method IS NOT NULL
     AND s.created_at > now() - make_interval(mins => greatest(1, least(coalesce(p_minutes, 30), 120)))
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.auth_session_fresh_mfa(text, integer) FROM PUBLIC, anon, authenticated, service_role;

-- MFA'lı Owner oturumu ama bayat mı? (yetki / MFA yokluğu durumları çekirdeğin kendi koduyla döner)
CREATE OR REPLACE FUNCTION public.auth_owner_session_stale(p_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_token, true);
BEGIN
  RETURN v_actor IS NOT NULL AND public.auth_is_owner_admin(v_actor) AND public.auth_session_fresh_mfa(p_token, 30) IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_session_stale(text) FROM PUBLIC, anon, authenticated, service_role;

-- Mevcut gövdeler *_core adına taşınır (yalnız bir kez; tekrar çalıştırmada atlanır).
DO $$
BEGIN
  IF to_regprocedure('public.auth_device_owner_decide_core(text,uuid,text,boolean,text,text)') IS NULL THEN
    ALTER FUNCTION public.auth_device_owner_decide(text, uuid, text, boolean, text, text) RENAME TO auth_device_owner_decide_core;
  END IF;
  IF to_regprocedure('public.auth_mfa_set_required_core(text,uuid,boolean,text)') IS NULL THEN
    ALTER FUNCTION public.auth_mfa_set_required(text, uuid, boolean, text) RENAME TO auth_mfa_set_required_core;
  END IF;
  IF to_regprocedure('public.auth_recovery_case_open_core(text,uuid,text,text)') IS NULL THEN
    ALTER FUNCTION public.auth_recovery_case_open(text, uuid, text, text) RENAME TO auth_recovery_case_open_core;
  END IF;
  IF to_regprocedure('public.auth_recovery_case_execute_core(text,uuid,text,boolean)') IS NULL THEN
    ALTER FUNCTION public.auth_recovery_case_execute(text, uuid, text, boolean) RENAME TO auth_recovery_case_execute_core;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.auth_device_owner_decide_core(text, uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auth_mfa_set_required_core(text, uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auth_recovery_case_open_core(text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auth_recovery_case_execute_core(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- Cihaz ONAYI taze Owner oturumu ister (ret serbest: yalnız yetki azaltır).
CREATE OR REPLACE FUNCTION public.auth_device_owner_decide(
  p_actor_token text, p_device_id uuid, p_decision text, p_fingerprint_confirmed boolean, p_verification_method text, p_note text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_decision = 'approve' AND public.auth_owner_session_stale(p_actor_token) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  RETURN public.auth_device_owner_decide_core(p_actor_token, p_device_id, p_decision, p_fingerprint_confirmed, p_verification_method, p_note);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_owner_decide(text, uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_owner_decide(text, uuid, text, boolean, text, text) TO service_role;

-- BAŞKA kullanıcının MFA zorunluluğunu KAPATMAK taze MFA'lı Owner oturumu ister (açmak serbest; kendini
-- kapatma çekirdekte zaten yasak).
CREATE OR REPLACE FUNCTION public.auth_mfa_set_required(p_actor_token text, p_user_id uuid, p_required boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF p_required IS FALSE THEN
    v_actor := public.auth_session_actor(p_actor_token, false);
    IF v_actor IS NOT NULL AND v_actor IS DISTINCT FROM p_user_id AND public.auth_is_owner_admin(v_actor)
       AND public.auth_session_fresh_mfa(p_actor_token, 30) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
    END IF;
  END IF;
  RETURN public.auth_mfa_set_required_core(p_actor_token, p_user_id, p_required, p_reason);
END $$;
REVOKE ALL ON FUNCTION public.auth_mfa_set_required(text, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_set_required(text, uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_case_open(p_actor_token text, p_user_id uuid, p_verification_method text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.auth_owner_session_stale(p_actor_token) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  RETURN public.auth_recovery_case_open_core(p_actor_token, p_user_id, p_verification_method, p_note);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_case_open(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_case_open(text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_case_execute(p_actor_token text, p_case_id uuid, p_ticket_hash text, p_identity_reconfirmed boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.auth_owner_session_stale(p_actor_token) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  RETURN public.auth_recovery_case_execute_core(p_actor_token, p_case_id, p_ticket_hash, p_identity_reconfirmed);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_case_execute(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_case_execute(text, uuid, text, boolean) TO service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 600 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
