-- =============================================================================
-- 20260901000000_yasam_hafizasi_reconcile_enqueue.sql
--
-- YAŞAM HAFIZASI™ — BF-11D6: CONTROLLED RECONCILIATION ENQUEUE RPC
--
-- KAPSAM (yalnız additive, tek fail-closed enqueue RPC):
--   1. public.yh_outbox_reconcile_enqueue(text,text,uuid,uuid,text)
--      → dogaltas:stones pilot için TEK-RECORD güvenli UPSERT outbox enqueue.
--   2. EXECUTE kilidi: PUBLIC/anon/authenticated REVOKE + service_role GRANT.
--
-- BU MIGRATION:
--   - HİÇBİR mevcut tabloyu/trigger'ı/migration'ı ALTER veya CREATE OR REPLACE ETMEZ
--     (BF-11A outbox, BF-11B worker, BF-11C trigger DEĞİŞMEZ).
--   - public.yasam_hafizasi_index'e YAZMAZ / deindex YAPMAZ.
--   - DELETE / deindex / orphan cleanup / duplicate / tenant-mismatch / invariant
--     apply DESTEKLEMEZ (yalnız upsert). Diğer source YOK.
--   - Dynamic SQL / arbitrary table / generic relation lookup YOK.
--   - PII okumaz/döndürmez; payload/content snapshot tutmaz.
--
-- SÖZLEŞME PARİTESİ: enqueue INSERT ... ON CONFLICT bloğu BF-11C trigger
--   (20260825000000 yh_outbox_enqueue) semantiğiyle BİREBİR: coalescing
--   UNIQUE(source_key, source_id), event_version monotonik nextval, PROCESSING
--   (in-flight worker claim/lease) KORUNUR; aksi (pending/succeeded/dead) tam reset.
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + schema-qualified adlar;
--   PUBLIC/anon/authenticated EXECUTE kapalı; yalnız service_role. Fail-closed:
--   allowlist dışı source_key/table/operation, null id/tenant, demo/sentetik tenant,
--   inaktif/yok tenant, stones id+tenant eşleşmesizliği, mevcut outbox identity
--   mismatch → RAISE (transaction ROLLBACK; sessiz geçiş/overwrite YOK).
--
-- UYGULAMA: Supabase Dashboard SQL Editor (bu turda UYGULANMAZ; production'a dokunulmaz).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + REVOKE/GRANT (tekrar no-op).
-- =============================================================================

BEGIN;

-- ─── 1) Controlled reconciliation enqueue (tek-record; yalnız dogaltas:stones upsert) ─
CREATE OR REPLACE FUNCTION public.yh_outbox_reconcile_enqueue(
  p_source_key   text,
  p_source_table text,
  p_source_id    uuid,
  p_tenant_id    uuid,
  p_operation    text
)
RETURNS TABLE (
  id            uuid,
  source_key    text,
  source_id     uuid,
  tenant_id     uuid,
  operation     text,
  status        text,
  event_version bigint,
  outcome       text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  -- Kanonik (sentetik/demo) tenant kimlikleri — lib/tenancy/syntheticTenants.ts +
  -- lib/yasam-hafizasi/config.ts ile birebir; başka yerde yeniden tanımlanmaz.
  c_demo_tenant  constant uuid := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_synth_tenant constant uuid := 'aa8b960b-f4f1-4e5b-89f5-109bc030c147';

  v_existing      public.yasam_hafizasi_outbox%ROWTYPE;
  v_had_existing  boolean := false;
  v_prev_status   text;
  v_tenant_status text;
  v_row           public.yasam_hafizasi_outbox%ROWTYPE;
  v_outcome       text;
BEGIN
  -- ── A) Pilot allowlist + parametre (fail-closed) ─────────────────────────────
  IF p_source_key IS DISTINCT FROM 'dogaltas:stones' THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: source_key allowlist disi';
  END IF;
  IF p_source_table IS DISTINCT FROM 'stones' THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: source_table allowlist disi';
  END IF;
  IF p_operation IS DISTINCT FROM 'upsert' THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: operation yalniz upsert';
  END IF;
  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: source_id null';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: tenant_id null';
  END IF;

  -- ── C) Kanonik tenant reddi (demo/sentetik) ──────────────────────────────────
  IF p_tenant_id = c_demo_tenant THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: demo tenant reddedildi';
  END IF;
  IF p_tenant_id = c_synth_tenant THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: sentetik tenant reddedildi';
  END IF;

  -- ── C) Tenant mevcut + aktif (PII okumadan; yalnız tenants.id/status) ─────────
  SELECT lower(btrim(t.status::text)) INTO v_tenant_status
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: tenant bulunamadi';
  END IF;
  IF v_tenant_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: tenant aktif degil';
  END IF;

  -- ── D) Kaynak exact eşleşme: stones.id = source_id AND stones.tenant_id = tenant_id
  --      (yanlış tenant altındaki aynı id kabul EDİLMEZ; kaynak yoksa kabul EDİLMEZ) ─
  PERFORM 1 FROM public.stones AS s
    WHERE s.id = p_source_id AND s.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: stones id+tenant eslesmesi yok';
  END IF;

  -- ── E) Mevcut outbox identity mismatch koruması (sessiz overwrite YASAK) ──────
  -- UNIQUE(source_key, source_id) tenant/table içermez → gelen source_table/tenant_id
  -- mevcut satırla birebir aynı DEĞİLSE ON CONFLICT overwrite yerine RAISE.
  SELECT * INTO v_existing FROM public.yasam_hafizasi_outbox AS o
    WHERE o.source_key = p_source_key AND o.source_id = p_source_id
    FOR UPDATE;
  IF FOUND THEN
    v_had_existing := true;
    v_prev_status  := v_existing.status;
    IF v_existing.source_table IS DISTINCT FROM p_source_table
       OR v_existing.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: outbox identity mismatch (overwrite yasak)';
    END IF;
  END IF;

  -- ── F) Atomik enqueue + coalescing (BF-11C trigger semantiği ile PARİTE) ──────
  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (p_source_key, p_source_table, p_source_id, p_tenant_id, 'upsert')
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      -- PROCESSING (in-flight worker lease) KORUNUR → BF-11A stale-event sözleşmesi
      -- bozulmaz. Aksi (pending/succeeded/dead) → tam reset (pending, attempts=0).
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END
  RETURNING * INTO v_row;

  -- ── Outcome sınıflandırması (yalnız güvenli teknik metadata) ─────────────────
  IF NOT v_had_existing THEN
    v_outcome := 'inserted';
  ELSIF v_prev_status = 'processing' THEN
    v_outcome := 'preserved_processing';
  ELSE
    v_outcome := 'coalesced_pending';
  END IF;

  RETURN QUERY
    SELECT v_row.id, v_row.source_key, v_row.source_id, v_row.tenant_id,
           v_row.operation, v_row.status, v_row.event_version, v_outcome;
