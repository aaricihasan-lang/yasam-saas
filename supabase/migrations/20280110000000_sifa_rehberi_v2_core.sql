-- =============================================================================
-- Şifa Rehberi V2 — KALICI VERİ MODELİ (çekirdek) · 7. aşama: KURUM ORTAK + KİŞİSEL kapsam
--
-- ⚠️ PRODUCTION'A UYGULANMASI AYRI OWNER ONAYI GEREKTİRİR (yayın sırası: docs/sifa-rehberi-v2/geri-donus-plani.md).
--    Doğrulama: yerel GEÇİCİ PostgreSQL (scripts/sifa-rehberi-v2/integration.pg.mts, routes.harness.ts,
--    backup-v2.pg.harness.mjs) + izole Supabase test projesi (scripts/sifa-rehberi-v2/real/*).
--    Sonraki YH migration'ı: 20280110000100_yh_owner_scope_sifa_v2.sql (bu dosyadan SONRA uygulanır).
--
-- KAPSAM MODELİ (Owner kararı, 7. aşama)
--  * owner_key = kaydın SAHİP ANAHTARI.
--      kisisel : owner_key = uzmanın users.id   → yalnız o uzman görür/düzenler.
--      kurum   : owner_key = tenant_id          → aynı tenant'taki yetkili uzmanlar OKUR; API'den
--                yazma YOK (yalnız V1 aktarımı oluşturur). Başka tenant asla göremez.
--    Tutarlılık CHECK ile zorunlu: (scope = 'kurum') ⇔ (owner_key = tenant_id).
--  * Üst/alt, kutu, kaynak, bağlantı ve görsel ilişkileri (id, tenant_id, owner_key) BİLEŞİK yabancı
--    anahtarlarıyla kurulur → kişisel not kurum kaydının altına, kurum notu kişisel kaydın altına,
--    başka uzmanın/tenant'ın kaydına bağlanmak VERİTABANI düzeyinde imkânsızdır.
--  * Kurum kaydını kişiselleştirme = ÖZGÜN kayda dokunmadan AYRI KOPYA (sifa_v2_copy_shared).
--  * Erişim: RLS açık + politika yok; anon/authenticated'a tablo ve fonksiyon yetkisi YOK.
--    Sunucu API'si service_role ile çağırır; tenant/kullanıcı OTURUMDAN gelir. Dış fonksiyonlar
--    SECURITY DEFINER (V1 RPC'leriyle aynı desen); iç yardımcı sifa_v2__apply hiçbir role açılmaz.
--  * Hazır başlık / sistem bölümü KARARLI anahtarla tanınır (template_key), görünen adla değil:
--      grup:<id> / konu:<id>              → production lib/sifa-rehberi/topicTree.ts kimlikleri
--      bolum:iliskili_rahatsizliklar      → "İlişkili Rahatsızlıklar" (yalnız ana konunun hemen altında)
--      bolum:v1_eslesmeyen                → V1'den gelen, hazır başlıkla TAM eşleşmeyen notlar (ham + özgün yer)
--  * Mevcut healing_* tablolarına, RPC'lerine, sifa_fold'a ve stone-photos yollarına DOKUNULMAZ.
--  * SÜRÜM ÇAKIŞMASI = SQLSTATE 'PT409' (9. aşama P0). 40001 (serialization_failure) KULLANILMAZ: gerçek
--    PostgREST 40001'i "yeniden denenebilir" sayıp işlemi tekrar tekrar çalıştırır (8. aşamada test projesinde
--    istemci kopsa bile süren döngü gözlendi; astroloji ATL-P2-08 aynı davranışı ~2 dk + 500 olarak not etmişti).
--    PostgREST 'PTnnn' kodunu yeniden denemeden doğrudan HTTP nnn (409) + {code,message,details} olarak döndürür.
-- =============================================================================
BEGIN;

-- ── Konular (ana konu = parent_id NULL) ─────────────────────────────────────
CREATE TABLE public.sifa_topics (
  id               uuid        PRIMARY KEY,
  tenant_id        uuid        NOT NULL,
  owner_key        uuid        NOT NULL,
  scope            text        NOT NULL CHECK (scope IN ('kurum','kisisel')),
  parent_id        uuid,
  title            text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  sort_key         text        COLLATE "C" NOT NULL CHECK (sort_key ~ '^[0-9a-z]*[1-9a-z]$'),
  template_key     text        CHECK (template_key IS NULL OR template_key ~ '^(grup|konu|bolum):[a-z0-9_]+$'),
  version          integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  delete_batch_id  uuid,
  CONSTRAINT sifa_topics_scope_owner CHECK ((scope = 'kurum') = (owner_key = tenant_id)),
  CONSTRAINT sifa_topics_scope_uq UNIQUE (id, tenant_id, owner_key),
  CONSTRAINT sifa_topics_template_not_root CHECK (template_key IS NULL OR parent_id IS NOT NULL),
  CONSTRAINT sifa_topics_parent_same_owner_fk
    FOREIGN KEY (parent_id, tenant_id, owner_key) REFERENCES public.sifa_topics (id, tenant_id, owner_key) ON DELETE RESTRICT,
  CONSTRAINT sifa_topics_not_self CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT sifa_topics_delete_pair CHECK ((deleted_at IS NULL) = (delete_batch_id IS NULL))
);
CREATE INDEX sifa_topics_children_idx ON public.sifa_topics (owner_key, parent_id, sort_key) WHERE deleted_at IS NULL;
CREATE INDEX sifa_topics_owner_idx    ON public.sifa_topics (tenant_id, owner_key);
CREATE INDEX sifa_topics_trash_idx    ON public.sifa_topics (owner_key, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE UNIQUE INDEX sifa_topics_template_once_uq ON public.sifa_topics (parent_id, template_key)
  WHERE template_key IS NOT NULL AND deleted_at IS NULL;

-- Döngü + derinlik tavanı (20).
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
  IF NEW.parent_id IS NOT NULL THEN
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

-- Sistem anahtarlı başlık: adı/yeri/anahtarı sabit; tek başına çöpe atılamaz. bolum:* yalnız ana
-- konunun HEMEN altında. Kapsam (scope/owner_key/tenant) SONRADAN değiştirilemez.
CREATE OR REPLACE FUNCTION public.sifa_topics_guard_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent_batch uuid;
  v_grand uuid;
BEGIN
  IF NEW.template_key LIKE 'bolum:%' THEN
    SELECT p.parent_id INTO v_grand FROM public.sifa_topics p WHERE p.id = NEW.parent_id;
    IF NOT FOUND OR v_grand IS NOT NULL THEN
      RAISE EXCEPTION 'sifa_system_section_not_under_root' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF NEW.scope IS DISTINCT FROM OLD.scope OR NEW.owner_key IS DISTINCT FROM OLD.owner_key OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'sifa_scope_immutable' USING ERRCODE = '23514';
  END IF;
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
  BEFORE INSERT OR UPDATE ON public.sifa_topics
  FOR EACH ROW EXECUTE FUNCTION public.sifa_topics_guard_template();

-- ── İçerik kutuları ───────────────────────────────────────────────────────────
CREATE TABLE public.sifa_topic_blocks (
  id               uuid        PRIMARY KEY,
  tenant_id        uuid        NOT NULL,
  owner_key        uuid        NOT NULL,
  scope            text        NOT NULL CHECK (scope IN ('kurum','kisisel')),
  topic_id         uuid        NOT NULL,
  title            text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  content_json     jsonb,
  content_text     text        NOT NULL DEFAULT '' CHECK (octet_length(content_text) <= 1048576),
  classification   text        CHECK (classification IS NULL OR classification IN ('bilimsel','geleneksel','dini','uzman_notu','diger')),
  sort_key         text        COLLATE "C" NOT NULL CHECK (sort_key ~ '^[0-9a-z]*[1-9a-z]$'),
  version          integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  delete_batch_id  uuid,
  CONSTRAINT sifa_blocks_scope_owner CHECK ((scope = 'kurum') = (owner_key = tenant_id)),
  CONSTRAINT sifa_blocks_scope_uq UNIQUE (id, tenant_id, owner_key),
  CONSTRAINT sifa_blocks_topic_same_owner_fk
    FOREIGN KEY (topic_id, tenant_id, owner_key) REFERENCES public.sifa_topics (id, tenant_id, owner_key) ON DELETE RESTRICT,
  CONSTRAINT sifa_blocks_json_size CHECK (content_json IS NULL OR pg_column_size(content_json) <= 2097152),
  CONSTRAINT sifa_blocks_delete_pair CHECK ((deleted_at IS NULL) = (delete_batch_id IS NULL))
);
CREATE INDEX sifa_blocks_topic_idx ON public.sifa_topic_blocks (owner_key, topic_id, sort_key) WHERE deleted_at IS NULL;
CREATE INDEX sifa_blocks_owner_idx ON public.sifa_topic_blocks (tenant_id, owner_key);

-- ── Kaynaklar (DOI / bağlantı) ───────────────────────────────────────────────
CREATE TABLE public.sifa_block_sources (
  id             uuid  PRIMARY KEY,
  tenant_id      uuid  NOT NULL,
  owner_key      uuid  NOT NULL,
  block_id       uuid  NOT NULL,
  kind           text  NOT NULL CHECK (kind IN ('makale','kitap','web','geleneksel','diger')),
  title          text  NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  authors        text  CHECK (authors IS NULL OR char_length(authors) <= 500),
  year           text  CHECK (year IS NULL OR char_length(year) <= 9),
  doi            text  CHECK (doi IS NULL OR doi ~ '^10\.[0-9]{4,9}/\S+$'),
  url            text  CHECK (url IS NULL OR url ~* '^https?://\S+$'),
  position       integer NOT NULL CHECK (position >= 0),
  CONSTRAINT sifa_sources_block_same_owner_fk
    FOREIGN KEY (block_id, tenant_id, owner_key) REFERENCES public.sifa_topic_blocks (id, tenant_id, owner_key) ON DELETE CASCADE
);
CREATE INDEX sifa_sources_block_idx ON public.sifa_block_sources (block_id, position);

-- ── Bağlantılar (içerik kopyalamadan; yalnız AYNI kapsam içinde) ─────────────
CREATE TABLE public.sifa_topic_links (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL,
  owner_key      uuid        NOT NULL,
  from_topic_id  uuid        NOT NULL,
  to_topic_id    uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sifa_links_not_self CHECK (from_topic_id <> to_topic_id),
  CONSTRAINT sifa_links_uq UNIQUE (owner_key, from_topic_id, to_topic_id),
  CONSTRAINT sifa_links_from_fk FOREIGN KEY (from_topic_id, tenant_id, owner_key) REFERENCES public.sifa_topics (id, tenant_id, owner_key) ON DELETE CASCADE,
  CONSTRAINT sifa_links_to_fk   FOREIGN KEY (to_topic_id,   tenant_id, owner_key) REFERENCES public.sifa_topics (id, tenant_id, owner_key) ON DELETE CASCADE
);
CREATE INDEX sifa_links_to_idx ON public.sifa_topic_links (owner_key, to_topic_id);

-- ── Görseller ────────────────────────────────────────────────────────────────
-- origin='upload'     : ÖZEL bucket 'sifa-arastirma'; yol '<tenant>/<owner_key>/...' ZORUNLU; yalnız kişisel.
-- origin='legacy_ref' : V1 görselinin MEVCUT nesnesine salt-okunur referans (bucket 'stone-photos',
--                       yol 'healing-guides/<aynı tenant>/...'); nesne kopyalanmaz/taşınmaz/silinmez.
-- block_id NULL       : yüklendi ama henüz kaydedilmedi (taslak) — çöp temizliği sahipsizleri siler.
CREATE TABLE public.sifa_block_assets (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL,
  owner_key      uuid        NOT NULL,
  scope          text        NOT NULL CHECK (scope IN ('kurum','kisisel')),
  block_id       uuid,
  origin         text        NOT NULL CHECK (origin IN ('upload','legacy_ref')),
  bucket         text        NOT NULL,
  storage_path   text        NOT NULL CHECK (storage_path !~ '(^/|\.\.|//|\\)'),
  mime_type      text        CHECK (mime_type IS NULL OR mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size      integer     CHECK (byte_size IS NULL OR (byte_size > 0 AND byte_size <= 10485760)),
  caption        text        CHECK (caption IS NULL OR char_length(caption) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sifa_assets_scope_owner CHECK ((scope = 'kurum') = (owner_key = tenant_id)),
  CONSTRAINT sifa_assets_origin_bucket CHECK (
    (origin = 'upload' AND scope = 'kisisel' AND bucket = 'sifa-arastirma'
       AND storage_path LIKE (tenant_id::text || '/' || owner_key::text || '/%'))
    OR (origin = 'legacy_ref' AND bucket = 'stone-photos'
       AND storage_path LIKE ('healing-guides/' || tenant_id::text || '/%'))
  ),
  CONSTRAINT sifa_assets_path_uq UNIQUE (owner_key, bucket, storage_path),
  CONSTRAINT sifa_assets_block_same_owner_fk
    FOREIGN KEY (block_id, tenant_id, owner_key) REFERENCES public.sifa_topic_blocks (id, tenant_id, owner_key) ON DELETE SET NULL (block_id)
);
CREATE INDEX sifa_assets_owner_idx ON public.sifa_block_assets (tenant_id, owner_key);

-- ── V1 → V2 aktarım haritası (kurum kapsamı; tekrarlanabilir / mükerrersiz) ─
CREATE TABLE public.sifa_legacy_import_map (
  tenant_id      uuid        NOT NULL,
  legacy_kind    text        NOT NULL CHECK (legacy_kind IN ('guide','section','image')),
  legacy_id      text        NOT NULL,
  target_kind    text        NOT NULL CHECK (target_kind IN ('topic','block','asset')),
  target_id      uuid        NOT NULL,
  source_hash    text        NOT NULL,
  imported_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, legacy_kind, legacy_id, target_kind, target_id)
);

-- ── Okuma: uzmanın KİŞİSEL + kendi tenant'ının KURUM kayıtları ───────────────
-- Kişisel çöp: son 30 gün görünür (Çöp Kutusu). Kurum kayıtları API'den silinemez.
CREATE OR REPLACE FUNCTION public.sifa_v2_load(p_tenant uuid, p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'topics', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'scope', t.scope, 'parent_id', t.parent_id, 'title', t.title, 'sort_key', t.sort_key,
        'template_key', t.template_key, 'version', t.version, 'created_at', t.created_at,
        'updated_at', t.updated_at, 'deleted_at', t.deleted_at, 'delete_batch_id', t.delete_batch_id)
        ORDER BY t.parent_id NULLS FIRST, t.sort_key)
      FROM public.sifa_topics t
      WHERE p_user IS NOT NULL AND p_user <> p_tenant
        AND t.tenant_id = p_tenant AND t.owner_key IN (p_user, p_tenant)
        AND (t.deleted_at IS NULL OR (t.scope = 'kisisel' AND t.deleted_at > now() - interval '30 days'))), '[]'::jsonb),
    'blocks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'scope', b.scope, 'topic_id', b.topic_id, 'title', b.title, 'content_json', b.content_json,
        'content_text', b.content_text, 'classification', b.classification, 'sort_key', b.sort_key,
        'version', b.version, 'created_at', b.created_at, 'updated_at', b.updated_at,
        'deleted_at', b.deleted_at, 'delete_batch_id', b.delete_batch_id,
        'sources', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title,
                   'authors', s.authors, 'year', s.year, 'doi', s.doi, 'url', s.url) ORDER BY s.position)
          FROM public.sifa_block_sources s
          WHERE s.block_id = b.id AND s.owner_key = b.owner_key AND s.tenant_id = p_tenant), '[]'::jsonb))
        ORDER BY b.topic_id, b.sort_key)
      FROM public.sifa_topic_blocks b
      WHERE p_user IS NOT NULL AND p_user <> p_tenant
        AND b.tenant_id = p_tenant AND b.owner_key IN (p_user, p_tenant)
        AND (b.deleted_at IS NULL OR (b.scope = 'kisisel' AND b.deleted_at > now() - interval '30 days'))), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'from_topic_id', l.from_topic_id,
               'to_topic_id', l.to_topic_id, 'created_at', l.created_at) ORDER BY l.created_at, l.id)
      FROM public.sifa_topic_links l
      WHERE p_user IS NOT NULL AND p_user <> p_tenant
        AND l.tenant_id = p_tenant AND l.owner_key IN (p_user, p_tenant)), '[]'::jsonb)
  );
$$;

-- İç yardımcı: değişiklik kümesini VERİLEN kapsama yazar (hiçbir role AÇIK DEĞİL).
CREATE OR REPLACE FUNCTION public.sifa_v2__apply(p_tenant uuid, p_owner uuid, p_scope text, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r jsonb;
  v_pending jsonb;
  v_next jsonb;
  v_progress boolean;
  v_rows int;
  v_topics jsonb := '{}'::jsonb;
  v_blocks jsonb := '{}'::jsonb;
  v_version int;
  v_src jsonb;
  v_pos int;
  v_conflicts jsonb;
BEGIN
  IF p_tenant IS NULL OR p_owner IS NULL THEN
    RAISE EXCEPTION 'sifa_scope_required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'sifa_bad_changeset' USING ERRCODE = '22023';
  END IF;

  -- 0) Çakışma ön denetimi: sürümü değişmiş TÜM satırlar tek seferde bildirilir.
  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_conflicts FROM (
    SELECT jsonb_build_object('kind', 'topic', 'id', t.id, 'title', t.title) c
      FROM jsonb_array_elements(COALESCE(p_changes->'topics', '[]'::jsonb)) x
      JOIN public.sifa_topics t ON t.id = (x->>'id')::uuid AND t.tenant_id = p_tenant AND t.owner_key = p_owner
     WHERE x->>'base_version' IS NOT NULL AND t.version <> (x->>'base_version')::int
    UNION ALL
    SELECT jsonb_build_object('kind', 'block', 'id', b.id, 'title', b.title)
      FROM jsonb_array_elements(COALESCE(p_changes->'blocks', '[]'::jsonb)) x
      JOIN public.sifa_topic_blocks b ON b.id = (x->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner
     WHERE x->>'base_version' IS NOT NULL AND b.version <> (x->>'base_version')::int
  ) q;
  IF jsonb_array_length(v_conflicts) > 0 THEN
    RAISE EXCEPTION 'sifa_conflict' USING ERRCODE = 'PT409', DETAIL = v_conflicts::text;
  END IF;

  -- 1) Yeni konular: üstü tabloda olanlar önce (tekrarlı geçiş).
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_pending
  FROM jsonb_array_elements(COALESCE(p_changes->'topics', '[]'::jsonb)) x
  WHERE x->>'base_version' IS NULL;
  LOOP
    EXIT WHEN jsonb_array_length(v_pending) = 0;
    v_progress := false;
    v_next := '[]'::jsonb;
    FOR r IN SELECT * FROM jsonb_array_elements(v_pending) LOOP
      IF r->>'parent_id' IS NULL OR EXISTS (
           SELECT 1 FROM public.sifa_topics p
           WHERE p.id = (r->>'parent_id')::uuid AND p.tenant_id = p_tenant AND p.owner_key = p_owner) THEN
        INSERT INTO public.sifa_topics (id, tenant_id, owner_key, scope, parent_id, title, sort_key, template_key, deleted_at, delete_batch_id)
        VALUES ((r->>'id')::uuid, p_tenant, p_owner, p_scope, (r->>'parent_id')::uuid, r->>'title', r->>'sort_key',
                r->>'template_key', (r->>'deleted_at')::timestamptz, (r->>'delete_batch_id')::uuid);
        v_topics := v_topics || jsonb_build_object(r->>'id', 1);
        v_progress := true;
      ELSE
        v_next := v_next || jsonb_build_array(r);
      END IF;
    END LOOP;
    IF NOT v_progress THEN
      RAISE EXCEPTION 'sifa_parent_missing' USING ERRCODE = '23503';
    END IF;
    v_pending := v_next;
  END LOOP;

  -- 2) Güncellenen konular: kökten yaprağa.
  FOR r IN
    SELECT x FROM jsonb_array_elements(COALESCE(p_changes->'topics', '[]'::jsonb)) x
    LEFT JOIN LATERAL (
      WITH RECURSIVE up AS (
        SELECT t.id, t.parent_id, 0 AS d FROM public.sifa_topics t WHERE t.id = (x->>'id')::uuid
        UNION ALL
        SELECT p.id, p.parent_id, up.d + 1 FROM public.sifa_topics p JOIN up ON p.id = up.parent_id WHERE up.d < 25
      ) SELECT max(d) AS depth FROM up
    ) dd ON true
    WHERE x->>'base_version' IS NOT NULL
    ORDER BY COALESCE(dd.depth, 0), x->>'id'
  LOOP
    UPDATE public.sifa_topics t
       SET parent_id = (r->>'parent_id')::uuid, title = r->>'title', sort_key = r->>'sort_key',
           template_key = r->>'template_key', deleted_at = (r->>'deleted_at')::timestamptz,
           delete_batch_id = (r->>'delete_batch_id')::uuid, version = t.version + 1, updated_at = now()
     WHERE t.id = (r->>'id')::uuid AND t.tenant_id = p_tenant AND t.owner_key = p_owner
       AND t.version = (r->>'base_version')::int
    RETURNING t.version INTO v_version;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      IF EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = (r->>'id')::uuid AND t.tenant_id = p_tenant AND t.owner_key = p_owner) THEN
        RAISE EXCEPTION 'sifa_conflict' USING ERRCODE = 'PT409',
          DETAIL = jsonb_build_array(jsonb_build_object('kind', 'topic', 'id', r->>'id', 'title', r->>'title'))::text;
      END IF;
      RAISE EXCEPTION 'sifa_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_topics := v_topics || jsonb_build_object(r->>'id', v_version);
  END LOOP;

  -- 3) Kutular (+ kaynakları bütünüyle yenilenir).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes->'blocks', '[]'::jsonb)) LOOP
    IF r->>'base_version' IS NULL THEN
      INSERT INTO public.sifa_topic_blocks (id, tenant_id, owner_key, scope, topic_id, title, content_json, content_text,
                                            classification, sort_key, deleted_at, delete_batch_id)
      VALUES ((r->>'id')::uuid, p_tenant, p_owner, p_scope, (r->>'topic_id')::uuid, r->>'title', r->'content_json',
              COALESCE(r->>'content_text', ''), r->>'classification', r->>'sort_key',
              (r->>'deleted_at')::timestamptz, (r->>'delete_batch_id')::uuid);
      v_version := 1;
    ELSE
      UPDATE public.sifa_topic_blocks b
         SET topic_id = (r->>'topic_id')::uuid, title = r->>'title', content_json = r->'content_json',
             content_text = COALESCE(r->>'content_text', ''), classification = r->>'classification',
             sort_key = r->>'sort_key', deleted_at = (r->>'deleted_at')::timestamptz,
             delete_batch_id = (r->>'delete_batch_id')::uuid, version = b.version + 1, updated_at = now()
       WHERE b.id = (r->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner
         AND b.version = (r->>'base_version')::int
      RETURNING b.version INTO v_version;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        IF EXISTS (SELECT 1 FROM public.sifa_topic_blocks b WHERE b.id = (r->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner) THEN
          RAISE EXCEPTION 'sifa_conflict' USING ERRCODE = 'PT409',
            DETAIL = jsonb_build_array(jsonb_build_object('kind', 'block', 'id', r->>'id', 'title', r->>'title'))::text;
        END IF;
        RAISE EXCEPTION 'sifa_not_found' USING ERRCODE = 'P0002';
      END IF;
      DELETE FROM public.sifa_block_sources s WHERE s.block_id = (r->>'id')::uuid AND s.owner_key = p_owner AND s.tenant_id = p_tenant;
    END IF;
    v_pos := 0;
    FOR v_src IN SELECT * FROM jsonb_array_elements(COALESCE(r->'sources', '[]'::jsonb)) LOOP
      INSERT INTO public.sifa_block_sources (id, tenant_id, owner_key, block_id, kind, title, authors, year, doi, url, position)
      VALUES ((v_src->>'id')::uuid, p_tenant, p_owner, (r->>'id')::uuid, v_src->>'kind', v_src->>'title',
              NULLIF(v_src->>'authors', ''), NULLIF(v_src->>'year', ''), NULLIF(v_src->>'doi', ''), NULLIF(v_src->>'url', ''), v_pos);
      v_pos := v_pos + 1;
    END LOOP;
    v_blocks := v_blocks || jsonb_build_object(r->>'id', v_version);
  END LOOP;

  -- 4) Bağlantılar: mükerrersiz; kaldırma yalnız aynı kapsamdakiler.
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes->'links_add', '[]'::jsonb)) LOOP
    INSERT INTO public.sifa_topic_links (id, tenant_id, owner_key, from_topic_id, to_topic_id)
    VALUES ((r->>'id')::uuid, p_tenant, p_owner, (r->>'from_topic_id')::uuid, (r->>'to_topic_id')::uuid)
    ON CONFLICT (owner_key, from_topic_id, to_topic_id) DO NOTHING;
  END LOOP;
  DELETE FROM public.sifa_topic_links l
   WHERE l.tenant_id = p_tenant AND l.owner_key = p_owner
     AND l.id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(COALESCE(p_changes->'links_remove', '[]'::jsonb)) x);

  -- 5) Görseller: kutulara bağlanan, BU sahibin taslak yüklemeleri (yalnız upload, yalnız kendi).
  UPDATE public.sifa_block_assets a
     SET block_id = (m->>'block_id')::uuid
    FROM jsonb_array_elements(COALESCE(p_changes->'asset_links', '[]'::jsonb)) m
   WHERE a.id = (m->>'asset_id')::uuid AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.origin = 'upload';

  RETURN jsonb_build_object('topics', v_topics, 'blocks', v_blocks);
END;
$$;

-- ── Kaydet (KİŞİSEL kapsam): uzman yalnız kendi kayıtlarını yazar ────────────
CREATE OR REPLACE FUNCTION public.sifa_v2_apply_changeset(p_tenant uuid, p_user uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user IS NULL OR p_user = p_tenant THEN
    RAISE EXCEPTION 'sifa_scope_required' USING ERRCODE = '22023';
  END IF;
  RETURN public.sifa_v2__apply(p_tenant, p_user, 'kisisel', p_changes);
END;
$$;

-- ── V1 → V2 aktarım (KURUM kapsamı): satırlar + görsel referansları + harita, TEK işlem ──
CREATE OR REPLACE FUNCTION public.sifa_v2_import_legacy(p_tenant uuid, p_changes jsonb, p_map jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res jsonb;
  m jsonb;
BEGIN
  v_res := public.sifa_v2__apply(p_tenant, p_tenant, 'kurum', p_changes);
  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes->'assets', '[]'::jsonb)) LOOP
    INSERT INTO public.sifa_block_assets (id, tenant_id, owner_key, scope, block_id, origin, bucket, storage_path, caption)
    VALUES ((m->>'id')::uuid, p_tenant, p_tenant, 'kurum', (m->>'block_id')::uuid, 'legacy_ref', 'stone-photos', m->>'storage_path', m->>'caption');
  END LOOP;
  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(p_map, '[]'::jsonb)) LOOP
    INSERT INTO public.sifa_legacy_import_map (tenant_id, legacy_kind, legacy_id, target_kind, target_id, source_hash)
    VALUES (p_tenant, m->>'legacy_kind', m->>'legacy_id', m->>'target_kind', (m->>'target_id')::uuid, m->>'source_hash');
  END LOOP;
  RETURN v_res;
END;
$$;

-- Deterministik, STANDART biçimli UUID (sürüm 5 / RFC 4122 varyantı) — md5 tabanlı.
-- (Ham md5::uuid sürüm/varyant bitlerini taşımaz → API kimlik doğrulaması reddeder.)
CREATE OR REPLACE FUNCTION public.sifa_v2__det_uuid(p text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (substr(h, 1, 12) || '5' || substr(h, 14, 3) || '8' || substr(h, 18))::uuid FROM (SELECT md5(p) AS h) x;
$$;

-- ── Kurum kaydını KİŞİSEL KOPYAYA dönüştürme (özgün kayda DOKUNULMAZ) ────────
-- Deterministik kimlik (sifa_v2__det_uuid(kullanıcı:özgün)) → aynı uzman ikinci kez kopyalarsa mevcut kopya döner.
CREATE OR REPLACE FUNCTION public.sifa_v2_copy_shared(p_tenant uuid, p_user uuid, p_root uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_root uuid;
  v_sort text;
  v_count int;
BEGIN
  IF p_user IS NULL OR p_user = p_tenant THEN
    RAISE EXCEPTION 'sifa_scope_required' USING ERRCODE = '22023';
  END IF;
  v_new_root := public.sifa_v2__det_uuid(p_user::text || ':' || p_root::text);
  IF NOT EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = p_root AND t.tenant_id = p_tenant AND t.owner_key = p_tenant
                   AND t.scope = 'kurum' AND t.parent_id IS NULL AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'sifa_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = v_new_root AND t.owner_key = p_user) THEN
    RETURN jsonb_build_object('root_id', v_new_root, 'created', false);
  END IF;
  SELECT COALESCE(max(t.sort_key COLLATE "C"), '') || 'z' INTO v_sort FROM public.sifa_topics t
   WHERE t.tenant_id = p_tenant AND t.owner_key = p_user AND t.parent_id IS NULL;
  CREATE TEMP TABLE sifa_copy_ids ON COMMIT DROP AS
    WITH RECURSIVE sub AS (
      SELECT t.id, 0 AS d FROM public.sifa_topics t WHERE t.id = p_root
      UNION ALL
      SELECT c.id, sub.d + 1 FROM public.sifa_topics c JOIN sub ON c.parent_id = sub.id
       WHERE c.owner_key = p_tenant AND c.deleted_at IS NULL
    ) SELECT id, d, public.sifa_v2__det_uuid(p_user::text || ':' || id::text) AS nid FROM sub;
  INSERT INTO public.sifa_topics (id, tenant_id, owner_key, scope, parent_id, title, sort_key, template_key)
  SELECT m.nid, p_tenant, p_user, 'kisisel', pm.nid,
         CASE WHEN t.id = p_root THEN left(t.title, 183) || ' — kişisel kopya' ELSE t.title END,
         CASE WHEN t.id = p_root THEN v_sort ELSE t.sort_key END, t.template_key
    FROM sifa_copy_ids m JOIN public.sifa_topics t ON t.id = m.id
    LEFT JOIN sifa_copy_ids pm ON pm.id = t.parent_id
   ORDER BY m.d;
  INSERT INTO public.sifa_topic_blocks (id, tenant_id, owner_key, scope, topic_id, title, content_json, content_text, classification, sort_key)
  SELECT public.sifa_v2__det_uuid(p_user::text || ':' || b.id::text), p_tenant, p_user, 'kisisel', m.nid, b.title, b.content_json, b.content_text, b.classification, b.sort_key
    FROM public.sifa_topic_blocks b JOIN sifa_copy_ids m ON m.id = b.topic_id
   WHERE b.owner_key = p_tenant AND b.deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.sifa_block_sources (id, tenant_id, owner_key, block_id, kind, title, authors, year, doi, url, position)
  SELECT public.sifa_v2__det_uuid(p_user::text || ':' || s.id::text), p_tenant, p_user, public.sifa_v2__det_uuid(p_user::text || ':' || s.block_id::text),
         s.kind, s.title, s.authors, s.year, s.doi, s.url, s.position
    FROM public.sifa_block_sources s JOIN public.sifa_topic_blocks b ON b.id = s.block_id
    JOIN sifa_copy_ids m ON m.id = b.topic_id
   WHERE s.owner_key = p_tenant AND b.deleted_at IS NULL;
  INSERT INTO public.sifa_topic_links (id, tenant_id, owner_key, from_topic_id, to_topic_id)
  SELECT public.sifa_v2__det_uuid(p_user::text || ':' || l.id::text), p_tenant, p_user, f.nid, tt.nid
    FROM public.sifa_topic_links l JOIN sifa_copy_ids f ON f.id = l.from_topic_id JOIN sifa_copy_ids tt ON tt.id = l.to_topic_id
   WHERE l.owner_key = p_tenant;
  DROP TABLE sifa_copy_ids;
  -- Kurum görsel referansları KOPYALANMAZ: kopya içerik aynı kurum görseline (aynı tenant) başvurur.
  RETURN jsonb_build_object('root_id', v_new_root, 'created', true, 'blocks', v_count);
END;
$$;

-- ── Görsel yetkisi: yalnız kişisel (kendi) + kendi tenant'ının kurum görselleri ──
CREATE OR REPLACE FUNCTION public.sifa_v2_register_upload(p_tenant uuid, p_user uuid, p_asset jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user IS NULL OR p_user = p_tenant THEN
    RAISE EXCEPTION 'sifa_scope_required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.sifa_block_assets (id, tenant_id, owner_key, scope, block_id, origin, bucket, storage_path, mime_type, byte_size, caption)
  VALUES ((p_asset->>'id')::uuid, p_tenant, p_user, 'kisisel', NULL, 'upload', 'sifa-arastirma', p_asset->>'storage_path',
          p_asset->>'mime_type', (p_asset->>'byte_size')::int, NULLIF(p_asset->>'caption', ''));
  RETURN jsonb_build_object('id', p_asset->>'id');
END;
$$;

CREATE OR REPLACE FUNCTION public.sifa_v2_visible_assets(p_tenant uuid, p_user uuid, p_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'bucket', a.bucket, 'storage_path', a.storage_path,
                                               'mime_type', a.mime_type, 'scope', a.scope)), '[]'::jsonb)
    FROM public.sifa_block_assets a
   WHERE p_user IS NOT NULL AND p_user <> p_tenant
     AND a.id = ANY (p_ids) AND a.tenant_id = p_tenant AND a.owner_key IN (p_user, p_tenant);
$$;

-- ── Çöp Kutusu: 30 günü dolan KİŞİSEL kayıtların kalıcı temizliği ────────────
-- Adım 1 (aday): silinecek satırlar + bunlara bağlı YÜKLENMİŞ nesneler + 1 günden eski sahipsiz yüklemeler.
-- Adım 2 (iş): nesneler Storage'dan silinir; ANCAK BAŞARIYLA silinenlerin kimlikleriyle
-- Adım 3 (kalıcı): sifa_v2_trash_purge satırları siler. Nesnesi silinemeyen görselin kutusu bu turda kalır.
CREATE OR REPLACE FUNCTION public.sifa_v2_trash_candidates(p_cutoff timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH dead_blocks AS (
    SELECT b.id FROM public.sifa_topic_blocks b
     WHERE b.scope = 'kisisel' AND (
           (b.deleted_at IS NOT NULL AND b.deleted_at < p_cutoff)
        OR EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = b.topic_id AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff))
  ), dead_assets AS (
    SELECT a.id, a.bucket, a.storage_path FROM public.sifa_block_assets a
     WHERE a.scope = 'kisisel' AND a.origin = 'upload' AND (
           a.block_id IN (SELECT id FROM dead_blocks)
        OR (a.block_id IS NULL AND a.created_at < now() - interval '1 day'
            AND NOT EXISTS (SELECT 1 FROM public.sifa_topic_blocks b
                             WHERE b.owner_key = a.owner_key AND b.deleted_at IS NULL
                               AND strpos(b.content_json::text, 'sifa-asset:' || a.id::text) > 0)))
  )
  SELECT jsonb_build_object(
    'topics', (SELECT COALESCE(jsonb_agg(t.id), '[]'::jsonb) FROM public.sifa_topics t
                WHERE t.scope = 'kisisel' AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff),
    'blocks', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM dead_blocks),
    'assets', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'storage_path', storage_path)), '[]'::jsonb) FROM dead_assets));
$$;

CREATE OR REPLACE FUNCTION public.sifa_v2_trash_purge(p_cutoff timestamptz, p_removed_assets uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a int; v_b int; v_t int; v_total_t int := 0;
BEGIN
  -- Yalnız nesnesi GERÇEKTEN silinen görsel satırları silinir.
  DELETE FROM public.sifa_block_assets a WHERE a.id = ANY (p_removed_assets) AND a.scope = 'kisisel' AND a.origin = 'upload';
  GET DIAGNOSTICS v_a = ROW_COUNT;
  -- Nesnesi silinemeyen görseli olan kutu bu turda SİLİNMEZ (sonraki tur yeniden dener).
  DELETE FROM public.sifa_topic_blocks b
   WHERE b.scope = 'kisisel'
     AND ((b.deleted_at IS NOT NULL AND b.deleted_at < p_cutoff)
       OR EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = b.topic_id AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff))
     AND NOT EXISTS (SELECT 1 FROM public.sifa_block_assets a WHERE a.block_id = b.id);
  GET DIAGNOSTICS v_b = ROW_COUNT;
  -- Konular yapraktan köke (kutusu/alt başlığı kalmayanlar). Kurum kayıtlarına DOKUNULMAZ.
  LOOP
    DELETE FROM public.sifa_topics t
     WHERE t.scope = 'kisisel' AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff
       AND NOT EXISTS (SELECT 1 FROM public.sifa_topics c WHERE c.parent_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.sifa_topic_blocks b WHERE b.topic_id = t.id);
    GET DIAGNOSTICS v_t = ROW_COUNT;
    v_total_t := v_total_t + v_t;
    EXIT WHEN v_t = 0;
  END LOOP;
  RETURN jsonb_build_object('assets', v_a, 'blocks', v_b, 'topics', v_total_t);
END;
$$;

-- ── Özel Storage bucket (Storage şeması varsa; yerel test DB'sinde yoksa atlanır) ──
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('sifa-arastirma', 'sifa-arastirma', false, 10485760, ARRAY['image/png','image/jpeg','image/webp','image/gif']::text[])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']::text[];
  END IF;
END $$;

-- ── Erişim: tarayıcı rollerine hiçbir yetki yok; yalnız service_role ─────────
DO $$
DECLARE
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sifa_topics','sifa_topic_blocks','sifa_block_sources','sifa_topic_links','sifa_block_assets','sifa_legacy_import_map'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t); END IF;
    -- service_role (9. aşama): Supabase'in public şeması VARSAYILAN yetkileri yeni tabloya service_role'e TAM DML verir.
    -- Önce HEPSİ geri alınır; yalnız gerçekten kullanılanlar verilir:
    --   SELECT  : sunucu okuma yolları + yedek dışa aktarım (lib/backup/engine.ts).
    --   INSERT  : YALNIZ uygulama yedeğinden GERİ YÜKLEME (engine: INSERT … ON CONFLICT DO NOTHING; asla UPDATE/DELETE).
    --             Kayıt/kopya/aktarım/çöp yazıları SECURITY DEFINER fonksiyonlardan geçer (sahip yetkisiyle).
    --   UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER : HİÇBİR tabloda YOK.
    --   sifa_legacy_import_map: yedek dışı (türetilmiş) → yalnız SELECT.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
      IF t <> 'sifa_legacy_import_map' THEN
        EXECUTE format('GRANT INSERT ON TABLE public.%I TO service_role', t);
      END IF;
    END IF;
  END LOOP;
  -- Tetikleyici fonksiyonları doğrudan çağrılamaz; yine de varsayılan EXECUTE yetkileri tarayıcı rollerinden alınır.
  FOREACH f IN ARRAY ARRAY['public.sifa_topics_guard_tree()', 'public.sifa_topics_guard_template()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.sifa_v2_load(uuid, uuid)', 'public.sifa_v2__apply(uuid, uuid, text, jsonb)',
    'public.sifa_v2_apply_changeset(uuid, uuid, jsonb)', 'public.sifa_v2_import_legacy(uuid, jsonb, jsonb)',
    'public.sifa_v2_copy_shared(uuid, uuid, uuid)', 'public.sifa_v2_register_upload(uuid, uuid, jsonb)',
    'public.sifa_v2_visible_assets(uuid, uuid, uuid[])', 'public.sifa_v2_trash_candidates(timestamptz)',
    'public.sifa_v2_trash_purge(timestamptz, uuid[])', 'public.sifa_v2__det_uuid(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', f); END IF;
    -- İç yardımcı (sifa_v2__apply) HİÇBİR role açılmaz; yalnız sarmalayıcılar service_role'e.
    IF f NOT IN ('public.sifa_v2__apply(uuid, uuid, text, jsonb)', 'public.sifa_v2__det_uuid(text)') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

COMMIT;
