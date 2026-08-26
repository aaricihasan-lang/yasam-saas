-- ============================================================
-- 20261229000100_nutrition_topics.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / Class B
-- Birleşik Bilgi Zarfı — Topics (dietary_pattern/goal/condition/sport/life_stage/traditional_profile)
--
-- CANONICAL: §F.2. framework_id → Class A nutrition_traditional_frameworks (traditional_profile'a özel).
-- DB INVARIANT (§11): traditional_profile ⇔ framework_id NOT NULL (diğer tiplerde framework_id NULL).
-- Mega-tablo değil, domain-başına tablo değil. Mizaç + Kan Grubu = traditional_profile (framework=mizac/blood_type).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_topics (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  topic_type   text        NOT NULL,
  framework_id uuid,
  title        text        NOT NULL,
  summary      text,
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- search_tsv: BEFORE INSERT/UPDATE trigger ile doldurulur (GENERATED DEĞİL — modül geneli
  -- tutarlılık + gelecekte alias/array eklenirse 42P17 immutability riskine karşı güvenli desen).
  search_tsv   tsvector,

  CONSTRAINT nutrition_topics_title_chk CHECK (btrim(title) <> ''),
  CONSTRAINT nutrition_topics_topic_type_chk CHECK (
    topic_type IN ('dietary_pattern', 'goal', 'condition', 'sport', 'life_stage', 'traditional_profile')
  ),
  -- §11 DB invariant: framework yalnız traditional_profile için ve orada zorunlu.
  CONSTRAINT nutrition_topics_framework_invariant_chk CHECK (
    (topic_type = 'traditional_profile' AND framework_id IS NOT NULL)
    OR (topic_type <> 'traditional_profile' AND framework_id IS NULL)
  ),

  CONSTRAINT nutrition_topics_tenant_id_key UNIQUE (tenant_id, id),

  CONSTRAINT nutrition_topics_framework_fk
    FOREIGN KEY (framework_id)
    REFERENCES public.nutrition_traditional_frameworks (id)
    ON DELETE RESTRICT
);

-- traditional_profile tekilliği: aynı tenant+framework içinde aynı başlık (normalize) bir kez.
CREATE UNIQUE INDEX nutrition_topics_profile_uidx
  ON public.nutrition_topics (tenant_id, framework_id, lower(btrim(title)))
  WHERE topic_type = 'traditional_profile';

CREATE INDEX nutrition_topics_tenant_type_idx
  ON public.nutrition_topics (tenant_id, topic_type);

CREATE INDEX nutrition_topics_tenant_framework_idx
  ON public.nutrition_topics (tenant_id, framework_id) WHERE framework_id IS NOT NULL;

CREATE INDEX nutrition_topics_search_idx
  ON public.nutrition_topics USING gin (search_tsv);

CREATE FUNCTION public.nutrition_topics_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_topics identity columns (id, tenant_id, created_at) are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_topics_identity_guard
  BEFORE UPDATE ON public.nutrition_topics
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_topics_identity_guard();

CREATE TRIGGER trg_nutrition_topics_updated_at
  BEFORE UPDATE ON public.nutrition_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- search_tsv üretimi (BEFORE INSERT OR UPDATE). Ağırlık A=title, C=summary.
CREATE FUNCTION public.nutrition_topics_search_tsv()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('simple', public.yh_immutable_unaccent(coalesce(NEW.title, ''))), 'A')
    || setweight(to_tsvector('simple', public.yh_immutable_unaccent(coalesce(NEW.summary, ''))), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_topics_search_tsv
  BEFORE INSERT OR UPDATE ON public.nutrition_topics
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_topics_search_tsv();

ALTER TABLE public.nutrition_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_topics FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_topics TO service_role;

COMMIT;
