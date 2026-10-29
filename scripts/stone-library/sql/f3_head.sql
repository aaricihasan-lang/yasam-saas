-- Doğaltaş Kütüphanesi F3 — içerik yayın modeli + kaynak verisi koruması + sağlık C modeli (varsayılan KAPALI) + görsel–taş
-- eşleşme kuralı + arama önizlemesi + filtre kataloğu. F1 (20271201000000) ve F2 (20271201000100) üzerine ADDITIVE.
-- Production davranışı varsayılanlarla DEĞİŞMEZ: sağlık modu 'legal_review', genel sağlık kilidi kapalı, uzman erişimi yok.
-- Bu dosya scripts/stone-library/build-f3-migration.py ile üretilir (f3_head + yamalanmış F1/F2 gövdeleri + f3_tail).

DO $$
BEGIN
  IF to_regclass('public.stone_library_images') IS NULL OR to_regprocedure('public.stone_library_verbatim_guard()') IS NULL THEN
    RAISE EXCEPTION 'F3: önce F1 (20271201000000) ve F2 (20271201000100, birebir kuralı dahil) uygulanmalı';
  END IF;
END $$;

-- ─── 1) Yayın durumları: taslak → incelemede → yayına hazır → yayında → yayından kaldırılmış ──────────────
ALTER TABLE public.stone_library_stones DROP CONSTRAINT IF EXISTS stone_library_stones_status_check;
ALTER TABLE public.stone_library_stones ADD CONSTRAINT stone_library_stones_status_check
  CHECK (status IN ('draft','review','ready','published','hidden'));

-- Taş bazında owner sağlık yayın kararı (C modeli). Hukuki inceleme DEĞİLDİR; legal_cleared_* alanlarından ayrıdır.
ALTER TABLE public.stone_library_stones ADD COLUMN IF NOT EXISTS health_publish_decided_at timestamptz;
ALTER TABLE public.stone_library_stones ADD COLUMN IF NOT EXISTS health_publish_decided_by uuid;
ALTER TABLE public.stone_library_stones ADD COLUMN IF NOT EXISTS health_publish_note text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stone_library_stones_health_decision_chk') THEN
    ALTER TABLE public.stone_library_stones ADD CONSTRAINT stone_library_stones_health_decision_chk
      CHECK ((health_publish_decided_at IS NULL) = (health_publish_note IS NULL)
             AND (health_publish_note IS NULL OR char_length(btrim(health_publish_note)) BETWEEN 1 AND 2000));
  END IF;
END $$;

-- ─── 2) Sağlık yayın modu + ayrı tıbbi bilgilendirme (özgün metinlere EKLENMEZ) ─────────────────────────
ALTER TABLE public.stone_library_settings ADD COLUMN IF NOT EXISTS health_publication_mode text NOT NULL DEFAULT 'legal_review';
ALTER TABLE public.stone_library_settings ADD COLUMN IF NOT EXISTS owner_decision_ref text;
ALTER TABLE public.stone_library_settings ADD COLUMN IF NOT EXISTS medical_notice_tr text NOT NULL DEFAULT
  'Bu kütüphanede yer alan bilgiler doğaltaşlara ilişkin geleneksel, kültürel ve tamamlayıcı uygulama kaynaklarından derlenmiştir. Bilgiler tıbbi teşhis veya tedavi önerisi niteliğinde değildir ve profesyonel sağlık hizmetlerinin yerine geçmez.';
ALTER TABLE public.stone_library_settings ADD COLUMN IF NOT EXISTS medical_notice_en text NOT NULL DEFAULT
  'The information in this library has been compiled from traditional, cultural and complementary practice sources on natural stones. It does not constitute medical diagnosis or treatment advice and does not replace professional healthcare services.';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stone_library_settings_mode_chk') THEN
    ALTER TABLE public.stone_library_settings ADD CONSTRAINT stone_library_settings_mode_chk
      CHECK (health_publication_mode IN ('legal_review','owner_decision')
             AND (owner_decision_ref IS NULL OR char_length(btrim(owner_decision_ref)) BETWEEN 1 AND 500)
             AND char_length(medical_notice_tr) BETWEEN 20 AND 1000 AND char_length(medical_notice_en) BETWEEN 20 AND 1000);
  END IF;
END $$;
-- Genel sağlık kilidi: legal_review modunda hukuk referansı, owner_decision modunda owner'ın yazılı karar referansı olmadan açılamaz.
ALTER TABLE public.stone_library_settings DROP CONSTRAINT IF EXISTS stone_library_settings_health_ref_chk;
ALTER TABLE public.stone_library_settings ADD CONSTRAINT stone_library_settings_health_ref_chk
  CHECK (NOT health_content_publication_enabled
         OR (health_publication_mode = 'legal_review' AND char_length(btrim(coalesce(legal_review_ref, ''))) >= 1)
         OR (health_publication_mode = 'owner_decision' AND char_length(btrim(coalesce(owner_decision_ref, ''))) >= 1));

