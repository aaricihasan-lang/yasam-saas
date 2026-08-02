-- ============================================================
-- 20260922000000_yebs_a7_quality_gates.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ A7 (A7-Q) QUALITY / REVIEW /
-- APPROVAL / PUBLISH GATES
--
-- API-TX yalnız MEKANİK state machine kurmuştur; ileri kalite geçişleri
-- (approved→published; claim/relation needs_verification→verified,
-- verified→approved, approved→published) A7'ye bırakılmıştı (allowlist'te YOK).
-- Bu migration bu geçişleri FAIL-CLOSED kalite/bağımlılık/graf kapılarıyla açar.
--
-- MİMARİ (§8): Yeni entity-specific A7 RPC'leri. API-TX RPC'leri CREATE OR REPLACE
--   EDİLMEZ. Her entity için:
--     - yebs_a7_<E>_blockers(p_id, p_target) → text[]  (TEK doğruluk kaynağı;
--       write + read aynı helper'ı kullanır — logic drift yok)
--     - yebs_a7_transition_<E>_with_audit(...)          (write; blocker varsa RAISE)
--     - yebs_a7_<E>_eligibility(p_actor, p_id, p_target) → jsonb (read-only)
--   Dynamic-table generic DML YOK; her fonksiyon statik SQL/entity-specific.
--
-- A7'nin sahip olduğu geçişler (route dispatch bunları A7'ye yönlendirir):
--   A grubu (tradition/school/concept): approved→published, published→approved
--   B (source): approved→published, published→approved, published→archived
--   C (claim/concept_relation): needs_verification→verified, verified→approved,
--       approved→published, published→approved, published→archived
--   Bunun dışındaki her (from,to) API-TX RPC'sinde kalır. published→approved ve
--   published→archived A7'de BAĞIMLILIK KORUMALIDIR (published child/dependent varsa 409).
--
-- AUDIT (§14): başarılı geçiş AUD1'e yazılır (action publish/unpublish/archive/
--   transition). BAŞARISIZ eligibility AUD1'e YAZILMAZ — RPC exception aynı
--   transaction'daki audit INSERT'i rollback ederdi; onun yerine stable kod RAISE
--   edilir, read eligibility blocker_codes sağlar. changed_fields=['status'].
--
-- GÜVENLİK: SECURITY DEFINER + SET search_path = pg_catalog, public; CREATE FUNCTION
--   (fail-closed, CREATE OR REPLACE yok). FOR UPDATE row lock + expected_updated_at.
--   Tablo grant'ları DEĞİŞMEZ (service_role SELECT-only write-gate korunur). EXECUTE
--   PUBLIC/anon/authenticated tam REVOKE; yalnız service_role GRANT (public RPC'ler).
--   _blockers helper'ları internal (grant YOK; yalnız aynı-owner definer fn'ler çağırır).
--   Fiziksel DELETE yok, otomatik cascade yok, otomatik publish yok, force/bypass yok.
--   contradiction rollü kanıt silinmez ve publish'i engellemez (nitelikli-support dışı).
--
-- A0–A5 ve API-TX migration/RPC gövdeleri DEĞİŞTİRİLMEZ. Graph fn 20260921'de.
--
-- Kararlı hata / blocker kodları (P0001 RAISE veya blocker_codes[]):
--   YEBS_<E>_NOT_FOUND, YEBS_<E>_STALE_UPDATE, YEBS_<E>_STATUS_NOOP,
--   YEBS_<E>_INVALID_TRANSITION, YEBS_ADMIN_NOT_FOUND, YEBS_ADMIN_NOT_ACTIVE,
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_<E>_ID_REQUIRED,
--   YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID,
--   YEBS_TRADITION_NOT_PUBLISH_READY, YEBS_SCHOOL_PARENT_TRADITION_NOT_PUBLISHED,
--   YEBS_CONCEPT_PARENT_NOT_PUBLISHED, YEBS_CONCEPT_REQUIRED_LABEL_MISSING,
--   YEBS_SOURCE_METADATA_INCOMPLETE, YEBS_CLAIM_NO_VERIFIED_EVIDENCE,
--   YEBS_CLAIM_SUPPORT_SOURCE_NOT_READY, YEBS_CLAIM_NOT_APPROVAL_READY,
--   YEBS_CLAIM_PARENT_CONCEPT_NOT_PUBLISHED, YEBS_CLAIM_PROVENANCE_INCOMPLETE,
--   YEBS_RELATION_NO_VERIFIED_EVIDENCE, YEBS_RELATION_NOT_APPROVAL_READY,
--   YEBS_RELATION_PARENT_CONCEPT_NOT_PUBLISHED, YEBS_RELATION_PROVENANCE_INCOMPLETE,
--   YEBS_RELATION_GRAPH_CYCLE, YEBS_PUBLISH_DEPENDENCY_BLOCKED.
-- ============================================================

BEGIN;

-- ============================================================
-- ORTAK NOT: her write RPC imzası (7 arg):
--   (p_actor_admin_id uuid, p_request_id uuid, p_operation_id uuid,
--    p_<entity>_id uuid, p_expected_updated_at timestamptz,
--    p_target_status text, p_reason text) RETURNS public.yebs_<table>
-- Read eligibility imzası (3 arg): (p_actor_admin_id uuid, p_<entity>_id uuid,
--    p_target_status text) RETURNS jsonb
-- ============================================================


