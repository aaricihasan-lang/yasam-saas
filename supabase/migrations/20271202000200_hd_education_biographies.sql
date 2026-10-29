-- =============================================================================
-- 20271202000200_hd_education_biographies.sql
--
-- HUMAN DESIGN — HAZIR EĞİTİM HARİTALARI · FAZ 10 "HAYAT HİKÂYESİ" · ADDITIVE · YALNIZ YENİ TABLOLAR
--
-- AMAÇ: Merkezî (platforma ait, tenant'sız) ünlü kaydına bağlı, kaynaklı biyografi katmanı. Biyografi hesap
--   katmanından AYRIDIR: hd_education_charts / provider_raw'a dokunulmaz, hiçbir hesap verisi buraya kopyalanmaz.
--   Haritası henüz olmayan aday için (subject_id NULL) taslak biyografi tutulabilir; eğitmen yalnız YAYIMLI
--   merkezî haritanın YAYIMLI biyografisini görür (route katmanı + bu tablodaki yayın kilidi).
--
-- TABLOLAR (2):
--   hd_education_biographies          — kişi × dil başına tek kayıt (TR, EN); sürümlü (revision, CAS)
--   hd_education_biography_revisions  — append-only geçmiş (içe aktarma / owner düzenleme / yayın değişimi)
--
-- GÜVENLİK: RLS AÇIK, policy YOK (varsayılan deny); PUBLIC/anon/authenticated/service_role REVOKE ALL; yalnız
--   sunucu route'ları (service_role) ve yalnız gereken ayrıcalıklar (DELETE YOK). Metin alanlarında ve JSON
--   içeriklerinde '<' / '>' DB'de de yasak (HTML/script enjeksiyonuna ikinci kilit). Kaynak URL'leri yalnız https.
--   Yayın kilidi (FAZ 19): published ⇒ OWNER İNCELEMESİ kayıtlı (content_status='owner_reviewed' + reviewed_by/at; source_checked
--   YETMEZ) + en az bir kaynak + yayınlayan owner kaydı. İnceleme ve yayın aktörleri DB'de owner olarak yeniden doğrulanır.
--   İçerik değişirse (yayımlı kayıtta dahil) inceleme düşer ve kayıt yayından çıkar → yeniden owner onayı gerekir (tetikleyici).
--   Kişi kaydına bağlı biyografide is_living, kişi kaydıyla (hd_education_subjects.is_living) aynı olmalıdır (tetikleyici).
--   Mevcut tablolar, auth, tenant ve RLS kuralları DEĞİŞMEZ.
-- YEDEK: içerik "global" (tenant yedeklerine girmez) — lib/backup/ownerPilotTables.ts.
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
-- ÖNKOŞUL: 20271110000000 (hd_education_subjects, hd_edu_append_only).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.hd_education_subjects') IS NULL OR to_regprocedure('public.hd_edu_append_only()') IS NULL THEN
    RAISE EXCEPTION 'HD_EDU_BIO_PREREQ: önce 20271110000000_hd_education_catalog_access.sql uygulanmalı';
  END IF;
  IF to_regprocedure('public.hd_edu_actor_is_owner(uuid)') IS NULL THEN
    RAISE EXCEPTION 'HD_EDU_BIO_PREREQ: hd_edu_actor_is_owner(uuid) yok (20271110000000)';
  END IF;
END $$;

-- ─── 1) Biyografiler ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_biographies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_key       text        NOT NULL CHECK (person_key ~ '^[a-z0-9][a-z0-9-]{1,118}$'),
  lang             text        NOT NULL CHECK (lang IN ('tr','en')),
  subject_id       uuid        REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  display_name     text        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  life_span        text        CHECK (life_span IS NULL OR char_length(life_span) <= 40),
  profession       text        CHECK (profession IS NULL OR char_length(profession) <= 200),
  known_for        text        CHECK (known_for IS NULL OR char_length(known_for) <= 400),
  country          text        CHECK (country IS NULL OR char_length(country) <= 200),
  era              text        CHECK (era IS NULL OR char_length(era) <= 100),
  category         text        CHECK (category IS NULL OR category IN ('bilim','sanat','muzik','sinema','edebiyat','siyaset','tarih','spor','kesif','medya','kraliyet','diger')),
  is_living        boolean     NOT NULL,
  birth_year       integer     CHECK (birth_year IS NULL OR birth_year BETWEEN 1000 AND 2100),
  death_year       integer     CHECK (death_year IS NULL OR death_year BETWEEN 1000 AND 2100),
  short_intro      text        NOT NULL CHECK (char_length(short_intro) BETWEEN 1 AND 1500),
  sections         jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sections) = 'array' AND octet_length(sections::text) <= 80000),
  timeline         jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(timeline) = 'array' AND jsonb_array_length(timeline) <= 60 AND octet_length(timeline::text) <= 40000),
  sources          jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) <= 80 AND octet_length(sources::text) <= 60000),
  license_info     jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(license_info) = 'object' AND octet_length(license_info::text) <= 20000),
  neutrality_note  text        CHECK (neutrality_note IS NULL OR char_length(neutrality_note) <= 1000),
  open_questions   jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(open_questions) = 'array' AND octet_length(open_questions::text) <= 10000),
  -- FAZ 19: iddia düzeyi doğrulama kaydı (capraz / tek_kaynak / belirsiz / celiskili) — yalnız owner incelemesi; eğitmen yanıtına girmez.
  fact_checks      jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fact_checks) = 'array' AND jsonb_array_length(fact_checks) <= 200 AND octet_length(fact_checks::text) <= 120000),
  content_status   text        NOT NULL DEFAULT 'draft' CHECK (content_status IN ('draft','source_checked','owner_reviewed')),
  publish_status   text        NOT NULL DEFAULT 'hidden' CHECK (publish_status IN ('hidden','published')),
  revision         integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  published_at     timestamptz,
  published_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  -- FAZ 19: owner incelemesi (yayın ön şartı). İçerik değişince tetikleyici temizler.
  reviewed_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_edu_bio_person_lang_uq UNIQUE (person_key, lang),
  CONSTRAINT hd_edu_bio_years_chk CHECK (death_year IS NULL OR birth_year IS NULL OR death_year >= birth_year),
  CONSTRAINT hd_edu_bio_living_chk CHECK (NOT is_living OR death_year IS NULL),
  -- '<' ve '>' hiçbir metin alanında / JSON içeriğinde yok (DB ikinci kilit; uygulama aynı kuralı uygular).
  CONSTRAINT hd_edu_bio_no_markup_chk CHECK (
    concat_ws(' ', display_name, life_span, profession, known_for, country, era, short_intro, neutrality_note,
              sections::text, timeline::text, sources::text, license_info::text, open_questions::text, fact_checks::text) !~ '[<>]'
  ),
  -- FAZ 19: owner incelemesi ⇔ inceleme kaydı (aktör + zaman).
  CONSTRAINT hd_edu_bio_review_chk CHECK (
    CASE WHEN content_status = 'owner_reviewed' THEN reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
         ELSE reviewed_by IS NULL AND reviewed_at IS NULL END
  ),
  -- Yayın kilidi (FAZ 19: yalnız owner incelemesi; source_checked yetmez).
  CONSTRAINT hd_edu_bio_publish_chk CHECK (
    publish_status <> 'published'
    OR (content_status = 'owner_reviewed' AND reviewed_by IS NOT NULL AND jsonb_array_length(sources) >= 1
        AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS hd_edu_bio_subject_lang_uidx ON public.hd_education_biographies (subject_id, lang) WHERE subject_id IS NOT NULL;

-- Kaynak URL'leri yalnız https (JSON dizisindeki her kaynak). CHECK alt sorgu içeremediği için tetikleyici.
-- FAZ 19: (1) kişi ↔ biyografi is_living tutarlılığı, (2) owner incelemesi / yayın aktörü DB'de owner olarak doğrulanır,
--   (3) içerik değişikliği incelemeyi düşürür ve yayımlı kaydı yayından çıkarır (yeniden onay gerekir), (4) yeni kayıt
--   inceleme / yayın taşıyamaz (içe aktarma yalnız draft | source_checked + hidden). SECURITY DEFINER: hd_edu_actor_is_owner
--   ve kişi tablosu okuması için (EXECUTE hiçbir role verilmez; yalnız tetikleyici çağırır).
CREATE OR REPLACE FUNCTION public.hd_edu_bio_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  s jsonb;
  v_living boolean;
  v_content_chg boolean;
BEGIN
  FOR s IN SELECT value FROM jsonb_array_elements(NEW.sources) LOOP
    IF jsonb_typeof(s) <> 'object' OR char_length(coalesce(s->>'url', '')) > 2000
       OR coalesce(s->>'url', '') !~ '^https://[^\s"''\\]+\.[^\s"''\\]+$' THEN
      RAISE EXCEPTION 'HD_EDU_BIO_SOURCE_URL' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF NEW.subject_id IS NOT NULL THEN
    SELECT x.is_living INTO v_living FROM public.hd_education_subjects x WHERE x.id = NEW.subject_id;
    IF FOUND AND v_living IS DISTINCT FROM NEW.is_living THEN
      RAISE EXCEPTION 'HD_EDU_BIO_LIVING_MISMATCH: % (kişi kaydı is_living=%, biyografi is_living=%)', NEW.person_key, v_living, NEW.is_living
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.content_status = 'owner_reviewed' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.publish_status <> 'hidden' THEN
      RAISE EXCEPTION 'HD_EDU_BIO_REVIEW_REQUIRED: yeni kayıt owner incelemesi veya yayın taşıyamaz (%)', NEW.person_key USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.person_key <> OLD.person_key OR NEW.lang <> OLD.lang OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'HD_EDU_BIO_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'HD_EDU_BIO_REVISION' USING ERRCODE = 'check_violation';
  END IF;

  v_content_chg := ROW(NEW.subject_id, NEW.display_name, NEW.life_span, NEW.profession, NEW.known_for, NEW.country, NEW.era, NEW.category,
                       NEW.is_living, NEW.birth_year, NEW.death_year, NEW.short_intro, NEW.sections, NEW.timeline, NEW.sources,
                       NEW.license_info, NEW.neutrality_note, NEW.open_questions, NEW.fact_checks)
          IS DISTINCT FROM ROW(OLD.subject_id, OLD.display_name, OLD.life_span, OLD.profession, OLD.known_for, OLD.country, OLD.era, OLD.category,
                       OLD.is_living, OLD.birth_year, OLD.death_year, OLD.short_intro, OLD.sections, OLD.timeline, OLD.sources,
                       OLD.license_info, OLD.neutrality_note, OLD.open_questions, OLD.fact_checks);
  IF v_content_chg THEN
    -- İçerik değişti: önceki owner incelemesi bu metni kapsamaz → inceleme düşer; yayımlıysa yayından çıkar (yeniden onay).
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    IF NEW.content_status = 'owner_reviewed' THEN NEW.content_status := 'source_checked'; END IF;
    IF NEW.publish_status = 'published' THEN NEW.publish_status := 'hidden'; END IF;
  ELSIF NEW.content_status <> 'owner_reviewed' THEN
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSIF OLD.content_status <> 'owner_reviewed' OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NOT public.hd_edu_actor_is_owner(NEW.reviewed_by) THEN
      RAISE EXCEPTION 'HD_EDU_BIO_REVIEWER: owner incelemesi yalnız owner kaydıyla yazılabilir' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.publish_status = 'published' AND (OLD.publish_status <> 'published' OR NEW.published_by IS DISTINCT FROM OLD.published_by) THEN
    IF NEW.published_by IS NULL OR NOT public.hd_edu_actor_is_owner(NEW.published_by) THEN
      RAISE EXCEPTION 'HD_EDU_BIO_PUBLISHER: yayın yalnız owner kaydıyla yapılabilir' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hd_edu_bio_guard_trg ON public.hd_education_biographies;
CREATE TRIGGER hd_edu_bio_guard_trg BEFORE INSERT OR UPDATE ON public.hd_education_biographies
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_bio_guard();

-- ─── 2) Geçmiş (append-only) ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_biography_revisions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  biography_id  uuid        NOT NULL REFERENCES public.hd_education_biographies(id) ON DELETE RESTRICT,
  revision      integer     NOT NULL CHECK (revision >= 1),
  action        text        NOT NULL CHECK (action IN ('import','owner_edit','publish','unpublish','status')),
  actor_user_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  snapshot      jsonb       NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 250000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_edu_bio_rev_uq UNIQUE (biography_id, revision, action)
);
CREATE INDEX IF NOT EXISTS hd_edu_bio_rev_bio_idx ON public.hd_education_biography_revisions (biography_id, created_at DESC);

DROP TRIGGER IF EXISTS hd_edu_bio_rev_append_only ON public.hd_education_biography_revisions;
CREATE TRIGGER hd_edu_bio_rev_append_only BEFORE UPDATE OR DELETE ON public.hd_education_biography_revisions
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_append_only();

-- ─── 3) Ayrıcalıklar ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hd_education_biographies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hd_education_biography_revisions  ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.hd_education_biographies         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON public.hd_education_biography_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.hd_education_biographies         TO service_role;
GRANT SELECT, INSERT         ON public.hd_education_biography_revisions TO service_role;
REVOKE ALL ON FUNCTION public.hd_edu_bio_guard() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
