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
--   Yayın kilidi: published ⇒ kaynak kontrolü tamam + en az bir kaynak + yayınlayan owner kaydı.
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
  content_status   text        NOT NULL DEFAULT 'draft' CHECK (content_status IN ('draft','source_checked','owner_reviewed')),
  publish_status   text        NOT NULL DEFAULT 'hidden' CHECK (publish_status IN ('hidden','published')),
  revision         integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  published_at     timestamptz,
  published_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
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
              sections::text, timeline::text, sources::text, license_info::text, open_questions::text) !~ '[<>]'
  ),
  -- Yayın kilidi.
  CONSTRAINT hd_edu_bio_publish_chk CHECK (
    publish_status <> 'published'
    OR (content_status IN ('source_checked','owner_reviewed') AND jsonb_array_length(sources) >= 1
        AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS hd_edu_bio_subject_lang_uidx ON public.hd_education_biographies (subject_id, lang) WHERE subject_id IS NOT NULL;

-- Kaynak URL'leri yalnız https (JSON dizisindeki her kaynak). CHECK alt sorgu içeremediği için tetikleyici.
CREATE OR REPLACE FUNCTION public.hd_edu_bio_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  s jsonb;
BEGIN
  FOR s IN SELECT value FROM jsonb_array_elements(NEW.sources) LOOP
    IF jsonb_typeof(s) <> 'object' OR char_length(coalesce(s->>'url', '')) > 2000
       OR coalesce(s->>'url', '') !~ '^https://[^\s"''\\]+\.[^\s"''\\]+$' THEN
      RAISE EXCEPTION 'HD_EDU_BIO_SOURCE_URL' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.person_key <> OLD.person_key OR NEW.lang <> OLD.lang OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'HD_EDU_BIO_IMMUTABLE' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'HD_EDU_BIO_REVISION' USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;
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
REVOKE ALL ON FUNCTION public.hd_edu_bio_guard() FROM PUBLIC, anon, authenticated;

COMMIT;
