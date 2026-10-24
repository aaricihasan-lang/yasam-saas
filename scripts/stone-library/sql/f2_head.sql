-- =============================================================================
-- 20271201000100_stone_library_f2.sql
--
-- DOĞALTAŞ KÜTÜPHANESİ (F2) · ADDITIVE · YALNIZ stone_library_* NESNELERİ + 1 PRIVATE BUCKET
-- ÖN KOŞUL: 20271201000000_stone_library_core.sql (F1, PR #552). F1 olmadan uygulanamaz (DO bloğu durdurur).
--
-- EKLER:
--   • stone_library_license_grants — sağlayıcı yazılı izinlerinin yapılandırılmış kaydı (kapsam, abonelik sonrası hak,
--     atıf, değiştirme, yeniden dağıtım sınırı, belge SHA-256, owner doğrulama durumu). YALNIZ OWNER.
--   • stone_library_images — lisanslı taş görselleri (özgün + optimize sürüm, SHA-256, MIME, boyut, piksel, depo yolu).
--     Kaynak URL'si yalnız owner tarafında; uzman yalnız "görsel var" bilgisini ve kendi uç noktasından baytları alır.
--   • records / facets.quality_flags — dil şüphesi (lang_suspect, tr_equals_en …) ve kalite işaretleri. 'lang_suspect'
--     taşıyan içerik owner dili doğrulayana kadar YAYINA ÇIKMAZ (veri silinmez).
--   • published.has_image + doc.image (yalnız boyut bilgisi; yol / URL / sağlayıcı yok).
--   • Başarılı ham yanıt tekilliği (paket, uç, dil) → aynı veri iki kez ücretli çekilmez.
--   • Owner okuma RPC'leri (taş listesi, paket + işlem kaydı, ham dizin, harici kimlik araması, görsel/lisans) ve uzman
--     görsel RPC'si. Tümü SECURITY DEFINER; owner RPC'leri owner'ı, uzman RPC'si yetkiyi DB'de yeniden doğrular.
--   • Private bucket 'stone-library-images' (policy YOK → yalnız service_role; uzman baytları sunucu ucundan alır).
-- Mevcut hiçbir tabloya / modüle DOKUNULMAZ. F1'in güvenlik modeli aynen geçerlidir (tablolara hiçbir rolün ayrıcalığı yok).
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.stone_library_records') IS NULL OR to_regprocedure('public.stone_library_assert_owner(uuid)') IS NULL THEN
    RAISE EXCEPTION 'F2: önce 20271201000000_stone_library_core.sql (F1) uygulanmalı';
  END IF;
END $$;

-- ─── 1) Kalite işaretleri ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.stone_library_records ADD COLUMN IF NOT EXISTS quality_flags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.stone_library_facets  ADD COLUMN IF NOT EXISTS quality_flags text[] NOT NULL DEFAULT '{}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stone_library_records_quality_flags_chk') THEN
    ALTER TABLE public.stone_library_records ADD CONSTRAINT stone_library_records_quality_flags_chk
      CHECK (quality_flags <@ ARRAY['lang_suspect','tr_equals_en','duplicate_text','health_lexicon','source_changed']::text[]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stone_library_facets_quality_flags_chk') THEN
    ALTER TABLE public.stone_library_facets ADD CONSTRAINT stone_library_facets_quality_flags_chk
      CHECK (quality_flags <@ ARRAY['lang_suspect','tr_equals_en','health_lexicon']::text[]);
  END IF;
END $$;

-- Kayıt / facet koruyucuları: kalite işaretleri durum kolonudur (içerik değildir) → değişebilir.
CREATE OR REPLACE FUNCTION public.stone_library_record_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.health_sensitive AND NOT NEW.health_sensitive THEN
    RAISE EXCEPTION 'stone_library_records: sağlık hassasiyeti kaldırılamaz' USING ERRCODE = 'SL012';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['is_current','review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref',
                            'reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id','quality_flags'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['is_current','review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref',
                            'reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id','quality_flags']) THEN
    RAISE EXCEPTION 'stone_library_records: içerik değiştirilemez; yeni sürüm ekleyin' USING ERRCODE = 'SL012';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_facet_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.health_sensitive AND NOT NEW.health_sensitive THEN
    RAISE EXCEPTION 'stone_library_facets: sağlık hassasiyeti kaldırılamaz' USING ERRCODE = 'SL012';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref','reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id','quality_flags'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref','reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id','quality_flags']) THEN
    RAISE EXCEPTION 'stone_library_facets: değer değiştirilemez; yenisini ekleyin' USING ERRCODE = 'SL012';
  END IF;
  RETURN NEW;
