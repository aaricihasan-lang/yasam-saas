-- ============================================================
-- 20260817000000_aromatherapy_claim_audit_events.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2S (Claim Transactional Writer Foundation)
-- Migration 1: audit foundation + snapshot helper + altı claim tablosunda write-gate.
--
-- KAPSAM (tek transaction, fail-fast; IF NOT EXISTS / CREATE OR REPLACE / sessiz DO YOK):
--   A. Altı claim tablosunda service_role RPC-only write-gate (REVOKE ALL + yalnız SELECT).
--   B. public.aromatherapy_claim_audit_events (claim-specific; 11 kolon; FK yok).
--   C. Exact 7 CHECK.
--   D. Tek minimal index (tenant_id, claim_id, occurred_at).
--   E. Append-only immutable trigger (UPDATE/DELETE koşulsuz P0001 AROMA_AUDIT_IMMUTABLE).
--   F. Audit RLS (ENABLE, FORCE değil, policy yok) + service_role yalnız SELECT.
--   G. public.aromatherapy_claim_snapshot(uuid,uuid) — STABLE SECURITY DEFINER; GRANT EXECUTE YOK.
--
-- Actor trust boundary: bu migration public.users'a ERİŞMEZ. Actor auth/authorization/
--   active/tenant kontrolü C2T sorumluluğudur.
--
-- Dependency: M1 → M2 (create RPC) → M3 (update RPC). Snapshot helper M1'dedir.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A) Write-gate: altı claim tablosunda doğrudan mutation kapatılır.
--    Canonical mutation yalnız M2/M3 SECURITY DEFINER RPC'leri ile.
--    service_role: SELECT=true; INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER=false.
--    anon/authenticated/PUBLIC: doğuştan-kilitli; write-gate bağlamında yeniden doğrulanır.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claims             FROM service_role;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_routes       FROM service_role;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_populations  FROM service_role;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_sources      FROM service_role;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_passages     FROM service_role;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_relations    FROM service_role;

GRANT SELECT ON TABLE public.aromatherapy_claims             TO service_role;
GRANT SELECT ON TABLE public.aromatherapy_claim_routes       TO service_role;
GRANT SELECT ON TABLE public.aromatherapy_claim_populations  TO service_role;
GRANT SELECT ON TABLE public.aromatherapy_claim_sources      TO service_role;
GRANT SELECT ON TABLE public.aromatherapy_claim_passages     TO service_role;
GRANT SELECT ON TABLE public.aromatherapy_claim_relations    TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claims             FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_routes       FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_populations  FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_sources      FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_passages     FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_relations    FROM anon, authenticated, PUBLIC;

-- ------------------------------------------------------------
-- B) Audit tablosu — claim-specific, append-only, FK yok (retention korunur).
-- ------------------------------------------------------------
CREATE TABLE public.aromatherapy_claim_audit_events (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  tenant_id             uuid        NOT NULL,
  claim_id              uuid        NOT NULL,
  actor_user_id         uuid        NOT NULL,
  actor_label_snapshot  text        NOT NULL,
  operation             text        NOT NULL,
  reason                text,
  previous_state        jsonb,
  new_state             jsonb        NOT NULL,
  warnings              jsonb        NOT NULL DEFAULT '[]'::jsonb,

  CONSTRAINT aromatherapy_claim_audit_events_pkey PRIMARY KEY (id),

  -- C) Exact 7 CHECK.
  CONSTRAINT aromatherapy_claim_audit_events_operation_chk CHECK (
    operation IN ('create', 'update')
  ),
  CONSTRAINT aromatherapy_claim_audit_events_actor_label_chk CHECK (
    btrim(actor_label_snapshot) <> ''
    AND char_length(actor_label_snapshot) <= 320
  ),
  CONSTRAINT aromatherapy_claim_audit_events_reason_chk CHECK (
    reason IS NULL
    OR (
      btrim(reason) <> ''
      AND char_length(reason) <= 2000
    )
  ),
  CONSTRAINT aromatherapy_claim_audit_events_operation_state_chk CHECK (
    (
      operation = 'create'
      AND previous_state IS NULL
    )
    OR
    (
      operation = 'update'
      AND previous_state IS NOT NULL
      AND reason IS NOT NULL
    )
  ),
  CONSTRAINT aromatherapy_claim_audit_events_prev_state_object_chk CHECK (
    previous_state IS NULL
    OR jsonb_typeof(previous_state) = 'object'
  ),
  CONSTRAINT aromatherapy_claim_audit_events_new_state_object_chk CHECK (
    jsonb_typeof(new_state) = 'object'
  ),
  CONSTRAINT aromatherapy_claim_audit_events_warnings_array_chk CHECK (
    jsonb_typeof(warnings) = 'array'
  )
);

-- D) Tek minimal index (non-unique).
CREATE INDEX aromatherapy_claim_audit_events_tenant_claim_occurred_idx
  ON public.aromatherapy_claim_audit_events (tenant_id, claim_id, occurred_at);

