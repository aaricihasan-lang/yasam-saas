-- =============================================================================
-- 20261217000000_yh_client_index_private_reclassify.sql
--
-- YAŞAM HAFIZASI™ — PRIVATE MEMORY: CLIENT INDEX PRIVATE/SENSITIVE RECLASSIFY
--
-- POLİTİKA KİLİDİ (kullanıcı, TUR 2):
--   md.1  Danışan klinik SERBEST METNİ aranabilir olacaktır.
--   md.2  yasam_hafizasi_client_index tamamen PRIVATE/SENSITIVE kabul edilir;
--         "PII-free index" varsayımı KALDIRILIR.
--   md.4  Güvenlik REDACTION'a değil AUTHORIZATION'a dayanır (tenant+client fail-closed).
--
-- KAPSAM (yalnız DDL + fonksiyon REPLACE; DATA MUTASYONU YOK):
--   1. public.yasam_hafizasi_client_index → yhci_no_pii_chk CHECK KALDIRILIR
--      (index artık PRIVATE kabul; serbest klinik metin searchText'e girebilir).
--   2. public.yh_search_client_candidates(...) REPLACE → `is_client_pii = false`
--      görünürlük filtresi KALDIRILIR (klinik satırlar owner'a döner). İmza + güvenlik
--      sözleşmesi (INVOKER, STABLE, tenant+client+demo guard, service_role-only) AYNI.
--
-- BAĞLAYICI SINIR (Politika Kilidi md.14):
--   - Professional/global index (public.yasam_hafizasi_index) ve RPC
--     (public.yh_search_candidates) DEĞİŞTİRİLMEZ (bu dosyada adı bile geçmez).
--   - Tenant-client bütünlüğü composite FK (tenant_id, client_id)→clients(tenant_id,id)
--     ON DELETE CASCADE KORUNUR (20260923000000). Bu migration FK'ye dokunmaz.
--   - Doğrudan kimlik kolonları (ad/soyad/telefon/adres/e-posta/doğum) uygulama
--     katmanında searchText'e GİRMEZ (clientSources.piiDenylist); bu DB-level değil
--     kaynak-config sözleşmesidir. is_client_pii kolonu KORUNUR (default false;
--     provenance/telemetri; artık görünürlük gate'i DEĞİL).
--
-- DORMANT: Bu migration HİÇBİR kaynak tabloya trigger kurmaz; INSERT/UPDATE/DELETE
--   veri operasyonu YOK; backfill YOK. Uygulanınca mevcut veri İNDEKSLENMEZ.
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY (bu turda UYGULANMAZ).
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + CREATE OR REPLACE FUNCTION + REVOKE/GRANT.
-- =============================================================================

BEGIN;

-- ─── 1) PII-free CHECK kaldır (index artık PRIVATE/SENSITIVE) ─────────────────
ALTER TABLE public.yasam_hafizasi_client_index
  DROP CONSTRAINT IF EXISTS yhci_no_pii_chk;

COMMENT ON TABLE public.yasam_hafizasi_client_index IS
  'PRIVATE/SENSITIVE danışan hafıza indeksi. Klinik serbest metin (searchText) içerir; '
  'güvenlik tenant+client authorization ile (RPC yh_search_client_candidates / '
  'yh_search_tenant_client_candidates). Doğrudan kimlik kolonları uygulama katmanında '
  'index dışıdır (clientSources.piiDenylist); danışan adı kopyalanmaz (query-time resolve).';

-- ─── 2) Per-client RPC: is_client_pii görünürlük filtresi KALDIR ─────────────
-- İmza + güvenlik AYNI; yalnız `AND i.is_client_pii = false` satırı çıkarıldı
-- (index artık PRIVATE → klinik satırlar owner uzmana döner).
CREATE OR REPLACE FUNCTION public.yh_search_client_candidates(
  p_tsquery        text,
  p_session_tenant uuid,
  p_client_id      uuid,
  p_weights        float4[],
  p_limit          integer
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  source_module     text,
  source_table      text,
  source_id         uuid,
  unit_type         text,
  section_ref       text,
  group_key         text,
  title             text,
  snippet           text,
  evidence_fields   jsonb,
  topic_tags        text[],
  expert_relations  jsonb,
  is_client_pii     boolean,
  occurred_at       timestamptz,
  source_updated_at timestamptz,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
BEGIN
  -- Fail-closed sınır guard'ları (client bağlamı: tenant + client ZORUNLU).
  IF p_session_tenant IS NULL OR p_client_id IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;

  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_client_candidates: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_client_candidates: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_client_candidates: p_weights gecersiz eleman';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  -- Görünürlük (tenant + client + demo) ORDER BY / LIMIT'ten ÖNCE. Shared YOK.
  -- is_client_pii filtresi YOK: index PRIVATE → klinik serbest metin owner'a döner.
  RETURN QUERY
  SELECT
    i.id, i.tenant_id, i.source_module, i.source_table, i.source_id,
    i.unit_type, i.section_ref, i.group_key, i.title, i.snippet,
    i.evidence_fields, i.topic_tags, i.expert_relations, i.is_client_pii,
    i.occurred_at, i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_client_index AS i
  WHERE
    i.tenant_id = p_session_tenant
    AND i.client_id = p_client_id
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.occurred_at DESC NULLS LAST,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.yh_search_client_candidates(text, uuid, uuid, float4[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_client_candidates(text, uuid, uuid, float4[], integer)
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- CHECK kalktı:
--   SELECT 1 FROM pg_constraint WHERE conname='yhci_no_pii_chk';           -- 0 satır
--   -- RPC hâlâ INVOKER + service_role-only:
--   SELECT provolatile, prosecdef FROM pg_proc WHERE proname='yh_search_client_candidates'; -- s, f
--   SELECT has_function_privilege('anon',
--     'public.yh_search_client_candidates(text,uuid,uuid,float4[],integer)','EXECUTE'); -- false
--   -- Professional yh_search_candidates / yasam_hafizasi_index DEĞİŞMEDİ.
-- =============================================================================
