-- ASTROLOJİ AŞAMA 7A — YÜKSELTME doğrulaması (eski veri → 20271101000300). Yalnız yerel embedded-postgres.
--   • Hiçbir satır kaybolmadı / değişmedi (sayılar + snapshot ve sonuç parmak izleri AYNI).
--   • owner_user_id geri dolduruldu (profil sahibi = created_by_user_id; alt kayıtlar profilden).
--   • Önbellek tekilliği uzman kapsamlı; eski (tenant, input_hash) kısıtı yok.
--   • Danışan silinince astroloji kayıtları KORUNUR (bağ NULL olur, snapshot değişmez).

DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u1 uuid := '71717171-7171-4171-8171-717171717171';
  c_ali uuid := '11111111-1111-4111-8111-111111111111';
  base_counts text; base_an text; base_res text; now_counts text; now_an text; now_res text; n integer;
BEGIN
  SELECT v INTO base_counts FROM public._astro7a_baseline WHERE k = 'counts';
  SELECT v INTO base_an FROM public._astro7a_baseline WHERE k = 'analyses';
  SELECT v INTO base_res FROM public._astro7a_baseline WHERE k = 'results';
  IF base_counts IS NULL OR base_an IS NULL OR base_res IS NULL THEN RAISE EXCEPTION 'tohum parmak izi yok'; END IF;

  now_counts := concat_ws('|',
    (SELECT count(*) FROM public.astro_birth_profiles), (SELECT count(*) FROM public.astro_birth_profile_revisions),
    (SELECT count(*) FROM public.astro_provider_results), (SELECT count(*) FROM public.astro_provider_interpretations),
    (SELECT count(*) FROM public.astro_kb_entries), (SELECT count(*) FROM public.astro_expert_notes),
    (SELECT count(*) FROM public.astro_analyses), (SELECT count(*) FROM public.astro_analysis_notes));
  IF now_counts <> base_counts THEN RAISE EXCEPTION 'satır sayıları değişti: % → %', base_counts, now_counts; END IF;
  SELECT string_agg(md5(id::text || profile_snapshot::text || method_snapshot::text || technical_snapshot::text
           || coalesce(provider_interp_snapshot::text, '-') || kb_snapshot::text || versions_snapshot::text || title), ',' ORDER BY id)
    INTO now_an FROM public.astro_analyses;
  IF now_an <> base_an THEN RAISE EXCEPTION 'kayıtlı analiz snapshot''ı değişti'; END IF;
  SELECT string_agg(md5(id::text || input_hash || technical::text || raw_response::text), ',' ORDER BY id) INTO now_res FROM public.astro_provider_results;
  IF now_res <> base_res THEN RAISE EXCEPTION 'önbellek sonuçları değişti'; END IF;

  -- Geri doldurma.
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE owner_user_id IS DISTINCT FROM u1;
  IF n <> 0 THEN RAISE EXCEPTION 'profil sahibi geri doldurulmadı'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profile_revisions WHERE owner_user_id IS DISTINCT FROM u1;
  IF n <> 0 THEN RAISE EXCEPTION 'revizyon sahibi geri doldurulmadı'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_results WHERE owner_user_id IS DISTINCT FROM u1;
  IF n <> 0 THEN RAISE EXCEPTION 'sonuç sahibi geri doldurulmadı'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_interpretations WHERE owner_user_id IS DISTINCT FROM u1;
  IF n <> 0 THEN RAISE EXCEPTION 'yorum sahibi geri doldurulmadı'; END IF;

  -- Önbellek kısıtları.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_tenant_hash_key') THEN RAISE EXCEPTION 'eski tenant önbellek kısıtı duruyor'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_owner_hash_key') THEN RAISE EXCEPTION 'uzman önbellek kısıtı yok'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_results WHERE tenant_id = ta AND owner_user_id = u1 AND input_hash = repeat('1', 64);
  IF n <> 1 THEN RAISE EXCEPTION 'eski önbellek satırı uzman anahtarıyla bulunamadı'; END IF;

  -- Danışan FK'leri SET NULL.
  SELECT count(*) INTO n FROM pg_constraint WHERE conname IN ('astro_bp_client_fk', 'astro_an_client_fk') AND confdeltype = 'n';
  IF n <> 2 THEN RAISE EXCEPTION 'danışan FK''leri SET NULL değil'; END IF;

  -- Danışan Yolculuğu danışan silme (cascade-delete route'unun yaptığı tek ifade).
  DELETE FROM public.clients WHERE id = c_ali AND tenant_id = ta;
  now_counts := concat_ws('|',
    (SELECT count(*) FROM public.astro_birth_profiles), (SELECT count(*) FROM public.astro_birth_profile_revisions),
    (SELECT count(*) FROM public.astro_provider_results), (SELECT count(*) FROM public.astro_provider_interpretations),
    (SELECT count(*) FROM public.astro_kb_entries), (SELECT count(*) FROM public.astro_expert_notes),
    (SELECT count(*) FROM public.astro_analyses), (SELECT count(*) FROM public.astro_analysis_notes));
  IF now_counts <> base_counts THEN RAISE EXCEPTION 'danışan silme astroloji kaydı sildi: % → %', base_counts, now_counts; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE client_id = c_ali;
  IF n <> 0 THEN RAISE EXCEPTION 'silinen danışan bağı NULL olmadı (profil)'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE client_id = c_ali;
  IF n <> 0 THEN RAISE EXCEPTION 'silinen danışan bağı NULL olmadı (analiz)'; END IF;
  SELECT string_agg(md5(id::text || profile_snapshot::text || method_snapshot::text || technical_snapshot::text
           || coalesce(provider_interp_snapshot::text, '-') || kb_snapshot::text || versions_snapshot::text || title), ',' ORDER BY id)
    INTO now_an FROM public.astro_analyses;
  IF now_an <> base_an THEN RAISE EXCEPTION 'danışan silme sonrası snapshot değişti'; END IF;

  -- Yükseltme sonrası yeni RPC'ler eski profilde çalışır (sahibi aynı).
  PERFORM public.astro_profile_append_revision(ta, u1, (SELECT id FROM public.astro_birth_profiles WHERE label = 'Sentetik Ali — natal'), 2,
    '1990-07-15', '14:41', true, 'rectified', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T11:41:00Z', 'yükseltme sonrası');
END
$$;
DROP TABLE public._astro7a_baseline;
