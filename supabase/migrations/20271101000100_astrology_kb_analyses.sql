-- =============================================================================
-- 20271101000100_astrology_kb_analyses.sql   [ADDITIVE — 5 NEW TABLES + 3 FUNCTIONS]
--
-- ASTROLOJİ — AŞAMA 2: BİLGİ BANKASI + DANIŞANA ÖZEL UZMAN YORUMU + KAYITLI ANALİZ (SNAPSHOT)
-- + EŞLENMEMİŞ ALAN DENETİMİ. SATIŞ SONRASI, OWNER-ONLY PİLOT.
--
-- KATMANLAR (Aşama 0-B kararı; birbirine KARIŞMAZ):
--   C) astro_kb_entries          → uzmanın KENDİ mesleki Bilgi Bankası (provider-bağımsız, kanonik
--                                  konu anahtarı). Roxy içeriğiyle doldurulmaz. tenant + uzman kapsamlı.
--   D) astro_expert_notes        → danışana (doğum profiline) özel uzman ÇALIŞMA notları (değişebilir).
--                                  Bilgi Bankası'nı ASLA değiştirmez (ayrı tablo).
--   E) astro_analyses            → "Analizi Kaydet" ile oluşan DEĞİŞMEZ snapshot: profil/revizyon,
--                                  metodoloji, teknik sonuç, (opsiyonel) sağlayıcı yorumu, Bilgi Bankası
--                                  eşleşmeleri, sürüm metadata'sı. service_role'e UPDATE/DELETE YOK.
--      astro_analysis_notes      → kayıt anındaki uzman yorumunun DEĞİŞMEZ kopyası.
--   astro_unmapped_fields        → sağlayıcı yanıtındaki BİLİNMEYEN alan YOLLARI (değer YOK) — owner
--                                  denetim görünümü. Sınıflandırma kaydı adaptör davranışını DEĞİŞTİRMEZ
--                                  (adaptör beyaz listesi koddadır; fail-closed korunur).
--
-- DANIŞAN YOLCULUĞU HAZIRLIĞI (bu aşamada entegrasyon YOK): astro_analyses.client_id + event_kind +
--   analysis_at + title → ileride yolculuk olayına güvenle bağlanacak kimlik/metadata.
--
-- GÜVENLİK: born-locked (RLS açık, policy yok, anon/authenticated REVOKE, service_role allowlist).
--   Composite FK'ler çapraz-tenant eşleşmeyi DB'de reddeder. Danışan silinince (KVKK) profil →
--   analiz → analiz notları ve profil → çalışma notları CASCADE silinir. Bilgi Bankası danışana bağlı
--   DEĞİLDİR (uzmanın genel mesleki bilgisi).
--
-- PRECONDITION: 20271101000000_astrology_foundation.sql.
-- VERİ-YIKICI MI: HAYIR. İDEMPOTENT: EVET.
-- ⚠️ PRODUCTION'A UYGULANMADI (work/astrology-roxy).
--
-- ROLLBACK (veri kaybı: tüm Bilgi Bankası / analizler silinir — yalnız bilinçli karar ile):
--   DROP FUNCTION IF EXISTS public.astro_unmapped_touch(text, text, text[]);
--   DROP FUNCTION IF EXISTS public.astro_analysis_save(uuid, uuid, uuid, integer, uuid, text, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb);
--   DROP TABLE IF EXISTS public.astro_unmapped_fields, public.astro_analysis_notes, public.astro_analyses,
--     public.astro_expert_notes, public.astro_kb_entries;
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.astro_birth_profiles') IS NULL OR to_regclass('public.astro_provider_results') IS NULL THEN
    RAISE EXCEPTION 'astrology aşama 2: 20271101000000_astrology_foundation önce uygulanmalı (precondition)';
  END IF;
END
$$;

