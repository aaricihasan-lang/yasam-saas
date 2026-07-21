-- =============================================================================
-- 20260724000000_yh_search_candidates_rpc.sql
--
-- YAŞAM HAFIZASI™ — Sprint 2 / S2.19A: RETRIEVAL ts_rank RPC
--
-- KAPSAM (yalnız Hızlı Tarama aday getirme fonksiyonu):
--   public.yh_search_candidates(...) → ağırlıklı ts_rank ile sıralı aday satırları.
--   S2.18 RetrievalQueryDescriptor'ın DB karşılığı; Candidate[] kaynağı (S2.20 Kanıt
--   Kapısı bunu tüketir). Kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md §3 + §9.
--
-- KİLİTLİ KARARLAR (S2.19A):
--   - Görünürlük (tenant/shared + is_client_pii=false + demo hariç + stone exclusion)
--     ORDER BY / LIMIT'ten ÖNCE uygulanır (görünmez kayıt top-N slotunu kaplayamaz).
--   - Weighted ts_rank DB tarafında; ağırlıklar RPC parametresi (TS config tek kaynak;
--     SQL'de ikinci ağırlık sabiti YOK → K5 drift yok).
--   - SECURITY INVOKER: service_role zaten RLS bypass (FORCE RLS yok) → DEFINER gereksiz
--     ve ayrıcalık-yükseltme riski taşır. INVOKER + REVOKE/GRANT + pinned search_path.
--   - p_weights FAIL-LOUD: descriptor S2.18 üretir → geçersiz weights sözleşme hatasıdır,
--     sessizce varsayılana DÖNÜLMEZ; RAISE EXCEPTION (adapter fail-closed'a çevirir).
--   - p_limit DoS güvenlik korkuluğu: [1..500] aralığına clamp (iş limiti 150 descriptor'dan).
--   - Dynamic SQL YOK · string interpolation YOK · yalnız parametreli/tipli sorgu.
--
-- ⚠️ PostgreSQL ts_rank AĞIRLIK SIRASI:
--   ts_rank(weights, ...) diziyi {D, C, B, A} sırasında bekler (PostgreSQL sözleşmesi).
--   Descriptor/adapter doğal [A, B, C, D] gönderir (YH_TSV_WEIGHTS ile simetrik). Bu
--   PG-özel ters çevirme YALNIZ burada yapılır: ARRAY[A,B,C,D] → ARRAY[D,C,B,A].
--
-- GÜVENLİK:
--   - Fonksiyon service_role dışına KAPALI (REVOKE PUBLIC/anon/authenticated + GRANT
--     service_role) → PostgREST RPC yüzeyi anon/authenticated'a açılmaz.
--   - Tüm tablo/fonksiyon adları şema-nitelikli; search_path sabit → arama yolu ele
--     geçirme engellenir.
--   - Görünürlük WHERE'i tek tenant sınırıdır (service_role RLS bypass eder); uygulama
--     katmanı ayrıca evaluateVisibility (S2.13) post-fetch savunması uygular.
--
-- BAĞIMLILIK:
--   - public.yasam_hafizasi_index (20260710…) + search_tsv trigger/GIN (20260712…).
--   - public.stone_exclusions (20260622…): (tenant_id text, stone_id uuid, PK).
--
-- UYGULAMA: Supabase Dashboard SQL Editor (DATABASE_URL=localhost çalışmaz) — S2.19B.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + REVOKE/GRANT (tekrar no-op).
-- =============================================================================

BEGIN;

-- ─── Retrieval aday getirme fonksiyonu ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.yh_search_candidates(
  p_tsquery        text,
  p_session_tenant uuid,
  p_allow_shared   boolean,
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
  source_updated_at timestamptz,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
-- Ambiguïte durumunda bareword → kolon (OUT parametre adları sorguyu gölgeleyemez).
#variable_conflict use_column
DECLARE
  -- Demo tenant (mevcut modül RLS deseniyle aynı sabit; config.YH_DEMO_TENANT_ID).
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  -- Doğal taş kaynağı (stone_exclusions yalnız bu modül için sorgulanır; §9).
  c_stone_module constant text    := 'dogaltas';
  -- Aday tavanı mutlak DoS güvenlik korkuluğu (iş limiti 150 descriptor'dan gelir).
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
BEGIN
  -- 1) Fail-closed sınır guard'ları (beklenen geçersiz girdi → 0 satır; throw YOK).
  --    (Boş/geçersiz tsquery zaten S2.18'de kind='noop' → RPC çağrılmaz; bu savunma.)
  IF p_session_tenant IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;

  -- 2) p_weights FAIL-LOUD doğrulaması (sessiz varsayılan YOK — sözleşme hatası).
  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_candidates: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_candidates: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL
       OR w < 0::float4
       OR w = 'NaN'::float4
       OR w = 'Infinity'::float4
       OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_candidates: p_weights gecersiz eleman (null/negatif/sonsuz/NaN)';
  END IF;

  -- 3) p_limit güvenli clamp (DoS korkuluğu; geçersiz/NULL → 150 varsayılan, üst sınır c_limit_cap).
  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);

  -- 4) tsquery (S2.17 zaten güvenli/lexeme-allowlist üretir; config 'simple' ile simetrik).
  --    Bozuk girdi throw ederse yüzeye çıkar (programlama hatası yutulmaz; adapter fail-closed).
  v_tsq := to_tsquery('simple', p_tsquery);

  -- 5) ts_rank ağırlık sırası dönüşümü: [A,B,C,D] → PostgreSQL beklediği {D,C,B,A}.
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  -- 6) Görünürlük + eşleşme + weighted ranking + tavan.
  --    Görünürlük filtreleri (tenant/shared/PII/demo/stone) ORDER BY / LIMIT'ten ÖNCE.
  RETURN QUERY
  SELECT
    i.id,
    i.tenant_id,
    i.source_module,
    i.source_table,
    i.source_id,
    i.unit_type,
    i.section_ref,
    i.group_key,
    i.title,
    i.snippet,
    i.evidence_fields,
    i.topic_tags,
    i.expert_relations,
    i.is_client_pii,
    i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_index AS i
  WHERE
    -- tenant / shared görünürlüğü (§9)
    ( i.tenant_id = p_session_tenant
      OR (i.tenant_id IS NULL AND p_allow_shared IS TRUE) )
    -- PII kapısı (ana indekste CHECK ile zaten false; savunma derinliği)
    AND i.is_client_pii = false
    -- demo tenant hariç (NULL shared demo değildir → IS DISTINCT FROM ile korunur)
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    -- doğal taş exclusion (yalnız dogaltas; source_id = stone_exclusions.stone_id)
    AND NOT (
      i.source_module = c_stone_module
      AND EXISTS (
        SELECT 1
        FROM public.stone_exclusions AS se
        WHERE se.tenant_id = p_session_tenant::text
          AND se.stone_id = i.source_id
      )
    )
    -- lexical eşleşme
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;

