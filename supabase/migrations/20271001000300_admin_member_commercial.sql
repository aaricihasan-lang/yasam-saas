-- =============================================================================
-- 20271001000300_admin_member_commercial.sql
--
-- ÜYE YÖNETİMİ — TİCARİ TAKİP (AŞAMA 2 · §4.1 · M4) — owner kararı 17
--
-- KAPSAM (YENİ BILLING SİSTEMİ DEĞİL; otomatik kilit/pasif YOK, e-posta/SMS/cron YOK):
--   1) public.users + agreed_fee numeric(12,2) NULL (CHECK >= 0)
--                   + billing_period text NULL (CHECK IN monthly|quarterly|semiannual|yearly)
--      Savunma amaçlı: yeni kolonlarda anon/authenticated kolon yetkisi REVOKE (canlıda users
--      tablosunda anon/authenticated grant'i zaten YOK; idempotent, no-op olabilir).
--   2) public.user_payment_history (repo'da DDL yok; prod'da mevcut) + agreed_fee, billing_period,
--      actor_admin_id (nullable). Tablo yoksa NOTICE + atla.
--   3) public.admin_list_users — 9 argümanlı eski imza DROP + yeni imza (mevcut 9 parametre +
--      p_due text DEFAULT 'all' + p_sort text DEFAULT 'default'):
--        p_due : all | overdue (next_payment_date < İstanbul bugünü)
--                    | due30   (bugün ≤ next_payment_date ≤ bugün+30)
--                    | no_date (next_payment_date IS NULL)
--                yalnız role=expert + approval=approved + active + payment_status<>'exempt'.
--        p_sort: default (eski sıralama BİREBİR) | next_payment_asc | next_payment_desc
--                (NULLS LAST, id tiebreaker).
--        counts: + renewal_overdue, renewal_due30 (aynı uygunluk koşulu; GLOBAL).
--        rows  : + agreed_fee, billing_period.
--      Diğer tüm davranış (arama, filtreler, sayfalama, sayaçlar, doğrulama, UY003) BİREBİR.
--      Varsayılanlı yeni parametreler sayesinde ESKİ KOD (9 adlı argüman) yeni fonksiyonu
--      çağırmaya devam eder → bu migration koddan ÖNCE güvenle uygulanabilir.
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + EXECUTE YALNIZ service_role.
-- VERİ: mevcut satırlara DML YOK (literal 'undefined' payment_status değerleri olduğu gibi kalır).
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, pg_constraint kontrollü ADD CONSTRAINT,
--   DROP FUNCTION IF EXISTS + CREATE OR REPLACE, tekrar çalıştırılabilir REVOKE/GRANT.
-- DEPLOY SIRASI: BU MIGRATION → kod (USERS_SAFE_SELECT yeni kolonları okur; liste route'u
--   p_due/p_sort gönderir). Kod önce giderse admin üye detay/liste 500 verir.
--
-- Rollback (kod geri alındıktan SONRA):
--   1) 20270130000000_admin_member_phase2.sql içindeki `CREATE OR REPLACE FUNCTION
--      public.admin_list_users(...9 arg...)` bloğunu + o imzanın REVOKE/GRANT satırlarını çalıştır;
--      ardından: DROP FUNCTION IF EXISTS public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text);
--   2) Kolonlar nullable ve okunmazsa zararsızdır; gerçekten kaldırmak gerekirse (VERİ KAYBI):
--      ALTER TABLE public.users DROP COLUMN IF EXISTS agreed_fee, DROP COLUMN IF EXISTS billing_period;
--      ALTER TABLE public.user_payment_history DROP COLUMN IF EXISTS agreed_fee,
--        DROP COLUMN IF EXISTS billing_period, DROP COLUMN IF EXISTS actor_admin_id;
-- =============================================================================

BEGIN;

-- ── 1) users: anlaşılan ücret + ödeme dönemi ──────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agreed_fee numeric(12,2);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS billing_period text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'users_agreed_fee_nonneg_chk' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_agreed_fee_nonneg_chk CHECK (agreed_fee IS NULL OR agreed_fee >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'users_billing_period_chk' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_billing_period_chk
      CHECK (billing_period IS NULL OR billing_period IN ('monthly', 'quarterly', 'semiannual', 'yearly'));
  END IF;
END $$;

-- Savunma: yeni kolonlarda anon/authenticated kolon yetkisi olmasın (tablo seviyesi zaten kapalı).
REVOKE ALL (agreed_fee, billing_period) ON TABLE public.users FROM anon, authenticated;

-- ── 2) user_payment_history: ücret/dönem anlık görüntüsü + işlemi yapan admin ─────
DO $$
BEGIN
  IF to_regclass('public.user_payment_history') IS NULL THEN
    RAISE NOTICE 'user_payment_history yok — M4 geçmiş kolonları atlandı';
    RETURN;
  END IF;
  ALTER TABLE public.user_payment_history ADD COLUMN IF NOT EXISTS agreed_fee numeric(12,2);
  ALTER TABLE public.user_payment_history ADD COLUMN IF NOT EXISTS billing_period text;
  ALTER TABLE public.user_payment_history ADD COLUMN IF NOT EXISTS actor_admin_id uuid;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_payment_history_agreed_fee_nonneg_chk'
       AND conrelid = 'public.user_payment_history'::regclass
  ) THEN
    ALTER TABLE public.user_payment_history
      ADD CONSTRAINT user_payment_history_agreed_fee_nonneg_chk CHECK (agreed_fee IS NULL OR agreed_fee >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_payment_history_billing_period_chk'
       AND conrelid = 'public.user_payment_history'::regclass
  ) THEN
    ALTER TABLE public.user_payment_history
      ADD CONSTRAINT user_payment_history_billing_period_chk
      CHECK (billing_period IS NULL OR billing_period IN ('monthly', 'quarterly', 'semiannual', 'yearly'));
  END IF;
  -- Tüm erişim service_role API route'ları üzerinden (20270129001100 ile aynı kilit; idempotent).
  REVOKE ALL ON TABLE public.user_payment_history FROM anon, authenticated;
