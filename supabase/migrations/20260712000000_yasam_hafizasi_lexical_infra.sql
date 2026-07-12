-- =============================================================================
-- 20260712000000_yasam_hafizasi_lexical_infra.sql
--
-- YAŞAM HAFIZASI™ — Sprint 2 / S2.02: LEXICAL ARAMA ALTYAPISI
--
-- KAPSAM (yalnız Hızlı Tarama lexical altyapısı):
--   1. public.yh_immutable_unaccent(text)         → IMMUTABLE unaccent wrapper
--   2. public.yh_index_build_search_tsv()         → BEFORE INSERT/UPDATE trigger fn
--   3. yasam_hafizasi_index trigger'ı             → search_tsv A/B/C/D ağırlıklı
--   4. GIN(search_tsv)                            → lexical aday bulma
--   5. GIN(topic_tags)                            → etiket kanıtı
--   6. public.yh_topic_dictionary                 → küratörlü eş-anlam sözlüğü
--   7-10. yh_topic_dictionary RLS kilidi          → anon/authenticated REVOKE +
--                                                    RLS ENABLE (policy yok) → service_role only
--
-- KİLİTLİ KARARLAR:
--   - App normalize ASIL kaynaktır; DB unaccent DESTEKLEYİCİ/yedek katmandır (simetri).
--   - search_tsv ağırlıkları: A=title · B=topic_tags+expert_relations · C=search_text · D=snippet.
--   - AI YOK · embedding YOK · pgvector YOK · PII YOK · UI YOK.
--   - Yalnız Yaşam Hafızası kapsamı; başka modül/tabloya dokunulmaz.
--
-- BAĞIMLILIK: A6 (unaccent extension'ı `extensions` şemasında aktif — commit c87fb48).
--
-- UYGULAMA: Supabase Dashboard SQL Editor (DATABASE_URL=localhost çalışmaz).
-- IDEMPOTENT: CREATE OR REPLACE / IF NOT EXISTS / DROP ... IF EXISTS + REVOKE (no-op tekrar).
-- =============================================================================

BEGIN;

-- ─── 1) IMMUTABLE unaccent wrapper (yalnız Yaşam Hafızası) ────────────────────
-- Tek argümanlı extensions.unaccent(text) STABLE'dır (varsayılan sözlüğü arar) →
-- generated/index/trigger ifadesinde kullanılamaz. İki argümanlı biçim (sözlük
-- açıkça verilir) IMMUTABLE'dır; bu wrapper onu sabitler. Korpus ve sorgu tarafında
-- SİMETRİK kullanılır (App normalize ile aynı katlamayı DB'de yedekler).
CREATE OR REPLACE FUNCTION public.yh_immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

-- ─── 2) search_tsv üretim trigger fonksiyonu ─────────────────────────────────
-- Ağırlıklar (doküman §3):
--   A = title
--   B = topic_tags + expert_relations (yalnız target_label metni; JSON anahtarları değil)
--   C = search_text  (App tarafında normalize edilmiş korpus)
--   D = snippet
-- expert_relations jsonb dizisi güvenli taranır: dizi değilse boş kabul edilir.
CREATE OR REPLACE FUNCTION public.yh_index_build_search_tsv()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog
AS $$
DECLARE
  v_relations text;
BEGIN
  -- expert_relations içinden yalnızca target_label değerlerini birleştir (deterministik).
  v_relations := coalesce(
    (
      SELECT string_agg(elem->>'target_label', ' ')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(NEW.expert_relations) = 'array'
            THEN NEW.expert_relations
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE elem->>'target_label' IS NOT NULL
    ),
    ''
  );

  NEW.search_tsv :=
       setweight(
         to_tsvector('simple', public.yh_immutable_unaccent(coalesce(NEW.title, ''))),
         'A'
       )
    || setweight(
         to_tsvector('simple', public.yh_immutable_unaccent(
           coalesce(array_to_string(NEW.topic_tags, ' '), '') || ' ' || v_relations
         )),
         'B'
       )
    || setweight(
         to_tsvector('simple', public.yh_immutable_unaccent(coalesce(NEW.search_text, ''))),
         'C'
       )
    || setweight(
         to_tsvector('simple', public.yh_immutable_unaccent(coalesce(NEW.snippet, ''))),
         'D'
       );

  RETURN NEW;
END;
$$;

-- ─── 3) Trigger: her INSERT/UPDATE'te search_tsv yeniden üretilir ─────────────
DROP TRIGGER IF EXISTS yh_index_search_tsv_biu ON public.yasam_hafizasi_index;
CREATE TRIGGER yh_index_search_tsv_biu
  BEFORE INSERT OR UPDATE ON public.yasam_hafizasi_index
  FOR EACH ROW
  EXECUTE FUNCTION public.yh_index_build_search_tsv();

