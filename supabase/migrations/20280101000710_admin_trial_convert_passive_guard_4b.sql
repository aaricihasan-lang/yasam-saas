-- =============================================================================
-- ADMIN ÜYE YÖNETİMİ · AŞAMA 4b (2/2) — PRO GEÇİŞİ PASİF HESABI AKTİFLEŞTİRMEZ
-- =============================================================================
-- SORUN: admin_trial_convert_to_pro → yh_grade_expert_premium zinciri hedef hesabın AKTİFLİĞİNE bakmaz;
--   yh_grade_expert_premium her çağrıda active=true yazar → PASİF deneme hesabı Pro'ya geçirilirken kendiliğinden
--   AKTİF olur (yönetici "Aktif Yap" demeden giriş açılır).
-- ÇÖZÜM: admin_trial_convert_to_pro (REPLACE) — 20280101000000 §12 gövdesi AYNEN; mevcut hedef satır kilidi (FOR UPDATE)
--   altında iki ek kural: arşivdeki hesap → UY005 (4a ile aynı anlam; archived_at kolonu yoksa uygulanmaz);
--   PASİF hesap → TR412. Reddedilen geçişte hiçbir satır değişmez (paket, modül, deneme, oturum, geçmiş, audit).
-- DOKUNULMAYAN: yh_grade_expert_premium (onay akışları bilinçli olarak aktifleştirir), onay / ret / eski kayıt onarımı
--   (zaten aktif hesap şartı arar), rol ve yetki politikası. MEVCUT SATIRLARA DML YOK.
-- HATA KODLARI: TR400 · TR401 · TR404 · TR409 (değişmedi) · TR412 pasif hesap · UY005 arşivde.
-- DEPLOY SIRASI: 20280101000700 ile birlikte, kod ÖNCESİ. Eski kod TR412'yi tanımaz → pasif hesap genel hata
--   ("Pro üyeliğe geçiş tamamlanamadı") ile reddedilir; veri değişmez. Yeni kod eski şemada pasif hesabı reddetmez
--   (bugünkü davranış) → bu yüzden migration ÖNCE.
-- UYGULAMA: AYRI OWNER ONAYI. Bu PR'da production'a UYGULANMAZ.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])') IS NULL
     OR to_regprocedure('public.yh_grade_expert_premium(uuid,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.trial_assert_admin(uuid)') IS NULL
     OR to_regprocedure('public.admin_module_map_is_valid(jsonb)') IS NULL THEN
    RAISE EXCEPTION '4b on kosul: TRIAL7 / premium RPC zinciri eksik';
  END IF;
END
$pre$;

-- ── 1) Pro geçişi: pasif / arşivdeki hesap reddedilir (hedef satır kilidi altında) ────────────────────────────
-- 20280101000000 §12 gövdesi AYNEN; yalnız FOR UPDATE'ten sonra iki kural eklendi (UY005, TR412).
CREATE OR REPLACE FUNCTION public.admin_trial_convert_to_pro(
  p_actor uuid, p_user_id uuid, p_modules jsonb, p_remove_keys text[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_main    boolean;
  r         public.users%ROWTYPE;
  v_perms   jsonb;
  v_enabled text[];
  v_outcome text;
  v_closed  integer;
BEGIN
  v_main := public.trial_assert_admin(p_actor);
  IF NOT public.admin_module_map_is_valid(p_modules) THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: gecersiz modul haritasi' USING ERRCODE = 'TR400';
  END IF;
  SELECT coalesce(array_agg(e.key ORDER BY e.key), '{}'::text[]) INTO v_enabled
    FROM jsonb_each(p_modules) e WHERE e.value = 'true'::jsonb;
  IF coalesce(array_length(v_enabled, 1), 0) = 0 THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: en az bir modul secilmeli' USING ERRCODE = 'TR400';
  END IF;

  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  -- 4b: arşivdeki hesapta değişiklik yok (4a UY005 ile aynı anlam; tetikleyiciye bırakılmadan, hiçbir yazımdan önce).
  IF FOUND AND (to_jsonb(r) ->> 'archived_at') IS NOT NULL THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: hesap arsivde' USING ERRCODE = 'UY005';
  END IF;
  IF NOT FOUND OR r.trial_kind IS NULL OR lower(coalesce(r.role,'')) <> 'expert' THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: deneme uyesi degil' USING ERRCODE = 'TR404';
  END IF;
  IF r.trial_status = 'converted' OR lower(coalesce(r.package_type,'')) = 'premium' THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: zaten Pro' USING ERRCODE = 'TR409';
  END IF;
  -- 4b: Pro geçişi pasif hesabı AKTİFLEŞTİRMEZ (yh_grade_expert_premium active=true yazar) → pasif hesap reddedilir.
  --     Önce yetkili yönetici "Aktif Yap" (admin_set_user_active) uygular. Hiçbir satır değişmeden geri dönülür.
  IF r.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: hesap pasif' USING ERRCODE = 'TR412';
  END IF;

  v_perms := (coalesce(r.module_permissions, '{}'::jsonb) - coalesce(p_remove_keys, '{}'::text[])) || p_modules;
  v_outcome := public.yh_grade_expert_premium(p_user_id, jsonb_build_object(
    'package_type', 'premium', 'plan', 'premium',
    'membership_status', 'active', 'subscription_status', 'active',
    'membership_started_at', now(), 'membership_ends_at', NULL), v_perms);
  UPDATE public.users SET trial_status = 'converted', approved_at = coalesce(r.approved_at, now())
   WHERE id = p_user_id;

  UPDATE public.pro_upgrade_requests
     SET status = 'closed', close_reason = 'converted', closed_at = now(), closed_by = p_actor
   WHERE user_id = p_user_id AND status = 'open';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor, v_main, p_user_id, 'user_approved',
     jsonb_build_object('package_type', r.package_type, 'trial_status', r.trial_status),
     jsonb_build_object('package_type', 'premium', 'trial_status', 'converted'),
     jsonb_build_object('source', 'trial_convert_to_pro', 'premium_outcome', v_outcome,
                        'modules', to_jsonb(v_enabled), 'closed_pro_requests', v_closed));
  INSERT INTO public.trial_admin_events (actor_admin_id, target_user_id, action, old_value, new_value)
    VALUES (p_actor, p_user_id, 'converted_to_pro',
            jsonb_build_object('trial_status', r.trial_status, 'package_type', r.package_type),
            jsonb_build_object('trial_status', 'converted', 'package_type', 'premium', 'modules', to_jsonb(v_enabled)));
  RETURN jsonb_build_object('ok', true, 'premium_outcome', v_outcome, 'tenant_id', r.tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[]) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- DOĞRULAMA (salt-okunur): pg_get_functiondef('public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])'::regprocedure) LIKE '%TR412%' → t.
-- GERİ ALMA (yalnız Owner kararıyla): 20280101000000 §12 gövdesi yeniden uygulanır.
