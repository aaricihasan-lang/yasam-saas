-- ============================================================================
-- 20271205000000_numerology_classic_core.sql
--
-- Numeroloji Merkezi — Klasik Numeroloji (B) çekirdek şeması. YALNIZ YENİ TABLOLAR (additive).
-- Mevcut numerology_* tablolarına (numerology_records, numerology_knowledge_records, ...) HİÇBİR
-- değişiklik yapılmaz, referans verilmez (karşılaştırma notu legacy_record_id metin olarak tutar; FK YOK).
--
-- Tablolar:
--   1) numerology_classic_analyses        — kayıtlı klasik analiz (tenant; isteğe bağlı danışan bağı)
--   2) numerology_classic_response_cache  — tenant'a bağlı normalize sağlayıcı yanıt önbelleği (kişisel veri)
--   3) numerology_classic_catalog         — global sabit anlam metinleri (sayı kütüphanesi; çevrimdışı içe aktarım)
--                                           kind: pythagorean_meaning | chaldean_compound | lucky_association
--                                           (lucky_association: Life Path → {gemstones,colors,day,element,rulingPlanet,
--                                            compatibleNumbers,incompatibleNumbers}; EN taş adları ikinci çağrısız okunur)
--   4) numerology_comparative_notes       — mevcut ↔ klasik karşılaştırma notu (iki kaynağın anlık görüntüsü + sha256)
--   5) numerology_classic_provider_calls  — owner/admin kullanım defteri (anahtar/girdi YOK)
--
-- Tenant güvenliği: danışan bağı (tenant_id, client_id) → clients(tenant_id, id) bileşik FK
--   (hedef clients_tenant_id_id_key — HD / YH / Anamnez / numerology_records_client_link ile aynı desen).
--   ON DELETE SET NULL (client_id): danışan silinince analiz/not SİLİNMEZ, yalnız bağ kalkar (PG15+).
--
-- RLS: hepsinde ENABLE + SIFIR policy; PUBLIC/anon/authenticated'tan REVOKE ALL; yalnız service_role'e açık
--   allowlist GRANT (astroloji / doğaltaş kütüphanesi born-locked deseni). Uygulama yolu yalnız sunucu API'si.
--
-- VERİ-YIKICI MI: HAYIR (yalnız yeni tablo/fonksiyon/trigger/index). İDEMPOTENT (IF NOT EXISTS / OR REPLACE).
-- ⚠️ PRODUCTION'A UYGULANMADI. Sıra: bu migration → kod (kod bayrakla KAPALI; NUMEROLOGY_CLASSIC_ENABLED).
-- GERİ ALMA (veri kaybı: yalnız bu modülün verisi):
--   DROP TABLE IF EXISTS public.numerology_classic_purge_log;
--   DROP TABLE IF EXISTS public.numerology_comparative_notes;
--   DROP TABLE IF EXISTS public.numerology_classic_provider_calls;
--   DROP TABLE IF EXISTS public.numerology_classic_catalog;
--   DROP TABLE IF EXISTS public.numerology_classic_response_cache;
--   DROP TABLE IF EXISTS public.numerology_classic_analyses;
--   DROP FUNCTION IF EXISTS public.numerology_classic_touch();
-- ============================================================================
BEGIN;

DO $numk_pre$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'numerology_classic_core: public.clients bulunamadı (precondition)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass AND contype IN ('u', 'p') AND conname = 'clients_tenant_id_id_key'
  ) THEN
    RAISE EXCEPTION 'numerology_classic_core: clients_tenant_id_id_key UNIQUE (tenant_id, id) yok (precondition)';
  END IF;
END
$numk_pre$;

-- ─── Ortak trigger: updated_at + row_version (CAS için sunucu her güncellemede +1 görür) ─────────
CREATE OR REPLACE FUNCTION public.numerology_classic_touch() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END
$$;

