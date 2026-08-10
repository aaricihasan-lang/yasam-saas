-- =============================================================================
-- 20260927000000_aromatherapy_oils_transfer_provenance.sql
--
-- SHARED-LIBRARY KALDIRMA / AROMATERAPİ YAĞLARI — BAĞIMSIZ SNAPSHOT PROVENANCE
--
-- AMAÇ: Aromaterapi Yağları'nı (aromatherapy_oils) FAZ 1 / P4 admin→uzman
--   "bağımsız snapshot (hediye)" modeline dahil etmek. P4 migration'ı
--   (20260925000000) provenance kolonlarını 11 tenant-kopya tablosuna ekledi
--   ama aromatherapy_oils bilinçli olarak DEFERRED bırakılmıştı. Bu migration
--   o boşluğu kapatır — aromatherapy_oils'a AYNI provenance sözleşmesini ekler:
--     origin_type / origin_label / origin_source_id /
--     origin_transfer_batch_id / transferred_at
--
--   Böylece admin, kanonik (tenant_id IS NULL) yağ kütüphanesinden seçili
--   yağları bir uzmana YENİ UUID'li, uzman-tenant-sahipli, düzenlenebilir +
--   silinebilir bağımsız kopya olarak aktarabilir. Kanonik kaynak DEĞİŞMEZ.
--
-- BAĞLAYICI SNAPSHOT KURALLARI (kod tarafında zorlanır; bu migration yalnız şema):
--   - Yalnız INSERT; UPSERT/REPLACE YOK. Aynı isimli yağlar yan yana yaşar.
--   - origin_source_id yalnız provenance/audit içindir; CANLI FK YOKTUR (kanonik
--     kaynak silinse bile hedef kopya ve etiketi KAYBOLMAZ → CASCADE yasak).
--   - Mevcut satırlar (kanonik null-tenant kütüphane + uzman kayıtları):
--     origin_type = NULL (legacy / uzmanın kendi kaydı / kanonik kaynak).
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız nullable kolon EKLEME (ADD COLUMN IF NOT EXISTS) — mevcut veri
--     değişmez, hiçbir kolon düşürülmez, hiçbir satır silinmez.
--   - aromatherapy_oils zaten RLS-ENABLED + service_role-only (bkz.
--     20260705120000_aromatherapy_oils_reference_lock.sql). Bu migration
--     RLS/grant'lara DOKUNMAZ; anon/authenticated yeni yetki ALMAZ.
--   - IDEMPOTENT: ADD COLUMN IF NOT EXISTS + guard'lı CHECK + IF NOT EXISTS index.
--   - MASS BACKFILL YOK: mevcut kanonik/paylaşımlı yağlar OTOMATİK olarak hiçbir
--     uzmana kopyalanmaz. Kopya yalnız admin'in bilinçli transfer aksiyonuyla olur.
--
-- ⚠️ Otomatik apply DEĞİL. ZORUNLU DEPLOY SIRASI: önce BU migration apply, SONRA
--   kod deploy (provenance kolonları olmadan transfer route insert ederse kolon
--   bulunamaz). Dashboard SQL Editor ile ayrı onayla uygulanır.
-- =============================================================================

BEGIN;

-- ── Provenance kolonları — aromatherapy_oils (guard + idempotent) ─────────────
DO $$
BEGIN
  IF to_regclass('public.aromatherapy_oils') IS NULL THEN
    RAISE NOTICE 'aromatherapy_oils tablosu yok — atlandı';
    RETURN;
  END IF;

  ALTER TABLE public.aromatherapy_oils ADD COLUMN IF NOT EXISTS origin_type text;
  ALTER TABLE public.aromatherapy_oils ADD COLUMN IF NOT EXISTS origin_label text;
  ALTER TABLE public.aromatherapy_oils ADD COLUMN IF NOT EXISTS origin_source_id uuid;
  ALTER TABLE public.aromatherapy_oils ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid;
  ALTER TABLE public.aromatherapy_oils ADD COLUMN IF NOT EXISTS transferred_at timestamptz;

  -- origin_type güvenli CHECK: mevcut satırlar NULL → geçerli. FK YOK (bilinçli).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aromatherapy_oils_origin_type_chk'
  ) THEN
    ALTER TABLE public.aromatherapy_oils
      ADD CONSTRAINT aromatherapy_oils_origin_type_chk
      CHECK (origin_type IS NULL OR origin_type IN ('admin_transfer', 'expert_created', 'legacy'));
  END IF;

  -- Batch-scoped sorgu (kısmi silme görünürlüğü / rollback) için partial index.
  CREATE INDEX IF NOT EXISTS idx_aromatherapy_oils_transfer_batch
    ON public.aromatherapy_oils (origin_transfer_batch_id)
    WHERE origin_transfer_batch_id IS NOT NULL;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='aromatherapy_oils'
--      AND column_name IN ('origin_type','origin_label','origin_source_id',
--        'origin_transfer_batch_id','transferred_at');            -- 5 olmalı
--   SELECT has_table_privilege('anon','public.aromatherapy_oils','SELECT'); -- false (değişmedi)
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid='public.aromatherapy_oils'::regclass;             -- true (değişmedi)
--
-- ROLLBACK (gerekirse, manuel — provenance verisi kaybını göze al):
--   (kolonlar bırakılabilir; veri kaybı riski nedeniyle otomatik DROP yok)
-- =============================================================================
