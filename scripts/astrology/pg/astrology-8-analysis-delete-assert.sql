-- ASTROLOJİ — "A — YALNIZCA ANALİZLERİ SİL" doğrulaması (yalnız yerel embedded-postgres; SENTETİK).
--   Profil + revizyon + Danışan Yolculuğu bağı + uzman notu korunur · yalnız seçilen profillerin KENDİ analizleri silinir ·
--   başka profilin ortak analizi (karşı taraf = seçilen) korunur · eskimiş onay / başka uzman / tenant / tekrar /
--   boş / >100 · toplu hepsi-ya-da-hiçbiri · doğrudan DELETE yasağı · B (profil silme) sonra hâlâ çalışır.

SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  u uuid := 'd8d8d8d8-d8d8-4d8d-8d8d-d8d8d8d8d8d1';
  u2 uuid := 'd8d8d8d8-d8d8-4d8d-8d8d-d8d8d8d8d8d2';
  ub uuid := 'd8d8d8d8-d8d8-4d8d-8d8d-d8d8d8d8d8db';
  cl uuid;
  r jsonb; ahmet uuid; ayse uuid; can uuid; pbx uuid; big jsonb;
  a_syn uuid; c_comp uuid; ahmet_nat uuid; ok boolean; n bigint; exp jsonb;
  fp_before text; fp_after text; tb_before text; tb_after text; prof_before text; prof_after text;