-- ============================================================
-- 1) TRADITION  (Grup A) — publish + dependency-korumalı unpublish
-- ============================================================
CREATE FUNCTION public.yebs_a7_tradition_blockers(p_id uuid, p_target text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.yebs_traditions;
  v_b text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v FROM public.yebs_traditions WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN ARRAY['YEBS_TRADITION_NOT_FOUND'];
  END IF;

  IF p_target = 'published' THEN
    -- Structural completeness (NOT NULL + CHECK zaten garantiler; defensive).
    IF v.name_tr IS NULL OR btrim(v.name_tr) = ''
       OR v.slug IS NULL OR v.tradition_type IS NULL THEN
      v_b := v_b || 'YEBS_TRADITION_NOT_PUBLISH_READY';
    END IF;
  ELSIF p_target = 'approved' THEN
    -- published→approved (unpublish): published child School/Concept varsa engelle.
    IF EXISTS (SELECT 1 FROM public.yebs_schools s WHERE s.tradition_id = p_id AND s.status = 'published')
       OR EXISTS (SELECT 1 FROM public.yebs_concepts c WHERE c.tradition_id = p_id AND c.status = 'published') THEN
      v_b := v_b || 'YEBS_PUBLISH_DEPENDENCY_BLOCKED';
    END IF;
  END IF;

  RETURN v_b;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_tradition_blockers(uuid, text) FROM PUBLIC;

CREATE FUNCTION public.yebs_a7_transition_tradition_with_audit(
  p_actor_admin_id uuid, p_request_id uuid, p_operation_id uuid,
  p_tradition_id uuid, p_expected_updated_at timestamptz,
  p_target_status text, p_reason text
)
RETURNS public.yebs_traditions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v_email text; v_actor_label text;
  v_existing public.yebs_traditions; v_updated public.yebs_traditions;
  v_from text; v_action text; v_blockers text[];
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_tradition_id IS NULL THEN RAISE EXCEPTION 'YEBS_TRADITION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE='P0001'; END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN v_actor_label := 'admin'; END IF;

  SELECT * INTO v_existing FROM public.yebs_traditions WHERE id = p_tradition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_TRADITION_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'YEBS_TRADITION_STALE_UPDATE' USING ERRCODE='P0001'; END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN RAISE EXCEPTION 'YEBS_TRADITION_STATUS_NOOP' USING ERRCODE='P0001'; END IF;

  -- A7 allowlist (Grup A): approved→published, published→approved
  IF NOT ((v_from = 'approved' AND p_target_status = 'published')
       OR (v_from = 'published' AND p_target_status = 'approved')) THEN
    RAISE EXCEPTION 'YEBS_TRADITION_INVALID_TRANSITION' USING ERRCODE='P0001';
  END IF;

  v_blockers := public.yebs_a7_tradition_blockers(p_tradition_id, p_target_status);
  IF array_length(v_blockers, 1) IS NOT NULL THEN
    RAISE EXCEPTION '%', v_blockers[1] USING ERRCODE='P0001';
  END IF;

  v_action := CASE WHEN p_target_status = 'published' THEN 'publish' ELSE 'unpublish' END;

  UPDATE public.yebs_traditions SET status = p_target_status WHERE id = p_tradition_id RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  ) VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'tradition', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_tradition_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_tradition_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_tradition_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_tradition_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_transition_tradition_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) TO service_role;

