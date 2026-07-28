-- ============================================================
-- 20260822000000_yebs_concept_mutations.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A2 (Concepts)
-- Atomik CONCEPT CREATE + UPDATE + AUDIT + write-gate (public.yebs_concepts)
--
-- Amaç: public.yebs_concepts üzerindeki canonical create/update işlemlerinin
--   public.yebs_audit_events'e karşılık gelen değiştirilemez izle AYNI transaction
--   içinde, ya birlikte ya hiç gerçekleşmesi. Audit insert başarısız olursa
--   canonical mutation da rollback olur.
--
-- Bağlayıcı mimari kararlar (A2):
--   - İki dış giriş noktası: SECURITY DEFINER RPC
--     public.yebs_create_concept_with_audit(...) ve
--     public.yebs_update_concept_with_audit(...). Fonksiyonlar owner (tablo sahibi)
--     olarak çalışır; write-gate nedeniyle service_role tabloya doğrudan YAZAMAZ.
--   - Write-gate: service_role'ın public.yebs_concepts üzerindeki TÜM tablo
--     ayrıcalıkları REVOKE ALL PRIVILEGES ile kaldırılır, yalnız SELECT yeniden
--     GRANT edilir (A2R read servisi lib/yebs/service/concepts.ts bozulmaz). Bu
--     privilege değişikliği tablo ŞEMASINI değiştirmez (ALTER TABLE yok).
--   - Parent tradition ZORUNLU; INSERT öncesi SELECT ... FOR KEY SHARE ile parent
--     varlık kontrolü + silme yarışı kilidi. school_id doluysa (id, tradition_id)
--     kompozit eşleşmesi ayrıca FOR KEY SHARE ile doğrulanır. Parent status
--     GATE EDİLMEZ (draft/verified/approved/published ayrımı yok). Parent adı/
--     status'u response'a veya audit metadata'ya EKLENMEZ.
--   - reason: create OPSİYONEL, update ZORUNLU. Her ikisinde FIDELITY: btrim
--     yalnız boşluk denetimi, length doğrudan özgün p_reason üzerinde; normalize/
--     trim/truncation YOK; audit'e özgün p_reason (create'te omitted → NULL) yazılır.
--   - status body/parametre DEĞİL: DB default 'draft'. slug tradition-içi unique.
--   - Update patch whitelist YALNIZ {slug, concept_type}; tradition_id/school_id/
--     status/id/timestamps ve unknown key REDDEDİLİR. Reparent ve transition bu
--     fazın KAPSAM DIŞIDIR → yeni parent lock/reparent mantığı YOK.
--   - Bu faz concept create + update'tir: rejected audit, transition, publish,
--     concept DELETE ve label işlemleri KAPSAM DIŞI.
--
-- Deterministik/fail-fast: yalnız düz ifadeler; IF NOT EXISTS yok, CREATE OR REPLACE
--   yok, DO bloğu yok, dynamic SQL yok, yeni tablo/trigger/index/policy yok, D1–D9 ve
--   AUD1 şeması ALTER yok. Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/constraint mesajı veya kullanıcı verisi SIZDIRILMAZ);
--   tümü kontrollü SQLSTATE P0001:
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_TRADITION_ID_REQUIRED,
--   YEBS_CONCEPT_ID_REQUIRED, YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID,
--   YEBS_INVALID_CONCEPT_INPUT, YEBS_INVALID_PATCH, YEBS_ADMIN_NOT_FOUND,
--   YEBS_ADMIN_NOT_ACTIVE, YEBS_PARENT_TRADITION_NOT_FOUND, YEBS_PARENT_SCHOOL_NOT_FOUND,
--   YEBS_CONCEPT_DUPLICATE, YEBS_CONCEPT_NOT_FOUND, YEBS_CONCEPT_STATUS_LOCKED,
--   YEBS_CONCEPT_STALE_UPDATE, YEBS_CONCEPT_NO_CHANGES.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Write-gate: service_role doğrudan concept mutation yapamaz.
--    D3 (20260726230043) service_role'e GRANT ALL vermişti. Audit zorunluluğu
--    nedeniyle doğrudan yazma ve yazma yan-yolları kapatılır: önce REVOKE ALL
--    PRIVILEGES, ardından yalnız gerekli SELECT yeniden GRANT edilir (A2R read
--    servisi bozulmaz). Tablo şeması DEĞİŞMEZ.
--    Final service_role kapısı: SELECT=true; INSERT/UPDATE/DELETE/TRUNCATE/
--    REFERENCES/TRIGGER=false. Canonical mutation yalnız SECURITY DEFINER RPC ile.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_concepts FROM service_role;
GRANT SELECT ON TABLE public.yebs_concepts TO service_role;

