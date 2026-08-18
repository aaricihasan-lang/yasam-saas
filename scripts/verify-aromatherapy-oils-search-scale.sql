-- verify-aromatherapy-oils-search-scale.sql
-- =============================================================================
-- Migration 20261004000000_aromatherapy_oils_search_scale.sql POST-APPLY doğrulaması.
-- SALT-OKUNUR. Supabase SQL editor / psql (service_role). Beklenen değerler yorumda.
-- =============================================================================

-- 1) Fonksiyonlar mevcut ve IMMUTABLE ('i').
SELECT proname, provolatile AS expect_i
FROM pg_proc
WHERE proname IN ('aromatherapy_search_normalize', 'aromatherapy_search_array_text')
ORDER BY proname;   -- 2 satır, ikisi de provolatile='i'

-- 2) aromatherapy_oils.search_norm mevcut ve GENERATED STORED (attgenerated='s').
SELECT a.attname, a.attgenerated AS expect_s
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'aromatherapy_oils' AND a.attname = 'search_norm';

-- 3) Temsili normalize (byte-eş: searchNormalize.ts). Not: gerçek satır varsa değeri de görün.
SELECT public.aromatherapy_search_normalize('BİBERİYE Çay') AS norm_demo,   -- 'biberiye cay'
       public.aromatherapy_search_array_text(ARRAY['Sakinleştirici','Ağrı Kesici']) AS arr_demo; -- 'Sakinleştirici Ağrı Kesici'

-- 4) Index mevcut (aro_oils_list_idx).
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'aromatherapy_oils' AND indexname = 'aro_oils_list_idx';

-- 5) RLS/GRANT contract DEĞİŞMEDİ (additive migration).
SELECT has_table_privilege('anon','public.aromatherapy_oils','SELECT')          AS anon_select,   -- false
       has_table_privilege('anon','public.aromatherapy_oils','INSERT')          AS anon_insert,   -- false
       has_table_privilege('authenticated','public.aromatherapy_oils','SELECT') AS auth_select,   -- false
       has_table_privilege('service_role','public.aromatherapy_oils','SELECT')  AS svc_select,    -- true
       relrowsecurity
FROM pg_class WHERE oid = 'public.aromatherapy_oils'::regclass;                  -- relrowsecurity = true

-- 6) Örnek: search_norm STORED backfill doldu mu + toplam satır (rewrite süresi göstergesi).
SELECT count(*) AS toplam_oils,
       count(*) FILTER (WHERE search_norm IS NOT NULL) AS search_norm_dolu
FROM public.aromatherapy_oils;   -- ikisi eşit (STORED otomatik backfill)
