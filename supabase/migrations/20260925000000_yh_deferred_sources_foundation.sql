-- =============================================================================
-- 20260925000000_yh_deferred_sources_foundation.sql
--
-- YAŞAM HAFIZASI™ — BF-14 ERTELENMİŞ KAYNAKLAR MİMARİ KAPANIŞI (DB FOUNDATION)
--
-- KAPSAM (yalnız additive DDL foundation; DORMANT):
--   1. public.yh_document_sources         (Belge/Video kalıcı, tenant-owned, provenanslı kaynak)
--   2. public.yh_document_passages         (sıralı passage/chunk; deterministic ordinal + hash)
--   3. public.yh_archive_classifications   (Kişisel Arşiv row-level sınıflandırma; standalone)
--
-- KAPSAM DIŞI (bilinçli — exact kanıtla):
--   * NUMEROLOJİ client_id: DEFERRED_HARD_BLOCKER. Ana analiz tabloları (numerology_records /
--     numerology_analyses) tracked migration'da TANIMLI DEĞİL (şema doğrulanamaz) ve HİÇBİR
--     numeroloji tablosunda client_id kolonu YOK; numeroloji analiz API'si (app/api/numeroloji/
--     analyses) client/danışan bağı taşımaz. Doğrulanamayan/harici tabloya client_id EKLENMEZ
--     (repo fail-closed migration standardı). Heuristik (ad/doğum) eşleştirme YASAK → bu
--     migration client_id EKLEMEZ.
--   * YEBS: tablo değişikliği GEREKTİRMEZ (global-canonical görünürlük + status-eligibility kod
--     katmanında; yebs_* tabloları bu migration'da DEĞİŞTİRİLMEZ).
--
-- BAĞLAYICI GÜVENLİK / SINIR:
--   * Yalnız YENİ tablolar (mevcut tablo ALTER/DROP EDİLMEZ; personal_archives/belge_ceviri_jobs/
--     video_* tablolarına DOKUNULMAZ — bunların şeması tracked değil, güvenle değiştirilemez).
--   * Row-level classification DEFAULT 'unclassified' (fail-closed; safe-non-pii yalnız açık
--     yetkili review ile). reviewed_content_hash → stale-content guard.
--   * Tenant izolasyonu app-layer standardı (tenants tablosu yok); passages→sources composite FK,
--     archive classifications app-layer (tenant_id, archive_id) kimliği (personal_archives'a hard
--     FK YOK — tablo tracked değil).
--
-- DORMANT (yan etki YOK — aktivasyon AYRI kapı = BF-11E / ayrı onay):
--   * Kaynak (client_*/personal_*/job_*) tablolarına TRIGGER kurulmaz.
--   * HİÇBİR INSERT/UPDATE/DELETE veri operasyonu (backfill) yok.
--   * Uygulanınca mevcut veri İNDEKSLENMEZ (event üretecek trigger yok; source registry enabled:false).
--   * updated_at trigger'ı EKLENMEZ (zorunlu değil; app-maintained → trigger yüzeyi minimal).
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS + guard'lı REVOKE/GRANT/POLICY.
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse COMMIT rollback'e döner,
--   hiçbir kısmi şema kalmaz.
-- =============================================================================

BEGIN;

-- ─── 1) yh_document_sources — kalıcı, tenant-owned, provenanslı belge/video kaynağı ─────
CREATE TABLE IF NOT EXISTS public.yh_document_sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  source_kind       text        NOT NULL,                      -- document | video | transcript
  title             text        NOT NULL,
  origin_job_ref    uuid,                                      -- promote edilen job id; FK YOK (job tablosu tracked değil)
  source_author     text,
  source_publisher  text,
  source_url        text,
  source_date       date,
  access_date       date,
  language          text,
  rights_note       text,
  provenance_note   text,
  status            text        NOT NULL DEFAULT 'active',        -- active | archived
  classification    text        NOT NULL DEFAULT 'unclassified',  -- unclassified | safe-non-pii | pii | restricted
  content_hash      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz,

  CONSTRAINT yhds_source_kind_chk     CHECK (source_kind IN ('document', 'video', 'transcript')),
  CONSTRAINT yhds_status_chk          CHECK (status IN ('active', 'archived')),
  CONSTRAINT yhds_classification_chk  CHECK (classification IN ('unclassified', 'safe-non-pii', 'pii', 'restricted')),
  CONSTRAINT yhds_title_chk           CHECK (btrim(title) <> ''),
  -- Composite FK hedefi (passages için tenant-güvenli aday anahtar).
  CONSTRAINT yhds_tenant_id_unique    UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS yhds_tenant_status_idx
  ON public.yh_document_sources (tenant_id, status, classification);
