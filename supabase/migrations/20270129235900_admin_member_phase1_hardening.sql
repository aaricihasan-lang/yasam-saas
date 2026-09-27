-- =============================================================================
-- 20270129000000_admin_member_phase1_hardening.sql   [EXPAND — CODE DEPENDENCY]
--
-- ÜYE YÖNETİMİ FAZ 1 — SATIŞ BLOCKER'LARI + KRİTİK İŞ AKIŞI HARDENING.
--
-- ÜRÜN KARARLARI (owner, kesin):
--   A) Onay sırasında modüller SEÇİLİR; en az bir modül zorunlu; onay = approved + active +
--      Premium + YALNIZ seçilen modüller (tek transaction).
--   B) Deneme/Pro yok — her ONAYLI uzman Premium. package_type/plan kolonları teknik uyumluluk
--      için kalır (yh_grade_expert_premium sözleşmesi 'premium' ister); ürün seçeneği DEĞİL.
--
-- İÇERİK:
--   1) admin_audit_log CHECK süperseti + 3 yeni action (profil / lisans / güvenlik istisnası).
--   2) admin_approve_expert_with_modules — atomik onay + modül seçimi + Premium + YH kuralı
--      (yh_grade_expert_premium AYNI tx) + durum doğrulaması (zaten onaylı → UY002) + eski
--      oturumların iptali + audit.
--   3) admin_reject_user (REPLACE) — yalnız PENDING hedef (aksi UY002) + oturum iptali + audit.
--   4) admin_archive_user (REPLACE) — oturum iptali AYNI tx + audit context.
--   5) admin_set_user_active (REPLACE) — durum değişiminde oturum iptali AYNI tx; onaysız
--      (pending/rejected) hesabı aktifleştirme reddi (UY002).
--   6) admin_set_module_permissions — YALNIZ değişen anahtar(lar)ı kilit altında uygular
--      (lost-update yok) + gerçek final state'e göre module_enabled/module_disabled audit.
--
-- HATA KODLARI: UY001 = bayat istemci durumu (409) · UY002 = iş kuralı çakışması (409)
--               UY003 = geçersiz girdi (400). Route'lar ham DB mesajını istemciye SIZDIRMAZ.
--
-- OTURUM SÖZLEŞMESİ: oturum = user_sessions satırı; geçerlilik YALNIZ is_active=true. İptal =
--   is_active=false (hiçbir kod yolu geri true yapmaz) → ret/arşiv/pasif sonrası eski token
--   yeniden onay/aktivasyonda CANLANMAZ; yalnız yeni login yeni satır üretir.
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + YALNIZ service_role EXECUTE. Aktör DB'de
--   admin+aktif doğrulanır; actor_is_main_admin users.is_super_admin'den TÜRETİLİR.
-- VERİ: mevcut kullanıcı satırlarına DML YOK (yalnız fonksiyon + CHECK). Backfill YOK.
-- IDEMPOTENT: CREATE OR REPLACE + DROP/ADD CONSTRAINT IF EXISTS.
-- UYGULAMA: Supabase Dashboard SQL Editor (AYRI OWNER ONAYI). Bu turda production'a UYGULANMAZ.
-- DEPLOY SIRASI (ZORUNLU): ÖNCE bu migration, SONRA kod (yoksa route 42883 → fail-closed 500).
-- =============================================================================

BEGIN;

-- ── 1) admin_audit_log CHECK — SÜPERSET (mevcut 23 + 3 yeni) ──────────────────
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
  'security_exempt_changed'
));

-- ── Ortak: modül değişiklik haritası doğrulaması (SAF; IMMUTABLE) ─────────────
-- Anahtar: ^[a-z][a-z0-9_]{0,39}$ · değer: boolean · yasam_hafizasi YASAK (YH yalnız atomik
-- premium-grade kuralından) · en fazla 40 anahtar. Kanonik whitelist uygulama katmanındadır
-- (lib/admin/userManagement ADMIN_MODULE_UI_KEYS); bu kontrol DB'de ikinci savunma hattıdır.
CREATE OR REPLACE FUNCTION public.admin_module_map_is_valid(p_map jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT p_map IS NOT NULL
     AND jsonb_typeof(p_map) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(p_map)) BETWEEN 1 AND 40
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_map) e
        WHERE e.key !~ '^[a-z][a-z0-9_]{0,39}$'
           OR e.key = 'yasam_hafizasi'
           OR jsonb_typeof(e.value) <> 'boolean'
     );
$$;

