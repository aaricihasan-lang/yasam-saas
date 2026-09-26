-- ============================================================
-- 20270122000000_nutrition_food_search_prefix.sql
--
-- Beslenme — Food arama TOKEN-PREFIX düzeltmesi (UAT P3). §10, §16
--   SORUN: 20270101000500 sürümü websearch_to_tsquery('simple', p_query) kullanıyordu.
--   'simple' dictionary stemming YAPMAZ ve `:*` prefix operatörü YOKTUR → "yumur"
--   query token'ı 'yumur', index token'ı 'yumurta' ile eşleşmez → 0 sonuç. Kullanıcı
--   birkaç harf yazınca besin yok sanıyordu.
--
--   ÇÖZÜM (yalnız arama): p_query token'larına `:*` prefix operatörü eklenip AND
--   semantiği (' & ') ile to_tsquery('simple', ...) kurulur → "yumur" → 'yumur:*' →
--   'yumurta' PREFIX eşleşir. Çok-token: "arpa u" → 'arpa:* & u:*' → "Arpa Unu".
--
--   ADDITIVE: 20270101000500 DEĞİŞTİRİLMEZ; bu dosya CREATE OR REPLACE ile aynı
--   signature'ı, güvenlik özniteliklerini (SECURITY INVOKER, STABLE, search_path) ve
--   EXECUTE grant modelini (yalnız service_role) KORUR. Scope/tenant/pagination AYNI:
--   SYSTEM ∪ caller CUSTOM union (üçüncü tenant ASLA); p_limit/p_offset/total_count.
--
--   NORMALİZASYON SİMETRİSİ: p_query route'ta normalizeSearchText ile zaten unaccent+
--   lowercase [a-z0-9]+tek boşluk olarak gelir (index = to_tsvector('simple',
--   yh_immutable_unaccent(...)) ile ayna). SQL yine de SAVUNMACI: token'lardan alnum-dışı
--   temizlenir → tsquery syntax/injection riski yok. İçerikli ama geçerli token üretmeyen
--   sorgu → HİÇBİR sonuç (browse'a düşmez).
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
  WITH q AS (
    -- Arama modu mu? (içerikli p_query) + prefix-tsquery metni ('tok:*' & 'tok:*').
    SELECT
      (p_query IS NOT NULL AND btrim(p_query) <> '') AS is_search,
      (
        SELECT string_agg(tok || ':*', ' & ')
        FROM (
          SELECT regexp_replace(t, '[^a-z0-9]', '', 'g') AS tok
          FROM unnest(regexp_split_to_array(lower(coalesce(p_query, '')), '\s+')) AS t
        ) s
        WHERE tok <> ''
      ) AS qtext
  ),
  base AS (
    SELECT f.*,
           (f.tenant_id = p_system_tenant_id) AS is_system,
           CASE WHEN (SELECT qtext FROM q) IS NULL THEN NULL
                ELSE to_tsquery('simple', (SELECT qtext FROM q)) END AS tsq
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
    WHERE
      -- Browse (arama terimi yok) → tüm erişilebilir satırlar.
      (SELECT NOT is_search FROM q)
      -- Arama + geçerli token → prefix tsquery eşleşmesi.
      OR (tsq IS NOT NULL AND search_tsv @@ tsq)
      -- Arama var ama geçerli token yok (qtext NULL) → iki dal da false → 0 sonuç.
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
