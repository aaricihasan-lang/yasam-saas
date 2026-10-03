-- YH satış öncesi nihai — embedded-PG FIXTURE (yalnız yerel geçici DB; prod'a temas YOK).
-- Repo'da CREATE TABLE'ı olmayan (legacy) tabloların YH migration'larının ihtiyaç duyduğu minimal
-- kolonlarla taklidi + unaccent. Gerçek YH migration'ları bunun üzerine SIRAYLA uygulanır.
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid, role text, active boolean DEFAULT true,
  is_demo_account boolean DEFAULT false, admin_level text, approval_status text DEFAULT 'approved'
);
CREATE TABLE public.tenants (id uuid PRIMARY KEY, status text DEFAULT 'active');
CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, ad text, soyad text);

CREATE TABLE public.stones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, stone_name text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.stone_exclusions (tenant_id text, stone_id uuid);
CREATE TABLE public.minerals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name text);
CREATE TABLE public.stone_knowledge_articles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, title text, is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TABLE public.aromatherapy_oils (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, name text, is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TABLE public.healing_guides (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, name text);
CREATE TABLE public.healing_guide_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guide_id uuid REFERENCES public.healing_guides(id) ON DELETE CASCADE, title text);
CREATE TABLE public.aromatherapy_reference_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, sheet_name text, display_title text NOT NULL,
  headers jsonb DEFAULT '[]', is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.aromatherapy_reference_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.aromatherapy_reference_sheets(id) ON DELETE CASCADE,
  row_index int NOT NULL DEFAULT 0, cells jsonb NOT NULL DEFAULT '{}', is_header boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.cupping_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name text, is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TABLE public.bioenergy_chakras (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name text);
CREATE TABLE public.bioenergy_chakra_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, chakra_id uuid NOT NULL,
  section_key text, block_type text, block_title text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.personal_archives (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, title text, note text, category text, tags text);

-- Danışan kaynakları (client outbox trigger'ları için minimal)
CREATE TABLE public.client_sessions     (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid);
CREATE TABLE public.client_notes        (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid);
CREATE TABLE public.client_homeworks    (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid);
CREATE TABLE public.client_stones       (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid);
CREATE TABLE public.client_combinations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid);
CREATE TABLE public.appointments        (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid);

-- Beslenme (M2 trigger'ları için minimal; kolon adları gerçek DDL ile aynı)
CREATE TABLE public.nutrition_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name_tr text NOT NULL, name_en text,
  aliases text[] NOT NULL DEFAULT '{}', food_group_id uuid, prep_state text, description text, notes text,
  is_active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(), origin_food_id uuid
);
CREATE TABLE public.nutrition_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, topic_type text NOT NULL DEFAULT 'goal',
  framework_id uuid, title text NOT NULL, summary text, is_active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.nutrition_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, template_type text NOT NULL DEFAULT 'meal',
  title text NOT NULL, note text, is_active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.nutrition_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, title text NOT NULL, authors text,
  organization text, publication_year int, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.nutrition_food_portions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, food_id uuid NOT NULL REFERENCES public.nutrition_foods(id) ON DELETE CASCADE, label_tr text NOT NULL, sort_order int DEFAULT 0);
CREATE TABLE public.nutrition_food_traditional (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, food_id uuid NOT NULL REFERENCES public.nutrition_foods(id) ON DELETE CASCADE, framework_id uuid, thermal_quality text, moisture_quality text, notes text);
CREATE TABLE public.nutrition_food_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, food_id uuid NOT NULL REFERENCES public.nutrition_foods(id) ON DELETE CASCADE, source_id uuid NOT NULL REFERENCES public.nutrition_sources(id) ON DELETE RESTRICT, locator text, note text, sort_order int DEFAULT 0);
CREATE TABLE public.nutrition_topic_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, topic_id uuid NOT NULL REFERENCES public.nutrition_topics(id) ON DELETE CASCADE, heading text, content text, sort_order int DEFAULT 0);
CREATE TABLE public.nutrition_topic_foods (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, topic_id uuid NOT NULL REFERENCES public.nutrition_topics(id) ON DELETE CASCADE, food_id uuid NOT NULL REFERENCES public.nutrition_foods(id) ON DELETE RESTRICT, relation_type text NOT NULL DEFAULT 'suitable', rationale text, sort_order int DEFAULT 0);
CREATE TABLE public.nutrition_topic_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, topic_id uuid NOT NULL REFERENCES public.nutrition_topics(id) ON DELETE CASCADE, source_id uuid NOT NULL REFERENCES public.nutrition_sources(id) ON DELETE RESTRICT, locator text, note text, sort_order int DEFAULT 0);
CREATE TABLE public.nutrition_template_meals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, template_id uuid NOT NULL REFERENCES public.nutrition_templates(id) ON DELETE CASCADE, meal_type text, label text NOT NULL, note text, sort_order int DEFAULT 0);
CREATE TABLE public.nutrition_template_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, template_id uuid NOT NULL REFERENCES public.nutrition_templates(id) ON DELETE CASCADE, template_meal_id uuid NOT NULL, food_name_snapshot text NOT NULL, portion_label_snapshot text, note text, sort_order int DEFAULT 0);

-- Kimlikler: owner (admin, gerçek), uzman A, uzman B, demo, kullanıcısız legacy tenant.
INSERT INTO public.tenants (id, status) VALUES
  ('aa8b960b-f4f1-4e5b-89f5-109bc030c147', 'active'),
  ('a0000000-0000-4000-8000-00000000000a', 'active'),
  ('b0000000-0000-4000-8000-00000000000b', 'active'),
  ('40f842a0-e3e8-448c-8971-9a938e1faccb', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'active');
INSERT INTO public.users (tenant_id, role, active, is_demo_account, admin_level) VALUES
  ('aa8b960b-f4f1-4e5b-89f5-109bc030c147', 'admin',  true, false, 'owner'),
  ('a0000000-0000-4000-8000-00000000000a', 'expert', true, false, NULL),
  ('b0000000-0000-4000-8000-00000000000b', 'expert', true, false, NULL),
  ('40f842a0-e3e8-448c-8971-9a938e1faccb', 'expert', true, true,  NULL);
