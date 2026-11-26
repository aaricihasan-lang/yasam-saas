-- =============================================================================
-- ÜYE PASİFLEŞTİRME · F4 tamamlama — ÜYE LİSTESİ V2: bağımsız kısıtlı ("Pasif") uzman listede Aktif görünmez
-- =============================================================================
-- SORUN: 20280126000000 sonrası "Pasif" uzman active=true kalır → admin_member_stage_of 'pro'/'deneme' döner → listede
--   Aktif (Pro / Denemede) görünür.
-- ÇÖZÜM: admin_list_members_v2 (REPLACE) — 20280101000600 §6 gövdesi AYNEN; farklar YALNIZ:
--   1) base: u.access_restricted_at okunur.
--   2) src: stage_prev = 4a aşaması (birebir); stage (görünen + filtreler + sıralama) = arşivlenmemiş kısıtlı uzman 'pasif'.
--   3) Ticari göstergeler ('counts') ve ödeme / süre bayrakları (pay_check, pay_next, soon) stage_prev ile → DEĞERLERİ VE
--      ANLAMLARI DEĞİŞMEZ (kısıtlı Pro uzman ticari Pro sayılmaya devam eder; ödeme takibinde kalır).
--   4) satır çıktısına access_restricted (boolean): 'pasif' aşamasında "modüller kilitli" ile eski "giriş kapalı" ayrımı.
-- DOKUNULMAYAN: imza, yetkiler, filtre adları, admin_member_stage_of, karar sayaçları, arşiv mantığı. MEVCUT SATIRLARA DML YOK.
-- ÖN KOŞUL: 20280126000000 (users.access_restricted_at) + 4a (archived_at).
-- DEPLOY SIRASI: 20280126000000 → bu migration → kod. Eski kod access_restricted alanını yok sayar (zararsız).
-- UYGULAMA: AYRI OWNER ONAYI. Bu aşamada production'a UYGULANMAZ.
-- KLASİK LİSTE: admin_list_users (REPLACE) — 20271006000000 gövdesi AYNEN; yalnız 'Aktif / Pasif' filtresi kısıtı dikkate alır.
-- GERİ ALMA: 20280101000600 §6 (admin_list_members_v2) ve 20271006000000 (admin_list_users) gövdeleri yeniden uygulanır.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'access_restricted_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'archived_at') THEN
    RAISE EXCEPTION 'uye-pasif liste on kosul: access_restricted_at / archived_at yok; uygulanmadi';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.admin_list_members_v2(
  p_actor       uuid,
  p_filter      text    DEFAULT 'all',
  p_q           text    DEFAULT '',
  p_role        text    DEFAULT 'expert',
  p_module_keys text[]  DEFAULT NULL,
  p_payment     text    DEFAULT 'all',
  p_sort        text    DEFAULT 'attn',
  p_limit       integer DEFAULT 20,
  p_offset      integer DEFAULT 0,
  p_now         timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_now    timestamptz := coalesce(p_now, now());
  v_today  date := (coalesce(p_now, now()) AT TIME ZONE 'Europe/Istanbul')::date;
  v_q      text := public.admin_search_fold(btrim(coalesce(p_q, '')));
  v_pat    text;
  v_filter text := coalesce(p_filter, 'all');
  v_role   text := coalesce(p_role, 'expert');
  v_pay    text := coalesce(p_payment, 'all');
  v_sort   text := coalesce(p_sort, 'attn');
  v_limit  integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 100);
  v_offset integer := LEAST(GREATEST(coalesce(p_offset, 0), 0), 1000000);
  v_mods   text[] := CASE WHEN p_module_keys IS NULL OR cardinality(p_module_keys) = 0 THEN NULL ELSE p_module_keys END;
  v_last   timestamptz;
  v_out    jsonb;
