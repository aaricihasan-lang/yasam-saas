-- =============================================================================
-- 20270107000000_admin_membership_atomic_rpcs.sql   [EXPAND — CODE DEPENDENCY]
--
-- ÜYE YÖNETİMİ AŞAMA 1 — ATOMİKLİK & EŞZAMANLILIK.
--
-- AMAÇ: Üyelik durum değişikliği (approve/reject/deactivate/activate/archive) ile ZORUNLU
--   admin_audit_log kaydını TEK PostgreSQL transaction'ında birleştiren dar-yetkili RPC'ler.
--   Audit yazılamazsa (ör. CHECK ihlali) hesap değişikliği de COMMIT EDİLMEZ → "durum değişti ama
--   audit yok" ayrışması İMKÂNSIZ. Uygulama seviyesi telafi/rollback ve TOCTOU snapshot ezmesi
--   kaldırılır. Eşzamanlılık: her RPC hedef satırı `FOR UPDATE` ile kilitler → onay/ret/pasif/aktif
--   işlemleri serileşir; araya giren işlem eski snapshot/telafi ile geri alınamaz.
--
-- KORUNAN SÖZLEŞMELER:
--   * yh_grade_expert_premium(uuid,jsonb,jsonb) DEĞİŞMEZ; approve RPC'si onu AYNI tx içinde çağırır
--     (p_module_permissions = NULL → mevcut module_permissions satır-içi KORUNUR; YH grant kuralı aynı).
--   * approved_at: ilk onay tarihi korunur (COALESCE(mevcut, now())) — tx İÇİNDE, kilitli satırda.
--   * Owner / son-aktif-admin / self / admin-hedef korumaları UYGULAMA katmanında (route) KALIR;
--     RPC ek olarak aktörün admin+aktif olduğunu DB'de doğrular (istemci bayrağına güvenilmez).
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + YALNIZ service_role EXECUTE (PUBLIC/anon/auth REVOKE).
--   Aktör admin+aktif DB'de doğrulanır; actor_is_main_admin users.is_super_admin'den TÜRETİLİR (parametre
--   ile GELMEZ). Yeni tablo/kolon YOK; mevcut kayıtlara DML YOK (yalnız CREATE FUNCTION + grant).
-- IDEMPOTENT: CREATE OR REPLACE + guard'lı REVOKE/GRANT.
-- UYGULAMA: Supabase Dashboard SQL Editor (AYRI ONAY). Bu turda UYGULANMAZ.
-- DEPLOY SIRASI (ZORUNLU): ÖNCE bu migration apply, SONRA RPC'leri çağıran kod deploy
--   (yoksa route 42883 undefined_function alır — fail-closed, kısmi yazım YOK).
-- =============================================================================

BEGIN;

-- ── Ortak aktör doğrulaması: admin + aktif; ana-admin bayrağını is_super_admin'den türet ──
-- (Her RPC içinde inline; ayrı yardımcı fonksiyon eklemeden basit tutuldu.)

