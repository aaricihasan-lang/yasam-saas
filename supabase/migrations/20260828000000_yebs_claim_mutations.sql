-- ============================================================
-- 20260828000000_yebs_claim_mutations.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A4A (Claims)
-- Write-gate + atomik CREATE/UPDATE + AUDIT (public.yebs_claims)
--
-- Kapsam:
--   A. Write-gate: service_role yalnız SELECT (A1/A2/A3 kalıbı). RLS enabled kalır;
--      policy eklenmez; FORCE RLS açılmaz.
--   B. yebs_create_claim_with_audit  — SECURITY DEFINER, EXECUTE yalnız service_role.
--   C. yebs_update_claim_with_audit  — partial JSONB patch; yalnız status='draft';
--      expected_updated_at optimistic concurrency; concept_id/status/id/timestamps immutable.
--
-- Claim = SAF editöryal/kanonik iddia gövdesi. Source künyesi/locator/özgün pasaj/
--   transliterasyon/sadık çeviri/rationale/Claim-Source bağı BURADA TUTULMAZ (D7
--   yebs_claim_sources; A4B). Bu migration D6 (20260729000000) tablosunu, D7
--   (20260730000000) tablosunu ve AUD1 CHECK'ini DEĞİŞTİRMEZ. DELETE/remove YOK;
--   status transition YOK (ileride API-TX). Claim Source mutation YOK.
--
-- Çelişki ilkesi: aynı Concept altında çelişen Claim'ler KORUNUR. UNIQUE/dedup/
--   soft-uyarı EKLENMEZ; claim_text hash/normalized-unique YOK.
--
-- Normalizasyon (A3 fidelity kalıbı):
--   - claim_text: dış btrim; iç boşluk/satır sonu/noktalama/diakritik/case korunur;
--     boş reddi; ≤20000; zararlı C0 kontrol karakterleri (tab/LF/CR hariç) reddi.
--   - outcome_type/safety_topic: dış btrim, boş → NULL; enum + coupling doğrulaması.
--   - reason: HAM (trim edilmez); yalnız btrim boşluk denetimi + ≤2000 + zararlı C0 reddi.
--
-- Deterministik/fail-fast: düz ifadeler; IF NOT EXISTS/OR REPLACE/DO/dynamic SQL YOK.
--   RPC zaten varsa CREATE FUNCTION hata verir (fail-closed). Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/kullanıcı verisi SIZDIRILMAZ; tümü P0001):
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_CLAIM_ID_REQUIRED,
--   YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID, YEBS_INVALID_CLAIM_INPUT,
--   YEBS_INVALID_PATCH, YEBS_ADMIN_NOT_FOUND, YEBS_ADMIN_NOT_ACTIVE,
--   YEBS_CLAIM_CONCEPT_NOT_FOUND, YEBS_CLAIM_NOT_FOUND, YEBS_CLAIM_STATUS_LOCKED,
--   YEBS_CLAIM_STALE_UPDATE, YEBS_CLAIM_NO_CHANGES.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A) WRITE-GATE (A1/A2/A3 birebir): service_role SELECT-only.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_claims FROM service_role;
GRANT SELECT ON TABLE public.yebs_claims TO service_role;

REVOKE ALL ON TABLE public.yebs_claims FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_claims FROM anon;
REVOKE ALL ON TABLE public.yebs_claims FROM authenticated;

-- ------------------------------------------------------------
-- B) CREATE RPC
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_create_claim_with_audit(
  p_actor_admin_id  uuid,
  p_request_id      uuid,
  p_operation_id    uuid,
  p_concept_id      uuid,
  p_claim_type      text,
  p_claim_text      text,
  p_provenance_kind text,
  p_evidence_layer  text,
  p_outcome_type    text DEFAULT NULL,
  p_safety_topic    text DEFAULT NULL,
  p_reason          text DEFAULT NULL
)
RETURNS public.yebs_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_created      public.yebs_claims;
  -- Normalize edilmiş değerler.
  v_claim_text   text;
  v_outcome_type text;
  v_safety_topic text;
