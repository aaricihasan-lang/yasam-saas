-- INFRA 0900 assert: append-only, cascade silme, view, tenant FK, grant/RLS.
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  c1 uuid := '11111111-1111-4111-8111-111111111111';
  c2 uuid := '22222222-2222-4222-8222-222222222222';
  c3 uuid := '33333333-3333-4333-8333-333333333333';
  u  uuid := '99999999-9999-4999-8999-999999999999';
  s text;
  n integer;
  ok boolean;
BEGIN
  INSERT INTO public.client_consents (tenant_id, client_id, consent_type, status, text_version, method, source, recorded_by_user_id, recorded_at)
  VALUES
    (ta, c1, 'aydinlatma_bildirildi',    'granted',   'kvkk-taslak-v0.1', 'islak_imza',    'test', u, now() - interval '2 hour'),
    (ta, c1, 'acik_riza_ozel_nitelikli', 'granted',   'kvkk-taslak-v0.1', 'uygulama_onay', 'test', u, now() - interval '1 hour'),
    (ta, c1, 'acik_riza_ozel_nitelikli', 'withdrawn', 'kvkk-taslak-v0.1', 'sozlu_kayit',   'test', u, now()),
    (ta, c2, 'iletisim_izni',            'refused',   'kvkk-taslak-v0.1', 'diger',         'test', u, now());

  -- View: danışan × tür başına en son kayıt.
  SELECT status INTO s FROM public.client_consent_current
   WHERE tenant_id = ta AND client_id = c1 AND consent_type = 'acik_riza_ozel_nitelikli';
  IF s <> 'withdrawn' THEN RAISE EXCEPTION 'view son durumu yanlış: %', s; END IF;
  SELECT count(*) INTO n FROM public.client_consent_current WHERE client_id = c1;
  IF n <> 2 THEN RAISE EXCEPTION 'view c1 satır sayısı % (2 beklenir)', n; END IF;

  -- UPDATE engellenir.
  ok := false;
  BEGIN
    UPDATE public.client_consents SET status = 'granted' WHERE client_id = c2;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'UPDATE engellenmedi'; END IF;

  -- Doğrudan DELETE engellenir (danışan hâlâ var).
  ok := false;
  BEGIN
    DELETE FROM public.client_consents WHERE client_id = c2;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'doğrudan DELETE engellenmedi'; END IF;

  -- Çapraz tenant: tenant B + tenant A'nın danışanı → FK ihlali.
  ok := false;
  BEGIN
    INSERT INTO public.client_consents (tenant_id, client_id, consent_type, status, text_version, method, recorded_by_user_id)
    VALUES (tb, c1, 'iletisim_izni', 'granted', 'v', 'diger', u);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'çapraz tenant insert engellenmedi'; END IF;

  -- CHECK: geçersiz tür reddedilir.
  ok := false;
  BEGIN
    INSERT INTO public.client_consents (tenant_id, client_id, consent_type, status, text_version, method, recorded_by_user_id)
    VALUES (ta, c1, 'pazarlama', 'granted', 'v', 'diger', u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'geçersiz consent_type kabul edildi'; END IF;

  -- KVKK silme: danışan silinince onamlar cascade ile silinir (trigger engellemez).
  DELETE FROM public.clients WHERE id = c1;
  SELECT count(*) INTO n FROM public.client_consents WHERE client_id = c1;
  IF n <> 0 THEN RAISE EXCEPTION 'cascade sonrası % onam kaldı', n; END IF;
  SELECT count(*) INTO n FROM public.client_consents WHERE client_id = c2;
  IF n <> 1 THEN RAISE EXCEPTION 'başka danışanın onamı etkilendi: %', n; END IF;

  -- Grant / RLS.
  IF has_table_privilege('anon', 'public.client_consents', 'SELECT') THEN RAISE EXCEPTION 'anon SELECT açık'; END IF;
  IF has_table_privilege('authenticated', 'public.client_consents', 'INSERT') THEN RAISE EXCEPTION 'authenticated INSERT açık'; END IF;
  IF has_table_privilege('anon', 'public.client_consent_current', 'SELECT') THEN RAISE EXCEPTION 'anon view SELECT açık'; END IF;
  IF NOT has_table_privilege('service_role', 'public.client_consents', 'INSERT') THEN RAISE EXCEPTION 'service_role INSERT yok'; END IF;
  IF has_table_privilege('service_role', 'public.client_consents', 'UPDATE') THEN RAISE EXCEPTION 'service_role UPDATE açık'; END IF;
  IF has_table_privilege('service_role', 'public.client_consents', 'DELETE') THEN RAISE EXCEPTION 'service_role DELETE açık'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_consents'::regclass) THEN RAISE EXCEPTION 'RLS kapalı'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_tenant_id_id_key') THEN RAISE EXCEPTION 'composite unique eklenmedi'; END IF;

  -- Test verisini geri al (assert yan etkisiz kalsın).
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROLLBACK_OK';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