-- ─── 1) Kayıtlı analizler ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.numerology_classic_analyses (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  client_id            uuid        NULL,
  created_by           uuid        NULL,
  kind                 text        NOT NULL,
  title                text        NOT NULL DEFAULT '',
  input                jsonb       NOT NULL,
  techniques           text[]      NOT NULL DEFAULT '{}'::text[],
  result               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  verification         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  provider_meta        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  methodology_version  text        NOT NULL,
  api_schema_version   text        NOT NULL,
  status               text        NOT NULL,
  row_version          integer     NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  CONSTRAINT numerology_classic_analyses_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT numerology_classic_analyses_kind_chk CHECK (kind IN ('person', 'relationship', 'business', 'names')),
  CONSTRAINT numerology_classic_analyses_status_chk CHECK (status IN ('complete', 'partial')),
  CONSTRAINT numerology_classic_analyses_title_chk CHECK (char_length(title) <= 160),
  CONSTRAINT numerology_classic_analyses_input_chk CHECK (jsonb_typeof(input) = 'object' AND octet_length(input::text) <= 16384),
  CONSTRAINT numerology_classic_analyses_techniques_chk CHECK (cardinality(techniques) <= 12),
  CONSTRAINT numerology_classic_analyses_result_chk CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 2000000),
  CONSTRAINT numerology_classic_analyses_verification_chk CHECK (jsonb_typeof(verification) = 'object' AND octet_length(verification::text) <= 262144),
  CONSTRAINT numerology_classic_analyses_meta_chk CHECK (
    jsonb_typeof(provider_meta) = 'object' AND octet_length(provider_meta::text) <= 65536
    AND provider_meta::text !~* '(x-api-key|api[_-]?key|apikey)'
  ),
  CONSTRAINT numerology_classic_analyses_versions_chk CHECK (
    char_length(methodology_version) BETWEEN 1 AND 64 AND char_length(api_schema_version) BETWEEN 1 AND 64
  ),
  CONSTRAINT numerology_classic_analyses_row_version_chk CHECK (row_version >= 1),
  CONSTRAINT numerology_classic_analyses_client_fk FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE SET NULL (client_id)
);

CREATE INDEX IF NOT EXISTS numerology_classic_analyses_tenant_created_idx
  ON public.numerology_classic_analyses (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS numerology_classic_analyses_tenant_client_idx
  ON public.numerology_classic_analyses (tenant_id, client_id) WHERE client_id IS NOT NULL;

DROP TRIGGER IF EXISTS numerology_classic_analyses_touch ON public.numerology_classic_analyses;
CREATE TRIGGER numerology_classic_analyses_touch
  BEFORE UPDATE ON public.numerology_classic_analyses
  FOR EACH ROW EXECUTE FUNCTION public.numerology_classic_touch();

-- ─── 2) Tenant'a bağlı normalize yanıt önbelleği ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.numerology_classic_response_cache (
  tenant_id        uuid        NOT NULL,
  cache_key        text        NOT NULL,
  endpoint_id      text        NOT NULL,
  lang             text        NOT NULL,
  spec_version     text        NOT NULL,
  adapter_version  text        NOT NULL,
  normalized       jsonb       NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NULL,
  CONSTRAINT numerology_classic_response_cache_pkey PRIMARY KEY (tenant_id, cache_key),
  CONSTRAINT numerology_classic_response_cache_key_chk CHECK (cache_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT numerology_classic_response_cache_endpoint_chk CHECK (endpoint_id ~ '^[a-z_]{2,40}$'),
  CONSTRAINT numerology_classic_response_cache_lang_chk CHECK (lang ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'),
  CONSTRAINT numerology_classic_response_cache_versions_chk CHECK (
    char_length(spec_version) BETWEEN 1 AND 64 AND char_length(adapter_version) BETWEEN 1 AND 64
  ),
  CONSTRAINT numerology_classic_response_cache_size_chk CHECK (octet_length(normalized::text) <= 1000000)
);
CREATE INDEX IF NOT EXISTS numerology_classic_response_cache_expires_idx
  ON public.numerology_classic_response_cache (expires_at) WHERE expires_at IS NOT NULL;

-- ─── 3) Global katalog (sabit anlam metinleri; kişisel veri YOK) ─────────────
CREATE TABLE IF NOT EXISTS public.numerology_classic_catalog (
  kind          text        NOT NULL,
  number        integer     NOT NULL,
  lang          text        NOT NULL,
  payload       jsonb       NOT NULL,
  spec_version  text        NOT NULL,
  imported_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numerology_classic_catalog_pkey PRIMARY KEY (kind, number, lang),
  CONSTRAINT numerology_classic_catalog_kind_chk CHECK (kind IN ('pythagorean_meaning', 'chaldean_compound', 'lucky_association')),
  CONSTRAINT numerology_classic_catalog_number_chk CHECK (
    (kind IN ('pythagorean_meaning', 'lucky_association') AND number IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33))
    OR (kind = 'chaldean_compound' AND number BETWEEN 10 AND 52)
  ),
  CONSTRAINT numerology_classic_catalog_lang_chk CHECK (lang ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'),
  CONSTRAINT numerology_classic_catalog_payload_chk CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 200000),
  CONSTRAINT numerology_classic_catalog_spec_chk CHECK (char_length(spec_version) BETWEEN 1 AND 64),
  CONSTRAINT numerology_classic_catalog_lucky_chk CHECK (
    kind <> 'lucky_association'
    OR (lang IN ('tr', 'en')
        AND payload ?& ARRAY['gemstones', 'colors', 'day', 'element', 'rulingPlanet', 'compatibleNumbers', 'incompatibleNumbers'])
  )
);