BEGIN
  -- Aktör: aktif admin (veritabanında yeniden doğrulanır; istemci beyanına güvenilmez).
  IF p_actor IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users a
        WHERE a.id = p_actor AND lower(coalesce(a.role, '')) = 'admin' AND a.active IS TRUE) THEN
    RAISE EXCEPTION 'admin_list_members_v2: yetkisiz' USING ERRCODE = 'UY401';
  END IF;
  IF v_filter NOT IN ('all','basvuru','trial','bitti','pro','prores','yeni','notstarted','inceleme',
                      'pay','paynext','soon','eski','askida','pasif','arsiv')
     OR v_role NOT IN ('expert','admin')
     OR v_pay NOT IN ('all','check','paid','pending','overdue','exempt')
     OR v_sort NOT IN ('attn','new','login','name')
     OR (v_mods IS NOT NULL AND (cardinality(v_mods) > 8
         OR EXISTS (SELECT 1 FROM unnest(v_mods) k WHERE k IS NULL OR k !~ '^[a-z][a-z_]{1,39}$')))
     OR char_length(v_q) > 120 THEN
    RAISE EXCEPTION 'admin_list_members_v2: gecersiz filtre' USING ERRCODE = 'UY003';
  END IF;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- Karar sayısı zil ile AYNI kaynaktan: zil ile aynı 20 sn kuralıyla uzlaştırma (yalnız admin_notifications yazar).
  SELECT last_reconciled_at INTO v_last FROM public.admin_notification_settings WHERE id;
  IF v_last IS NULL OR v_last < now() - interval '20 seconds' THEN
    PERFORM public.admin_notifications_reconcile();
  END IF;

  WITH base AS (
    SELECT u.id, u.full_name, u.email, lower(coalesce(u.role, '')) AS role,
           public.admin_member_stage_of(u.role, u.approval_status, u.active, u.is_demo_account, u.package_type,
                                        u.plan, u.trial_kind, u.trial_status, u.trial_ends_at, v_now) AS stage0,
           u.archived_at,
           u.access_restricted_at,
           coalesce(u.is_demo_account, false) AS is_demo,
           u.payment_status, u.next_payment_date::date AS next_payment_date,
           u.trial_started_at, u.trial_ends_at, u.created_at, u.module_permissions,
           (SELECT max(se.created_at) FROM public.user_sessions se WHERE se.user_id = u.id) AS last_login_at,
           (SELECT min(q.created_at) FROM public.pro_upgrade_requests q WHERE q.user_id = u.id AND q.status = 'open') AS pro_request_at
      FROM public.users u
     WHERE lower(coalesce(u.role, '')) IN ('expert', 'admin')
  ),
  src AS (
    -- 4a: admin_member_stage_of 'arsiv' = onaylı + pasif uzman. Yalnız archived_at dolu olan ARŞİV'dir;
    -- arşivlenmemiş pasif hesap 'pasif' aşamasıdır (eski active=false kayıtlar dahil — otomatik arşivleme yok).
    -- ÜYE PASİFLEŞTİRME: stage_prev = 4a aşaması AYNEN (ticari sayaç / ödeme takibi bununla — değerleri DEĞİŞMEZ);
    -- stage (görünen + filtre) = arşivlenmemiş bağımsız kısıtlı uzman da 'pasif'.
    SELECT b.*, CASE WHEN b.stage0 = 'arsiv' AND b.archived_at IS NULL THEN 'pasif' ELSE b.stage0 END AS stage_prev,
           CASE WHEN b.archived_at IS NULL AND (b.stage0 = 'arsiv' OR b.access_restricted_at IS NOT NULL) THEN 'pasif'
                ELSE b.stage0 END AS stage
      FROM base b
  ),
  m AS (
    SELECT s.*,
           (s.role = 'expert' AND NOT s.is_demo) AS commercial,
           (s.stage_prev = 'pro' AND lower(coalesce(s.payment_status, '')) <> 'exempt'
              AND (lower(coalesce(s.payment_status, '')) = 'overdue' OR s.next_payment_date < v_today)) AS pay_check,
           (s.stage_prev = 'pro' AND lower(coalesce(s.payment_status, '')) NOT IN ('exempt', 'overdue')
              AND s.next_payment_date BETWEEN v_today AND v_today + 7) AS pay_next,
           (s.stage_prev = 'deneme' AND s.trial_ends_at <= v_now + interval '48 hours') AS soon,
           (s.created_at >= v_now - interval '7 days') AS is_new,
           ((s.created_at AT TIME ZONE 'Europe/Istanbul')::date = v_today) AS created_today,
           CASE s.stage WHEN 'basvuru' THEN 0 WHEN 'inceleme' THEN 1 WHEN 'eski_kayit' THEN 2 WHEN 'deneme_bitti' THEN 3
                        WHEN 'deneme' THEN 4 WHEN 'deneme_baslamadi' THEN 5 WHEN 'pro' THEN 6 WHEN 'deneme_durdu' THEN 7
                        WHEN 'pasif' THEN 8 WHEN 'demo' THEN 9 WHEN 'arsiv' THEN 10 WHEN 'red' THEN 11 ELSE 12 END AS prio
      FROM src s
  ),
  presets AS (
    SELECT m.*,
           (m.role = 'expert' AND m.stage <> 'arsiv')                          AS f_all,
           (m.stage = 'basvuru')                                               AS f_basvuru,
           (m.stage = 'deneme')                                                AS f_trial,
           (m.stage = 'deneme_bitti')                                          AS f_bitti,
           (m.stage = 'pro')                                                   AS f_pro,
           (m.pro_request_at IS NOT NULL AND m.stage <> 'pro')                 AS f_prores,
           (m.role = 'expert' AND m.is_new AND NOT m.is_demo)                  AS f_yeni,
           (m.stage = 'deneme_baslamadi')                                      AS f_notstarted,
           (m.stage = 'inceleme')                                              AS f_inceleme,
           m.pay_check                                                         AS f_pay,
           m.pay_next                                                          AS f_paynext,
           m.soon                                                              AS f_soon,
           (m.stage = 'eski_kayit')                                            AS f_eski,
           (m.stage = 'deneme_durdu')                                          AS f_askida,
           (m.stage = 'pasif')                                                 AS f_pasif,
           (m.stage = 'arsiv')                                                 AS f_arsiv
      FROM m
  ),
  filtered AS (
    SELECT p.* FROM presets p
     WHERE (CASE WHEN v_role = 'admin' THEN p.role = 'admin'
                 ELSE CASE v_filter
                   WHEN 'all' THEN p.f_all WHEN 'basvuru' THEN p.f_basvuru WHEN 'trial' THEN p.f_trial
                   WHEN 'bitti' THEN p.f_bitti WHEN 'pro' THEN p.f_pro WHEN 'prores' THEN p.f_prores
                   WHEN 'yeni' THEN p.f_yeni WHEN 'notstarted' THEN p.f_notstarted WHEN 'inceleme' THEN p.f_inceleme
                   WHEN 'pay' THEN p.f_pay WHEN 'paynext' THEN p.f_paynext WHEN 'soon' THEN p.f_soon
                   WHEN 'eski' THEN p.f_eski WHEN 'askida' THEN p.f_askida WHEN 'pasif' THEN p.f_pasif
                   WHEN 'arsiv' THEN p.f_arsiv END END)
       AND (v_q = '' OR public.admin_search_fold(p.full_name) LIKE v_pat OR public.admin_search_fold(p.email) LIKE v_pat)
       AND (v_mods IS NULL
            OR (jsonb_typeof(p.module_permissions) = 'object'
                AND EXISTS (SELECT 1 FROM unnest(v_mods) k WHERE p.module_permissions -> k = 'true'::jsonb)))
       AND (v_pay = 'all'
            OR (v_pay = 'check' AND p.pay_check)
            OR (v_pay <> 'check' AND lower(coalesce(p.payment_status, '')) = v_pay))
  ),
  ordered AS (
    SELECT f.*, row_number() OVER (ORDER BY
             CASE WHEN v_sort = 'attn' THEN f.prio END ASC,
             CASE WHEN v_sort = 'attn' THEN (f.pro_request_at IS NOT NULL) END DESC,
             CASE WHEN v_sort = 'login' THEN f.last_login_at END DESC NULLS LAST,
             CASE WHEN v_sort = 'name' THEN public.admin_search_fold(coalesce(nullif(btrim(f.full_name), ''), f.email)) END ASC NULLS LAST,
             f.created_at DESC NULLS LAST,
             f.id) AS ord_n
      FROM filtered f
  ),
  page AS (
    SELECT o.id, o.full_name, o.email, o.role, o.stage, o.is_demo, o.payment_status, o.next_payment_date,
           o.trial_started_at, o.trial_ends_at, o.created_at, o.module_permissions, o.last_login_at,
           o.pro_request_at, o.pay_check, (o.access_restricted_at IS NOT NULL) AS access_restricted, o.ord_n
      FROM ordered o ORDER BY o.ord_n LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM filtered),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(pg) - 'ord_n' ORDER BY pg.ord_n) FROM page pg), '[]'::jsonb),
    'presets', (SELECT jsonb_build_object(
        'all', count(*) FILTER (WHERE f_all), 'basvuru', count(*) FILTER (WHERE f_basvuru),
        'trial', count(*) FILTER (WHERE f_trial), 'bitti', count(*) FILTER (WHERE f_bitti),
        'pro', count(*) FILTER (WHERE f_pro), 'prores', count(*) FILTER (WHERE f_prores),
        'yeni', count(*) FILTER (WHERE f_yeni), 'notstarted', count(*) FILTER (WHERE f_notstarted),
        'inceleme', count(*) FILTER (WHERE f_inceleme), 'pay', count(*) FILTER (WHERE f_pay),
        'paynext', count(*) FILTER (WHERE f_paynext), 'soon', count(*) FILTER (WHERE f_soon),
        'eski', count(*) FILTER (WHERE f_eski), 'askida', count(*) FILTER (WHERE f_askida),
        'pasif', count(*) FILTER (WHERE f_pasif),
        'arsiv', count(*) FILTER (WHERE f_arsiv), 'admins', count(*) FILTER (WHERE role = 'admin'))
      FROM presets),
    -- Ticari göstergeler: yalnız demo OLMAYAN uzmanlar.
    'counts', (SELECT jsonb_build_object(
        'today',       count(*) FILTER (WHERE commercial AND created_today),
        'trial',       count(*) FILTER (WHERE commercial AND stage_prev = 'deneme'),
        'not_started', count(*) FILTER (WHERE commercial AND stage_prev = 'deneme_baslamadi'),
        'pro',         count(*) FILTER (WHERE commercial AND stage_prev = 'pro'),
        'pro_exempt',  count(*) FILTER (WHERE commercial AND stage_prev = 'pro' AND lower(coalesce(payment_status, '')) = 'exempt'),
        'ended',       count(*) FILTER (WHERE commercial AND stage_prev = 'deneme_bitti'),
        'soon',        count(*) FILTER (WHERE commercial AND soon),
        'pay_check',   count(*) FILTER (WHERE commercial AND pay_check),
        'pay_next',    count(*) FILTER (WHERE commercial AND pay_next),
        'demo',        count(*) FILTER (WHERE role = 'expert' AND is_demo))
      FROM m),
    -- Karar bekleyenler: zildeki açık kararlar (tür bazında + toplam) — aynı tablo, aynı tanım.
    'decisions', (SELECT jsonb_build_object(
        'total',      count(*),
        'basvuru',    count(*) FILTER (WHERE n.type = 'basvuru'),
        'pro_talebi', count(*) FILTER (WHERE n.type = 'pro_talebi'),
        'inceleme',   count(*) FILTER (WHERE n.type = 'inceleme'),
        'eski_kayit', count(*) FILTER (WHERE n.type = 'eski_kayit'),
        'odeme',      count(*) FILTER (WHERE n.type = 'odeme'))
      FROM public.admin_notifications n WHERE n.kind = 'action' AND n.resolved_at IS NULL),
    'today', v_today,
    'server_now', v_now,
    'limit', v_limit,
    'offset', v_offset)
  INTO v_out;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_members_v2(uuid, text, text, text, text[], text, text, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_members_v2(uuid, text, text, text, text[], text, text, integer, integer, timestamptz)
  TO service_role;

-- ── 2) KLASİK ÜYE LİSTESİ — 'Aktif / Pasif' filtresi ──────────────────────────────────────────
-- 20271006000000 admin_list_users gövdesi AYNEN; fark YALNIZ p_active filtresi (yukarıdaki yorum). Sayaçlar
-- (approved_active, archived, renewal_*) ve ticari tanımlar DEĞİŞMEZ.
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_q           text,
  p_role_match  text,
  p_view        text,
  p_approval    text,
  p_active      text,
  p_role        text,
  p_payment     text,
  p_limit       integer,
  p_offset      integer,
  p_due         text    DEFAULT 'all',
  p_sort        text    DEFAULT 'default',
  p_activity    text    DEFAULT 'all',
  p_module_keys text[]  DEFAULT NULL,
  p_security    text    DEFAULT 'all',
  p_today       date    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_q        text := public.admin_search_fold(btrim(coalesce(p_q, '')));
  v_pat      text;
  v_limit    integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 100);
  v_offset   integer := LEAST(GREATEST(coalesce(p_offset, 0), 0), 1000000);
  v_due      text := coalesce(p_due, 'all');
  v_sort     text := coalesce(p_sort, 'default');
  v_activity text := coalesce(p_activity, 'all');
  v_security text := coalesce(p_security, 'all');
  v_today    date := coalesce(p_today, (now() AT TIME ZONE 'Europe/Istanbul')::date);
  v_mstart   date := public.usage360_measurement_start();
  v_mods     text[] := CASE WHEN p_module_keys IS NULL OR cardinality(p_module_keys) = 0 THEN NULL ELSE p_module_keys END;
  v_out      jsonb;
  v_counts   jsonb;
