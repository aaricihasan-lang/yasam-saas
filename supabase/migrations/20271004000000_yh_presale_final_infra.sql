-- =============================================================================
-- YAŞAM HAFIZASI™ — SATIŞ ÖNCESİ NİHAİ ALTYAPI (M1, ADD-ONLY)
-- =============================================================================
--
-- AMAÇ (2026-10-03 kök neden raporu):
--   1) Outbox iş sonucu görünürlüğü: `last_outcome` (+ client outbox). `succeeded` tek başına
--      "worker bitirdi" demektir; indexed / deindexed / dışlandı ayrımı artık kalıcı yazılır.
--   2) Historical REPLAY: aktivasyon öncesi oluşmuş (hiç olay üretmemiş) kayıtlar ve kaçan
--      silmeler için mevcut worker zincirinden geçen, tenant + kaynak bazlı, idempotent,
--      kaldığı yerden devam eden yeniden kuyruklama. Index'e DOĞRUDAN yazılmaz.
--      Replay satırları `replay=true` işaretlenir → webhook Inngest olayı GÖNDERMEZ (kota);
--      kontrollü drain (admin route) boşaltır.
--   3) Arama doğruluğu: modül izni / istenen modül / tarih filtreleri LIMIT'ten ÖNCE (v2 RPC).
--      v1 RPC'ler DEĞİŞMEZ (geriye uyum).
--   4) Ortak/merkezî kütüphane YOK: NULL tenant'lı (eski canonical) satırlar outbox'a
--      enqueue EDİLMEZ (shared-optional / reference-row / sheet-capture trigger fonksiyonları).
--   5) Owner tenant'ı (aa8b960b…) gerçek uzman tenant'ıdır → reconcile enqueue'daki
--      "sentetik tenant reddi" kaldırılır.
--
-- UYUMLULUK: Eski production koduyla çalışır (v1 complete/search değişmez; yeni kolonlar
--   default'lu; replay yalnız yeni admin route'u ile tetiklenir). Kaynak (asıl) veriye
--   DOKUNMAZ; index'e YAZMAZ.
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- =============================================================================

BEGIN;

-- ─── 0) Ön koşullar ───────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN
    RAISE EXCEPTION 'M1 BLOCKER: public.yasam_hafizasi_outbox yok';
  END IF;
  IF to_regclass('public.yasam_hafizasi_client_outbox') IS NULL THEN
    RAISE EXCEPTION 'M1 BLOCKER: public.yasam_hafizasi_client_outbox yok';
  END IF;
  IF to_regclass('public.yasam_hafizasi_index') IS NULL OR to_regclass('public.yasam_hafizasi_client_index') IS NULL THEN
    RAISE EXCEPTION 'M1 BLOCKER: YH index tablolari yok';
  END IF;
  IF to_regclass('public.yh_source_activation') IS NULL THEN
    RAISE EXCEPTION 'M1 BLOCKER: public.yh_source_activation yok';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'yasam_hafizasi_outbox' AND column_name = 'tenant_scope') THEN
    RAISE EXCEPTION 'M1 BLOCKER: outbox tenant_scope kolonu yok (20261210000000 uygulanmamis)';
  END IF;
END
$pre$;

-- ─── 1) Outbox sonuç + replay kolonları ───────────────────────────────────────
ALTER TABLE public.yasam_hafizasi_outbox
  ADD COLUMN IF NOT EXISTS last_outcome text,
  ADD COLUMN IF NOT EXISTS replay boolean NOT NULL DEFAULT false;
ALTER TABLE public.yasam_hafizasi_client_outbox
  ADD COLUMN IF NOT EXISTS last_outcome text;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'yho_last_outcome_len_chk') THEN
    ALTER TABLE public.yasam_hafizasi_outbox
      ADD CONSTRAINT yho_last_outcome_len_chk CHECK (last_outcome IS NULL OR char_length(last_outcome) <= 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'yhco_last_outcome_len_chk') THEN
    ALTER TABLE public.yasam_hafizasi_client_outbox
      ADD CONSTRAINT yhco_last_outcome_len_chk CHECK (last_outcome IS NULL OR char_length(last_outcome) <= 64);
  END IF;
END
$c$;

CREATE INDEX IF NOT EXISTS yho_outcome_inspect_idx
  ON public.yasam_hafizasi_outbox (source_key, tenant_id, last_outcome)
  WHERE status = 'succeeded';

-- ─── 2) Outbox satır işaretleyici (BEFORE INSERT/UPDATE) ──────────────────────
-- Tek nokta: (a) `replay` bayrağı yalnız YENİ olay (INSERT veya event_version artışı) anında,
-- transaction-yerel `yh.replay` GUC'una göre belirlenir → gerçek CDC olayı (GUC yok) her zaman
-- replay=false olur ve webhook'u tetikler; replay RPC'si (GUC 'on') replay=true yazar.
-- Worker durum geçişleri (sürüm değişmez) bayrağı KORUR. (b) last_outcome yalnız
-- status='succeeded' iken anlamlıdır; diğer her durumda NULL'a çekilir.
CREATE OR REPLACE FUNCTION public.yh_outbox_row_marker()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.event_version IS DISTINCT FROM OLD.event_version THEN
    NEW.replay := coalesce(current_setting('yh.replay', true), '') = 'on';
  ELSE
    NEW.replay := OLD.replay;
  END IF;
  IF NEW.status IS DISTINCT FROM 'succeeded' THEN
    NEW.last_outcome := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_outbox_row_marker() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS yh_outbox_row_marker_trg ON public.yasam_hafizasi_outbox;
