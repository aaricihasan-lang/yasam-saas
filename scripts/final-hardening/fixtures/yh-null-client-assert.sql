-- P1-1 / M2 davranış doğrulaması (hata fırlatırsa FAIL)
DO $$
DECLARE
  t  constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  c1 constant uuid := '11111111-1111-4111-8111-111111111111';
  c2 constant uuid := '22222222-2222-4222-8222-222222222222';
  g  uuid; a uuid; s uuid; n integer; ev bigint; r record; ok boolean;
BEGIN
  DELETE FROM public.yasam_hafizasi_client_outbox;

  -- (1) "Genel" randevu: INSERT / UPDATE / DELETE → 0 outbox satırı, hata YOK
  INSERT INTO public.appointments (tenant_id, client_id, title) VALUES (t, NULL, 'Genel') RETURNING id INTO g;
  UPDATE public.appointments SET title = 'Genel 2' WHERE id = g;
  DELETE FROM public.appointments WHERE id = g;
  SELECT count(*) INTO n FROM public.yasam_hafizasi_client_outbox;
  IF n <> 0 THEN RAISE EXCEPTION 'Genel randevu CRUD outbox üretti (% satır)', n; END IF;

  -- (2) Danışanlı INSERT → 1 upsert (aktif kaynak → enqueued_active=true)
  INSERT INTO public.appointments (tenant_id, client_id, title) VALUES (t, c1, 'Danışanlı') RETURNING id INTO a;
  SELECT count(*) INTO n FROM public.yasam_hafizasi_client_outbox WHERE source_id = a;
  IF n <> 1 THEN RAISE EXCEPTION 'danışanlı insert outbox satırı % (1 bekleniyor)', n; END IF;
  SELECT * INTO r FROM public.yasam_hafizasi_client_outbox WHERE source_id = a;
  IF r.operation <> 'upsert' OR r.client_id <> c1 OR r.tenant_id <> t OR r.source_table <> 'appointments'
     OR r.source_key <> 'danisan:appointments' OR r.enqueued_active IS NOT TRUE THEN
    RAISE EXCEPTION 'danışanlı insert yanlış satır: op=% client=% active=%', r.operation, r.client_id, r.enqueued_active;
  END IF;

  -- (3) client → null UPDATE → operation='delete' + OLD client_id (deindex)
  UPDATE public.appointments SET client_id = NULL WHERE id = a;
  SELECT * INTO r FROM public.yasam_hafizasi_client_outbox WHERE source_id = a;
  IF r.operation <> 'delete' OR r.client_id <> c1 OR r.tenant_id <> t THEN
    RAISE EXCEPTION 'client→null update delete+OLD client üretmedi: op=% client=%', r.operation, r.client_id;
  END IF;
  SELECT count(*) INTO n FROM public.yasam_hafizasi_client_outbox;
  IF n <> 1 THEN RAISE EXCEPTION 'client→null sonrası beklenmeyen satır sayısı %', n; END IF;

  -- (4) null → null UPDATE → outbox'a dokunulmaz (event_version sabit)
  SELECT event_version INTO ev FROM public.yasam_hafizasi_client_outbox WHERE source_id = a;
  UPDATE public.appointments SET title = 'hâlâ genel' WHERE id = a;
  IF (SELECT event_version FROM public.yasam_hafizasi_client_outbox WHERE source_id = a) <> ev THEN
    RAISE EXCEPTION 'null→null update outbox satırını değiştirdi';
  END IF;

  -- (5) null → client UPDATE → upsert (yeni client)
  UPDATE public.appointments SET client_id = c2 WHERE id = a;
  SELECT * INTO r FROM public.yasam_hafizasi_client_outbox WHERE source_id = a;
  IF r.operation <> 'upsert' OR r.client_id <> c2 THEN
    RAISE EXCEPTION 'null→client update upsert üretmedi: op=% client=%', r.operation, r.client_id;
  END IF;

  -- (6) danışanlı DELETE → delete op
  DELETE FROM public.appointments WHERE id = a;
  SELECT * INTO r FROM public.yasam_hafizasi_client_outbox WHERE source_id = a;
  IF r.operation <> 'delete' OR r.client_id <> c2 THEN
    RAISE EXCEPTION 'danışanlı delete op=% client=%', r.operation, r.client_id;
  END IF;

  -- (7) Diğer 5 tablo: client_id NULL → RAISE AYNEN (fail-closed); kaynak satır ROLLBACK
  ok := false;
  BEGIN
    INSERT INTO public.client_stones (tenant_id, client_id, note) VALUES (t, NULL, 'x');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM LIKE '%client_id null%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'client_stones null client_id artık raise etmiyor'; END IF;
  IF EXISTS (SELECT 1 FROM public.client_stones) THEN RAISE EXCEPTION 'client_stones satırı rollback olmadı'; END IF;

  ok := false;
  INSERT INTO public.client_stones (tenant_id, client_id, note) VALUES (t, c1, 'x') RETURNING id INTO s;
  BEGIN
    UPDATE public.client_stones SET client_id = NULL WHERE id = s;
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'client_stones client→null update raise etmiyor'; END IF;
  SELECT * INTO r FROM public.yasam_hafizasi_client_outbox WHERE source_id = s;
  IF r.operation <> 'upsert' OR r.client_id <> c1 OR r.enqueued_active IS NOT FALSE THEN
    RAISE EXCEPTION 'client_stones normal insert (inactive kaynak) beklenmedik: op=% active=%', r.operation, r.enqueued_active;
  END IF;

  ok := false;
  BEGIN INSERT INTO public.client_notes (tenant_id, client_id) VALUES (t, NULL);
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'client_notes null raise etmiyor'; END IF;
  ok := false;
  BEGIN INSERT INTO public.client_sessions (tenant_id, client_id) VALUES (t, NULL);
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'client_sessions null raise etmiyor'; END IF;
  ok := false;
  BEGIN INSERT INTO public.client_homeworks (tenant_id, client_id) VALUES (t, NULL);
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'client_homeworks null raise etmiyor'; END IF;
  ok := false;
  BEGIN INSERT INTO public.client_combinations (tenant_id, client_id) VALUES (t, NULL);
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'client_combinations null raise etmiyor'; END IF;

  -- (8) Güvenlik/ACL korunur
  IF has_function_privilege('anon', 'public.yh_client_outbox_enqueue()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.yh_client_outbox_enqueue()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon/authenticated EXECUTE açık';
  END IF;
  SELECT p.proacl::text AS acl, p.prosecdef AS secdef, p.proconfig::text AS config INTO r
  FROM pg_proc p WHERE p.oid = 'public.yh_client_outbox_enqueue()'::regprocedure;
  IF r.secdef IS NOT TRUE OR r.config NOT LIKE '%search_path=public, pg_catalog%' THEN
    RAISE EXCEPTION 'SECURITY DEFINER / search_path kayboldu (% / %)', r.secdef, r.config;
  END IF;
  IF (SELECT acl FROM public._fh_m2_acl_before) IS DISTINCT FROM r.acl THEN
    RAISE EXCEPTION 'ACL değişti: % → %', (SELECT acl FROM public._fh_m2_acl_before), r.acl;
  END IF;
  IF NOT has_function_privilege('service_role', 'public.yh_client_outbox_enqueue()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role EXECUTE kayboldu';
  END IF;
  SELECT count(*) INTO n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'yh_client_outbox_%_trg';
  IF n <> 6 THEN RAISE EXCEPTION '6 cohort trigger bekleniyor, % var', n; END IF;

  RAISE NOTICE 'M2 yh-null-client assert OK';
END $$;
