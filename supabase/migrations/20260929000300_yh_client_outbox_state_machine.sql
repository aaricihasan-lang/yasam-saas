-- =============================================================================
-- 20260929000300_yh_client_outbox_state_machine.sql
--
-- YAŞAM HAFIZASI™ — PRIVATE MEMORY: CLIENT OUTBOX DURUM MAKİNESİ (claim/complete/fail/sweep)
--
-- POLİTİKA KİLİDİ / rule 7: "Yeni paralel ve farklı bir reliability modeli icat etme."
--   Bu dosya BF-11A (20260815000000) durum makinesinin BİREBİR client karşılığıdır:
--   aynı pending/processing/succeeded/dead state'leri, aynı lease/backoff/coalescing/
--   requeue semantiği. TEK fark: hedef tablo public.yasam_hafizasi_client_outbox ve
--   claim/sweep dönüşünde client_id EK alanı (client index builder ownership için).
--
-- KAPSAM (yalnız 4 RPC + grant; DATA/TRIGGER/TABLO YOK — tablo 20260929000200'de):
--   yh_client_outbox_claim / _complete / _fail / _sweep_expired
--
-- BAĞLAYICI SINIR (rule 14 / "professional worker davranışını bozma"):
--   - Professional public.yasam_hafizasi_outbox ve yh_outbox_* RPC'leri DEĞİŞTİRİLMEZ
--     (bu dosyada mutasyon YOK; ayrı fiziksel tablo/RPC ailesi).
--   - Tüm RPC'ler SECURITY DEFINER + sabit search_path + yalnız service_role EXECUTE.
--   - retry/backoff/dead kararı RPC'nindir (worker HESAPLAMAZ) — BF-11A ile aynı.
--
-- DORMANT: RPC'ler var olsa da worker env-gate (YH_CLIENT_OUTBOX_WORKER_ENABLED) + BF-11E
--   activation gate (client kaynakları FUTURE_ONLY_READY, registryEnabled:false → inactive)
--   çift kilidiyle hiçbir client kaynağı production'da index ÜRETMEZ.
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY (bu turda UYGULANMAZ).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + REVOKE/GRANT.
-- =============================================================================

BEGIN;

-- ─── 1) yh_client_outbox_claim — pending → processing (client_id döner) ────────
CREATE OR REPLACE FUNCTION public.yh_client_outbox_claim(
  p_worker text,
  p_batch  integer
)
RETURNS TABLE (
  id            uuid,
  source_key    text,
  source_table  text,
  source_id     uuid,
  tenant_id     uuid,
  client_id     uuid,
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
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_claim: p_worker bos';
  END IF;
  IF length(p_worker) > 200 THEN
    RAISE EXCEPTION 'yh_client_outbox_claim: p_worker cok uzun';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'yh_client_outbox_claim: p_batch >= 1 olmali';
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
            o.operation, o.attempts, o.event_version;
END;
$$;

-- ─── 2) yh_client_outbox_complete — succeeded / requeue ───────────────────────
CREATE OR REPLACE FUNCTION public.yh_client_outbox_complete(
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
  v_row public.yasam_hafizasi_client_outbox%ROWTYPE;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_complete: p_id null';
  END IF;
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_complete: p_worker bos';
  END IF;
  IF p_claimed_version IS NULL OR p_claimed_version <= 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_complete: p_claimed_version gecersiz';
  END IF;

  SELECT * INTO v_row FROM public.yasam_hafizasi_client_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_client_outbox_complete: olay bulunamadi';
  END IF;
  IF v_row.status <> 'processing' THEN
    RAISE EXCEPTION 'yh_client_outbox_complete: olay processing degil (%)', v_row.status;
  END IF;
  IF v_row.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION 'yh_client_outbox_complete: lock sahibi uyusmazligi';
  END IF;
  IF p_claimed_version > v_row.event_version THEN
    RAISE EXCEPTION 'yh_client_outbox_complete: claimed_version current ustunde (imkansiz)';
  END IF;

  IF p_claimed_version = v_row.event_version THEN
    UPDATE public.yasam_hafizasi_client_outbox
    SET status = 'succeeded', processed_at = now(),
        locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = now()
    WHERE id = p_id;
    RETURN 'succeeded';
  ELSE
    UPDATE public.yasam_hafizasi_client_outbox
    SET status = 'pending', available_at = now(),
        processed_at = NULL, locked_at = NULL, locked_by = NULL, updated_at = now()
    WHERE id = p_id;
    RETURN 'requeued_newer_event';
  END IF;
END;
$$;

-- ─── 3) yh_client_outbox_fail — retry(backoff) / dead / requeue ───────────────
CREATE OR REPLACE FUNCTION public.yh_client_outbox_fail(
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
  v_row   public.yasam_hafizasi_client_outbox%ROWTYPE;
  v_err   text;
  v_exp   integer;
  v_delay integer;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: p_id null';
  END IF;
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: p_worker bos';
  END IF;
  IF p_claimed_version IS NULL OR p_claimed_version <= 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: p_claimed_version gecersiz';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: p_max_attempts >= 1 olmali';
  END IF;
  IF p_base_delay IS NULL OR p_base_delay < 1 THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: p_base_delay >= 1 olmali';
  END IF;
  IF p_max_delay IS NULL OR p_max_delay < p_base_delay THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: p_max_delay >= p_base_delay olmali';
  END IF;

  v_err := left(coalesce(p_error, ''), 2000);

  SELECT * INTO v_row FROM public.yasam_hafizasi_client_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: olay bulunamadi';
  END IF;
  IF v_row.status <> 'processing' THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: olay processing degil (%)', v_row.status;
  END IF;
  IF v_row.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: lock sahibi uyusmazligi';
  END IF;
  IF p_claimed_version > v_row.event_version THEN
    RAISE EXCEPTION 'yh_client_outbox_fail: claimed_version current ustunde (imkansiz)';
  END IF;

  IF p_claimed_version < v_row.event_version THEN
    UPDATE public.yasam_hafizasi_client_outbox
    SET status = 'pending', available_at = now(),
        locked_at = NULL, locked_by = NULL, processed_at = NULL,
        last_error = v_err, updated_at = now()
    WHERE id = p_id;
    RETURN 'requeued_newer_event';
  END IF;

  IF v_row.attempts >= p_max_attempts THEN
    UPDATE public.yasam_hafizasi_client_outbox
    SET status = 'dead',
        locked_at = NULL, locked_by = NULL, processed_at = NULL,
        last_error = v_err, updated_at = now()
    WHERE id = p_id;
    RETURN 'dead';
  ELSE
    v_exp   := least(greatest(v_row.attempts - 1, 0), 20);
    v_delay := least(p_base_delay * (2 ^ v_exp)::bigint, p_max_delay)::integer;
    UPDATE public.yasam_hafizasi_client_outbox
    SET status = 'pending',
        available_at = now() + make_interval(secs => v_delay),
        locked_at = NULL, locked_by = NULL, processed_at = NULL,
        last_error = v_err, updated_at = now()
    WHERE id = p_id;
    RETURN 'retry_scheduled';
  END IF;
END;
$$;

-- ─── 4) yh_client_outbox_sweep_expired — lease timeout kurtarma ───────────────
CREATE OR REPLACE FUNCTION public.yh_client_outbox_sweep_expired(
  p_lease_seconds integer,
  p_batch         integer
)
RETURNS TABLE (
  id            uuid,
  source_key    text,
  source_id     uuid,
  tenant_id     uuid,
  client_id     uuid,
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
    RAISE EXCEPTION 'yh_client_outbox_sweep_expired: p_lease_seconds >= 1 olmali';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'yh_client_outbox_sweep_expired: p_batch >= 1 olmali';
  END IF;
  v_batch := least(p_batch, 100);

  RETURN QUERY
  WITH expired AS (
    SELECT o.id
    FROM public.yasam_hafizasi_client_outbox AS o
    WHERE o.status = 'processing'
      AND o.locked_at IS NOT NULL
      AND o.locked_at < now() - make_interval(secs => p_lease_seconds)
    ORDER BY o.locked_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_batch
  )
  UPDATE public.yasam_hafizasi_client_outbox AS o
  SET status = 'pending', available_at = now(),
      locked_at = NULL, locked_by = NULL, processed_at = NULL, updated_at = now()
  FROM expired AS e
  WHERE o.id = e.id
  RETURNING o.id, o.source_key, o.source_id, o.tenant_id, o.client_id, o.attempts, o.event_version;
END;
$$;

-- ─── 5) RPC EXECUTE kilidi (least privilege): yalnız service_role ──────────────
REVOKE ALL ON FUNCTION public.yh_client_outbox_claim(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_client_outbox_claim(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.yh_client_outbox_complete(uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_client_outbox_complete(uuid, text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.yh_client_outbox_fail(uuid, text, bigint, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_client_outbox_fail(uuid, text, bigint, text, integer, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.yh_client_outbox_sweep_expired(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_client_outbox_sweep_expired(integer, integer) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'yh_client_outbox_%'; -- 4 satır, prosecdef=t
--   SELECT has_function_privilege('anon','public.yh_client_outbox_claim(text,integer)','EXECUTE'); -- false
--   -- claim RETURNS TABLE'da client_id mevcut (index builder ownership için).
--   -- Professional yh_outbox_* / yasam_hafizasi_outbox DEĞİŞMEDİ.
-- =============================================================================
