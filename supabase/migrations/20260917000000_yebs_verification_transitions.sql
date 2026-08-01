-- ============================================================
-- 20260917000000_yebs_verification_transitions.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-TX (TX-V)
-- Atomik EVIDENCE VERIFICATION TRANSITION + AUDIT (D7 claim_sources, D9 relation_sources)
-- + verified/rejected EVIDENCE EDIT LOCK (güvenli BEFORE UPDATE trigger).
--
-- Amaç:
--   A. verification_status'u audit'li, fail-closed, optimistic-concurrency korumalı
--      ve allowlist-tabanlı state machine ile değiştiren iki entity-specific RPC.
--   B. verification_status IN ('verified','rejected') iken EVIDENCE İÇERİK alanlarının
--      güncellenmesini engelleyen BEFORE UPDATE trigger'ı (§11 evidence edit lock).
--      Yalnız verification_status'un TEK BAŞINA değişmesine izin verilir (verification
--      RPC'leri bundan etkilenmez); herhangi bir içerik alanı değişirse RAISE.
--
-- Neden trigger (CREATE OR REPLACE yerine): mevcut dev update RPC gövdelerini
--   (A4/A5) BYTE-BYTE değiştirmeden, additif ve defense-in-depth bir güvenli
--   "wrapper" ile kilidi kurar (§11 izinli seçenek: "gerekli güvenli wrapper/helper").
--   Böylece A4/A5 mutation migration dosyaları ve RPC gövdeleri SAME kalır.
--
-- Bağlayıcı kararlar (API-TX TX-V):
--   - Claim Source ve Relation Source AYRI public RPC (Relation Source evidence_layer
--     taşır; tek kör generic RPC YOK).
--   - Verification state machine: unverified→verified, unverified→rejected,
--     verified→unverified, rejected→unverified, verified→rejected. rejected→verified
--     ve aynı-status YASAK.
--   - Parent status gate: verification YALNIZ parent (Claim/Relation) status ∈
--     {draft, under_review, needs_verification} iken değişir; aksi → PARENT_STATUS_LOCKED.
--     Parent status OTOMATİK DEĞİŞMEZ; verification parent üzerinde audit ÜRETMEZ.
--   - Optimistic concurrency (expected_updated_at) + reason zorunlu + no-op reddi.
--   - Audit action: verified→verify, rejected→reject, unverified→transition.
--   - changed_fields = ['verification_status']. previous/new tam snapshot.
--   - Doğrudan write YOK (service_role SELECT-only); fiziksel DELETE YOK.
--
-- Deterministik/fail-fast: düz ifadeler; CREATE FUNCTION/CREATE TRIGGER fail-closed
--   (varsa hata). D1–D9 / AUD1 şeması ALTER EDİLMEZ; tablo grant'ı DEĞİŞTİRİLMEZ.
--
-- Kararlı hata kodları (P0001):
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_CLAIM_ID_REQUIRED,
--   YEBS_CLAIM_SOURCE_ID_REQUIRED, YEBS_RELATION_ID_REQUIRED, YEBS_RELATION_SOURCE_ID_REQUIRED,
--   YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID, YEBS_ADMIN_NOT_FOUND,
--   YEBS_ADMIN_NOT_ACTIVE, YEBS_CLAIM_SOURCE_NOT_FOUND, YEBS_CLAIM_SOURCE_PARENT_STATUS_LOCKED,
--   YEBS_CLAIM_SOURCE_STALE_UPDATE, YEBS_CLAIM_SOURCE_VERIFICATION_NOOP,
--   YEBS_CLAIM_SOURCE_INVALID_VERIFICATION_TRANSITION, YEBS_CLAIM_SOURCE_VERIFICATION_LOCKED,
--   (+ Relation Source için YEBS_RELATION_SOURCE_* eşdeğerleri).
-- ============================================================

BEGIN;