BEGIN
  IF coalesce(p_view, 'members') NOT IN ('members', 'archive', 'all')
     OR coalesce(p_approval, 'all') NOT IN ('all', 'pending', 'approved', 'rejected')
     OR coalesce(p_active, 'all') NOT IN ('all', 'active', 'passive')
     OR coalesce(p_role, 'all') NOT IN ('all', 'admin', 'expert')
     OR coalesce(p_payment, 'all') NOT IN ('all', 'paid', 'pending', 'overdue', 'exempt')
     OR v_due NOT IN ('all', 'overdue', 'due30', 'no_date', 'd0_7', 'd8_30', 'd31_60', 'd61_90', 'd90p')
     OR v_sort NOT IN ('default', 'next_payment_asc', 'next_payment_desc', 'activity_desc', 'activity_asc',
                       'd7_desc', 'd30_desc', 'created_desc', 'name_asc')
     OR v_activity NOT IN ('all', 'today', 'd7', 'd30', 'idle30', 'idle60', 'idle90', 'unmeasured')
     OR v_security NOT IN ('all', 'alert')
     OR (p_role_match IS NOT NULL AND p_role_match NOT IN ('admin', 'expert'))
     OR (v_mods IS NOT NULL AND (cardinality(v_mods) > 8
         OR EXISTS (SELECT 1 FROM unnest(v_mods) k WHERE k IS NULL OR k !~ '^[a-z][a-z_]{1,39}$')))
     OR char_length(v_q) > 120 THEN
    RAISE EXCEPTION 'admin_list_users: gecersiz filtre' USING ERRCODE = 'UY003';
  END IF;
  -- LIKE joker karakterleri kaçışlanır (kullanıcı girdisi desen olarak yorumlanmaz).
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  WITH base AS (
    SELECT u.*,
           (lower(coalesce(u.role, '')) = 'expert' AND coalesce(u.is_demo_account, false) = false) AS tracked
      FROM public.users u
     WHERE (coalesce(p_view, 'members') = 'all'
            OR (p_view = 'archive' AND (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE))
            OR (coalesce(p_view, 'members') = 'members' AND NOT (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE)))
       AND (coalesce(p_approval, 'all') = 'all'
            OR (CASE WHEN lower(coalesce(u.approval_status,'')) IN ('approved','rejected') THEN lower(u.approval_status) ELSE 'pending' END) = p_approval)
       -- ÜYE PASİFLEŞTİRME: bağımsız kısıtlı ("Pasif") uzman 'Aktif' filtresinde DEĞİL, 'Pasif' filtresinde.
       AND (coalesce(p_active, 'all') = 'all'
            OR (p_active = 'active' AND u.active IS TRUE AND u.access_restricted_at IS NULL)
            OR (p_active = 'passive' AND (u.active IS NOT TRUE OR u.access_restricted_at IS NOT NULL)))
       AND (coalesce(p_role, 'all') = 'all' OR lower(coalesce(u.role, '')) = p_role)
       AND (coalesce(p_payment, 'all') = 'all' OR lower(coalesce(u.payment_status, '')) = p_payment)
       AND (v_due = 'all'
            OR (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved'
                AND u.active IS TRUE AND lower(coalesce(u.payment_status, '')) <> 'exempt'
                AND ((v_due = 'overdue' AND u.next_payment_date::date < v_today)
                     OR (v_due = 'due30'  AND u.next_payment_date::date BETWEEN v_today AND v_today + 30)
                     OR (v_due = 'd0_7'   AND u.next_payment_date::date BETWEEN v_today AND v_today + 7)
                     OR (v_due = 'd8_30'  AND u.next_payment_date::date BETWEEN v_today + 8 AND v_today + 30)
                     OR (v_due = 'd31_60' AND u.next_payment_date::date BETWEEN v_today + 31 AND v_today + 60)
                     OR (v_due = 'd61_90' AND u.next_payment_date::date BETWEEN v_today + 61 AND v_today + 90)
                     OR (v_due = 'd90p'   AND u.next_payment_date::date > v_today + 90)
                     OR (v_due = 'no_date' AND u.next_payment_date IS NULL))))
       AND (v_q = '' OR public.admin_search_fold(u.full_name) LIKE v_pat OR public.admin_search_fold(u.email) LIKE v_pat
            OR (p_role_match IS NOT NULL AND lower(coalesce(u.role, '')) = p_role_match))
       AND (v_mods IS NULL
            OR (jsonb_typeof(u.module_permissions) = 'object'
                AND EXISTS (SELECT 1 FROM unnest(v_mods) k WHERE u.module_permissions -> k = 'true'::jsonb)))
       AND (v_security = 'all'
            OR EXISTS (SELECT 1 FROM public.security_events se
                        WHERE se.user_id = u.id AND se.severity IN ('medium', 'high')))
  ),
  act AS (
    SELECT b.*,
           la.last_at  AS last_activity,
           la.day_tr   AS last_day,
           CASE WHEN b.tracked THEN coalesce(a30.d7, 0) END  AS d7_active_days,
           CASE WHEN b.tracked THEN coalesce(a30.d30, 0) END AS d30_active_days,
           CASE WHEN b.tracked THEN public.admin_member_activity_state(
             v_today, v_mstart, la.day_tr,
             GREATEST(v_mstart, (b.created_at AT TIME ZONE 'Europe/Istanbul')::date,
                      (coalesce(b.approved_at, b.created_at) AT TIME ZONE 'Europe/Istanbul')::date)) END AS activity_state,
           CASE WHEN b.tracked AND la.day_tr IS NOT NULL THEN v_today - la.day_tr END AS days_since_activity,
           CASE WHEN b.tracked AND la.day_tr IS NULL AND v_mstart IS NOT NULL THEN
             GREATEST(0, v_today - GREATEST(v_mstart, (b.created_at AT TIME ZONE 'Europe/Istanbul')::date,
                      (coalesce(b.approved_at, b.created_at) AT TIME ZONE 'Europe/Istanbul')::date) + 1) END AS idle_days_lower_bound
      FROM base b
      LEFT JOIN LATERAL (
        SELECT d.day_tr, d.last_at FROM public.usage_daily d
         WHERE b.tracked AND d.user_id = b.id AND d.day_tr <= v_today
         ORDER BY d.day_tr DESC, d.last_at DESC
         LIMIT 1
      ) la ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT d.day_tr) FILTER (WHERE d.day_tr > v_today - 7) AS d7,
               count(DISTINCT d.day_tr) AS d30
          FROM public.usage_daily d
         WHERE b.tracked AND d.user_id = b.id AND d.day_tr BETWEEN v_today - 29 AND v_today
      ) a30 ON true
  ),
  filtered AS (
    SELECT * FROM act a
     WHERE v_activity = 'all'
        OR (a.tracked AND (
              (v_activity = 'today'      AND a.activity_state = 'today')
           OR (v_activity = 'd7'         AND a.activity_state IN ('today', 'd7'))
           OR (v_activity = 'd30'        AND a.activity_state IN ('today', 'd7', 'd30'))
           OR (v_activity = 'idle30'     AND a.activity_state IN ('idle30', 'idle60', 'idle90'))
           OR (v_activity = 'idle60'     AND a.activity_state IN ('idle60', 'idle90'))
           OR (v_activity = 'idle90'     AND a.activity_state = 'idle90')
           OR (v_activity = 'unmeasured' AND a.activity_state = 'unmeasured')))
  ),
  ordered AS (
    SELECT f.*,
           -- Tek sıralama tanımı. 'default' eski sıralamayla BİREBİR: onay grubu → created_at DESC → id.
           row_number() OVER (ORDER BY
             CASE WHEN v_sort = 'default' THEN
               CASE WHEN lower(coalesce(f.approval_status,'')) = 'approved' THEN 1
                    WHEN lower(coalesce(f.approval_status,'')) = 'rejected' THEN 2 ELSE 0 END
             END,
             CASE WHEN v_sort = 'next_payment_asc'  THEN f.next_payment_date::date END ASC NULLS LAST,
             CASE WHEN v_sort = 'next_payment_desc' THEN f.next_payment_date::date END DESC NULLS LAST,
             -- Aktivite sıralamalarında izlenmeyen (yönetici/demo) satırlar her zaman sonda.
             CASE WHEN v_sort IN ('activity_desc', 'activity_asc', 'd7_desc', 'd30_desc')
                  THEN CASE WHEN f.tracked THEN 0 ELSE 1 END END,
             -- Önce TR günü, sonra o günün son anı (gün sınırı tutarlı; filtrelerle aynı gün tanımı).
             CASE WHEN v_sort = 'activity_desc' THEN f.last_day END DESC NULLS LAST,
             CASE WHEN v_sort = 'activity_desc' THEN f.last_activity END DESC NULLS LAST,
             -- "En eski": hiç ölçülmüş aktivitesi olmayanlar önce (en uzun hareketsizlik), sonra eskiden yeniye.
             CASE WHEN v_sort = 'activity_asc'  THEN f.last_day END ASC NULLS FIRST,
             CASE WHEN v_sort = 'activity_asc'  THEN f.last_activity END ASC NULLS FIRST,
             CASE WHEN v_sort = 'd7_desc'  THEN f.d7_active_days END DESC NULLS LAST,
             CASE WHEN v_sort = 'd30_desc' THEN f.d30_active_days END DESC NULLS LAST,
             CASE WHEN v_sort IN ('d7_desc', 'd30_desc') THEN f.last_day END DESC NULLS LAST,
             CASE WHEN v_sort = 'name_asc' THEN public.admin_search_fold(coalesce(nullif(btrim(f.full_name), ''), f.email)) END ASC NULLS LAST,
             CASE WHEN v_sort IN ('default', 'created_desc') THEN f.created_at END DESC NULLS LAST,
             f.id) AS ord_n
      FROM filtered f
  ),
  page AS (
    SELECT o.id, o.full_name, o.email, o.role, o.active, o.approval_status, o.approved_at,
           o.module_permissions, o.package_type, o.membership_status, o.subscription_status,
           o.trial_started_at, o.trial_ends_at, o.membership_started_at, o.membership_ends_at,
           o.plan, o.admin_level, o.tenant_id, o.created_at, o.payment_status, o.last_payment_date,
           o.next_payment_date, o.paid_amount, o.payment_note, o.agreed_fee, o.billing_period,
           o.license_type, o.allowed_active_sessions, o.allowed_locations, o.security_mode, o.security_exempt,
           o.license_note, o.allowed_desktop_sessions, o.allowed_mobile_sessions,
           o.allowed_tablet_sessions, o.allowed_unknown_sessions,
           coalesce(o.is_demo_account, false) AS is_demo_account,
           o.last_activity, o.d7_active_days, o.d30_active_days, o.activity_state,
           o.days_since_activity, o.idle_days_lower_bound,
           o.ord_n
      FROM ordered o
     ORDER BY o.ord_n
     LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
           'total', (SELECT count(*)::int FROM filtered),
           'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'ord_n' ORDER BY p.ord_n) FROM page p), '[]'::jsonb))
    INTO v_out;

  SELECT jsonb_build_object(
           'experts_total',   count(*) FILTER (WHERE r = 'expert'),
           'pending',         count(*) FILTER (WHERE r = 'expert' AND a NOT IN ('approved', 'rejected')),
           'approved_active', count(*) FILTER (WHERE r = 'expert' AND a = 'approved' AND act IS TRUE),
           'archived',        count(*) FILTER (WHERE r = 'expert' AND a = 'approved' AND act IS NOT TRUE),
           'rejected',        count(*) FILTER (WHERE r = 'expert' AND a = 'rejected'),
           'admins',          count(*) FILTER (WHERE r = 'admin'),
           'renewal_overdue', count(*) FILTER (WHERE r = 'expert' AND a = 'approved' AND act IS TRUE
                                                 AND ps <> 'exempt' AND npd < v_today),
           'renewal_due30',   count(*) FILTER (WHERE r = 'expert' AND a = 'approved' AND act IS TRUE
                                                 AND ps <> 'exempt' AND npd BETWEEN v_today AND v_today + 30))
    INTO v_counts
    FROM (SELECT lower(coalesce(role, '')) AS r, lower(coalesce(approval_status, '')) AS a, active AS act,
                 lower(coalesce(payment_status, '')) AS ps, next_payment_date::date AS npd
            FROM public.users) z;

  RETURN jsonb_build_object(
    'total', (v_out ->> 'total')::int,
    'rows', v_out -> 'rows',
    'counts', v_counts,
    'limit', v_limit,
    'offset', v_offset,
    'measurement', jsonb_build_object(
      'start', v_mstart, 'today', v_today,
      'measured_days', CASE WHEN v_mstart IS NULL THEN NULL ELSE GREATEST(0, v_today - v_mstart + 1) END));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, text, text, text, text, text, integer, integer, text, text, text, text[], text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, text, text, text, text, text, integer, integer, text, text, text, text[], text, date)
  TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;
