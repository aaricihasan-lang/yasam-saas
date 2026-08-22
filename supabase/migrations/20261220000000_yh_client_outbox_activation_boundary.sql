-- =============================================================================
-- 20261220000000_yh_client_outbox_activation_boundary.sql
--
-- YAŞAM HAFIZASI™ — PRIVATE MEMORY: CLIENT OUTBOX ACTIVATION-RACE HARDENING
--   (EVENT-TIME BOUNDARY: `enqueued_active`)
--
-- SORUN (canlı production race, danisan:appointments aktivasyonu sırasında gözlendi):
--   Client CDC enqueue (20261218000200) aktivasyon-KAPISIZ olduğundan kaynak inactive
--   iken de olay kuyruğa girer. Runtime gate (isSourceProcessingActive) yalnız PROCESSING
--   anındaki is_active'e bakar; olayın enqueue anı ile aktivasyon effective-time'ı
--   arasında karşılaştırma YOKTUR. Böylece aktivasyondan ÖNCE enqueue edilmiş bir UPSERT,
--   worker aktivasyondan SONRA işlediğinde index'e SIZAR (FUTURE_ONLY_READY ihlali).
--
-- ÇÖZÜM (event-time boundary; AŞAMA 1 VERDICT: enqueued_active boolean):
--   Her outbox satırı, OLAYIN ENQUEUE/COALESCE ANINDAKİ aktivasyon durumunu damgalar:
--   yh_source_activation.is_active `IS TRUE` ise enqueued_active=true, aksi (satır yok /
--   NULL / false) → false (FAIL-CLOSED). Worker index için İKİ kapıyı birlikte ister:
--     (A) CURRENTLY ACTIVE (runtime gate)  VE  (B) ENQUEUED WHILE ACTIVE (enqueued_active).
--   Pre-activation olaylar (B=false) worker sonradan işlese bile ASLA index üretmez.
--
-- KİLİTLİ TASARIM KARARLARI (AŞAMA 2):
--   * enqueued_active DEFAULT false → mevcut/preexisting queued satırlar FAIL-CLOSED
--     (otomatik true YAPILMAZ; historical backfill YOK).
--   * enqueue INSERT + ON CONFLICT (coalesce) HER YENİ EVENTTE enqueued_active'i yeniden yazar
--     (EXCLUDED.enqueued_active). Böylece pre-activation satır üzerine gelen post-activation
--     GERÇEK UPDATE'i `false→true` flip'ler (kayıp YOK; created_at gate'in aksine coalesce-safe).
--   * created_at / event_version / operation / tenant / client / source identity /
--     status / coalescing / retry semantiği DEĞİŞMEZ.
--   * claim/complete/fail/sweep lifecycle RPC'leri enqueued_active'e ASLA DOKUNMAZ.
--
-- DEPLOYMENT-SAFETY (V1/V2 CLAIM):
--   PostgreSQL'de bir fonksiyonun RETURNS TABLE (OUT) şeklini CREATE OR REPLACE ile
--   değiştirmek güvenli değildir. Bu yüzden mevcut yh_client_outbox_claim(text,integer) V1
--   (20261218000300) AYNEN KORUNUR (drop/replace YOK) ve return'e enqueued_active EKLEYEN yeni
--   yh_client_outbox_claim_v2(text,integer) OLUŞTURULUR. Böylece migration production'a
--   ÖNCE uygulandığında mevcut V1 worker bozulmadan çalışmaya devam eder (EXPAND aşaması);
--   kod deploy'u (V2 kullanan) SONRA gelir.
--
-- BAĞLAYICI SINIR (rule 14 / "professional worker davranışını bozma"):
--   Professional public.yasam_hafizasi_outbox / yh_outbox_* / yh_cdc_enqueue DEĞİŞTİRİLMEZ
--   (bu dosyada mutasyon YOK). Yalnız client CDC/outbox ailesi genişletilir.
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY (bu turda UYGULANMAZ).
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + guard'lı REVOKE/GRANT.
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse tümü geri alınır.
-- ÖNKOŞUL: 20261218000200 (tablo + enqueue fn) + 20261218000300 (V1 claim) + 20260927000000
--   (yh_source_activation). Bu migration onlardan SONRA sıralanır.
-- =============================================================================

BEGIN;

-- ─── 1) enqueued_active kolonu (FAIL-CLOSED default false; historical backfill YOK) ──
ALTER TABLE public.yasam_hafizasi_client_outbox
  ADD COLUMN IF NOT EXISTS enqueued_active boolean NOT NULL DEFAULT false;

