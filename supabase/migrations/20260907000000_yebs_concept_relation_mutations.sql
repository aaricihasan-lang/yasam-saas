-- ============================================================
-- 20260906000000_yebs_concept_relation_mutations.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A5A (Concept Relations)
-- Write-gate + atomik CREATE/UPDATE + AUDIT (public.yebs_concept_relations)
--
-- Kapsam:
--   A. Write-gate: service_role yalnız SELECT (A1..A4 kalıbı). RLS enabled kalır;
--      policy eklenmez; FORCE RLS açılmaz.
--   B. yebs_create_concept_relation_with_audit  — SECURITY DEFINER; source/target
--      concept existence-lock (FOR KEY SHARE); self-relation reddi; relation_type
--      enum; cross-tradition matrisi; simetrik ayna-mükerrer + hiyerarşik semantik
--      duplicate + doğrudan hiyerarşik çelişki + triple UNIQUE ayrımı. status=draft.
--   C. yebs_update_concept_relation_with_audit  — partial JSONB patch (yalnız
--      relation_type mutable); draft-only; expected_updated_at concurrency;
--      source/target/status/id/timestamps immutable; bağlı D9 evidence varsa 409;
--      yoksa cross-tradition/ayna/hiyerarşi/unique yeniden doğrulanır.
--
-- D8 (20260731000000) tablosunu, D9 (20260801000000) tablosunu ve AUD1 CHECK'ini
--   DEĞİŞTİRMEZ. Relation/Concept/Source DELETE YOK; status transition YOK;
--   otomatik inverse/paired satır YOK; recursive/transitif cycle kontrolü YOK
--   (tam transitif döngü A7 publish-gate). Relation Source mutation YOK (A5B).
--
-- Semantik (D8 sözleşmesi): kayıt-yönlü source→target; stored inverse yok.
--   broader_than/part_of yönlü + hiyerarşik; related_to/contrasted_with anlam-
--   simetrik (ayna reddedilir); corresponds_to yönlü, ayna kuralına dahil DEĞİL.
--   Cross-tradition: broader_than/part_of/related_to yalnız aynı tradition;
--   contrasted_with/corresponds_to aynı veya farklı. Çelişkiler otomatik
--   birleştirilmez/ortalanmaz; AI relation type belirlemez.
--
-- Deterministik/fail-fast: düz ifadeler; IF NOT EXISTS/OR REPLACE/DO/dynamic SQL YOK.
--   RPC zaten varsa CREATE FUNCTION hata verir (fail-closed). Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/kullanıcı verisi SIZDIRILMAZ; tümü P0001):
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_CONCEPT_RELATION_ID_REQUIRED,
--   YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID, YEBS_INVALID_PATCH,
--   YEBS_CONCEPT_RELATION_INVALID_INPUT, YEBS_ADMIN_NOT_FOUND, YEBS_ADMIN_NOT_ACTIVE,
--   YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND, YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND,
--   YEBS_CONCEPT_RELATION_CROSS_TRADITION, YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE,
--   YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE, YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT,
--   YEBS_CONCEPT_RELATION_DUPLICATE, YEBS_CONCEPT_RELATION_NOT_FOUND,
--   YEBS_CONCEPT_RELATION_STATUS_LOCKED, YEBS_CONCEPT_RELATION_STALE_UPDATE,
--   YEBS_CONCEPT_RELATION_HAS_SOURCES, YEBS_CONCEPT_RELATION_NO_CHANGES.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A) WRITE-GATE (A1..A4 birebir): service_role SELECT-only.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_concept_relations FROM service_role;
GRANT SELECT ON TABLE public.yebs_concept_relations TO service_role;

REVOKE ALL ON TABLE public.yebs_concept_relations FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_concept_relations FROM anon;
REVOKE ALL ON TABLE public.yebs_concept_relations FROM authenticated;

-- ------------------------------------------------------------
-- B) CREATE RPC
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_create_concept_relation_with_audit(
  p_actor_admin_id    uuid,
  p_request_id        uuid,
  p_operation_id      uuid,
  p_source_concept_id uuid,
  p_target_concept_id uuid,
  p_relation_type     text,
  p_reason            text DEFAULT NULL
)
RETURNS public.yebs_concept_relations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_src_trad     uuid;
  v_tgt_trad     uuid;
  v_created      public.yebs_concept_relations;
  v_constraint   text;