-- ============================================================
-- A) EVIDENCE EDIT LOCK — Claim Sources (D7) BEFORE UPDATE trigger
--    verified/rejected iken içerik alanı değişimini reddeder; verification_status'un
--    tek başına değişmesine (verification RPC) izin verir.
-- ============================================================
CREATE FUNCTION public.yebs_claim_source_evidence_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.verification_status IN ('verified', 'rejected') THEN
    IF NEW.claim_id                     IS DISTINCT FROM OLD.claim_id
       OR NEW.source_id                    IS DISTINCT FROM OLD.source_id
       OR NEW.source_role                  IS DISTINCT FROM OLD.source_role
       OR NEW.locator_text                 IS DISTINCT FROM OLD.locator_text
       OR NEW.url_fragment                 IS DISTINCT FROM OLD.url_fragment
       OR NEW.source_original_excerpt      IS DISTINCT FROM OLD.source_original_excerpt
       OR NEW.source_original_language_tag IS DISTINCT FROM OLD.source_original_language_tag
       OR NEW.source_original_script_code  IS DISTINCT FROM OLD.source_original_script_code
       OR NEW.transliteration              IS DISTINCT FROM OLD.transliteration
       OR NEW.transliteration_scheme       IS DISTINCT FROM OLD.transliteration_scheme
       OR NEW.faithful_translation         IS DISTINCT FROM OLD.faithful_translation
       OR NEW.translation_language_tag     IS DISTINCT FROM OLD.translation_language_tag
       OR NEW.rationale                    IS DISTINCT FROM OLD.rationale
       OR NEW.rationale_status             IS DISTINCT FROM OLD.rationale_status
    THEN
      RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_VERIFICATION_LOCKED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.yebs_claim_source_evidence_lock() FROM PUBLIC;

CREATE TRIGGER trg_yebs_claim_source_evidence_lock
  BEFORE UPDATE ON public.yebs_claim_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.yebs_claim_source_evidence_lock();

-- ============================================================
-- B) EVIDENCE EDIT LOCK — Concept Relation Sources (D9) BEFORE UPDATE trigger
--    (D7 ile aynı model + evidence_layer içerik alanı).
-- ============================================================
CREATE FUNCTION public.yebs_concept_relation_source_evidence_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.verification_status IN ('verified', 'rejected') THEN
    IF NEW.concept_relation_id          IS DISTINCT FROM OLD.concept_relation_id
       OR NEW.source_id                    IS DISTINCT FROM OLD.source_id
       OR NEW.evidence_layer               IS DISTINCT FROM OLD.evidence_layer
       OR NEW.source_role                  IS DISTINCT FROM OLD.source_role
       OR NEW.locator_text                 IS DISTINCT FROM OLD.locator_text
       OR NEW.url_fragment                 IS DISTINCT FROM OLD.url_fragment
       OR NEW.source_original_excerpt      IS DISTINCT FROM OLD.source_original_excerpt
       OR NEW.source_original_language_tag IS DISTINCT FROM OLD.source_original_language_tag
       OR NEW.source_original_script_code  IS DISTINCT FROM OLD.source_original_script_code
       OR NEW.transliteration              IS DISTINCT FROM OLD.transliteration
       OR NEW.transliteration_scheme       IS DISTINCT FROM OLD.transliteration_scheme
       OR NEW.faithful_translation         IS DISTINCT FROM OLD.faithful_translation
       OR NEW.translation_language_tag     IS DISTINCT FROM OLD.translation_language_tag
       OR NEW.rationale                    IS DISTINCT FROM OLD.rationale
       OR NEW.rationale_status             IS DISTINCT FROM OLD.rationale_status
    THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_VERIFICATION_LOCKED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.yebs_concept_relation_source_evidence_lock() FROM PUBLIC;

CREATE TRIGGER trg_yebs_concept_relation_source_evidence_lock
  BEFORE UPDATE ON public.yebs_concept_relation_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.yebs_concept_relation_source_evidence_lock();

