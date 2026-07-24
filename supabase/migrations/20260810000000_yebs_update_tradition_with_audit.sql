-- ============================================================
-- 20260809000000_yebs_update_tradition_with_audit.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A0U
-- Atomik TRADITION UPDATE + AUDIT (partial JSONB patch)
--
-- Amaç: mevcut bir yebs_traditions satırının canonical içerik alanlarını güvenli,
--   audit'li ve atomik biçimde güncellemek. Canonical UPDATE ile committed audit
--   AYNI transaction içinde ya birlikte ya hiç gerçekleşir; audit başarısız olursa
--   UPDATE de rollback olur.
--
-- Bağlayıcı kararlar (API-A0U):
--   - Tek dış giriş noktası: SECURITY DEFINER RPC
--     public.yebs_update_tradition_with_audit(...). Fonksiyon owner (tablo sahibi)
--     olarak çalışır; write-gate nedeniyle service_role tabloya doğrudan YAZAMAZ.
--   - Partial patch: p_patch jsonb. Anahtar YOK → mevcut değer korunur; explicit
--     JSON null → yalnız nullable native alanlarda gerçek SQL NULL; string → orijinal
--     değer (coercion/trim/lowercase/truncation YOK).
--   - Optimistic concurrency: p_expected_updated_at zorunlu; SELECT ... FOR UPDATE ile
--     kilitlenen satırın updated_at'i ile IS DISTINCT FROM karşılaştırılır (stale → hata).
--   - Status gate: yalnız status='draft' satır güncellenebilir.
--   - reason ZORUNLU (create'ten farklı): btrim≠'' ve ≤2000.
--   - No-op reddi: gerçek changed_fields boşsa UPDATE ve audit YOK.
--   - changed_fields: yalnız gerçekten değişen 6 canonical alan, SABİT sırada;
--     karşılaştırmalar IS DISTINCT FROM (null-safe). updated_at DAHİL DEĞİL.
--   - Bu faz YALNIZ update'tir: rejected audit, transition, publish KAPSAM DIŞI.
--
-- Deterministik/fail-fast: yalnız düz ifadeler; IF NOT EXISTS yok, CREATE OR REPLACE
--   yok, DO bloğu yok, dynamic SQL yok, yeni tablo/trigger/index/policy yok, D1–D9 ve
--   AUD1/AUD2 şeması ALTER yok. Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/constraint mesajı veya kullanıcı verisi SIZDIRILMAZ);
--   tümü kontrollü SQLSTATE P0001:
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_TRADITION_ID_REQUIRED,
--   YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID, YEBS_INVALID_PATCH,
--   YEBS_ADMIN_NOT_FOUND, YEBS_ADMIN_NOT_ACTIVE, YEBS_TRADITION_NOT_FOUND,
--   YEBS_TRADITION_STATUS_LOCKED, YEBS_TRADITION_STALE_UPDATE, YEBS_TRADITION_NO_CHANGES,
--   YEBS_TRADITION_DUPLICATE, YEBS_INVALID_TRADITION_INPUT.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Atomik update + audit RPC. Dönüş: canonical public.yebs_traditions satırı
-- (güncellenmiş). LANGUAGE plpgsql, SECURITY DEFINER, sabit search_path,
-- schema-qualified, dynamic SQL yok, gövdede COMMIT/ROLLBACK yok.
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_update_tradition_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_tradition_id        uuid,
  p_expected_updated_at timestamptz,
  p_patch               jsonb,
  p_reason              text
)
RETURNS public.yebs_traditions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_existing     public.yebs_traditions;
  v_updated      public.yebs_traditions;
  v_reason       text;
  v_slug         text;
  v_name_tr      text;
  v_type         text;
  v_native_name  text;
  v_lang         text;
  v_script       text;
  v_changed      text[] := ARRAY[]::text[];
