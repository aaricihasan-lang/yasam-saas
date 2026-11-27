-- =============================================================================
-- Şifa Rehberi F3 — onaylı F2 (Revizyon 7) tasarımının veri modeli (yalnız EKLEME + fonksiyon güncellemesi)
--
-- ⚠️ PRODUCTION'A UYGULANMASI AYRI OWNER ONAYI GEREKTİRİR. Ön koşul: 20280124000000_sifa_v2_asset_lifecycle.sql
--    (bu dosya onun yaşam döngüsü fonksiyonlarını genişletir). Sıra ve geri dönüş: docs/sifa-rehberi-f3/yayin-ve-geri-donus.md
--
-- Owner kararları (F3 onayı, 26.11.2026):
--  * Şifa Rehberi TAMAMEN KİŞİSEL kütüphane: okuma yalnız kendi kayıtları (kurum kapsamı ekrana/API'ye gelmez).
--  * Hazır başlık bu konuda yeniden adlandırılabilir ve silinebilir (yeri ve anahtarı sabit kalır).
--  * Kullanıcı başlığı "grup" olabilir (not yazılmaz; eski notları korunur).
--  * Not = başlık altındaki üst kutu (parent_block_id NULL); İçerik kutusu = notun alt kutusu (tek seviye).
--  * İçerik kutusu KALICI silinir (Silinenler'e gitmez); not/başlık/konu silme yumuşak (30 gün Silinenler).
--  * Kaynak ile web bağlantısı ayrı: sifa_block_sources.kind = 'baglanti'.
--
-- Veri güvenliği: HİÇBİR satır güncellenmez/silinmez/taşınmaz. Yeni sütunlar boş başlar (eski satırlar = not).
-- Eski istemcinin değişiklik kümesi (V2) aynen kabul edilir: yeni anahtarlar yoksa eski değerler korunur.
-- Güvenlik: çöpe atma zamanı artık SUNUCU saatidir (istemcinin gönderdiği zaman yok sayılır — F3-A orta risk).
--           Görsel başka kutuya taşınamaz (yalnız bağsız ya da aynı kutu). Galeri görseli çöp temizliğinde korunur.
-- =============================================================================
BEGIN;

-- ── 1) Başlık türü (kullanıcı grup başlığı) ─────────────────────────────────
ALTER TABLE public.sifa_topics ADD COLUMN IF NOT EXISTS node_kind text;
ALTER TABLE public.sifa_topics DROP CONSTRAINT IF EXISTS sifa_topics_node_kind_chk;
ALTER TABLE public.sifa_topics ADD CONSTRAINT sifa_topics_node_kind_chk
  CHECK (node_kind IS NULL OR (node_kind = 'grup' AND template_key IS NULL AND parent_id IS NOT NULL));

-- Hazır başlık: anahtarı ve yeri SABİT; adı yalnız bu konuda değişebilir; tek başına çöpe atılabilir.
-- bolum:* yalnız ana konunun hemen altında. Kapsam (scope/owner_key/tenant) sonradan değiştirilemez.
CREATE OR REPLACE FUNCTION public.sifa_topics_guard_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
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
  IF NEW.template_key IS DISTINCT FROM OLD.template_key OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'sifa_template_locked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2) Notlar ve içerik kutuları ────────────────────────────────────────────
ALTER TABLE public.sifa_topic_blocks ADD COLUMN IF NOT EXISTS parent_block_id uuid;
ALTER TABLE public.sifa_topic_blocks ADD COLUMN IF NOT EXISTS content_updated_at timestamptz;
ALTER TABLE public.sifa_topic_blocks DROP CONSTRAINT IF EXISTS sifa_blocks_parent_same_owner_fk;
ALTER TABLE public.sifa_topic_blocks ADD CONSTRAINT sifa_blocks_parent_same_owner_fk
  FOREIGN KEY (parent_block_id, tenant_id, owner_key) REFERENCES public.sifa_topic_blocks (id, tenant_id, owner_key) ON DELETE CASCADE;
ALTER TABLE public.sifa_topic_blocks DROP CONSTRAINT IF EXISTS sifa_blocks_parent_not_self;
ALTER TABLE public.sifa_topic_blocks ADD CONSTRAINT sifa_blocks_parent_not_self CHECK (parent_block_id IS NULL OR parent_block_id <> id);
CREATE INDEX IF NOT EXISTS sifa_blocks_parent_idx ON public.sifa_topic_blocks (parent_block_id) WHERE parent_block_id IS NOT NULL;
-- Not ve kutu adı isteğe bağlı (F2: "Başlıksız not" / "Adsız kutu"); üst sınır aynı.
ALTER TABLE public.sifa_topic_blocks DROP CONSTRAINT IF EXISTS sifa_topic_blocks_title_check;
ALTER TABLE public.sifa_topic_blocks DROP CONSTRAINT IF EXISTS sifa_blocks_title_len;
ALTER TABLE public.sifa_topic_blocks ADD CONSTRAINT sifa_blocks_title_len CHECK (char_length(title) <= 200);

-- Kutu tek seviyedir, üst notu AYNI başlıktadır; üst bağı sonradan değişmez; kutulu not başka başlığa taşınamaz.
CREATE OR REPLACE FUNCTION public.sifa_blocks_guard_nest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_pp uuid;
  v_pt uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.parent_block_id IS DISTINCT FROM OLD.parent_block_id THEN
    RAISE EXCEPTION 'sifa_block_nesting' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_block_id IS NOT NULL THEN
    -- Yalnız AYNI sahibin notu aranır: başka uzmanın notu "yok" sayılır → bileşik FK reddeder (404; varlık sızmaz).
    SELECT p.parent_block_id, p.topic_id INTO v_pp, v_pt FROM public.sifa_topic_blocks p
     WHERE p.id = NEW.parent_block_id AND p.tenant_id = NEW.tenant_id AND p.owner_key = NEW.owner_key;
    IF FOUND AND (v_pp IS NOT NULL OR v_pt IS DISTINCT FROM NEW.topic_id) THEN
      RAISE EXCEPTION 'sifa_block_nesting' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.topic_id IS DISTINCT FROM OLD.topic_id
        AND EXISTS (SELECT 1 FROM public.sifa_topic_blocks c WHERE c.parent_block_id = NEW.id) THEN
    RAISE EXCEPTION 'sifa_block_nesting' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sifa_blocks_guard_nest_trg ON public.sifa_topic_blocks;
CREATE TRIGGER sifa_blocks_guard_nest_trg
  BEFORE INSERT OR UPDATE OF parent_block_id, topic_id ON public.sifa_topic_blocks
  FOR EACH ROW EXECUTE FUNCTION public.sifa_blocks_guard_nest();

-- ── 3) Web bağlantısı kaynaktan ayrı tür ────────────────────────────────────
ALTER TABLE public.sifa_block_sources DROP CONSTRAINT IF EXISTS sifa_block_sources_kind_check;
ALTER TABLE public.sifa_block_sources DROP CONSTRAINT IF EXISTS sifa_sources_kind_chk;
ALTER TABLE public.sifa_block_sources ADD CONSTRAINT sifa_sources_kind_chk
  CHECK (kind IN ('makale','kitap','web','geleneksel','diger','baglanti'));

