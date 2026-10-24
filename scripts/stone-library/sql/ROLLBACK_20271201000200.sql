-- Doğaltaş Kütüphanesi F3 — GERİ DÖNÜŞ (YALNIZ OWNER ONAYIYLA). F1 + F2'yi KORUR, yalnız F3 nesnelerini kaldırır.
-- Koruma: F3'e özgü veri (incelemede / yayına hazır taş, owner sağlık kararı, owner_decision modu) varsa DURUR → veri kaybı yok.
-- Mevcut hiçbir uygulama tablosuna dokunmaz.
-- TEK ADIM: F3'ün değiştirdiği fonksiyonların özgün F1 / F2 gövdeleri AYNI işlemde geri kurulur, alternatif ad RPC yetkisi geri
-- verilir, yayın belgeleri F2 biçimiyle yeniden üretilir. Ardından: scripts/stone-library/sql/f2_postflight_readonly.sql → PASS.
-- Bu dosya scripts/stone-library/build-f3-migration.py ile üretilir (f3_rollback_head + özgün gövdeler + f3_rollback_tail).
-- Kanıt: scripts/stone-library/pg/f3-rollback-check.mjs
-- Çalıştırmadan önce: SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F3';
BEGIN;
DO $$
BEGIN
  IF coalesce(current_setting('stone_library.rollback_confirm', true), '') <> 'DROP_STONE_LIBRARY_F3' THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: onay ayarı yok (stone_library.rollback_confirm)';
  END IF;
  IF to_regprocedure('public.stone_library_readiness(uuid)') IS NULL THEN RAISE NOTICE 'F3 zaten yok'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones WHERE status IN ('review','ready')) THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: "incelemede" / "yayına hazır" durumunda taş var (owner kararı gerekir).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones WHERE health_publish_decided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: owner sağlık yayın kararı kayıtlı (veri kaybı yaratılmaz).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_settings WHERE health_publication_mode <> 'legal_review' OR owner_decision_ref IS NOT NULL) THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: sağlık yayın modu owner_decision / owner karar referansı kayıtlı.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_settings WHERE medical_notice_tr <> 'Bu kütüphanede yer alan bilgiler doğaltaşlara ilişkin geleneksel, kültürel ve tamamlayıcı uygulama kaynaklarından derlenmiştir. Bilgiler tıbbi teşhis veya tedavi önerisi niteliğinde değildir ve profesyonel sağlık hizmetlerinin yerine geçmez.'
             OR medical_notice_en <> 'The information in this library has been compiled from traditional, cultural and complementary practice sources on natural stones. It does not constitute medical diagnosis or treatment advice and does not replace professional healthcare services.') THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: owner tıbbi bilgilendirme metnini değiştirmiş (metin kaybı yaratılmaz).';
  END IF;
END $$;

DO $$
DECLARE fn record;
BEGIN
  IF to_regprocedure('public.stone_library_readiness(uuid)') IS NULL THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS trg_stone_library_records_source_integrity ON public.stone_library_records;
  DROP TRIGGER IF EXISTS trg_stone_library_facets_source_integrity ON public.stone_library_facets;
  DROP TRIGGER IF EXISTS trg_stone_library_stones_source_name ON public.stone_library_stones;
  DROP TRIGGER IF EXISTS trg_stone_library_images_binding ON public.stone_library_images;
  DROP TRIGGER IF EXISTS trg_stone_library_records_field_path ON public.stone_library_records;
  DROP TRIGGER IF EXISTS trg_stone_library_facets_field_path ON public.stone_library_facets;
  DROP TRIGGER IF EXISTS trg_stone_library_sources_kind ON public.stone_library_sources;
  DROP TRIGGER IF EXISTS trg_stone_library_external_ids_link ON public.stone_library_external_ids;
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('stone_library_health_ok','stone_library_source_integrity_guard','stone_library_source_name_guard',
               'stone_library_image_binding_guard','stone_library_field_path','stone_library_field_path_guard','stone_library_readiness',
               'stone_library_owner_readiness','stone_library_health_decision','stone_library_owner_bulk_review','stone_library_owner_integrity',
               'stone_library_expert_facets','stone_library_source_kind_guard','stone_library_external_link_guard','stone_library_integrity','stone_library_facet_raw_key') LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.sig);
  END LOOP;
  ALTER TABLE public.stone_library_stones DROP CONSTRAINT IF EXISTS stone_library_stones_status_check;
  ALTER TABLE public.stone_library_stones ADD CONSTRAINT stone_library_stones_status_check CHECK (status IN ('draft','published','hidden'));
  ALTER TABLE public.stone_library_stones DROP CONSTRAINT IF EXISTS stone_library_stones_health_decision_chk;
  ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS health_publish_decided_at;
  ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS health_publish_decided_by;
  ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS health_publish_note;
  ALTER TABLE public.stone_library_settings DROP CONSTRAINT IF EXISTS stone_library_settings_health_ref_chk;
  ALTER TABLE public.stone_library_settings ADD CONSTRAINT stone_library_settings_health_ref_chk
    CHECK (NOT health_content_publication_enabled OR legal_review_ref IS NOT NULL);
  ALTER TABLE public.stone_library_settings DROP CONSTRAINT IF EXISTS stone_library_settings_mode_chk;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS health_publication_mode;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS owner_decision_ref;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS medical_notice_tr;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS medical_notice_en;
END $$;

-- ─── F3'ün değiştirdiği fonksiyonların özgün gövdeleri (F1: durum / ayarlar / facet; F2: yayın / arama / görsel) ───
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


-- Alternatif ad RPC'sinin F1 yetkisi geri verilir; yayın belgeleri F2 biçimiyle yeniden üretilir.
GRANT EXECUTE ON FUNCTION public.stone_library_name_add(uuid, uuid, text, text, text, uuid, uuid) TO service_role;
SELECT public.stone_library_refresh_all();
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20271201000200';
COMMIT;
