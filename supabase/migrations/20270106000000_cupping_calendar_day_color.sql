-- =============================================================================
-- 20270106000000_cupping_calendar_day_color.sql
--
-- KUPA & HACAMAT — FAZ 5 / AŞAMA 5 — PLAN-GÜN RENGİ (uzman-tanımlı) additive kolonu.
--
-- ÜRÜN KURALI (owner KİLİTLİ): Uzman, takvimde seçtiği HER günü kendi kontrollü paletinden
--   bir renkle işaretleyebilir ve gün kutusuna kendi kısa açıklamasını (mevcut user_label)
--   yazabilir. Renk ANLAMI platform tarafından SABİTLENMEZ — hiçbir renk hazır tıbbi/
--   geleneksel anlam ("uygun/yasak" vb.) taşımaz; anlamı yalnızca uzman kendi metniyle verir.
--   Renk ve açıklama TAMAMEN OPSİYONELDİR; uzman hiç renk/açıklama vermeden gün seçmeye
--   devam edebilir (color_key NULL = renk yok = varsayılan seçili görünüm).
--
-- NEDEN KONTROLLÜ KOLON (serbest HEX / metin-etiketi DEĞİL): serbest renk seçiminde metin
--   okunurluğu, Word uyumu, baskı görünümü ve erişilebilirlik bozulabilir. Bu yüzden renk
--   kontrollü bir anahtar kümesiyle saklanır (uygulama/Word tarafında sabit görsel eşleme).
--   Kısa açıklama için MEVCUT user_label kolonu (zaten NULLABLE, zaten CALENDAR_PLAN_DAY_WRITABLE
--   allowlist'inde) yeniden değerlendirilir; note (detay notu) anlamı DEĞİŞMEZ / overwrite EDİLMEZ.
--
-- KAPSAM (ADDITIVE — DROP/RENAME/TABLE-DELETE/backfill-UPDATE / seed YOK):
--   ALTER TABLE cupping_calendar_plan_days:
--     ADD COLUMN color_key text (NULLABLE; varsayılan YOK → mevcut satırlar NULL = renk yok;
--       otomatik renk ATANMAZ, mevcut kısa açıklamalar DEĞİŞMEZ).
--     CHECK (color_key IS NULL OR color_key IN (<kontrollü palet>))  (koşullu idempotent DO-blok).
--   Mevcut UNIQUE(tenant_id, plan_id, gregorian_date) DEĞİŞMEZ.
--   Mevcut selection_source kolonu/CHECK/index DEĞİŞMEZ.
--   RLS/grant modeli DEĞİŞMEZ (tablo zaten REVOKE ALL + RLS ENABLED — service-role only).
--
-- İDEMPOTENT: ADD COLUMN IF NOT EXISTS; CHECK constraint koşullu DO-blok.
--
-- KOZMİK SINIR: Bu migration Kozmik Hacamat'a (lib/cosmic/hacamat.ts, public.hacamat_rules,
--   app/cosmic-calendar/**, app/api/hacamat/**) DOKUNMAZ; oradan sabit/kural KOPYALAMAZ.
--   Renk yalnız görsel işarettir; hüküm/kural saklanmaz.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. `db push` / DDL replay YOK. Owner onayı ile uygulanacaktır.
--   Migration prod'a uygulanmadan renk/açıklama KAYDETME (DB'ye bağımlı) çalışmayabilir.
-- =============================================================================

BEGIN;

-- ─── color_key (uzman-tanımlı renk) — additive, NULLABLE, varsayılansız ───────
--   Varsayılan YOK: mevcut satırlar NULL (renk yok) kalır; otomatik renk atanmaz.
ALTER TABLE public.cupping_calendar_plan_days
  ADD COLUMN IF NOT EXISTS color_key text;

-- Kontrollü palet kümesi (NULL = renk yok). Koşullu → idempotent. Anahtar/değer eşlemesi
-- lib/cupping/calendarTypes.ts CUPPING_DAY_COLOR_KEYS ile BİREBİR (tek doğruluk kaynağı).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cupping_calendar_plan_days'::regclass
      AND contype = 'c'
      AND conname = 'cupping_calendar_plan_days_color_key_chk'
  ) THEN
    ALTER TABLE public.cupping_calendar_plan_days
      ADD CONSTRAINT cupping_calendar_plan_days_color_key_chk
      CHECK (
        color_key IS NULL OR color_key IN
          ('blue', 'green', 'yellow', 'red', 'purple', 'orange', 'pink')
      );
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   \d cupping_calendar_plan_days → color_key text (NULLABLE, DEFAULT yok).
--   Mevcut tüm satırlar color_key = NULL (renk yok; otomatik atama YOK).
--   CHECK: INSERT/UPDATE ... color_key='x' → 23514 (check_violation).
--   UPDATE ... color_key=NULL → geçerli (renk kaldırılabilir; gün seçili kalır — DELETE ayrı).
--   UNIQUE(tenant_id, plan_id, gregorian_date) + selection_source hâlâ mevcut (değişmedi).
--   anon/authenticated erişimi hâlâ REVOKE (RLS ENABLED; service-role only) — değişmedi.
--
-- ROLLBACK (gerekirse):
--   ALTER TABLE public.cupping_calendar_plan_days
--     DROP CONSTRAINT IF EXISTS cupping_calendar_plan_days_color_key_chk;
--   ALTER TABLE public.cupping_calendar_plan_days DROP COLUMN IF EXISTS color_key;
-- =============================================================================
