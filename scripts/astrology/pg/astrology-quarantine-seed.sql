-- GA-P2-05 (yalnız yerel geçici PG; SENTETİK): karantina migration'ının İLK uygulamasından sonra satır ekler.
-- Ardından migration iki kez daha uygulanır; astrology-quarantine-reapply-assert.sql satırın aynen korunduğunu doğrular.
SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u uuid := 'c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9';
  r jsonb; p uuid;
BEGIN
  r := public.astro_profile_create(ta, u, NULL, 'PQ yeniden uygulama', '1990-01-01', NULL, false, 'unknown', NULL, 'Bursa', 40.2, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-01-01T09:00:00Z');
  p := (r->>'profile_id')::uuid;
  INSERT INTO public.astro_provider_quarantine (id, tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, error_codes, raw_response, context, created_at, expires_at)
  VALUES ('5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e', ta, u, p, 1, 'western.natal', 'roxy', '/astrology/natal-chart', 'astro-roxy-natal-1', repeat('5', 64), 'invalid_response',
          ARRAY['planets: eksik'], '{"planets":[{"name":"Sun"}],"meta":{"k":1}}', '{"selectionTechnique":"western.natal","options":{"houseSystem":"placidus"},"unit":{}}',
          '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z');
END $$;
RESET ROLE;
CREATE TABLE IF NOT EXISTS public._pq_seed_before AS
SELECT md5(row_to_json(q)::text) AS fp FROM public.astro_provider_quarantine q WHERE id = '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e';
