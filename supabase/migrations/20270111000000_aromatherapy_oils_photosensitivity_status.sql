-- =============================================================================
-- 20270111000000_aromatherapy_oils_photosensitivity_status.sql
--
-- ARO-004 — FOTOSENSİTİVİTE ÜÇLÜ DURUM (yes / no / unknown)
--
-- SORUN: `is_photosensitive boolean not null default false` alanında `false` hem
--   "fotosensitif DEĞİL" hem "henüz DEĞERLENDİRİLMEDİ" anlamına geliyordu → karışım
--   özeti/Word'de fototoksik bir yağ, toggle işaretlenmediyse hiç uyarı GÖSTERMİYORDU
--   ("uyarı yok = güvenli" yanılgısı).
--
-- ÇÖZÜM: Additive, geriye-uyumlu `photosensitivity_status` metin kolonu.
--   - Yeni kayıt varsayılanı: 'unknown' (bilinçli seçim yapılmadıkça belirsiz).
--   - Mevcut `is_photosensitive = true`  → 'yes'.
--   - Mevcut `is_photosensitive = false` → 'unknown' (KARAR 2: bilinçli "hayır"
--     kanıtlanamadığı için otomatik 'no' KABUL EDİLMEZ; güvenli taraf = belirsiz).
--   - Eski boolean kolon KORUNUR (drop YOK). Kod her iki alanı senkron tutar:
--     is_photosensitive = (photosensitivity_status = 'yes'). Eski boolean'ı okuyan
--     kod kırılmaz; yeni kod üçlü durumu okur.
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız ADD COLUMN + tek seferlik backfill UPDATE. RLS/grant DEĞİŞMEZ.
--   - IDEMPOTENT (IF NOT EXISTS + backfill yalnız NULL/eksik statüde çalışır).
--   - Veri kaybı YOK; hiçbir satır silinmez/başka tenant'a atanmaz.
--
-- ⚠️ DEPLOY SIRASI: önce BU migration apply, SONRA kod deploy. Ters sırada yeni kod
--   olmayan kolona yazmaya çalışır. Otomatik apply DEĞİL; Dashboard SQL Editor + onay.
-- =============================================================================

BEGIN;

ALTER TABLE public.aromatherapy_oils
  ADD COLUMN IF NOT EXISTS photosensitivity_status text NOT NULL DEFAULT 'unknown';

-- Değer alanını kısıtla (yalnız üç geçerli durum).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'aromatherapy_oils_photosensitivity_status_chk'
  ) THEN
    ALTER TABLE public.aromatherapy_oils
      ADD CONSTRAINT aromatherapy_oils_photosensitivity_status_chk
      CHECK (photosensitivity_status IN ('yes', 'no', 'unknown'));
  END IF;
END$$;

-- Backfill: mevcut boolean'dan türet. false → 'unknown' (bilinçli hayır DEĞİL).
-- Yalnız henüz backfill edilmemiş (varsayılan 'unknown' kalmış ama is_photosensitive=true
-- olan) satırları düzeltir; tekrar çalıştırılırsa no-op.
UPDATE public.aromatherapy_oils
   SET photosensitivity_status = 'yes'
 WHERE is_photosensitive = true
   AND photosensitivity_status <> 'yes';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası):
--   SELECT photosensitivity_status, count(*) FROM public.aromatherapy_oils
--    GROUP BY 1;   -- 'yes' = eski is_photosensitive=true sayısı; kalan 'unknown'
--   SELECT count(*) FROM public.aromatherapy_oils
--    WHERE is_photosensitive = true AND photosensitivity_status <> 'yes';  -- 0 olmalı
-- GERİ DÖNÜŞ: ALTER TABLE ... DROP COLUMN photosensitivity_status; (eski boolean korunduğu
--   için kod eski davranışa döner). Veri kaybı: yalnız üçlü-durum ayrımı kaybolur.
-- =============================================================================
