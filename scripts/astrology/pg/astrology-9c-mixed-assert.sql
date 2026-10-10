-- ASTROLOJİ 9C — KARMA veritabanında 000000–000700'ün (iki kez) yeniden uygulanması: hiçbir satır kaybolmaz/değişmez
-- (kb_snapshot hariç), eski KB kopyaları boşalır, not tablosu aynen kalır, RLS + yetkiler korunur.
DO $$
DECLARE b record; now_v text; n integer;
BEGIN
  FOR b IN SELECT k, v FROM public._astro9c_baseline LOOP
    now_v := CASE b.k
      WHEN 'counts' THEN concat_ws('|',
        (SELECT count(*) FROM public.astro_birth_profiles), (SELECT count(*) FROM public.astro_birth_profile_revisions),
        (SELECT count(*) FROM public.astro_provider_results), (SELECT count(*) FROM public.astro_provider_interpretations),
        (SELECT count(*) FROM public.astro_kb_entries), (SELECT count(*) FROM public.astro_expert_notes),
        (SELECT count(*) FROM public.astro_analyses), (SELECT count(*) FROM public.astro_analysis_notes))
      WHEN 'analyses' THEN (SELECT coalesce(string_agg(md5(id::text || owner_user_id::text || profile_id::text || profile_revision::text
        || coalesce(partner_profile_id::text, '-') || coalesce(client_id::text, '-') || profile_snapshot::text || method_snapshot::text
        || technical_snapshot::text || coalesce(provider_interp_snapshot::text, '-') || versions_snapshot::text || title), ',' ORDER BY id), '') FROM public.astro_analyses)
      WHEN 'notes' THEN (SELECT coalesce(string_agg(md5(id::text || analysis_id::text || section_key || body), ',' ORDER BY id), '') FROM public.astro_analysis_notes)
      WHEN 'profiles' THEN (SELECT coalesce(string_agg(md5(p.id::text || p.owner_user_id::text || coalesce(p.client_id::text, '-') || p.label || p.current_revision::text), ',' ORDER BY p.id), '') FROM public.astro_birth_profiles p)
      WHEN 'kb' THEN (SELECT coalesce(string_agg(md5(id::text || owner_user_id::text || title || body), ',' ORDER BY id), '') FROM public.astro_kb_entries)
    END;
    IF now_v IS DISTINCT FROM b.v THEN RAISE EXCEPTION 'ASTRO 9C karma: % değişti (% → %)', b.k, left(b.v, 60), left(now_v, 60); END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public._astro9c_baseline;
  IF n <> 5 THEN RAISE EXCEPTION 'ASTRO 9C karma: parmak izi eksik (%)', n; END IF;
  -- Eski KB kopyaları boşaldı (yalnız KB biçimli olanlar; 9B temizlik doğrulaması ayrıca sınar).
  SELECT count(*) INTO n FROM public.astro_analyses WHERE kb_snapshot <> '[]'::jsonb
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(kb_snapshot) e WHERE NOT (e ? 'entryId' AND e ? 'topicKey' AND e ? 'title' AND e ? 'body') OR e ? 'section_key' OR e ? 'sectionKey');
  IF n <> 0 THEN RAISE EXCEPTION 'ASTRO 9C karma: KB biçimli eski kopya kaldı (%)', n; END IF;
  -- RLS her astro_ tablosunda açık; anon/authenticated'a hiçbir tablo/fonksiyon yetkisi yok.
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'astro\_%' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION 'ASTRO 9C karma: RLS kapalı tablo (%)', n; END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name LIKE 'astro\_%' AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n <> 0 THEN RAISE EXCEPTION 'ASTRO 9C karma: anon/authenticated tablo yetkisi (%)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE s.nspname = 'public' AND p.proname LIKE 'astro\_%'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF n <> 0 THEN RAISE EXCEPTION 'ASTRO 9C karma: anon/authenticated fonksiyon yetkisi (%)', n; END IF;
  -- Kayıtlı analiz değişmez: uygulama rolü UPDATE/DELETE yapamaz.
  IF has_table_privilege('service_role', 'public.astro_analyses', 'UPDATE') OR has_table_privilege('service_role', 'public.astro_analyses', 'DELETE') THEN
    RAISE EXCEPTION 'ASTRO 9C karma: astro_analyses değişmezliği bozuldu';
  END IF;
  -- Kayıt tavanı tetikleyicileri tekil (iki kez uygulamada çoğalmadı).
  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg\_astro\_cap\_%';
  IF n <> 4 THEN RAISE EXCEPTION 'ASTRO 9C karma: tavan tetikleyici sayısı % (beklenen 4)', n; END IF;
  RAISE NOTICE 'ASTRO 9C karma veritabanı: PASS';
END $$;
