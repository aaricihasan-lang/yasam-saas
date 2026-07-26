-- =============================================================================
-- 20260814000000_yasam_hafizasi_outbox.sql
--
-- YAŞAM HAFIZASI™ — BF-11A: OUTBOX KANONİK ŞEMASI + CLAIM RPC + DURUM MAKİNESİ
--
-- KAPSAM (yalnız outbox altyapısı — SENKRONİZASYON HENÜZ AÇILMAZ):
--   1. public.yasam_hafizasi_outbox                      → kanonik olay kuyruğu
--   2. public.yasam_hafizasi_outbox_event_version_seq    → monotonik sürüm sequence'i
--   3. yh_outbox_claim / _complete / _fail / _sweep_expired RPC'leri (durum makinesi)
--   4. RLS ENABLE + anon/authenticated REVOKE → service_role only
--
-- KAPSAM DIŞI (SONRAKİ FAZLAR — BU MIGRATION'DA YOK):
--   - Kaynak tablo trigger'ı / enqueue fonksiyonu   → BF-11C (stones pilot)
--   - Inngest worker / index upsert / deindex adapter → BF-11B
--   - Reconciliation                                  → BF-11D
--   Bu dosya HİÇBİR kaynak tabloyu ALTER etmez, HİÇBİR trigger oluşturmaz,
--   yasam_hafizasi_index'e HİÇBİR veri yazmaz.
--
-- KİLİTLENEN KARARLAR (BF-10B / BF-11A):
--   - Aynı-DB transactional outbox → dual-write açığı yapısal olarak imkânsız.
--   - İlk sürüm YALNIZ tenant-scoped technical-ready kaynaklar içindir → tenant_id
--     NOT NULL (shared/NULL kaynaklar BF-11E+ kapsamı).
--   - operation ∈ {upsert, delete} (insert/update ayrımı outbox'ta tutulmaz).
--   - status ∈ {pending, processing, succeeded, dead} — `failed` YOK; başarısız ama
--     yeniden denenebilir olay backoff ile doğrudan `pending`, sınır aşılırsa `dead`.
--   - Kanonik tekillik: KOŞULSUZ UNIQUE (source_key, source_id) → source başına tek
--     kanonik durum satırı (partial DEĞİL; tenant_id/source_table anahtara girmez).
--   - payload_snapshot YOK · owner_user_id YOK · kaynak tabloya FK YOK (index çok
--     tablolu provenance kullanır → tek kaynak FK'sı kurulamaz).
--   - Tüm RPC'ler SECURITY DEFINER + sabit search_path + yalnız service_role.
--
-- GÜVENLİK:
--   - RLS ENABLE (policy yok) + PUBLIC/anon/authenticated REVOKE → service_role only.
--   - ⛔ FORCE RLS kullanılmaz (service_role akışı korunur; mevcut modül deseniyle aynı).
--   - RPC'ler geçersiz parametrede fail-closed (RAISE); kullanıcı verisi/secret loglanmaz.
--   - last_error güvenli biçimde truncate edilir (payload/secret mantığı YOK).
--
-- UYGULAMA: Supabase Dashboard SQL Editor (DATABASE_URL=localhost çalışmaz).
-- IDEMPOTENT: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / REVOKE / GRANT (tekrar no-op).
-- =============================================================================

BEGIN;

-- ─── 1) event_version sequence (tablo default'undan ÖNCE oluşturulmalı) ───────
CREATE SEQUENCE IF NOT EXISTS public.yasam_hafizasi_outbox_event_version_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  NO CYCLE;


-- ─── 2) yasam_hafizasi_outbox (kanonik olay kuyruğu) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_outbox (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance (kaynak kaydı) + registry çözümü.
  source_key     text        NOT NULL,
  source_table   text        NOT NULL,
  source_id      uuid        NOT NULL,

  -- Tenant sahipliği: ilk sürüm YALNIZ tenant-scoped kaynaklar → NULL OLAMAZ.
  -- DELETE olayında da OLD.tenant_id burada korunur (kaynak satır kaybolsa da).
  tenant_id      uuid        NOT NULL,

  -- Olay sözleşmesi.
  operation      text        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending',

  -- Retry / lease / sürüm.
  attempts       integer     NOT NULL DEFAULT 0,
  available_at   timestamptz NOT NULL DEFAULT now(),
  locked_at      timestamptz,
  locked_by      text,
  event_version  bigint      NOT NULL
                   DEFAULT nextval('public.yasam_hafizasi_outbox_event_version_seq'),

  -- Teşhis / yaşam döngüsü.
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,

  -- ─── Kurallar / kısıtlar ───────────────────────────────────────────────────
  CONSTRAINT yho_operation_chk      CHECK (operation IN ('upsert', 'delete')),
  CONSTRAINT yho_status_chk         CHECK (status IN ('pending', 'processing', 'succeeded', 'dead')),
  CONSTRAINT yho_attempts_chk       CHECK (attempts >= 0),
  CONSTRAINT yho_event_version_chk  CHECK (event_version > 0),
  CONSTRAINT yho_source_key_chk     CHECK (length(btrim(source_key)) > 0),
  CONSTRAINT yho_source_table_chk   CHECK (length(btrim(source_table)) > 0),

  -- Lock tutarlılığı: processing ⟺ (locked_at + locked_by dolu); aksi ⟺ ikisi de NULL.
  CONSTRAINT yho_lock_consistency_chk CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR (status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL)
  ),

  -- succeeded ⟹ processed_at dolu.
  CONSTRAINT yho_succeeded_processed_chk CHECK (
    status <> 'succeeded' OR processed_at IS NOT NULL
  ),

  -- Kanonik tekillik: source başına TEK durum satırı (koşulsuz; partial DEĞİL).
  CONSTRAINT yho_source_unit_key UNIQUE (source_key, source_id)
);


-- ─── 3) Performans indexleri (deterministik adlar) ────────────────────────────
-- Pending claim: available_at öncelikli sıralamayla (claim ORDER BY ile hizalı).
CREATE INDEX IF NOT EXISTS yho_pending_claim_idx
  ON public.yasam_hafizasi_outbox (available_at, created_at, id)
  WHERE status = 'pending';