END $$;

-- ─── 2) Başarılı ham yanıt tekilliği (aynı veri bir pakette iki kez çekilmez) ──────────────────
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_raw_ok_uidx ON public.stone_library_raw (batch_id, endpoint, coalesce(lang, '-'))
  WHERE http_status BETWEEN 200 AND 299;
CREATE INDEX IF NOT EXISTS stone_library_raw_source_endpoint_idx ON public.stone_library_raw (source_id, endpoint, lang, fetched_at DESC);

-- ─── 3) Lisans izinleri ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_license_grants (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  scope                    text        NOT NULL CHECK (scope IN ('crystal_images','crystal_text','other')),
  granted_on               date        NOT NULL,
  grantor_label            text        NOT NULL CHECK (char_length(btrim(grantor_label)) BETWEEN 1 AND 200),
  commercial_display       boolean     NOT NULL,
  storage_allowed          boolean     NOT NULL,
  post_subscription_rights boolean     NOT NULL,
  attribution_required     boolean     NOT NULL,
  attribution_text         text        CHECK (attribution_text IS NULL OR char_length(attribution_text) <= 500),
  modification_allowed     boolean     NOT NULL,
  redistribution_limit     text        NOT NULL CHECK (char_length(btrim(redistribution_limit)) BETWEEN 1 AND 1000),
  max_resolution           text        CHECK (max_resolution IS NULL OR max_resolution ~ '^[1-9][0-9]{1,3}x[1-9][0-9]{1,3}$'),
  -- Abonelik sonrası hak YOKSA owner abonelik bitişini girer; bu tarihten sonra izin bağlı görseller servis edilmez.
  valid_until              date,
  document_id              uuid        REFERENCES public.stone_library_source_documents(id) ON DELETE RESTRICT,
  document_sha256          text        CHECK (document_sha256 IS NULL OR document_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_status          text        NOT NULL DEFAULT 'owner_verification_pending'
                                       CHECK (evidence_status IN ('owner_verification_pending','verified','revoked')),
  verified_at              timestamptz,
  verified_by              uuid,
  notes                    text        CHECK (notes IS NULL OR char_length(notes) <= 4000),
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  -- Doğrulanmış izin, belge özeti olmadan olamaz; atıf zorunluysa metni de zorunlu.
  CONSTRAINT stone_library_license_verified_doc_chk CHECK (evidence_status <> 'verified' OR (document_sha256 IS NOT NULL AND verified_at IS NOT NULL)),
  CONSTRAINT stone_library_license_attr_chk CHECK (NOT attribution_required OR attribution_text IS NOT NULL),
  CONSTRAINT stone_library_license_post_sub_chk CHECK (post_subscription_rights OR valid_until IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS stone_library_license_grants_src_idx ON public.stone_library_license_grants (source_id, scope);

-- ─── 4) Görseller ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_images (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id          uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  source_id         uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  license_grant_id  uuid        REFERENCES public.stone_library_license_grants(id) ON DELETE RESTRICT,
  external_id       text        CHECK (external_id IS NULL OR external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  variant           text        NOT NULL CHECK (variant IN ('original','optimized')),
  derived_from_id   uuid        REFERENCES public.stone_library_images(id) ON DELETE RESTRICT,
  source_url        text        CHECK (source_url IS NULL OR source_url ~ '^https://'),   -- YALNIZ OWNER
  storage_bucket    text        NOT NULL CHECK (storage_bucket = 'stone-library-images'),
  storage_path      text        NOT NULL CHECK (storage_path ~ '^(orig|opt)/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'),
  mime              text        NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  bytes             integer     NOT NULL CHECK (bytes BETWEEN 1 AND 2097152),
  width             integer     NOT NULL CHECK (width BETWEEN 1 AND 4000),
  height            integer     NOT NULL CHECK (height BETWEEN 1 AND 4000),
  sha256            text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  batch_id          uuid        REFERENCES public.stone_library_import_batches(id) ON DELETE RESTRICT,
  review_state      text        NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','approved','rejected')),
  visibility        text        NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden')),
  quality_flags     text[]      NOT NULL DEFAULT '{}' CHECK (quality_flags <@ ARRAY['duplicate_image','size_unexpected']::text[]),
  reviewed_at       timestamptz,
  reviewed_by       uuid,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  deleted_by        uuid,
  delete_op_id      uuid,
  CONSTRAINT stone_library_images_derived_chk CHECK ((variant = 'optimized') = (derived_from_id IS NOT NULL))
);
-- Taş + kaynak + sürüm başına tek etkin görsel; aynı dosya (SHA) aynı taşa iki kez kaydedilmez.
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_images_one_uidx ON public.stone_library_images (stone_id, source_id, variant) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stone_library_images_sha_idx ON public.stone_library_images (sha256);

-- Görsel satırı: kimlik / dosya kolonları değişmez; yalnız durum kolonları.
CREATE OR REPLACE FUNCTION public.stone_library_image_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['review_state','visibility','quality_flags','reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id','license_grant_id'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['review_state','visibility','quality_flags','reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id','license_grant_id']) THEN
    RAISE EXCEPTION 'stone_library_images: dosya kaydı değiştirilemez; yenisini ekleyin' USING ERRCODE = 'SL012';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_images_guard ON public.stone_library_images;
CREATE TRIGGER trg_stone_library_images_guard BEFORE UPDATE ON public.stone_library_images
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_image_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stone_library_license_grants','stone_library_images'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_delete ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_no_hard_delete()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_truncate ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.stone_library_no_hard_delete()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_history ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_history AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_capture_history()', t, t);
  END LOOP;
END $$;

-- ─── 5) Yayın yüzeyi: görsel bilgisi ───────────────────────────────────────────────────────────
ALTER TABLE public.stone_library_published ADD COLUMN IF NOT EXISTS has_image boolean NOT NULL DEFAULT false;

-- ─── 6) Private bucket (policy YOK → yalnız service_role) ──────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('stone-library-images', 'stone-library-images', false, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

-- ─── 6b) Renk sözlüğü: sağlayıcı renk aileleri (Bej, Turkuaz) ─────────────────────────────────────
INSERT INTO public.stone_library_vocab (facet, value_key, label_tr, label_en, sort_order) VALUES
  ('color','beige','Bej','Beige',20), ('color','turquoise','Turkuaz','Turquoise',21)
ON CONFLICT (facet, value_key) DO NOTHING;

-- ─── 7) Silme / geri alma: görseller de kapsamda ───────────────────────────────────────────────
ALTER TABLE public.stone_library_delete_ops DROP CONSTRAINT IF EXISTS stone_library_delete_ops_entity_check;
ALTER TABLE public.stone_library_delete_ops ADD CONSTRAINT stone_library_delete_ops_entity_check
  CHECK (entity IN ('source','document','stone','name','external_id','record','facet','batch','image'));
ALTER TABLE public.stone_library_reviews DROP CONSTRAINT IF EXISTS stone_library_reviews_entity_check;
ALTER TABLE public.stone_library_reviews ADD CONSTRAINT stone_library_reviews_entity_check
  CHECK (entity IN ('settings','source','document','stone','name','external_id','record','facet','batch','grant','image','license'));
