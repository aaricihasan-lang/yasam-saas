-- =============================================================================
-- 20261211000000_sifa_rehberi_search.sql
--
-- Şifa Rehberi — EK FAZ 1: server-side gelişmiş arama + bounded keyset liste altyapısı.
--
-- BU MIGRATION YALNIZ ADDITIVE'DİR (schema/data REWRITE YOK):
--   1) pg_trgm extension (Supabase contrib; ayrı servis/ücret YOK).
--   2) public.sifa_fold(text)         — deterministik Türkçe arama katlama; JS foldTr ile
--      BİT-PARITY (lib/sifa-rehberi/normalizeTr.ts). IMMUTABLE + locale-bağımsız.
--   3) public.sifa_is_meaningful(text)— JS isMeaningfulText paritesi (placeholder eleme).
--   4) sifa_guide_haystack / sifa_section_haystack — aranabilir metin (client haystack
--      sözleşmesiyle AYNI alanlar; drift önlemek için tek yerde tanımlı).
--   5) 3 index: 2× pg_trgm GIN expression (guide + section) + 1× btree keyset (tenant,fold(name),id).
--   6) public.search_healing_guides(...) — tenant-bağlı, keyset, bounded arama/list RPC.
--   7) public.list_healing_guide_categories(...) — tenant-bağlı kategori facet.
--   8) public.resolve_healing_guide_ids(...) — Word "filtreli" export için TÜM eşleşen id'ler.
--
-- ⛔ YAPILMAYANLAR: mevcut section'lar yeniden tiplenmez; hiçbir satır rewrite/backfill
--    edilmez; yeni section_type açılmaz; healing_guides/healing_guide_sections kolon
--    şeması DEĞİŞMEZ; mevcut index'lere DOKUNULMAZ.
--
-- GÜVENLİK: tüm RPC'ler SECURITY DEFINER + SET search_path='' + schema-qualified +
--    least-privilege (yalnız service_role EXECUTE). tenant_id caller'dan (sunucu
--    session'ından) gelir; RPC her guide seçiminde tenant_id'yi ZORUNLU bağlar.
--    section izolasyonu parent guide sahipliği üzerinden (healing_guide_sections'ta
--    tenant_id kolonu YOKTUR).
--
-- IDEMPOTENT: CREATE EXTENSION IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
--    CREATE INDEX IF NOT EXISTS.
--
-- ⚠️ APPLY POLİTİKASI: Bu bir DOSYA'dır. EK FAZ 1 / BÖLÜM 2 kapsamında PRODUCTION'A
--    UYGULANMADI. Apply ayrı onay kapısıdır (Bölüm 3; DDL yalnız Dashboard/onaylı).
-- =============================================================================

BEGIN;