END;
$$;

-- ─── 2) EXECUTE kilidi (least privilege): yalnız service_role ──────────────────
REVOKE ALL ON FUNCTION public.yh_outbox_reconcile_enqueue(text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_reconcile_enqueue(text, text, uuid, uuid, text)
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Fonksiyon güvenliği:
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'yh_outbox_reconcile_enqueue'; -- t, {search_path=...}
--   SELECT has_function_privilege('anon',
--     'public.yh_outbox_reconcile_enqueue(text,text,uuid,uuid,text)','EXECUTE');  -- false
--   -- 2) Allowlist dışı source_key/table/operation → RAISE.
--   -- 3) demo/sentetik tenant → RAISE; inaktif/yok tenant → RAISE.
--   -- 4) stones id+tenant eşleşmesi yok → RAISE; başka tenant altındaki id → RAISE.
--   -- 5) mevcut outbox (source_key,source_id) farklı source_table/tenant → RAISE (overwrite yok).
--   -- 6) upsert enqueue → coalescing UNIQUE(source_key,source_id), event_version artar,
--   --    processing satır KORUNUR (status/lock/attempts değişmez), aksi → pending reset.
--   -- 7) Bu migration index'e YAZMAZ, trigger/BF-11A/BF-11B'yi DEĞİŞTİRMEZ.
-- =============================================================================
