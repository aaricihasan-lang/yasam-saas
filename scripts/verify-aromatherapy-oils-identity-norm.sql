-- verify-aromatherapy-oils-identity-norm.sql
-- =============================================================================
-- Migration 20261005000000_aromatherapy_oils_identity_norm.sql POST-APPLY doğrulaması.
-- SALT-OKUNUR. Supabase SQL editor / psql (service_role). Beklenen değerler yorumda.
-- =============================================================================

-- 1) identity_norm mevcut ve GENERATED STORED (attgenerated='s').
SELECT a.attname, a.attgenerated AS expect_s
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'aromatherapy_oils' AND a.attname = 'identity_norm';
-- BEKLENEN: 1 satır, attgenerated='s'.

-- 2) FAZ 1 normalizer hâlâ IMMUTABLE (değişmedi).
SELECT proname, provolatile AS expect_i
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'aromatherapy_search_normalize';   -- provolatile='i'

-- 3) Backfill parity: her satırın identity_norm'u dolu (STORED otomatik).
SELECT count(*) AS toplam_oils,
       count(identity_norm) AS identity_dolu,
       count(*) FILTER (WHERE identity_norm IS NOT NULL AND identity_norm <> '') AS identity_nonblank
FROM public.aromatherapy_oils;   -- toplam = identity_dolu (STORED NOT NULL); nonblank ≈ isimli satırlar

-- 4) Temsili normalize (byte-eş: searchNormalize.ts). Türkçe fold + NULL-safe.
SELECT public.aromatherapy_search_normalize(
         coalesce('Adaçayı','') || ' ' || coalesce('Salvia officinalis','') || ' ' || coalesce(NULL,'')
       ) AS demo_identity;   -- 'adacayi salvia officinalis'  (NULL english → boş, propagation YOK)

-- 5) Gerçek örnek: "adacayi" ASCII sorgusu identity_norm ile eşleşir mi?
SELECT name, latin_name, english_name
FROM public.aromatherapy_oils
WHERE identity_norm ILIKE '%adacayi%'
LIMIT 5;   -- Adaçayı içeren kayıt(lar) — ham ILIKE'in bulamadığı; identity_norm bulur.

-- 6) İçerik kolonu SIZMADI: içerikte "lav" geçen ama isimde geçmeyen kayıt identity_norm'da YOK.
--    (Kontrol: identity_norm yalnız name/latin/english kapsar.)
SELECT count(*) AS identity_lav_hits
FROM public.aromatherapy_oils
WHERE identity_norm ILIKE '%lav%';   -- yalnız isim/latin/english'inde 'lav' geçenler.

-- 7) RLS / GRANT contract DEĞİŞMEDİ (additive migration).
SELECT has_table_privilege('anon','public.aromatherapy_oils','SELECT')          AS anon_select,   -- false
       has_table_privilege('authenticated','public.aromatherapy_oils','SELECT') AS auth_select,   -- false
       has_table_privilege('service_role','public.aromatherapy_oils','SELECT')  AS svc_select,    -- true
       relrowsecurity
FROM pg_class WHERE oid = 'public.aromatherapy_oils'::regclass;                  -- relrowsecurity = true
