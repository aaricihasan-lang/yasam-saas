-- ============================================================
-- 20260805000000_yebs_create_tradition_with_audit.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-AUD2
-- İlk atomik YEBS mutation kalıbı: TRADITION CREATE + AUDIT
--
-- Amaç: public.yebs_traditions'a yeni satır ekleme ile public.yebs_audit_events'e
--   karşılık gelen değiştirilemez izin AYNI transaction içinde, ya birlikte ya da
--   hiç gerçekleşmesi. Audit insert başarısız olursa tradition insert de rollback
--   olur; tradition insert başarısız olursa audit satırı hiç oluşmaz.
--
-- Bağlayıcı mimari kararlar:
--   - Tek dış giriş noktası: SECURITY DEFINER RPC
--     public.yebs_create_tradition_with_audit(...). Fonksiyon owner (tablo sahibi)
--     olarak çalışır; RLS'yi ve runtime GRANT sınırlarını owner ayrıcalığıyla aşar.
--   - Write-gate: service_role'ın public.yebs_traditions üzerindeki TÜM tablo
--     ayrıcalıkları (INSERT/UPDATE/DELETE/TRUNCATE + REFERENCES + TRIGGER) REVOKE ALL
--     PRIVILEGES ile kaldırılır, ardından yalnız SELECT yeniden GRANT edilir. Audit
--     zorunlu olduğundan RPC dışından doğrudan tradition mutation kabul edilemez;
--     REFERENCES/TRIGGER dahil hiçbir doğrudan-yazma yan yolu bırakılmaz.
--     Bu privilege değişikliği tablo ŞEMASINI değiştirmez (ALTER TABLE yok).
--   - Audit tablosuna INSERT yalnız bu fonksiyonun owner'ı tarafından yapılır;
--     hiçbir runtime rolüne audit INSERT verilmez (AUD1 sözleşmesi korunur).
--   - Bu faz YALNIZ tradition create'tir: update RPC, rejected audit RPC, endpoint,
--     UI, diğer varlık mutasyonları KAPSAM DIŞIDIR.
--
-- Deterministik ve fail-fast: yalnız düz ifadeler; IF NOT EXISTS yok, CREATE OR
--   REPLACE yok, DO bloğu yok, dynamic SQL yok, yeni tablo yok, D1–D9 ve AUD1
--   tablo şeması ALTER yok. Explicit BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/constraint mesajı veya kullanıcı verisi SIZDIRILMAZ):
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_REASON_INVALID,
--   YEBS_INVALID_TRADITION_INPUT, YEBS_ADMIN_NOT_FOUND, YEBS_ADMIN_NOT_ACTIVE,
--   YEBS_TRADITION_DUPLICATE. Tümü kontrollü SQLSTATE P0001 ile RAISE edilir.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Write-gate: service_role doğrudan tradition mutation yapamaz.
--    D1 (20260726210017) service_role'e GRANT ALL vermişti (INSERT/UPDATE/DELETE/
--    TRUNCATE + REFERENCES + TRIGGER dahil). Audit zorunluluğu nedeniyle doğrudan
--    yazma ve yazma yan-yolları TAMAMEN kapatılır: önce REVOKE ALL PRIVILEGES,
--    ardından yalnız gerekli SELECT yeniden GRANT edilir (okuma servisi
--    lib/yebs/service/traditions.ts bozulmaz). Bu bir GRANT/REVOKE işlemidir;
--    tablo şeması (kolon/constraint/trigger tanımı) DEĞİŞMEZ.
--    Final service_role kapısı: SELECT=true; INSERT/UPDATE/DELETE/TRUNCATE/
--    REFERENCES/TRIGGER=false. Canonical mutation yalnız SECURITY DEFINER RPC ile.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_traditions FROM service_role;
GRANT SELECT ON TABLE public.yebs_traditions TO service_role;

-- PUBLIC / anon / authenticated D1'de zaten tam REVOKE edilmişti; write-gate
-- bağlamında bu kilitleri açıkça yeniden doğruluyoruz (idempotent, additif).
REVOKE ALL ON TABLE public.yebs_traditions FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_traditions FROM anon;
REVOKE ALL ON TABLE public.yebs_traditions FROM authenticated;