CREATE FUNCTION public.yebs_a7_tradition_eligibility(p_actor_admin_id uuid, p_tradition_id uuid, p_target_status text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v public.yebs_traditions; v_from text; v_blk text[]; v_valid boolean;
BEGIN
  SELECT u.role, u.active INTO v_role, v_active FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;

  SELECT * INTO v FROM public.yebs_traditions WHERE id = p_tradition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_TRADITION_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  v_from := v.status;
  v_valid := (v_from = 'approved' AND p_target_status = 'published')
          OR (v_from = 'published' AND p_target_status = 'approved');
  IF NOT v_valid THEN
    v_blk := ARRAY['YEBS_TRADITION_INVALID_TRANSITION'];
  ELSE
    v_blk := public.yebs_a7_tradition_blockers(p_tradition_id, p_target_status);
  END IF;

  RETURN jsonb_build_object(
    'allowed', (v_valid AND array_length(v_blk, 1) IS NULL),
    'current_status', v_from,
    'target_status', p_target_status,
    'blocker_codes', to_jsonb(coalesce(v_blk, ARRAY[]::text[])),
    'warnings', to_jsonb(ARRAY[]::text[]),
    'evaluated_at', now(),
    'expected_updated_at', v.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_tradition_eligibility(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_tradition_eligibility(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_tradition_eligibility(uuid,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_tradition_eligibility(uuid,uuid,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_tradition_eligibility(uuid,uuid,text) TO service_role;


-- ============================================================
-- 2) SCHOOL  (Grup A) — publish (parent tradition published) + unpublish dep guard
-- ============================================================
CREATE FUNCTION public.yebs_a7_school_blockers(p_id uuid, p_target text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.yebs_schools; v_b text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v FROM public.yebs_schools WHERE id = p_id;
  IF NOT FOUND THEN RETURN ARRAY['YEBS_SCHOOL_NOT_FOUND']; END IF;

  IF p_target = 'published' THEN
    IF v.name_tr IS NULL OR btrim(v.name_tr) = '' OR v.slug IS NULL THEN
      v_b := v_b || 'YEBS_SCHOOL_NOT_PUBLISH_READY';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.yebs_traditions t WHERE t.id = v.tradition_id AND t.status = 'published') THEN
      v_b := v_b || 'YEBS_SCHOOL_PARENT_TRADITION_NOT_PUBLISHED';
    END IF;
  ELSIF p_target = 'approved' THEN
    IF EXISTS (SELECT 1 FROM public.yebs_concepts c WHERE c.school_id = p_id AND c.status = 'published') THEN
      v_b := v_b || 'YEBS_PUBLISH_DEPENDENCY_BLOCKED';
    END IF;
  END IF;

  RETURN v_b;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_school_blockers(uuid, text) FROM PUBLIC;

CREATE FUNCTION public.yebs_a7_transition_school_with_audit(
  p_actor_admin_id uuid, p_request_id uuid, p_operation_id uuid,
  p_school_id uuid, p_expected_updated_at timestamptz, p_target_status text, p_reason text
)
RETURNS public.yebs_schools
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v_email text; v_actor_label text;
  v_existing public.yebs_schools; v_updated public.yebs_schools; v_from text; v_action text; v_blockers text[];
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_school_id IS NULL THEN RAISE EXCEPTION 'YEBS_SCHOOL_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE='P0001'; END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN v_actor_label := 'admin'; END IF;

  SELECT * INTO v_existing FROM public.yebs_schools WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_SCHOOL_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'YEBS_SCHOOL_STALE_UPDATE' USING ERRCODE='P0001'; END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN RAISE EXCEPTION 'YEBS_SCHOOL_STATUS_NOOP' USING ERRCODE='P0001'; END IF;
  IF NOT ((v_from = 'approved' AND p_target_status = 'published')
       OR (v_from = 'published' AND p_target_status = 'approved')) THEN
    RAISE EXCEPTION 'YEBS_SCHOOL_INVALID_TRANSITION' USING ERRCODE='P0001';
  END IF;

  v_blockers := public.yebs_a7_school_blockers(p_school_id, p_target_status);
  IF array_length(v_blockers, 1) IS NOT NULL THEN RAISE EXCEPTION '%', v_blockers[1] USING ERRCODE='P0001'; END IF;

  v_action := CASE WHEN p_target_status = 'published' THEN 'publish' ELSE 'unpublish' END;
  UPDATE public.yebs_schools SET status = p_target_status WHERE id = p_school_id RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  ) VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'school', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_school_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_school_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_school_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_school_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_transition_school_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) TO service_role;

CREATE FUNCTION public.yebs_a7_school_eligibility(p_actor_admin_id uuid, p_school_id uuid, p_target_status text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v public.yebs_schools; v_from text; v_blk text[]; v_valid boolean;
BEGIN
  SELECT u.role, u.active INTO v_role, v_active FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v FROM public.yebs_schools WHERE id = p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_SCHOOL_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  v_from := v.status;
  v_valid := (v_from = 'approved' AND p_target_status = 'published') OR (v_from = 'published' AND p_target_status = 'approved');
  IF NOT v_valid THEN v_blk := ARRAY['YEBS_SCHOOL_INVALID_TRANSITION']; ELSE v_blk := public.yebs_a7_school_blockers(p_school_id, p_target_status); END IF;
  RETURN jsonb_build_object(
    'allowed', (v_valid AND array_length(v_blk,1) IS NULL),
    'current_status', v_from, 'target_status', p_target_status,
    'blocker_codes', to_jsonb(coalesce(v_blk, ARRAY[]::text[])),
    'warnings', to_jsonb(ARRAY[]::text[]), 'evaluated_at', now(), 'expected_updated_at', v.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_school_eligibility(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_school_eligibility(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_school_eligibility(uuid,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_school_eligibility(uuid,uuid,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_school_eligibility(uuid,uuid,text) TO service_role;


-- ============================================================
-- 3) CONCEPT  (Grup A) — publish (parents published + ≥1 label + ≥1 primary) + unpublish dep
-- ============================================================
CREATE FUNCTION public.yebs_a7_concept_blockers(p_id uuid, p_target text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.yebs_concepts; v_b text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v FROM public.yebs_concepts WHERE id = p_id;
  IF NOT FOUND THEN RETURN ARRAY['YEBS_CONCEPT_NOT_FOUND']; END IF;

  IF p_target = 'published' THEN
    IF v.slug IS NULL OR v.concept_type IS NULL THEN
      v_b := v_b || 'YEBS_CONCEPT_NOT_PUBLISH_READY';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.yebs_traditions t WHERE t.id = v.tradition_id AND t.status = 'published') THEN
      v_b := v_b || 'YEBS_CONCEPT_PARENT_NOT_PUBLISHED';
    ELSIF v.school_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.yebs_schools s WHERE s.id = v.school_id AND s.status = 'published') THEN
      v_b := v_b || 'YEBS_CONCEPT_PARENT_NOT_PUBLISHED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.yebs_concept_labels l WHERE l.concept_id = p_id)
       OR NOT EXISTS (SELECT 1 FROM public.yebs_concept_labels l WHERE l.concept_id = p_id AND l.is_primary) THEN
      v_b := v_b || 'YEBS_CONCEPT_REQUIRED_LABEL_MISSING';
    END IF;
  ELSIF p_target = 'approved' THEN
    IF EXISTS (SELECT 1 FROM public.yebs_claims c WHERE c.concept_id = p_id AND c.status = 'published')
       OR EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                    WHERE (r.source_concept_id = p_id OR r.target_concept_id = p_id) AND r.status = 'published') THEN
      v_b := v_b || 'YEBS_PUBLISH_DEPENDENCY_BLOCKED';
    END IF;
  END IF;

  RETURN v_b;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_blockers(uuid, text) FROM PUBLIC;

CREATE FUNCTION public.yebs_a7_transition_concept_with_audit(
  p_actor_admin_id uuid, p_request_id uuid, p_operation_id uuid,
  p_concept_id uuid, p_expected_updated_at timestamptz, p_target_status text, p_reason text
)
RETURNS public.yebs_concepts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v_email text; v_actor_label text;
  v_existing public.yebs_concepts; v_updated public.yebs_concepts; v_from text; v_action text; v_blockers text[];
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_concept_id IS NULL THEN RAISE EXCEPTION 'YEBS_CONCEPT_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE='P0001'; END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN v_actor_label := 'admin'; END IF;

  SELECT * INTO v_existing FROM public.yebs_concepts WHERE id = p_concept_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'YEBS_CONCEPT_STALE_UPDATE' USING ERRCODE='P0001'; END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_NOOP' USING ERRCODE='P0001'; END IF;
  IF NOT ((v_from = 'approved' AND p_target_status = 'published')
       OR (v_from = 'published' AND p_target_status = 'approved')) THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_INVALID_TRANSITION' USING ERRCODE='P0001';
  END IF;

  v_blockers := public.yebs_a7_concept_blockers(p_concept_id, p_target_status);
  IF array_length(v_blockers, 1) IS NOT NULL THEN RAISE EXCEPTION '%', v_blockers[1] USING ERRCODE='P0001'; END IF;

  v_action := CASE WHEN p_target_status = 'published' THEN 'publish' ELSE 'unpublish' END;
  UPDATE public.yebs_concepts SET status = p_target_status WHERE id = p_concept_id RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  ) VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'concept', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_transition_concept_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) TO service_role;

CREATE FUNCTION public.yebs_a7_concept_eligibility(p_actor_admin_id uuid, p_concept_id uuid, p_target_status text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v public.yebs_concepts; v_from text; v_blk text[]; v_valid boolean;
BEGIN
  SELECT u.role, u.active INTO v_role, v_active FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v FROM public.yebs_concepts WHERE id = p_concept_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  v_from := v.status;
  v_valid := (v_from = 'approved' AND p_target_status = 'published') OR (v_from = 'published' AND p_target_status = 'approved');
  IF NOT v_valid THEN v_blk := ARRAY['YEBS_CONCEPT_INVALID_TRANSITION']; ELSE v_blk := public.yebs_a7_concept_blockers(p_concept_id, p_target_status); END IF;
  RETURN jsonb_build_object(
    'allowed', (v_valid AND array_length(v_blk,1) IS NULL),
    'current_status', v_from, 'target_status', p_target_status,
    'blocker_codes', to_jsonb(coalesce(v_blk, ARRAY[]::text[])),
    'warnings', to_jsonb(ARRAY[]::text[]), 'evaluated_at', now(), 'expected_updated_at', v.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_eligibility(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_eligibility(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_eligibility(uuid,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_eligibility(uuid,uuid,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_concept_eligibility(uuid,uuid,text) TO service_role;


-- ============================================================
-- 4) SOURCE  (Grup B) — type-aware metadata publish + unpublish/archive dep guard
-- ============================================================
CREATE FUNCTION public.yebs_a7_source_blockers(p_id uuid, p_target text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.yebs_sources; v_b text[] := ARRAY[]::text[]; v_ok boolean;
BEGIN
  SELECT * INTO v FROM public.yebs_sources WHERE id = p_id;
  IF NOT FOUND THEN RETURN ARRAY['YEBS_SOURCE_NOT_FOUND']; END IF;

  IF p_target = 'published' THEN
    v_ok := CASE v.source_type
      WHEN 'book'                THEN (v.authors IS NOT NULL OR v.organization IS NOT NULL) AND (v.publisher IS NOT NULL OR v.isbn IS NOT NULL) AND v.publication_year IS NOT NULL
      WHEN 'monograph'           THEN (v.authors IS NOT NULL OR v.organization IS NOT NULL) AND (v.publisher IS NOT NULL OR v.isbn IS NOT NULL) AND v.publication_year IS NOT NULL
      WHEN 'journal_article'     THEN v.authors IS NOT NULL AND (v.doi IS NOT NULL OR v.publication_year IS NOT NULL)
      WHEN 'regulatory_document' THEN (v.organization IS NOT NULL OR v.document_no IS NOT NULL)
      WHEN 'standard'            THEN (v.organization IS NOT NULL OR v.document_no IS NOT NULL)
      WHEN 'website'             THEN v.url IS NOT NULL
      WHEN 'database_record'     THEN v.url IS NOT NULL
      WHEN 'classical_text'      THEN (v.dating_note IS NOT NULL OR v.publication_year IS NOT NULL)
      WHEN 'thesis'              THEN v.authors IS NOT NULL AND v.publication_year IS NOT NULL
      ELSE true  -- oral_tradition_record, other: title (NOT NULL) yeterli
    END;
    IF NOT v_ok THEN v_b := v_b || 'YEBS_SOURCE_METADATA_INCOMPLETE'; END IF;

  ELSIF p_target IN ('approved', 'archived') THEN
    -- published→approved (unpublish) / published→archived: bu Source'u nitelikli
    -- published-destek olarak kullanan bir published Claim/Relation'ın BAŞKA nitelikli
    -- published-source'u kalmıyorsa (sayı sıfıra düşerse) engelle.
    IF EXISTS (
      SELECT 1 FROM public.yebs_claim_sources cs
      JOIN public.yebs_claims c ON c.id = cs.claim_id
      WHERE cs.source_id = p_id AND cs.source_role IN ('primary_support','supporting')
        AND cs.verification_status = 'verified' AND c.status = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM public.yebs_claim_sources cs2
          JOIN public.yebs_sources s2 ON s2.id = cs2.source_id
          WHERE cs2.claim_id = c.id AND cs2.source_id <> p_id
            AND cs2.source_role IN ('primary_support','supporting')
            AND cs2.verification_status = 'verified' AND s2.status = 'published'
        )
    ) OR EXISTS (
      SELECT 1 FROM public.yebs_concept_relation_sources rs
      JOIN public.yebs_concept_relations r ON r.id = rs.concept_relation_id
      WHERE rs.source_id = p_id AND rs.source_role IN ('primary_support','supporting')
        AND rs.verification_status = 'verified' AND r.status = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM public.yebs_concept_relation_sources rs2
          JOIN public.yebs_sources s2 ON s2.id = rs2.source_id
          WHERE rs2.concept_relation_id = r.id AND rs2.source_id <> p_id
            AND rs2.source_role IN ('primary_support','supporting')
            AND rs2.verification_status = 'verified' AND s2.status = 'published'
        )
    ) THEN
      v_b := v_b || 'YEBS_PUBLISH_DEPENDENCY_BLOCKED';
    END IF;
  END IF;

  RETURN v_b;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_source_blockers(uuid, text) FROM PUBLIC;

CREATE FUNCTION public.yebs_a7_transition_source_with_audit(
  p_actor_admin_id uuid, p_request_id uuid, p_operation_id uuid,
  p_source_id uuid, p_expected_updated_at timestamptz, p_target_status text, p_reason text
)
RETURNS public.yebs_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v_email text; v_actor_label text;
  v_existing public.yebs_sources; v_updated public.yebs_sources; v_from text; v_action text; v_blockers text[];
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_source_id IS NULL THEN RAISE EXCEPTION 'YEBS_SOURCE_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE='P0001'; END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN v_actor_label := 'admin'; END IF;

  SELECT * INTO v_existing FROM public.yebs_sources WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_SOURCE_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'YEBS_SOURCE_STALE_UPDATE' USING ERRCODE='P0001'; END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN RAISE EXCEPTION 'YEBS_SOURCE_STATUS_NOOP' USING ERRCODE='P0001'; END IF;
  IF NOT ((v_from = 'approved'  AND p_target_status = 'published')
       OR (v_from = 'published' AND p_target_status = 'approved')
       OR (v_from = 'published' AND p_target_status = 'archived')) THEN
    RAISE EXCEPTION 'YEBS_SOURCE_INVALID_TRANSITION' USING ERRCODE='P0001';
  END IF;

  v_blockers := public.yebs_a7_source_blockers(p_source_id, p_target_status);
  IF array_length(v_blockers, 1) IS NOT NULL THEN RAISE EXCEPTION '%', v_blockers[1] USING ERRCODE='P0001'; END IF;

  v_action := CASE
    WHEN p_target_status = 'published' THEN 'publish'
    WHEN p_target_status = 'archived'  THEN 'archive'
    ELSE 'unpublish'
  END;
  UPDATE public.yebs_sources SET status = p_target_status WHERE id = p_source_id RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  ) VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'source', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_source_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_source_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_source_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_source_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_transition_source_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) TO service_role;

CREATE FUNCTION public.yebs_a7_source_eligibility(p_actor_admin_id uuid, p_source_id uuid, p_target_status text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v public.yebs_sources; v_from text; v_blk text[]; v_valid boolean;
BEGIN
  SELECT u.role, u.active INTO v_role, v_active FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v FROM public.yebs_sources WHERE id = p_source_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_SOURCE_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  v_from := v.status;
  v_valid := (v_from='approved' AND p_target_status='published')
          OR (v_from='published' AND p_target_status='approved')
          OR (v_from='published' AND p_target_status='archived');
  IF NOT v_valid THEN v_blk := ARRAY['YEBS_SOURCE_INVALID_TRANSITION']; ELSE v_blk := public.yebs_a7_source_blockers(p_source_id, p_target_status); END IF;
  RETURN jsonb_build_object(
    'allowed', (v_valid AND array_length(v_blk,1) IS NULL),
    'current_status', v_from, 'target_status', p_target_status,
    'blocker_codes', to_jsonb(coalesce(v_blk, ARRAY[]::text[])),
    'warnings', to_jsonb(ARRAY[]::text[]), 'evaluated_at', now(), 'expected_updated_at', v.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_source_eligibility(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_source_eligibility(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_source_eligibility(uuid,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_source_eligibility(uuid,uuid,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_source_eligibility(uuid,uuid,text) TO service_role;


-- ============================================================
-- 5) CLAIM  (Grup C) — verify / approve / publish + unpublish/archive
--    blockers (v.status, p_target) çiftine dallanır (target='approved' ikircikli).
-- ============================================================
CREATE FUNCTION public.yebs_a7_claim_blockers(p_id uuid, p_target text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.yebs_claims; v_b text[] := ARRAY[]::text[];
  v_qual_ready boolean;    -- nitelikli verified destek, source.status IN (approved,published)
  v_qual_pub boolean;      -- nitelikli verified destek, source.status = published
  v_any_verified_role boolean; -- verified+role destek var ama source hazır değil
BEGIN
  SELECT * INTO v FROM public.yebs_claims WHERE id = p_id;
  IF NOT FOUND THEN RETURN ARRAY['YEBS_CLAIM_NOT_FOUND']; END IF;

  v_qual_ready := EXISTS (
    SELECT 1 FROM public.yebs_claim_sources cs JOIN public.yebs_sources s ON s.id = cs.source_id
    WHERE cs.claim_id = p_id AND cs.source_role IN ('primary_support','supporting')
      AND cs.verification_status = 'verified' AND s.status IN ('approved','published'));
  v_qual_pub := EXISTS (
    SELECT 1 FROM public.yebs_claim_sources cs JOIN public.yebs_sources s ON s.id = cs.source_id
    WHERE cs.claim_id = p_id AND cs.source_role IN ('primary_support','supporting')
      AND cs.verification_status = 'verified' AND s.status = 'published');
  v_any_verified_role := EXISTS (
    SELECT 1 FROM public.yebs_claim_sources cs
    WHERE cs.claim_id = p_id AND cs.source_role IN ('primary_support','supporting')
      AND cs.verification_status = 'verified');

  IF v.status = 'needs_verification' AND p_target = 'verified' THEN
    IF NOT v_qual_ready THEN
      IF v_any_verified_role THEN v_b := v_b || 'YEBS_CLAIM_SUPPORT_SOURCE_NOT_READY';
      ELSE v_b := v_b || 'YEBS_CLAIM_NO_VERIFIED_EVIDENCE'; END IF;
    END IF;
  ELSIF v.status = 'verified' AND p_target = 'approved' THEN
    IF NOT v_qual_ready THEN v_b := v_b || 'YEBS_CLAIM_NOT_APPROVAL_READY'; END IF;
  ELSIF v.status = 'approved' AND p_target = 'published' THEN
    IF NOT EXISTS (SELECT 1 FROM public.yebs_concepts c WHERE c.id = v.concept_id AND c.status = 'published') THEN
      v_b := v_b || 'YEBS_CLAIM_PARENT_CONCEPT_NOT_PUBLISHED';
    END IF;
    IF NOT v_qual_pub THEN v_b := v_b || 'YEBS_CLAIM_PROVENANCE_INCOMPLETE'; END IF;
  END IF;
  -- (published→approved unpublish, published→archived): downstream bağımlılık yok → boş.
  RETURN v_b;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_claim_blockers(uuid, text) FROM PUBLIC;

CREATE FUNCTION public.yebs_a7_transition_claim_with_audit(
  p_actor_admin_id uuid, p_request_id uuid, p_operation_id uuid,
  p_claim_id uuid, p_expected_updated_at timestamptz, p_target_status text, p_reason text
)
RETURNS public.yebs_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v_email text; v_actor_label text;
  v_existing public.yebs_claims; v_updated public.yebs_claims; v_from text; v_action text; v_blockers text[];
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_claim_id IS NULL THEN RAISE EXCEPTION 'YEBS_CLAIM_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE='P0001'; END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN v_actor_label := 'admin'; END IF;

  SELECT * INTO v_existing FROM public.yebs_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_CLAIM_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'YEBS_CLAIM_STALE_UPDATE' USING ERRCODE='P0001'; END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN RAISE EXCEPTION 'YEBS_CLAIM_STATUS_NOOP' USING ERRCODE='P0001'; END IF;
  IF NOT ((v_from='needs_verification' AND p_target_status='verified')
       OR (v_from='verified'  AND p_target_status='approved')
       OR (v_from='approved'  AND p_target_status='published')
       OR (v_from='published' AND p_target_status='approved')
       OR (v_from='published' AND p_target_status='archived')) THEN
    RAISE EXCEPTION 'YEBS_CLAIM_INVALID_TRANSITION' USING ERRCODE='P0001';
  END IF;

  v_blockers := public.yebs_a7_claim_blockers(p_claim_id, p_target_status);
  IF array_length(v_blockers, 1) IS NOT NULL THEN RAISE EXCEPTION '%', v_blockers[1] USING ERRCODE='P0001'; END IF;

  v_action := CASE
    WHEN p_target_status = 'published' THEN 'publish'
    WHEN p_target_status = 'archived'  THEN 'archive'
    WHEN v_from = 'published' AND p_target_status = 'approved' THEN 'unpublish'
    ELSE 'transition'
  END;
  UPDATE public.yebs_claims SET status = p_target_status WHERE id = p_claim_id RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  ) VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'claim', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_claim_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_claim_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_claim_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_claim_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_transition_claim_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) TO service_role;

CREATE FUNCTION public.yebs_a7_claim_eligibility(p_actor_admin_id uuid, p_claim_id uuid, p_target_status text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v public.yebs_claims; v_from text; v_blk text[]; v_valid boolean;
BEGIN
  SELECT u.role, u.active INTO v_role, v_active FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v FROM public.yebs_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_CLAIM_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  v_from := v.status;
  v_valid := (v_from='needs_verification' AND p_target_status='verified')
          OR (v_from='verified'  AND p_target_status='approved')
          OR (v_from='approved'  AND p_target_status='published')
          OR (v_from='published' AND p_target_status='approved')
          OR (v_from='published' AND p_target_status='archived');
  IF NOT v_valid THEN v_blk := ARRAY['YEBS_CLAIM_INVALID_TRANSITION']; ELSE v_blk := public.yebs_a7_claim_blockers(p_claim_id, p_target_status); END IF;
  RETURN jsonb_build_object(
    'allowed', (v_valid AND array_length(v_blk,1) IS NULL),
    'current_status', v_from, 'target_status', p_target_status,
    'blocker_codes', to_jsonb(coalesce(v_blk, ARRAY[]::text[])),
    'warnings', to_jsonb(ARRAY[]::text[]), 'evaluated_at', now(), 'expected_updated_at', v.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_claim_eligibility(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_claim_eligibility(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_claim_eligibility(uuid,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_claim_eligibility(uuid,uuid,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_claim_eligibility(uuid,uuid,text) TO service_role;


-- ============================================================
-- 6) CONCEPT RELATION  (Grup C) — verify / approve / publish (+graph) + unpublish/archive
-- ============================================================
CREATE FUNCTION public.yebs_a7_concept_relation_blockers(p_id uuid, p_target text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.yebs_concept_relations; v_b text[] := ARRAY[]::text[];
  v_qual_ready boolean; v_qual_pub boolean; v_any_verified_role boolean;
  v_from_node uuid; v_to_node uuid;
BEGIN
  SELECT * INTO v FROM public.yebs_concept_relations WHERE id = p_id;
  IF NOT FOUND THEN RETURN ARRAY['YEBS_RELATION_NOT_FOUND']; END IF;

  v_qual_ready := EXISTS (
    SELECT 1 FROM public.yebs_concept_relation_sources rs JOIN public.yebs_sources s ON s.id = rs.source_id
    WHERE rs.concept_relation_id = p_id AND rs.source_role IN ('primary_support','supporting')
      AND rs.verification_status = 'verified' AND s.status IN ('approved','published'));
  v_qual_pub := EXISTS (
    SELECT 1 FROM public.yebs_concept_relation_sources rs JOIN public.yebs_sources s ON s.id = rs.source_id
    WHERE rs.concept_relation_id = p_id AND rs.source_role IN ('primary_support','supporting')
      AND rs.verification_status = 'verified' AND s.status = 'published');
  v_any_verified_role := EXISTS (
    SELECT 1 FROM public.yebs_concept_relation_sources rs
    WHERE rs.concept_relation_id = p_id AND rs.source_role IN ('primary_support','supporting')
      AND rs.verification_status = 'verified');

  IF v.status = 'needs_verification' AND p_target = 'verified' THEN
    IF NOT v_qual_ready THEN
      IF v_any_verified_role THEN v_b := v_b || 'YEBS_RELATION_SUPPORT_SOURCE_NOT_READY';
      ELSE v_b := v_b || 'YEBS_RELATION_NO_VERIFIED_EVIDENCE'; END IF;
    END IF;
  ELSIF v.status = 'verified' AND p_target = 'approved' THEN
    IF NOT v_qual_ready THEN v_b := v_b || 'YEBS_RELATION_NOT_APPROVAL_READY'; END IF;
  ELSIF v.status = 'approved' AND p_target = 'published' THEN
    IF NOT EXISTS (SELECT 1 FROM public.yebs_concepts c WHERE c.id = v.source_concept_id AND c.status = 'published')
       OR NOT EXISTS (SELECT 1 FROM public.yebs_concepts c WHERE c.id = v.target_concept_id AND c.status = 'published') THEN
      v_b := v_b || 'YEBS_RELATION_PARENT_CONCEPT_NOT_PUBLISHED';
    END IF;
    IF NOT v_qual_pub THEN v_b := v_b || 'YEBS_RELATION_PROVENANCE_INCOMPLETE'; END IF;
    -- Hiyerarşik (broader_than/part_of): birleşik normalize graf döngü kontrolü.
    IF v.relation_type IN ('broader_than','part_of') THEN
      IF v.relation_type = 'broader_than' THEN
        v_from_node := v.source_concept_id; v_to_node := v.target_concept_id;   -- A->B
      ELSE
        v_from_node := v.target_concept_id; v_to_node := v.source_concept_id;   -- part_of => B->A
      END IF;
      IF public.yebs_a7_hierarchy_cycle_exists(v_from_node, v_to_node) THEN
        v_b := v_b || 'YEBS_RELATION_GRAPH_CYCLE';
      END IF;
    END IF;
  END IF;
  RETURN v_b;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_relation_blockers(uuid, text) FROM PUBLIC;

CREATE FUNCTION public.yebs_a7_transition_concept_relation_with_audit(
  p_actor_admin_id uuid, p_request_id uuid, p_operation_id uuid,
  p_relation_id uuid, p_expected_updated_at timestamptz, p_target_status text, p_reason text
)
RETURNS public.yebs_concept_relations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v_email text; v_actor_label text;
  v_existing public.yebs_concept_relations; v_updated public.yebs_concept_relations; v_from text; v_action text; v_blockers text[];
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_relation_id IS NULL THEN RAISE EXCEPTION 'YEBS_RELATION_ID_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE='P0001'; END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN v_actor_label := 'admin'; END IF;

  -- Hiyerarşik graf yarışını serialize et: birleşik (broader_than+part_of) SABİT
  -- ortak advisory key (type başına AYRI DEĞİL — mixed-type yarış kaçmasın).
  IF p_target_status = 'published' THEN
    PERFORM pg_advisory_xact_lock(477120260920);
  END IF;

  SELECT * INTO v_existing FROM public.yebs_concept_relations WHERE id = p_relation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_RELATION_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'YEBS_RELATION_STALE_UPDATE' USING ERRCODE='P0001'; END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN RAISE EXCEPTION 'YEBS_RELATION_STATUS_NOOP' USING ERRCODE='P0001'; END IF;
  IF NOT ((v_from='needs_verification' AND p_target_status='verified')
       OR (v_from='verified'  AND p_target_status='approved')
       OR (v_from='approved'  AND p_target_status='published')
       OR (v_from='published' AND p_target_status='approved')
       OR (v_from='published' AND p_target_status='archived')) THEN
    RAISE EXCEPTION 'YEBS_RELATION_INVALID_TRANSITION' USING ERRCODE='P0001';
  END IF;

  v_blockers := public.yebs_a7_concept_relation_blockers(p_relation_id, p_target_status);
  IF array_length(v_blockers, 1) IS NOT NULL THEN RAISE EXCEPTION '%', v_blockers[1] USING ERRCODE='P0001'; END IF;

  v_action := CASE
    WHEN p_target_status = 'published' THEN 'publish'
    WHEN p_target_status = 'archived'  THEN 'archive'
    WHEN v_from = 'published' AND p_target_status = 'approved' THEN 'unpublish'
    ELSE 'transition'
  END;
  UPDATE public.yebs_concept_relations SET status = p_target_status WHERE id = p_relation_id RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  ) VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'concept_relation', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_relation_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_relation_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_relation_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_transition_concept_relation_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_transition_concept_relation_with_audit(uuid,uuid,uuid,uuid,timestamptz,text,text) TO service_role;

CREATE FUNCTION public.yebs_a7_concept_relation_eligibility(p_actor_admin_id uuid, p_relation_id uuid, p_target_status text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text; v_active boolean; v public.yebs_concept_relations; v_from text; v_blk text[]; v_valid boolean;
BEGIN
  SELECT u.role, u.active INTO v_role, v_active FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v FROM public.yebs_concept_relations WHERE id = p_relation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'YEBS_RELATION_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  v_from := v.status;
  v_valid := (v_from='needs_verification' AND p_target_status='verified')
          OR (v_from='verified'  AND p_target_status='approved')
          OR (v_from='approved'  AND p_target_status='published')
          OR (v_from='published' AND p_target_status='approved')
          OR (v_from='published' AND p_target_status='archived');
  IF NOT v_valid THEN v_blk := ARRAY['YEBS_RELATION_INVALID_TRANSITION']; ELSE v_blk := public.yebs_a7_concept_relation_blockers(p_relation_id, p_target_status); END IF;
  RETURN jsonb_build_object(
    'allowed', (v_valid AND array_length(v_blk,1) IS NULL),
    'current_status', v_from, 'target_status', p_target_status,
    'blocker_codes', to_jsonb(coalesce(v_blk, ARRAY[]::text[])),
    'warnings', to_jsonb(ARRAY[]::text[]), 'evaluated_at', now(), 'expected_updated_at', v.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_relation_eligibility(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_relation_eligibility(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_relation_eligibility(uuid,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_concept_relation_eligibility(uuid,uuid,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_concept_relation_eligibility(uuid,uuid,text) TO service_role;

COMMIT;
