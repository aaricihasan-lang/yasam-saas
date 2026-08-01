-- ============================================================
-- 20260916000000_yebs_canonical_transitions.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-TX (TX-C)
-- Atomik CANONICAL LIFECYCLE TRANSITION + AUDIT (D1/D2/D3/D5/D6/D8)
--
-- Amaç: canonical kayıtların (tradition/school/concept/source/claim/concept_relation)
--   status alanını audit'li, fail-closed, optimistic-concurrency korumalı ve
--   allowlist-tabanlı state machine ile güvenli biçimde değiştirmek. status
--   değişikliği yalnız bu SECURITY DEFINER RPC'lerle mümkündür; mevcut generic
--   CRUD RPC'leri status'a DOKUNMAZ (yalnız draft satır + status patch-dışı) ve
--   service_role tabloya doğrudan YAZAMAZ (write-gate: SELECT-only).
--
-- Bağlayıcı kararlar (API-TX TX-C):
--   - Entity-specific public RPC (generic dynamic-table DML YOK). Her RPC statik
--     SQL ile TEK tabloya yazar; arbitrary entity_type/tablo adı KABUL ETMEZ.
--   - Optimistic concurrency: p_expected_updated_at zorunlu; SELECT ... FOR UPDATE.
--   - reason ZORUNLU (btrim≠'' ve ≤2000; normalize EDİLMEZ — fidelity korunur).
--   - Aktif admin gate: actor yalnız p_actor_admin_id'den; role='admin' + active.
--   - Exact state machine (allowlist). İzin dışı (from,to) → INVALID_TRANSITION.
--   - No-op reddi: from = to → STATUS_NOOP (satır/updated_at değişmez, audit YOK).
--   - Otomatik cascade YOK; parent/child status'u DEĞİŞTİRİLMEZ; fiziksel DELETE YOK.
--   - approved → published bu fazda KAPALI (A7 publish-eligibility kapısına bırakıldı).
--     Bu nedenle 'publish' action bu migration'da ÜRETİLMEZ.
--   - published → approved = explicit unpublish (audit action='unpublish').
--   - archived → draft = unarchive (audit action='transition',
--     metadata.transition_kind='unarchive'); yalnız archived enum'u olan
--     Sources/Claims/Concept Relations'ta. Geçmişten previous-status restore YOK.
--   - X → archived = archive (audit action='archive'); yalnız Sources/Claims/Relations.
--
-- Deterministik/fail-fast: düz ifadeler; IF NOT EXISTS/OR REPLACE/DO/dynamic SQL YOK.
--   RPC zaten varsa CREATE FUNCTION hata verir (fail-closed). Explicit BEGIN/COMMIT.
--   D1–D9 / AUD1 şeması ALTER EDİLMEZ; yeni tablo/kolon/trigger/policy YOK.
--
-- Kararlı hata kodları (ham DB/kullanıcı verisi SIZDIRILMAZ; tümü P0001):
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_<E>_ID_REQUIRED,
--   YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID, YEBS_ADMIN_NOT_FOUND,
--   YEBS_ADMIN_NOT_ACTIVE, YEBS_<E>_NOT_FOUND, YEBS_<E>_STALE_UPDATE,
--   YEBS_<E>_STATUS_NOOP, YEBS_<E>_INVALID_TRANSITION.
--   (<E> ∈ TRADITION/SCHOOL/CONCEPT/SOURCE/CLAIM/CONCEPT_RELATION)
--
-- Write-gate: tablo grant'ları (service_role SELECT-only) DEĞİŞTİRİLMEZ. RPC EXECUTE
--   modeli: PUBLIC/anon/authenticated/service_role tam REVOKE; yalnız service_role GRANT.
-- ============================================================

BEGIN;

