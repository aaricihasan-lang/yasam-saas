-- ============================================================
-- 20260823000000_yebs_concept_label_mutations.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A2 (Concept Labels)
-- Atomik LABEL CREATE + UPDATE + DELETE + AUDIT + write-gate
-- (public.yebs_concept_labels)
--
-- Amaç: public.yebs_concept_labels üzerindeki canonical create/update/delete
--   işlemlerinin public.yebs_audit_events'e karşılık gelen değiştirilemez izle
--   AYNI transaction içinde, ya birlikte ya hiç gerçekleşmesi. Audit insert
--   başarısız olursa canonical mutation da rollback olur.
--
-- Bağlayıcı mimari kararlar (A2):
--   - Üç dış giriş noktası: SECURITY DEFINER RPC create/update/delete. Fonksiyonlar
--     owner (tablo sahibi) olarak çalışır; write-gate nedeniyle service_role tabloya
--     doğrudan YAZAMAZ.
--   - Write-gate: service_role'ın public.yebs_concept_labels üzerindeki TÜM tablo
--     ayrıcalıkları REVOKE ALL PRIVILEGES ile kaldırılır, yalnız SELECT yeniden
--     GRANT edilir (A2R read servisi bozulmaz). ALTER TABLE yok.
--   - Parent concept: her mutation'da varlık kontrolü + share lock ile silme/durum
--     yarışı engellenir. Yalnız status='draft' concept'in etiketleri değiştirilebilir
--     (label'ın kendi status'u yoktur; yayın durumu concept düzeyindedir). Published
--     concept labelsız bırakılamaz (draft gate). Concept adı/status'u response'a veya
--     audit metadata'ya EKLENMEZ.
--   - reason: create OPSİYONEL, update ve delete ZORUNLU. Hepsinde FIDELITY: btrim
--     yalnız boşluk denetimi, length özgün p_reason üzerinde; normalize/trim/truncation
--     YOK; audit'e özgün p_reason (create'te omitted → NULL) yazılır.
--   - transliteration_scheme coupling D4 CHECK ile birebir: NULL her zaman geçerli;
--     NON-NULL yalnız label_kind='transliteration' ve boş-olmayan iken geçerli.
--   - Update patch whitelist YALNIZ {language_tag, script_code, label, label_kind,
--     transliteration_scheme, is_primary}; concept_id patch-dışı (başka concept'e
--     TAŞIMA YOK). id/timestamps/actor/request/operation ve unknown key REDDEDİLİR.
--   - Delete audit action = 'remove' (AUD1 20260803010000 action CHECK'inden birebir;
--     'delete' AUD1'de YOKTUR). V1'de son-label/son-primary koruması YOK
--     (publish-gate işi, kapsam dışı) — ancak parent draft gate zorunludur.
--
-- Deterministik/fail-fast: yalnız düz ifadeler; IF NOT EXISTS yok, CREATE OR REPLACE
--   yok, DO bloğu yok, dynamic SQL yok, yeni tablo/trigger/index/policy yok, D1–D9 ve
--   AUD1 şeması ALTER yok. Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/constraint mesajı veya kullanıcı verisi SIZDIRILMAZ);
--   tümü kontrollü SQLSTATE P0001:
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_CONCEPT_ID_REQUIRED,
--   YEBS_LABEL_ID_REQUIRED, YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID,
--   YEBS_INVALID_LABEL_INPUT, YEBS_INVALID_PATCH, YEBS_ADMIN_NOT_FOUND,
--   YEBS_ADMIN_NOT_ACTIVE, YEBS_CONCEPT_NOT_FOUND, YEBS_CONCEPT_STATUS_LOCKED,
--   YEBS_LABEL_NOT_FOUND, YEBS_LABEL_DUPLICATE, YEBS_LABEL_PRIMARY_CONFLICT,
--   YEBS_LABEL_STALE_UPDATE, YEBS_LABEL_NO_CHANGES.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Write-gate: service_role doğrudan label mutation yapamaz.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_concept_labels FROM service_role;
GRANT SELECT ON TABLE public.yebs_concept_labels TO service_role;

