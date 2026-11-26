-- GÖKYÜZÜ ATLASI — analiz kaydı parça sınırı 10 → 16 (KP Transit zaman aralığı kayıt hatası, 2026-11-25).
--
-- Kök neden: `astro_an_params_chk` (20271101000200, Aşama 3) `cardinality(result_ids) <= 10` koydu; o tarihte en çok parçalı teknik
-- transit takvimiydi (≤5 parça). TRANSİT-03 (2026-10-17) KP Transit zaman aralığını ekledi: 7 gezegen × (Sub-Lord + Rasi) + konum
-- tablosu = en çok 15 parça. Kısıt güncellenmediği için 11–15 parçalı KP Transit hesaplanıyor (sonuçlar astro_provider_results'a
-- yazılıyor) ama analiz olarak KAYDEDİLEMİYORDU (23514 → kullanıcıya 500).
--
-- Değişiklik: yalnız bu CHECK'in parça sınırı 16 olur (uygulama sabiti ASTRO_ANALYSIS_MAX_PARTS ile aynı). Diğer koşullar
-- (technique_params nesne + ≤16 KiB) AYNEN korunur. Tek ALTER TABLE (DROP + ADD aynı komutta) → kısıtsız ara an yok.
-- Veri: hiçbir satır değiştirilmez/silinmez; mevcut satırların hepsi ≤10 parçadır → yeni (gevşek) kısıtı zaten sağlar.
-- İdempotent: yeniden çalıştırılırsa aynı tanımı yeniden kurar.
--
-- Geri dönüş (yalnız Owner kararıyla; 10'dan fazla parçalı kayıt varsa BAŞARISIZ olur → önce o kayıtlar ele alınmalı):
--   ALTER TABLE public.astro_analyses DROP CONSTRAINT astro_an_params_chk,
--     ADD CONSTRAINT astro_an_params_chk CHECK (jsonb_typeof(technique_params) = 'object'
--       AND pg_column_size(technique_params) <= 16384 AND cardinality(result_ids) <= 10);

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.astro_analyses') IS NULL THEN
    RAISE EXCEPTION 'astro_analyses yok: astroloji temel migration''ları önce uygulanmalı';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_params_chk' AND conrelid = 'public.astro_analyses'::regclass) THEN
    RAISE EXCEPTION 'astro_an_params_chk yok: 20271101000200 uygulanmamış görünüyor';
  END IF;
END
$$;

ALTER TABLE public.astro_analyses
  DROP CONSTRAINT astro_an_params_chk,
  ADD CONSTRAINT astro_an_params_chk CHECK (
    jsonb_typeof(technique_params) = 'object'
    AND pg_column_size(technique_params) <= 16384
    AND cardinality(result_ids) <= 16
  );

COMMIT;
