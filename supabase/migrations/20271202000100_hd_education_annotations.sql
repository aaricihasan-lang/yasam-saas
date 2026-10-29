-- =============================================================================
-- 20271202000100_hd_education_annotations.sql
--
-- HUMAN DESIGN — EĞİTİM ÇALIŞMA ALANI · ÇİZİM / NOT KATMANI (FAZ 8) · ADDITIVE · YALNIZ YENİ NESNELER
--
-- AMAÇ: Yetkili eğitmen, erişebildiği eğitim haritasının (merkezî yayımlı katalog VEYA kendi özel eğitim arşivi)
--   üzerine KENDİNE ÖZEL bir çizim / not katmanı kaydeder (kalem, ok, daire, baloncuk, metin). Onaylı BodyGraph
--   ÇİZİMİ DEĞİŞMEZ: katman ayrı bir kayıttır; koordinatlar BodyGraph'ın sabit SVG koordinat sisteminde
--   (viewBox -80 -80 602 752) veya kapı / merkez semantik çapasına göredir → ekran genişliğinden bağımsız.
--
-- TASARIM İLKELERİ:
--   • KOPYA YOK: katman yalnız kaynak kimliğine bağlıdır (merkezî: hd_education_subjects.id; özel:
--     hd_edu_private_items.id). Doğum verisi / computed_result / provider_raw katmana KOPYALANMAZ.
--     Kaynak sütunları AYRI (iki FK; tam olarak biri dolu). Özel kayıt silinirse katman da silinir (CASCADE).
--   • GİZLİLİK: her eğitmenin katmanı yalnız kendisine; başka eğitmen varlığını dahi öğrenemez (aynı "bulunamadı").
--     Platform OWNER katmanları listeleyip inceleyebilir ve kaldırabilir (eğitim içeriği; 24.08 politikası
--     başka hiçbir alanda genişlemez). role='admin' OWNER DEĞİLDİR.
--   • ERİŞİM her çağrıda DB'de yeniden doğrulanır:
--       merkezî → TEK eğitim yetkisi (hd_education_access_grants, tenant eşleşmesi, uygunluk) + yayın durumu 'published'
--       özel    → hd_edu_priv_resolve_actor = 'trainer' (arşiv anahtarı dahil) + kayıt kendisinin + kayıt durumu 'ok'
--     İzin geri çekilince / kaynak değişince katman da KAPANIR (silinmez; owner görebilir / kaldırabilir).
--   • İÇERİK: jsonb belge {v:1, els:[...]} — öğe sayısı ≤ 400, metin ≤ 200 000 karakter, '<' '>' YASAK (HTML /
--     script enjeksiyonu DB düzeyinde de reddedilir). Ayrıntılı alan doğrulaması sunucu kodunda (annotationContract).
--   • EŞZAMANLILIK (CAS): her kayıtta beklenen revizyon; uyuşmazsa EA409 → sessiz üzerine yazma YOK.
--   • ERİŞİM KİLİDİ: 2 tablonun HİÇBİRİNDE PUBLIC/anon/authenticated/service_role tablo ayrıcalığı YOK; RLS açık,
--     policy yok. Yalnız SECURITY DEFINER RPC'ler (service_role).
--   • DENETİM: asgari iz (eylem + kimlikler + öğe sayısı); çizim / not içeriği YAZILMAZ.
--   • FAZ 9 VERİ KORUMA (owner kararı 24.10.2026): eğitim yetkisini / üyeliği KAPATMAK veri SİLMEZ — katmanlar pasif ve
--     erişime kapalı kalır; yetki yeniden açılınca (kaynak + izin koşulları sağlanıyorsa) aynı katman aynı kayıtla döner.
--     Katman yalnız eğitmenin GÜNCEL tenant'ında görünür (başka tenant'a taşınmaz / devredilmez). Danışan izni geri
--     çekilmesi AYRI bir olaydır: yetki yeniden açılsa da o kaydın katmanı açılmaz ve owner'a içeriği gönderilmez.
--     Kalıcı silme yalnız owner'ın AYRI, açıkça onaylanmış işlemidir (yetki KAPALIYKEN; sayı + ifade doğrulamalı);
--     izin kayıtları, izin kanıtları ve denetim izleri bu işlemde SİLİNMEZ. Otomatik (süreye bağlı) silme YOKTUR.
--
-- ÖNKOŞUL: 20271110 (merkezî katalog + TEK yetki) ve 20271202000000 (özel eğitim arşivi) uygulanmış olmalı.
-- MEVCUT TABLOLARA DOKUNULMAZ (yalnız yeni tablolardan FK). BodyGraph / Astroloji / Numeroloji motoru DEĞİŞMEZ.
-- YEDEK: 2 tablo kullanıcı yedeği dışındadır (lib/backup/ownerPilotTables.ts); platform felaket yedeği kapsar.
--   BİLİNEN RİSK (owner kararıyla kabul): eski yedekten dönüşte yedekten sonra silinen katman eski hâline dönebilir.
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.hd_education_access_grants') IS NULL OR to_regclass('public.hd_education_subjects') IS NULL
     OR to_regclass('public.hd_education_publications') IS NULL
     OR to_regprocedure('public.hd_education_auto_revoke_ineligible(uuid)') IS NULL THEN
    RAISE EXCEPTION 'hd_edu_ann: merkezî eğitim nesneleri yok — önce 20271110 uygulanmalı (precondition)';
  END IF;
  IF to_regclass('public.hd_edu_private_items') IS NULL OR to_regprocedure('public.hd_edu_priv_resolve_actor(uuid)') IS NULL
     OR to_regprocedure('public.hd_edu_priv_item_state(uuid, boolean)') IS NULL OR to_regprocedure('public.hd_edu_priv_is_owner(uuid)') IS NULL THEN
    RAISE EXCEPTION 'hd_edu_ann: özel eğitim arşivi yok — önce 20271202000000 uygulanmalı (precondition)';
  END IF;