BEGIN
  -- --- 1-4) Operasyon/hedef parametre doğrulaması ---
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

  -- --- 5) reason ZORUNLU: btrim≠'' ve ≤2000 (orijinal değer audit'e yazılır) ---
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- 6) patch: object, boş değil, yalnız 6 canonical anahtar ---
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
       'slug', 'name_tr', 'tradition_type',
       'native_name', 'native_language_tag', 'native_script_code'
     )
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  -- --- 7) patch alan tipleri (present anahtarlar) ---
  -- Required alanlar present ise json string olmalı (null KABUL EDİLMEZ).
  IF jsonb_exists(p_patch, 'slug')
     AND jsonb_typeof(p_patch -> 'slug') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'name_tr')
     AND jsonb_typeof(p_patch -> 'name_tr') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'tradition_type')
     AND jsonb_typeof(p_patch -> 'tradition_type') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  -- Nullable native alanlar present ise json string VEYA json null olmalı.
  IF jsonb_exists(p_patch, 'native_name')
     AND jsonb_typeof(p_patch -> 'native_name') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'native_language_tag')
     AND jsonb_typeof(p_patch -> 'native_language_tag') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'native_script_code')
     AND jsonb_typeof(p_patch -> 'native_script_code') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  -- --- 8) Aktif admin doğrulaması (actor yalnız p_actor_admin_id'den) ---
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

  -- Actor label snapshot (create RPC ile aynı güvenli model; yalnız e-posta).
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  -- --- 9) Hedef satırı kilitle ---
  SELECT *
    INTO v_existing
    FROM public.yebs_traditions
   WHERE id = p_tradition_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- 10) Status gate: yalnız draft düzenlenebilir ---
  IF v_existing.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_TRADITION_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- 11) Optimistic concurrency (timestamptz değer eşitliği, null-safe) ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_TRADITION_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- Yeni canonical değerler: omitted→mevcut, string→orijinal, null→SQL NULL ---
  IF jsonb_exists(p_patch, 'slug') THEN
    v_slug := p_patch ->> 'slug';
  ELSE
    v_slug := v_existing.slug;
  END IF;

  IF jsonb_exists(p_patch, 'name_tr') THEN
    v_name_tr := p_patch ->> 'name_tr';
  ELSE
    v_name_tr := v_existing.name_tr;
  END IF;

  IF jsonb_exists(p_patch, 'tradition_type') THEN
    v_type := p_patch ->> 'tradition_type';
  ELSE
    v_type := v_existing.tradition_type;
  END IF;

  IF jsonb_exists(p_patch, 'native_name') THEN
    IF jsonb_typeof(p_patch -> 'native_name') = 'null' THEN
      v_native_name := NULL;
    ELSE
      v_native_name := p_patch ->> 'native_name';
    END IF;
  ELSE
    v_native_name := v_existing.native_name;
  END IF;

  IF jsonb_exists(p_patch, 'native_language_tag') THEN
    IF jsonb_typeof(p_patch -> 'native_language_tag') = 'null' THEN
      v_lang := NULL;
    ELSE
      v_lang := p_patch ->> 'native_language_tag';
    END IF;
  ELSE
    v_lang := v_existing.native_language_tag;
  END IF;

  IF jsonb_exists(p_patch, 'native_script_code') THEN
    IF jsonb_typeof(p_patch -> 'native_script_code') = 'null' THEN
      v_script := NULL;
    ELSE
      v_script := p_patch ->> 'native_script_code';
    END IF;
  ELSE
    v_script := v_existing.native_script_code;
  END IF;

  -- --- Canonical validation (D1 20260726210017 CHECK sözleşmesiyle birebir) ---
  -- Değerler coerce EDİLMEZ; btrim yalnız boşluk denetimi için kullanılır.
  IF v_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF btrim(v_name_tr) = '' THEN
    RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_type NOT IN (
    'cultural_tradition',
    'historical_system',
    'modern_system',
    'professional_framework',
    'research_framework'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF (v_native_name IS NULL) <> (v_lang IS NULL)
     OR (v_native_name IS NULL) <> (v_script IS NULL) THEN
    RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_native_name IS NOT NULL THEN
    IF btrim(v_native_name) = '' THEN
      RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
    END IF;
    IF v_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
    END IF;
    IF v_script !~ '^[A-Z][a-z]{3}$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- changed_fields: SABİT canonical sıra, IS DISTINCT FROM (null-safe) ---
  -- updated_at DAHİL EDİLMEZ.
  IF v_slug IS DISTINCT FROM v_existing.slug THEN
    v_changed := v_changed || 'slug';
  END IF;
  IF v_name_tr IS DISTINCT FROM v_existing.name_tr THEN
    v_changed := v_changed || 'name_tr';
  END IF;
  IF v_type IS DISTINCT FROM v_existing.tradition_type THEN
    v_changed := v_changed || 'tradition_type';
  END IF;
  IF v_native_name IS DISTINCT FROM v_existing.native_name THEN
    v_changed := v_changed || 'native_name';
  END IF;
  IF v_lang IS DISTINCT FROM v_existing.native_language_tag THEN
    v_changed := v_changed || 'native_language_tag';
  END IF;
  IF v_script IS DISTINCT FROM v_existing.native_script_code THEN
    v_changed := v_changed || 'native_script_code';
  END IF;

  -- --- No-op reddi (UPDATE'ten ÖNCE; updated_at boşuna değişmesin, audit spam olmasın) ---
  IF cardinality(v_changed) = 0 THEN
    RAISE EXCEPTION 'YEBS_TRADITION_NO_CHANGES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical UPDATE (yalnız 6 canonical alan; updated_at trigger'la yenilenir) ---
  BEGIN
    UPDATE public.yebs_traditions
       SET slug                = v_slug,
           name_tr             = v_name_tr,
           tradition_type      = v_type,
           native_name         = v_native_name,
           native_language_tag = v_lang,
           native_script_code  = v_script
     WHERE id = p_tradition_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN unique_violation THEN
      -- Ham constraint adı/kullanıcı verisi sızdırılmaz; stabil koda çevrilir.
      RAISE EXCEPTION 'YEBS_TRADITION_DUPLICATE' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit INSERT (UPDATE'ten SONRA; handler'sız → hata tüm işlemi rollback eder) ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id,
    actor_label_snapshot,
    action,
    entity_type,
    entity_id,
    outcome,
    previous_state,
    new_state,
    changed_fields,
    reason,
    request_id,
    operation_id,
    error_code,
    metadata
  )
  VALUES (
    p_actor_admin_id,
    v_actor_label,
    'update',
    'tradition',
    v_updated.id,
    'committed',
    to_jsonb(v_existing),
    to_jsonb(v_updated),
    v_changed,
    v_reason,
    p_request_id,
    p_operation_id,
    NULL,
    '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------
-- EXECUTE privilege modeli: tam signature ile kilitle. PUBLIC/anon/authenticated/
-- service_role tam REVOKE; yalnız service_role EXECUTE. Tablo grant'ları
-- (service_role SELECT-only write-gate) DEĞİŞTİRİLMEZ.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_update_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_update_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_update_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_update_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.yebs_update_tradition_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) TO service_role;

COMMIT;
