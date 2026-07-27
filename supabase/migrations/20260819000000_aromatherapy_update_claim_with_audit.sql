-- ============================================================
-- 20260819000000_aromatherapy_update_claim_with_audit.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2S — Migration 3
-- public.aromatherapy_update_claim_with_audit(...) — atomik update + audit.
--
-- SECURITY DEFINER; public.users'a ERİŞMEZ. Fail-fast: CREATE OR REPLACE / IF NOT EXISTS /
--   dynamic SQL / COMMIT / ROLLBACK / WHEN OTHERS YOK.
-- Change detection: core (IS DISTINCT FROM) + child logical projection; gereksiz DELETE+INSERT
--   ve gereksiz updated_at bump YAPILMAZ. No-op yine audit üretir.
-- Dependency: M1 (audit + snapshot + write-gate) ve M2 (create) uygulanmış olmalıdır.
-- ============================================================

BEGIN;

CREATE FUNCTION public.aromatherapy_update_claim_with_audit(
  p_actor_user_id        uuid,
  p_actor_label_snapshot text,
  p_tenant_id            uuid,
  p_claim_id             uuid,
  p_reason               text,
  p_claim_patch          jsonb DEFAULT '{}'::jsonb,
  p_routes               jsonb DEFAULT NULL,
  p_populations          jsonb DEFAULT NULL,
  p_sources              jsonb DEFAULT NULL,
  p_passages             jsonb DEFAULT NULL,
  p_relations            jsonb DEFAULT NULL,
  p_expected_updated_at  timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label        text;
  v_claim        public.aromatherapy_claims%ROWTYPE;
  v_patch        jsonb := coalesce(p_claim_patch, '{}'::jsonb);
  v_warnings     jsonb := '[]'::jsonb;
  v_snapshot     jsonb;
  v_prev         jsonb;
  v_core_changed boolean := false;
  v_child_changed boolean := false;
  v_ex           jsonb;
  v_nw           jsonb;
  v_elem         jsonb;
  v_idx          integer;
  v_code         text;
  v_amin         integer;
  v_amax         integer;
  v_blo          integer;
  v_bhi          integer;
  v_intersect    boolean;
  v_passage_id   uuid;
  v_src          uuid;
  v_other        uuid;
  v_a            uuid;
  v_b            uuid;
  v_vstatus      text;
  -- computed new core values
  v_claim_type            text;
  v_safety_topic          text;
  v_preparation_context   text;
  v_conclusion            text;
  v_conclusion_provenance text;
  v_outcome_type          text;
  v_evidence_layer        text;
  v_rationale             text;
  v_rationale_status      text;
  v_status                text;
BEGIN
  -- 1) Actor UUID.
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 2) Actor label.
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- 3) Reason zorunlu.
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- 4) Target lock (tenant-scoped).
  SELECT * INTO v_claim
    FROM public.aromatherapy_claims
   WHERE tenant_id = p_tenant_id
     AND id = p_claim_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- 5) Optimistic lock.
  IF p_expected_updated_at IS NOT NULL
     AND v_claim.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE_CLAIM' USING ERRCODE = 'P0001';
  END IF;

  -- 6) previous_state snapshot (mutasyondan ÖNCE). Ayrı v_prev; child projection
  --    karşılaştırmalarında yeniden kullanılan v_ex tarafından EZİLMEZ.
  v_prev := public.aromatherapy_claim_snapshot(p_tenant_id, p_claim_id);

  -- 7) Patch key validation.
  IF jsonb_typeof(v_patch) <> 'object' THEN
    RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_patch) k
             WHERE k = ANY (ARRAY['id','tenant_id','preparation_id','route','created_at','updated_at'])) THEN
    RAISE EXCEPTION 'AROMA_IMMUTABLE_FIELD' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_patch) k
             WHERE k <> ALL (ARRAY['claim_type','safety_topic','preparation_context','conclusion',
                                   'conclusion_provenance','outcome_type','evidence_layer','rationale',
                                   'rationale_status','status'])) THEN
    RAISE EXCEPTION 'AROMA_UNKNOWN_FIELD' USING ERRCODE = 'P0001';
  END IF;

  -- Computed new core values: gönderilen key → parse (explicit null → NULL); omitted → mevcut değer.
  v_claim_type := CASE WHEN v_patch ? 'claim_type'
    THEN (CASE WHEN jsonb_typeof(v_patch->'claim_type') = 'null' THEN NULL ELSE v_patch->>'claim_type' END)
    ELSE v_claim.claim_type END;
  v_safety_topic := CASE WHEN v_patch ? 'safety_topic'
    THEN (CASE WHEN jsonb_typeof(v_patch->'safety_topic') = 'null' THEN NULL ELSE v_patch->>'safety_topic' END)
    ELSE v_claim.safety_topic END;
  v_preparation_context := CASE WHEN v_patch ? 'preparation_context'
    THEN (CASE WHEN jsonb_typeof(v_patch->'preparation_context') = 'null' THEN NULL ELSE v_patch->>'preparation_context' END)
    ELSE v_claim.preparation_context END;
  v_conclusion := CASE WHEN v_patch ? 'conclusion'
    THEN (CASE WHEN jsonb_typeof(v_patch->'conclusion') = 'null' THEN NULL ELSE v_patch->>'conclusion' END)
    ELSE v_claim.conclusion END;
  v_conclusion_provenance := CASE WHEN v_patch ? 'conclusion_provenance'
    THEN (CASE WHEN jsonb_typeof(v_patch->'conclusion_provenance') = 'null' THEN NULL ELSE v_patch->>'conclusion_provenance' END)
    ELSE v_claim.conclusion_provenance END;
  v_outcome_type := CASE WHEN v_patch ? 'outcome_type'
    THEN (CASE WHEN jsonb_typeof(v_patch->'outcome_type') = 'null' THEN NULL ELSE v_patch->>'outcome_type' END)
    ELSE v_claim.outcome_type END;
  v_evidence_layer := CASE WHEN v_patch ? 'evidence_layer'
    THEN (CASE WHEN jsonb_typeof(v_patch->'evidence_layer') = 'null' THEN NULL ELSE v_patch->>'evidence_layer' END)
    ELSE v_claim.evidence_layer END;
  v_rationale := CASE WHEN v_patch ? 'rationale'
    THEN (CASE WHEN jsonb_typeof(v_patch->'rationale') = 'null' THEN NULL ELSE v_patch->>'rationale' END)
    ELSE v_claim.rationale END;
  v_rationale_status := CASE WHEN v_patch ? 'rationale_status'
    THEN (CASE WHEN jsonb_typeof(v_patch->'rationale_status') = 'null' THEN NULL ELSE v_patch->>'rationale_status' END)
    ELSE v_claim.rationale_status END;
  v_status := CASE WHEN v_patch ? 'status'
    THEN (CASE WHEN jsonb_typeof(v_patch->'status') = 'null' THEN NULL ELSE v_patch->>'status' END)
    ELSE v_claim.status END;

  v_core_changed :=
       v_claim_type            IS DISTINCT FROM v_claim.claim_type
    OR v_safety_topic          IS DISTINCT FROM v_claim.safety_topic
    OR v_preparation_context   IS DISTINCT FROM v_claim.preparation_context
    OR v_conclusion            IS DISTINCT FROM v_claim.conclusion
    OR v_conclusion_provenance IS DISTINCT FROM v_claim.conclusion_provenance
    OR v_outcome_type          IS DISTINCT FROM v_claim.outcome_type
    OR v_evidence_layer        IS DISTINCT FROM v_claim.evidence_layer
    OR v_rationale             IS DISTINCT FROM v_claim.rationale
    OR v_rationale_status      IS DISTINCT FROM v_claim.rationale_status
    OR v_status                IS DISTINCT FROM v_claim.status;

  -- 8) Core UPDATE yalnız gerçek fark varsa (aksi halde updated_at bump YOK).
  --    Invalid status / coupling ihlali → native 23514.
  IF v_core_changed THEN
    UPDATE public.aromatherapy_claims
       SET claim_type            = v_claim_type,
           safety_topic          = v_safety_topic,
           preparation_context   = v_preparation_context,
           conclusion            = v_conclusion,
           conclusion_provenance = v_conclusion_provenance,
           outcome_type          = v_outcome_type,
           evidence_layer        = v_evidence_layer,
           rationale             = v_rationale,
           rationale_status      = v_rationale_status,
           status                = v_status
     WHERE tenant_id = p_tenant_id
       AND id = p_claim_id;
  END IF;

  -- 9) Routes (submitted ise): logical projection karşılaştırması → gerekirse full replacement.
  IF p_routes IS NOT NULL THEN
    IF jsonb_typeof(p_routes) <> 'array' THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
    FOR v_elem IN SELECT jsonb_array_elements(p_routes) LOOP
      IF jsonb_typeof(v_elem) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k WHERE k <> ALL (ARRAY['route_code'])) THEN
        RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_array_elements(p_routes) e)
       <> (SELECT count(DISTINCT e->>'route_code') FROM jsonb_array_elements(p_routes) e) THEN
      RAISE EXCEPTION 'AROMA_DUPLICATE_ROUTE' USING ERRCODE = 'P0001';
    END IF;

    v_ex := coalesce((
      SELECT jsonb_agg(jsonb_build_object('route_code', route_code) ORDER BY route_code)
      FROM public.aromatherapy_claim_routes
      WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id
    ), '[]'::jsonb);
    v_nw := coalesce((
      SELECT jsonb_agg(jsonb_build_object('route_code', e->>'route_code') ORDER BY e->>'route_code')
      FROM jsonb_array_elements(p_routes) e
    ), '[]'::jsonb);

    IF v_ex IS DISTINCT FROM v_nw THEN
      v_child_changed := true;
      DELETE FROM public.aromatherapy_claim_routes
       WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;
      FOR v_elem IN SELECT jsonb_array_elements(p_routes) LOOP
        INSERT INTO public.aromatherapy_claim_routes (tenant_id, claim_id, route_code)
        VALUES (p_tenant_id, p_claim_id, v_elem->>'route_code');
      END LOOP;
    END IF;
  END IF;

  -- 10) Populations (submitted ise) + warnings.
  IF p_populations IS NOT NULL THEN
    IF jsonb_typeof(p_populations) <> 'array' THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
    FOR v_elem IN SELECT jsonb_array_elements(p_populations) LOOP
      IF jsonb_typeof(v_elem) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                    WHERE k <> ALL (ARRAY['population_code','age_min','age_max'])) THEN
        RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_array_elements(p_populations) e)
       <> (SELECT count(DISTINCT e->>'population_code') FROM jsonb_array_elements(p_populations) e) THEN
      RAISE EXCEPTION 'AROMA_DUPLICATE_POPULATION' USING ERRCODE = 'P0001';
    END IF;

    v_ex := coalesce((
      SELECT jsonb_agg(jsonb_build_object('population_code', population_code, 'age_min', age_min, 'age_max', age_max)
                       ORDER BY population_code)
      FROM public.aromatherapy_claim_populations
      WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id
    ), '[]'::jsonb);
    v_nw := coalesce((
      SELECT jsonb_agg(jsonb_build_object('population_code', e->>'population_code',
                                          'age_min', NULLIF(e->>'age_min','')::integer,
                                          'age_max', NULLIF(e->>'age_max','')::integer)
                       ORDER BY e->>'population_code')
      FROM jsonb_array_elements(p_populations) e
    ), '[]'::jsonb);

    IF v_ex IS DISTINCT FROM v_nw THEN
      v_child_changed := true;
      DELETE FROM public.aromatherapy_claim_populations
       WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;
      v_idx := 0;
      FOR v_elem IN SELECT jsonb_array_elements(p_populations) LOOP
        v_code := v_elem->>'population_code';
        v_amin := NULLIF(v_elem->>'age_min','')::integer;
        v_amax := NULLIF(v_elem->>'age_max','')::integer;
        INSERT INTO public.aromatherapy_claim_populations (tenant_id, claim_id, population_code, age_min, age_max)
        VALUES (p_tenant_id, p_claim_id, v_code, v_amin, v_amax);

        IF v_code IN ('pregnancy','lactation') THEN
          IF v_amin IS NOT NULL OR v_amax IS NOT NULL THEN
            v_warnings := v_warnings || jsonb_build_object(
              'code','AROMA_PHYSIO_STATE_AGE_CONTEXT','severity','warning',
              'collection','populations','index',v_idx,'field','population_code',
              'message','Fizyolojik durum (' || v_code || ') yaş aralığı bağlamı taşımaz.');
          END IF;
        ELSE
          v_blo := NULL; v_bhi := NULL;
          IF    v_code = 'infant'      THEN v_blo := 0;  v_bhi := 2;
          ELSIF v_code = 'child'       THEN v_blo := 2;  v_bhi := 13;
          ELSIF v_code = 'adolescent'  THEN v_blo := 13; v_bhi := 18;
          ELSIF v_code = 'adult'       THEN v_blo := 18; v_bhi := NULL;
          ELSIF v_code = 'older_adult' THEN v_blo := 65; v_bhi := NULL;
          END IF;
          IF v_blo IS NOT NULL THEN
            v_intersect := (v_amin IS NULL OR v_bhi IS NULL OR v_amin < v_bhi)
                           AND (v_amax IS NULL OR v_amax > v_blo);
            IF NOT v_intersect THEN
              v_warnings := v_warnings || jsonb_build_object(
                'code','AROMA_AGE_GROUP_MISMATCH','severity','warning',
                'collection','populations','index',v_idx,'field','age_range',
                'message','Belirtilen yaş aralığı, popülasyon grubu (' || v_code || ') ile kesişmiyor.');
            END IF;
          END IF;
        END IF;
        v_idx := v_idx + 1;
      END LOOP;
    END IF;
  END IF;

  -- 11) Sources (submitted ise). Passages'tan ÖNCE (invariant final sources'u görsün).
  IF p_sources IS NOT NULL THEN
    IF jsonb_typeof(p_sources) <> 'array' THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
    FOR v_elem IN SELECT jsonb_array_elements(p_sources) LOOP
      IF jsonb_typeof(v_elem) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                    WHERE k <> ALL (ARRAY['source_id','source_role','locator_text','url_fragment',
                                          'source_original_excerpt','faithful_translation','verification_status'])) THEN
        RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    v_ex := coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'source_id', source_id, 'source_role', source_role, 'locator_text', locator_text,
               'url_fragment', url_fragment, 'source_original_excerpt', source_original_excerpt,
               'faithful_translation', faithful_translation, 'verification_status', verification_status)
               ORDER BY source_id, locator_text NULLS FIRST)
      FROM public.aromatherapy_claim_sources
      WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id
    ), '[]'::jsonb);
    v_nw := coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'source_id', (e->>'source_id')::uuid, 'source_role', e->>'source_role',
               'locator_text', e->>'locator_text', 'url_fragment', e->>'url_fragment',
               'source_original_excerpt', e->>'source_original_excerpt',
               'faithful_translation', e->>'faithful_translation',
               'verification_status', coalesce(e->>'verification_status','unverified'))
               ORDER BY (e->>'source_id')::uuid, (e->>'locator_text') NULLS FIRST)
      FROM jsonb_array_elements(p_sources) e
    ), '[]'::jsonb);

    IF v_ex IS DISTINCT FROM v_nw THEN
      v_child_changed := true;
      DELETE FROM public.aromatherapy_claim_sources
       WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;
      FOR v_elem IN SELECT jsonb_array_elements(p_sources) LOOP
        INSERT INTO public.aromatherapy_claim_sources (
          tenant_id, claim_id, source_id, source_role, locator_text, url_fragment,
          source_original_excerpt, faithful_translation, verification_status)
        VALUES (
          p_tenant_id, p_claim_id, (v_elem->>'source_id')::uuid, v_elem->>'source_role',
          v_elem->>'locator_text', v_elem->>'url_fragment', v_elem->>'source_original_excerpt',
          v_elem->>'faithful_translation', coalesce(v_elem->>'verification_status','unverified'));
      END LOOP;
    END IF;
  END IF;

  -- 12) Passages (submitted ise). Forbidden key + verified_by/at türetimi + source-link invariant.
  IF p_passages IS NOT NULL THEN
    IF jsonb_typeof(p_passages) <> 'array' THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
    FOR v_elem IN SELECT jsonb_array_elements(p_passages) LOOP
      IF jsonb_typeof(v_elem) <> 'object' THEN
        RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                 WHERE k = ANY (ARRAY['verified_by','verified_at','source_id','id',
                                      'tenant_id','claim_id','created_at','updated_at'])) THEN
        RAISE EXCEPTION 'AROMA_IMMUTABLE_FIELD' USING ERRCODE = 'P0001';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                 WHERE k <> ALL (ARRAY['passage_id','passage_kind','evidence_relation','verification_status'])) THEN
        RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    v_ex := coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'passage_id', passage_id, 'passage_kind', passage_kind,
               'evidence_relation', evidence_relation, 'verification_status', verification_status)
               ORDER BY passage_id, evidence_relation)
      FROM public.aromatherapy_claim_passages
      WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id
    ), '[]'::jsonb);
    v_nw := coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'passage_id', (e->>'passage_id')::uuid, 'passage_kind', e->>'passage_kind',
               'evidence_relation', e->>'evidence_relation',
               'verification_status', coalesce(e->>'verification_status','unverified'))
               ORDER BY (e->>'passage_id')::uuid, e->>'evidence_relation')
      FROM jsonb_array_elements(p_passages) e
    ), '[]'::jsonb);

    IF v_ex IS DISTINCT FROM v_nw THEN
      v_child_changed := true;
      DELETE FROM public.aromatherapy_claim_passages
       WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;
      FOR v_elem IN SELECT jsonb_array_elements(p_passages) LOOP
        v_passage_id := (v_elem->>'passage_id')::uuid;
        v_vstatus := coalesce(v_elem->>'verification_status','unverified');
        INSERT INTO public.aromatherapy_claim_passages (
          tenant_id, claim_id, passage_id, passage_kind, evidence_relation,
          verification_status, verified_by, verified_at)
        VALUES (
          p_tenant_id, p_claim_id, v_passage_id, v_elem->>'passage_kind', v_elem->>'evidence_relation',
          v_vstatus,
          CASE WHEN v_vstatus = 'verified' THEN p_actor_user_id::text ELSE NULL END,
          CASE WHEN v_vstatus = 'verified' THEN now() ELSE NULL END);

        SELECT sp.source_id INTO v_src
          FROM public.aromatherapy_source_passages sp
         WHERE sp.tenant_id = p_tenant_id AND sp.id = v_passage_id;

        IF NOT EXISTS (
          SELECT 1 FROM public.aromatherapy_claim_sources cs
           WHERE cs.tenant_id = p_tenant_id AND cs.claim_id = p_claim_id AND cs.source_id = v_src
        ) THEN
          RAISE EXCEPTION 'AROMA_PASSAGE_SOURCE_NOT_LINKED' USING ERRCODE = 'P0001';
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 13) Relations (submitted ise). a/b canonical; self/target kontrolü.
  IF p_relations IS NOT NULL THEN
    IF jsonb_typeof(p_relations) <> 'array' THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
    FOR v_elem IN SELECT jsonb_array_elements(p_relations) LOOP
      IF jsonb_typeof(v_elem) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                    WHERE k <> ALL (ARRAY['other_claim_id','relation_type','explanation_tr'])) THEN
        RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
      END IF;
      v_other := (v_elem->>'other_claim_id')::uuid;
      IF v_other = p_claim_id THEN
        RAISE EXCEPTION 'AROMA_SELF_RELATION' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.aromatherapy_claims c
                     WHERE c.tenant_id = p_tenant_id AND c.id = v_other) THEN
        RAISE EXCEPTION 'AROMA_RELATION_TARGET_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    v_ex := coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'a_claim_id', a_claim_id, 'b_claim_id', b_claim_id,
               'relation_type', relation_type, 'explanation_tr', explanation_tr)
               ORDER BY a_claim_id, b_claim_id)
      FROM public.aromatherapy_claim_relations
      WHERE tenant_id = p_tenant_id AND (a_claim_id = p_claim_id OR b_claim_id = p_claim_id)
    ), '[]'::jsonb);
    v_nw := coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'a_claim_id', least(p_claim_id, (e->>'other_claim_id')::uuid),
               'b_claim_id', greatest(p_claim_id, (e->>'other_claim_id')::uuid),
               'relation_type', e->>'relation_type', 'explanation_tr', e->>'explanation_tr')
               ORDER BY least(p_claim_id, (e->>'other_claim_id')::uuid),
                        greatest(p_claim_id, (e->>'other_claim_id')::uuid))
      FROM jsonb_array_elements(p_relations) e
    ), '[]'::jsonb);

    IF v_ex IS DISTINCT FROM v_nw THEN
      v_child_changed := true;
      DELETE FROM public.aromatherapy_claim_relations
       WHERE tenant_id = p_tenant_id AND (a_claim_id = p_claim_id OR b_claim_id = p_claim_id);
      FOR v_elem IN SELECT jsonb_array_elements(p_relations) LOOP
        v_other := (v_elem->>'other_claim_id')::uuid;
        v_a := least(p_claim_id, v_other);
        v_b := greatest(p_claim_id, v_other);
        INSERT INTO public.aromatherapy_claim_relations (tenant_id, a_claim_id, b_claim_id, relation_type, explanation_tr)
        VALUES (p_tenant_id, v_a, v_b, v_elem->>'relation_type', v_elem->>'explanation_tr');
      END LOOP;
    END IF;
  END IF;

  -- 14) Child-only updated_at bump (core değişmedi ama en az bir child değişti).
  IF (NOT v_core_changed) AND v_child_changed THEN
    UPDATE public.aromatherapy_claims
       SET updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND id = p_claim_id;
  END IF;

  -- 15) Final snapshot (tüm mutation + olası updated_at bump SONRASINDA).
  v_snapshot := public.aromatherapy_claim_snapshot(p_tenant_id, p_claim_id);

  -- 16) Audit INSERT (update; previous_state before-snapshot; new_state after-snapshot). No-op da audit üretir.
  INSERT INTO public.aromatherapy_claim_audit_events (
    tenant_id, claim_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_state, new_state, warnings
  )
  VALUES (
    p_tenant_id, p_claim_id, p_actor_user_id, v_label,
    'update', p_reason, v_prev, v_snapshot, v_warnings
  );

  RETURN jsonb_build_object(
    'claim_id', p_claim_id,
    'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_update_claim_with_audit(
  uuid, text, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_update_claim_with_audit(
  uuid, text, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_update_claim_with_audit(
  uuid, text, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_update_claim_with_audit(
  uuid, text, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.aromatherapy_update_claim_with_audit(
  uuid, text, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz
) TO service_role;

COMMIT;
