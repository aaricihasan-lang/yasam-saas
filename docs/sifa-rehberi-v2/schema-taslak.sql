-- =============================================================================
-- Şifa Rehberi V2 — KONU / İÇERİK KUTUSU şeması — TASLAK (1. aşama)
--
-- ℹ️ 6. aşamada YERİNİ ALDI: supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql
--    (tenant'lı bileşik anahtarlar, sistem bölümü anahtarı, kaydet/yükle/aktarım fonksiyonları).
--    Bu dosya yalnız scripts/sifa-rehberi-v2/schema.pg.mjs regresyonu için korunur.
--
-- ⚠️ UYGULANMADI. Bu dosya bilerek supabase/migrations DIŞINDA tutulur.
--    Yalnız yerel geçici PostgreSQL'de doğrulanır: scripts/sifa-rehberi-v2/schema.pg.mjs
--    Production'a uygulama ayrı Owner onayı gerektirir.
--
-- İLKELER
--  * Mevcut healing_guides / healing_guide_sections tablolarına DOKUNULMAZ (veri kaybı riski yok).
--  * Sahiplik KİŞİ bazında: owner_user_id + tenant_id. Üst/alt, kutu, bağlantı, kaynak ve
--    görsel ilişkileri (id, owner_user_id) bileşik yabancı anahtarlarıyla kurulur →
--    başka uzmanın kaydına bağlanmak VERİTABANI düzeyinde imkânsızdır.
--  * Sınırsız derinlik (komşuluk listesi); döngü ve teknik tavan (20 seviye) tetikleyiciyle engellenir.
--  * Sıralama kesirli anahtar (sort_key, "C" harmanlaması) → taşıma tek satır günceller.
--  * Silme YUMUŞAK (deleted_at + delete_batch_id); kalıcı silme yalnız 30 gün sonra ayrı iş ile.
--  * Erişim mevcut sistemle aynı: anon/authenticated'a yetki YOK; sunucu API'si service_role ile,
--    owner/tenant OTURUMDAN alınır. RLS açık + politika yok (mevcut modüllerle aynı desen).
-- =============================================================================
BEGIN;

CREATE TABLE public.sifa_topics (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  owner_user_id    uuid        NOT NULL,
  parent_id        uuid,
  title            text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  sort_key         text        COLLATE "C" NOT NULL CHECK (sort_key ~ '^[0-9a-z]*[1-9a-z]$'),
  -- Hazır Şifa Rehberi başlığı anahtarı ('grup:<id>' | 'konu:<id>'; production topicTree.ts id'leri).
  -- NULL = uzmanın kendi başlığı. Hazır başlığın section_type/mode karşılığı uygulamadaki şablondan gelir.
  template_key     text        CHECK (template_key IS NULL OR template_key ~ '^(grup|konu):[a-z_]+$'),
  version          integer     NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  delete_batch_id  uuid,
  CONSTRAINT sifa_topics_id_owner_uq UNIQUE (id, owner_user_id),
  CONSTRAINT sifa_topics_template_not_root CHECK (template_key IS NULL OR parent_id IS NOT NULL),
  CONSTRAINT sifa_topics_parent_same_owner_fk
    FOREIGN KEY (parent_id, owner_user_id) REFERENCES public.sifa_topics (id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT sifa_topics_not_self CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT sifa_topics_delete_pair CHECK ((deleted_at IS NULL) = (delete_batch_id IS NULL))
);
CREATE INDEX sifa_topics_children_idx ON public.sifa_topics (owner_user_id, parent_id, sort_key) WHERE deleted_at IS NULL;
CREATE INDEX sifa_topics_trash_idx    ON public.sifa_topics (owner_user_id, delete_batch_id) WHERE deleted_at IS NOT NULL;
-- Aynı üst başlık altında aynı hazır başlık bir kez (şablonu tekrar eklemek kopya üretemez).
CREATE UNIQUE INDEX sifa_topics_template_once_uq ON public.sifa_topics (parent_id, template_key)
  WHERE template_key IS NOT NULL AND deleted_at IS NULL;

-- Döngü + derinlik tavanı: yeni üstün kök yolu boyunca yürü; kendini görürse döngü.
CREATE OR REPLACE FUNCTION public.sifa_topics_guard_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_max_depth constant int := 20;
  v_depth  int := 0;
  v_height int;
  v_cur    uuid := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    v_depth := 0;
  ELSE
    WHILE v_cur IS NOT NULL LOOP
      IF v_cur = NEW.id THEN
        RAISE EXCEPTION 'sifa_topic_cycle' USING ERRCODE = '23514';
      END IF;
      v_depth := v_depth + 1;
      IF v_depth > v_max_depth THEN
        RAISE EXCEPTION 'sifa_topic_depth_exceeded' USING ERRCODE = '23514';
      END IF;
      SELECT t.parent_id INTO v_cur FROM public.sifa_topics t WHERE t.id = v_cur;
    END LOOP;
  END IF;
  -- Taşınan alt ağacın yüksekliği (kendisi = 1)
  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE sub AS (
      SELECT NEW.id AS id, 1 AS h
      UNION ALL
      SELECT c.id, sub.h + 1 FROM public.sifa_topics c JOIN sub ON c.parent_id = sub.id
      WHERE sub.h <= v_max_depth
    )
    SELECT max(h) INTO v_height FROM sub;
  ELSE
    v_height := 1;
  END IF;
  IF v_depth + v_height > v_max_depth THEN
    RAISE EXCEPTION 'sifa_topic_depth_exceeded' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sifa_topics_guard_tree_trg
  BEFORE INSERT OR UPDATE OF parent_id ON public.sifa_topics
  FOR EACH ROW EXECUTE FUNCTION public.sifa_topics_guard_tree();

-- Hazır başlık: adı, yeri ve anahtarı değiştirilemez; tek başına çöpe atılamaz
-- (yalnız üst konusuyla aynı silme paketinde). Altına başlık/kutu eklemek serbesttir.
CREATE OR REPLACE FUNCTION public.sifa_topics_guard_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent_batch uuid;
BEGIN
  IF OLD.template_key IS NULL THEN
    IF NEW.template_key IS NOT NULL THEN
      RAISE EXCEPTION 'sifa_template_locked' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.template_key IS DISTINCT FROM OLD.template_key
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'sifa_template_locked' USING ERRCODE = '23514';
  END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT p.delete_batch_id INTO v_parent_batch FROM public.sifa_topics p WHERE p.id = NEW.parent_id;
    IF v_parent_batch IS DISTINCT FROM NEW.delete_batch_id THEN
      RAISE EXCEPTION 'sifa_template_locked' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sifa_topics_guard_template_trg
  BEFORE UPDATE ON public.sifa_topics
  FOR EACH ROW EXECUTE FUNCTION public.sifa_topics_guard_template();

CREATE TABLE public.sifa_topic_blocks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  owner_user_id    uuid        NOT NULL,
  topic_id         uuid        NOT NULL,
  title            text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  content_json     jsonb,
  content_text     text        NOT NULL DEFAULT '' CHECK (octet_length(content_text) <= 1048576),
  classification   text        CHECK (classification IS NULL OR classification IN ('bilimsel','geleneksel','dini','uzman_notu','diger')),
  sort_key         text        COLLATE "C" NOT NULL CHECK (sort_key ~ '^[0-9a-z]*[1-9a-z]$'),
  version          integer     NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  delete_batch_id  uuid,
  CONSTRAINT sifa_blocks_id_owner_uq UNIQUE (id, owner_user_id),
  CONSTRAINT sifa_blocks_topic_same_owner_fk
    FOREIGN KEY (topic_id, owner_user_id) REFERENCES public.sifa_topics (id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT sifa_blocks_json_size CHECK (content_json IS NULL OR pg_column_size(content_json) <= 2097152),
  CONSTRAINT sifa_blocks_delete_pair CHECK ((deleted_at IS NULL) = (delete_batch_id IS NULL))
);
CREATE INDEX sifa_blocks_topic_idx ON public.sifa_topic_blocks (owner_user_id, topic_id, sort_key) WHERE deleted_at IS NULL;

CREATE TABLE public.sifa_block_sources (
  id             uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid  NOT NULL,
  block_id       uuid  NOT NULL,
  kind           text  NOT NULL CHECK (kind IN ('makale','kitap','web','geleneksel','diger')),
  title          text  NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  authors        text  CHECK (authors IS NULL OR char_length(authors) <= 500),
  year           text  CHECK (year IS NULL OR char_length(year) <= 9),
  doi            text  CHECK (doi IS NULL OR doi ~ '^10\.[0-9]{4,9}/\S+$'),
  url            text  CHECK (url IS NULL OR url ~* '^https?://\S+$'),
  sort_key       text  COLLATE "C" NOT NULL,
  CONSTRAINT sifa_sources_block_same_owner_fk
    FOREIGN KEY (block_id, owner_user_id) REFERENCES public.sifa_topic_blocks (id, owner_user_id) ON DELETE CASCADE
);

CREATE TABLE public.sifa_topic_links (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid        NOT NULL,
  from_topic_id  uuid        NOT NULL,
  to_topic_id    uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sifa_links_not_self CHECK (from_topic_id <> to_topic_id),
  CONSTRAINT sifa_links_uq UNIQUE (owner_user_id, from_topic_id, to_topic_id),
  CONSTRAINT sifa_links_from_fk FOREIGN KEY (from_topic_id, owner_user_id) REFERENCES public.sifa_topics (id, owner_user_id) ON DELETE CASCADE,
  CONSTRAINT sifa_links_to_fk   FOREIGN KEY (to_topic_id,   owner_user_id) REFERENCES public.sifa_topics (id, owner_user_id) ON DELETE CASCADE
);
CREATE INDEX sifa_links_to_idx ON public.sifa_topic_links (owner_user_id, to_topic_id);

-- Görseller: yeni ÖZEL bucket 'sifa-arastirma' (stone-photos PAYLAŞILMAZ). Yol sahibin önekiyle başlamak ZORUNDA.
CREATE TABLE public.sifa_block_assets (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  owner_user_id  uuid        NOT NULL,
  block_id       uuid        NOT NULL,
  storage_path   text        NOT NULL,
  mime_type      text        NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size      integer     NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  caption        text        CHECK (caption IS NULL OR char_length(caption) <= 500),
  alt_text       text        CHECK (alt_text IS NULL OR char_length(alt_text) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sifa_assets_path_owner CHECK (storage_path LIKE (owner_user_id::text || '/%')),
  CONSTRAINT sifa_assets_path_uq UNIQUE (storage_path),
  CONSTRAINT sifa_assets_block_same_owner_fk
    FOREIGN KEY (block_id, owner_user_id) REFERENCES public.sifa_topic_blocks (id, owner_user_id) ON DELETE RESTRICT
);

-- Erişim: mevcut modüllerle aynı — tarayıcı rollerine hiçbir yetki yok.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sifa_topics','sifa_topic_blocks','sifa_block_sources','sifa_topic_links','sifa_block_assets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- SONRAKİ AŞAMA (bu taslakta YOK, ayrı onay):
--  * sifa_apply_changeset(p_tenant, p_owner, p_changes jsonb): "Kaydet" değişiklik kümesini TEK
--    işlemde uygular; her satırda owner/tenant + version (iyimser kilit) kontrolü; 409 çakışma.
--  * Türkçe katlamalı trigram arama (mevcut public.sifa_fold yeniden kullanılır).
--  * 30 gün sonra çöpü kalıcı temizleyen zamanlanmış iş (önce görsel nesneleri, sonra satırlar).
COMMIT;
