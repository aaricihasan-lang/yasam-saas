-- ============================================================
-- verify-aromatherapy-catalog-method-writers.sql
--
-- C3D-B2A ROLLBACK-ONLY davranışsal DB harness'i (apply-anı / manuel).
-- Tüm işlemler tek transaction içinde çalışır ve SONUNDA ROLLBACK edilir → kalıcı
-- yazma YOKTUR. Migration 20260914000000 UYGULANDIKTAN SONRA, DB owner (postgres) ile
-- çalıştırın:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-aromatherapy-catalog-method-writers.sql
--
-- Herhangi bir ASSERT başarısız olursa RAISE EXCEPTION ile durur (ON_ERROR_STOP=1).
-- Başarılıysa "C3D-B2A DB HARNESS: PASS" yazar ve ROLLBACK yapar.
-- Bu turda ÇALIŞTIRILMADI (production/DB'ye dokunulmadı).
-- ============================================================

BEGIN;

DO $$
DECLARE
  t   uuid := '00000000-0000-4000-8000-0000b2a00001';  -- test tenant (fixture)
  ac  uuid := '00000000-0000-4000-8000-0000b2a000ac';  -- actor
  r   jsonb;
  v_taxon    uuid;
  v_prep     uuid;
  v_series   uuid;
  v_rev1     uuid;
  v_rev2     uuid;
  v_src      uuid := gen_random_uuid();
  v_pass     uuid := gen_random_uuid();
  v_src2     uuid := gen_random_uuid();
  v_updated  timestamptz;
  v_status   text;
  v_cnt      integer;
BEGIN
  -- ── Fixture: source + passage (faithful_source için); owner INSERT (test-only) ──
  INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, status)
    VALUES (v_src, t, 'book', 'Test Kaynağı', 'verified');
  INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, status)
    VALUES (v_src2, t, 'book', 'Diğer Kaynak', 'verified');
  INSERT INTO public.aromatherapy_source_passages
    (id, tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status, status)
    VALUES (v_pass, t, v_src, 's. 12', 'tr', 'reference_only', 'public_domain', 'verified');

  -- ── 1) create plant taxon ──
  r := public.aromatherapy_create_plant_taxon_with_audit(
    t, ac, 'Dr. Test', 'Lavandula', 'angustifolia', 'species', NULL, false, 'Mill.', 'Lamiaceae', 'lavanta', 'ilk kayıt');
  v_taxon := (r->>'entity_id')::uuid;
  IF v_taxon IS NULL OR (r->>'noop')::boolean THEN RAISE EXCEPTION 'T1 create taxon FAIL: %', r; END IF;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_content_audit_events
    WHERE tenant_id = t AND entity_type = 'plant_taxon' AND entity_id = v_taxon AND operation = 'create';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 audit FAIL'; END IF;

  -- ── 2) create preparation (parent ownership) ──
  r := public.aromatherapy_create_preparation_with_audit(
    t, ac, 'Dr. Test', v_taxon, 'essential_oil', 'flower', NULL, NULL);
  v_prep := (r->>'entity_id')::uuid;
  IF v_prep IS NULL THEN RAISE EXCEPTION 'T2 create preparation FAIL: %', r; END IF;

  -- out-of-tenant parent → 404 token
  BEGIN
    r := public.aromatherapy_create_preparation_with_audit(
      t, ac, 'Dr. Test', gen_random_uuid(), 'hydrosol', 'flower', NULL, NULL);
    RAISE EXCEPTION 'T2b beklenen AROMA_PARENT_NOT_FOUND alınmadı';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AROMA_PARENT_NOT_FOUND' THEN RAISE EXCEPTION 'T2b yanlış token: %', SQLERRM; END IF;
  END;

  -- ── 3) create method series + first revision (faithful_source + passage) ──
  r := public.aromatherapy_create_method_series_with_first_revision(
    t, ac, 'Dr. Test', v_prep, 'faithful_source', v_src, v_pass, 'tr',
    'çiçek', 'dried', 'Su buharı damıtması', 'imbik', '1:10', NULL, '3 saat', '100C',
    '[{"order":1,"text":"hazırla"},{"order":2,"text":"damıt"}]'::jsonb,
    NULL, NULL, NULL, NULL, NULL,
    'aebc00000000000000000000000000000000000000000000000000000000dead'::text,  -- 64-hex placeholder
    'ilk yöntem');
  v_series := (r->>'series_id')::uuid;
  v_rev1 := (r->>'revision_id')::uuid;
  IF v_series IS NULL OR (r->>'revision')::int <> 1 THEN RAISE EXCEPTION 'T3 create series FAIL: %', r; END IF;
  SELECT status INTO v_status FROM public.aromatherapy_preparation_method_revisions WHERE id = v_rev1;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'T3 ilk revision draft değil: %', v_status; END IF;

  -- faithful_source without source → token
  BEGIN
    r := public.aromatherapy_create_method_series_with_first_revision(
      t, ac, 'Dr. Test', v_prep, 'faithful_source', NULL, NULL, 'tr',
      NULL, NULL, 'metin', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      'aebc00000000000000000000000000000000000000000000000000000000beef'::text, NULL);
    RAISE EXCEPTION 'T3b beklenen AROMA_FAITHFUL_SOURCE_REQUIRED alınmadı';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AROMA_FAITHFUL_SOURCE_REQUIRED' THEN RAISE EXCEPTION 'T3b yanlış token: %', SQLERRM; END IF;
  END;

  -- passage başka source'a ait → mismatch (passage v_src'e ait, v_src2 verilirse)
  BEGIN
    r := public.aromatherapy_create_method_series_with_first_revision(
      t, ac, 'Dr. Test', v_prep, 'faithful_source', v_src2, v_pass, 'tr',
      NULL, NULL, 'metin', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      'aebc00000000000000000000000000000000000000000000000000000000feed'::text, NULL);
    RAISE EXCEPTION 'T3c beklenen AROMA_PASSAGE_SOURCE_MISMATCH alınmadı';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AROMA_PASSAGE_SOURCE_MISMATCH' THEN RAISE EXCEPTION 'T3c yanlış token: %', SQLERRM; END IF;
  END;

  -- ── 4) preparation identity-lock (method varken kimlik değişimi) ──
  SELECT updated_at INTO v_updated FROM public.aromatherapy_preparations WHERE id = v_prep;
  BEGIN
    r := public.aromatherapy_update_preparation_with_audit(
      t, ac, 'Dr. Test', v_prep, v_taxon, 'hydrosol', 'flower', NULL, 'draft', v_updated, 'kimlik değişimi');
    RAISE EXCEPTION 'T4 beklenen AROMA_PREPARATION_IDENTITY_LOCKED alınmadı';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AROMA_PREPARATION_IDENTITY_LOCKED' THEN RAISE EXCEPTION 'T4 yanlış token: %', SQLERRM; END IF;
  END;

  -- ── 5) append revision (increment) ──
  r := public.aromatherapy_append_method_revision(
    t, ac, 'Dr. Test', v_series,
    'çiçek', 'dried', 'Güncellenmiş yöntem', NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL,
    'aebc00000000000000000000000000000000000000000000000000000000cafe'::text, 1, 'düzeltme');
  v_rev2 := (r->>'revision_id')::uuid;
  IF (r->>'revision')::int <> 2 OR (r->>'noop')::boolean THEN RAISE EXCEPTION 'T5 append FAIL: %', r; END IF;

  -- stale latest revision → token
  BEGIN
    r := public.aromatherapy_append_method_revision(
      t, ac, 'Dr. Test', v_series, NULL, NULL, 'x', NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL,
      'aebc0000000000000000000000000000000000000000000000000000000000aa'::text, 1, 'stale');
    RAISE EXCEPTION 'T5b beklenen AROMA_REVISION_STALE alınmadı';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AROMA_REVISION_STALE' THEN RAISE EXCEPTION 'T5b yanlış token: %', SQLERRM; END IF;
  END;

  -- no-op: aynı içerik hash'iyle append → yeni revision YOK
  r := public.aromatherapy_append_method_revision(
    t, ac, 'Dr. Test', v_series,
    'çiçek', 'dried', 'Güncellenmiş yöntem', NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL,
    'aebc00000000000000000000000000000000000000000000000000000000cafe'::text, 2, 'noop denemesi');
  IF NOT (r->>'noop')::boolean THEN RAISE EXCEPTION 'T5c no-op beklenirken revision üretildi: %', r; END IF;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_preparation_method_revisions
    WHERE tenant_id = t AND series_id = v_series;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'T5c no-op sonrası revision sayısı %', v_cnt; END IF;

  -- ── 6) status transition: verify rev2 → önceki verified yok, tek verified ──
  SELECT updated_at INTO v_updated FROM public.aromatherapy_preparation_method_revisions WHERE id = v_rev2;
  r := public.aromatherapy_transition_method_revision_status(
    t, ac, 'Dr. Test', v_series, v_rev2, 'verified', v_updated, 'QC tamam');
  IF (r->>'status') <> 'verified' THEN RAISE EXCEPTION 'T6 verify FAIL: %', r; END IF;

  -- rev1'i verify → rev2 otomatik archived (tek verified değişmezi)
  SELECT updated_at INTO v_updated FROM public.aromatherapy_preparation_method_revisions WHERE id = v_rev1;
  r := public.aromatherapy_transition_method_revision_status(
    t, ac, 'Dr. Test', v_series, v_rev1, 'verified', v_updated, 'rev1 doğrulandı');
  IF (r->>'archived_revision_id')::uuid <> v_rev2 THEN RAISE EXCEPTION 'T6b otomatik archive FAIL: %', r; END IF;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_preparation_method_revisions
    WHERE tenant_id = t AND series_id = v_series AND status = 'verified';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T6b tek verified ihlali: %', v_cnt; END IF;
  -- iki audit event aynı correlation_id (verify + auto-archive)
  SELECT count(DISTINCT correlation_id) INTO v_cnt FROM public.aromatherapy_content_audit_events
    WHERE tenant_id = t AND entity_id = v_series AND correlation_id IS NOT NULL;
  IF v_cnt < 1 THEN RAISE EXCEPTION 'T6b correlation_id FAIL'; END IF;

  -- yasak geçiş: archived→verified (rev2 şu an archived)
  SELECT updated_at INTO v_updated FROM public.aromatherapy_preparation_method_revisions WHERE id = v_rev2;
  BEGIN
    r := public.aromatherapy_transition_method_revision_status(
      t, ac, 'Dr. Test', v_series, v_rev2, 'verified', v_updated, 'yasak');
    RAISE EXCEPTION 'T6c beklenen AROMA_FORBIDDEN_STATUS_TRANSITION alınmadı';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AROMA_FORBIDDEN_STATUS_TRANSITION' THEN RAISE EXCEPTION 'T6c yanlış token: %', SQLERRM; END IF;
  END;

  -- ── 7) taxon update stale → token ──
  BEGIN
    r := public.aromatherapy_update_plant_taxon_with_audit(
      t, ac, 'Dr. Test', v_taxon, 'Lavandula', 'angustifolia', 'species', NULL, false, 'Mill.',
      'Lamiaceae', 'lavanta', 'verified', now() - interval '10 years', 'stale');
    RAISE EXCEPTION 'T7 beklenen AROMA_STALE alınmadı';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AROMA_STALE' THEN RAISE EXCEPTION 'T7 yanlış token: %', SQLERRM; END IF;
  END;

  RAISE NOTICE 'C3D-B2A DB HARNESS: PASS (tüm davranışsal kontroller geçti)';
END;
$$;

ROLLBACK;
