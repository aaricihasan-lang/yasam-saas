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

-- Birebir kaynak kuralı: ham yanıta bağlı kaynak kaydının metni / anahtar kelimesi o ham yanıtta AYNEN (karakteri
-- karakterine) bulunmalıdır. Kırpma, düzeltme, birleştirme veya yeniden yazma DB düzeyinde reddedilir.
CREATE OR REPLACE FUNCTION public.stone_library_verbatim_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_raw public.stone_library_raw%ROWTYPE; v_val text;
BEGIN
  IF NEW.raw_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'stone_library_records' THEN
    IF NEW.origin <> 'source' THEN RETURN NEW; END IF;
    v_val := NEW.content;
  ELSE
    IF NEW.facet <> 'keyword' THEN RETURN NEW; END IF;
    v_val := NEW.value_text;
  END IF;
  SELECT * INTO v_raw FROM public.stone_library_raw WHERE id = NEW.raw_id;
  IF NOT FOUND OR v_raw.source_id <> NEW.source_id OR (v_raw.lang IS NOT NULL AND v_raw.lang IS DISTINCT FROM NEW.lang)
     OR NOT jsonb_path_exists(v_raw.payload, '$.** ? (@ == $v)', jsonb_build_object('v', v_val)) THEN
    RAISE EXCEPTION '%: kaynak metni ham yanıtta birebir bulunamadı', TG_TABLE_NAME USING ERRCODE = 'SL012';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_records_verbatim ON public.stone_library_records;
CREATE TRIGGER trg_stone_library_records_verbatim BEFORE INSERT ON public.stone_library_records
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_verbatim_guard();
DROP TRIGGER IF EXISTS trg_stone_library_facets_verbatim ON public.stone_library_facets;
CREATE TRIGGER trg_stone_library_facets_verbatim BEFORE INSERT ON public.stone_library_facets
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_verbatim_guard();

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

