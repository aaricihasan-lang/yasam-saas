BEGIN;
-- Doğaltaş Kütüphanesi F6-B — owner katmanları (F1/F2/F3/F6-A üzerine ADDITIVE; kaynak tablolarına YAZMAZ).
--   1) Taş kökeni (kaynak / owner) + owner taşında sağlayıcı verisi YASAK
--   2) Doğrulanmış Türkçe çeviri katmanı (kaynak EN metnine SHA ile bağlı; kaynak değişirse otomatik "eskimiş")
--   3) Owner sürümleri (yalnız eklenir; adlar, 5 metin alanı, anahtar kelime, facet, sertlik, doğum ayı, titreşim, eşleştirme)
--   4) Owner ek bilgileri / uyarıları   5) Owner görselleri (lisans belgesi durumu)   6) Toplu silme onay belirteci (3+)
--   7) Tek adım yayın   8) Yayın belgesi katmanları (OWNER_SURUMU → DOGRULANMIS_TR_CEVIRI → KAYNAK_TR)
-- Varsayılanlarla production davranışı DEĞİŞMEZ: hiçbir çeviri yayında değil, owner sürümü yok, uzman erişimi yok.
-- Mevcut refresh / readiness / expert_image gövdeleri DEĞİŞTİRİLMEZ: yeniden adlandırılıp sarmalanır (geri alma: ROLLBACK_20271201000400.sql).

DO $$
BEGIN
  IF to_regclass('public.stone_library_call_reservations') IS NULL OR to_regprocedure('public.stone_library_health_ok(boolean,timestamp with time zone,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'F6-B: önce F1–F3 ve F6-A (20271201000300) uygulanmalı';
  END IF;
  IF to_regprocedure('public.stone_library_refresh_stone_f3(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F6-B: bu migration zaten uygulanmış (stone_library_refresh_stone_f3 var)';
  END IF;
END $$;

-- ─── 1) Taş kökeni + owner sürümü + görsel tercihi ──────────────────────────────────────────────────
ALTER TABLE public.stone_library_stones ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'source';
ALTER TABLE public.stone_library_stones ADD COLUMN IF NOT EXISTS owner_version_current integer;
ALTER TABLE public.stone_library_stones ADD COLUMN IF NOT EXISTS image_choice text NOT NULL DEFAULT 'source';
ALTER TABLE public.stone_library_stones ADD COLUMN IF NOT EXISTS primary_owner_image_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stone_library_stones_origin_chk') THEN
    ALTER TABLE public.stone_library_stones ADD CONSTRAINT stone_library_stones_origin_chk
      CHECK (origin IN ('source','owner') AND image_choice IN ('source','owner')
             AND (owner_version_current IS NULL OR owner_version_current >= 1)
             AND ((image_choice = 'owner') = (primary_owner_image_id IS NOT NULL)));
  END IF;
END $$;

ALTER TABLE public.stone_library_reviews DROP CONSTRAINT IF EXISTS stone_library_reviews_entity_check;
ALTER TABLE public.stone_library_reviews ADD CONSTRAINT stone_library_reviews_entity_check
  CHECK (entity IN ('settings','source','document','stone','name','external_id','record','facet','batch','grant','image','license',
                    'owner_version','translation','owner_note','owner_image','bulk'));

-- Owner taşında sağlayıcı (API) verisi bulunamaz; köken sonradan değiştirilemez.
CREATE OR REPLACE FUNCTION public.stone_library_origin_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_origin text; v_kind text;
BEGIN
  IF TG_TABLE_NAME = 'stone_library_stones' THEN
    IF TG_OP = 'UPDATE' AND NEW.origin IS DISTINCT FROM OLD.origin THEN
      RAISE EXCEPTION 'stone_library_stones: taş kökeni değiştirilemez' USING ERRCODE = 'SL096';
    END IF;
    RETURN NEW;
  END IF;
  SELECT origin INTO v_origin FROM public.stone_library_stones WHERE id = NEW.stone_id;
  IF coalesce(v_origin, 'source') <> 'owner' THEN RETURN NEW; END IF;
  IF NEW.source_id IS NULL THEN RETURN NEW; END IF;
  SELECT kind INTO v_kind FROM public.stone_library_sources WHERE id = NEW.source_id;
  IF v_kind = 'api' THEN
    RAISE EXCEPTION '%: owner tarafından oluşturulan taşa sağlayıcı verisi bağlanamaz', TG_TABLE_NAME USING ERRCODE = 'SL096';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stone_library_external_ids','stone_library_records','stone_library_facets','stone_library_images','stone_library_names'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_origin ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_origin BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_origin_guard()', t, t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_stones_origin ON public.stone_library_stones;
CREATE TRIGGER trg_stone_library_stones_origin BEFORE UPDATE ON public.stone_library_stones
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_origin_guard();

-- ─── 2) Doğrulanmış Türkçe çeviri katmanı ────────────────────────────────────────────────────────────
-- Metin değişmez (yeni içerik = yeni sürüm). source_en_sha256 = içe aktarma anındaki kaynak EN alan metninin SHA-256'sı
-- (veritabanı hesaplar ve doğrular). Kaynak EN metni değişirse kayıt eskimiş sayılır: gösterilmez, yayımlanamaz.
CREATE TABLE IF NOT EXISTS public.stone_library_translations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id              uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  source_id             uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  field_key             text        NOT NULL CHECK (field_key IN ('description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation','keywords')),
  version               integer     NOT NULL CHECK (version >= 1),
  display_kind          text        NOT NULL CHECK (display_kind IN ('verified_translation','source_tr_fallback')),
  verification_status   text        NOT NULL CHECK (verification_status ~ '^[A-Z_]{3,40}$'),
  content_tr            text        CHECK (content_tr IS NULL OR char_length(btrim(content_tr)) BETWEEN 1 AND 150000),
  content_sha256        text,
  source_en_sha256      text        NOT NULL CHECK (source_en_sha256 ~ '^[0-9a-f]{64}$'),
  source_tr_sha256      text        CHECK (source_tr_sha256 IS NULL OR source_tr_sha256 ~ '^[0-9a-f]{64}$'),
  package_file_sha_en   text        CHECK (package_file_sha_en IS NULL OR package_file_sha_en ~ '^[0-9a-f]{64}$'),
  package_file_sha_tr   text        CHECK (package_file_sha_tr IS NULL OR package_file_sha_tr ~ '^[0-9a-f]{64}$'),
  package_ref           text        NOT NULL CHECK (char_length(btrim(package_ref)) BETWEEN 1 AND 200),
  published_at          timestamptz,
  published_by          uuid,
  superseded_at         timestamptz,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stone_library_translations_version_uniq UNIQUE (stone_id, field_key, version),
  CONSTRAINT stone_library_translations_kind_chk CHECK ((display_kind = 'verified_translation') = (content_tr IS NOT NULL)),
  -- Kaynak metin (fallback) alanı hiçbir zaman "doğrulanmış çeviri" olarak yayımlanamaz.
  CONSTRAINT stone_library_translations_fallback_chk CHECK (display_kind = 'verified_translation' OR published_at IS NULL),
  CONSTRAINT stone_library_translations_pub_chk CHECK ((published_at IS NULL) = (published_by IS NULL)),
  CONSTRAINT stone_library_translations_superseded_chk CHECK (superseded_at IS NULL OR published_at IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_translations_current_uidx ON public.stone_library_translations (stone_id, field_key) WHERE superseded_at IS NULL;

CREATE OR REPLACE FUNCTION public.stone_library_translation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.content_sha256 := CASE WHEN NEW.content_tr IS NULL THEN NULL ELSE encode(sha256(convert_to(NEW.content_tr, 'UTF8')), 'hex') END;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['published_at','published_by','superseded_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['published_at','published_by','superseded_at']) THEN
    RAISE EXCEPTION 'stone_library_translations: çeviri metni ve kaynak bağı değiştirilemez (yeni sürüm ekleyin)' USING ERRCODE = 'SL097';
  END IF;
  IF OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'stone_library_translations: eski sürüm yeniden güncel yapılamaz' USING ERRCODE = 'SL097';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_translations_guard ON public.stone_library_translations;
CREATE TRIGGER trg_stone_library_translations_guard BEFORE INSERT OR UPDATE ON public.stone_library_translations
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_translation_guard();

-- ─── 3) Owner sürümleri (yalnız eklenir) ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_owner_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id       uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  version        integer     NOT NULL CHECK (version >= 1),
  data           jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  health_fields  text[]      NOT NULL DEFAULT '{}' CHECK (health_fields <@ ARRAY['description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation','keywords']::text[]),
  note           text        CHECK (note IS NULL OR char_length(note) <= 1000),
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stone_library_owner_versions_uniq UNIQUE (stone_id, version),
  -- Fiziksel etki alanı owner metninde de daima sağlık hassastır.
  CONSTRAINT stone_library_owner_versions_physical_chk CHECK (NOT (data -> 'fields' ? 'meaning_physical') OR 'meaning_physical' = ANY (health_fields))
);

-- ─── 4) Owner ek bilgileri / uyarıları ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_owner_notes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id            uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  kind                text        NOT NULL CHECK (kind IN ('note','warning')),
  title               text        CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 120),
  body                text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  visible_to_experts  boolean     NOT NULL DEFAULT true,
  health_sensitive    boolean     NOT NULL DEFAULT false,
  sort_order          integer     NOT NULL DEFAULT 0,
  row_version         integer     NOT NULL DEFAULT 1,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  deleted_by          uuid
);
CREATE INDEX IF NOT EXISTS stone_library_owner_notes_stone_idx ON public.stone_library_owner_notes (stone_id);

