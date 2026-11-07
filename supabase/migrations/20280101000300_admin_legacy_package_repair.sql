-- =============================================================================
-- ÜYE YÖNETİMİ H2 — ESKİ KAYIT PAKET ONARIMI (yalnız owner, açık işlemle)
-- =============================================================================
-- Sorun: eski (3 günlük keşif dönemi) akışla "onaylı + aktif" kalmış ama paketi Premium OLMAYAN uzman
-- (package_type/plan = 'trial' vb., trial_kind NULL) hiçbir yoldan düzeltilemiyordu:
--   · admin_approve_expert_with_modules yalnız pending/rejected kabul eder (UY002 "zaten onayli"),
--   · admin_trial_convert_to_pro yalnız 7 günlük deneme (trial_kind NOT NULL) kabul eder (TR404),
--   · "Aktif Yap" yalnız pasif hesapta işe yarar; modül anahtarları paket olmadan erişim vermez.
--
-- Bu RPC o hesabı, owner AÇIKÇA istediğinde, mevcut Premium sözleşmesiyle (yh_grade_expert_premium)
-- ücretli Pro üyeliğe geçirir. KENDİLİĞİNDEN hiçbir hesaba uygulanmaz; migration hiçbir satırı değiştirmez.
--   · Yalnız ana yönetici (is_super_admin) çalıştırabilir; aktör DB'de yeniden doğrulanır.
--   · Hedef: uzman, demo değil, onaylı, AKTİF, trial_kind NULL, paketi premium DEĞİL.
--   · Bayat ekran koruması: yöneticinin gördüğü paket türü (p_expected_package) kilit altında karşılaştırılır.
--   · En az bir modül zorunlu; Astroloji seçiliyse teknik izinleri aynı işlemde yazılır.
--   · Deneme tarihçesi (trial_started_at / trial_ends_at) ve ilk onay tarihi DEĞİŞMEZ; user_id + tenant aynı
--     kalır (danışan / analiz kayıtları korunur). Eski oturumlar kapatılır (yeni paket bir sonraki girişte).
--   · Audit aynı işlemde: admin_audit_log 'user_approved', context.source = 'legacy_package_repair'.
-- Yalnız service_role çalıştırabilir.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_repair_legacy_expert_to_pro(
  p_actor_admin_id   uuid,
  p_user_id          uuid,
  p_modules          jsonb,
  p_remove_keys      text[],
  p_expected_package text,
  p_astrology_grants jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor    public.users%ROWTYPE;
  v_target   public.users%ROWTYPE;
  v_token    text;
  v_current  text;
  v_perms    jsonb;
  v_enabled  text[];
  v_outcome  text;
  v_revoked  integer;
  v_astro    boolean;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL OR p_expected_package IS NULL THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: eksik parametre' USING ERRCODE = 'UY003';
  END IF;

  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE
     OR coalesce(v_actor.is_super_admin, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: yalniz ana yonetici' USING ERRCODE = '42501';
  END IF;

  IF NOT public.admin_module_map_is_valid(p_modules) THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: gecersiz modul haritasi' USING ERRCODE = 'UY003';
  END IF;
  SELECT coalesce(array_agg(e.key ORDER BY e.key), '{}'::text[]) INTO v_enabled
    FROM jsonb_each(p_modules) e WHERE e.value = 'true'::jsonb;
  IF coalesce(array_length(v_enabled, 1), 0) = 0 THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: en az bir modul secilmeli' USING ERRCODE = 'UY003';
  END IF;
  v_astro := (p_modules -> 'astrology') = 'true'::jsonb;
  IF v_astro AND NOT public.astrology_technique_grants_is_valid(p_astrology_grants) THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: astroloji teknik izinleri gerekli' USING ERRCODE = 'UY003';
  END IF;
  IF NOT v_astro AND p_astrology_grants IS NOT NULL AND jsonb_typeof(p_astrology_grants) <> 'null' THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: astroloji secilmeden teknik izni verilemez' USING ERRCODE = 'UY003';
  END IF;

  -- Eşzamanlılık: hedef satırı kilitle (onay / aktiflik / modül / deneme işlemleriyle serileşir).
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;

  -- Paket türü: uygulama katmanıyla AYNI kural (resolveMembershipPackageType: package_type, yoksa plan).
  v_token := lower(btrim(coalesce(nullif(btrim(v_target.package_type), ''), nullif(btrim(v_target.plan), ''), '')));
  v_current := CASE
    WHEN v_token IN ('trial', 'deneme') THEN 'trial'
    WHEN v_token = 'pro' THEN 'pro'
    WHEN v_token = 'premium' THEN 'premium'
    ELSE '' END;

  IF lower(coalesce(v_target.role,'')) <> 'expert'
     OR coalesce(v_target.is_demo_account, false)
     OR lower(coalesce(v_target.approval_status,'')) <> 'approved'
     OR v_target.active IS NOT TRUE
     OR v_target.trial_kind IS NOT NULL
     OR v_current = 'premium' THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: hesap eski paket onarimina uygun degil' USING ERRCODE = 'UY002';
  END IF;
  -- Bayat ekran koruması.
  IF v_current <> lower(btrim(p_expected_package)) THEN
    RAISE EXCEPTION 'admin_repair_legacy_expert_to_pro: guncel paket durumu degismis' USING ERRCODE = 'UY001';
  END IF;

  v_perms := (coalesce(v_target.module_permissions, '{}'::jsonb) - coalesce(p_remove_keys, '{}'::text[]))
             || p_modules;

  -- Premium + seçilen modüller + YH kuralı (mevcut sözleşme). trial_* anahtarı GÖNDERİLMEZ → deneme
  -- tarihçesi aynen kalır.
  v_outcome := public.yh_grade_expert_premium(p_user_id, jsonb_build_object(
    'package_type', 'premium', 'plan', 'premium',
    'membership_status', 'active', 'subscription_status', 'active',
    'membership_started_at', now(), 'membership_ends_at', NULL), v_perms);

  -- İlk onay tarihini koru (yh_grade now() yazar).
  UPDATE public.users SET approved_at = coalesce(v_target.approved_at, now()) WHERE id = p_user_id;

  IF v_astro THEN
    PERFORM public.admin_set_astrology_technique_grants(p_user_id, p_actor_admin_id, p_astrology_grants, false);
  END IF;

  v_revoked := public.admin_revoke_user_sessions_tx(p_user_id, 'admin_approval_reset');

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, true, p_user_id, 'user_approved',
     jsonb_build_object('package_type', v_target.package_type, 'plan', v_target.plan),
     jsonb_build_object('package_type', 'premium', 'plan', 'premium'),
     jsonb_build_object('source', 'legacy_package_repair', 'premium_outcome', v_outcome,
                        'modules', to_jsonb(v_enabled), 'module_count', array_length(v_enabled, 1),
                        'revoked_session_count', v_revoked));

  RETURN jsonb_build_object('ok', true, 'premium_outcome', v_outcome, 'modules', to_jsonb(v_enabled),
                            'module_count', array_length(v_enabled, 1), 'revoked_session_count', v_revoked,
                            'tenant_id', v_target.tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_repair_legacy_expert_to_pro(uuid, uuid, jsonb, text[], text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_repair_legacy_expert_to_pro(uuid, uuid, jsonb, text[], text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