-- Aynı içerik hash'i için tenant içinde kontrollü duplicate tespiti (unique DEĞİL; app karar verir).
CREATE INDEX IF NOT EXISTS yhds_tenant_hash_idx
  ON public.yh_document_sources (tenant_id, content_hash);

-- ─── 2) yh_document_passages — sıralı passage/chunk (deterministic ordinal + locator + hash) ──
CREATE TABLE IF NOT EXISTS public.yh_document_passages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  document_id       uuid        NOT NULL,
  ordinal           integer     NOT NULL,
  locator           text,                                         -- page/timecode/section
  passage_text      text        NOT NULL,
  text_hash         text,
  language          text,
  layer             text,                                         -- body | heading | caption ...
  classification    text        NOT NULL DEFAULT 'unclassified',
  source_updated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yhdp_ordinal_chk         CHECK (ordinal >= 0),
  CONSTRAINT yhdp_text_chk            CHECK (btrim(passage_text) <> ''),
  CONSTRAINT yhdp_text_len_chk        CHECK (char_length(passage_text) <= 20000),
  CONSTRAINT yhdp_classification_chk  CHECK (classification IN ('unclassified', 'safe-non-pii', 'pii', 'restricted')),
  -- Tenant-güvenli composite FK; kaynak silinince passage'lar da silinir.
  CONSTRAINT yhdp_document_fk         FOREIGN KEY (tenant_id, document_id)
    REFERENCES public.yh_document_sources (tenant_id, id) ON DELETE CASCADE,
  -- Deterministic sıra: aynı doküman içinde ordinal tekildir.
  CONSTRAINT yhdp_ordinal_unique      UNIQUE (tenant_id, document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS yhdp_doc_idx
  ON public.yh_document_passages (tenant_id, document_id, ordinal);

-- ─── 3) yh_archive_classifications — Kişisel Arşiv row-level sınıflandırma (standalone) ────
-- personal_archives tracked migration'da TANIMLI DEĞİL → hard FK YOK; app-layer (tenant_id, archive_id).
CREATE TABLE IF NOT EXISTS public.yh_archive_classifications (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL,
  archive_id             uuid        NOT NULL,
  classification         text        NOT NULL DEFAULT 'unclassified', -- fail-closed varsayılan
  reason                 text,
  reviewed_by            uuid,
  reviewed_at            timestamptz,
  reviewed_content_hash  text,                                        -- stale-content guard
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yhac_classification_chk CHECK (classification IN ('unclassified', 'safe-non-pii', 'pii', 'restricted')),
  CONSTRAINT yhac_reason_chk         CHECK (reason IS NULL OR btrim(reason) <> ''),
  CONSTRAINT yhac_identity_unique    UNIQUE (tenant_id, archive_id)
);

CREATE INDEX IF NOT EXISTS yhac_tenant_idx
  ON public.yh_archive_classifications (tenant_id, classification);

-- ─── 4) Kilit: RLS ENABLE + anon/authenticated REVOKE + yalnız service_role GRANT/POLICY ──
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['yh_document_sources', 'yh_document_passages', 'yh_archive_classifications'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated, PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_' || t, t);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okunur, beklenen):
--   SELECT has_table_privilege('anon','public.yh_document_sources','SELECT');          -- false
--   SELECT has_table_privilege('service_role','public.yh_document_passages','INSERT'); -- true
--   -- default classification 'unclassified'; source_kind/status/classification CHECK aktif;
--   -- passages→sources composite FK; archive classifications (tenant_id, archive_id) UNIQUE.
--   -- Hiçbir kaynak tabloya trigger kurulmadı; hiçbir veri DML/backfill yapılmadı.
-- =============================================================================