-- ============================================================
-- D1) TRADITION transition  — enum {draft,verified,approved,published}
-- ============================================================
CREATE FUNCTION public.yebs_transition_tradition_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_tradition_id        uuid,
  p_expected_updated_at timestamptz,
  p_target_status       text,
  p_reason              text
)
RETURNS public.yebs_traditions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role        text;
  v_active      boolean;
  v_email       text;
  v_actor_label text;
  v_existing    public.yebs_traditions;
  v_updated     public.yebs_traditions;
  v_from        text;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_tradition_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_TRADITION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_status IS NULL
     OR p_target_status NOT IN ('draft','verified','approved','published') THEN
    RAISE EXCEPTION 'YEBS_TRADITION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email
    FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  SELECT * INTO v_existing FROM public.yebs_traditions
    WHERE id = p_tradition_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_TRADITION_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN
    RAISE EXCEPTION 'YEBS_TRADITION_STATUS_NOOP' USING ERRCODE = 'P0001';
  END IF;

  -- Exact state machine (Grup A). archived / →published YOK.
  IF NOT (
       (v_from = 'draft'     AND p_target_status = 'verified')
    OR (v_from = 'verified'  AND p_target_status = 'approved')
    OR (v_from = 'verified'  AND p_target_status = 'draft')
    OR (v_from = 'approved'  AND p_target_status = 'verified')
    OR (v_from = 'published' AND p_target_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'YEBS_TRADITION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF v_from = 'published' AND p_target_status = 'approved' THEN
    v_action := 'unpublish';
  ELSE
    v_action := 'transition';
  END IF;

  BEGIN
    UPDATE public.yebs_traditions
       SET status = p_target_status
     WHERE id = p_tradition_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_TRADITION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'tradition', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[],
    p_reason, p_request_id, p_operation_id, NULL, v_meta
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- D2) SCHOOL transition — enum {draft,verified,approved,published}
-- ============================================================
CREATE FUNCTION public.yebs_transition_school_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_school_id           uuid,
  p_expected_updated_at timestamptz,
  p_target_status       text,
  p_reason              text
)
RETURNS public.yebs_schools
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role        text;
  v_active      boolean;
  v_email       text;
  v_actor_label text;
  v_existing    public.yebs_schools;
  v_updated     public.yebs_schools;
  v_from        text;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_SCHOOL_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_status IS NULL
     OR p_target_status NOT IN ('draft','verified','approved','published') THEN
    RAISE EXCEPTION 'YEBS_SCHOOL_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email
    FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  SELECT * INTO v_existing FROM public.yebs_schools
    WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_SCHOOL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_SCHOOL_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN
    RAISE EXCEPTION 'YEBS_SCHOOL_STATUS_NOOP' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
       (v_from = 'draft'     AND p_target_status = 'verified')
    OR (v_from = 'verified'  AND p_target_status = 'approved')
    OR (v_from = 'verified'  AND p_target_status = 'draft')
    OR (v_from = 'approved'  AND p_target_status = 'verified')
    OR (v_from = 'published' AND p_target_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'YEBS_SCHOOL_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF v_from = 'published' AND p_target_status = 'approved' THEN
    v_action := 'unpublish';
  ELSE
    v_action := 'transition';
  END IF;

  BEGIN
    UPDATE public.yebs_schools
       SET status = p_target_status
     WHERE id = p_school_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_SCHOOL_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'school', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[],
    p_reason, p_request_id, p_operation_id, NULL, v_meta
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- D3) CONCEPT transition — enum {draft,verified,approved,published}
-- ============================================================
CREATE FUNCTION public.yebs_transition_concept_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_concept_id          uuid,
  p_expected_updated_at timestamptz,
  p_target_status       text,
  p_reason              text
)
RETURNS public.yebs_concepts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role        text;
  v_active      boolean;
  v_email       text;
  v_actor_label text;
  v_existing    public.yebs_concepts;
  v_updated     public.yebs_concepts;
  v_from        text;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_concept_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_status IS NULL
     OR p_target_status NOT IN ('draft','verified','approved','published') THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email
    FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  SELECT * INTO v_existing FROM public.yebs_concepts
    WHERE id = p_concept_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_NOOP' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
       (v_from = 'draft'     AND p_target_status = 'verified')
    OR (v_from = 'verified'  AND p_target_status = 'approved')
    OR (v_from = 'verified'  AND p_target_status = 'draft')
    OR (v_from = 'approved'  AND p_target_status = 'verified')
    OR (v_from = 'published' AND p_target_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF v_from = 'published' AND p_target_status = 'approved' THEN
    v_action := 'unpublish';
  ELSE
    v_action := 'transition';
  END IF;

  BEGIN
    UPDATE public.yebs_concepts
       SET status = p_target_status
     WHERE id = p_concept_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'concept', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[],
    p_reason, p_request_id, p_operation_id, NULL, v_meta
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- D5) SOURCE transition — enum {draft,verified,approved,published,archived}
-- ============================================================
CREATE FUNCTION public.yebs_transition_source_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_source_id           uuid,
  p_expected_updated_at timestamptz,
  p_target_status       text,
  p_reason              text
)
RETURNS public.yebs_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role        text;
  v_active      boolean;
  v_email       text;
  v_actor_label text;
  v_existing    public.yebs_sources;
  v_updated     public.yebs_sources;
  v_from        text;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_SOURCE_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_status IS NULL
     OR p_target_status NOT IN ('draft','verified','approved','published','archived') THEN
    RAISE EXCEPTION 'YEBS_SOURCE_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email
    FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  SELECT * INTO v_existing FROM public.yebs_sources
    WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_SOURCE_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN
    RAISE EXCEPTION 'YEBS_SOURCE_STATUS_NOOP' USING ERRCODE = 'P0001';
  END IF;

  -- Exact state machine (Grup B: + archive/unarchive). →published KAPALI.
  IF NOT (
       (v_from = 'draft'     AND p_target_status = 'verified')
    OR (v_from = 'verified'  AND p_target_status = 'approved')
    OR (v_from = 'verified'  AND p_target_status = 'draft')
    OR (v_from = 'approved'  AND p_target_status = 'verified')
    OR (v_from = 'published' AND p_target_status = 'approved')
    OR (v_from = 'draft'     AND p_target_status = 'archived')
    OR (v_from = 'verified'  AND p_target_status = 'archived')
    OR (v_from = 'approved'  AND p_target_status = 'archived')
    OR (v_from = 'published' AND p_target_status = 'archived')
    OR (v_from = 'archived'  AND p_target_status = 'draft')
  ) THEN
    RAISE EXCEPTION 'YEBS_SOURCE_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_target_status = 'archived' THEN
    v_action := 'archive';
  ELSIF v_from = 'published' AND p_target_status = 'approved' THEN
    v_action := 'unpublish';
  ELSIF v_from = 'archived' AND p_target_status = 'draft' THEN
    v_action := 'transition';
    v_meta   := jsonb_build_object('transition_kind', 'unarchive');
  ELSE
    v_action := 'transition';
  END IF;

  BEGIN
    UPDATE public.yebs_sources
       SET status = p_target_status
     WHERE id = p_source_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_SOURCE_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'source', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[],
    p_reason, p_request_id, p_operation_id, NULL, v_meta
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- D6) CLAIM transition
--     enum {draft,under_review,needs_verification,verified,approved,published,archived}
-- ============================================================
CREATE FUNCTION public.yebs_transition_claim_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_claim_id            uuid,
  p_expected_updated_at timestamptz,
  p_target_status       text,
  p_reason              text
)
RETURNS public.yebs_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role        text;
  v_active      boolean;
  v_email       text;
  v_actor_label text;
  v_existing    public.yebs_claims;
  v_updated     public.yebs_claims;
  v_from        text;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_claim_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CLAIM_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_status IS NULL
     OR p_target_status NOT IN (
       'draft','under_review','needs_verification','verified','approved','published','archived'
     ) THEN
    RAISE EXCEPTION 'YEBS_CLAIM_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email
    FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  SELECT * INTO v_existing FROM public.yebs_claims
    WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_CLAIM_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN
    RAISE EXCEPTION 'YEBS_CLAIM_STATUS_NOOP' USING ERRCODE = 'P0001';
  END IF;

  -- Exact state machine (Grup C). needs_verification→verified, verified→approved,
  -- approved→published A7'ye kadar KAPALI (allowlist'te YOK).
  IF NOT (
       (v_from = 'draft'              AND p_target_status = 'under_review')
    OR (v_from = 'under_review'       AND p_target_status = 'needs_verification')
    OR (v_from = 'under_review'       AND p_target_status = 'draft')
    OR (v_from = 'needs_verification' AND p_target_status = 'under_review')
    OR (v_from = 'needs_verification' AND p_target_status = 'draft')
    OR (v_from = 'verified'           AND p_target_status = 'needs_verification')
    OR (v_from = 'approved'           AND p_target_status = 'verified')
    OR (v_from = 'published'          AND p_target_status = 'approved')
    OR (v_from = 'draft'              AND p_target_status = 'archived')
    OR (v_from = 'under_review'       AND p_target_status = 'archived')
    OR (v_from = 'needs_verification' AND p_target_status = 'archived')
    OR (v_from = 'verified'           AND p_target_status = 'archived')
    OR (v_from = 'approved'           AND p_target_status = 'archived')
    OR (v_from = 'published'          AND p_target_status = 'archived')
    OR (v_from = 'archived'           AND p_target_status = 'draft')
  ) THEN
    RAISE EXCEPTION 'YEBS_CLAIM_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_target_status = 'archived' THEN
    v_action := 'archive';
  ELSIF v_from = 'published' AND p_target_status = 'approved' THEN
    v_action := 'unpublish';
  ELSIF v_from = 'archived' AND p_target_status = 'draft' THEN
    v_action := 'transition';
    v_meta   := jsonb_build_object('transition_kind', 'unarchive');
  ELSE
    v_action := 'transition';
  END IF;

  BEGIN
    UPDATE public.yebs_claims
       SET status = p_target_status
     WHERE id = p_claim_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_CLAIM_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'claim', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[],
    p_reason, p_request_id, p_operation_id, NULL, v_meta
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- D8) CONCEPT RELATION transition
--     enum {draft,under_review,needs_verification,verified,approved,published,archived}
-- ============================================================
CREATE FUNCTION public.yebs_transition_concept_relation_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_relation_id         uuid,
  p_expected_updated_at timestamptz,
  p_target_status       text,
  p_reason              text
)
RETURNS public.yebs_concept_relations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role        text;
  v_active      boolean;
  v_email       text;
  v_actor_label text;
  v_existing    public.yebs_concept_relations;
  v_updated     public.yebs_concept_relations;
  v_from        text;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_relation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_status IS NULL
     OR p_target_status NOT IN (
       'draft','under_review','needs_verification','verified','approved','published','archived'
     ) THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.role, u.active, u.email INTO v_role, v_active, v_email
    FROM public.users u WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  SELECT * INTO v_existing FROM public.yebs_concept_relations
    WHERE id = p_relation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.status;
  IF v_from = p_target_status THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_STATUS_NOOP' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
       (v_from = 'draft'              AND p_target_status = 'under_review')
    OR (v_from = 'under_review'       AND p_target_status = 'needs_verification')
    OR (v_from = 'under_review'       AND p_target_status = 'draft')
    OR (v_from = 'needs_verification' AND p_target_status = 'under_review')
    OR (v_from = 'needs_verification' AND p_target_status = 'draft')
    OR (v_from = 'verified'           AND p_target_status = 'needs_verification')
    OR (v_from = 'approved'           AND p_target_status = 'verified')
    OR (v_from = 'published'          AND p_target_status = 'approved')
    OR (v_from = 'draft'              AND p_target_status = 'archived')
    OR (v_from = 'under_review'       AND p_target_status = 'archived')
    OR (v_from = 'needs_verification' AND p_target_status = 'archived')
    OR (v_from = 'verified'           AND p_target_status = 'archived')
    OR (v_from = 'approved'           AND p_target_status = 'archived')
    OR (v_from = 'published'          AND p_target_status = 'archived')
    OR (v_from = 'archived'           AND p_target_status = 'draft')
  ) THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_target_status = 'archived' THEN
    v_action := 'archive';
  ELSIF v_from = 'published' AND p_target_status = 'approved' THEN
    v_action := 'unpublish';
  ELSIF v_from = 'archived' AND p_target_status = 'draft' THEN
    v_action := 'transition';
    v_meta   := jsonb_build_object('transition_kind', 'unarchive');
  ELSE
    v_action := 'transition';
  END IF;

  BEGIN
    UPDATE public.yebs_concept_relations
       SET status = p_target_status
     WHERE id = p_relation_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'concept_relation', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), ARRAY['status']::text[],
    p_reason, p_request_id, p_operation_id, NULL, v_meta
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- EXECUTE privilege modeli — tam signature ile kilitle.
-- PUBLIC/anon/authenticated/service_role tam REVOKE; yalnız service_role GRANT.
-- Tablo grant'ları (service_role SELECT-only write-gate) DEĞİŞTİRİLMEZ.
-- ============================================================
REVOKE ALL ON FUNCTION public.yebs_transition_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_transition_school_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_school_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_school_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_school_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_school_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_transition_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_transition_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_transition_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

COMMIT;
