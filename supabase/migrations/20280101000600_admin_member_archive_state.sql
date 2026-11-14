-- =============================================================================
-- ADMIN ÜYE YÖNETİMİ V2 · AŞAMA 4a — HESAP PASİFLİĞİ İLE ARŞİVİN AYRILMASI
-- =============================================================================
-- SORUN (main 8f3028e6 itibarıyla): "Hesabı Pasif Yap" (admin_set_user_active) ve "Pasife Al ve Arşivle"
-- (admin_archive_user) veritabanında AYNI sonucu üretir: yalnız users.active=false. Arşiv bilgisi tutulmaz;
-- arşiv listesi "onaylı uzman ∧ active=false" diye TÜRETİLİR → pasif yapılan uzman da arşivde görünür,
-- Üye Listesi V2'nin "Tüm üyeler" görünümünden kaybolur. Arşivlenen uzman "Aktif Yap" ile doğrudan açılır.
--
-- MODEL (iki bağımsız alan, tek değişmez):
--   users.active       → hesap ERİŞİMİ (giriş/oturum kapıları bugün olduğu gibi YALNIZ buna bakar; değişmez).
--   users.archived_at  → YÖNETİM durumu: NULL = arşivde değil; dolu = arşivlenme anı.
--   Değişmez (CHECK): archived_at IS NOT NULL ⇒ active IS NOT TRUE. Arşivdeki hesap hiçbir yoldan aktif olamaz.
--     Aktif   = active ∧ archived_at NULL
--     Pasif   = ¬active ∧ archived_at NULL   (askı; normal üye yönetiminde görünür, arşiv SAYILMAZ)
--     Arşivde = ¬active ∧ archived_at dolu   (normal listede yok; arşiv görünümünde)
--   Üyelik paketi (Pro / deneme / eski kayıt), onay durumu, ödeme ve modül alanlarına DOKUNULMAZ.
--
-- İÇERİK:
--   0) Ön koşul: admin_audit_action_chk canlıda depodaki 32 eylemle BİREBİR mi? Değilse FAIL-CLOSED (hiçbir şey uygulanmaz).
--   1) users.archived_at (NULL) + users_archived_inactive_chk.
--   2) admin_audit_action_chk süperseti + 'user_unarchived'.
--   3) admin_archive_user (REPLACE): YALNIZ onaylı uzman (aksi UY002); active=false + archived_at=now() + oturum iptali +
--      user_archived audit (aynı tx).
--      Zaten arşivde → DEĞİŞİKLİK YOK, yeni audit YOK (tekrarlanan / eşzamanlı istek tutarlı).
--   4) admin_set_user_active (REPLACE): arşivdeki hesabı aktifleştirme REDDİ (UY004). Diğer davranış aynen.
--   5) admin_unarchive_user (YENİ): YALNIZ ana yönetici (DB'de is_super_admin). archived_at=NULL; hesap PASİF kalır
--      (erişim açılmaz; ayrıca "Aktif Yap" gerekir). user_unarchived audit (aynı tx).
--   5b) Kalıcı silme YALNIZ ARŞİVDE: admin_purge_context BEFORE INSERT tetikleyicisi (purge fonksiyonu yeniden yazılmaz);
--       archived_at NULL / active=true → UP006, hiçbir satır silinmeden tam geri alma.
--   5c) Arşivdeki hesapta değişiklik koruması (UY005): users BEFORE UPDATE (üyelik/deneme/modül/ödeme/lisans/rol/onay
--       kolonları) + trial_profiles, member_pricing_phases, user_payment_history yazmaları. Okuma serbest.
--   6) admin_list_members_v2 (REPLACE): yeni aşama 'pasif' (arşivlenmemiş pasif onaylı uzman) + filtre 'pasif';
--      'pasif' "Tüm üyeler"de görünür; 'arsiv' yalnız archived_at dolu. Ticari sayaçlar DEĞİŞMEZ
--      (pasif/arşiv hiçbir sayaca girmez — bugünkü gibi). admin_member_stage_of DEĞİŞMEZ.
--
-- ESKİ KAYITLAR: Bu migration MEVCUT SATIRLARA DML YAPMAZ (backfill YOK). Bugün active=false olan onaylı uzmanların
--   archived_at'i NULL kalır → "Pasif" görünür (girişleri kapalı kalır; listeden KAYBOLMAZ). Bunların hangisinin
--   arşive alınacağı Owner kararıdır: scripts/uye-arsiv-4a/legacy-archive-*.sql (ayrı onay; migration DEĞİL).
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path; EXECUTE yalnız service_role. Aktör DB'de aktif admin doğrulanır.
-- HATA KODLARI: UY001 bayat istemci · UY002 iş kuralı · UY003 geçersiz girdi · UY004 arşivde (aktifleştirme) ·
--               UY005 arşivde (değişiklik) · UP006 kalıcı silme: arşivde değil · 42501 yetki.
-- DEPLOY SIRASI (ZORUNLU): ÖNCE bu migration, SONRA kod. Kod archived_at yoksa eski davranışa düşer (fail-safe).
-- UYGULAMA: AYRI OWNER ONAYI. Bu PR'da production'a UYGULANMAZ.
-- =============================================================================

