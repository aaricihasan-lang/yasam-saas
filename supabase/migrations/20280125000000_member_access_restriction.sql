-- =============================================================================
-- ÜYE PASİFLEŞTİRME · F2 — BAĞIMSIZ ERİŞİM KISITI ("Pasif" = giriş açık, modüller kilitli)
-- =============================================================================
-- OWNER KARARI (2026-11-24):
--   Aktif  : mevcut üyelik + modül yetkileriyle kullanım.
--   Pasif  : giriş YAPABİLİR, ana sayfa + modüller + sol menü GÖRÜNÜR, hiçbir modül kullanılamaz
--            (okuma / hesaplama / rapor / yazma yok). Yönetici arayüzündeki adı "Pasif".
--   Arşiv  : "Pasife Al ve Arşivle" — giriş tamamen kapalı, tüm oturumlar sonlanır (4a mekanizması AYNEN).
--
-- NEDEN users.active KULLANILMAZ: active=false bugün girişi (auth/session 403 INACTIVE), her kullanıcı rotasını
--   (verifyUserRequest .eq("active", true)) ve F2-A D-06 ile oturum geçerliliğini (touch_active_session) kapatır.
--   Bu güvenlik çekirdeği GEVŞETİLMEZ. Pasif durum ayrı bir alandır: active=true KALIR → giriş, MFA, QR, OTP,
--   HttpOnly ve oturum zinciri hiç değişmez; kısıt uygulama katmanında (F3: üyelik kapısı) "erişim yok" üretir.
--
-- BU MIGRATION:
--   0) Ön koşul: audit CHECK sürüklenmesi yok (4a deseni) + 4a arşiv alanı mevcut.
--   1) users.access_restricted_at (NULL = kısıt yok). Yalnız uzman satırında dolu olabilir (CHECK).
--   2) admin_audit_action_chk SÜPERSET: + user_access_restricted, user_access_unrestricted.
--   3) member_account_state(active, archived_at, access_restricted_at) — saf durum sınıflandırması (liste/rapor/
--      F3 kod eşdeğerliği için tek kaynak): arsiv · giris_kapali · pasif · aktif.
--   4) admin_set_member_access_restriction — atomik (hedef satır FOR UPDATE) + bayat istemci + ZORUNLU audit.
--      Oturumlar İPTAL EDİLMEZ (pasif uzman oturumunu korur; kısıt her istekte canlı okunur).
--      Paket, deneme, modül, ödeme, onay alanlarına DOKUNULMAZ → kısıt kalkınca önceki meşru yetkiler aynen döner,
--      ek yetki verilmez. Deneme süresi politikası değişmez (pencere işlemeye devam eder).
--   5) Arşivdeki hesapta kısıt alanı değişmez (UY005) — 4a admin_archived_user_guard_trg'ye DOKUNULMADAN ayrı tetik.
--
-- DOKUNULMAYAN: admin_set_user_active, admin_archive_user, admin_unarchive_user, admin_archived_user_guard_trg,
--   oturum / giriş fonksiyonları, deneme fonksiyonları, liste RPC'leri. MEVCUT SATIRLARA DML YOK (backfill YOK):
--   bugün active=false olan (arşivlenmemiş) hesaplar "giris_kapali" kalır; girişleri kendiliğinden AÇILMAZ.
--   Yeni davranışa geçişleri Owner kararıdır: scripts/uye-pasif-f2/legacy-*.sql (migration DEĞİL, ayrı onay).
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path; EXECUTE yalnız service_role. Aktör DB'de aktif admin doğrulanır.
-- HATA KODLARI: UY001 bayat istemci · UY002 iş kuralı (uzman değil / onaysız / giriş kapalı hesap kısıtlanamaz) ·
--               UY003 geçersiz girdi / kendi hesabı / bulunamadı · UY005 arşivde · 42501 yetki.
-- DEPLOY SIRASI: ÖNCE bu migration, SONRA F3 kodu. Kod kolonu bulamazsa (42703) kısıt yok sayılır (bugünkü davranış).
-- UYGULAMA: AYRI OWNER ONAYI. Bu aşamada production'a UYGULANMAZ.
-- GERİ ALMA: en altta (yorum).
-- =============================================================================

BEGIN;

