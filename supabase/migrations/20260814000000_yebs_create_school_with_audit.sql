-- ============================================================
-- 20260814000000_yebs_create_school_with_audit.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A1W
-- Atomik SCHOOL CREATE + AUDIT + write-gate (public.yebs_schools)
--
-- Amaç: public.yebs_schools'a yeni satır ekleme ile public.yebs_audit_events'e
--   karşılık gelen değiştirilemez izin AYNI transaction içinde, ya birlikte ya da
--   hiç gerçekleşmesi. Audit insert başarısız olursa school insert de rollback olur.
--
-- Bağlayıcı mimari kararlar (API-A1W):
--   - Tek dış giriş noktası: SECURITY DEFINER RPC
--     public.yebs_create_school_with_audit(...). Fonksiyon owner (tablo sahibi)
--     olarak çalışır; write-gate nedeniyle service_role tabloya doğrudan YAZAMAZ.
--   - Write-gate: service_role'ın public.yebs_schools üzerindeki TÜM tablo
--     ayrıcalıkları REVOKE ALL PRIVILEGES ile kaldırılır, yalnız SELECT yeniden
--     GRANT edilir (A1R read servisi bozulmaz). Bu privilege değişikliği tablo
--     ŞEMASINI değiştirmez (ALTER TABLE yok).
--   - Parent: p_tradition_id ZORUNLU; INSERT öncesi SELECT ... FOR KEY SHARE ile
--     parent varlık kontrolü + silme yarışı kilidi. Parent status GATE EDİLMEZ
--     (draft/verified/approved/published ayrımı yok). Parent adı/status'u
--     response'a veya audit metadata'ya EKLENMEZ.
--   - reason OPSİYONEL + FIDELITY: verilirse btrim yalnız boşluk denetimi, length
--     doğrudan özgün p_reason üzerinde; normalize/trim/truncation YOK; audit'e özgün
--     p_reason (omitted → NULL) yazılır. v_reason değişkeni YOK.
--   - status body/parametre DEĞİL: DB default 'draft'. slug tradition-içi unique.
--   - Native trio: coerce EDİLMEZ; raw değerler coupling + non-empty + BCP-47 +
--     ISO-15924 ile doğrulanır (D2 CHECK sözleşmesiyle birebir).
--   - Bu faz YALNIZ school create'tir: rejected audit, update, transition KAPSAM DIŞI.
--
-- Deterministik/fail-fast: yalnız düz ifadeler; IF NOT EXISTS yok, CREATE OR REPLACE
--   yok, DO bloğu yok, dynamic SQL yok, yeni tablo/trigger/index/policy yok, D1–D9 ve
--   AUD1 şeması ALTER yok. Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/constraint mesajı veya kullanıcı verisi SIZDIRILMAZ);
--   tümü kontrollü SQLSTATE P0001:
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_TRADITION_ID_REQUIRED,
--   YEBS_REASON_INVALID, YEBS_INVALID_SCHOOL_INPUT, YEBS_ADMIN_NOT_FOUND,
--   YEBS_ADMIN_NOT_ACTIVE, YEBS_PARENT_TRADITION_NOT_FOUND, YEBS_SCHOOL_DUPLICATE.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Write-gate: service_role doğrudan school mutation yapamaz.
--    D2 (20260726220031) service_role'e GRANT ALL vermişti. Audit zorunluluğu
--    nedeniyle doğrudan yazma ve yazma yan-yolları kapatılır: önce REVOKE ALL
--    PRIVILEGES, ardından yalnız gerekli SELECT yeniden GRANT edilir (A1R read
--    servisi lib/yebs/service/schools.ts bozulmaz). Tablo şeması DEĞİŞMEZ.
--    Final service_role kapısı: SELECT=true; INSERT/UPDATE/DELETE/TRUNCATE/
--    REFERENCES/TRIGGER=false. Canonical mutation yalnız SECURITY DEFINER RPC ile.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_schools FROM service_role;
GRANT SELECT ON TABLE public.yebs_schools TO service_role;

-- PUBLIC / anon / authenticated D2'de zaten tam REVOKE edilmişti; write-gate
-- bağlamında bu kilitleri açıkça yeniden doğruluyoruz (idempotent, additif).
REVOKE ALL ON TABLE public.yebs_schools FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_schools FROM anon;
REVOKE ALL ON TABLE public.yebs_schools FROM authenticated;