-- ─── 1) Bilgi Bankası ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_kb_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  owner_user_id   uuid        NOT NULL,
  tradition       text        NOT NULL,
  topic_key       text        NOT NULL,
  title           text        NOT NULL,
  body            text        NOT NULL,
  source_note     text,
  tags            text[]      NOT NULL DEFAULT '{}'::text[],
  revision        integer     NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT astro_kb_tradition_chk CHECK (tradition IN ('western', 'vedic', 'kp')),
  CONSTRAINT astro_kb_topic_chk CHECK (topic_key ~ '^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$'),
  CONSTRAINT astro_kb_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT astro_kb_body_chk CHECK (char_length(btrim(body)) BETWEEN 1 AND 20000),
  CONSTRAINT astro_kb_source_chk CHECK (source_note IS NULL OR char_length(source_note) <= 1000),
  CONSTRAINT astro_kb_tags_chk CHECK (cardinality(tags) <= 20),
  CONSTRAINT astro_kb_revision_chk CHECK (revision >= 1),
  CONSTRAINT astro_kb_tenant_id_key UNIQUE (tenant_id, id)
);
COMMENT ON TABLE public.astro_kb_entries IS
  'Uzmanın KENDİ astroloji Bilgi Bankası (provider-bağımsız kanonik konu). Roxy içeriği içermez. tenant+uzman kapsamlı.';
CREATE INDEX IF NOT EXISTS astro_kb_owner_topic_idx ON public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key);

-- ─── 2) Danışana özel uzman ÇALIŞMA notları (değişebilir) ───────────────────
CREATE TABLE IF NOT EXISTS public.astro_expert_notes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  owner_user_id   uuid        NOT NULL,
  profile_id      uuid        NOT NULL,
  technique       text        NOT NULL,
  section_key     text        NOT NULL,
  body            text        NOT NULL,
  revision        integer     NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT astro_en_technique_chk CHECK (technique ~ '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT astro_en_section_chk CHECK (section_key = 'overall' OR section_key ~ '^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$'),
  CONSTRAINT astro_en_body_chk CHECK (char_length(body) <= 20000),
  CONSTRAINT astro_en_revision_chk CHECK (revision >= 1),
  CONSTRAINT astro_en_unique UNIQUE (tenant_id, owner_user_id, profile_id, technique, section_key),
  CONSTRAINT astro_en_profile_fk FOREIGN KEY (tenant_id, profile_id)
    REFERENCES public.astro_birth_profiles (tenant_id, id) ON DELETE CASCADE
);
COMMENT ON TABLE public.astro_expert_notes IS
  'Danışana (doğum profiline) özel uzman çalışma notları — Bilgi Bankası''ndan AYRI; kayıtlı analize kopyalanır.';

-- ─── 3) Kayıtlı analiz (DEĞİŞMEZ snapshot) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_analyses (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  owner_user_id             uuid        NOT NULL,
  profile_id                uuid        NOT NULL,
  profile_revision          integer     NOT NULL,
  client_id                 uuid,
  result_id                 uuid,
  technique                 text        NOT NULL,
  title                     text        NOT NULL,
  -- Danışan Yolculuğu hazırlığı (entegrasyon sonraki aşamada).
  event_kind                text        NOT NULL DEFAULT 'astrology.analysis.saved',
  analysis_at               timestamptz NOT NULL DEFAULT now(),
  save_request_id           uuid        NOT NULL,
  -- A) danışan/doğum profili  B) metodoloji  C) teknik  D) sağlayıcı yorumu  F) Bilgi Bankası  G) sürümler
  profile_snapshot          jsonb       NOT NULL,
  method_snapshot           jsonb       NOT NULL,
  technical_snapshot        jsonb       NOT NULL,
  provider_interp_included  boolean     NOT NULL DEFAULT false,
  provider_interp_snapshot  jsonb,
  kb_snapshot               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  versions_snapshot         jsonb       NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT astro_an_technique_chk CHECK (technique ~ '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT astro_an_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT astro_an_event_chk CHECK (event_kind ~ '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT astro_an_interp_chk CHECK (provider_interp_included = (provider_interp_snapshot IS NOT NULL)),
  CONSTRAINT astro_an_json_chk CHECK (
    jsonb_typeof(profile_snapshot) = 'object' AND jsonb_typeof(method_snapshot) = 'object'
    AND jsonb_typeof(technical_snapshot) = 'object' AND jsonb_typeof(kb_snapshot) = 'array'
    AND jsonb_typeof(versions_snapshot) = 'object'
    AND (provider_interp_snapshot IS NULL OR jsonb_typeof(provider_interp_snapshot) = 'object')
  ),
  CONSTRAINT astro_an_size_chk CHECK (
    pg_column_size(technical_snapshot) <= 1048576 AND pg_column_size(kb_snapshot) <= 2097152
    AND (provider_interp_snapshot IS NULL OR pg_column_size(provider_interp_snapshot) <= 1048576)
  ),
  CONSTRAINT astro_an_request_key UNIQUE (tenant_id, save_request_id),
  CONSTRAINT astro_an_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT astro_an_revision_fk FOREIGN KEY (tenant_id, profile_id, profile_revision)
    REFERENCES public.astro_birth_profile_revisions (tenant_id, profile_id, revision) ON DELETE CASCADE,
  CONSTRAINT astro_an_client_fk FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE,
  -- Sonuç satırı ileride silinse bile snapshot kendi içinde tamdır → yalnız bağ NULL olur.
  CONSTRAINT astro_an_result_fk FOREIGN KEY (tenant_id, result_id)
    REFERENCES public.astro_provider_results (tenant_id, id) ON DELETE SET NULL (result_id)
);
COMMENT ON TABLE public.astro_analyses IS
  'Kayıtlı astroloji analizi — DEĞİŞMEZ snapshot (service_role yalnız SELECT/INSERT). Katmanlar ayrı kolonlarda.';
