-- =============================================================================
-- 20261216010000_cupping_transfer_provenance.sql
--
-- KUPA & HACAMAT — ADMIN → UZMAN AKTARIM için provenance kolonları.
--
-- AMAÇ: Kupa & Hacamat master içeriğinin (admin kendi tenant'ında yazar) bir uzmana
--   BAĞIMSIZ SNAPSHOT olarak aktarılabilmesi için, kopya-hedef tablolara İÇ (internal)
--   köken/rollback alanları ekler. Mevcut aktarım motoru (app/api/admin/veri-paylasimi/
--   transfer) yalnız `origin_source_id` / `origin_transfer_batch_id` / `transferred_at`
--   yazar (GÖRÜNÜR origin_type/label ürün kuralı gereği artık YAZILMAZ); yine de tam
--   şema paritesi için 20260925 migration'ıyla BİREBİR aynı 5 kolon + CHECK + index
--   eklenir. Ledger (admin_library_transfer_batches) ve audit CHECK ZATEN MEVCUT
--   (20260925+) → burada tekrar oluşturulmaz.
--
-- BAĞLAYICI: Yalnız INSERT (upsert yok); origin_source_id CANLI FK DEĞİL (kaynak
--   silinse bile kopya kaybolmaz → ON DELETE CASCADE yasak); mevcut satırlar NULL.
--
-- GÜVENLİ / GERİYE UYUMLU: yalnız nullable ADD COLUMN IF NOT EXISTS; kolon düşürülmez;
--   RLS/grant zayıflatılmaz. IDEMPOTENT (to_regclass guard + IF NOT EXISTS).
--
-- ⚠️ DEPLOY SIRASI: önce 20261216000000_cupping_schema, sonra BU migration, sonra kod.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  -- Aktarım motorunun (REGISTRY) dokunduğu Kupa kopya-hedef tabloları.
  -- cupping_point_topics JUNCTION (M:N) tablosu dahildir: origin_transfer_batch_id rollback
  -- için, origin_source_id/transferred_at audit için gereklidir (diğer child/junction
  -- kopya-hedef tablolarıyla parite — healing_guide_sections / hd sources ile aynı standart).
  targets text[] := ARRAY[
    'cupping_points',
    'cupping_point_placements',
    'cupping_topics',
    'cupping_point_topics',
    'cupping_techniques',
    'cupping_knowledge_records',
    'cupping_sources',
    'cupping_safety_notes'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'cupping_transfer_provenance: tablo yok, atlandı: %', t;
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
-- DOĞRULAMA (apply sonrası):
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND column_name='origin_transfer_batch_id'
--      AND table_name LIKE 'cupping_%';   -- 8 (yukarıdaki hedef tablo sayısı)
-- ROLLBACK: provenance kolonları veri kaybı riski nedeniyle otomatik DROP edilmez.
-- =============================================================================