BEGIN
  SELECT id INTO cl FROM public.clients WHERE tenant_id = ta ORDER BY id LIMIT 1;
  IF cl IS NULL THEN RAISE EXCEPTION 'fixture: tenant A danışanı yok'; END IF;

  r := public.astro_profile_create(ta, u, cl, 'Ahmet A — natal', '1980-04-04', '09:00', true, 'exact_record', NULL, 'İzmir', 38.4, 27.1, 'Europe/Istanbul', 'auto', 10800, '1980-04-04T06:00:00Z');
  ahmet := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Ayşe A — natal', '1984-08-08', '10:00', true, 'exact_record', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 10800, '1984-08-08T07:00:00Z');
  ayse := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Can A — natal', '1990-01-01', NULL, false, 'unknown', NULL, 'Bursa', 40.2, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-01-01T09:00:00Z');
  can := (r->>'profile_id')::uuid;

  -- Ahmet'in KENDİ analizleri: natal (not dahil) + Ahmet & Ayşe sinastrisi.
  r := public.astro_analysis_save_v2(ta, u, ahmet, 1, NULL, NULL, NULL, 'western.natal', 'Ahmet natal', gen_random_uuid(), '{}', '{"label":"Ahmet"}', '{}', '{}', '[]', false, NULL, '{}',
        '[{"section_key":"overall","body":"Ahmet natal notu"}]');
  ahmet_nat := (r->>'analysis_id')::uuid;
  PERFORM public.astro_analysis_save_v2(ta, u, ahmet, 1, ayse, 1, NULL, 'western.synastry', 'Ahmet & Ayşe', gen_random_uuid(), '{}', '{"label":"Ahmet"}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  -- Başka profillerin ortak analizleri (karşı taraf Ahmet) → A ile KORUNMALI (canlı bağ dahil).
  r := public.astro_analysis_save_v2(ta, u, ayse, 1, ahmet, 1, NULL, 'western.synastry', 'Ayşe & Ahmet', gen_random_uuid(), '{}', '{"label":"Ayşe","partner":{"label":"Ahmet"}}', '{}', '{"s":1}', '[]', false, NULL, '{}',
        '[{"section_key":"overall","body":"Ayşe & Ahmet notu"}]');
  a_syn := (r->>'analysis_id')::uuid;
  r := public.astro_analysis_save_v2(ta, u, can, 1, ahmet, 1, NULL, 'western.composite', 'Can & Ahmet', gen_random_uuid(), '{}', '{"label":"Can"}', '{}', '{"c":1}', '[]', false, NULL, '{}', '[]');
  c_comp := (r->>'analysis_id')::uuid;
  PERFORM public.astro_analysis_save_v2(ta, u, can, 1, NULL, NULL, NULL, 'western.natal', 'Can natal', gen_random_uuid(), '{}', '{"label":"Can"}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, section_key, body) VALUES (ta, u, ahmet, 'western.natal', 'overall', 'Ahmet çalışma notu');

  -- Başka tenant verisi.
  r := public.astro_profile_create(tb, ub, NULL, 'B tenant A', '1970-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1970-01-01T10:00:00Z');
  pbx := (r->>'profile_id')::uuid;
  PERFORM public.astro_analysis_save_v2(tb, ub, pbx, 1, NULL, NULL, NULL, 'western.natal', 'B natal', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  SELECT string_agg(md5(row(a.*)::text), ',' ORDER BY a.id) INTO tb_before FROM public.astro_analyses a WHERE a.tenant_id = tb;

  -- 1) Doğrudan DELETE hâlâ yasak.
  ok := false;
  BEGIN DELETE FROM public.astro_analyses WHERE id = ahmet_nat;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'service_role doğrudan analiz silebildi'; END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[ahmet]);
  IF (exp->0->>'own')::int <> 2 OR (exp->0->>'shared')::int <> 2 THEN RAISE EXCEPTION 'önizleme: %', exp; END IF;

  -- 2) Eskimiş onay → hiçbir şey silinmez; onaydan sonra yeni analiz → eskimiş.
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(ta, u, jsonb_build_array(jsonb_set(exp->0, '{own}', '1')));
  EXCEPTION WHEN SQLSTATE '40001' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: eskimiş onay kabul edildi'; END IF;
  PERFORM public.astro_analysis_save_v2(ta, u, ahmet, 1, NULL, NULL, NULL, 'western.natal', 'geç eklenen', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(ta, u, exp);
  EXCEPTION WHEN SQLSTATE '40001' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: onay sonrası değişen durumda silindi'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = ahmet;
  IF n <> 3 THEN RAISE EXCEPTION 'A: reddedilen deneme analiz sildi (%)', n; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[ahmet]);

  -- 3) Başka uzman / başka tenant / tekrar / boş / >100 → reddedilir.
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(ta, u2, exp);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: başka uzman sildi'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(tb, u, exp);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: başka tenant ile silindi'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(ta, u, exp || exp);
  EXCEPTION WHEN SQLSTATE '22023' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: tekrar eden kimlik kabul edildi'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(ta, u, '[]'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: boş istek kabul edildi'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'current_revision', 1, 'updated_ms', 0, 'own', 0, 'shared', 0)) INTO big FROM generate_series(1, 101);
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(ta, u, big);
  EXCEPTION WHEN SQLSTATE '22023' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: 100''den fazla profil kabul edildi'; END IF;
  -- Toplu içinde yabancı profil → HİÇBİR analiz silinmez.
  ok := false;
  BEGIN PERFORM public.astro_profile_analyses_delete(ta, u, exp || jsonb_build_array(jsonb_build_object('id', pbx, 'current_revision', 1, 'updated_ms', 0, 'own', 1, 'shared', 0)));
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'A: yabancı profil içeren toplu silme hata vermedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = ahmet;
  IF n <> 3 THEN RAISE EXCEPTION 'A: kısmi başarısızlıkta analiz silindi'; END IF;

  -- 4) A — Ahmet: yalnız Ahmet'in 3 analizi (+ notu) silinir.
  SELECT string_agg(md5(a.id::text || a.profile_snapshot::text || a.technical_snapshot::text || coalesce(a.partner_profile_id::text, '-') || coalesce(a.partner_profile_revision::text, '-')
           || coalesce((SELECT string_agg(nn.section_key || nn.body, '|') FROM public.astro_analysis_notes nn WHERE nn.analysis_id = a.id), '')), ',' ORDER BY a.id)
    INTO fp_before FROM public.astro_analyses a WHERE a.tenant_id = ta AND a.owner_user_id = u AND a.profile_id <> ahmet;
  SELECT md5(row(p.*)::text) || (SELECT string_agg(md5(row(rv.*)::text), ',' ORDER BY rv.revision) FROM public.astro_birth_profile_revisions rv WHERE rv.profile_id = p.id)
    INTO prof_before FROM public.astro_birth_profiles p WHERE p.id = ahmet;
  r := public.astro_profile_analyses_delete(ta, u, exp);
  IF (r->>'deleted_analyses')::int <> 3 OR (r->>'deleted_profiles')::int <> 0 OR (r->>'kept_profiles')::int <> 1 THEN RAISE EXCEPTION 'A sonucu: %', r; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = ahmet;
  IF n <> 0 THEN RAISE EXCEPTION 'A: Ahmet''in analizleri kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_analysis_notes WHERE analysis_id = ahmet_nat;
  IF n <> 0 THEN RAISE EXCEPTION 'A: silinen analizin not kopyası kaldı'; END IF;
  -- Profil + revizyonlar + DY bağı + çalışma notu BİREBİR duruyor (updated_at dahil).
  SELECT md5(row(p.*)::text) || (SELECT string_agg(md5(row(rv.*)::text), ',' ORDER BY rv.revision) FROM public.astro_birth_profile_revisions rv WHERE rv.profile_id = p.id)
    INTO prof_after FROM public.astro_birth_profiles p WHERE p.id = ahmet;
  IF prof_after IS DISTINCT FROM prof_before THEN RAISE EXCEPTION 'A: profil/revizyon değişti'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id = ahmet AND client_id = cl;
  IF n <> 1 THEN RAISE EXCEPTION 'A: Danışan Yolculuğu bağı kayboldu'; END IF;
  SELECT count(*) INTO n FROM public.clients WHERE id = cl;
  IF n <> 1 THEN RAISE EXCEPTION 'A: DY danışanı etkilendi'; END IF;
  SELECT count(*) INTO n FROM public.astro_expert_notes WHERE profile_id = ahmet;
  IF n <> 1 THEN RAISE EXCEPTION 'A: çalışma notu silindi'; END IF;
  -- Diğer profillerin analizleri (karşı tarafı Ahmet olanlar dahil, canlı bağ + notlar) BİREBİR duruyor.
  SELECT string_agg(md5(a.id::text || a.profile_snapshot::text || a.technical_snapshot::text || coalesce(a.partner_profile_id::text, '-') || coalesce(a.partner_profile_revision::text, '-')
           || coalesce((SELECT string_agg(nn.section_key || nn.body, '|') FROM public.astro_analysis_notes nn WHERE nn.analysis_id = a.id), '')), ',' ORDER BY a.id)
    INTO fp_after FROM public.astro_analyses a WHERE a.tenant_id = ta AND a.owner_user_id = u AND a.profile_id <> ahmet;
  IF fp_after IS DISTINCT FROM fp_before THEN RAISE EXCEPTION 'A: başka profillerin analizleri değişti'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id IN (a_syn, c_comp) AND partner_profile_id = ahmet;
  IF n <> 2 THEN RAISE EXCEPTION 'A: ortak analizin canlı bağı değişti'; END IF;

  -- 5) Analizsiz profil yeniden kullanılabilir: yeni analiz kaydedilir; tekrar A (0 analiz önizlemesiyle) çalışır.
  PERFORM public.astro_analysis_save_v2(ta, u, ahmet, 1, NULL, NULL, NULL, 'western.natal', 'yeniden', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = ahmet;
  IF n <> 1 THEN RAISE EXCEPTION 'A sonrası yeni analiz kaydedilemedi'; END IF;

  -- 6) Toplu A: Ayşe + Can → ikisinin kendi analizleri (Ayşe & Ahmet, Can & Ahmet, Can natal) silinir; Ahmet'in yeni analizi kalır.
  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[ayse, can]);
  r := public.astro_profile_analyses_delete(ta, u, exp);
  IF (r->>'deleted_analyses')::int <> 3 THEN RAISE EXCEPTION 'toplu A sonucu: %', r; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id IN (ayse, can);
  IF n <> 0 THEN RAISE EXCEPTION 'toplu A: analiz kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id IN (ahmet, ayse, can);
  IF n <> 3 THEN RAISE EXCEPTION 'toplu A: profil silindi'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = ahmet;
  IF n <> 1 THEN RAISE EXCEPTION 'toplu A: seçilmeyen profilin analizi etkilendi'; END IF;

  -- 7) Başka tenant aynen.
  SELECT string_agg(md5(row(a.*)::text), ',' ORDER BY a.id) INTO tb_after FROM public.astro_analyses a WHERE a.tenant_id = tb;
  IF tb_after IS DISTINCT FROM tb_before THEN RAISE EXCEPTION 'A: başka tenant etkilendi'; END IF;

  -- 8) B (profil silme) A'dan sonra hâlâ çalışır.
  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[can]);
  r := public.astro_profile_delete(ta, u, exp);
  IF (r->>'deleted_profiles')::int <> 1 THEN RAISE EXCEPTION 'B sonucu: %', r; END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.astro_profile_analyses_delete(uuid, uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.astro_profile_analyses_delete(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon/authenticated A fonksiyonunu çalıştırabiliyor';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.astro_profile_analyses_delete(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role A fonksiyonunu çalıştıramıyor';
  END IF;
  IF has_table_privilege('service_role', 'public.astro_analyses', 'DELETE') THEN
    RAISE EXCEPTION 'service_role astro_analyses DELETE yetkisi kazandı';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.astro_profile_analyses_delete(uuid, uuid, jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'A fonksiyonu SECURITY DEFINER değil';
  END IF;
END
$$;
