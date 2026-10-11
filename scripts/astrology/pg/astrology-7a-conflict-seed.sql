-- ASTROLOJİ AŞAMA 7A — FAIL-CLOSED senaryosu (yalnız yerel; SENTETİK). ESKİ şemada (tenant kapsamlı)
-- mümkün olan çapraz-uzman kayıt: U1'in sinastri sonucunda karşı taraf U2'nin profili.
-- 20271101000300 bu veriyle UYGULANMAMALI (hiçbir satırı silmeden/değiştirmeden durmalı).
-- Çalıştırıcı: scripts/astrology/pg/expect-migration-fail.mjs

DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u1 uuid := '71717171-7171-4171-8171-717171717171';
  u2 uuid := '72727272-7272-4272-8272-727272727272';
  r jsonb; p1 uuid; p2 uuid;
BEGIN
  r := public.astro_profile_create(ta, u1, NULL, 'U1 profili', '1990-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1990-01-01T10:00:00Z');
  p1 := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u2, NULL, 'U2 profili', '1980-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1980-01-01T10:00:00Z');
  p2 := (r->>'profile_id')::uuid;
  INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider,
    provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
  VALUES (gen_random_uuid(), ta, p1, 1, p2, 1, 'western.synastry', 'roxy', 'v2', 'a', '/astrology/synastry', '{}', repeat('9', 64), '{}', '{}', 's', 'p', u1);
END
$$;