-- 1) ONAYLA → OTOMATİK PREMIUM (atomik: kilit + premium/YH + approved_at koru + audit) ──────
CREATE OR REPLACE FUNCTION public.admin_approve_expert_premium(
  p_user_id         uuid,
  p_membership      jsonb,
  p_actor_admin_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor  public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_actor_main boolean;
  v_prior_approval text;
  v_prior_active boolean;
  v_prior_pkg text;
  v_prior_approved_at timestamptz;
  v_outcome text;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_approve_expert_premium: id/aktor null';
  END IF;

  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_approve_expert_premium: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  -- Eşzamanlılık: hedef satırı kilitle (approve/reject/toggle/archive serileşir).
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_approve_expert_premium: kullanici bulunamadi';
  END IF;
  v_prior_approval    := v_target.approval_status;
  v_prior_active      := v_target.active;
  v_prior_pkg         := v_target.package_type;
  v_prior_approved_at := v_target.approved_at;

  -- Premium + YH + izin KORUMA (NULL → satır-içi module_permissions korunur; TOCTOU yok). AYNI tx.
  v_outcome := public.yh_grade_expert_premium(p_user_id, p_membership, NULL);

  -- İlk onay tarihini koru (yh_grade approved_at'i now() yaptı).
  UPDATE public.users SET approved_at = COALESCE(v_prior_approved_at, now()) WHERE id = p_user_id;

  -- Zorunlu audit — AYNI tx. Başarısızsa (CHECK vb.) TÜM işlem ROLLBACK.
  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id, 'user_approved',
     jsonb_build_object('approval_status', v_prior_approval, 'active', v_prior_active, 'package_type', v_prior_pkg),
     jsonb_build_object('approval_status','approved','active',true,'package_type','premium'),
     jsonb_build_object('premium_outcome', v_outcome));

  RETURN jsonb_build_object('ok', true, 'premium_outcome', v_outcome);
END;
$$;

-- 2) REDDET (atomik: kilit + rejected/inactive + audit; approved_at KORUNUR) ─────────────────
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
  v_prior_approval text;
  v_prior_active boolean;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_reject_user: id/aktor null';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_reject_user: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_reject_user: kullanici bulunamadi';
  END IF;
  v_prior_approval := v_target.approval_status;
  v_prior_active   := v_target.active;

  UPDATE public.users SET approval_status = 'rejected', active = false WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id, 'user_rejected',
     jsonb_build_object('approval_status', v_prior_approval, 'active', v_prior_active),
     jsonb_build_object('approval_status','rejected','active',false));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3) PASİFE AL / AKTİFLEŞTİR (atomik: kilit + active + audit) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  p_user_id        uuid,
  p_actor_admin_id uuid,
  p_active         boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor  public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_actor_main boolean;
  v_prior_active boolean;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'admin_set_user_active: parametre null';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_set_user_active: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_user_active: kullanici bulunamadi';
  END IF;
  v_prior_active := v_target.active;

  UPDATE public.users SET active = p_active WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id,
     CASE WHEN p_active THEN 'user_activated' ELSE 'user_deactivated' END,
     jsonb_build_object('active', v_prior_active),
     jsonb_build_object('active', p_active));

  RETURN jsonb_build_object('ok', true, 'active', p_active);
END;
$$;

-- 4) ARŞİVLE (soft-delete; atomik: kilit + active=false + user_archived audit) ────────────────
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
  v_prior_active boolean;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_archive_user: id/aktor null';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_archive_user: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_archive_user: kullanici bulunamadi';
  END IF;
  v_prior_active := v_target.active;

  UPDATE public.users SET active = false WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id, 'user_archived',
     jsonb_build_object('active', v_prior_active),
     jsonb_build_object('active', false));

  RETURN jsonb_build_object('ok', true, 'active', false);
END;
$$;

-- ── Yetki: yalnız service_role EXECUTE ──────────────────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.admin_approve_expert_premium(uuid,jsonb,uuid)',
    'public.admin_reject_user(uuid,uuid)',
    'public.admin_set_user_active(uuid,uuid,boolean)',
    'public.admin_archive_user(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'admin\_%' ESCAPE '\';   -- prosecdef=t
--   SELECT has_function_privilege('service_role','public.admin_approve_expert_premium(uuid,jsonb,uuid)','EXECUTE'); -- t
--   SELECT has_function_privilege('anon','public.admin_approve_expert_premium(uuid,jsonb,uuid)','EXECUTE');         -- f
--   -- ATOMİKLİK: admin_audit_log INSERT bir CHECK/başka nedenle RAISE ederse users değişikliği de rollback olur.
--   -- EŞZAMANLILIK: her RPC hedef satırı FOR UPDATE ile kilitler → interleave/lost-update engellenir.
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.admin_approve_expert_premium(uuid,jsonb,uuid);
--   DROP FUNCTION IF EXISTS public.admin_reject_user(uuid,uuid);
--   DROP FUNCTION IF EXISTS public.admin_set_user_active(uuid,uuid,boolean);
--   DROP FUNCTION IF EXISTS public.admin_archive_user(uuid,uuid);
-- =============================================================================