-- ------------------------------------------------------------
-- 2) Atomik create + audit RPC (tek dış giriş noktası).
--    LANGUAGE plpgsql, SECURITY DEFINER, sabit search_path, tüm tablolar
--    schema-qualified, dynamic SQL yok, fonksiyon gövdesinde COMMIT/ROLLBACK yok.
--    Dönüş: canonical public.yebs_traditions satırı (strongly typed; generic JSON yok).
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_create_tradition_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_slug                text,
  p_name_tr             text,
  p_tradition_type      text,
  p_native_name         text DEFAULT NULL,
  p_native_language_tag text DEFAULT NULL,
  p_native_script_code  text DEFAULT NULL,
  p_reason              text DEFAULT NULL
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
  v_slug         text;
  v_name_tr      text;
  v_type         text;
  v_native_name  text;
  v_lang         text;
  v_script       text;
  v_reason       text;
  v_created      public.yebs_traditions;
BEGIN
  -- --- Operasyon parametre doğrulaması ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- reason: verilirse btrim sonrası boş olamaz ve 2000 karakteri aşamaz.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF p_reason IS NOT NULL AND (v_reason IS NULL OR length(v_reason) > 2000) THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- Tradition create alanları doğrulaması (D1 sınırları birebir) ---
  -- Çağıran id/status/timestamps/publish alanlarını BELİRLEYEMEZ: bunlar
  -- parametre değildir; INSERT'te set edilmez → DB default'ları uygulanır
  -- (status = 'draft' güvenli başlangıç, id/created_at/updated_at otomatik).
  v_slug    := btrim(coalesce(p_slug, ''));
  v_name_tr := btrim(coalesce(p_name_tr, ''));
  v_type    := coalesce(p_tradition_type, '');

  IF v_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_name_tr = '' THEN
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

  -- Endonym (özgün öz-ad) çift yönlü coupling: ya üçü de boş ya da üçü de dolu.
  v_native_name := nullif(btrim(coalesce(p_native_name, '')), '');
  v_lang        := nullif(btrim(coalesce(p_native_language_tag, '')), '');
  v_script      := nullif(btrim(coalesce(p_native_script_code, '')), '');

  IF (v_native_name IS NULL) <> (v_lang IS NULL)
     OR (v_native_name IS NULL) <> (v_script IS NULL) THEN
    RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END IF;

  IF v_native_name IS NOT NULL THEN
    IF v_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
    END IF;
    IF v_script !~ '^[A-Z][a-z]{3}$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Aktif admin doğrulaması (actor kimliği yalnız p_actor_admin_id'den) ---
  -- p_actor_admin_id NULL ise WHERE id = NULL hiçbir satır döndürmez → NOT FOUND.
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

  -- --- Actor label snapshot (DB satırından; çağıran belirleyemez) ---
  -- Yalnız e-posta okunur; parola/token/oturum/güvenlik metadata'sı ALINMAZ.
  -- Boş veya 320 karakteri aşan durumda güvenli ve sabit rol etiketine düşülür.
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  -- --- Canonical INSERT (id/status/timestamps set EDİLMEZ → DB default) ---
  BEGIN
    INSERT INTO public.yebs_traditions (
      slug, name_tr, tradition_type,
      native_name, native_language_tag, native_script_code
    )
    VALUES (
      v_slug, v_name_tr, v_type,
      v_native_name, v_lang, v_script
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN unique_violation THEN
      -- Ham constraint adı/kullanıcı verisi sızdırılmaz; stabil koda çevrilir.
      RAISE EXCEPTION 'YEBS_TRADITION_DUPLICATE' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_TRADITION_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit INSERT (canonical INSERT'ten SONRA; hata yakalanıp yutulmaz) ---
  -- Bu INSERT bir exception handler ile SARILMAZ: audit başarısız olursa hata
  -- yukarı yayılır ve fonksiyonun tamamı (canonical INSERT dahil) rollback olur.
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
    'tradition',
    v_created.id,
    'committed',
    NULL,
    to_jsonb(v_created),
    ARRAY[
      'slug',
      'name_tr',
      'tradition_type',
      'native_name',
      'native_language_tag',
      'native_script_code'
    ]::text[],
    v_reason,
    p_request_id,
    p_operation_id,
    NULL,
    '{}'::jsonb
  );

  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- 3) EXECUTE privilege modeli: tam signature ile kilitle.
--    PUBLIC/anon/authenticated/service_role tam REVOKE; yalnız service_role
--    EXECUTE alır. Owner SECURITY DEFINER olarak güvenli yürütür.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_create_tradition_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_create_tradition_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_create_tradition_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_create_tradition_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.yebs_create_tradition_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) TO service_role;

COMMIT;