-- ─── Yayın belgesi (F1 gövdesi + dil şüphesi kilidi + doğrulanmış lisanslı görsel) ───────────────
CREATE OR REPLACE FUNCTION public.stone_library_refresh_stone(p_stone uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  st public.stone_library_stones%ROWTYPE;
  cfg public.stone_library_settings%ROWTYPE;
  v_names text[]; v_aliases jsonb; v_sections jsonb; v_facets jsonb; v_pairings jsonb;
  v_text_a text; v_text_b text; v_text_c text; v_text_d text;
  v_hmin numeric; v_hmax numeric; v_exp timestamptz; v_img record; v_img_meta jsonb;
BEGIN
  PERFORM set_config('stone_library.refresh', 'on', true);
  DELETE FROM public.stone_library_published WHERE stone_id = p_stone;
  SELECT * INTO st FROM public.stone_library_stones WHERE id = p_stone;
  IF NOT FOUND OR st.deleted_at IS NOT NULL OR st.status <> 'published' THEN
    PERFORM set_config('stone_library.refresh', 'off', true);
    RETURN;
  END IF;
  SELECT * INTO cfg FROM public.stone_library_settings WHERE id;

  -- Görünür kayıtlar (geçici küme)
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_vis (source_id uuid, field_key text, lang text, content text, src_rank bigint, label text, attribution text) ON COMMIT DROP;
  TRUNCATE pg_temp._sl_vis;
  INSERT INTO pg_temp._sl_vis
  SELECT r.source_id, r.field_key, r.lang, r.content,
         dense_rank() OVER (ORDER BY s.created_at, s.id),
         public.stone_library_source_label(s),
         CASE WHEN s.attribution_required THEN s.attribution_text END
    FROM public.stone_library_records r
    JOIN public.stone_library_sources s ON s.id = r.source_id
   WHERE r.stone_id = p_stone AND r.is_current AND r.deleted_at IS NULL
     AND r.review_state = 'approved' AND r.visibility = 'visible'
     AND NOT ('lang_suspect' = ANY (r.quality_flags))
     AND (NOT r.health_sensitive OR (r.legal_cleared_at IS NOT NULL AND cfg.health_content_publication_enabled))
     AND s.deleted_at IS NULL AND s.status = 'active'
     AND (s.license_valid_until IS NULL OR s.license_valid_until > now());

  SELECT coalesce(jsonb_agg(sec ORDER BY rk), '[]'::jsonb) INTO v_sections FROM (
    SELECT src_rank AS rk, jsonb_build_object(
             'key', 's' || src_rank,
             'label', max(label),
             'attribution', max(attribution),
             'fields', jsonb_agg(jsonb_build_object('field', field_key, 'lang', lang, 'content', content)
                                 ORDER BY public.stone_library_field_rank(field_key), lang)) AS sec
      FROM pg_temp._sl_vis GROUP BY src_rank) q;

  -- Görünür facet'ler
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_fac (source_id uuid, facet text, value_key text, value_text text, value_num numeric, lang text, pair_slug text, pair_tr text, pair_en text) ON COMMIT DROP;
  TRUNCATE pg_temp._sl_fac;
  INSERT INTO pg_temp._sl_fac
  SELECT f.source_id, f.facet, f.value_key, f.value_text, f.value_num, f.lang, ps.slug, ps.name_tr, ps.name_en
    FROM public.stone_library_facets f
    JOIN public.stone_library_sources s ON s.id = f.source_id
    LEFT JOIN LATERAL (
      SELECT x.id FROM public.stone_library_stones x
       WHERE f.facet = 'pairing' AND x.id = coalesce(f.pair_stone_id,
             (SELECT e.stone_id FROM public.stone_library_external_ids e
               WHERE e.source_id = f.source_id AND e.external_id = f.pair_external_id AND e.deleted_at IS NULL))
    ) pt ON true
    LEFT JOIN public.stone_library_stones ps ON ps.id = pt.id AND ps.deleted_at IS NULL AND ps.status = 'published'
   WHERE f.stone_id = p_stone AND f.deleted_at IS NULL AND f.review_state = 'approved' AND f.visibility = 'visible'
     AND NOT ('lang_suspect' = ANY (f.quality_flags))
     AND (NOT f.health_sensitive OR (f.legal_cleared_at IS NOT NULL AND cfg.health_content_publication_enabled))
     AND s.deleted_at IS NULL AND s.status = 'active'
     AND (s.license_valid_until IS NULL OR s.license_valid_until > now());
  DELETE FROM pg_temp._sl_fac WHERE facet = 'pairing' AND pair_slug IS NULL;  -- yayımlanmamış eşleşme gösterilmez

  SELECT coalesce(jsonb_object_agg(facet, vals), '{}'::jsonb) INTO v_facets FROM (
    SELECT g.facet, jsonb_agg(DISTINCT jsonb_build_object('key', g.value_key,
             'label_tr', coalesce(v.label_tr, g.value_text, g.value_key),
             'label_en', coalesce(v.label_en, g.value_text, g.value_key))) AS vals
      FROM pg_temp._sl_fac g LEFT JOIN public.stone_library_vocab v ON v.facet = g.facet AND v.value_key = g.value_key
     WHERE g.facet IN ('chakra','zodiac','element','color','planet')
     GROUP BY g.facet
    UNION ALL
    SELECT 'keyword', jsonb_agg(DISTINCT jsonb_build_object('lang', lang, 'text', value_text)) FROM pg_temp._sl_fac WHERE facet = 'keyword' HAVING count(*) > 0
    UNION ALL
    SELECT 'birth_month', jsonb_agg(DISTINCT value_num::int) FROM pg_temp._sl_fac WHERE facet = 'birth_month' HAVING count(*) > 0
    UNION ALL
    SELECT 'numerical_vibration', jsonb_agg(DISTINCT value_num) FROM pg_temp._sl_fac WHERE facet = 'numerical_vibration' HAVING count(*) > 0
  ) q;
  SELECT min(value_num), max(value_num) INTO v_hmin, v_hmax FROM pg_temp._sl_fac WHERE facet = 'hardness';
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('slug', pair_slug, 'name_tr', pair_tr, 'name_en', pair_en)), '[]'::jsonb)
    INTO v_pairings FROM pg_temp._sl_fac WHERE facet = 'pairing';

  SELECT coalesce(array_agg(n.name ORDER BY n.name), '{}'),
         coalesce(jsonb_agg(jsonb_build_object('lang', n.lang, 'name', n.name) ORDER BY n.lang, n.name), '[]'::jsonb)
    INTO v_names, v_aliases
    FROM public.stone_library_names n
    LEFT JOIN public.stone_library_sources s ON s.id = n.source_id
   WHERE n.stone_id = p_stone AND n.deleted_at IS NULL AND n.review_state = 'approved'
     AND (n.source_id IS NULL OR (s.deleted_at IS NULL AND s.status = 'active'
                                  AND (s.license_valid_until IS NULL OR s.license_valid_until > now())));

  -- Katkı veren kaynakların en erken lisans bitişi (süresi dolan içerik okunmadan önce geri çekilir).
  SELECT min(x.license_valid_until) INTO v_exp FROM public.stone_library_sources x
   WHERE x.id IN (SELECT source_id FROM pg_temp._sl_vis UNION SELECT source_id FROM pg_temp._sl_fac
                  UNION SELECT n.source_id FROM public.stone_library_names n
                         WHERE n.stone_id = p_stone AND n.deleted_at IS NULL AND n.review_state = 'approved' AND n.source_id IS NOT NULL);

  SELECT i.variant, i.width, i.height INTO v_img
    FROM public.stone_library_images i
    JOIN public.stone_library_sources s ON s.id = i.source_id
   WHERE i.stone_id = p_stone AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'
     AND s.deleted_at IS NULL AND s.status = 'active' AND s.image_rights = 'rehost_ok'
     AND (s.license_valid_until IS NULL OR s.license_valid_until > now())
     AND EXISTS (SELECT 1 FROM public.stone_library_license_grants g
                  WHERE g.id = i.license_grant_id AND g.source_id = i.source_id AND g.scope = 'crystal_images'
                    AND g.evidence_status = 'verified' AND g.storage_allowed AND g.commercial_display
                    AND (g.valid_until IS NULL OR g.valid_until >= current_date)
                    AND (g.modification_allowed OR i.variant = 'original'))
   ORDER BY (i.variant = 'optimized') DESC, i.created_at DESC LIMIT 1;
  -- Görselin kaynağı / izni de yayın satırının bitiş zamanına girer.
  SELECT least(v_exp, min(s.license_valid_until), min((g.valid_until + 1)::timestamptz)) INTO v_exp
    FROM public.stone_library_images i
    JOIN public.stone_library_sources s ON s.id = i.source_id
    LEFT JOIN public.stone_library_license_grants g ON g.id = i.license_grant_id
   WHERE i.stone_id = p_stone AND i.deleted_at IS NULL AND i.review_state = 'approved';
  SELECT jsonb_build_object('attribution', CASE WHEN g.attribution_required THEN g.attribution_text END) INTO v_img_meta
    FROM public.stone_library_images i JOIN public.stone_library_license_grants g ON g.id = i.license_grant_id
   WHERE i.stone_id = p_stone AND i.variant = v_img.variant AND i.deleted_at IS NULL AND i.review_state = 'approved' LIMIT 1;

  v_text_a := concat_ws(' ', st.name_tr, st.name_en, array_to_string(v_names, ' '));
  v_text_b := (SELECT string_agg(concat_ws(' ', g.value_text, v.label_tr, v.label_en), ' ')
                 FROM pg_temp._sl_fac g LEFT JOIN public.stone_library_vocab v ON v.facet = g.facet AND v.value_key = g.value_key
                WHERE g.facet IN ('keyword','chakra','zodiac','element','color','planet'));
  v_text_c := (SELECT string_agg(content, ' ') FROM pg_temp._sl_vis WHERE field_key = 'description');
  v_text_d := (SELECT string_agg(content, ' ') FROM pg_temp._sl_vis WHERE field_key <> 'description');

  INSERT INTO public.stone_library_published (
    stone_id, slug, name_tr, name_en, sort_key, names_fold, names_compact, doc, search_tsv,
    chakra, zodiac, element, color, planet, keyword, pairing, birth_month, hardness_min, hardness_max, expires_at, has_image, refreshed_at)
  VALUES (
    st.id, st.slug, st.name_tr, st.name_en, public.stone_library_fold(st.name_tr),
    public.stone_library_fold(v_text_a), replace(public.stone_library_fold(v_text_a), ' ', ''),
    jsonb_build_object(
      'slug', st.slug, 'name_tr', st.name_tr, 'name_en', st.name_en, 'aliases', v_aliases,
      'facets', v_facets,
      'hardness', CASE WHEN v_hmin IS NULL THEN NULL ELSE jsonb_build_object('min', v_hmin, 'max', v_hmax) END,
      'pairings', v_pairings, 'sections', v_sections,
      'image', CASE WHEN v_img.variant IS NULL THEN NULL
                    ELSE jsonb_build_object('available', true, 'width', v_img.width, 'height', v_img.height,
                                            'attribution', v_img_meta ->> 'attribution') END,
      'health_notice', jsonb_build_object('tr', cfg.health_notice_tr, 'en', cfg.health_notice_en),
      'updated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    setweight(to_tsvector('simple', public.stone_library_fold(v_text_a)), 'A')
      || setweight(to_tsvector('simple', public.stone_library_fold(coalesce(v_text_b, ''))), 'B')
      || setweight(to_tsvector('simple', public.stone_library_fold(coalesce(v_text_c, ''))), 'C')
      || setweight(to_tsvector('simple', public.stone_library_fold(coalesce(v_text_d, ''))), 'D'),
    coalesce((SELECT array_agg(DISTINCT value_key) FROM pg_temp._sl_fac WHERE facet = 'chakra'), '{}'),
    coalesce((SELECT array_agg(DISTINCT value_key) FROM pg_temp._sl_fac WHERE facet = 'zodiac'), '{}'),
    coalesce((SELECT array_agg(DISTINCT value_key) FROM pg_temp._sl_fac WHERE facet = 'element'), '{}'),
    coalesce((SELECT array_agg(DISTINCT value_key) FROM pg_temp._sl_fac WHERE facet = 'color'), '{}'),
    coalesce((SELECT array_agg(DISTINCT value_key) FROM pg_temp._sl_fac WHERE facet = 'planet'), '{}'),
    coalesce((SELECT array_agg(DISTINCT value_key) FROM pg_temp._sl_fac WHERE facet = 'keyword'), '{}'),
    coalesce((SELECT array_agg(DISTINCT pair_slug) FROM pg_temp._sl_fac WHERE facet = 'pairing'), '{}'),
    coalesce((SELECT array_agg(DISTINCT value_num::int) FROM pg_temp._sl_fac WHERE facet = 'birth_month'), '{}'),
    v_hmin, v_hmax, v_exp, (v_img.variant IS NOT NULL), now());
  PERFORM set_config('stone_library.refresh', 'off', true);
END $$;

-- ─── Silme / geri alma (F1 gövdesi + görseller) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_delete(p_actor uuid, p_entity text, p_id uuid, p_reason text DEFAULT NULL, p_cascade boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_op uuid := gen_random_uuid(); v_aff jsonb := '[]'::jsonb; v_deps int; st public.stone_library_stones%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  PERFORM public.stone_library_defer_begin();
  INSERT INTO public.stone_library_delete_ops (id, entity, entity_id, reason, actor) VALUES (v_op, p_entity, p_id, nullif(btrim(coalesce(p_reason,'')),''), p_actor);
  IF p_entity = 'stone' THEN
    SELECT * INTO st FROM public.stone_library_stones WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_delete: taş yok' USING ERRCODE = 'SL024'; END IF;
    IF st.status = 'published' THEN RAISE EXCEPTION 'stone_library_delete: yayımdaki taş silinemez; önce yayından kaldırın' USING ERRCODE = 'SL050'; END IF;
    SELECT (SELECT count(*) FROM public.stone_library_records WHERE stone_id = p_id AND deleted_at IS NULL)
         + (SELECT count(*) FROM public.stone_library_facets WHERE stone_id = p_id AND deleted_at IS NULL)
         + (SELECT count(*) FROM public.stone_library_names WHERE stone_id = p_id AND deleted_at IS NULL)
         + (SELECT count(*) FROM public.stone_library_external_ids WHERE stone_id = p_id AND deleted_at IS NULL) INTO v_deps;
    IF v_deps > 0 AND NOT p_cascade THEN
      RAISE EXCEPTION 'stone_library_delete: tasa bağlı % kayıt var; bağımlılıklarla birlikte silmek için cascade gerekir', v_deps USING ERRCODE = 'SL051';
    END IF;
    IF EXISTS (SELECT 1 FROM public.stone_library_facets WHERE pair_stone_id = p_id AND deleted_at IS NULL AND stone_id <> p_id) AND NOT p_cascade THEN
      RAISE EXCEPTION 'stone_library_delete: başka kartlar bu taşı eşleştirme olarak gösteriyor; cascade gerekir' USING ERRCODE = 'SL051';
    END IF;
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_records', ARRAY(SELECT id FROM public.stone_library_records WHERE stone_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_facets', ARRAY(SELECT id FROM public.stone_library_facets WHERE (stone_id = p_id OR pair_stone_id = p_id) AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_names', ARRAY(SELECT id FROM public.stone_library_names WHERE stone_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_external_ids', ARRAY(SELECT id FROM public.stone_library_external_ids WHERE stone_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_images', ARRAY(SELECT id FROM public.stone_library_images WHERE stone_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_stones', ARRAY[p_id]);
  ELSIF p_entity = 'source' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stone_library_sources WHERE id = p_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'stone_library_delete: kaynak yok' USING ERRCODE = 'SL022';
    END IF;
    IF EXISTS (SELECT 1 FROM public.stone_library_import_batches WHERE source_id = p_id AND status IN ('running','stop_requested')) THEN
      RAISE EXCEPTION 'stone_library_delete: çalışan aktarım varken kaynak silinemez' USING ERRCODE = 'SL052';
    END IF;
    SELECT (SELECT count(*) FROM public.stone_library_records WHERE source_id = p_id AND deleted_at IS NULL)
         + (SELECT count(*) FROM public.stone_library_facets WHERE source_id = p_id AND deleted_at IS NULL)
         + (SELECT count(*) FROM public.stone_library_names WHERE source_id = p_id AND deleted_at IS NULL)
         + (SELECT count(*) FROM public.stone_library_external_ids WHERE source_id = p_id AND deleted_at IS NULL) INTO v_deps;
    IF v_deps > 0 AND NOT p_cascade THEN
      RAISE EXCEPTION 'stone_library_delete: kaynağa bağlı % kayıt var; cascade gerekir', v_deps USING ERRCODE = 'SL051';
    END IF;
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_records', ARRAY(SELECT id FROM public.stone_library_records WHERE source_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_facets', ARRAY(SELECT id FROM public.stone_library_facets WHERE source_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_names', ARRAY(SELECT id FROM public.stone_library_names WHERE source_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_external_ids', ARRAY(SELECT id FROM public.stone_library_external_ids WHERE source_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_source_documents', ARRAY(SELECT id FROM public.stone_library_source_documents WHERE source_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_images', ARRAY(SELECT id FROM public.stone_library_images WHERE source_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_sources', ARRAY[p_id]);
  ELSIF p_entity IN ('record','facet','name','external_id','document','image') THEN
    v_aff := public.stone_library_soft_delete_rows(v_op, p_actor,
               CASE p_entity WHEN 'record' THEN 'stone_library_records' WHEN 'facet' THEN 'stone_library_facets'
                             WHEN 'name' THEN 'stone_library_names' WHEN 'external_id' THEN 'stone_library_external_ids'
                             WHEN 'image' THEN 'stone_library_images'
                             ELSE 'stone_library_source_documents' END, ARRAY[p_id]);
  ELSIF p_entity = 'batch' THEN
    RAISE EXCEPTION 'stone_library_delete: paket silinmez; stone_library_batch_rollback kullanın' USING ERRCODE = 'SL053';
  ELSE
    RAISE EXCEPTION 'stone_library_delete: geçersiz varlık' USING ERRCODE = 'SL043';
  END IF;
  IF jsonb_array_length(v_aff) = 0 THEN RAISE EXCEPTION 'stone_library_delete: silinecek kayıt yok' USING ERRCODE = 'SL044'; END IF;
  UPDATE public.stone_library_delete_ops SET affected = v_aff WHERE id = v_op;
  PERFORM public.stone_library_defer_flush();
  PERFORM public.stone_library_review_log(p_entity, p_id, 'delete', p_reason);
  RETURN v_op;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_restore(p_actor uuid, p_op_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE op public.stone_library_delete_ops%ROWTYPE; it jsonb; n int := 0; r public.stone_library_records%ROWTYPE; v_tables text[];
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO op FROM public.stone_library_delete_ops WHERE id = p_op_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_restore: işlem yok' USING ERRCODE = 'SL054'; END IF;
  IF op.restored_at IS NOT NULL THEN RAISE EXCEPTION 'stone_library_restore: zaten geri alındı' USING ERRCODE = 'SL055'; END IF;
  PERFORM public.stone_library_defer_begin();
  -- 1) Silme sırasında güncel yapılan sürümler eski hâline döner.
  FOR it IN SELECT * FROM jsonb_array_elements(op.affected) LOOP
    IF it ->> 't' = 'promoted' THEN
      UPDATE public.stone_library_records SET is_current = false WHERE id = (it ->> 'id')::uuid;
    END IF;
  END LOOP;
  -- 2) Ebeveyn önce geri gelir (kaynak / taş), sonra bağımlılar.
  v_tables := ARRAY['stone_library_sources','stone_library_stones','stone_library_source_documents','stone_library_external_ids',
                    'stone_library_names','stone_library_facets','stone_library_records','stone_library_images'];
  FOR i IN 1 .. array_length(v_tables, 1) LOOP
    FOR it IN SELECT * FROM jsonb_array_elements(op.affected) e WHERE e ->> 't' = v_tables[i] LOOP
      IF v_tables[i] = 'stone_library_records' THEN
        SELECT * INTO r FROM public.stone_library_records WHERE id = (it ->> 'id')::uuid;
        IF coalesce((it ->> 'was_current')::boolean, false) THEN
          UPDATE public.stone_library_records SET is_current = false
           WHERE stone_id = r.stone_id AND source_id = r.source_id AND field_key = r.field_key AND lang = r.lang AND is_current AND deleted_at IS NULL;
        END IF;
        UPDATE public.stone_library_records SET deleted_at = NULL, deleted_by = NULL, delete_op_id = NULL,
               is_current = coalesce((it ->> 'was_current')::boolean, false)
         WHERE id = r.id AND delete_op_id = p_op_id;
      ELSE
        EXECUTE format('UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL, delete_op_id = NULL WHERE id = $1 AND delete_op_id = $2', v_tables[i])
          USING (it ->> 'id')::uuid, p_op_id;
      END IF;
      n := n + 1;
    END LOOP;
  END LOOP;
  UPDATE public.stone_library_delete_ops SET restored_at = now(), restored_by = p_actor WHERE id = p_op_id;
  PERFORM public.stone_library_defer_flush();
  IF op.entity = 'batch' THEN
    UPDATE public.stone_library_import_batches SET
      status = coalesce((SELECT e ->> 'status' FROM jsonb_array_elements(op.affected) e WHERE e ->> 't' = 'batch_status' LIMIT 1), 'completed'),
      rolled_back_at = NULL, rollback_op_id = NULL
    WHERE id = op.entity_id;
  END IF;
  PERFORM public.stone_library_review_log(CASE WHEN op.entity = 'batch' THEN 'batch' ELSE op.entity END, op.entity_id, 'restore', NULL);
  RETURN n;
END $$;

-- ─── Uzman araması (F1 gövdesi + has_image) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_expert_search(p_viewer uuid, p_query text DEFAULT NULL, p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 30, p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, extensions, public, pg_temp AS $$
DECLARE
  v_q text := public.stone_library_fold(left(coalesce(p_query, ''), 80));
  v_qc text; v_ts tsquery; v_limit int := least(greatest(coalesce(p_limit, 30), 1), 50); v_offset int := least(greatest(coalesce(p_offset, 0), 0), 10000);
  f jsonb := coalesce(p_filters, '{}'::jsonb); v_total int; v_items jsonb;
  a_chakra text[]; a_zodiac text[]; a_element text[]; a_color text[]; a_planet text[]; a_keyword text[]; a_pair text[]; a_month int[];
  v_hmin numeric; v_hmax numeric;
BEGIN
  IF NOT public.stone_library_viewer_allowed(p_viewer) THEN RETURN NULL; END IF;
  PERFORM public.stone_library_refresh_expired();
  IF jsonb_typeof(f) <> 'object' THEN f := '{}'::jsonb; END IF;
  a_chakra  := ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'chakra') = 'array' THEN f -> 'chakra' ELSE '[]' END) x WHERE x ~ '^[a-z0-9_]{1,60}$' LIMIT 20);
  a_zodiac  := ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'zodiac') = 'array' THEN f -> 'zodiac' ELSE '[]' END) x WHERE x ~ '^[a-z0-9_]{1,60}$' LIMIT 20);
  a_element := ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'element') = 'array' THEN f -> 'element' ELSE '[]' END) x WHERE x ~ '^[a-z0-9_]{1,60}$' LIMIT 20);
  a_color   := ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'color') = 'array' THEN f -> 'color' ELSE '[]' END) x WHERE x ~ '^[a-z0-9_]{1,60}$' LIMIT 20);
  a_planet  := ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'planet') = 'array' THEN f -> 'planet' ELSE '[]' END) x WHERE x ~ '^[a-z0-9_]{1,60}$' LIMIT 20);
  a_keyword := ARRAY(SELECT public.stone_library_fold(x) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'keyword') = 'array' THEN f -> 'keyword' ELSE '[]' END) x LIMIT 20);
  a_pair    := ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'pairs_with') = 'array' THEN f -> 'pairs_with' ELSE '[]' END) x WHERE x ~ '^[a-z0-9]+(-[a-z0-9]+)*$' LIMIT 20);
  a_month   := ARRAY(SELECT x::int FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f -> 'birth_month') = 'array' THEN f -> 'birth_month' ELSE '[]' END) x WHERE x ~ '^(1[0-2]|[1-9])$' LIMIT 12);
  v_hmin := CASE WHEN (f ->> 'hardness_min') ~ '^[0-9]{1,2}(\.[0-9]{1,2})?$' THEN (f ->> 'hardness_min')::numeric END;
  v_hmax := CASE WHEN (f ->> 'hardness_max') ~ '^[0-9]{1,2}(\.[0-9]{1,2})?$' THEN (f ->> 'hardness_max')::numeric END;
  IF v_q <> '' THEN
    v_qc := replace(v_q, ' ', '');
    v_ts := to_tsquery('simple', (SELECT string_agg(t || ':*', ' & ') FROM unnest(string_to_array(v_q, ' ')) t WHERE t <> ''));
  END IF;

  WITH hits AS (
    SELECT p.*,
      CASE WHEN v_q = '' THEN 0
           WHEN p.names_fold = v_q OR p.sort_key = v_q OR public.stone_library_fold(p.name_en) = v_q THEN 4
           WHEN p.names_compact LIKE '%' || v_qc || '%' THEN 3
           WHEN v_ts IS NOT NULL AND p.search_tsv @@ v_ts THEN 2
           ELSE 1 END AS tier,
      CASE WHEN v_ts IS NOT NULL THEN ts_rank(p.search_tsv, v_ts) ELSE 0 END AS rnk
      FROM public.stone_library_published p
     WHERE (v_q = '' OR p.names_compact LIKE '%' || v_qc || '%'
            OR (v_ts IS NOT NULL AND p.search_tsv @@ v_ts)
            OR (char_length(v_q) >= 4 AND word_similarity(v_q, p.names_fold) >= 0.5))
       AND (cardinality(a_chakra) = 0 OR p.chakra && a_chakra)
       AND (cardinality(a_zodiac) = 0 OR p.zodiac && a_zodiac)
       AND (cardinality(a_element) = 0 OR p.element && a_element)
       AND (cardinality(a_color) = 0 OR p.color && a_color)
       AND (cardinality(a_planet) = 0 OR p.planet && a_planet)
       AND (cardinality(a_keyword) = 0 OR p.keyword && a_keyword)
       AND (cardinality(a_pair) = 0 OR p.pairing && a_pair)
       AND (cardinality(a_month) = 0 OR p.birth_month && a_month)
       AND (v_hmin IS NULL OR p.hardness_max >= v_hmin)
       AND (v_hmax IS NULL OR p.hardness_min <= v_hmax)
  ), counted AS (SELECT count(*)::int AS n FROM hits),
  page AS (
    SELECT h.*, ex.content AS ex_content, ex.attribution AS ex_attribution
      FROM (SELECT * FROM hits ORDER BY tier DESC, rnk DESC, sort_key, slug LIMIT v_limit OFFSET v_offset) h
      -- Özet: önce atıf gerektirmeyen bölümden; atıflı bölümden alınırsa atıf metniyle BİRLİKTE döner.
      LEFT JOIN LATERAL (
        SELECT left(fl ->> 'content', 240) AS content, sec ->> 'attribution' AS attribution
          FROM jsonb_array_elements(h.doc -> 'sections') sec, LATERAL jsonb_array_elements(sec -> 'fields') fl
         WHERE fl ->> 'field' = 'description'
         ORDER BY (sec ->> 'attribution') IS NOT NULL, (fl ->> 'lang') <> 'tr' LIMIT 1) ex ON true
  )
  SELECT (SELECT n FROM counted),
         coalesce(jsonb_agg(jsonb_build_object(
           'slug', page.slug, 'name_tr', page.name_tr, 'name_en', page.name_en, 'has_image', page.has_image,
           'facets', jsonb_strip_nulls(jsonb_build_object(
              'chakra', page.doc -> 'facets' -> 'chakra', 'zodiac', page.doc -> 'facets' -> 'zodiac',
              'element', page.doc -> 'facets' -> 'element', 'color', page.doc -> 'facets' -> 'color')),
           'excerpt', page.ex_content, 'excerpt_attribution', page.ex_attribution
         ) ORDER BY page.tier DESC, page.rnk DESC, page.sort_key, page.slug), '[]'::jsonb)
    INTO v_total, v_items FROM page;

  RETURN jsonb_build_object('total', coalesce(v_total, 0), 'limit', v_limit, 'offset', v_offset, 'items', v_items);
