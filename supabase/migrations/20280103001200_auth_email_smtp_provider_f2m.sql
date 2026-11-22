-- GİRİŞ GÜVENLİĞİ F2-M — e-posta sağlayıcı listesine 'smtp' (Turhost kurumsal posta / SMTP gönderimi). F2-A…F2-K'ya bağımlı, EKLEYİCİ.
-- Owner talimatı 22.11.2026 (F2-M: Turhost SMTP sağlayıcısı; production / gerçek gönderim YOK).
--
--   M1 Sağlayıcı adı tek kaynaktan doğrulanır: public.auth_email_provider_allowed(text) → 'gmail' | 'synthetic' | 'smtp'.
--      auth_email_deliveries.provider CHECK'i ve sağlayıcı adını doğrulayan üç RPC (auth_email_otp_issue,
--      auth_email_change_begin, auth_email_notice_reserve) bu fonksiyonu kullanır. Bu üç gövdede DEĞİŞEN TEK ŞEY sağlayıcı
--      listesi ifadesidir: gövde pg_get_functiondef ile okunur, ifade TAM BİR KEZ bulunmazsa migration REDDEDİLİR (YF301;
--      beklenmeyen / elle değiştirilmiş gövde sessizce yeniden yazılmaz). Yetkiler (GRANT/REVOKE), SECURITY DEFINER ve
--      search_path CREATE OR REPLACE ile korunur.
--   M2 SMTP'ye özgü kalıcı hatalar Owner'a bildirilir (auth_email_delivery_result bildirim listesine eklenir):
--      smtp_auth_failed (kullanıcı adı / parola reddedildi) · smtp_tls_error (sertifika / şifreleme kurulamadı).
--      Bildirim yükünde adres, kod, parola YOK (yalnız neden kodu; auth_email_notify değişmedi).
--   Kota, süre, deneme sınırı, tek kullanım, denetim kaydı ve QR alternatifi DEĞİŞMEZ (bu dosya onlara dokunmaz).
--   Yeniden çalıştırma: aynı dosya idempotenttir (değiştirilmiş gövde tanınır, yeniden yazılmaz).

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 1200;
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

-- ── M1: sağlayıcı adı doğrulaması (tek kaynak) ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_email_provider_allowed(p_provider text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $f2m$ SELECT coalesce(p_provider IN ('gmail', 'synthetic', 'smtp'), false) $f2m$;
REVOKE ALL ON FUNCTION public.auth_email_provider_allowed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_provider_allowed(text) TO service_role;
COMMENT ON FUNCTION public.auth_email_provider_allowed(text) IS 'F2-M: izin verilen e-posta sağlayıcı adları (gmail, synthetic, smtp).';

-- Tablo kısıtı: F2-D'nin adsız CHECK'i (provider IN ('gmail','synthetic')) adlı ve fonksiyona bağlı kısıtla değişir.
DO $f2m$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'public.auth_email_deliveries'::regclass AND c.contype = 'c'
       AND c.conname <> 'auth_email_deliveries_provider_chk'
       AND pg_catalog.pg_get_constraintdef(c.oid) ~ '\mprovider\M'
  LOOP
    EXECUTE format('ALTER TABLE public.auth_email_deliveries DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $f2m$;
ALTER TABLE public.auth_email_deliveries DROP CONSTRAINT IF EXISTS auth_email_deliveries_provider_chk;
ALTER TABLE public.auth_email_deliveries
  ADD CONSTRAINT auth_email_deliveries_provider_chk CHECK (public.auth_email_provider_allowed(provider));

-- Gövdede tek ifade değişimi (yalnız beklenen gövdeye uygulanır; idempotent).
DO $f2m$
DECLARE
  v_old constant text := $q$p_provider NOT IN ('gmail', 'synthetic')$q$;
  v_new constant text := $q$NOT public.auth_email_provider_allowed(p_provider)$q$;
  v_nold   integer;
  v_nnew   integer;
  v_def    text;
  v_done   integer := 0;
  r        record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('auth_email_otp_issue', 'auth_email_change_begin', 'auth_email_notice_reserve')
  LOOP
    v_def := pg_catalog.pg_get_functiondef(r.oid);
    v_nold := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    v_nnew := (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new);
    IF v_nold = 1 AND v_nnew = 0 THEN
      EXECUTE replace(v_def, v_old, v_new);
    ELSIF NOT (v_nold = 0 AND v_nnew = 1) THEN
      RAISE EXCEPTION USING ERRCODE = 'YF301',
        MESSAGE = format('F2-M: %s gövdesi beklenmeyen biçimde (eski ifade %s, yeni ifade %s kez) — elle inceleyin', r.proname, v_nold, v_nnew);
    END IF;
    v_done := v_done + 1;
  END LOOP;
  IF v_done <> 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'YF301', MESSAGE = format('F2-M: sağlayıcı doğrulayan 3 fonksiyon bekleniyordu, %s bulundu', v_done);
  END IF;
END $f2m$;

-- ── M2: SMTP kalıcı hataları Owner bildirimine ────────────────────────────────────────────────────────────────────────
DO $f2m$
DECLARE
  v_old constant text := $q$v_err IN ('oauth_invalid_grant', 'oauth_error', 'quota', 'provider_down', 'not_configured')$q$;
  v_new constant text := $q$v_err IN ('oauth_invalid_grant', 'oauth_error', 'quota', 'provider_down', 'not_configured', 'smtp_auth_failed', 'smtp_tls_error')$q$;
  v_def  text;
  v_nold integer;
  v_nnew integer;
BEGIN
  v_def := pg_catalog.pg_get_functiondef('public.auth_email_delivery_result(bigint, boolean, text, text)'::regprocedure);
  v_nold := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  v_nnew := (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new);
  IF v_nold = 1 AND v_nnew = 0 THEN
    EXECUTE replace(v_def, v_old, v_new);
  ELSIF NOT (v_nold = 0 AND v_nnew = 1) THEN
    RAISE EXCEPTION USING ERRCODE = 'YF301',
      MESSAGE = format('F2-M: auth_email_delivery_result gövdesi beklenmeyen biçimde (eski %s, yeni %s)', v_nold, v_nnew);
  END IF;
END $f2m$;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 1200 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
