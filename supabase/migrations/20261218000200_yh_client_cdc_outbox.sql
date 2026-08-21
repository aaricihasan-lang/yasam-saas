-- =============================================================================
-- 20261218000200_yh_client_cdc_outbox.sql
--
-- YAŞAM HAFIZASI™ — PRIVATE MEMORY: CLIENT CDC OUTBOX + ENQUEUE TRIGGERS
--
-- POLİTİKA KİLİDİ (kullanıcı, TUR 2):
--   md.9   INSERT→index · UPDATE→same-identity refresh · DELETE→deindex.
--   md.11  Blind backfill / historical enqueue YOK; backfill_allowed=false;
--          mevcut test danışanları hafızaya DOLDURULMAZ (future-event-first).
--   md.12  İlk cohort (6): client_sessions, client_notes, client_homeworks,
--          appointments, client_stones, client_combinations.
--   md.14  Professional Memory'den FİZİKSEL ayrı (ayrı outbox tablosu + enqueue fn).
--
-- KAPSAM:
--   1. public.yasam_hafizasi_client_outbox        → client_id TAŞIYAN ayrı CDC kuyruğu
--      (professional public.yasam_hafizasi_outbox'a DOKUNULMAZ; o client_id taşımaz).
--   2. public.yh_client_outbox_enqueue()          → generic AFTER-row enqueue trigger fn
--      (NEW/OLD.id + tenant_id + client_id yakalar; coalescing; fail-closed).
--   3. 6 cohort tablosuna trigger (danisan:*)      → yalnız GELECEK olaylar enqueue edilir.
--
-- FUTURE-EVENT-FIRST / NO BACKFILL (md.11):
--   - Coalescing UNIQUE(source_key, source_id): apply SONRASI DOKUNULAN satır enqueue olur;
--     apply öncesi var olup DEĞİŞMEYEN satır (mevcut test danışanı) OLAY ÜRETMEZ → indexlenmez.
--   - Bu migration HİÇBİR bulk backfill / mevcut veri taraması / INSERT..SELECT YAPMAZ.
--
-- DORMANT (aktivasyon AYRI kapı = BF-11E):
--   - Consumer (client worker/index builder) BU MIGRATION'DA WIRED DEĞİL → enqueue edilen
--     olaylar işlenmeden bekler. BF-11E: client worker + enabled:true + kill-switch ile
--     kontrollü tüketim (ayrı onay). Kuyruk kill-switch ile durdurulabilir.
--
-- ATOMİKLİK: AFTER trigger + outbox yazımı kaynak CRUD ile AYNI transaction (dual-write yok).
-- FAIL-CLOSED: source_id / tenant_id / client_id null, desteklenmeyen TG_OP, tablo
--   uyuşmazlığı → RAISE → kaynak CRUD ROLLBACK (sessiz geçiş YOK).
-- GÜVENLİK: SECURITY DEFINER + sabit search_path; PUBLIC/anon/authenticated EXECUTE kapalı;
--   outbox tablosu service_role-only + RLS ENABLE. Trigger dış HTTP / index yazımı / PII
--   payload snapshot YAPMAZ (yalnız id/tenant/client/operation referansı).
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY (bu turda UYGULANMAZ).
-- IDEMPOTENT: CREATE ... IF NOT EXISTS + CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- =============================================================================

BEGIN;

-- ─── 1) event_version sequence + client outbox tablosu ───────────────────────
CREATE SEQUENCE IF NOT EXISTS public.yasam_hafizasi_client_outbox_event_version_seq;

CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_client_outbox (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key    text        NOT NULL,
  source_table  text        NOT NULL,
  source_id     uuid        NOT NULL,
  tenant_id     uuid        NOT NULL,
  client_id     uuid        NOT NULL,                    -- professional outbox'ta YOK (client CDC farkı)
  operation     text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  attempts      integer     NOT NULL DEFAULT 0,
  available_at  timestamptz NOT NULL DEFAULT now(),
  event_version bigint      NOT NULL DEFAULT nextval('public.yasam_hafizasi_client_outbox_event_version_seq'),
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yhco_operation_chk CHECK (operation IN ('upsert', 'delete')),
  CONSTRAINT yhco_status_chk     CHECK (status IN ('pending', 'processing', 'succeeded', 'dead')),
  CONSTRAINT yhco_source_unit_key UNIQUE (source_key, source_id)
);

CREATE INDEX IF NOT EXISTS yhco_claimable_idx
  ON public.yasam_hafizasi_client_outbox (status, available_at);