-- ─── 5) Owner görselleri (özel kova, yol taşa bağlı; belge durumu açık) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_owner_images (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id        uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  storage_bucket  text        NOT NULL CHECK (storage_bucket = 'stone-library-images'),
  storage_path    text        NOT NULL CHECK (storage_path ~ '^owner/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'),
  mime            text        NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  bytes           integer     NOT NULL CHECK (bytes BETWEEN 1 AND 2097152),
  width           integer     NOT NULL CHECK (width BETWEEN 1 AND 4000),
  height          integer     NOT NULL CHECK (height BETWEEN 1 AND 4000),
  sha256          text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  license_status  text        NOT NULL CHECK (license_status IN ('documented','undocumented')),
  license_note    text        CHECK (license_note IS NULL OR char_length(btrim(license_note)) BETWEEN 1 AND 2000),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid,
  CONSTRAINT stone_library_owner_images_doc_chk CHECK (license_status <> 'documented' OR license_note IS NOT NULL),
  CONSTRAINT stone_library_owner_images_path_chk CHECK (split_part(storage_path, '/', 2) = stone_id::text
                                                      AND split_part(split_part(storage_path, '/', 3), '.', 1) = sha256)
);
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_owner_images_sha_uidx ON public.stone_library_owner_images (stone_id, sha256) WHERE deleted_at IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stone_library_stones_owner_image_fk') THEN
    ALTER TABLE public.stone_library_stones ADD CONSTRAINT stone_library_stones_owner_image_fk
      FOREIGN KEY (primary_owner_image_id) REFERENCES public.stone_library_owner_images(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.stone_library_owner_image_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['deleted_at','deleted_by','license_status','license_note']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['deleted_at','deleted_by','license_status','license_note']) THEN
    RAISE EXCEPTION 'stone_library_owner_images: dosya / taş bağı değiştirilemez' USING ERRCODE = 'SL097';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_owner_images_guard ON public.stone_library_owner_images;
CREATE TRIGGER trg_stone_library_owner_images_guard BEFORE UPDATE ON public.stone_library_owner_images
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_owner_image_guard();

-- ─── 6) Toplu silme onay belirteci (3 ve üzeri taş) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_bulk_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor        uuid        NOT NULL,
  stone_ids    uuid[]      NOT NULL CHECK (cardinality(stone_ids) BETWEEN 3 AND 500),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  op_ids       uuid[]
);