-- ── 0) Ön koşullar ───────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_def      text;
  v_live     text[];
  v_new      text[] := ARRAY['user_access_restricted', 'user_access_unrestricted'];
  v_expected text[] := ARRAY[
    'user_created','user_activated','user_deactivated','user_approved','user_rejected',
    'password_changed_by_admin','all_sessions_terminated','single_session_terminated',
    'desktop_limit_changed','mobile_limit_changed','tablet_limit_changed','total_session_limit_changed',
    'module_enabled','module_disabled','payment_status_changed','role_changed','workspace_viewed',
    'user_deleted','user_archived','main_admin_critical_action',
    'library_transfer_completed','library_transfer_failed','library_transfer_retried',
    'user_profile_updated','license_settings_changed','security_exempt_changed',
    'admin_web_login_pending','admin_web_login_approved','admin_web_login_denied',
    'admin_mobile_login_rejected','own_session_terminated','pricing_phase_changed',
    'user_unarchived'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'archived_at')
     OR to_regprocedure('public.admin_revoke_user_sessions_tx(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'uye-pasif on kosul: 4a arsiv alani (users.archived_at) yok; uygulanmadi';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conname = 'admin_audit_action_chk' AND c.conrelid = 'public.admin_audit_log'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'uye-pasif on kosul: admin_audit_action_chk bulunamadi';
  END IF;
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_live
    FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  -- Yeniden çalıştırmada (idempotent) yeni iki eylem zaten vardır → beklenen kümeye dahil sayılır.
  IF NOT (v_live <@ (v_expected || v_new) AND v_expected <@ v_live) THEN
    RAISE EXCEPTION 'uye-pasif on kosul: admin_audit_action_chk beklenenden farkli (%); uygulanmadi', v_def;
  END IF;
END
$pre$;

-- ── 1) Erişim kısıtı alanı + değişmez ────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz NULL;
COMMENT ON COLUMN public.users.access_restricted_at IS
  'Üye pasifleştirme F2: NULL = kısıt yok. Dolu = "Pasif" (giriş açık, tüm modüller kilitli; active=true kalır). '
  'Yalnız admin_set_member_access_restriction yazar. Yalnız uzman satırında dolu olabilir '
  '(users_access_restricted_expert_chk). Erişim kararı uygulama üyelik kapısındadır (F3).';

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'users_access_restricted_expert_chk' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_access_restricted_expert_chk
      CHECK (access_restricted_at IS NULL OR lower(btrim(coalesce(role, ''))) = 'expert');
  END IF;
END
$chk$;

-- ── 2) Audit CHECK — SÜPERSET (mevcut 33 + 2) ────────────────────────────────
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_action_chk;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_action_chk CHECK (action IN (
  'user_created',
  'user_activated',
  'user_deactivated',
  'user_approved',
  'user_rejected',
  'password_changed_by_admin',
  'all_sessions_terminated',
  'single_session_terminated',
  'desktop_limit_changed',
  'mobile_limit_changed',
  'tablet_limit_changed',
  'total_session_limit_changed',
  'module_enabled',
  'module_disabled',
  'payment_status_changed',
  'role_changed',
  'workspace_viewed',
  'user_deleted',
  'user_archived',
  'main_admin_critical_action',
  'library_transfer_completed',
  'library_transfer_failed',
  'library_transfer_retried',
  'user_profile_updated',
  'license_settings_changed',
  'security_exempt_changed',
  'admin_web_login_pending',
  'admin_web_login_approved',
  'admin_web_login_denied',
  'admin_mobile_login_rejected',
  'own_session_terminated',
  'pricing_phase_changed',
  'user_unarchived',
  'user_access_restricted',
  'user_access_unrestricted'
));

-- ── 3) Hesap durumu sınıflandırması (saf) ────────────────────────────────────
--   arsiv        : archived_at dolu (giriş kapalı; 4a)
--   giris_kapali : active≠true, arşivde değil (bugünkü "Pasif Yap" sonucu / eski kayıtlar; giriş kapalı)
--   pasif        : active=true + access_restricted_at dolu (YENİ: giriş açık, modüller kilitli)
--   aktif        : active=true, kısıt yok
CREATE OR REPLACE FUNCTION public.member_account_state(
  p_active boolean, p_archived_at timestamptz, p_access_restricted_at timestamptz)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_archived_at IS NOT NULL THEN 'arsiv'
    WHEN p_active IS NOT TRUE THEN 'giris_kapali'
    WHEN p_access_restricted_at IS NOT NULL THEN 'pasif'
    ELSE 'aktif'
  END;
