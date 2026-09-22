-- =============================================================================
-- 20270115000000_expert_stats_read_rpcs.sql   [ADDITIVE — READ RPCs]
--
-- UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 / İP-1 + İP-2 (salt-okur toplulaştırma).
--
-- AMAÇ: Kullanım metriklerini UYGULAMAYA SATIR ÇEKMEDEN, veritabanında (indeksli)
--   toplulaştıran iki salt-okur RPC. Böylece sınırsız oturum/olay satırı app'e çekilmez.
--
--   1) expert_activity_stats(user_id, from, to)  → giriş/oturum/etkinlik (İP-1).
--      * login_count/active_days ARALIĞA göre; session_count/last_login/last_seen GENEL.
--      * login_count = COUNT(user_sessions.created_at ∈ aralık) — her başarılı giriş TEK
--        satır açtığından "başarılı giriş sayısı"dır (heartbeat DEĞİL).
--      * active_days = son-görülme (last_seen_at) günlerinin DISTINCT sayısı; TÜRKİYE
--        saatine (Europe/Istanbul) göre gün sınırı. Heartbeat tabanlı → YAKLAŞIK.
--      * channel_breakdown/platform_breakdown = jsonb sayım haritaları (NULL kanal = "unrecorded").
--   2) expert_usage_summary(tenant_id, from, to) → modül×olay sayımı (İP-2C).
--      * expert_usage_events'ten tenant için module_key bazında event_count + last_occurred.
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + yalnız service_role EXECUTE
--   (PUBLIC/anon/authenticated REVOKE). Salt-okur (hiçbir yazma).
--
-- KAPSAM: yalnız fonksiyon. Yeni tablo/kolon YOK, veri (DML) YOK.
-- ⚠️ Bu migration bu turda HİÇBİR veritabanına UYGULANMAZ (ayrı onay).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.expert_activity_stats(
  p_user_id uuid,
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL
)
RETURNS TABLE (
  login_count        bigint,
  session_count      bigint,
  last_login         timestamptz,
  last_seen          timestamptz,
  active_days        bigint,
  channel_breakdown  jsonb,
  platform_breakdown jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  WITH s AS (
    SELECT created_at, last_seen_at, platform, client_channel
    FROM public.user_sessions
    WHERE user_id = p_user_id
  ),
  in_range AS (
    SELECT * FROM s
    WHERE (p_from IS NULL OR created_at >= p_from)
      AND (p_to   IS NULL OR created_at <  p_to)
  ),
  seen_range AS (
    SELECT * FROM s
    WHERE (p_from IS NULL OR last_seen_at >= p_from)
      AND (p_to   IS NULL OR last_seen_at <  p_to)
  )
  SELECT
    (SELECT count(*) FROM in_range)::bigint                                    AS login_count,
    (SELECT count(*) FROM s)::bigint                                           AS session_count,
    (SELECT max(created_at)   FROM s)                                          AS last_login,
    (SELECT max(last_seen_at) FROM s)                                          AS last_seen,
    (SELECT count(DISTINCT (last_seen_at AT TIME ZONE 'Europe/Istanbul')::date)
       FROM seen_range)::bigint                                                AS active_days,
    (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(client_channel, 'unrecorded') AS k, count(*) AS c
        FROM in_range GROUP BY 1
     ) q)                                                                      AS channel_breakdown,
    (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(platform, 'unknown') AS k, count(*) AS c
        FROM in_range GROUP BY 1
     ) q)                                                                      AS platform_breakdown;
$$;

COMMENT ON FUNCTION public.expert_activity_stats(uuid, timestamptz, timestamptz) IS
  'FAZ 1 İP-1 — user_sessions''tan kullanıcı giriş/oturum/etkinlik toplulaştırması. Salt-okur, service_role-only.';

CREATE OR REPLACE FUNCTION public.expert_usage_summary(
  p_tenant_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL
)
RETURNS TABLE (
  module_key    text,
  event_count   bigint,
  last_occurred timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT module_key, count(*)::bigint AS event_count, max(occurred_at) AS last_occurred
  FROM public.expert_usage_events
  WHERE tenant_id = p_tenant_id
    AND (p_from IS NULL OR occurred_at >= p_from)
    AND (p_to   IS NULL OR occurred_at <  p_to)
  GROUP BY module_key;
$$;

COMMENT ON FUNCTION public.expert_usage_summary(uuid, timestamptz, timestamptz) IS
  'FAZ 1 İP-2C — expert_usage_events''ten tenant modül×olay sayımı. Salt-okur, service_role-only.';

-- İP-E/10: "son N günde GERÇEKTEN kullanım sinyali olan" DISTINCT expert sayısı.
-- "aktif hesap" (users.active) ile AYRI bir metrik: son_seen tabanlı gerçek aktiflik.
CREATE OR REPLACE FUNCTION public.expert_active_used_count(p_since timestamptz)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT count(DISTINCT s.user_id)::bigint
  FROM public.user_sessions s
  JOIN public.users u ON u.id = s.user_id
  WHERE lower(coalesce(u.role,'')) = 'expert'
    AND coalesce(u.is_demo_account, false) = false
    AND s.last_seen_at >= p_since;
$$;

COMMENT ON FUNCTION public.expert_active_used_count(timestamptz) IS
  'FAZ 1 İP-E — son p_since''ten beri last_seen sinyali olan DISTINCT (demo hariç) expert sayısı. Salt-okur, service_role-only.';

REVOKE ALL ON FUNCTION public.expert_activity_stats(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_activity_stats(uuid, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.expert_usage_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_usage_summary(uuid, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.expert_active_used_count(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_active_used_count(timestamptz) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA:
--   SELECT has_function_privilege('service_role','public.expert_activity_stats(uuid,timestamptz,timestamptz)','EXECUTE'); -- t
--   SELECT has_function_privilege('anon','public.expert_usage_summary(uuid,timestamptz,timestamptz)','EXECUTE');          -- f
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.expert_activity_stats(uuid, timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.expert_usage_summary(uuid, timestamptz, timestamptz);
-- =============================================================================