-- Koruma tetikleyicileri: sürüm/çeviri/silme kaydı fiziksel olarak silinemez; sürümler değişmez; geçmiş tutulur.
DO $$
DECLARE t text;
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS trg_stone_library_owner_versions_append_only ON public.stone_library_owner_versions';
  EXECUTE 'CREATE TRIGGER trg_stone_library_owner_versions_append_only BEFORE UPDATE OR DELETE ON public.stone_library_owner_versions FOR EACH ROW EXECUTE FUNCTION public.stone_library_append_only()';
  FOREACH t IN ARRAY ARRAY['stone_library_owner_versions','stone_library_translations','stone_library_owner_notes','stone_library_owner_images','stone_library_bulk_tokens'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_truncate ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.stone_library_no_hard_delete()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['stone_library_translations','stone_library_owner_notes','stone_library_owner_images','stone_library_bulk_tokens'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_delete ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_no_hard_delete()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_history ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_history AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_capture_history()', t, t);
  END LOOP;
END $$;

-- ─── 7) Yardımcılar ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_sha_text(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;

-- Anahtar kelime listesinin kanonik biçimi: "|" ile ayrılmış, kırpılmış, tekrarsız, ikili sıralı.
CREATE OR REPLACE FUNCTION public.stone_library_kw_canon(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((SELECT string_agg(y, ' | ' ORDER BY y COLLATE "C")
                     FROM (SELECT DISTINCT btrim(x) AS y FROM unnest(string_to_array(coalesce(p, ''), '|')) x WHERE btrim(x) <> '') q), '')
$$;

-- Kaynağın güncel alan metni (sağlayıcı kaynak kaydı; anahtar kelimede kanonik liste). Yoksa ''.
CREATE OR REPLACE FUNCTION public.stone_library_source_field_text(p_stone uuid, p_source uuid, p_field text, p_lang text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN p_field = 'keywords' THEN
    coalesce((SELECT string_agg(y, ' | ' ORDER BY y COLLATE "C") FROM (
                SELECT DISTINCT btrim(f.value_text) AS y FROM public.stone_library_facets f
                 WHERE f.stone_id = p_stone AND f.source_id = p_source AND f.facet = 'keyword' AND f.lang = p_lang
                   AND f.deleted_at IS NULL AND f.value_text IS NOT NULL) q), '')
  ELSE
    coalesce((SELECT r.content FROM public.stone_library_records r
               WHERE r.stone_id = p_stone AND r.source_id = p_source AND r.field_key = p_field AND r.lang = p_lang
                 AND r.origin = 'source' AND r.is_current AND r.deleted_at IS NULL LIMIT 1), '')
  END
$$;

-- Çeviri eskimiş mi? (kaynak EN metni içe aktarma anındakiyle aynı değil)
CREATE OR REPLACE FUNCTION public.stone_library_translation_stale(t public.stone_library_translations) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public.stone_library_sha_text(public.stone_library_source_field_text(t.stone_id, t.source_id, t.field_key, 'en')) <> t.source_en_sha256
$$;

-- Kaynak alanın sağlık durumu (herhangi bir dilde güncel kaynak kaydı / anahtar kelime sağlık hassas mı) + hukuk onayı zamanı.
CREATE OR REPLACE FUNCTION public.stone_library_field_health(p_stone uuid, p_field text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_h boolean; v_c timestamptz;
BEGIN
  IF p_field = 'keywords' THEN
    SELECT coalesce(bool_or(f.health_sensitive), false),
           CASE WHEN coalesce(bool_and(NOT f.health_sensitive OR f.legal_cleared_at IS NOT NULL), true) THEN max(f.legal_cleared_at) END
      INTO v_h, v_c FROM public.stone_library_facets f
     WHERE f.stone_id = p_stone AND f.facet = 'keyword' AND f.deleted_at IS NULL;
  ELSE
    SELECT p_field = 'meaning_physical' OR coalesce(bool_or(r.health_sensitive), false),
           CASE WHEN coalesce(bool_and(NOT r.health_sensitive OR r.legal_cleared_at IS NOT NULL), true) THEN max(r.legal_cleared_at) END
      INTO v_h, v_c FROM public.stone_library_records r
     WHERE r.stone_id = p_stone AND r.field_key = p_field AND r.is_current AND r.deleted_at IS NULL;
  END IF;
  RETURN jsonb_build_object('health', coalesce(v_h, p_field = 'meaning_physical'), 'cleared', v_c);
END $$;

-- Owner sürüm verisi doğrulaması (izinli anahtarlar, uzunluklar, sözlük değerleri, eşleştirme slug'ları).
CREATE OR REPLACE FUNCTION public.stone_library_owner_data_check(p jsonb, p_slug text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE k text; v jsonb; x jsonb; n int;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'owner verisi nesne olmalı' USING ERRCODE = 'SL098'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('name_tr','name_en','fields','keywords','facets','hardness','birth_month','numerical_vibration','pairings') THEN
      RAISE EXCEPTION 'owner verisi: izinsiz alan %', k USING ERRCODE = 'SL098';
    END IF;
    IF k IN ('name_tr','name_en') AND (jsonb_typeof(v) <> 'string' OR char_length(btrim(v #>> '{}')) NOT BETWEEN 1 AND 120) THEN
      RAISE EXCEPTION 'owner verisi: % 1–120 karakter olmalı', k USING ERRCODE = 'SL098';
    END IF;
    IF k = 'fields' THEN
      IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'owner verisi: fields nesne olmalı' USING ERRCODE = 'SL098'; END IF;
      FOR x IN SELECT jsonb_build_array(key, value) FROM jsonb_each(v) LOOP
        IF (x ->> 0) NOT IN ('description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation')
           OR jsonb_typeof(x -> 1) <> 'string' OR char_length(btrim(x ->> 1)) NOT BETWEEN 1 AND 20000 THEN
          RAISE EXCEPTION 'owner verisi: geçersiz metin alanı %', x ->> 0 USING ERRCODE = 'SL098';
        END IF;
      END LOOP;
    END IF;
    IF k = 'keywords' THEN
      IF jsonb_typeof(v) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v) z WHERE z NOT IN ('tr','en')) THEN
        RAISE EXCEPTION 'owner verisi: keywords {tr,en} olmalı' USING ERRCODE = 'SL098';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each(v) e WHERE jsonb_typeof(e.value) <> 'array' OR jsonb_array_length(e.value) > 40
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) w WHERE jsonb_typeof(w) <> 'string' OR char_length(btrim(w #>> '{}')) NOT BETWEEN 1 AND 80 OR (w #>> '{}') LIKE '%|%')) THEN
        RAISE EXCEPTION 'owner verisi: anahtar kelime listesi geçersiz (en çok 40, 1–80 karakter, "|" yok)' USING ERRCODE = 'SL098';
      END IF;
    END IF;
    IF k = 'facets' THEN
      IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'owner verisi: facets nesne olmalı' USING ERRCODE = 'SL098'; END IF;
      FOR x IN SELECT jsonb_build_array(key, value) FROM jsonb_each(v) LOOP
        IF (x ->> 0) NOT IN ('chakra','zodiac','element','color','planet') OR jsonb_typeof(x -> 1) <> 'array' OR jsonb_array_length(x -> 1) > 20 THEN
          RAISE EXCEPTION 'owner verisi: geçersiz facet %', x ->> 0 USING ERRCODE = 'SL098';
        END IF;
        SELECT count(*) INTO n FROM jsonb_array_elements_text(x -> 1) e
         WHERE NOT EXISTS (SELECT 1 FROM public.stone_library_vocab vv WHERE vv.facet = x ->> 0 AND vv.value_key = e);
        IF n > 0 THEN RAISE EXCEPTION 'owner verisi: % için sözlükte olmayan değer', x ->> 0 USING ERRCODE = 'SL098'; END IF;
      END LOOP;
    END IF;
    IF k = 'hardness' AND NOT (jsonb_typeof(v) = 'object' AND jsonb_typeof(v -> 'min') = 'number' AND jsonb_typeof(v -> 'max') = 'number'
         AND (v ->> 'min')::numeric BETWEEN 0 AND 10 AND (v ->> 'max')::numeric BETWEEN 0 AND 10 AND (v ->> 'min')::numeric <= (v ->> 'max')::numeric) THEN
      RAISE EXCEPTION 'owner verisi: sertlik {min,max} 0–10 olmalı' USING ERRCODE = 'SL098';
    END IF;
    IF k = 'birth_month' AND (jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) > 12 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v) e
         WHERE jsonb_typeof(e) <> 'number' OR (e #>> '{}')::numeric NOT BETWEEN 1 AND 12 OR (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric))) THEN
      RAISE EXCEPTION 'owner verisi: doğum ayı 1–12 tam sayı listesi olmalı' USING ERRCODE = 'SL098';
    END IF;
    IF k = 'numerical_vibration' AND (jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) > 10 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v) e
         WHERE jsonb_typeof(e) <> 'number' OR (e #>> '{}')::numeric NOT BETWEEN 0 AND 9999)) THEN
      RAISE EXCEPTION 'owner verisi: sayısal titreşim 0–9999 sayı listesi olmalı' USING ERRCODE = 'SL098';
    END IF;
    IF k = 'pairings' AND (jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) > 30 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v) e
         WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR (e #>> '{}') = coalesce(p_slug, ''))) THEN
      RAISE EXCEPTION 'owner verisi: eşleştirmeler geçerli taş adresleri olmalı (kendisi hariç, en çok 30)' USING ERRCODE = 'SL098';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_health_fields_arr(p jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN '{}'; END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v FROM jsonb_array_elements_text(p) x;
  IF NOT v <@ ARRAY['description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation','keywords']::text[] THEN
    RAISE EXCEPTION 'sağlık alanı listesi geçersiz' USING ERRCODE = 'SL098';
  END IF;
  RETURN v;
END $$;

-- ─── 8) Hazırlık kontrolü (F3 gövdesi sarmalanır) ───────────────────────────────────────────────────
ALTER FUNCTION public.stone_library_readiness(uuid) RENAME TO stone_library_readiness_f3;
CREATE OR REPLACE FUNCTION public.stone_library_readiness(p_stone uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE st public.stone_library_stones%ROWTYPE; r jsonb; b jsonb; w jsonb; ov public.stone_library_owner_versions%ROWTYPE;
  v_owner_vis boolean := false; v_tr_vis boolean := false; f text; h jsonb;
BEGIN
  SELECT * INTO st FROM public.stone_library_stones WHERE id = p_stone;
  IF NOT FOUND OR st.deleted_at IS NOT NULL THEN RETURN public.stone_library_readiness_f3(p_stone); END IF;
  IF st.owner_version_current IS NOT NULL THEN
    SELECT * INTO ov FROM public.stone_library_owner_versions WHERE stone_id = p_stone AND version = st.owner_version_current;
    FOR f IN SELECT jsonb_object_keys(coalesce(ov.data -> 'fields', '{}'::jsonb)) LOOP
      h := coalesce(public.stone_library_field_health(p_stone, f), '{"health":false}'::jsonb);
      IF public.stone_library_health_ok(f = ANY (ov.health_fields) OR (h ->> 'health')::boolean, NULL, st.health_publish_decided_at) THEN v_owner_vis := true; END IF;
    END LOOP;
  END IF;
  IF st.origin = 'owner' THEN
    w := '[]'::jsonb;
    IF st.image_choice <> 'owner' THEN w := w || '["no_image"]'::jsonb; END IF;
    IF EXISTS (SELECT 1 FROM public.stone_library_owner_images i WHERE i.id = st.primary_owner_image_id AND i.license_status = 'undocumented') THEN
      w := w || '["owner_image_undocumented"]'::jsonb;
    END IF;
    IF ov.id IS NOT NULL AND cardinality(ov.health_fields) > 0 AND NOT public.stone_library_health_ok(true, NULL, st.health_publish_decided_at) THEN
      w := w || '["health_content_not_published"]'::jsonb;
    END IF;
    RETURN jsonb_build_object('ready', true, 'blockers', '[]'::jsonb, 'warnings', w,
      'counts', jsonb_build_object('origin', 'owner', 'owner_version_current', st.owner_version_current, 'owner_visible', v_owner_vis,
                                   'health_decided', st.health_publish_decided_at IS NOT NULL));
  END IF;
  r := public.stone_library_readiness_f3(p_stone);
  b := r -> 'blockers'; w := r -> 'warnings';
  -- Bekleyen görsel yayını engellemez (onaylanmamış görsel zaten gösterilmez); uyarıya taşınır.
  IF b ? 'images_pending' THEN b := b - 'images_pending'; w := w || '["images_pending"]'::jsonb; END IF;
  IF b ? 'no_visible_content' THEN
    SELECT EXISTS (SELECT 1 FROM public.stone_library_translations t
                    WHERE t.stone_id = p_stone AND t.superseded_at IS NULL AND t.published_at IS NOT NULL AND NOT public.stone_library_translation_stale(t)
                      AND public.stone_library_health_ok((coalesce(public.stone_library_field_health(p_stone, t.field_key), '{"health":false}') ->> 'health')::boolean,
                            (public.stone_library_field_health(p_stone, t.field_key) ->> 'cleared')::timestamptz, st.health_publish_decided_at)) INTO v_tr_vis;
    IF v_owner_vis OR v_tr_vis THEN b := b - 'no_visible_content'; END IF;
  END IF;
  IF st.image_choice = 'owner' AND EXISTS (SELECT 1 FROM public.stone_library_owner_images i WHERE i.id = st.primary_owner_image_id AND i.license_status = 'undocumented') THEN
    w := w || '["owner_image_undocumented"]'::jsonb;
  END IF;
  RETURN jsonb_build_object('ready', jsonb_array_length(b) = 0, 'blockers', b, 'warnings', w,
    'counts', (r -> 'counts') || jsonb_build_object('origin', 'source', 'owner_version_current', st.owner_version_current, 'owner_visible', v_owner_vis));
END $$;

-- ─── 9) Yayın belgesi katmanları (F3 gövdesi sarmalanır) ────────────────────────────────────────────
ALTER FUNCTION public.stone_library_refresh_stone(uuid) RENAME TO stone_library_refresh_stone_f3;
CREATE OR REPLACE FUNCTION public.stone_library_refresh_stone(p_stone uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  st public.stone_library_stones%ROWTYPE; p public.stone_library_published%ROWTYPE; ov public.stone_library_owner_versions%ROWTYPE;
  t public.stone_library_translations%ROWTYPE; img public.stone_library_owner_images%ROWTYPE;
  f text; h jsonb; v_h boolean; v_done boolean; v_src jsonb; v_display jsonb := '[]'::jsonb; v_verified jsonb := '{}'::jsonb;
  v_doc jsonb; v_facets jsonb; v_extra_text text := ''; v_name_tr text; v_name_en text; v_health_any boolean := false;
  v_arr text[]; fk text; v_pairs jsonb; v_notes jsonb; v_kw jsonb;
BEGIN
  PERFORM public.stone_library_refresh_stone_f3(p_stone);
  SELECT * INTO p FROM public.stone_library_published WHERE stone_id = p_stone;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO st FROM public.stone_library_stones WHERE id = p_stone;
  IF st.owner_version_current IS NOT NULL THEN
    SELECT * INTO ov FROM public.stone_library_owner_versions WHERE stone_id = p_stone AND version = st.owner_version_current;
  END IF;
  v_doc := p.doc; v_facets := coalesce(p.doc -> 'facets', '{}'::jsonb);
  v_name_tr := coalesce(btrim(ov.data ->> 'name_tr'), p.name_tr);
  v_name_en := coalesce(btrim(ov.data ->> 'name_en'), p.name_en);

  -- Alan başına gösterim: OWNER_SURUMU → DOGRULANMIS_TR_CEVIRI (yayında, eskimemiş) → KAYNAK_TR. Sağlık kilidi her katmanda.
  FOREACH f IN ARRAY ARRAY['description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation','keywords'] LOOP
    h := coalesce(public.stone_library_field_health(p_stone, f), jsonb_build_object('health', f = 'meaning_physical', 'cleared', NULL));
    v_done := false;
    SELECT * INTO t FROM public.stone_library_translations x
     WHERE x.stone_id = p_stone AND x.field_key = f AND x.superseded_at IS NULL AND x.display_kind = 'verified_translation'
       AND x.published_at IS NOT NULL AND NOT public.stone_library_translation_stale(x);
    v_verified := v_verified || jsonb_build_object(f, FOUND AND public.stone_library_health_ok((h ->> 'health')::boolean, (h ->> 'cleared')::timestamptz, st.health_publish_decided_at));
    -- 1) Owner sürümü
    IF ov.id IS NOT NULL AND ((f <> 'keywords' AND ov.data -> 'fields' ? f) OR (f = 'keywords' AND ov.data -> 'keywords' ? 'tr')) THEN
      v_h := f = 'meaning_physical' OR f = ANY (ov.health_fields) OR (h ->> 'health')::boolean;
      IF public.stone_library_health_ok(v_h, NULL, st.health_publish_decided_at) THEN
        v_display := v_display || jsonb_build_array(jsonb_build_object('field', f, 'display_source', 'OWNER_SURUMU', 'health_related', v_h,
          'content', CASE WHEN f = 'keywords' THEN (SELECT string_agg(x, ' | ') FROM jsonb_array_elements_text(ov.data -> 'keywords' -> 'tr') x)
                          ELSE ov.data -> 'fields' ->> f END));
        v_health_any := v_health_any OR v_h; v_done := true;
        v_extra_text := v_extra_text || ' ' || coalesce(CASE WHEN f = 'keywords' THEN (SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(ov.data -> 'keywords' -> 'tr') x) ELSE ov.data -> 'fields' ->> f END, '');
      END IF;
    END IF;
    -- 2) Yayındaki doğrulanmış çeviri
    IF NOT v_done AND (v_verified ->> f)::boolean THEN
      v_display := v_display || jsonb_build_array(jsonb_build_object('field', f, 'display_source', 'DOGRULANMIS_TR_CEVIRI',
        'health_related', (h ->> 'health')::boolean, 'content', t.content_tr));
      v_health_any := v_health_any OR (h ->> 'health')::boolean; v_done := true;
      v_extra_text := v_extra_text || ' ' || t.content_tr;
    END IF;
    -- 3) Kaynak Türkçe metin (F3 belgesinde görünür olan; yoksa alan gösterilmez)
    IF NOT v_done THEN
      IF f = 'keywords' THEN
        SELECT string_agg(k ->> 'text', ' | ') INTO fk FROM jsonb_array_elements(coalesce(v_facets -> 'keyword', '[]'::jsonb)) k WHERE k ->> 'lang' = 'tr';
        IF fk IS NOT NULL THEN
          v_display := v_display || jsonb_build_array(jsonb_build_object('field', f, 'display_source', 'KAYNAK_TR', 'health_related', false, 'content', fk));
        END IF;
      ELSE
        SELECT x INTO v_src FROM jsonb_array_elements(coalesce(v_doc -> 'sections', '[]'::jsonb)) s, jsonb_array_elements(s -> 'fields') x
         WHERE x ->> 'field' = f AND x ->> 'lang' = 'tr' LIMIT 1;
        IF v_src IS NOT NULL THEN
          v_display := v_display || jsonb_build_array(jsonb_build_object('field', f, 'display_source', 'KAYNAK_TR',
            'health_related', coalesce((v_src ->> 'health_related')::boolean, false), 'content', v_src ->> 'content'));
        END IF;
        v_src := NULL;
      END IF;
    END IF;
  END LOOP;

  -- Owner facet / sertlik / doğum ayı / titreşim / eşleştirme / anahtar kelime (verilen anahtar kaynağın yerine geçer)
  IF ov.id IS NOT NULL THEN
    FOR fk IN SELECT jsonb_object_keys(coalesce(ov.data -> 'facets', '{}'::jsonb)) LOOP
      v_facets := v_facets || jsonb_build_object(fk, coalesce((SELECT jsonb_agg(jsonb_build_object('key', vv.value_key, 'label_tr', vv.label_tr, 'label_en', vv.label_en) ORDER BY vv.sort_order)
        FROM public.stone_library_vocab vv WHERE vv.facet = fk AND vv.value_key IN (SELECT jsonb_array_elements_text(ov.data -> 'facets' -> fk))), '[]'::jsonb));
    END LOOP;
    IF ov.data ? 'keywords' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('lang', l.key, 'text', w.value) ORDER BY l.key, w.ord), '[]'::jsonb) INTO v_kw
        FROM jsonb_each(ov.data -> 'keywords') l, jsonb_array_elements_text(l.value) WITH ORDINALITY w(value, ord);
      IF NOT ('keywords' = ANY (ov.health_fields)) OR public.stone_library_health_ok(true, NULL, st.health_publish_decided_at) THEN
        v_facets := v_facets || jsonb_build_object('keyword', v_kw);
      END IF;
    END IF;
    IF ov.data ? 'birth_month' THEN v_facets := v_facets || jsonb_build_object('birth_month', ov.data -> 'birth_month'); END IF;
    IF ov.data ? 'numerical_vibration' THEN v_facets := v_facets || jsonb_build_object('numerical_vibration', ov.data -> 'numerical_vibration'); END IF;
    IF ov.data ? 'hardness' THEN v_doc := v_doc || jsonb_build_object('hardness', ov.data -> 'hardness'); END IF;
    IF ov.data ? 'pairings' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('slug', s2.slug, 'name_tr', coalesce(btrim(o2.data ->> 'name_tr'), s2.name_tr),
                                                   'name_en', coalesce(btrim(o2.data ->> 'name_en'), s2.name_en)) ORDER BY s2.slug), '[]'::jsonb) INTO v_pairs
        FROM public.stone_library_stones s2
        LEFT JOIN public.stone_library_owner_versions o2 ON o2.stone_id = s2.id AND o2.version = s2.owner_version_current
       WHERE s2.slug IN (SELECT jsonb_array_elements_text(ov.data -> 'pairings')) AND s2.deleted_at IS NULL AND s2.status = 'published' AND s2.id <> p_stone;
      v_doc := v_doc || jsonb_build_object('pairings', v_pairs);
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body) ORDER BY n.kind DESC, n.sort_order, n.created_at), '[]'::jsonb)
    INTO v_notes FROM public.stone_library_owner_notes n
   WHERE n.stone_id = p_stone AND n.deleted_at IS NULL AND n.visible_to_experts
     AND (n.kind = 'warning' OR public.stone_library_health_ok(n.health_sensitive, NULL, st.health_publish_decided_at));

  IF st.image_choice = 'owner' THEN
    SELECT * INTO img FROM public.stone_library_owner_images WHERE id = st.primary_owner_image_id AND deleted_at IS NULL;
  END IF;

  v_doc := v_doc || jsonb_build_object(
    'name_tr', v_name_tr, 'name_en', v_name_en, 'facets', v_facets,
    'display', jsonb_build_object('fields', v_display, 'verified_available', v_verified),
    'owner_info', v_notes,
    'has_health_content', coalesce((v_doc ->> 'has_health_content')::boolean, false) OR v_health_any);
  IF img.id IS NOT NULL THEN
    v_doc := v_doc || jsonb_build_object('image', jsonb_build_object('available', true, 'width', img.width, 'height', img.height, 'attribution', NULL));
  END IF;

  PERFORM set_config('stone_library.refresh', 'on', true);
  UPDATE public.stone_library_published SET
    name_tr = v_name_tr, name_en = v_name_en, sort_key = public.stone_library_fold(v_name_tr),
    names_fold = public.stone_library_fold(concat_ws(' ', p.names_fold, v_name_tr, v_name_en)),
    names_compact = replace(public.stone_library_fold(concat_ws(' ', p.names_fold, v_name_tr, v_name_en)), ' ', ''),
    doc = v_doc,
    search_tsv = p.search_tsv
      || setweight(to_tsvector('simple', public.stone_library_fold(concat_ws(' ', v_name_tr, v_name_en))), 'A')
      || setweight(to_tsvector('simple', public.stone_library_fold(v_extra_text)), 'D'),
    chakra  = CASE WHEN ov.data -> 'facets' ? 'chakra'  THEN ARRAY(SELECT jsonb_array_elements_text(ov.data -> 'facets' -> 'chakra'))  ELSE chakra END,
    zodiac  = CASE WHEN ov.data -> 'facets' ? 'zodiac'  THEN ARRAY(SELECT jsonb_array_elements_text(ov.data -> 'facets' -> 'zodiac'))  ELSE zodiac END,
    element = CASE WHEN ov.data -> 'facets' ? 'element' THEN ARRAY(SELECT jsonb_array_elements_text(ov.data -> 'facets' -> 'element')) ELSE element END,
    color   = CASE WHEN ov.data -> 'facets' ? 'color'   THEN ARRAY(SELECT jsonb_array_elements_text(ov.data -> 'facets' -> 'color'))   ELSE color END,
    planet  = CASE WHEN ov.data -> 'facets' ? 'planet'  THEN ARRAY(SELECT jsonb_array_elements_text(ov.data -> 'facets' -> 'planet'))  ELSE planet END,
    pairing = CASE WHEN ov.data ? 'pairings' THEN ARRAY(SELECT x ->> 'slug' FROM jsonb_array_elements(v_pairs) x) ELSE pairing END,
    birth_month = CASE WHEN ov.data ? 'birth_month' THEN ARRAY(SELECT (x #>> '{}')::int FROM jsonb_array_elements(ov.data -> 'birth_month') x) ELSE birth_month END,
    hardness_min = CASE WHEN ov.data ? 'hardness' THEN (ov.data -> 'hardness' ->> 'min')::numeric ELSE hardness_min END,
    hardness_max = CASE WHEN ov.data ? 'hardness' THEN (ov.data -> 'hardness' ->> 'max')::numeric ELSE hardness_max END,
    has_image = has_image OR img.id IS NOT NULL
  WHERE stone_id = p_stone;
  PERFORM set_config('stone_library.refresh', 'off', true);
END $$;

-- ─── 10) Uzman görseli (owner birincil görseli öncelikli; F3 gövdesi sarmalanır) ────────────────────────
ALTER FUNCTION public.stone_library_expert_image(uuid, text, text) RENAME TO stone_library_expert_image_f3;
CREATE OR REPLACE FUNCTION public.stone_library_expert_image(p_viewer uuid, p_slug text, p_variant text DEFAULT 'optimized') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.stone_library_viewer_allowed(p_viewer) THEN RETURN NULL; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR coalesce(p_variant, '') NOT IN ('optimized','original') THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('bucket', i.storage_bucket, 'path', i.storage_path, 'mime', i.mime, 'bytes', i.bytes, 'sha256', i.sha256) INTO v
    FROM public.stone_library_published p
    JOIN public.stone_library_stones s ON s.id = p.stone_id AND s.image_choice = 'owner' AND s.status = 'published' AND s.deleted_at IS NULL
    JOIN public.stone_library_owner_images i ON i.id = s.primary_owner_image_id AND i.deleted_at IS NULL
   WHERE p.slug = p_slug;
  IF v IS NOT NULL THEN RETURN v; END IF;
  RETURN public.stone_library_expert_image_f3(p_viewer, p_slug, p_variant);
END $$;

-- ─── 11) Owner RPC'leri ──────────────────────────────────────────────────────────────────────────────
-- İç: tek adım yayın (bekleyen güncel kayıt + facet onayı → hazırlık kontrolü → yayın). Görsel onayı DAHİL DEĞİL.
CREATE OR REPLACE FUNCTION public.stone_library_publish_internal(p_actor uuid, p_stone uuid, p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE st public.stone_library_stones%ROWTYPE; v_ready jsonb; v_rec int := 0; v_fac int := 0; r record;
BEGIN
  SELECT * INTO st FROM public.stone_library_stones WHERE id = p_stone AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_publish: taş yok' USING ERRCODE = 'SL024'; END IF;
  FOR r IN UPDATE public.stone_library_records SET review_state = 'approved', reviewed_at = now(), reviewed_by = p_actor
            WHERE stone_id = p_stone AND is_current AND deleted_at IS NULL AND review_state = 'pending' RETURNING id LOOP
    PERFORM public.stone_library_review_log('record', r.id, 'approve', coalesce(p_note, 'single_step_publish')); v_rec := v_rec + 1;
  END LOOP;
  FOR r IN UPDATE public.stone_library_facets SET review_state = 'approved', reviewed_at = now(), reviewed_by = p_actor
            WHERE stone_id = p_stone AND deleted_at IS NULL AND review_state = 'pending' RETURNING id LOOP
    PERFORM public.stone_library_review_log('facet', r.id, 'approve', coalesce(p_note, 'single_step_publish')); v_fac := v_fac + 1;
  END LOOP;
  v_ready := public.stone_library_readiness(p_stone);
  IF jsonb_array_length(v_ready -> 'blockers') > 0 THEN
    RAISE EXCEPTION 'stone_library_publish: yayına hazır değil: %', (v_ready ->> 'blockers') USING ERRCODE = 'SL090';
  END IF;
  IF st.status <> 'published' THEN
    UPDATE public.stone_library_stones SET status = 'published', published_at = now(), published_by = p_actor,
      row_version = row_version + 1, updated_at = now() WHERE id = p_stone;
    PERFORM public.stone_library_review_log('stone', p_stone, 'publish', coalesce(p_note, 'single_step_publish'));
  END IF;
  RETURN jsonb_build_object('published', true, 'records_approved', v_rec, 'facets_approved', v_fac, 'warnings', v_ready -> 'warnings');
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_publish(p_actor uuid, p_stone_id uuid, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  v := public.stone_library_publish_internal(p_actor, p_stone_id, p_note);
  PERFORM public.stone_library_refresh_with_dependents(p_stone_id);
  RETURN v;
END $$;

-- Owner sürümü kaydet: "Taslak Kaydet" (p_publish=false) / "Kaydet ve Yayınla" (p_publish=true). Kaynak tablolarına yazmaz.
CREATE OR REPLACE FUNCTION public.stone_library_owner_version_save(p_actor uuid, p_stone_id uuid, p_data jsonb, p_health_fields jsonb,
  p_publish boolean DEFAULT false, p_expected_version integer DEFAULT NULL, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE st public.stone_library_stones%ROWTYPE; v_max int; v_ver int; v_id uuid; v_hf text[]; v_pub jsonb;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO st FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_owner_version_save: taş yok' USING ERRCODE = 'SL024'; END IF;
  PERFORM public.stone_library_owner_data_check(p_data, st.slug);
  v_hf := public.stone_library_health_fields_arr(p_health_fields);
  IF p_data -> 'fields' ? 'meaning_physical' AND NOT ('meaning_physical' = ANY (v_hf)) THEN v_hf := array_append(v_hf, 'meaning_physical'); END IF;
  SELECT coalesce(max(version), 0) INTO v_max FROM public.stone_library_owner_versions WHERE stone_id = p_stone_id;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_max THEN
    RAISE EXCEPTION 'stone_library_owner_version_save: başka bir kayıt araya girdi (beklenen %, mevcut %)', p_expected_version, v_max USING ERRCODE = 'SL099';
  END IF;
  v_ver := v_max + 1;
  INSERT INTO public.stone_library_owner_versions (stone_id, version, data, health_fields, note, created_by)
  VALUES (p_stone_id, v_ver, p_data, v_hf, nullif(btrim(coalesce(p_note, '')), ''), p_actor) RETURNING id INTO v_id;
  PERFORM public.stone_library_review_log('owner_version', v_id, CASE WHEN p_publish THEN 'save_publish' ELSE 'save_draft' END, p_note);
  IF p_publish THEN
    PERFORM public.stone_library_defer_begin();
    UPDATE public.stone_library_stones SET owner_version_current = v_ver, row_version = row_version + 1, updated_at = now() WHERE id = p_stone_id;
    v_pub := public.stone_library_publish_internal(p_actor, p_stone_id, p_note);
    PERFORM public.stone_library_defer_flush();
  END IF;
  PERFORM public.stone_library_refresh_with_dependents(p_stone_id);
  RETURN jsonb_build_object('version', v_ver, 'published', coalesce(p_publish, false), 'publish', v_pub);
END $$;

-- Sürüme dön / özgün kaynağa dön (p_version NULL). Owner taşında özgün kaynak yoktur.
CREATE OR REPLACE FUNCTION public.stone_library_owner_version_set_current(p_actor uuid, p_stone_id uuid, p_version integer, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE st public.stone_library_stones%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO st FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_owner_version_set_current: taş yok' USING ERRCODE = 'SL024'; END IF;
  IF p_version IS NULL AND st.origin = 'owner' THEN
    RAISE EXCEPTION 'stone_library_owner_version_set_current: owner taşında özgün kaynak yok; bir sürüm seçin' USING ERRCODE = 'SL099';
  END IF;
  IF p_version IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stone_library_owner_versions WHERE stone_id = p_stone_id AND version = p_version) THEN
    RAISE EXCEPTION 'stone_library_owner_version_set_current: sürüm yok' USING ERRCODE = 'SL099';
  END IF;
  IF st.owner_version_current IS NOT DISTINCT FROM p_version THEN RETURN; END IF;
  UPDATE public.stone_library_stones SET owner_version_current = p_version, row_version = row_version + 1, updated_at = now() WHERE id = p_stone_id;
  PERFORM public.stone_library_review_log('stone', p_stone_id, CASE WHEN p_version IS NULL THEN 'revert_source' ELSE 'set_owner_version' END,
    concat_ws(' · ', 'v' || coalesce(p_version::text, 'kaynak'), nullif(btrim(coalesce(p_note, '')), '')));
END $$;

-- Yeni taş (owner kökenli). Yalnız Türkçe ad zorunlu; adres addan üretilir; lisans / SHA / doğrulanmış çeviri ATANMAZ.
CREATE OR REPLACE FUNCTION public.stone_library_owner_stone_create(p_actor uuid, p_data jsonb, p_health_fields jsonb DEFAULT '[]'::jsonb,
  p_publish boolean DEFAULT false, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_name text := btrim(coalesce(p_data ->> 'name_tr', '')); v_base text; v_slug text; i int := 1; v_id uuid; v_hf text[]; v_pub jsonb;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF char_length(v_name) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Türkçe taş adı zorunlu (1–120 karakter)' USING ERRCODE = 'SL098'; END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones WHERE public.stone_library_fold(name_tr) = public.stone_library_fold(v_name) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.stone_library_names WHERE name_key = public.stone_library_fold(v_name) AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Bu adla bir taş zaten var' USING ERRCODE = 'SL100';
  END IF;
  v_base := left(trim(both '-' from regexp_replace(public.stone_library_fold(v_name), '[^a-z0-9]+', '-', 'g')), 70);
  IF v_base = '' THEN v_base := 'tas'; END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.stone_library_stones WHERE slug = v_slug AND deleted_at IS NULL) LOOP
    i := i + 1; v_slug := v_base || '-' || i;
  END LOOP;
  PERFORM public.stone_library_owner_data_check(p_data, v_slug);
  v_hf := public.stone_library_health_fields_arr(p_health_fields);
  IF p_data -> 'fields' ? 'meaning_physical' AND NOT ('meaning_physical' = ANY (v_hf)) THEN v_hf := array_append(v_hf, 'meaning_physical'); END IF;
  INSERT INTO public.stone_library_stones (slug, name_tr, name_en, status, origin, created_by)
  VALUES (v_slug, v_name, nullif(btrim(coalesce(p_data ->> 'name_en', '')), ''), 'draft', 'owner', p_actor) RETURNING id INTO v_id;
  INSERT INTO public.stone_library_owner_versions (stone_id, version, data, health_fields, note, created_by)
  VALUES (v_id, 1, p_data, v_hf, nullif(btrim(coalesce(p_note, '')), ''), p_actor);
  PERFORM public.stone_library_review_log('stone', v_id, 'owner_create', p_note);
  IF p_publish THEN
    UPDATE public.stone_library_stones SET owner_version_current = 1, row_version = row_version + 1, updated_at = now() WHERE id = v_id;
    v_pub := public.stone_library_publish_internal(p_actor, v_id, p_note);
  END IF;
  PERFORM public.stone_library_refresh_stone(v_id);
  RETURN jsonb_build_object('id', v_id, 'slug', v_slug, 'published', coalesce(p_publish, false));
END $$;

-- Ek bilgi / uyarı kaydet (yeni ya da güncelle). Sağlık işareti sunucudaki sözlükten gelir.
CREATE OR REPLACE FUNCTION public.stone_library_owner_note_save(p_actor uuid, p_note_id uuid, p_stone_id uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid; n public.stone_library_owner_notes%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k
       WHERE k NOT IN ('kind','title','body','visible_to_experts','health_sensitive','sort_order','expected_version')) THEN
    RAISE EXCEPTION 'ek bilgi verisi geçersiz' USING ERRCODE = 'SL098';
  END IF;
  IF p_note_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'taş yok' USING ERRCODE = 'SL024';
    END IF;
    INSERT INTO public.stone_library_owner_notes (stone_id, kind, title, body, visible_to_experts, health_sensitive, sort_order, created_by)
    VALUES (p_stone_id, coalesce(p_data ->> 'kind', 'note'), nullif(btrim(coalesce(p_data ->> 'title', '')), ''), btrim(coalesce(p_data ->> 'body', '')),
            coalesce((p_data ->> 'visible_to_experts')::boolean, true), coalesce((p_data ->> 'health_sensitive')::boolean, false),
            coalesce((p_data ->> 'sort_order')::int, 0), p_actor) RETURNING id INTO v_id;
    PERFORM public.stone_library_review_log('owner_note', v_id, 'create', NULL);
  ELSE
    SELECT * INTO n FROM public.stone_library_owner_notes WHERE id = p_note_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ek bilgi yok' USING ERRCODE = 'SL024'; END IF;
    IF p_data ? 'expected_version' AND (p_data ->> 'expected_version')::int <> n.row_version THEN
      RAISE EXCEPTION 'ek bilgi başka bir oturumda değişti' USING ERRCODE = 'SL099';
    END IF;
    UPDATE public.stone_library_owner_notes SET
      kind = coalesce(p_data ->> 'kind', kind),
      title = CASE WHEN p_data ? 'title' THEN nullif(btrim(coalesce(p_data ->> 'title', '')), '') ELSE title END,
      body = coalesce(btrim(p_data ->> 'body'), body),
      visible_to_experts = coalesce((p_data ->> 'visible_to_experts')::boolean, visible_to_experts),
      health_sensitive = coalesce((p_data ->> 'health_sensitive')::boolean, health_sensitive),
      sort_order = coalesce((p_data ->> 'sort_order')::int, sort_order),
      row_version = row_version + 1, updated_at = now()
    WHERE id = p_note_id RETURNING id, stone_id INTO v_id, p_stone_id;
    PERFORM public.stone_library_review_log('owner_note', v_id, 'update', NULL);
  END IF;
  PERFORM public.stone_library_refresh_stone(p_stone_id);
  RETURN v_id;
END $$;

-- Ek bilgi sil (geri alınabilir) / geri yükle.
CREATE OR REPLACE FUNCTION public.stone_library_owner_note_delete(p_actor uuid, p_note_id uuid, p_restore boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_stone uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  UPDATE public.stone_library_owner_notes SET
    deleted_at = CASE WHEN p_restore THEN NULL ELSE now() END, deleted_by = CASE WHEN p_restore THEN NULL ELSE p_actor END,
    row_version = row_version + 1, updated_at = now()
  WHERE id = p_note_id AND ((deleted_at IS NULL) = NOT p_restore) RETURNING stone_id INTO v_stone;
  IF v_stone IS NULL THEN RAISE EXCEPTION 'ek bilgi yok ya da zaten bu durumda' USING ERRCODE = 'SL024'; END IF;
  PERFORM public.stone_library_review_log('owner_note', p_note_id, CASE WHEN p_restore THEN 'restore' ELSE 'delete' END, NULL);
  PERFORM public.stone_library_refresh_stone(v_stone);
END $$;

-- Owner görseli kaydet (dosya sunucuda doğrulanıp özel kovaya yüklendikten SONRA). İsteğe bağlı birincil yapılır.
CREATE OR REPLACE FUNCTION public.stone_library_owner_image_register(p_actor uuid, p_stone_id uuid, p_data jsonb, p_make_primary boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'taş yok' USING ERRCODE = 'SL024';
  END IF;
  SELECT id INTO v_id FROM public.stone_library_owner_images WHERE stone_id = p_stone_id AND sha256 = p_data ->> 'sha256' AND deleted_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO public.stone_library_owner_images (stone_id, storage_bucket, storage_path, mime, bytes, width, height, sha256, license_status, license_note, created_by)
    VALUES (p_stone_id, 'stone-library-images', p_data ->> 'storage_path', p_data ->> 'mime', (p_data ->> 'bytes')::int, (p_data ->> 'width')::int,
            (p_data ->> 'height')::int, p_data ->> 'sha256', coalesce(p_data ->> 'license_status', 'undocumented'),
            nullif(btrim(coalesce(p_data ->> 'license_note', '')), ''), p_actor) RETURNING id INTO v_id;
    PERFORM public.stone_library_review_log('owner_image', v_id, 'upload', p_data ->> 'license_status');
  END IF;
  IF p_make_primary THEN
    UPDATE public.stone_library_stones SET image_choice = 'owner', primary_owner_image_id = v_id, row_version = row_version + 1, updated_at = now()
     WHERE id = p_stone_id AND primary_owner_image_id IS DISTINCT FROM v_id;
    PERFORM public.stone_library_review_log('owner_image', v_id, 'set_primary', NULL);
  END IF;
  RETURN v_id;
END $$;

-- Birincil görsel seç (NULL = kaynak görseline dön). Mevcut kaynak görselleri silinmez / değiştirilmez.
CREATE OR REPLACE FUNCTION public.stone_library_owner_image_set_primary(p_actor uuid, p_stone_id uuid, p_image_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_image_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stone_library_owner_images WHERE id = p_image_id AND stone_id = p_stone_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'görsel bu taşa ait değil ya da silinmiş' USING ERRCODE = 'SL089';
  END IF;
  UPDATE public.stone_library_stones SET image_choice = CASE WHEN p_image_id IS NULL THEN 'source' ELSE 'owner' END,
    primary_owner_image_id = p_image_id, row_version = row_version + 1, updated_at = now()
   WHERE id = p_stone_id AND deleted_at IS NULL AND primary_owner_image_id IS DISTINCT FROM p_image_id;
  PERFORM public.stone_library_review_log('owner_image', coalesce(p_image_id, p_stone_id), CASE WHEN p_image_id IS NULL THEN 'revert_source_image' ELSE 'set_primary' END, NULL);
END $$;

-- Owner görselini sil (geri alınabilir) / geri yükle / lisans belgesi durumunu güncelle.
CREATE OR REPLACE FUNCTION public.stone_library_owner_image_update(p_actor uuid, p_image_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE i public.stone_library_owner_images%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO i FROM public.stone_library_owner_images WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'görsel yok' USING ERRCODE = 'SL024'; END IF;
  IF p_action = 'delete' THEN
    IF i.deleted_at IS NOT NULL THEN RETURN; END IF;
    UPDATE public.stone_library_stones SET image_choice = 'source', primary_owner_image_id = NULL, row_version = row_version + 1, updated_at = now()
     WHERE primary_owner_image_id = p_image_id;
    UPDATE public.stone_library_owner_images SET deleted_at = now(), deleted_by = p_actor WHERE id = p_image_id;
  ELSIF p_action = 'restore' THEN
    UPDATE public.stone_library_owner_images SET deleted_at = NULL, deleted_by = NULL WHERE id = p_image_id AND deleted_at IS NOT NULL;
  ELSIF p_action = 'license' THEN
    UPDATE public.stone_library_owner_images SET license_status = coalesce(p_data ->> 'license_status', license_status),
      license_note = CASE WHEN p_data ? 'license_note' THEN nullif(btrim(coalesce(p_data ->> 'license_note', '')), '') ELSE license_note END
     WHERE id = p_image_id;
  ELSE
    RAISE EXCEPTION 'geçersiz görsel işlemi' USING ERRCODE = 'SL098';
  END IF;
  PERFORM public.stone_library_review_log('owner_image', p_image_id, p_action, p_data ->> 'license_status');
  PERFORM public.stone_library_refresh_stone(i.stone_id);
END $$;

-- Çeviri içe aktarma (Git dışı paketten). Her satır kaynak EN (ve TR) metniyle veritabanında BİREBİR doğrulanır;
-- tek bir uyuşmazlıkta tüm aktarım geri alınır. Aynı içerik tekrar gelirse atlanır (idempotent). Yayın DURUMU değişmez.
CREATE OR REPLACE FUNCTION public.stone_library_translation_import(p_actor uuid, p_rows jsonb, p_package_ref text, p_dry_run boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r jsonb; v_stone uuid; v_source uuid; v_field text; v_en text; v_tr text; v_kind text; v_cur public.stone_library_translations%ROWTYPE;
  v_ins int := 0; v_same int := 0; v_new int := 0; v_fb int := 0; v_ver int; v_db_en text; v_db_tr text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'çeviri aktarımı: 1–2000 satır gerekli' USING ERRCODE = 'SL098';
  END IF;
  IF coalesce(btrim(p_package_ref), '') = '' THEN RAISE EXCEPTION 'çeviri aktarımı: paket kimliği zorunlu' USING ERRCODE = 'SL098'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_field := r ->> 'field';
    v_kind := CASE r ->> 'display' WHEN 'DOGRULANMIS_TR_CEVIRI' THEN 'verified_translation' WHEN 'ROXY_TR_FALLBACK' THEN 'source_tr_fallback' END;
    IF v_kind IS NULL OR v_field NOT IN ('description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation','keywords') THEN
      RAISE EXCEPTION 'çeviri aktarımı: geçersiz satır %|%', r ->> 'external_id', v_field USING ERRCODE = 'SL098';
    END IF;
    SELECT e.stone_id, e.source_id INTO v_stone, v_source FROM public.stone_library_external_ids e
      JOIN public.stone_library_sources s ON s.id = e.source_id AND s.kind = 'api' AND s.deleted_at IS NULL
      JOIN public.stone_library_stones st ON st.id = e.stone_id AND st.deleted_at IS NULL
     WHERE e.external_id = r ->> 'external_id' AND e.deleted_at IS NULL ORDER BY e.created_at LIMIT 1;
    IF v_stone IS NULL THEN RAISE EXCEPTION 'çeviri aktarımı: kaynak taş yok %', r ->> 'external_id' USING ERRCODE = 'SL097'; END IF;
    v_db_en := public.stone_library_source_field_text(v_stone, v_source, v_field, 'en');
    v_db_tr := public.stone_library_source_field_text(v_stone, v_source, v_field, 'tr');
    v_en := CASE WHEN v_field = 'keywords' THEN public.stone_library_kw_canon(r ->> 'en') ELSE coalesce(r ->> 'en', '') END;
    v_tr := CASE WHEN v_field = 'keywords' THEN public.stone_library_kw_canon(r ->> 'source_tr') ELSE coalesce(r ->> 'source_tr', '') END;
    IF v_en <> v_db_en THEN
      RAISE EXCEPTION 'çeviri aktarımı: kaynak EN metni veritabanındakiyle aynı değil %|%', r ->> 'external_id', v_field USING ERRCODE = 'SL097';
    END IF;
    IF v_tr <> v_db_tr THEN
      RAISE EXCEPTION 'çeviri aktarımı: kaynak TR metni veritabanındakiyle aynı değil %|%', r ->> 'external_id', v_field USING ERRCODE = 'SL097';
    END IF;
    IF v_kind = 'verified_translation' AND coalesce(btrim(r ->> 'content_tr'), '') = '' THEN
      RAISE EXCEPTION 'çeviri aktarımı: doğrulanmış çeviri metni boş %|%', r ->> 'external_id', v_field USING ERRCODE = 'SL098';
    END IF;
    IF v_kind = 'source_tr_fallback' THEN v_fb := v_fb + 1; END IF;
    SELECT * INTO v_cur FROM public.stone_library_translations WHERE stone_id = v_stone AND field_key = v_field AND superseded_at IS NULL;
    IF FOUND AND v_cur.display_kind = v_kind AND v_cur.content_tr IS NOT DISTINCT FROM (CASE WHEN v_kind = 'verified_translation' THEN r ->> 'content_tr' END)
       AND v_cur.source_en_sha256 = public.stone_library_sha_text(v_db_en) THEN
      v_same := v_same + 1; CONTINUE;
    END IF;
    IF FOUND THEN v_new := v_new + 1; ELSE v_ins := v_ins + 1; END IF;
    IF NOT p_dry_run THEN
      IF v_cur.id IS NOT NULL THEN
        UPDATE public.stone_library_translations SET superseded_at = now(), published_at = NULL, published_by = NULL WHERE id = v_cur.id;
      END IF;
      SELECT coalesce(max(version), 0) + 1 INTO v_ver FROM public.stone_library_translations WHERE stone_id = v_stone AND field_key = v_field;
      INSERT INTO public.stone_library_translations (stone_id, source_id, field_key, version, display_kind, verification_status, content_tr,
        source_en_sha256, source_tr_sha256, package_file_sha_en, package_file_sha_tr, package_ref, created_by)
      VALUES (v_stone, v_source, v_field, v_ver, v_kind, coalesce(r ->> 'status', 'NIHAI_ONAY_ADAYI'),
        CASE WHEN v_kind = 'verified_translation' THEN r ->> 'content_tr' END,
        public.stone_library_sha_text(v_db_en), public.stone_library_sha_text(v_db_tr),
        nullif(r ->> 'file_sha_en', ''), nullif(r ->> 'file_sha_tr', ''), btrim(p_package_ref), p_actor);
    END IF;
    v_cur := NULL;
  END LOOP;
  IF NOT p_dry_run THEN PERFORM public.stone_library_review_log('translation', NULL, 'import', left(p_package_ref, 200)); END IF;
  RETURN jsonb_build_object('dry_run', p_dry_run, 'rows', jsonb_array_length(p_rows), 'inserted', v_ins, 'new_versions', v_new, 'unchanged', v_same, 'fallback', v_fb);
END $$;

-- Çeviri yayınla / yayından kaldır. p_stone_id NULL = tüm katalog; p_field NULL = taşın tüm alanları.
-- Kaynak metin (fallback) ve eskimiş alanlar SUNUCUDA hariç tutulur. p_dry_run önizleme sayımlarını döner.
CREATE OR REPLACE FUNCTION public.stone_library_translation_publish(p_actor uuid, p_stone_id uuid, p_field text, p_action text DEFAULT 'publish',
  p_dry_run boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_elig uuid[]; v_fb int; v_stale int; v_already int; v_total int; v_stones uuid[]; s uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_action NOT IN ('publish','unpublish') THEN RAISE EXCEPTION 'geçersiz çeviri işlemi' USING ERRCODE = 'SL098'; END IF;
  IF p_field IS NOT NULL AND p_field NOT IN ('description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation','keywords') THEN
    RAISE EXCEPTION 'geçersiz alan' USING ERRCODE = 'SL098';
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_tr_scope (id uuid, stone_id uuid, kind text, stale boolean, pub boolean) ON COMMIT DROP;
  TRUNCATE pg_temp._sl_tr_scope;
  INSERT INTO pg_temp._sl_tr_scope
  SELECT t.id, t.stone_id, t.display_kind, public.stone_library_translation_stale(t), t.published_at IS NOT NULL
    FROM public.stone_library_translations t JOIN public.stone_library_stones st ON st.id = t.stone_id AND st.deleted_at IS NULL
   WHERE t.superseded_at IS NULL AND (p_stone_id IS NULL OR t.stone_id = p_stone_id) AND (p_field IS NULL OR t.field_key = p_field);
  SELECT count(*), count(*) FILTER (WHERE kind <> 'verified_translation'), count(*) FILTER (WHERE kind = 'verified_translation' AND stale),
         count(*) FILTER (WHERE kind = 'verified_translation' AND NOT stale AND pub = (p_action = 'publish'))
    INTO v_total, v_fb, v_stale, v_already FROM pg_temp._sl_tr_scope;
  SELECT coalesce(array_agg(id), '{}') INTO v_elig FROM pg_temp._sl_tr_scope
   WHERE kind = 'verified_translation' AND (p_action = 'unpublish' OR NOT stale) AND pub <> (p_action = 'publish');
  IF NOT p_dry_run AND cardinality(v_elig) > 0 THEN
    UPDATE public.stone_library_translations SET published_at = CASE WHEN p_action = 'publish' THEN now() END,
      published_by = CASE WHEN p_action = 'publish' THEN p_actor END
     WHERE id = ANY (v_elig);
    PERFORM public.stone_library_review_log('translation', p_stone_id, CASE WHEN p_action = 'publish' THEN 'publish' ELSE 'unpublish' END,
      concat_ws(' · ', coalesce(p_field, 'tüm alanlar'), cardinality(v_elig) || ' alan'));
    SELECT array_agg(DISTINCT stone_id) INTO v_stones FROM pg_temp._sl_tr_scope WHERE id = ANY (v_elig);
    FOREACH s IN ARRAY v_stones LOOP PERFORM public.stone_library_refresh_stone(s); END LOOP;
  END IF;
  RETURN jsonb_build_object('dry_run', p_dry_run, 'action', p_action, 'scope_total', v_total, 'affected', cardinality(v_elig),
    'already', v_already, 'excluded_fallback', v_fb, 'excluded_stale', CASE WHEN p_action = 'publish' THEN v_stale ELSE 0 END);
END $$;

-- Toplu silme (3+ taş) — 1. aşama: belirteç (10 dk geçerli). Daha az taş için tekil silme kullanılır.
CREATE OR REPLACE FUNCTION public.stone_library_bulk_delete_prepare(p_actor uuid, p_stone_ids jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_ids uuid[]; v_tok uuid; v_names jsonb;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF jsonb_typeof(p_stone_ids) <> 'array' THEN RAISE EXCEPTION 'taş listesi gerekli' USING ERRCODE = 'SL020'; END IF;
  SELECT array_agg(DISTINCT x::uuid) INTO v_ids FROM jsonb_array_elements_text(p_stone_ids) x
   WHERE x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF v_ids IS NULL OR cardinality(v_ids) <> jsonb_array_length(p_stone_ids) THEN RAISE EXCEPTION 'geçersiz veya tekrarlı kimlik' USING ERRCODE = 'SL020'; END IF;
  IF cardinality(v_ids) < 3 THEN RAISE EXCEPTION 'toplu silme 3 ve üzeri taş içindir' USING ERRCODE = 'SL020'; END IF;
  IF cardinality(v_ids) > 500 THEN RAISE EXCEPTION 'en çok 500 taş' USING ERRCODE = 'SL020'; END IF;
  IF (SELECT count(*) FROM public.stone_library_stones WHERE id = ANY (v_ids) AND deleted_at IS NULL) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'listede bulunmayan ya da silinmiş taş var' USING ERRCODE = 'SL024';
  END IF;
  INSERT INTO public.stone_library_bulk_tokens (actor, stone_ids, expires_at) VALUES (p_actor, v_ids, now() + interval '10 minutes') RETURNING id INTO v_tok;
  SELECT jsonb_agg(name_tr ORDER BY name_tr) INTO v_names FROM public.stone_library_stones WHERE id = ANY (v_ids);
  PERFORM public.stone_library_review_log('bulk', v_tok, 'delete_prepare', cardinality(v_ids) || ' taş');
  RETURN jsonb_build_object('token', v_tok, 'count', cardinality(v_ids), 'names', v_names, 'confirm_text', 'SİL',
    'published', (SELECT count(*) FROM public.stone_library_stones WHERE id = ANY (v_ids) AND status = 'published'));
END $$;

-- 2. aşama: belirteç + "SİL" metni. Yayındaki taşlar önce yayından kaldırılır; silme geri alınabilir (delete_ops).
CREATE OR REPLACE FUNCTION public.stone_library_bulk_delete_confirm(p_actor uuid, p_token uuid, p_confirm_text text, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE tk public.stone_library_bulk_tokens%ROWTYPE; s uuid; v_ops uuid[] := '{}'; v_op uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO tk FROM public.stone_library_bulk_tokens WHERE id = p_token FOR UPDATE;
  IF NOT FOUND OR tk.actor <> p_actor THEN RAISE EXCEPTION 'onay belirteci geçersiz' USING ERRCODE = 'SL101'; END IF;
  IF tk.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'onay belirteci zaten kullanıldı' USING ERRCODE = 'SL101'; END IF;
  IF tk.expires_at <= now() THEN RAISE EXCEPTION 'onay belirtecinin süresi doldu' USING ERRCODE = 'SL101'; END IF;
  IF coalesce(btrim(p_confirm_text), '') <> 'SİL' THEN RAISE EXCEPTION 'onay metni hatalı ("SİL" yazılmalı)' USING ERRCODE = 'SL101'; END IF;
  PERFORM public.stone_library_defer_begin();
  FOREACH s IN ARRAY tk.stone_ids LOOP
    UPDATE public.stone_library_stones SET status = 'hidden', row_version = row_version + 1, updated_at = now()
     WHERE id = s AND status = 'published' AND deleted_at IS NULL;
    IF FOUND THEN PERFORM public.stone_library_review_log('stone', s, 'unpublish', 'bulk_delete'); END IF;
    v_op := public.stone_library_delete(p_actor, 'stone', s, coalesce(p_reason, 'bulk_delete'), true);
    v_ops := array_append(v_ops, v_op);
    PERFORM public.stone_library_defer_begin();  -- stone_library_delete kendi sonunda ertelemeyi kapatır; toplu işlem boyunca açık kalsın
  END LOOP;
  UPDATE public.stone_library_bulk_tokens SET consumed_at = now(), op_ids = v_ops WHERE id = p_token;
  PERFORM public.stone_library_review_log('bulk', p_token, 'delete_confirm', cardinality(v_ops) || ' taş');
  PERFORM public.stone_library_defer_flush();
  RETURN jsonb_build_object('deleted', cardinality(v_ops), 'op_ids', to_jsonb(v_ops));
END $$;

-- Toplu silmeyi geri al (belirteçteki tüm silme işlemleri).
CREATE OR REPLACE FUNCTION public.stone_library_bulk_restore(p_actor uuid, p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE tk public.stone_library_bulk_tokens%ROWTYPE; o uuid; n int := 0;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO tk FROM public.stone_library_bulk_tokens WHERE id = p_token FOR UPDATE;
  IF NOT FOUND OR tk.consumed_at IS NULL OR tk.op_ids IS NULL THEN RAISE EXCEPTION 'geri alınacak toplu silme yok' USING ERRCODE = 'SL101'; END IF;
  FOREACH o IN ARRAY tk.op_ids LOOP
    IF EXISTS (SELECT 1 FROM public.stone_library_delete_ops WHERE id = o AND restored_at IS NULL) THEN
      PERFORM public.stone_library_restore(p_actor, o); n := n + 1;
    END IF;
  END LOOP;
  PERFORM public.stone_library_review_log('bulk', p_token, 'restore', n || ' taş');
  RETURN jsonb_build_object('restored', n);
END $$;

-- Owner okuma: bir taşın tüm katmanları (sürümler, çeviriler + eskime, notlar, görseller, hazırlık).
CREATE OR REPLACE FUNCTION public.stone_library_owner_layers(p_actor uuid, p_stone_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN (SELECT jsonb_build_object(
    'stone', jsonb_build_object('id', s.id, 'slug', s.slug, 'name_tr', s.name_tr, 'name_en', s.name_en, 'status', s.status, 'origin', s.origin,
                                'owner_version_current', s.owner_version_current, 'image_choice', s.image_choice, 'primary_owner_image_id', s.primary_owner_image_id,
                                'deleted_at', s.deleted_at, 'row_version', s.row_version),
    'versions', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'data', v.data, 'health_fields', v.health_fields, 'note', v.note,
                                   'created_at', v.created_at, 'current', v.version = s.owner_version_current) ORDER BY v.version DESC)
                            FROM public.stone_library_owner_versions v WHERE v.stone_id = s.id), '[]'::jsonb),
    'translations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'field', t.field_key, 'version', t.version, 'display_kind', t.display_kind,
                                   'verification_status', t.verification_status, 'content_tr', t.content_tr, 'published', t.published_at IS NOT NULL,
                                   'published_at', t.published_at, 'stale', public.stone_library_translation_stale(t)) ORDER BY public.stone_library_field_rank(t.field_key))
                            FROM public.stone_library_translations t WHERE t.stone_id = s.id AND t.superseded_at IS NULL), '[]'::jsonb),
    'notes', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.kind DESC, n.sort_order, n.created_at) FROM public.stone_library_owner_notes n WHERE n.stone_id = s.id), '[]'::jsonb),
    'owner_images', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'mime', i.mime, 'bytes', i.bytes, 'width', i.width, 'height', i.height,
                                   'sha256', i.sha256, 'license_status', i.license_status, 'license_note', i.license_note, 'created_at', i.created_at,
                                   'deleted_at', i.deleted_at, 'primary', i.id = s.primary_owner_image_id) ORDER BY i.created_at DESC)
                            FROM public.stone_library_owner_images i WHERE i.stone_id = s.id), '[]'::jsonb),
    'readiness', public.stone_library_readiness(s.id))
    FROM public.stone_library_stones s WHERE s.id = p_stone_id);
