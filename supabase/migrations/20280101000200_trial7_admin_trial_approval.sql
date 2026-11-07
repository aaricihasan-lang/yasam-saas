-- =============================================================================
-- TRIAL7 — YÖNETİCİ ONAYLI 7 GÜNLÜK DENEME (Owner kararı 2026-11-07)
-- =============================================================================
-- Otomatik kayıt (TRIAL_SELF_SIGNUP_ENABLED) KAPALI kalır. Başvuru mevcut akışla pending oluşur;
-- yönetici AÇIKÇA "7 Günlük Denemeyi Onayla" seçerse bu RPC hesabı mevcut deneme rejimine
-- (trial_kind='self_7d', trial_status='not_started', tarihler BOŞ) geçirir. Süre ilk başarılı
-- girişte mevcut trial_activate_on_login ile başlar (168 saat). Premium VERİLMEZ.
--
-- Tek deneme hakkı: kanonik e-postanın HMAC özeti (uygulama hesaplar) public.trial_claims'e onayla
-- AYNI işlemde yazılır. Son 24 ay içinde kullanılmış hak → TR410 (hesap değişmez, pending kalır).
-- 24 ayı geçmiş (aylık imha işinin henüz silmediği) kayıt hakkı engellemez. Ret / onaylanmayan
-- başvuru hakkı TÜKETMEZ. Eşzamanlı iki onay: hedef satır kilidi + trial_claims PK → tek kazanan.
--
-- Mevcut Pro (Premium) onayı (admin_approve_expert_with_modules) DEĞİŞMEZ. Mevcut hesaplara toplu
-- işlem YOK. Yalnız service_role çalıştırabilir; aktör DB'de yeniden doğrulanır.
-- =============================================================================
BEGIN;

-- trial_admin_events: yeni olay türü (süperset; mevcut değerler aynen).
ALTER TABLE public.trial_admin_events DROP CONSTRAINT IF EXISTS trial_admin_events_action_check;
ALTER TABLE public.trial_admin_events ADD CONSTRAINT trial_admin_events_action_check CHECK (action IN (
  'limits_changed','review_started','review_cleared','trial_suspended',
  'trial_resumed','converted_to_pro','pro_request_dismissed','trial_approved'));

CREATE OR REPLACE FUNCTION public.admin_approve_expert_trial(
  p_actor uuid, p_user_id uuid, p_expected_approval text, p_claim_hash text, p_modules jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_main    boolean;
  r         public.users%ROWTYPE;
  v_prior   text;
  v_claimed text;
  v_revoked integer;
BEGIN
  v_main := public.trial_assert_admin(p_actor);
  IF p_user_id IS NULL OR p_claim_hash IS NULL OR p_claim_hash !~ '^[A-Za-z0-9:_-]{8,200}$' THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: gecersiz girdi' USING ERRCODE = 'TR400';
  END IF;
  -- Deneme modülleri: yalnız deneme allowlist'i (Dijital İçerik ailesi vb. ASLA), en az bir modül.
  IF p_modules IS NULL OR jsonb_typeof(p_modules) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_each(p_modules) e
                 WHERE jsonb_typeof(e.value) <> 'boolean'
                    OR (e.value = 'true'::jsonb AND NOT (e.key = ANY (public.trial_allowed_module_keys()))))
     OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_modules) e WHERE e.value = 'true'::jsonb) THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: gecersiz deneme modulleri' USING ERRCODE = 'TR400';
  END IF;

  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: kullanici bulunamadi' USING ERRCODE = 'TR404';
  END IF;
  IF lower(coalesce(r.role, '')) <> 'expert' OR coalesce(r.is_demo_account, false) THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: hedef deneme icin uygun degil' USING ERRCODE = 'TR409';
  END IF;
  IF r.trial_kind IS NOT NULL OR lower(coalesce(r.package_type, '')) = 'premium' THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: hesap zaten deneme veya Pro' USING ERRCODE = 'TR409';
  END IF;
  v_prior := lower(coalesce(r.approval_status, ''));
  IF v_prior NOT IN ('pending', '', 'rejected') THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: hesap zaten onayli' USING ERRCODE = 'TR409';
  END IF;
  -- Bayat ekran koruması (mevcut onay RPC'siyle aynı sözleşme).
  IF coalesce(p_expected_approval, '') NOT IN ('pending', 'rejected')
     OR (CASE WHEN v_prior = '' THEN 'pending' ELSE v_prior END) <> p_expected_approval THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: guncel onay durumu degismis' USING ERRCODE = 'UY001';
  END IF;

  -- Tek deneme hakkı (24 ay). Süresi dolmuş kayıt hakkı engellemez.
  DELETE FROM public.trial_claims
   WHERE claim_hash = p_claim_hash AND claimed_at < now() - interval '24 months';
  INSERT INTO public.trial_claims (claim_hash, first_user_id)
    VALUES (p_claim_hash, p_user_id)
    ON CONFLICT (claim_hash) DO NOTHING
    RETURNING claim_hash INTO v_claimed;
  IF v_claimed IS NULL THEN
    RAISE EXCEPTION 'admin_approve_expert_trial: tek deneme hakki kullanilmis' USING ERRCODE = 'TR410';
  END IF;

  -- Deneme paketi: Premium YOK; süre ilk başarılı girişte başlar (tarihler boş).
  UPDATE public.users SET
    active                     = true,
    approval_status            = 'approved',
    approved_at                = coalesce(r.approved_at, now()),
    package_type               = 'trial',
    plan                       = 'trial',
    subscription_status        = 'trial',
    membership_status          = 'trial',
    trial_started_at           = NULL,
    trial_ends_at              = NULL,
    trial_kind                 = 'self_7d',
    trial_status               = 'not_started',
    module_permissions         = coalesce(r.module_permissions, '{}'::jsonb) || p_modules,
    astrology_technique_grants = '{"mode":"all"}'::jsonb
  WHERE id = p_user_id;

  INSERT INTO public.trial_profiles (user_id, claim_hash)
    VALUES (p_user_id, p_claim_hash)
    ON CONFLICT (user_id) DO UPDATE SET claim_hash = EXCLUDED.claim_hash, updated_at = now();

  -- Onay öncesi kalmış oturumlar canlanmasın (mevcut onay akışıyla aynı).
  v_revoked := public.admin_revoke_user_sessions_tx(p_user_id, 'admin_approval_reset');

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor, v_main, p_user_id, 'user_approved',
     jsonb_build_object('approval_status', r.approval_status, 'active', r.active, 'package_type', r.package_type),
     jsonb_build_object('approval_status', 'approved', 'active', true, 'package_type', 'trial'),
     jsonb_build_object('source', 'trial_approval', 'trial_kind', 'self_7d',
                        'reapproval', v_prior = 'rejected', 'revoked_session_count', v_revoked));
  INSERT INTO public.trial_admin_events (actor_admin_id, target_user_id, action, old_value, new_value)
    VALUES (p_actor, p_user_id, 'trial_approved',
            jsonb_build_object('approval_status', r.approval_status),
            jsonb_build_object('trial_status', 'not_started'));

  RETURN jsonb_build_object('ok', true, 'trial_status', 'not_started', 'revoked_session_count', v_revoked);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_expert_trial(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_expert_trial(uuid, uuid, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
