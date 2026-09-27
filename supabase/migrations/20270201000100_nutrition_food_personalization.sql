-- ============================================================
-- 20270201000100_nutrition_food_personalization.sql
--
-- Beslenme — Sistem besinini uzmana özel KİŞİSELLEŞTİRME (copy-on-write) + çalışma alanından
-- KALDIRMA (tenant-hidden). Owner kararı 2026-09-27: uzman sistem besinini düzenleyebilir,
-- ancak global SYSTEM satırı ASLA UPDATE/DELETE edilmez; başka tenant etkilenmez.
--
-- MODEL:
--   • nutrition_foods.origin_food_id (nullable): uzmanın tenant'ındaki KİŞİSEL KOPYA bu SYSTEM
--     besinine bağlıdır. Tenant başına aynı origin için TEK kopya (partial UNIQUE).
--     origin_food_id yalnız fork anında yazılır; sonradan başka değere değiştirilemez
--     (yalnız FK ON DELETE SET NULL ile NULL'a düşebilir).
--   • nutrition_food_tenant_hidden (tenant_id, food_id): SYSTEM besini bu tenant'ın çalışma
--     alanından KALDIRILMIŞ (tombstone). Global satır korunur; diğer tenant'lar görmeye devam eder.
--   • Effective besin (tenant için): kendi satırı → kendisi; SYSTEM satırı → gizliyse YOK,
--     kişisel kopyası varsa KOPYA, yoksa SYSTEM satırı.
--
-- RPC'ler (hepsi SECURITY INVOKER + service_role-only EXECUTE; tenant route guard'dan gelir):
--   nutrition_food_resolve_effective(tenant, system, food) → (id, tenant_id, origin_food_id, redirected)
--   nutrition_food_fork_system(tenant, system, food)      → kopya id (idempotent; atomik tam kopya)
--   nutrition_food_remove(tenant, system, food)           → "Sil" (özgün: gerçek DELETE; kopya:
--                                                            DELETE + origin gizle; SYSTEM: gizle)
--   nutrition_food_reset_personalized(tenant, system, ids[]) → kopyaları sil + ilgili gizlemeyi temizle
--   nutrition_food_search                                  → SYSTEM satırı, kopyası/gizlemesi olan
--                                                            tenant için listelenmez (çift kayıt YOK)
--
-- SQLSTATE: 45014 NOT_FOUND · 45015 BAD_INPUT · 45030 FOOD_SYSTEM_READONLY ·
--           45031 FORK_NAME_CONFLICT (tenant'ta aynı adlı özgün besin var) ·
--           23503 (rehberde kullanılan besin silinemez — nutrition_topic_foods RESTRICT)
-- VERİ-YIKICI MI: HAYIR. Yeni kolon NULL (mevcut satırlar değişmez), yeni tablo boş, yeni
--   fonksiyonlar; search RPC aynı imza/dönüş tipiyle CREATE OR REPLACE (davranış: kopya/gizleme
--   YOKSA birebir aynı sonuç).
-- ROLLBACK: search RPC'yi 20270122000000 sürümüne döndür; DROP FUNCTION'lar; DROP TABLE
--   nutrition_food_tenant_hidden; ALTER TABLE nutrition_foods DROP COLUMN origin_food_id
--   (DİKKAT: kopya satırlar özgün besin gibi kalır).
-- ============================================================

BEGIN;

-- Mevcut nutrition_foods tablosunda kısa süreli kilitler alınır (ADD COLUMN / ADD CONSTRAINT /
-- CREATE INDEX / CREATE TRIGGER). Uzun süren bir işlemin arkasında kuyrukta bekleyip diğer
-- sorguları da bekletmemek için kilit bekleme süresi sınırlanır; aşılırsa migration TAMAMEN
-- geri alınır (tek transaction) ve güvenle tekrar denenebilir.
SET LOCAL lock_timeout = '10s';

-- ─── 1) origin_food_id ──────────────────────────────────────
ALTER TABLE public.nutrition_foods
  ADD COLUMN origin_food_id uuid NULL;

ALTER TABLE public.nutrition_foods
  ADD CONSTRAINT nutrition_foods_origin_fk
    FOREIGN KEY (origin_food_id) REFERENCES public.nutrition_foods (id) ON DELETE SET NULL,
  ADD CONSTRAINT nutrition_foods_origin_not_self_chk
    CHECK (origin_food_id IS NULL OR origin_food_id <> id);