CREATE TRIGGER yh_outbox_row_marker_trg
  BEFORE INSERT OR UPDATE ON public.yasam_hafizasi_outbox
  FOR EACH ROW EXECUTE FUNCTION public.yh_outbox_row_marker();

CREATE OR REPLACE FUNCTION public.yh_client_outbox_row_marker()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'succeeded' THEN
    NEW.last_outcome := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_client_outbox_row_marker() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS yh_client_outbox_row_marker_trg ON public.yasam_hafizasi_client_outbox;
CREATE TRIGGER yh_client_outbox_row_marker_trg
  BEFORE INSERT OR UPDATE ON public.yasam_hafizasi_client_outbox
  FOR EACH ROW EXECUTE FUNCTION public.yh_client_outbox_row_marker();

-- ─── 3) complete v2 (iş sonucu ile) — v1 imzaları DEĞİŞMEZ ────────────────────
-- Durum makinesi v1 ile BİREBİR; tek fark succeeded dalında last_outcome yazılması (tek UPDATE).
CREATE OR REPLACE FUNCTION public.yh_outbox_complete_v2(
  p_id              uuid,
  p_worker          text,
  p_claimed_version bigint,
  p_outcome         text
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
    RAISE EXCEPTION 'yh_outbox_complete_v2: p_id null';
  END IF;
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_outbox_complete_v2: p_worker bos';
  END IF;
  IF p_claimed_version IS NULL OR p_claimed_version <= 0 THEN
    RAISE EXCEPTION 'yh_outbox_complete_v2: p_claimed_version gecersiz';
  END IF;
  IF p_outcome IS NOT NULL AND (char_length(p_outcome) > 64 OR p_outcome !~ '^[a-z][a-z-]*$') THEN
    RAISE EXCEPTION 'yh_outbox_complete_v2: p_outcome gecersiz';
  END IF;

  SELECT * INTO v_row FROM public.yasam_hafizasi_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_complete_v2: olay bulunamadi';
  END IF;
  IF v_row.status <> 'processing' THEN
    RAISE EXCEPTION 'yh_outbox_complete_v2: olay processing degil (%)', v_row.status;
  END IF;
  IF v_row.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION 'yh_outbox_complete_v2: lock sahibi uyusmazligi';
  END IF;
  IF p_claimed_version > v_row.event_version THEN
    RAISE EXCEPTION 'yh_outbox_complete_v2: claimed_version current ustunde (imkansiz)';
  END IF;

  IF p_claimed_version = v_row.event_version THEN
    UPDATE public.yasam_hafizasi_outbox
    SET status = 'succeeded', processed_at = now(),
        locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = now(),
        last_outcome = p_outcome
    WHERE id = p_id;
    RETURN 'succeeded';
  ELSE
    UPDATE public.yasam_hafizasi_outbox
    SET status = 'pending', available_at = now(),
        processed_at = NULL, locked_at = NULL, locked_by = NULL, updated_at = now()
    WHERE id = p_id;
    RETURN 'requeued_newer_event';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_outbox_complete_v2(uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_complete_v2(uuid, text, bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.yh_client_outbox_complete_v2(
  p_id              uuid,
  p_worker          text,
  p_claimed_version bigint,
  p_outcome         text
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
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: p_id null';
  END IF;
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: p_worker bos';
  END IF;
  IF p_claimed_version IS NULL OR p_claimed_version <= 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: p_claimed_version gecersiz';
  END IF;
  IF p_outcome IS NOT NULL AND (char_length(p_outcome) > 64 OR p_outcome !~ '^[a-z][a-z-]*$') THEN
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: p_outcome gecersiz';
  END IF;

  SELECT * INTO v_row FROM public.yasam_hafizasi_client_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: olay bulunamadi';
  END IF;
  IF v_row.status <> 'processing' THEN
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: olay processing degil (%)', v_row.status;
  END IF;
  IF v_row.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: lock sahibi uyusmazligi';
  END IF;
  IF p_claimed_version > v_row.event_version THEN
    RAISE EXCEPTION 'yh_client_outbox_complete_v2: claimed_version current ustunde (imkansiz)';
  END IF;

  IF p_claimed_version = v_row.event_version THEN
    UPDATE public.yasam_hafizasi_client_outbox
    SET status = 'succeeded', processed_at = now(),
        locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = now(),
        last_outcome = p_outcome
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
REVOKE ALL ON FUNCTION public.yh_client_outbox_complete_v2(uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_client_outbox_complete_v2(uuid, text, bigint, text) TO service_role;

-- ─── 4) NULL tenant (eski ortak/canonical) satırlar ENQUEUE EDİLMEZ ───────────
-- Ortak/merkezî mesleki kütüphane ürün modeli YOK. Tenant → NULL'a dönen satırın eski tenant
-- index'i DELETE olayıyla temizlenir (OLD tenant ile); NULL satır hiçbir zaman shared yazılmaz.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_shared_optional_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key   text := TG_ARGV[0];
  v_expect_table text := TG_ARGV[1];
BEGIN
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional_v2: source_key argumani eksik';
  END IF;
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM v_expect_table THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional_v2: tablo uyusmazligi (%.% <> %)', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_expect_table;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS NOT NULL THEN
      PERFORM public.yh_outbox_put_v2(v_source_key, TG_TABLE_NAME, OLD.id, OLD.tenant_id, 'tenant', 'delete');
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS NOT NULL THEN
      PERFORM public.yh_outbox_put_v2(v_source_key, TG_TABLE_NAME, NEW.id, NEW.tenant_id, 'tenant', 'upsert');
    ELSIF TG_OP = 'UPDATE' AND OLD.tenant_id IS NOT NULL THEN
      -- tenant → NULL: eski tenant'ın index satırı silinir; NULL satır indexlenmez.
      PERFORM public.yh_outbox_put_v2(v_source_key, TG_TABLE_NAME, NEW.id, OLD.tenant_id, 'tenant', 'delete');
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional_v2: desteklenmeyen TG_OP %', TG_OP;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_shared_optional_v2() FROM PUBLIC, anon, authenticated;

-- reference-rows: tenant parent sheet'ten; parent NULL tenant → enqueue YOK. Null-sentinel fix
-- (20261212000000) davranışı korunur: parent yoksa (cascade) SKIP — parent-side capture ele alır.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_reference_row_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key text := 'aromaterapi:reference-rows';
  v_operation  text;
  v_source_id  uuid;
  v_sheet_id   uuid;
  v_tenant_id  uuid;
  v_found      boolean := false;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'aromatherapy_reference_rows' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_reference_row_v2: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert'; v_source_id := NEW.id; v_sheet_id := NEW.sheet_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete'; v_source_id := OLD.id; v_sheet_id := OLD.sheet_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_reference_row_v2: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  IF v_sheet_id IS NOT NULL THEN
    SELECT s.tenant_id INTO v_tenant_id
    FROM public.aromatherapy_reference_sheets AS s WHERE s.id = v_sheet_id;
    v_found := FOUND;
  END IF;

  IF v_found AND v_tenant_id IS NOT NULL THEN
    PERFORM public.yh_outbox_put_v2(v_source_key, 'aromatherapy_reference_rows', v_source_id, v_tenant_id, 'tenant', v_operation);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_reference_row_v2() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.yh_capture_reference_sheet_children()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_child_key    text := 'aromaterapi:reference-rows';
  v_active       boolean;
  v_op           text;
  v_tenant_id    uuid;
  v_sheet_id     uuid;
  v_child        record;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'aromatherapy_reference_sheets' THEN
    RAISE EXCEPTION 'yh_capture_reference_sheet_children: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = v_child_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_op := 'delete'; v_tenant_id := OLD.tenant_id; v_sheet_id := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
      RETURN NEW;
    END IF;
    v_sheet_id := NEW.id;
    IF NEW.tenant_id IS NOT NULL THEN
      v_op := 'upsert'; v_tenant_id := NEW.tenant_id;
    ELSE
      -- tenant → NULL: eski tenant altındaki child index satırları silinir.
      v_op := 'delete'; v_tenant_id := OLD.tenant_id;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_tenant_id IS NOT NULL THEN
    FOR v_child IN
      SELECT r.id FROM public.aromatherapy_reference_rows AS r WHERE r.sheet_id = v_sheet_id
    LOOP
      PERFORM public.yh_outbox_put_v2(v_child_key, 'aromatherapy_reference_rows', v_child.id, v_tenant_id, 'tenant', v_op);
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_capture_reference_sheet_children() FROM PUBLIC, anon, authenticated;

-- ─── 5) Reconcile enqueue — owner tenant artık sentetik DEĞİL ─────────────────
-- 20260901000000 gövdesiyle BİREBİR; yalnız sabit "sentetik tenant reddi" (aa8b960b…) kaldırıldı
-- (owner'ın gerçek uzman tenant'ı). Demo reddi + tenant aktif + stones exact eşleşme korunur.
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
  c_demo_tenant  constant uuid := '40f842a0-e3e8-448c-8971-9a938e1faccb';

  v_existing      public.yasam_hafizasi_outbox%ROWTYPE;
  v_had_existing  boolean := false;
  v_prev_status   text;
  v_tenant_status text;
  v_row           public.yasam_hafizasi_outbox%ROWTYPE;
  v_outcome       text;
BEGIN
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

  IF p_tenant_id = c_demo_tenant THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: demo tenant reddedildi';
  END IF;

  SELECT lower(btrim(t.status::text)) INTO v_tenant_status
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: tenant bulunamadi';
  END IF;
  IF v_tenant_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: tenant aktif degil';
  END IF;

  PERFORM 1 FROM public.stones AS s
    WHERE s.id = p_source_id AND s.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_reconcile_enqueue: stones id+tenant eslesmesi yok';
  END IF;

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
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END
  RETURNING * INTO v_row;

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
REVOKE ALL ON FUNCTION public.yh_outbox_reconcile_enqueue(text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_reconcile_enqueue(text, text, uuid, uuid, text)
  TO service_role;

-- ─── 6) REPLAY — sabit kaynak spesifikasyonu ──────────────────────────────────
-- SQL INJECTION YÜZEYİ YOK: tablo/kolon/koşul parçaları YALNIZ bu fonksiyondaki SABİT CASE
-- dallarından gelir; kullanıcı girdisi (p_source_key) yalnız dal SEÇER, SQL metnine girmez.
-- Bilinmeyen anahtar → NULL (çağıran RAISE). Kapsam: hedef MESLEKİ kaynaklar (Numeroloji /
-- Human Design / Kozmik / YEBS / danışan kaynakları YOK).
--   from_sql   : `public.<tablo> AS s` (+ gerekirse parent `AS p` join)
--   tenant_sql : satırın sahibi tenant ifadesi
--   elig_sql   : ucuz SQL uygunluk ön-filtresi (worker kapılarının aynası; nihai karar worker'da)
--   always_on  : KEEP_LIVE (aktivasyon satırı gerektirmez — dogaltas:stones)
CREATE OR REPLACE FUNCTION public.yh_replay_source_spec(p_source_key text)
RETURNS TABLE (source_table text, from_sql text, tenant_sql text, elig_sql text, always_on boolean)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT v.source_table, v.from_sql, v.tenant_sql, v.elig_sql, v.always_on FROM (VALUES
    ('dogaltas:stones',               'stones',                         'public.stones AS s',                         's.tenant_id', 'true', true),
    ('dogaltas:minerals',             'minerals',                       'public.minerals AS s',                       's.tenant_id', 'true', false),
    ('dogaltas:knowledge',            'stone_knowledge_articles',       'public.stone_knowledge_articles AS s',       's.tenant_id', 's.is_active = true', false),
    ('dogaltas:combinations',         'combinations',                   'public.combinations AS s',                   's.tenant_id', 'true', false),
    ('refleksoloji:protocols',        'reflexology_protocols',          'public.reflexology_protocols AS s',          's.tenant_id', 'true', false),
    ('sifa_rehberi:guides',           'healing_guides',                 'public.healing_guides AS s',                 's.tenant_id', 'true', false),
    ('sifa_rehberi:guide-sections',   'healing_guide_sections',         'public.healing_guide_sections AS s JOIN public.healing_guides AS p ON p.id = s.guide_id', 'p.tenant_id', 'true', false),
    ('biyoenerji:subconscious-causes','bioenergy_subconscious_causes',  'public.bioenergy_subconscious_causes AS s',  's.tenant_id', 'true', false),
    ('biyoenerji:symbols',            'bioenergy_symbols',              'public.bioenergy_symbols AS s',              's.tenant_id', 'true', false),
    ('biyoenerji:chakras',            'bioenergy_chakras',              'public.bioenergy_chakras AS s',              's.tenant_id', 'true', false),
    ('biyoenerji:imaginations',       'bioenergy_imaginations',         'public.bioenergy_imaginations AS s',         's.tenant_id', 'true', false),
    ('biyoenerji:sessions',           'bioenergy_sessions',             'public.bioenergy_sessions AS s',             's.tenant_id', 'true', false),
    ('biyoenerji:energy-bodies',      'bioenergy_energy_bodies',        'public.bioenergy_energy_bodies AS s',        's.tenant_id', 'true', false),
    ('biyoenerji:chakra-blocks',      'bioenergy_chakra_blocks',        'public.bioenergy_chakra_blocks AS s',        's.tenant_id', 's.block_type IS DISTINCT FROM ''source-evidence''', false),
    ('aromaterapi:oils',              'aromatherapy_oils',              'public.aromatherapy_oils AS s',              's.tenant_id', 's.is_active = true', false),
    ('aromaterapi:reference-sheets',  'aromatherapy_reference_sheets',  'public.aromatherapy_reference_sheets AS s',  's.tenant_id', 's.is_active = true', false),
    ('aromaterapi:reference-rows',    'aromatherapy_reference_rows',    'public.aromatherapy_reference_rows AS s JOIN public.aromatherapy_reference_sheets AS p ON p.id = s.sheet_id', 'p.tenant_id', 'p.is_active = true AND s.is_header IS DISTINCT FROM true', false),
    ('aromaterapi:blends',            'aromatherapy_blends',            'public.aromatherapy_blends AS s',            's.tenant_id', 's.is_active = true', false),
    ('aromaterapi:plant-taxa',        'aromatherapy_plant_taxa',        'public.aromatherapy_plant_taxa AS s',        's.tenant_id', 's.status IN (''verified'', ''approved'')', false),
    ('aromaterapi:preparations',      'aromatherapy_preparations',      'public.aromatherapy_preparations AS s',      's.tenant_id', 's.status IN (''verified'', ''approved'')', false),
    ('aromaterapi:method',            'aromatherapy_preparation_method_series', 'public.aromatherapy_preparation_method_series AS s', 's.tenant_id', 'EXISTS (SELECT 1 FROM public.aromatherapy_preparation_method_revisions AS r WHERE r.series_id = s.id AND r.status = ''verified'')', false),
    ('kupa_hacamat:knowledge',        'cupping_knowledge_records',      'public.cupping_knowledge_records AS s',      's.tenant_id', 's.is_active = true', false),
    ('kupa_hacamat:points',           'cupping_points',                 'public.cupping_points AS s',                 's.tenant_id', 's.is_active = true', false),
    ('kupa_hacamat:topics',           'cupping_topics',                 'public.cupping_topics AS s',                 's.tenant_id', 's.is_active = true', false),
    ('kupa_hacamat:techniques',       'cupping_techniques',             'public.cupping_techniques AS s',             's.tenant_id', 's.is_active = true', false),
    ('kupa_hacamat:safety-notes',     'cupping_safety_notes',           'public.cupping_safety_notes AS s',           's.tenant_id', 's.is_active = true', false),
    ('kisisel_arsiv:archives',        'personal_archives',              'public.personal_archives AS s',              's.tenant_id', 'EXISTS (SELECT 1 FROM public.yh_archive_classifications AS c WHERE c.archive_id = s.id AND c.tenant_id = s.tenant_id AND c.classification = ''safe-non-pii'')', false),
    ('beslenme:foods',                'nutrition_foods',                'public.nutrition_foods AS s',                's.tenant_id', 's.is_active IS DISTINCT FROM false AND s.tenant_id <> ''00000000-0000-4000-8000-000000000001''::uuid', false),
    ('beslenme:topics',               'nutrition_topics',               'public.nutrition_topics AS s',               's.tenant_id', 's.is_active IS DISTINCT FROM false AND s.tenant_id <> ''00000000-0000-4000-8000-000000000001''::uuid', false),
    ('beslenme:templates',            'nutrition_templates',            'public.nutrition_templates AS s',            's.tenant_id', 's.is_active IS DISTINCT FROM false AND s.tenant_id <> ''00000000-0000-4000-8000-000000000001''::uuid', false)
  ) AS v(source_key, source_table, from_sql, tenant_sql, elig_sql, always_on)
  WHERE v.source_key = p_source_key;
$$;
REVOKE ALL ON FUNCTION public.yh_replay_source_spec(text) FROM PUBLIC, anon, authenticated;

-- Replay hedefi olabilecek GERÇEK tenant: en az bir aktif, demo olmayan, expert VEYA admin
-- kullanıcısı bağlı. Kullanıcısız legacy tenant'lar (ör. 11111111-…) ve demo tenant REDDEDİLİR.
CREATE OR REPLACE FUNCTION public.yh_replay_tenant_valid(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p_tenant_id IS NOT NULL
     AND p_tenant_id <> '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid
     AND EXISTS (
       SELECT 1 FROM public.users AS u
       WHERE u.tenant_id::text = p_tenant_id::text
         AND u.active = true
         AND coalesce(u.is_demo_account, false) = false
         AND lower(btrim(coalesce(u.role, ''))) IN ('expert', 'admin')
     );
$$;
REVOKE ALL ON FUNCTION public.yh_replay_tenant_valid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_replay_tenant_valid(uuid) TO service_role;

-- ─── 7) REPLAY ENQUEUE ────────────────────────────────────────────────────────
-- Modlar:
--   'missing' : uygun (elig) kaynak satırı olup bu tenant için index satırı OLMAYANLAR (hedefli).
--   'all'     : uygun tüm kaynak satırları (owner kapsamlı replay).
--   'orphans' : bu tenant'ın index satırları arasında kaynağı artık OLMAYAN / uygunluğu kalmayan
--               kayıtlar → worker exact read not-found/ineligible → deindex (hayalet temizliği).
-- Hepsi `upsert` olayıdır (worker kaynağın GÜNCEL durumuna bakar; silinmişse deindex eder).
-- İdempotent: UNIQUE(source_key, source_id) coalescing; aynı batch iki kez → yeni satır üretmez.
-- Cursor: id artan (p_after_id); dönen last_id ile devam edilir. done = son sayfa.
CREATE OR REPLACE FUNCTION public.yh_outbox_replay_enqueue(
  p_source_key text,
  p_tenant_id  uuid,
  p_mode       text,
  p_limit      integer,
  p_after_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_spec     record;
  v_active   boolean;
  v_limit    integer;
  v_after    uuid := coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_sql      text;
  v_ids      uuid[];
  v_id       uuid;
  v_count    integer := 0;
BEGIN
  SELECT * INTO v_spec FROM public.yh_replay_source_spec(p_source_key);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_outbox_replay_enqueue: kaynak allowlist disi';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('missing', 'all', 'orphans') THEN
    RAISE EXCEPTION 'yh_outbox_replay_enqueue: gecersiz mod';
  END IF;
  IF NOT public.yh_replay_tenant_valid(p_tenant_id) THEN
    RAISE EXCEPTION 'yh_outbox_replay_enqueue: tenant gecersiz (null/demo/kullanicisiz/pasif)';
  END IF;
  IF NOT v_spec.always_on THEN
    SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = p_source_key;
    IF v_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'yh_outbox_replay_enqueue: kaynak aktif degil';
    END IF;
  END IF;
  v_limit := least(greatest(coalesce(p_limit, 200), 1), 500);

  IF p_mode = 'orphans' THEN
    v_sql := format(
      'SELECT array_agg(x.source_id ORDER BY x.source_id) FROM ('
      || 'SELECT DISTINCT i.source_id FROM public.yasam_hafizasi_index AS i '
      || 'WHERE i.tenant_id = $1 AND i.source_table = %L AND i.source_id > $2 '
      || 'AND NOT EXISTS (SELECT 1 FROM %s WHERE s.id = i.source_id AND (%s)::text = $1::text AND (%s)) '
      || 'ORDER BY i.source_id LIMIT $3) AS x',
      v_spec.source_table, v_spec.from_sql, v_spec.tenant_sql, v_spec.elig_sql);
  ELSE
    v_sql := format(
      'SELECT array_agg(x.id ORDER BY x.id) FROM ('
      || 'SELECT s.id FROM %s WHERE (%s)::text = $1::text AND (%s) AND s.id > $2 %s '
      || 'ORDER BY s.id LIMIT $3) AS x',
      v_spec.from_sql, v_spec.tenant_sql, v_spec.elig_sql,
      CASE WHEN p_mode = 'missing' THEN format(
        'AND NOT EXISTS (SELECT 1 FROM public.yasam_hafizasi_index AS i WHERE i.source_table = %L AND i.source_id = s.id AND i.tenant_id = $1)',
        v_spec.source_table) ELSE '' END);
  END IF;

  EXECUTE v_sql INTO v_ids USING p_tenant_id, v_after, v_limit;

  -- Transaction-yerel replay işareti → outbox satır işaretleyici replay=true yazar (webhook atlar).
  PERFORM set_config('yh.replay', 'on', true);
  IF v_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_ids LOOP
      INSERT INTO public.yasam_hafizasi_outbox AS o
        (source_key, source_table, source_id, tenant_id, tenant_scope, operation)
      VALUES
        (p_source_key, v_spec.source_table, v_id, p_tenant_id, 'tenant', 'upsert')
      ON CONFLICT (source_key, source_id) DO UPDATE
      SET operation     = 'upsert',
          source_table  = EXCLUDED.source_table,
          tenant_id     = EXCLUDED.tenant_id,
          tenant_scope  = EXCLUDED.tenant_scope,
          event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
          updated_at    = now(),
          status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
          attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
          available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
          locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
          locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
          last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
          processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END
      -- Bekleyen GERÇEK olayın üstüne yazma: zaten pending (replay=false) ise dokunma
      -- (webhook onu zaten uyandırdı; versiyonu artırmak gereksiz).
      WHERE NOT (o.status = 'pending' AND o.replay = false);
      v_count := v_count + 1;
    END LOOP;
  END IF;
  PERFORM set_config('yh.replay', 'off', true);

  RETURN jsonb_build_object(
    'source_key', p_source_key,
    'mode', p_mode,
    'enqueued', v_count,
    'last_id', CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[array_length(v_ids, 1)] END,
    'done', v_ids IS NULL OR array_length(v_ids, 1) < v_limit
  );
END;
$$;
REVOKE ALL ON FUNCTION public.yh_outbox_replay_enqueue(text, uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_replay_enqueue(text, uuid, text, integer, uuid) TO service_role;

-- ─── 8) REPLAY COVERAGE (salt-okunur ölçüm) ───────────────────────────────────
-- Kaynak başına, GERÇEK tenant'lar (yh_replay_tenant_valid) için:
--   source_rows  : tenant'ın tüm kaynak satırları
--   eligible     : SQL uygunluk ön-filtresinden geçenler (worker kapılarının aynası)
--   indexed      : uygun olup index satırı olanlar
--   missing      : uygun olup index satırı OLMAYANLAR (= replay 'missing' hedefi)
--   stale        : index'te olup kaynağı olmayan/uygunluğu kalmayan satırlar (= 'orphans' hedefi)
-- Not: uygunluk SQL ön-filtresidir; boş içerik (empty-content) gibi kararları worker verir —
-- replay sonrası last_outcome dağılımı nihai kanıttır.
CREATE OR REPLACE FUNCTION public.yh_replay_coverage(p_source_key text)
RETURNS TABLE (tenant_id uuid, source_rows bigint, eligible bigint, indexed bigint, missing bigint, stale bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_spec record;
BEGIN
  SELECT * INTO v_spec FROM public.yh_replay_source_spec(p_source_key);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_replay_coverage: kaynak allowlist disi';
  END IF;

  RETURN QUERY EXECUTE format(
    'WITH t AS ('
    || '  SELECT DISTINCT u.tenant_id::uuid AS tenant_id FROM public.users AS u '
    || '  WHERE u.tenant_id IS NOT NULL AND public.yh_replay_tenant_valid(u.tenant_id::uuid)'
    || '), src AS ('
    || '  SELECT (%2$s)::uuid AS tenant_id, s.id, (%3$s) AS eligible FROM %1$s'
    || '), idx AS ('
    || '  SELECT DISTINCT i.tenant_id, i.source_id FROM public.yasam_hafizasi_index AS i WHERE i.source_table = %4$L'
    || ') '
    || 'SELECT t.tenant_id, '
    || '  (SELECT count(*) FROM src WHERE src.tenant_id = t.tenant_id), '
    || '  (SELECT count(*) FROM src WHERE src.tenant_id = t.tenant_id AND src.eligible), '
    || '  (SELECT count(*) FROM src JOIN idx ON idx.source_id = src.id AND idx.tenant_id = t.tenant_id WHERE src.tenant_id = t.tenant_id AND src.eligible), '
    || '  (SELECT count(*) FROM src WHERE src.tenant_id = t.tenant_id AND src.eligible AND NOT EXISTS (SELECT 1 FROM idx WHERE idx.source_id = src.id AND idx.tenant_id = t.tenant_id)), '
    || '  (SELECT count(*) FROM idx WHERE idx.tenant_id = t.tenant_id AND NOT EXISTS (SELECT 1 FROM src WHERE src.id = idx.source_id AND src.tenant_id = t.tenant_id AND src.eligible)) '
    || 'FROM t ORDER BY t.tenant_id',
    v_spec.from_sql, v_spec.tenant_sql, v_spec.elig_sql, v_spec.source_table);
END;
$$;
REVOKE ALL ON FUNCTION public.yh_replay_coverage(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_replay_coverage(text) TO service_role;

-- Outbox ilerleme/sonuç özeti (salt-okunur): kaynak × tenant × durum × sonuç sayımı.
CREATE OR REPLACE FUNCTION public.yh_outbox_progress(p_source_key text, p_tenant_id uuid)
RETURNS TABLE (status text, last_outcome text, replay boolean, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT o.status, o.last_outcome, o.replay, count(*)
  FROM public.yasam_hafizasi_outbox AS o
  WHERE (p_source_key IS NULL OR o.source_key = p_source_key)
    AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
$$;
REVOKE ALL ON FUNCTION public.yh_outbox_progress(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_progress(text, uuid) TO service_role;

-- ─── 9) ARAMA v2 — filtreler LIMIT'ten ÖNCE ───────────────────────────────────
-- Mesleki: tenant + PII + demo + taş dışlama + MODÜL (kullanıcının güncel izin kapsamı ∩ istenen)
-- SQL'de uygulanır; shared (NULL tenant) satır HİÇ dönmez (ortak kütüphane yok).
-- p_modules NULL → modül filtresi yok (yalnız admin kapsamı için); boş dizi → 0 satır.
CREATE OR REPLACE FUNCTION public.yh_search_candidates_v2(
  p_tsquery        text,
  p_session_tenant uuid,
  p_weights        float4[],
  p_limit          integer,
  p_modules        text[]
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  source_module     text,
  source_table      text,
  source_id         uuid,
  unit_type         text,
  section_ref       text,
  group_key         text,
  title             text,
  snippet           text,
  evidence_fields   jsonb,
  topic_tags        text[],
  expert_relations  jsonb,
  is_client_pii     boolean,
  source_updated_at timestamptz,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_stone_module constant text    := 'dogaltas';
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
BEGIN
  IF p_session_tenant IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;
  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_candidates_v2: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_candidates_v2: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_candidates_v2: p_weights gecersiz eleman';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  RETURN QUERY
  SELECT
    i.id, i.tenant_id, i.source_module, i.source_table, i.source_id, i.unit_type,
    i.section_ref, i.group_key, i.title, i.snippet, i.evidence_fields, i.topic_tags,
    i.expert_relations, i.is_client_pii, i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_index AS i
  WHERE
    i.tenant_id = p_session_tenant
    AND i.is_client_pii = false
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    AND (p_modules IS NULL OR i.source_module = ANY (p_modules))
    AND NOT (
      i.source_module = c_stone_module
      AND EXISTS (
        SELECT 1 FROM public.stone_exclusions AS se
        WHERE se.tenant_id = p_session_tenant::text AND se.stone_id = i.source_id
      )
    )
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_search_candidates_v2(text, uuid, float4[], integer, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_candidates_v2(text, uuid, float4[], integer, text[])
  TO service_role;

-- Danışan (tenant geneli + danışan bazlı): modül + tarih penceresi SQL'de, LIMIT'ten ÖNCE.
-- Tarih ekseni (kanonik): occurred_at → source_updated_at → indexed_at (occurred_at'i NULL olan
-- kaynaklar — ör. danışan notları — tarih filtresinde artık KAYBOLMAZ). p_date_from/p_date_to
-- UTC gün sınırı (to = gün sonu dahil), uygulama katmanı sözleşmesiyle birebir.
CREATE OR REPLACE FUNCTION public.yh_search_tenant_client_candidates_v2(
  p_tsquery        text,
  p_session_tenant uuid,
  p_weights        float4[],
  p_limit          integer,
  p_modules        text[],
  p_date_from      date,
  p_date_to        date
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  client_id         uuid,
  source_module     text,
  source_table      text,
  source_id         uuid,
  unit_type         text,
  section_ref       text,
  group_key         text,
  title             text,
  snippet           text,
  evidence_fields   jsonb,
  topic_tags        text[],
  expert_relations  jsonb,
  is_client_pii     boolean,
  occurred_at       timestamptz,
  source_updated_at timestamptz,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
  v_from         timestamptz := CASE WHEN p_date_from IS NULL THEN NULL ELSE (p_date_from::timestamp AT TIME ZONE 'UTC') END;
  v_to_excl      timestamptz := CASE WHEN p_date_to IS NULL THEN NULL ELSE ((p_date_to + 1)::timestamp AT TIME ZONE 'UTC') END;
BEGIN
  IF p_session_tenant IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;
  IF p_weights IS NULL OR array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_tenant_client_candidates_v2: p_weights gecersiz';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_tenant_client_candidates_v2: p_weights gecersiz eleman';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  RETURN QUERY
  SELECT
    i.id, i.tenant_id, i.client_id, i.source_module, i.source_table, i.source_id,
    i.unit_type, i.section_ref, i.group_key, i.title, i.snippet,
    i.evidence_fields, i.topic_tags, i.expert_relations, i.is_client_pii,
    i.occurred_at, i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_client_index AS i
  WHERE
    i.tenant_id = p_session_tenant
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    AND (p_modules IS NULL OR i.source_module = ANY (p_modules))
    AND (v_from IS NULL OR coalesce(i.occurred_at, i.source_updated_at, i.indexed_at) >= v_from)
    AND (v_to_excl IS NULL OR coalesce(i.occurred_at, i.source_updated_at, i.indexed_at) < v_to_excl)
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.occurred_at DESC NULLS LAST,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_search_tenant_client_candidates_v2(text, uuid, float4[], integer, text[], date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_tenant_client_candidates_v2(text, uuid, float4[], integer, text[], date, date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.yh_search_client_candidates_v2(
  p_tsquery        text,
  p_session_tenant uuid,
  p_client_id      uuid,
  p_weights        float4[],
  p_limit          integer,
  p_modules        text[],
  p_date_from      date,
  p_date_to        date
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  source_module     text,
  source_table      text,
  source_id         uuid,
  unit_type         text,
  section_ref       text,
  group_key         text,
  title             text,
  snippet           text,
  evidence_fields   jsonb,
  topic_tags        text[],
  expert_relations  jsonb,
  is_client_pii     boolean,
  occurred_at       timestamptz,
  source_updated_at timestamptz,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
  v_from         timestamptz := CASE WHEN p_date_from IS NULL THEN NULL ELSE (p_date_from::timestamp AT TIME ZONE 'UTC') END;
  v_to_excl      timestamptz := CASE WHEN p_date_to IS NULL THEN NULL ELSE ((p_date_to + 1)::timestamp AT TIME ZONE 'UTC') END;
BEGIN
  IF p_session_tenant IS NULL OR p_client_id IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;
  IF p_weights IS NULL OR array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_client_candidates_v2: p_weights gecersiz';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_client_candidates_v2: p_weights gecersiz eleman';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  RETURN QUERY
  SELECT
    i.id, i.tenant_id, i.source_module, i.source_table, i.source_id,
    i.unit_type, i.section_ref, i.group_key, i.title, i.snippet,
    i.evidence_fields, i.topic_tags, i.expert_relations, i.is_client_pii,
    i.occurred_at, i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_client_index AS i
  WHERE
    i.tenant_id = p_session_tenant
    AND i.client_id = p_client_id
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    AND (p_modules IS NULL OR i.source_module = ANY (p_modules))
    AND (v_from IS NULL OR coalesce(i.occurred_at, i.source_updated_at, i.indexed_at) >= v_from)
    AND (v_to_excl IS NULL OR coalesce(i.occurred_at, i.source_updated_at, i.indexed_at) < v_to_excl)
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.occurred_at DESC NULLS LAST,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_search_client_candidates_v2(text, uuid, uuid, float4[], integer, text[], date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_client_candidates_v2(text, uuid, uuid, float4[], integer, text[], date, date)
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR):
--   SELECT column_name FROM information_schema.columns WHERE table_name='yasam_hafizasi_outbox'
--     AND column_name IN ('last_outcome','replay');                                   -- 2 satır
--   SELECT has_function_privilege('anon','public.yh_outbox_replay_enqueue(text,uuid,text,integer,uuid)','EXECUTE'); -- false
--   SELECT * FROM public.yh_replay_coverage('kupa_hacamat:points');                   -- tenant başına sayım
--   SELECT public.yh_replay_tenant_valid('11111111-1111-1111-1111-111111111111');      -- false
-- =============================================================================