BEGIN;

-- ── 0) Ön koşul: audit CHECK sürüklenmesi yok ────────────────────────────────
DO $pre$
DECLARE
  v_def      text;
  v_live     text[];
  v_expected text[] := ARRAY[
    'user_created','user_activated','user_deactivated','user_approved','user_rejected',
    'password_changed_by_admin','all_sessions_terminated','single_session_terminated',
    'desktop_limit_changed','mobile_limit_changed','tablet_limit_changed','total_session_limit_changed',
    'module_enabled','module_disabled','payment_status_changed','role_changed','workspace_viewed',
    'user_deleted','user_archived','main_admin_critical_action',
    'library_transfer_completed','library_transfer_failed','library_transfer_retried',
    'user_profile_updated','license_settings_changed','security_exempt_changed',
    'admin_web_login_pending','admin_web_login_approved','admin_web_login_denied',
    'admin_mobile_login_rejected','own_session_terminated','pricing_phase_changed'];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conname = 'admin_audit_action_chk' AND c.conrelid = 'public.admin_audit_log'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '4a on kosul: admin_audit_action_chk bulunamadi';
  END IF;
  -- Kalıcı silme koruması (5b/5c) 20271009100000'in işaret tablosu + yardımcı fonksiyonuna dayanır.
  IF to_regclass('public.admin_purge_context') IS NULL
     OR to_regprocedure('public.admin_purge_in_progress(uuid,uuid)') IS NULL
     OR to_regclass('public.trial_profiles') IS NULL OR to_regclass('public.member_pricing_phases') IS NULL THEN
    RAISE EXCEPTION '4a on kosul: admin_purge_context / admin_purge_in_progress / trial_profiles / member_pricing_phases yok; uygulanmadi';
  END IF;
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_live
    FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  -- Migration yeniden çalıştırılırsa (idempotent) 'user_unarchived' zaten vardır → beklenen kümeye dahil sayılır.
  IF NOT (v_live <@ (v_expected || ARRAY['user_unarchived']) AND v_expected <@ v_live) THEN
    RAISE EXCEPTION '4a on kosul: admin_audit_action_chk beklenenden farkli (%); uygulanmadi', v_def;
  END IF;
END
$pre$;

-- ── 1) Arşiv alanı + değişmez ────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
COMMENT ON COLUMN public.users.archived_at IS
  'Aşama 4a: yönetim arşivi. NULL = arşivde değil. Yalnız admin_archive_user / admin_unarchive_user yazar. '
  'archived_at dolu ⇒ active false (users_archived_inactive_chk). Erişim kararı active''e bağlı kalır.';

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'users_archived_inactive_chk' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_archived_inactive_chk CHECK (archived_at IS NULL OR active IS NOT TRUE);
  END IF;
END
$chk$;

-- ── 2) Audit CHECK — SÜPERSET (mevcut 32 + user_unarchived) ──────────────────
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
  'user_unarchived'
));

