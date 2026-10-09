-- ASTROLOJİ AŞAMA 7B fixture (yalnız yerel embedded-postgres; SENTETİK): Danışan Yolculuğu'nun mevcut
-- clients kolonlarından astroloji 7B'nin okuduklarını minimal fixture'a ekler (telefon, created_at).
-- Supabase'de service_role public tablolarda varsayılan yetkilidir → burada aynısı taklit edilir.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS telefon text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clients TO service_role;
