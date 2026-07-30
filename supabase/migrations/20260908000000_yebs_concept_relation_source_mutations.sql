-- ============================================================
-- 20260908000000_yebs_concept_relation_source_mutations.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A5B (Concept Relation Sources)
-- Write-gate + atomik ATTACH/UPDATE/REMOVE + AUDIT (public.yebs_concept_relation_sources)
--
-- Kapsam:
--   A. Write-gate: service_role yalnız SELECT (A1..A4B kalıbı). RLS enabled kalır;
--      policy eklenmez; FORCE RLS açılmaz.
--   B. yebs_attach_concept_relation_source_with_audit  — parent Relation draft gate +
--      Source varlık kilidi; evidence_layer zorunlu; verification_status=unverified.
--   C. yebs_update_concept_relation_source_with_audit  — partial JSONB patch (13 mutable
--      alan; evidence_layer dahil); path relation aidiyeti; parent Relation draft gate;
--      expected_updated_at; concept_relation_id/source_id/verification_status/id/timestamps immutable.
--   D. yebs_remove_concept_relation_source_with_audit  — parent Relation draft gate;
--      önce full previous snapshot audit; sonra YALNIZ junction satırı fiziksel DELETE.
--
-- Bir satır = tek relation ↔ tek source ↔ tek evidence_layer ↔ tek pasaj/provenans bağı.
--   Aynı relation+source farklı locator/pasaj/evidence_layer ile çok satır taşıyabilir →
--   DB UNIQUE YOK; duplicate constraint/soft-uyarı EKLENMEZ. Source künyesi junction'a
--   KOPYALANMAZ (yalnız source_id FK). evidence_layer editoryal — AI atayamaz, otomatik
--   türetilmez.
--
-- D9 (20260801000000) tablosunu, D8 (20260731000000) tablosunu, D5 sources'u ve AUD1
--   CHECK'ini DEĞİŞTİRMEZ. Relation/Concept/Source DELETE YOK; status transition YOK;
--   verification_status transition YOK (ileride API-TX).
--
-- Katman sadakati (D7 ile aynı model + evidence_layer): reason(audit) ≠ rationale(kaynak
--   gerekçesi) ≠ source_original_excerpt(özgün pasaj) ≠ transliteration ≠ faithful_translation
--   ≠ locator; evidence_layer=epistemik bağlam (kalite puanı değil). İçerik özetlenmez/
--   yorumlanmaz; HTML/script temizlenmez. Yalnız tip/blank/dış-btrim/uzunluk/zararlı-C0/
--   coupling/dil-script formatı/enum doğrulanır.
--
-- Metin sınırları: locator_text≤2000, url_fragment≤2000, transliteration_scheme≤200,
--   source_original_excerpt≤50000, transliteration≤50000, faithful_translation≤50000,
--   rationale≤20000, reason≤2000.
--
-- Deterministik/fail-fast: düz ifadeler; IF NOT EXISTS/OR REPLACE/DO/dynamic SQL YOK.
--   RPC zaten varsa CREATE FUNCTION hata verir (fail-closed). Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/kullanıcı verisi SIZDIRILMAZ; tümü P0001):
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_CONCEPT_RELATION_ID_REQUIRED,
--   YEBS_RELATION_SOURCE_ID_REQUIRED, YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID,
--   YEBS_INVALID_PATCH, YEBS_RELATION_SOURCE_INVALID_INPUT, YEBS_ADMIN_NOT_FOUND,
--   YEBS_ADMIN_NOT_ACTIVE, YEBS_RELATION_SOURCE_RELATION_NOT_FOUND,
--   YEBS_RELATION_SOURCE_RELATION_LOCKED, YEBS_RELATION_SOURCE_SOURCE_NOT_FOUND,
--   YEBS_RELATION_SOURCE_NOT_FOUND, YEBS_RELATION_SOURCE_STALE_UPDATE,
--   YEBS_RELATION_SOURCE_NO_CHANGES.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A) WRITE-GATE (A1..A4B birebir): service_role SELECT-only.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_concept_relation_sources FROM service_role;
GRANT SELECT ON TABLE public.yebs_concept_relation_sources TO service_role;

