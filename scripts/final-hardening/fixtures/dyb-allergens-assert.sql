-- DY-B / migration 0600 davranış doğrulaması (hata → FAIL). Yalnız yerel embedded-postgres.
DO $$
DECLARE
  t_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  t_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  c_a constant uuid := '11111111-1111-4111-8111-111111111111';
  c_b constant uuid := '22222222-2222-4222-8222-222222222222';
  peanut constant text := 'a1111111-1111-4111-8111-111111111111';
  milk constant text := 'a2222222-2222-4222-8222-222222222222';
  r jsonb;
  n int;
  failed boolean;
  labels text;
BEGIN
  -- 1) Güvenlik: SECURITY DEFINER + search_path='' + yalnız service_role EXECUTE
  IF NOT (SELECT prosecdef FROM pg_proc WHERE proname = 'nutrition_replace_client_allergens') THEN
    RAISE EXCEPTION 'ASSERT: SECURITY DEFINER değil';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'nutrition_replace_client_allergens'
                 AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'ASSERT: search_path boş değil';
  END IF;
  IF has_function_privilege('anon', 'public.nutrition_replace_client_allergens(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.nutrition_replace_client_allergens(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT: anon/authenticated EXECUTE açık';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.nutrition_replace_client_allergens(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT: service_role EXECUTE yok';
  END IF;

  -- 2) Mutlu yol: tam-set replace + dedup (std aynı id iki kez; custom case/boşluk farkı) + custom korunur
  r := public.nutrition_replace_client_allergens(t_a, c_a, jsonb_build_array(
    jsonb_build_object('allergen_id', milk, 'note', ' not1 '),
    jsonb_build_object('allergen_id', milk),
    jsonb_build_object('custom_label', '  Polen '),
    jsonb_build_object('custom_label', 'polen'),
    jsonb_build_object('custom_label', 'Lateks')
  ));
  IF (r->>'deleted')::int <> 2 OR (r->>'inserted')::int <> 3 THEN
    RAISE EXCEPTION 'ASSERT: sayılar yanlış %', r;
  END IF;
  SELECT string_agg(coalesce(custom_label, allergen_id::text), ',' ORDER BY coalesce(custom_label, allergen_id::text))
    INTO labels FROM public.nutrition_client_allergens WHERE client_id = c_a;
  IF labels <> 'Lateks,Polen,' || milk THEN
    RAISE EXCEPTION 'ASSERT: beklenmeyen set: %', labels;
  END IF;
  IF (SELECT note FROM public.nutrition_client_allergens WHERE client_id = c_a AND allergen_id = milk::uuid) <> 'not1' THEN
    RAISE EXCEPTION 'ASSERT: note trim/ilk-geçen kuralı bozuk';
  END IF;

  -- 3) ATOMİKLİK: bilinmeyen alerjen → hata; mevcut set DEĞİŞMEZ (eski delete→insert boşaltırdı)
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_a, c_a, jsonb_build_array(
      jsonb_build_object('allergen_id', peanut),
      jsonb_build_object('allergen_id', 'a9999999-9999-4999-8999-999999999999')));
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM = 'unknown_allergen';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: unknown_allergen bekleniyordu'; END IF;
  SELECT count(*) INTO n FROM public.nutrition_client_allergens WHERE client_id = c_a;
  IF n <> 3 THEN RAISE EXCEPTION 'ASSERT: hata sonrası set değişti (%)', n; END IF;

  -- 4) Tek-kaynak kuralı: ikisi birden / ikisi boş → bad_allergen_item, set değişmez
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_a, c_a,
      jsonb_build_array(jsonb_build_object('allergen_id', peanut, 'custom_label', 'x')));
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'bad_allergen_item';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: bad_allergen_item (ikisi dolu) bekleniyordu'; END IF;
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_a, c_a,
      jsonb_build_array(jsonb_build_object('custom_label', '   ')));
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'bad_allergen_item';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: bad_allergen_item (boş) bekleniyordu'; END IF;
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_a, c_a,
      jsonb_build_array(jsonb_build_object('allergen_id', 'not-a-uuid')));
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'bad_allergen_id';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: bad_allergen_id bekleniyordu'; END IF;
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_a, c_a,
      jsonb_build_array(jsonb_build_object('custom_label', repeat('x', 121))));
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'custom_too_long';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: custom_too_long bekleniyordu'; END IF;
  SELECT count(*) INTO n FROM public.nutrition_client_allergens WHERE client_id = c_a;
  IF n <> 3 THEN RAISE EXCEPTION 'ASSERT: doğrulama hatası sonrası set değişti (%)', n; END IF;

  -- 5) Tenant sahipliği: B tenant'ı A danışanına yazamaz / silemez
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_b, c_a, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'client_not_found_for_tenant';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: çapraz tenant reddedilmedi'; END IF;
  SELECT count(*) INTO n FROM public.nutrition_client_allergens WHERE client_id = c_a;
  IF n <> 3 THEN RAISE EXCEPTION 'ASSERT: çapraz tenant çağrısı veriyi değiştirdi'; END IF;

  -- 6) Dizi değil → items_must_be_array; 31 eleman → too_many_allergens
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_a, c_a, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'items_must_be_array';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: items_must_be_array bekleniyordu'; END IF;
  failed := false;
  BEGIN
    PERFORM public.nutrition_replace_client_allergens(t_a, c_a,
      (SELECT jsonb_agg(jsonb_build_object('custom_label', 'x' || g)) FROM generate_series(1, 31) g));
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'too_many_allergens';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'ASSERT: too_many_allergens bekleniyordu'; END IF;

  -- 7) Boş dizi = tümünü temizle (bilinçli boş set), yalnız o danışan
  INSERT INTO public.nutrition_client_allergens (tenant_id, client_id, allergen_id)
    VALUES (t_b, c_b, peanut::uuid);
  r := public.nutrition_replace_client_allergens(t_a, c_a, '[]'::jsonb);
  IF (r->>'deleted')::int <> 3 OR (r->>'inserted')::int <> 0 THEN
    RAISE EXCEPTION 'ASSERT: boş set sayıları yanlış %', r;
  END IF;
  SELECT count(*) INTO n FROM public.nutrition_client_allergens WHERE client_id = c_b;
  IF n <> 1 THEN RAISE EXCEPTION 'ASSERT: başka danışanın verisi etkilendi'; END IF;

  RAISE NOTICE 'dyb-allergens-assert: tüm kontroller geçti';
END $$;
