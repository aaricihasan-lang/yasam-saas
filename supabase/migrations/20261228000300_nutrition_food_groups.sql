-- ============================================================
-- 20261228000300_nutrition_food_groups.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / Class A System Reference
-- Besin Grubu Kanonik Sözlüğü — Food Group Vocabulary (basit adjacency-list hiyerarşi)
-- Tablo: public.nutrition_food_groups
--
-- CANONICAL CONTRACT: docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md §D.4
--
-- GLOBAL MODEL: tenant_id YOKTUR → tenant-siz self-FK tek-kolon yeter (glossary_categories'teki
--   kompozit tenant-safe self-FK GEREKMEZ). Doğuştan-kilitli server-only.
-- HİYERARŞİ: parent_id self-FK (nullable = üst seviye). Doğrudan self-loop (parent_id = id) CHECK ile
--   engellenir. Çok-seviye cycle (A→B→A) DDL ile önlenmez → admin-curated küçük vocab, app/seed invariant
--   (canonical contract recursive cycle detector İSTEMİYOR → yazılmaz). Taxonomy engine KURULMAZ.
-- KİMLİK: code lowercase snake_case, immutable.
--
-- Deterministik/fail-fast; public.set_updated_at() yalnız REUSE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_food_groups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text        NOT NULL,
  name_tr      text        NOT NULL,
  name_en      text        NOT NULL,
  parent_id    uuid,
  description  text,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_food_groups_code_chk CHECK (
    code = btrim(code)
    AND code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),

  -- doğrudan self-loop engeli (çok-seviye cycle app/seed invariant'tır).
  CONSTRAINT nutrition_food_groups_no_self_parent_chk CHECK (
    parent_id IS NULL OR parent_id <> id
  ),

  CONSTRAINT nutrition_food_groups_code_key UNIQUE (code),

  -- self-FK: alt grup üst gruba bağlanır. Referanslı parent silinemez (RESTRICT).
  CONSTRAINT nutrition_food_groups_parent_fk
    FOREIGN KEY (parent_id)
    REFERENCES public.nutrition_food_groups (id)
    ON DELETE RESTRICT
);

-- children lookup + parent-FK delete-check.
CREATE INDEX nutrition_food_groups_parent_idx
  ON public.nutrition_food_groups (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE FUNCTION public.nutrition_food_groups_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.code       IS DISTINCT FROM OLD.code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_food_groups identity columns (id, code, created_at) are immutable; insert a new row and archive (is_active=false) the old one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_food_groups_identity_guard
  BEFORE UPDATE ON public.nutrition_food_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.nutrition_food_groups_identity_guard();

CREATE TRIGGER trg_nutrition_food_groups_updated_at
  BEFORE UPDATE ON public.nutrition_food_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_food_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_groups FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_groups FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nutrition_food_groups TO service_role;

COMMIT;
