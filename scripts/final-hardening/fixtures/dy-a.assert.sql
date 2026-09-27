-- DY-A davranış doğrulaması (hata fırlatırsa FAIL)
DO $$
DECLARE n integer; ok boolean;
BEGIN
  -- 0300: aynı (tenant, request_id) ikinci kez eklenemez; NULL'lar serbest
  INSERT INTO public.clients (tenant_id, ad, create_request_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X', '99999999-9999-4999-8999-999999999999');
  ok := false;
  BEGIN
    INSERT INTO public.clients (tenant_id, ad, create_request_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X2', '99999999-9999-4999-8999-999999999999');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'create_request_id unique çalışmıyor'; END IF;
  INSERT INTO public.clients (tenant_id, ad) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'N1'), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'N2');
  -- farklı tenant aynı request_id serbest
  INSERT INTO public.clients (tenant_id, ad, create_request_id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Y', '99999999-9999-4999-8999-999999999999');

  -- 0400: ikinci not satırı reddedilir
  ok := false;
  BEGIN
    INSERT INTO public.client_notes (tenant_id, client_id, notlar) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'x');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'client_notes unique çalışmıyor'; END IF;

  -- 0500: danışan silinince snapshot cascade silinir; yetim eklenemez
  DELETE FROM public.clients WHERE id = '22222222-2222-4222-8222-222222222222';
  SELECT count(*) INTO n FROM public.yasam_hafizasi_report_snapshots WHERE client_id = '22222222-2222-4222-8222-222222222222';
  IF n <> 0 THEN RAISE EXCEPTION 'snapshot cascade çalışmıyor (% kaldı)', n; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.yasam_hafizasi_report_snapshots (tenant_id, client_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333');
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'yetim snapshot eklenebildi'; END IF;
  RAISE NOTICE 'DY-A assert OK';
END $$;
