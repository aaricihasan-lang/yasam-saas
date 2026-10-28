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