-- 1) pg_trgm — substring (left-anchored DEĞİL) ILIKE için GIN trigram index desteği.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- 2) sifa_fold — JS foldTr birebir karşılığı (bkz. lib/sifa-rehberi/normalizeTr.ts).
--
--    JS sırası: NFC → toLocaleLowerCase("tr-TR") → {ı,İ,i̇→i · ş→s · ç→c · ğ→g ·
--    ü→u · ö→o} → NFD → combining-mark strip → whitespace collapse → trim.
--
--    SQL burada Türkçe'ye özel harfleri (HER İKİ CASE) `translate` ile AÇIKÇA katlar;
--    böylece lower()'ın locale/collation davranışına (İ/I/ı sürprizi) BAĞLI DEĞİLDİR.
--    Aksanlar NFD + [̀-ͯ] strip ile temizlenir; kalan düz-latin case'i
--    lower() ile (ASCII-güvenli) çözülür. Sonuç locale'den bağımsız → gerçekten IMMUTABLE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sifa_fold(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      lower(
        regexp_replace(
          normalize(
            translate(
              normalize(coalesce(input, ''), NFC),
              'İIıŞşÇçĞğÜüÖö',
              'iiissccgguuoo'
            ),
            NFD
          ),
          '[̀-ͯ]', '', 'g'
        )
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3) sifa_is_meaningful — JS isMeaningfulText paritesi. Boş/whitespace veya bilinen
--    placeholder cümlesi (TAM eşleşme, folded) → false. symptoms haystack'e yalnız
--    anlamlıysa girer (client davranışı korunur; placeholder aramada eşleşmez).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sifa_is_meaningful(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN value IS NULL OR btrim(value) = '' THEN false
    WHEN public.sifa_fold(value) = '' THEN false
    WHEN public.sifa_fold(value) = ANY (ARRAY[
      -- PLACEHOLDER_TEXTS (normalizeTr.ts) — folded biçimleri:
      'bu bolum icin henuz bilgi eklenmemis.',
      'bu bolum icin icerik henuz eklenmemis.',
      'bu baslik icin henuz aciklama eklenmemis.',
      'henuz ozet eklenmedi.',
      'henuz ozet eklenmemis.',
      'henuz kayit yok',
      'bilgi eklenmemis',
      'icerik eklenmemis'
    ]) THEN false
    ELSE true
  END;
$$;

-- -----------------------------------------------------------------------------
-- 4) Aranabilir metin (haystack) — client matchesListSearch/sectionSnippet sözleşmesiyle
--    AYNI alanlar. Tek tanım: index ile RPC arasında drift imkânsız (aynı fonksiyon).
--    NULL-safe. Guide: name + category + (symptoms if meaningful) + 21 legacy metin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sifa_guide_haystack(g public.healing_guides)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    coalesce(g.name, '') || ' ' ||
    coalesce(g.category, '') || ' ' ||
    CASE WHEN public.sifa_is_meaningful(g.symptoms) THEN g.symptoms ELSE '' END || ' ' ||
    coalesce(g.general_summary, '') || ' ' ||
    coalesce(g.medical_causes, '') || ' ' ||
    coalesce(g.subconscious_causes, '') || ' ' ||
    coalesce(g.temperament_causes, '') || ' ' ||
    coalesce(g.other_causes, '') || ' ' ||
    coalesce(g.iridology_match, '') || ' ' ||
    coalesce(g.hand_analysis_match, '') || ' ' ||
    coalesce(g.cupping_leech, '') || ' ' ||
    coalesce(g.reflexology, '') || ' ' ||
    coalesce(g.diet_recommendations, '') || ' ' ||
    coalesce(g.herbal_methods, '') || ' ' ||
    coalesce(g.stone_recommendations, '') || ' ' ||
    coalesce(g.aromatherapy, '') || ' ' ||
    coalesce(g.meditation, '') || ' ' ||
    coalesce(g.breathwork, '') || ' ' ||
    coalesce(g.bioenergy, '') || ' ' ||
    coalesce(g.massage, '') || ' ' ||
    coalesce(g.daily_routine, '') || ' ' ||
    coalesce(g.sleep_routine, '') || ' ' ||
    coalesce(g.supportive_alternative_methods, '') || ' ' ||
    coalesce(g.islamic_recommendations, '');
$$;

CREATE OR REPLACE FUNCTION public.sifa_section_haystack(s public.healing_guide_sections)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    coalesce(s.title, '') || ' ' ||
    coalesce(s.note, '') || ' ' ||
    coalesce(s.mode, '') || ' ' ||
    coalesce(s.source, '') || ' ' ||
    coalesce(s.source_kind, '') || ' ' ||
    coalesce(s.expert_note, '') || ' ' ||
    coalesce(s.attention, '');
$$;