-- ─── Fonksiyon EXECUTE kilidi (least privilege) ──────────────────────────────
-- Varsayılan PUBLIC EXECUTE'u kapat → anon/authenticated PostgREST RPC yüzeyi kapanır.
-- service_role'a AÇIKÇA GRANT: trigger fonksiyonu yh_immutable_unaccent'i service_role
-- bağlamında içeride çağırır; revoke sonrası bu GRANT olmadan backfill/INSERT kırılırdı.
REVOKE ALL ON FUNCTION public.yh_immutable_unaccent(text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.yh_index_build_search_tsv()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.yh_immutable_unaccent(text)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.yh_index_build_search_tsv()
  TO service_role;

-- ─── 4) GIN(search_tsv) — lexical aday bulma ─────────────────────────────────
CREATE INDEX IF NOT EXISTS yhi_search_tsv_gin
  ON public.yasam_hafizasi_index USING GIN (search_tsv);

-- ─── 5) GIN(topic_tags) — etiket kanıtı ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS yhi_topic_tags_gin
  ON public.yasam_hafizasi_index USING GIN (topic_tags);


-- ─── 6) yh_topic_dictionary (küratörlü eş-anlam sözlüğü, deterministik) ───────
-- tenant_id NULL = global/küratörlü sözlük; tenant_id dolu = tenant'a özel kayıt.
CREATE TABLE IF NOT EXISTS public.yh_topic_dictionary (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,                                            -- NULL = global/küratörlü
  canonical   text        NOT NULL,
  synonyms    text[]      NOT NULL DEFAULT '{}'::text[],
  lang        text        NOT NULL DEFAULT 'tr',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yhtd_canonical_chk CHECK (length(btrim(canonical)) > 0),
  CONSTRAINT yhtd_lang_chk      CHECK (length(btrim(lang)) > 0)
);

-- Normalize edilmiş tekilleştirme (PostgreSQL 15+): kenar boşluğu + büyük/küçük harf
-- varyasyonları aynı kabul edilir → "Çakra"/" çakra " gibi varyantlarla tekrar açılamaz.
--   - tenant_id NULL (global/küratörlü) kayıtlar da eşit sayılır (NULLS NOT DISTINCT).
--   - tenant-specific kayıtlar (tenant_id dolu) ayrı tutulur.
CREATE UNIQUE INDEX IF NOT EXISTS yhtd_unique_key
  ON public.yh_topic_dictionary (
    tenant_id,
    lower(btrim(lang)),
    lower(btrim(canonical))
  )
  NULLS NOT DISTINCT;


-- ─── 7-10) Kilit: anon/authenticated kapat, RLS aç (policy yok → service_role only) ─
DO $$
DECLARE
  tbl text := 'yh_topic_dictionary';
  pol record;
  col record;
BEGIN
  -- Varsa policy'leri kaldır (policy yok = service_role dışında deny).
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
  END LOOP;

  -- Tablo seviyesi tüm yetkileri geri al (PUBLIC dahil → service_role-only kilit açık).
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', tbl
  );

  -- Kolon seviyesi SELECT yetkilerini de geri al (savunma derinliği).
  FOR col IN
    SELECT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = tbl
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'SELECT'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.%I FROM %I',
      col.column_name, tbl, col.grantee
    );
  END LOOP;

  -- RLS aç (FORCE değil → service_role bypass korunur, mevcut modül deseniyle aynı).
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
END $$;

-- service_role'a YALNIZ gerekli tablo yetkilerini açıkça ver (least privilege; kilit açık).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.yh_topic_dictionary
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, beklenen):
--   -- 1) Wrapper IMMUTABLE + PARALLEL SAFE:
--   SELECT provolatile, proparallel FROM pg_proc
--     WHERE proname = 'yh_immutable_unaccent';                 -- i, s
--   -- 2) Wrapper çalışıyor (İ/ı/ş/ğ katlama simetrisi):
--   SELECT public.yh_immutable_unaccent('İğne Şifa Çakra');    -- ~ 'Igne Sifa Cakra'
--   -- 3) Trigger mevcut:
--   SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.yasam_hafizasi_index'::regclass
--       AND NOT tgisinternal;                                  -- yh_index_search_tsv_biu
--   -- 4/5) İki GIN index:
--   SELECT indexname FROM pg_indexes
--     WHERE tablename = 'yasam_hafizasi_index'
--       AND indexname IN ('yhi_search_tsv_gin','yhi_topic_tags_gin');   -- 2 satır
--   -- 6) Sözlük tablosu + unique + check:
--   SELECT conname, contype FROM pg_constraint
--     WHERE conrelid = 'public.yh_topic_dictionary'::regclass;  -- PK + 2 CHECK + UNIQUE
--   -- 7/10) RLS açık, FORCE değil + anon erişimi kapalı:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname = 'yh_topic_dictionary';                    -- t, f
--   SELECT has_table_privilege('anon','public.yh_topic_dictionary','SELECT');  -- false
--   SELECT has_table_privilege('authenticated','public.yh_topic_dictionary','INSERT'); -- false
--   -- Davranışsal: trigger test — search_tsv otomatik dolar (A/B/C/D ağırlıklı).
-- =============================================================================