-- ── 4) Okuma: YALNIZ KİŞİSEL (Owner kararı) + yeni alanlar + kutu görselleri ─
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
        'template_key', t.template_key, 'node_kind', t.node_kind, 'version', t.version, 'created_at', t.created_at,
        'updated_at', t.updated_at, 'deleted_at', t.deleted_at, 'delete_batch_id', t.delete_batch_id)
        ORDER BY t.parent_id NULLS FIRST, t.sort_key)
      FROM public.sifa_topics t
      WHERE p_user IS NOT NULL AND p_user <> p_tenant
        AND t.tenant_id = p_tenant AND t.owner_key = p_user AND t.scope = 'kisisel'
        AND (t.deleted_at IS NULL OR t.deleted_at > now() - interval '30 days')), '[]'::jsonb),
    'blocks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'scope', b.scope, 'topic_id', b.topic_id, 'parent_block_id', b.parent_block_id,
        'title', b.title, 'content_json', b.content_json,
        'content_text', b.content_text, 'classification', b.classification, 'sort_key', b.sort_key,
        'version', b.version, 'created_at', b.created_at, 'updated_at', b.updated_at,
        'content_updated_at', b.content_updated_at,
        'deleted_at', b.deleted_at, 'delete_batch_id', b.delete_batch_id,
        'sources', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title,
                   'authors', s.authors, 'year', s.year, 'doi', s.doi, 'url', s.url) ORDER BY s.position)
          FROM public.sifa_block_sources s
          WHERE s.block_id = b.id AND s.owner_key = b.owner_key AND s.tenant_id = p_tenant), '[]'::jsonb),
        'assets', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', a.id, 'caption', a.caption, 'mime_type', a.mime_type,
                   'created_at', a.created_at) ORDER BY a.created_at, a.id)
          FROM public.sifa_block_assets a
          WHERE a.block_id = b.id AND a.owner_key = b.owner_key AND a.tenant_id = p_tenant), '[]'::jsonb))
        ORDER BY b.topic_id, b.sort_key)
      FROM public.sifa_topic_blocks b
      WHERE p_user IS NOT NULL AND p_user <> p_tenant
        AND b.tenant_id = p_tenant AND b.owner_key = p_user AND b.scope = 'kisisel'
        AND (b.deleted_at IS NULL OR b.deleted_at > now() - interval '30 days')), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'from_topic_id', l.from_topic_id,
               'to_topic_id', l.to_topic_id, 'created_at', l.created_at) ORDER BY l.created_at, l.id)
      FROM public.sifa_topic_links l
      WHERE p_user IS NOT NULL AND p_user <> p_tenant
        AND l.tenant_id = p_tenant AND l.owner_key = p_user), '[]'::jsonb)
  );