-- Sağlık içeriği görünür mü? (yayın üretimi ve hazırlık kontrolü AYNI kuralı kullanır)
--   legal_review   : hukuk onayı (legal_cleared_at) + genel kilit açık
--   owner_decision : hukuk onayı VEYA taş bazında owner yayın kararı + genel kilit açık
CREATE OR REPLACE FUNCTION public.stone_library_health_ok(p_sensitive boolean, p_legal_cleared timestamptz, p_decided timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT NOT coalesce(p_sensitive, false) OR EXISTS (
    SELECT 1 FROM public.stone_library_settings c
     WHERE c.id AND c.health_content_publication_enabled
       AND (p_legal_cleared IS NOT NULL OR (c.health_publication_mode = 'owner_decision' AND p_decided IS NOT NULL)))
$$;

-- ─── 3a) Kaynak türü / sağlayıcı kodu SABİT: kaynağa bağlı herhangi bir veri varken değiştirilemez ─────────────
-- (Aksi hâlde tür 'api' dışına çevrilip korumalar atlanabilir, sonra geri çevrilebilirdi.)
CREATE OR REPLACE FUNCTION public.stone_library_source_kind_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.provider_code IS DISTINCT FROM OLD.provider_code) AND (
       EXISTS (SELECT 1 FROM public.stone_library_raw WHERE source_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.stone_library_records WHERE source_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.stone_library_facets WHERE source_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.stone_library_external_ids WHERE source_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.stone_library_images WHERE source_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.stone_library_names WHERE source_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.stone_library_license_grants WHERE source_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.stone_library_import_batches WHERE source_id = OLD.id)) THEN
    RAISE EXCEPTION 'stone_library_sources: kaynağa bağlı veri varken kaynak türü / sağlayıcı kodu değiştirilemez' USING ERRCODE = 'SL093';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_sources_kind ON public.stone_library_sources;
CREATE TRIGGER trg_stone_library_sources_kind BEFORE UPDATE ON public.stone_library_sources
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_source_kind_guard();

-- ─── 3) Kaynak verisi koruması (API kaynağı = sağlayıcı verisi; owner yolu dahil HİÇBİR yönetim yolu değiştiremez) ─────
-- Kayıt: API kaynağında owner düzenlemesi / owner metni yok; kaynak kaydı ham yanıta bağlı olmak zorunda; API kaynağında
-- kaynak dışı bir sürüm güncel yapılamaz. Facet: API kaynağındaki anahtar kelime ham yanıta bağlı olmak zorunda.
CREATE OR REPLACE FUNCTION public.stone_library_source_integrity_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text; v_ext text;
BEGIN
  SELECT kind INTO v_kind FROM public.stone_library_sources WHERE id = NEW.source_id;
  IF coalesce(v_kind, '') <> 'api' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'stone_library_records' THEN
    IF NEW.origin <> 'source' AND (TG_OP = 'INSERT' OR (NEW.is_current AND NOT OLD.is_current)) THEN
      RAISE EXCEPTION 'stone_library_records: sağlayıcı kaynak metni düzenlenemez (owner içeriği ayrı içerik türüdür)' USING ERRCODE = 'SL037';
    END IF;
    IF TG_OP <> 'INSERT' OR NEW.origin <> 'source' THEN RETURN NEW; END IF;
    IF NEW.raw_id IS NULL THEN
      RAISE EXCEPTION 'stone_library_records: sağlayıcı kaynak kaydı ham yanıta bağlı olmalı' USING ERRCODE = 'SL038';
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    IF NEW.raw_id IS NULL OR NEW.batch_id IS NULL THEN
      RAISE EXCEPTION 'stone_library_facets: sağlayıcı kaynağındaki değer yalnız aktarım paketiyle ve ham yanıta bağlı eklenir' USING ERRCODE = 'SL038';
    END IF;
    IF NEW.facet = 'birth_month' THEN RETURN NEW; END IF;  -- doğum taşı listesi yanıtından gelir (taşa özgü ham yanıt değil)
  END IF;
  -- Ham yanıt BU taşın aynı kaynaktaki etkin harici kimliğine ait olmalı (başka taşın yanıtıyla kayıt / değer eklenemez).
  SELECT external_id INTO v_ext FROM public.stone_library_raw WHERE id = NEW.raw_id;
  IF v_ext IS NULL OR NOT EXISTS (SELECT 1 FROM public.stone_library_external_ids e
       WHERE e.stone_id = NEW.stone_id AND e.source_id = NEW.source_id AND e.external_id = v_ext AND e.deleted_at IS NULL) THEN
    RAISE EXCEPTION '%: ham yanıt bu taşa ait değil', TG_TABLE_NAME USING ERRCODE = 'SL094';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_records_source_integrity ON public.stone_library_records;
CREATE TRIGGER trg_stone_library_records_source_integrity BEFORE INSERT OR UPDATE ON public.stone_library_records
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_source_integrity_guard();
DROP TRIGGER IF EXISTS trg_stone_library_facets_source_integrity ON public.stone_library_facets;
CREATE TRIGGER trg_stone_library_facets_source_integrity BEFORE INSERT ON public.stone_library_facets
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_source_integrity_guard();