BEGIN
  -- --- Operasyon parametreleri ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Zorunlu uçlar ---
  IF p_source_concept_id IS NULL OR p_target_concept_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- Self-relation reddi (DB CHECK ek savunma hattı) ---
  IF p_source_concept_id = p_target_concept_id THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- relation_type: exact 5 enum ---
  IF p_relation_type IS NULL OR p_relation_type NOT IN (
    'broader_than','part_of','related_to','contrasted_with','corresponds_to'
  ) THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
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

  -- --- source Concept varlık + kilit (status gate YOK); tradition_id oku ---
  SELECT c.tradition_id INTO v_src_trad FROM public.yebs_concepts c
    WHERE c.id = p_source_concept_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- target Concept varlık + kilit; tradition_id oku ---
  SELECT c.tradition_id INTO v_tgt_trad FROM public.yebs_concepts c
    WHERE c.id = p_target_concept_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Cross-tradition matrisi ---
  IF p_relation_type IN ('broader_than','part_of','related_to')
     AND v_src_trad IS DISTINCT FROM v_tgt_trad THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_CROSS_TRADITION' USING ERRCODE = 'P0001';
  END IF;

  -- --- Ayna-mükerrer (related_to/contrasted_with): (target,source,type) reddi ---
  IF p_relation_type IN ('related_to','contrasted_with') THEN
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE r.source_concept_id = p_target_concept_id
                  AND r.target_concept_id = p_source_concept_id
                  AND r.relation_type = p_relation_type) THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Hiyerarşik tutarlılık (yalnız broader_than/part_of; recursive DEĞİL) ---
  IF p_relation_type = 'broader_than' THEN
    -- semantik duplicate: part_of(B,A)
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE r.source_concept_id = p_target_concept_id
                  AND r.target_concept_id = p_source_concept_id
                  AND r.relation_type = 'part_of') THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE' USING ERRCODE = 'P0001';
    END IF;
    -- doğrudan çelişki: broader_than(B,A) veya part_of(A,B)
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE (r.source_concept_id = p_target_concept_id AND r.target_concept_id = p_source_concept_id AND r.relation_type = 'broader_than')
                   OR (r.source_concept_id = p_source_concept_id AND r.target_concept_id = p_target_concept_id AND r.relation_type = 'part_of')) THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_relation_type = 'part_of' THEN
    -- semantik duplicate: broader_than(B,A)
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE r.source_concept_id = p_target_concept_id
                  AND r.target_concept_id = p_source_concept_id
                  AND r.relation_type = 'broader_than') THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE' USING ERRCODE = 'P0001';
    END IF;
    -- doğrudan çelişki: part_of(B,A) veya broader_than(A,B)
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE (r.source_concept_id = p_target_concept_id AND r.target_concept_id = p_source_concept_id AND r.relation_type = 'part_of')
                   OR (r.source_concept_id = p_source_concept_id AND r.target_concept_id = p_target_concept_id AND r.relation_type = 'broader_than')) THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Canonical INSERT (status DB default=draft; id/timestamps default) ---
  BEGIN
    INSERT INTO public.yebs_concept_relations (
      source_concept_id, target_concept_id, relation_type
    )
    VALUES (
      p_source_concept_id, p_target_concept_id, p_relation_type
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'yebs_concept_relations_source_target_type_key' THEN
        RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_DUPLICATE' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
      END IF;
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit create ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'create', 'concept_relation', v_created.id,
    'committed', NULL, to_jsonb(v_created),
    ARRAY['source_concept_id','target_concept_id','relation_type']::text[],
    p_reason, p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- C) UPDATE RPC (partial JSONB patch; yalnız relation_type mutable)
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_update_concept_relation_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_relation_id         uuid,
  p_expected_updated_at timestamptz,
  p_patch               jsonb,
  p_reason              text
)
RETURNS public.yebs_concept_relations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_existing     public.yebs_concept_relations;
  v_updated      public.yebs_concept_relations;
  v_src_trad     uuid;
  v_tgt_trad     uuid;
  v_new_type     text;
  v_constraint   text;