END $$;

-- ─── Paket geri alma (F1 gövdesi + görseller) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_batch_rollback(p_actor uuid, p_batch_id uuid, p_note text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b public.stone_library_import_batches%ROWTYPE; v_op uuid := gen_random_uuid(); v_aff jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO b FROM public.stone_library_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_batch_rollback: paket yok' USING ERRCODE = 'SL030'; END IF;
  IF b.status NOT IN ('completed','stopped','failed') THEN
    RAISE EXCEPTION 'stone_library_batch_rollback: yalnız bitmiş paket geri alınır (%)', b.status USING ERRCODE = 'SL064';
  END IF;
  PERFORM public.stone_library_defer_begin();
  INSERT INTO public.stone_library_delete_ops (id, entity, entity_id, reason, actor) VALUES (v_op, 'batch', p_batch_id, p_note, p_actor);
  v_aff := v_aff || jsonb_build_array(jsonb_build_object('t', 'batch_status', 'status', b.status));
  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_records', ARRAY(SELECT id FROM public.stone_library_records WHERE batch_id = p_batch_id AND deleted_at IS NULL));
  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_facets', ARRAY(SELECT id FROM public.stone_library_facets WHERE batch_id = p_batch_id AND deleted_at IS NULL));
  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_names', ARRAY(SELECT id FROM public.stone_library_names WHERE batch_id = p_batch_id AND deleted_at IS NULL));
  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_external_ids', ARRAY(SELECT id FROM public.stone_library_external_ids WHERE batch_id = p_batch_id AND deleted_at IS NULL));
  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_images', ARRAY(SELECT id FROM public.stone_library_images WHERE batch_id = p_batch_id AND deleted_at IS NULL));
  UPDATE public.stone_library_delete_ops SET affected = v_aff WHERE id = v_op;
  UPDATE public.stone_library_import_batches SET status = 'rolled_back', rolled_back_at = now(), rollback_op_id = v_op WHERE id = p_batch_id;
  PERFORM public.stone_library_defer_flush();
  INSERT INTO public.stone_library_import_events (batch_id, level, kind, message, actor) VALUES (p_batch_id, 'warn', 'rolled_back', p_note, p_actor);
  PERFORM public.stone_library_review_log('batch', p_batch_id, 'rollback', p_note);
  RETURN v_op;
END $$;

-- ─── 8) Görsel / lisans değişikliğinde yayın yenileme ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_after_image_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_defer boolean := coalesce(current_setting('stone_library.defer', true), '') = 'on'; v_src uuid;
BEGIN
  IF TG_TABLE_NAME = 'stone_library_images' THEN
    IF v_defer THEN PERFORM public.stone_library_mark_dirty(NEW.stone_id, false);
    ELSE PERFORM public.stone_library_refresh_stone(NEW.stone_id); END IF;
  ELSE
    IF TG_TABLE_NAME = 'stone_library_sources' THEN v_src := NEW.id; ELSE v_src := NEW.source_id; END IF;
    IF v_defer THEN
      PERFORM public.stone_library_mark_dirty(i.stone_id, false) FROM (SELECT DISTINCT stone_id FROM public.stone_library_images WHERE source_id = v_src) i;
    ELSE
      PERFORM public.stone_library_refresh_stone(i.stone_id) FROM (SELECT DISTINCT stone_id FROM public.stone_library_images WHERE source_id = v_src) i;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_images_refresh ON public.stone_library_images;