-- ─── 4) Karşılaştırma notları ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.numerology_comparative_notes (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  client_id            uuid        NULL,
  legacy_record_id     text        NULL,
  classic_analysis_id  uuid        NULL,
  snapshot             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  body                 text        NOT NULL DEFAULT '',
  created_by           uuid        NULL,
  row_version          integer     NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  CONSTRAINT numerology_comparative_notes_tenant_id_id_key UNIQUE (tenant_id, id),
  -- numerology_records.id (uuid) metin olarak; mevcut tabloya FK BİLİNÇLİ OLARAK YOK.
  CONSTRAINT numerology_comparative_notes_legacy_chk CHECK (legacy_record_id IS NULL OR legacy_record_id ~ '^[A-Za-z0-9-]{1,64}$'),
  CONSTRAINT numerology_comparative_notes_body_chk CHECK (char_length(body) <= 20000),
  CONSTRAINT numerology_comparative_notes_snapshot_chk CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 262144),
  CONSTRAINT numerology_comparative_notes_row_version_chk CHECK (row_version >= 1),
  CONSTRAINT numerology_comparative_notes_client_fk FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE SET NULL (client_id),
  CONSTRAINT numerology_comparative_notes_analysis_fk FOREIGN KEY (tenant_id, classic_analysis_id)
    REFERENCES public.numerology_classic_analyses (tenant_id, id) ON DELETE SET NULL (classic_analysis_id)
);
CREATE INDEX IF NOT EXISTS numerology_comparative_notes_tenant_client_idx
  ON public.numerology_comparative_notes (tenant_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS numerology_comparative_notes_tenant_analysis_idx
  ON public.numerology_comparative_notes (tenant_id, classic_analysis_id) WHERE classic_analysis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS numerology_comparative_notes_tenant_legacy_idx
  ON public.numerology_comparative_notes (tenant_id, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

DROP TRIGGER IF EXISTS numerology_comparative_notes_touch ON public.numerology_comparative_notes;
CREATE TRIGGER numerology_comparative_notes_touch
  BEFORE UPDATE ON public.numerology_comparative_notes
  FOR EACH ROW EXECUTE FUNCTION public.numerology_classic_touch();

-- ─── 5) Sağlayıcı çağrı defteri (owner/admin) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.numerology_classic_provider_calls (
  id               bigserial   PRIMARY KEY,
  tenant_id        uuid        NOT NULL,
  user_id          uuid        NULL,
  endpoint_id      text        NOT NULL,
  http             integer     NULL,
  outcome          text        NOT NULL,
  cache_hit        boolean     NOT NULL DEFAULT false,
  quota_remaining  integer     NULL,
  quota_reset_at   timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numerology_classic_provider_calls_endpoint_chk CHECK (endpoint_id ~ '^[a-z_]{2,40}$'),
  CONSTRAINT numerology_classic_provider_calls_outcome_chk CHECK (outcome ~ '^[a-z_]{2,40}$'),
  CONSTRAINT numerology_classic_provider_calls_http_chk CHECK (http IS NULL OR http BETWEEN 100 AND 599),
  CONSTRAINT numerology_classic_provider_calls_quota_chk CHECK (quota_remaining IS NULL OR quota_remaining >= 0)
);
CREATE INDEX IF NOT EXISTS numerology_classic_provider_calls_created_idx
  ON public.numerology_classic_provider_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS numerology_classic_provider_calls_tenant_idx
  ON public.numerology_classic_provider_calls (tenant_id, created_at DESC);

-- ─── 5b) Kişisel veri temizliği denetim kaydı (NK-R5; geri izlenebilirlik) ──────
-- Her temizlik çalıştırması (kuru çalıştırma dahil) silmeden ÖNCE buraya yazılır; kayıt yazılamazsa temizlik
-- hiçbir şey silmez (fail-closed). Kişisel veri YOK: yalnız sayılar, tenant kimlikleri ve silinen satır kimlikleri.
CREATE TABLE IF NOT EXISTS public.numerology_classic_purge_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz NULL,
  actor         text        NOT NULL,
  dry_run       boolean     NOT NULL,
  tenant_scope  uuid        NULL,
  params        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  counts        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  by_tenant     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  deleted_ids   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ok            boolean     NOT NULL DEFAULT false,
  step          text        NOT NULL DEFAULT 'started',
  CONSTRAINT numerology_classic_purge_log_actor_chk CHECK (actor ~ '^[a-z0-9_:.-]{1,80}$'),
  CONSTRAINT numerology_classic_purge_log_step_chk CHECK (step ~ '^[a-z_]{2,40}$')
);
CREATE INDEX IF NOT EXISTS numerology_classic_purge_log_ran_idx ON public.numerology_classic_purge_log (ran_at DESC);