REVOKE ALL ON TABLE public.yebs_concept_labels FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_concept_labels FROM anon;
REVOKE ALL ON TABLE public.yebs_concept_labels FROM authenticated;

-- ------------------------------------------------------------
-- 2) Atomik LABEL CREATE + audit RPC.
--    Dönüş: canonical public.yebs_concept_labels satırı (10 alan).
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_create_concept_label_with_audit(
  p_actor_admin_id        uuid,
  p_request_id            uuid,
  p_operation_id          uuid,
  p_concept_id            uuid,
  p_language_tag          text,
  p_script_code           text,
  p_label                 text,
  p_label_kind            text,
  p_transliteration_scheme text DEFAULT NULL,
  p_is_primary            boolean DEFAULT false,
  p_reason                text DEFAULT NULL
)
RETURNS public.yebs_concept_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_concept_status text;
  v_created      public.yebs_concept_labels;
  v_constraint   text;
BEGIN
  -- --- 1-3) Operasyon/hedef parametre doğrulaması ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_concept_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- 4) Canonical alan doğrulaması (D4 CHECK ile birebir; coerce EDİLMEZ) ---
  IF p_language_tag IS NULL OR p_language_tag !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF p_script_code IS NULL OR p_script_code !~ '^[A-Z][a-z]{3}$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF p_label IS NULL OR btrim(p_label) = '' THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF p_label_kind IS NULL OR p_label_kind NOT IN (
    'original', 'transliteration', 'faithful_translation', 'common_name', 'alternative'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- transliteration_scheme coupling (D4 CHECK ile birebir):
  -- NULL her zaman geçerli; NON-NULL yalnız kind='transliteration' + boş-olmayan iken.
  IF p_transliteration_scheme IS NOT NULL THEN
    IF p_label_kind <> 'transliteration' OR btrim(p_transliteration_scheme) = '' THEN
      RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- is_primary NULL KABUL EDİLMEZ (NOT NULL kolon; explicit doğrulama).
  IF p_is_primary IS NULL THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- 5) reason OPSİYONEL + FIDELITY ---
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- 6) Aktif admin doğrulaması ---
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

  -- --- 7) Parent concept varlık + share lock + draft gate ---
  SELECT c.status
    INTO v_concept_status
    FROM public.yebs_concepts c
   WHERE c.id = p_concept_id
     FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_concept_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- 8) Canonical INSERT ---
  BEGIN
    INSERT INTO public.yebs_concept_labels (
      concept_id, language_tag, script_code, label, label_kind,
      transliteration_scheme, is_primary
    )
    VALUES (
      p_concept_id, p_language_tag, p_script_code, p_label, p_label_kind,
      p_transliteration_scheme, p_is_primary
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN unique_violation THEN
      -- Primary partial unique index vs doğal kimlik constraint ayrımı
      -- (constraint/index adı client'a SIZMAZ; yalnız iç sınıflandırma).
      GET STACKED DIAGNOSTICS v_constraint = PG_EXCEPTION_CONSTRAINT_NAME;
      IF v_constraint = 'yebs_concept_labels_primary_key' THEN
        RAISE EXCEPTION 'YEBS_LABEL_PRIMARY_CONFLICT' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'YEBS_LABEL_DUPLICATE' USING ERRCODE = 'P0001';
      END IF;
    WHEN foreign_key_violation THEN
      -- Parent concept, kontrolden sonra silinmiş olabilir (savunma).
      RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- 9) Audit INSERT ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'create', 'concept_label', v_created.id,
    'committed', NULL, to_jsonb(v_created),
    ARRAY[
      'concept_id', 'language_tag', 'script_code', 'label', 'label_kind',
      'transliteration_scheme', 'is_primary'
    ]::text[],
    p_reason, p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- 3) Atomik LABEL UPDATE + audit RPC (partial JSONB patch).
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_update_concept_label_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_concept_id          uuid,
  p_label_id            uuid,
  p_expected_updated_at timestamptz,
  p_patch               jsonb,
  p_reason              text
)
RETURNS public.yebs_concept_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role           text;
  v_active         boolean;
  v_email          text;
  v_actor_label    text;
  v_concept_status text;
  v_existing       public.yebs_concept_labels;
  v_updated        public.yebs_concept_labels;
  v_language_tag   text;
  v_script_code    text;
  v_label          text;
  v_label_kind     text;
  v_scheme         text;
  v_is_primary     boolean;
  v_changed        text[] := ARRAY[]::text[];
  v_constraint     text;