CREATE TRIGGER trg_stone_library_images_refresh AFTER INSERT OR UPDATE ON public.stone_library_images
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_after_image_change();
DROP TRIGGER IF EXISTS trg_stone_library_license_grants_refresh ON public.stone_library_license_grants;
CREATE TRIGGER trg_stone_library_license_grants_refresh AFTER INSERT OR UPDATE ON public.stone_library_license_grants
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_after_image_change();
DROP TRIGGER IF EXISTS trg_stone_library_sources_image_refresh ON public.stone_library_sources;
CREATE TRIGGER trg_stone_library_sources_image_refresh AFTER UPDATE ON public.stone_library_sources
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_after_image_change();

-- ─── 9) Owner RPC'leri — lisans izni ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_license_grant_save(p_actor uuid, p_grant_id uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid; k text; g public.stone_library_license_grants%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'stone_library_license_grant_save: veri gerekli' USING ERRCODE = 'SL020'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['source_id','scope','granted_on','grantor_label','commercial_display','storage_allowed','post_subscription_rights',
                           'attribution_required','attribution_text','modification_allowed','redistribution_limit','max_resolution',
                           'document_id','document_sha256','notes','valid_until'])) THEN
      RAISE EXCEPTION 'stone_library_license_grant_save: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  IF p_grant_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.stone_library_sources WHERE id = (p_data ->> 'source_id')::uuid AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'stone_library_license_grant_save: kaynak yok' USING ERRCODE = 'SL022';
    END IF;
    INSERT INTO public.stone_library_license_grants (source_id, scope, granted_on, grantor_label, commercial_display, storage_allowed,
      post_subscription_rights, attribution_required, attribution_text, modification_allowed, redistribution_limit, max_resolution,
      document_id, document_sha256, notes, valid_until, created_by)
    VALUES ((p_data ->> 'source_id')::uuid, p_data ->> 'scope', (p_data ->> 'granted_on')::date, p_data ->> 'grantor_label',
      (p_data ->> 'commercial_display')::boolean, (p_data ->> 'storage_allowed')::boolean, (p_data ->> 'post_subscription_rights')::boolean,
      (p_data ->> 'attribution_required')::boolean, p_data ->> 'attribution_text', (p_data ->> 'modification_allowed')::boolean,
      p_data ->> 'redistribution_limit', p_data ->> 'max_resolution', (p_data ->> 'document_id')::uuid, p_data ->> 'document_sha256',
      p_data ->> 'notes', (p_data ->> 'valid_until')::date, p_actor)
    RETURNING id INTO v_id;
    PERFORM public.stone_library_review_log('license', v_id, 'create', NULL);
    RETURN v_id;
  END IF;
  SELECT * INTO g FROM public.stone_library_license_grants WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_license_grant_save: izin yok' USING ERRCODE = 'SL081'; END IF;
  IF g.evidence_status = 'revoked' THEN
    RAISE EXCEPTION 'stone_library_license_grant_save: iptal edilmiş izin düzenlenemez' USING ERRCODE = 'SL084';
  END IF;
  IF g.evidence_status = 'verified' AND (p_data - ARRAY['notes']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'stone_library_license_grant_save: doğrulanmış izin değiştirilemez (önce iptal)' USING ERRCODE = 'SL082';
  END IF;
  UPDATE public.stone_library_license_grants SET
    scope = coalesce(p_data ->> 'scope', scope),
    granted_on = coalesce((p_data ->> 'granted_on')::date, granted_on),
    grantor_label = coalesce(p_data ->> 'grantor_label', grantor_label),
    commercial_display = coalesce((p_data ->> 'commercial_display')::boolean, commercial_display),
    storage_allowed = coalesce((p_data ->> 'storage_allowed')::boolean, storage_allowed),
    post_subscription_rights = coalesce((p_data ->> 'post_subscription_rights')::boolean, post_subscription_rights),
    attribution_required = coalesce((p_data ->> 'attribution_required')::boolean, attribution_required),
    attribution_text = CASE WHEN p_data ? 'attribution_text' THEN p_data ->> 'attribution_text' ELSE attribution_text END,
    modification_allowed = coalesce((p_data ->> 'modification_allowed')::boolean, modification_allowed),
    redistribution_limit = coalesce(p_data ->> 'redistribution_limit', redistribution_limit),
    max_resolution = CASE WHEN p_data ? 'max_resolution' THEN p_data ->> 'max_resolution' ELSE max_resolution END,
    document_id = CASE WHEN p_data ? 'document_id' THEN (p_data ->> 'document_id')::uuid ELSE document_id END,
    document_sha256 = CASE WHEN p_data ? 'document_sha256' THEN p_data ->> 'document_sha256' ELSE document_sha256 END,
    notes = CASE WHEN p_data ? 'notes' THEN p_data ->> 'notes' ELSE notes END,
    valid_until = CASE WHEN p_data ? 'valid_until' THEN (p_data ->> 'valid_until')::date ELSE valid_until END,
    updated_at = now()
  WHERE id = p_grant_id;
  PERFORM public.stone_library_review_log('license', p_grant_id, 'edit', NULL);
  RETURN p_grant_id;
END $$;

-- Owner kanıtı doğrular (belge özeti zorunlu) veya iptal eder. İptal → izin bağlı görseller anında yayından düşer.
CREATE OR REPLACE FUNCTION public.stone_library_license_grant_set_status(p_actor uuid, p_grant_id uuid, p_status text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE g public.stone_library_license_grants%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO g FROM public.stone_library_license_grants WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_license_grant_set_status: izin yok' USING ERRCODE = 'SL081'; END IF;
  IF p_status NOT IN ('verified','revoked','owner_verification_pending') THEN RAISE EXCEPTION 'stone_library_license_grant_set_status: geçersiz durum' USING ERRCODE = 'SL083'; END IF;
  IF g.evidence_status = 'revoked' THEN RAISE EXCEPTION 'stone_library_license_grant_set_status: iptal edilmiş izin yeniden açılamaz' USING ERRCODE = 'SL084'; END IF;
  IF p_status = 'verified' AND (g.document_sha256 IS NULL OR g.document_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.stone_library_source_documents d
        WHERE d.id = g.document_id AND d.source_id = g.source_id AND d.deleted_at IS NULL AND d.content_sha256 = g.document_sha256)) THEN
    RAISE EXCEPTION 'stone_library_license_grant_set_status: izin, aynı kaynağın SHA-256 özeti eşleşen belgesine bağlı olmadan doğrulanamaz' USING ERRCODE = 'SL085';
  END IF;
  UPDATE public.stone_library_license_grants SET evidence_status = p_status,
    verified_at = CASE WHEN p_status = 'verified' THEN now() ELSE verified_at END,
    verified_by = CASE WHEN p_status = 'verified' THEN p_actor ELSE verified_by END, updated_at = now()
  WHERE id = p_grant_id;
  PERFORM public.stone_library_review_log('license', p_grant_id, CASE p_status WHEN 'verified' THEN 'verify' WHEN 'revoked' THEN 'revoke' ELSE 'unverify' END, p_note);
END $$;

-- ─── 10) Owner RPC'leri — görsel ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_image_register(p_actor uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_stone uuid := (p_data ->> 'stone_id')::uuid; v_source uuid := (p_data ->> 'source_id')::uuid;
  v_grant uuid := (p_data ->> 'license_grant_id')::uuid; v_variant text := p_data ->> 'variant';
  v_sha text := lower(p_data ->> 'sha256'); v_batch uuid := (p_data ->> 'batch_id')::uuid;
  v_existing public.stone_library_images%ROWTYPE; v_id uuid; g public.stone_library_license_grants%ROWTYPE; k text;
  v_flags text[] := CASE WHEN jsonb_typeof(p_data -> 'quality_flags') = 'array'
                         THEN ARRAY(SELECT jsonb_array_elements_text(p_data -> 'quality_flags')) ELSE '{}'::text[] END;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['stone_id','source_id','license_grant_id','external_id','variant','derived_from_id','source_url','storage_path',
                           'mime','bytes','width','height','sha256','batch_id','quality_flags'])) THEN
      RAISE EXCEPTION 'stone_library_image_register: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = v_stone AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_image_register: taş yok' USING ERRCODE = 'SL024';
  END IF;
  SELECT * INTO g FROM public.stone_library_license_grants WHERE id = v_grant;
  IF NOT FOUND OR g.source_id <> v_source OR g.scope <> 'crystal_images' OR g.evidence_status = 'revoked' OR NOT g.storage_allowed THEN
    RAISE EXCEPTION 'stone_library_image_register: bu kaynak için geçerli görsel saklama izni yok' USING ERRCODE = 'SL086';
  END IF;
  IF g.max_resolution IS NOT NULL AND ((p_data ->> 'width')::int > split_part(g.max_resolution, 'x', 1)::int
                                       OR (p_data ->> 'height')::int > split_part(g.max_resolution, 'x', 2)::int) THEN
    RAISE EXCEPTION 'stone_library_image_register: görsel izin verilen azami çözünürlüğü aşıyor' USING ERRCODE = 'SL088';
  END IF;
  IF v_batch IS NOT NULL THEN PERFORM public.stone_library_assert_batch_writable(v_batch, v_source); END IF;
  SELECT * INTO v_existing FROM public.stone_library_images
   WHERE stone_id = v_stone AND source_id = v_source AND variant = v_variant AND deleted_at IS NULL;
  IF FOUND THEN
    IF v_existing.sha256 = v_sha THEN RETURN v_existing.id; END IF;  -- aynı dosya: yeniden kayıt yok
    RAISE EXCEPTION 'stone_library_image_register: bu taş için farklı bir görsel kayıtlı (kaynak değişikliği; owner incelemesi)' USING ERRCODE = 'SL087';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_images WHERE sha256 = v_sha AND variant = v_variant AND stone_id <> v_stone AND deleted_at IS NULL) THEN
    v_flags := array_append(array_remove(v_flags, 'duplicate_image'), 'duplicate_image');
  END IF;
  INSERT INTO public.stone_library_images (stone_id, source_id, license_grant_id, external_id, variant, derived_from_id, source_url,
    storage_bucket, storage_path, mime, bytes, width, height, sha256, batch_id, quality_flags, created_by)
  VALUES (v_stone, v_source, v_grant, p_data ->> 'external_id', v_variant, (p_data ->> 'derived_from_id')::uuid, p_data ->> 'source_url',
    'stone-library-images', p_data ->> 'storage_path', p_data ->> 'mime', (p_data ->> 'bytes')::int, (p_data ->> 'width')::int,
    (p_data ->> 'height')::int, v_sha, v_batch, v_flags, p_actor)
  RETURNING id INTO v_id;
  PERFORM public.stone_library_review_log('image', v_id, 'create', NULL);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_image_review(p_actor uuid, p_image_id uuid, p_action text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n int;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_action IN ('approve','reject') THEN
    UPDATE public.stone_library_images SET review_state = CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
           reviewed_at = now(), reviewed_by = p_actor WHERE id = p_image_id AND deleted_at IS NULL;
  ELSIF p_action IN ('hide','show') THEN
    UPDATE public.stone_library_images SET visibility = CASE p_action WHEN 'hide' THEN 'hidden' ELSE 'visible' END WHERE id = p_image_id AND deleted_at IS NULL;
  ELSE RAISE EXCEPTION 'stone_library_image_review: geçersiz işlem' USING ERRCODE = 'SL043'; END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'stone_library_image_review: görsel yok' USING ERRCODE = 'SL044'; END IF;
  PERFORM public.stone_library_review_log('image', p_image_id, p_action, p_note);
END $$;

-- ─── 11) Owner RPC'leri — dil / kalite işaretleri ──────────────────────────────────────────────
-- set_flags: aktarım motoru kayıt / facet eklerken kalite işaretlerini yazar. confirm_language: owner dili doğrular
-- (lang_suspect + tr_equals_en kalkar). mark_lang_suspect: owner elle şüpheli işaretler.
CREATE OR REPLACE FUNCTION public.stone_library_quality_flags(p_actor uuid, p_entity text, p_id uuid, p_action text, p_flags jsonb DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_out text[]; v_tbl text;
  v_flags text[] := CASE WHEN jsonb_typeof(p_flags) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_flags)) ELSE '{}'::text[] END;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_entity NOT IN ('record','facet') THEN RAISE EXCEPTION 'stone_library_quality_flags: geçersiz varlık' USING ERRCODE = 'SL043'; END IF;
  v_tbl := CASE p_entity WHEN 'record' THEN 'stone_library_records' ELSE 'stone_library_facets' END;
  IF p_action = 'add' AND EXISTS (SELECT 1 FROM public.stone_library_reviews r WHERE r.entity = p_entity AND r.entity_id = p_id AND r.action = 'confirm_language') THEN
    -- Owner dili doğrulamışsa aynı içerik yeniden aktarıldığında dil şüphesi geri eklenmez.
    v_flags := array_remove(array_remove(v_flags, 'lang_suspect'), 'tr_equals_en');
  END IF;
  IF p_action = 'add' THEN
    EXECUTE format('UPDATE public.%I SET quality_flags = ARRAY(SELECT DISTINCT unnest(quality_flags || $1) ORDER BY 1) WHERE id = $2 AND deleted_at IS NULL RETURNING quality_flags', v_tbl)
      INTO v_out USING v_flags, p_id;
  ELSIF p_action = 'confirm_language' THEN
    EXECUTE format('UPDATE public.%I SET quality_flags = array_remove(array_remove(quality_flags, ''lang_suspect''), ''tr_equals_en'') WHERE id = $1 AND deleted_at IS NULL RETURNING quality_flags', v_tbl)
      INTO v_out USING p_id;
  ELSIF p_action = 'mark_lang_suspect' THEN
    EXECUTE format('UPDATE public.%I SET quality_flags = ARRAY(SELECT DISTINCT unnest(quality_flags || ARRAY[''lang_suspect'']) ORDER BY 1) WHERE id = $1 AND deleted_at IS NULL RETURNING quality_flags', v_tbl)
      INTO v_out USING p_id;
  ELSE RAISE EXCEPTION 'stone_library_quality_flags: geçersiz işlem' USING ERRCODE = 'SL043'; END IF;
  IF v_out IS NULL THEN RAISE EXCEPTION 'stone_library_quality_flags: hedef yok' USING ERRCODE = 'SL044'; END IF;
  IF p_action <> 'add' THEN PERFORM public.stone_library_review_log(p_entity, p_id, p_action, p_note); END IF;
  RETURN v_out;
