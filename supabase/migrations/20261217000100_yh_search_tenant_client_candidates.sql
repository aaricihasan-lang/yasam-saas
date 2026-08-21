-- =============================================================================
-- 20261217000100_yh_search_tenant_client_candidates.sql
--
-- YAŞAM HAFIZASI™ — PRIVATE MEMORY: TENANT-WIDE PRIVATE CLIENT SEARCH RPC
--
-- POLİTİKA KİLİDİ (kullanıcı, TUR 2):
--   md.5  Uzman YALNIZ kendi tenant'ındaki danışan geçmişinde arama yapar.
--   md.6  Bunun adı GLOBAL SEARCH değil: TENANT-WIDE PRIVATE CLIENT SEARCH.
--   md.7  Danışan adı index'e KOPYALANMAZ; client_id döner → server-side resolve edilir.
--
-- KAPSAM (yalnız yeni fonksiyon; DATA MUTASYONU / TRIGGER / TABLO YOK):
--   public.yh_search_tenant_client_candidates(p_tsquery, p_session_tenant, p_weights, p_limit)
--   → public.yasam_hafizasi_client_index üzerinde TENANT-scoped arama (client_id filtresi
--     YOK). Sonuç satırları client_id TAŞIR (endpoint ad'ı query-time resolve eder).
--
-- GÜVENLİK:
--   - Per-client RPC (yh_search_client_candidates) ile aynı sözleşme; tek fark client_id
--     filtresi olmaması. tenant ZORUNLU + demo tenant HARİÇ; shared/NULL YOK.
--   - is_client_pii görünürlük filtresi YOK (index PRIVATE/SENSITIVE; owner tenant görür).
--   - SECURITY INVOKER + STABLE + sabit search_path; PUBLIC/anon/authenticated EXECUTE
--     KAPALI; yalnız service_role (server route session'dan tenant'ı zorlar).
--   - Professional index/RPC (yasam_hafizasi_index / yh_search_candidates) DOKUNULMAZ (md.14).
--
-- DORMANT: mevcut client index BOŞ (CDC trigger + aktivasyon ayrı kapı) → fonksiyon
--   uygulansa bile veri gelene kadar 0 satır döner.
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY (bu turda UYGULANMAZ).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + REVOKE/GRANT.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.yh_search_tenant_client_candidates(
  p_tsquery        text,
  p_session_tenant uuid,
  p_weights        float4[],
  p_limit          integer
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  client_id         uuid,
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
  -- Fail-closed sınır guard'ları (tenant-wide: tenant ZORUNLU; client_id YOK).
  IF p_session_tenant IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;

  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_tenant_client_candidates: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_tenant_client_candidates: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_tenant_client_candidates: p_weights gecersiz eleman';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  -- Görünürlük (tenant + demo) ORDER BY / LIMIT'ten ÖNCE. Shared YOK; client_id filtresi YOK.
  RETURN QUERY
  SELECT
    i.id, i.tenant_id, i.client_id, i.source_module, i.source_table, i.source_id,
    i.unit_type, i.section_ref, i.group_key, i.title, i.snippet,
    i.evidence_fields, i.topic_tags, i.expert_relations, i.is_client_pii,
    i.occurred_at, i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_client_index AS i
  WHERE
    i.tenant_id = p_session_tenant
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

REVOKE ALL ON FUNCTION public.yh_search_tenant_client_candidates(text, uuid, float4[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_tenant_client_candidates(text, uuid, float4[], integer)
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT provolatile, prosecdef FROM pg_proc WHERE proname='yh_search_tenant_client_candidates'; -- s, f
--   SELECT has_function_privilege('anon',
--     'public.yh_search_tenant_client_candidates(text,uuid,float4[],integer)','EXECUTE'); -- false
--   SELECT has_function_privilege('service_role',
--     'public.yh_search_tenant_client_candidates(text,uuid,float4[],integer)','EXECUTE'); -- true
--   -- client_id kolonu RETURNS TABLE'da mevcut (query-time ad resolve için).
-- =============================================================================
