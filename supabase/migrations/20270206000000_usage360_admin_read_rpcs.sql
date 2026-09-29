-- =============================================================================
-- 20270206000000_usage360_admin_read_rpcs.sql
--
-- USAGE360 AŞAMA 2C — ADMIN 360 OKUMA KATMANI (salt-okur RPC'ler; additive).
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Önkoşul: 20270205000000_usage360_telemetry_core.sql.
--
-- Akış: Admin UI → /api/admin/expert-stats/usage360/* → verifyAdminRequest → service_role →
--       BU RPC'ler. Tarayıcı telemetri tablolarını ASLA doğrudan okumaz.
--
-- MAHREMİYET: RPC'ler yalnız telemetri tablolarını (usage_daily, usage_daily_modules,
--   usage_visits, expert_usage_events) + hesap meta verisini (users, user_sessions) okur.
--   Hiçbir iş/danışan tablosuna dokunmaz; dönen alanlar yalnız sayılar, zamanlar ve enum'lardır.
--
-- PERFORMANS: özetler rollup'lardan (PK: user_id, day_tr, …); ham olay tablosu yalnız zaman
--   çizelgesi (keyset, (user_id, occurred_at DESC, id DESC) index) ve son işlem/hata özetinde,
--   kullanıcı + zaman aralığıyla sınırlı okunur. Aralıklar RPC içinde de sınırlanır
--   (detay ≤ 366 gün, zaman çizelgesi ≤ 90 gün, sayfa ≤ 100).
--
-- ROLLBACK:
--   DROP FUNCTION public.usage360_measurement_start();
--   DROP FUNCTION public.usage360_expert_list(text,text,text,integer,integer,boolean,date);
--   DROP FUNCTION public.usage360_expert_detail(uuid,date,date);
--   DROP FUNCTION public.usage360_expert_timeline(uuid,date,date,timestamptz,uuid,integer);
--   DROP INDEX public.idx_expert_usage_user_occurred_id;
-- =============================================================================

BEGIN;

-- Zaman çizelgesi keyset'i için kararlı sıra (occurred_at eşitliğinde id).
CREATE INDEX IF NOT EXISTS idx_expert_usage_user_occurred_id
  ON public.expert_usage_events (user_id, occurred_at DESC, id DESC);

-- ─── (1) Ölçüm başlangıcı ────────────────────────────────────────────────────
-- Usage360 rollup'ına yazılmış ilk TR günü (ping veya olay). NULL = ölçüm hiç başlamadı
-- (ör. USAGE360_ENABLED kapalı). Keyfi sabit tarih KULLANILMAZ.
CREATE OR REPLACE FUNCTION public.usage360_measurement_start()
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT min(d.day_tr) FROM public.usage_daily d; $$;

-- Toplam anlamlı işlem (modül açılışı ve hata HARİÇ) — tek tanım.
-- (İç yardımcı değil; ifade her sorguda açıkça yazılır: creates+updates+deletes+analyses+
--  reports_generated+reports_exported+uploads+ai_tasks.)

-- ─── (2) Uzman listesi (sayfalı; N+1 yok) ───────────────────────────────────
-- p_today: TR takvim günü (sunucu hesaplar). Sıralama allowlist'li; bilinmeyen → son aktivite.
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
          OR (p_status = 'active'  AND u.active IS TRUE)
          OR (p_status = 'passive' AND u.active IS FALSE)
          OR (p_status = 'archive' AND u.active IS FALSE AND lower(coalesce(u.approval_status, '')) = 'approved')
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

-- ─── (3) Uzman dönem detayı (tek çağrı, bölüm bölüm jsonb) ────────────────────
CREATE OR REPLACE FUNCTION public.usage360_expert_detail(
  p_user_id uuid,
  p_from    date,
  p_to      date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_from date := p_from;
  v_to   date := p_to;
  v_from_ts timestamptz;
  v_to_ts   timestamptz;
  v_out jsonb;
BEGIN
  IF p_user_id IS NULL OR v_from IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RETURN NULL;
  END IF;
  IF v_to - v_from > 365 THEN
    v_from := v_to - 365; -- en fazla 366 gün
  END IF;
  -- TR takvim günü sınırlarının UTC karşılığı (IANA; sabit +03 YOK).
  v_from_ts := (v_from::timestamp AT TIME ZONE 'Europe/Istanbul');
  v_to_ts   := ((v_to + 1)::timestamp AT TIME ZONE 'Europe/Istanbul');

  WITH d AS (
    SELECT * FROM public.usage_daily
     WHERE user_id = p_user_id AND day_tr BETWEEN v_from AND v_to
  ),
  m AS (
    SELECT * FROM public.usage_daily_modules
     WHERE user_id = p_user_id AND day_tr BETWEEN v_from AND v_to
  ),
  v AS (
    SELECT * FROM public.usage_visits
     WHERE user_id = p_user_id AND started_at >= v_from_ts AND started_at < v_to_ts
  ),
  ev AS (
    SELECT module_key, action, error_class, occurred_at
      FROM public.expert_usage_events
     WHERE user_id = p_user_id AND occurred_at >= v_from_ts AND occurred_at < v_to_ts
  ),
  day_totals AS (
    SELECT day_tr,
           sum(visits) AS visits, sum(active_seconds) AS active_seconds, sum(module_opens) AS module_opens,
           sum(creates) AS creates, sum(updates) AS updates, sum(deletes) AS deletes, sum(analyses) AS analyses,
           sum(reports_generated) AS reports_generated, sum(reports_exported) AS reports_exported,
           sum(uploads) AS uploads, sum(ai_tasks) AS ai_tasks, sum(failures) AS failures,
           sum(creates + updates + deletes + analyses + reports_generated + reports_exported + uploads + ai_tasks) AS actions,
           min(first_at) AS first_at, max(last_at) AS last_at,
           bit_or(hour_mask) AS hour_mask
      FROM d GROUP BY day_tr
  ),
  day_modules AS (
    SELECT day_tr, count(DISTINCT module_key) AS modules_used
      FROM m GROUP BY day_tr
  ),
  mod_totals AS (
    SELECT module_key,
           min(first_at) AS first_at, max(last_at) AS last_at, count(DISTINCT day_tr) AS active_days,
           sum(active_seconds) AS active_seconds, sum(module_opens) AS module_opens,
           sum(creates) AS creates, sum(updates) AS updates, sum(deletes) AS deletes, sum(analyses) AS analyses,
           sum(reports_generated) AS reports_generated, sum(reports_exported) AS reports_exported,
           sum(uploads) AS uploads, sum(ai_tasks) AS ai_tasks, sum(failures) AS failures,
           sum(creates + updates + deletes + analyses + reports_generated + reports_exported + uploads + ai_tasks) AS actions
      FROM m GROUP BY module_key
  ),
  mod_last_action AS (
    SELECT module_key, max(occurred_at) AS last_action_at
      FROM ev
     WHERE action IS NOT NULL AND action NOT IN ('module_opened', 'action_failed')
     GROUP BY module_key
  ),
  mod_all_time AS (
    SELECT module_key, min(first_at) AS first_ever_at, max(last_at) AS last_ever_at
      FROM public.usage_daily_modules
     WHERE user_id = p_user_id
     GROUP BY module_key
  ),
  channels AS (
    SELECT channel,
           sum(visits) AS visits, sum(active_seconds) AS active_seconds, sum(module_opens) AS module_opens,
           sum(creates + updates + deletes + analyses + reports_generated + reports_exported + uploads + ai_tasks) AS actions,
           max(last_at) AS last_at
      FROM d GROUP BY channel
  ),
  devices AS (
    SELECT channel, os_family, browser_family, app_version, count(*) AS visits, max(last_active_at) AS last_at
      FROM v GROUP BY channel, os_family, browser_family, app_version
  ),
  places AS (
    SELECT country, city, count(*) AS visits, max(last_active_at) AS last_at
      FROM v GROUP BY country, city
  ),
  heat AS (
    SELECT extract(isodow FROM dt.day_tr)::int AS dow, h AS hour, count(*) AS days
      FROM day_totals dt, generate_series(0, 23) h
     WHERE (dt.hour_mask & (1 << h)) <> 0
     GROUP BY 1, 2
  ),
  fails AS (
    SELECT module_key, error_class, count(*) AS n, max(occurred_at) AS last_at
      FROM ev WHERE action = 'action_failed'
     GROUP BY module_key, error_class
  )
  SELECT jsonb_build_object(
    'from', v_from, 'to', v_to,
    'measurementStart', public.usage360_measurement_start(),
    'lastActivityEver', (SELECT max(ud.last_at) FROM public.usage_daily ud WHERE ud.user_id = p_user_id),
    'totals', (
      SELECT jsonb_build_object(
        'visits', coalesce(sum(visits), 0), 'activeSeconds', coalesce(sum(active_seconds), 0),
        'moduleOpens', coalesce(sum(module_opens), 0), 'actions', coalesce(sum(actions), 0),
        'creates', coalesce(sum(creates), 0), 'updates', coalesce(sum(updates), 0),
        'deletes', coalesce(sum(deletes), 0), 'analyses', coalesce(sum(analyses), 0),
        'reportsGenerated', coalesce(sum(reports_generated), 0), 'reportsExported', coalesce(sum(reports_exported), 0),
        'uploads', coalesce(sum(uploads), 0), 'aiTasks', coalesce(sum(ai_tasks), 0), 'failures', coalesce(sum(failures), 0),
        'firstAt', min(first_at), 'lastAt', max(last_at),
        'activeUsageDays', count(*),
        'actionDays', count(*) FILTER (WHERE actions > 0))
      FROM day_totals),
    'modulesUsed', (SELECT count(*) FROM mod_totals),
    'modulesWithActions', (SELECT count(*) FROM mod_totals WHERE actions > 0),
    'daily', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', dt.day_tr, 'visits', dt.visits, 'activeSeconds', dt.active_seconds,
        'modulesUsed', coalesce(dm.modules_used, 0), 'moduleOpens', dt.module_opens, 'actions', dt.actions,
        'creates', dt.creates, 'updates', dt.updates, 'deletes', dt.deletes, 'analyses', dt.analyses,
        'reportsGenerated', dt.reports_generated, 'reportsExported', dt.reports_exported,
        'uploads', dt.uploads, 'failures', dt.failures, 'firstAt', dt.first_at, 'lastAt', dt.last_at)
        ORDER BY dt.day_tr DESC)
      FROM day_totals dt LEFT JOIN day_modules dm ON dm.day_tr = dt.day_tr), '[]'::jsonb),
    'modules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'module', mt.module_key, 'firstAt', mt.first_at, 'lastAt', mt.last_at,
        'firstEverAt', ma.first_ever_at, 'lastEverAt', ma.last_ever_at,
        'activeDays', mt.active_days, 'activeSeconds', mt.active_seconds, 'moduleOpens', mt.module_opens,
        'actions', mt.actions, 'creates', mt.creates, 'updates', mt.updates, 'deletes', mt.deletes,
        'analyses', mt.analyses, 'reportsGenerated', mt.reports_generated, 'reportsExported', mt.reports_exported,
        'uploads', mt.uploads, 'aiTasks', mt.ai_tasks, 'failures', mt.failures, 'lastActionAt', la.last_action_at)
        ORDER BY mt.actions DESC, mt.active_seconds DESC, mt.module_key)
      FROM mod_totals mt
      LEFT JOIN mod_last_action la ON la.module_key = mt.module_key
      LEFT JOIN mod_all_time ma    ON ma.module_key = mt.module_key), '[]'::jsonb),
    'modulesEverOpened', coalesce((SELECT jsonb_agg(module_key ORDER BY module_key) FROM mod_all_time), '[]'::jsonb),
    'channels', coalesce((
      SELECT jsonb_agg(jsonb_build_object('channel', c.channel, 'visits', c.visits, 'activeSeconds', c.active_seconds,
        'moduleOpens', c.module_opens, 'actions', c.actions, 'lastAt', c.last_at) ORDER BY c.visits DESC, c.channel)
      FROM channels c), '[]'::jsonb),
    'devices', coalesce((
      SELECT jsonb_agg(jsonb_build_object('channel', x.channel, 'osFamily', x.os_family, 'browserFamily', x.browser_family,
        'appVersion', x.app_version, 'visits', x.visits, 'lastAt', x.last_at) ORDER BY x.visits DESC)
      FROM devices x), '[]'::jsonb),
    'locations', coalesce((
      SELECT jsonb_agg(jsonb_build_object('country', pl.country, 'city', pl.city, 'visits', pl.visits, 'lastAt', pl.last_at)
        ORDER BY pl.visits DESC, pl.country NULLS LAST, pl.city NULLS LAST)
      FROM places pl), '[]'::jsonb),
    'heatmap', coalesce((
      SELECT jsonb_agg(jsonb_build_object('dow', hm.dow, 'hour', hm.hour, 'days', hm.days) ORDER BY hm.dow, hm.hour)
      FROM heat hm), '[]'::jsonb),
    'failures', coalesce((
      SELECT jsonb_agg(jsonb_build_object('module', f.module_key, 'errorClass', f.error_class, 'count', f.n, 'lastAt', f.last_at)
        ORDER BY f.n DESC, f.module_key)
      FROM fails f), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- ─── (4) Zaman çizelgesi (keyset sayfalama) ───────────────────────────────────
-- Yalnız telemetri satırının kendi id'si (opak imleç) döner; iş kaydı kimliği YOKTUR.
CREATE OR REPLACE FUNCTION public.usage360_expert_timeline(
  p_user_id   uuid,
  p_from      date,
  p_to        date,
  p_before_at timestamptz DEFAULT NULL,
  p_before_id uuid        DEFAULT NULL,
  p_limit     integer     DEFAULT 50
)
RETURNS TABLE (
  id uuid, occurred_at timestamptz, module_key text, action text, event_type text,
  sub_entity text, failed_action text, error_class text, item_count_bucket text,
  channel text, source text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_from date := p_from;
  v_to   date := p_to;
BEGIN
  IF p_user_id IS NULL OR v_from IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RETURN;
  END IF;
  IF v_to - v_from > 89 THEN
    v_from := v_to - 89; -- ham olay sorgusu en fazla 90 gün
  END IF;
  RETURN QUERY
    SELECT e.id, e.occurred_at, e.module_key, e.action, e.event_type,
           e.sub_entity, e.failed_action, e.error_class, e.item_count_bucket,
           e.channel, e.source
      FROM public.expert_usage_events e
     WHERE e.user_id = p_user_id
       AND e.occurred_at >= (v_from::timestamp AT TIME ZONE 'Europe/Istanbul')
       AND e.occurred_at <  ((v_to + 1)::timestamp AT TIME ZONE 'Europe/Istanbul')
       AND (p_before_at IS NULL OR (e.occurred_at, e.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
     ORDER BY e.occurred_at DESC, e.id DESC
     LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

-- ─── (5) Yetkiler ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.usage360_measurement_start() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_expert_list(text,text,text,integer,integer,boolean,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_expert_detail(uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_expert_timeline(uuid,date,date,timestamptz,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage360_measurement_start() TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_expert_list(text,text,text,integer,integer,boolean,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_expert_detail(uuid,date,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_expert_timeline(uuid,date,date,timestamptz,uuid,integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