-- Alan–yol kuralı (sağlayıcı 'roxy'): kaynak kaydı, ham yanıtta KENDİ ALANININ yolundaki değerle aynen aynı olmalı
-- (ör. olumlama metni açıklama alanına kaydedilemez); anahtar kelime ham yanıtın keywords dizisinin bir öğesi olmalı.
-- F2'nin birebir kuralını (metin ham yanıtta aynen geçer) daraltır; ikisi birlikte çalışır.
CREATE OR REPLACE FUNCTION public.stone_library_field_path(p_field text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE p_field
    WHEN 'description' THEN ARRAY['description']
    WHEN 'meaning_spiritual' THEN ARRAY['meaning','spiritual']
    WHEN 'meaning_emotional' THEN ARRAY['meaning','emotional']
    WHEN 'meaning_physical' THEN ARRAY['meaning','physical']
    WHEN 'affirmation' THEN ARRAY['affirmation']
  END
$$;
CREATE OR REPLACE FUNCTION public.stone_library_facet_raw_key(p_facet text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE p_facet WHEN 'hardness' THEN 'hardness' WHEN 'numerical_vibration' THEN 'numericalVibration' END
$$;
CREATE OR REPLACE FUNCTION public.stone_library_field_path_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_provider text; v_payload jsonb; v_path text[];
BEGIN
  IF NEW.raw_id IS NULL THEN RETURN NEW; END IF;
  SELECT provider_code INTO v_provider FROM public.stone_library_sources WHERE id = NEW.source_id;
  IF coalesce(v_provider, '') <> 'roxy' THEN RETURN NEW; END IF;
  SELECT payload INTO v_payload FROM public.stone_library_raw WHERE id = NEW.raw_id;
  IF TG_TABLE_NAME = 'stone_library_records' THEN
    IF NEW.origin <> 'source' THEN RETURN NEW; END IF;
    v_path := public.stone_library_field_path(NEW.field_key);
    IF v_path IS NULL OR jsonb_typeof(v_payload #> v_path) IS DISTINCT FROM 'string' OR (v_payload #>> v_path) IS DISTINCT FROM NEW.content THEN
      RAISE EXCEPTION 'stone_library_records: kaynak metni ham yanıtta kendi alanında (%) birebir bulunamadı', NEW.field_key USING ERRCODE = 'SL012';
    END IF;
  ELSIF NEW.facet = 'keyword' THEN
    IF jsonb_typeof(v_payload -> 'keywords') IS DISTINCT FROM 'array' OR NOT ((v_payload -> 'keywords') @> jsonb_build_array(NEW.value_text)) THEN
      RAISE EXCEPTION 'stone_library_facets: anahtar kelime ham yanıtın anahtar kelime listesinde birebir bulunamadı' USING ERRCODE = 'SL012';
    END IF;
  ELSIF NEW.facet IN ('hardness','numerical_vibration') THEN
    IF jsonb_typeof(v_payload -> public.stone_library_facet_raw_key(NEW.facet)) IS DISTINCT FROM 'number'
       OR (v_payload ->> public.stone_library_facet_raw_key(NEW.facet))::numeric IS DISTINCT FROM NEW.value_num THEN
      RAISE EXCEPTION 'stone_library_facets: % değeri ham yanıttaki değerle aynı değil', NEW.facet USING ERRCODE = 'SL012';
    END IF;
  ELSIF NEW.facet = 'pairing' THEN
    IF NEW.pair_external_id IS NULL OR jsonb_typeof(v_payload -> 'pairsWith') IS DISTINCT FROM 'array'
       OR NOT ((v_payload -> 'pairsWith') @> jsonb_build_array(NEW.pair_external_id)) THEN
      RAISE EXCEPTION 'stone_library_facets: eşleştirme ham yanıtın pairsWith listesinde yok' USING ERRCODE = 'SL012';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_records_field_path ON public.stone_library_records;
CREATE TRIGGER trg_stone_library_records_field_path BEFORE INSERT ON public.stone_library_records
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_field_path_guard();
DROP TRIGGER IF EXISTS trg_stone_library_facets_field_path ON public.stone_library_facets;
CREATE TRIGGER trg_stone_library_facets_field_path BEFORE INSERT ON public.stone_library_facets
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_field_path_guard();

-- Taş adı: API kaynağına bağlı kartın TR / EN adı yalnız o kaynağın ilgili dildeki ham yanıtındaki adla AYNEN aynı olabilir
-- (ör. eksik İngilizce adın kaynaktan tamamlanması). Yeniden adlandırma / düzeltme / alternatif adla değiştirme reddedilir.
CREATE OR REPLACE FUNCTION public.stone_library_source_name_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE l record;
BEGIN
  IF NEW.name_tr IS NOT DISTINCT FROM OLD.name_tr AND NEW.name_en IS NOT DISTINCT FROM OLD.name_en THEN RETURN NEW; END IF;
  -- Silinmiş bağlantılar DAHİL: bağlantıyı silip adı değiştirip geri getirme zinciri de reddedilir.
  FOR l IN SELECT DISTINCT e.source_id, e.external_id FROM public.stone_library_external_ids e JOIN public.stone_library_sources s ON s.id = e.source_id
            WHERE e.stone_id = NEW.id AND s.kind = 'api' LOOP
    IF NEW.name_tr IS DISTINCT FROM OLD.name_tr AND NOT EXISTS (
         SELECT 1 FROM public.stone_library_raw r WHERE r.source_id = l.source_id AND r.external_id = l.external_id AND r.lang = 'tr'
            AND r.http_status BETWEEN 200 AND 299 AND r.payload ->> 'name' = NEW.name_tr) THEN
      RAISE EXCEPTION 'stone_library_stones: sağlayıcı kaynağındaki Türkçe ad değiştirilemez' USING ERRCODE = 'SL039';
    END IF;
    IF NEW.name_en IS DISTINCT FROM OLD.name_en AND (NEW.name_en IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.stone_library_raw r WHERE r.source_id = l.source_id AND r.external_id = l.external_id AND r.lang = 'en'
            AND r.http_status BETWEEN 200 AND 299 AND r.payload ->> 'name' = NEW.name_en)) THEN
      RAISE EXCEPTION 'stone_library_stones: sağlayıcı kaynağındaki İngilizce ad değiştirilemez' USING ERRCODE = 'SL039';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_stones_source_name ON public.stone_library_stones;
CREATE TRIGGER trg_stone_library_stones_source_name BEFORE UPDATE ON public.stone_library_stones
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_source_name_guard();

-- Harici kimlik bağlanırken / geri getirilirken / başka karta taşınırken: kartın adı o kimliğin ham yanıtındaki adla AYNEN aynı
-- olmalı (ham yanıtta ad varsa). Böylece sağlayıcı verisi, owner'ın verdiği başka bir adla bir karta bağlanamaz.
CREATE OR REPLACE FUNCTION public.stone_library_external_link_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE st public.stone_library_stones%ROWTYPE; v_lang text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.stone_id = OLD.stone_id AND NEW.external_id = OLD.external_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stone_library_sources s WHERE s.id = NEW.source_id AND s.kind = 'api') THEN RETURN NEW; END IF;
  SELECT * INTO st FROM public.stone_library_stones WHERE id = NEW.stone_id;
  FOREACH v_lang IN ARRAY ARRAY['tr','en'] LOOP
    IF EXISTS (SELECT 1 FROM public.stone_library_raw r WHERE r.source_id = NEW.source_id AND r.external_id = NEW.external_id AND r.lang = v_lang
                  AND r.http_status BETWEEN 200 AND 299 AND jsonb_typeof(r.payload -> 'name') = 'string' AND btrim(r.payload ->> 'name') <> '')
       AND NOT EXISTS (SELECT 1 FROM public.stone_library_raw r WHERE r.source_id = NEW.source_id AND r.external_id = NEW.external_id AND r.lang = v_lang
                  AND r.http_status BETWEEN 200 AND 299 AND r.payload ->> 'name' = CASE v_lang WHEN 'tr' THEN st.name_tr ELSE st.name_en END) THEN
      RAISE EXCEPTION 'stone_library_external_ids: kartın adı sağlayıcı kaynağındaki adla aynı değil (bağlanamaz)' USING ERRCODE = 'SL039';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_external_ids_link ON public.stone_library_external_ids;
CREATE TRIGGER trg_stone_library_external_ids_link BEFORE INSERT OR UPDATE ON public.stone_library_external_ids
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_external_link_guard();

-- ─── 4) Görsel–taş eşleşmesi: görsel yalnız kendi taşına bağlanabilir ──────────────────────────────────
--   • API kaynağında harici kimlik zorunlu ve o taşın aynı kaynaktaki etkin harici kimliği olmalı
--   • optimize sürüm aynı taş + kaynaktaki özgün sürümden türemeli
--   • kaynak URL'si verildiyse ve taşın ham yanıtı varsa, ham yanıttaki görsel adresiyle AYNEN aynı olmalı
CREATE OR REPLACE FUNCTION public.stone_library_image_binding_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text; p public.stone_library_images%ROWTYPE;
BEGIN
  SELECT kind INTO v_kind FROM public.stone_library_sources WHERE id = NEW.source_id;
  IF v_kind = 'api' AND NEW.variant = 'original' AND NEW.source_url IS NULL THEN
    RAISE EXCEPTION 'stone_library_images: sağlayıcı özgün görseli kaynak adresi olmadan kaydedilemez' USING ERRCODE = 'SL089';
  END IF;
  IF v_kind = 'api' AND NEW.external_id IS NULL THEN
    RAISE EXCEPTION 'stone_library_images: sağlayıcı görseli harici kimlik olmadan kaydedilemez' USING ERRCODE = 'SL089';
  END IF;
  IF NEW.external_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.stone_library_external_ids e
        WHERE e.stone_id = NEW.stone_id AND e.source_id = NEW.source_id AND e.external_id = NEW.external_id AND e.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'stone_library_images: görselin harici kimliği bu taşa ait değil' USING ERRCODE = 'SL089';
  END IF;
  IF NEW.derived_from_id IS NOT NULL THEN
    SELECT * INTO p FROM public.stone_library_images WHERE id = NEW.derived_from_id;
    IF NOT FOUND OR p.stone_id <> NEW.stone_id OR p.source_id <> NEW.source_id OR p.variant <> 'original' OR p.deleted_at IS NOT NULL
       OR p.external_id IS DISTINCT FROM NEW.external_id THEN
      RAISE EXCEPTION 'stone_library_images: optimize sürüm aynı taşın özgün görselinden türemeli' USING ERRCODE = 'SL089';
    END IF;
  END IF;
  IF NEW.source_url IS NOT NULL AND NEW.external_id IS NOT NULL AND v_kind = 'api'
     AND NOT EXISTS (SELECT 1 FROM public.stone_library_raw r WHERE r.source_id = NEW.source_id AND r.external_id = NEW.external_id
                    AND r.http_status BETWEEN 200 AND 299 AND r.payload ->> 'imageUrl' = NEW.source_url) THEN
    RAISE EXCEPTION 'stone_library_images: görsel adresi taşın kaynak yanıtındaki adresle eşleşmiyor' USING ERRCODE = 'SL089';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stone_library_images_binding ON public.stone_library_images;
