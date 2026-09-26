-- ============================================================
-- 20270122000100_nutrition_client_allergens_custom_label.sql
--
-- Beslenme — Danışan BEYAN alerjenlerine "Diğer" (serbest metin) desteği.
-- ADDITIVE / backward-compatible. Mevcut standart vocab davranışı KORUNUR.
--
-- MODEL: her satır TAM OLARAK bir kaynaktır:
--   A) STANDARD → allergen_id NOT NULL, custom_label NULL (mevcut satırlar).
--   B) CUSTOM   → allergen_id NULL, custom_label NOT NULL (trim'li, boş değil, <=120).
--
-- Otomatik food↔allergen eşleme YOK (advisory beyan). RLS/trigger/privilege DEĞİŞMEZ.
-- Değiştirilmiş: allergen_id artık NULL olabilir (DROP NOT NULL) + custom_label kolonu +
-- CHECK (tek-kaynak) + custom için case-insensitive partial UNIQUE index. Mevcut
-- UNIQUE(tenant_id, client_id, allergen_id) standart alerjenler için korunur (NULL'lar
-- Postgres'te distinct sayıldığından custom satırları etkilemez).
-- ============================================================

BEGIN;

ALTER TABLE public.nutrition_client_allergens
  ALTER COLUMN allergen_id DROP NOT NULL;

ALTER TABLE public.nutrition_client_allergens
  ADD COLUMN IF NOT EXISTS custom_label text;

-- Tek-kaynak + custom trim/boş/uzunluk kuralı (DB seviyesinde zorlanır).
ALTER TABLE public.nutrition_client_allergens
  ADD CONSTRAINT nutrition_client_allergens_one_source CHECK (
    (allergen_id IS NOT NULL AND custom_label IS NULL)
    OR
    (allergen_id IS NULL AND custom_label IS NOT NULL
       AND btrim(custom_label) <> '' AND char_length(custom_label) <= 120)
  );

-- Custom alerjenler: aynı danışanda case-insensitive/trim tekil (Lateks / lateks /  LATEKS).
CREATE UNIQUE INDEX IF NOT EXISTS nutrition_client_allergens_custom_uidx
  ON public.nutrition_client_allergens (tenant_id, client_id, lower(btrim(custom_label)))
  WHERE custom_label IS NOT NULL;

COMMIT;