-- ── 3) ARŞİVLE (atomik + oturum iptali; tekrar güvenli) ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_archive_user(
  p_user_id        uuid,
  p_actor_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor  public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_actor_main boolean;
  v_revoked integer;
  v_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_archive_user: id/aktor null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_archive_user: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_archive_user: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  -- Owner kararı (12.11): yalnız ONAYLI UZMAN arşivlenir. Başvuru (pending/boş), reddedilen ve yönetici hesapları
  -- bu akışla arşivlenemez (yöneticilerin ayrı pasifleştirme + kilitlenme korumaları değişmez).
  IF lower(coalesce(v_target.role, '')) <> 'expert' OR lower(coalesce(v_target.approval_status, '')) <> 'approved' THEN
    RAISE EXCEPTION 'admin_archive_user: yalniz onayli uzman arsivlenebilir' USING ERRCODE = 'UY002';
  END IF;

  -- Zaten arşivde: durum DEĞİŞMEZ, yeni audit YAZILMAZ (çift tık / eşzamanlı istek tek kayıt üretir).
  -- Savunma: olası artık oturum yine iptal edilir (normalde 0; arşivdeki hesap giriş yapamaz).
  IF v_target.archived_at IS NOT NULL THEN
    v_revoked := public.admin_revoke_user_sessions_tx(p_user_id, 'admin_archived');
    RETURN jsonb_build_object('ok', true, 'active', false, 'archived_at', v_target.archived_at,
                              'already_archived', true, 'revoked_session_count', v_revoked);
  END IF;

  v_at := now();
  UPDATE public.users SET active = false, archived_at = v_at WHERE id = p_user_id;
  v_revoked := public.admin_revoke_user_sessions_tx(p_user_id, 'admin_archived');

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id, 'user_archived',
     jsonb_build_object('active', v_target.active, 'archived', false),
     jsonb_build_object('active', false, 'archived', true),
     jsonb_build_object('revoked_session_count', v_revoked));

  RETURN jsonb_build_object('ok', true, 'active', false, 'archived_at', v_at,
                            'already_archived', false, 'revoked_session_count', v_revoked);
END;
$$;

-- ── 4) PASİFE AL / AKTİFLEŞTİR — arşivdeki hesap aktifleştirilemez ───────────
-- 20270129235900 gövdesi AYNEN + tek ek kural (UY004). Pasife alma, oturum iptali, onaysız uzman reddi (UY002),
-- bayat istemci (UY001) ve audit sözleşmesi değişmez. archived_at'e DOKUNMAZ.
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  p_user_id        uuid,
  p_actor_admin_id uuid,
  p_active         boolean,
  p_expected_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor  public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_actor_main boolean;
  v_revoked integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'admin_set_user_active: parametre null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_set_user_active: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_user_active: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;

  IF p_expected_active IS NOT NULL AND v_target.active IS DISTINCT FROM p_expected_active THEN
    RAISE EXCEPTION 'admin_set_user_active: guncel durum degismis (beklenen=%, gercek=%)',
      p_expected_active, v_target.active USING ERRCODE = 'UY001';
  END IF;

  -- 4a: arşivdeki hesap doğrudan aktifleştirilemez; önce ana yönetici arşivden çıkarır (admin_unarchive_user).
  IF p_active AND v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'admin_set_user_active: hesap arsivde' USING ERRCODE = 'UY004';
  END IF;

  IF p_active AND lower(coalesce(v_target.role,'')) = 'expert'
     AND lower(coalesce(v_target.approval_status, '')) NOT IN ('approved', '') THEN
    RAISE EXCEPTION 'admin_set_user_active: onaysiz uzman aktiflestirilemez' USING ERRCODE = 'UY002';
  END IF;

  UPDATE public.users SET active = p_active WHERE id = p_user_id;
  IF v_target.active IS DISTINCT FROM p_active THEN
    v_revoked := public.admin_revoke_user_sessions_tx(
      p_user_id, CASE WHEN p_active THEN 'admin_reactivated_reset' ELSE 'admin_deactivated' END);
  END IF;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id,
     CASE WHEN p_active THEN 'user_activated' ELSE 'user_deactivated' END,
     jsonb_build_object('active', v_target.active),
     jsonb_build_object('active', p_active),
     jsonb_build_object('revoked_session_count', v_revoked));

  RETURN jsonb_build_object('ok', true, 'active', p_active, 'revoked_session_count', v_revoked);
END;
$$;