CREATE TRIGGER trg_stone_library_images_binding BEFORE INSERT ON public.stone_library_images
  FOR EACH ROW EXECUTE FUNCTION public.stone_library_image_binding_guard();

-- ─── 5) Yayına hazırlık kontrolü (iç yardımcı; owner RPC'si ve durum geçişi kullanır) ──────────────────
-- blockers: yayına hazır / yayında yapılamaz. warnings: yayımlanabilir ama owner bilmeli (gizli kalan içerik vb.).
CREATE OR REPLACE FUNCTION public.stone_library_readiness(p_stone uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  st public.stone_library_stones%ROWTYPE; b text[] := '{}'; w text[] := '{}';
  c_pend_rec int; c_pend_fac int; c_pend_img int; c_visible int; c_health int; c_health_vis int; c_lang int; c_img_ok boolean;
  c_img_any int; c_dup int; c_rejected int; c_new_ver int;
BEGIN
  SELECT * INTO st FROM public.stone_library_stones WHERE id = p_stone;
  IF NOT FOUND OR st.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ready', false, 'blockers', jsonb_build_array('stone_missing'), 'warnings', '[]'::jsonb, 'counts', '{}'::jsonb);
  END IF;
  SELECT count(*) FILTER (WHERE r.review_state = 'pending'),
         count(*) FILTER (WHERE r.review_state = 'rejected'),
         count(*) FILTER (WHERE r.review_state = 'approved' AND r.visibility = 'visible' AND NOT ('lang_suspect' = ANY (r.quality_flags))
                            AND public.stone_library_health_ok(r.health_sensitive, r.legal_cleared_at, st.health_publish_decided_at)
                            AND s.deleted_at IS NULL AND s.status = 'active' AND (s.license_valid_until IS NULL OR s.license_valid_until > now())),
         count(*) FILTER (WHERE r.review_state = 'approved' AND r.visibility = 'visible' AND r.health_sensitive),
         count(*) FILTER (WHERE r.review_state = 'approved' AND r.visibility = 'visible' AND r.health_sensitive
                            AND public.stone_library_health_ok(r.health_sensitive, r.legal_cleared_at, st.health_publish_decided_at)),
         count(*) FILTER (WHERE r.review_state = 'approved' AND r.visibility = 'visible' AND 'lang_suspect' = ANY (r.quality_flags))
    INTO c_pend_rec, c_rejected, c_visible, c_health, c_health_vis, c_lang
    FROM public.stone_library_records r JOIN public.stone_library_sources s ON s.id = r.source_id
   WHERE r.stone_id = p_stone AND r.is_current AND r.deleted_at IS NULL;
  -- Kaynakta yeni sürüm (yeniden aktarım): güncel değil, owner kararı bekliyor → yayındaki metin değişmez, owner bilmeli.
  SELECT count(*) INTO c_new_ver FROM public.stone_library_records n
   WHERE n.stone_id = p_stone AND NOT n.is_current AND n.deleted_at IS NULL AND n.review_state = 'pending' AND n.origin = 'source';
  SELECT count(*) INTO c_pend_fac FROM public.stone_library_facets f WHERE f.stone_id = p_stone AND f.deleted_at IS NULL AND f.review_state = 'pending';
  SELECT count(*) FILTER (WHERE i.review_state = 'pending'), count(*),
         count(*) FILTER (WHERE i.review_state = 'approved' AND 'duplicate_image' = ANY (i.quality_flags))
    INTO c_pend_img, c_img_any, c_dup
    FROM public.stone_library_images i WHERE i.stone_id = p_stone AND i.deleted_at IS NULL;
  SELECT EXISTS (SELECT 1 FROM public.stone_library_images i JOIN public.stone_library_sources s ON s.id = i.source_id
                  WHERE i.stone_id = p_stone AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'
                    AND (i.external_id IS NULL OR EXISTS (SELECT 1 FROM public.stone_library_external_ids e WHERE e.stone_id = i.stone_id
                           AND e.source_id = i.source_id AND e.external_id = i.external_id AND e.deleted_at IS NULL))
                    AND s.deleted_at IS NULL AND s.status = 'active' AND s.image_rights = 'rehost_ok'
                    AND (s.license_valid_until IS NULL OR s.license_valid_until > now())
                    AND EXISTS (SELECT 1 FROM public.stone_library_license_grants g
                                 WHERE g.id = i.license_grant_id AND g.source_id = i.source_id AND g.scope = 'crystal_images'
                                   AND g.evidence_status = 'verified' AND g.storage_allowed AND g.commercial_display
                                   AND (g.valid_until IS NULL OR g.valid_until >= current_date)
                                   AND (g.modification_allowed OR i.variant = 'original'))) INTO c_img_ok;
  IF c_pend_rec > 0 THEN b := array_append(b, 'records_pending'); END IF;
  IF c_pend_fac > 0 THEN b := array_append(b, 'facets_pending'); END IF;
  IF c_pend_img > 0 THEN b := array_append(b, 'images_pending'); END IF;
  IF c_visible = 0 THEN b := array_append(b, 'no_visible_content'); END IF;
  IF NOT coalesce((public.stone_library_integrity(p_stone) ->> 'ok')::boolean, false) THEN b := array_append(b, 'integrity_failed'); END IF;
  IF c_health > c_health_vis THEN w := array_append(w, 'health_content_not_published'); END IF;
  IF c_lang > 0 THEN w := array_append(w, 'lang_suspect_not_published'); END IF;
  IF c_img_any = 0 THEN w := array_append(w, 'no_image');
  ELSIF NOT c_img_ok THEN w := array_append(w, 'image_not_publishable'); END IF;
  IF c_dup > 0 THEN w := array_append(w, 'duplicate_image'); END IF;
  IF c_rejected > 0 THEN w := array_append(w, 'records_rejected'); END IF;
  IF c_new_ver > 0 THEN w := array_append(w, 'new_source_version_pending'); END IF;
  RETURN jsonb_build_object('ready', cardinality(b) = 0, 'blockers', to_jsonb(b), 'warnings', to_jsonb(w),
    'counts', jsonb_build_object('records_pending', c_pend_rec, 'records_rejected', c_rejected, 'facets_pending', c_pend_fac,
      'images_pending', c_pend_img, 'visible_records', c_visible, 'health_records', c_health, 'health_records_visible', c_health_vis,
      'lang_suspect', c_lang, 'new_source_versions', c_new_ver, 'image_publishable', c_img_ok, 'health_decided', st.health_publish_decided_at IS NOT NULL));
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_readiness(p_actor uuid, p_stone_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN public.stone_library_readiness(p_stone_id);
END $$;

-- Durum geçişi: yayına hazır ve yayın, hazırlık kontrolünden geçmek zorunda; yayın yalnız "yayına hazır" ya da
-- "yayından kaldırılmış" (yeniden yayın) durumundan. Silinmiş taş durum değiştirmez.
CREATE OR REPLACE FUNCTION public.stone_library_stone_set_status(p_actor uuid, p_stone_id uuid, p_status text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_row public.stone_library_stones%ROWTYPE; v_ready jsonb;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_status IS NULL OR p_status NOT IN ('draft','review','ready','published','hidden') THEN
    RAISE EXCEPTION 'stone_library_stone_set_status: geçersiz durum' USING ERRCODE = 'SL027';
  END IF;
  SELECT * INTO v_row FROM public.stone_library_stones WHERE id = p_stone_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stone_library_stone_set_status: taş yok' USING ERRCODE = 'SL024'; END IF;
  IF p_status = 'published' AND v_row.status NOT IN ('ready','hidden','published') THEN
    RAISE EXCEPTION 'stone_library_stone_set_status: yayın için taş önce "yayına hazır" işaretlenmeli' USING ERRCODE = 'SL091';
  END IF;
  IF p_status IN ('review','ready') AND v_row.status = 'published' THEN
    RAISE EXCEPTION 'stone_library_stone_set_status: yayındaki taş önce yayından kaldırılmalı' USING ERRCODE = 'SL091';
  END IF;
  IF p_status = 'hidden' AND v_row.status NOT IN ('published','hidden') THEN
    RAISE EXCEPTION 'stone_library_stone_set_status: yalnız yayındaki taş yayından kaldırılabilir' USING ERRCODE = 'SL091';
  END IF;
  IF p_status IN ('ready','published') THEN
    v_ready := public.stone_library_readiness(p_stone_id);
    IF jsonb_array_length(v_ready -> 'blockers') > 0 THEN
      RAISE EXCEPTION 'stone_library_stone_set_status: yayına hazır değil: %', (v_ready ->> 'blockers') USING ERRCODE = 'SL090';
    END IF;
  END IF;
  IF v_row.status = p_status THEN RETURN; END IF;
  UPDATE public.stone_library_stones SET status = p_status,
    published_at = CASE WHEN p_status = 'published' THEN now() ELSE published_at END,
    published_by = CASE WHEN p_status = 'published' THEN p_actor ELSE published_by END,
    row_version = row_version + 1, updated_at = now()
  WHERE id = p_stone_id;
  PERFORM public.stone_library_review_log('stone', p_stone_id,
    CASE p_status WHEN 'published' THEN 'publish' WHEN 'hidden' THEN 'unpublish' WHEN 'ready' THEN 'mark_ready'
                  WHEN 'review' THEN 'mark_review' ELSE 'to_draft' END, p_note);
END $$;

-- ─── 6) Owner sağlık yayın kararı (taş bazında, yazılı not zorunlu; hukuki onay yerine GEÇMEZ) ─────────────
CREATE OR REPLACE FUNCTION public.stone_library_health_decision(p_actor uuid, p_stone_id uuid, p_action text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n int;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_action NOT IN ('allow','revoke') THEN RAISE EXCEPTION 'stone_library_health_decision: geçersiz işlem' USING ERRCODE = 'SL043'; END IF;
  IF p_action = 'allow' AND coalesce(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'stone_library_health_decision: owner kararı için yazılı not zorunlu' USING ERRCODE = 'SL092';
  END IF;
  UPDATE public.stone_library_stones SET
    health_publish_decided_at = CASE WHEN p_action = 'allow' THEN now() END,
    health_publish_decided_by = CASE WHEN p_action = 'allow' THEN p_actor END,
    health_publish_note = CASE WHEN p_action = 'allow' THEN left(btrim(p_note), 2000) END,
    row_version = row_version + 1, updated_at = now()
  WHERE id = p_stone_id AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'stone_library_health_decision: taş yok' USING ERRCODE = 'SL024'; END IF;
  PERFORM public.stone_library_review_log('stone', p_stone_id, CASE p_action WHEN 'allow' THEN 'health_allow' ELSE 'health_revoke' END, p_note);
END $$;

-- ─── 7) Toplu inceleme: seçilen taşların BEKLEYEN güncel metin kayıtları + facet'leri owner kararıyla onaylanır ─────
-- Görseller, dil doğrulaması, sağlık kararı ve yayın bu işleme DAHİL DEĞİLDİR (ayrı, bilinçli owner adımları).
CREATE OR REPLACE FUNCTION public.stone_library_owner_bulk_review(p_actor uuid, p_stone_ids jsonb, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_ids uuid[]; v_rec int := 0; v_fac int := 0; r record;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF jsonb_typeof(p_stone_ids) <> 'array' OR jsonb_array_length(p_stone_ids) = 0 OR jsonb_array_length(p_stone_ids) > 200 THEN
    RAISE EXCEPTION 'stone_library_owner_bulk_review: 1–200 taş kimliği gerekli' USING ERRCODE = 'SL020';
  END IF;
  SELECT array_agg(DISTINCT x::uuid) INTO v_ids FROM jsonb_array_elements_text(p_stone_ids) x
   WHERE x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF v_ids IS NULL OR cardinality(v_ids) <> jsonb_array_length(p_stone_ids) THEN
    RAISE EXCEPTION 'stone_library_owner_bulk_review: geçersiz veya tekrarlı kimlik' USING ERRCODE = 'SL020';
  END IF;
  PERFORM public.stone_library_defer_begin();
  FOR r IN UPDATE public.stone_library_records SET review_state = 'approved', reviewed_at = now(), reviewed_by = p_actor
            WHERE stone_id = ANY (v_ids) AND is_current AND deleted_at IS NULL AND review_state = 'pending' RETURNING id LOOP
    PERFORM public.stone_library_review_log('record', r.id, 'approve', coalesce(p_note, 'bulk_review'));
    v_rec := v_rec + 1;
  END LOOP;
  FOR r IN UPDATE public.stone_library_facets SET review_state = 'approved', reviewed_at = now(), reviewed_by = p_actor
            WHERE stone_id = ANY (v_ids) AND deleted_at IS NULL AND review_state = 'pending' RETURNING id LOOP
    PERFORM public.stone_library_review_log('facet', r.id, 'approve', coalesce(p_note, 'bulk_review'));
    v_fac := v_fac + 1;
  END LOOP;
  PERFORM public.stone_library_defer_flush();
  RETURN jsonb_build_object('stones', cardinality(v_ids), 'records_approved', v_rec, 'facets_approved', v_fac);
END $$;

-- ─── 8) Kaynak metin bütünlüğü doğrulaması (salt-okuma) ─────────────────────────────────────────────
-- Sağlayıcı (API) kaynağının kayıtları, anahtar kelimeleri ve taş adları bağlı oldukları ham yanıtla karşılaştırılır:
--   • kayıt: Roxy'de ham yanıtta KENDİ ALANININ yolundaki değerle aynen aynı (diğer API'lerde: yanıtta aynen geçer) + SHA-256
--            + ham yanıt bu taşın (silinmiş dahil) harici kimliğine ait + aynı dil
--   • anahtar kelime: Roxy'de keywords dizisinin öğesi (diğerlerinde: yanıtta aynen geçer) + taşa ait + aynı dil
--   • ad: taşın (silinmiş dahil) her API bağlantısı için TR / EN ad, o kimliğin ham yanıtlarından birindeki adla aynen aynı
--   • kaynak dışı güncel sürüm 0; ham bağı olmayan facet 0
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
    'aliases', (SELECT count(*) FROM public.stone_library_names a WHERE a.deleted_at IS NULL AND (p_stone_id IS NULL OR a.stone_id = p_stone_id)),
    'mismatch_record_ids', coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM rec WHERE NOT (verbatim_ok AND sha_ok) LIMIT 50) x), '[]'),
    'mismatch_keyword_ids', coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM kw WHERE NOT verbatim_ok LIMIT 50) x), '[]'),
    'mismatch_stone_ids', coalesce((SELECT jsonb_agg(DISTINCT id) FROM (SELECT id FROM nm WHERE has_raw AND NOT equal LIMIT 50) x), '[]'))
    INTO v;
  RETURN v || jsonb_build_object('ok',
    (v ->> 'records_total')::int = (v ->> 'records_verbatim')::int AND (v ->> 'records_total')::int = (v ->> 'records_sha_ok')::int
    AND (v ->> 'keywords_total')::int = (v ->> 'keywords_verbatim')::int
    AND (v ->> 'names_tr_checked')::int = (v ->> 'names_tr_equal')::int AND (v ->> 'names_en_checked')::int = (v ->> 'names_en_equal')::int
    AND (v ->> 'non_source_current')::int = 0 AND (v ->> 'facets_without_raw')::int = 0 AND (v ->> 'facets_value_mismatch')::int = 0);
