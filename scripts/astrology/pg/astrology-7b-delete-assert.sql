-- ASTROLOJİ AŞAMA 7B-S — KALICI SİLME doğrulaması (yalnız yerel embedded-postgres; SENTETİK).
--   Ahmet + Ayşe ortak analizleri (sinastri, composite) + Can · birden fazla ortak analiz · yanlış/eskimiş onay ·
--   başka uzman / tenant · toplu (hepsi-ya-da-hiçbiri) · tekrar · arşivli profil · doğrudan DELETE yasağı.

SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  u uuid := 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
  u2 uuid := 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2';
  ub uuid := 'dbdbdbdb-dbdb-4dbd-8dbd-dbdbdbdbdbdb';
  r jsonb; ahmet uuid; ayse uuid; can uuid; x uuid; y uuid; z uuid; pbx uuid;
  rid uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  a_syn uuid; a_comp uuid; a_can uuid; c_comp uuid; ok boolean; n bigint; fp_before text; fp_after text; exp jsonb; tb_before text; tb_after text;
BEGIN
  -- Kişiler (aynı uzman). Ahmet'in kendi doğum verisi "1980-04-04" ve etiketi snapshot'ta aranacak.
  r := public.astro_profile_create(ta, u, NULL, 'Ahmet — natal', '1980-04-04', '09:00', true, 'exact_record', NULL, 'İzmir', 38.4, 27.1, 'Europe/Istanbul', 'auto', 10800, '1980-04-04T06:00:00Z');
  ahmet := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Ayşe — natal', '1984-08-08', '10:00', true, 'exact_record', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 10800, '1984-08-08T07:00:00Z');
  ayse := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Can — natal', '1990-01-01', NULL, false, 'unknown', NULL, 'Bursa', 40.2, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-01-01T09:00:00Z');
  can := (r->>'profile_id')::uuid;

  -- Ayşe'nin önbellekteki sinastri sonucu (karşı taraf Ahmet; ham yanıt Ahmet'in verisini içerir) + yorumu.
  INSERT INTO public.astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider,
    provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
  VALUES (rid, ta, u, ayse, 1, ahmet, 1, 'western.synastry', 'roxy', 'v2', 'a', '/astrology/synastry', '{"b":"1980-04-04"}', repeat('7', 64), '{"raw":"Ahmet 1980-04-04"}', '{"aspects":[1]}', 's', 'p', u);
  INSERT INTO public.astro_provider_interpretations (tenant_id, owner_user_id, result_id, provider, lang, content_schema, projection_version, content)
  VALUES (ta, u, rid, 'roxy', 'tr', 'i', 'p', '{"summary":"sinastri yorumu"}');

  -- Ayşe'nin ortak analizleri (Ahmet karşı taraf): sinastri (sonuç + yorum + not dahil) ve composite; Ayşe–Can sinastrisi.
  r := public.astro_analysis_save_v2(ta, u, ayse, 1, ahmet, 1, ARRAY[rid], 'western.synastry', 'Ayşe & Ahmet sinastri', gen_random_uuid(),
        '{"partnerProfileId":"ahmet"}', jsonb_build_object('label', 'Ayşe — natal', 'partner', jsonb_build_object('label', 'Ahmet — natal', 'revision', jsonb_build_object('birthDate', '1980-04-04'))),
        '{"houseSystem":"placidus"}', '{"aspects":[{"a":"sun","b":"moon"}],"partnerBodies":[{"id":"sun","sign":"aries"}]}', '[{"title":"KB"}]', true,
        '{"provider":"roxy","content":{"summary":"sinastri yorumu"}}', '{"provider":"roxy"}', '[{"section_key":"overall","body":"Ayşe & Ahmet notum"}]');
  a_syn := (r->>'analysis_id')::uuid;
  r := public.astro_analysis_save_v2(ta, u, ayse, 1, ahmet, 1, NULL, 'western.composite', 'Ayşe & Ahmet composite', gen_random_uuid(),
        '{}', jsonb_build_object('label', 'Ayşe — natal', 'partner', jsonb_build_object('label', 'Ahmet — natal')), '{}', '{"composite":{"sun":"leo"}}', '[]', false, NULL, '{}', '[]');
  a_comp := (r->>'analysis_id')::uuid;
  r := public.astro_analysis_save_v2(ta, u, ayse, 1, can, 1, NULL, 'western.synastry', 'Ayşe & Can', gen_random_uuid(), '{}', '{"label":"Ayşe"}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  a_can := (r->>'analysis_id')::uuid;
  -- Can'ın composite'i (karşı taraf Ahmet) → korunmalı.
  r := public.astro_analysis_save_v2(ta, u, can, 1, ahmet, 1, NULL, 'western.composite', 'Can & Ahmet composite', gen_random_uuid(), '{}', '{"label":"Can","partner":{"label":"Ahmet — natal"}}', '{}', '{"c":1}', '[]', false, NULL, '{}', '[]');
  c_comp := (r->>'analysis_id')::uuid;
  -- Ahmet'in KENDİ analizleri (natal + Ahmet & Ayşe sinastrisi) → Ahmet ile silinir.
  PERFORM public.astro_analysis_save_v2(ta, u, ahmet, 1, NULL, NULL, NULL, 'western.natal', 'Ahmet natal', gen_random_uuid(), '{}', '{"label":"Ahmet"}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  PERFORM public.astro_analysis_save_v2(ta, u, ahmet, 1, ayse, 1, NULL, 'western.synastry', 'Ahmet & Ayşe', gen_random_uuid(), '{}', '{"label":"Ahmet"}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, section_key, body) VALUES (ta, u, ahmet, 'western.natal', 'overall', 'Ahmet notu');

  -- Başka tenant verisi (etkilenmemeli).
  r := public.astro_profile_create(tb, ub, NULL, 'B tenant', '1970-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1970-01-01T10:00:00Z');
  pbx := (r->>'profile_id')::uuid;
  PERFORM public.astro_analysis_save_v2(tb, ub, pbx, 1, NULL, NULL, NULL, 'western.natal', 'B natal', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  SELECT string_agg(md5(row(a.*)::text), ',' ORDER BY a.id) INTO tb_before FROM public.astro_analyses a WHERE a.tenant_id = tb;

  -- 1) Önizleme: Ahmet → kendi 2 analiz, korunacak 3 ortak analiz (Ayşe sinastri + Ayşe composite + Can composite).
  SELECT own_analysis_count, shared_preserved_count INTO n, fp_after FROM public.astro_profile_delete_preview(ta, u, ARRAY[ahmet]);
  IF n <> 2 OR fp_after::bigint <> 3 THEN RAISE EXCEPTION 'önizleme: % kendi / % ortak', n, fp_after; END IF;
  SELECT count(*) INTO n FROM public.astro_profile_delete_preview(ta, u2, ARRAY[ahmet]);
  IF n <> 0 THEN RAISE EXCEPTION 'başka uzman önizleme gördü'; END IF;

  -- 2) Doğrudan DELETE yasak (tek yol RPC).
  ok := false;
  BEGIN DELETE FROM public.astro_birth_profiles WHERE id = ahmet;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'service_role doğrudan profil silebildi'; END IF;
  ok := false;
  BEGIN DELETE FROM public.astro_analyses WHERE id = a_syn;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'service_role doğrudan analiz silebildi'; END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[ahmet]);

  -- 3) Eskimiş onay (sayı farklı) → hiçbir şey silinmez.
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(ta, u, jsonb_build_array(jsonb_set(exp->0, '{own}', '1')));
  EXCEPTION WHEN SQLSTATE '40001' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'eskimiş onay kabul edildi'; END IF;
  -- Onaydan sonra yeni ortak analiz eklenirse → onay geçersiz.
  r := public.astro_analysis_save_v2(ta, u, can, 1, ahmet, 1, NULL, 'western.synastry', 'geç eklenen', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(ta, u, exp);
  EXCEPTION WHEN SQLSTATE '40001' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'onay sonrası değişen durumda silindi'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[ahmet]);

  -- 4) Başka uzman / başka tenant / tekrar eden kimlik → reddedilir.
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(ta, u2, exp);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'başka uzman sildi'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(tb, u, exp);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'başka tenant ile silindi'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(ta, u, exp || exp);
  EXCEPTION WHEN SQLSTATE '22023' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'tekrar eden kimlik kabul edildi'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id = ahmet;
  IF n <> 1 THEN RAISE EXCEPTION 'reddedilen denemeler profili sildi'; END IF;

  -- 5) Ahmet silinir → Ayşe'nin ve Can'ın ortak analizleri + snapshot'ları + notları BİREBİR korunur.
  SELECT string_agg(md5(a.id::text || a.profile_snapshot::text || a.method_snapshot::text || a.technical_snapshot::text || coalesce(a.provider_interp_snapshot::text, '-')
           || a.kb_snapshot::text || a.versions_snapshot::text || a.title || a.technique_params::text || a.analysis_at::text
           || coalesce((SELECT string_agg(nn.section_key || nn.body, '|') FROM public.astro_analysis_notes nn WHERE nn.analysis_id = a.id), '')), ',' ORDER BY a.id)
    INTO fp_before FROM public.astro_analyses a WHERE a.id IN (a_syn, a_comp, a_can, c_comp);
  r := public.astro_profile_delete(ta, u, exp);
  IF (r->>'deleted_profiles')::int <> 1 OR (r->>'deleted_analyses')::int <> 2 OR (r->>'preserved_shared_analyses')::int <> 4 THEN
    RAISE EXCEPTION 'silme sonucu: %', r;
  END IF;
  SELECT string_agg(md5(a.id::text || a.profile_snapshot::text || a.method_snapshot::text || a.technical_snapshot::text || coalesce(a.provider_interp_snapshot::text, '-')
           || a.kb_snapshot::text || a.versions_snapshot::text || a.title || a.technique_params::text || a.analysis_at::text
           || coalesce((SELECT string_agg(nn.section_key || nn.body, '|') FROM public.astro_analysis_notes nn WHERE nn.analysis_id = a.id), '')), ',' ORDER BY a.id)
    INTO fp_after FROM public.astro_analyses a WHERE a.id IN (a_syn, a_comp, a_can, c_comp);
  IF fp_after IS DISTINCT FROM fp_before THEN RAISE EXCEPTION 'ortak analiz snapshot''ı değişti/kayboldu'; END IF;
  -- Ahmet'e ait hesap verisi korunan analizde duruyor.
  SELECT count(*) INTO n FROM public.astro_analyses
   WHERE id = a_syn AND profile_snapshot->'partner'->>'label' = 'Ahmet — natal' AND profile_snapshot->'partner'->'revision'->>'birthDate' = '1980-04-04'
     AND technical_snapshot ? 'partnerBodies' AND provider_interp_snapshot IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'Ahmet''in hesap verisi ortak analizde korunmadı'; END IF;
  -- Yalnız canlı bağ kalktı; ortak analiz sayısı aynen.
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id IN (a_syn, a_comp, c_comp) AND partner_profile_id IS NULL AND partner_profile_revision IS NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'canlı karşı taraf bağı kaldırılmadı'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a_can AND partner_profile_id = can;
  IF n <> 1 THEN RAISE EXCEPTION 'ilgisiz ortak analizin bağı değişti'; END IF;
  -- Ahmet'in kendi kayıtları ve Ahmet verisini içeren önbellek gitti; kayıtlı analizin result bağı NULL.
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id = ahmet;
  IF n <> 0 THEN RAISE EXCEPTION 'profil silinmedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profile_revisions WHERE profile_id = ahmet;
  IF n <> 0 THEN RAISE EXCEPTION 'revizyonlar kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = ahmet;
  IF n <> 0 THEN RAISE EXCEPTION 'Ahmet''in kendi analizleri kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_expert_notes WHERE profile_id = ahmet;
  IF n <> 0 THEN RAISE EXCEPTION 'Ahmet notları kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_results WHERE id = rid OR profile_id = ahmet OR partner_profile_id = ahmet;
  IF n <> 0 THEN RAISE EXCEPTION 'Ahmet verisini içeren önbellek kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a_syn AND result_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'analiz result bağı NULL olmadı'; END IF;

  -- 6) Tekrar → bulunamadı, hiçbir şey değişmez.
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(ta, u, exp);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'tekrar silme hata vermedi'; END IF;

  -- 7) Toplu: X, Y, Z (Z arşivli). X–Y ortak analizi (sahibi X) X ile birlikte silinir; Ayşe–Y analizi KORUNUR.
  r := public.astro_profile_create(ta, u, NULL, 'X', '1971-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1971-01-01T10:00:00Z'); x := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Y', '1972-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1972-01-01T10:00:00Z'); y := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Z', '1973-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1973-01-01T10:00:00Z'); z := (r->>'profile_id')::uuid;
  UPDATE public.astro_birth_profiles SET archived_at = now() WHERE id = z;
  PERFORM public.astro_analysis_save_v2(ta, u, x, 1, y, 1, NULL, 'western.synastry', 'X & Y', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  r := public.astro_analysis_save_v2(ta, u, ayse, 1, y, 1, NULL, 'western.synastry', 'Ayşe & Y', gen_random_uuid(), '{}', '{"partner":{"label":"Y"}}', '{}', '{"y":1}', '[]', false, NULL, '{}', '[]');
  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[x, y, z]);
  SELECT sum(shared_preserved_count) INTO n FROM public.astro_profile_delete_preview(ta, u, ARRAY[x, y, z]);
  IF n <> 1 THEN RAISE EXCEPTION 'toplu önizleme korunacak ortak analiz 1 olmalı, %', n; END IF;
  -- Kısmi başarısızlık: seçimde yabancı (başka tenant) profil → HİÇBİRİ silinmez.
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(ta, u, exp || jsonb_build_array(jsonb_build_object('id', pbx, 'current_revision', 1, 'updated_ms', 0, 'own', 1, 'shared', 0)));
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'yabancı profil içeren toplu silme hata vermedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id IN (x, y, z);
  IF n <> 3 THEN RAISE EXCEPTION 'kısmi başarısızlıkta profil silindi (% kaldı)', n; END IF;
  r := public.astro_profile_delete(ta, u, exp);
  IF (r->>'deleted_profiles')::int <> 3 THEN RAISE EXCEPTION 'toplu silme: %', r; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE title = 'Ayşe & Y' AND partner_profile_id IS NULL AND technical_snapshot = '{"y":1}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION 'toplu silmede ortak analiz kayboldu'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE title = 'X & Y';
  IF n <> 0 THEN RAISE EXCEPTION 'silinen profilin kendi analizi kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id IN (ayse, can);
  IF n <> 2 THEN RAISE EXCEPTION 'silinmeyecek profiller etkilendi'; END IF;

  -- 8) Başka tenant aynen.
  SELECT string_agg(md5(row(a.*)::text), ',' ORDER BY a.id) INTO tb_after FROM public.astro_analyses a WHERE a.tenant_id = tb;
  IF tb_after IS DISTINCT FROM tb_before THEN RAISE EXCEPTION 'başka tenant etkilendi'; END IF;

  -- 9) Sınır: boş / 100'den fazla.
  ok := false;
  BEGIN PERFORM public.astro_profile_delete(ta, u, '[]'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'boş silme isteği kabul edildi'; END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.astro_profile_delete(uuid, uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.astro_profile_delete(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon/authenticated silme fonksiyonunu çalıştırabiliyor';
  END IF;
  IF (SELECT confdeltype FROM pg_constraint WHERE conname = 'astro_an_partner_fk') <> 'n'
     OR (SELECT confdeltype FROM pg_constraint WHERE conname = 'astro_an_partner_owner_fk') <> 'a' THEN
    RAISE EXCEPTION 'ortak analiz FK eylemleri beklenen değil';
  END IF;
END
$$;