-- ------------------------------------------------------------
-- E) Append-only immutable trigger. UPDATE/DELETE koşulsuz reddedilir (no-op UPDATE dahil).
--    En dar yüzey: SECURITY DEFINER + sabit search_path; hiçbir runtime rolüne EXECUTE yok.
-- ------------------------------------------------------------
CREATE FUNCTION public.aromatherapy_claim_audit_events_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'AROMA_AUDIT_IMMUTABLE' USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_claim_audit_events_forbid_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_claim_audit_events_forbid_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_claim_audit_events_forbid_mutation() FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_claim_audit_events_forbid_mutation() FROM service_role;

CREATE TRIGGER trg_aromatherapy_claim_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.aromatherapy_claim_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_claim_audit_events_forbid_mutation();

-- ------------------------------------------------------------
-- F) Audit RLS/privileges. RLS ENABLE (FORCE değil, policy yok).
--    service_role yalnız SELECT; INSERT yalnız SECURITY DEFINER RPC owner'ı.
--    anon/authenticated/PUBLIC hiçbir privilege almaz.
-- ------------------------------------------------------------
ALTER TABLE public.aromatherapy_claim_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_audit_events FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_audit_events FROM service_role;
GRANT SELECT ON TABLE public.aromatherapy_claim_audit_events TO service_role;

-- ------------------------------------------------------------
-- G) Snapshot helper. Gerçek DB durumundan claim snapshot'ı üretir.
--    STABLE, SECURITY DEFINER, sabit search_path, schema-qualified, dynamic SQL yok, mutation yok.
--    Child array'ler fiziksel child id taşımaz (claim.id hariç). Boş koleksiyon → [].
--    Chemical family ve warnings snapshot'a GİRMEZ. GRANT EXECUTE verilmez (yalnız owner/RPC iç kullanımı).
-- ------------------------------------------------------------
CREATE FUNCTION public.aromatherapy_claim_snapshot(
  p_tenant_id uuid,
  p_claim_id  uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'claim', (
      SELECT to_jsonb(c) FROM (
        SELECT
          cl.id,
          cl.tenant_id,
          cl.preparation_id,
          cl.claim_type,
          cl.safety_topic,
          cl.route,
          cl.preparation_context,
          cl.conclusion,
          cl.conclusion_provenance,
          cl.outcome_type,
          cl.evidence_layer,
          cl.rationale,
          cl.rationale_status,
          cl.status,
          cl.created_at,
          cl.updated_at
        FROM public.aromatherapy_claims cl
        WHERE cl.tenant_id = p_tenant_id
          AND cl.id = p_claim_id
      ) c
    ),
    'routes', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'route_code', r.route_code,
                 'created_at', r.created_at
               )
               ORDER BY r.route_code
             )
      FROM public.aromatherapy_claim_routes r
      WHERE r.tenant_id = p_tenant_id
        AND r.claim_id = p_claim_id
    ), '[]'::jsonb),
    'populations', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'population_code', p.population_code,
                 'age_min', p.age_min,
                 'age_max', p.age_max,
                 'created_at', p.created_at
               )
               ORDER BY p.population_code
             )
      FROM public.aromatherapy_claim_populations p
      WHERE p.tenant_id = p_tenant_id
        AND p.claim_id = p_claim_id
    ), '[]'::jsonb),
    'sources', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'source_id', s.source_id,
                 'source_role', s.source_role,
                 'locator_text', s.locator_text,
                 'url_fragment', s.url_fragment,
                 'source_original_excerpt', s.source_original_excerpt,
                 'faithful_translation', s.faithful_translation,
                 'verification_status', s.verification_status,
                 'created_at', s.created_at,
                 'updated_at', s.updated_at
               )
               ORDER BY s.source_id, s.locator_text NULLS FIRST
             )
      FROM public.aromatherapy_claim_sources s
      WHERE s.tenant_id = p_tenant_id
        AND s.claim_id = p_claim_id
    ), '[]'::jsonb),
    'passages', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'passage_id', pg.passage_id,
                 'passage_kind', pg.passage_kind,
                 'evidence_relation', pg.evidence_relation,
                 'verification_status', pg.verification_status,
                 'verified_by', pg.verified_by,
                 'verified_at', pg.verified_at,
                 'created_at', pg.created_at,
                 'updated_at', pg.updated_at
               )
               ORDER BY pg.passage_id, pg.evidence_relation
             )
      FROM public.aromatherapy_claim_passages pg
      WHERE pg.tenant_id = p_tenant_id
        AND pg.claim_id = p_claim_id
    ), '[]'::jsonb),
    'relations', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'a_claim_id', rl.a_claim_id,
                 'b_claim_id', rl.b_claim_id,
                 'relation_type', rl.relation_type,
                 'explanation_tr', rl.explanation_tr,
                 'created_at', rl.created_at,
                 'updated_at', rl.updated_at
               )
               ORDER BY rl.a_claim_id, rl.b_claim_id
             )
      FROM public.aromatherapy_claim_relations rl
      WHERE rl.tenant_id = p_tenant_id
        AND (rl.a_claim_id = p_claim_id OR rl.b_claim_id = p_claim_id)
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_claim_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_claim_snapshot(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_claim_snapshot(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_claim_snapshot(uuid, uuid) FROM service_role;

COMMIT;