CREATE INDEX IF NOT EXISTS astro_an_profile_idx ON public.astro_analyses (tenant_id, profile_id, analysis_at DESC);
CREATE INDEX IF NOT EXISTS astro_an_client_idx ON public.astro_analyses (tenant_id, client_id, analysis_at DESC);

CREATE TABLE IF NOT EXISTS public.astro_analysis_notes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  analysis_id     uuid        NOT NULL,
  section_key     text        NOT NULL,
  body            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT astro_ann_section_chk CHECK (section_key = 'overall' OR section_key ~ '^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$'),
  CONSTRAINT astro_ann_body_chk CHECK (char_length(body) <= 20000),
  CONSTRAINT astro_ann_unique UNIQUE (tenant_id, analysis_id, section_key),
  CONSTRAINT astro_ann_analysis_fk FOREIGN KEY (tenant_id, analysis_id)
    REFERENCES public.astro_analyses (tenant_id, id) ON DELETE CASCADE
);
COMMENT ON TABLE public.astro_analysis_notes IS
  'Kayıt anındaki danışana özel uzman yorumunun DEĞİŞMEZ kopyası (E katmanı).';

-- ─── 4) Eşlenmemiş sağlayıcı alanları (yalnız YOL) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_unmapped_fields (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text        NOT NULL,
  endpoint         text        NOT NULL,
  field_path       text        NOT NULL,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  seen_count       integer     NOT NULL DEFAULT 1,
  classification   text        NOT NULL DEFAULT 'unclassified',
  classified_at    timestamptz,

  CONSTRAINT astro_uf_provider_chk CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT astro_uf_endpoint_chk CHECK (char_length(endpoint) BETWEEN 1 AND 200),
  -- Yalnız alan YOLU (değer değil): harf/rakam/_/./[]/: — boşluk ve serbest metin reddedilir.
  CONSTRAINT astro_uf_path_chk CHECK (field_path ~ '^[A-Za-z0-9_.\[\]:]{1,200}$'),
  CONSTRAINT astro_uf_class_chk CHECK (classification IN ('unclassified', 'technical', 'interpretation', 'ignored', 'unverified')),
  CONSTRAINT astro_uf_unique UNIQUE (provider, endpoint, field_path)
);
COMMENT ON TABLE public.astro_unmapped_fields IS
  'Sağlayıcı yanıtında beyaz listede olmayan alan YOLLARI (değer YOK). Sınıflandırma yalnız kayıttır; adaptör koddadır.';