-- ─── EXECUTE kilidi (least privilege): service_role dışına kapat ──────────────
REVOKE ALL ON FUNCTION public.yh_search_candidates(text, uuid, boolean, float4[], integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.yh_search_candidates(text, uuid, boolean, float4[], integer)
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, beklenen — S2.19B, salt-okunur):
--   -- 1) Fonksiyon var + STABLE + INVOKER (prosecdef=false):
--   SELECT provolatile, prosecdef FROM pg_proc WHERE proname = 'yh_search_candidates';   -- s, f
--   -- 2) EXECUTE yalnız service_role:
--   SELECT has_function_privilege('anon',
--     'public.yh_search_candidates(text,uuid,boolean,float4[],integer)', 'EXECUTE');       -- false
--   SELECT has_function_privilege('authenticated',
--     'public.yh_search_candidates(text,uuid,boolean,float4[],integer)', 'EXECUTE');       -- false
--   SELECT has_function_privilege('service_role',
--     'public.yh_search_candidates(text,uuid,boolean,float4[],integer)', 'EXECUTE');       -- true
--   -- 3) Davranış (service_role bağlamında; örnek):
--   SELECT id, source_module, rank
--     FROM public.yh_search_candidates('cakra:*', '<tenant-uuid>'::uuid, true,
--       '{1.0,0.6,0.35,0.15}'::float4[], 150);
--   -- 4) p_weights fail-loud (RAISE EXCEPTION beklenir):
--   SELECT * FROM public.yh_search_candidates('cakra:*', '<tenant>'::uuid, true,
--       '{1.0,0.6}'::float4[], 150);                                                       -- ERROR
-- =============================================================================