END $$;

-- Kayıt / facet + kalite işaretleri TEK işlemde (araya kesinti girerse işaretsiz kayıt kalmaz).
CREATE OR REPLACE FUNCTION public.stone_library_record_add_flagged(p_actor uuid, p_data jsonb, p_flags jsonb DEFAULT '[]'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.stone_library_record_add(p_actor, p_data);
  IF jsonb_typeof(p_flags) = 'array' AND jsonb_array_length(p_flags) > 0 THEN
    PERFORM public.stone_library_quality_flags(p_actor, 'record', v_id, 'add', p_flags, NULL);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_facet_add_flagged(p_actor uuid, p_data jsonb, p_flags jsonb DEFAULT '[]'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.stone_library_facet_add(p_actor, p_data);
  IF jsonb_typeof(p_flags) = 'array' AND jsonb_array_length(p_flags) > 0 THEN
    PERFORM public.stone_library_quality_flags(p_actor, 'facet', v_id, 'add', p_flags, NULL);
  END IF;
  RETURN v_id;
END $$;

-- Takılı paket kurtarma: süre aşımı / çökme sonrası 'running' kalan paket owner kararıyla 'stopped' yapılır (devam edilebilir).
CREATE OR REPLACE FUNCTION public.stone_library_batch_recover(p_actor uuid, p_batch_id uuid, p_note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b public.stone_library_import_batches%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO b FROM public.stone_library_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_batch_recover: paket yok' USING ERRCODE = 'SL030'; END IF;
  IF b.status = 'planned' THEN
    PERFORM public.stone_library_batch_set_status(p_actor, p_batch_id, 'stopped', coalesce(p_note, 'recover'));
  ELSIF b.status = 'running' THEN
    PERFORM public.stone_library_batch_set_status(p_actor, p_batch_id, 'stop_requested', coalesce(p_note, 'recover'));
    PERFORM public.stone_library_batch_set_status(p_actor, p_batch_id, 'stopped', coalesce(p_note, 'recover'));
  ELSIF b.status = 'stop_requested' THEN
    PERFORM public.stone_library_batch_set_status(p_actor, p_batch_id, 'stopped', coalesce(p_note, 'recover'));
  ELSE
    RETURN b.status;  -- zaten bitmiş
  END IF;
  RETURN 'stopped';
END $$;

-- ─── 12) Owner okuma RPC'leri ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_owner_stones(p_actor uuid, p_query text DEFAULT NULL, p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_q text := public.stone_library_fold(left(coalesce(p_query, ''), 80)); v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off int := greatest(coalesce(p_offset, 0), 0); v_total int; v_items jsonb;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  WITH base AS (
    SELECT s.* FROM public.stone_library_stones s
     WHERE (p_status IS NULL OR (p_status = 'deleted' AND s.deleted_at IS NOT NULL) OR (s.status = p_status AND s.deleted_at IS NULL))
       AND (v_q = '' OR public.stone_library_fold(concat_ws(' ', s.name_tr, s.name_en, s.slug)) LIKE '%' || v_q || '%'
            OR EXISTS (SELECT 1 FROM public.stone_library_names n WHERE n.stone_id = s.id AND n.deleted_at IS NULL AND n.name_key LIKE '%' || v_q || '%'))
  )
  SELECT (SELECT count(*)::int FROM base),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'slug', b.slug, 'name_tr', b.name_tr, 'name_en', b.name_en, 'status', b.status, 'deleted_at', b.deleted_at,
           'row_version', b.row_version,
           'records_pending', (SELECT count(*) FROM public.stone_library_records r WHERE r.stone_id = b.id AND r.deleted_at IS NULL AND r.review_state = 'pending'),
           'records_approved', (SELECT count(*) FROM public.stone_library_records r WHERE r.stone_id = b.id AND r.deleted_at IS NULL AND r.review_state = 'approved' AND r.is_current),
           'lang_suspect', (SELECT count(*) FROM public.stone_library_records r WHERE r.stone_id = b.id AND r.deleted_at IS NULL AND 'lang_suspect' = ANY (r.quality_flags)),
           'health_sensitive', (SELECT count(*) FROM public.stone_library_records r WHERE r.stone_id = b.id AND r.deleted_at IS NULL AND r.health_sensitive),
           'images', (SELECT count(*) FROM public.stone_library_images i WHERE i.stone_id = b.id AND i.deleted_at IS NULL),
           'published', EXISTS (SELECT 1 FROM public.stone_library_published p WHERE p.stone_id = b.id)
         ) ORDER BY public.stone_library_fold(b.name_tr)), '[]'::jsonb)
    INTO v_total, v_items
    FROM (SELECT * FROM base ORDER BY public.stone_library_fold(name_tr) LIMIT v_lim OFFSET v_off) b;
  RETURN jsonb_build_object('total', coalesce(v_total, 0), 'limit', v_lim, 'offset', v_off, 'items', v_items);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_batch(p_actor uuid, p_batch_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN (SELECT jsonb_build_object('batch', to_jsonb(b),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM (SELECT * FROM public.stone_library_import_events WHERE batch_id = b.id ORDER BY id DESC LIMIT 2000) e), '[]'),
    'raw_count', (SELECT count(*) FROM public.stone_library_raw r WHERE r.batch_id = b.id),
    'raw_ok', (SELECT count(*) FROM public.stone_library_raw r WHERE r.batch_id = b.id AND r.http_status BETWEEN 200 AND 299))
    FROM public.stone_library_import_batches b WHERE b.id = p_batch_id);