BEGIN
  -- --- Operasyon parametreleri ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- concept_id zorunlu ---
  IF p_concept_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- claim_type: exact 6 enum ---
  IF p_claim_type IS NULL OR p_claim_type NOT IN (
    'identity','function','relationship','practice','safety','research_finding'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- provenance_kind: exact 4 enum ---
  IF p_provenance_kind IS NULL OR p_provenance_kind NOT IN (
    'source_original','faithful_translation','editorial_explanation','editorial_interpretation'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- evidence_layer: exact 9 enum ---
  IF p_evidence_layer IS NULL OR p_evidence_layer NOT IN (
    'classical_textual','traditional','ethnographic','clinical','experimental',
    'scientific_review','regulatory','experiential','energetic_metaphysical'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- claim_text (zorunlu): dış btrim, nonblank, ≤20000, zararlı C0 reddi ---
  IF p_claim_text IS NULL THEN
    RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END IF;
  v_claim_text := btrim(p_claim_text);
  IF v_claim_text = '' OR length(v_claim_text) > 20000 THEN
    RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- tab(\t)/LF(\n)/CR(\r) korunur; kalan tüm kontrol karakterleri reddedilir.
  IF translate(v_claim_text, e'\t\n\r', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- outcome_type: dış btrim, boş → NULL (coupling aşağıda) ---
  v_outcome_type := nullif(btrim(coalesce(p_outcome_type, '')), '');

  -- --- safety_topic: dış btrim, boş → NULL (coupling aşağıda) ---
  v_safety_topic := nullif(btrim(coalesce(p_safety_topic, '')), '');

  -- --- COUPLING: safety_topic (claim_type='safety' → snake zorunlu; diğer → NULL) ---
  IF p_claim_type = 'safety' THEN
    IF v_safety_topic IS NULL OR v_safety_topic !~ '^[a-z][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_safety_topic IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- COUPLING: outcome_type (safety zorunlu kümesi / research opsiyonel / diğer NULL) ---
  IF p_claim_type = 'safety' THEN
    IF v_outcome_type IS NULL OR v_outcome_type NOT IN (
      'harm_shown','risk_suspected','contraindicated','source_does_not_recommend',
      'not_classified_as_risk','insufficient_data','conflicting','unknown'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_claim_type = 'research_finding' THEN
    IF v_outcome_type IS NOT NULL AND v_outcome_type NOT IN (
      'positive_finding','no_effect_found','mixed_findings','insufficient_data',
      'no_study_done','conflicting','unknown'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_outcome_type IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- reason: HAM fidelity (btrim yalnız boşluk denetimi; zararlı C0 reddi) ---
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF translate(p_reason, e'\t\n\r', '') ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Aktif admin ---
  SELECT u.role, u.active, u.email
    INTO v_role, v_active, v_email
    FROM public.users u
   WHERE u.id = p_actor_admin_id;
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

  -- --- Parent Concept varlık kontrolü + kilit (status gate YOK) ---
  PERFORM 1 FROM public.yebs_concepts WHERE id = p_concept_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CLAIM_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical INSERT (status/id/timestamps DB default; status=draft) ---
  BEGIN
    INSERT INTO public.yebs_claims (
      concept_id, claim_type, claim_text, provenance_kind, evidence_layer,
      outcome_type, safety_topic
    )
    VALUES (
      p_concept_id, p_claim_type, v_claim_text, p_provenance_kind, p_evidence_layer,
      v_outcome_type, v_safety_topic
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'YEBS_CLAIM_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit create ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'create', 'claim', v_created.id,
    'committed', NULL, to_jsonb(v_created),
    ARRAY[
      'concept_id','claim_type','claim_text','provenance_kind','evidence_layer',
      'outcome_type','safety_topic'
    ]::text[],
    p_reason, p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- C) UPDATE RPC (partial JSONB patch; yalnız 6 mutable alan)
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_update_claim_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_claim_id            uuid,
  p_expected_updated_at timestamptz,
  p_patch               jsonb,
  p_reason              text
)
RETURNS public.yebs_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_existing     public.yebs_claims;
  v_updated      public.yebs_claims;
  v_changed      text[] := ARRAY[]::text[];
  -- Merged/normalize edilmiş değerler.
  v_claim_type   text;
  v_claim_text   text;
  v_provenance   text;
  v_evidence     text;
  v_outcome_type text;
  v_safety_topic text;
BEGIN
  -- --- Operasyon/hedef parametreleri ---
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

  -- --- reason ZORUNLU (HAM fidelity + zararlı C0 reddi) ---
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF translate(p_reason, e'\t\n\r', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- patch: object, boş değil, yalnız 6 mutable anahtar ---
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k
     WHERE k NOT IN (
       'claim_type','claim_text','provenance_kind','evidence_layer',
       'outcome_type','safety_topic'
     )
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  -- --- Aktif admin ---
  SELECT u.role, u.active, u.email
    INTO v_role, v_active, v_email
    FROM public.users u
   WHERE u.id = p_actor_admin_id;
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

  -- --- Hedef satırı kilitle ---
  SELECT * INTO v_existing FROM public.yebs_claims
    WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Status gate: yalnız draft ---
  IF v_existing.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_CLAIM_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Optimistic concurrency ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_CLAIM_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- claim_type (present: string, 6 enum) ---
  IF jsonb_exists(p_patch, 'claim_type') THEN
    IF jsonb_typeof(p_patch -> 'claim_type') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_claim_type := p_patch ->> 'claim_type';
    IF v_claim_type NOT IN (
      'identity','function','relationship','practice','safety','research_finding'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_claim_type := v_existing.claim_type;
  END IF;

  -- --- claim_text (present: string, btrim nonblank ≤20000, zararlı C0 reddi) ---
  IF jsonb_exists(p_patch, 'claim_text') THEN
    IF jsonb_typeof(p_patch -> 'claim_text') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_claim_text := btrim(p_patch ->> 'claim_text');
    IF v_claim_text = '' OR length(v_claim_text) > 20000 THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
    IF translate(v_claim_text, e'\t\n\r', '') ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_claim_text := v_existing.claim_text;
  END IF;

  -- --- provenance_kind (present: string, 4 enum) ---
  IF jsonb_exists(p_patch, 'provenance_kind') THEN
    IF jsonb_typeof(p_patch -> 'provenance_kind') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_provenance := p_patch ->> 'provenance_kind';
    IF v_provenance NOT IN (
      'source_original','faithful_translation','editorial_explanation','editorial_interpretation'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_provenance := v_existing.provenance_kind;
  END IF;

  -- --- evidence_layer (present: string, 9 enum) ---
  IF jsonb_exists(p_patch, 'evidence_layer') THEN
    IF jsonb_typeof(p_patch -> 'evidence_layer') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_evidence := p_patch ->> 'evidence_layer';
    IF v_evidence NOT IN (
      'classical_textual','traditional','ethnographic','clinical','experimental',
      'scientific_review','regulatory','experiential','energetic_metaphysical'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_evidence := v_existing.evidence_layer;
  END IF;

  -- --- outcome_type (present: string|null; dış btrim → NULL) ---
  IF jsonb_exists(p_patch, 'outcome_type') THEN
    IF jsonb_typeof(p_patch -> 'outcome_type') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_outcome_type := CASE WHEN jsonb_typeof(p_patch -> 'outcome_type') = 'null'
                           THEN NULL ELSE nullif(btrim(p_patch ->> 'outcome_type'), '') END;
  ELSE
    v_outcome_type := v_existing.outcome_type;
  END IF;

  -- --- safety_topic (present: string|null; dış btrim → NULL) ---
  IF jsonb_exists(p_patch, 'safety_topic') THEN
    IF jsonb_typeof(p_patch -> 'safety_topic') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_safety_topic := CASE WHEN jsonb_typeof(p_patch -> 'safety_topic') = 'null'
                           THEN NULL ELSE nullif(btrim(p_patch ->> 'safety_topic'), '') END;
  ELSE
    v_safety_topic := v_existing.safety_topic;
  END IF;

  -- --- COUPLING (merged state): safety_topic ---
  IF v_claim_type = 'safety' THEN
    IF v_safety_topic IS NULL OR v_safety_topic !~ '^[a-z][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_safety_topic IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- COUPLING (merged state): outcome_type ---
  IF v_claim_type = 'safety' THEN
    IF v_outcome_type IS NULL OR v_outcome_type NOT IN (
      'harm_shown','risk_suspected','contraindicated','source_does_not_recommend',
      'not_classified_as_risk','insufficient_data','conflicting','unknown'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_claim_type = 'research_finding' THEN
    IF v_outcome_type IS NOT NULL AND v_outcome_type NOT IN (
      'positive_finding','no_effect_found','mixed_findings','insufficient_data',
      'no_study_done','conflicting','unknown'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_outcome_type IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- changed_fields: SABİT canonical sıra, IS DISTINCT FROM (null-safe) ---
  IF v_claim_type   IS DISTINCT FROM v_existing.claim_type THEN v_changed := v_changed || 'claim_type'; END IF;
  IF v_claim_text   IS DISTINCT FROM v_existing.claim_text THEN v_changed := v_changed || 'claim_text'; END IF;
  IF v_provenance   IS DISTINCT FROM v_existing.provenance_kind THEN v_changed := v_changed || 'provenance_kind'; END IF;
  IF v_evidence     IS DISTINCT FROM v_existing.evidence_layer THEN v_changed := v_changed || 'evidence_layer'; END IF;
  IF v_outcome_type IS DISTINCT FROM v_existing.outcome_type THEN v_changed := v_changed || 'outcome_type'; END IF;
  IF v_safety_topic IS DISTINCT FROM v_existing.safety_topic THEN v_changed := v_changed || 'safety_topic'; END IF;

  -- --- No-op reddi (normalize sonrası) ---
  IF cardinality(v_changed) = 0 THEN
    RAISE EXCEPTION 'YEBS_CLAIM_NO_CHANGES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical UPDATE (concept_id/status/id/timestamps DEĞİŞMEZ; updated_at trigger) ---
  BEGIN
    UPDATE public.yebs_claims
       SET claim_type      = v_claim_type,
           claim_text      = v_claim_text,
           provenance_kind = v_provenance,
           evidence_layer  = v_evidence,
           outcome_type    = v_outcome_type,
           safety_topic    = v_safety_topic
     WHERE id = p_claim_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit update ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'update', 'claim', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), v_changed, p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------
-- D) EXECUTE privilege modeli — tam signature ile kilitle.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_create_claim_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_create_claim_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_create_claim_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_create_claim_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_create_claim_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_update_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_update_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_update_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_update_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_update_claim_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) TO service_role;

COMMIT;
