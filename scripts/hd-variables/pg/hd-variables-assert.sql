-- HD VARIABLES kalıcı depo — migration 20271105000000 doğrulaması (iki kez uygulandıktan sonra). Hata = FAIL.
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  ha uuid := 'd0000000-0000-4000-8000-00000000000a';
  hb uuid := 'd0000000-0000-4000-8000-00000000000b';
  hl uuid := 'd0000000-0000-4000-8000-00000000000c';
  k1 text := repeat('a', 64);
  k2 text := repeat('b', 64);
  n int;
BEGIN
  -- Yetki kilidi + RLS (deny-by-default)
  IF has_table_privilege('anon', 'public.human_design_chart_variables', 'SELECT') OR has_table_privilege('anon', 'public.human_design_chart_variables', 'INSERT')
     OR has_table_privilege('authenticated', 'public.human_design_chart_variables', 'SELECT') OR has_table_privilege('authenticated', 'public.human_design_chart_variables', 'DELETE') THEN
    RAISE EXCEPTION 'anon/authenticated yetkisi kaldı';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.human_design_chart_variables', 'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'service_role yetkisi yok'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.human_design_chart_variables'::regclass) THEN RAISE EXCEPTION 'RLS kapalı'; END IF;
  IF (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.human_design_chart_variables'::regclass) THEN RAISE EXCEPTION 'FORCE RLS açık'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'human_design_chart_variables') <> 0 THEN RAISE EXCEPTION 'policy var'; END IF;
  IF has_function_privilege('anon', 'public.hd_chart_variables_integrity()', 'EXECUTE') THEN RAISE EXCEPTION 'tetikleyici fonksiyonu anon çalıştırabilir'; END IF;
  -- Mevcut tabloya dokunulmadı (kolon / kısıt eklenmedi)
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'human_design_charts') <> 7 THEN RAISE EXCEPTION 'human_design_charts kolonları değişti'; END IF;
  -- (PG18 NOT NULL'ı da pg_constraint'e yazar — PG17 prod ile aynı sonuç için 'n' hariç)
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.human_design_charts'::regclass AND contype <> 'n') <> 1 THEN RAISE EXCEPTION 'human_design_charts kısıtları değişti'; END IF;

  -- Geçerli yazım
  INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, chart_input_hash, utc_offset_seconds, result)
    VALUES (ta, ha, k1, '/human-design/variables', 'roxy-variables-2', 'true', 'tr', 'ih-a', 10800, '{"arrows":[]}');
  -- Benzersizlik
  BEGIN
    INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result)
      VALUES (ta, ha, k1, '/human-design/variables', 'roxy-variables-2', 'true', 'tr', 0, '{}');
    RAISE EXCEPTION 'yinelenen anahtar kabul edildi';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- Tenant bütünlüğü (başka tenant'ın analizi / NULL tenant'lı eski analiz / olmayan analiz)
  BEGIN
    INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result)
      VALUES (ta, hb, k2, '/human-design/variables', 'roxy-variables-2', 'true', 'tr', 0, '{}');
    RAISE EXCEPTION 'başka tenant analizi kabul edildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result)
      VALUES (ta, hl, k2, '/human-design/variables', 'roxy-variables-2', 'true', 'tr', 0, '{}');
    RAISE EXCEPTION 'NULL tenantlı analiz kabul edildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result)
      VALUES (ta, gen_random_uuid(), k2, '/human-design/variables', 'roxy-variables-2', 'true', 'tr', 0, '{}');
    RAISE EXCEPTION 'olmayan analiz kabul edildi';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  -- UPDATE ile tenant taşıma da engellenir
  BEGIN
    UPDATE public.human_design_chart_variables SET tenant_id = tb WHERE chart_id = ha;
    RAISE EXCEPTION 'tenant taşıma kabul edildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- CHECK kısıtları
  BEGIN
    INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result)
      VALUES (ta, ha, 'kisa', '/human-design/variables', 'roxy-variables-2', 'true', 'tr', 0, '{}');
    RAISE EXCEPTION 'geçersiz cache_key kabul edildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result)
      VALUES (ta, ha, k2, '/human-design/variables', 'roxy-variables-2', 'true', 'tr', 0, '[]');
    RAISE EXCEPTION 'dizi result kabul edildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.human_design_chart_variables (tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result)
      VALUES (ta, ha, k2, '/human-design/variables', 'roxy-variables-2', 'weird', 'tr', 0, '{}');
    RAISE EXCEPTION 'geçersiz node_type kabul edildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- service_role ile okuma çalışır (RLS bypass)
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM public.human_design_chart_variables WHERE tenant_id = ta;
  RESET ROLE;
  IF n <> 1 THEN RAISE EXCEPTION 'service_role okuyamadı'; END IF;
  -- anon okuyamaz
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.human_design_chart_variables;
    RAISE EXCEPTION 'anon okudu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  -- CASCADE: analiz silinince sonuç silinir; diğer analizler kalır
  DELETE FROM public.human_design_charts WHERE id = ha;
  IF (SELECT count(*) FROM public.human_design_chart_variables) <> 0 THEN RAISE EXCEPTION 'CASCADE çalışmadı'; END IF;
  IF (SELECT count(*) FROM public.human_design_charts) <> 2 THEN RAISE EXCEPTION 'başka analiz etkilendi'; END IF;
  RAISE NOTICE 'HD VARIABLES MIGRATION ASSERT: OK';
END $$;
