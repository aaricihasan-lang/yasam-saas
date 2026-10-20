-- SEC-NEW-03 / SEC-NEW-03a / MI-P08 yerel fixture (embedded-pg; prod'a temas YOK).
-- Frankfurt prod salt-okunur kanıtındaki durumu taklit eder:
--   * postgres + supabase_admin için public şemasında anon/authenticated/service_role'a
--     geniş varsayılan yetkiler (Supabase kurulumu),
--   * 13 tabloda (Numeroloji dahil) istemci rollerine ALL (TRUNCATE + REFERENCES dahil),
--   * client_homeworks / client_stone_photos / tenants üzerinde koşulsuz istemci politikaları,
--     CRUD GRANT'leri kaldırılmış (20260625000000).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN;
  END IF;
END $$;
GRANT CREATE, USAGE ON SCHEMA public TO supabase_admin;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- 13 tablo (varsayılan ACL ile doğar → istemciye ALL). symbols_view bir görünüm olarak.
CREATE TABLE public.bio_imaginations       (id serial primary key, body text);
CREATE TABLE public.chakra_notes           (id serial primary key, body text);
CREATE TABLE public.client_gifts           (id serial primary key, body text);
CREATE TABLE public.client_photos          (id serial primary key, body text);
CREATE TABLE public.client_tasks           (id serial primary key, body text);
CREATE TABLE public.energy_bodies          (id serial primary key, body text);
CREATE TABLE public.healing_guide_sections (id serial primary key, body text);
CREATE TABLE public.module_records         (id serial primary key, body text);
CREATE TABLE public.stone_combinations     (id serial primary key, body text);
CREATE TABLE public.subconscious_causes    (id serial primary key, body text);
CREATE TABLE public.user_location_prefs    (id serial primary key, body text);
CREATE TABLE public.demo_numerology_ip_usage (id serial primary key, body text);
CREATE VIEW  public.symbols_view AS SELECT id, body FROM public.chakra_notes;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bio_imaginations','chakra_notes','client_gifts','client_photos','client_tasks',
    'energy_bodies','healing_guide_sections','module_records','stone_combinations','subconscious_causes',
    'user_location_prefs','demo_numerology_ip_usage'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('INSERT INTO public.%I (body) VALUES (%L), (%L)', t, t || '-1', t || '-2');
  END LOOP;
END $$;

-- Üç geniş-politikalı tablo
CREATE TABLE public.tenants             (id uuid primary key default gen_random_uuid(), name text);
CREATE TABLE public.client_homeworks    (id serial primary key, tenant_id uuid, body text);
CREATE TABLE public.client_stone_photos (id serial primary key, tenant_id uuid, body text);
ALTER TABLE public.tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_homeworks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_stone_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenants, public.client_homeworks, public.client_stone_photos FROM anon, authenticated;
INSERT INTO public.tenants (id, name) VALUES ('00000000-0000-0000-0000-00000000000a', 'A'), ('00000000-0000-0000-0000-00000000000b', 'B');
INSERT INTO public.client_homeworks (tenant_id, body) VALUES ('00000000-0000-0000-0000-00000000000a', 'hw-a'), ('00000000-0000-0000-0000-00000000000b', 'hw-b');
INSERT INTO public.client_stone_photos (tenant_id, body) VALUES ('00000000-0000-0000-0000-00000000000a', 'sp-a');

CREATE POLICY "Allow all client_homeworks"    ON public.client_homeworks    FOR ALL    TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Allow all client_stone_photos" ON public.client_stone_photos FOR ALL    TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "tenants anon read"             ON public.tenants             FOR SELECT TO anon   USING (true);
-- Korunması gerekenler: koşullu istemci politikası + service_role politikası
CREATE POLICY "hw tenant scoped" ON public.client_homeworks FOR SELECT TO authenticated
  USING (tenant_id = '00000000-0000-0000-0000-00000000000a'::uuid);
CREATE POLICY "tenants service"  ON public.tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Mevcut fonksiyon (explicit ACL; migration'dan ETKİLENMEMELİ)
CREATE FUNCTION public.existing_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