-- Tenant başına aynı sistem besininden TEK kişisel kopya.
CREATE UNIQUE INDEX nutrition_foods_tenant_origin_uidx
  ON public.nutrition_foods (tenant_id, origin_food_id)
  WHERE origin_food_id IS NOT NULL;

-- origin_food_id sonradan değiştirilemez (yalnız NULL'a düşebilir: FK SET NULL).
CREATE FUNCTION public.nutrition_foods_origin_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin_food_id IS DISTINCT FROM OLD.origin_food_id AND NEW.origin_food_id IS NOT NULL THEN
    RAISE EXCEPTION 'nutrition_foods.origin_food_id is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_foods_origin_guard
  BEFORE UPDATE ON public.nutrition_foods
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_foods_origin_guard();

-- Trigger fonksiyonu doğrudan çağrılamaz; yine de istemci rollerine EXECUTE bırakılmaz.
REVOKE ALL ON FUNCTION public.nutrition_foods_origin_guard() FROM PUBLIC, anon, authenticated;

-- ─── 2) tenant-hidden (çalışma alanından kaldırılan SYSTEM besinleri) ───────
CREATE TABLE public.nutrition_food_tenant_hidden (
  tenant_id  uuid        NOT NULL,
  food_id    uuid        NOT NULL REFERENCES public.nutrition_foods (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_food_tenant_hidden_pkey PRIMARY KEY (tenant_id, food_id)
);

CREATE INDEX nutrition_food_tenant_hidden_food_idx
  ON public.nutrition_food_tenant_hidden (food_id);

ALTER TABLE public.nutrition_food_tenant_hidden ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_tenant_hidden FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_food_tenant_hidden TO service_role;

-- ─── 3) effective çözüm ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_food_resolve_effective(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_id          uuid
)
RETURNS TABLE (id uuid, tenant_id uuid, origin_food_id uuid, redirected boolean)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT f.tenant_id INTO v_tenant FROM public.nutrition_foods f WHERE f.id = p_food_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_tenant = p_tenant_id THEN
    RETURN QUERY SELECT f.id, f.tenant_id, f.origin_food_id, false
      FROM public.nutrition_foods f WHERE f.id = p_food_id;
    RETURN;
  END IF;

  IF v_tenant <> p_system_tenant_id THEN
    RETURN; -- üçüncü tenant ASLA görünmez
  END IF;

  IF EXISTS (SELECT 1 FROM public.nutrition_food_tenant_hidden h
             WHERE h.tenant_id = p_tenant_id AND h.food_id = p_food_id) THEN
    RETURN; -- bu tenant çalışma alanından kaldırmış
  END IF;

  RETURN QUERY SELECT c.id, c.tenant_id, c.origin_food_id, true
    FROM public.nutrition_foods c
    WHERE c.tenant_id = p_tenant_id AND c.origin_food_id = p_food_id;
  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT f.id, f.tenant_id, f.origin_food_id, false
    FROM public.nutrition_foods f WHERE f.id = p_food_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_resolve_effective(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_resolve_effective(uuid, uuid, uuid) TO service_role;

-- ─── 4) fork (kişisel kopya) — idempotent, atomik tam kopya ─────────────────
--   Kopyalanan: ad/eş ad/grup/hazırlık/açıklama/not/sıra + /100 g nutrient seti + porsiyonlar
--   + geleneksel nitelik. Kopyalanmayan (bilinçli): SYSTEM tenant'ına ait kaynak bağları
--   (source_id → NULL; kaynaklar tenant'a aittir) ve dış referans (USDA kimliği): kişisel
--   değerler artık dış kaynağın birebir değeri sayılmaz → yeni plan snapshot'ı yanlış
--   "USDA" provenance taşımaz.
CREATE OR REPLACE FUNCTION public.nutrition_food_fork_system(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_id          uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_src  public.nutrition_foods%ROWTYPE;
  v_fork uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_food_id IS NULL OR p_tenant_id = p_system_tenant_id THEN
    RAISE EXCEPTION 'nutrition_food_fork_bad_input' USING ERRCODE = '45015';
  END IF;

  SELECT * INTO v_src FROM public.nutrition_foods
  WHERE id = p_food_id AND tenant_id = p_system_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_food_not_found' USING ERRCODE = '45014';
  END IF;

  IF EXISTS (SELECT 1 FROM public.nutrition_food_tenant_hidden
             WHERE tenant_id = p_tenant_id AND food_id = p_food_id) THEN
    RAISE EXCEPTION 'nutrition_food_not_found' USING ERRCODE = '45014';
  END IF;

  -- Eşzamanlı iki ilk-düzenleme → sıralı (aynı tenant + besin).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_food_id::text, 0));

  SELECT id INTO v_fork FROM public.nutrition_foods
  WHERE tenant_id = p_tenant_id AND origin_food_id = p_food_id;
  IF FOUND THEN
    RETURN v_fork;
  END IF;

  BEGIN
    INSERT INTO public.nutrition_foods (
      tenant_id, name_tr, name_en, aliases, food_group_id, prep_state,
      description, notes, is_active, sort_order, origin_food_id
    ) VALUES (
      p_tenant_id, v_src.name_tr, v_src.name_en, v_src.aliases, v_src.food_group_id, v_src.prep_state,
      v_src.description, v_src.notes, true, v_src.sort_order, p_food_id
    )
    RETURNING id INTO v_fork;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'nutrition_food_fork_name_conflict' USING ERRCODE = '45031';
  END;

  INSERT INTO public.nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams, source_id)
  SELECT p_tenant_id, v_fork, n.nutrient_id, n.amount, n.unit_id, n.basis_grams, NULL
  FROM public.nutrition_food_nutrients n
  WHERE n.tenant_id = p_system_tenant_id AND n.food_id = p_food_id;

  INSERT INTO public.nutrition_food_portions (
    tenant_id, food_id, label_tr, label_en, quantity, measure_unit_id, gram_weight, is_default, sort_order, source_id
  )
  SELECT p_tenant_id, v_fork, p.label_tr, p.label_en, p.quantity, p.measure_unit_id, p.gram_weight,
         p.is_default, p.sort_order, NULL
  FROM public.nutrition_food_portions p
  WHERE p.tenant_id = p_system_tenant_id AND p.food_id = p_food_id;

  INSERT INTO public.nutrition_food_traditional (
    tenant_id, food_id, framework_id, thermal_quality, moisture_quality, notes, source_id
  )
  SELECT p_tenant_id, v_fork, t.framework_id, t.thermal_quality, t.moisture_quality, t.notes, NULL
  FROM public.nutrition_food_traditional t
  WHERE t.tenant_id = p_system_tenant_id AND t.food_id = p_food_id;

  RETURN v_fork;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_fork_system(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_fork_system(uuid, uuid, uuid) TO service_role;

-- ─── 5) "Sil" — çalışma alanından kaldır ────────────────────
--   • tenant'ın ÖZGÜN besini (origin YOK)  → gerçek DELETE (cascade: değer/porsiyon/…; rehber
--     bağı varsa 23503 → route kullanıcı dostu 409).
--   • tenant'ın KİŞİSEL KOPYASI (origin VAR) → kopya DELETE + origin bu tenant için GİZLENİR
--     (sistem besini listede tekrar belirip kullanıcıyı şaşırtmaz).
--   • SYSTEM besini (kopya yok)              → yalnız bu tenant için GİZLENİR (global satır korunur).
--   Dönüş: { "action": "deleted" | "removed_personal" | "hidden", "food_id": ... }
CREATE OR REPLACE FUNCTION public.nutrition_food_remove(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_id          uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_row public.nutrition_foods%ROWTYPE;
  v_fork uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_food_id IS NULL OR p_tenant_id = p_system_tenant_id THEN
    RAISE EXCEPTION 'nutrition_food_remove_bad_input' USING ERRCODE = '45015';
  END IF;

  SELECT * INTO v_row FROM public.nutrition_foods WHERE id = p_food_id FOR UPDATE;
  IF NOT FOUND OR (v_row.tenant_id <> p_tenant_id AND v_row.tenant_id <> p_system_tenant_id) THEN
    RAISE EXCEPTION 'nutrition_food_not_found' USING ERRCODE = '45014';
  END IF;

  IF v_row.tenant_id = p_system_tenant_id THEN
    -- Kişisel kopya varsa, "Sil" kopyayı (effective kaydı) kaldırır.
    SELECT id INTO v_fork FROM public.nutrition_foods
    WHERE tenant_id = p_tenant_id AND origin_food_id = p_food_id FOR UPDATE;
    IF FOUND THEN
      DELETE FROM public.nutrition_foods WHERE tenant_id = p_tenant_id AND id = v_fork;
    END IF;
    INSERT INTO public.nutrition_food_tenant_hidden (tenant_id, food_id)
    VALUES (p_tenant_id, p_food_id)
    ON CONFLICT (tenant_id, food_id) DO NOTHING;
    RETURN jsonb_build_object('action', CASE WHEN v_fork IS NULL THEN 'hidden' ELSE 'removed_personal' END,
                              'food_id', p_food_id);
  END IF;

  DELETE FROM public.nutrition_foods WHERE tenant_id = p_tenant_id AND id = p_food_id;

  IF v_row.origin_food_id IS NOT NULL THEN
    INSERT INTO public.nutrition_food_tenant_hidden (tenant_id, food_id)
    SELECT p_tenant_id, v_row.origin_food_id
    WHERE EXISTS (SELECT 1 FROM public.nutrition_foods o
                  WHERE o.id = v_row.origin_food_id AND o.tenant_id = p_system_tenant_id)
    ON CONFLICT (tenant_id, food_id) DO NOTHING;
    RETURN jsonb_build_object('action', 'removed_personal', 'food_id', p_food_id);
  END IF;

  RETURN jsonb_build_object('action', 'deleted', 'food_id', p_food_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_remove(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_remove(uuid, uuid, uuid) TO service_role;

-- ─── 6) "Sistem değerine dön" — kişisel kopyaları kaldır ─────────────────────
--   YALNIZ origin_food_id'li (sistemden türemiş) kopyalar; özgün uzman besinlerine DOKUNMAZ.
--   Verilen id'lerden biri bile bu tenant'ın kopyası değilse → 45014 (kısmi işlem YOK).
--   İlgili origin için gizleme kaydı varsa temizlenir → sistem besini yeniden kullanılır.
--   Rehberde kullanılan kopya → 23503 (tamamı geri alınır).
CREATE OR REPLACE FUNCTION public.nutrition_food_reset_personalized(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_ids         uuid[]
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_expected integer;
  v_found    integer;
  v_origins  uuid[];
  v_deleted  integer;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id = p_system_tenant_id THEN
    RAISE EXCEPTION 'nutrition_food_reset_bad_input' USING ERRCODE = '45015';
  END IF;
  v_expected := coalesce(cardinality(ARRAY(SELECT DISTINCT unnest(p_food_ids))), 0);
  IF v_expected = 0 THEN
    RETURN 0;
  END IF;

  SELECT count(*), array_agg(origin_food_id) INTO v_found, v_origins
  FROM (
    SELECT f.id, f.origin_food_id FROM public.nutrition_foods f
    WHERE f.tenant_id = p_tenant_id
      AND f.id = ANY (p_food_ids)
      AND f.origin_food_id IS NOT NULL
    FOR UPDATE
  ) s;
  IF v_found <> v_expected THEN
    RAISE EXCEPTION 'nutrition_food_reset_scope_mismatch' USING ERRCODE = '45014';
  END IF;

  DELETE FROM public.nutrition_foods
  WHERE tenant_id = p_tenant_id AND id = ANY (p_food_ids) AND origin_food_id IS NOT NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.nutrition_food_tenant_hidden
  WHERE tenant_id = p_tenant_id AND food_id = ANY (v_origins);

  RETURN v_deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_reset_personalized(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_reset_personalized(uuid, uuid, uuid[]) TO service_role;

-- ─── 7) search: effective küme (SYSTEM satırı kopya/gizleme varsa listelenmez) ─────
--   İmza + dönüş tipi + güvenlik öznitelikleri 20270122000000 ile AYNI (CREATE OR REPLACE).
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
      -- Effective küme: bu tenant'ın kişisel kopyası olan ya da çalışma alanından kaldırdığı
      -- SYSTEM satırı listelenmez (kopya kendi satırı olarak zaten listelenir → çift kayıt YOK).
      AND NOT (
        f.tenant_id = p_system_tenant_id
        AND p_tenant_id <> p_system_tenant_id
        AND (
          EXISTS (SELECT 1 FROM public.nutrition_foods c
                  WHERE c.tenant_id = p_tenant_id AND c.origin_food_id = f.id)
          OR EXISTS (SELECT 1 FROM public.nutrition_food_tenant_hidden h
                     WHERE h.tenant_id = p_tenant_id AND h.food_id = f.id)
        )
      )
  ),
  filtered AS (
    SELECT *,
           count(*) OVER () AS total_count,
           CASE WHEN tsq IS NULL THEN 0 ELSE ts_rank_cd(search_tsv, tsq) END AS rank
    FROM base
    WHERE
      (SELECT NOT is_search FROM q)
      OR (tsq IS NOT NULL AND search_tsv @@ tsq)
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
