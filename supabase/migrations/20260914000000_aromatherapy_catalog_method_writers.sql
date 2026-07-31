-- ============================================================
-- 20260914000000_aromatherapy_catalog_method_writers.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C3D-B2A
--   (Katalog yazarları + Üretim/Elde Ediliş yöntem backend'i)
--
-- KAPSAM (tek transaction, fail-fast; IF NOT EXISTS / CREATE OR REPLACE / sessiz DO YOK):
--   1. aromatherapy_create_plant_taxon_with_audit
--   2. aromatherapy_update_plant_taxon_with_audit
--   3. aromatherapy_create_preparation_with_audit
--   4. aromatherapy_update_preparation_with_audit
--   5. aromatherapy_create_method_series_with_first_revision
--   6. aromatherapy_append_method_revision
--   7. aromatherapy_transition_method_revision_status
--   8. plant_taxa + preparations write-gate: service_role ALL → SELECT-only.
--
-- BAĞLAYICI SINIRLAR (C3D-B2A):
--   * Tüm writer'lar SECURITY DEFINER + SET search_path = pg_catalog, public; tenant/actor
--     YALNIZ parametreden (server adapter oturumdan çözer); public.users'a ERİŞMEZ.
--   * Her RPC: REVOKE ALL FROM PUBLIC/anon/authenticated/service_role + GRANT EXECUTE
--     yalnız service_role.
--   * note_hash İSTEMCİDEN/RPC'DE ÜRETİLMEZ; server canonical serializer (SHA-256) üretir,
--     RPC yalnız 64-hex format DOĞRULAR (pgcrypto/digest KULLANILMAZ).
--   * Audit YALNIZ public.aromatherapy_content_audit_events'e (claim audit'e DOKUNULMAZ).
--     Uzun içerik (method_text/steps/notlar) summary'ye kopyalanmaz; hash ile temsil edilir.
--   * DELETE / tombstone / purge / seed / DML / gerçek veri YOK.
--   * Method series identity + revision içeriği immutable (B1 trigger'ları korunur).
--   * Yeni method tabloları SELECT-only modeli korunur (bu migration DEĞİŞTİRMEZ).
--   * Legacy Oils / claims / glossary / diğer modüllere DOKUNULMAZ.
--   * Create'te status YOK → DB default 'draft' (QC merdiveni: geçişler yalnız update/transition).
--   * Status matrisi: taxon/preparation draft→verified→approved; method revision
--     draft→verified, draft→archived, verified→archived. Diğer geçişler reddedilir.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) aromatherapy_create_plant_taxon_with_audit
-- ============================================================
CREATE FUNCTION public.aromatherapy_create_plant_taxon_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_genus                 text,
  p_species               text,
  p_taxon_rank            text,
  p_infraspecific_epithet text,
  p_is_hybrid             boolean,
  p_author_citation       text,
  p_family                text,
  p_primary_common_name_tr text,
  p_reason                text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label   text;
  v_id      uuid;
  v_row     public.aromatherapy_plant_taxa%ROWTYPE;
  v_summary jsonb;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- INSERT. canonical_name generated; status DB default 'draft'. Check/coupling → native 23514;
  -- tenant içi kanonik duplicate → native 23505.
  INSERT INTO public.aromatherapy_plant_taxa (
    tenant_id, genus, species, taxon_rank, infraspecific_epithet,
    is_hybrid, author_citation, family, primary_common_name_tr
  )
  VALUES (
    p_tenant_id, p_genus, p_species, p_taxon_rank, p_infraspecific_epithet,
    coalesce(p_is_hybrid, false), p_author_citation, p_family, p_primary_common_name_tr
  )
  RETURNING id INTO v_id;

  SELECT * INTO v_row FROM public.aromatherapy_plant_taxa
   WHERE tenant_id = p_tenant_id AND id = v_id;

  v_summary := jsonb_build_object(
    'id', v_row.id, 'genus', v_row.genus, 'species', v_row.species,
    'taxon_rank', v_row.taxon_rank, 'infraspecific_epithet', v_row.infraspecific_epithet,
    'is_hybrid', v_row.is_hybrid, 'author_citation', v_row.author_citation,
    'family', v_row.family, 'primary_common_name_tr', v_row.primary_common_name_tr,
    'canonical_name', v_row.canonical_name, 'status', v_row.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary
  ) VALUES (
    p_tenant_id, 'plant_taxon', v_id, p_actor_user_id, v_label,
    'create', p_reason, NULL, v_summary
  );

  RETURN jsonb_build_object('entity_id', v_id, 'noop', false, 'updated_at', v_row.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_create_plant_taxon_with_audit(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_create_plant_taxon_with_audit(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_create_plant_taxon_with_audit(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_create_plant_taxon_with_audit(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_create_plant_taxon_with_audit(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, text) TO service_role;

-- ============================================================
-- 2) aromatherapy_update_plant_taxon_with_audit (full-replacement; status matrisi)
-- ============================================================
CREATE FUNCTION public.aromatherapy_update_plant_taxon_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_taxon_id              uuid,
  p_genus                 text,
  p_species               text,
  p_taxon_rank            text,
  p_infraspecific_epithet text,
  p_is_hybrid             boolean,
  p_author_citation       text,
  p_family                text,
  p_primary_common_name_tr text,
  p_status                text,
  p_expected_updated_at   timestamptz,
  p_reason                text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label    text;
  v_old      public.aromatherapy_plant_taxa%ROWTYPE;
  v_new      public.aromatherapy_plant_taxa%ROWTYPE;
  v_prev     jsonb;
  v_summary  jsonb;
  v_changed  boolean;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old FROM public.aromatherapy_plant_taxa
   WHERE tenant_id = p_tenant_id AND id = p_taxon_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_TAXON_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- Status geçiş matrisi (yalnız değişiyorsa). draft→verified, verified→approved izinli.
  IF p_status IS DISTINCT FROM v_old.status THEN
    IF NOT (
         (v_old.status = 'draft'    AND p_status = 'verified')
      OR (v_old.status = 'verified' AND p_status = 'approved')
    ) THEN
      RAISE EXCEPTION 'AROMA_FORBIDDEN_STATUS_TRANSITION' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_changed :=
       p_genus                  IS DISTINCT FROM v_old.genus
    OR p_species                IS DISTINCT FROM v_old.species
    OR p_taxon_rank             IS DISTINCT FROM v_old.taxon_rank
    OR p_infraspecific_epithet  IS DISTINCT FROM v_old.infraspecific_epithet
    OR coalesce(p_is_hybrid,false) IS DISTINCT FROM v_old.is_hybrid
    OR p_author_citation        IS DISTINCT FROM v_old.author_citation
    OR p_family                 IS DISTINCT FROM v_old.family
    OR p_primary_common_name_tr IS DISTINCT FROM v_old.primary_common_name_tr
    OR p_status                 IS DISTINCT FROM v_old.status;

  IF NOT v_changed THEN
    RETURN jsonb_build_object('entity_id', p_taxon_id, 'noop', true, 'updated_at', v_old.updated_at);
  END IF;

  v_prev := jsonb_build_object(
    'id', v_old.id, 'genus', v_old.genus, 'species', v_old.species,
    'taxon_rank', v_old.taxon_rank, 'infraspecific_epithet', v_old.infraspecific_epithet,
    'is_hybrid', v_old.is_hybrid, 'author_citation', v_old.author_citation,
    'family', v_old.family, 'primary_common_name_tr', v_old.primary_common_name_tr,
    'canonical_name', v_old.canonical_name, 'status', v_old.status
  );

  -- Native 23514 (check/coupling) / 23505 (kanonik duplicate) propagate → adapter map.
  UPDATE public.aromatherapy_plant_taxa
     SET genus = p_genus, species = p_species, taxon_rank = p_taxon_rank,
         infraspecific_epithet = p_infraspecific_epithet, is_hybrid = coalesce(p_is_hybrid,false),
         author_citation = p_author_citation, family = p_family,
         primary_common_name_tr = p_primary_common_name_tr, status = p_status
   WHERE tenant_id = p_tenant_id AND id = p_taxon_id;

  SELECT * INTO v_new FROM public.aromatherapy_plant_taxa
   WHERE tenant_id = p_tenant_id AND id = p_taxon_id;

  v_summary := jsonb_build_object(
    'id', v_new.id, 'genus', v_new.genus, 'species', v_new.species,
    'taxon_rank', v_new.taxon_rank, 'infraspecific_epithet', v_new.infraspecific_epithet,
    'is_hybrid', v_new.is_hybrid, 'author_citation', v_new.author_citation,
    'family', v_new.family, 'primary_common_name_tr', v_new.primary_common_name_tr,
    'canonical_name', v_new.canonical_name, 'status', v_new.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary
  ) VALUES (
    p_tenant_id, 'plant_taxon', p_taxon_id, p_actor_user_id, v_label,
    'update', p_reason, v_prev, v_summary
  );

  RETURN jsonb_build_object('entity_id', p_taxon_id, 'noop', false, 'updated_at', v_new.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_update_plant_taxon_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, boolean, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_update_plant_taxon_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, boolean, text, text, text, text, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_update_plant_taxon_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, boolean, text, text, text, text, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_update_plant_taxon_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, boolean, text, text, text, text, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_update_plant_taxon_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, boolean, text, text, text, text, timestamptz, text) TO service_role;

-- ============================================================
-- 3) aromatherapy_create_preparation_with_audit
-- ============================================================
CREATE FUNCTION public.aromatherapy_create_preparation_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_taxon_id              uuid,
  p_preparation_type      text,
  p_plant_part            text,
  p_chemotype             text,
  p_reason                text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label   text;
  v_id      uuid;
  v_row     public.aromatherapy_preparations%ROWTYPE;
  v_summary jsonb;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Parent taxon aynı tenantta olmalı (out-of-tenant/eksik → 404). Composite FK de garanti eder.
  IF NOT EXISTS (
    SELECT 1 FROM public.aromatherapy_plant_taxa
     WHERE tenant_id = p_tenant_id AND id = p_taxon_id
  ) THEN
    RAISE EXCEPTION 'AROMA_PARENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- status DB default 'draft'. Check → 23514; natural identity duplicate → 23505.
  INSERT INTO public.aromatherapy_preparations (
    tenant_id, taxon_id, preparation_type, plant_part, chemotype
  ) VALUES (
    p_tenant_id, p_taxon_id, p_preparation_type, p_plant_part, p_chemotype
  )
  RETURNING id INTO v_id;

  SELECT * INTO v_row FROM public.aromatherapy_preparations
   WHERE tenant_id = p_tenant_id AND id = v_id;

  v_summary := jsonb_build_object(
    'id', v_row.id, 'taxon_id', v_row.taxon_id, 'preparation_type', v_row.preparation_type,
    'plant_part', v_row.plant_part, 'chemotype', v_row.chemotype, 'status', v_row.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary
  ) VALUES (
    p_tenant_id, 'preparation', v_id, p_actor_user_id, v_label,
    'create', p_reason, NULL, v_summary
  );

  RETURN jsonb_build_object('entity_id', v_id, 'noop', false, 'updated_at', v_row.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_create_preparation_with_audit(
  uuid, uuid, text, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_create_preparation_with_audit(
  uuid, uuid, text, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_create_preparation_with_audit(
  uuid, uuid, text, uuid, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_create_preparation_with_audit(
  uuid, uuid, text, uuid, text, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_create_preparation_with_audit(
  uuid, uuid, text, uuid, text, text, text, text) TO service_role;

-- ============================================================
-- 4) aromatherapy_update_preparation_with_audit (identity-lock; status matrisi)
-- ============================================================
CREATE FUNCTION public.aromatherapy_update_preparation_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_preparation_id        uuid,
  p_taxon_id              uuid,
  p_preparation_type      text,
  p_plant_part            text,
  p_chemotype             text,
  p_status                text,
  p_expected_updated_at   timestamptz,
  p_reason                text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label        text;
  v_old          public.aromatherapy_preparations%ROWTYPE;
  v_new          public.aromatherapy_preparations%ROWTYPE;
  v_prev         jsonb;
  v_summary      jsonb;
  v_identity_chg boolean;
  v_has_methods  boolean;
  v_changed      boolean;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old FROM public.aromatherapy_preparations
   WHERE tenant_id = p_tenant_id AND id = p_preparation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_PREPARATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  v_identity_chg :=
       p_taxon_id         IS DISTINCT FROM v_old.taxon_id
    OR p_preparation_type IS DISTINCT FROM v_old.preparation_type
    OR p_plant_part       IS DISTINCT FROM v_old.plant_part
    OR p_chemotype        IS DISTINCT FROM v_old.chemotype;

  -- Kimlik alanları yalnız hiç method series yoksa değişebilir.
  IF v_identity_chg THEN
    SELECT EXISTS (
      SELECT 1 FROM public.aromatherapy_preparation_method_series
       WHERE tenant_id = p_tenant_id AND preparation_id = p_preparation_id
    ) INTO v_has_methods;
    IF v_has_methods THEN
      RAISE EXCEPTION 'AROMA_PREPARATION_IDENTITY_LOCKED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Status geçiş matrisi (yalnız değişiyorsa).
  IF p_status IS DISTINCT FROM v_old.status THEN
    IF NOT (
         (v_old.status = 'draft'    AND p_status = 'verified')
      OR (v_old.status = 'verified' AND p_status = 'approved')
    ) THEN
      RAISE EXCEPTION 'AROMA_FORBIDDEN_STATUS_TRANSITION' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_changed := v_identity_chg OR (p_status IS DISTINCT FROM v_old.status);
  IF NOT v_changed THEN
    RETURN jsonb_build_object('entity_id', p_preparation_id, 'noop', true, 'updated_at', v_old.updated_at);
  END IF;

  v_prev := jsonb_build_object(
    'id', v_old.id, 'taxon_id', v_old.taxon_id, 'preparation_type', v_old.preparation_type,
    'plant_part', v_old.plant_part, 'chemotype', v_old.chemotype, 'status', v_old.status
  );

  -- Native 23514 (check) / 23505 (natural identity duplicate) / 23503 (taxon FK) propagate.
  UPDATE public.aromatherapy_preparations
     SET taxon_id = p_taxon_id, preparation_type = p_preparation_type,
         plant_part = p_plant_part, chemotype = p_chemotype, status = p_status
   WHERE tenant_id = p_tenant_id AND id = p_preparation_id;

  SELECT * INTO v_new FROM public.aromatherapy_preparations
   WHERE tenant_id = p_tenant_id AND id = p_preparation_id;

  v_summary := jsonb_build_object(
    'id', v_new.id, 'taxon_id', v_new.taxon_id, 'preparation_type', v_new.preparation_type,
    'plant_part', v_new.plant_part, 'chemotype', v_new.chemotype, 'status', v_new.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary
  ) VALUES (
    p_tenant_id, 'preparation', p_preparation_id, p_actor_user_id, v_label,
    'update', p_reason, v_prev, v_summary
  );

  RETURN jsonb_build_object('entity_id', p_preparation_id, 'noop', false, 'updated_at', v_new.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_update_preparation_with_audit(
  uuid, uuid, text, uuid, uuid, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_update_preparation_with_audit(
  uuid, uuid, text, uuid, uuid, text, text, text, text, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_update_preparation_with_audit(
  uuid, uuid, text, uuid, uuid, text, text, text, text, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_update_preparation_with_audit(
  uuid, uuid, text, uuid, uuid, text, text, text, text, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_update_preparation_with_audit(
  uuid, uuid, text, uuid, uuid, text, text, text, text, timestamptz, text) TO service_role;

-- ============================================================
-- 5) aromatherapy_create_method_series_with_first_revision (atomik; ilk revision draft)
-- ============================================================
CREATE FUNCTION public.aromatherapy_create_method_series_with_first_revision(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_preparation_id        uuid,
  p_method_kind           text,
  p_source_id             uuid,
  p_passage_id            uuid,
  p_method_lang           text,
  p_plant_part_used       text,
  p_material_state        text,
  p_method_text           text,
  p_equipment             text,
  p_amount_ratio          text,
  p_solvent_carrier       text,
  p_duration_text         text,
  p_temperature_text      text,
  p_steps                 jsonb,
  p_filtration            text,
  p_resting               text,
  p_storage               text,
  p_quality_notes         text,
  p_safety_notes          text,
  p_note_hash             text,
  p_reason                text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label     text;
  v_series_id uuid;
  v_rev_id    uuid;
  v_rev       public.aromatherapy_preparation_method_revisions%ROWTYPE;
  v_src_ok    boolean;
  v_summary   jsonb;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- note_hash server-üretimli; RPC yalnız formatı doğrular (üretmez).
  IF p_note_hash IS NULL OR p_note_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AROMA_NOTE_HASH_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- faithful_source → source zorunlu (DB CHECK'e ek deterministik token).
  IF p_method_kind = 'faithful_source' AND p_source_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_FAITHFUL_SOURCE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_passage_id IS NOT NULL AND p_source_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_FAITHFUL_SOURCE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Parent preparation aynı tenantta (out-of-tenant → 404).
  IF NOT EXISTS (
    SELECT 1 FROM public.aromatherapy_preparations
     WHERE tenant_id = p_tenant_id AND id = p_preparation_id
  ) THEN
    RAISE EXCEPTION 'AROMA_PARENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Source (verilirse) aynı tenantta.
  IF p_source_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.aromatherapy_sources
     WHERE tenant_id = p_tenant_id AND id = p_source_id
  ) THEN
    RAISE EXCEPTION 'AROMA_PARENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Passage (verilirse) aynı tenant + tam olarak seçilen source'a ait olmalı.
  IF p_passage_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.aromatherapy_source_passages
       WHERE tenant_id = p_tenant_id AND id = p_passage_id AND source_id = p_source_id
    ) INTO v_src_ok;
    IF NOT v_src_ok THEN
      IF EXISTS (SELECT 1 FROM public.aromatherapy_source_passages
                  WHERE tenant_id = p_tenant_id AND id = p_passage_id) THEN
        RAISE EXCEPTION 'AROMA_PASSAGE_SOURCE_MISMATCH' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'AROMA_PARENT_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- Series identity (immutable). Kompozit FK'ler + lang/kind CHECK'leri → native 23514/23503.
  INSERT INTO public.aromatherapy_preparation_method_series (
    tenant_id, preparation_id, method_kind, source_id, passage_id, method_lang
  ) VALUES (
    p_tenant_id, p_preparation_id, p_method_kind, p_source_id, p_passage_id, p_method_lang
  )
  RETURNING id INTO v_series_id;

  -- İlk revision: revision=1, status DB default 'draft'. steps/text/hash CHECK'leri → native 23514.
  INSERT INTO public.aromatherapy_preparation_method_revisions (
    tenant_id, series_id, revision, plant_part_used, material_state, method_text,
    equipment, amount_ratio, solvent_carrier, duration_text, temperature_text, steps,
    filtration, resting, storage, quality_notes, safety_notes, note_hash
  ) VALUES (
    p_tenant_id, v_series_id, 1, p_plant_part_used, p_material_state, p_method_text,
    p_equipment, p_amount_ratio, p_solvent_carrier, p_duration_text, p_temperature_text, p_steps,
    p_filtration, p_resting, p_storage, p_quality_notes, p_safety_notes, p_note_hash
  )
  RETURNING id INTO v_rev_id;

  SELECT * INTO v_rev FROM public.aromatherapy_preparation_method_revisions
   WHERE tenant_id = p_tenant_id AND id = v_rev_id;

  v_summary := jsonb_build_object(
    'series_id', v_series_id, 'revision_id', v_rev_id, 'revision', 1,
    'preparation_id', p_preparation_id, 'method_kind', p_method_kind,
    'source_id', p_source_id, 'passage_id', p_passage_id, 'method_lang', p_method_lang,
    'status', v_rev.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary, previous_content_hash, new_content_hash
  ) VALUES (
    p_tenant_id, 'preparation_method', v_series_id, p_actor_user_id, v_label,
    'create', p_reason, NULL, v_summary, NULL, p_note_hash
  );

  RETURN jsonb_build_object(
    'entity_id', v_series_id, 'series_id', v_series_id, 'revision_id', v_rev_id,
    'revision', 1, 'noop', false, 'updated_at', v_rev.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_create_method_series_with_first_revision(
  uuid, uuid, text, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text,
  jsonb, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_create_method_series_with_first_revision(
  uuid, uuid, text, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text,
  jsonb, text, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_create_method_series_with_first_revision(
  uuid, uuid, text, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text,
  jsonb, text, text, text, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_create_method_series_with_first_revision(
  uuid, uuid, text, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text,
  jsonb, text, text, text, text, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_create_method_series_with_first_revision(
  uuid, uuid, text, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text,
  jsonb, text, text, text, text, text, text, text) TO service_role;

-- ============================================================
-- 6) aromatherapy_append_method_revision (append-only; no-op = aynı hash)
-- ============================================================
CREATE FUNCTION public.aromatherapy_append_method_revision(
  p_tenant_id               uuid,
  p_actor_user_id           uuid,
  p_actor_label_snapshot    text,
  p_series_id               uuid,
  p_plant_part_used         text,
  p_material_state          text,
  p_method_text             text,
  p_equipment               text,
  p_amount_ratio            text,
  p_solvent_carrier         text,
  p_duration_text           text,
  p_temperature_text        text,
  p_steps                   jsonb,
  p_filtration              text,
  p_resting                 text,
  p_storage                 text,
  p_quality_notes           text,
  p_safety_notes            text,
  p_note_hash               text,
  p_expected_latest_revision integer,
  p_reason                  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label       text;
  v_series      public.aromatherapy_preparation_method_series%ROWTYPE;
  v_latest      public.aromatherapy_preparation_method_revisions%ROWTYPE;
  v_new_id      uuid;
  v_new         public.aromatherapy_preparation_method_revisions%ROWTYPE;
  v_next        integer;
  v_prev        jsonb;
  v_summary     jsonb;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_note_hash IS NULL OR p_note_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AROMA_NOTE_HASH_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Series tenant-scoped kilit (append yarışını serileştirir). Out-of-tenant → 404.
  SELECT * INTO v_series FROM public.aromatherapy_preparation_method_series
   WHERE tenant_id = p_tenant_id AND id = p_series_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_SERIES_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Mevcut en yüksek revision.
  SELECT * INTO v_latest FROM public.aromatherapy_preparation_method_revisions
   WHERE tenant_id = p_tenant_id AND series_id = p_series_id
   ORDER BY revision DESC
   LIMIT 1;

  IF p_expected_latest_revision IS NULL
     OR coalesce(v_latest.revision, 0) IS DISTINCT FROM p_expected_latest_revision THEN
    RAISE EXCEPTION 'AROMA_REVISION_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- No-op: içerik hash'i son revision ile birebir aynıysa yeni revision üretilmez.
  IF v_latest.id IS NOT NULL AND v_latest.note_hash = p_note_hash THEN
    RETURN jsonb_build_object(
      'entity_id', p_series_id, 'series_id', p_series_id, 'noop', true,
      'latest_revision_id', v_latest.id, 'latest_revision', v_latest.revision,
      'updated_at', v_latest.updated_at
    );
  END IF;

  v_next := coalesce(v_latest.revision, 0) + 1;

  -- Yeni immutable revision (status draft). Natural key yarışı → native 23505.
  INSERT INTO public.aromatherapy_preparation_method_revisions (
    tenant_id, series_id, revision, plant_part_used, material_state, method_text,
    equipment, amount_ratio, solvent_carrier, duration_text, temperature_text, steps,
    filtration, resting, storage, quality_notes, safety_notes, note_hash
  ) VALUES (
    p_tenant_id, p_series_id, v_next, p_plant_part_used, p_material_state, p_method_text,
    p_equipment, p_amount_ratio, p_solvent_carrier, p_duration_text, p_temperature_text, p_steps,
    p_filtration, p_resting, p_storage, p_quality_notes, p_safety_notes, p_note_hash
  )
  RETURNING id INTO v_new_id;

  SELECT * INTO v_new FROM public.aromatherapy_preparation_method_revisions
   WHERE tenant_id = p_tenant_id AND id = v_new_id;

  v_prev := jsonb_build_object(
    'series_id', p_series_id, 'revision_id', v_latest.id, 'revision', v_latest.revision,
    'preparation_id', v_series.preparation_id, 'method_kind', v_series.method_kind,
    'source_id', v_series.source_id, 'passage_id', v_series.passage_id,
    'method_lang', v_series.method_lang, 'status', v_latest.status
  );
  v_summary := jsonb_build_object(
    'series_id', p_series_id, 'revision_id', v_new_id, 'revision', v_next,
    'preparation_id', v_series.preparation_id, 'method_kind', v_series.method_kind,
    'source_id', v_series.source_id, 'passage_id', v_series.passage_id,
    'method_lang', v_series.method_lang, 'status', v_new.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary, previous_content_hash, new_content_hash
  ) VALUES (
    p_tenant_id, 'preparation_method', p_series_id, p_actor_user_id, v_label,
    'update', p_reason, v_prev, v_summary, v_latest.note_hash, p_note_hash
  );

  RETURN jsonb_build_object(
    'entity_id', p_series_id, 'series_id', p_series_id, 'revision_id', v_new_id,
    'revision', v_next, 'noop', false, 'updated_at', v_new.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_append_method_revision(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb,
  text, text, text, text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_append_method_revision(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb,
  text, text, text, text, text, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_append_method_revision(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb,
  text, text, text, text, text, text, integer, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_append_method_revision(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb,
  text, text, text, text, text, text, integer, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_append_method_revision(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb,
  text, text, text, text, text, text, integer, text) TO service_role;

-- ============================================================
-- 7) aromatherapy_transition_method_revision_status
--    (draft→verified [önceki verified'ı atomik archive], draft→archived, verified→archived)
-- ============================================================
CREATE FUNCTION public.aromatherapy_transition_method_revision_status(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_series_id             uuid,
  p_revision_id           uuid,
  p_target_status         text,
  p_expected_updated_at   timestamptz,
  p_reason                text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label     text;
  v_series    public.aromatherapy_preparation_method_series%ROWTYPE;
  v_target    public.aromatherapy_preparation_method_revisions%ROWTYPE;
  v_prevver   public.aromatherapy_preparation_method_revisions%ROWTYPE;
  v_corr      uuid;
  v_new       public.aromatherapy_preparation_method_revisions%ROWTYPE;
  v_archived_id uuid := NULL;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_status IS NULL OR p_target_status NOT IN ('draft', 'verified', 'archived') THEN
    RAISE EXCEPTION 'AROMA_FORBIDDEN_STATUS_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  -- Series tenant-scoped kilit (verify+archive'ı serileştirir). Out-of-tenant → 404.
  SELECT * INTO v_series FROM public.aromatherapy_preparation_method_series
   WHERE tenant_id = p_tenant_id AND id = p_series_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_SERIES_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_target FROM public.aromatherapy_preparation_method_revisions
   WHERE tenant_id = p_tenant_id AND series_id = p_series_id AND id = p_revision_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_REVISION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_target.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- Aynı status → no-op.
  IF v_target.status = p_target_status THEN
    RETURN jsonb_build_object(
      'entity_id', p_revision_id, 'revision_id', p_revision_id, 'noop', true,
      'status', v_target.status, 'updated_at', v_target.updated_at
    );
  END IF;

  -- İzinli geçişler: draft→verified, draft→archived, verified→archived. Diğerleri reddedilir.
  IF NOT (
       (v_target.status = 'draft'    AND p_target_status = 'verified')
    OR (v_target.status = 'draft'    AND p_target_status = 'archived')
    OR (v_target.status = 'verified' AND p_target_status = 'archived')
  ) THEN
    RAISE EXCEPTION 'AROMA_FORBIDDEN_STATUS_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  v_corr := gen_random_uuid();

  -- Verify: aynı seride mevcut verified varsa ÖNCE archived (partial-unique ihlalini önler).
  IF p_target_status = 'verified' THEN
    SELECT * INTO v_prevver FROM public.aromatherapy_preparation_method_revisions
     WHERE tenant_id = p_tenant_id AND series_id = p_series_id AND status = 'verified'
     FOR UPDATE;
    IF FOUND AND v_prevver.id <> p_revision_id THEN
      UPDATE public.aromatherapy_preparation_method_revisions
         SET status = 'archived'
       WHERE tenant_id = p_tenant_id AND id = v_prevver.id;
      v_archived_id := v_prevver.id;

      INSERT INTO public.aromatherapy_content_audit_events (
        tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
        operation, reason, previous_summary, new_summary,
        previous_content_hash, new_content_hash, correlation_id
      ) VALUES (
        p_tenant_id, 'preparation_method', p_series_id, p_actor_user_id, v_label, 'update', p_reason,
        jsonb_build_object('series_id', p_series_id, 'revision_id', v_prevver.id,
          'revision', v_prevver.revision, 'status', 'verified', 'auto_archived', true),
        jsonb_build_object('series_id', p_series_id, 'revision_id', v_prevver.id,
          'revision', v_prevver.revision, 'status', 'archived', 'auto_archived', true),
        v_prevver.note_hash, v_prevver.note_hash, v_corr
      );
    END IF;
  END IF;

  -- Hedef revision status geçişi (yalnız status/updated_at değişir — B1 guard'a uyumlu).
  UPDATE public.aromatherapy_preparation_method_revisions
     SET status = p_target_status
   WHERE tenant_id = p_tenant_id AND id = p_revision_id;

  SELECT * INTO v_new FROM public.aromatherapy_preparation_method_revisions
   WHERE tenant_id = p_tenant_id AND id = p_revision_id;

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary,
    previous_content_hash, new_content_hash, correlation_id
  ) VALUES (
    p_tenant_id, 'preparation_method', p_series_id, p_actor_user_id, v_label, 'update', p_reason,
    jsonb_build_object('series_id', p_series_id, 'revision_id', p_revision_id,
      'revision', v_target.revision, 'status', v_target.status),
    jsonb_build_object('series_id', p_series_id, 'revision_id', p_revision_id,
      'revision', v_new.revision, 'status', v_new.status),
    v_target.note_hash, v_new.note_hash, v_corr
  );

  RETURN jsonb_build_object(
    'entity_id', p_revision_id, 'revision_id', p_revision_id, 'noop', false,
    'status', v_new.status, 'archived_revision_id', v_archived_id, 'updated_at', v_new.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_transition_method_revision_status(
  uuid, uuid, text, uuid, uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_transition_method_revision_status(
  uuid, uuid, text, uuid, uuid, text, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_transition_method_revision_status(
  uuid, uuid, text, uuid, uuid, text, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_transition_method_revision_status(
  uuid, uuid, text, uuid, uuid, text, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_transition_method_revision_status(
  uuid, uuid, text, uuid, uuid, text, timestamptz, text) TO service_role;

-- ============================================================
-- 8) Write-gate: plant_taxa + preparations → service_role SELECT-only.
--    Writer'lar SECURITY DEFINER (owner) olduğundan doğrudan tablo write yetkisi gerekmez.
--    RLS zaten ENABLE (B1/temel); burada değiştirilmez. Method tabloları zaten SELECT-only.
-- ============================================================
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_plant_taxa   FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_plant_taxa   FROM service_role;
GRANT  SELECT           ON TABLE public.aromatherapy_plant_taxa   TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_preparations FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_preparations FROM service_role;
GRANT  SELECT           ON TABLE public.aromatherapy_preparations TO service_role;

COMMIT;