$$;
REVOKE ALL ON FUNCTION public.member_account_state(boolean, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_account_state(boolean, timestamptz, timestamptz) TO service_role;

-- ── 4) PASİF YAP / AKTİF YAP (erişim kısıtı; atomik + audit) ─────────────────
CREATE OR REPLACE FUNCTION public.admin_set_member_access_restriction(
  p_user_id             uuid,
  p_actor_admin_id      uuid,
  p_restricted          boolean,
  p_expected_restricted boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor      public.users%ROWTYPE;
  v_target     public.users%ROWTYPE;
  v_actor_main boolean;
  v_was        boolean;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL OR p_restricted IS NULL OR p_expected_restricted IS NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: parametre null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(btrim(coalesce(v_actor.role, ''))) <> 'admin' OR v_actor.active IS NOT TRUE
     OR v_actor.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: yetkisiz aktor' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = p_actor_admin_id THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: kendi hesabi' USING ERRCODE = 'UY003';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;

  v_was := v_target.access_restricted_at IS NOT NULL;
  -- Bayat ekran: yöneticinin gördüğü durum ≠ gerçek → 409 (hiçbir satır değişmez).
  IF v_was IS DISTINCT FROM p_expected_restricted THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: guncel durum degismis (beklenen=%, gercek=%)',
      p_expected_restricted, v_was USING ERRCODE = 'UY001';
  END IF;
  -- Arşivdeki hesap: önce ana yönetici arşivden çıkarır (4a ile aynı anlam).
  IF v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: hesap arsivde' USING ERRCODE = 'UY005';
  END IF;
  -- Yalnız uzman: yönetici / owner bu durumla kilitlenemez (kilitlenme korumaları admin_set_user_active'te kalır).
  IF lower(btrim(coalesce(v_target.role, ''))) <> 'expert' THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: yalniz uzman' USING ERRCODE = 'UY002';
  END IF;

  -- Değişiklik yok (aynı duruma tekrar istek) → idempotent; audit YAZILMAZ.
  IF v_was = p_restricted THEN
    RETURN jsonb_build_object('ok', true, 'restricted', v_was, 'changed', false);
  END IF;

  IF p_restricted THEN
    -- Pasif yalnız girişi AÇIK, onaylı uzmana uygulanır. Giriş kapalı (active≠true) hesap bu yolla
    -- açılmaz/değişmez — eski kayıtların geçişi ayrı Owner kararıdır.
    IF v_target.active IS NOT TRUE THEN
      RAISE EXCEPTION 'admin_set_member_access_restriction: giris kapali hesap kisitlanamaz' USING ERRCODE = 'UY002';
    END IF;
    IF lower(btrim(coalesce(v_target.approval_status, ''))) NOT IN ('approved', '') THEN
      RAISE EXCEPTION 'admin_set_member_access_restriction: onaysiz uzman' USING ERRCODE = 'UY002';
    END IF;
    UPDATE public.users SET access_restricted_at = now() WHERE id = p_user_id;
  ELSE
    -- Kısıtı kaldırmak hiçbir zaman ek yetki vermez: yalnız bu alan temizlenir. active, paket, deneme,
    -- modül, ödeme ve onay alanları AYNEN kalır (active≠true ise giriş kapalı kalmaya devam eder).
    UPDATE public.users SET access_restricted_at = NULL WHERE id = p_user_id;
  END IF;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id,
     CASE WHEN p_restricted THEN 'user_access_restricted' ELSE 'user_access_unrestricted' END,
     jsonb_build_object('access_restricted', v_was, 'active', v_target.active),
     jsonb_build_object('access_restricted', p_restricted, 'active', v_target.active),
     jsonb_build_object('restricted_since', v_target.access_restricted_at, 'sessions_revoked', 0));

  RETURN jsonb_build_object('ok', true, 'restricted', p_restricted, 'changed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_member_access_restriction(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_access_restriction(uuid, uuid, boolean, boolean) TO service_role;

-- ── 5) Arşivdeki hesapta kısıt alanı değişmez (UY005) ────────────────────────
-- 4a admin_archived_user_guard_trg kolon listesine DOKUNULMAZ; aynı kural bu alan için ayrı tetikle.
-- Arşive giriş / arşivden çıkış geçişleri (yalnız 4a RPC'leri) etkilenmez. Kalıcı silme (DELETE) etkilenmez.
CREATE OR REPLACE FUNCTION public.member_access_restriction_archived_guard_trg()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL
     AND NEW.access_restricted_at IS DISTINCT FROM OLD.access_restricted_at THEN
    RAISE EXCEPTION 'hesap arsivde: access_restricted_at degistirilemez (once arsivden cikarin)' USING ERRCODE = 'UY005';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.member_access_restriction_archived_guard_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS member_access_restriction_archived_guard ON public.users;
CREATE TRIGGER member_access_restriction_archived_guard
  BEFORE UPDATE OF access_restricted_at ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.member_access_restriction_archived_guard_trg();

COMMIT;

-- =============================================================================
-- GERİ ALMA (yalnız Owner onayıyla; F3 kodu yayından kaldırıldıktan SONRA):
--   BEGIN;
--   DROP TRIGGER IF EXISTS member_access_restriction_archived_guard ON public.users;
--   DROP FUNCTION IF EXISTS public.member_access_restriction_archived_guard_trg();
--   DROP FUNCTION IF EXISTS public.admin_set_member_access_restriction(uuid, uuid, boolean, boolean);
--   DROP FUNCTION IF EXISTS public.member_account_state(boolean, timestamptz, timestamptz);
--   -- Audit satırları KORUNUR: CHECK, mevcut user_access_* satırları varken daraltılmaz.
--   ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_access_restricted_expert_chk;
--   -- DİKKAT: kolonu düşürmek pasif uzmanların kilidini AÇAR. Önce pasif hesaplar için Owner kararı alınmalı.
--   -- ALTER TABLE public.users DROP COLUMN IF EXISTS access_restricted_at;
--   COMMIT;
-- =============================================================================
