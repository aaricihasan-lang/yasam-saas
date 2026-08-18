-- =============================================================================
-- 20260930000000_transfer_provenance_hd_bioenergy_blends.sql
--
-- VERİ AKTARIM MERKEZİ — YENİ HEDEFLER İÇİN SNAPSHOT PROVENANCE
--
-- AMAÇ: admin→uzman "bağımsız snapshot (hediye)" modeline şu tabloları dahil etmek:
--   1. human_design_knowledge_records  (HD bilgi kaydı — parent, tenant-scoped)
--   2. human_design_knowledge_sources  (HD kaynak — child, record_id FK CASCADE)
--   3. bioenergy_sessions              (Biyoenerji teknik/uygulama kütüphanesi)
--   4. aromatherapy_blends             (Aromaterapi blend/formül — JSONB snapshot)
--
--   P4 (20260925) + 20260927 (oils) + 20260928 (stone_knowledge) + 20260929
--   (healing_guides) deseninin AYNISI: yalnız iç izleme/rollback kolonları eklenir.
--
-- BAĞLAYICI SNAPSHOT KURALLARI (kod tarafında zorlanır; bu migration yalnız şema):
--   - Yalnız INSERT; UPSERT/REPLACE YOK. Aynı adlı kayıtlar yan yana yaşar.
--   - origin_source_id yalnız provenance/audit içindir; CANLI FK YOKTUR (CASCADE yasak).
--   - Kod GÖRÜNÜR origin_type='admin_transfer'/origin_label YAZMAZ (ürün kuralı:
--     uzmanda admin köken etiketi gösterilmez); yalnız iç origin_transfer_batch_id /
--     origin_source_id / transferred_at yazılır. origin_type/origin_label kolonları
--     geriye-uyum + gelecekte kullanım için eklenir ama NULL kalır.
--   - Mevcut satırlar: origin_type = NULL (legacy / uzmanın kendi kaydı).
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız nullable kolon EKLEME (ADD COLUMN IF NOT EXISTS) — mevcut veri değişmez,
--     kolon düşmez, satır silinmez. RLS/grant modeline DOKUNULMAZ; anon/authenticated
--     yeni yazma yetkisi ALMAZ.
--   - IDEMPOTENT: to_regclass guard + ADD COLUMN IF NOT EXISTS + guard'lı CHECK.
--   - MASS BACKFILL YOK: mevcut kayıtlar OTOMATİK kopyalanmaz; kopya yalnız admin'in
--     bilinçli transfer aksiyonuyla oluşur.
--
-- ⚠️ Otomatik apply DEĞİL. ZORUNLU DEPLOY SIRASI: önce BU migration apply, SONRA kod
--   deploy. Dashboard SQL Editor ile ayrı onayla uygulanır.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'human_design_knowledge_records',
    'human_design_knowledge_sources',
    'bioenergy_sessions',
    'aromatherapy_blends'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'transfer provenance: tablo yok, atlandı: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_type text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_label text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_source_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS transferred_at timestamptz', t);

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_origin_type_chk') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (origin_type IS NULL OR origin_type IN (''admin_transfer'', ''expert_created'', ''legacy''))',
        t, t || '_origin_type_chk'
      );
    END IF;

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
--    WHERE table_schema='public' AND column_name='origin_transfer_batch_id'
--      AND table_name = ANY (ARRAY['human_design_knowledge_records',
--        'human_design_knowledge_sources','bioenergy_sessions','aromatherapy_blends']);
--   -- mevcut tablo sayısı kadar olmalı (4)
-- =============================================================================