END $$;

-- Owner okuma: katalog özeti (liste ekranı; dinamik sayım — sabit 91 yok).
CREATE OR REPLACE FUNCTION public.stone_library_owner_layer_summary(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN jsonb_build_object(
    'stones', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name_tr', coalesce(btrim(v.data ->> 'name_tr'), s.name_tr),
        'name_en', coalesce(btrim(v.data ->> 'name_en'), s.name_en), 'status', s.status, 'origin', s.origin, 'deleted', s.deleted_at IS NOT NULL,
        'owner_version_current', s.owner_version_current,
        'owner_versions', (SELECT count(*) FROM public.stone_library_owner_versions x WHERE x.stone_id = s.id),
        'translations_published', (SELECT count(*) FROM public.stone_library_translations t WHERE t.stone_id = s.id AND t.superseded_at IS NULL AND t.published_at IS NOT NULL),
        'translations_total', (SELECT count(*) FROM public.stone_library_translations t WHERE t.stone_id = s.id AND t.superseded_at IS NULL),
        'image_choice', s.image_choice, 'has_published_image', EXISTS (SELECT 1 FROM public.stone_library_published p WHERE p.stone_id = s.id AND p.has_image))
        ORDER BY public.stone_library_fold(coalesce(btrim(v.data ->> 'name_tr'), s.name_tr)))
      FROM public.stone_library_stones s
      LEFT JOIN public.stone_library_owner_versions v ON v.stone_id = s.id AND v.version = s.owner_version_current), '[]'::jsonb),
    'counts', jsonb_build_object(
      'total', (SELECT count(*) FROM public.stone_library_stones WHERE deleted_at IS NULL),
      'published', (SELECT count(*) FROM public.stone_library_stones WHERE deleted_at IS NULL AND status = 'published'),
      'owner_created', (SELECT count(*) FROM public.stone_library_stones WHERE deleted_at IS NULL AND origin = 'owner'),
      'deleted', (SELECT count(*) FROM public.stone_library_stones WHERE deleted_at IS NOT NULL),
      'translation_fields', (SELECT count(*) FROM public.stone_library_translations WHERE superseded_at IS NULL),
      'translation_published', (SELECT count(*) FROM public.stone_library_translations WHERE superseded_at IS NULL AND published_at IS NOT NULL),
      'translation_fallback', (SELECT count(*) FROM public.stone_library_translations WHERE superseded_at IS NULL AND display_kind = 'source_tr_fallback')));
