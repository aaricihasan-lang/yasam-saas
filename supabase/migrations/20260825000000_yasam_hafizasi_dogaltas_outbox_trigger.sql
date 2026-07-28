-- =============================================================================
-- 20260825000000_yasam_hafizasi_dogaltas_outbox_trigger.sql
--
-- YAŞAM HAFIZASI™ — BF-11C: PİLOT DOĞALTAŞ OUTBOX ENQUEUE TRIGGER
--
-- KAPSAM (yalnız pilot trigger entegrasyonu):
--   1. public.yh_outbox_enqueue()          → generic AFTER-row enqueue trigger function
--   2. public.stones üzerinde TEK trigger    → yh_outbox_stones_enqueue_trg
--
-- BU MIGRATION:
--   - HİÇBİR kaynak tabloyu ALTER etmez (FK / yeni iş kolonu eklemez).
--   - public.stones DIŞINDA hiçbir tabloya trigger koymaz.
--   - public.yasam_hafizasi_index'e YAZMAZ; DML / seed / backfill / manuel event İÇERMEZ.
--   - BF-11A RPC (claim/complete/fail/sweep) ve BF-11B worker sözleşmelerini DEĞİŞTİRMEZ.
--
-- KİLİTLENEN PİLOT (gerçek registry + canlı tablo doğrulamasından):
--   PILOT_SOURCE_KEY   = 'dogaltas:stones'
--   PILOT_SOURCE_TABLE = 'stones'   (public.stones: id uuid PRIMARY KEY, tenant_id uuid NOT NULL)
--   → non-shared (registry'de allowSharedNull YOK; kütüphane taşları ADMIN_LIBRARY sentetik
--     tenant = NOT NULL uuid). Canlı doğrulama: 1447 satır, tenant_id IS NULL = 0.
--   → BF-11A outbox (tenant_id NOT NULL) + BF-11B worker v1 (column + non-shared + record) UYUMLU.
--
-- ATOMİKLİK: AFTER trigger + outbox yazımı kaynak CRUD ile AYNI transaction (dual-write açığı yok).
-- COALESCING: BF-11A UNIQUE(source_key, source_id) + ON CONFLICT DO UPDATE; event_version monotonik.
-- FAIL-CLOSED: source_id / tenant_id null, desteklenmeyen TG_OP, source_key / source_table
--   uyuşmazlığı → RAISE → kaynak CRUD transaction ROLLBACK (sessiz geçiş YOK).
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + schema-qualified adlar; PUBLIC/anon/authenticated
--   EXECUTE kapalı. Trigger DIŞ HTTP / Inngest / index yazımı / PII kopyası / payload snapshot YAPMAZ.
--
-- UYGULAMA: Supabase Dashboard SQL Editor (bu turda UYGULANMAZ; production'a dokunulmaz).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE TRIGGER (tekrar no-op).
-- =============================================================================

BEGIN;

-- ─── 1) Generic outbox enqueue trigger function ───────────────────────────────
-- TG_ARGV[0] = source_key (registry anahtarı) · TG_ARGV[1] = beklenen source_table.
-- YALNIZ kanonik `id` (uuid) + `tenant_id` (uuid) kolonlu tablolara bağlanabilir.
CREATE OR REPLACE FUNCTION public.yh_outbox_enqueue()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key   text := TG_ARGV[0];
  v_expect_table text := TG_ARGV[1];
  v_operation    text;
  v_source_id    uuid;
  v_tenant_id    uuid;
BEGIN
  -- Fail-closed argüman doğrulaması.
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_outbox_enqueue: source_key argumani eksik';
  END IF;
  IF v_expect_table IS NULL OR length(btrim(v_expect_table)) = 0 THEN
    RAISE EXCEPTION 'yh_outbox_enqueue: expected source_table argumani eksik';
  END IF;
  -- Trigger yalnız beklenen schema + tabloda çalışmalı (yanlış bağlanmaya karşı savunma).
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'yh_outbox_enqueue: beklenmeyen schema % (public bekleniyor)', TG_TABLE_SCHEMA;
  END IF;
  IF TG_TABLE_NAME IS DISTINCT FROM v_expect_table THEN
    RAISE EXCEPTION 'yh_outbox_enqueue: source_table uyusmazligi (% <> %)', TG_TABLE_NAME, v_expect_table;
  END IF;

  -- Operation + kanonik id + tenant (INSERT/UPDATE → NEW, DELETE → OLD).
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert';
    v_source_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete';
    v_source_id := OLD.id;         -- OLD korunur (kaynak satır artık yok)
    v_tenant_id := OLD.tenant_id;  -- OLD tenant korunur
  ELSE
    RAISE EXCEPTION 'yh_outbox_enqueue: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- Fail-closed: geçerli source_id + tenant_id zorunlu (null → kaynak CRUD ROLLBACK).
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_outbox_enqueue: source_id null (%, %)', v_expect_table, v_source_key;
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_outbox_enqueue: tenant_id null (%, %)', v_expect_table, v_source_key;
  END IF;

  -- Atomik enqueue + coalescing (BF-11A UNIQUE(source_key, source_id)).
  -- Yeni satır default'ları: status='pending', attempts=0, available_at=now(),
  --   event_version=nextval(seq), created_at/updated_at=now(), lock/last_error/processed_at=NULL.
  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (v_source_key, TG_TABLE_NAME, v_source_id, v_tenant_id, v_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET -- Yeni olayın KANITI her durumda güncellenir (event_version monotonik artar).
      operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      -- PROCESSING (in-flight worker claim/lease) KORUNUR → BF-11A stale-event sözleşmesi
      -- bozulmaz: complete/fail RPC'si status=processing + locked_by=worker ön koşullarını
      -- geçerli bulur ve claimed_version < current event_version → requeued_newer_event üretir.
      -- Aksi (pending / succeeded / dead) → normal yeniden kuyruğa alma (tam reset).
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  -- AFTER trigger: dönüş yok sayılır; yanlışlıkla BEFORE kullanımında güvenli passthrough.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 2) Fonksiyon EXECUTE kilidi (defense-in-depth) ───────────────────────────
-- Trigger mekanizması EXECUTE yetkisi gerektirmez; doğrudan çağrı yüzeyi kapatılır.
REVOKE ALL ON FUNCTION public.yh_outbox_enqueue() FROM PUBLIC, anon, authenticated;

-- ─── 3) Pilot trigger: YALNIZ public.stones (dogaltas:stones) ──────────────────
DROP TRIGGER IF EXISTS yh_outbox_stones_enqueue_trg ON public.stones;
CREATE TRIGGER yh_outbox_stones_enqueue_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.stones
  FOR EACH ROW
  EXECUTE FUNCTION public.yh_outbox_enqueue('dogaltas:stones', 'stones');

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Pilot trigger yalnız stones'ta:
--   SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.stones'::regclass AND NOT tgisinternal;   -- yh_outbox_stones_enqueue_trg
--   -- 2) Fonksiyon güvenliği:
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'yh_outbox_enqueue'; -- t, {search_path=...}
--   SELECT has_function_privilege('anon','public.yh_outbox_enqueue()','EXECUTE');  -- false
--   -- 3) stones INSERT/UPDATE → outbox 'upsert'; DELETE → outbox 'delete';
--   --    aynı (source_key, source_id) → tek satır (coalesce), event_version her olayda artar.
--   -- 4) Bu migration stones DIŞINDA hiçbir tabloya trigger koymaz; index'e yazmaz.
-- =============================================================================
