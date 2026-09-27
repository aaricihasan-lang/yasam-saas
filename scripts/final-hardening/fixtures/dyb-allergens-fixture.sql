-- DY-B / migration 0600 minimal fixture (yalnız yerel embedded-postgres; prod DEĞİL).
-- nutrition_client_allergens son hâli: 20270102000200 + 20270122000100 (custom_label).
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ad text
);

CREATE FUNCTION public.nutrition_client_tenant_guard()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = NEW.client_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'nutrition client row tenant/client mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.nutrition_allergens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_tr text NOT NULL,
  name_en text NOT NULL,
  is_major boolean NOT NULL DEFAULT false
);

CREATE TABLE public.nutrition_client_allergens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  client_id   uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  allergen_id uuid        REFERENCES public.nutrition_allergens(id) ON DELETE RESTRICT,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  custom_label text,
  CONSTRAINT nutrition_client_allergens_unique UNIQUE (tenant_id, client_id, allergen_id),
  CONSTRAINT nutrition_client_allergens_one_source CHECK (
    (allergen_id IS NOT NULL AND custom_label IS NULL)
    OR
    (allergen_id IS NULL AND custom_label IS NOT NULL
       AND btrim(custom_label) <> '' AND char_length(custom_label) <= 120)
  )
);
CREATE UNIQUE INDEX nutrition_client_allergens_custom_uidx
  ON public.nutrition_client_allergens (tenant_id, client_id, lower(btrim(custom_label)))
  WHERE custom_label IS NOT NULL;
CREATE TRIGGER trg_nutrition_client_allergens_tenant_guard
  BEFORE INSERT OR UPDATE ON public.nutrition_client_allergens
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_client_tenant_guard();
ALTER TABLE public.nutrition_client_allergens ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_client_allergens FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_client_allergens TO service_role;

-- Sabit kimlikler
INSERT INTO public.clients (id, tenant_id, ad) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A danışanı'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B danışanı');
INSERT INTO public.nutrition_allergens (id, code, name_tr, name_en, is_major) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'peanut', 'Yer fıstığı', 'Peanut', true),
  ('a2222222-2222-4222-8222-222222222222', 'milk', 'Süt', 'Milk', true);
-- Başlangıç: A danışanında 1 standart + 1 custom beyan
INSERT INTO public.nutrition_client_allergens (tenant_id, client_id, allergen_id, custom_label, note) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', NULL, 'eski'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', NULL, 'Lateks', NULL);
