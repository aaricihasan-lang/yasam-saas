-- =============================================================================
-- 20260928000000_stone_knowledge_articles_transfer_provenance.sql
--
-- SHARED-LIBRARY KALDIRMA / DOĞALTAŞ TAŞ BİLGİ KÜTÜPHANESİ — SNAPSHOT PROVENANCE
--
-- AMAÇ: stone_knowledge_articles'ı FAZ 1 / P4 admin→uzman "bağımsız snapshot
--   (hediye)" modeline dahil etmek. Eskiden uzman GET'i ADMIN_LIBRARY_TENANT_ID
--   (aa8b960b-f4f1-4e5b-89f5-109bc030c147) paylaşımlı kütüphane satırlarını kendi
--   kayıtlarıyla UNION ediyordu (readonly, uzman düzenleyemez/silemez). Yeni model:
--   uzman YALNIZ kendi tenant kayıtlarını görür; admin bir bilgi kaydını vermek
--   isterse veri-paylaşımı ekranından bağımsız kopya (yeni UUID + uzman tenant +
--   provenance) gönderir. Kopya tamamen uzmanın kendi kaydı olur (düzenlenebilir +
--   silinebilir). Kaynak kütüphane DEĞİŞMEZ.
--
-- Bu migration yalnız provenance kolonlarını ekler (P4 20260925000000 deseni;
--   o migration 11 tabloyu kapsıyordu ama stone_knowledge_articles listede yoktu).
--
-- BAĞLAYICI SNAPSHOT KURALLARI (kod tarafında zorlanır; bu migration yalnız şema):
--   - Yalnız INSERT; UPSERT/REPLACE YOK. Aynı başlıklı kayıtlar yan yana yaşar.
--   - origin_source_id yalnız provenance/audit içindir; CANLI FK YOKTUR (kaynak
--     silinse bile hedef kopya ve etiketi KAYBOLMAZ → CASCADE yasak).
--   - Mevcut satırlar (ADMIN_LIBRARY + uzman kayıtları): origin_type = NULL.
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız nullable kolon EKLEME — mevcut veri değişmez, kolon düşmez, satır silinmez.
--   - stone_knowledge_articles zaten RLS-ENABLED + service_role-only (bkz.
--     20260627130000_lock_module_tables_anon.sql). RLS/grant'a DOKUNULMAZ.
--   - IDEMPOTENT: ADD COLUMN IF NOT EXISTS + guard'lı CHECK + IF NOT EXISTS index.
--   - MASS BACKFILL YOK: mevcut kütüphane kayıtları OTOMATİK olarak hiçbir uzmana
--     kopyalanmaz. Kopya yalnız admin'in bilinçli transfer aksiyonuyla olur.
--
-- ⚠️ Otomatik apply DEĞİL. ZORUNLU DEPLOY SIRASI: önce BU migration apply, SONRA
--   kod deploy. Dashboard SQL Editor ile ayrı onayla uygulanır.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.stone_knowledge_articles') IS NULL THEN
    RAISE NOTICE 'stone_knowledge_articles tablosu yok — atlandı';
    RETURN;
  END IF;

  ALTER TABLE public.stone_knowledge_articles ADD COLUMN IF NOT EXISTS origin_type text;
  ALTER TABLE public.stone_knowledge_articles ADD COLUMN IF NOT EXISTS origin_label text;
  ALTER TABLE public.stone_knowledge_articles ADD COLUMN IF NOT EXISTS origin_source_id uuid;
  ALTER TABLE public.stone_knowledge_articles ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid;
  ALTER TABLE public.stone_knowledge_articles ADD COLUMN IF NOT EXISTS transferred_at timestamptz;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stone_knowledge_articles_origin_type_chk'
  ) THEN
    ALTER TABLE public.stone_knowledge_articles
      ADD CONSTRAINT stone_knowledge_articles_origin_type_chk
      CHECK (origin_type IS NULL OR origin_type IN ('admin_transfer', 'expert_created', 'legacy'));
  END IF;

  CREATE INDEX IF NOT EXISTS idx_stone_knowledge_articles_transfer_batch
    ON public.stone_knowledge_articles (origin_transfer_batch_id)
    WHERE origin_transfer_batch_id IS NOT NULL;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='stone_knowledge_articles'
--      AND column_name IN ('origin_type','origin_label','origin_source_id',
--        'origin_transfer_batch_id','transferred_at');            -- 5 olmalı
--   SELECT has_table_privilege('anon','public.stone_knowledge_articles','SELECT'); -- false
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid='public.stone_knowledge_articles'::regclass;       -- true
-- =============================================================================