END $pre$;

-- ─── 1) Katmanlar (eğitmen × kaynak başına tek katman) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_edu_annotation_layers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  trainer_user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_kind         text        NOT NULL CHECK (source_kind IN ('central','private')),
  central_subject_id  uuid        REFERENCES public.hd_education_subjects(id) ON DELETE CASCADE,
  private_item_id     uuid        REFERENCES public.hd_edu_private_items(id) ON DELETE CASCADE,
  doc                 jsonb       NOT NULL,
  el_count            integer     NOT NULL CHECK (el_count BETWEEN 0 AND 400),
  revision            integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_edu_ann_source_chk CHECK (
    (source_kind = 'central' AND central_subject_id IS NOT NULL AND private_item_id IS NULL)
    OR (source_kind = 'private' AND private_item_id IS NOT NULL AND central_subject_id IS NULL)),
  CONSTRAINT hd_edu_ann_doc_chk CHECK (
    jsonb_typeof(doc) = 'object' AND doc ->> 'v' = '1' AND jsonb_typeof(doc -> 'els') = 'array'
    AND jsonb_array_length(doc -> 'els') = el_count
    AND char_length(doc::text) <= 200000
    AND position('<' IN doc::text) = 0 AND position('>' IN doc::text) = 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS hd_edu_ann_central_uq ON public.hd_edu_annotation_layers (trainer_user_id, tenant_id, central_subject_id) WHERE central_subject_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hd_edu_ann_private_uq ON public.hd_edu_annotation_layers (trainer_user_id, tenant_id, private_item_id) WHERE private_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hd_edu_ann_tenant_idx ON public.hd_edu_annotation_layers (tenant_id, trainer_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS hd_edu_ann_private_idx ON public.hd_edu_annotation_layers (private_item_id) WHERE private_item_id IS NOT NULL;

-- ─── 2) Asgari denetim izi (çizim / not içeriği YOK) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_edu_annotation_audit (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  tenant_id        uuid,
  actor_kind       text        NOT NULL CHECK (actor_kind IN ('trainer','owner')),
  actor_user_id    uuid,
  action           text        NOT NULL CHECK (action IN ('layer_created','layer_updated','layer_cleared','owner_viewed','owner_deleted','owner_purged')),
  layer_id         uuid,
  source_kind      text        CHECK (source_kind IS NULL OR source_kind IN ('central','private')),
  source_id        uuid,
  trainer_user_id  uuid,
  el_count         integer
);
CREATE INDEX IF NOT EXISTS hd_edu_ann_audit_tenant_idx ON public.hd_edu_annotation_audit (tenant_id, created_at DESC);

-- Denetim: append-only. Tek istisna: owner purge (admin_purge_archived_expert) aynı tx'te uzman tenant'ını silerken.
CREATE OR REPLACE FUNCTION public.hd_edu_ann_audit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_purge boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS NOT NULL AND to_regprocedure('public.admin_purge_in_progress(uuid,uuid)') IS NOT NULL THEN
      EXECUTE 'SELECT public.admin_purge_in_progress(NULL::uuid, $1)' INTO v_purge USING OLD.tenant_id;
    END IF;
    IF v_purge IS TRUE THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'hd_edu_annotation_audit: silinemez' USING ERRCODE = '23514';
  END IF;
  RAISE EXCEPTION 'hd_edu_annotation_audit: değiştirilemez (append-only)' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_ann_audit_guard ON public.hd_edu_annotation_audit;
CREATE TRIGGER trg_hd_edu_ann_audit_guard BEFORE UPDATE OR DELETE ON public.hd_edu_annotation_audit
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_ann_audit_guard();

-- Katman satırı: kaynak / sahip / tenant DEĞİŞTİRİLEMEZ (yalnız içerik + revizyon).
CREATE OR REPLACE FUNCTION public.hd_edu_ann_layer_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.trainer_user_id IS DISTINCT FROM OLD.trainer_user_id
     OR NEW.source_kind IS DISTINCT FROM OLD.source_kind OR NEW.central_subject_id IS DISTINCT FROM OLD.central_subject_id
     OR NEW.private_item_id IS DISTINCT FROM OLD.private_item_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'hd_edu_annotation_layers: kaynak / sahip değiştirilemez' USING ERRCODE = '23514';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'hd_edu_annotation_layers: revizyon tek adım artmalı' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_ann_layer_guard ON public.hd_edu_annotation_layers;
CREATE TRIGGER trg_hd_edu_ann_layer_guard BEFORE UPDATE ON public.hd_edu_annotation_layers
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_ann_layer_guard();

-- ─── Aktör + kaynak erişimi ──────────────────────────────────────────────────────────────────────
-- 'owner' | 'trainer' | NULL — merkezî kaynak için (özel arşiv anahtarından BAĞIMSIZ; TEK eğitim yetkisi).
CREATE OR REPLACE FUNCTION public.hd_edu_ann_central_actor(p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN RETURN NULL; END IF;
  IF public.hd_edu_priv_is_owner(p_actor) THEN RETURN 'owner'; END IF;
  SELECT * INTO u FROM public.users WHERE id = p_actor;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.hd_education_auto_revoke_ineligible(p_actor) IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_access_grants g
                  WHERE g.user_id = p_actor AND g.revoked_at IS NULL AND g.granted_tenant_id = u.tenant_id) THEN
    RETURN NULL;
  END IF;
  IF lower(coalesce(u.role,'')) <> 'expert' OR u.is_super_admin IS TRUE OR u.active IS NOT TRUE OR coalesce(u.is_demo_account,false)
     OR u.tenant_id IS NULL OR lower(coalesce(u.approval_status,'')) NOT IN ('approved','')
     OR coalesce(u.module_permissions ->> 'human_design','') <> 'true' THEN
    RETURN NULL;
  END IF;
  RETURN 'trainer';
END $$;

-- Eğitmen bu kaynağa ŞU AN erişebilir mi? Erişemiyorsa EA404 (var olmayanla AYNI yanıt). Dönen: eğitmenin tenant'ı.
CREATE OR REPLACE FUNCTION public.hd_edu_ann_trainer_source(p_actor uuid, p_kind text, p_ref uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_tenant uuid; i record;
BEGIN
  IF p_ref IS NULL OR p_kind NOT IN ('central','private') THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = p_actor;
  IF p_kind = 'central' THEN
    IF public.hd_edu_ann_central_actor(p_actor) IS DISTINCT FROM 'trainer' THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.hd_education_publications p
                    WHERE p.subject_id = p_ref AND p.status = 'published' AND p.chart_id IS NOT NULL) THEN
      RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404';
    END IF;
  ELSE
    IF public.hd_edu_priv_resolve_actor(p_actor) IS DISTINCT FROM 'trainer' THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
    SELECT it.tenant_id, it.trainer_user_id INTO i FROM public.hd_edu_private_items it WHERE it.id = p_ref;
    IF NOT FOUND OR i.trainer_user_id <> p_actor OR i.tenant_id IS DISTINCT FROM v_tenant
       OR public.hd_edu_priv_item_state(p_ref, false) <> 'ok' THEN
      RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404';
    END IF;
  END IF;
  RETURN v_tenant;
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_ann_layer_json(l public.hd_edu_annotation_layers, p_with_doc boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_build_object('id', l.id, 'source_kind', l.source_kind,
           'source_id', coalesce(l.central_subject_id, l.private_item_id), 'el_count', l.el_count,
           'revision', l.revision, 'created_at', l.created_at, 'updated_at', l.updated_at)
         || CASE WHEN p_with_doc THEN jsonb_build_object('doc', l.doc) ELSE '{}'::jsonb END
$$;

-- ─── RPC: eğitmen ────────────────────────────────────────────────────────────────────────────────
-- Kendi katmanı (yoksa layer = null). Başka eğitmenin katmanı ASLA dönmez (sorgu aktörle sınırlı).
CREATE OR REPLACE FUNCTION public.hd_edu_ann_get(p_actor uuid, p_kind text, p_ref uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE l public.hd_edu_annotation_layers%ROWTYPE; v_tenant uuid;
BEGIN
  v_tenant := public.hd_edu_ann_trainer_source(p_actor, p_kind, p_ref);
  SELECT * INTO l FROM public.hd_edu_annotation_layers a
   WHERE a.trainer_user_id = p_actor AND a.tenant_id = v_tenant
     AND ((p_kind = 'central' AND a.central_subject_id = p_ref) OR (p_kind = 'private' AND a.private_item_id = p_ref));
  IF NOT FOUND THEN RETURN jsonb_build_object('layer', NULL); END IF;
  RETURN jsonb_build_object('layer', public.hd_edu_ann_layer_json(l, true));
END $$;

-- Kaydet (CAS). p_expected_revision: 0 = yeni katman; aksi hâlde mevcut revizyon. Uyuşmazlık → EA409.
CREATE OR REPLACE FUNCTION public.hd_edu_ann_save(p_actor uuid, p_kind text, p_ref uuid, p_doc jsonb, p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_tenant uuid; l public.hd_edu_annotation_layers%ROWTYPE; v_n integer;
BEGIN
  v_tenant := public.hd_edu_ann_trainer_source(p_actor, p_kind, p_ref);
  IF p_doc IS NULL OR jsonb_typeof(p_doc) <> 'object' OR jsonb_typeof(p_doc -> 'els') <> 'array' THEN
    RAISE EXCEPTION 'hd_edu_ann: geçersiz içerik' USING ERRCODE = 'EA400';
  END IF;
  v_n := jsonb_array_length(p_doc -> 'els');
  IF v_n > 400 OR char_length(p_doc::text) > 200000 THEN RAISE EXCEPTION 'hd_edu_ann: içerik çok büyük' USING ERRCODE = 'EA413'; END IF;
  IF position('<' IN p_doc::text) > 0 OR position('>' IN p_doc::text) > 0 THEN RAISE EXCEPTION 'hd_edu_ann: geçersiz içerik' USING ERRCODE = 'EA400'; END IF;
  SELECT * INTO l FROM public.hd_edu_annotation_layers a
   WHERE a.trainer_user_id = p_actor AND a.tenant_id = v_tenant
     AND ((p_kind = 'central' AND a.central_subject_id = p_ref) OR (p_kind = 'private' AND a.private_item_id = p_ref))
   FOR UPDATE;
  IF NOT FOUND THEN
    IF coalesce(p_expected_revision, -1) <> 0 THEN RAISE EXCEPTION 'hd_edu_ann: revizyon çakışması (güncel=0)' USING ERRCODE = 'EA409', DETAIL = '0'; END IF;
    BEGIN
      INSERT INTO public.hd_edu_annotation_layers (tenant_id, trainer_user_id, source_kind, central_subject_id, private_item_id, doc, el_count)
      VALUES (v_tenant, p_actor, p_kind, CASE WHEN p_kind = 'central' THEN p_ref END, CASE WHEN p_kind = 'private' THEN p_ref END, p_doc, v_n)
      RETURNING * INTO l;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'hd_edu_ann: revizyon çakışması (güncel=1)' USING ERRCODE = 'EA409', DETAIL = '1';
    END;
    INSERT INTO public.hd_edu_annotation_audit (tenant_id, actor_kind, actor_user_id, action, layer_id, source_kind, source_id, trainer_user_id, el_count)
    VALUES (v_tenant, 'trainer', p_actor, 'layer_created', l.id, p_kind, p_ref, p_actor, v_n);
  ELSE
    IF l.revision IS DISTINCT FROM p_expected_revision THEN
      RAISE EXCEPTION 'hd_edu_ann: revizyon çakışması (güncel=%)', l.revision USING ERRCODE = 'EA409', DETAIL = l.revision::text;
    END IF;
    UPDATE public.hd_edu_annotation_layers SET doc = p_doc, el_count = v_n, revision = l.revision + 1, updated_at = now()
     WHERE id = l.id RETURNING * INTO l;
    INSERT INTO public.hd_edu_annotation_audit (tenant_id, actor_kind, actor_user_id, action, layer_id, source_kind, source_id, trainer_user_id, el_count)
    VALUES (v_tenant, 'trainer', p_actor, 'layer_updated', l.id, p_kind, p_ref, p_actor, v_n);
  END IF;
  RETURN jsonb_build_object('layer', public.hd_edu_ann_layer_json(l, false));
END $$;

-- Tüm katmanı temizle (açık onay + CAS). BodyGraph / danışan / merkezî kayıt ETKİLENMEZ.
CREATE OR REPLACE FUNCTION public.hd_edu_ann_clear(p_actor uuid, p_kind text, p_ref uuid, p_expected_revision integer, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_tenant uuid; l public.hd_edu_annotation_layers%ROWTYPE;
BEGIN
  v_tenant := public.hd_edu_ann_trainer_source(p_actor, p_kind, p_ref);
  IF p_confirm IS NOT TRUE THEN RAISE EXCEPTION 'hd_edu_ann: açık onay gerekli' USING ERRCODE = 'EA422'; END IF;
  SELECT * INTO l FROM public.hd_edu_annotation_layers a
   WHERE a.trainer_user_id = p_actor AND a.tenant_id = v_tenant
     AND ((p_kind = 'central' AND a.central_subject_id = p_ref) OR (p_kind = 'private' AND a.private_item_id = p_ref))
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('deleted', 0); END IF;
  IF l.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'hd_edu_ann: revizyon çakışması (güncel=%)', l.revision USING ERRCODE = 'EA409', DETAIL = l.revision::text; END IF;
  DELETE FROM public.hd_edu_annotation_layers WHERE id = l.id;
  INSERT INTO public.hd_edu_annotation_audit (tenant_id, actor_kind, actor_user_id, action, layer_id, source_kind, source_id, trainer_user_id, el_count)
  VALUES (v_tenant, 'trainer', p_actor, 'layer_cleared', l.id, p_kind, p_ref, p_actor, l.el_count);
  RETURN jsonb_build_object('deleted', 1);
END $$;

-- ─── RPC: owner ──────────────────────────────────────────────────────────────────────────────────
-- Katman listesi (içerik YOK). p_kind/p_ref verilirse yalnız o harita.
CREATE OR REPLACE FUNCTION public.hd_edu_ann_owner_list(p_actor uuid, p_kind text DEFAULT NULL, p_ref uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('central','private') THEN RAISE EXCEPTION 'hd_edu_ann: geçersiz içerik' USING ERRCODE = 'EA400'; END IF;
  RETURN jsonb_build_object('layers', coalesce((
    SELECT jsonb_agg(public.hd_edu_ann_layer_json(a, false)
             || jsonb_build_object('trainer_user_id', a.trainer_user_id, 'trainer_name', u.full_name,
                  -- İzni geri çekilmiş / geçersiz özel kayıtta başlık bile gönderilmez (asgari idari bilgi).
                  'source_title', CASE WHEN a.source_kind = 'central' THEN s.display_name WHEN st.v = 'ok' THEN it.title ELSE NULL END,
                  'source_state', st.v,
                  -- FAZ 19: özel kaydın türü (kurgusal / gerçek) — idari bilgi; içerik kapalıyken de yalnız tür döner.
                  'private_kind', CASE WHEN a.source_kind = 'private' THEN it.item_kind END,
                  'content_closed', a.source_kind = 'private' AND st.v <> 'ok',
                  'grant_active', EXISTS (SELECT 1 FROM public.hd_education_access_grants g
                                           WHERE g.user_id = a.trainer_user_id AND g.revoked_at IS NULL AND g.granted_tenant_id = u.tenant_id))
             ORDER BY a.updated_at DESC)
      FROM public.hd_edu_annotation_layers a
      JOIN public.users u ON u.id = a.trainer_user_id
      LEFT JOIN public.hd_education_subjects s ON s.id = a.central_subject_id
      LEFT JOIN public.hd_edu_private_items it ON it.id = a.private_item_id
      CROSS JOIN LATERAL (SELECT CASE WHEN a.source_kind = 'private' THEN public.hd_edu_priv_item_state(a.private_item_id, false)
                                      ELSE coalesce((SELECT p.status FROM public.hd_education_publications p WHERE p.subject_id = a.central_subject_id), 'missing') END AS v) st
     WHERE (p_kind IS NULL OR a.source_kind = p_kind)
       AND (p_ref IS NULL OR coalesce(a.central_subject_id, a.private_item_id) = p_ref)), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_ann_owner_get(p_actor uuid, p_layer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE l public.hd_edu_annotation_layers%ROWTYPE; v_name text; v_state text; v_closed boolean;
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  SELECT * INTO l FROM public.hd_edu_annotation_layers WHERE id = p_layer;
  IF NOT FOUND THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  SELECT full_name INTO v_name FROM public.users WHERE id = l.trainer_user_id;
  v_state := CASE WHEN l.source_kind = 'private' THEN public.hd_edu_priv_item_state(l.private_item_id, false)
                  ELSE coalesce((SELECT p.status FROM public.hd_education_publications p WHERE p.subject_id = l.central_subject_id), 'missing') END;
  -- FAZ 9: izni geri çekilmiş / geçersiz özel kayıtta çizim ve not içeriği owner'a da GÖNDERİLMEZ (yalnız idari bilgi).
  v_closed := l.source_kind = 'private' AND v_state <> 'ok';
  IF NOT v_closed THEN
    INSERT INTO public.hd_edu_annotation_audit (tenant_id, actor_kind, actor_user_id, action, layer_id, source_kind, source_id, trainer_user_id, el_count)
    VALUES (l.tenant_id, 'owner', p_actor, 'owner_viewed', l.id, l.source_kind, coalesce(l.central_subject_id, l.private_item_id), l.trainer_user_id, l.el_count);
  END IF;
  RETURN jsonb_build_object('layer', public.hd_edu_ann_layer_json(l, NOT v_closed)
           || jsonb_build_object('trainer_user_id', l.trainer_user_id, 'trainer_name', v_name, 'source_state', v_state, 'content_closed', v_closed));
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_ann_owner_delete(p_actor uuid, p_layer uuid, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE l public.hd_edu_annotation_layers%ROWTYPE;
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  IF p_confirm IS NOT TRUE THEN RAISE EXCEPTION 'hd_edu_ann: açık onay gerekli' USING ERRCODE = 'EA422'; END IF;
  SELECT * INTO l FROM public.hd_edu_annotation_layers WHERE id = p_layer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  DELETE FROM public.hd_edu_annotation_layers WHERE id = l.id;
  INSERT INTO public.hd_edu_annotation_audit (tenant_id, actor_kind, actor_user_id, action, layer_id, source_kind, source_id, trainer_user_id, el_count)
  VALUES (l.tenant_id, 'owner', p_actor, 'owner_deleted', l.id, l.source_kind, coalesce(l.central_subject_id, l.private_item_id), l.trainer_user_id, l.el_count);
  RETURN jsonb_build_object('deleted', 1);
END $$;

-- ─── FAZ 9 · Owner: eğitmen başına yetki + veri durumu (içerik YOK; yalnız sayılar) ─────────────────
CREATE OR REPLACE FUNCTION public.hd_edu_ann_owner_trainers(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  RETURN jsonb_build_object('trainers', coalesce((
    WITH t AS (
      SELECT trainer_user_id AS uid FROM public.hd_edu_annotation_layers
      UNION SELECT trainer_user_id FROM public.hd_edu_private_items
      UNION SELECT user_id FROM public.hd_education_access_grants WHERE revoked_at IS NULL)
    SELECT jsonb_agg(jsonb_build_object(
             'user_id', u.id, 'name', u.full_name, 'account_active', u.active IS TRUE,
             'grant_active', EXISTS (SELECT 1 FROM public.hd_education_access_grants g
                                      WHERE g.user_id = u.id AND g.revoked_at IS NULL AND g.granted_tenant_id = u.tenant_id),
             'central_layers', (SELECT count(*) FROM public.hd_edu_annotation_layers a WHERE a.trainer_user_id = u.id AND a.source_kind = 'central'),
             'private_layers', (SELECT count(*) FROM public.hd_edu_annotation_layers a WHERE a.trainer_user_id = u.id AND a.source_kind = 'private'),
             'private_items', (SELECT count(*) FROM public.hd_edu_private_items i WHERE i.trainer_user_id = u.id),
             'private_items_closed', (SELECT count(*) FROM public.hd_edu_private_items i
                                       WHERE i.trainer_user_id = u.id AND public.hd_edu_priv_item_state(i.id, false) <> 'ok'),
             'last_activity', greatest((SELECT max(a.updated_at) FROM public.hd_edu_annotation_layers a WHERE a.trainer_user_id = u.id),
                                       (SELECT max(i.updated_at) FROM public.hd_edu_private_items i WHERE i.trainer_user_id = u.id)))
           ORDER BY lower(coalesce(u.full_name, '')))
      FROM t JOIN public.users u ON u.id = t.uid), '[]'::jsonb));
END $$;

-- Kalıcı silme ÖNİZLEME: etkilenecek ve KORUNACAK kayıt sayıları (içerik yok).
CREATE OR REPLACE FUNCTION public.hd_edu_ann_owner_purge_preview(p_actor uuid, p_trainer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  SELECT * INTO u FROM public.users WHERE id = p_trainer;
  IF NOT FOUND OR public.hd_edu_priv_is_owner(p_trainer) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  RETURN jsonb_build_object(
    'user_id', u.id, 'name', u.full_name,
    'grant_active', EXISTS (SELECT 1 FROM public.hd_education_access_grants g WHERE g.user_id = u.id AND g.revoked_at IS NULL),
    'layers', (SELECT count(*) FROM public.hd_edu_annotation_layers a WHERE a.trainer_user_id = u.id),
    'items', (SELECT count(*) FROM public.hd_edu_private_items i WHERE i.trainer_user_id = u.id),
    'kept_consents', (SELECT count(*) FROM public.hd_edu_private_consents k WHERE k.recorded_by = u.id),
    'kept_audit', (SELECT count(*) FROM public.hd_edu_private_audit x WHERE x.actor_user_id = u.id)
                + (SELECT count(*) FROM public.hd_edu_annotation_audit x WHERE x.trainer_user_id = u.id));
END $$;

-- Kalıcı silme: YALNIZ owner, YALNIZ eğitim yetkisi KAPALIYKEN, önizleme sayıları birebir + "N KAYDI SİL" ifadesi.
-- Silinen: eğitmenin çizim katmanları + özel eğitim arşivi kayıtları. KORUNAN: izin kayıtları + kanıtları, denetim izi,
-- danışan / HD harita / Danışan Yolculuğu / merkezî kayıtlar, kullanıcı hesabı. Süreye bağlı otomatik çağrı YOKTUR.
CREATE OR REPLACE FUNCTION public.hd_edu_ann_owner_purge(p_actor uuid, p_trainer uuid, p_expected_layers integer, p_expected_items integer, p_confirm_phrase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE u public.users%ROWTYPE; v_l integer; v_i integer; v_total integer; v_phrase text; r record;
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  SELECT * INTO u FROM public.users WHERE id = p_trainer FOR UPDATE;
  IF NOT FOUND OR public.hd_edu_priv_is_owner(p_trainer) THEN RAISE EXCEPTION 'hd_edu_ann: bulunamadı' USING ERRCODE = 'EA404'; END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_access_grants g WHERE g.user_id = p_trainer AND g.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'hd_edu_ann: eğitim yetkisi açık' USING ERRCODE = 'EA423';
  END IF;
  SELECT count(*) INTO v_l FROM public.hd_edu_annotation_layers WHERE trainer_user_id = p_trainer;
  SELECT count(*) INTO v_i FROM public.hd_edu_private_items WHERE trainer_user_id = p_trainer;
  IF v_l IS DISTINCT FROM p_expected_layers OR v_i IS DISTINCT FROM p_expected_items THEN
    RAISE EXCEPTION 'hd_edu_ann: sayılar değişti (güncel=%)', v_l + v_i USING ERRCODE = 'EA409';
  END IF;
  v_total := v_l + v_i;
  IF v_total = 0 THEN RETURN jsonb_build_object('layers', 0, 'items', 0); END IF;
  v_phrase := upper(regexp_replace(btrim(coalesce(p_confirm_phrase, '')), '\s+', ' ', 'g'));
  IF v_phrase <> v_total::text || ' KAYDI SİL' AND v_phrase <> v_total::text || ' KAYDI SIL' THEN
    RAISE EXCEPTION 'hd_edu_ann: açık onay gerekli' USING ERRCODE = 'EA422';
  END IF;
  DELETE FROM public.hd_edu_annotation_layers WHERE trainer_user_id = p_trainer;
  FOR r IN DELETE FROM public.hd_edu_private_items WHERE trainer_user_id = p_trainer RETURNING id, tenant_id, consent_id LOOP
    INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, item_id, consent_id, target_user_id)
    VALUES (r.tenant_id, 'owner', p_actor, 'item_deleted', r.id, r.consent_id, p_trainer);
  END LOOP;
  INSERT INTO public.hd_edu_annotation_audit (tenant_id, actor_kind, actor_user_id, action, trainer_user_id, el_count)
  VALUES (u.tenant_id, 'owner', p_actor, 'owner_purged', p_trainer, v_l);
  RETURN jsonb_build_object('layers', v_l, 'items', v_i);
END $$;

-- ─── Ayrıcalıklar: hiçbir role TABLO ayrıcalığı yok; yalnız service_role belirli RPC'leri çalıştırır ─
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hd_edu_annotation_layers','hd_edu_annotation_audit'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.hd_edu_ann_audit_guard()', 'public.hd_edu_ann_layer_guard()', 'public.hd_edu_ann_central_actor(uuid)',
    'public.hd_edu_ann_trainer_source(uuid, text, uuid)', 'public.hd_edu_ann_layer_json(public.hd_edu_annotation_layers, boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.hd_edu_ann_get(uuid, text, uuid)', 'public.hd_edu_ann_save(uuid, text, uuid, jsonb, integer)',
    'public.hd_edu_ann_clear(uuid, text, uuid, integer, boolean)',
    'public.hd_edu_ann_owner_list(uuid, text, uuid)', 'public.hd_edu_ann_owner_get(uuid, uuid)',
    'public.hd_edu_ann_owner_delete(uuid, uuid, boolean)',
    'public.hd_edu_ann_owner_trainers(uuid)', 'public.hd_edu_ann_owner_purge_preview(uuid, uuid)',
    'public.hd_edu_ann_owner_purge(uuid, uuid, integer, integer, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT has_table_privilege('service_role','public.hd_edu_annotation_layers','SELECT');   -- false
--   SELECT count(*) FROM public.hd_edu_annotation_layers;                                     -- 0
-- ROLLBACK (yalnız hiç kullanılmadıysa): 2 tabloyu + hd_edu_ann_* fonksiyonlarını DROP (mevcut tablolar etkilenmez).
-- =============================================================================
