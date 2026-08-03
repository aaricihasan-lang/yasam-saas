-- =============================================================================
-- 20260923000000_yasam_hafizasi_client_memory_core.sql
--
-- YAŞAM HAFIZASI™ — BF-14 PAKET 1: CLIENT MEMORY CORE (DB FOUNDATION)
--
-- KAPSAM (yalnız DDL foundation; DORMANT):
--   1. public.clients → UNIQUE (tenant_id, id)   (composite FK hedefi)
--   2. public.yasam_hafizasi_client_index         (client-scoped, PII-DIŞI, ayrı iz)
--   3. public.yh_search_client_candidates(...)     (client-scoped retrieval RPC)
--   4. public.yasam_hafizasi_report_snapshots      (append-only teslim geçmişi foundation)
--
-- BAĞLAYICI GÜVENLİK / SINIR:
--   - Professional/global index (public.yasam_hafizasi_index) ve RPC
--     (public.yh_search_candidates) DEĞİŞTİRİLMEZ (bu dosyada adı bile geçmez).
--   - Client index client-scoped'tur: tenant_id + client_id ZORUNLU; shared/NULL client
--     satırı İMKÂNSIZ; is_client_pii = false CHECK (client index de PII-DIŞI — yalnız
--     etiket/kod/tarih indexlenir; serbest sağlık/terapi metni SNAPSHOT_ONLY, index'e girmez).
--   - Tenant-client bütünlüğü DB-level composite FK ile garanti: (tenant_id, client_id)
--     → clients(tenant_id, id).
--
-- DORMANT (yan etki YOK — aktivasyon AYRI kapı = BF-11E):
--   - Bu migration HİÇBİR kaynak (client_*) tablosuna TRIGGER kurmaz.
--   - HİÇBİR INSERT/UPDATE/DELETE veri operasyonu içermez.
--   - HİÇBİR bulk backfill / mevcut veri taraması yapmaz.
--   - Uygulanınca mevcut test verisi İNDEKSLENMEZ (event üretecek trigger yok).
--   (Client index tablosunun KENDİ search_tsv BEFORE-trigger'ı iç mekanizmadır; kaynak
--    tabloya CDC trigger DEĞİLDİR — yasak olan kaynak-tablo CDC trigger'ıdır.)
--
-- BAĞIMLILIK: public.yh_index_build_search_tsv() (20260712…, professional index'te CANLI)
--   yeniden kullanılır (search_tsv üretimi; unaccent + A/B/C/D ağırlık simetrisi korunur).
--
-- UYGULAMA: Supabase Dashboard SQL Editor (DATABASE_URL=localhost çalışmaz). AYRI ONAY.
-- IDEMPOTENT: CREATE TABLE/INDEX/FUNCTION IF NOT EXISTS + guard'lı ALTER + REVOKE/GRANT.
-- =============================================================================

BEGIN;

-- ─── 1) clients composite unique (tenant_id, id) — composite FK hedefi ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND contype = 'u'
      AND conname = 'clients_tenant_id_id_key'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

-- ─── 2) yasam_hafizasi_client_index (client-scoped, PII-DIŞI) ─────────────────
CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_client_index (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client-scoped: HER İKİSİ de ZORUNLU (shared/NULL client satırı imkânsız).
  tenant_id         uuid        NOT NULL,
  client_id         uuid        NOT NULL,

  -- Provenance.
  source_module     text        NOT NULL,
  source_table      text        NOT NULL,
  source_id         uuid        NOT NULL,

  -- Granülerlik.
  unit_type         text        NOT NULL DEFAULT 'record',
  section_ref       text,
  group_key         text,

  -- Görünüm (kart) — PII içermez.
  title             text,
  title_source      text,
  snippet           text,
  snippet_origin    text,

  -- Lexical korpus + kanıt (yh_index_build_search_tsv trigger doldurur).
  search_text       text,
  search_tsv        tsvector,
  evidence_fields   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  topic_tags        text[]      NOT NULL DEFAULT '{}'::text[],
  expert_relations  jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Zaman ekseni + meta.
  occurred_at       timestamptz,                                 -- kaynak olay tarihi (session/appointment...)
  lang              text        NOT NULL DEFAULT 'tr',
  is_client_pii     boolean     NOT NULL DEFAULT false,          -- client index de PII kabul ETMEZ
  source_updated_at timestamptz,
  content_hash      text,
  indexed_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yhci_unit_type_chk     CHECK (unit_type IN ('record', 'section', 'row')),
  CONSTRAINT yhci_source_module_chk CHECK (length(btrim(source_module)) > 0),
  CONSTRAINT yhci_source_table_chk  CHECK (length(btrim(source_table)) > 0),
  CONSTRAINT yhci_no_pii_chk        CHECK (is_client_pii = false),
  CONSTRAINT yhci_lang_chk          CHECK (length(btrim(lang)) > 0),

  -- Tekilleştirme (professional ile aynı sözleşme; client satırları kendi source_table/id'leriyle).
  CONSTRAINT yhci_source_unit_key   UNIQUE NULLS NOT DISTINCT (source_table, source_id, section_ref),

  -- Tenant-client bütünlüğü DB seviyesinde (fail-closed). Client silinince index CASCADE.
  CONSTRAINT yhci_tenant_client_fk  FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS yhci_tenant_client_module_idx
  ON public.yasam_hafizasi_client_index (tenant_id, client_id, source_module);
CREATE INDEX IF NOT EXISTS yhci_source_idx
  ON public.yasam_hafizasi_client_index (source_table, source_id);
CREATE INDEX IF NOT EXISTS yhci_occurred_idx
  ON public.yasam_hafizasi_client_index (occurred_at);
CREATE INDEX IF NOT EXISTS yhci_search_tsv_gin
  ON public.yasam_hafizasi_client_index USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS yhci_topic_tags_gin
  ON public.yasam_hafizasi_client_index USING GIN (topic_tags);

-- search_tsv üretimi: professional index'in trigger fonksiyonu yeniden kullanılır
-- (NEW.title/topic_tags/expert_relations/search_text/snippet okur; tablo-agnostik).
DROP TRIGGER IF EXISTS yh_client_index_search_tsv_biu ON public.yasam_hafizasi_client_index;
CREATE TRIGGER yh_client_index_search_tsv_biu
  BEFORE INSERT OR UPDATE ON public.yasam_hafizasi_client_index
  FOR EACH ROW
  EXECUTE FUNCTION public.yh_index_build_search_tsv();

-- ─── 3) yh_search_client_candidates RPC (client-scoped; shared YOK) ───────────
CREATE OR REPLACE FUNCTION public.yh_search_client_candidates(
  p_tsquery        text,
  p_session_tenant uuid,
  p_client_id      uuid,
  p_weights        float4[],
  p_limit          integer
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
BEGIN
  -- Fail-closed sınır guard'ları (client bağlamı: tenant + client ZORUNLU).
  IF p_session_tenant IS NULL OR p_client_id IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;

  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_client_candidates: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_client_candidates: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_client_candidates: p_weights gecersiz eleman';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  -- Görünürlük (tenant + client + PII + demo) ORDER BY / LIMIT'ten ÖNCE. Shared YOK.
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
    AND i.is_client_pii = false
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.occurred_at DESC NULLS LAST,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.yh_search_client_candidates(text, uuid, uuid, float4[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_client_candidates(text, uuid, uuid, float4[], integer)
  TO service_role;

-- ─── 4) yasam_hafizasi_report_snapshots (append-only teslim geçmişi) ──────────
-- Bağımsız kopya: kaynak (source) satırına FK YOK → source silinince snapshot KALIR.
-- (client silinmesi de snapshot'ı cascade ETMEZ; teslim geçmişi bağımsızdır.)
CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_report_snapshots (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid        NOT NULL,
  client_id                     uuid        NOT NULL,
  target_kind                   text        NOT NULL,
  target_ref                    uuid,
  selection_group               uuid        NOT NULL,
  source_module                 text        NOT NULL,
  source_table                  text        NOT NULL,
  source_id                     uuid        NOT NULL,
  section_ref                   text,
  unit_type                     text        NOT NULL DEFAULT 'record',
  title                         text,
  selected_text                 text,
  evidence                      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  provenance                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at             timestamptz,
  content_hash                  text        NOT NULL,
  ordering                      integer     NOT NULL DEFAULT 0,
  expert_note                   text,
  selected_by                   uuid        NOT NULL,
  source_available_at_snapshot  boolean     NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yhrs_target_kind_chk  CHECK (target_kind IN ('report', 'protocol', 'guide')),
  CONSTRAINT yhrs_unit_type_chk    CHECK (unit_type IN ('record', 'section', 'row')),
  CONSTRAINT yhrs_selected_len_chk CHECK (selected_text IS NULL OR char_length(selected_text) <= 8000),
  CONSTRAINT yhrs_note_len_chk     CHECK (expert_note IS NULL OR char_length(expert_note) <= 2000)
);

CREATE INDEX IF NOT EXISTS yhrs_tenant_client_idx
  ON public.yasam_hafizasi_report_snapshots (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS yhrs_selection_group_idx
  ON public.yasam_hafizasi_report_snapshots (selection_group);
CREATE INDEX IF NOT EXISTS yhrs_target_idx
  ON public.yasam_hafizasi_report_snapshots (target_kind, target_ref);

-- İçerik immutability: UPDATE fail-closed (admin_audit_log deseni). INSERT/SELECT/DELETE serbest
-- (DELETE = uzmanın seçimi kaldırması; içerik ASLA değiştirilemez).
CREATE OR REPLACE FUNCTION public.yh_report_snapshot_prevent_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'yasam_hafizasi_report_snapshots immutable: UPDATE engellendi'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_yhrs_no_update ON public.yasam_hafizasi_report_snapshots;
CREATE TRIGGER trg_yhrs_no_update
  BEFORE UPDATE ON public.yasam_hafizasi_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.yh_report_snapshot_prevent_update();

REVOKE ALL ON FUNCTION public.yh_report_snapshot_prevent_update() FROM PUBLIC, anon, authenticated;

-- ─── 5) Kilit: client index + snapshots → service_role only, RLS ENABLE ───────
DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY['yasam_hafizasi_client_index', 'yasam_hafizasi_report_snapshots'];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl);

    FOR col IN
      SELECT column_name, grantee FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = tbl
        AND grantee IN ('anon', 'authenticated') AND privilege_type = 'SELECT'
    LOOP
      EXECUTE format('REVOKE SELECT (%I) ON TABLE public.%I FROM %I', col.column_name, tbl, col.grantee);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Client index: service_role full (indexer upsert/delete). Snapshots: append-only (UPDATE trigger-red).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yasam_hafizasi_client_index TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.yasam_hafizasi_report_snapshots TO service_role;

CREATE POLICY "service_role_yhci" ON public.yasam_hafizasi_client_index
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_yhrs" ON public.yasam_hafizasi_report_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, beklenen — salt-okunur):
--   -- anon/authenticated kapalı:
--   SELECT has_table_privilege('anon','public.yasam_hafizasi_client_index','SELECT');   -- false
--   SELECT has_function_privilege('anon',
--     'public.yh_search_client_candidates(text,uuid,uuid,float4[],integer)','EXECUTE');  -- false
--   SELECT has_function_privilege('service_role',
--     'public.yh_search_client_candidates(text,uuid,uuid,float4[],integer)','EXECUTE');  -- true
--   -- INVOKER + STABLE:
--   SELECT provolatile, prosecdef FROM pg_proc WHERE proname='yh_search_client_candidates'; -- s, f
--   -- is_client_pii=true INSERT → CHECK ihlali; tenant/client mismatch → FK ihlali.
--   -- snapshot UPDATE → exception (immutable); professional yh_search_candidates DEĞİŞMEDİ.
-- =============================================================================