END $$;

-- ─── 12) Ayrıcalıklar ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text; fn record;
BEGIN
  FOREACH t IN ARRAY ARRAY['stone_library_translations','stone_library_owner_versions','stone_library_owner_notes','stone_library_owner_images','stone_library_bulk_tokens'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  -- Yeni / yeniden adlandırılan bütün fonksiyonlar önce herkesten alınır.
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('stone_library_origin_guard','stone_library_translation_guard','stone_library_owner_image_guard',
               'stone_library_sha_text','stone_library_kw_canon','stone_library_source_field_text','stone_library_translation_stale','stone_library_field_health',
               'stone_library_owner_data_check','stone_library_health_fields_arr','stone_library_readiness','stone_library_readiness_f3',
               'stone_library_refresh_stone','stone_library_refresh_stone_f3','stone_library_expert_image','stone_library_expert_image_f3',
               'stone_library_publish_internal','stone_library_owner_publish','stone_library_owner_version_save','stone_library_owner_version_set_current',
               'stone_library_owner_stone_create','stone_library_owner_note_save','stone_library_owner_note_delete','stone_library_owner_image_register',
               'stone_library_owner_image_set_primary','stone_library_owner_image_update','stone_library_translation_import','stone_library_translation_publish',
               'stone_library_bulk_delete_prepare','stone_library_bulk_delete_confirm','stone_library_bulk_restore','stone_library_owner_layers',
               'stone_library_owner_layer_summary') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', fn.sig);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.stone_library_expert_image(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_publish(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_version_save(uuid, uuid, jsonb, jsonb, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_version_set_current(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_stone_create(uuid, jsonb, jsonb, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_note_save(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_note_delete(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_image_register(uuid, uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_image_set_primary(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_image_update(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_translation_import(uuid, jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_translation_publish(uuid, uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_bulk_delete_prepare(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_bulk_delete_confirm(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_bulk_restore(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_layers(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_layer_summary(uuid) TO service_role;

COMMIT;
