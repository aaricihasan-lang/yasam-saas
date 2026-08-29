-- ============================================================
-- 20270101000500_nutrition_food_search.sql
--
-- Beslenme FAZ 6 — Food arama RPC (500-food ölçeği). §10, §16
--   ts_rank_cd relevance sıralama + pagination (total_count window). search_tsv GIN mevcut.
--   Normalizasyon JS'te (normalizeSearchText) yapılıp p_query olarak gelir → burada
--   websearch_to_tsquery('simple', p_query). SYSTEM ∪ caller CUSTOM union (üçüncü tenant ASLA).
--   SECURITY INVOKER; yalnız service_role EXECUTE. STABLE (yazma yok).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.nutrition_food_search(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_query            text,
  p_group            uuid,
  p_include_inactive boolean,
  p_limit            integer,
  p_offset           integer
)
RETURNS TABLE (
  id            uuid,
  tenant_id     uuid,
  name_tr       text,
  name_en       text,
  aliases       text[],
  food_group_id uuid,
  prep_state    text,
  description   text,
  notes         text,
  is_active     boolean,
  sort_order    integer,
  created_at    timestamptz,
  updated_at    timestamptz,
  is_system     boolean,
  total_count   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
  WITH base AS (
    SELECT f.*,
           (f.tenant_id = p_system_tenant_id) AS is_system,
           CASE WHEN p_query IS NULL OR btrim(p_query) = '' THEN NULL
                ELSE websearch_to_tsquery('simple', p_query) END AS tsq
    FROM public.nutrition_foods f
    WHERE f.tenant_id IN (p_tenant_id, p_system_tenant_id)
      AND (p_include_inactive OR f.is_active = true)
      AND (p_group IS NULL OR f.food_group_id = p_group)
  ),
  filtered AS (
    SELECT *,
           count(*) OVER () AS total_count,
           CASE WHEN tsq IS NULL THEN 0 ELSE ts_rank_cd(search_tsv, tsq) END AS rank
    FROM base
    WHERE tsq IS NULL OR search_tsv @@ tsq
  )
  SELECT id, tenant_id, name_tr, name_en, aliases, food_group_id, prep_state, description, notes,
         is_active, sort_order, created_at, updated_at, is_system, total_count
  FROM filtered
  ORDER BY rank DESC, sort_order ASC, name_tr ASC, id ASC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_search(uuid, uuid, text, uuid, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_search(uuid, uuid, text, uuid, boolean, integer, integer)
  TO service_role;

COMMIT;
