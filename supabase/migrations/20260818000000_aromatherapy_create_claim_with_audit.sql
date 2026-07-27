-- ============================================================
-- 20260818000000_aromatherapy_create_claim_with_audit.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2S — Migration 2
-- public.aromatherapy_create_claim_with_audit(...) — atomik create + audit.
--
-- Tek dış giriş noktası: SECURITY DEFINER RPC (owner ayrıcalığıyla write-gate'i aşar).
-- public.users'a ERİŞMEZ. Actor yalnız p_actor_user_id + p_actor_label_snapshot'tan gelir.
-- Fail-fast: düz ifadeler; CREATE OR REPLACE / IF NOT EXISTS / dynamic SQL / COMMIT /
--   ROLLBACK / WHEN OTHERS YOK. Explicit BEGIN/COMMIT migration transaction'ı sarar.
-- Dependency: M1 (audit tablosu + snapshot helper + write-gate) uygulanmış olmalıdır.
-- ============================================================

BEGIN;

CREATE FUNCTION public.aromatherapy_create_claim_with_audit(
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_tenant_id             uuid,
  p_preparation_id        uuid,
  p_claim_type            text,
  p_conclusion            text,
  p_conclusion_provenance text,
  p_evidence_layer        text,
  p_rationale_status      text,
  p_safety_topic          text DEFAULT NULL,
  p_preparation_context   text DEFAULT NULL,
  p_outcome_type          text DEFAULT NULL,
  p_rationale             text DEFAULT NULL,
  p_routes                jsonb DEFAULT '[]'::jsonb,
  p_populations           jsonb DEFAULT '[]'::jsonb,
  p_sources               jsonb DEFAULT '[]'::jsonb,
  p_passages              jsonb DEFAULT '[]'::jsonb,
  p_relations             jsonb DEFAULT '[]'::jsonb,
  p_reason                text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label     text;
  v_claim_id  uuid;
  v_warnings  jsonb := '[]'::jsonb;
  v_snapshot  jsonb;
  v_elem      jsonb;
  v_idx       integer;
  v_code      text;
  v_amin      integer;
  v_amax      integer;
  v_blo       integer;
  v_bhi       integer;
  v_intersect boolean;
  v_routes    jsonb := coalesce(p_routes, '[]'::jsonb);
  v_pops      jsonb := coalesce(p_populations, '[]'::jsonb);
  v_sources   jsonb := coalesce(p_sources, '[]'::jsonb);
  v_passages  jsonb := coalesce(p_passages, '[]'::jsonb);
  v_relations jsonb := coalesce(p_relations, '[]'::jsonb);
  v_passage_id uuid;
  v_src        uuid;
  v_other      uuid;
  v_a          uuid;
  v_b          uuid;
  v_vstatus    text;
BEGIN
  -- 1) Actor UUID.
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 2) Actor label (server-verified; casing korunur, yalnız btrim).
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- 3) Reason (create'te opsiyonel; verilirse blank/2000+ reddedilir; audit'e verbatim).
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4) Payload shape/key validation (array + object + allowed keys).
  IF jsonb_typeof(v_routes) <> 'array'
     OR jsonb_typeof(v_pops) <> 'array'
     OR jsonb_typeof(v_sources) <> 'array'
     OR jsonb_typeof(v_passages) <> 'array'
     OR jsonb_typeof(v_relations) <> 'array' THEN
    RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
  END IF;

  FOR v_elem IN SELECT jsonb_array_elements(v_routes) LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k WHERE k <> ALL (ARRAY['route_code'])) THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_elem IN SELECT jsonb_array_elements(v_pops) LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                  WHERE k <> ALL (ARRAY['population_code','age_min','age_max'])) THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_elem IN SELECT jsonb_array_elements(v_sources) LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                  WHERE k <> ALL (ARRAY['source_id','source_role','locator_text','url_fragment',
                                        'source_original_excerpt','faithful_translation','verification_status'])) THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_elem IN SELECT jsonb_array_elements(v_passages) LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
    -- Forbidden/immutable passage key'leri istemciden gelemez.
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

  FOR v_elem IN SELECT jsonb_array_elements(v_relations) LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) k
                  WHERE k <> ALL (ARRAY['other_claim_id','relation_type','explanation_tr'])) THEN
      RAISE EXCEPTION 'AROMA_INVALID_PAYLOAD' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Duplicate prevalidation (deterministik P0001; native 23505 yerine stabil kod).
  IF (SELECT count(*) FROM jsonb_array_elements(v_routes) e)
     <> (SELECT count(DISTINCT e->>'route_code') FROM jsonb_array_elements(v_routes) e) THEN
    RAISE EXCEPTION 'AROMA_DUPLICATE_ROUTE' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_pops) e)
     <> (SELECT count(DISTINCT e->>'population_code') FROM jsonb_array_elements(v_pops) e) THEN
    RAISE EXCEPTION 'AROMA_DUPLICATE_POPULATION' USING ERRCODE = 'P0001';
  END IF;

  -- 5) Claim INSERT. id/status/route/timestamp set EDİLMEZ → DB default (status='draft', route NULL).
  --    Coupling ihlalleri (rationale/outcome_type/safety_topic/claim_type/...) native 23514 ile döner.
  INSERT INTO public.aromatherapy_claims (
    tenant_id, preparation_id, claim_type, safety_topic, preparation_context,
    conclusion, conclusion_provenance, outcome_type, evidence_layer, rationale, rationale_status
  )
  VALUES (
    p_tenant_id, p_preparation_id, p_claim_type, p_safety_topic, p_preparation_context,
    p_conclusion, p_conclusion_provenance, p_outcome_type, p_evidence_layer, p_rationale, p_rationale_status
  )
  RETURNING id INTO v_claim_id;

  -- 6) Routes. Invalid route_code → native 23514.
  FOR v_elem IN SELECT jsonb_array_elements(v_routes) LOOP
    INSERT INTO public.aromatherapy_claim_routes (tenant_id, claim_id, route_code)
    VALUES (p_tenant_id, v_claim_id, v_elem->>'route_code');
  END LOOP;

  -- 7) Populations + warnings. Invalid code/age → native 23514.
  v_idx := 0;
  FOR v_elem IN SELECT jsonb_array_elements(v_pops) LOOP
    v_code := v_elem->>'population_code';
    v_amin := NULLIF(v_elem->>'age_min', '')::integer;
    v_amax := NULLIF(v_elem->>'age_max', '')::integer;

    INSERT INTO public.aromatherapy_claim_populations (tenant_id, claim_id, population_code, age_min, age_max)
    VALUES (p_tenant_id, v_claim_id, v_code, v_amin, v_amax);

    IF v_code IN ('pregnancy', 'lactation') THEN
      IF v_amin IS NOT NULL OR v_amax IS NOT NULL THEN
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'AROMA_PHYSIO_STATE_AGE_CONTEXT', 'severity', 'warning',
          'collection', 'populations', 'index', v_idx, 'field', 'population_code',
          'message', 'Fizyolojik durum (' || v_code || ') yaş aralığı bağlamı taşımaz.'
        );
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
            'code', 'AROMA_AGE_GROUP_MISMATCH', 'severity', 'warning',
            'collection', 'populations', 'index', v_idx, 'field', 'age_range',
            'message', 'Belirtilen yaş aralığı, popülasyon grubu (' || v_code || ') ile kesişmiyor.'
          );
        END IF;
      END IF;
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  -- 8) Sources. Invalid role/status → native 23514; duplicate natural key → native 23505.
  FOR v_elem IN SELECT jsonb_array_elements(v_sources) LOOP
    INSERT INTO public.aromatherapy_claim_sources (
      tenant_id, claim_id, source_id, source_role, locator_text, url_fragment,
      source_original_excerpt, faithful_translation, verification_status
    )
    VALUES (
      p_tenant_id, v_claim_id,
      (v_elem->>'source_id')::uuid,
      v_elem->>'source_role',
      v_elem->>'locator_text',
      v_elem->>'url_fragment',
      v_elem->>'source_original_excerpt',
      v_elem->>'faithful_translation',
      coalesce(v_elem->>'verification_status', 'unverified')
    );
  END LOOP;

  -- 9) Passages. verified_by/verified_at writer-managed. passage_kind/evidence_relation invalid → native 23514;
  --    (tenant_id, passage_id, passage_kind) yoksa → native 23503.
  FOR v_elem IN SELECT jsonb_array_elements(v_passages) LOOP
    v_passage_id := (v_elem->>'passage_id')::uuid;
    v_vstatus := coalesce(v_elem->>'verification_status', 'unverified');

    INSERT INTO public.aromatherapy_claim_passages (
      tenant_id, claim_id, passage_id, passage_kind, evidence_relation,
      verification_status, verified_by, verified_at
    )
    VALUES (
      p_tenant_id, v_claim_id, v_passage_id,
      v_elem->>'passage_kind',
      v_elem->>'evidence_relation',
      v_vstatus,
      CASE WHEN v_vstatus = 'verified' THEN p_actor_user_id::text ELSE NULL END,
      CASE WHEN v_vstatus = 'verified' THEN now() ELSE NULL END
    );

    -- 10) Source–passage invariant: passage'ın gerçek source_id'si final claim_sources'ta bulunmalı.
    SELECT sp.source_id INTO v_src
      FROM public.aromatherapy_source_passages sp
     WHERE sp.tenant_id = p_tenant_id
       AND sp.id = v_passage_id;

    IF NOT EXISTS (
      SELECT 1 FROM public.aromatherapy_claim_sources cs
       WHERE cs.tenant_id = p_tenant_id
         AND cs.claim_id = v_claim_id
         AND cs.source_id = v_src
    ) THEN
      RAISE EXCEPTION 'AROMA_PASSAGE_SOURCE_NOT_LINKED' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- 11) Relations. a/b istemciden alınmaz; a=least, b=greatest. Self/target kontrolü.
  FOR v_elem IN SELECT jsonb_array_elements(v_relations) LOOP
    v_other := (v_elem->>'other_claim_id')::uuid;

    IF v_other = v_claim_id THEN
      RAISE EXCEPTION 'AROMA_SELF_RELATION' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.aromatherapy_claims c
       WHERE c.tenant_id = p_tenant_id AND c.id = v_other
    ) THEN
      RAISE EXCEPTION 'AROMA_RELATION_TARGET_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    v_a := least(v_claim_id, v_other);
    v_b := greatest(v_claim_id, v_other);

    INSERT INTO public.aromatherapy_claim_relations (tenant_id, a_claim_id, b_claim_id, relation_type, explanation_tr)
    VALUES (p_tenant_id, v_a, v_b, v_elem->>'relation_type', v_elem->>'explanation_tr');
  END LOOP;

  -- 12) Final DB snapshot.
  v_snapshot := public.aromatherapy_claim_snapshot(p_tenant_id, v_claim_id);

  -- 13) Audit INSERT (create; previous_state NULL; new_state snapshot; warnings ayri kolon).
  --     RETURN'den ONCE; handler ile SARILMAZ (audit hatasi tum mutation'i geri alir).
  INSERT INTO public.aromatherapy_claim_audit_events (
    tenant_id, claim_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_state, new_state, warnings
  )
  VALUES (
    p_tenant_id, v_claim_id, p_actor_user_id, v_label,
    'create', p_reason, NULL, v_snapshot, v_warnings
  );

  -- 14) Final response — yalnız claim_id + warnings (snapshot response'a girmez).
  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_create_claim_with_audit(
  uuid, text, uuid, uuid, text, text, text, text, text,
  text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_create_claim_with_audit(
  uuid, text, uuid, uuid, text, text, text, text, text,
  text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_create_claim_with_audit(
  uuid, text, uuid, uuid, text, text, text, text, text,
  text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_create_claim_with_audit(
  uuid, text, uuid, uuid, text, text, text, text, text,
  text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.aromatherapy_create_claim_with_audit(
  uuid, text, uuid, uuid, text, text, text, text, text,
  text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text
) TO service_role;

COMMIT;