-- PUBLIC / anon / authenticated D3'te zaten tam REVOKE edilmişti; write-gate
-- bağlamında bu kilitleri açıkça yeniden doğruluyoruz (idempotent, additif).
REVOKE ALL ON TABLE public.yebs_concepts FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_concepts FROM anon;
REVOKE ALL ON TABLE public.yebs_concepts FROM authenticated;

-- ------------------------------------------------------------
-- 2) Atomik create + audit RPC (tek dış giriş noktası).
--    LANGUAGE plpgsql, SECURITY DEFINER, sabit search_path, schema-qualified,
--    dynamic SQL yok, fonksiyon gövdesinde COMMIT/ROLLBACK yok.
--    Dönüş: canonical public.yebs_concepts satırı (strongly typed).
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_create_concept_with_audit(
  p_actor_admin_id uuid,
  p_request_id     uuid,
  p_operation_id   uuid,
  p_tradition_id   uuid,
  p_school_id      uuid,
  p_slug           text,
  p_concept_type   text,
  p_reason         text DEFAULT NULL
)
RETURNS public.yebs_concepts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_created      public.yebs_concepts;
BEGIN
  -- --- 1-3) Operasyon/hedef parametre doğrulaması ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_tradition_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_TRADITION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- 4) Canonical slug (D3 CHECK ile birebir; coerce EDİLMEZ) ---
  IF p_slug IS NULL OR p_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_CONCEPT_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- 5) concept_type exact enum (D3 CHECK ile birebir) ---
  IF p_concept_type IS NULL OR p_concept_type NOT IN (
    'energy_center', 'channel', 'vital_substance', 'anatomy_model',
    'technique', 'principle', 'other'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_CONCEPT_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- 6) reason OPSİYONEL + FIDELITY (btrim yalnız boşluk; length özgün p_reason'da) ---
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- 7) Aktif admin doğrulaması (actor yalnız p_actor_admin_id'den) ---
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

  -- Actor label snapshot (A0/A1 ile aynı güvenli model; yalnız e-posta).
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  -- --- 8) Parent tradition varlık kontrolü + silme yarışı kilidi (FOR KEY SHARE) ---
  -- Parent status OKUNMAZ/gate EDİLMEZ. Kilit, parent'ın bu transaction boyunca
  -- silinmesini engeller.
  PERFORM 1
    FROM public.yebs_traditions
   WHERE id = p_tradition_id
     FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_PARENT_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- 9) school_id doluysa: gelenek-tutarlı school varlık kontrolü + kilit ---
  -- Kompozit FK (school_id, tradition_id) MATCH SIMPLE: school_id NULL ise
  -- zorlanmaz. Doluysa aynı tradition'a ait olmak zorundadır. School status
  -- OKUNMAZ/gate EDİLMEZ.
  IF p_school_id IS NOT NULL THEN
    PERFORM 1
      FROM public.yebs_schools
     WHERE id = p_school_id
       AND tradition_id = p_tradition_id
       FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'YEBS_PARENT_SCHOOL_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- 10) Canonical INSERT (yalnız 4 canonical alan; status/id/timestamps DB default) ---
  BEGIN
    INSERT INTO public.yebs_concepts (
      tradition_id, school_id, slug, concept_type
    )
    VALUES (
      p_tradition_id, p_school_id, p_slug, p_concept_type
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN unique_violation THEN
      -- Ham constraint adı/kullanıcı verisi sızdırılmaz; stabil koda çevrilir.
      RAISE EXCEPTION 'YEBS_CONCEPT_DUPLICATE' USING ERRCODE = 'P0001';
    WHEN foreign_key_violation THEN
      -- Parent, existence kontrolünden sonra silinmiş olabilir (savunma): stabil kod.
      -- Kompozit FK ihlali (school/tradition) parent school koduna maplenir.
      IF p_school_id IS NOT NULL THEN
        RAISE EXCEPTION 'YEBS_PARENT_SCHOOL_NOT_FOUND' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'YEBS_PARENT_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_CONCEPT_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- 11) Audit INSERT (canonical INSERT'ten SONRA; handler'sız → hata rollback eder) ---
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
    'create',
    'concept',
    v_created.id,
    'committed',
    NULL,
    to_jsonb(v_created),
    ARRAY[
      'tradition_id',
      'school_id',
      'slug',
      'concept_type'
    ]::text[],
    p_reason,
    p_request_id,
    p_operation_id,
    NULL,
    '{}'::jsonb
  );

  -- --- 12) Canonical satırı döndür ---
  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- 3) Atomik update + audit RPC (partial JSONB patch).