-- Processing lease: süresi geçmiş kilit taraması.
CREATE INDEX IF NOT EXISTS yho_processing_lease_idx
  ON public.yasam_hafizasi_outbox (locked_at)
  WHERE status = 'processing';

-- Tenant/source operasyonel inceleme.
CREATE INDEX IF NOT EXISTS yho_tenant_source_idx
  ON public.yasam_hafizasi_outbox (source_key, tenant_id, source_id);


-- ─── 4) Kilit: anon/authenticated erişimini kapat, RLS aç (service_role bypass) ─
ALTER TABLE public.yasam_hafizasi_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yasam_hafizasi_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yasam_hafizasi_outbox TO service_role;

REVOKE ALL PRIVILEGES ON SEQUENCE public.yasam_hafizasi_outbox_event_version_seq
  FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.yasam_hafizasi_outbox_event_version_seq TO service_role;


-- ─── 5) yh_outbox_claim — pending olayları atomik olarak processing yapar ──────
CREATE OR REPLACE FUNCTION public.yh_outbox_claim(
  p_worker text,
  p_batch  integer
)
RETURNS TABLE (
  id            uuid,
  source_key    text,
  source_table  text,
  source_id     uuid,
  tenant_id     uuid,
  operation     text,
  attempts      integer,
  event_version bigint
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
  -- Fail-closed parametre doğrulaması.
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_outbox_claim: p_worker bos';
  END IF;
  IF length(p_worker) > 200 THEN
    RAISE EXCEPTION 'yh_outbox_claim: p_worker cok uzun';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'yh_outbox_claim: p_batch >= 1 olmali';
  END IF;
  v_batch := least(p_batch, 100);   -- güvenli üst sınır (DoS korkuluğu)

  RETURN QUERY
  WITH claimable AS (
    SELECT o.id
    FROM public.yasam_hafizasi_outbox AS o
    WHERE o.status = 'pending'
      AND o.available_at <= now()
    ORDER BY o.available_at ASC, o.created_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_batch
  )
  UPDATE public.yasam_hafizasi_outbox AS o
  SET status       = 'processing',
      locked_by    = p_worker,
      locked_at    = now(),
      attempts     = o.attempts + 1,
      updated_at   = now(),
      processed_at = NULL
  FROM claimable AS c
  WHERE o.id = c.id
  RETURNING o.id, o.source_key, o.source_table, o.source_id, o.tenant_id,
            o.operation, o.attempts, o.event_version;
END;
$$;


-- ─── 6) yh_outbox_complete — işlenen olayı succeeded / requeue eder ────────────
CREATE OR REPLACE FUNCTION public.yh_outbox_complete(
  p_id              uuid,
  p_worker          text,
  p_claimed_version bigint
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row public.yasam_hafizasi_outbox%ROWTYPE;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'yh_outbox_complete: p_id null';
  END IF;
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_outbox_complete: p_worker bos';
  END IF;
  IF p_claimed_version IS NULL OR p_claimed_version <= 0 THEN
    RAISE EXCEPTION 'yh_outbox_complete: p_claimed_version gecersiz';
  END IF;

  SELECT * INTO v_row FROM public.yasam_hafizasi_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_complete: olay bulunamadi';
  END IF;
  IF v_row.status <> 'processing' THEN
    RAISE EXCEPTION 'yh_outbox_complete: olay processing degil (%)', v_row.status;
  END IF;
  IF v_row.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION 'yh_outbox_complete: lock sahibi uyusmazligi';
  END IF;
  IF p_claimed_version > v_row.event_version THEN
    -- Sürüm yalnız artar → claimed > current imkânsız (bozuk çağrı; fail-closed).
    RAISE EXCEPTION 'yh_outbox_complete: claimed_version current ustunde (imkansiz)';
  END IF;

  IF p_claimed_version = v_row.event_version THEN
    UPDATE public.yasam_hafizasi_outbox
    SET status = 'succeeded', processed_at = now(),
        locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = now()
    WHERE id = p_id;
    RETURN 'succeeded';
  ELSE
    -- current > claimed: claim sonrası yeni olay geldi → eski worker succeeded yapamaz.
    UPDATE public.yasam_hafizasi_outbox
    SET status = 'pending', available_at = now(),
        processed_at = NULL, locked_at = NULL, locked_by = NULL, updated_at = now()
    WHERE id = p_id;
    RETURN 'requeued_newer_event';
  END IF;
END;
$$;


-- ─── 7) yh_outbox_fail — retry (backoff) / dead / requeue kararı ───────────────
CREATE OR REPLACE FUNCTION public.yh_outbox_fail(
  p_id              uuid,
  p_worker          text,
  p_claimed_version bigint,
  p_error           text,
  p_max_attempts    integer,
  p_base_delay      integer,
  p_max_delay       integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row   public.yasam_hafizasi_outbox%ROWTYPE;
  v_err   text;
  v_exp   integer;
  v_delay integer;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'yh_outbox_fail: p_id null';
  END IF;
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_outbox_fail: p_worker bos';
  END IF;
  IF p_claimed_version IS NULL OR p_claimed_version <= 0 THEN
    RAISE EXCEPTION 'yh_outbox_fail: p_claimed_version gecersiz';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 THEN
    RAISE EXCEPTION 'yh_outbox_fail: p_max_attempts >= 1 olmali';
  END IF;
  IF p_base_delay IS NULL OR p_base_delay < 1 THEN
    RAISE EXCEPTION 'yh_outbox_fail: p_base_delay >= 1 olmali';
  END IF;
  IF p_max_delay IS NULL OR p_max_delay < p_base_delay THEN
    RAISE EXCEPTION 'yh_outbox_fail: p_max_delay >= p_base_delay olmali';
  END IF;

  -- Hata metni güvenli truncate (secret/payload mantığı YOK; yalnız kısaltma).
  v_err := left(coalesce(p_error, ''), 2000);

  SELECT * INTO v_row FROM public.yasam_hafizasi_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_fail: olay bulunamadi';
  END IF;
  IF v_row.status <> 'processing' THEN
    RAISE EXCEPTION 'yh_outbox_fail: olay processing degil (%)', v_row.status;
  END IF;
  IF v_row.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION 'yh_outbox_fail: lock sahibi uyusmazligi';
  END IF;
  IF p_claimed_version > v_row.event_version THEN
    RAISE EXCEPTION 'yh_outbox_fail: claimed_version current ustunde (imkansiz)';
  END IF;

  IF p_claimed_version < v_row.event_version THEN
    -- Yeni olay geldi: eski işin hatası yeni olayı dead yapamaz → hemen requeue.
    UPDATE public.yasam_hafizasi_outbox
    SET status = 'pending', available_at = now(),
        locked_at = NULL, locked_by = NULL, processed_at = NULL,
        last_error = v_err, updated_at = now()
    WHERE id = p_id;
    RETURN 'requeued_newer_event';
  END IF;

  -- Sürüm aynı: retry hakkı veya dead.
  IF v_row.attempts >= p_max_attempts THEN
    UPDATE public.yasam_hafizasi_outbox
    SET status = 'dead',
        locked_at = NULL, locked_by = NULL, processed_at = NULL,
        last_error = v_err, updated_at = now()
    WHERE id = p_id;
    RETURN 'dead';
  ELSE
    -- Deterministik exponential backoff (cap'li, taşmasız): base * 2^min(attempts-1,20).
    v_exp   := least(greatest(v_row.attempts - 1, 0), 20);
    v_delay := least(p_base_delay * (2 ^ v_exp)::bigint, p_max_delay)::integer;
    UPDATE public.yasam_hafizasi_outbox
    SET status = 'pending',
        available_at = now() + make_interval(secs => v_delay),
        locked_at = NULL, locked_by = NULL, processed_at = NULL,
        last_error = v_err, updated_at = now()
    WHERE id = p_id;
    RETURN 'retry_scheduled';
  END IF;
END;
$$;


-- ─── 8) yh_outbox_sweep_expired — süresi geçmiş processing kilitlerini kurtarır ─
CREATE OR REPLACE FUNCTION public.yh_outbox_sweep_expired(
  p_lease_seconds integer,
  p_batch         integer
)
RETURNS TABLE (
  id            uuid,
  source_key    text,
  source_id     uuid,
  tenant_id     uuid,
  attempts      integer,
  event_version bigint
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
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 THEN
    RAISE EXCEPTION 'yh_outbox_sweep_expired: p_lease_seconds >= 1 olmali';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'yh_outbox_sweep_expired: p_batch >= 1 olmali';
  END IF;
  v_batch := least(p_batch, 100);

  -- YALNIZ lease timeout kurtarması: attempts SIFIRLANMAZ, event_version DEĞİŞMEZ.
  -- retry/dead kararı normal fail/claim yaşam döngüsünde kalır (burada dead YAPILMAZ).
  RETURN QUERY
  WITH expired AS (
    SELECT o.id
    FROM public.yasam_hafizasi_outbox AS o
    WHERE o.status = 'processing'
      AND o.locked_at IS NOT NULL
      AND o.locked_at < now() - make_interval(secs => p_lease_seconds)
    ORDER BY o.locked_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_batch
  )
  UPDATE public.yasam_hafizasi_outbox AS o
  SET status = 'pending', available_at = now(),
      locked_at = NULL, locked_by = NULL, processed_at = NULL, updated_at = now()
  FROM expired AS e
  WHERE o.id = e.id
  RETURNING o.id, o.source_key, o.source_id, o.tenant_id, o.attempts, o.event_version;
END;
$$;


-- ─── 9) RPC EXECUTE kilidi (least privilege): yalnız service_role ──────────────
REVOKE ALL ON FUNCTION public.yh_outbox_claim(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_claim(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.yh_outbox_complete(uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_complete(uuid, text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.yh_outbox_fail(uuid, text, bigint, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_fail(uuid, text, bigint, text, integer, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.yh_outbox_sweep_expired(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_sweep_expired(integer, integer) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, beklenen — salt-okunur):
--   -- 1) Tablo + RLS (FORCE değil):
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname = 'yasam_hafizasi_outbox';                              -- t, f
--   -- 2) anon/authenticated erişimi kapalı:
--   SELECT has_table_privilege('anon','public.yasam_hafizasi_outbox','SELECT');  -- false
--   -- 3) Kanonik tekillik (koşulsuz): aynı (source_key, source_id) ikinci INSERT hata verir.
--   -- 4) RPC'ler INVOKER değil DEFINER + yalnız service_role EXECUTE:
--   SELECT proname, prosecdef FROM pg_proc
--     WHERE proname IN ('yh_outbox_claim','yh_outbox_complete',
--                       'yh_outbox_fail','yh_outbox_sweep_expired');        -- hepsi prosecdef=t
--   SELECT has_function_privilege('anon',
--     'public.yh_outbox_claim(text,integer)', 'EXECUTE');                   -- false
--   -- 5) Bu migration HİÇBİR kaynak trigger'ı / index yazımı içermez (BF-11C/BF-11B).
-- =============================================================================
