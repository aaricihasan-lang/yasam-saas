-- HDAY / migration 0800 doğrulama. Hata fırlatırsa pg-migration-check FAIL verir.
-- RPC service_role rolüyle çağrılır (tablo DML yetkisi YOK → SECURITY DEFINER zorunlu yol).
DO $$
DECLARE
  A  constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  B  constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  U  constant uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  s1 constant uuid := '11111111-1111-1111-1111-111111111111';
  s2 constant uuid := '22222222-2222-2222-2222-222222222222';
  s3 constant uuid := '33333333-3333-3333-3333-333333333333';
  sb constant uuid := '44444444-4444-4444-4444-444444444444';
  v_ts   timestamptz;
  v_msg  text;
  v_det  text;
  v_res  jsonb;
  v_n    int;
BEGIN
  -- Grants: anon/authenticated EXECUTE yok, service_role var.
  IF has_function_privilege('anon', 'public.aromatherapy_delete_source_with_audit(uuid,uuid,text,uuid,timestamptz,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT anon EXECUTE olmamalı';
  END IF;
  IF has_function_privilege('authenticated', 'public.aromatherapy_delete_source_with_audit(uuid,uuid,text,uuid,timestamptz,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT authenticated EXECUTE olmamalı';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.aromatherapy_delete_source_with_audit(uuid,uuid,text,uuid,timestamptz,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT service_role EXECUTE olmalı';
  END IF;
  IF has_table_privilege('service_role', 'public.aromatherapy_sources', 'DELETE') THEN
    RAISE EXCEPTION 'ASSERT service_role doğrudan DELETE yetkisi olmamalı';
  END IF;

  -- 1) Başka tenant kaydı → NOT_FOUND (A tenant'ı B'nin kaynağını silemez).
  SELECT updated_at INTO v_ts FROM public.aromatherapy_sources WHERE id = sb;
  BEGIN
    PERFORM public.aromatherapy_delete_source_with_audit(A, U, 'Uzman A', sb, v_ts, 'test');
    RAISE EXCEPTION 'ASSERT cross-tenant silme reddedilmeliydi';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'AROMA_SOURCE_NOT_FOUND' THEN RAISE EXCEPTION 'ASSERT beklenen NOT_FOUND, gelen %', v_msg; END IF;
  END;

  -- 2) Referanslı (2 pasaj + 1 claim) → AROMA_SOURCE_REFERENCED + sayılar.
  SELECT updated_at INTO v_ts FROM public.aromatherapy_sources WHERE id = s2;
  BEGIN
    PERFORM public.aromatherapy_delete_source_with_audit(A, U, 'Uzman A', s2, v_ts, 'test');
    RAISE EXCEPTION 'ASSERT referanslı silme reddedilmeliydi';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
    IF v_msg <> 'AROMA_SOURCE_REFERENCED' THEN RAISE EXCEPTION 'ASSERT beklenen REFERENCED, gelen %', v_msg; END IF;
    IF (v_det::jsonb ->> 'passages')::int <> 2 OR (v_det::jsonb ->> 'claim_sources')::int <> 1
       OR (v_det::jsonb ->> 'method_series')::int <> 0 THEN
      RAISE EXCEPTION 'ASSERT referans sayıları yanlış: %', v_det;
    END IF;
  END;

  -- 3) Method series referansı → REFERENCED.
  SELECT updated_at INTO v_ts FROM public.aromatherapy_sources WHERE id = s3;
  BEGIN
    PERFORM public.aromatherapy_delete_source_with_audit(A, U, 'Uzman A', s3, v_ts, 'test');
    RAISE EXCEPTION 'ASSERT method referanslı silme reddedilmeliydi';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
    IF v_msg <> 'AROMA_SOURCE_REFERENCED' OR (v_det::jsonb ->> 'method_series')::int <> 1 THEN
      RAISE EXCEPTION 'ASSERT method referans: % %', v_msg, v_det;
    END IF;
  END;

  -- 4) Eski updated_at → AROMA_STALE.
  BEGIN
    PERFORM public.aromatherapy_delete_source_with_audit(A, U, 'Uzman A', s1, '2000-01-01T00:00:00Z', 'test');
    RAISE EXCEPTION 'ASSERT stale reddedilmeliydi';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'AROMA_STALE' THEN RAISE EXCEPTION 'ASSERT beklenen STALE, gelen %', v_msg; END IF;
  END;

  -- 5) Gerekçe boş → AROMA_REASON_INVALID.
  SELECT updated_at INTO v_ts FROM public.aromatherapy_sources WHERE id = s1;
  BEGIN
    PERFORM public.aromatherapy_delete_source_with_audit(A, U, 'Uzman A', s1, v_ts, '   ');
    RAISE EXCEPTION 'ASSERT boş gerekçe reddedilmeliydi';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'AROMA_REASON_INVALID' THEN RAISE EXCEPTION 'ASSERT beklenen REASON_INVALID, gelen %', v_msg; END IF;
  END;

  -- 6) Referanssız + doğru sürüm → service_role ile silinir; audit + tombstone yazılır.
  SET LOCAL ROLE service_role;
  v_res := public.aromatherapy_delete_source_with_audit(A, U, 'Uzman A', s1, v_ts, 'Artık kullanılmıyor');
  RESET ROLE;
  IF (v_res ->> 'entity_id')::uuid <> s1 OR (v_res ->> 'deleted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT silme sonucu beklenmedik: %', v_res;
  END IF;
  SELECT count(*) INTO v_n FROM public.aromatherapy_sources WHERE id = s1;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT s1 silinmeliydi'; END IF;
  SELECT count(*) INTO v_n FROM public.aromatherapy_content_audit_events
   WHERE entity_type = 'source' AND entity_id = s1 AND operation = 'delete'
     AND previous_summary ->> 'title' = 'Kullanılmayan Kaynak' AND reason = 'Artık kullanılmıyor'
     AND previous_content_hash ~ '^[0-9a-f]{64}$';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT delete audit satırı yok'; END IF;
  SELECT count(*) INTO v_n FROM public.aromatherapy_content_delete_tombstones
   WHERE entity_type = 'source' AND entity_id = s1 AND deletion_mode = 'single'
     AND tenant_id = A AND content_hash ~ '^[0-9a-f]{64}$';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT tombstone satırı yok'; END IF;

  -- 7) Diğer kayıtlar etkilenmedi.
  SELECT count(*) INTO v_n FROM public.aromatherapy_sources;
  IF v_n <> 3 THEN RAISE EXCEPTION 'ASSERT diğer kaynaklar korunmalı (kalan %)', v_n; END IF;

  -- 8) Tekrar silme → NOT_FOUND (idempotent-güvenli; sahte başarı yok).
  BEGIN
    PERFORM public.aromatherapy_delete_source_with_audit(A, U, 'Uzman A', s1, v_ts, 'tekrar');
    RAISE EXCEPTION 'ASSERT ikinci silme NOT_FOUND olmalı';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'AROMA_SOURCE_NOT_FOUND' THEN RAISE EXCEPTION 'ASSERT beklenen NOT_FOUND (2.), gelen %', v_msg; END IF;
  END;

  RAISE NOTICE 'hday-aroma-0800 assert: OK';
END $$;
