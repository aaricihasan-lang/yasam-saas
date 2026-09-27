-- ============================================================
-- 20270129000800_aromatherapy_delete_source.sql
--
-- Aromaterapi Bilgi Sistemi — Kaynaklar (sources) SİLME YAZARI (FAZ1 final hardening)
--
-- AMAÇ:
--   Uzmanın KENDİ tenant'ındaki, HİÇBİR yerde kullanılmayan kaynak künyesini kalıcı silebilmesi.
--   Kullanılan (atıflı) kaynak SİLİNMEZ → AROMA_SOURCE_REFERENCED (+ referans sayıları);
--   bu durumda UI "arşivleyebilirsiniz" önerir (status→archived, mevcut update yazarı).
--
-- KAPSAM (tek transaction):
--   1. public.aromatherapy_delete_source_with_audit(p_tenant_id, p_actor_user_id,
--        p_actor_label_snapshot, p_source_id, p_expected_updated_at, p_reason) RETURNS jsonb
--      - SECURITY DEFINER + SET search_path = pg_catalog, public; tenant/actor YALNIZ parametreden
--        (server adapter oturumdan çözer); public.users'a ERİŞMEZ.
--      - Satır tenant-kapsamlı FOR UPDATE kilitlenir; yoksa AROMA_SOURCE_NOT_FOUND (başka tenant
--        kaydı da NOT_FOUND → varlık sızmaz).
--      - İyimser eşzamanlılık: p_expected_updated_at zorunlu; uyuşmazsa AROMA_STALE.
--      - Referans sayımı (FK RESTRICT ile aynı kapsam): source_passages, claim_sources,
--        preparation_method_series. >0 → RAISE 'AROMA_SOURCE_REFERENCED' (ERRCODE P0001) +
--        DETAIL = {"passages":n,"claim_sources":n,"method_series":n} (JSON). Yarış durumunda
--        FK RESTRICT (23503) yine AROMA_SOURCE_REFERENCED'e çevrilir (defense-in-depth).
--      - Referanssız → hard DELETE + audit ('delete', previous_summary, reason zorunlu) +
--        tombstone (deletion_mode 'single', bounded identity_summary + content_hash).
--   2. REVOKE ALL FROM PUBLIC/anon/authenticated/service_role + GRANT EXECUTE service_role.
--
-- PRECONDITION: public.aromatherapy_sources, public.aromatherapy_content_audit_events,
--   public.aromatherapy_content_delete_tombstones mevcut olmalı (20260719000000,
--   20260830000000). Yoksa açık hata ile durur (sessiz skip YOK).
--
-- PRODUCTION'A UYGULANMADI. Kod (DELETE /api/aromaterapi/sources/[id]) ile AYNI deploy'da
--   veya ÖNCE uygulanmalı; RPC yoksa route 500 AROMA_WRITE_FAILED döner (veri etkilenmez).
-- VERİ-YIKICI MI: Migration'ın kendisi HAYIR (yalnız fonksiyon tanımı; DML yok). Fonksiyon
--   çağrıldığında yalnız referanssız TEK kaynak satırını siler (audit + tombstone ile).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + tekrarlanabilir REVOKE/GRANT.
-- ROLLBACK: DROP FUNCTION public.aromatherapy_delete_source_with_audit(uuid, uuid, text, uuid, timestamptz, text);
--   (audit/tombstone satırları append-only'dir ve kalır.)
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.aromatherapy_sources') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_sources yok';
  END IF;
  IF to_regclass('public.aromatherapy_content_audit_events') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_content_audit_events yok';
  END IF;
  IF to_regclass('public.aromatherapy_content_delete_tombstones') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.aromatherapy_content_delete_tombstones yok';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.aromatherapy_delete_source_with_audit(
  p_tenant_id             uuid,
  p_actor_user_id         uuid,
  p_actor_label_snapshot  text,
  p_source_id             uuid,
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
  v_old            public.aromatherapy_sources%ROWTYPE;
  v_passages       bigint := 0;
  v_claim_sources  bigint := 0;
  v_method_series  bigint := 0;
  v_prev           jsonb;
  v_identity       jsonb;
  v_hash           text;
BEGIN
  IF p_tenant_id IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'AROMA_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
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
  SELECT * INTO v_old FROM public.aromatherapy_sources
   WHERE tenant_id = p_tenant_id AND id = p_source_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AROMA_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'AROMA_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- Referans sayımı (FK RESTRICT kapsamıyla birebir; tenant-kapsamlı).
  SELECT count(*) INTO v_passages FROM public.aromatherapy_source_passages
   WHERE tenant_id = p_tenant_id AND source_id = p_source_id;
  SELECT count(*) INTO v_claim_sources FROM public.aromatherapy_claim_sources
   WHERE tenant_id = p_tenant_id AND source_id = p_source_id;
  SELECT count(*) INTO v_method_series FROM public.aromatherapy_preparation_method_series
   WHERE tenant_id = p_tenant_id AND source_id = p_source_id;

  IF v_passages > 0 OR v_claim_sources > 0 OR v_method_series > 0 THEN
    RAISE EXCEPTION 'AROMA_SOURCE_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object(
        'passages', v_passages,
        'claim_sources', v_claim_sources,
        'method_series', v_method_series
      )::text;
  END IF;

  v_prev := jsonb_build_object(
    'id', v_old.id, 'source_type', v_old.source_type, 'title', v_old.title,
    'authors', v_old.authors, 'organization', v_old.organization,
    'publication_year', v_old.publication_year, 'doi', v_old.doi, 'pmid', v_old.pmid,
    'isbn', v_old.isbn, 'url', v_old.url, 'document_no', v_old.document_no,
    'notes', v_old.notes, 'status', v_old.status
  );
  -- Veri minimizasyonu: audit özeti ≤ 8000; aşarsa notes kırpılır (geri yükleme kopyası değil).
  IF char_length(v_prev::text) > 7800 THEN
    v_prev := v_prev || jsonb_build_object('notes', left(coalesce(v_old.notes, ''), 2000));
  END IF;

  -- Tombstone: yalnız bounded kimlik özeti (≤ 4000) + içerik hash'i.
  v_identity := jsonb_build_object(
    'id', v_old.id,
    'source_type', v_old.source_type,
    'title', left(v_old.title, 500),
    'publication_year', v_old.publication_year,
    'doi', left(coalesce(v_old.doi, ''), 200),
    'isbn', left(coalesce(v_old.isbn, ''), 200),
    'status', v_old.status
  );
  -- Çekirdek pg_catalog.sha256 (PG ≥ 11; pgcrypto bağımlılığı YOK). 64 hex lowercase.
  v_hash := encode(pg_catalog.sha256(convert_to(v_prev::text, 'UTF8')), 'hex');

  BEGIN
    DELETE FROM public.aromatherapy_sources
     WHERE tenant_id = p_tenant_id AND id = p_source_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- Yarış: sayım sonrası eklenen referans → FK RESTRICT. Aynı stabil koda çevrilir.
    RAISE EXCEPTION 'AROMA_SOURCE_REFERENCED' USING
      ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('passages', -1, 'claim_sources', -1, 'method_series', -1)::text;
  END;

  INSERT INTO public.aromatherapy_content_audit_events (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    operation, reason, previous_summary, new_summary, previous_content_hash
  ) VALUES (
    p_tenant_id, 'source', p_source_id, p_actor_user_id, v_label,
    'delete', btrim(p_reason), v_prev, NULL, v_hash
  );

  INSERT INTO public.aromatherapy_content_delete_tombstones (
    tenant_id, entity_type, entity_id, actor_user_id, actor_label_snapshot,
    reason, deletion_mode, identity_summary, content_hash
  ) VALUES (
    p_tenant_id, 'source', p_source_id, p_actor_user_id, v_label,
    btrim(p_reason), 'single', v_identity, v_hash
  );

  RETURN jsonb_build_object('entity_id', p_source_id, 'deleted', true, 'noop', false, 'updated_at', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_delete_source_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_source_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_source_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_delete_source_with_audit(uuid, uuid, text, uuid, timestamptz, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.aromatherapy_delete_source_with_audit(uuid, uuid, text, uuid, timestamptz, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- DOĞRULAMA (uygulama sonrası, beklenen):
--   SELECT has_function_privilege('service_role',
--     'public.aromatherapy_delete_source_with_audit(uuid,uuid,text,uuid,timestamptz,text)', 'EXECUTE'); -- true
--   SELECT has_function_privilege('anon',
--     'public.aromatherapy_delete_source_with_audit(uuid,uuid,text,uuid,timestamptz,text)', 'EXECUTE'); -- false
-- ============================================================