END $$;

-- Ham dizin: bu kaynağın geri alınmamış paketlerindeki yanıtlar (yük olmadan) → devam planı eksikleri hesaplar.
CREATE OR REPLACE FUNCTION public.stone_library_owner_raw_index(p_actor uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('endpoint', r.endpoint, 'lang', r.lang, 'external_id', r.external_id,
            'http_status', r.http_status, 'payload_sha256', r.payload_sha256, 'fetched_at', r.fetched_at, 'batch_id', r.batch_id) ORDER BY r.fetched_at)
    FROM public.stone_library_raw r JOIN public.stone_library_import_batches b ON b.id = r.batch_id
   WHERE r.source_id = p_source_id AND b.status <> 'rolled_back'), '[]'::jsonb);
END $$;

-- Son başarılı ham yanıt (devamda ücretli çağrı yerine yeniden kullanılır).
CREATE OR REPLACE FUNCTION public.stone_library_owner_raw_get(p_actor uuid, p_source_id uuid, p_endpoint text, p_lang text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN (SELECT jsonb_build_object('raw_id', r.id, 'batch_id', r.batch_id, 'payload', r.payload, 'payload_sha256', r.payload_sha256, 'fetched_at', r.fetched_at)
    FROM public.stone_library_raw r JOIN public.stone_library_import_batches b ON b.id = r.batch_id
   WHERE r.source_id = p_source_id AND r.endpoint = p_endpoint AND coalesce(r.lang, '-') = coalesce(p_lang, '-')
     AND r.http_status BETWEEN 200 AND 299 AND b.status <> 'rolled_back'
   ORDER BY r.fetched_at DESC LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_external_lookup(p_actor uuid, p_source_id uuid, p_external_id text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN (SELECT stone_id FROM public.stone_library_external_ids WHERE source_id = p_source_id AND external_id = p_external_id AND deleted_at IS NULL);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_images(p_actor uuid, p_stone_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.variant, i.created_at) FROM public.stone_library_images i
                    WHERE p_stone_id IS NULL OR i.stone_id = p_stone_id), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_licenses(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN jsonb_build_object(
    'grants', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at) FROM public.stone_library_license_grants g), '[]'),
    'documents', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at) FROM public.stone_library_source_documents d), '[]'));
