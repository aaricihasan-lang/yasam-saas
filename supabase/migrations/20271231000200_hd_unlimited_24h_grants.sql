-- HUMAN DESIGN — 24 saatlik geçici sınırsız kullanım izni (owner talimatı 05.11.2026).
--
-- Kapsam: YALNIZ hd-roxy-user (20/saat) ve hd-roxy-tenant (100/gün) hacim kotalarının, seçilen tek uzman için 24 saatlik
-- istisnası (BodyGraph + Connection + Penta route'ları). Inflight kilitleri, sağlayıcı ve diğer modüller DEĞİŞMEZ.
--
-- Tasarım:
--   • hd_unlimited_grants: her izin = granted_at .. granted_at + 24 saat (CHECK ile sabit; süre seçeneği YOK).
--     Süre bitince satır kendiliğinden geçersiz sayılır (expires_at > now()); zamanlanmış görev YOK.
--   • hd_unlimited_grant_audit: her deneme (granted / already_active / ineligible / forbidden) — uzman, owner, açılış,
--     bitiş, sonuç. Kullanıcıya açık değildir.
--   • hd_unlimited_grant_24h(): TEK yazma yolu. Owner (is_super_admin + admin + aktif + demo değil) ve hedef uzman
--     (expert + aktif + onaylı + demo değil + tenant) DB'de yeniden doğrulanır; kullanıcı başına danışma kilidi altında
--     aktif izin varsa SÜRE UZATILMAZ (mevcut izin döner). Zaman kaynağı veritabanı saati (now(), UTC).
--   • Erişim: anon/authenticated tamamen kapalı; service_role yalnız SELECT + fonksiyon EXECUTE.
-- Geri alma (PR açıklamasında ayrıca): DROP FUNCTION public.hd_unlimited_grant_24h(uuid, uuid);
--   DROP TABLE public.hd_unlimited_grant_audit; DROP TABLE public.hd_unlimited_grants;  (kod önce geri alınmalı / tablo yoksa
--   kontrol fail-closed → normal sınırlar uygulanır).

BEGIN;

CREATE TABLE IF NOT EXISTS public.hd_unlimited_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  granted_by uuid NOT NULL REFERENCES public.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT hd_unlimited_grants_exactly_24h CHECK (expires_at = granted_at + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS hd_unlimited_grants_user_exp_idx ON public.hd_unlimited_grants (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.hd_unlimited_grant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  result text NOT NULL CHECK (result IN ('granted', 'already_active', 'ineligible', 'forbidden')),
  grant_id uuid,
  granted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hd_unlimited_grant_audit_target_idx ON public.hd_unlimited_grant_audit (target_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.hd_unlimited_grant_24h(p_user_id uuid, p_actor_id uuid)
RETURNS TABLE (out_status text, out_granted_at timestamptz, out_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_actor record;
  v_target record;
  v_grant record;
BEGIN
  IF p_user_id IS NULL OR p_actor_id IS NULL THEN
    RETURN QUERY SELECT 'ineligible'::text, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;
  -- Aynı uzmana eşzamanlı iki tık → tek izin (ikincisi already_active).
  PERFORM pg_advisory_xact_lock(hashtextextended('hd_unlimited_grant:' || p_user_id::text, 0));

  SELECT u.role, u.active, u.is_super_admin, u.is_demo_account INTO v_actor FROM public.users u WHERE u.id = p_actor_id;
  IF NOT FOUND OR v_actor.is_super_admin IS NOT TRUE OR lower(coalesce(v_actor.role, '')) <> 'admin'
     OR v_actor.active IS NOT TRUE OR coalesce(v_actor.is_demo_account, false) THEN
    INSERT INTO public.hd_unlimited_grant_audit (target_user_id, actor_user_id, result) VALUES (p_user_id, p_actor_id, 'forbidden');
    RETURN QUERY SELECT 'forbidden'::text, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT u.role, u.active, u.approval_status, u.is_demo_account, u.tenant_id INTO v_target FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND OR lower(coalesce(v_target.role, '')) <> 'expert' OR v_target.active IS NOT TRUE
     OR coalesce(v_target.approval_status, '') <> 'approved' OR coalesce(v_target.is_demo_account, false) OR v_target.tenant_id IS NULL THEN
    INSERT INTO public.hd_unlimited_grant_audit (target_user_id, actor_user_id, result) VALUES (p_user_id, p_actor_id, 'ineligible');
    RETURN QUERY SELECT 'ineligible'::text, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT g.id, g.granted_at, g.expires_at INTO v_grant
    FROM public.hd_unlimited_grants g
   WHERE g.user_id = p_user_id AND g.tenant_id = v_target.tenant_id AND g.expires_at > v_now
   ORDER BY g.expires_at DESC
   LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.hd_unlimited_grant_audit (target_user_id, actor_user_id, result, grant_id, granted_at, expires_at)
    VALUES (p_user_id, p_actor_id, 'already_active', v_grant.id, v_grant.granted_at, v_grant.expires_at);
    RETURN QUERY SELECT 'already_active'::text, v_grant.granted_at, v_grant.expires_at;
    RETURN;
  END IF;

  INSERT INTO public.hd_unlimited_grants (user_id, tenant_id, granted_by, granted_at, expires_at)
  VALUES (p_user_id, v_target.tenant_id, p_actor_id, v_now, v_now + interval '24 hours')
  RETURNING id, granted_at, expires_at INTO v_grant;
  INSERT INTO public.hd_unlimited_grant_audit (target_user_id, actor_user_id, result, grant_id, granted_at, expires_at)
  VALUES (p_user_id, p_actor_id, 'granted', v_grant.id, v_grant.granted_at, v_grant.expires_at);
  RETURN QUERY SELECT 'granted'::text, v_grant.granted_at, v_grant.expires_at;
END;
$$;

-- Erişim kilidi: istemci rolleri hiçbir şeye erişemez; sunucu (service_role) yalnız okur ve fonksiyonu çağırır.
REVOKE ALL PRIVILEGES ON public.hd_unlimited_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON public.hd_unlimited_grant_audit FROM PUBLIC, anon, authenticated;
ALTER TABLE public.hd_unlimited_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hd_unlimited_grant_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hd_unlimited_grants TO service_role;
GRANT SELECT ON public.hd_unlimited_grant_audit TO service_role;
REVOKE ALL ON FUNCTION public.hd_unlimited_grant_24h(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hd_unlimited_grant_24h(uuid, uuid) TO service_role;

COMMIT;