-- ─── 5) Atomik fonksiyonlar (SECURITY INVOKER; service_role çağırır) ─────────
CREATE OR REPLACE FUNCTION public.astro_analysis_save(
  p_tenant_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_profile_revision integer,
  p_result_id uuid,
  p_technique text,
  p_title text,
  p_save_request_id uuid,
  p_profile_snapshot jsonb,
  p_method_snapshot jsonb,
  p_technical_snapshot jsonb,
  p_kb_snapshot jsonb,
  p_provider_interp_included boolean,
  p_provider_interp_snapshot jsonb,
  p_versions_snapshot jsonb,
  p_notes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_client uuid;
  v_existing uuid;
  n jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ASTRO_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- İdempotency: aynı kaydetme isteği (çift tık / yeniden deneme) → mevcut analiz.
  SELECT id INTO v_existing FROM public.astro_analyses
   WHERE tenant_id = p_tenant_id AND save_request_id = p_save_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('analysis_id', v_existing, 'reused', true);
  END IF;

  -- Danışan bağı PROFİLDEN alınır (istemciden değil).
  SELECT client_id INTO v_client FROM public.astro_birth_profiles
   WHERE tenant_id = p_tenant_id AND id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASTRO_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.astro_analyses (
    tenant_id, owner_user_id, profile_id, profile_revision, client_id, result_id, technique, title,
    save_request_id, profile_snapshot, method_snapshot, technical_snapshot,
    provider_interp_included, provider_interp_snapshot, kb_snapshot, versions_snapshot
  ) VALUES (
    p_tenant_id, p_user_id, p_profile_id, p_profile_revision, v_client, p_result_id, p_technique, btrim(p_title),
    p_save_request_id, p_profile_snapshot, p_method_snapshot, p_technical_snapshot,
    p_provider_interp_included, CASE WHEN p_provider_interp_included THEN p_provider_interp_snapshot ELSE NULL END,
    COALESCE(p_kb_snapshot, '[]'::jsonb), p_versions_snapshot
  ) RETURNING id INTO v_id;

  IF p_notes IS NOT NULL AND jsonb_typeof(p_notes) = 'array' THEN
    FOR n IN SELECT * FROM jsonb_array_elements(p_notes) LOOP
      INSERT INTO public.astro_analysis_notes (tenant_id, analysis_id, section_key, body)
      VALUES (p_tenant_id, v_id, n->>'section_key', n->>'body');
    END LOOP;
  END IF;

  RETURN jsonb_build_object('analysis_id', v_id, 'reused', false);
END
$fn$;

CREATE OR REPLACE FUNCTION public.astro_unmapped_touch(p_provider text, p_endpoint text, p_paths text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  p text;
  k integer := 0;
BEGIN
  IF p_paths IS NULL THEN RETURN 0; END IF;
  FOREACH p IN ARRAY p_paths[1:200] LOOP
    INSERT INTO public.astro_unmapped_fields (provider, endpoint, field_path)
    VALUES (p_provider, p_endpoint, p)
    ON CONFLICT (provider, endpoint, field_path)
    DO UPDATE SET last_seen_at = now(), seen_count = public.astro_unmapped_fields.seen_count + 1;
    k := k + 1;
  END LOOP;
  RETURN k;
END
$fn$;

-- updated_at (değişebilir tablolar)
DROP TRIGGER IF EXISTS trg_astro_kb_updated_at ON public.astro_kb_entries;
CREATE TRIGGER trg_astro_kb_updated_at BEFORE UPDATE ON public.astro_kb_entries
  FOR EACH ROW EXECUTE FUNCTION public.astro_touch_updated_at();
DROP TRIGGER IF EXISTS trg_astro_en_updated_at ON public.astro_expert_notes;
CREATE TRIGGER trg_astro_en_updated_at BEFORE UPDATE ON public.astro_expert_notes
  FOR EACH ROW EXECUTE FUNCTION public.astro_touch_updated_at();

-- ─── 6) BORN-LOCKED ─────────────────────────────────────────────────────────
DO $lock$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'astro_kb_entries', 'astro_expert_notes', 'astro_analyses', 'astro_analysis_notes', 'astro_unmapped_fields'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated;', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role;', t);
  END LOOP;
END
$lock$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.astro_kb_entries TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.astro_expert_notes TO service_role;
GRANT SELECT, INSERT ON TABLE public.astro_analyses TO service_role;
GRANT SELECT, INSERT ON TABLE public.astro_analysis_notes TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.astro_unmapped_fields TO service_role;

REVOKE ALL ON FUNCTION public.astro_analysis_save(uuid, uuid, uuid, integer, uuid, text, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_unmapped_touch(text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astro_analysis_save(uuid, uuid, uuid, integer, uuid, text, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_unmapped_touch(text, text, text[]) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