END $$;

-- ── 3) admin_list_users: yenileme filtresi + sıralama + sayaçlar ──────────────────
DROP FUNCTION IF EXISTS public.admin_list_users(text, text, text, text, text, text, text, integer, integer);

-- p_view    : 'members' (arşiv HARİÇ) | 'archive' (yalnız onaylı+pasif uzman) | 'all'
-- p_approval: all|pending|approved|rejected (legacy boş/diğer → pending)
-- p_active  : all|active|passive   · p_role: all|admin|expert
-- p_payment : all|paid|pending|overdue|exempt
-- p_role_match: uygulama "uzman"/"yönetici" gibi rol aramasını çözerse 'expert'/'admin' (yoksa NULL)
-- p_due     : all|overdue|due30|no_date — yalnız onaylı + aktif + muaf olmayan uzmanlar (İstanbul günü)
-- p_sort    : default|next_payment_asc|next_payment_desc (NULLS LAST, id tiebreaker)
-- Sayaçlar (counts) GLOBAL'dir (filtreden bağımsız) ve UZMANLAR için bir BÖLÜMLEMEDİR:
--   experts_total = pending + approved_active + archived + rejected  (kesişim yok).
--   renewal_overdue / renewal_due30 bu bölümlemenin parçası DEĞİLDİR (approved_active alt kümesi).
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_q          text,
  p_role_match text,
  p_view       text,
  p_approval   text,
  p_active     text,
  p_role       text,
  p_payment    text,
  p_limit      integer,
  p_offset     integer,
  p_due        text DEFAULT 'all',
  p_sort       text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_q      text := public.admin_search_fold(btrim(coalesce(p_q, '')));
  v_pat    text;
  v_limit  integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 100);
  v_offset integer := LEAST(GREATEST(coalesce(p_offset, 0), 0), 1000000);
  v_due    text := coalesce(p_due, 'all');
  v_sort   text := coalesce(p_sort, 'default');
  v_today  date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_total  integer;
  v_rows   jsonb;
  v_counts jsonb;