REVOKE ALL ON TABLE public.yebs_concept_relation_sources FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_concept_relation_sources FROM anon;
REVOKE ALL ON TABLE public.yebs_concept_relation_sources FROM authenticated;

-- ------------------------------------------------------------
-- B) ATTACH RPC
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_attach_concept_relation_source_with_audit(
  p_actor_admin_id               uuid,
  p_request_id                   uuid,
  p_operation_id                 uuid,
  p_concept_relation_id          uuid,
  p_source_id                    uuid,
  p_evidence_layer               text,
  p_source_role                  text,
  p_rationale_status             text,
  p_locator_text                 text DEFAULT NULL,
  p_url_fragment                 text DEFAULT NULL,
  p_source_original_excerpt      text DEFAULT NULL,
  p_source_original_language_tag text DEFAULT NULL,
  p_source_original_script_code  text DEFAULT NULL,
  p_transliteration              text DEFAULT NULL,
  p_transliteration_scheme       text DEFAULT NULL,
  p_faithful_translation         text DEFAULT NULL,
  p_translation_language_tag     text DEFAULT NULL,
  p_rationale                    text DEFAULT NULL,
  p_reason                       text DEFAULT NULL
)
RETURNS public.yebs_concept_relation_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_rel_status   text;
  v_created      public.yebs_concept_relation_sources;
  v_locator      text;
  v_url_frag     text;
  v_excerpt      text;
  v_excerpt_lang text;
  v_excerpt_scr  text;
  v_translit     text;
  v_translit_sch text;
  v_ftrans       text;
  v_trans_lang   text;
  v_rationale    text;
