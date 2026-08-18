-- =============================================================================
-- 20260929000000_healing_guides_transfer_provenance.sql
--
-- ADMIN → UZMAN VERİ AKTARIM MERKEZİ / ŞİFA REHBERİ — SNAPSHOT PROVENANCE
--
-- AMAÇ: Şifa Rehberi'ni (healing_guides + healing_guide_sections) admin→uzman
--   "bağımsız snapshot (hediye)" modeline dahil etmek. P4 (20260925000000) 11
--   tabloya, 20260927 aromatherapy_oils'a, 20260928 stone_knowledge_articles'a
--   provenance ekledi; Şifa Rehberi listede yoktu. Bu migration o boşluğu kapatır.
--
--   Şifa Rehberi RELATIONAL'dır: healing_guides (parent, tenant_id-scoped) +
--   healing_guide_sections (child, guide_id FK, ON DELETE CASCADE). Transfer
--   route'u her rehberi yeni UUID ile kopyalar ve alt bölümlerin guide_id'sini
--   YENİ parent id'ye remap eder (kaynak parent id'sine bağlamaz). Bu migration
--   yalnız provenance kolonlarını ekler; FK remap KOD tarafında yapılır.
--
-- BAĞLAYICI SNAPSHOT KURALLARI (kod tarafında zorlanır; bu migration yalnız şema):
--   - Yalnız INSERT; UPSERT/REPLACE YOK. Aynı adlı rehberler yan yana yaşar.
--   - origin_source_id yalnız provenance/audit içindir; CANLI FK YOKTUR (kaynak
--     silinse bile hedef kopya ve etiketi KAYBOLMAZ → CASCADE yasak).
--   - Mevcut satırlar: origin_type = NULL (legacy / uzmanın kendi kaydı).
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız nullable kolon EKLEME (ADD COLUMN IF NOT EXISTS) — mevcut veri
--     değişmez, hiçbir kolon düşürülmez, hiçbir satır silinmez.
--   - healing_guides / healing_guide_sections RLS/grant modeline DOKUNULMAZ;
--     anon/authenticated yeni yazma yetkisi ALMAZ.
--   - IDEMPOTENT: to_regclass guard + ADD COLUMN IF NOT EXISTS + guard'lı CHECK.
--   - MASS BACKFILL YOK: mevcut rehberler OTOMATİK olarak hiçbir uzmana kopyalanmaz.
--     Kopya yalnız admin'in bilinçli transfer aksiyonuyla oluşur.
--
-- NOT: healing_guide_sections'ın tenant_id kolonu YOKTUR (izolasyon guide_id
--   üzerinden transitiftir); provenance kolonları yine de rollback/audit için eklenir.
--
-- ⚠️ Otomatik apply DEĞİL. ZORUNLU DEPLOY SIRASI: önce BU migration apply, SONRA
--   kod deploy. Dashboard SQL Editor ile ayrı onayla uygulanır.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  targets text[] := ARRAY['healing_guides', 'healing_guide_sections'];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'healing transfer: tablo yok, atlandı: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_type text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_label text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_source_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS transferred_at timestamptz', t);

    -- origin_type güvenli CHECK: mevcut satırlar NULL → geçerli. FK YOK (bilinçli).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_origin_type_chk') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (origin_type IS NULL OR origin_type IN (''admin_transfer'', ''expert_created'', ''legacy''))',
        t, t || '_origin_type_chk'
      );
    END IF;

    -- Batch-scoped sorgu (rollback / kısmi silme görünürlüğü) için partial index.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (origin_transfer_batch_id) WHERE origin_transfer_batch_id IS NOT NULL',
      'idx_' || t || '_transfer_batch', t
    );
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND column_name='origin_type'
--      AND table_name = ANY (ARRAY['healing_guides','healing_guide_sections']);  -- 2 olmalı
--   SELECT has_table_privilege('anon','public.healing_guides','INSERT');          -- false
-- =============================================================================
