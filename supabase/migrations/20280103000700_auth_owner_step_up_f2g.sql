-- =============================================================================
-- 20280103000700_auth_owner_step_up_f2g.sql
--
-- GİRİŞ GÜVENLİĞİ F2-G — (A) Owner kritik işlemlerinde İŞLEME ÖZEL yeniden doğrulama (step-up),
-- (B) denetim kayıtları için yapılandırılabilir SAKLAMA POLİTİKASI kaydı (silme / imha YOK).
-- BAĞIMLILIK: 000000 → 000100 → 000300 → 000400 → 000500 → 000600. EKLEYİCİ; mevcut satır değişmez.
--
-- (A) Tehdit: yalnız çalınmış ve TAZE (≤30 dk) Owner oturumu olan saldırgan (Owner parolası / telefonu / e-postası
--     YOK). 000600'ın taze-oturum kuralı bu saldırganı durdurmaz. Artık şu işlemler ayrıca bir KANIT ister:
--       device_approve   — güvenilir cihaz onayı (hedef: cihaz)
--       mfa_disable      — başka kullanıcının MFA zorunluluğunu kaldırma (hedef: kullanıcı)
--       recovery_execute — hesap kurtarma yürütme (hedef: talep)
--     Kanıt = auth_mfa_challenges satırı (purpose 'step_up'):
--       * Owner hesabına + İSTEYEN OTURUMA (step_session_id) + işlem türüne + hedef kayda bağlı;
--       * 5 dakika ömürlü; tek kullanımlık (işlemle AYNI DB işleminde satır kilidiyle tüketilir → yarış yok);
--       * YALNIZ Owner'ın aktif güvenilir cihazıyla (QR + eşleştirme kodu; F2-C auth_qr_decide) veya doğrulanmış
--         e-posta adresine giden kodla (F2-D auth_email_otp_verify) doğrulanır. Kurtarma kodu bu amaçla GEÇMEZ
--         (auth_recovery_code_verify yalnız 'login'); step-up challenge'ı OTURUM AÇAMAZ (auth_finalize_login 'login').
--     Başarısız işlem (ör. teyit kutusu işaretlenmemiş) kanıtı TÜKETMEZ; başarılı işlem tüketir.
--     Owner ilk cihazı (SQL bootstrap) ve çevrimdışı kurtarma (F2-E kit) bu kurala BAĞLI DEĞİLDİR (kilitlenme yok).
--     İnsan kontrolü (kullanıcıyı kayıtlı numarasından arayıp kodu ona okutmak) AYRICA zorunlu kalır.
--
-- (B) auth_audit_retention_policy: denetim tablosu başına saklama süresi / hukuki gerekçe / imha yöntemi / onay.
--     Varsayılan satırlar KARARSIZ (retention_days NULL, disposal 'karar_bekliyor'). auth_audit_retention_report
--     yalnız SAYAR (kuru çalıştırma). Bu migration hiçbir kaydı silmez / anonimleştirmez ve değiştirilemezlik
--     tetikleyicilerine dokunmaz. Korunan satırlar subject_user_id / device_id taşıdığından TAKMA ADLI kişisel
--     veridir (anonim DEĞİLDİR) — sınıf alanı bunu açıkça kaydeder.
--
-- GÜVENLİK: SECURITY DEFINER + search_path=''; tablolar RLS açık, policy yok, yalnız postgres.
-- İDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS / ON CONFLICT DO NOTHING.
-- ROLLBACK: sarmalayıcıları 000600 gövdelerine geri yükle; step_up kolonları / politika tablosu zararsızdır.
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 700;
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

-- ── A1) Challenge'a step-up alanları ─────────────────────────────────────────
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS step_action text;
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS step_target uuid;
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS step_session_id uuid;
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_purpose_check;
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_purpose_list_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_purpose_list_chk
  CHECK (purpose IN ('login', 'step_up'));
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_step_up_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_step_up_chk
  CHECK ((purpose = 'step_up') = (step_action IS NOT NULL AND step_target IS NOT NULL AND step_session_id IS NOT NULL)
     AND (step_action IS NULL OR step_action IN ('device_approve', 'mfa_disable', 'recovery_execute')));
CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenges_step_up
  ON public.auth_mfa_challenges (step_session_id, step_action, step_target) WHERE purpose = 'step_up';

