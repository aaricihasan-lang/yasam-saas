-- ANAMNEZ V1 assert: grant/RLS, completed kilidi, değişmez kolonlar, tek taslak, çapraz tenant,
-- ek sınırı + yol bağlama, SET NULL istisnası, danışan cascade, bucket + policy durumu.
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  c1 uuid := '11111111-1111-4111-8111-111111111111';
  c2 uuid := '22222222-2222-4222-8222-222222222222';
  c3 uuid := '33333333-3333-4333-8333-333333333333';
  u  uuid := '99999999-9999-4999-8999-999999999999';
  a1 uuid;
  a2 uuid;
  a3 uuid;
  n integer;
  ok boolean;
  t0 timestamptz;
  t1 timestamptz;
  p text;
  i integer;
BEGIN
  -- ── Grant / RLS ─────────────────────────────────────────────────────────────
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_anamneses'::regclass) THEN
    RAISE EXCEPTION 'client_anamneses RLS kapalı';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_anamnesis_attachments'::regclass) THEN
    RAISE EXCEPTION 'client_anamnesis_attachments RLS kapalı';
  END IF;
  IF has_table_privilege('anon', 'public.client_anamneses', 'SELECT')
     OR has_table_privilege('anon', 'public.client_anamneses', 'INSERT')
     OR has_table_privilege('authenticated', 'public.client_anamneses', 'SELECT')
     OR has_table_privilege('authenticated', 'public.client_anamneses', 'UPDATE')
     OR has_table_privilege('anon', 'public.client_anamnesis_attachments', 'SELECT')
     OR has_table_privilege('authenticated', 'public.client_anamnesis_attachments', 'DELETE') THEN
    RAISE EXCEPTION 'anon/authenticated tablo yetkisi olmamalı';
  END IF;
  IF NOT (has_table_privilege('service_role', 'public.client_anamneses', 'SELECT')
          AND has_table_privilege('service_role', 'public.client_anamneses', 'INSERT')
          AND has_table_privilege('service_role', 'public.client_anamneses', 'UPDATE')
          AND has_table_privilege('service_role', 'public.client_anamneses', 'DELETE')) THEN
    RAISE EXCEPTION 'service_role client_anamneses allowlist eksik';
  END IF;
  IF NOT (has_table_privilege('service_role', 'public.client_anamnesis_attachments', 'SELECT')
          AND has_table_privilege('service_role', 'public.client_anamnesis_attachments', 'INSERT')
          AND has_table_privilege('service_role', 'public.client_anamnesis_attachments', 'DELETE'))
     OR has_table_privilege('service_role', 'public.client_anamnesis_attachments', 'UPDATE')
     OR has_table_privilege('service_role', 'public.client_anamneses', 'TRUNCATE') THEN
    RAISE EXCEPTION 'service_role attachments allowlist yanlış';
  END IF;
  IF has_function_privilege('anon', 'public.client_anamneses_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.client_anamnesis_attachments_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger fonksiyonlarında anon/authenticated EXECUTE olmamalı';
  END IF;

  -- ── Taslak oluştur ─────────────────────────────────────────────────────────
  INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id, client_snapshot, updated_at)
  VALUES (ta, c1, 'initial', '2026-09-28', 'std-v1', u, '{"ad":"Danışan A1"}', '2020-01-01T00:00:00Z')
  RETURNING id INTO a1;

  -- Tek açık taslak.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id)
    VALUES (ta, c1, 'update', '2026-09-29', 'std-v1', u);
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'ikinci taslak engellenmedi'; END IF;

  -- Çapraz tenant: tenant B + tenant A danışanı → FK ihlali.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id)
    VALUES (tb, c1, 'initial', '2026-09-28', 'std-v1', u);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'çapraz tenant insert engellenmedi'; END IF;

  -- Geçersiz şablon sürümü / jsonb tipi.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id)
    VALUES (ta, c2, 'initial', '2026-09-28', 'custom', u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'geçersiz template_version kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id, answers)
    VALUES (ta, c2, 'initial', '2026-09-28', 'std-v1', u, '[]');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'dizi answers kabul edildi'; END IF;

  -- Tamamlanmış görünümlü ama completed_at'siz satır → CHECK.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id, status)
    VALUES (ta, c2, 'initial', '2026-09-28', 'std-v1', u, 'completed');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'completed_at olmadan completed kabul edildi'; END IF;

  -- Taslak güncellenebilir; updated_at trigger'la now()'a çekilir (istemci değeri yok sayılır).
  UPDATE public.client_anamneses SET answers = '{"A.reason":"x"}', revision = revision + 1, updated_at = '2019-01-01T00:00:00Z' WHERE id = a1;
  SELECT updated_at INTO t1 FROM public.client_anamneses WHERE id = a1;
  IF t1 <> now() THEN RAISE EXCEPTION 'updated_at trigger ile güncellenmedi (%).', t1; END IF;

  -- Taslakta değişmez kolonlar.
  ok := false;
  BEGIN
    UPDATE public.client_anamneses SET client_snapshot = '{"ad":"değişti"}' WHERE id = a1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'client_snapshot değiştirilebildi'; END IF;
  ok := false;
  BEGIN
    UPDATE public.client_anamneses SET template_version = 'std-v2' WHERE id = a1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'template_version değiştirilebildi'; END IF;
  ok := false;
  BEGIN
    UPDATE public.client_anamneses SET client_id = c2 WHERE id = a1;
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'client_id değiştirilebildi'; END IF;

  -- ── Ekler ──────────────────────────────────────────────────────────────────
  p := ta::text || '/' || c1::text || '/' || a1::text || '/';
  INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
  VALUES (ta, c1, a1, p || '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e01.pdf', 'form.pdf', 1234, repeat('a', 64), u);

  -- Yol başka tenant önekinde → CHECK.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
    VALUES (ta, c1, a1, tb::text || '/' || c1::text || '/' || a1::text || '/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e02.pdf', 'x.pdf', 10, repeat('b', 64), u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'yabancı önekli yol kabul edildi'; END IF;

  -- Traversal / uzantı dışı ad → CHECK.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
    VALUES (ta, c1, a1, p || '../x.pdf', 'x.pdf', 10, repeat('b', 64), u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'traversal yol kabul edildi'; END IF;

  -- Başka danışanın anamnezine ek (client_id uyuşmaz) → FK.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
    VALUES (ta, c2, a1, ta::text || '/' || c2::text || '/' || a1::text || '/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e03.pdf', 'x.pdf', 10, repeat('b', 64), u);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'danışan uyuşmayan ek kabul edildi'; END IF;

  -- Boyut / MIME CHECK.
  ok := false;
  BEGIN
    INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
    VALUES (ta, c1, a1, p || '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e04.pdf', 'x.pdf', 10485761, repeat('b', 64), u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION '10 MB üstü kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, mime_type, sha256, uploaded_by_user_id)
    VALUES (ta, c1, a1, p || '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e05.pdf', 'x.pdf', 10, 'image/png', repeat('b', 64), u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'PDF dışı MIME kabul edildi'; END IF;

  -- 5'e tamamla, 6. ek → red.
  FOR i IN 6..9 LOOP
    INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
    VALUES (ta, c1, a1, p || '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0' || i::text || '.pdf', 'f.pdf', 10, repeat('c', 64), u);
  END LOOP;
  SELECT count(*) INTO n FROM public.client_anamnesis_attachments WHERE anamnesis_id = a1;
  IF n <> 5 THEN RAISE EXCEPTION 'ek sayısı % (5 beklenir)', n; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
    VALUES (ta, c1, a1, p || '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e10.pdf', 'f.pdf', 10, repeat('c', 64), u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION '6. ek engellenmedi'; END IF;

  -- Ek UPDATE → red.
  ok := false;
  BEGIN
    UPDATE public.client_anamnesis_attachments SET original_name = 'y.pdf' WHERE anamnesis_id = a1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'ek UPDATE engellenmedi'; END IF;

  -- ── Tamamla → kilit ────────────────────────────────────────────────────────
  UPDATE public.client_anamneses
     SET status = 'completed', completed_at = now(), completed_by_user_id = u, revision = revision + 1
   WHERE id = a1;

  ok := false;
  BEGIN
    UPDATE public.client_anamneses SET answers = '{"A.reason":"değişti"}' WHERE id = a1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'tamamlanmış anamnez güncellenebildi'; END IF;
  ok := false;
  BEGIN
    UPDATE public.client_anamneses SET status = 'draft', completed_at = NULL, completed_by_user_id = NULL WHERE id = a1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'completed → draft geri dönüşü engellenmedi'; END IF;
  ok := false;
  BEGIN
    UPDATE public.client_anamneses SET title = 'x' WHERE id = a1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'tamamlanmış başlık değişti'; END IF;

  -- Tamamlanmışa ek eklenebilir mi? (sonradan taranan form) — sınır 5 dolu; silip ekle.
  DELETE FROM public.client_anamnesis_attachments WHERE storage_path = p || '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e09.pdf';
  INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
  VALUES (ta, c1, a1, p || '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e11.pdf', 'later.pdf', 10, repeat('d', 64), u);

  -- ── Güncelleme: yeni satır, eskisi aynen kalır ────────────────────────────
  INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id, based_on_anamnesis_id, answers)
  SELECT tenant_id, client_id, 'update', '2027-01-15', template_version, u, id, answers FROM public.client_anamneses WHERE id = a1
  RETURNING id INTO a2;
  UPDATE public.client_anamneses SET answers = '{"A.reason":"yeni"}' WHERE id = a2;
  IF (SELECT answers->>'A.reason' FROM public.client_anamneses WHERE id = a1) <> 'x' THEN
    RAISE EXCEPTION 'eski anamnez değişti';
  END IF;
  UPDATE public.client_anamneses SET status = 'completed', completed_at = now(), completed_by_user_id = u WHERE id = a2;

  -- based_on yabancı danışanın anamnezi → FK.
  INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id)
  VALUES (ta, c2, 'initial', '2026-09-28', 'std-v1', u) RETURNING id INTO a3;
  ok := false;
  BEGIN
    INSERT INTO public.client_anamneses (tenant_id, client_id, kind, assessment_date, template_version, created_by_user_id, based_on_anamnesis_id)
    VALUES (ta, c1, 'update', '2027-02-01', 'std-v1', u, a3);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'yabancı danışan based_on kabul edildi'; END IF;

  -- İlk (tamamlanmış) anamnez silinir → tamamlanmış a2'nin yalnız based_on'u NULL olur (kilit istisnası).
  DELETE FROM public.client_anamneses WHERE id = a1;
  IF (SELECT based_on_anamnesis_id FROM public.client_anamneses WHERE id = a2) IS NOT NULL THEN
    RAISE EXCEPTION 'based_on SET NULL çalışmadı';
  END IF;
  IF (SELECT answers->>'A.reason' FROM public.client_anamneses WHERE id = a2) <> 'yeni' THEN
    RAISE EXCEPTION 'SET NULL sırasında a2 içeriği değişti';
  END IF;
  SELECT count(*) INTO n FROM public.client_anamnesis_attachments WHERE anamnesis_id = a1;
  IF n <> 0 THEN RAISE EXCEPTION 'anamnez silinince ekler cascade edilmedi (%).', n; END IF;

  -- ── Danışan silme cascade ──────────────────────────────────────────────────
  INSERT INTO public.client_anamnesis_attachments (tenant_id, client_id, anamnesis_id, storage_path, original_name, size_bytes, sha256, uploaded_by_user_id)
  VALUES (ta, c1, a2, ta::text || '/' || c1::text || '/' || a2::text || '/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e20.pdf', 'z.pdf', 10, repeat('e', 64), u);
  DELETE FROM public.clients WHERE id = c1;
  SELECT count(*) INTO n FROM public.client_anamneses WHERE client_id = c1;
  IF n <> 0 THEN RAISE EXCEPTION 'danışan silinince anamnez kaldı (%).', n; END IF;
  SELECT count(*) INTO n FROM public.client_anamnesis_attachments WHERE client_id = c1;
  IF n <> 0 THEN RAISE EXCEPTION 'danışan silinince ek metadata kaldı (%).', n; END IF;
  -- Diğer danışan etkilenmedi.
  SELECT count(*) INTO n FROM public.client_anamneses WHERE client_id = c2;
  IF n <> 1 THEN RAISE EXCEPTION 'başka danışanın anamnezi etkilendi'; END IF;

  -- ── Bucket + policy ────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'client-anamnesis-files' AND public = false
                   AND file_size_limit = 10485760 AND allowed_mime_types = ARRAY['application/pdf']::text[]) THEN
    RAISE EXCEPTION 'bucket private/limit yanlış';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
               AND (coalesce(qual, '') LIKE '%client-anamnesis-files%' OR coalesce(with_check, '') LIKE '%client-anamnesis-files%')) THEN
    RAISE EXCEPTION 'anamnez bucket policy kaldı';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'other_bucket_keep') THEN
    RAISE EXCEPTION 'başka bucket policy silindi';
  END IF;

  -- Composite unique idempotent eklendi.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.clients'::regclass AND conname = 'clients_tenant_id_id_key') THEN
    RAISE EXCEPTION 'clients_tenant_id_id_key eklenmedi';
  END IF;

  RAISE NOTICE 'anamnesis assert OK';
END $$;
