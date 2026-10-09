-- ASTROLOJİ AŞAMA 7A — YÜKSELTME SENARYOSU TOHUMU (yalnız yerel embedded-postgres; SENTETİK veri).
-- 20271101000000/000100/000200 uygulanmış ESKİ şemaya (owner_user_id yok, danışan FK CASCADE) eski
-- RPC'lerle veri yazar ve kayıtlı analizlerin parmak izini public._astro7a_baseline'a koyar.
-- Ardından 20271101000300 uygulanır; astrology-7a-upgrade-assert.sql verinin korunduğunu doğrular.

CREATE TABLE IF NOT EXISTS public._astro7a_baseline (k text PRIMARY KEY, v text NOT NULL);

DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u1 uuid := '71717171-7171-4171-8171-717171717171';
  c_ali uuid := '11111111-1111-4111-8111-111111111111';
  c_y   uuid := '55555555-5555-4555-8555-555555555555';
  r jsonb; p1 uuid; p2 uuid;
  r1 uuid := 'a7a7a7a7-0001-4a7a-8a7a-a7a7a7a7a7a1';
  r2 uuid := 'a7a7a7a7-0002-4a7a-8a7a-a7a7a7a7a7a2';
BEGIN
  r := public.astro_profile_create(ta, u1, c_ali, 'Sentetik Ali — natal', '1990-07-15', '14:30', true, 'exact_record', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T11:30:00Z');
  p1 := (r->>'profile_id')::uuid;
  PERFORM public.astro_profile_append_revision(ta, u1, p1, 1, '1990-07-15', '14:40', true, 'rectified', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T11:40:00Z', 'rektifikasyon');
  r := public.astro_profile_create(ta, u1, c_y, 'Sentetik Y — karşı taraf', '1988-03-21', '06:45', true, 'exact_record', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1988-03-21T04:45:00Z');
  p2 := (r->>'profile_id')::uuid;

  INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, technique, provider, provider_api_version, adapter_version,
    endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
  VALUES (r1, ta, p1, 2, 'western.natal', 'roxy', 'v2', 'a', '/astrology/natal-chart', '{"x":1}', repeat('1', 64), '{"raw":1}', '{"bodies":[]}', 's', 'p', u1);
  INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider,
    provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
  VALUES (r2, ta, p1, 2, p2, 1, 'western.synastry', 'roxy', 'v2', 'a', '/astrology/synastry', '{"x":2}', repeat('2', 64), '{"raw":2}', '{"aspects":[]}', 's', 'p', u1);
  INSERT INTO public.astro_provider_interpretations (tenant_id, result_id, provider, lang, content_schema, projection_version, content)
  VALUES (ta, r1, 'roxy', 'tr', 'i', 'p', '{"summary":"sentetik yorum"}');

  INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body)
  VALUES (ta, u1, 'western', 'planet_in_house:saturn:7', 'Satürn 7', 'sentetik KB notu');
  INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, section_key, body)
  VALUES (ta, u1, p1, 'western.natal', 'overall', 'sentetik çalışma notu');

  PERFORM public.astro_analysis_save_v2(ta, u1, p1, 2, NULL, NULL, ARRAY[r1], 'western.natal', 'Ali natal', 'b7b7b7b7-0001-4b7b-8b7b-b7b7b7b7b7b1',
    '{}', '{"label":"Sentetik Ali — natal","client":{"name":"Ali A"}}', '{"houseSystem":"placidus"}', '{"bodies":[]}', '[{"entryId":"x"}]', true,
    '{"provider":"roxy","content":{"summary":"sentetik yorum"}}', '{"provider":"roxy"}', '[{"section_key":"overall","body":"kayıt anı notu"}]');
  PERFORM public.astro_analysis_save_v2(ta, u1, p1, 2, p2, 1, ARRAY[r2], 'western.synastry', 'Ali & Y sinastri', 'b7b7b7b7-0002-4b7b-8b7b-b7b7b7b7b7b2',
    '{"partnerProfileId":"x"}', '{"label":"Sentetik Ali — natal","partner":{"label":"Sentetik Y"}}', '{}', '{"aspects":[]}', '[]', false, NULL, '{}', '[]');

  INSERT INTO public._astro7a_baseline (k, v)
  SELECT 'analyses', string_agg(md5(id::text || profile_snapshot::text || method_snapshot::text || technical_snapshot::text
           || coalesce(provider_interp_snapshot::text, '-') || kb_snapshot::text || versions_snapshot::text || title), ',' ORDER BY id)
    FROM public.astro_analyses
  ON CONFLICT (k) DO NOTHING;
  INSERT INTO public._astro7a_baseline (k, v)
  SELECT 'counts', concat_ws('|',
    (SELECT count(*) FROM public.astro_birth_profiles), (SELECT count(*) FROM public.astro_birth_profile_revisions),
    (SELECT count(*) FROM public.astro_provider_results), (SELECT count(*) FROM public.astro_provider_interpretations),
    (SELECT count(*) FROM public.astro_kb_entries), (SELECT count(*) FROM public.astro_expert_notes),
    (SELECT count(*) FROM public.astro_analyses), (SELECT count(*) FROM public.astro_analysis_notes))
  ON CONFLICT (k) DO NOTHING;
  INSERT INTO public._astro7a_baseline (k, v)
  SELECT 'results', string_agg(md5(id::text || input_hash || technical::text || raw_response::text), ',' ORDER BY id) FROM public.astro_provider_results
  ON CONFLICT (k) DO NOTHING;
END
$$;