CREATE INDEX IF NOT EXISTS yhco_tenant_client_idx
  ON public.yasam_hafizasi_client_outbox (tenant_id, client_id);

-- ─── 2) Generic client enqueue trigger function (client_id yakalar) ──────────
-- TG_ARGV[0] = source_key (registry anahtarı) · TG_ARGV[1] = beklenen source_table.
-- YALNIZ id (uuid) + tenant_id (uuid) + client_id (uuid) kolonlu tablolara bağlanabilir.
CREATE OR REPLACE FUNCTION public.yh_client_outbox_enqueue()
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
  v_client_id    uuid;
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

  -- Atomik enqueue + coalescing (latest-event-wins; event_version monotonik).
  INSERT INTO public.yasam_hafizasi_client_outbox AS o
    (source_key, source_table, source_id, tenant_id, client_id, operation)
  VALUES
    (v_source_key, TG_TABLE_NAME, v_source_id, v_tenant_id, v_client_id, v_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      client_id     = EXCLUDED.client_id,
      event_version = nextval('public.yasam_hafizasi_client_outbox_event_version_seq'),
      updated_at    = now(),
      -- PROCESSING (in-flight worker claim) KORUNUR; aksi → pending reset.
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.yh_client_outbox_enqueue() FROM PUBLIC, anon, authenticated;

-- ─── 3) Outbox tablosu kilidi: service_role-only + RLS ENABLE ────────────────
REVOKE ALL PRIVILEGES ON TABLE public.yasam_hafizasi_client_outbox FROM anon, authenticated;
ALTER TABLE public.yasam_hafizasi_client_outbox ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yasam_hafizasi_client_outbox TO service_role;
DROP POLICY IF EXISTS "service_role_yhco" ON public.yasam_hafizasi_client_outbox;
CREATE POLICY "service_role_yhco" ON public.yasam_hafizasi_client_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4) Cohort triggers (Politika Kilidi md.12; yalnız GELECEK olaylar) ──────
DROP TRIGGER IF EXISTS yh_client_outbox_combinations_trg ON public.client_combinations;
CREATE TRIGGER yh_client_outbox_combinations_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.client_combinations
  FOR EACH ROW EXECUTE FUNCTION public.yh_client_outbox_enqueue('danisan:combinations', 'client_combinations');

DROP TRIGGER IF EXISTS yh_client_outbox_stones_trg ON public.client_stones;
CREATE TRIGGER yh_client_outbox_stones_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.client_stones
  FOR EACH ROW EXECUTE FUNCTION public.yh_client_outbox_enqueue('danisan:stones', 'client_stones');

DROP TRIGGER IF EXISTS yh_client_outbox_sessions_trg ON public.client_sessions;
CREATE TRIGGER yh_client_outbox_sessions_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.client_sessions
  FOR EACH ROW EXECUTE FUNCTION public.yh_client_outbox_enqueue('danisan:sessions', 'client_sessions');

DROP TRIGGER IF EXISTS yh_client_outbox_homeworks_trg ON public.client_homeworks;
CREATE TRIGGER yh_client_outbox_homeworks_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.client_homeworks
  FOR EACH ROW EXECUTE FUNCTION public.yh_client_outbox_enqueue('danisan:homeworks', 'client_homeworks');

DROP TRIGGER IF EXISTS yh_client_outbox_appointments_trg ON public.appointments;
CREATE TRIGGER yh_client_outbox_appointments_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.yh_client_outbox_enqueue('danisan:appointments', 'appointments');

DROP TRIGGER IF EXISTS yh_client_outbox_notes_trg ON public.client_notes;
CREATE TRIGGER yh_client_outbox_notes_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.yh_client_outbox_enqueue('danisan:notes', 'client_notes');

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 6 cohort trigger'ı bağlı:
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--     WHERE NOT tgisinternal AND tgname LIKE 'yh_client_outbox_%_trg';   -- 6 satır
--   -- Fonksiyon güvenliği:
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname='yh_client_outbox_enqueue'; -- t, {search_path=...}
--   SELECT has_function_privilege('anon','public.yh_client_outbox_enqueue()','EXECUTE'); -- false
--   -- Outbox anon kapalı:
--   SELECT has_table_privilege('anon','public.yasam_hafizasi_client_outbox','SELECT');   -- false
--   -- client_* INSERT/UPDATE → outbox 'upsert' (client_id dolu); DELETE → 'delete';
--   --   aynı (source_key, source_id) → tek satır (coalesce). Mevcut/dokunulmayan satır olay üretmez.
--   -- Professional public.yasam_hafizasi_outbox DEĞİŞMEDİ.
-- =============================================================================