-- ─── 6) BORN-LOCKED: RLS + sıfır policy + açık allowlist GRANT ───────────────
DO $numk_lock$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'numerology_classic_analyses',
    'numerology_classic_response_cache',
    'numerology_classic_catalog',
    'numerology_comparative_notes',
    'numerology_classic_provider_calls',
    'numerology_classic_purge_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role', t);
  END LOOP;
END
$numk_lock$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numerology_classic_analyses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numerology_classic_response_cache TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numerology_classic_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numerology_comparative_notes TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.numerology_classic_provider_calls TO service_role;
-- Denetim kaydı: yalnız ekleme + tamamlanma güncellemesi (silme yetkisi YOK).
GRANT SELECT, INSERT, UPDATE ON TABLE public.numerology_classic_purge_log TO service_role;
REVOKE ALL ON SEQUENCE public.numerology_classic_provider_calls_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.numerology_classic_provider_calls_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.numerology_classic_touch() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.numerology_classic_analyses IS 'Klasik Numeroloji kayıtlı analizleri (tenant; isteğe bağlı danışan bağı; yumuşak silme; row_version CAS). Yalnız sunucu API.';
COMMENT ON TABLE public.numerology_classic_response_cache IS 'Klasik Numeroloji normalize sağlayıcı yanıt önbelleği (tenant kapsamlı kişisel veri; ham yanıt yok).';
COMMENT ON TABLE public.numerology_classic_catalog IS 'Klasik Numeroloji global sabit anlam kataloğu (çevrimdışı içe aktarım; kişisel veri yok).';
COMMENT ON TABLE public.numerology_comparative_notes IS 'Mevcut ↔ Klasik Numeroloji karşılaştırma notları (iki kaynağın anlık görüntüsü + sha256). legacy_record_id FK değildir.';
COMMENT ON TABLE public.numerology_classic_purge_log IS 'Klasik Numeroloji kişisel veri temizliği denetim kaydı (kuru çalıştırma dahil; silmeden önce yazılır; kişisel veri yok).';
COMMENT ON TABLE public.numerology_classic_provider_calls IS 'Klasik Numeroloji sağlayıcı çağrı defteri (owner/admin kullanım denetimi; anahtar ve kişisel girdi yok).';

COMMIT;

NOTIFY pgrst, 'reload schema';
