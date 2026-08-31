-- ============================================================
-- 20261229000000_nutrition_foods.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / Class B Tenant Knowledge
-- Besin/İçecek Entity — Food catalogue (tenant-owned)
--
-- CANONICAL: docs/beslenme-metabolik-sistem-faz3-asama1-owner-shell-classb-preflight-2026-08-26.md §F.1
--
-- TENANT KNOWLEDGE: tenant_id NOT NULL (app-layer + composite FK izolasyon; public.tenants FK yok).
--   Doğuştan-kilitli RLS: ENABLE + REVOKE anon/authenticated/PUBLIC + GRANT ALL service_role.
--   Class A referansı GERÇEK FK: food_group_id → public.nutrition_food_groups(id) ON DELETE RESTRICT.
--   Additive UNIQUE(tenant_id, id) → child kompozit tenant-safe FK hedefi.
-- Search: search_tsv GENERATED (immutable yh_immutable_unaccent) + GIN. pg_trgm YOK.
-- Kimlik guard: id + tenant_id + created_at immutable. set_updated_at() REUSE.
-- Deterministik/fail-fast: IF NOT EXISTS / seed / extension YOK.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_foods (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  name_tr       text        NOT NULL,
  name_en       text,
  aliases       text[]      NOT NULL DEFAULT '{}',
  food_group_id uuid,
  prep_state    text,
  description   text,
  notes         text,
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- search_tsv: BEFORE INSERT/UPDATE trigger ile doldurulur (GENERATED DEĞİL).
  -- GEREKÇE: GENERATED ALWAYS ifadesi IMMUTABLE olmak zorundadır; array_to_string(anyarray,text)
  -- PostgreSQL'de STABLE'dır (IMMUTABLE değil) → generated column 42P17 verir. Trigger ifadesi
  -- immutability zorunluluğu taşımaz (repo canonical deseni: yh_index_build_search_tsv). Alias
  -- araması korunur; içerik ve GIN indeksi aynıdır.
  search_tsv    tsvector,

  CONSTRAINT nutrition_foods_name_tr_chk CHECK (btrim(name_tr) <> ''),
  CONSTRAINT nutrition_foods_prep_state_chk CHECK (
    prep_state IS NULL OR prep_state IN ('raw', 'cooked', 'processed')
  ),
  CONSTRAINT nutrition_foods_aliases_chk CHECK (array_position(aliases, NULL) IS NULL),

  -- kompozit tenant-safe FK hedefi (child'lar (tenant_id, food_id) ile bağlanır).
  CONSTRAINT nutrition_foods_tenant_id_key UNIQUE (tenant_id, id),

  -- Class A food group GERÇEK FK (tenant-siz global vocab).
  CONSTRAINT nutrition_foods_food_group_fk
    FOREIGN KEY (food_group_id)
    REFERENCES public.nutrition_food_groups (id)
    ON DELETE RESTRICT
);

-- tenant içi normalize-isim tekilliği (fuzzy/AI değil; düz lower+btrim).
CREATE UNIQUE INDEX nutrition_foods_tenant_name_uidx
  ON public.nutrition_foods (tenant_id, lower(btrim(name_tr)));

CREATE INDEX nutrition_foods_tenant_group_idx
  ON public.nutrition_foods (tenant_id, food_group_id) WHERE food_group_id IS NOT NULL;

CREATE INDEX nutrition_foods_search_idx
  ON public.nutrition_foods USING gin (search_tsv);

CREATE FUNCTION public.nutrition_foods_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_foods identity columns (id, tenant_id, created_at) are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_foods_identity_guard
  BEFORE UPDATE ON public.nutrition_foods
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_foods_identity_guard();

CREATE TRIGGER trg_nutrition_foods_updated_at
  BEFORE UPDATE ON public.nutrition_foods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- search_tsv üretimi (BEFORE INSERT OR UPDATE). Trigger olduğundan STABLE array_to_string
-- güvenle kullanılır (generated column immutability zorunluluğu yoktur). Ağırlık A=name_tr,
-- B=name_en+aliases. yh_immutable_unaccent (IMMUTABLE) korpus/sorgu simetrisi için reuse.
CREATE FUNCTION public.nutrition_foods_search_tsv()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('simple', public.yh_immutable_unaccent(coalesce(NEW.name_tr, ''))), 'A')
    || setweight(to_tsvector('simple', public.yh_immutable_unaccent(
         coalesce(NEW.name_en, '') || ' ' || array_to_string(NEW.aliases, ' '))), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_foods_search_tsv
  BEFORE INSERT OR UPDATE ON public.nutrition_foods
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_foods_search_tsv();

ALTER TABLE public.nutrition_foods ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_foods FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_foods TO service_role;

COMMIT;