-- ── Ortak: kullanıcının TÜM aktif oturumlarını iptal et (çağıranın tx'inde) ──
CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions_tx(p_user_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.user_sessions
     SET is_active = false, ended_at = now(), end_reason = p_reason
   WHERE user_id = p_user_id AND is_active = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── 2) ONAY + MODÜL SEÇİMİ + PREMIUM (atomik) ─────────────────────────────────
-- p_modules     : { "<grantable_key>": true|false, ... } — uygulama TÜM grantable anahtarları
--                 gönderir (seçilen=true, diğer=false) → "tam seçilen modüller açık".
-- p_remove_keys : eski TR alias anahtarları (danisan_yonetimi, dogaltas, ...) — alias=true bir
--                 kapalı modülü gizlice açık tutmasın diye kaldırılır.
-- UI dışındaki diğer anahtarlar (ör. yetenek bayrakları) KORUNUR; yasam_hafizasi yalnız
-- yh_grade_expert_premium'un eligibility kuralıyla verilir (değişmez sözleşme).
-- p_expected_approval: yöneticinin EKRANDA gördüğü onay durumu ('pending' | 'rejected').
--                 KİLİT altında gerçek durumla karşılaştırılır; farklıysa UY001 (bayat ekran) →
--                 örn. başka admin az önce reddettiyse "Onayla" sessizce yeniden onay YAPMAZ.
CREATE OR REPLACE FUNCTION public.admin_approve_expert_with_modules(
  p_user_id        uuid,
  p_membership     jsonb,
  p_actor_admin_id uuid,
  p_modules        jsonb,
  p_remove_keys    text[],
  p_expected_approval text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor   public.users%ROWTYPE;
  v_target  public.users%ROWTYPE;
  v_actor_main boolean;
  v_prior_approval text;
  v_perms   jsonb;
  v_outcome text;
  v_enabled text[];
  v_revoked integer;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: id/aktor null' USING ERRCODE = 'UY003';
  END IF;

  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  IF NOT public.admin_module_map_is_valid(p_modules) THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: gecersiz modul haritasi' USING ERRCODE = 'UY003';
  END IF;
  SELECT coalesce(array_agg(e.key ORDER BY e.key), '{}'::text[]) INTO v_enabled
    FROM jsonb_each(p_modules) e WHERE e.value = 'true'::jsonb;
  IF coalesce(array_length(v_enabled, 1), 0) = 0 THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: en az bir modul secilmeli' USING ERRCODE = 'UY003';
  END IF;

  -- Eşzamanlılık: hedef satırı kilitle (approve/reject/toggle/archive/modules serileşir).
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  IF lower(coalesce(v_target.role,'')) <> 'expert' THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: hedef uzman degil' USING ERRCODE = 'UY002';
  END IF;
  v_prior_approval := lower(coalesce(v_target.approval_status, ''));
  -- İdempotency / durum doğrulaması: ZATEN onaylı uzman yeniden onaylanamaz (membership_started_at
  -- + audit tekrar yazılmaz). Yalnız pending (legacy boş dahil) ve rejected (kontrollü yeniden onay).
  IF v_prior_approval NOT IN ('pending', '', 'rejected') THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: hedef zaten onayli' USING ERRCODE = 'UY002';
  END IF;
  -- Bayat ekran koruması (legacy boş onay durumu 'pending' sayılır).
  IF coalesce(p_expected_approval, '') NOT IN ('pending', 'rejected')
     OR (CASE WHEN v_prior_approval = '' THEN 'pending' ELSE v_prior_approval END) <> p_expected_approval THEN
    RAISE EXCEPTION 'admin_approve_expert_with_modules: guncel onay durumu degismis' USING ERRCODE = 'UY001';
  END IF;

  v_perms := (coalesce(v_target.module_permissions, '{}'::jsonb) - coalesce(p_remove_keys, '{}'::text[]))
             || p_modules;

  -- Premium + active + approved + seçilen modüller + YH kuralı — AYNI tx (yh_grade DEĞİŞMEZ).
  v_outcome := public.yh_grade_expert_premium(p_user_id, p_membership, v_perms);

  -- İlk onay tarihini koru (yeniden onayda eski tarih; ilk onayda now()).
  UPDATE public.users SET approved_at = COALESCE(v_target.approved_at, now()) WHERE id = p_user_id;

  -- Onay öncesi (pending/rejected dönem) kalmış olası aktif oturumlar canlanmasın.
  v_revoked := public.admin_revoke_user_sessions_tx(p_user_id, 'admin_approval_reset');

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id, 'user_approved',
     jsonb_build_object('approval_status', v_target.approval_status, 'active', v_target.active,
                        'package_type', v_target.package_type),
     jsonb_build_object('approval_status','approved','active',true,'package_type','premium'),
     jsonb_build_object('premium_outcome', v_outcome,
                        'modules', to_jsonb(v_enabled),
                        'module_count', coalesce(array_length(v_enabled, 1), 0),
                        'reapproval', v_prior_approval = 'rejected',
                        'revoked_session_count', v_revoked));

  RETURN jsonb_build_object('ok', true, 'premium_outcome', v_outcome,
                            'modules', to_jsonb(v_enabled),
                            'module_count', coalesce(array_length(v_enabled, 1), 0),
                            'revoked_session_count', v_revoked);
END;
$$;

-- ── 3) REDDET — yalnız PENDING (atomik + oturum iptali) ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reject_user(
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
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_reject_user: id/aktor null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_reject_user: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_reject_user: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  -- Yalnız onay BEKLEYEN başvuru reddedilebilir. Onaylı (ödeme yapan) uzman için doğru araç
  -- "Pasif Yap" / "Pasife Al ve Arşivle"dir → onaylı üyeyi yanlışlıkla reddetmek İMKÂNSIZ.
  IF lower(coalesce(v_target.approval_status, '')) NOT IN ('pending', '') THEN
    RAISE EXCEPTION 'admin_reject_user: hedef onay beklemiyor' USING ERRCODE = 'UY002';
  END IF;

  UPDATE public.users SET approval_status = 'rejected', active = false WHERE id = p_user_id;
  v_revoked := public.admin_revoke_user_sessions_tx(p_user_id, 'admin_rejected');

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id, 'user_rejected',
     jsonb_build_object('approval_status', v_target.approval_status, 'active', v_target.active),
     jsonb_build_object('approval_status','rejected','active',false),
     jsonb_build_object('revoked_session_count', v_revoked));

  RETURN jsonb_build_object('ok', true, 'revoked_session_count', v_revoked);