BEGIN
  -- --- Operasyon/hedef parametreleri ---
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

  -- --- reason ZORUNLU (HAM fidelity + zararlı C0 reddi) ---
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF translate(p_reason, e'\t\n\r', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- patch: object, boş değil, yalnız 1 mutable anahtar (relation_type) ---
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k WHERE k NOT IN ('relation_type')
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
  SELECT * INTO v_existing FROM public.yebs_concept_relations
    WHERE id = p_relation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Status gate: yalnız draft ---
  IF v_existing.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Optimistic concurrency ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- relation_type (present: string, 5 enum) ---
  IF jsonb_typeof(p_patch -> 'relation_type') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  v_new_type := p_patch ->> 'relation_type';
  IF v_new_type NOT IN (
    'broader_than','part_of','related_to','contrasted_with','corresponds_to'
  ) THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- No-op reddi ---
  IF v_new_type IS NOT DISTINCT FROM v_existing.relation_type THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_NO_CHANGES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Bağlı D9 evidence varsa relation_type değiştirilemez ---
  IF EXISTS (SELECT 1 FROM public.yebs_concept_relation_sources s
              WHERE s.concept_relation_id = p_relation_id) THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HAS_SOURCES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Uçları kilitle + tradition oku (yeniden doğrulama) ---
  SELECT c.tradition_id INTO v_src_trad FROM public.yebs_concepts c
    WHERE c.id = v_existing.source_concept_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.tradition_id INTO v_tgt_trad FROM public.yebs_concepts c
    WHERE c.id = v_existing.target_concept_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Yeni tip için cross-tradition ---
  IF v_new_type IN ('broader_than','part_of','related_to')
     AND v_src_trad IS DISTINCT FROM v_tgt_trad THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_CROSS_TRADITION' USING ERRCODE = 'P0001';
  END IF;

  -- --- Yeni tip için ayna-mükerrer ---
  IF v_new_type IN ('related_to','contrasted_with') THEN
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE r.source_concept_id = v_existing.target_concept_id
                  AND r.target_concept_id = v_existing.source_concept_id
                  AND r.relation_type = v_new_type) THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Yeni tip için hiyerarşik tutarlılık ---
  IF v_new_type = 'broader_than' THEN
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE r.source_concept_id = v_existing.target_concept_id
                  AND r.target_concept_id = v_existing.source_concept_id
                  AND r.relation_type = 'part_of') THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE (r.source_concept_id = v_existing.target_concept_id AND r.target_concept_id = v_existing.source_concept_id AND r.relation_type = 'broader_than')
                   OR (r.source_concept_id = v_existing.source_concept_id AND r.target_concept_id = v_existing.target_concept_id AND r.relation_type = 'part_of')) THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_new_type = 'part_of' THEN
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE r.source_concept_id = v_existing.target_concept_id
                  AND r.target_concept_id = v_existing.source_concept_id
                  AND r.relation_type = 'broader_than') THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.yebs_concept_relations r
                WHERE (r.source_concept_id = v_existing.target_concept_id AND r.target_concept_id = v_existing.source_concept_id AND r.relation_type = 'part_of')
                   OR (r.source_concept_id = v_existing.source_concept_id AND r.target_concept_id = v_existing.target_concept_id AND r.relation_type = 'broader_than')) THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Canonical UPDATE (yalnız relation_type; source/target/status/id/timestamps DEĞİŞMEZ) ---
  BEGIN
    UPDATE public.yebs_concept_relations
       SET relation_type = v_new_type
     WHERE id = p_relation_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'yebs_concept_relations_source_target_type_key' THEN
        RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_DUPLICATE' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
      END IF;
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit update ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'update', 'concept_relation', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated),
    ARRAY['relation_type']::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------
-- D) EXECUTE privilege modeli — tam signature ile kilitle.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_create_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_create_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_create_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_create_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_create_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_update_concept_relation_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) TO service_role;

COMMIT;