$$;

-- ── 5) Kaydet çekirdeği (tek işlem; geriye uyumlu üst küme) ─────────────────
-- Yeni anahtarlar:
--   topics[].node_kind            : 'grup' | null (anahtar yoksa mevcut değer korunur)
--   blocks[].parent_block_id      : not = null, kutu = üst notun kimliği (yalnız oluşturmada; sonradan değişmez)
--   blocks_delete[{id,base_version}] : YALNIZ içerik kutusu KALICI silinir (kaynakları FK ile; görselleri burada)
--   assets_set[{id,block_id,caption}]: kendi yüklemesini kutuya bağlar / açıklamasını yazar (başka kutudan TAŞIMA YOK)
--                                      (ad 'assets_set': V1 aktarımının p_changes->'assets' anahtarıyla çakışmaz)
--   assets_delete[id]                : kendi yüklemesini kaldırır (nesne yolu sonuçta döner; sunucu Storage'dan siler)
-- Zamanlar sunucudadır: deleted_at = now() (ilk çöpe atılışta), content_updated_at = gerçek içerik değişiminde.
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
  v_removed jsonb := '[]'::jsonb;
  v_touch uuid[] := '{}'::uuid[];
  v_old_title text;
  v_old_json jsonb;
  v_old_class text;
  v_old_parent uuid;
  v_old_deleted timestamptz;
  v_old_sources jsonb;
  v_new_sources jsonb;
  v_changed boolean;
  v_parent uuid;
  v_found boolean;
BEGIN
  IF p_tenant IS NULL OR p_owner IS NULL THEN
    RAISE EXCEPTION 'sifa_scope_required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'sifa_bad_changeset' USING ERRCODE = '22023';
  END IF;

  -- 0) Çakışma ön denetimi: sürümü değişmiş TÜM satırlar tek seferde bildirilir (kalıcı silinecek kutular dahil).
  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_conflicts FROM (
    SELECT jsonb_build_object('kind', 'topic', 'id', t.id, 'title', t.title) c
      FROM jsonb_array_elements(COALESCE(p_changes->'topics', '[]'::jsonb)) x
      JOIN public.sifa_topics t ON t.id = (x->>'id')::uuid AND t.tenant_id = p_tenant AND t.owner_key = p_owner
     WHERE x->>'base_version' IS NOT NULL AND t.version <> (x->>'base_version')::int
    UNION ALL
    SELECT jsonb_build_object('kind', 'block', 'id', b.id, 'title', b.title)
      FROM jsonb_array_elements(COALESCE(p_changes->'blocks', '[]'::jsonb) || COALESCE(p_changes->'blocks_delete', '[]'::jsonb)) x
      JOIN public.sifa_topic_blocks b ON b.id = (x->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner
     WHERE x->>'base_version' IS NOT NULL AND b.version <> (x->>'base_version')::int
  ) q;
  IF jsonb_array_length(v_conflicts) > 0 THEN
    RAISE EXCEPTION 'sifa_conflict' USING ERRCODE = 'PT409', DETAIL = v_conflicts::text;
  END IF;

  -- 1) Yeni konular / başlıklar: üstü tabloda olanlar önce (tekrarlı geçiş).
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
        INSERT INTO public.sifa_topics (id, tenant_id, owner_key, scope, parent_id, title, sort_key, template_key, node_kind,
                                        deleted_at, delete_batch_id)
        VALUES ((r->>'id')::uuid, p_tenant, p_owner, p_scope, (r->>'parent_id')::uuid, r->>'title', r->>'sort_key',
                r->>'template_key', NULLIF(r->>'node_kind', ''),
                CASE WHEN r->>'deleted_at' IS NULL THEN NULL ELSE now() END, (r->>'delete_batch_id')::uuid);
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
           template_key = r->>'template_key',
           node_kind = CASE WHEN r ? 'node_kind' THEN NULLIF(r->>'node_kind', '') ELSE t.node_kind END,
           deleted_at = CASE WHEN r->>'deleted_at' IS NULL THEN NULL ELSE COALESCE(t.deleted_at, now()) END,
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

  -- 3) Notlar ve kutular (notlar önce; kaynaklar bütünüyle yenilenir).
  FOR r IN
    SELECT x FROM jsonb_array_elements(COALESCE(p_changes->'blocks', '[]'::jsonb)) WITH ORDINALITY AS e(x, n)
     ORDER BY (x->>'parent_block_id') IS NOT NULL, n
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s->>'kind', 'title', s->>'title', 'authors', NULLIF(s->>'authors', ''),
             'year', NULLIF(s->>'year', ''), 'doi', NULLIF(s->>'doi', ''), 'url', NULLIF(s->>'url', ''))), '[]'::jsonb)
      INTO v_new_sources FROM jsonb_array_elements(COALESCE(r->'sources', '[]'::jsonb)) s;
    IF r->>'base_version' IS NULL THEN
      INSERT INTO public.sifa_topic_blocks (id, tenant_id, owner_key, scope, topic_id, parent_block_id, title, content_json, content_text,
                                            classification, sort_key, content_updated_at, deleted_at, delete_batch_id)
      VALUES ((r->>'id')::uuid, p_tenant, p_owner, p_scope, (r->>'topic_id')::uuid, (r->>'parent_block_id')::uuid,
              COALESCE(r->>'title', ''), r->'content_json', COALESCE(r->>'content_text', ''), r->>'classification', r->>'sort_key',
              now(), CASE WHEN r->>'deleted_at' IS NULL THEN NULL ELSE now() END, (r->>'delete_batch_id')::uuid);
      v_version := 1;
      IF r->>'parent_block_id' IS NOT NULL THEN
        v_touch := v_touch || (r->>'parent_block_id')::uuid;
      END IF;
    ELSE
      SELECT b.title, b.content_json, b.classification, b.parent_block_id, b.deleted_at, true
        INTO v_old_title, v_old_json, v_old_class, v_old_parent, v_old_deleted, v_found
        FROM public.sifa_topic_blocks b
       WHERE b.id = (r->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'sifa_not_found' USING ERRCODE = 'P0002';
      END IF;
      SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'title', s.title, 'authors', s.authors, 'year', s.year,
               'doi', s.doi, 'url', s.url) ORDER BY s.position), '[]'::jsonb)
        INTO v_old_sources FROM public.sifa_block_sources s
       WHERE s.block_id = (r->>'id')::uuid AND s.owner_key = p_owner AND s.tenant_id = p_tenant;
      v_changed := v_old_title IS DISTINCT FROM COALESCE(r->>'title', '')
                OR v_old_json IS DISTINCT FROM r->'content_json'
                OR v_old_class IS DISTINCT FROM r->>'classification'
                OR v_old_sources IS DISTINCT FROM v_new_sources;
      UPDATE public.sifa_topic_blocks b
         SET topic_id = (r->>'topic_id')::uuid, title = COALESCE(r->>'title', ''), content_json = r->'content_json',
             content_text = COALESCE(r->>'content_text', ''), classification = r->>'classification',
             sort_key = r->>'sort_key',
             parent_block_id = CASE WHEN r ? 'parent_block_id' THEN (r->>'parent_block_id')::uuid ELSE b.parent_block_id END,
             content_updated_at = CASE WHEN v_changed THEN now() ELSE b.content_updated_at END,
             deleted_at = CASE WHEN r->>'deleted_at' IS NULL THEN NULL ELSE COALESCE(b.deleted_at, now()) END,
             delete_batch_id = (r->>'delete_batch_id')::uuid, version = b.version + 1, updated_at = now()
       WHERE b.id = (r->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner
         AND b.version = (r->>'base_version')::int
      RETURNING b.version INTO v_version;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        RAISE EXCEPTION 'sifa_conflict' USING ERRCODE = 'PT409',
          DETAIL = jsonb_build_array(jsonb_build_object('kind', 'block', 'id', r->>'id', 'title', r->>'title'))::text;
      END IF;
      -- Kutudaki gerçek değişiklik (ya da kutunun çöpe atılması/geri gelmesi) üst notun tarihine yansır.
      IF v_old_parent IS NOT NULL AND (v_changed OR (v_old_deleted IS NULL) <> (r->>'deleted_at' IS NULL)) THEN
        v_touch := v_touch || v_old_parent;
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

  -- 3b) İçerik kutusunu KALICI silme (Silinenler'e gitmez). Yalnız kutu; not burada silinemez.
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes->'blocks_delete', '[]'::jsonb)) LOOP
    SELECT b.parent_block_id, true INTO v_parent, v_found
      FROM public.sifa_topic_blocks b
     WHERE b.id = (r->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner
       AND b.version = (r->>'base_version')::int;
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.sifa_topic_blocks b WHERE b.id = (r->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner) THEN
        RAISE EXCEPTION 'sifa_conflict' USING ERRCODE = 'PT409',
          DETAIL = jsonb_build_array(jsonb_build_object('kind', 'block', 'id', r->>'id', 'title', ''))::text;
      END IF;
      RAISE EXCEPTION 'sifa_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_parent IS NULL THEN
      RAISE EXCEPTION 'sifa_block_not_box' USING ERRCODE = '23514';
    END IF;
    SELECT v_removed || COALESCE(jsonb_agg(jsonb_build_object('bucket', a.bucket, 'storage_path', a.storage_path)), '[]'::jsonb)
      INTO v_removed FROM public.sifa_block_assets a
     WHERE a.block_id = (r->>'id')::uuid AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.origin = 'upload';
    DELETE FROM public.sifa_block_assets a
     WHERE a.block_id = (r->>'id')::uuid AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.origin = 'upload';
    DELETE FROM public.sifa_topic_blocks b
     WHERE b.id = (r->>'id')::uuid AND b.tenant_id = p_tenant AND b.owner_key = p_owner AND b.parent_block_id IS NOT NULL;
    v_touch := v_touch || v_parent;
  END LOOP;

  -- 4) İlgili konu bağlantıları: mükerrersiz; kaldırma yalnız kendi kayıtlarında.
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes->'links_add', '[]'::jsonb)) LOOP
    INSERT INTO public.sifa_topic_links (id, tenant_id, owner_key, from_topic_id, to_topic_id)
    VALUES ((r->>'id')::uuid, p_tenant, p_owner, (r->>'from_topic_id')::uuid, (r->>'to_topic_id')::uuid)
    ON CONFLICT (owner_key, from_topic_id, to_topic_id) DO NOTHING;
  END LOOP;
  DELETE FROM public.sifa_topic_links l
   WHERE l.tenant_id = p_tenant AND l.owner_key = p_owner
     AND l.id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(COALESCE(p_changes->'links_remove', '[]'::jsonb)) x);

  -- 5) Görseller. Eski istemci (asset_links): yalnız BAĞSIZ ya da AYNI kutudaki kendi yüklemesi bağlanır.
  UPDATE public.sifa_block_assets a
     SET block_id = (m->>'block_id')::uuid
    FROM jsonb_array_elements(COALESCE(p_changes->'asset_links', '[]'::jsonb)) m
   WHERE a.id = (m->>'asset_id')::uuid AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.origin = 'upload'
     AND (a.block_id IS NULL OR a.block_id = (m->>'block_id')::uuid);
  -- F3: bağla + açıklama. Bulunamayan/başka kutudaki görsel → TÜM kayıt geri alınır (sessiz kayıp yok).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes->'assets_set', '[]'::jsonb)) LOOP
    UPDATE public.sifa_block_assets a
       SET block_id = (r->>'block_id')::uuid, caption = NULLIF(r->>'caption', '')
     WHERE a.id = (r->>'id')::uuid AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.origin = 'upload'
       AND (a.block_id IS NULL OR a.block_id = (r->>'block_id')::uuid);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'sifa_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_touch := v_touch || (r->>'block_id')::uuid;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes->'assets_delete', '[]'::jsonb)) LOOP
    SELECT a.block_id, true INTO v_parent, v_found FROM public.sifa_block_assets a
     WHERE a.id = (r #>> '{}')::uuid AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.origin = 'upload';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sifa_not_found' USING ERRCODE = 'P0002';
    END IF;
    SELECT v_removed || jsonb_build_array(jsonb_build_object('bucket', a.bucket, 'storage_path', a.storage_path))
      INTO v_removed FROM public.sifa_block_assets a WHERE a.id = (r #>> '{}')::uuid;
    DELETE FROM public.sifa_block_assets a
     WHERE a.id = (r #>> '{}')::uuid AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.origin = 'upload';
    IF v_parent IS NOT NULL THEN
      v_touch := v_touch || v_parent;
    END IF;
  END LOOP;

  -- 6) Tarih: değişen kutunun/görselin notu (ve kutunun üst notu) — sürüm artmaz (yalnız gösterim tarihi).
  IF array_length(v_touch, 1) IS NOT NULL THEN
    UPDATE public.sifa_topic_blocks b
       SET content_updated_at = now()
     WHERE b.tenant_id = p_tenant AND b.owner_key = p_owner
       AND (b.id = ANY (v_touch)
            OR b.id IN (SELECT c.parent_block_id FROM public.sifa_topic_blocks c
                         WHERE c.id = ANY (v_touch) AND c.parent_block_id IS NOT NULL));
  END IF;

  RETURN jsonb_build_object('topics', v_topics, 'blocks', v_blocks, 'removed_assets', v_removed);
END;
$$;

-- ── 6) Görsel yaşam döngüsü: kutuya BAĞLI galeri görseli de kullanımdadır; ölü notun kutusu da ölüdür ─
CREATE OR REPLACE FUNCTION public.sifa_v2__block_dead(p_block_id uuid, p_cutoff timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sifa_topic_blocks b
     WHERE b.id = p_block_id AND b.scope = 'kisisel' AND (
           (b.deleted_at IS NOT NULL AND b.deleted_at < p_cutoff)
        OR EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = b.topic_id AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff)
        OR EXISTS (SELECT 1 FROM public.sifa_topic_blocks p
                    WHERE p.id = b.parent_block_id AND p.deleted_at IS NOT NULL AND p.deleted_at < p_cutoff)));