END;
$$;

-- ── 4) ARŞİVLE — soft-delete (atomik + oturum iptali) ─────────────────────────
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

  UPDATE public.users SET active = false WHERE id = p_user_id;
  v_revoked := public.admin_revoke_user_sessions_tx(p_user_id, 'admin_archived');

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id, 'user_archived',
     jsonb_build_object('active', v_target.active),
     jsonb_build_object('active', false),
     jsonb_build_object('revoked_session_count', v_revoked));

  RETURN jsonb_build_object('ok', true, 'active', false, 'revoked_session_count', v_revoked);
END;
$$;

-- ── 5) PASİFE AL / AKTİFLEŞTİR (atomik + oturum iptali) ───────────────────────
-- Pasife alma: tüm aktif oturumlar AYNI tx'te iptal. Aktifleştirme: pasif dönemden kalmış
-- (ör. eski arşiv yolundan) olası aktif oturumlar da iptal → eski token CANLANMAZ; kullanıcı
-- yeniden giriş yapar. Onaysız (pending/rejected) uzmanı aktifleştirme REDDEDİLİR (UY002):
-- onay akışı modül seçimiyle birlikte yalnız "Onayla"dan geçer.
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

-- ── 6) MODÜL İZNİ — yalnız değişen anahtar(lar) (kilit altında, lost-update yok) ─
-- p_changes : { "<key>": true|false } — YALNIZ admin'in değiştirdiği anahtar(lar).
-- p_aliases : { "<key>": ["<tr_alias>", ...] } — değişen anahtarın eski TR alias'ları; önceki
--             etkin durum (alias dahil) hesaplanır ve alias'lar kaldırılır (kapatılan modül
--             alias=true ile gizlice açık kalmasın).
-- Diğer tüm anahtarlar (başka admin'in eşzamanlı değişikliği dahil) DOKUNULMADAN kalır.
CREATE OR REPLACE FUNCTION public.admin_set_module_permissions(
  p_user_id        uuid,
  p_actor_admin_id uuid,
  p_changes        jsonb,
  p_aliases        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor  public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_actor_main boolean;
  v_old    jsonb;
  v_new    jsonb;
  v_key    text;
  v_val    boolean;
  v_was    boolean;
  v_alias_keys text[];
  v_all_alias  text[] := '{}'::text[];
  v_enabled  text[] := '{}'::text[];
  v_disabled text[] := '{}'::text[];
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_set_module_permissions: id/aktor null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_set_module_permissions: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  IF NOT public.admin_module_map_is_valid(p_changes) THEN
    RAISE EXCEPTION 'admin_set_module_permissions: gecersiz degisiklik haritasi' USING ERRCODE = 'UY003';
  END IF;
  IF p_aliases IS NULL OR jsonb_typeof(p_aliases) <> 'object' THEN
    RAISE EXCEPTION 'admin_set_module_permissions: gecersiz alias haritasi' USING ERRCODE = 'UY003';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_module_permissions: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  IF lower(coalesce(v_target.role,'')) <> 'expert' THEN
    RAISE EXCEPTION 'admin_set_module_permissions: hedef uzman degil' USING ERRCODE = 'UY002';
  END IF;

  v_old := coalesce(v_target.module_permissions, '{}'::jsonb);
  IF jsonb_typeof(v_old) <> 'object' THEN v_old := '{}'::jsonb; END IF;

  FOR v_key, v_val IN SELECT e.key, (e.value)::text::boolean FROM jsonb_each(p_changes) e LOOP
    v_alias_keys := '{}'::text[];
    IF p_aliases ? v_key AND jsonb_typeof(p_aliases -> v_key) = 'array' THEN
      SELECT coalesce(array_agg(a), '{}'::text[]) INTO v_alias_keys
        FROM jsonb_array_elements_text(p_aliases -> v_key) a
       WHERE a ~ '^[a-z][a-z0-9_]{0,39}$' AND a <> 'yasam_hafizasi';
    END IF;
    -- coalesce: anahtar YOKSA (v_old -> key) NULL → karşılaştırma NULL olur; NULL "açık değil" demektir.
    v_was := coalesce((v_old -> v_key) = 'true'::jsonb, false)
             OR EXISTS (SELECT 1 FROM unnest(v_alias_keys) a WHERE (v_old -> a) = 'true'::jsonb);
    IF v_val AND NOT v_was THEN v_enabled := v_enabled || v_key;
    ELSIF NOT v_val AND v_was THEN v_disabled := v_disabled || v_key;
    END IF;
    v_all_alias := v_all_alias || v_alias_keys;
  END LOOP;

  v_new := (v_old - v_all_alias) || p_changes;
  UPDATE public.users SET module_permissions = v_new WHERE id = p_user_id;

  IF coalesce(array_length(v_enabled, 1), 0) > 0 THEN
    INSERT INTO public.admin_audit_log
      (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
    VALUES (p_actor_admin_id, v_actor_main, p_user_id, 'module_enabled',
            jsonb_build_object('modules', to_jsonb(v_enabled), 'count', array_length(v_enabled, 1)));
  END IF;
  IF coalesce(array_length(v_disabled, 1), 0) > 0 THEN
    INSERT INTO public.admin_audit_log
      (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
    VALUES (p_actor_admin_id, v_actor_main, p_user_id, 'module_disabled',
            jsonb_build_object('modules', to_jsonb(v_disabled), 'count', array_length(v_disabled, 1)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'enabled', to_jsonb(v_enabled),
                            'disabled', to_jsonb(v_disabled), 'module_permissions', v_new);
END;
$$;

-- ── Yetki: yalnız service_role EXECUTE ──────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.admin_module_map_is_valid(jsonb)',
    'public.admin_revoke_user_sessions_tx(uuid,text)',
    'public.admin_approve_expert_with_modules(uuid,jsonb,uuid,jsonb,text[],text)',
    'public.admin_reject_user(uuid,uuid)',
    'public.admin_archive_user(uuid,uuid)',
    'public.admin_set_user_active(uuid,uuid,boolean,boolean)',
    'public.admin_set_module_permissions(uuid,uuid,jsonb,jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname IN ('admin_approve_expert_with_modules','admin_set_module_permissions',
--                      'admin_reject_user','admin_archive_user','admin_set_user_active');  -- prosecdef=t
--   SELECT has_function_privilege('anon',
--     'public.admin_approve_expert_with_modules(uuid,jsonb,uuid,jsonb,text[],text)','EXECUTE');   -- f
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='admin_audit_action_chk'; -- 26 action
-- ROLLBACK (kod geri alındıktan SONRA):
--   DROP FUNCTION IF EXISTS public.admin_approve_expert_with_modules(uuid,jsonb,uuid,jsonb,text[],text);
--   DROP FUNCTION IF EXISTS public.admin_set_module_permissions(uuid,uuid,jsonb,jsonb);
--   DROP FUNCTION IF EXISTS public.admin_revoke_user_sessions_tx(uuid,text);
--   DROP FUNCTION IF EXISTS public.admin_module_map_is_valid(jsonb);
--   -- admin_reject_user / admin_archive_user / admin_set_user_active: 20270107000000 gövdesini
--   -- yeniden çalıştır. CHECK: 20260925000000 süpersetini yeniden uygula (yeni action satırı
--   -- yoksa).
-- =============================================================================