END $$;

CREATE OR REPLACE FUNCTION public.stone_library_owner_integrity(p_actor uuid, p_stone_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  RETURN public.stone_library_integrity(p_stone_id);
END $$;

-- ─── 9) Uzman filtre kataloğu: yalnız YAYINDAKİ taşlarda gerçekten bulunan değerler + sayıları (tahmin / üretim yok) ─────
CREATE OR REPLACE FUNCTION public.stone_library_expert_facets(p_viewer uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.stone_library_viewer_allowed(p_viewer) THEN RETURN NULL; END IF;
  PERFORM public.stone_library_refresh_expired();
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.stone_library_published),
    'facets', coalesce((SELECT jsonb_object_agg(facet, vals) FROM (
        SELECT x.facet, jsonb_agg(jsonb_build_object('key', x.k, 'label_tr', coalesce(vc.label_tr, x.k), 'label_en', coalesce(vc.label_en, x.k), 'count', x.n)
                                  ORDER BY coalesce(vc.sort_order, 1000), coalesce(vc.label_tr, x.k)) AS vals
          FROM (SELECT 'chakra' AS facet, k, count(*)::int AS n FROM public.stone_library_published, unnest(chakra) k GROUP BY k
                UNION ALL SELECT 'zodiac', k, count(*)::int FROM public.stone_library_published, unnest(zodiac) k GROUP BY k
                UNION ALL SELECT 'element', k, count(*)::int FROM public.stone_library_published, unnest(element) k GROUP BY k
                UNION ALL SELECT 'color', k, count(*)::int FROM public.stone_library_published, unnest(color) k GROUP BY k
                UNION ALL SELECT 'planet', k, count(*)::int FROM public.stone_library_published, unnest(planet) k GROUP BY k) x
          LEFT JOIN public.stone_library_vocab vc ON vc.facet = x.facet AND vc.value_key = x.k
         GROUP BY x.facet) q), '{}'::jsonb),
    'birth_month', coalesce((SELECT jsonb_agg(jsonb_build_object('value', m, 'count', n) ORDER BY m)
                               FROM (SELECT m, count(*)::int n FROM public.stone_library_published, unnest(birth_month) m GROUP BY m) z), '[]'::jsonb),
    'hardness', (SELECT CASE WHEN min(hardness_min) IS NULL THEN NULL ELSE jsonb_build_object('min', min(hardness_min), 'max', max(hardness_max)) END
                   FROM public.stone_library_published))
    INTO v;
  RETURN v;
