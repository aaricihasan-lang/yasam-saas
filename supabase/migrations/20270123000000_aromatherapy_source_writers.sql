-- ============================================================
-- 20270123000000_aromatherapy_source_writers.sql
--
-- Aromaterapi Bilgi Sistemi — Kaynaklar (sources) YAZARLARI (P1-D satış öncesi kapanış)
--
-- KAPSAM (tek transaction, fail-fast; IF NOT EXISTS / CREATE OR REPLACE / sessiz DO YOK):
--   1. aromatherapy_create_source_with_audit
--   2. aromatherapy_update_source_with_audit
--   3. aromatherapy_sources write-gate: service_role ALL → SELECT-only (yazım yalnız RPC).
--
-- BAĞLAYICI SINIRLAR:
--   * Writer'lar SECURITY DEFINER + SET search_path = pg_catalog, public; tenant/actor
--     YALNIZ parametreden (server adapter oturumdan çözer); public.users'a ERİŞMEZ.
--   * Her RPC: REVOKE ALL FROM PUBLIC/anon/authenticated/service_role + GRANT EXECUTE
--     yalnız service_role.
--   * Audit YALNIZ public.aromatherapy_content_audit_events'e ('source' entity_type CHECK'te
--     zaten mevcut — ALTER YOK). Uzun metin (notes) summary'ye kopyalanır (kısa künye alanı).
--   * DELETE / tombstone / purge / seed / DML / gerçek veri YOK. Kaynak "silme" = status→archived
--     (update) ile yapılır; atıflı kaynak FK RESTRICT ile korunur.
--   * Create'te status YOK → DB default 'draft'. Status matrisi: draft→verified, draft→archived,
--     verified→archived. Diğer geçişler reddedilir (AROMA_FORBIDDEN_STATUS_TRANSITION).
--   * Legacy oils / claims / glossary / katalog / diğer modüllere DOKUNULMAZ.
--   * IDEMPOTENT DEĞİL: plain CREATE FUNCTION (catalog method writers ile aynı fail-fast
--     desen); aynı isimli nesne varsa migration durur.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) aromatherapy_create_source_with_audit
-- ============================================================
CREATE FUNCTION public.aromatherapy_create_source_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_source_type           text,
  p_title                 text,
  p_authors               text,
  p_organization          text,
  p_publication_year      integer,
  p_doi                   text,
  p_pmid                  text,
  p_isbn                  text,
  p_url                   text,
  p_document_no           text,
  p_notes                 text,
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
  v_row     public.aromatherapy_sources%ROWTYPE;
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

  -- INSERT. status DB default 'draft'. source_type/title/year CHECK → native 23514.
  INSERT INTO public.aromatherapy_sources (
    tenant_id, source_type, title, authors, organization, publication_year,
    doi, pmid, isbn, url, document_no, notes
  )
  VALUES (
    p_tenant_id, p_source_type, p_title, p_authors, p_organization, p_publication_year,
    p_doi, p_pmid, p_isbn, p_url, p_document_no, p_notes
  )
  RETURNING id INTO v_id;

  SELECT * INTO v_row FROM public.aromatherapy_sources
   WHERE tenant_id = p_tenant_id AND id = v_id;

  v_summary := jsonb_build_object(
    'id', v_row.id, 'source_type', v_row.source_type, 'title', v_row.title,
    'authors', v_row.authors, 'organization', v_row.organization,
    'publication_year', v_row.publication_year, 'doi', v_row.doi, 'pmid', v_row.pmid,
    'isbn', v_row.isbn, 'url', v_row.url, 'document_no', v_row.document_no,
    'notes', v_row.notes, 'status', v_row.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary
  ) VALUES (
    p_tenant_id, 'source', v_id, p_actor_user_id, v_label,
    'create', p_reason, NULL, v_summary
  );

  RETURN jsonb_build_object('entity_id', v_id, 'noop', false, 'updated_at', v_row.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_create_source_with_audit(
  uuid, uuid, text, text, text, text, text, integer, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_create_source_with_audit(
  uuid, uuid, text, text, text, text, text, integer, text, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_create_source_with_audit(
  uuid, uuid, text, text, text, text, text, integer, text, text, text, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_create_source_with_audit(
  uuid, uuid, text, text, text, text, text, integer, text, text, text, text, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_create_source_with_audit(
  uuid, uuid, text, text, text, text, text, integer, text, text, text, text, text, text, text) TO service_role;

-- ============================================================
-- 2) aromatherapy_update_source_with_audit (full-replacement; status matrisi)
-- ============================================================
CREATE FUNCTION public.aromatherapy_update_source_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_source_id             uuid,
  p_source_type           text,
  p_title                 text,
  p_authors               text,
  p_organization          text,
  p_publication_year      integer,
  p_doi                   text,
  p_pmid                  text,
  p_isbn                  text,
  p_url                   text,
  p_document_no           text,
  p_notes                 text,
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
  v_old      public.aromatherapy_sources%ROWTYPE;
  v_new      public.aromatherapy_sources%ROWTYPE;
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

  SELECT * INTO v_old FROM public.aromatherapy_sources
   WHERE tenant_id = p_tenant_id AND id = p_source_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- Status geçiş matrisi (yalnız değişiyorsa). draft→verified, draft→archived, verified→archived.
  IF p_status IS DISTINCT FROM v_old.status THEN
    IF NOT (
         (v_old.status = 'draft'    AND p_status = 'verified')
      OR (v_old.status = 'draft'    AND p_status = 'archived')
      OR (v_old.status = 'verified' AND p_status = 'archived')
    ) THEN
      RAISE EXCEPTION 'AROMA_FORBIDDEN_STATUS_TRANSITION' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_changed :=
       p_source_type      IS DISTINCT FROM v_old.source_type
    OR p_title            IS DISTINCT FROM v_old.title
    OR p_authors          IS DISTINCT FROM v_old.authors
    OR p_organization     IS DISTINCT FROM v_old.organization
    OR p_publication_year IS DISTINCT FROM v_old.publication_year
    OR p_doi              IS DISTINCT FROM v_old.doi
    OR p_pmid             IS DISTINCT FROM v_old.pmid
    OR p_isbn             IS DISTINCT FROM v_old.isbn
    OR p_url              IS DISTINCT FROM v_old.url
    OR p_document_no      IS DISTINCT FROM v_old.document_no
    OR p_notes            IS DISTINCT FROM v_old.notes
    OR p_status           IS DISTINCT FROM v_old.status;

  IF NOT v_changed THEN
    RETURN jsonb_build_object('entity_id', p_source_id, 'noop', true, 'updated_at', v_old.updated_at);
  END IF;

  v_prev := jsonb_build_object(
    'id', v_old.id, 'source_type', v_old.source_type, 'title', v_old.title,
    'authors', v_old.authors, 'organization', v_old.organization,
    'publication_year', v_old.publication_year, 'doi', v_old.doi, 'pmid', v_old.pmid,
    'isbn', v_old.isbn, 'url', v_old.url, 'document_no', v_old.document_no,
    'notes', v_old.notes, 'status', v_old.status
  );

  -- Native 23514 (check) propagate → adapter map.
  UPDATE public.aromatherapy_sources
     SET source_type = p_source_type, title = p_title, authors = p_authors,
         organization = p_organization, publication_year = p_publication_year,
         doi = p_doi, pmid = p_pmid, isbn = p_isbn, url = p_url,
         document_no = p_document_no, notes = p_notes, status = p_status
   WHERE tenant_id = p_tenant_id AND id = p_source_id;

  SELECT * INTO v_new FROM public.aromatherapy_sources
   WHERE tenant_id = p_tenant_id AND id = p_source_id;

  v_summary := jsonb_build_object(
    'id', v_new.id, 'source_type', v_new.source_type, 'title', v_new.title,
    'authors', v_new.authors, 'organization', v_new.organization,
    'publication_year', v_new.publication_year, 'doi', v_new.doi, 'pmid', v_new.pmid,
    'isbn', v_new.isbn, 'url', v_new.url, 'document_no', v_new.document_no,
    'notes', v_new.notes, 'status', v_new.status
  );

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary
  ) VALUES (
    p_tenant_id, 'source', p_source_id, p_actor_user_id, v_label,
    'update', p_reason, v_prev, v_summary
  );

  RETURN jsonb_build_object('entity_id', p_source_id, 'noop', false, 'updated_at', v_new.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_update_source_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, integer, text, text, text, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_update_source_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, integer, text, text, text, text, text, text, text, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_update_source_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, integer, text, text, text, text, text, text, text, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_update_source_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, integer, text, text, text, text, text, text, text, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_update_source_with_audit(
  uuid, uuid, text, uuid, text, text, text, text, integer, text, text, text, text, text, text, text, timestamptz, text) TO service_role;

-- ============================================================
-- 3) Write-gate: aromatherapy_sources yazımı yalnız yukarıdaki RPC'ler üzerinden.
--    (RLS zaten ENABLE + policy yok; service_role'un doğrudan write yetkisi kaldırılır.)
-- ============================================================
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_sources FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_sources FROM service_role;
GRANT SELECT ON TABLE public.aromatherapy_sources TO service_role;

COMMIT;

-- ============================================================
-- DOĞRULAMA (uygulama sonrası, beklenen):
--   SELECT has_table_privilege('service_role','public.aromatherapy_sources','SELECT'); -- true
--   SELECT has_table_privilege('service_role','public.aromatherapy_sources','INSERT'); -- false
--   SELECT has_function_privilege('service_role',
--     'public.aromatherapy_create_source_with_audit(uuid,uuid,text,text,text,text,text,integer,text,text,text,text,text,text,text)',
--     'EXECUTE'); -- true
-- ============================================================
