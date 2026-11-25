-- =============================================================================
-- ÜYE PASİFLEŞTİRME · F4-R1 — KULLANIM TAKİBİ uzman listesi durum süzgeci yeni üyelik durumlarıyla
-- =============================================================================
-- SORUN: usage360_expert_list süzgeci users.active tabanlı → "Pasif" (giriş açık + modüller kilitli, active=true +
--   access_restricted_at) uzman 'active' süzgecinde çıkar; 'archive' Aşama 1 tanımı (approved + active=false).
-- ÇÖZÜM: usage360_expert_list (REPLACE) — 20270206000000 §2 gövdesi AYNEN; fark YALNIZ p_status süzgeci:
--   active       = active AND kısıt yok
--   passive      = active AND kısıtlı ("Pasif · modüller kilitli"; Owner 24.11 tanımı)
--   login_closed = active değil AND arşivde değil (eski "giriş kapalı" hesaplar)   ← YENİ değer
--   archive      = archived_at dolu (4a arşivi)
--   pending / all AYNEN. Dört durum ayrık; 'all' toplamı değişmez.
-- DOKUNULMAYAN: imza, yetkiler (REVOKE/GRANT aynen geçerli; CREATE OR REPLACE korur), satır çıktısı, telemetri
--   hesapları, ticari sayaçlar (usage360 ticari sayaç üretmez). MEVCUT SATIRLARA / KULLANIM KAYITLARINA DML YOK.
-- ÖN KOŞUL: 20280126000000 (users.access_restricted_at) + 4a (archived_at).
-- DEPLOY SIRASI: 20280126000000 → 20280126000100 → bu migration → kod. Eski kod 'login_closed' göndermez (zararsız).
-- UYGULAMA: AYRI OWNER ONAYI. Bu aşamada production'a UYGULANMAZ.
-- GERİ ALMA: 20270206000000 §2 gövdesi yeniden uygulanır.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'access_restricted_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'archived_at') THEN
    RAISE EXCEPTION 'uye-pasif usage360 on kosul: access_restricted_at / archived_at yok; uygulanmadi';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.usage360_expert_list(
  p_search       text    DEFAULT NULL,
  p_status       text    DEFAULT 'all',
  p_sort         text    DEFAULT 'last_activity',
  p_limit        integer DEFAULT 25,
  p_offset       integer DEFAULT 0,
  p_include_demo boolean DEFAULT false,
  p_today        date    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH params AS (
    SELECT coalesce(p_today, public.usage360_day_tr(now())) AS today,
           nullif(btrim(coalesce(p_search, '')), '') AS q
  ),
  filtered AS (
    SELECT u.id, u.tenant_id, u.full_name, u.email, u.active, u.approval_status, u.is_demo_account,
           u.created_at, u.module_permissions
      FROM public.users u, params p
     WHERE lower(coalesce(u.role, '')) = 'expert'
       AND (p_include_demo OR coalesce(u.is_demo_account, false) = false)
       AND (
             coalesce(p_status, 'all') = 'all'
          OR (p_status = 'active'       AND u.active IS TRUE  AND u.access_restricted_at IS NULL)
          OR (p_status = 'passive'      AND u.active IS TRUE  AND u.access_restricted_at IS NOT NULL)
          OR (p_status = 'login_closed' AND u.active IS NOT TRUE AND u.archived_at IS NULL)
          OR (p_status = 'archive'      AND u.archived_at IS NOT NULL)
          OR (p_status = 'pending' AND lower(coalesce(u.approval_status, '')) = 'pending'))
       AND (p.q IS NULL
            OR u.full_name ILIKE '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
            OR u.email     ILIKE '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  sess AS (
    SELECT s.user_id, max(s.created_at) AS last_login, max(s.last_seen_at) AS last_seen
      FROM public.user_sessions s
     WHERE s.user_id IN (SELECT id FROM filtered)
     GROUP BY s.user_id
  ),
  daily30 AS (
    SELECT d.user_id, d.day_tr, d.channel, d.visits, d.active_seconds, d.last_at,
           (d.creates + d.updates + d.deletes + d.analyses + d.reports_generated + d.reports_exported
            + d.uploads + d.ai_tasks) AS actions
      FROM public.usage_daily d, params p
     WHERE d.user_id IN (SELECT id FROM filtered)
       AND d.day_tr BETWEEN p.today - 29 AND p.today
  ),
  agg AS (
    SELECT x.user_id,
           sum(x.visits)         FILTER (WHERE x.day_tr = p.today) AS today_visits,
           sum(x.active_seconds) FILTER (WHERE x.day_tr = p.today) AS today_active_seconds,
           sum(x.actions)        FILTER (WHERE x.day_tr = p.today) AS today_actions,
           count(DISTINCT x.day_tr) FILTER (WHERE x.day_tr > p.today - 7) AS d7_active_days,
           count(DISTINCT x.day_tr) AS d30_active_days,
           jsonb_object_agg(x.channel, x.ch_visits) FILTER (WHERE x.ch_rn = 1) AS channel_visits_30d
      FROM (
        SELECT dd.*,
               sum(dd.visits) OVER (PARTITION BY dd.user_id, dd.channel) AS ch_visits,
               row_number()   OVER (PARTITION BY dd.user_id, dd.channel ORDER BY dd.day_tr) AS ch_rn
          FROM daily30 dd
      ) x, params p
     GROUP BY x.user_id
  ),
  mods_today AS (
    SELECT m.user_id, count(DISTINCT m.module_key) AS today_modules
      FROM public.usage_daily_modules m, params p
     WHERE m.user_id IN (SELECT id FROM filtered) AND m.day_tr = p.today
     GROUP BY m.user_id
  ),
  last_act AS (
    SELECT d.user_id, max(d.last_at) AS last_activity
      FROM public.usage_daily d
     WHERE d.user_id IN (SELECT id FROM filtered)
     GROUP BY d.user_id
  ),
  joined AS (
    SELECT f.id AS user_id, f.tenant_id, f.full_name, f.email, f.active, f.approval_status,
           f.is_demo_account, f.created_at, f.module_permissions,
           se.last_login, se.last_seen, la.last_activity,
           coalesce(a.today_visits, 0)         AS today_visits,
           coalesce(a.today_active_seconds, 0) AS today_active_seconds,
           coalesce(a.today_actions, 0)        AS today_actions,
           coalesce(mt.today_modules, 0)       AS today_modules,
           coalesce(a.d7_active_days, 0)       AS d7_active_days,
           coalesce(a.d30_active_days, 0)      AS d30_active_days,
           coalesce(a.channel_visits_30d, '{}'::jsonb) AS channel_visits_30d
      FROM filtered f
      LEFT JOIN sess se      ON se.user_id = f.id
      LEFT JOIN last_act la  ON la.user_id = f.id
      LEFT JOIN agg a        ON a.user_id  = f.id
      LEFT JOIN mods_today mt ON mt.user_id = f.id
  ),
  page AS (
    SELECT j.*, row_number() OVER (
      ORDER BY
        CASE WHEN p_sort = 'name'         THEN j.full_name END ASC NULLS LAST,
        CASE WHEN p_sort = 'last_login'   THEN j.last_login END DESC NULLS LAST,
        CASE WHEN p_sort = 'created_at'   THEN j.created_at END DESC NULLS LAST,
        CASE WHEN p_sort = 'today_actions' THEN j.today_actions END DESC NULLS LAST,
        CASE WHEN p_sort = 'd7'           THEN j.d7_active_days END DESC NULLS LAST,
        CASE WHEN p_sort = 'd30'          THEN j.d30_active_days END DESC NULLS LAST,
        CASE WHEN p_sort NOT IN ('name','last_login','created_at','today_actions','d7','d30')
             THEN j.last_activity END DESC NULLS LAST,
        j.last_activity DESC NULLS LAST,
        j.created_at DESC,
        j.user_id
    ) AS rn
      FROM joined j
     ORDER BY rn
     LIMIT  least(greatest(coalesce(p_limit, 25), 1), 100)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'today', (SELECT today FROM params),
    'measurementStart', public.usage360_measurement_start(),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(pg) - 'rn' ORDER BY pg.rn) FROM page pg), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.usage360_expert_list(text,text,text,integer,integer,boolean,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage360_expert_list(text,text,text,integer,integer,boolean,date) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
