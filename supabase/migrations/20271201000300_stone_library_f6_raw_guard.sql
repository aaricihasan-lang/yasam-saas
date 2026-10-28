-- Doğaltaş Kütüphanesi F6-A — raw_put GÜVENLİK KAPATMASI (F3 denetimi P2-7 / F4 açık teknik iş).
-- ÜRETİLİR: scripts/stone-library/build-f6-raw-guard.py (elle düzenleme yok). Geri dönüş: scripts/stone-library/sql/ROLLBACK_20271201000300.sql
--
-- Sorun: owner aktörüyle service_role üzerinden çağrılan stone_library_raw_put, çalışan bir pakete KEYFİ bir "ham sağlayıcı
-- yanıtı" yazabiliyordu; o yanıta bağlanan kayıtlar birebir kurallarından geçer, bütünlük denetimi de onları "birebir" sayardı.
--
-- Kapatma (katmanlı):
--   1) Yetki ayrımı: raw_put artık service_role'e (web uygulaması) KAPALI. Yalnız ayrı, oturum açamayan
--      stone_library_importer rolüne açık. Web oturumu (owner dahil) ham yanıt yazamaz; aktarım yalnız ayrı kimlik bilgisiyle
--      çalışan güvenilir çevrimdışı aktarım betiğinden yapılabilir.
--   2) Çağrı ayrımına bağlılık: her ham yanıt, aynı pakette ÖNCEDEN ayrılmış (reserve_call) ve henüz TÜKETİLMEMİŞ bir çağrıya
--      tek kullanımlık olarak bağlanır; harici kimlik ayrımdakiyle aynı olmalı. Ayrılmamış / fazla / tekrar ham yazım reddedilir.
--   3) Doğrudan tablo yazımı kapalı: stone_library_raw'a INSERT yalnız raw_put içinden (oturum bayrağı) yapılabilir.
--   4) Kanıt zinciri: bütünlük denetimi, tüketilmiş çağrı ayrımına bağlı olmayan ham yanıtı "raw_unverified" sayar → taş
--      yayına hazır / yayında olamaz (integrity_failed). SHA-256 sunucuda hesaplanır (mevcut tetikleyici).
-- Mevcut güvenlik modeli GEVŞETİLMEZ; tablo ayrıcalıkları değişmez (hiçbir rolün tablo ayrıcalığı yok).
-- Tek işlem (BEGIN/COMMIT): herhangi bir adım hata verirse hiçbir değişiklik kalmaz (yarım kurulum olmaz).

BEGIN;

-- ─── 0) Aktarım rolü (oturum açamaz; yalnız aktarım kimlik bilgisine üye olarak verilir) ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stone_library_importer') THEN
    CREATE ROLE stone_library_importer NOLOGIN;
  END IF;
END $$;

-- ─── 1) Çağrı ayrımları (aktarım defteri) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_library_call_reservations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid        NOT NULL REFERENCES public.stone_library_import_batches(id) ON DELETE RESTRICT,
  seq          integer     NOT NULL CHECK (seq >= 1),
  external_id  text        CHECK (external_id IS NULL OR external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  reserved_by  uuid,
  reserved_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at  timestamptz,
  raw_id       uuid        UNIQUE REFERENCES public.stone_library_raw(id) ON DELETE RESTRICT,
  CONSTRAINT stone_library_call_res_seq_uniq UNIQUE (batch_id, seq),
  CONSTRAINT stone_library_call_res_consume_chk CHECK ((consumed_at IS NULL) = (raw_id IS NULL))
);
CREATE INDEX IF NOT EXISTS stone_library_call_res_open_idx ON public.stone_library_call_reservations (batch_id, external_id, seq) WHERE consumed_at IS NULL;
ALTER TABLE public.stone_library_call_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stone_library_call_reservations FROM PUBLIC, anon, authenticated, service_role;

-- Ayrım satırı: tüketme dışında değiştirilemez, silinemez.
CREATE OR REPLACE FUNCTION public.stone_library_call_res_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'stone_library_call_reservations: silinemez' USING ERRCODE = 'SL012'; END IF;
  IF OLD.consumed_at IS NOT NULL
     OR (to_jsonb(NEW) - ARRAY['consumed_at','raw_id']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['consumed_at','raw_id']) THEN
    RAISE EXCEPTION 'stone_library_call_reservations: yalnız bir kez tüketilebilir' USING ERRCODE = 'SL012';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_call_res_guard ON public.stone_library_call_reservations;
CREATE TRIGGER trg_stone_library_call_res_guard BEFORE UPDATE OR DELETE ON public.stone_library_call_reservations
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_call_res_guard();