BEGIN
  -- --- Operasyon parametreleri ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_concept_relation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- evidence_layer: exact 9 enum (zorunlu; default yok) ---
  IF p_evidence_layer IS NULL OR p_evidence_layer NOT IN (
    'classical_textual','traditional','ethnographic','clinical','experimental',
    'scientific_review','regulatory','experiential','energetic_metaphysical'
  ) THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- source_role: exact 4 enum ---
  IF p_source_role IS NULL OR p_source_role NOT IN (
    'primary_support','supporting','contradiction','context'
  ) THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- rationale_status: exact 2 enum ---
  IF p_rationale_status IS NULL OR p_rationale_status NOT IN (
    'from_source','source_gives_no_rationale'
  ) THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- locator_text: dış btrim→NULL; ≤2000; zararlı C0 reddi ---
  v_locator := nullif(btrim(coalesce(p_locator_text, '')), '');
  IF v_locator IS NOT NULL AND (length(v_locator) > 2000 OR translate(v_locator, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- url_fragment: ≤2000 ---
  v_url_frag := nullif(btrim(coalesce(p_url_fragment, '')), '');
  IF v_url_frag IS NOT NULL AND (length(v_url_frag) > 2000 OR translate(v_url_frag, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- source_original_excerpt: ≤50000 ---
  v_excerpt := nullif(btrim(coalesce(p_source_original_excerpt, '')), '');
  IF v_excerpt IS NOT NULL AND (length(v_excerpt) > 50000 OR translate(v_excerpt, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- source_original_language_tag: BCP-47 ---
  v_excerpt_lang := nullif(btrim(coalesce(p_source_original_language_tag, '')), '');
  IF v_excerpt_lang IS NOT NULL AND v_excerpt_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- source_original_script_code: ISO-15924 ---
  v_excerpt_scr := nullif(btrim(coalesce(p_source_original_script_code, '')), '');
  IF v_excerpt_scr IS NOT NULL AND v_excerpt_scr !~ '^[A-Z][a-z]{3}$' THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- transliteration: ≤50000 ---
  v_translit := nullif(btrim(coalesce(p_transliteration, '')), '');
  IF v_translit IS NOT NULL AND (length(v_translit) > 50000 OR translate(v_translit, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- transliteration_scheme: ≤200 ---
  v_translit_sch := nullif(btrim(coalesce(p_transliteration_scheme, '')), '');
  IF v_translit_sch IS NOT NULL AND (length(v_translit_sch) > 200 OR translate(v_translit_sch, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- faithful_translation: ≤50000 ---
  v_ftrans := nullif(btrim(coalesce(p_faithful_translation, '')), '');
  IF v_ftrans IS NOT NULL AND (length(v_ftrans) > 50000 OR translate(v_ftrans, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- translation_language_tag: BCP-47 ---
  v_trans_lang := nullif(btrim(coalesce(p_translation_language_tag, '')), '');
  IF v_trans_lang IS NOT NULL AND v_trans_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- rationale: ≤20000 ---
  v_rationale := nullif(btrim(coalesce(p_rationale, '')), '');
  IF v_rationale IS NOT NULL AND (length(v_rationale) > 20000 OR translate(v_rationale, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- COUPLING: rationale ↔ rationale_status ---
  IF p_rationale_status = 'from_source' THEN
    IF v_rationale IS NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_rationale IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- --- COUPLING: excerpt ↔ dil/script ---
  IF v_excerpt IS NULL THEN
    IF v_excerpt_lang IS NOT NULL OR v_excerpt_scr IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_excerpt_lang IS NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- --- COUPLING: transliteration → excerpt; scheme → transliteration ---
  IF v_translit IS NOT NULL AND v_excerpt IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  IF v_translit_sch IS NOT NULL AND v_translit IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  -- --- COUPLING: faithful_translation → excerpt; ftrans ↔ translation_language ---
  IF v_ftrans IS NOT NULL AND v_excerpt IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  IF (v_ftrans IS NULL) <> (v_trans_lang IS NULL) THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- reason: HAM fidelity + zararlı C0 reddi ---
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

  -- --- Parent Relation kilidi + draft gate ---
  SELECT r.status INTO v_rel_status FROM public.yebs_concept_relations r
    WHERE r.id = p_concept_relation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_RELATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_rel_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_RELATION_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Source varlık kontrolü + kilit (status gate YOK) ---
  PERFORM 1 FROM public.yebs_sources WHERE id = p_source_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical INSERT (verification_status DB default=unverified; id/timestamps default) ---
  BEGIN
    INSERT INTO public.yebs_concept_relation_sources (
      concept_relation_id, source_id, evidence_layer, source_role, locator_text, url_fragment,
      source_original_excerpt, source_original_language_tag, source_original_script_code,
      transliteration, transliteration_scheme, faithful_translation, translation_language_tag,
      rationale, rationale_status
    )
    VALUES (
      p_concept_relation_id, p_source_id, p_evidence_layer, p_source_role, v_locator, v_url_frag,
      v_excerpt, v_excerpt_lang, v_excerpt_scr,
      v_translit, v_translit_sch, v_ftrans, v_trans_lang,
      v_rationale, p_rationale_status
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit create ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'create', 'concept_relation_source', v_created.id,
    'committed', NULL, to_jsonb(v_created),
    ARRAY[
      'concept_relation_id','source_id','evidence_layer','source_role','locator_text','url_fragment',
      'source_original_excerpt','source_original_language_tag','source_original_script_code',
      'transliteration','transliteration_scheme','faithful_translation','translation_language_tag',
      'rationale','rationale_status','verification_status'
    ]::text[],
    p_reason, p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- C) UPDATE RPC (partial JSONB patch; yalnız 13 mutable alan)
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_update_concept_relation_source_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_concept_relation_id uuid,
  p_relation_source_id  uuid,
  p_expected_updated_at timestamptz,
  p_patch               jsonb,
  p_reason              text
)
RETURNS public.yebs_concept_relation_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_existing     public.yebs_concept_relation_sources;
  v_updated      public.yebs_concept_relation_sources;
  v_rel_status   text;
  v_changed      text[] := ARRAY[]::text[];
  v_evidence     text;
  v_source_role  text;
  v_locator      text;
  v_url_frag     text;
  v_excerpt      text;
  v_excerpt_lang text;
  v_excerpt_scr  text;
  v_translit     text;
  v_translit_sch text;
  v_ftrans       text;
  v_trans_lang   text;
  v_rationale    text;
  v_rat_status   text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_concept_relation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_ID_REQUIRED' USING ERRCODE = 'P0001';
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
  IF translate(p_reason, e'\t\n\r', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- patch: object, boş değil, yalnız 13 mutable anahtar ---
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k
     WHERE k NOT IN (
       'evidence_layer','source_role','locator_text','url_fragment','source_original_excerpt',
       'source_original_language_tag','source_original_script_code','transliteration',
       'transliteration_scheme','faithful_translation','translation_language_tag',
       'rationale','rationale_status'
     )
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

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

  -- --- Hedef junction satırını kilitle ---
  SELECT * INTO v_existing FROM public.yebs_concept_relation_sources
    WHERE id = p_relation_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Path aidiyeti ---
  IF v_existing.concept_relation_id IS DISTINCT FROM p_concept_relation_id THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Parent Relation kilidi + draft gate ---
  SELECT r.status INTO v_rel_status FROM public.yebs_concept_relations r
    WHERE r.id = v_existing.concept_relation_id FOR UPDATE;
  IF v_rel_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_RELATION_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Optimistic concurrency ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_STALE_UPDATE' USING ERRCODE = 'P0001';
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
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_evidence := v_existing.evidence_layer;
  END IF;

  -- --- source_role (present: string, 4 enum) ---
  IF jsonb_exists(p_patch, 'source_role') THEN
    IF jsonb_typeof(p_patch -> 'source_role') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_source_role := p_patch ->> 'source_role';
    IF v_source_role NOT IN ('primary_support','supporting','contradiction','context') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_source_role := v_existing.source_role;
  END IF;

  -- --- rationale_status (present: string, 2 enum) ---
  IF jsonb_exists(p_patch, 'rationale_status') THEN
    IF jsonb_typeof(p_patch -> 'rationale_status') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_rat_status := p_patch ->> 'rationale_status';
    IF v_rat_status NOT IN ('from_source','source_gives_no_rationale') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_rat_status := v_existing.rationale_status;
  END IF;

  -- --- Nullable metin/format alanları (present string|null; dış btrim→NULL) ---
  IF jsonb_exists(p_patch, 'locator_text') THEN
    IF jsonb_typeof(p_patch -> 'locator_text') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_locator := CASE WHEN jsonb_typeof(p_patch -> 'locator_text') = 'null'
                      THEN NULL ELSE nullif(btrim(p_patch ->> 'locator_text'), '') END;
    IF v_locator IS NOT NULL AND (length(v_locator) > 2000 OR translate(v_locator, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_locator := v_existing.locator_text;
  END IF;
  IF jsonb_exists(p_patch, 'url_fragment') THEN
    IF jsonb_typeof(p_patch -> 'url_fragment') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_url_frag := CASE WHEN jsonb_typeof(p_patch -> 'url_fragment') = 'null'
                       THEN NULL ELSE nullif(btrim(p_patch ->> 'url_fragment'), '') END;
    IF v_url_frag IS NOT NULL AND (length(v_url_frag) > 2000 OR translate(v_url_frag, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_url_frag := v_existing.url_fragment;
  END IF;
  IF jsonb_exists(p_patch, 'source_original_excerpt') THEN
    IF jsonb_typeof(p_patch -> 'source_original_excerpt') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_excerpt := CASE WHEN jsonb_typeof(p_patch -> 'source_original_excerpt') = 'null'
                      THEN NULL ELSE nullif(btrim(p_patch ->> 'source_original_excerpt'), '') END;
    IF v_excerpt IS NOT NULL AND (length(v_excerpt) > 50000 OR translate(v_excerpt, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_excerpt := v_existing.source_original_excerpt;
  END IF;
  IF jsonb_exists(p_patch, 'source_original_language_tag') THEN
    IF jsonb_typeof(p_patch -> 'source_original_language_tag') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_excerpt_lang := CASE WHEN jsonb_typeof(p_patch -> 'source_original_language_tag') = 'null'
                           THEN NULL ELSE nullif(btrim(p_patch ->> 'source_original_language_tag'), '') END;
    IF v_excerpt_lang IS NOT NULL AND v_excerpt_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_excerpt_lang := v_existing.source_original_language_tag;
  END IF;
  IF jsonb_exists(p_patch, 'source_original_script_code') THEN
    IF jsonb_typeof(p_patch -> 'source_original_script_code') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_excerpt_scr := CASE WHEN jsonb_typeof(p_patch -> 'source_original_script_code') = 'null'
                          THEN NULL ELSE nullif(btrim(p_patch ->> 'source_original_script_code'), '') END;
    IF v_excerpt_scr IS NOT NULL AND v_excerpt_scr !~ '^[A-Z][a-z]{3}$' THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_excerpt_scr := v_existing.source_original_script_code;
  END IF;
  IF jsonb_exists(p_patch, 'transliteration') THEN
    IF jsonb_typeof(p_patch -> 'transliteration') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_translit := CASE WHEN jsonb_typeof(p_patch -> 'transliteration') = 'null'
                       THEN NULL ELSE nullif(btrim(p_patch ->> 'transliteration'), '') END;
    IF v_translit IS NOT NULL AND (length(v_translit) > 50000 OR translate(v_translit, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_translit := v_existing.transliteration;
  END IF;
  IF jsonb_exists(p_patch, 'transliteration_scheme') THEN
    IF jsonb_typeof(p_patch -> 'transliteration_scheme') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_translit_sch := CASE WHEN jsonb_typeof(p_patch -> 'transliteration_scheme') = 'null'
                           THEN NULL ELSE nullif(btrim(p_patch ->> 'transliteration_scheme'), '') END;
    IF v_translit_sch IS NOT NULL AND (length(v_translit_sch) > 200 OR translate(v_translit_sch, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_translit_sch := v_existing.transliteration_scheme;
  END IF;
  IF jsonb_exists(p_patch, 'faithful_translation') THEN
    IF jsonb_typeof(p_patch -> 'faithful_translation') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_ftrans := CASE WHEN jsonb_typeof(p_patch -> 'faithful_translation') = 'null'
                     THEN NULL ELSE nullif(btrim(p_patch ->> 'faithful_translation'), '') END;
    IF v_ftrans IS NOT NULL AND (length(v_ftrans) > 50000 OR translate(v_ftrans, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_ftrans := v_existing.faithful_translation;
  END IF;
  IF jsonb_exists(p_patch, 'translation_language_tag') THEN
    IF jsonb_typeof(p_patch -> 'translation_language_tag') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_trans_lang := CASE WHEN jsonb_typeof(p_patch -> 'translation_language_tag') = 'null'
                         THEN NULL ELSE nullif(btrim(p_patch ->> 'translation_language_tag'), '') END;
    IF v_trans_lang IS NOT NULL AND v_trans_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_trans_lang := v_existing.translation_language_tag;
  END IF;
  IF jsonb_exists(p_patch, 'rationale') THEN
    IF jsonb_typeof(p_patch -> 'rationale') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_rationale := CASE WHEN jsonb_typeof(p_patch -> 'rationale') = 'null'
                        THEN NULL ELSE nullif(btrim(p_patch ->> 'rationale'), '') END;
    IF v_rationale IS NOT NULL AND (length(v_rationale) > 20000 OR translate(v_rationale, e'\t\n\r', '') ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_rationale := v_existing.rationale;
  END IF;

  -- --- COUPLING (merged state) ---
  IF v_rat_status = 'from_source' THEN
    IF v_rationale IS NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_rationale IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF v_excerpt IS NULL THEN
    IF v_excerpt_lang IS NOT NULL OR v_excerpt_scr IS NOT NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_excerpt_lang IS NULL THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF v_translit IS NOT NULL AND v_excerpt IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  IF v_translit_sch IS NOT NULL AND v_translit IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  IF v_ftrans IS NOT NULL AND v_excerpt IS NULL THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  IF (v_ftrans IS NULL) <> (v_trans_lang IS NULL) THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- changed_fields: SABİT canonical sıra ---
  IF v_evidence     IS DISTINCT FROM v_existing.evidence_layer THEN v_changed := v_changed || 'evidence_layer'; END IF;
  IF v_source_role  IS DISTINCT FROM v_existing.source_role THEN v_changed := v_changed || 'source_role'; END IF;
  IF v_locator      IS DISTINCT FROM v_existing.locator_text THEN v_changed := v_changed || 'locator_text'; END IF;
  IF v_url_frag     IS DISTINCT FROM v_existing.url_fragment THEN v_changed := v_changed || 'url_fragment'; END IF;
  IF v_excerpt      IS DISTINCT FROM v_existing.source_original_excerpt THEN v_changed := v_changed || 'source_original_excerpt'; END IF;
  IF v_excerpt_lang IS DISTINCT FROM v_existing.source_original_language_tag THEN v_changed := v_changed || 'source_original_language_tag'; END IF;
  IF v_excerpt_scr  IS DISTINCT FROM v_existing.source_original_script_code THEN v_changed := v_changed || 'source_original_script_code'; END IF;
  IF v_translit     IS DISTINCT FROM v_existing.transliteration THEN v_changed := v_changed || 'transliteration'; END IF;
  IF v_translit_sch IS DISTINCT FROM v_existing.transliteration_scheme THEN v_changed := v_changed || 'transliteration_scheme'; END IF;
  IF v_ftrans       IS DISTINCT FROM v_existing.faithful_translation THEN v_changed := v_changed || 'faithful_translation'; END IF;
  IF v_trans_lang   IS DISTINCT FROM v_existing.translation_language_tag THEN v_changed := v_changed || 'translation_language_tag'; END IF;
  IF v_rationale    IS DISTINCT FROM v_existing.rationale THEN v_changed := v_changed || 'rationale'; END IF;
  IF v_rat_status   IS DISTINCT FROM v_existing.rationale_status THEN v_changed := v_changed || 'rationale_status'; END IF;

  IF cardinality(v_changed) = 0 THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NO_CHANGES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical UPDATE (concept_relation_id/source_id/verification_status/id/timestamps DEĞİŞMEZ) ---
  BEGIN
    UPDATE public.yebs_concept_relation_sources
       SET evidence_layer               = v_evidence,
           source_role                  = v_source_role,
           locator_text                 = v_locator,
           url_fragment                 = v_url_frag,
           source_original_excerpt      = v_excerpt,
           source_original_language_tag = v_excerpt_lang,
           source_original_script_code  = v_excerpt_scr,
           transliteration              = v_translit,
           transliteration_scheme       = v_translit_sch,
           faithful_translation         = v_ftrans,
           translation_language_tag     = v_trans_lang,
           rationale                    = v_rationale,
           rationale_status             = v_rat_status
     WHERE id = p_relation_source_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_RELATION_SOURCE_INVALID_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit update ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'update', 'concept_relation_source', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), v_changed, p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------
-- D) REMOVE RPC (detach — audit-önce, sonra yalnız junction fiziksel DELETE)
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_remove_concept_relation_source_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_concept_relation_id uuid,
  p_relation_source_id  uuid,
  p_expected_updated_at timestamptz,
  p_reason              text
)
RETURNS public.yebs_concept_relation_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_existing     public.yebs_concept_relation_sources;
  v_rel_status   text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_concept_relation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_ID_REQUIRED' USING ERRCODE = 'P0001';
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
  IF translate(p_reason, e'\t\n\r', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

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

  -- --- Hedef junction satırını kilitle ---
  SELECT * INTO v_existing FROM public.yebs_concept_relation_sources
    WHERE id = p_relation_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Path aidiyeti ---
  IF v_existing.concept_relation_id IS DISTINCT FROM p_concept_relation_id THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Parent Relation kilidi + draft gate ---
  SELECT r.status INTO v_rel_status FROM public.yebs_concept_relations r
    WHERE r.id = v_existing.concept_relation_id FOR UPDATE;
  IF v_rel_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_RELATION_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Optimistic concurrency ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_RELATION_SOURCE_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- ÖNCE full previous canonical snapshot audit (remove) ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'remove', 'concept_relation_source', v_existing.id,
    'committed', to_jsonb(v_existing), NULL, ARRAY[]::text[], p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  -- --- SONRA yalnız junction satırı fiziksel DELETE (Relation/Concept/Source silinmez) ---
  DELETE FROM public.yebs_concept_relation_sources WHERE id = p_relation_source_id;

  RETURN v_existing;
END;
$$;

-- ------------------------------------------------------------
-- E) EXECUTE privilege modeli — tam signature ile kilitle.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_attach_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_attach_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_attach_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_attach_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_attach_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_update_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_update_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_remove_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_remove_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_remove_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_remove_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_remove_concept_relation_source_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) TO service_role;

COMMIT;