BEGIN
  -- --- 1-5) Operasyon/hedef parametre doğrulaması ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_concept_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_label_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_LABEL_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- reason ZORUNLU ---
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- patch: object, boş değil, yalnız 6 canonical anahtar ---
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_object_keys(p_patch) AS k
     WHERE k NOT IN (
       'language_tag', 'script_code', 'label', 'label_kind',
       'transliteration_scheme', 'is_primary'
     )
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  -- --- patch alan tipleri (present anahtarlar) ---
  -- NOT-NULL alanlar present ise json string olmalı (null KABUL EDİLMEZ).
  IF jsonb_exists(p_patch, 'language_tag')
     AND jsonb_typeof(p_patch -> 'language_tag') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'script_code')
     AND jsonb_typeof(p_patch -> 'script_code') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'label')
     AND jsonb_typeof(p_patch -> 'label') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'label_kind')
     AND jsonb_typeof(p_patch -> 'label_kind') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  -- nullable alan present ise json string VEYA json null olmalı.
  IF jsonb_exists(p_patch, 'transliteration_scheme')
     AND jsonb_typeof(p_patch -> 'transliteration_scheme') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  -- is_primary present ise json boolean olmalı.
  IF jsonb_exists(p_patch, 'is_primary')
     AND jsonb_typeof(p_patch -> 'is_primary') <> 'boolean' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  -- --- Aktif admin doğrulaması ---
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

  -- --- Hedef label'ı kilitle (concept_id eşleşmesi zorunlu) ---
  SELECT *
    INTO v_existing
    FROM public.yebs_concept_labels
   WHERE id = p_label_id
     AND concept_id = p_concept_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_LABEL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Parent concept share lock + draft gate ---
  SELECT c.status
    INTO v_concept_status
    FROM public.yebs_concepts c
   WHERE c.id = p_concept_id
     FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_concept_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Optimistic concurrency (label'ın kendi updated_at'i) ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_LABEL_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- Yeni canonical değerler: omitted→mevcut, string→orijinal, null→SQL NULL ---
  IF jsonb_exists(p_patch, 'language_tag') THEN
    v_language_tag := p_patch ->> 'language_tag';
  ELSE
    v_language_tag := v_existing.language_tag;
  END IF;

  IF jsonb_exists(p_patch, 'script_code') THEN
    v_script_code := p_patch ->> 'script_code';
  ELSE
    v_script_code := v_existing.script_code;
  END IF;

  IF jsonb_exists(p_patch, 'label') THEN
    v_label := p_patch ->> 'label';
  ELSE
    v_label := v_existing.label;
  END IF;

  IF jsonb_exists(p_patch, 'label_kind') THEN
    v_label_kind := p_patch ->> 'label_kind';
  ELSE
    v_label_kind := v_existing.label_kind;
  END IF;

  IF jsonb_exists(p_patch, 'transliteration_scheme') THEN
    IF jsonb_typeof(p_patch -> 'transliteration_scheme') = 'null' THEN
      v_scheme := NULL;
    ELSE
      v_scheme := p_patch ->> 'transliteration_scheme';
    END IF;
  ELSE
    v_scheme := v_existing.transliteration_scheme;
  END IF;

  IF jsonb_exists(p_patch, 'is_primary') THEN
    v_is_primary := (p_patch ->> 'is_primary')::boolean;
  ELSE
    v_is_primary := v_existing.is_primary;
  END IF;

  -- --- Canonical validation (merged final değerler; D4 CHECK ile birebir) ---
  IF v_language_tag !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_script_code !~ '^[A-Z][a-z]{3}$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF btrim(v_label) = '' THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_label_kind NOT IN (
    'original', 'transliteration', 'faithful_translation', 'common_name', 'alternative'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_scheme IS NOT NULL THEN
    IF v_label_kind <> 'transliteration' OR btrim(v_scheme) = '' THEN
      RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- changed_fields: SABİT canonical sıra, IS DISTINCT FROM (null-safe) ---
  IF v_language_tag IS DISTINCT FROM v_existing.language_tag THEN
    v_changed := v_changed || 'language_tag';
  END IF;
  IF v_script_code IS DISTINCT FROM v_existing.script_code THEN
    v_changed := v_changed || 'script_code';
  END IF;
  IF v_label IS DISTINCT FROM v_existing.label THEN
    v_changed := v_changed || 'label';
  END IF;
  IF v_label_kind IS DISTINCT FROM v_existing.label_kind THEN
    v_changed := v_changed || 'label_kind';
  END IF;
  IF v_scheme IS DISTINCT FROM v_existing.transliteration_scheme THEN
    v_changed := v_changed || 'transliteration_scheme';
  END IF;
  IF v_is_primary IS DISTINCT FROM v_existing.is_primary THEN
    v_changed := v_changed || 'is_primary';
  END IF;

  -- --- No-op reddi ---
  IF cardinality(v_changed) = 0 THEN
    RAISE EXCEPTION 'YEBS_LABEL_NO_CHANGES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical UPDATE ---
  BEGIN
    UPDATE public.yebs_concept_labels
       SET language_tag           = v_language_tag,
           script_code            = v_script_code,
           label                  = v_label,
           label_kind             = v_label_kind,
           transliteration_scheme = v_scheme,
           is_primary             = v_is_primary
     WHERE id = p_label_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = PG_EXCEPTION_CONSTRAINT_NAME;
      IF v_constraint = 'yebs_concept_labels_primary_key' THEN
        RAISE EXCEPTION 'YEBS_LABEL_PRIMARY_CONFLICT' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'YEBS_LABEL_DUPLICATE' USING ERRCODE = 'P0001';
      END IF;
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit INSERT ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'update', 'concept_label', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), v_changed, p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------
-- 4) Atomik LABEL DELETE + audit RPC.
--    action='remove' (AUD1 action CHECK'inden birebir).
--    Dönüş: SİLİNEN canonical satır (previous_state=to_jsonb(existing), new_state=NULL).
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_delete_concept_label_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_concept_id          uuid,
  p_label_id            uuid,
  p_expected_updated_at timestamptz,
  p_reason              text
)
RETURNS public.yebs_concept_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role           text;
  v_active         boolean;
  v_email          text;
  v_actor_label    text;
  v_concept_status text;
  v_existing       public.yebs_concept_labels;
