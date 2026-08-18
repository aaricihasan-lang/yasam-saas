-- 20261004000000_aromatherapy_oils_search_scale.sql
-- =============================================================================
-- AROMATERAPİ V2 — FAZ 2: Legacy Oils ölçekleme (server-side arama altyapısı).
--
-- AMAÇ: aromatherapy_oils listesi fetch-all yerine server-side paginated + Türkçe-
-- normalize aramaya geçebilsin. Bunun için tabloya `search_norm` generated STORED
-- kolonu + filtre/sort pagination'ı için tek partial index eklenir.
--
-- KAPSAM SINIRI (SADECE ADDITIVE):
--   * FAZ 1 fonksiyonu public.aromatherapy_search_normalize(text) REUSE edilir
--     (yeni normalizer YOK).
--   * YENİ IMMUTABLE yardımcı: public.aromatherapy_search_array_text(text[]) —
--     text[] alanları (therapeutic_properties, target_systems) generated-column'da
--     DETERMİNİSTİK+IMMUTABLE biçimde blob'a katmak için. (array_to_string bazı
--     sürümlerde STABLE işaretli olabildiğinden, generated STORED expression'ın
--     immutability gate'ini garanti altına almak üzere AÇIKÇA IMMUTABLE bir sarmalayıcı
--     kullanılır — PostgreSQL generated-column'da fonksiyonun DEKLARE volatility'sine
--     güvenir. text[] için array_to_string davranışı deterministiktir → deklarasyon
--     doğrudur.)
--   * search_norm blob'u FAZ 1 field parity ile BİREBİR 21 aranabilir kaynağı kapsar
--     (alan kaybı YOK).
--   * RLS / GRANT / POLICY / mevcut kolon / mevcut index DEĞİŞTİRİLMEZ.
--
-- INDEX: aşağıda OILS_INDEX_DECISION. pg_trgm bu fazda EKLENMEZ (TRGM_DEFERRED):
--   aramalar tenant-scoped → planner önce tenant ile daraltır; per-tenant alt küme
--   küçük, `%q%` seq-scan makul. Tek tenant binlerce satıra ulaşırsa ayrı additive
--   migration ile pg_trgm+GIN eklenebilir.
--
-- ROLLBACK (gerekirse):
--   DROP INDEX IF EXISTS public.aro_oils_list_idx;
--   ALTER TABLE public.aromatherapy_oils DROP COLUMN IF EXISTS search_norm;
--   DROP FUNCTION IF EXISTS public.aromatherapy_search_array_text(text[]);
--
-- UYARI (apply): search_norm STORED generated ADD COLUMN = tablo rewrite
-- (ACCESS EXCLUSIVE), süre toplam satır sayısıyla orantılı → düşük-trafik pencere.
-- =============================================================================

BEGIN;

-- text[] → tek text (immutable garanti; generated-column uyumlu).
CREATE OR REPLACE FUNCTION public.aromatherapy_search_array_text(arr text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT array_to_string(coalesce(arr, '{}'::text[]), ' ');
$$;

COMMENT ON FUNCTION public.aromatherapy_search_array_text(text[]) IS
  'Aromaterapi arama: text[] alanları generated search_norm blob''una immutable '
  'biçimde katmak için sarmalayıcı (array_to_string). FAZ 2.';

-- aromatherapy_oils.search_norm — FAZ 1 normalizer + 21 alan parity (alan kaybı yok).
ALTER TABLE public.aromatherapy_oils
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(
      coalesce(name, '') || ' ' ||
      coalesce(latin_name, '') || ' ' ||
      coalesce(english_name, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(origin, '') || ' ' ||
      coalesce(aroma_profile, '') || ' ' ||
      coalesce(plant_part, '') || ' ' ||
      coalesce(main_components, '') || ' ' ||
      coalesce(benefits, '') || ' ' ||
      coalesce(physical_benefits, '') || ' ' ||
      coalesce(emotional_benefits, '') || ' ' ||
      coalesce(skin_benefits, '') || ' ' ||
      coalesce(spiritual_benefits, '') || ' ' ||
      coalesce(diffuser_usage, '') || ' ' ||
      coalesce(massage_usage, '') || ' ' ||
      coalesce(usage_methods, '') || ' ' ||
      coalesce(safety_notes, '') || ' ' ||
      coalesce(chakra_connection, '') || ' ' ||
      coalesce(element_connection, '') || ' ' ||
      public.aromatherapy_search_array_text(therapeutic_properties) || ' ' ||
      public.aromatherapy_search_array_text(target_systems)
    )
  ) STORED;

-- OILS_INDEX_DECISION: TEK partial index.
--   Sorgu deseni (hepsi tenant-scoped, is_active=true):
--     typed route (ucucu/sabit/maserasyon): tenant_id=? AND oil_type=? ORDER BY name,id
--     general /yaglar:                        tenant_id=?               ORDER BY name,id
--   Seçim: (tenant_id, oil_type, name, id) WHERE is_active.
--   Gerekçe: typed route'lar birincil navigasyon (hub facet'leri) → bu index onları
--   SORT'SUZ karşılar (tenant+oil_type eşitliği sonrası name,id sıralı → LIMIT/OFFSET
--   doğrudan). General /yaglar (oil_type yok) tenant eşitliği için index'i kullanır,
--   küçük per-tenant alt küme üzerinde name,id SORT eder (ölçekte kabul). is_active
--   partial → soft-inactive satırlar index dışı, index yalın. Mevcut single-col
--   index'ler (tenant/type/name) korunur (additive; silme yok).
CREATE INDEX IF NOT EXISTS aro_oils_list_idx
  ON public.aromatherapy_oils (tenant_id, oil_type, name, id)
  WHERE is_active;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası — beklenen). Ayrıntı: scripts/verify-aromatherapy-oils-search-scale.sql
--   search_norm generated stored: attgenerated='s'
--   fn IMMUTABLE: aromatherapy_search_normalize + aromatherapy_search_array_text provolatile='i'
--   SELECT search_norm FROM public.aromatherapy_oils LIMIT 1;  -- normalize dolu
--   Index: aro_oils_list_idx mevcut
--   Privilege DEĞİŞMEDİ: has_table_privilege('anon','public.aromatherapy_oils','SELECT') -- false
--   relrowsecurity=true
-- =============================================================================
