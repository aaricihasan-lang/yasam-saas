-- =============================================================================
-- 20270111000100_aromatherapy_blends_carrier_safety.sql
--
-- ARO-024 — TAŞIYICI (CARRIER) YAĞ GÜVENLİK BİLGİSİ SNAPSHOT'I
--
-- SORUN: Karışımda kullanılan taşıyıcı (sabit) yağ yalnız isim/id olarak tutuluyordu;
--   taşıyıcının kontrendikasyon/güvenlik notu/fotosensitivite bilgisi ne ekranda
--   ne Word'de gösteriliyordu (ör. fındık yağı → kuruyemiş alerjisi kör noktası).
--
-- ÇÖZÜM: aromatherapy_blends'e TİPLİ, additive carrier güvenlik snapshot kolonları.
--   İlişkisiz `notes`/`items` JSONB'ına gömmek YERİNE açık kolonlar (veri sözleşmesi
--   net; sorgu/rapor güvenli). Uçucu yağ kalemleriyle aynı snapshot mantığı: kayıt
--   anındaki taşıyıcı güvenlik bilgisi dondurulur (reçete sabitliği; ARO-023 ile uyumlu).
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız ADD COLUMN (3 kolon), DEFAULT'lu → eski satırlar geçerli kalır
--     (carrier_photosensitivity_status='unknown', notlar=''). RLS/grant DEĞİŞMEZ.
--   - IDEMPOTENT. Veri kaybı YOK. Eski blend'ler için "bilinmiyor/boş" = veri yok
--     (varmış gibi ÜRETİLMEZ).
--   - Eski kod bu kolonları görmezden gelir; yeni kod okur/yazar.
--
-- ⚠️ DEPLOY SIRASI: önce BU migration apply, SONRA kod deploy.
--   Otomatik apply DEĞİL; Dashboard SQL Editor + onay.
-- =============================================================================

BEGIN;

ALTER TABLE public.aromatherapy_blends
  ADD COLUMN IF NOT EXISTS carrier_photosensitivity_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS carrier_contraindications      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS carrier_safety_notes           text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'aromatherapy_blends_carrier_photosensitivity_chk'
  ) THEN
    ALTER TABLE public.aromatherapy_blends
      ADD CONSTRAINT aromatherapy_blends_carrier_photosensitivity_chk
      CHECK (carrier_photosensitivity_status IN ('yes', 'no', 'unknown'));
  END IF;
END$$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='aromatherapy_blends' AND column_name LIKE 'carrier_%';
--   -- carrier_oil_id, carrier_oil_name, carrier_photosensitivity_status,
--   -- carrier_contraindications, carrier_safety_notes
-- GERİ DÖNÜŞ: ALTER TABLE ... DROP COLUMN carrier_photosensitivity_status,
--   DROP COLUMN carrier_contraindications, DROP COLUMN carrier_safety_notes;
--   (Eski blend davranışına döner; yalnız carrier güvenlik gösterimi kaybolur.)
-- =============================================================================