BEGIN
  -- --- Operasyon/hedef parametre doğrulaması ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_concept_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_label_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_LABEL_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- reason ZORUNLU (delete destructive) ---
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- Aktif admin doğrulaması ---
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

  -- --- Hedef label'ı kilitle (concept_id eşleşmesi zorunlu) ---
  SELECT *
    INTO v_existing
    FROM public.yebs_concept_labels
   WHERE id = p_label_id
     AND concept_id = p_concept_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_LABEL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Parent concept share lock + draft gate ---
  SELECT c.status
    INTO v_concept_status
    FROM public.yebs_concepts c
   WHERE c.id = p_concept_id
     FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_concept_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Optimistic concurrency ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_LABEL_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical DELETE (snapshot v_existing zaten alındı) ---
  DELETE FROM public.yebs_concept_labels
   WHERE id = p_label_id;

  -- --- Audit INSERT (action='remove'; new_state=NULL) ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'remove', 'concept_label', v_existing.id,
    'committed', to_jsonb(v_existing), NULL,
    ARRAY[
      'language_tag', 'script_code', 'label', 'label_kind',
      'transliteration_scheme', 'is_primary'
    ]::text[],
    p_reason, p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_existing;
END;
$$;

-- ------------------------------------------------------------
-- 5) EXECUTE privilege modeli: her RPC tam signature ile kilitlenir.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_create_concept_label_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_create_concept_label_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_create_concept_label_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_create_concept_label_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_create_concept_label_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_update_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_update_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_update_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_update_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_update_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_delete_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_delete_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_delete_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_delete_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_delete_concept_label_with_audit(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text
) TO service_role;

COMMIT;