-- -----------------------------------------------------------------------------
-- 5) Index'ler.
--    a) 2× pg_trgm GIN expression index — substring ILIKE hızlandırma.
--    b) 1× btree keyset index — (tenant_id, sifa_fold(name), id) deterministik
--       A–Z sıralama + keyset "daha fazla yükle".
--    Mevcut healing_guide_sections_guide_id_idx / _type_idx'e DOKUNULMAZ.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS healing_guides_search_trgm_idx
  ON public.healing_guides
  USING gin (public.sifa_fold(public.sifa_guide_haystack(healing_guides.*)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS healing_guide_sections_search_trgm_idx
  ON public.healing_guide_sections
  USING gin (public.sifa_fold(public.sifa_section_haystack(healing_guide_sections.*)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS healing_guides_tenant_foldname_idx
  ON public.healing_guides (tenant_id, public.sifa_fold(name), id);

-- -----------------------------------------------------------------------------
-- 6) search_healing_guides — tenant-bağlı, keyset, bounded arama/list RPC.
--    Boş q → A–Z bounded liste. Dolu q → substring arama (guide-expr OR section EXISTS).
--    LIKE-meta (\ % _) literal kaçışlanır; dynamic SQL YOK. limit cap 100.
--    Keyset: (sifa_fold(name), id) tuple; limit+1 çağıran tarafta hasMore hesaplar.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_healing_guides(
  p_tenant_id  uuid,
  p_q          text,
  p_category   text,
  p_limit      integer,
  p_after_fold text,
  p_after_id   uuid
)
RETURNS SETOF public.healing_guides
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
-- force_custom_plan: LIKE deseni bir parametre (v_pat) olduğundan, generic plan
-- trigram çıkaramaz → trgm GIN kullanılmaz. Custom plan zorlaması deseni bilinir
-- kılar → pg_trgm index'i güvenilir kullanılır (dynamic SQL YOK).
SET plan_cache_mode = 'force_custom_plan'
AS $$
DECLARE
  -- Cap 200: route `limit+1` isteyerek hasMore tespit eder (UI limit ≤ 100).
  v_limit int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_q     text := public.sifa_fold(coalesce(p_q, ''));
  v_cat   text := nullif(btrim(coalesce(p_category, '')), '');
  v_pat   text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  -- Boş q → keyset A–Z liste dalı (btree keyset index kullanır). Dolu q → arama dalı
  -- (trgm GIN kullanır). AYRI RETURN QUERY: `v_q=''` OR-dalı parametreye bağlı olduğu
  -- için tek sorguda planner index'i budayamaz/kullanamazdı → dallar ayrılır.
  IF v_q = '' THEN
    RETURN QUERY
    SELECT g.*
    FROM public.healing_guides g
    WHERE g.tenant_id = p_tenant_id
      AND (v_cat IS NULL OR g.category = v_cat)
      AND (
        p_after_fold IS NULL
        OR (public.sifa_fold(g.name) > p_after_fold)
        OR (public.sifa_fold(g.name) = p_after_fold AND g.id > p_after_id)
      )
    ORDER BY public.sifa_fold(g.name) ASC, g.id ASC
    LIMIT v_limit;
    RETURN;
  END IF;

  -- LIKE-escape: '\' '%' '_' kullanıcı metninde LITERAL olmalı (wildcard değil).
  v_pat := '%' ||
    replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') ||
    '%';

  -- Candidate-id UNION deseni: guide-eşleşmeleri VE section-eşleşmeleri (parent guide
  -- tenant'ına bağlı JOIN) trgm GIN ile ayrı ayrı toplanır; dış sorgu yalnız küçük aday
  -- kümesini keyset + sırala + limit'ler. (OR+ORDER+LIMIT tek sorgusu planner'ı btree'ye
  -- iterek trgm'i baypas ederdi — bu desen her iki trgm index'ini de kullanır.)
  RETURN QUERY
  SELECT g.*
  FROM public.healing_guides g
  WHERE g.tenant_id = p_tenant_id
    AND g.id IN (
      SELECT gg.id
      FROM public.healing_guides gg
      WHERE gg.tenant_id = p_tenant_id
        AND public.sifa_fold(public.sifa_guide_haystack(gg)) LIKE v_pat ESCAPE '\'
      UNION
      SELECT s.guide_id
      FROM public.healing_guide_sections s
      JOIN public.healing_guides gh ON gh.id = s.guide_id
      WHERE gh.tenant_id = p_tenant_id
        AND public.sifa_fold(public.sifa_section_haystack(s)) LIKE v_pat ESCAPE '\'
    )
    AND (v_cat IS NULL OR g.category = v_cat)
    AND (
      p_after_fold IS NULL
      OR (public.sifa_fold(g.name) > p_after_fold)
      OR (public.sifa_fold(g.name) = p_after_fold AND g.id > p_after_id)
    )
  ORDER BY public.sifa_fold(g.name) ASC, g.id ASC
  LIMIT v_limit;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7) list_healing_guide_categories — tenant-bağlı, non-empty distinct kategori facet.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_healing_guide_categories(
  p_tenant_id uuid
)
RETURNS TABLE (category text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  RETURN QUERY
  SELECT DISTINCT btrim(g.category) AS category
  FROM public.healing_guides g
  WHERE g.tenant_id = p_tenant_id
    AND g.category IS NOT NULL
    AND btrim(g.category) <> ''
  ORDER BY btrim(g.category) ASC;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8) resolve_healing_guide_ids — Word "filtreli" export için TÜM eşleşen guide id'ler
--    (UI'nin ilk-sayfa limit'ine BAĞLI DEĞİL). Aynı canonical arama semantiği; yalnız
--    id döner (içerik değil). service_role-only; word-report route'u kullanır.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_healing_guide_ids(
  p_tenant_id uuid,
  p_q         text,
  p_category  text
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET plan_cache_mode = 'force_custom_plan'
AS $$
DECLARE
  v_q   text := public.sifa_fold(coalesce(p_q, ''));
  v_cat text := nullif(btrim(coalesce(p_category, '')), '');
  v_pat text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  IF v_q = '' THEN
    RETURN QUERY
    SELECT g.id
    FROM public.healing_guides g
    WHERE g.tenant_id = p_tenant_id
      AND (v_cat IS NULL OR g.category = v_cat)
    ORDER BY public.sifa_fold(g.name) ASC, g.id ASC;
    RETURN;
  END IF;

  v_pat := '%' ||
    replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') ||
    '%';

  RETURN QUERY
  SELECT g.id
  FROM public.healing_guides g
  WHERE g.tenant_id = p_tenant_id
    AND g.id IN (
      SELECT gg.id
      FROM public.healing_guides gg
      WHERE gg.tenant_id = p_tenant_id
        AND public.sifa_fold(public.sifa_guide_haystack(gg)) LIKE v_pat ESCAPE '\'
      UNION
      SELECT s.guide_id
      FROM public.healing_guide_sections s
      JOIN public.healing_guides gh ON gh.id = s.guide_id
      WHERE gh.tenant_id = p_tenant_id
        AND public.sifa_fold(public.sifa_section_haystack(s)) LIKE v_pat ESCAPE '\'
    )
    AND (v_cat IS NULL OR g.category = v_cat)
  ORDER BY public.sifa_fold(g.name) ASC, g.id ASC;
END;
$$;

-- -----------------------------------------------------------------------------
-- Least-privilege: yalnız service_role (sunucu API) çağırabilir.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.search_healing_guides(uuid, text, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_healing_guides(uuid, text, text, integer, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.list_healing_guide_categories(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.list_healing_guide_categories(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_healing_guide_ids(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_healing_guide_ids(uuid, text, text) TO service_role;

-- sifa_fold/sifa_is_meaningful/haystack fonksiyonları saf metin yardımcılarıdır ve
-- index tanımı için gereklidir; ayrı bir erişim yüzeyi açmazlar (tablo verisi
-- yalnız service_role'lü RPC/route üzerinden okunur). Yine de yürütmeyi daraltıyoruz.
REVOKE ALL ON FUNCTION public.sifa_guide_haystack(public.healing_guides) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sifa_section_haystack(public.healing_guide_sections) FROM PUBLIC, anon, authenticated;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma — beklenen):
--   SELECT public.sifa_fold('ASTIM') = public.sifa_fold('astım');                       -- true
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--     WHERE proname IN ('search_healing_guides','list_healing_guide_categories','resolve_healing_guide_ids');
--     -- prosecdef=t, proconfig={search_path=""}
--   SELECT has_function_privilege('anon','public.search_healing_guides(uuid,text,text,integer,text,uuid)','EXECUTE');          -- false
--   SELECT has_function_privilege('authenticated','public.search_healing_guides(uuid,text,text,integer,text,uuid)','EXECUTE'); -- false
--   SELECT has_function_privilege('service_role','public.search_healing_guides(uuid,text,text,integer,text,uuid)','EXECUTE');  -- true
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('healing_guides','healing_guide_sections')
--     AND indexname LIKE '%search%' OR indexname LIKE '%foldname%';
--   EXPLAIN (yük altında): search WHERE dalı trgm GIN bitmap index scan kullanmalı (seq scan DEĞİL).
--
-- ROLLBACK (acil):
--   DROP FUNCTION IF EXISTS public.resolve_healing_guide_ids(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.list_healing_guide_categories(uuid);
--   DROP FUNCTION IF EXISTS public.search_healing_guides(uuid, text, text, integer, text, uuid);
--   DROP INDEX IF EXISTS public.healing_guides_search_trgm_idx;
--   DROP INDEX IF EXISTS public.healing_guide_sections_search_trgm_idx;
--   DROP INDEX IF EXISTS public.healing_guides_tenant_foldname_idx;
--   DROP FUNCTION IF EXISTS public.sifa_guide_haystack(public.healing_guides);
--   DROP FUNCTION IF EXISTS public.sifa_section_haystack(public.healing_guide_sections);
--   DROP FUNCTION IF EXISTS public.sifa_is_meaningful(text);
--   DROP FUNCTION IF EXISTS public.sifa_fold(text);
--   -- (pg_trgm extension bırakılabilir; zararsız.)
-- =============================================================================