-- ============================================================
-- C) CLAIM SOURCE verification transition RPC
--    enum {unverified,verified,rejected}
-- ============================================================
CREATE FUNCTION public.yebs_transition_claim_source_verification_with_audit(
  p_actor_admin_id             uuid,
  p_request_id                 uuid,
  p_operation_id               uuid,
  p_claim_id                   uuid,
  p_claim_source_id            uuid,
  p_expected_updated_at        timestamptz,
  p_target_verification_status text,
  p_reason                     text
)
RETURNS public.yebs_claim_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_existing     public.yebs_claim_sources;
  v_updated      public.yebs_claim_sources;
  v_claim_status text;
  v_from         text;
  v_action       text;
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
  IF p_claim_source_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_verification_status IS NULL
     OR p_target_verification_status NOT IN ('unverified', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_INVALID_VERIFICATION_TRANSITION' USING ERRCODE = 'P0001';
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

  -- Junction satırını kilitle.
  SELECT * INTO v_existing FROM public.yebs_claim_sources
    WHERE id = p_claim_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Path aidiyeti (satır path'teki claim_id'ye ait olmalı).
  IF v_existing.claim_id IS DISTINCT FROM p_claim_id THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Parent Claim kilidi + status gate (yalnız draft/under_review/needs_verification).
  SELECT c.status INTO v_claim_status FROM public.yebs_claims c
    WHERE c.id = v_existing.claim_id FOR UPDATE;
  IF v_claim_status IS NULL
     OR v_claim_status NOT IN ('draft', 'under_review', 'needs_verification') THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_PARENT_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- Optimistic concurrency.
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.verification_status;
  IF v_from = p_target_verification_status THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_VERIFICATION_NOOP' USING ERRCODE = 'P0001';
  END IF;

  -- Exact verification state machine. rejected→verified ve aynı-status YASAK.
  IF NOT (
       (v_from = 'unverified' AND p_target_verification_status = 'verified')
    OR (v_from = 'unverified' AND p_target_verification_status = 'rejected')
    OR (v_from = 'verified'   AND p_target_verification_status = 'unverified')
    OR (v_from = 'rejected'   AND p_target_verification_status = 'unverified')
    OR (v_from = 'verified'   AND p_target_verification_status = 'rejected')
  ) THEN
    RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_INVALID_VERIFICATION_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_target_verification_status = 'verified' THEN
    v_action := 'verify';
  ELSIF p_target_verification_status = 'rejected' THEN
    v_action := 'reject';
  ELSE
    v_action := 'transition';
  END IF;

  -- Yalnız verification_status değişir (içerik alanları DEĞİŞMEZ → evidence-lock
  -- trigger'ı bu değişikliğe izin verir).
  UPDATE public.yebs_claim_sources
     SET verification_status = p_target_verification_status
   WHERE id = p_claim_source_id
  RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'claim_source', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated),
    ARRAY['verification_status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- D) CONCEPT RELATION SOURCE verification transition RPC
--    enum {unverified,verified,rejected}
-- ============================================================
CREATE FUNCTION public.yebs_transition_concept_relation_source_verification_with_audit(
  p_actor_admin_id             uuid,
  p_request_id                 uuid,
  p_operation_id               uuid,
  p_relation_id                uuid,
  p_relation_source_id         uuid,
  p_expected_updated_at        timestamptz,
  p_target_verification_status text,
  p_reason                     text
)
RETURNS public.yebs_concept_relation_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role            text;
  v_active          boolean;
  v_email           text;
  v_actor_label     text;
  v_existing        public.yebs_concept_relation_sources;
  v_updated         public.yebs_concept_relation_sources;
  v_relation_status text;
  v_from            text;
  v_action          text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_relation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_relation_source_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_verification_status IS NULL
     OR p_target_verification_status NOT IN ('unverified', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_VERIFICATION_TRANSITION' USING ERRCODE = 'P0001';
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

  SELECT * INTO v_existing FROM public.yebs_concept_relation_sources
    WHERE id = p_relation_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.concept_relation_id IS DISTINCT FROM p_relation_id THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.status INTO v_relation_status FROM public.yebs_concept_relations r
    WHERE r.id = v_existing.concept_relation_id FOR UPDATE;
  IF v_relation_status IS NULL
     OR v_relation_status NOT IN ('draft', 'under_review', 'needs_verification') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_PARENT_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  v_from := v_existing.verification_status;
  IF v_from = p_target_verification_status THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_VERIFICATION_NOOP' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
       (v_from = 'unverified' AND p_target_verification_status = 'verified')
    OR (v_from = 'unverified' AND p_target_verification_status = 'rejected')
    OR (v_from = 'verified'   AND p_target_verification_status = 'unverified')
    OR (v_from = 'rejected'   AND p_target_verification_status = 'unverified')
    OR (v_from = 'verified'   AND p_target_verification_status = 'rejected')
  ) THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_VERIFICATION_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_target_verification_status = 'verified' THEN
    v_action := 'verify';
  ELSIF p_target_verification_status = 'rejected' THEN
    v_action := 'reject';
  ELSE
    v_action := 'transition';
  END IF;

  UPDATE public.yebs_concept_relation_sources
     SET verification_status = p_target_verification_status
   WHERE id = p_relation_source_id
  RETURNING * INTO v_updated;

  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, v_action, 'concept_relation_source', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated),
    ARRAY['verification_status']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ============================================================
-- E) EXECUTE privilege modeli — verification RPC'leri tam signature ile kilitle.
--    PUBLIC/anon/authenticated/service_role tam REVOKE; yalnız service_role GRANT.
--    Tablo grant'ları (service_role SELECT-only write-gate) DEĞİŞTİRİLMEZ.
-- ============================================================
REVOKE ALL ON FUNCTION public.yebs_transition_claim_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_claim_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_claim_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_claim_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_claim_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_transition_concept_relation_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_transition_concept_relation_source_verification_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, text) TO service_role;

COMMIT;