-- ------------------------------------------------------------
-- 2) Atomik create + audit RPC (tek dış giriş noktası).
--    LANGUAGE plpgsql, SECURITY DEFINER, sabit search_path, schema-qualified,
--    dynamic SQL yok, fonksiyon gövdesinde COMMIT/ROLLBACK yok.
--    Dönüş: canonical public.yebs_schools satırı (strongly typed).
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_create_school_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_tradition_id        uuid,
  p_slug                text,
  p_name_tr             text,
  p_native_name         text DEFAULT NULL,
  p_native_language_tag text DEFAULT NULL,
  p_native_script_code  text DEFAULT NULL,
  p_reason              text DEFAULT NULL
)
RETURNS public.yebs_schools
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_created      public.yebs_schools;
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

  -- --- 4) Canonical slug/name_tr (D2 CHECK ile birebir; coerce EDİLMEZ) ---
  IF p_slug IS NULL OR p_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SCHOOL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF p_name_tr IS NULL OR btrim(p_name_tr) = '' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SCHOOL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- 5) reason OPSİYONEL + FIDELITY (btrim yalnız boşluk; length özgün p_reason'da) ---
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- 6) Native trio: raw değerler; coupling + non-empty + BCP-47 + ISO-15924 ---
  IF (p_native_name IS NULL) <> (p_native_language_tag IS NULL)
     OR (p_native_name IS NULL) <> (p_native_script_code IS NULL) THEN
    RAISE EXCEPTION 'YEBS_INVALID_SCHOOL_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF p_native_name IS NOT NULL THEN
    IF btrim(p_native_name) = '' THEN
      RAISE EXCEPTION 'YEBS_INVALID_SCHOOL_INPUT' USING ERRCODE = 'P0001';
    END IF;
    IF p_native_language_tag !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_SCHOOL_INPUT' USING ERRCODE = 'P0001';
    END IF;
    IF p_native_script_code !~ '^[A-Z][a-z]{3}$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_SCHOOL_INPUT' USING ERRCODE = 'P0001';
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

  -- Actor label snapshot (create tradition ile aynı güvenli model; yalnız e-posta).
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  -- --- 8) Parent tradition varlık kontrolü + silme yarışı kilidi (FOR KEY SHARE) ---
  -- Parent status OKUNMAZ/gate EDİLMEZ. Kilit, parent'ın bu transaction boyunca
  -- silinmesini engeller (FK zaten KEY SHARE alır; burada yarışsız hale getirilir).
  PERFORM 1
    FROM public.yebs_traditions
   WHERE id = p_tradition_id
     FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_PARENT_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- 9) Canonical INSERT (yalnız 6 canonical alan; status/id/timestamps DB default) ---
  BEGIN
    INSERT INTO public.yebs_schools (
      tradition_id, slug, name_tr,
      native_name, native_language_tag, native_script_code
    )
    VALUES (
      p_tradition_id, p_slug, p_name_tr,
      p_native_name, p_native_language_tag, p_native_script_code
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN unique_violation THEN
      -- Ham constraint adı/kullanıcı verisi sızdırılmaz; stabil koda çevrilir.
      RAISE EXCEPTION 'YEBS_SCHOOL_DUPLICATE' USING ERRCODE = 'P0001';
    WHEN foreign_key_violation THEN
      -- Parent, existence kontrolünden sonra silinmiş olabilir (savunma): stabil kod.
      RAISE EXCEPTION 'YEBS_PARENT_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_SCHOOL_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- 10) Audit INSERT (canonical INSERT'ten SONRA; handler'sız → hata rollback eder) ---
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
    'school',
    v_created.id,
    'committed',
    NULL,
    to_jsonb(v_created),
    ARRAY[
      'tradition_id',
      'slug',
      'name_tr',
      'native_name',
      'native_language_tag',
      'native_script_code'
    ]::text[],
    p_reason,
    p_request_id,
    p_operation_id,
    NULL,
    '{}'::jsonb
  );

  -- --- 11) Canonical satırı döndür ---
  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- 3) EXECUTE privilege modeli: tam signature ile kilitle. PUBLIC/anon/authenticated/
-- service_role tam REVOKE; yalnız service_role EXECUTE. Tablo grant'ları
-- (service_role SELECT-only write-gate) DEĞİŞTİRİLMEZ.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_create_school_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_create_school_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_create_school_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_create_school_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.yebs_create_school_with_audit(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) TO service_role;

COMMIT;
