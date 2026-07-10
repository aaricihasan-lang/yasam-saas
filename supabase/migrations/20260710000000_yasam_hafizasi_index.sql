-- =============================================================================
-- 20260710000000_yasam_hafizasi_index.sql
--
-- YAŞAM HAFIZASI™ — Sprint 1 / A1: TEMEL İNDEKS ALTYAPISI
--
-- KAPSAM (yalnız temel altyapı):
--   1. public.yasam_hafizasi_index   → merkezi bilgi indeksi (PII-DIŞI)
--   2. public.yasam_hafizasi_flags    → tenant-seviyesi feature flag'ler
--   3. Yapısal B-tree indeksler
--   4. RLS ENABLE + anon/authenticated REVOKE → service_role only
--
-- KAPSAM DIŞI (sonraki sprintler):
--   - GIN(search_tsv) / GIN(topic_tags)  → Sprint 2 (retrieval)
--   - pgvector / HNSW / yh_embeddings     → Sprint 4 (semantic)
--   - yasam_hafizasi_index_PII            → Sprint 5 (PII)
--   - dictionary/cache/log/usage/index_state tabloları → ilgili sprintler
--
-- KİLİTLENEN KARARLAR (Sprint 0/1):
--   - Feature flag YALNIZ tenant seviyesi (user override yok).
--   - Tekilleştirme: UNIQUE NULLS NOT DISTINCT (PostgreSQL 15+).
--   - Ana indeks PII KABUL ETMEZ → is_client_pii CHECK (= false).
--   - embedding / embed_model kolonu YOK (semantic aşamada ayrı yh_embeddings).
--   - reflexology_notes / bioenergy_sessions bu sprintte İNDEKSLENMEZ (PII → F5).
--
-- GÜVENLİK:
--   - tenant_id her zaman sunucuda oturumdan; body'den GÜVENİLMEZ.
--   - RLS ENABLE (policy yok) + anon/authenticated tüm yetkiler REVOKE → service_role only.
--   - ⛔ FORCE RLS kullanılmaz (service_role akışını kırardı — mevcut modül deseniyle aynı).
--   - NULL tenant YALNIZ shared referans içindir; PII asla NULL tenant olamaz.
--
-- A3/A6 SINIRI:
--   - Bu migration aromatherapy_knowledge_articles kilidini UYGULAMAZ.
--   - unaccent / vector extension GEREKTİRMEZ (search_tsv düz tsvector kolonudur;
--     GIN/generated ifade Sprint 2'ye ertelenmiştir).
--
-- UYGULAMA: Supabase Dashboard SQL Editor (DATABASE_URL=localhost çalışmaz).
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS + REVOKE (tekrar no-op).
-- =============================================================================

BEGIN;

-- ─── 1) yasam_hafizasi_index (merkezi bilgi indeksi, PII-DIŞI) ────────────────
CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_index (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant izolasyonu: NULL = shared referans (yalnız bilgi kütüphanesi).
  tenant_id         uuid,
  is_shared         boolean     GENERATED ALWAYS AS (tenant_id IS NULL) STORED,

  -- Provenance (kaynak kaydı).
  source_module     text        NOT NULL,
  source_table      text        NOT NULL,
  source_id         uuid        NOT NULL,

  -- Granülerlik.
  unit_type         text        NOT NULL DEFAULT 'record',
  section_ref       text,
  group_key         text,

  -- Görünüm (kart).
  title             text,
  title_source      text,
  snippet           text,
  snippet_origin    text,

  -- Lexical korpus + kanıt yapısı (builder doldurur → sonraki sprint).
  search_text       text,
  search_tsv        tsvector,                                 -- kolon rezerve; GIN/generated → Sprint 2
  evidence_fields   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  topic_tags        text[]      NOT NULL DEFAULT '{}'::text[],
  expert_relations  jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Meta / yaşam döngüsü.
  lang              text        NOT NULL DEFAULT 'tr',
  is_client_pii     boolean     NOT NULL DEFAULT false,       -- ana indekste HER ZAMAN false
  source_updated_at timestamptz,
  reviewed_at       timestamptz,
  version           text,
  content_hash      text,
  indexed_at        timestamptz NOT NULL DEFAULT now(),

  -- ─── Kurallar / kısıtlar ───────────────────────────────────────────────────
  CONSTRAINT yhi_unit_type_chk      CHECK (unit_type IN ('record', 'section', 'row')),
  CONSTRAINT yhi_source_module_chk  CHECK (length(btrim(source_module)) > 0),
  CONSTRAINT yhi_source_table_chk   CHECK (length(btrim(source_table)) > 0),
  CONSTRAINT yhi_no_pii_chk         CHECK (is_client_pii = false),   -- ana indeks PII kabul etmez
  CONSTRAINT yhi_lang_chk           CHECK (length(btrim(lang)) > 0),

  -- Tekilleştirme (PostgreSQL 15+): NULL section_ref'ler eşit sayılır → çift kayıt engellenir.
  CONSTRAINT yhi_source_unit_key    UNIQUE NULLS NOT DISTINCT (source_table, source_id, section_ref)
);

