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
--   - İLK uygulamada eski `is_photosensitive = true`  → 'yes'.
--   - İLK uygulamada eski `is_photosensitive = false` → 'unknown' (KARAR 2: bilinçli
--     "hayır" kanıtlanamadığı için otomatik 'no' KABUL EDİLMEZ; güvenli taraf = belirsiz).
--   - Eski boolean kolon KORUNUR (drop YOK). Kod her iki alanı senkron tutar:
--     is_photosensitive = (photosensitivity_status = 'yes').
--
-- ⚠️ İDEMPOTENCY — VERİ DÜZEYİNDE (ARO-004 fix, gerçek Postgres/PGlite ile doğrulandı):
--   Backfill YALNIZCA kolon BU migration'da İLK KEZ eklendiğinde çalışır (guarded).
--   Migration tekrar çalıştırılırsa (kolon zaten varsa) backfill ATLANIR → sonradan
--   uzman tarafından BİLİNÇLİ seçilmiş yes/no/unknown değerleri KORUNUR; tutarsız
--   (is_photosensitive=true + status='no'/'unknown') satırlar dahi tekrar-uygulamada
--   EZİLMEZ. (Önceki `WHERE is_photosensitive=true AND status<>'yes'` koşulu tekrar
--   çalıştırmada bu bilinçli değerleri 'yes'e çevirebiliyordu — düzeltildi.)
--   Tümü tek transaction → kısmi/başarısız uygulama atomik geri alınır; yeniden
--   deneme temiz ilk-uygulama gibi davranır.
--
-- ⚠️ DEPLOY SIRASI: önce BU migration apply, SONRA kod deploy. Ters sırada yeni kod
--   olmayan kolona yazmaya çalışır. Otomatik apply DEĞİL; Dashboard SQL Editor + onay.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  col_added boolean := false;
BEGIN
  -- 1) Kolonu YALNIZ yoksa ekle; eklendiyse ilk-uygulama olarak işaretle.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'aromatherapy_oils'
       AND column_name  = 'photosensitivity_status'
  ) THEN
    ALTER TABLE public.aromatherapy_oils
      ADD COLUMN photosensitivity_status text NOT NULL DEFAULT 'unknown';
    col_added := true;
  END IF;

  -- 2) CHECK constraint (idempotent — kolon eklenmiş olsun olmasın güvenli).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'aromatherapy_oils_photosensitivity_status_chk'
  ) THEN
    ALTER TABLE public.aromatherapy_oils
      ADD CONSTRAINT aromatherapy_oils_photosensitivity_status_chk
      CHECK (photosensitivity_status IN ('yes', 'no', 'unknown'));
  END IF;

  -- 3) Backfill YALNIZ ilk uygulamada (kolon yeni eklendiyse). Tekrar-uygulamada
  --    bu blok çalışmaz → bilinçli seçilmiş yes/no/unknown değerleri korunur.
  IF col_added THEN
    UPDATE public.aromatherapy_oils
       SET photosensitivity_status = 'yes'
     WHERE is_photosensitive = true;
    -- false satırlar DEFAULT 'unknown' olarak kalır (bilinçli 'no' DEĞİL).
  END IF;
END$$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası):
--   SELECT photosensitivity_status, count(*) FROM public.aromatherapy_oils GROUP BY 1;
--     -- ilk apply: 'yes' = eski is_photosensitive=true sayısı; kalanı 'unknown'.
--   -- Tekrar apply → hiçbir satır değişmez (backfill guarded).
-- GERİ DÖNÜŞ: ALTER TABLE public.aromatherapy_oils DROP COLUMN photosensitivity_status;
--   (eski boolean korunduğu için kod eski davranışa döner). ⚠️ DROP COLUMN üçlü-durum
--   verisini kaybeder → tercih edilen geri dönüş: kolonu bırakmayıp yalnız uygulama
--   sürümünü geri almak (veri korunur).
-- =============================================================================
