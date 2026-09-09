-- =============================================================================
-- 20270105000000_cupping_calendar_selection_source.sql
--
-- KUPA & HACAMAT — FAZ 5 / AŞAMA 3 — PLAN-GÜN KÖKENİ (provenance) additive kolonu.
--
-- YENİ ÜRÜN KURALI (owner tarafından KİLİTLENDİ): Hacamat Takvimi, uzmanın varsayılan
--   geleneksel Sünnet günlerini (Hicrî 17/19/21 + izinli haftagünü; 17+Salı = Altın)
--   AYNI yıllık takvimin İÇİNE otomatik ekler. Uzman bunları tutabilir, tek tek
--   kaldırabilir, tümünü temizleyebilir veya kendi ekolüne göre kurabilir. Bu nedenle
--   bir plan-gün satırının SİSTEM tarafından mı yoksa MANUEL mi eklendiği KALICI olarak
--   bilinmelidir → tek additive kolon: selection_source.
--
-- NEDEN KOLON (metin/etiket hack'i DEĞİL): bir uzman, formüle MATEMATİKSEL olarak uyan
--   bir günü MANUEL de seçebilir. "Sünnet Günlerini Temizle" YALNIZ sistem-otomatik
--   satırları silmeli, bu manuel günü KORUMALIDIR. Bu ayrım user_label/note/renk üzerinden
--   güvenilir değildir; bu yüzden kontrollü, sunucu-sahipli bir köken kolonu gerekir.
--
-- KAPSAM (ADDITIVE — DROP/RENAME/TABLE-DELETE/backfill-UPDATE YOK):
--   ALTER TABLE cupping_calendar_plan_days:
--     ADD COLUMN selection_source text NOT NULL DEFAULT 'manual'
--       → mevcut satırlar otomatik 'manual' alır (varsayılanla dolar; veri kaybı yok).
--     CHECK (selection_source IN ('manual','sunnah_auto'))  (koşullu idempotent DO-blok).
--   Mevcut UNIQUE(tenant_id, plan_id, gregorian_date) DEĞİŞMEZ (idempotent seed'in temeli).
--   RLS/grant modeli DEĞİŞMEZ (tablo zaten REVOKE ALL + RLS ENABLED — service-role only).
--
-- İDEMPOTENT: ADD COLUMN IF NOT EXISTS; CHECK constraint koşullu DO-blok.
--
-- KOZMİK SINIR: Bu migration Kozmik Hacamat'a (lib/cosmic/hacamat.ts, public.hacamat_rules,
--   app/cosmic-calendar/**, app/api/hacamat/**) DOKUNMAZ; oradan sabit/kural KOPYALAMAZ.
--   17/19/21 + Salı/Altın kuralı uygulama katmanında (lib/cupping/traditionalDays.ts)
--   deterministik olarak türetilir; bu tabloda YALNIZ köken saklanır, kural saklanmaz.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. `db push` / DDL replay YOK. Owner onayı ile uygulanacaktır.
-- =============================================================================

BEGIN;

-- ─── selection_source (köken) — additive, güvenli varsayılan ──────────────────
ALTER TABLE public.cupping_calendar_plan_days
  ADD COLUMN IF NOT EXISTS selection_source text NOT NULL DEFAULT 'manual';

-- Kontrollü değer kümesi (yalnız 'manual' | 'sunnah_auto'). Koşullu → idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cupping_calendar_plan_days'::regclass
      AND contype = 'c'
      AND conname = 'cupping_calendar_plan_days_selection_source_chk'
  ) THEN
    ALTER TABLE public.cupping_calendar_plan_days
      ADD CONSTRAINT cupping_calendar_plan_days_selection_source_chk
      CHECK (selection_source IN ('manual', 'sunnah_auto'));
  END IF;
END $$;

-- Köken-bazlı temizleme sorgularını (WHERE plan_id + selection_source) hızlandıran dar index.
CREATE INDEX IF NOT EXISTS cupping_calendar_plan_days_source_idx
  ON public.cupping_calendar_plan_days (tenant_id, plan_id, selection_source);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   \d cupping_calendar_plan_days → selection_source text NOT NULL DEFAULT 'manual'.
--   Mevcut tüm satırlar selection_source = 'manual' (varsayılanla dolmuş).
--   CHECK: INSERT ... selection_source='x' → 23514 (check_violation).
--   UNIQUE(tenant_id, plan_id, gregorian_date) hâlâ mevcut (idempotent seed temeli).
--   anon/authenticated erişimi hâlâ REVOKE (RLS ENABLED; service-role only) — değişmedi.
--
-- ROLLBACK (gerekirse):
--   DROP INDEX IF EXISTS public.cupping_calendar_plan_days_source_idx;
--   ALTER TABLE public.cupping_calendar_plan_days
--     DROP CONSTRAINT IF EXISTS cupping_calendar_plan_days_selection_source_chk;
--   ALTER TABLE public.cupping_calendar_plan_days DROP COLUMN IF EXISTS selection_source;
-- =============================================================================