BEGIN
  IF coalesce(p_view, 'members') NOT IN ('members', 'archive', 'all')
     OR coalesce(p_approval, 'all') NOT IN ('all', 'pending', 'approved', 'rejected')
     OR coalesce(p_active, 'all') NOT IN ('all', 'active', 'passive')
     OR coalesce(p_role, 'all') NOT IN ('all', 'admin', 'expert')
     OR coalesce(p_payment, 'all') NOT IN ('all', 'paid', 'pending', 'overdue', 'exempt')
     OR v_due NOT IN ('all', 'overdue', 'due30', 'no_date')
     OR v_sort NOT IN ('default', 'next_payment_asc', 'next_payment_desc')
     OR (p_role_match IS NOT NULL AND p_role_match NOT IN ('admin', 'expert'))
     OR char_length(v_q) > 120 THEN
    RAISE EXCEPTION 'admin_list_users: gecersiz filtre' USING ERRCODE = 'UY003';
  END IF;
  -- LIKE joker karakterleri kaçışlanır (kullanıcı girdisi desen olarak yorumlanmaz).
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- Toplam (filtreli) + sayfa (aynı koşullar):
  SELECT count(*)::int INTO v_total FROM (
    SELECT 1 FROM public.users u
     WHERE (coalesce(p_view, 'members') = 'all'
            OR (p_view = 'archive' AND (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE))
            OR (coalesce(p_view, 'members') = 'members' AND NOT (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE)))
       AND (coalesce(p_approval, 'all') = 'all'
            OR (CASE WHEN lower(coalesce(u.approval_status,'')) IN ('approved','rejected') THEN lower(u.approval_status) ELSE 'pending' END) = p_approval)
       AND (coalesce(p_active, 'all') = 'all' OR (p_active = 'active' AND u.active IS TRUE) OR (p_active = 'passive' AND u.active IS NOT TRUE))
       AND (coalesce(p_role, 'all') = 'all' OR lower(coalesce(u.role, '')) = p_role)
       AND (coalesce(p_payment, 'all') = 'all' OR lower(coalesce(u.payment_status, '')) = p_payment)
       AND (v_due = 'all'
            OR (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved'
                AND u.active IS TRUE AND lower(coalesce(u.payment_status, '')) <> 'exempt'
                AND ((v_due = 'overdue' AND u.next_payment_date::date < v_today)
                     OR (v_due = 'due30' AND u.next_payment_date::date BETWEEN v_today AND v_today + 30)
                     OR (v_due = 'no_date' AND u.next_payment_date IS NULL))))
       AND (v_q = '' OR public.admin_search_fold(u.full_name) LIKE v_pat OR public.admin_search_fold(u.email) LIKE v_pat
            OR (p_role_match IS NOT NULL AND lower(coalesce(u.role, '')) = p_role_match))
  ) t;

  SELECT coalesce(jsonb_agg(to_jsonb(s) - 'ord_n' ORDER BY s.ord_n), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT u.id, u.full_name, u.email, u.role, u.active, u.approval_status, u.approved_at,
             u.module_permissions, u.package_type, u.membership_status, u.subscription_status,
             u.trial_started_at, u.trial_ends_at, u.membership_started_at, u.membership_ends_at,
             u.plan, u.admin_level, u.tenant_id, u.created_at, u.payment_status, u.last_payment_date,
             u.next_payment_date, u.paid_amount, u.payment_note, u.agreed_fee, u.billing_period,
             u.license_type, u.allowed_active_sessions, u.allowed_locations, u.security_mode, u.security_exempt,
             u.license_note, u.allowed_desktop_sessions, u.allowed_mobile_sessions,
             u.allowed_tablet_sessions, u.allowed_unknown_sessions,
             -- Tek sıralama tanımı (sayfa + jsonb_agg aynı sırayı kullanır). 'default' eski
             -- sıralamayla BİREBİR: onay grubu → created_at DESC NULLS LAST → id.
             row_number() OVER (ORDER BY
               CASE WHEN v_sort = 'default' THEN
                 CASE WHEN lower(coalesce(u.approval_status,'')) = 'approved' THEN 1
                      WHEN lower(coalesce(u.approval_status,'')) = 'rejected' THEN 2 ELSE 0 END
               END,
               CASE WHEN v_sort = 'next_payment_asc' THEN u.next_payment_date::date END ASC NULLS LAST,
               CASE WHEN v_sort = 'next_payment_desc' THEN u.next_payment_date::date END DESC NULLS LAST,
               CASE WHEN v_sort = 'default' THEN u.created_at END DESC NULLS LAST,
               u.id) AS ord_n
        FROM public.users u
       WHERE (coalesce(p_view, 'members') = 'all'
              OR (p_view = 'archive' AND (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE))
              OR (coalesce(p_view, 'members') = 'members' AND NOT (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE)))
         AND (coalesce(p_approval, 'all') = 'all'
              OR (CASE WHEN lower(coalesce(u.approval_status,'')) IN ('approved','rejected') THEN lower(u.approval_status) ELSE 'pending' END) = p_approval)
         AND (coalesce(p_active, 'all') = 'all' OR (p_active = 'active' AND u.active IS TRUE) OR (p_active = 'passive' AND u.active IS NOT TRUE))
         AND (coalesce(p_role, 'all') = 'all' OR lower(coalesce(u.role, '')) = p_role)
         AND (coalesce(p_payment, 'all') = 'all' OR lower(coalesce(u.payment_status, '')) = p_payment)
         AND (v_due = 'all'
              OR (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved'
                  AND u.active IS TRUE AND lower(coalesce(u.payment_status, '')) <> 'exempt'
                  AND ((v_due = 'overdue' AND u.next_payment_date::date < v_today)
                       OR (v_due = 'due30' AND u.next_payment_date::date BETWEEN v_today AND v_today + 30)
                       OR (v_due = 'no_date' AND u.next_payment_date IS NULL))))
         AND (v_q = '' OR public.admin_search_fold(u.full_name) LIKE v_pat OR public.admin_search_fold(u.email) LIKE v_pat
              OR (p_role_match IS NOT NULL AND lower(coalesce(u.role, '')) = p_role_match))
       ORDER BY ord_n
       LIMIT v_limit OFFSET v_offset
    ) s;

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

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'counts', v_counts,
                            'limit', v_limit, 'offset', v_offset);
END;
$$;

-- ── Yetki: yalnız service_role EXECUTE ──────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, text, text, text, text, text, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, text, text, text, text, text, integer, integer, text, text)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (salt-okunur, uygulama sonrası):
--   SELECT column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns
--    WHERE table_schema='public' AND table_name IN ('users','user_payment_history')
--      AND column_name IN ('agreed_fee','billing_period','actor_admin_id');
--   SELECT conname FROM pg_constraint WHERE conname IN ('users_agreed_fee_nonneg_chk','users_billing_period_chk');
--   SELECT p.oid::regprocedure FROM pg_proc p WHERE p.proname = 'admin_list_users';   -- yalnız 11 arg
--   SELECT has_function_privilege('anon', 'public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text)', 'EXECUTE'); -- f
--   SELECT has_column_privilege('anon', 'public.users', 'agreed_fee', 'SELECT');   -- f
-- =============================================================================