-- ─── Yapısal B-tree indeksler (retrieval'a ait GIN/HNSW BURADA YOK) ───────────
CREATE INDEX IF NOT EXISTS yhi_tenant_module_idx
  ON public.yasam_hafizasi_index (tenant_id, source_module);

CREATE INDEX IF NOT EXISTS yhi_source_idx
  ON public.yasam_hafizasi_index (source_table, source_id);

CREATE INDEX IF NOT EXISTS yhi_group_key_idx
  ON public.yasam_hafizasi_index (group_key);

CREATE INDEX IF NOT EXISTS yhi_source_updated_idx
  ON public.yasam_hafizasi_index (source_updated_at);


-- ─── 2) yasam_hafizasi_flags (tenant-seviyesi feature flag'ler) ───────────────
CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_flags (
  tenant_id      uuid        PRIMARY KEY,
  yh_enabled     boolean     NOT NULL DEFAULT false,
  yh_hizli       boolean     NOT NULL DEFAULT false,
  yh_derin       boolean     NOT NULL DEFAULT false,
  yh_semantic    boolean     NOT NULL DEFAULT false,
  yh_client_pii  boolean     NOT NULL DEFAULT false,
  yh_shared      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);


-- ─── 3) Kilit: anon/authenticated erişimini kapat, RLS aç (service_role bypass) ─
DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY['yasam_hafizasi_index', 'yasam_hafizasi_flags'];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    -- Varsa policy'leri kaldır (policy yok = service_role dışında deny).
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- Tablo seviyesi tüm yetkileri geri al.
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl
    );

    -- Kolon seviyesi SELECT yetkilerini de geri al (savunma derinliği).
    FOR col IN
      SELECT column_name, grantee
      FROM information_schema.column_privileges
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND grantee IN ('anon', 'authenticated')
        AND privilege_type = 'SELECT'
    LOOP
      EXECUTE format(
        'REVOKE SELECT (%I) ON TABLE public.%I FROM %I',
        col.column_name, tbl, col.grantee
      );
    END LOOP;

    -- RLS aç (FORCE değil → service_role bypass korunur).
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, beklenen):
--   -- anon/authenticated erişimi kapalı:
--   SELECT has_table_privilege('anon','public.yasam_hafizasi_index','SELECT');   -- false
--   SELECT has_table_privilege('anon','public.yasam_hafizasi_index','INSERT');   -- false
--   SELECT has_table_privilege('anon','public.yasam_hafizasi_flags','SELECT');   -- false
--   SELECT has_table_privilege('authenticated','public.yasam_hafizasi_index','UPDATE'); -- false
--   -- RLS açık, FORCE değil:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname IN ('yasam_hafizasi_index','yasam_hafizasi_flags');          -- t, f
--   -- Tekilleştirme (NULLS NOT DISTINCT): aynı (source_table, source_id, NULL) ikinci INSERT hata verir.
--   -- Ana indeks PII kabul etmez: is_client_pii = true INSERT → CHECK ihlali.
-- Davranışsal: anon/authenticated CRUD engelli; service_role (sunucu API) çalışır.
-- =============================================================================