-- ── A2) Step-up başlatma (taze MFA'lı Owner oturumu) ─────────────────────────
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
  IF p_action IS NULL OR p_action NOT IN ('device_approve', 'mfa_disable', 'recovery_execute') OR p_target IS NULL THEN
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

-- Durum: YALNIZ isteyen oturuma (başka oturum / kullanıcı → invalid).
CREATE OR REPLACE FUNCTION public.auth_owner_step_up_status(p_actor_token text, p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s record;
  v public.auth_mfa_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  SELECT * INTO v FROM public.auth_mfa_challenges WHERE id = p_challenge_id AND purpose = 'step_up';
  IF v_s.user_id IS NULL OR v.id IS NULL OR v.step_session_id IS DISTINCT FROM v_s.session_id THEN
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  IF v.state IN ('pending', 'verified') AND v.expires_at <= now() THEN
    UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE id = v.id AND state IN ('pending', 'verified');
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  RETURN jsonb_build_object('state', v.state, 'expires_at', v.expires_at, 'action', v.step_action, 'target', v.step_target,
                            'user_id', v.user_id);
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_step_up_status(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owner_step_up_status(text, uuid) TO service_role;

-- Kanıtı KİLİTLE (iç): bu oturum + işlem + hedef için doğrulanmış, süresi geçmemiş, tüketilmemiş step-up.
CREATE OR REPLACE FUNCTION public.auth_step_up_lock(p_actor_token text, p_action text, p_target uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s  record;
  v_id uuid;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.session_id IS NULL THEN
    RETURN NULL;
  END IF;
  -- Satır kilidi: aynı kanıtla paralel ikinci işlem bekler, ilki tüketince 'verified' koşulu düşer → NULL.
  SELECT c.id INTO v_id FROM public.auth_mfa_challenges c
   WHERE c.purpose = 'step_up' AND c.step_session_id = v_s.session_id AND c.user_id = v_s.user_id
     AND c.step_action = p_action AND c.step_target = p_target
     AND c.state = 'verified' AND c.expires_at > now()
   ORDER BY c.verified_at DESC
   LIMIT 1
   FOR UPDATE;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.auth_step_up_lock(text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_step_up_consume(p_challenge_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.auth_mfa_challenges%ROWTYPE;
BEGIN
  UPDATE public.auth_mfa_challenges
     SET state = 'consumed', consumed_at = now(), session_id = step_session_id
   WHERE id = p_challenge_id AND purpose = 'step_up' AND state = 'verified'
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'auth_step_up_consume: kanıt tüketilemedi' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.auth_recovery_log(v.user_id, v.user_id, 'step_up_used',
                                   jsonb_build_object('challenge_id', v.id, 'action', v.step_action, 'target', v.step_target, 'method', v.method));
END $$;
REVOKE ALL ON FUNCTION public.auth_step_up_consume(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Denetim olay listesi: + step_up_requested / step_up_used.
ALTER TABLE public.auth_recovery_events DROP CONSTRAINT IF EXISTS auth_recovery_events_event_check;
ALTER TABLE public.auth_recovery_events DROP CONSTRAINT IF EXISTS auth_recovery_events_event_list_chk;
ALTER TABLE public.auth_recovery_events ADD CONSTRAINT auth_recovery_events_event_list_chk CHECK (event IN (
  'codes_generated', 'code_used', 'code_wrong', 'code_locked', 'owner_offline_used',
  'owner_offline_kit_issued', 'owner_offline_bootstrap', 'case_opened', 'case_cancelled',
  'case_rejected', 'case_executed', 'case_expired', 'email_change_requested', 'email_changed',
  'device_replace_requested', 'device_replaced', 'device_replace_cancelled', 'step_up_requested', 'step_up_used'));

-- ── A3) Kritik işlemler: taze oturum (000600) + işleme özel kanıt (000700) ───
--   Yetki / MFA yokluğu / Owner olmayan aktör → çekirdeğin kendi kodu (önceki davranış). Kanıt yalnız
--   MFA'lı TAZE Owner oturumunda istenir; çekirdek başarılı dönerse aynı işlemde tüketilir.
CREATE OR REPLACE FUNCTION public.auth_device_owner_decide(
  p_actor_token text, p_device_id uuid, p_decision text, p_fingerprint_confirmed boolean, p_verification_method text, p_note text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_proof uuid;
  r jsonb;
BEGIN
  IF p_decision = 'approve' THEN
    IF public.auth_owner_session_stale(p_actor_token) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
    END IF;
    v_actor := public.auth_session_actor(p_actor_token, true);
    IF v_actor IS NOT NULL AND public.auth_is_owner_admin(v_actor) THEN
      v_proof := public.auth_step_up_lock(p_actor_token, 'device_approve', p_device_id);
      IF v_proof IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'device_approve', 'target', p_device_id);
      END IF;
      r := public.auth_device_owner_decide_core(p_actor_token, p_device_id, p_decision, p_fingerprint_confirmed, p_verification_method, p_note);
      IF coalesce((r->>'ok')::boolean, false) THEN
        PERFORM public.auth_step_up_consume(v_proof);
      END IF;
      RETURN r;
    END IF;
  END IF;
  RETURN public.auth_device_owner_decide_core(p_actor_token, p_device_id, p_decision, p_fingerprint_confirmed, p_verification_method, p_note);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_owner_decide(text, uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_owner_decide(text, uuid, text, boolean, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_mfa_set_required(p_actor_token text, p_user_id uuid, p_required boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_proof uuid;
  r jsonb;
BEGIN
  IF p_required IS FALSE THEN
    v_actor := public.auth_session_actor(p_actor_token, false);
    IF v_actor IS NOT NULL AND v_actor IS DISTINCT FROM p_user_id AND public.auth_is_owner_admin(v_actor) THEN
      IF public.auth_session_fresh_mfa(p_actor_token, 30) IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
      END IF;
      v_proof := public.auth_step_up_lock(p_actor_token, 'mfa_disable', p_user_id);
      IF v_proof IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'mfa_disable', 'target', p_user_id);
      END IF;
      r := public.auth_mfa_set_required_core(p_actor_token, p_user_id, p_required, p_reason);
      IF coalesce((r->>'ok')::boolean, false) AND coalesce((r->>'changed')::boolean, false) THEN
        PERFORM public.auth_step_up_consume(v_proof);
      END IF;
      RETURN r;
    END IF;
  END IF;
  RETURN public.auth_mfa_set_required_core(p_actor_token, p_user_id, p_required, p_reason);
END $$;
REVOKE ALL ON FUNCTION public.auth_mfa_set_required(text, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_set_required(text, uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_case_execute(p_actor_token text, p_case_id uuid, p_ticket_hash text, p_identity_reconfirmed boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_proof uuid;
  r jsonb;
BEGIN
  IF public.auth_owner_session_stale(p_actor_token) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  v_actor := public.auth_session_actor(p_actor_token, true);
  IF v_actor IS NOT NULL AND public.auth_is_owner_admin(v_actor) THEN
    v_proof := public.auth_step_up_lock(p_actor_token, 'recovery_execute', p_case_id);
    IF v_proof IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'recovery_execute', 'target', p_case_id);
    END IF;
    r := public.auth_recovery_case_execute_core(p_actor_token, p_case_id, p_ticket_hash, p_identity_reconfirmed);
    IF coalesce((r->>'ok')::boolean, false) THEN
      PERFORM public.auth_step_up_consume(v_proof);
    END IF;
    RETURN r;
  END IF;
  RETURN public.auth_recovery_case_execute_core(p_actor_token, p_case_id, p_ticket_hash, p_identity_reconfirmed);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_case_execute(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_case_execute(text, uuid, text, boolean) TO service_role;

-- ── B) Denetim kayıtları saklama politikası (YALNIZ kayıt + kuru sayım; silme / imha YOK) ─────────────
CREATE TABLE IF NOT EXISTS public.auth_audit_retention_policy (
  table_name      text PRIMARY KEY CHECK (table_name IN ('auth_device_decisions', 'auth_recovery_events', 'security_events')),
  data_class      text NOT NULL CHECK (data_class IN ('takma_adli_kisisel_veri', 'kisisel_veri', 'anonim')),
  retention_days  integer CHECK (retention_days IS NULL OR retention_days BETWEEN 30 AND 36500),
  legal_basis     text CHECK (legal_basis IS NULL OR length(btrim(legal_basis)) BETWEEN 10 AND 1000),
  disposal_method text NOT NULL DEFAULT 'karar_bekliyor' CHECK (disposal_method IN ('karar_bekliyor', 'silme', 'anonimlestirme')),
  decided_by      uuid,
  decided_at      timestamptz,
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  -- Süre / yöntem ancak hukuki gerekçe + karar veren + tarih ile birlikte girilebilir.
  CONSTRAINT auth_audit_retention_decided_chk CHECK (
    (retention_days IS NULL AND disposal_method = 'karar_bekliyor')
    OR (retention_days IS NOT NULL AND disposal_method <> 'karar_bekliyor' AND legal_basis IS NOT NULL
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
ALTER TABLE public.auth_audit_retention_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_audit_retention_policy FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.auth_audit_retention_policy (table_name, data_class, note) VALUES
  ('auth_device_decisions', 'takma_adli_kisisel_veri', 'Cihaz kimliği + karar veren kimliği taşır; hesap silinse de korunur (F2-F). Süre hukuk kararı bekliyor.'),
  ('auth_recovery_events',  'takma_adli_kisisel_veri', 'subject_user_id taşır; hesap silinse de korunur (F2-F). Süre hukuk kararı bekliyor.'),
  ('security_events',       'kisisel_veri',            'IP / şehir / cihaz bilgisi içerebilir; kalıcı silmede hesapla birlikte silinir (mevcut tasarım).')
ON CONFLICT (table_name) DO NOTHING;

-- Kuru sayım: politika süresi girilmişse süresi dolmuş satır SAYISI; aksi hâlde yalnız toplam. HİÇBİR satırı değiştirmez.
CREATE OR REPLACE FUNCTION public.auth_audit_retention_report()
RETURNS TABLE (table_name text, data_class text, retention_days integer, disposal_method text, total_rows bigint, past_retention bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p record;
  v_total bigint;
  v_past bigint;
BEGIN
  FOR p IN SELECT * FROM public.auth_audit_retention_policy ORDER BY 1 LOOP
    IF to_regclass('public.' || p.table_name) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', p.table_name) INTO v_total;
    IF p.retention_days IS NULL THEN
      v_past := NULL;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE created_at < now() - make_interval(days => $1)', p.table_name)
        INTO v_past USING p.retention_days;
    END IF;
    table_name := p.table_name; data_class := p.data_class; retention_days := p.retention_days;
    disposal_method := p.disposal_method; total_rows := v_total; past_retention := v_past;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.auth_audit_retention_report() FROM PUBLIC, anon, authenticated, service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 700 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