$$;

CREATE OR REPLACE FUNCTION public.sifa_v2__asset_in_use(p_asset_id uuid, p_tenant uuid, p_owner uuid, p_cutoff timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sifa_topic_blocks b
     WHERE b.tenant_id = p_tenant AND b.owner_key = p_owner
       AND strpos(b.content_json::text, 'sifa-asset:' || p_asset_id::text) > 0
       AND NOT public.sifa_v2__block_dead(b.id, p_cutoff))
  OR EXISTS (
    SELECT 1 FROM public.sifa_block_assets a
     WHERE a.id = p_asset_id AND a.tenant_id = p_tenant AND a.owner_key = p_owner AND a.block_id IS NOT NULL
       AND NOT public.sifa_v2__block_dead(a.block_id, p_cutoff));
$$;

-- ── 7) Yetkiler: yeni tetikleyici fonksiyonu tarayıcı rollerine kapalı; yaşam döngüsü fonksiyonları yalnız service_role ─
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.sifa_blocks_guard_nest()', 'public.sifa_topics_guard_template()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.sifa_v2_load(uuid, uuid)', 'public.sifa_v2__apply(uuid, uuid, text, jsonb)',
    'public.sifa_v2__block_dead(uuid, timestamptz)', 'public.sifa_v2__asset_in_use(uuid, uuid, uuid, timestamptz)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- İç yardımcı __apply HİÇBİR role açılmaz (çekirdek migration ile aynı).
    EXECUTE 'REVOKE ALL ON FUNCTION public.sifa_v2__apply(uuid, uuid, text, jsonb) FROM service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2_load(uuid, uuid) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2__block_dead(uuid, timestamptz) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2__asset_in_use(uuid, uuid, uuid, timestamptz) TO service_role';
  END IF;
END $$;

COMMIT;