END $$;

-- ─── 10) Ayarlar: sağlık yayın modu + owner karar referansı + tıbbi bilgilendirme metni ─────────────────
CREATE OR REPLACE FUNCTION public.stone_library_settings_save(p_actor uuid, p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE k text;
BEGIN
  PERFORM public.stone_library_assert_owner(p_actor);
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'stone_library_settings_save: veri gerekli' USING ERRCODE = 'SL020'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF NOT (k = ANY (ARRAY['health_content_publication_enabled','health_notice_tr','health_notice_en','legal_review_ref',
                           'health_publication_mode','owner_decision_ref','medical_notice_tr','medical_notice_en'])) THEN
      RAISE EXCEPTION 'stone_library_settings_save: bilinmeyen alan %', k USING ERRCODE = 'SL020';
    END IF;
  END LOOP;
  UPDATE public.stone_library_settings SET
    health_content_publication_enabled = coalesce((p_data ->> 'health_content_publication_enabled')::boolean, health_content_publication_enabled),
    health_notice_tr = coalesce(p_data ->> 'health_notice_tr', health_notice_tr),
    health_notice_en = coalesce(p_data ->> 'health_notice_en', health_notice_en),
    legal_review_ref = CASE WHEN p_data ? 'legal_review_ref' THEN p_data ->> 'legal_review_ref' ELSE legal_review_ref END,
    health_publication_mode = coalesce(p_data ->> 'health_publication_mode', health_publication_mode),
    owner_decision_ref = CASE WHEN p_data ? 'owner_decision_ref' THEN p_data ->> 'owner_decision_ref' ELSE owner_decision_ref END,
    medical_notice_tr = coalesce(p_data ->> 'medical_notice_tr', medical_notice_tr),
    medical_notice_en = coalesce(p_data ->> 'medical_notice_en', medical_notice_en),
    updated_by = p_actor, updated_at = now()
  WHERE id;
  PERFORM public.stone_library_review_log('settings', NULL, 'edit', NULL);
END $$;

