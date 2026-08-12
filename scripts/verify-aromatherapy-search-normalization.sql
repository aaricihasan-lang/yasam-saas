-- verify-aromatherapy-search-normalization.sql
-- =============================================================================
-- Migration 20261003000000_aromatherapy_search_normalization.sql POST-APPLY doğrulaması.
-- SALT-OKUNUR. Hiçbir mutation yapmaz. Supabase SQL editor / psql (service_role) ile
-- çalıştırılır. Her satır beklenen değeriyle karşılaştırılmalıdır.
-- =============================================================================

-- 1) Fonksiyon mevcut ve IMMUTABLE ('i').
SELECT proname, provolatile AS expect_i
FROM pg_proc
WHERE proname = 'aromatherapy_search_normalize';   -- 1 satır, provolatile = 'i'

-- 2) Temsili Türkçe normalizasyon davranışı (BYTE-EŞ: searchNormalize.ts).
SELECT
  public.aromatherapy_search_normalize('BİBERİYE')      AS biberiye,     -- 'biberiye'
  public.aromatherapy_search_normalize('İZMİR')         AS izmir,        -- 'izmir'
  public.aromatherapy_search_normalize('Çay')           AS cay,          -- 'cay'
  public.aromatherapy_search_normalize('Sığla')         AS sigla,        -- 'sigla'
  public.aromatherapy_search_normalize('Gül')           AS gul,          -- 'gul'
  public.aromatherapy_search_normalize('Şekersiz')      AS sekersiz,     -- 'sekersiz'
  public.aromatherapy_search_normalize('  çok   boşluk ') AS bosluk,     -- 'cok bosluk'
  public.aromatherapy_search_normalize('kâr')           AS kar_circum;   -- 'kâr' (â KATLANMAZ — Faz 1)

-- 3) 6 hedef tabloda search_norm mevcut ve GENERATED STORED.
--    attgenerated = 's' (stored generated).
SELECT c.relname AS table_name, a.attname, a.attgenerated AS expect_s
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND a.attname = 'search_norm'
  AND c.relname IN (
    'aromatherapy_plant_taxa',
    'aromatherapy_preparations',
    'aromatherapy_sources',
    'aromatherapy_source_passages',
    'aromatherapy_glossary_terms',
    'aromatherapy_claims'
  )
ORDER BY c.relname;   -- 6 satır, hepsi attgenerated='s'

-- 4) RLS/GRANT contract DEĞİŞMEDİ — bu migration additive; anon/authenticated
--    hâlâ yetkisiz (beklenen false), service_role hâlâ yetkili.
SELECT
  has_table_privilege('anon','public.aromatherapy_claims','SELECT')          AS anon_claims_select,       -- false
  has_table_privilege('authenticated','public.aromatherapy_sources','SELECT') AS auth_sources_select,      -- false
  has_table_privilege('anon','public.aromatherapy_plant_taxa','INSERT')       AS anon_taxa_insert,         -- false
  has_table_privilege('service_role','public.aromatherapy_claims','SELECT')   AS svc_claims_select,        -- true
  relrowsecurity
FROM pg_class WHERE oid = 'public.aromatherapy_claims'::regclass;             -- relrowsecurity = true

-- 5) Örnek: gerçek satırda search_norm doldu mu (STORED backfill).
SELECT count(*) AS taxa_with_search_norm
FROM public.aromatherapy_plant_taxa
WHERE search_norm IS NOT NULL;   -- >= toplam satır sayısı (STORED otomatik backfill)