-- ── 5) ARŞİVDEN ÇIKAR (yalnız ana yönetici; hesap PASİF kalır) ───────────────
CREATE OR REPLACE FUNCTION public.admin_unarchive_user(
  p_user_id        uuid,
  p_actor_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor  public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_unarchive_user: id/aktor null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE
     OR coalesce(v_actor.is_super_admin, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_unarchive_user: yalniz ana yonetici' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = p_actor_admin_id THEN
    RAISE EXCEPTION 'admin_unarchive_user: kendi hesabi' USING ERRCODE = 'UY003';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_unarchive_user: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  -- Arşivde değil (hiç arşivlenmemiş ya da başka yönetici az önce çıkardı) → 409; durum ve audit değişmez.
  IF v_target.archived_at IS NULL THEN
    RAISE EXCEPTION 'admin_unarchive_user: hesap arsivde degil' USING ERRCODE = 'UY002';
  END IF;

  -- Yalnız yönetim durumu: active=false KALIR (CHECK zaten aktif arşiv satırına izin vermez). Paket, deneme,
  -- ödeme, modül ve onay alanlarına dokunulmaz; erişim ayrıca "Aktif Yap" ile ve onun kurallarıyla açılır.
  UPDATE public.users SET archived_at = NULL WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, true, p_user_id, 'user_unarchived',
     jsonb_build_object('archived', true, 'active', v_target.active),
     jsonb_build_object('archived', false, 'active', v_target.active),
     jsonb_build_object('archived_at', v_target.archived_at));

  RETURN jsonb_build_object('ok', true, 'active', coalesce(v_target.active, false), 'archived', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unarchive_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unarchive_user(uuid, uuid) TO service_role;
-- CREATE OR REPLACE mevcut yetkileri korur; yine de sözleşme açıkça yeniden yazılır.
REVOKE ALL ON FUNCTION public.admin_archive_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_user(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_user_active(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, uuid, boolean, boolean) TO service_role;

-- ── 5b) KALICI SİLME YALNIZ ARŞİVDE (Owner kararı 12.11) ─────────────────────
-- admin_purge_archived_expert YENİDEN YAZILMAZ. Fonksiyon hedef satırı FOR UPDATE kilitledikten sonra ve HİÇBİR satırı
-- silmeden ÖNCE admin_purge_context'e işlem işaretini yazar (20271009100000 :211). Bu işarete eklenen BEFORE INSERT
-- tetikleyicisi, kilitli hedef satırı yeniden okur: archived_at NULL veya active=true ise mevcut UP006 ile reddeder →
-- tüm işlem geri alınır, hiçbir ilişkili kayıt silinmez. Eşzamanlı arşivden çıkarma / aktifleştirme hedef satır
-- kilidiyle serileşir; tetikleyici her zaman COMMIT edilmiş son durumu görür.
CREATE OR REPLACE FUNCTION public.admin_purge_require_archived_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_archived timestamptz;
  v_active   boolean;
BEGIN
  SELECT u.archived_at, u.active INTO v_archived, v_active FROM public.users u WHERE u.id = NEW.user_id;
  IF NOT FOUND OR v_archived IS NULL OR v_active IS NOT FALSE THEN
    RAISE EXCEPTION 'admin_purge: uzman arsivde degil (archived_at)' USING ERRCODE = 'UP006';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_purge_require_archived_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS admin_purge_require_archived ON public.admin_purge_context;
CREATE TRIGGER admin_purge_require_archived
  BEFORE INSERT ON public.admin_purge_context
  FOR EACH ROW EXECUTE FUNCTION public.admin_purge_require_archived_trg();

-- ── 5c) ARŞİVDEKİ HESAPTA DEĞİŞİKLİK KORUMASI (Owner kararı 12.11) ────────────
-- Arşivdeki hesabın kayıtları OKUNUR; üyelik / deneme / modül / kredi / ödeme-ticari / lisans-erişim / rol / onay
-- alanları DEĞİŞMEZ. Mevcut RPC ve route'lar yeniden yazılmaz: koruma, tüm yazma yollarını (RPC, doğrudan UPDATE)
-- aynı işlem içinde kapsayan tetikleyicilerdedir (ERRCODE UY005). Yeniden değişiklik için ana yönetici önce arşivden
-- çıkarır (hesap pasif kalır). Ad, e-posta ve parola değişebilir. archive/unarchive geçişleri etkilenmez (yalnız
-- "arşivde kalan" satır korunur). Kalıcı silme (admin_purge_in_progress) muaf.
CREATE OR REPLACE FUNCTION public.admin_archived_user_guard_trg()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
  k text;
BEGIN
  IF OLD.archived_at IS NULL OR NEW.archived_at IS NULL THEN
    RETURN NEW; -- arşive giriş / arşivden çıkış (yalnız RPC'ler yapar) veya arşivde değil
  END IF;
  -- Kolon yoksa her iki taraf NULL → eşit (şema farklarına dayanıklı).
  FOREACH k IN ARRAY ARRAY[
    'role', 'approval_status', 'approved_at', 'active',
    'package_type', 'plan', 'membership_status', 'subscription_status', 'membership_started_at', 'membership_ends_at',
    'trial_kind', 'trial_status', 'trial_started_at', 'trial_ends_at',
    'module_permissions', 'astrology_technique_grants',
    'payment_status', 'last_payment_date', 'next_payment_date', 'paid_amount', 'payment_note', 'agreed_fee', 'billing_period',
    'license_type', 'allowed_active_sessions', 'allowed_locations', 'security_mode', 'security_exempt', 'license_note',
    'allowed_desktop_sessions', 'allowed_mobile_sessions', 'allowed_tablet_sessions', 'allowed_unknown_sessions',
    'tenant_id', 'is_super_admin', 'is_demo_account'
  ] LOOP
    IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
      RAISE EXCEPTION 'hesap arsivde: % degistirilemez (once arsivden cikarin)', k USING ERRCODE = 'UY005';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_archived_user_guard_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS admin_archived_user_guard ON public.users;
CREATE TRIGGER admin_archived_user_guard
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.admin_archived_user_guard_trg();

-- Kullanıcıya bağlı ticari/deneme tabloları: arşivdeki hesap için yazma yok (okuma serbest).
-- DELETE yalnız fiyat dönemlerinde korunur; kalıcı silme (admin_purge_in_progress) ve CASCADE (kullanıcı satırı
-- silinmişse arşiv satırı da yoktur) muaftır.
CREATE OR REPLACE FUNCTION public.admin_archived_child_guard_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
BEGIN
  IF v_uid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.archived_at IS NOT NULL)
     AND NOT public.admin_purge_in_progress(v_uid, NULL) THEN
    RAISE EXCEPTION 'hesap arsivde: % degistirilemez (once arsivden cikarin)', TG_TABLE_NAME USING ERRCODE = 'UY005';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_archived_child_guard_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_archived_guard ON public.trial_profiles;
CREATE TRIGGER admin_archived_guard
  BEFORE INSERT OR UPDATE ON public.trial_profiles
  FOR EACH ROW EXECUTE FUNCTION public.admin_archived_child_guard_trg();
DROP TRIGGER IF EXISTS admin_archived_guard ON public.member_pricing_phases;
CREATE TRIGGER admin_archived_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.member_pricing_phases
  FOR EACH ROW EXECUTE FUNCTION public.admin_archived_child_guard_trg();
-- user_payment_history depo dışı eski tablodur (CREATE TABLE migration'da yok) → yalnız varsa; geçmiş satırlar
-- silinmez/okunur, yalnız yeni kayıt ve düzenleme engellenir.
DO $uph$
BEGIN
  IF to_regclass('public.user_payment_history') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS admin_archived_guard ON public.user_payment_history';
    EXECUTE 'CREATE TRIGGER admin_archived_guard BEFORE INSERT OR UPDATE ON public.user_payment_history '
         || 'FOR EACH ROW EXECUTE FUNCTION public.admin_archived_child_guard_trg()';
  END IF;
END
$uph$;

-- ── 6) ÜYE LİSTESİ V2 — 'pasif' aşaması ──────────────────────────────────────
-- 20280101000500 gövdesi AYNEN; farklar yalnız: src.stage (arsiv → archived_at yoksa pasif), filtre/preset 'pasif',
-- sıralama önceliğinde 'pasif'. Sayaç ('counts') ve karar ('decisions') tanımları değişmez.
CREATE OR REPLACE FUNCTION public.admin_list_members_v2(
  p_actor       uuid,
  p_filter      text    DEFAULT 'all',
  p_q           text    DEFAULT '',
  p_role        text    DEFAULT 'expert',
  p_module_keys text[]  DEFAULT NULL,
  p_payment     text    DEFAULT 'all',
  p_sort        text    DEFAULT 'attn',
  p_limit       integer DEFAULT 20,
  p_offset      integer DEFAULT 0,
  p_now         timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_now    timestamptz := coalesce(p_now, now());
  v_today  date := (coalesce(p_now, now()) AT TIME ZONE 'Europe/Istanbul')::date;
  v_q      text := public.admin_search_fold(btrim(coalesce(p_q, '')));
  v_pat    text;
  v_filter text := coalesce(p_filter, 'all');
  v_role   text := coalesce(p_role, 'expert');
  v_pay    text := coalesce(p_payment, 'all');
  v_sort   text := coalesce(p_sort, 'attn');
  v_limit  integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 100);
  v_offset integer := LEAST(GREATEST(coalesce(p_offset, 0), 0), 1000000);
  v_mods   text[] := CASE WHEN p_module_keys IS NULL OR cardinality(p_module_keys) = 0 THEN NULL ELSE p_module_keys END;
  v_last   timestamptz;
  v_out    jsonb;
BEGIN
  -- Aktör: aktif admin (veritabanında yeniden doğrulanır; istemci beyanına güvenilmez).
  IF p_actor IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users a
        WHERE a.id = p_actor AND lower(coalesce(a.role, '')) = 'admin' AND a.active IS TRUE) THEN
    RAISE EXCEPTION 'admin_list_members_v2: yetkisiz' USING ERRCODE = 'UY401';
  END IF;
  IF v_filter NOT IN ('all','basvuru','trial','bitti','pro','prores','yeni','notstarted','inceleme',
                      'pay','paynext','soon','eski','askida','pasif','arsiv')
     OR v_role NOT IN ('expert','admin')
     OR v_pay NOT IN ('all','check','paid','pending','overdue','exempt')
     OR v_sort NOT IN ('attn','new','login','name')
     OR (v_mods IS NOT NULL AND (cardinality(v_mods) > 8
         OR EXISTS (SELECT 1 FROM unnest(v_mods) k WHERE k IS NULL OR k !~ '^[a-z][a-z_]{1,39}$')))
     OR char_length(v_q) > 120 THEN
    RAISE EXCEPTION 'admin_list_members_v2: gecersiz filtre' USING ERRCODE = 'UY003';
  END IF;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- Karar sayısı zil ile AYNI kaynaktan: zil ile aynı 20 sn kuralıyla uzlaştırma (yalnız admin_notifications yazar).
  SELECT last_reconciled_at INTO v_last FROM public.admin_notification_settings WHERE id;
  IF v_last IS NULL OR v_last < now() - interval '20 seconds' THEN
    PERFORM public.admin_notifications_reconcile();
  END IF;

  WITH base AS (
    SELECT u.id, u.full_name, u.email, lower(coalesce(u.role, '')) AS role,
           public.admin_member_stage_of(u.role, u.approval_status, u.active, u.is_demo_account, u.package_type,
                                        u.plan, u.trial_kind, u.trial_status, u.trial_ends_at, v_now) AS stage0,
           u.archived_at,
           coalesce(u.is_demo_account, false) AS is_demo,
           u.payment_status, u.next_payment_date::date AS next_payment_date,
           u.trial_started_at, u.trial_ends_at, u.created_at, u.module_permissions,
           (SELECT max(se.created_at) FROM public.user_sessions se WHERE se.user_id = u.id) AS last_login_at,
           (SELECT min(q.created_at) FROM public.pro_upgrade_requests q WHERE q.user_id = u.id AND q.status = 'open') AS pro_request_at
      FROM public.users u
     WHERE lower(coalesce(u.role, '')) IN ('expert', 'admin')
  ),
  src AS (
    -- 4a: admin_member_stage_of 'arsiv' = onaylı + pasif uzman. Yalnız archived_at dolu olan ARŞİV'dir;
    -- arşivlenmemiş pasif hesap 'pasif' aşamasıdır (eski active=false kayıtlar dahil — otomatik arşivleme yok).
    SELECT b.*, CASE WHEN b.stage0 = 'arsiv' AND b.archived_at IS NULL THEN 'pasif' ELSE b.stage0 END AS stage
      FROM base b
  ),
  m AS (
    SELECT s.*,
           (s.role = 'expert' AND NOT s.is_demo) AS commercial,
           (s.stage = 'pro' AND lower(coalesce(s.payment_status, '')) <> 'exempt'
              AND (lower(coalesce(s.payment_status, '')) = 'overdue' OR s.next_payment_date < v_today)) AS pay_check,
           (s.stage = 'pro' AND lower(coalesce(s.payment_status, '')) NOT IN ('exempt', 'overdue')
              AND s.next_payment_date BETWEEN v_today AND v_today + 7) AS pay_next,
           (s.stage = 'deneme' AND s.trial_ends_at <= v_now + interval '48 hours') AS soon,
           (s.created_at >= v_now - interval '7 days') AS is_new,
           ((s.created_at AT TIME ZONE 'Europe/Istanbul')::date = v_today) AS created_today,
           CASE s.stage WHEN 'basvuru' THEN 0 WHEN 'inceleme' THEN 1 WHEN 'eski_kayit' THEN 2 WHEN 'deneme_bitti' THEN 3
                        WHEN 'deneme' THEN 4 WHEN 'deneme_baslamadi' THEN 5 WHEN 'pro' THEN 6 WHEN 'deneme_durdu' THEN 7
                        WHEN 'pasif' THEN 8 WHEN 'demo' THEN 9 WHEN 'arsiv' THEN 10 WHEN 'red' THEN 11 ELSE 12 END AS prio
      FROM src s
  ),
  presets AS (
    SELECT m.*,
           (m.role = 'expert' AND m.stage <> 'arsiv')                          AS f_all,
           (m.stage = 'basvuru')                                               AS f_basvuru,
           (m.stage = 'deneme')                                                AS f_trial,
           (m.stage = 'deneme_bitti')                                          AS f_bitti,
           (m.stage = 'pro')                                                   AS f_pro,
           (m.pro_request_at IS NOT NULL AND m.stage <> 'pro')                 AS f_prores,
           (m.role = 'expert' AND m.is_new AND NOT m.is_demo)                  AS f_yeni,
           (m.stage = 'deneme_baslamadi')                                      AS f_notstarted,
           (m.stage = 'inceleme')                                              AS f_inceleme,
           m.pay_check                                                         AS f_pay,
           m.pay_next                                                          AS f_paynext,
           m.soon                                                              AS f_soon,
           (m.stage = 'eski_kayit')                                            AS f_eski,
           (m.stage = 'deneme_durdu')                                          AS f_askida,
           (m.stage = 'pasif')                                                 AS f_pasif,
           (m.stage = 'arsiv')                                                 AS f_arsiv
      FROM m
  ),
  filtered AS (
    SELECT p.* FROM presets p
     WHERE (CASE WHEN v_role = 'admin' THEN p.role = 'admin'
                 ELSE CASE v_filter
                   WHEN 'all' THEN p.f_all WHEN 'basvuru' THEN p.f_basvuru WHEN 'trial' THEN p.f_trial
                   WHEN 'bitti' THEN p.f_bitti WHEN 'pro' THEN p.f_pro WHEN 'prores' THEN p.f_prores
                   WHEN 'yeni' THEN p.f_yeni WHEN 'notstarted' THEN p.f_notstarted WHEN 'inceleme' THEN p.f_inceleme
                   WHEN 'pay' THEN p.f_pay WHEN 'paynext' THEN p.f_paynext WHEN 'soon' THEN p.f_soon
                   WHEN 'eski' THEN p.f_eski WHEN 'askida' THEN p.f_askida WHEN 'pasif' THEN p.f_pasif
                   WHEN 'arsiv' THEN p.f_arsiv END END)
       AND (v_q = '' OR public.admin_search_fold(p.full_name) LIKE v_pat OR public.admin_search_fold(p.email) LIKE v_pat)
       AND (v_mods IS NULL
            OR (jsonb_typeof(p.module_permissions) = 'object'
                AND EXISTS (SELECT 1 FROM unnest(v_mods) k WHERE p.module_permissions -> k = 'true'::jsonb)))
       AND (v_pay = 'all'
            OR (v_pay = 'check' AND p.pay_check)
            OR (v_pay <> 'check' AND lower(coalesce(p.payment_status, '')) = v_pay))
  ),
  ordered AS (
    SELECT f.*, row_number() OVER (ORDER BY
             CASE WHEN v_sort = 'attn' THEN f.prio END ASC,
             CASE WHEN v_sort = 'attn' THEN (f.pro_request_at IS NOT NULL) END DESC,
             CASE WHEN v_sort = 'login' THEN f.last_login_at END DESC NULLS LAST,
             CASE WHEN v_sort = 'name' THEN public.admin_search_fold(coalesce(nullif(btrim(f.full_name), ''), f.email)) END ASC NULLS LAST,
             f.created_at DESC NULLS LAST,
             f.id) AS ord_n
      FROM filtered f
  ),
  page AS (
    SELECT o.id, o.full_name, o.email, o.role, o.stage, o.is_demo, o.payment_status, o.next_payment_date,
           o.trial_started_at, o.trial_ends_at, o.created_at, o.module_permissions, o.last_login_at,
           o.pro_request_at, o.pay_check, o.ord_n
      FROM ordered o ORDER BY o.ord_n LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM filtered),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(pg) - 'ord_n' ORDER BY pg.ord_n) FROM page pg), '[]'::jsonb),
    'presets', (SELECT jsonb_build_object(
        'all', count(*) FILTER (WHERE f_all), 'basvuru', count(*) FILTER (WHERE f_basvuru),
        'trial', count(*) FILTER (WHERE f_trial), 'bitti', count(*) FILTER (WHERE f_bitti),
        'pro', count(*) FILTER (WHERE f_pro), 'prores', count(*) FILTER (WHERE f_prores),
        'yeni', count(*) FILTER (WHERE f_yeni), 'notstarted', count(*) FILTER (WHERE f_notstarted),
        'inceleme', count(*) FILTER (WHERE f_inceleme), 'pay', count(*) FILTER (WHERE f_pay),
        'paynext', count(*) FILTER (WHERE f_paynext), 'soon', count(*) FILTER (WHERE f_soon),
        'eski', count(*) FILTER (WHERE f_eski), 'askida', count(*) FILTER (WHERE f_askida),
        'pasif', count(*) FILTER (WHERE f_pasif),
        'arsiv', count(*) FILTER (WHERE f_arsiv), 'admins', count(*) FILTER (WHERE role = 'admin'))
      FROM presets),
    -- Ticari göstergeler: yalnız demo OLMAYAN uzmanlar.
    'counts', (SELECT jsonb_build_object(
        'today',       count(*) FILTER (WHERE commercial AND created_today),
        'trial',       count(*) FILTER (WHERE commercial AND stage = 'deneme'),
        'not_started', count(*) FILTER (WHERE commercial AND stage = 'deneme_baslamadi'),
        'pro',         count(*) FILTER (WHERE commercial AND stage = 'pro'),
        'pro_exempt',  count(*) FILTER (WHERE commercial AND stage = 'pro' AND lower(coalesce(payment_status, '')) = 'exempt'),
        'ended',       count(*) FILTER (WHERE commercial AND stage = 'deneme_bitti'),
        'soon',        count(*) FILTER (WHERE commercial AND soon),
        'pay_check',   count(*) FILTER (WHERE commercial AND pay_check),
        'pay_next',    count(*) FILTER (WHERE commercial AND pay_next),
        'demo',        count(*) FILTER (WHERE role = 'expert' AND is_demo))
      FROM m),
    -- Karar bekleyenler: zildeki açık kararlar (tür bazında + toplam) — aynı tablo, aynı tanım.
    'decisions', (SELECT jsonb_build_object(
        'total',      count(*),
        'basvuru',    count(*) FILTER (WHERE n.type = 'basvuru'),
        'pro_talebi', count(*) FILTER (WHERE n.type = 'pro_talebi'),
        'inceleme',   count(*) FILTER (WHERE n.type = 'inceleme'),
        'eski_kayit', count(*) FILTER (WHERE n.type = 'eski_kayit'),
        'odeme',      count(*) FILTER (WHERE n.type = 'odeme'))
      FROM public.admin_notifications n WHERE n.kind = 'action' AND n.resolved_at IS NULL),
    'today', v_today,
    'server_now', v_now,
    'limit', v_limit,
    'offset', v_offset)
  INTO v_out;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_members_v2(uuid, text, text, text, text[], text, text, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_members_v2(uuid, text, text, text, text[], text, text, integer, integer, timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
