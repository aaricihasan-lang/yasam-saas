-- HD transit L2 gezegen önbelleği fixture: Supabase'in GERÇEK varsayılanı gibi YENİ tablolara anon / authenticated / service_role
-- tüm yetkiler verilir (prod pg_default_acl: postgres → anon, authenticated, service_role = arwdDxtm). Migration'lar bunları
-- daraltmalı (20271226000000: anon/authenticated; 20271226000100: service_role → yalnız SELECT + INSERT). Yalnız yerel embedded-postgres; SENTETİK; prod'a temas YOK.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
