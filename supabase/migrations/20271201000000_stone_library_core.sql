-- =============================================================================
-- 20271201000000_stone_library_core.sql
--
-- DOĞALTAŞ KÜTÜPHANESİ (F1) · ADDITIVE · YALNIZ YENİ `stone_library_*` NESNELERİ
--
-- AMAÇ: Uzmanların kendi taş kayıtlarından (stones / stone_sources / stone_entries / minerals /
--   combinations / client_stones / dogaltas_inventory) TAMAMEN BAĞIMSIZ, tenant'sız, çok kaynaklı ve
--   sürümlü global referans kütüphanesi. Mevcut hiçbir tabloya, fonksiyona, tetikleyiciye, Yaşam
--   Hafızası tablosuna / cron'una / bayrağına DOKUNULMAZ; mevcut auth / tenant / RLS kuralları DEĞİŞMEZ.
--   Tek dış bağımlılık: public.users (owner / uzman kimliği okunur; users'a yazılmaz).
--
-- TABLOLAR (17):
--   stone_library_settings          — tek satır: sağlık içeriği yayın kilidi + görünür sağlık uyarısı
--   stone_library_sources           — kaynak kimliği + lisans + görünürlük (YALNIZ OWNER)
--   stone_library_source_documents  — lisans belgeleri / şart anlık görüntüleri (YALNIZ OWNER)
--   stone_library_vocab             — çakra / burç / element / gezegen / renk sözlüğü (TR/EN etiket)
--   stone_library_stones            — kanonik taş kartı (TR/EN ad, yayın durumu)
--   stone_library_names             — alternatif adlar ve yazılışlar (TR/EN)
--   stone_library_external_ids      — kaynağa ait harici taş kimliği → kanonik kart
--   stone_library_import_batches    — aktarım paketleri (kredi tavanı, durum makinesi)
--   stone_library_import_events     — aktarım işlem kayıtları (append-only)
--   stone_library_raw               — DEĞİŞTİRİLEMEZ ham yanıtlar (YALNIZ OWNER)
--   stone_library_records           — kaynak bazında SÜRÜMLÜ bilgi alanları (içerik değiştirilemez)
--   stone_library_facets            — çakra/burç/element/renk/gezegen/sertlik/doğum ayı/anahtar kelime/eşleştirme
--   stone_library_reviews           — owner inceleme / onay geçmişi (append-only)
--   stone_library_history           — satır sürüm geçmişi (append-only; UPDATE öncesi/sonrası)
--   stone_library_delete_ops        — geri alınabilir silme işlemleri
--   stone_library_access_grants     — owner'ın kişi bazında verdiği uzman erişimi (varsayılan YOK)
--   stone_library_published         — uzmana gidebilecek TEK yüzey: yayımlanmış + izinli içerikten
--                                     türetilmiş belge + arama indeksi (gerçek kaynak kimliği İÇERMEZ)
--
-- GÜVENLİK:
--   • Hiçbir tabloda tenant_id yok (kütüphane hiçbir tenant'a ait değil). RLS AÇIK, policy YOK.
--   • PUBLIC / anon / authenticated / service_role: HİÇBİR TABLODA HİÇBİR AYRICALIK YOK (SELECT dahil).
--     Sunucu kodu (service_role) bile tabloları doğrudan okuyamaz / yazamaz → gerçek kaynak adı, lisans,
--     ham veri yalnız owner RPC'leriyle; uzman yalnız yayın RPC'leriyle görür.
--   • Tüm RPC'ler SECURITY DEFINER; owner RPC'leri işlemi yapanın PLATFORM OWNER olduğunu DB'de yeniden
--     doğrular: users.is_super_admin IS TRUE + role='admin' + active + demo değil (e-posta / admin_level /
--     OWNER_TENANT_ID KULLANILMAZ). Uzman RPC'leri izleyicinin etkin yetkisini DB'de yeniden doğrular.
--     EXECUTE yalnız service_role (route katmanı aktörü oturum token'ıyla eşleştirdikten SONRA çağırır).
--   • Ham veri, işlem kaydı, inceleme ve sürüm geçmişi değiştirilemez / silinemez (tetikleyici).
--   • İçerik tablolarında fiziksel DELETE yok → silme = geri alınabilir yumuşak silme (stone_library_delete
--     / stone_library_restore).
--   • Kaynak metni değiştirilemez: düzeltme = yeni sürüm (origin='owner_edit'); eski sürüm korunur.
--   • Sağlık açısından hassas içerik (meaning_physical her zaman) hukuk onayı + genel kilit açılmadan
--     uzman yüzeyine GİRMEZ (yayın belgesi ve arama indeksi dahil).
--   • Roxy dahil her kaynağın varsayılan görünürlüğü 'hidden'. Zorunlu atıflı kaynakta 'hidden' seçilemez.
--
-- KULLANICI SİLME: aktör kolonları (created_by, reviewed_by, actor …) bilinçli olarak users'a FK DEĞİLDİR → owner purge /
--   test hesabı temizliği append-only kayıtlara takılmaz; denetim izi uuid olarak kalır. Tek FK: access_grants.user_id CASCADE.
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
--   Sıra: migration → env (STONE_LIBRARY_ENABLED=true) → deploy. Env yoksa tüm kütüphane uçları 404.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 0) Yardımcılar ────────────────────────────────────────────────────────────────────────────
-- Türkçe harf duyarsız katlama (TS aynası: lib/stone-library/fold.ts). İ/I/ı → i, ç → c, … ; harf/rakam
-- dışı her şey tek boşluk. "AMETİST" = "Ametist" = "ametist".
CREATE OR REPLACE FUNCTION public.stone_library_fold(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
           lower(translate(coalesce(p, ''),
             'İIıÇçĞğÖöŞşÜüÂâÎîÛûÉéÈèÊêËëÁáÀàÄäÓóÒòÔôÍíÌìÏïÚúÙùÑñ',
             'iiiccggoossuuaaiiuueeeeeeeeaaaaaaooooooiiiiiiuuuunn')),
           '[^a-z0-9]+', ' ', 'g'))
$$;

-- PLATFORM OWNER mı? (yalnız DB satırı; fallback YOK)
CREATE OR REPLACE FUNCTION public.stone_library_actor_is_owner(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((
    SELECT u.is_super_admin IS TRUE AND lower(coalesce(u.role,'')) = 'admin' AND u.active IS TRUE
           AND coalesce(u.is_demo_account,false) IS FALSE
      FROM public.users u WHERE u.id = p_actor), false)
$$;

CREATE OR REPLACE FUNCTION public.stone_library_assert_owner(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR NOT public.stone_library_actor_is_owner(p_actor) THEN
    RAISE EXCEPTION 'stone_library: yetkisiz aktör' USING ERRCODE = 'SL001';
  END IF;
  PERFORM set_config('stone_library.actor', p_actor::text, true);
END $$;

-- ─── 1) Ayarlar (tek satır) ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_settings (
  id                                  boolean     PRIMARY KEY DEFAULT true CHECK (id),
  health_content_publication_enabled  boolean     NOT NULL DEFAULT false,
  health_notice_tr                    text        NOT NULL CHECK (char_length(health_notice_tr) BETWEEN 20 AND 1000),
  health_notice_en                    text        NOT NULL CHECK (char_length(health_notice_en) BETWEEN 20 AND 1000),
  legal_review_ref                    text        CHECK (legal_review_ref IS NULL OR char_length(legal_review_ref) <= 500),
  updated_by                          uuid,
  updated_at                          timestamptz NOT NULL DEFAULT now(),
  -- Genel sağlık kilidi hukuk referansı olmadan açılamaz.
  CONSTRAINT stone_library_settings_health_ref_chk CHECK (NOT health_content_publication_enabled OR legal_review_ref IS NOT NULL)
);
INSERT INTO public.stone_library_settings (id, health_notice_tr, health_notice_en)
VALUES (true,
  'Bu kütüphanede yer alan bilgiler geleneksel ve tamamlayıcı uygulamalara ilişkin bilgilendirme amaçlıdır. Tıbbi tanı veya tedavi yöntemi değildir; sağlık uzmanının değerlendirmesinin yerine geçmez.',
  'The information in this library is provided for informational purposes about traditional and complementary practices. It is not a medical diagnosis or treatment method and does not replace the evaluation of a healthcare professional.')
ON CONFLICT (id) DO NOTHING;

-- ─── 2) Kaynaklar + lisans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_sources (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key            text        NOT NULL CHECK (source_key ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  kind                  text        NOT NULL CHECK (kind IN ('api','trainer_archive','licensed_course','owner')),
  real_name             text        NOT NULL CHECK (char_length(btrim(real_name)) BETWEEN 1 AND 200),
  provider_code         text        CHECK (provider_code IS NULL OR provider_code ~ '^[a-z0-9_-]{1,40}$'),
  display_mode          text        NOT NULL DEFAULT 'hidden' CHECK (display_mode IN ('real','alias','hidden')),
  display_alias         text        CHECK (display_alias IS NULL OR char_length(btrim(display_alias)) BETWEEN 1 AND 120),
  attribution_required  boolean     NOT NULL DEFAULT false,
  attribution_text      text        CHECK (attribution_text IS NULL OR char_length(attribution_text) BETWEEN 1 AND 500),
  license_type          text        CHECK (license_type IS NULL OR license_type IN ('api_terms','written_contract','purchased_archive','owner_content','other')),
  license_ref           text        CHECK (license_ref IS NULL OR char_length(license_ref) <= 500),
  license_terms_url     text        CHECK (license_terms_url IS NULL OR license_terms_url ~ '^https://'),
  license_terms_sha256  text        CHECK (license_terms_sha256 IS NULL OR license_terms_sha256 ~ '^[0-9a-f]{64}$'),
  license_accepted_at   timestamptz,
  license_valid_until   timestamptz,
  commercial_use_ok     boolean     NOT NULL DEFAULT false,
  image_rights          text        NOT NULL DEFAULT 'none' CHECK (image_rights IN ('none','hotlink_ok','rehost_ok')),
  status                text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended')),
  notes                 text        CHECK (notes IS NULL OR char_length(notes) <= 4000),
  row_version           integer     NOT NULL DEFAULT 1,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  deleted_by            uuid,
  delete_op_id          uuid,
  CONSTRAINT stone_library_sources_alias_chk CHECK (display_mode <> 'alias' OR display_alias IS NOT NULL),
  -- Marka kuralı (owner 2026-10-19): Roxy adı kullanıcıya görünen hiçbir yerde yok → yalnız gizli veya owner adı.
  CONSTRAINT stone_library_sources_roxy_name_chk CHECK (coalesce(provider_code,'') <> 'roxy' OR display_mode <> 'real'),
  -- Zorunlu atıflı kaynakta ad gizlenemez ve atıf metni zorunludur.
  CONSTRAINT stone_library_sources_attribution_chk CHECK (NOT attribution_required OR (display_mode <> 'hidden' AND attribution_text IS NOT NULL)),
  -- Etkin (aktarım yapılabilir) kaynakta lisans kaydı zorunlu.
  CONSTRAINT stone_library_sources_active_license_chk CHECK (status <> 'active' OR (license_type IS NOT NULL AND (license_ref IS NOT NULL OR license_terms_sha256 IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_sources_key_uidx ON public.stone_library_sources (source_key) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.stone_library_source_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  doc_kind        text        NOT NULL CHECK (doc_kind IN ('terms_snapshot','contract','permission_letter','correspondence','other')),
  title           text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  url             text        CHECK (url IS NULL OR url ~ '^https://'),
  content_sha256  text        CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at     timestamptz NOT NULL DEFAULT now(),
  note            text        CHECK (note IS NULL OR char_length(note) <= 4000),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid,
  delete_op_id    uuid
);
CREATE INDEX IF NOT EXISTS stone_library_source_documents_src_idx ON public.stone_library_source_documents (source_id);

-- ─── 3) Sözlük ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_vocab (
  facet       text    NOT NULL CHECK (facet IN ('chakra','zodiac','element','planet','color')),
  value_key   text    NOT NULL CHECK (value_key ~ '^[a-z0-9_]{1,60}$'),
  label_tr    text    NOT NULL CHECK (char_length(label_tr) BETWEEN 1 AND 80),
  label_en    text    NOT NULL CHECK (char_length(label_en) BETWEEN 1 AND 80),
  sort_order  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (facet, value_key)
);
INSERT INTO public.stone_library_vocab (facet, value_key, label_tr, label_en, sort_order) VALUES
  ('chakra','root','Kök Çakra','Root',1), ('chakra','sacral','Sakral Çakra','Sacral',2),
  ('chakra','solar_plexus','Solar Pleksus','Solar Plexus',3), ('chakra','heart','Kalp Çakrası','Heart',4),
  ('chakra','throat','Boğaz Çakrası','Throat',5), ('chakra','third_eye','Üçüncü Göz','Third Eye',6),
  ('chakra','crown','Taç Çakra','Crown',7),
  ('zodiac','aries','Koç','Aries',1), ('zodiac','taurus','Boğa','Taurus',2), ('zodiac','gemini','İkizler','Gemini',3),
  ('zodiac','cancer','Yengeç','Cancer',4), ('zodiac','leo','Aslan','Leo',5), ('zodiac','virgo','Başak','Virgo',6),
  ('zodiac','libra','Terazi','Libra',7), ('zodiac','scorpio','Akrep','Scorpio',8), ('zodiac','sagittarius','Yay','Sagittarius',9),
  ('zodiac','capricorn','Oğlak','Capricorn',10), ('zodiac','aquarius','Kova','Aquarius',11), ('zodiac','pisces','Balık','Pisces',12),
  ('element','earth','Toprak','Earth',1), ('element','water','Su','Water',2), ('element','fire','Ateş','Fire',3),
  ('element','air','Hava','Air',4), ('element','storm','Fırtına','Storm',5),
  ('planet','sun','Güneş','Sun',1), ('planet','moon','Ay','Moon',2), ('planet','mercury','Merkür','Mercury',3),
  ('planet','venus','Venüs','Venus',4), ('planet','earth','Dünya','Earth',5), ('planet','mars','Mars','Mars',6),
  ('planet','jupiter','Jüpiter','Jupiter',7), ('planet','saturn','Satürn','Saturn',8), ('planet','uranus','Uranüs','Uranus',9),
  ('planet','neptune','Neptün','Neptune',10), ('planet','pluto','Plüton','Pluto',11),
  ('color','black','Siyah','Black',1), ('color','white','Beyaz','White',2), ('color','clear','Şeffaf','Clear',3),
  ('color','grey','Gri','Grey',4), ('color','silver','Gümüş','Silver',5), ('color','golden','Altın Sarısı','Golden',6),
  ('color','brown','Kahverengi','Brown',7), ('color','red','Kırmızı','Red',8), ('color','orange','Turuncu','Orange',9),
  ('color','yellow','Sarı','Yellow',10), ('color','green','Yeşil','Green',11), ('color','blue','Mavi','Blue',12),
  ('color','indigo','Çivit Mavisi','Indigo',13), ('color','violet','Menekşe','Violet',14), ('color','purple','Mor','Purple',15),
  ('color','pink','Pembe','Pink',16), ('color','peach','Şeftali','Peach',17), ('color','cream','Krem','Cream',18),
  ('color','multicolor','Çok Renkli','Multicolor',19)
ON CONFLICT (facet, value_key) DO NOTHING;

-- ─── 4) Kanonik taş kartı ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_stones (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  name_tr       text        NOT NULL CHECK (char_length(btrim(name_tr)) BETWEEN 1 AND 120),
  name_en       text        CHECK (name_en IS NULL OR char_length(btrim(name_en)) BETWEEN 1 AND 120),
  status        text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  published_at  timestamptz,
  published_by  uuid,
  row_version   integer     NOT NULL DEFAULT 1,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  deleted_by    uuid,
  delete_op_id  uuid,
  CONSTRAINT stone_library_stones_deleted_unpublished_chk CHECK (deleted_at IS NULL OR status <> 'published')
);
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_stones_slug_uidx ON public.stone_library_stones (slug) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_stones_name_tr_uidx ON public.stone_library_stones (public.stone_library_fold(name_tr)) WHERE deleted_at IS NULL;

-- ─── 5) Alternatif adlar / yazılışlar ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_names (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id      uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  lang          text        NOT NULL CHECK (lang IN ('tr','en','other')),
  name          text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  name_key      text        GENERATED ALWAYS AS (public.stone_library_fold(name)) STORED,
  kind          text        NOT NULL CHECK (kind IN ('alias','spelling','source_name')),
  source_id     uuid        REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  batch_id      uuid,
  review_state  text        NOT NULL DEFAULT 'approved' CHECK (review_state IN ('pending','approved','rejected')),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  deleted_by    uuid,
  delete_op_id  uuid,
  CONSTRAINT stone_library_names_key_chk CHECK (name_key <> '')
);
-- Bir ad/yazılış yalnız TEK karta bağlanabilir.
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_names_key_uidx ON public.stone_library_names (name_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stone_library_names_stone_idx ON public.stone_library_names (stone_id);

-- ─── 6) Harici kimlikler ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_external_ids (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  external_id   text        NOT NULL CHECK (external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  stone_id      uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  batch_id      uuid,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  deleted_by    uuid,
  delete_op_id  uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_external_ids_uidx ON public.stone_library_external_ids (source_id, external_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stone_library_external_ids_stone_idx ON public.stone_library_external_ids (stone_id);

-- ─── 7) Aktarım paketleri + işlem kayıtları + ham veri ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_import_batches (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  kind               text        NOT NULL CHECK (kind IN ('api_import','file_import','manual')),
  status             text        NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','stop_requested','stopped','completed','failed','rolled_back')),
  dry_run            boolean     NOT NULL DEFAULT true,
  langs              text[]      NOT NULL DEFAULT ARRAY['tr']::text[] CHECK (langs <@ ARRAY['tr','en']::text[] AND cardinality(langs) BETWEEN 1 AND 2),
  calls_planned      integer     NOT NULL DEFAULT 0 CHECK (calls_planned >= 0),
  credit_cap         integer     NOT NULL CHECK (credit_cap BETWEEN 0 AND 5000),
  calls_used         integer     NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  quota_limit        integer,
  quota_remaining_before integer,
  quota_remaining_after  integer,
  terms_sha256       text        CHECK (terms_sha256 IS NULL OR terms_sha256 ~ '^[0-9a-f]{64}$'),
  paid_period_note   text        CHECK (paid_period_note IS NULL OR char_length(paid_period_note) <= 200),
  note               text        CHECK (note IS NULL OR char_length(note) <= 2000),
  started_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  stop_requested_at  timestamptz,
  finished_at        timestamptz,
  rolled_back_at     timestamptz,
  rollback_op_id     uuid,
  CONSTRAINT stone_library_batches_cap_chk CHECK (calls_used <= credit_cap),
  CONSTRAINT stone_library_batches_dry_chk CHECK (NOT dry_run OR calls_used = 0)
);
-- Kaynak başına aynı anda tek çalışan paket.
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_batches_one_running_uidx ON public.stone_library_import_batches (source_id) WHERE status IN ('running','stop_requested');

CREATE TABLE IF NOT EXISTS public.stone_library_import_events (
  id           bigserial   PRIMARY KEY,
  batch_id     uuid        NOT NULL REFERENCES public.stone_library_import_batches(id) ON DELETE RESTRICT,
  level        text        NOT NULL CHECK (level IN ('info','warn','error')),
  kind         text        NOT NULL CHECK (kind ~ '^[a-z0-9_]{1,40}$'),
  external_id  text        CHECK (external_id IS NULL OR char_length(external_id) <= 120),
  message      text        CHECK (message IS NULL OR char_length(message) <= 2000),
  actor        uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stone_library_import_events_batch_idx ON public.stone_library_import_events (batch_id, id);

CREATE TABLE IF NOT EXISTS public.stone_library_raw (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid        NOT NULL REFERENCES public.stone_library_import_batches(id) ON DELETE RESTRICT,
  source_id       uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  external_id     text        CHECK (external_id IS NULL OR external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  lang            text        CHECK (lang IS NULL OR lang IN ('tr','en')),
  endpoint        text        NOT NULL CHECK (endpoint ~ '^/[A-Za-z0-9/_.-]{0,200}$'),
  http_status     integer     NOT NULL CHECK (http_status BETWEEN 100 AND 599),
  payload         jsonb       NOT NULL CHECK (pg_column_size(payload) <= 1048576),
  payload_sha256  text        NOT NULL,  -- tetikleyici yazar (stone_library_set_sha); değiştirilemez
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid
);
CREATE INDEX IF NOT EXISTS stone_library_raw_batch_idx ON public.stone_library_raw (batch_id);
CREATE INDEX IF NOT EXISTS stone_library_raw_ext_idx ON public.stone_library_raw (source_id, external_id, lang);

-- ─── 8) Sürümlü bilgi alanları ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id          uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  source_id         uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  field_key         text        NOT NULL CHECK (field_key IN ('description','meaning_spiritual','meaning_emotional','meaning_physical',
                                  'affirmation','general','usage','care','cleansing','meditation','warning','history','other')),
  lang              text        NOT NULL CHECK (lang IN ('tr','en')),
  version           integer     NOT NULL CHECK (version >= 1),
  origin            text        NOT NULL CHECK (origin IN ('source','owner_edit','owner_authored')),
  content           text        NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 150000),
  content_sha256    text        NOT NULL,  -- tetikleyici yazar (stone_library_set_sha); içerikle birlikte değiştirilemez
  based_on_id       uuid        REFERENCES public.stone_library_records(id) ON DELETE RESTRICT,
  batch_id          uuid        REFERENCES public.stone_library_import_batches(id) ON DELETE RESTRICT,
  raw_id            uuid        REFERENCES public.stone_library_raw(id) ON DELETE RESTRICT,
  is_current        boolean     NOT NULL DEFAULT false,
  review_state      text        NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','approved','rejected')),
  visibility        text        NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden')),
  health_sensitive  boolean     NOT NULL DEFAULT false,
  legal_cleared_at  timestamptz,
  legal_cleared_by  uuid,
  legal_ref         text        CHECK (legal_ref IS NULL OR char_length(legal_ref) <= 500),
  reviewed_at       timestamptz,
  reviewed_by       uuid,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  deleted_by        uuid,
  delete_op_id      uuid,
  CONSTRAINT stone_library_records_version_uniq UNIQUE (stone_id, source_id, field_key, lang, version),
  -- Fiziksel etki alanı HER ZAMAN sağlık açısından hassastır (kaldırılamaz).
  CONSTRAINT stone_library_records_physical_chk CHECK (field_key <> 'meaning_physical' OR health_sensitive),
  CONSTRAINT stone_library_records_edit_base_chk CHECK (origin <> 'owner_edit' OR based_on_id IS NOT NULL),
  CONSTRAINT stone_library_records_legal_chk CHECK ((legal_cleared_at IS NULL) = (legal_ref IS NULL))
);
-- Anahtar başına (taş, kaynak, alan, dil) tek güncel sürüm.
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_records_current_uidx ON public.stone_library_records (stone_id, source_id, field_key, lang)
  WHERE is_current AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stone_library_records_stone_idx ON public.stone_library_records (stone_id);
CREATE INDEX IF NOT EXISTS stone_library_records_batch_idx ON public.stone_library_records (batch_id) WHERE batch_id IS NOT NULL;

-- ─── 9) Yapısal değerler (facet) ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_facets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id          uuid        NOT NULL REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  source_id         uuid        NOT NULL REFERENCES public.stone_library_sources(id) ON DELETE RESTRICT,
  facet             text        NOT NULL CHECK (facet IN ('chakra','zodiac','element','color','planet','keyword','birth_month',
                                  'hardness','numerical_vibration','pairing')),
  lang              text        CHECK (lang IS NULL OR lang IN ('tr','en')),
  value_key         text        NOT NULL CHECK (char_length(value_key) BETWEEN 1 AND 120),
  value_text        text        CHECK (value_text IS NULL OR char_length(btrim(value_text)) BETWEEN 1 AND 200),
  value_num         numeric(6,2),
  pair_stone_id     uuid        REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  pair_external_id  text        CHECK (pair_external_id IS NULL OR pair_external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  batch_id          uuid        REFERENCES public.stone_library_import_batches(id) ON DELETE RESTRICT,
  raw_id            uuid        REFERENCES public.stone_library_raw(id) ON DELETE RESTRICT,
  review_state      text        NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','approved','rejected')),
  visibility        text        NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden')),
  health_sensitive  boolean     NOT NULL DEFAULT false,
  legal_cleared_at  timestamptz,
  legal_cleared_by  uuid,
  legal_ref         text        CHECK (legal_ref IS NULL OR char_length(legal_ref) <= 500),
  reviewed_at       timestamptz,
  reviewed_by       uuid,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  deleted_by        uuid,
  delete_op_id      uuid,
  CONSTRAINT stone_library_facets_legal_chk CHECK ((legal_cleared_at IS NULL) = (legal_ref IS NULL)),
  CONSTRAINT stone_library_facets_shape_chk CHECK (
    CASE facet
      WHEN 'keyword' THEN lang IS NOT NULL AND value_text IS NOT NULL AND value_key ~ '^[a-z0-9 ]{1,120}$'
      WHEN 'birth_month' THEN value_num BETWEEN 1 AND 12 AND value_num = trunc(value_num)
      WHEN 'hardness' THEN value_num BETWEEN 0 AND 10
      WHEN 'numerical_vibration' THEN value_num IS NOT NULL
      WHEN 'pairing' THEN (pair_stone_id IS NOT NULL OR pair_external_id IS NOT NULL)
      ELSE value_key ~ '^[a-z0-9_]{1,60}$'
    END),
  CONSTRAINT stone_library_facets_self_pair_chk CHECK (pair_stone_id IS NULL OR pair_stone_id <> stone_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_facets_uidx ON public.stone_library_facets (stone_id, source_id, facet, coalesce(lang,'-'), value_key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stone_library_facets_stone_idx ON public.stone_library_facets (stone_id);
CREATE INDEX IF NOT EXISTS stone_library_facets_pair_ext_idx ON public.stone_library_facets (source_id, pair_external_id) WHERE pair_external_id IS NOT NULL;

-- ─── 10) İnceleme / sürüm geçmişi / silme işlemleri ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_reviews (
  id          bigserial   PRIMARY KEY,
  entity      text        NOT NULL CHECK (entity IN ('settings','source','document','stone','name','external_id','record','facet','batch','grant')),
  entity_id   uuid,
  action      text        NOT NULL CHECK (action ~ '^[a-z_]{2,40}$'),
  note        text        CHECK (note IS NULL OR char_length(note) <= 2000),
  actor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stone_library_reviews_entity_idx ON public.stone_library_reviews (entity, entity_id, id);

CREATE TABLE IF NOT EXISTS public.stone_library_history (
  id          bigserial   PRIMARY KEY,
  table_name  text        NOT NULL,
  row_id      text        NOT NULL,
  op          text        NOT NULL CHECK (op IN ('UPDATE')),
  old_row     jsonb       NOT NULL,
  new_row     jsonb       NOT NULL,
  actor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stone_library_history_row_idx ON public.stone_library_history (table_name, row_id, id);

CREATE TABLE IF NOT EXISTS public.stone_library_delete_ops (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity       text        NOT NULL CHECK (entity IN ('source','document','stone','name','external_id','record','facet','batch')),
  entity_id    uuid        NOT NULL,
  reason       text        CHECK (reason IS NULL OR char_length(reason) <= 1000),
  affected     jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(affected) = 'array'),
  actor        uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  restored_at  timestamptz,
  restored_by  uuid
);

-- ─── 11) Uzman erişim yetkileri (varsayılan: HİÇ KİMSE) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_access_grants (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_tenant_id  uuid        NOT NULL,
  granted_by         uuid        NOT NULL,
  granted_at         timestamptz NOT NULL DEFAULT now(),
  revoked_by         uuid,
  revoked_at         timestamptz,
  revoke_reason      text        CHECK (revoke_reason IS NULL OR revoke_reason IN ('owner_revoked','role_changed','tenant_changed','other')),
  note               text        CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT stone_library_grant_revoke_chk CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT stone_library_grant_self_chk CHECK (user_id <> granted_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS stone_library_grants_one_active_uidx ON public.stone_library_access_grants (user_id) WHERE revoked_at IS NULL;

-- ─── 12) Yayın yüzeyi (uzmana giden TEK veri) ───────────────────────────────────────────────────
-- İçerik YALNIZ stone_library_refresh_stone() ile yazılır; yalnız yayımlanmış + onaylı + görünür +
-- (sağlık kilidi açık ve hukuk onaylı) içerikten üretilir. Gerçek kaynak adı / lisans / ham veri /
-- iç kimlik (uuid) İÇERMEZ; kaynak etiketi görünürlük kararına göre burada çözülmüştür.
CREATE TABLE IF NOT EXISTS public.stone_library_published (
  stone_id       uuid        PRIMARY KEY REFERENCES public.stone_library_stones(id) ON DELETE RESTRICT,
  slug           text        NOT NULL UNIQUE,
  name_tr        text        NOT NULL,
  name_en        text,
  sort_key       text        NOT NULL,
  names_fold     text        NOT NULL,
  names_compact  text        NOT NULL,
  doc            jsonb       NOT NULL,
  search_tsv     tsvector    NOT NULL,
  chakra         text[]      NOT NULL DEFAULT '{}',
  zodiac         text[]      NOT NULL DEFAULT '{}',
  element        text[]      NOT NULL DEFAULT '{}',
  color          text[]      NOT NULL DEFAULT '{}',
  planet         text[]      NOT NULL DEFAULT '{}',
  keyword        text[]      NOT NULL DEFAULT '{}',
  pairing        text[]      NOT NULL DEFAULT '{}',
  birth_month    integer[]   NOT NULL DEFAULT '{}',
  hardness_min   numeric(6,2),
  hardness_max   numeric(6,2),
  -- Katkı veren kaynakların en erken lisans bitişi: geçince satır okunmadan ÖNCE yeniden üretilir (uzman RPC'leri).
  expires_at     timestamptz,
  refreshed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stone_library_published_tsv_idx ON public.stone_library_published USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS stone_library_published_facets_idx ON public.stone_library_published USING gin (chakra, zodiac, element, color, planet, keyword, pairing);

-- ─── 13) Değiştirilemezlik / geçmiş tetikleyicileri ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '%: değiştirilemez / silinemez kayıt (append-only)', TG_TABLE_NAME USING ERRCODE = 'SL010';
END $$;

-- İçerik tablolarında fiziksel DELETE yok (silme = geri alınabilir yumuşak silme).
CREATE OR REPLACE FUNCTION public.stone_library_no_hard_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '%: fiziksel silme / boşaltma yok; stone_library_delete kullanın', TG_TABLE_NAME USING ERRCODE = 'SL011';
END $$;

-- Satır sürüm geçmişi: her UPDATE'in öncesi/sonrası saklanır (owner değişikliğinde eski hâl kaybolmaz).
CREATE OR REPLACE FUNCTION public.stone_library_capture_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    INSERT INTO public.stone_library_history (table_name, row_id, op, old_row, new_row, actor)
    VALUES (TG_TABLE_NAME, (to_jsonb(OLD) ->> 'id'), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
            nullif(current_setting('stone_library.actor', true), '')::uuid);
  END IF;
  RETURN NEW;
END $$;

-- Kaynak metni değiştirilemez: içerik ve kimlik kolonları sabit; yalnız durum kolonları değişebilir.
CREATE OR REPLACE FUNCTION public.stone_library_record_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.health_sensitive AND NOT NEW.health_sensitive THEN
    RAISE EXCEPTION 'stone_library_records: sağlık hassasiyeti kaldırılamaz' USING ERRCODE = 'SL012';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['is_current','review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref',
                            'reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['is_current','review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref',
                            'reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id']) THEN
    RAISE EXCEPTION 'stone_library_records: içerik değiştirilemez; yeni sürüm ekleyin' USING ERRCODE = 'SL012';
  END IF;
  RETURN NEW;
END $$;

-- Ham veri / harici kimlik / facet değer kolonları da sabit.
CREATE OR REPLACE FUNCTION public.stone_library_facet_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.health_sensitive AND NOT NEW.health_sensitive THEN
    RAISE EXCEPTION 'stone_library_facets: sağlık hassasiyeti kaldırılamaz' USING ERRCODE = 'SL012';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref','reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['review_state','visibility','health_sensitive','legal_cleared_at','legal_cleared_by','legal_ref','reviewed_at','reviewed_by','deleted_at','deleted_by','delete_op_id']) THEN
    RAISE EXCEPTION 'stone_library_facets: değer değiştirilemez; yenisini ekleyin' USING ERRCODE = 'SL012';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_grant_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'stone_library_access_grants: iptal edilmiş yetki değiştirilemez' USING ERRCODE = 'SL013';
  END IF;
  IF NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by','revoke_reason']) <> (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by','revoke_reason']) THEN
    RAISE EXCEPTION 'stone_library_access_grants: yalnız iptal edilebilir' USING ERRCODE = 'SL013';
  END IF;
  RETURN NEW;
END $$;

-- Yayın tablosuna yalnız yenileme fonksiyonu yazar.
CREATE OR REPLACE FUNCTION public.stone_library_published_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF coalesce(current_setting('stone_library.refresh', true), '') <> 'on' THEN
    RAISE EXCEPTION 'stone_library_published: yalnız stone_library_refresh_stone yazar' USING ERRCODE = 'SL014';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  -- append-only
  FOREACH t IN ARRAY ARRAY['stone_library_raw','stone_library_import_events','stone_library_reviews','stone_library_history'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_append_only ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_append_only BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_append_only()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_truncate ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.stone_library_append_only()', t, t);
  END LOOP;
  -- fiziksel silme yok + sürüm geçmişi
  FOREACH t IN ARRAY ARRAY['stone_library_sources','stone_library_source_documents','stone_library_stones','stone_library_names',
                           'stone_library_external_ids','stone_library_records','stone_library_facets','stone_library_import_batches',
                           'stone_library_settings','stone_library_delete_ops','stone_library_access_grants'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_delete ON public.%I', t, t);
    IF t <> 'stone_library_access_grants' THEN  -- yetki satırı yalnız users CASCADE ile silinir
      EXECUTE format('CREATE TRIGGER trg_%s_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_no_hard_delete()', t, t);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_truncate ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.stone_library_no_hard_delete()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_history ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_history AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_capture_history()', t, t);
  END LOOP;
END $$;

-- SHA-256 sunucuda hesaplanır (istemci değeri yok sayılır).
CREATE OR REPLACE FUNCTION public.stone_library_set_sha() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'stone_library_records' THEN
    NEW.content_sha256 := encode(sha256(convert_to(NEW.content, 'UTF8')), 'hex');
  ELSE
    NEW.payload_sha256 := encode(sha256(convert_to(NEW.payload::text, 'UTF8')), 'hex');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_records_sha ON public.stone_library_records;
CREATE TRIGGER trg_stone_library_records_sha BEFORE INSERT ON public.stone_library_records
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_set_sha();
DROP TRIGGER IF EXISTS trg_stone_library_raw_sha ON public.stone_library_raw;
CREATE TRIGGER trg_stone_library_raw_sha BEFORE INSERT ON public.stone_library_raw
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_set_sha();

DROP TRIGGER IF EXISTS trg_stone_library_records_guard ON public.stone_library_records;
CREATE TRIGGER trg_stone_library_records_guard BEFORE UPDATE ON public.stone_library_records
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_record_guard();
DROP TRIGGER IF EXISTS trg_stone_library_facets_guard ON public.stone_library_facets;
CREATE TRIGGER trg_stone_library_facets_guard BEFORE UPDATE ON public.stone_library_facets
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_facet_guard();
DROP TRIGGER IF EXISTS trg_stone_library_grants_guard ON public.stone_library_access_grants;
CREATE TRIGGER trg_stone_library_grants_guard BEFORE UPDATE ON public.stone_library_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_grant_guard();
DROP TRIGGER IF EXISTS trg_stone_library_published_guard ON public.stone_library_published;
CREATE TRIGGER trg_stone_library_published_guard BEFORE INSERT OR UPDATE OR DELETE ON public.stone_library_published
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_published_guard();
DROP TRIGGER IF EXISTS trg_stone_library_published_no_truncate ON public.stone_library_published;
CREATE TRIGGER trg_stone_library_published_no_truncate BEFORE TRUNCATE ON public.stone_library_published
  FOR EACH STATEMENT EXECUTE FUNCTION public.stone_library_no_hard_delete();
DROP TRIGGER IF EXISTS trg_stone_library_vocab_no_truncate ON public.stone_library_vocab;
CREATE TRIGGER trg_stone_library_vocab_no_truncate BEFORE TRUNCATE ON public.stone_library_vocab
  FOR EACH STATEMENT EXECUTE FUNCTION public.stone_library_no_hard_delete();

-- ─── 14) Yayın belgesi üretimi ──────────────────────────────────────────────────────────────────
-- Kaynak etiketi: real → gerçek ad · alias → owner adı · hidden → YOK. (Zorunlu atıf CHECK ile korunur.)
CREATE OR REPLACE FUNCTION public.stone_library_source_label(s public.stone_library_sources) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE s.display_mode WHEN 'real' THEN s.real_name WHEN 'alias' THEN s.display_alias ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.stone_library_field_rank(p text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_position(ARRAY['description','meaning_spiritual','meaning_emotional','meaning_physical','affirmation','general',
                              'usage','meditation','care','cleansing','warning','history','other']::text[], p)
$$;

CREATE OR REPLACE FUNCTION public.stone_library_refresh_stone(p_stone uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  st public.stone_library_stones%ROWTYPE;
  cfg public.stone_library_settings%ROWTYPE;
  v_names text[]; v_aliases jsonb; v_sections jsonb; v_facets jsonb; v_pairings jsonb;
  v_text_a text; v_text_b text; v_text_c text; v_text_d text;
  v_hmin numeric; v_hmax numeric; v_exp timestamptz;
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

  v_text_a := concat_ws(' ', st.name_tr, st.name_en, array_to_string(v_names, ' '));
  v_text_b := (SELECT string_agg(concat_ws(' ', g.value_text, v.label_tr, v.label_en), ' ')
                 FROM pg_temp._sl_fac g LEFT JOIN public.stone_library_vocab v ON v.facet = g.facet AND v.value_key = g.value_key
                WHERE g.facet IN ('keyword','chakra','zodiac','element','color','planet'));
  v_text_c := (SELECT string_agg(content, ' ') FROM pg_temp._sl_vis WHERE field_key = 'description');
  v_text_d := (SELECT string_agg(content, ' ') FROM pg_temp._sl_vis WHERE field_key <> 'description');

  INSERT INTO public.stone_library_published (
    stone_id, slug, name_tr, name_en, sort_key, names_fold, names_compact, doc, search_tsv,
    chakra, zodiac, element, color, planet, keyword, pairing, birth_month, hardness_min, hardness_max, expires_at, refreshed_at)
  VALUES (
    st.id, st.slug, st.name_tr, st.name_en, public.stone_library_fold(st.name_tr),
    public.stone_library_fold(v_text_a), replace(public.stone_library_fold(v_text_a), ' ', ''),
    jsonb_build_object(
      'slug', st.slug, 'name_tr', st.name_tr, 'name_en', st.name_en, 'aliases', v_aliases,
      'facets', v_facets,
      'hardness', CASE WHEN v_hmin IS NULL THEN NULL ELSE jsonb_build_object('min', v_hmin, 'max', v_hmax) END,
      'pairings', v_pairings, 'sections', v_sections,
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
    v_hmin, v_hmax, v_exp, now());
  PERFORM set_config('stone_library.refresh', 'off', true);
END $$;

-- Etkilenen kartları yenile: kartın kendisi + onu eşleştirme olarak gösteren kartlar.
CREATE OR REPLACE FUNCTION public.stone_library_refresh_with_dependents(p_stone uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r record;
BEGIN
  PERFORM public.stone_library_refresh_stone(p_stone);
  FOR r IN
    SELECT DISTINCT f.stone_id FROM public.stone_library_facets f
     WHERE f.facet = 'pairing' AND f.stone_id <> p_stone AND (
           f.pair_stone_id = p_stone OR EXISTS (
             SELECT 1 FROM public.stone_library_external_ids e
              WHERE e.stone_id = p_stone AND e.source_id = f.source_id AND e.external_id = f.pair_external_id))
  LOOP
    PERFORM public.stone_library_refresh_stone(r.stone_id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_refresh_all() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.stone_library_stones LOOP
    PERFORM public.stone_library_refresh_stone(r.id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Toplu işlemler (silme / geri alma / paket geri alma) yenilemeyi işlem sonuna erteler: satır başına değil taş başına 1 kez.
CREATE OR REPLACE FUNCTION public.stone_library_defer_begin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_dirty (stone_id uuid PRIMARY KEY, deps boolean NOT NULL) ON COMMIT DROP;
  PERFORM set_config('stone_library.defer', 'on', true);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_mark_dirty(p_stone uuid, p_deps boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO pg_temp._sl_dirty AS d (stone_id, deps) VALUES (p_stone, p_deps)
  ON CONFLICT (stone_id) DO UPDATE SET deps = d.deps OR EXCLUDED.deps;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_defer_flush() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r record; n integer := 0;
BEGIN
  PERFORM set_config('stone_library.defer', 'off', true);
  IF to_regclass('pg_temp._sl_dirty') IS NULL THEN RETURN 0; END IF;
  FOR r IN SELECT stone_id, deps FROM pg_temp._sl_dirty LOOP
    IF r.deps THEN PERFORM public.stone_library_refresh_with_dependents(r.stone_id);
    ELSE PERFORM public.stone_library_refresh_stone(r.stone_id); END IF;
    n := n + 1;
  END LOOP;
  TRUNCATE pg_temp._sl_dirty;
  RETURN n;
END $$;

-- Süresi dolan lisanslı içerik: uzman okumasından ÖNCE yeniden üretilir (zamanlayıcı gerekmez).
CREATE OR REPLACE FUNCTION public.stone_library_refresh_expired() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT stone_id FROM public.stone_library_published WHERE expires_at IS NOT NULL AND expires_at <= now() LOOP
    PERFORM public.stone_library_refresh_stone(r.stone_id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Değişiklikte otomatik yenileme (yayın yüzeyi her zaman taban tablolarla tutarlı).
CREATE OR REPLACE FUNCTION public.stone_library_after_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_stone uuid; r record; v_defer boolean := coalesce(current_setting('stone_library.defer', true), '') = 'on';
BEGIN
  IF v_defer THEN
    IF TG_TABLE_NAME = 'stone_library_stones' THEN PERFORM public.stone_library_mark_dirty(NEW.id, true);
    ELSIF TG_TABLE_NAME IN ('stone_library_names','stone_library_records','stone_library_facets','stone_library_external_ids') THEN
      PERFORM public.stone_library_mark_dirty(NEW.stone_id, true);
    ELSIF TG_TABLE_NAME = 'stone_library_sources' THEN
      PERFORM public.stone_library_mark_dirty(q.stone_id, false) FROM (
        SELECT stone_id FROM public.stone_library_records WHERE source_id = NEW.id
        UNION SELECT stone_id FROM public.stone_library_facets WHERE source_id = NEW.id
        UNION SELECT stone_id FROM public.stone_library_names WHERE source_id = NEW.id) q;
    ELSE
      PERFORM public.stone_library_mark_dirty(x.id, false) FROM public.stone_library_stones x;
    END IF;
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'stone_library_stones' THEN
    PERFORM public.stone_library_refresh_with_dependents(NEW.id);
  ELSIF TG_TABLE_NAME IN ('stone_library_names','stone_library_records','stone_library_facets','stone_library_external_ids') THEN
    v_stone := NEW.stone_id;
    PERFORM public.stone_library_refresh_with_dependents(v_stone);
    IF TG_OP = 'UPDATE' AND OLD.stone_id IS DISTINCT FROM NEW.stone_id THEN
      PERFORM public.stone_library_refresh_with_dependents(OLD.stone_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'stone_library_sources' THEN
    FOR r IN SELECT DISTINCT stone_id FROM (
               SELECT stone_id FROM public.stone_library_records WHERE source_id = NEW.id
               UNION SELECT stone_id FROM public.stone_library_facets WHERE source_id = NEW.id
               UNION SELECT stone_id FROM public.stone_library_names WHERE source_id = NEW.id) q LOOP
      PERFORM public.stone_library_refresh_stone(r.stone_id);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'stone_library_settings' THEN
    PERFORM public.stone_library_refresh_all();
  END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stone_library_stones','stone_library_names','stone_library_records','stone_library_facets',
                           'stone_library_external_ids','stone_library_sources','stone_library_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_refresh ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_refresh AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stone_library_after_change()', t, t);
  END LOOP;
END $$;

-- ─── 15) Owner RPC'leri — kaynak / taş / ad / harici kimlik ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_review_log(p_entity text, p_id uuid, p_action text, p_note text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO public.stone_library_reviews (entity, entity_id, action, note, actor)
  VALUES (p_entity, p_id, p_action, nullif(btrim(coalesce(p_note,'')), ''), nullif(current_setting('stone_library.actor', true), '')::uuid)
$$;

-- Kaynak oluştur / güncelle. Yeni kaynağın görünürlüğü daima 'hidden' başlar (Roxy dahil).
CREATE OR REPLACE FUNCTION public.stone_library_source_save(p_actor uuid, p_source_id uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid; v_row public.stone_library_sources%ROWTYPE; v_allowed text[] := ARRAY['source_key','kind','real_name','provider_code',
  'display_mode','display_alias','attribution_required','attribution_text','license_type','license_ref','license_terms_url',
  'license_terms_sha256','license_accepted_at','license_valid_until','commercial_use_ok','image_rights','status','notes','expected_version'];
  k text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'stone_library_source_save: veri gerekli' USING ERRCODE = 'SL020'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (v_allowed)) THEN RAISE EXCEPTION 'stone_library_source_save: bilinmeyen alan %', k USING ERRCODE = 'SL020'; END IF;
  END LOOP;
  IF p_source_id IS NULL THEN
    IF p_data ? 'display_mode' AND p_data ->> 'display_mode' <> 'hidden' THEN
      RAISE EXCEPTION 'stone_library_source_save: yeni kaynak gizli başlar; görünürlük ayrıca belirlenir' USING ERRCODE = 'SL021';
    END IF;
    INSERT INTO public.stone_library_sources (source_key, kind, real_name, provider_code, license_type, license_ref, license_terms_url,
      license_terms_sha256, license_accepted_at, license_valid_until, commercial_use_ok, image_rights, notes, created_by)
    VALUES (p_data ->> 'source_key', p_data ->> 'kind', p_data ->> 'real_name', p_data ->> 'provider_code', p_data ->> 'license_type',
      p_data ->> 'license_ref', p_data ->> 'license_terms_url', p_data ->> 'license_terms_sha256',
      (p_data ->> 'license_accepted_at')::timestamptz, (p_data ->> 'license_valid_until')::timestamptz,
      coalesce((p_data ->> 'commercial_use_ok')::boolean, false), coalesce(p_data ->> 'image_rights', 'none'), p_data ->> 'notes', p_actor)
    RETURNING id INTO v_id;
    PERFORM public.stone_library_review_log('source', v_id, 'create', NULL);
    RETURN v_id;
  END IF;
  SELECT * INTO v_row FROM public.stone_library_sources WHERE id = p_source_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_source_save: kaynak yok' USING ERRCODE = 'SL022'; END IF;
  IF p_data ? 'expected_version' AND (p_data ->> 'expected_version')::int <> v_row.row_version THEN
    RAISE EXCEPTION 'stone_library_source_save: sürüm çakışması' USING ERRCODE = 'SL023';
  END IF;
  UPDATE public.stone_library_sources SET
    source_key = coalesce(p_data ->> 'source_key', source_key),
    kind = coalesce(p_data ->> 'kind', kind),
    real_name = coalesce(p_data ->> 'real_name', real_name),
    provider_code = CASE WHEN p_data ? 'provider_code' THEN p_data ->> 'provider_code' ELSE provider_code END,
    display_mode = coalesce(p_data ->> 'display_mode', display_mode),
    display_alias = CASE WHEN p_data ? 'display_alias' THEN p_data ->> 'display_alias' ELSE display_alias END,
    attribution_required = coalesce((p_data ->> 'attribution_required')::boolean, attribution_required),
    attribution_text = CASE WHEN p_data ? 'attribution_text' THEN p_data ->> 'attribution_text' ELSE attribution_text END,
    license_type = CASE WHEN p_data ? 'license_type' THEN p_data ->> 'license_type' ELSE license_type END,
    license_ref = CASE WHEN p_data ? 'license_ref' THEN p_data ->> 'license_ref' ELSE license_ref END,
    license_terms_url = CASE WHEN p_data ? 'license_terms_url' THEN p_data ->> 'license_terms_url' ELSE license_terms_url END,
    license_terms_sha256 = CASE WHEN p_data ? 'license_terms_sha256' THEN p_data ->> 'license_terms_sha256' ELSE license_terms_sha256 END,
    license_accepted_at = CASE WHEN p_data ? 'license_accepted_at' THEN (p_data ->> 'license_accepted_at')::timestamptz ELSE license_accepted_at END,
    license_valid_until = CASE WHEN p_data ? 'license_valid_until' THEN (p_data ->> 'license_valid_until')::timestamptz ELSE license_valid_until END,
    commercial_use_ok = coalesce((p_data ->> 'commercial_use_ok')::boolean, commercial_use_ok),
    image_rights = coalesce(p_data ->> 'image_rights', image_rights),
    status = coalesce(p_data ->> 'status', status),
    notes = CASE WHEN p_data ? 'notes' THEN p_data ->> 'notes' ELSE notes END,
    row_version = row_version + 1, updated_at = now()
  WHERE id = p_source_id;
  PERFORM public.stone_library_review_log('source', p_source_id, 'edit', NULL);
  RETURN p_source_id;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_document_add(p_actor uuid, p_source_id uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_sources WHERE id = p_source_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_document_add: kaynak yok' USING ERRCODE = 'SL022';
  END IF;
  INSERT INTO public.stone_library_source_documents (source_id, doc_kind, title, url, content_sha256, captured_at, note, created_by)
  VALUES (p_source_id, p_data ->> 'doc_kind', p_data ->> 'title', p_data ->> 'url', p_data ->> 'content_sha256',
          coalesce((p_data ->> 'captured_at')::timestamptz, now()), p_data ->> 'note', p_actor)
  RETURNING id INTO v_id;
  PERFORM public.stone_library_review_log('document', v_id, 'create', NULL);
  RETURN v_id;
END $$;

-- Taş oluştur / güncelle (ad, slug). Güncellemede eski hâl stone_library_history'de kalır.
CREATE OR REPLACE FUNCTION public.stone_library_stone_save(p_actor uuid, p_stone_id uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid; v_row public.stone_library_stones%ROWTYPE; k text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'stone_library_stone_save: veri gerekli' USING ERRCODE = 'SL020'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['slug','name_tr','name_en','expected_version'])) THEN
      RAISE EXCEPTION 'stone_library_stone_save: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  IF p_stone_id IS NULL THEN
    PERFORM public.stone_library_assert_name_free(public.stone_library_fold(p_data ->> 'name_tr'), NULL);
    IF p_data ->> 'name_en' IS NOT NULL THEN PERFORM public.stone_library_assert_name_free(public.stone_library_fold(p_data ->> 'name_en'), NULL); END IF;
    INSERT INTO public.stone_library_stones (slug, name_tr, name_en, created_by)
    VALUES (p_data ->> 'slug', p_data ->> 'name_tr', p_data ->> 'name_en', p_actor) RETURNING id INTO v_id;
    PERFORM public.stone_library_review_log('stone', v_id, 'create', NULL);
    RETURN v_id;
  END IF;
  SELECT * INTO v_row FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_stone_save: taş yok' USING ERRCODE = 'SL024'; END IF;
  IF p_data ? 'expected_version' AND (p_data ->> 'expected_version')::int <> v_row.row_version THEN
    RAISE EXCEPTION 'stone_library_stone_save: sürüm çakışması' USING ERRCODE = 'SL023';
  END IF;
  IF p_data ? 'slug' AND p_data ->> 'slug' IS DISTINCT FROM v_row.slug AND v_row.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'stone_library_stone_save: yayına çıkmış taşın bağlantısı (slug) değiştirilemez' USING ERRCODE = 'SL029';
  END IF;
  IF p_data ? 'name_tr' THEN PERFORM public.stone_library_assert_name_free(public.stone_library_fold(p_data ->> 'name_tr'), p_stone_id); END IF;
  IF p_data ? 'name_en' AND p_data ->> 'name_en' IS NOT NULL THEN
    PERFORM public.stone_library_assert_name_free(public.stone_library_fold(p_data ->> 'name_en'), p_stone_id);
  END IF;
  UPDATE public.stone_library_stones SET
    slug = coalesce(p_data ->> 'slug', slug),
    name_tr = coalesce(p_data ->> 'name_tr', name_tr),
    name_en = CASE WHEN p_data ? 'name_en' THEN p_data ->> 'name_en' ELSE name_en END,
    row_version = row_version + 1, updated_at = now()
  WHERE id = p_stone_id;
  PERFORM public.stone_library_review_log('stone', p_stone_id, 'edit', NULL);
  RETURN p_stone_id;
END $$;

-- Ad çakışması: bir ad (TR/EN/alternatif) yalnız tek karta ait olabilir.
CREATE OR REPLACE FUNCTION public.stone_library_assert_name_free(p_key text, p_owner_stone uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF coalesce(p_key, '') = '' THEN RAISE EXCEPTION 'stone_library: ad boş olamaz' USING ERRCODE = 'SL025'; END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones s WHERE s.deleted_at IS NULL AND s.id IS DISTINCT FROM p_owner_stone
               AND (public.stone_library_fold(s.name_tr) = p_key OR public.stone_library_fold(s.name_en) = p_key))
     OR EXISTS (SELECT 1 FROM public.stone_library_names n WHERE n.deleted_at IS NULL AND n.name_key = p_key
               AND n.stone_id IS DISTINCT FROM p_owner_stone) THEN
    RAISE EXCEPTION 'stone_library: ad başka bir kartta kullanılıyor' USING ERRCODE = 'SL026';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_stone_set_status(p_actor uuid, p_stone_id uuid, p_status text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_row public.stone_library_stones%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_status NOT IN ('draft','published','hidden') THEN RAISE EXCEPTION 'stone_library_stone_set_status: geçersiz durum' USING ERRCODE = 'SL027'; END IF;
  SELECT * INTO v_row FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_stone_set_status: taş yok' USING ERRCODE = 'SL024'; END IF;
  UPDATE public.stone_library_stones SET status = p_status,
    published_at = CASE WHEN p_status = 'published' THEN now() ELSE published_at END,
    published_by = CASE WHEN p_status = 'published' THEN p_actor ELSE published_by END,
    row_version = row_version + 1, updated_at = now()
  WHERE id = p_stone_id;
  PERFORM public.stone_library_review_log('stone', p_stone_id, CASE p_status WHEN 'published' THEN 'publish' WHEN 'hidden' THEN 'hide' ELSE 'unpublish' END, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_name_add(p_actor uuid, p_stone_id uuid, p_lang text, p_name text, p_kind text DEFAULT 'alias',
  p_source_id uuid DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_name_add: taş yok' USING ERRCODE = 'SL024';
  END IF;
  IF p_batch_id IS NOT NULL THEN PERFORM public.stone_library_assert_batch_writable(p_batch_id, p_source_id); END IF;
  PERFORM public.stone_library_assert_name_free(public.stone_library_fold(p_name), p_stone_id);
  -- Aynı kartta aynı ad zaten varsa yeniden eklenmez (idempotent).
  SELECT id INTO v_id FROM public.stone_library_names WHERE stone_id = p_stone_id AND name_key = public.stone_library_fold(p_name) AND deleted_at IS NULL;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF public.stone_library_fold(p_name) IN (SELECT public.stone_library_fold(x) FROM public.stone_library_stones s,
        LATERAL unnest(ARRAY[s.name_tr, s.name_en]) x WHERE s.id = p_stone_id AND x IS NOT NULL) THEN
    RETURN NULL;  -- kartın kendi TR/EN adı; ayrıca saklanmaz
  END IF;
  INSERT INTO public.stone_library_names (stone_id, lang, name, kind, source_id, batch_id, review_state, created_by)
  VALUES (p_stone_id, p_lang, btrim(p_name), p_kind, p_source_id, p_batch_id, CASE WHEN p_batch_id IS NULL THEN 'approved' ELSE 'pending' END, p_actor)
  RETURNING id INTO v_id;
  PERFORM public.stone_library_review_log('name', v_id, 'create', NULL);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_external_id_link(p_actor uuid, p_source_id uuid, p_external_id text, p_stone_id uuid,
  p_batch_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid; v_cur uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_external_id_link: taş yok' USING ERRCODE = 'SL024';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_sources WHERE id = p_source_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_external_id_link: kaynak yok' USING ERRCODE = 'SL022';
  END IF;
  IF p_batch_id IS NOT NULL THEN PERFORM public.stone_library_assert_batch_writable(p_batch_id, p_source_id); END IF;
  SELECT id, stone_id INTO v_id, v_cur FROM public.stone_library_external_ids
   WHERE source_id = p_source_id AND external_id = p_external_id AND deleted_at IS NULL;
  IF v_id IS NOT NULL THEN
    IF v_cur <> p_stone_id THEN
      RAISE EXCEPTION 'stone_library_external_id_link: kimlik başka karta bağlı; önce bağlantıyı silin' USING ERRCODE = 'SL028';
    END IF;
    RETURN v_id;
  END IF;
  INSERT INTO public.stone_library_external_ids (source_id, external_id, stone_id, batch_id, created_by)
  VALUES (p_source_id, p_external_id, p_stone_id, p_batch_id, p_actor) RETURNING id INTO v_id;
  -- Bu kimliği eşleştirme olarak gösteren kartlar yenilenir.
  PERFORM public.stone_library_refresh_stone(f.stone_id)
     FROM (SELECT DISTINCT stone_id FROM public.stone_library_facets
            WHERE source_id = p_source_id AND pair_external_id = p_external_id AND deleted_at IS NULL) f;
  PERFORM public.stone_library_review_log('external_id', v_id, 'create', NULL);
  RETURN v_id;
END $$;

-- ─── 16) Owner RPC'leri — sürümlü kayıt / facet / inceleme ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_assert_batch_writable(p_batch_id uuid, p_source_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b public.stone_library_import_batches%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.stone_library_import_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library: paket yok' USING ERRCODE = 'SL030'; END IF;
  IF b.dry_run THEN RAISE EXCEPTION 'stone_library: deneme paketine veri yazılamaz' USING ERRCODE = 'SL031'; END IF;
  IF b.status NOT IN ('running','stop_requested') THEN RAISE EXCEPTION 'stone_library: paket yazmaya açık değil (%)', b.status USING ERRCODE = 'SL032'; END IF;
  IF p_source_id IS NOT NULL AND b.source_id <> p_source_id THEN RAISE EXCEPTION 'stone_library: paket başka kaynağa ait' USING ERRCODE = 'SL033'; END IF;
END $$;

-- Yeni sürüm ekler. Aynı içerik (sha) güncel sürümle aynıysa yeni sürüm açılmaz (idempotent).
-- Kaynak sürümü: anahtarın güncel sürümü yoksa güncel olur; varsa owner onayıyla (set_current) değişir.
-- Owner düzenlemesi: daima yeni sürüm + güncel + onaylı (sağlık hassasiyeti ayrıca hukuk onayı ister).
CREATE OR REPLACE FUNCTION public.stone_library_record_add(p_actor uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_stone uuid := (p_data ->> 'stone_id')::uuid; v_source uuid := (p_data ->> 'source_id')::uuid;
  v_field text := p_data ->> 'field_key'; v_lang text := p_data ->> 'lang'; v_content text := p_data ->> 'content';
  v_origin text := coalesce(p_data ->> 'origin', 'source'); v_based uuid := (p_data ->> 'based_on_id')::uuid;
  v_batch uuid := (p_data ->> 'batch_id')::uuid; v_raw uuid := (p_data ->> 'raw_id')::uuid;
  v_cur public.stone_library_records%ROWTYPE; v_base public.stone_library_records%ROWTYPE; v_ver int; v_id uuid; v_src_kind text;
  k text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['stone_id','source_id','field_key','lang','content','origin','based_on_id','batch_id','raw_id','health_sensitive'])) THEN
      RAISE EXCEPTION 'stone_library_record_add: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = v_stone AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_record_add: taş yok' USING ERRCODE = 'SL024';
  END IF;
  SELECT kind INTO v_src_kind FROM public.stone_library_sources WHERE id = v_source AND deleted_at IS NULL;
  IF v_src_kind IS NULL THEN RAISE EXCEPTION 'stone_library_record_add: kaynak yok' USING ERRCODE = 'SL022'; END IF;
  IF v_origin = 'source' THEN
    IF v_src_kind = 'owner' THEN RAISE EXCEPTION 'stone_library_record_add: owner kaynağında origin owner_authored olmalı' USING ERRCODE = 'SL034'; END IF;
    IF v_batch IS NOT NULL THEN PERFORM public.stone_library_assert_batch_writable(v_batch, v_source); END IF;
    IF v_raw IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stone_library_raw WHERE id = v_raw AND source_id = v_source) THEN
      RAISE EXCEPTION 'stone_library_record_add: ham kayıt bu kaynağa ait değil' USING ERRCODE = 'SL035';
    END IF;
  ELSIF v_origin = 'owner_authored' THEN
    IF v_src_kind <> 'owner' THEN RAISE EXCEPTION 'stone_library_record_add: owner_authored yalnız owner kaynağında' USING ERRCODE = 'SL034'; END IF;
    IF v_batch IS NOT NULL OR v_raw IS NOT NULL THEN RAISE EXCEPTION 'stone_library_record_add: owner içeriği pakete bağlanmaz' USING ERRCODE = 'SL034'; END IF;
  ELSIF v_origin = 'owner_edit' THEN
    SELECT * INTO v_base FROM public.stone_library_records WHERE id = v_based AND deleted_at IS NULL;
    IF NOT FOUND OR v_base.stone_id <> v_stone OR v_base.source_id <> v_source OR v_base.field_key <> v_field OR v_base.lang <> v_lang THEN
      RAISE EXCEPTION 'stone_library_record_add: düzenleme tabanı aynı anahtarda olmalı' USING ERRCODE = 'SL036';
    END IF;
    IF v_batch IS NOT NULL OR v_raw IS NOT NULL THEN RAISE EXCEPTION 'stone_library_record_add: owner düzenlemesi pakete bağlanmaz' USING ERRCODE = 'SL034'; END IF;
  ELSE
    RAISE EXCEPTION 'stone_library_record_add: geçersiz origin' USING ERRCODE = 'SL034';
  END IF;

  PERFORM 1 FROM public.stone_library_stones WHERE id = v_stone FOR UPDATE;  -- aynı taşa eşzamanlı sürüm yarışını sıralar
  SELECT * INTO v_cur FROM public.stone_library_records
   WHERE stone_id = v_stone AND source_id = v_source AND field_key = v_field AND lang = v_lang AND is_current AND deleted_at IS NULL;
  IF FOUND AND v_cur.content_sha256 = encode(sha256(convert_to(v_content, 'UTF8')), 'hex') THEN
    RETURN v_cur.id;
  END IF;
  -- Aynı içerikli bekleyen (güncel olmayan) sürüm zaten varsa onu döndür.
  SELECT id INTO v_id FROM public.stone_library_records
   WHERE stone_id = v_stone AND source_id = v_source AND field_key = v_field AND lang = v_lang AND deleted_at IS NULL
     AND NOT is_current AND origin = v_origin AND content_sha256 = encode(sha256(convert_to(v_content, 'UTF8')), 'hex')
   ORDER BY version DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_ver FROM public.stone_library_records
   WHERE stone_id = v_stone AND source_id = v_source AND field_key = v_field AND lang = v_lang;

  IF v_origin IN ('owner_edit','owner_authored') AND v_cur.id IS NOT NULL THEN
    UPDATE public.stone_library_records SET is_current = false WHERE id = v_cur.id;
  END IF;
  INSERT INTO public.stone_library_records (stone_id, source_id, field_key, lang, version, origin, content, based_on_id, batch_id, raw_id,
    is_current, review_state, health_sensitive, reviewed_at, reviewed_by, created_by)
  VALUES (v_stone, v_source, v_field, v_lang, v_ver, v_origin, v_content, v_based, v_batch, v_raw,
    (v_cur.id IS NULL OR v_origin IN ('owner_edit','owner_authored')),
    CASE WHEN v_origin = 'source' THEN 'pending' ELSE 'approved' END,
    (v_field = 'meaning_physical' OR coalesce((p_data ->> 'health_sensitive')::boolean, false)
       OR (v_origin = 'owner_edit' AND v_base.health_sensitive)),
    CASE WHEN v_origin = 'source' THEN NULL ELSE now() END,
    CASE WHEN v_origin = 'source' THEN NULL ELSE p_actor END,
    p_actor)
  RETURNING id INTO v_id;
  PERFORM public.stone_library_review_log('record', v_id, CASE v_origin WHEN 'owner_edit' THEN 'edit' ELSE 'create' END, NULL);
  RETURN v_id;
END $$;

-- Bir sürümü anahtarın güncel sürümü yapar (eski sürüme dönüş dahil). Hiçbir sürüm silinmez.
CREATE OR REPLACE FUNCTION public.stone_library_record_set_current(p_actor uuid, p_record_id uuid, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r public.stone_library_records%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO r FROM public.stone_library_records WHERE id = p_record_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_record_set_current: kayıt yok' USING ERRCODE = 'SL040'; END IF;
  PERFORM 1 FROM public.stone_library_stones WHERE id = r.stone_id FOR UPDATE;
  IF r.is_current THEN RETURN; END IF;
  UPDATE public.stone_library_records SET is_current = false
   WHERE stone_id = r.stone_id AND source_id = r.source_id AND field_key = r.field_key AND lang = r.lang AND is_current AND deleted_at IS NULL;
  UPDATE public.stone_library_records SET is_current = true WHERE id = p_record_id;
  PERFORM public.stone_library_review_log('record', p_record_id, 'set_current', p_note);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_facet_add(p_actor uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_stone uuid := (p_data ->> 'stone_id')::uuid; v_source uuid := (p_data ->> 'source_id')::uuid;
  v_facet text := p_data ->> 'facet'; v_lang text := p_data ->> 'lang'; v_text text := nullif(btrim(coalesce(p_data ->> 'value_text','')), '');
  v_num numeric := (p_data ->> 'value_num')::numeric; v_pair uuid := (p_data ->> 'pair_stone_id')::uuid;
  v_pair_ext text := p_data ->> 'pair_external_id'; v_batch uuid := (p_data ->> 'batch_id')::uuid; v_raw uuid := (p_data ->> 'raw_id')::uuid;
  v_key text; v_id uuid; k text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['stone_id','source_id','facet','lang','value_key','value_text','value_num','pair_stone_id','pair_external_id','batch_id','raw_id','health_sensitive'])) THEN
      RAISE EXCEPTION 'stone_library_facet_add: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = v_stone AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_facet_add: taş yok' USING ERRCODE = 'SL024';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_sources WHERE id = v_source AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_facet_add: kaynak yok' USING ERRCODE = 'SL022';
  END IF;
  IF v_batch IS NOT NULL THEN PERFORM public.stone_library_assert_batch_writable(v_batch, v_source); END IF;
  v_key := CASE v_facet
    WHEN 'keyword' THEN public.stone_library_fold(v_text)
    WHEN 'birth_month' THEN (v_num::int)::text
    WHEN 'hardness' THEN trim_scale(v_num)::text
    WHEN 'numerical_vibration' THEN trim_scale(v_num)::text
    WHEN 'pairing' THEN coalesce(v_pair_ext, v_pair::text)
    ELSE lower(btrim(coalesce(p_data ->> 'value_key', ''))) END;
  IF v_facet IN ('chakra','zodiac','element','planet')
     AND NOT EXISTS (SELECT 1 FROM public.stone_library_vocab WHERE facet = v_facet AND value_key = v_key) THEN
    RAISE EXCEPTION 'stone_library_facet_add: sözlükte olmayan değer (%:%)', v_facet, v_key USING ERRCODE = 'SL041';
  END IF;
  IF v_facet = 'pairing' AND v_pair IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stone_library_stones WHERE id = v_pair AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_facet_add: eşleştirme hedefi yok' USING ERRCODE = 'SL024';
  END IF;
  SELECT id INTO v_id FROM public.stone_library_facets
   WHERE stone_id = v_stone AND source_id = v_source AND facet = v_facet AND coalesce(lang,'-') = coalesce(v_lang,'-') AND value_key = v_key AND deleted_at IS NULL;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.stone_library_facets (stone_id, source_id, facet, lang, value_key, value_text, value_num, pair_stone_id, pair_external_id,
    batch_id, raw_id, health_sensitive, review_state, reviewed_at, reviewed_by, created_by)
  VALUES (v_stone, v_source, v_facet, CASE WHEN v_facet = 'keyword' THEN v_lang END, v_key, v_text, v_num, v_pair, v_pair_ext, v_batch, v_raw,
    coalesce((p_data ->> 'health_sensitive')::boolean, false),
    CASE WHEN v_batch IS NULL THEN 'approved' ELSE 'pending' END,
    CASE WHEN v_batch IS NULL THEN now() END, CASE WHEN v_batch IS NULL THEN p_actor END, p_actor)
  RETURNING id INTO v_id;
  PERFORM public.stone_library_review_log('facet', v_id, 'create', NULL);
  RETURN v_id;
END $$;

-- İnceleme kararları: approve / reject / hide / show / legal_clear / legal_revoke (kayıt), approve / reject / hide / show (facet, ad).
CREATE OR REPLACE FUNCTION public.stone_library_review(p_actor uuid, p_entity text, p_id uuid, p_action text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n int;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_entity = 'record' THEN
    IF p_action = 'approve' THEN
      UPDATE public.stone_library_records SET review_state = 'approved', reviewed_at = now(), reviewed_by = p_actor WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action = 'reject' THEN
      UPDATE public.stone_library_records SET review_state = 'rejected', reviewed_at = now(), reviewed_by = p_actor WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action = 'hide' THEN
      UPDATE public.stone_library_records SET visibility = 'hidden' WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action = 'show' THEN
      UPDATE public.stone_library_records SET visibility = 'visible' WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action = 'legal_clear' THEN
      IF coalesce(btrim(p_note), '') = '' THEN RAISE EXCEPTION 'stone_library_review: hukuk onayı için referans (not) zorunlu' USING ERRCODE = 'SL042'; END IF;
      UPDATE public.stone_library_records SET legal_cleared_at = now(), legal_cleared_by = p_actor, legal_ref = btrim(p_note)
       WHERE id = p_id AND deleted_at IS NULL AND health_sensitive;
    ELSIF p_action = 'legal_revoke' THEN
      UPDATE public.stone_library_records SET legal_cleared_at = NULL, legal_cleared_by = NULL, legal_ref = NULL WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action = 'mark_health_sensitive' THEN
      UPDATE public.stone_library_records SET health_sensitive = true WHERE id = p_id AND deleted_at IS NULL;
    ELSE RAISE EXCEPTION 'stone_library_review: geçersiz işlem' USING ERRCODE = 'SL043'; END IF;
  ELSIF p_entity = 'facet' THEN
    IF p_action IN ('approve','reject') THEN
      UPDATE public.stone_library_facets SET review_state = CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
             reviewed_at = now(), reviewed_by = p_actor WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action IN ('hide','show') THEN
      UPDATE public.stone_library_facets SET visibility = CASE p_action WHEN 'hide' THEN 'hidden' ELSE 'visible' END WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action = 'mark_health_sensitive' THEN
      UPDATE public.stone_library_facets SET health_sensitive = true WHERE id = p_id AND deleted_at IS NULL;
    ELSIF p_action = 'legal_clear' THEN
      IF coalesce(btrim(p_note), '') = '' THEN RAISE EXCEPTION 'stone_library_review: hukuk onayı için referans (not) zorunlu' USING ERRCODE = 'SL042'; END IF;
      UPDATE public.stone_library_facets SET legal_cleared_at = now(), legal_cleared_by = p_actor, legal_ref = btrim(p_note)
       WHERE id = p_id AND deleted_at IS NULL AND health_sensitive;
    ELSIF p_action = 'legal_revoke' THEN
      UPDATE public.stone_library_facets SET legal_cleared_at = NULL, legal_cleared_by = NULL, legal_ref = NULL WHERE id = p_id AND deleted_at IS NULL;
    ELSE RAISE EXCEPTION 'stone_library_review: geçersiz işlem' USING ERRCODE = 'SL043'; END IF;
  ELSIF p_entity = 'name' THEN
    IF p_action IN ('approve','reject') THEN
      UPDATE public.stone_library_names SET review_state = CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END WHERE id = p_id AND deleted_at IS NULL;
    ELSE RAISE EXCEPTION 'stone_library_review: geçersiz işlem' USING ERRCODE = 'SL043'; END IF;
  ELSE
    RAISE EXCEPTION 'stone_library_review: geçersiz varlık' USING ERRCODE = 'SL043';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'stone_library_review: hedef yok veya işlem uygulanamaz' USING ERRCODE = 'SL044'; END IF;
  PERFORM public.stone_library_review_log(p_entity, p_id, p_action, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_settings_save(p_actor uuid, p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE k text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['health_content_publication_enabled','health_notice_tr','health_notice_en','legal_review_ref'])) THEN
      RAISE EXCEPTION 'stone_library_settings_save: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  UPDATE public.stone_library_settings SET
    health_content_publication_enabled = coalesce((p_data ->> 'health_content_publication_enabled')::boolean, health_content_publication_enabled),
    health_notice_tr = coalesce(p_data ->> 'health_notice_tr', health_notice_tr),
    health_notice_en = coalesce(p_data ->> 'health_notice_en', health_notice_en),
    legal_review_ref = CASE WHEN p_data ? 'legal_review_ref' THEN p_data ->> 'legal_review_ref' ELSE legal_review_ref END,
    updated_by = p_actor, updated_at = now()
  WHERE id;
  PERFORM public.stone_library_review_log('settings', NULL, 'edit', NULL);
END $$;

-- ─── 17) Geri alınabilir silme ─────────────────────────────────────────────────────────────────
-- Silinen her satır (ve güncel sürüm değişimi) işlem kaydına yazılır; stone_library_restore aynısını geri kurar.
CREATE OR REPLACE FUNCTION public.stone_library_soft_delete_rows(p_op uuid, p_actor uuid, p_table text, p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_out jsonb := '[]'::jsonb; r record; v_prev uuid;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RETURN v_out; END IF;
  IF p_table = 'stone_library_records' THEN
    FOR r IN SELECT * FROM public.stone_library_records WHERE id = ANY (p_ids) AND deleted_at IS NULL ORDER BY version DESC LOOP
      UPDATE public.stone_library_records SET deleted_at = now(), deleted_by = p_actor, delete_op_id = p_op, is_current = false WHERE id = r.id;
      v_out := v_out || jsonb_build_object('t', p_table, 'id', r.id, 'was_current', r.is_current);
      IF r.is_current THEN
        -- Güncel sürüm silinirse kalan en yeni ONAYLI sürüm güncel olur (bekleyen / reddedilen sürüm terfi etmez);
        -- veri kaybı yok, geri almada eski durum döner.
        SELECT id INTO v_prev FROM public.stone_library_records
         WHERE stone_id = r.stone_id AND source_id = r.source_id AND field_key = r.field_key AND lang = r.lang
           AND deleted_at IS NULL AND id <> r.id AND NOT (id = ANY (p_ids)) AND review_state = 'approved'
         ORDER BY version DESC LIMIT 1;
        IF v_prev IS NOT NULL THEN
          UPDATE public.stone_library_records SET is_current = true WHERE id = v_prev;
          v_out := v_out || jsonb_build_object('t', 'promoted', 'id', v_prev);
        END IF;
      END IF;
    END LOOP;
  ELSE
    FOR r IN EXECUTE format('UPDATE public.%I SET deleted_at = now(), deleted_by = $1, delete_op_id = $2 WHERE id = ANY ($3) AND deleted_at IS NULL RETURNING id', p_table)
             USING p_actor, p_op, p_ids LOOP
      v_out := v_out || jsonb_build_object('t', p_table, 'id', r.id);
    END LOOP;
  END IF;
  RETURN v_out;
END $$;

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
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_sources', ARRAY[p_id]);
  ELSIF p_entity IN ('record','facet','name','external_id','document') THEN
    v_aff := public.stone_library_soft_delete_rows(v_op, p_actor,
               CASE p_entity WHEN 'record' THEN 'stone_library_records' WHEN 'facet' THEN 'stone_library_facets'
                             WHEN 'name' THEN 'stone_library_names' WHEN 'external_id' THEN 'stone_library_external_ids'
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
                    'stone_library_names','stone_library_facets','stone_library_records'];
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

-- ─── 18) Aktarım paketleri ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_batch_open(p_actor uuid, p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.stone_library_sources%ROWTYPE; v_id uuid; v_dry boolean := coalesce((p_data ->> 'dry_run')::boolean, true); k text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['source_id','kind','dry_run','langs','calls_planned','credit_cap','terms_sha256','paid_period_note','note'])) THEN
      RAISE EXCEPTION 'stone_library_batch_open: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  SELECT * INTO s FROM public.stone_library_sources WHERE id = (p_data ->> 'source_id')::uuid AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_batch_open: kaynak yok' USING ERRCODE = 'SL022'; END IF;
  IF NOT v_dry THEN
    -- Lisans kaydı olmayan / etkin olmayan / ticari kullanımı onaylanmamış kaynaktan gerçek aktarım yok.
    IF s.status <> 'active' THEN RAISE EXCEPTION 'stone_library_batch_open: kaynak etkin değil' USING ERRCODE = 'SL060'; END IF;
    IF NOT s.commercial_use_ok THEN RAISE EXCEPTION 'stone_library_batch_open: ticari kullanım onayı yok' USING ERRCODE = 'SL061'; END IF;
    IF s.license_valid_until IS NOT NULL AND s.license_valid_until <= now() THEN
      RAISE EXCEPTION 'stone_library_batch_open: lisans süresi dolmuş' USING ERRCODE = 'SL062';
    END IF;
    IF s.kind = 'api' AND coalesce(p_data ->> 'terms_sha256', '') = '' THEN
      RAISE EXCEPTION 'stone_library_batch_open: API aktarımında şart metni SHA-256 zorunlu' USING ERRCODE = 'SL063';
    END IF;
  END IF;
  INSERT INTO public.stone_library_import_batches (source_id, kind, dry_run, langs, calls_planned, credit_cap, terms_sha256, paid_period_note, note, started_by)
  VALUES (s.id, coalesce(p_data ->> 'kind', 'api_import'), v_dry,
          CASE WHEN jsonb_typeof(p_data -> 'langs') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_data -> 'langs')) ELSE ARRAY['tr'] END,
          coalesce((p_data ->> 'calls_planned')::int, 0), coalesce((p_data ->> 'credit_cap')::int, 0),
          p_data ->> 'terms_sha256', p_data ->> 'paid_period_note', p_data ->> 'note', p_actor)
  RETURNING id INTO v_id;
  INSERT INTO public.stone_library_import_events (batch_id, level, kind, message, actor) VALUES (v_id, 'info', 'opened', NULL, p_actor);
  PERFORM public.stone_library_review_log('batch', v_id, 'create', NULL);
  RETURN v_id;
END $$;

-- Kaynak hâlâ aktarılabilir mi? (etkin, silinmemiş, ticari onaylı, lisansı geçerli) — her ücretli çağrıdan önce.
CREATE OR REPLACE FUNCTION public.stone_library_assert_source_importable(p_source uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.stone_library_sources%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.stone_library_sources WHERE id = p_source;
  IF NOT FOUND OR s.deleted_at IS NOT NULL OR s.status <> 'active' THEN
    RAISE EXCEPTION 'stone_library: kaynak etkin değil' USING ERRCODE = 'SL060';
  END IF;
  IF NOT s.commercial_use_ok THEN RAISE EXCEPTION 'stone_library: ticari kullanım onayı yok' USING ERRCODE = 'SL061'; END IF;
  IF s.license_valid_until IS NOT NULL AND s.license_valid_until <= now() THEN
    RAISE EXCEPTION 'stone_library: lisans süresi dolmuş' USING ERRCODE = 'SL062';
  END IF;
END $$;

-- Durum makinesi: planned→running|stopped · running→stop_requested|completed|failed · stop_requested→stopped|failed|completed
CREATE OR REPLACE FUNCTION public.stone_library_batch_set_status(p_actor uuid, p_batch_id uuid, p_status text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b public.stone_library_import_batches%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO b FROM public.stone_library_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_batch_set_status: paket yok' USING ERRCODE = 'SL030'; END IF;
  IF NOT ((b.status = 'planned' AND p_status IN ('running','stopped'))
       OR (b.status = 'running' AND p_status IN ('stop_requested','completed','failed'))
       OR (b.status = 'stop_requested' AND p_status IN ('stopped','failed','completed'))) THEN
    RAISE EXCEPTION 'stone_library_batch_set_status: geçersiz geçiş % → %', b.status, p_status USING ERRCODE = 'SL064';
  END IF;
  IF p_status = 'running' AND b.dry_run THEN RAISE EXCEPTION 'stone_library_batch_set_status: deneme paketi çalıştırılamaz' USING ERRCODE = 'SL031'; END IF;
  IF p_status = 'running' THEN PERFORM public.stone_library_assert_source_importable(b.source_id); END IF;
  UPDATE public.stone_library_import_batches SET status = p_status,
    started_at = CASE WHEN p_status = 'running' THEN now() ELSE started_at END,
    stop_requested_at = CASE WHEN p_status = 'stop_requested' THEN now() ELSE stop_requested_at END,
    finished_at = CASE WHEN p_status IN ('stopped','completed','failed') THEN now() ELSE finished_at END
  WHERE id = p_batch_id;
  INSERT INTO public.stone_library_import_events (batch_id, level, kind, message, actor)
  VALUES (p_batch_id, CASE WHEN p_status = 'failed' THEN 'error' ELSE 'info' END, 'status_' || p_status, p_note, p_actor);
END $$;

-- Ücretli çağrıdan ÖNCE kredi ayırır (önce deftere). Tavan / durum DB'de zorlanır; durdurma isteğinden sonra yeni çağrı yok.
CREATE OR REPLACE FUNCTION public.stone_library_batch_reserve_call(p_actor uuid, p_batch_id uuid, p_external_id text DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b public.stone_library_import_batches%ROWTYPE;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO b FROM public.stone_library_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_batch_reserve_call: paket yok' USING ERRCODE = 'SL030'; END IF;
  IF b.status <> 'running' THEN RAISE EXCEPTION 'stone_library_batch_reserve_call: paket çalışmıyor (%)', b.status USING ERRCODE = 'SL032'; END IF;
  PERFORM public.stone_library_assert_source_importable(b.source_id);
  IF b.calls_used + 1 > b.credit_cap THEN
    RAISE EXCEPTION 'stone_library_batch_reserve_call: kredi tavanı (%) doldu', b.credit_cap USING ERRCODE = 'SL065';
  END IF;
  UPDATE public.stone_library_import_batches SET calls_used = calls_used + 1 WHERE id = p_batch_id;
  INSERT INTO public.stone_library_import_events (batch_id, level, kind, external_id, actor) VALUES (p_batch_id, 'info', 'call_reserved', p_external_id, p_actor);
  RETURN b.calls_used + 1;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_batch_log(p_actor uuid, p_batch_id uuid, p_level text, p_kind text, p_external_id text DEFAULT NULL,
  p_message text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_import_batches WHERE id = p_batch_id) THEN
    RAISE EXCEPTION 'stone_library_batch_log: paket yok' USING ERRCODE = 'SL030';
  END IF;
  INSERT INTO public.stone_library_import_events (batch_id, level, kind, external_id, message, actor)
  VALUES (p_batch_id, p_level, p_kind, p_external_id, p_message, p_actor);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_batch_quota(p_actor uuid, p_batch_id uuid, p_limit integer, p_before integer, p_after integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  UPDATE public.stone_library_import_batches SET
    quota_limit = coalesce(p_limit, quota_limit),
    quota_remaining_before = coalesce(quota_remaining_before, p_before),
    quota_remaining_after = coalesce(p_after, quota_remaining_after)
  WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_batch_quota: paket yok' USING ERRCODE = 'SL030'; END IF;
END $$;

-- Ham yanıt (değiştirilemez). Yalnız çalışan paketin kendi kaynağına; ayrılmış çağrı sayısını aşamaz.
CREATE OR REPLACE FUNCTION public.stone_library_raw_put(p_actor uuid, p_batch_id uuid, p_external_id text, p_lang text, p_endpoint text,
  p_http_status integer, p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b public.stone_library_import_batches%ROWTYPE; v_id uuid; v_n int;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO b FROM public.stone_library_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_raw_put: paket yok' USING ERRCODE = 'SL030'; END IF;
  PERFORM public.stone_library_assert_batch_writable(p_batch_id, NULL);
  SELECT count(*) INTO v_n FROM public.stone_library_raw WHERE batch_id = p_batch_id;
  IF v_n + 1 > b.calls_used THEN RAISE EXCEPTION 'stone_library_raw_put: ayrılmamış çağrı (önce reserve_call)' USING ERRCODE = 'SL066'; END IF;
  INSERT INTO public.stone_library_raw (batch_id, source_id, external_id, lang, endpoint, http_status, payload, created_by)
  VALUES (p_batch_id, b.source_id, p_external_id, p_lang, p_endpoint, p_http_status, p_payload, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Paket geri alma: paketin yazdığı kayıt / facet / ad / harici kimlik geri alınabilir biçimde silinir; ham veri KALIR.
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
  UPDATE public.stone_library_delete_ops SET affected = v_aff WHERE id = v_op;
  UPDATE public.stone_library_import_batches SET status = 'rolled_back', rolled_back_at = now(), rollback_op_id = v_op WHERE id = p_batch_id;
  PERFORM public.stone_library_defer_flush();
  INSERT INTO public.stone_library_import_events (batch_id, level, kind, message, actor) VALUES (p_batch_id, 'warn', 'rolled_back', p_note, p_actor);
  PERFORM public.stone_library_review_log('batch', p_batch_id, 'rollback', p_note);
  RETURN v_op;
END $$;

-- ─── 19) Uzman erişimi (owner kişi bazında verir; varsayılan hiç kimse) ─────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_user_eligible(u public.users) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT lower(coalesce(u.role,'')) = 'expert' AND u.active IS TRUE AND coalesce(u.is_demo_account,false) IS FALSE
     AND u.is_super_admin IS NOT TRUE AND u.tenant_id IS NOT NULL
     AND lower(coalesce(u.approval_status,'')) IN ('approved','')
     AND (coalesce(u.module_permissions ->> 'stones','') = 'true' OR coalesce(u.module_permissions ->> 'dogaltas','') = 'true')
$$;

CREATE OR REPLACE FUNCTION public.stone_library_grant_access(p_actor uuid, p_target uuid, p_note text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE t public.users%ROWTYPE; v_id uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_target IS NULL OR p_actor = p_target THEN RAISE EXCEPTION 'stone_library_grant: geçersiz hedef' USING ERRCODE = 'SL070'; END IF;
  SELECT * INTO t FROM public.users WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_grant: hedef bulunamadı' USING ERRCODE = 'SL071'; END IF;
  IF NOT public.stone_library_user_eligible(t) THEN
    RAISE EXCEPTION 'stone_library_grant: hedef uygun değil (aktif, onaylı, demo olmayan, Doğaltaş izinli uzman olmalı)' USING ERRCODE = 'SL072';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_access_grants WHERE user_id = p_target AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_grant: etkin yetki zaten var' USING ERRCODE = 'SL073';
  END IF;
  INSERT INTO public.stone_library_access_grants (user_id, granted_tenant_id, granted_by, note)
  VALUES (p_target, t.tenant_id, p_actor, nullif(btrim(coalesce(p_note,'')), '')) RETURNING id INTO v_id;
  PERFORM public.stone_library_review_log('grant', v_id, 'grant', p_note);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_revoke_access(p_actor uuid, p_target uuid, p_reason text DEFAULT 'owner_revoked') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF coalesce(p_reason,'') NOT IN ('owner_revoked','other') THEN RAISE EXCEPTION 'stone_library_revoke: geçersiz gerekçe' USING ERRCODE = 'SL074'; END IF;
  SELECT id INTO v_id FROM public.stone_library_access_grants WHERE user_id = p_target AND revoked_at IS NULL FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'stone_library_revoke: etkin yetki yok' USING ERRCODE = 'SL075'; END IF;
  UPDATE public.stone_library_access_grants SET revoked_at = now(), revoked_by = p_actor, revoke_reason = p_reason WHERE id = v_id;
  PERFORM public.stone_library_review_log('grant', v_id, 'revoke', p_reason);
  RETURN v_id;
END $$;

-- İzleyici erişimi (her uzman isteğinde DB'de yeniden doğrulanır). Kalıcı uygunsuzluk (rol / tenant değişti)
-- yetkiyi KALICI kapatır; geçici durum (pasif, onay bekliyor, Doğaltaş modül izni kapalı) yalnız erişimi reddeder.
CREATE OR REPLACE FUNCTION public.stone_library_viewer_allowed(p_viewer uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE u public.users%ROWTYPE; g public.stone_library_access_grants%ROWTYPE; v_reason text;
BEGIN
  IF p_viewer IS NULL THEN RETURN false; END IF;
  IF public.stone_library_actor_is_owner(p_viewer) THEN RETURN true; END IF;
  SELECT * INTO u FROM public.users WHERE id = p_viewer;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO g FROM public.stone_library_access_grants WHERE user_id = p_viewer AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF lower(coalesce(u.role,'')) <> 'expert' OR u.is_super_admin IS TRUE THEN v_reason := 'role_changed';
  ELSIF u.tenant_id IS DISTINCT FROM g.granted_tenant_id THEN v_reason := 'tenant_changed';
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.stone_library_access_grants SET revoked_at = now(), revoked_by = NULL, revoke_reason = v_reason WHERE id = g.id;
    INSERT INTO public.stone_library_reviews (entity, entity_id, action, note) VALUES ('grant', g.id, 'auto_revoke', v_reason);
    RETURN false;
  END IF;
  RETURN public.stone_library_user_eligible(u);
END $$;

-- ─── 20) Uzman okuma RPC'leri (yalnız yayın yüzeyi) ─────────────────────────────────────────────
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
           WHEN p.names_fold = v_q OR p.sort_key = v_q THEN 4
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
           'slug', page.slug, 'name_tr', page.name_tr, 'name_en', page.name_en,
           'facets', jsonb_strip_nulls(jsonb_build_object(
              'chakra', page.doc -> 'facets' -> 'chakra', 'zodiac', page.doc -> 'facets' -> 'zodiac',
              'element', page.doc -> 'facets' -> 'element', 'color', page.doc -> 'facets' -> 'color')),
           'excerpt', page.ex_content, 'excerpt_attribution', page.ex_attribution
         ) ORDER BY page.tier DESC, page.rnk DESC, page.sort_key, page.slug), '[]'::jsonb)
    INTO v_total, v_items FROM page;

  RETURN jsonb_build_object('total', coalesce(v_total, 0), 'limit', v_limit, 'offset', v_offset, 'items', v_items);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_expert_stone(p_viewer uuid, p_slug text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.stone_library_viewer_allowed(p_viewer) THEN RETURN NULL; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN NULL; END IF;
  PERFORM public.stone_library_refresh_stone(p.stone_id) FROM public.stone_library_published p
   WHERE p.slug = p_slug AND p.expires_at IS NOT NULL AND p.expires_at <= now();
  RETURN (SELECT doc FROM public.stone_library_published WHERE slug = p_slug);
END $$;

-- ─── 21) Owner okuma RPC'leri (gerçek kaynak, lisans, tüm sürümler) ────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_owner_stone(p_actor uuid, p_stone_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN (SELECT jsonb_build_object(
    'stone', to_jsonb(s),
    'names', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at) FROM public.stone_library_names n WHERE n.stone_id = s.id), '[]'),
    'external_ids', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at) FROM public.stone_library_external_ids e WHERE e.stone_id = s.id), '[]'),
    'records', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.field_key, r.lang, r.source_id, r.version) FROM public.stone_library_records r WHERE r.stone_id = s.id), '[]'),
    'facets', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.facet, f.value_key) FROM public.stone_library_facets f WHERE f.stone_id = s.id), '[]'),
    'published', (SELECT p.doc FROM public.stone_library_published p WHERE p.stone_id = s.id))
    FROM public.stone_library_stones s WHERE s.id = p_stone_id);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_overview(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN jsonb_build_object(
    'settings', (SELECT to_jsonb(x) FROM public.stone_library_settings x WHERE id),
    'sources', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at) FROM public.stone_library_sources s), '[]'),
    'stones', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name_tr', s.name_tr, 'name_en', s.name_en,
                 'status', s.status, 'deleted_at', s.deleted_at, 'row_version', s.row_version) ORDER BY s.name_tr) FROM public.stone_library_stones s), '[]'),
    'batches', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC) FROM public.stone_library_import_batches b), '[]'),
    'grants', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.granted_at DESC) FROM public.stone_library_access_grants g), '[]'),
    'delete_ops', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FROM public.stone_library_delete_ops d), '[]'));
END $$;

-- ─── 22) Ayrıcalıklar ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text; fn record;
BEGIN
  FOREACH t IN ARRAY ARRAY['stone_library_settings','stone_library_sources','stone_library_source_documents','stone_library_vocab',
                           'stone_library_stones','stone_library_names','stone_library_external_ids','stone_library_import_batches',
                           'stone_library_import_events','stone_library_raw','stone_library_records','stone_library_facets',
                           'stone_library_reviews','stone_library_history','stone_library_delete_ops','stone_library_access_grants',
                           'stone_library_published'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  REVOKE ALL ON SEQUENCE public.stone_library_import_events_id_seq, public.stone_library_reviews_id_seq, public.stone_library_history_id_seq
    FROM PUBLIC, anon, authenticated, service_role;
  -- Bütün stone_library_* fonksiyonları: önce herkesten al.
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', fn.sig);
  END LOOP;
END $$;
-- Arama indeksi / üretilmiş kolon katlama fonksiyonu herkese açık olmalı (saf, veri okumaz).
GRANT EXECUTE ON FUNCTION public.stone_library_fold(text) TO PUBLIC;

-- Yalnız service_role çağırır (route katmanı aktörü / izleyiciyi oturumla eşleştirdikten SONRA).
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

COMMIT;
