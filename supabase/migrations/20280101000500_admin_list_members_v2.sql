-- =============================================================================
-- ADMIN ÜYE YÖNETİMİ V2 · AŞAMA 2 — ÜYE LİSTESİ (Owner onayı 2026-11-07)
-- =============================================================================
-- YALNIZ GÖRÜNTÜLEME. Hiçbir tabloya yazılmaz, mevcut fonksiyon / tablo / satır değiştirilmez.
-- Mevcut public.admin_list_users (15 arg) AYNEN korunur (360, sistem sağlığı, metrics ve klasik liste kullanır).
--
-- 1) admin_member_stage_of(...) — üyelik AŞAMASI (tek etiket). Erişim kararı DEĞİLDİR; gerçek erişim kuralları
--    (trial_phase_of, membershipAccessCore, modül yetkileri) değişmez, yalnız okunur.
--    Aşamalar: yonetici · demo · basvuru · red · arsiv · inceleme · deneme_durdu · deneme_baslamadi · deneme ·
--              deneme_bitti · pro · eski_kayit
--    "arsiv" = mevcut ürün tanımı (onaylı uzman + pasif hesap; users/archive route ile aynı). Hesap askısı ile
--    arşiv bugün veritabanında AYRI TUTULMADIĞI için ayrı bir "hesap askıda" aşaması ÜRETİLMEZ (Aşama 4a konusu).
--    "deneme_durdu" = gerçekten tutulan deneme durumu (trial_status='suspended').
--
-- 2) admin_list_members_v2(...) — liste + sayaçlar + hazır filtre sayıları TEK sorgu tanımından:
--    sayaç / filtre / sayfalama aynı CTE'den türer (farklı hesap oluşamaz).
--    - Ticari sayaçlar demo hesapları (is_demo_account) SAYMAZ; demo hesaplar listede "Demo hesap" etiketiyle görünür.
--    - "Bugün" = Europe/Istanbul günü.
--    - Karar bekleyen = Owner bildirim zilindeki AÇIK karar sayısı (admin_notifications; aynı kaynak → birebir tutarlı).
--      Zil ile aynı 20 sn kuralıyla uzlaştırma tetiklenir (yalnız admin_notifications'a yazar).
--    - Aktör veritabanında doğrulanır: aktif admin (mevcut liste ile aynı yetki: tüm aktif yöneticiler).
--
-- Erişim: SECURITY DEFINER + sabit search_path; EXECUTE yalnız service_role (route verifyAdminRequest sonrası çağırır).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_member_stage_of(
  p_role text, p_approval text, p_active boolean, p_demo boolean,
  p_package text, p_plan text, p_trial_kind text, p_trial_status text, p_trial_ends timestamptz,
  p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_appr  text := lower(coalesce(p_approval, ''));
  v_pkg   text := lower(btrim(coalesce(nullif(btrim(p_package), ''), nullif(btrim(p_plan), ''), '')));
  v_phase text;
BEGIN
  IF lower(coalesce(p_role, '')) = 'admin' THEN RETURN 'yonetici'; END IF;
  IF coalesce(p_demo, false) THEN RETURN 'demo'; END IF;
  IF v_appr IN ('', 'pending') THEN RETURN 'basvuru'; END IF;
  IF v_appr = 'rejected' THEN RETURN 'red'; END IF;
  IF p_active IS NOT TRUE THEN RETURN 'arsiv'; END IF;
  IF p_trial_kind IS NOT NULL THEN
    v_phase := public.trial_phase_of(p_trial_kind, p_trial_status, p_package, p_trial_ends, p_now);
    IF v_phase = 'review'      THEN RETURN 'inceleme'; END IF;
    IF v_phase = 'suspended'   THEN RETURN 'deneme_durdu'; END IF;
    IF v_phase = 'not_started' THEN RETURN 'deneme_baslamadi'; END IF;
    IF v_phase = 'active'      THEN RETURN 'deneme'; END IF;
    IF v_phase = 'expired'     THEN RETURN 'deneme_bitti'; END IF;
    -- 'converted' / 'none' → paket kuralına düşer
  END IF;
  IF v_pkg = 'premium' THEN RETURN 'pro'; END IF;
  RETURN 'eski_kayit';
END;
$$;

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
                      'pay','paynext','soon','eski','askida','arsiv')
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

  WITH src AS (
    SELECT u.id, u.full_name, u.email, lower(coalesce(u.role, '')) AS role,
           public.admin_member_stage_of(u.role, u.approval_status, u.active, u.is_demo_account, u.package_type,
                                        u.plan, u.trial_kind, u.trial_status, u.trial_ends_at, v_now) AS stage,
           coalesce(u.is_demo_account, false) AS is_demo,
           u.payment_status, u.next_payment_date::date AS next_payment_date,
           u.trial_started_at, u.trial_ends_at, u.created_at, u.module_permissions,
           (SELECT max(se.created_at) FROM public.user_sessions se WHERE se.user_id = u.id) AS last_login_at,
           (SELECT min(q.created_at) FROM public.pro_upgrade_requests q WHERE q.user_id = u.id AND q.status = 'open') AS pro_request_at
      FROM public.users u
     WHERE lower(coalesce(u.role, '')) IN ('expert', 'admin')
  ),
  m AS (
    SELECT s.*,
           (s.role = 'expert' AND NOT s.is_demo) AS commercial,
           (s.stage = 'pro' AND lower(coalesce(s.payment_status, '')) <> 'exempt'
              AND (lower(coalesce(s.payment_status, '')) = 'overdue' OR s.next_payment_date < v_today)) AS pay_check,
           (s.stage = 'pro' AND lower(coalesce(s.payment_status, '')) NOT IN ('exempt', 'overdue')
              AND s.next_payment_date BETWEEN v_today AND v_today + 7) AS pay_next,
           (s.stage = 'deneme' AND s.trial_ends_at <= v_now + interval '48 hours') AS soon,
           (s.created_at >= v_now - interval '7 days') AS is_new,
           ((s.created_at AT TIME ZONE 'Europe/Istanbul')::date = v_today) AS created_today,
           CASE s.stage WHEN 'basvuru' THEN 0 WHEN 'inceleme' THEN 1 WHEN 'eski_kayit' THEN 2 WHEN 'deneme_bitti' THEN 3
                        WHEN 'deneme' THEN 4 WHEN 'deneme_baslamadi' THEN 5 WHEN 'pro' THEN 6 WHEN 'deneme_durdu' THEN 7
                        WHEN 'demo' THEN 8 WHEN 'arsiv' THEN 9 WHEN 'red' THEN 10 ELSE 11 END AS prio
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
                   WHEN 'eski' THEN p.f_eski WHEN 'askida' THEN p.f_askida WHEN 'arsiv' THEN p.f_arsiv END END)
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
           o.pro_request_at, o.pay_check, o.ord_n
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
        'arsiv', count(*) FILTER (WHERE f_arsiv), 'admins', count(*) FILTER (WHERE role = 'admin'))
      FROM presets),
    -- Ticari göstergeler: yalnız demo OLMAYAN uzmanlar.
    'counts', (SELECT jsonb_build_object(
        'today',       count(*) FILTER (WHERE commercial AND created_today),
        'trial',       count(*) FILTER (WHERE commercial AND stage = 'deneme'),
        'not_started', count(*) FILTER (WHERE commercial AND stage = 'deneme_baslamadi'),
        'pro',         count(*) FILTER (WHERE commercial AND stage = 'pro'),
        'pro_exempt',  count(*) FILTER (WHERE commercial AND stage = 'pro' AND lower(coalesce(payment_status, '')) = 'exempt'),
        'ended',       count(*) FILTER (WHERE commercial AND stage = 'deneme_bitti'),
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

REVOKE ALL ON FUNCTION public.admin_member_stage_of(text, text, boolean, boolean, text, text, text, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_member_stage_of(text, text, boolean, boolean, text, text, text, text, timestamptz, timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.admin_list_members_v2(uuid, text, text, text, text[], text, text, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_members_v2(uuid, text, text, text, text[], text, text, integer, integer, timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
