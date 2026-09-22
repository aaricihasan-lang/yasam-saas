-- =============================================================================
-- 20270120000000_expert_stats_ui_read_rpcs.sql   [ADDITIVE — READ RPCs]
--
-- UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 2 (yönetici ekranı) salt-okur uçlar.
--
-- AMAÇ: Yönetici ekranının iki ihtiyacını UYGULAMAYA SATIR ÇEKMEDEN, tek DB
--   round-trip'te (N+1 YOK) karşılayan iki salt-okur RPC:
--
--   1) expert_list(...) — sayfalı uzman listesi + TOPLU oturum özeti (last_login/
--      last_seen/session_count user_sessions'tan JOIN ile). Uzman başına AYRI activity
--      çağrısı yapılmaz. Filtre (all/active/passive/archive/pending), arama (ad/e-posta
--      ILIKE), sıralama (last_login|created_at|name, allowlist), demo hariç (opsiyonel),
--      total_count (window). Limit LEAST(...,100) ile sınırlı.
--   2) expert_storage_growth(p_from,p_to) — expert_storage_daily'den SİSTEM geneli
--      gün-bazlı toplam (GROUP BY snapshot_date). Tablo boşsa satır dönmez (sahte geçmiş
--      YOK). partial_count ile kısmi ölçüm günleri belirtilir.
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + yalnız service_role EXECUTE
--   (PUBLIC/anon/authenticated REVOKE). Salt-okur (hiçbir yazma). users + user_sessions
--   service_role-only tablolardır; SECURITY DEFINER owner (postgres) okur.
--
-- KAPSAM: yalnız fonksiyon. Yeni tablo/kolon YOK, veri (DML) YOK. Mevcut FAZ 1'in dört
--   API'si ve beş RPC'si DEĞİŞMEZ (geriye uyumlu ek).
-- ⚠️ Bu migration bu turda HİÇBİR veritabanına UYGULANMAZ (ayrı onay).
-- =============================================================================

BEGIN;

-- 1) SAYFALI UZMAN LİSTESİ + TOPLU OTURUM ÖZETİ ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.expert_list(
  p_search       text    DEFAULT NULL,
  p_status       text    DEFAULT 'all',   -- all|active|passive|archive|pending
  p_sort         text    DEFAULT 'last_login', -- last_login|created_at|name
  p_limit        integer DEFAULT 25,
  p_offset       integer DEFAULT 0,
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE (
  user_id            uuid,
  tenant_id          uuid,
  full_name          text,
  email              text,
  role               text,
  active             boolean,
  approval_status    text,
  is_demo_account    boolean,
  created_at         timestamptz,
  last_login         timestamptz,
  last_seen          timestamptz,
  session_count      bigint,
  module_permissions jsonb,
  total_count        bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  WITH filtered AS (
    SELECT u.*
    FROM public.users u
    WHERE lower(coalesce(u.role,'')) = 'expert'
      AND (p_include_demo OR coalesce(u.is_demo_account,false) = false)
      AND (
        p_status = 'all'
        OR (p_status = 'active'  AND u.active = true)
        OR (p_status = 'passive' AND u.active = false)
        OR (p_status = 'archive' AND u.active = false AND lower(coalesce(u.approval_status,'')) = 'approved')
        OR (p_status = 'pending' AND lower(coalesce(u.approval_status,'')) = 'pending')
      )
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR u.full_name ILIKE '%' || p_search || '%'
        OR u.email     ILIKE '%' || p_search || '%'
      )
  ),
  sess AS (
    SELECT s.user_id,
           max(s.created_at)    AS last_login,
           max(s.last_seen_at)  AS last_seen,
           count(*)::bigint      AS session_count
    FROM public.user_sessions s
    WHERE s.user_id IN (SELECT id FROM filtered)
    GROUP BY s.user_id
  )
  SELECT
    f.id, f.tenant_id, f.full_name, f.email, f.role, f.active, f.approval_status,
    f.is_demo_account, f.created_at,
    se.last_login, se.last_seen, coalesce(se.session_count, 0) AS session_count,
    f.module_permissions,
    count(*) OVER()::bigint AS total_count
  FROM filtered f
  LEFT JOIN sess se ON se.user_id = f.id
  ORDER BY
    CASE WHEN p_sort = 'name'       THEN f.full_name END ASC  NULLS LAST,
    CASE WHEN p_sort = 'created_at' THEN f.created_at END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('name','created_at') THEN se.last_login END DESC NULLS LAST,
    f.created_at DESC
  LIMIT  LEAST(coalesce(p_limit, 25), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.expert_list(text,text,text,integer,integer,boolean) IS
  'FAZ 2 — sayfalı uzman listesi + toplu oturum özeti (N+1 yok). Salt-okur, service_role-only. Demo default hariç.';

-- 2) SİSTEM GENELİ GÜNLÜK DEPOLAMA BÜYÜMESİ ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expert_storage_growth(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  snapshot_date date,
  tenant_count  bigint,
  object_count  bigint,
  total_bytes   bigint,
  partial_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT
    d.snapshot_date,
    count(*)::bigint                                       AS tenant_count,
    coalesce(sum(d.object_count), 0)::bigint               AS object_count,
    coalesce(sum(d.total_bytes), 0)::bigint                AS total_bytes,
    count(*) FILTER (WHERE d.status = 'partial')::bigint    AS partial_count
  FROM public.expert_storage_daily d
  WHERE (p_from IS NULL OR d.snapshot_date >= p_from)
    AND (p_to   IS NULL OR d.snapshot_date <= p_to)
  GROUP BY d.snapshot_date
  ORDER BY d.snapshot_date;
$$;

COMMENT ON FUNCTION public.expert_storage_growth(date,date) IS
  'FAZ 2 — expert_storage_daily''den sistem geneli gün-bazlı depolama toplamı. Salt-okur, service_role-only. Tablo boşsa satır yok (sahte geçmiş üretilmez).';

REVOKE ALL ON FUNCTION public.expert_list(text,text,text,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_list(text,text,text,integer,integer,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.expert_storage_growth(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_storage_growth(date,date) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA:
--   SELECT has_function_privilege('service_role','public.expert_list(text,text,text,integer,integer,boolean)','EXECUTE'); -- t
--   SELECT has_function_privilege('anon','public.expert_storage_growth(date,date)','EXECUTE');                             -- f
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.expert_list(text,text,text,integer,integer,boolean);
--   DROP FUNCTION IF EXISTS public.expert_storage_growth(date,date);
-- =============================================================================