--    Dönüş: canonical public.yebs_concepts satırı (güncellenmiş).
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_update_concept_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_concept_id          uuid,
  p_expected_updated_at timestamptz,
  p_patch               jsonb,
  p_reason              text
)
RETURNS public.yebs_concepts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role          text;
  v_active        boolean;
  v_email         text;
  v_actor_label   text;
  v_existing      public.yebs_concepts;
  v_updated       public.yebs_concepts;
  v_slug          text;
  v_concept_type  text;
  v_changed       text[] := ARRAY[]::text[];
BEGIN
  -- --- 1-4) Operasyon/hedef parametre doğrulaması ---
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

  -- --- 5) reason ZORUNLU: btrim YALNIZ boşluk denetimi; p_reason normalize EDİLMEZ ---
  IF p_reason IS NULL
     OR btrim(p_reason) = ''
     OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- 6) patch: object, boş değil, yalnız 2 canonical anahtar ---
  -- tradition_id/school_id/status/id/created_at/updated_at/actor/request/operation
  -- ve unknown key reddedilir.
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_object_keys(p_patch) AS k
     WHERE k NOT IN ('slug', 'concept_type')
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  -- --- 7) patch alan tipleri (present anahtarlar; null KABUL EDİLMEZ) ---
  IF jsonb_exists(p_patch, 'slug')
     AND jsonb_typeof(p_patch -> 'slug') <> 'string' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_exists(p_patch, 'concept_type')
     AND jsonb_typeof(p_patch -> 'concept_type') <> 'string' THEN
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

  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  -- --- 9) Hedef satırı kilitle ---
  SELECT *
    INTO v_existing
    FROM public.yebs_concepts
   WHERE id = p_concept_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- 10) Status gate: yalnız draft düzenlenebilir ---
  IF v_existing.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- 11) Optimistic concurrency (timestamptz değer eşitliği, null-safe) ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- Yeni canonical değerler: omitted→mevcut, string→orijinal ---
  -- tradition_id/school_id/status DEĞİŞTİRİLMEZ (patch whitelist dışı).
  IF jsonb_exists(p_patch, 'slug') THEN
    v_slug := p_patch ->> 'slug';
  ELSE
    v_slug := v_existing.slug;
  END IF;

  IF jsonb_exists(p_patch, 'concept_type') THEN
    v_concept_type := p_patch ->> 'concept_type';
  ELSE
    v_concept_type := v_existing.concept_type;
  END IF;

  -- --- Canonical validation (D3 CHECK sözleşmesiyle birebir; coerce YOK) ---
  IF v_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_CONCEPT_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_concept_type NOT IN (
    'energy_center', 'channel', 'vital_substance', 'anatomy_model',
    'technique', 'principle', 'other'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_CONCEPT_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- changed_fields: SABİT canonical sıra, IS DISTINCT FROM (null-safe) ---
  IF v_slug IS DISTINCT FROM v_existing.slug THEN
    v_changed := v_changed || 'slug';
  END IF;
  IF v_concept_type IS DISTINCT FROM v_existing.concept_type THEN
    v_changed := v_changed || 'concept_type';
  END IF;

  -- --- No-op reddi (UPDATE'ten ÖNCE; updated_at boşuna değişmesin, audit spam olmasın) ---
  IF cardinality(v_changed) = 0 THEN
    RAISE EXCEPTION 'YEBS_CONCEPT_NO_CHANGES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical UPDATE (yalnız 2 canonical alan; updated_at trigger'la yenilenir) ---
  BEGIN
    UPDATE public.yebs_concepts
       SET slug         = v_slug,
           concept_type = v_concept_type
     WHERE id = p_concept_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'YEBS_CONCEPT_DUPLICATE' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_CONCEPT_INPUT' USING ERRCODE = 'P0001';
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
    'concept',
    v_updated.id,
    'committed',
    to_jsonb(v_existing),
    to_jsonb(v_updated),
    v_changed,
    p_reason,
    p_request_id,
    p_operation_id,
    NULL,
    '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------
-- 4) EXECUTE privilege modeli: tam signature ile kilitle. PUBLIC/anon/authenticated/
-- service_role tam REVOKE; yalnız service_role EXECUTE. Tablo grant'ları
-- (service_role SELECT-only write-gate) DEĞİŞTİRİLMEZ. A0/A1 RPC'leri DOKUNULMAZ.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_create_concept_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_create_concept_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_create_concept_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_create_concept_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.yebs_create_concept_with_audit(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_update_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_update_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_update_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_update_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.yebs_update_concept_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) TO service_role;

COMMIT;
