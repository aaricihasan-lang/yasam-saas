-- INFRA 0700 fixture: public.set_updated_at() (Class A DDL'leri trigger'da kullanır).
-- Tablolar + seed gerçek migration dosyalarından (--fixture ile) yüklenir:
--   20261228000000..000600_nutrition_*.sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