-- ─── 2) Ham tabloya doğrudan yazım kapalı: INSERT yalnız raw_put içinden ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_raw_insert_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF coalesce(current_setting('stone_library.raw_put', true), '') <> 'on' THEN
    RAISE EXCEPTION 'stone_library_raw: ham yanıt yalnız doğrulanmış aktarım akışından (raw_put) yazılır' USING ERRCODE = 'SL095';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_raw_insert_guard ON public.stone_library_raw;
CREATE TRIGGER trg_stone_library_raw_insert_guard BEFORE INSERT ON public.stone_library_raw
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_raw_insert_guard();

-- ─── 3) Çağrı ayırma: kredi + DEFTER satırı ────────────────────────────────────────────────────────────
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
  INSERT INTO public.stone_library_call_reservations (batch_id, seq, external_id, reserved_by) VALUES (p_batch_id, b.calls_used + 1, p_external_id, p_actor);
  INSERT INTO public.stone_library_import_events (batch_id, level, kind, external_id, actor) VALUES (p_batch_id, 'info', 'call_reserved', p_external_id, p_actor);
  RETURN b.calls_used + 1;
END $$;

-- ─── 4) Ham yanıt: yalnız aktarım rolü; ayrılmış + tüketilmemiş çağrıya tek kullanımlık bağ ──────────────────
CREATE OR REPLACE FUNCTION public.stone_library_raw_put(p_actor uuid, p_batch_id uuid, p_external_id text, p_lang text, p_endpoint text,
  p_http_status integer, p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b public.stone_library_import_batches%ROWTYPE; v_id uuid; v_n int; v_res uuid;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  SELECT * INTO b FROM public.stone_library_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_raw_put: paket yok' USING ERRCODE = 'SL030'; END IF;
  PERFORM public.stone_library_assert_batch_writable(p_batch_id, NULL);
  IF b.status <> 'running' THEN RAISE EXCEPTION 'stone_library_raw_put: paket çalışmıyor (%)', b.status USING ERRCODE = 'SL032'; END IF;
  SELECT count(*) INTO v_n FROM public.stone_library_raw WHERE batch_id = p_batch_id;
  IF v_n + 1 > b.calls_used THEN RAISE EXCEPTION 'stone_library_raw_put: ayrılmamış çağrı (önce reserve_call)' USING ERRCODE = 'SL066'; END IF;
  -- Kaynak adresi sabitleme: uç yalnız resmî sağlayıcı istemcisinin beyaz listesindeki kristal yolları (+ sayfalama) olabilir.
  IF p_endpoint IS NULL OR p_endpoint !~ '^/crystals(/[a-z0-9-]{1,80}|/birthstone/([1-9]|1[0-2])|/colors|/planets)?(_limit_[0-9]{1,4}(_offset_[0-9]{1,6})?)?$' THEN
    RAISE EXCEPTION 'stone_library_raw_put: uç resmî sağlayıcı beyaz listesinde değil' USING ERRCODE = 'SL067';
  END IF;
  SELECT c.id INTO v_res FROM public.stone_library_call_reservations c
   WHERE c.batch_id = p_batch_id AND c.consumed_at IS NULL AND c.external_id IS NOT DISTINCT FROM p_external_id
   ORDER BY c.seq LIMIT 1 FOR UPDATE;
  IF v_res IS NULL THEN
    RAISE EXCEPTION 'stone_library_raw_put: bu harici kimlik için ayrılmış ve tüketilmemiş çağrı yok' USING ERRCODE = 'SL066';
  END IF;
  PERFORM set_config('stone_library.raw_put', 'on', true);
  INSERT INTO public.stone_library_raw (batch_id, source_id, external_id, lang, endpoint, http_status, payload, created_by)
  VALUES (p_batch_id, b.source_id, p_external_id, p_lang, p_endpoint, p_http_status, p_payload, p_actor) RETURNING id INTO v_id;
  PERFORM set_config('stone_library.raw_put', 'off', true);
  UPDATE public.stone_library_call_reservations SET consumed_at = now(), raw_id = v_id WHERE id = v_res;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.stone_library_raw_put(uuid, uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_raw_put(uuid, uuid, text, text, text, integer, jsonb) TO stone_library_importer;
REVOKE ALL ON FUNCTION public.stone_library_call_res_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stone_library_raw_insert_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ─── 5) Bütünlük: kanıtsız ham yanıt = bütünlük hatası (F3 gövdesi + raw_unverified) ───────────────────────
CREATE OR REPLACE FUNCTION public.stone_library_integrity(p_stone_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  WITH rec AS (
    SELECT r.id, r.raw_id,
           (r.content_sha256 = encode(sha256(convert_to(r.content, 'UTF8')), 'hex')) AS sha_ok,
           (w.id IS NOT NULL AND w.source_id = r.source_id AND (w.lang IS NULL OR w.lang = r.lang)
              AND EXISTS (SELECT 1 FROM public.stone_library_external_ids e WHERE e.stone_id = r.stone_id AND e.source_id = r.source_id AND e.external_id = w.external_id)
              AND CASE WHEN s.provider_code = 'roxy'
                       THEN public.stone_library_field_path(r.field_key) IS NOT NULL
                            AND jsonb_typeof(w.payload #> public.stone_library_field_path(r.field_key)) = 'string'
                            AND (w.payload #>> public.stone_library_field_path(r.field_key)) = r.content
                       ELSE jsonb_path_exists(w.payload, '$.** ? (@ == $v)', jsonb_build_object('v', r.content)) END) AS verbatim_ok
      FROM public.stone_library_records r JOIN public.stone_library_sources s ON s.id = r.source_id
      LEFT JOIN public.stone_library_raw w ON w.id = r.raw_id
     WHERE r.origin = 'source' AND r.deleted_at IS NULL AND s.kind = 'api' AND (p_stone_id IS NULL OR r.stone_id = p_stone_id)
  ), kw AS (
    SELECT f.id,
           (w.id IS NOT NULL AND w.source_id = f.source_id AND (w.lang IS NULL OR w.lang = f.lang)
              AND EXISTS (SELECT 1 FROM public.stone_library_external_ids e WHERE e.stone_id = f.stone_id AND e.source_id = f.source_id AND e.external_id = w.external_id)
              AND CASE WHEN s.provider_code = 'roxy'
                       THEN jsonb_typeof(w.payload -> 'keywords') = 'array' AND (w.payload -> 'keywords') @> jsonb_build_array(f.value_text)
                       ELSE jsonb_path_exists(w.payload, '$.** ? (@ == $v)', jsonb_build_object('v', f.value_text)) END) AS verbatim_ok
      FROM public.stone_library_facets f JOIN public.stone_library_sources s ON s.id = f.source_id
      LEFT JOIN public.stone_library_raw w ON w.id = f.raw_id
     WHERE f.facet = 'keyword' AND f.deleted_at IS NULL AND s.kind = 'api' AND (p_stone_id IS NULL OR f.stone_id = p_stone_id)
  ), lnk AS (
    SELECT DISTINCT st.id, st.name_tr, st.name_en, e.source_id, e.external_id
      FROM public.stone_library_stones st JOIN public.stone_library_external_ids e ON e.stone_id = st.id
      JOIN public.stone_library_sources s ON s.id = e.source_id AND s.kind = 'api'
     WHERE st.deleted_at IS NULL AND (p_stone_id IS NULL OR st.id = p_stone_id)
  ), nm AS (
    SELECT l.id, x.lang,
           CASE x.lang WHEN 'tr' THEN l.name_tr ELSE l.name_en END AS shown,
           EXISTS (SELECT 1 FROM public.stone_library_raw w WHERE w.source_id = l.source_id AND w.external_id = l.external_id AND w.lang = x.lang
                     AND w.http_status BETWEEN 200 AND 299 AND jsonb_typeof(w.payload -> 'name') = 'string' AND btrim(w.payload ->> 'name') <> '') AS has_raw,
           EXISTS (SELECT 1 FROM public.stone_library_raw w WHERE w.source_id = l.source_id AND w.external_id = l.external_id AND w.lang = x.lang
                     AND w.http_status BETWEEN 200 AND 299 AND w.payload ->> 'name' = CASE x.lang WHEN 'tr' THEN l.name_tr ELSE l.name_en END) AS equal
      FROM lnk l CROSS JOIN (VALUES ('tr'), ('en')) x(lang)
  ), cur AS (
    SELECT count(*)::int AS n FROM public.stone_library_records r JOIN public.stone_library_sources s ON s.id = r.source_id
     WHERE r.is_current AND r.deleted_at IS NULL AND r.origin <> 'source' AND s.kind = 'api' AND (p_stone_id IS NULL OR r.stone_id = p_stone_id)
  ), fvm AS (
    SELECT count(*)::int AS n FROM public.stone_library_facets f JOIN public.stone_library_sources s ON s.id = f.source_id AND s.kind = 'api' AND s.provider_code = 'roxy'
      JOIN public.stone_library_raw w ON w.id = f.raw_id
     WHERE f.deleted_at IS NULL AND (p_stone_id IS NULL OR f.stone_id = p_stone_id) AND (
           (f.facet IN ('hardness','numerical_vibration') AND (jsonb_typeof(w.payload -> public.stone_library_facet_raw_key(f.facet)) IS DISTINCT FROM 'number'
              OR (w.payload ->> public.stone_library_facet_raw_key(f.facet))::numeric IS DISTINCT FROM f.value_num))
        OR (f.facet = 'pairing' AND NOT coalesce((w.payload -> 'pairsWith') @> jsonb_build_array(f.pair_external_id), false)))
  ), fnr AS (
    SELECT count(*)::int AS n FROM public.stone_library_facets f JOIN public.stone_library_sources s ON s.id = f.source_id
     WHERE f.deleted_at IS NULL AND f.raw_id IS NULL AND s.kind = 'api' AND (p_stone_id IS NULL OR f.stone_id = p_stone_id)
  ), rawu AS (
    -- F6-A: aktarım defterinde tüketilmiş bir çağrı ayrımına bağlı OLMAYAN ham yanıt = kanıtsız (sağlayıcıdan geldiği kanıtlanamaz).
    SELECT count(DISTINCT w.id)::int AS n
      FROM public.stone_library_raw w
      JOIN public.stone_library_sources s ON s.id = w.source_id AND s.kind = 'api'
      JOIN public.stone_library_external_ids e ON e.source_id = w.source_id AND e.external_id = w.external_id
      JOIN public.stone_library_stones st ON st.id = e.stone_id AND st.deleted_at IS NULL
     WHERE w.http_status BETWEEN 200 AND 299 AND (p_stone_id IS NULL OR st.id = p_stone_id)
       AND NOT EXISTS (SELECT 1 FROM public.stone_library_call_reservations c WHERE c.raw_id = w.id AND c.consumed_at IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'records_total', (SELECT count(*) FROM rec),
    'records_verbatim', (SELECT count(*) FROM rec WHERE verbatim_ok),
    'records_sha_ok', (SELECT count(*) FROM rec WHERE sha_ok),
    'records_without_raw', (SELECT count(*) FROM rec WHERE raw_id IS NULL),
    'keywords_total', (SELECT count(*) FROM kw),
    'keywords_verbatim', (SELECT count(*) FROM kw WHERE verbatim_ok),
    'names_checked', (SELECT count(DISTINCT id) FROM nm WHERE has_raw),
    'names_tr_checked', (SELECT count(DISTINCT id) FROM nm WHERE has_raw AND lang = 'tr'),
    'names_tr_equal', (SELECT count(DISTINCT id) FROM nm n WHERE n.has_raw AND n.lang = 'tr'
                        AND NOT EXISTS (SELECT 1 FROM nm m WHERE m.id = n.id AND m.lang = 'tr' AND m.has_raw AND NOT m.equal)),
    'names_en_checked', (SELECT count(DISTINCT id) FROM nm WHERE has_raw AND lang = 'en'),
    'names_en_equal', (SELECT count(DISTINCT id) FROM nm n WHERE n.has_raw AND n.lang = 'en'
                        AND NOT EXISTS (SELECT 1 FROM nm m WHERE m.id = n.id AND m.lang = 'en' AND m.has_raw AND NOT m.equal)),
    'non_source_current', (SELECT n FROM cur),
    'facets_without_raw', (SELECT n FROM fnr),
    'facets_value_mismatch', (SELECT n FROM fvm),
    'raw_unverified', (SELECT n FROM rawu),
    'aliases', (SELECT count(*) FROM public.stone_library_names a WHERE a.deleted_at IS NULL AND (p_stone_id IS NULL OR a.stone_id = p_stone_id)),
    'mismatch_record_ids', coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM rec WHERE NOT (verbatim_ok AND sha_ok) LIMIT 50) x), '[]'),
    'mismatch_keyword_ids', coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM kw WHERE NOT verbatim_ok LIMIT 50) x), '[]'),
    'mismatch_stone_ids', coalesce((SELECT jsonb_agg(DISTINCT id) FROM (SELECT id FROM nm WHERE has_raw AND NOT equal LIMIT 50) x), '[]'))
    INTO v;
  RETURN v || jsonb_build_object('ok',
    (v ->> 'records_total')::int = (v ->> 'records_verbatim')::int AND (v ->> 'records_total')::int = (v ->> 'records_sha_ok')::int
    AND (v ->> 'keywords_total')::int = (v ->> 'keywords_verbatim')::int
    AND (v ->> 'names_tr_checked')::int = (v ->> 'names_tr_equal')::int AND (v ->> 'names_en_checked')::int = (v ->> 'names_en_equal')::int
    AND (v ->> 'non_source_current')::int = 0 AND (v ->> 'facets_without_raw')::int = 0 AND (v ->> 'facets_value_mismatch')::int = 0
    AND (v ->> 'raw_unverified')::int = 0);
END $$;
REVOKE ALL ON FUNCTION public.stone_library_integrity(uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
