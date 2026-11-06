-- =============================================================================
-- TRIAL7 — tek deneme hakkı kaydı saklama süresi (Owner kararı 2026-11-07)
-- =============================================================================
-- public.trial_claims satırları (kanonik e-postanın HMAC özeti) oluşturulma tarihinden itibaren
-- 24 AY saklanır; süresi dolanlar aylık periyodik imha işiyle (Inngest trial-claims-retention-purge)
-- SİLİNİR. 24 ay sonra aynı kişi yeniden ücretsiz deneme alabilir (Owner kabulü).
--
-- Kapsam: YALNIZ public.trial_claims. users / tenants / danışan / analiz / diğer deneme tabloları
-- (trial_profiles, trial_credit_ledger, pro_upgrade_requests) bu fonksiyonla DEĞİŞMEZ.
-- Süre fonksiyonda SABİTTİR (çağıran değiştiremez). p_dry_run varsayılanı true (yalnız sayım).
-- Yalnız service_role çalıştırabilir. İdempotent (CREATE OR REPLACE / IF NOT EXISTS).
-- =============================================================================
BEGIN;

CREATE INDEX IF NOT EXISTS trial_claims_claimed_at_idx ON public.trial_claims (claimed_at);

CREATE OR REPLACE FUNCTION public.trial_claims_retention_purge(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cut timestamptz := now() - interval '24 months';
  v_n   bigint;
BEGIN
  IF coalesce(p_dry_run, true) THEN
    SELECT count(*) INTO v_n FROM public.trial_claims WHERE claimed_at < v_cut;
  ELSE
    DELETE FROM public.trial_claims WHERE claimed_at < v_cut;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object(
    'dry_run', coalesce(p_dry_run, true), 'retention_months', 24, 'claims', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.trial_claims_retention_purge(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_claims_retention_purge(boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
