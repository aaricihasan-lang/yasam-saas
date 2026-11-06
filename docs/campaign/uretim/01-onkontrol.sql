-- KAMPANYA MERKEZİ — production ÖN KONTROL (SALT OKUNUR; hiçbir şey yazmaz, kullanıcı verisi okumaz).
-- Supabase SQL Editor'da migration'lardan ÖNCE çalıştırın. Her satır ok = true olmalı.
SELECT 'users tablosunda owner kolonları var' AS kontrol,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users'
           AND column_name IN ('id', 'role', 'active', 'is_super_admin', 'is_demo_account')) = 5 AS ok
UNION ALL
SELECT 'anon / authenticated / service_role rolleri var',
       (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) = 3
UNION ALL
SELECT 'Europe/Istanbul saat dilimi tanımlı',
       EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = 'Europe/Istanbul')
UNION ALL
SELECT 'campaign* tablosu henüz yok (ilk uygulama)',
       NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname LIKE 'campaign%')
UNION ALL
SELECT 'campaign* fonksiyonu henüz yok (ilk uygulama)',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname LIKE 'campaign%');