END $$;

-- Sahipsiz kart: adı eşleşen ve HİÇBİR kaynağa etkin harici kimlikle bağlı olmayan kart (ör. geri alınan paketten kalan
-- boş taslak). Başka kaynağa bağlı kart ASLA otomatik birleştirilmez (owner eşleme kuyruğu).
CREATE OR REPLACE FUNCTION public.stone_library_owner_find_orphan(p_actor uuid, p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_key text := public.stone_library_fold(p_name);
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF v_key = '' THEN RETURN NULL; END IF;
  RETURN (SELECT s.id FROM public.stone_library_stones s
           WHERE s.deleted_at IS NULL AND (public.stone_library_fold(s.name_tr) = v_key OR public.stone_library_fold(s.name_en) = v_key)
             AND NOT EXISTS (SELECT 1 FROM public.stone_library_external_ids e WHERE e.stone_id = s.id AND e.deleted_at IS NULL)
           LIMIT 1);
END $$;

-- ─── 13) Uzman görsel RPC'si (yalnız sunucu ucu kullanır; yanıt istemciye gitmez) ──────────────
CREATE OR REPLACE FUNCTION public.stone_library_expert_image(p_viewer uuid, p_slug text, p_variant text DEFAULT 'optimized') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.stone_library_viewer_allowed(p_viewer) THEN RETURN NULL; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR coalesce(p_variant, '') NOT IN ('optimized','original') THEN RETURN NULL; END IF;
  PERFORM public.stone_library_refresh_stone(p.stone_id) FROM public.stone_library_published p
   WHERE p.slug = p_slug AND p.expires_at IS NOT NULL AND p.expires_at <= now();
  RETURN (SELECT jsonb_build_object('bucket', i.storage_bucket, 'path', i.storage_path, 'mime', i.mime, 'bytes', i.bytes, 'sha256', i.sha256)
    FROM public.stone_library_published p
    JOIN public.stone_library_images i ON i.stone_id = p.stone_id
    JOIN public.stone_library_sources s ON s.id = i.source_id
   WHERE p.slug = p_slug AND p.has_image AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'
     AND s.deleted_at IS NULL AND s.status = 'active' AND s.image_rights = 'rehost_ok'
     AND (s.license_valid_until IS NULL OR s.license_valid_until > now())
     AND EXISTS (SELECT 1 FROM public.stone_library_license_grants g WHERE g.id = i.license_grant_id AND g.source_id = i.source_id
                   AND g.scope = 'crystal_images' AND g.evidence_status = 'verified' AND g.storage_allowed AND g.commercial_display
                   AND (g.valid_until IS NULL OR g.valid_until >= current_date)
                   AND (g.modification_allowed OR i.variant = 'original'))
   ORDER BY (i.variant = p_variant) DESC, (i.variant = 'optimized') DESC LIMIT 1);
