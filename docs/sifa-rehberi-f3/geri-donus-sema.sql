-- =============================================================================
-- Şifa Rehberi F3 — ŞEMA GERİ DÖNÜŞÜ (yalnız Owner onayıyla; normal geri dönüş kod düzeyindedir — yayin-ve-geri-donus.md §3)
-- ÜRETİLMİŞ DOSYA: scripts/sifa-rehberi-f3/gen-geri-donus.mjs — elle düzenlemeyin.
-- Fonksiyonları F3 öncesine (çekirdek + yaşam döngüsü migration'ları) döndürür. Eklenen sütunlar (node_kind, parent_block_id,
-- content_updated_at) ve TÜM VERİ KALIR. Eski kısıtlar (boş olmayan başlık, kaynak türü) YALNIZ veri onlara uyuyorsa geri konur.
-- =============================================================================
BEGIN;

-- 20280130000100 (YH: not çöpü → kutular kuyruğa) — aktivasyon kapalıyken zaten no-op; tam geri dönüş için kaldırılır.
DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_note_trash_trg ON public.sifa_topic_blocks;
DROP FUNCTION IF EXISTS public.yh_sifa_v2_note_trash_enqueue();
DROP TRIGGER IF EXISTS sifa_blocks_guard_nest_trg ON public.sifa_topic_blocks;
DROP FUNCTION IF EXISTS public.sifa_blocks_guard_nest();

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
        OR EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = b.topic_id AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff)));
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
       AND NOT (
             (b.deleted_at IS NOT NULL AND b.deleted_at < p_cutoff)
          OR EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = b.topic_id AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff)));
$$;

-- Eski kısıtlar: yalnız veri uyuyorsa (aksi hâlde F3 kısıtı kalır; veri kaybı/hata yok).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sifa_topic_blocks WHERE char_length(btrim(title)) < 1) THEN
    ALTER TABLE public.sifa_topic_blocks DROP CONSTRAINT IF EXISTS sifa_blocks_title_len;
    ALTER TABLE public.sifa_topic_blocks ADD CONSTRAINT sifa_topic_blocks_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200);
  ELSE
    RAISE NOTICE 'boş başlıklı not/kutu var: F3 başlık kısıtı korunuyor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sifa_block_sources WHERE kind = 'baglanti') THEN
    ALTER TABLE public.sifa_block_sources DROP CONSTRAINT IF EXISTS sifa_sources_kind_chk;
    ALTER TABLE public.sifa_block_sources ADD CONSTRAINT sifa_block_sources_kind_check CHECK (kind IN ('makale','kitap','web','geleneksel','diger'));
  ELSE
    RAISE NOTICE '''baglanti'' türünde kayıt var: F3 tür kısıtı korunuyor';
  END IF;
END $$;

-- Yetkiler (çekirdek ile aynı): iç yardımcı hiçbir role açık değil; dış fonksiyonlar yalnız service_role.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.sifa_v2_load(uuid, uuid)', 'public.sifa_v2__apply(uuid, uuid, text, jsonb)',
    'public.sifa_v2__block_dead(uuid, timestamptz)', 'public.sifa_v2__asset_in_use(uuid, uuid, uuid, timestamptz)',
    'public.sifa_topics_guard_template()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sifa_v2__apply(uuid, uuid, text, jsonb) FROM service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2_load(uuid, uuid) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2__block_dead(uuid, timestamptz) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2__asset_in_use(uuid, uuid, uuid, timestamptz) TO service_role';
  END IF;
END $$;

COMMIT;