-- ─── 2) Enqueue trigger fn: aktivasyon-anı damgası ekle (diğer her şey KORUNUR) ──────
-- Mevcut 6 cohort trigger'ı bu fonksiyona isimle bağlıdır; CREATE OR REPLACE davranışı
-- hepsi için günceller. Return tipi (trigger) DEĞİŞMEZ → replace güvenli.
CREATE OR REPLACE FUNCTION public.yh_client_outbox_enqueue()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key      text := TG_ARGV[0];
  v_expect_table    text := TG_ARGV[1];
  v_operation       text;
  v_source_id       uuid;
  v_tenant_id       uuid;
  v_client_id       uuid;
  v_active          boolean;   -- aktivasyon-anı okuması (yh_source_activation.is_active)
  v_enqueued_active boolean;   -- damga: yalnız IS TRUE iken true (FAIL-CLOSED)
BEGIN
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: source_key argumani eksik';
  END IF;
  IF v_expect_table IS NULL OR length(btrim(v_expect_table)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: expected source_table argumani eksik';
  END IF;
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: beklenmeyen schema % (public bekleniyor)', TG_TABLE_SCHEMA;
  END IF;
  IF TG_TABLE_NAME IS DISTINCT FROM v_expect_table THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: source_table uyusmazligi (% <> %)', TG_TABLE_NAME, v_expect_table;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert';
    v_source_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_client_id := NEW.client_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete';
    v_source_id := OLD.id;
    v_tenant_id := OLD.tenant_id;
    v_client_id := OLD.client_id;
  ELSE
    RAISE EXCEPTION 'yh_client_outbox_enqueue: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- Fail-closed: geçerli source_id + tenant_id + client_id zorunlu (null → kaynak CRUD ROLLBACK).
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: source_id null (%, %)', v_expect_table, v_source_key;
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: tenant_id null (%, %)', v_expect_table, v_source_key;
  END IF;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: client_id null (%, %)', v_expect_table, v_source_key;
  END IF;

  -- ── EVENT-TIME AKTİVASYON DAMGASI (BF-11E race hardening çekirdeği) ────────────
  -- Kaynağın OLAY ANINDAKİ aktivasyon durumu. Satır yok / NULL / false → false (FAIL-CLOSED).
  -- Kaynak CRUD'unu ENGELLEMEZ (yalnız damga; enqueue koşulsuz kalır — dormant kuyruk drain edilir).
  SELECT a.is_active INTO v_active
  FROM public.yh_source_activation AS a
  WHERE a.source_key = v_source_key;
  v_enqueued_active := (v_active IS TRUE);

  -- Atomik enqueue + coalescing (latest-event-wins; event_version monotonik).
  INSERT INTO public.yasam_hafizasi_client_outbox AS o
    (source_key, source_table, source_id, tenant_id, client_id, operation, enqueued_active)
  VALUES
    (v_source_key, TG_TABLE_NAME, v_source_id, v_tenant_id, v_client_id, v_operation, v_enqueued_active)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation       = EXCLUDED.operation,
      source_table    = EXCLUDED.source_table,
      tenant_id       = EXCLUDED.tenant_id,
      client_id       = EXCLUDED.client_id,
      -- Coalesce: HER YENİ EVENTTE aktivasyon damgasını yeniden yaz (pre→post flip; kayıp YOK).
      enqueued_active = EXCLUDED.enqueued_active,
      event_version   = nextval('public.yasam_hafizasi_client_outbox_event_version_seq'),
      updated_at      = now(),
      -- PROCESSING (in-flight worker claim) KORUNUR; aksi → pending reset.
      status          = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts        = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at    = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at       = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by       = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error      = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at    = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.yh_client_outbox_enqueue() FROM PUBLIC, anon, authenticated;

-- ─── 3) yh_client_outbox_claim_v2 — V1 semantiği BİREBİR + enqueued_active döner ────
-- DEPLOYMENT-SAFETY: V1 (yh_client_outbox_claim, 20261218000300) drop/replace EDİLMEZ.
-- V2, V1'in eligibility / lease / attempts / status transition / event_version / ordering /
-- locking / SKIP LOCKED / concurrency davranışını BİREBİR korur; SADECE RETURNS TABLE'a ve
-- RETURNING'e enqueued_active ekler. Güvenlik/search_path/grant V1 ile eşdeğerdir.
CREATE OR REPLACE FUNCTION public.yh_client_outbox_claim_v2(
  p_worker text,
  p_batch  integer
)
RETURNS TABLE (
  id              uuid,
  source_key      text,
  source_table    text,
  source_id       uuid,
  tenant_id       uuid,
  client_id       uuid,
  operation       text,
  attempts        integer,
  event_version   bigint,
  enqueued_active boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_batch integer;
BEGIN
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_claim_v2: p_worker bos';
  END IF;
  IF length(p_worker) > 200 THEN
    RAISE EXCEPTION 'yh_client_outbox_claim_v2: p_worker cok uzun';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'yh_client_outbox_claim_v2: p_batch >= 1 olmali';
  END IF;
  v_batch := least(p_batch, 100);

  RETURN QUERY
  WITH claimable AS (
    SELECT o.id
    FROM public.yasam_hafizasi_client_outbox AS o
    WHERE o.status = 'pending'
      AND o.available_at <= now()
    ORDER BY o.available_at ASC, o.created_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_batch
  )
  UPDATE public.yasam_hafizasi_client_outbox AS o
  SET status       = 'processing',
      locked_by    = p_worker,
      locked_at    = now(),
      attempts     = o.attempts + 1,
      updated_at   = now(),
      processed_at = NULL
  FROM claimable AS c
  WHERE o.id = c.id
  RETURNING o.id, o.source_key, o.source_table, o.source_id, o.tenant_id, o.client_id,
            o.operation, o.attempts, o.event_version, o.enqueued_active;
END;
$$;

-- ─── 4) V2 EXECUTE kilidi (V1 ile eşdeğer least privilege): yalnız service_role ─────
REVOKE ALL ON FUNCTION public.yh_client_outbox_claim_v2(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_client_outbox_claim_v2(text, integer) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Kolon var + NOT NULL DEFAULT false (mevcut satırlar false = fail-closed):
--   SELECT is_nullable, column_default FROM information_schema.columns
--     WHERE table_name='yasam_hafizasi_client_outbox' AND column_name='enqueued_active';
--     -- NO, 'false'
--   -- 2) V1 KORUNDU + V2 EKLENDİ (ikisi de DEFINER):
--   SELECT proname, prosecdef FROM pg_proc
--     WHERE proname IN ('yh_client_outbox_claim','yh_client_outbox_claim_v2'); -- 2 satır, t
--   SELECT has_function_privilege('anon','public.yh_client_outbox_claim_v2(text,integer)','EXECUTE'); -- false
--   -- 3) Enqueue: aktif kaynakta INSERT → enqueued_active=true; inactive → false;
--   --    aynı (source_key, source_id) üzerine post-activation UPDATE coalesce → true'ya flip.
--   -- 4) complete/fail/sweep enqueued_active'i DEĞİŞTİRMEZ (bu dosyada o RPC'ler dokunulmadı).
--   -- 5) Professional public.yasam_hafizasi_outbox / yh_outbox_* / yh_cdc_enqueue DEĞİŞMEDİ.
-- =============================================================================