END $$;

-- ─── 14) Ayrıcalıklar ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text; fn record;
BEGIN
  FOREACH t IN ARRAY ARRAY['stone_library_license_grants','stone_library_images'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' AND p.proname <> 'stone_library_fold' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', fn.sig);
  END LOOP;
END $$;

-- F1 sözleşmesi (27 RPC) yeniden verilir + F2 owner / uzman RPC'leri (17). İç yardımcılar hiçbir role açık değil.
GRANT EXECUTE ON FUNCTION public.stone_library_source_save(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_document_add(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_stone_save(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_stone_set_status(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_name_add(uuid, uuid, text, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_external_id_link(uuid, uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_record_add(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_record_set_current(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_facet_add(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_review(uuid, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_settings_save(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_delete(uuid, text, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_restore(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_batch_open(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_batch_set_status(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_batch_reserve_call(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_batch_log(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_batch_quota(uuid, uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_raw_put(uuid, uuid, text, text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_batch_rollback(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_grant_access(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_revoke_access(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_viewer_allowed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_expert_search(uuid, text, jsonb, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_expert_stone(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_stone(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_overview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_license_grant_save(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_license_grant_set_status(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_image_register(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_image_review(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_quality_flags(uuid, text, uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_stones(uuid, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_batch(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_raw_index(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_raw_get(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_external_lookup(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_images(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_licenses(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_expert_image(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_find_orphan(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_record_add_flagged(uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_facet_add_flagged(uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_batch_recover(uuid, uuid, text) TO service_role;

COMMIT;
