-- ============================================================
-- 20271003100000_aromatherapy_owner_delete_taxa_preparations_claims.sql
--
-- Aromaterapi Bilgi Sistemi — Bitki (takson) / Preparat / Bilgi Kaydı (claim)
-- SAHİP (tenant) SİLME YAZARLARI (Doğal Destek P2 — AROMA-4)
--
-- AMAÇ:
--   Uzmanın KENDİ tenant'ındaki bitki, preparat ve bilgi kaydını kalıcı silebilmesi.
--   Bu üç tabloda paylaşımlı/sistem satırı YOKTUR (tenant_id NOT NULL; null-tenant/shared
--   kavramı yok — 20260719010000 / 20260719020000 / 20260720000000). Başka tenant'ın kaydı
--   NOT_FOUND döner (varlık sızmaz). Başka kayıtların sessizce değişmesine izin verilmez:
--     - Takson → preparat referansı varsa SİLİNMEZ: AROMA_TAXON_REFERENCED
--       (+ DETAIL {"preparations":n}).
--     - Preparat → bilgi kaydı / üretim yöntemi serisi referansı varsa SİLİNMEZ:
--       AROMA_PREPARATION_REFERENCED (+ DETAIL {"claims":n,"method_series":n}).
--     - Bilgi kaydı → kendi alt kayıtları (claim_routes / claim_populations / claim_sources /
--       claim_passages) FK ON DELETE CASCADE ile birlikte silinir. claim_relations SİMETRİKTİR
--       (kanonik a_claim_id < b_claim_id; 20260722000000) → her ilişki satırı İKİNCİ bir bilgi
--       kaydının da ilişki listesinde görünür. Cascade bu diğer kaydı sessizce değiştireceği
--       için ilişkisi olan kayıt SİLİNMEZ: AROMA_CLAIM_REFERENCED (+ DETAIL {"relations":n});
--       kullanıcı önce ilişkiyi düzenleme ekranından kaldırır.
--
-- KAPSAM (tek transaction):
--   1. aromatherapy_claim_audit_events CHECK genişletmesi: operation 'delete' eklenir;
--      operation_state CHECK'i 'delete' için previous_state NOT NULL + reason NOT NULL +
--      new_state = {"deleted": true} şartını taşır. create/update kuralları AYNEN korunur.
--      Append-only immutable trigger (trg_aromatherapy_claim_audit_events_immutable) DEĞİŞMEZ.
--   2. public.aromatherapy_delete_plant_taxon_with_audit(p_tenant_id, p_actor_user_id,
--        p_actor_label_snapshot, p_taxon_id, p_expected_updated_at, p_reason) RETURNS jsonb
--   3. public.aromatherapy_delete_preparation_with_audit(..., p_preparation_id, ...) RETURNS jsonb
--   4. public.aromatherapy_delete_claim_with_audit(..., p_claim_id, ...) RETURNS jsonb
--      Ortak: SECURITY DEFINER + SET search_path = pg_catalog, public; tenant/actor YALNIZ
--      parametreden (server adapter oturumdan çözer); public.users'a ERİŞMEZ. Tenant-kapsamlı
--      FOR UPDATE kilidi; p_expected_updated_at ZORUNLU (uyuşmazsa AROMA_STALE); reason ZORUNLU.
--      Yarışta FK RESTRICT (23503) aynı *_REFERENCED koduna çevrilir (defense-in-depth).
--      Takson/preparat: content audit ('delete', bounded previous_summary ≤ 8000, sha256) +
--      tombstone ('single', bounded identity_summary ≤ 4000, content_hash).
--      Claim: claim audit ('delete', previous_state = aromatherapy_claim_snapshot(...) silmeden
--      ÖNCE, new_state = {"deleted": true}); tombstone tablosu claim kabul etmez (claim audit ayrı).
--   5. REVOKE ALL FROM PUBLIC/anon/authenticated/service_role + GRANT EXECUTE service_role.
--
-- YH CDC: yh_cdc_aromatherapy_plant_taxa_trg / yh_cdc_aromatherapy_preparations_trg
--   (20261215000000) AFTER INSERT OR UPDATE OR DELETE'tir ve DELETE'te OLD.id/OLD.tenant_id
--   kullanır; bu migration onlara DOKUNMAZ. Claim tabloları CDC kohortu dışındadır.
--
-- PRECONDITION: aroma takson/preparat/claim (+ alt) tabloları, method series (20260912000000),
--   content audit + tombstone (20260830000000), claim audit + snapshot (20260817000000) mevcut
--   olmalı. Yoksa açık hata ile durur (sessiz skip YOK).
--
-- PRODUCTION'A UYGULANMADI. Kod (DELETE /api/aromaterapi/plant-taxa/[id],
--   /preparations/[id], /claims/[id]) ile AYNI deploy'da veya ÖNCE uygulanmalı; RPC yoksa
--   route 503 AROMA_DELETE_UNAVAILABLE döner (veri etkilenmez).
-- VERİ-YIKICI MI: Migration'ın kendisi HAYIR (fonksiyon tanımı + CHECK genişletmesi; DML yok).
--   Fonksiyon çağrıldığında yalnız referanssız TEK satırı (claim'de + kendi alt satırlarını) siler.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP CONSTRAINT IF EXISTS/ADD + tekrarlanabilir REVOKE/GRANT.
-- ROLLBACK:
--   DROP FUNCTION public.aromatherapy_delete_plant_taxon_with_audit(uuid, uuid, text, uuid, timestamptz, text);
--   DROP FUNCTION public.aromatherapy_delete_preparation_with_audit(uuid, uuid, text, uuid, timestamptz, text);
--   DROP FUNCTION public.aromatherapy_delete_claim_with_audit(uuid, uuid, text, uuid, timestamptz, text);
--   (Claim audit CHECK'leri geri daraltılacaksa ÖNCE operation='delete' satırı olmadığı
--    doğrulanmalı; audit/tombstone satırları append-only'dir ve kalır.)
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.aromatherapy_plant_taxa') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_plant_taxa yok';
  END IF;
  IF to_regclass('public.aromatherapy_preparations') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_preparations yok';
  END IF;
  IF to_regclass('public.aromatherapy_claims') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_claims yok';
  END IF;
  IF to_regclass('public.aromatherapy_claim_relations') IS NULL
     OR to_regclass('public.aromatherapy_claim_routes') IS NULL
     OR to_regclass('public.aromatherapy_claim_populations') IS NULL
     OR to_regclass('public.aromatherapy_claim_sources') IS NULL
     OR to_regclass('public.aromatherapy_claim_passages') IS NULL THEN
    RAISE EXCEPTION 'precondition: claim alt tabloları eksik';
  END IF;
  IF to_regclass('public.aromatherapy_preparation_method_series') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_preparation_method_series yok';
  END IF;
  IF to_regclass('public.aromatherapy_content_audit_events') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_content_audit_events yok';
  END IF;
  IF to_regclass('public.aromatherapy_content_delete_tombstones') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_content_delete_tombstones yok';
  END IF;
  IF to_regclass('public.aromatherapy_claim_audit_events') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_claim_audit_events yok';
  END IF;
  IF to_regprocedure('public.aromatherapy_claim_snapshot(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_claim_snapshot(uuid,uuid) yok';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Claim audit CHECK genişletmesi ('delete'). create/update kuralları birebir korunur.
-- ------------------------------------------------------------
ALTER TABLE public.aromatherapy_claim_audit_events
  DROP CONSTRAINT IF EXISTS aromatherapy_claim_audit_events_operation_chk;
ALTER TABLE public.aromatherapy_claim_audit_events
  ADD CONSTRAINT aromatherapy_claim_audit_events_operation_chk CHECK (
    operation IN ('create', 'update', 'delete')
  );

ALTER TABLE public.aromatherapy_claim_audit_events
  DROP CONSTRAINT IF EXISTS aromatherapy_claim_audit_events_operation_state_chk;
ALTER TABLE public.aromatherapy_claim_audit_events
  ADD CONSTRAINT aromatherapy_claim_audit_events_operation_state_chk CHECK (
    (
      operation = 'create'
      AND previous_state IS NULL
    )
    OR
    (
      operation = 'update'
      AND previous_state IS NOT NULL
      AND reason IS NOT NULL
    )
    OR
    (
      operation = 'delete'
      AND previous_state IS NOT NULL
      AND reason IS NOT NULL
      AND new_state = '{"deleted": true}'::jsonb
    )
  );

-- ------------------------------------------------------------
-- 2) Takson silme
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aromatherapy_delete_plant_taxon_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_taxon_id              uuid,
  p_expected_updated_at   timestamptz,
  p_reason                text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label         text;
  v_old           public.aromatherapy_plant_taxa%ROWTYPE;
  v_preparations  bigint := 0;
  v_prev          jsonb;
  v_identity      jsonb;
  v_hash          text;
BEGIN
  IF p_tenant_id IS NULL OR p_taxon_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_TAXON_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Tenant-kapsamlı kilit (başka tenant satırı → NOT_FOUND; varlık sızmaz).
  SELECT * INTO v_old FROM public.aromatherapy_plant_taxa
   WHERE tenant_id = p_tenant_id AND id = p_taxon_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_TAXON_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- Referans sayımı (preparations.taxon_fk ON DELETE RESTRICT kapsamıyla birebir).
  SELECT count(*) INTO v_preparations FROM public.aromatherapy_preparations
   WHERE tenant_id = p_tenant_id AND taxon_id = p_taxon_id;

  IF v_preparations > 0 THEN
    RAISE EXCEPTION 'AROMA_TAXON_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('preparations', v_preparations)::text;
  END IF;

  v_prev := jsonb_build_object(
    'id', v_old.id, 'genus', v_old.genus, 'species', v_old.species,
    'taxon_rank', v_old.taxon_rank, 'infraspecific_epithet', v_old.infraspecific_epithet,
    'is_hybrid', v_old.is_hybrid, 'author_citation', v_old.author_citation,
    'family', v_old.family, 'primary_common_name_tr', v_old.primary_common_name_tr,
    'canonical_name', v_old.canonical_name, 'status', v_old.status
  );
  -- Veri minimizasyonu: audit özeti ≤ 8000 (alanlar zaten kısa; savunma için kırpma).
  IF char_length(v_prev::text) > 7800 THEN
    v_prev := jsonb_build_object(
      'id', v_old.id, 'genus', left(v_old.genus, 500), 'species', left(v_old.species, 500),
      'taxon_rank', v_old.taxon_rank,
      'infraspecific_epithet', left(coalesce(v_old.infraspecific_epithet, ''), 500),
      'is_hybrid', v_old.is_hybrid, 'author_citation', left(coalesce(v_old.author_citation, ''), 500),
      'family', left(v_old.family, 500), 'primary_common_name_tr', v_old.primary_common_name_tr,
      'canonical_name', left(v_old.canonical_name, 1500), 'status', v_old.status
    );
  END IF;

  -- Tombstone: yalnız bounded kimlik özeti (≤ 4000) + içerik hash'i.
  v_identity := jsonb_build_object(
    'id', v_old.id,
    'canonical_name', left(v_old.canonical_name, 500),
    'family', left(v_old.family, 200),
    'taxon_rank', v_old.taxon_rank,
    'status', v_old.status
  );
  -- Çekirdek pg_catalog.sha256 (PG ≥ 11; pgcrypto bağımlılığı YOK). 64 hex lowercase.
  v_hash := encode(pg_catalog.sha256(convert_to(v_prev::text, 'UTF8')), 'hex');

  BEGIN
    DELETE FROM public.aromatherapy_plant_taxa
     WHERE tenant_id = p_tenant_id AND id = p_taxon_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- Yarış: sayım sonrası eklenen preparat → FK RESTRICT. Aynı stabil koda çevrilir.
    RAISE EXCEPTION 'AROMA_TAXON_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('preparations', -1)::text;
  END;

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary, previous_content_hash
  ) VALUES (
    p_tenant_id, 'plant_taxon', p_taxon_id, p_actor_user_id, v_label,
    'delete', btrim(p_reason), v_prev, NULL, v_hash
  );

  INSERT INTO public.aromatherapy_content_delete_tombstones (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    reason, deletion_mode, identity_summary, content_hash
  ) VALUES (
    p_tenant_id, 'plant_taxon', p_taxon_id, p_actor_user_id, v_label,
    btrim(p_reason), 'single', v_identity, v_hash
  );

  RETURN jsonb_build_object('entity_id', p_taxon_id, 'deleted', true, 'noop', false, 'updated_at', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_delete_plant_taxon_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_plant_taxon_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_plant_taxon_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_plant_taxon_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_delete_plant_taxon_with_audit(uuid, uuid, text, uuid, timestamptz, text) TO service_role;

-- ------------------------------------------------------------
-- 3) Preparat silme
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aromatherapy_delete_preparation_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_preparation_id        uuid,
  p_expected_updated_at   timestamptz,
  p_reason                text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label          text;
  v_old            public.aromatherapy_preparations%ROWTYPE;
  v_claims         bigint := 0;
  v_method_series  bigint := 0;
  v_prev           jsonb;
  v_identity       jsonb;
  v_hash           text;
BEGIN
  IF p_tenant_id IS NULL OR p_preparation_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_PREPARATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old FROM public.aromatherapy_preparations
   WHERE tenant_id = p_tenant_id AND id = p_preparation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_PREPARATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- Referans sayımı (claims.preparation_fk + method_series.preparation_fk RESTRICT kapsamı).
  SELECT count(*) INTO v_claims FROM public.aromatherapy_claims
   WHERE tenant_id = p_tenant_id AND preparation_id = p_preparation_id;
  SELECT count(*) INTO v_method_series FROM public.aromatherapy_preparation_method_series
   WHERE tenant_id = p_tenant_id AND preparation_id = p_preparation_id;

  IF v_claims > 0 OR v_method_series > 0 THEN
    RAISE EXCEPTION 'AROMA_PREPARATION_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('claims', v_claims, 'method_series', v_method_series)::text;
  END IF;

  v_prev := jsonb_build_object(
    'id', v_old.id, 'taxon_id', v_old.taxon_id, 'preparation_type', v_old.preparation_type,
    'plant_part', left(v_old.plant_part, 500), 'chemotype', left(coalesce(v_old.chemotype, ''), 1000),
    'status', v_old.status
  );

  v_identity := jsonb_build_object(
    'id', v_old.id,
    'taxon_id', v_old.taxon_id,
    'preparation_type', v_old.preparation_type,
    'plant_part', left(v_old.plant_part, 200),
    'chemotype', left(coalesce(v_old.chemotype, ''), 200),
    'status', v_old.status
  );
  v_hash := encode(pg_catalog.sha256(convert_to(v_prev::text, 'UTF8')), 'hex');

  BEGIN
    DELETE FROM public.aromatherapy_preparations
     WHERE tenant_id = p_tenant_id AND id = p_preparation_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'AROMA_PREPARATION_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('claims', -1, 'method_series', -1)::text;
  END;

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary, previous_content_hash
  ) VALUES (
    p_tenant_id, 'preparation', p_preparation_id, p_actor_user_id, v_label,
    'delete', btrim(p_reason), v_prev, NULL, v_hash
  );

  INSERT INTO public.aromatherapy_content_delete_tombstones (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    reason, deletion_mode, identity_summary, content_hash
  ) VALUES (
    p_tenant_id, 'preparation', p_preparation_id, p_actor_user_id, v_label,
    btrim(p_reason), 'single', v_identity, v_hash
  );

  RETURN jsonb_build_object('entity_id', p_preparation_id, 'deleted', true, 'noop', false, 'updated_at', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_delete_preparation_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_preparation_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_preparation_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_preparation_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_delete_preparation_with_audit(uuid, uuid, text, uuid, timestamptz, text) TO service_role;

-- ------------------------------------------------------------
-- 4) Bilgi kaydı (claim) silme — kendi alt kayıtları CASCADE; ilişkisi varsa RED.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aromatherapy_delete_claim_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_claim_id              uuid,
  p_expected_updated_at   timestamptz,
  p_reason                text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label        text;
  v_old          public.aromatherapy_claims%ROWTYPE;
  v_relations    bigint := 0;
  v_routes       bigint := 0;
  v_populations  bigint := 0;
  v_sources      bigint := 0;
  v_passages     bigint := 0;
  v_prev         jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_claim_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_ACTOR_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_label := btrim(coalesce(p_actor_label_snapshot, ''));
  IF p_actor_label_snapshot IS NULL OR v_label = '' OR char_length(v_label) > 320 THEN
    RAISE EXCEPTION 'AROMA_ACTOR_LABEL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'AROMA_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Tenant-kapsamlı kilit. Eşzamanlı ilişki ekleme (başka claim'in update RPC'si) bu satırda
  -- FK KEY SHARE kilidi bekler → silme commit olunca FK hatası alır; sessiz cascade olmaz.
  SELECT * INTO v_old FROM public.aromatherapy_claims
   WHERE tenant_id = p_tenant_id AND id = p_claim_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- İlişkiler simetrik: her satır diğer bilgi kaydının da ilişkisidir → silmeyi engeller.
  SELECT count(*) INTO v_relations FROM public.aromatherapy_claim_relations
   WHERE tenant_id = p_tenant_id
     AND (a_claim_id = p_claim_id OR b_claim_id = p_claim_id);

  IF v_relations > 0 THEN
    RAISE EXCEPTION 'AROMA_CLAIM_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('relations', v_relations)::text;
  END IF;

  -- Cascade ile silinecek KENDİ alt kayıtların sayıları (yanıt + şeffaflık).
  SELECT count(*) INTO v_routes FROM public.aromatherapy_claim_routes
   WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;
  SELECT count(*) INTO v_populations FROM public.aromatherapy_claim_populations
   WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;
  SELECT count(*) INTO v_sources FROM public.aromatherapy_claim_sources
   WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;
  SELECT count(*) INTO v_passages FROM public.aromatherapy_claim_passages
   WHERE tenant_id = p_tenant_id AND claim_id = p_claim_id;

  -- Silmeden ÖNCE gerçek DB durumundan snapshot (claim + alt koleksiyonlar).
  v_prev := public.aromatherapy_claim_snapshot(p_tenant_id, p_claim_id);

  BEGIN
    DELETE FROM public.aromatherapy_claims
     WHERE tenant_id = p_tenant_id AND id = p_claim_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'AROMA_CLAIM_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('relations', -1)::text;
  END;

  INSERT INTO public.aromatherapy_claim_audit_events (
    tenant_id, claim_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_state, new_state
  ) VALUES (
    p_tenant_id, p_claim_id, p_actor_user_id, v_label,
    'delete', btrim(p_reason), v_prev, '{"deleted": true}'::jsonb
  );

  RETURN jsonb_build_object(
    'entity_id', p_claim_id, 'deleted', true, 'noop', false, 'updated_at', NULL,
    'cascaded', jsonb_build_object(
      'routes', v_routes, 'populations', v_populations,
      'sources', v_sources, 'passages', v_passages
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_delete_claim_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_claim_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_claim_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_claim_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_delete_claim_with_audit(uuid, uuid, text, uuid, timestamptz, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- DOĞRULAMA (uygulama sonrası, beklenen):
--   SELECT has_function_privilege('service_role',
--     'public.aromatherapy_delete_plant_taxon_with_audit(uuid,uuid,text,uuid,timestamptz,text)', 'EXECUTE'); -- true
--   SELECT has_function_privilege('anon',
--     'public.aromatherapy_delete_claim_with_audit(uuid,uuid,text,uuid,timestamptz,text)', 'EXECUTE');       -- false
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'aromatherapy_claim_audit_events_operation_chk';                                         -- 'delete' içerir
-- ============================================================
