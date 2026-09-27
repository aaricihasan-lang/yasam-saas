-- INFRA 1100 fixture: prod'daki açık grant durumunu taklit eder.
-- A) RLS+policy var ama anon/authenticated grant açık.
CREATE TABLE IF NOT EXISTS public.client_charges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid);
CREATE TABLE IF NOT EXISTS public.client_combinations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid);
CREATE TABLE IF NOT EXISTS public.combinations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid);
CREATE TABLE IF NOT EXISTS public.security_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE IF NOT EXISTS public.support_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), body text);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_charges','client_combinations','combinations','security_events','support_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;
-- C) repo'da RLS kapalı + anon SELECT açık bırakılanlar (user_payment_history bilinçli YOK → skip yolu).
CREATE TABLE IF NOT EXISTS public.video_transcription_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid);
CREATE TABLE IF NOT EXISTS public.video_training_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid);
CREATE TABLE IF NOT EXISTS public.personal_archive_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, file_name text);
GRANT SELECT ON public.video_transcription_jobs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_training_records TO anon, authenticated;
GRANT SELECT ON public.personal_archive_files TO anon, authenticated;
-- Kolon düzeyi grant (tablo REVOKE'undan bağımsız kalır).
GRANT SELECT (file_name) ON public.personal_archive_files TO anon;
-- B) yedek tabloları (PUBLIC grant dahil). _bak_hacamat_rules_20260926 bilinçli YOK → skip yolu.
CREATE TABLE IF NOT EXISTS public._bak_users_modperm_20260926 (id uuid, module_permissions jsonb);
CREATE TABLE IF NOT EXISTS public._bak_users_modperm_cosmic_preapply_20260926 (id uuid, module_permissions jsonb);
GRANT SELECT ON public._bak_users_modperm_20260926 TO PUBLIC;
GRANT SELECT ON public._bak_users_modperm_cosmic_preapply_20260926 TO anon, authenticated;
