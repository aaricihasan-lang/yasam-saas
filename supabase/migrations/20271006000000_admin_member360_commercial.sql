-- =============================================================================
-- 20271006000000_admin_member360_commercial.sql
--
-- ÜYE YÖNETİMİ 360° + TİCARİ 360° — yönetim özeti, akıllı liste, fiyat dönemleri.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Önkoşullar (prod'da mevcut): 20270205000000 (usage_daily),
--    20270206000000 (usage360_measurement_start), 20271001000300 (admin_list_users 11 arg),
--    20271003200100 (admin_audit_log CHECK — 31 action).
--
-- KAPSAM (YENİ BILLING SİSTEMİ DEĞİL — ödeme gateway / kart / fatura / cron tahsilat /
-- otomatik kilit YOK; yalnız admin'in elle tuttuğu ticari kayıt):
--   1) admin_audit_log action CHECK süperseti: + 'pricing_phase_changed' (mevcut 31 aynen).
--   2) public.member_pricing_phases — uzman bazlı fiyat dönemleri (başlangıç/bitiş [dahil],
--      tutar, dönem, kısa etiket, sınırlı not). Aynı uzmanın aralıkları ÇAKIŞAMAZ: BEFORE
--      INSERT/UPDATE tetikleyicisi kullanıcı başına advisory xact lock alır, kilit ALTINDA
--      çakışma arar (READ COMMITTED'da her ifade yeni snapshot → eşzamanlı iki yazımdan
--      ikincisi birincinin commit'ini görür) → UY004. Tablo: RLS açık, policy YOK,
--      anon/authenticated/service_role DOĞRUDAN erişemez; yalnız aşağıdaki RPC'ler.
--   3) RPC'ler (SECURITY DEFINER, sabit search_path, EXECUTE yalnız service_role):
--        admin_pricing_phase_list(p_user_id)
--        admin_pricing_phase_save(actor, user, phase_id|NULL, starts_on, ends_on, amount,
--                                 billing_period, label, terms_note, expected_updated_at)
--        admin_pricing_phase_delete(actor, user, phase_id, expected_updated_at)
--      Yazım + audit AYNI transaction'da. Audit context'inde yalnız işlem türü, dönem id'si ve
--      değişen ALAN ADLARI vardır — tutar/etiket/not DEĞERİ audit'e yazılmaz.
--   4) admin_list_users — 11 argümanlı imza DROP + 15 argümanlı imza (eski 11 parametre
--      AYNEN + 4 varsayılanlı yeni parametre):
--        p_activity   : all|today|d7|d30|idle30|idle60|idle90|unmeasured (Usage360 usage_daily)
--        p_module_keys: canonical modül anahtarı + eski TR alias'ları (uygulama türetir; NULL=hepsi)
--        p_security   : all|alert (orta/yüksek güvenlik olayı olan)
--        p_today      : test determinizmi (NULL → İstanbul bugünü)
--      p_due  allowlist'i genişler (eski değerler aynen): + d0_7|d8_30|d31_60|d61_90|d90p
--      p_sort allowlist'i genişler (eski değerler aynen): + activity_desc|activity_asc|d7_desc|
--             d30_desc|created_desc|name_asc
--      rows: + last_activity, d7_active_days, d30_active_days, activity_state, days_since_activity,
--              idle_days_lower_bound, is_demo_account
--      + 'measurement' {start, today, measured_days}. counts/total/arama/sayfalama BİREBİR.
--      ESKİ KOD (11 adlı argüman) yeni fonksiyonu çağırmaya devam eder (yeni parametreler
--      varsayılanlı; eski imza kaldırıldığı için PostgREST belirsizliği YOK) → migration FIRST,
--      code SECOND güvenli.
--   5) admin_member_overview(p_today) — Yönetim Özeti / Dikkat Gerektirenler sayaçları.
--
-- KULLANIM ÖLÇÜMÜ DÜRÜSTLÜĞÜ:
--   * Aktivite = Usage360 usage_daily (gerçek etkileşim ping'i + anlamlı olay). user_sessions.
--     last_seen_at KULLANILMAZ (teknik oturum sinyali; backfill artefaktı içerir).
--   * Ölçüm başlangıcı = usage360_measurement_start() (ilk rollup günü). Öncesi hakkında TAHMİN
--     YOK: hiç aktivitesi olmayan uzmanın hareketsizliği yalnız bilinen pencere
--     (max(ölçüm başlangıcı, kayıt günü, onay günü) → bugün) kadar iddia edilir; pencere 30 günden
--     kısaysa durum 'unmeasured' (Ölçüm henüz yeterli değil).
--   * Overview: 30/60/90+ sayaçları ölçüm penceresi N günü doldurmadıysa NULL döner (UI sahte 0
--     yazmaz, "N günlük ölçüm süresi henüz tamamlanmadı" der). 7/30 gün oranları kapsamla döner.
--   * Demo hesaplar (Usage360 'noop') aktivite paydasına ve aktivite filtresine GİRMEZ.
--
-- PERFORMANS: aktivite yalnız rollup'tan; kullanıcı başına PK (user_id, day_tr, channel) üzerinde
--   LATERAL indeks taraması (son gün → LIMIT 1; son 30 gün aralığı). Ham olay tablosu OKUNMAZ.
--
-- GİZLİLİK: hiçbir danışan/not/analiz/rapor tablosu okunmaz; yalnız users, usage_daily,
--   security_events (sayım), member_pricing_phases, admin_audit_log.
--
-- IDEMPOTENT / PROVA EDİLEBİLİR: CREATE TABLE IF NOT EXISTS, pg_constraint kontrollü, DROP IF
--   EXISTS + CREATE OR REPLACE, tekrar çalıştırılabilir REVOKE/GRANT. Veri DML'i YOK.
--
-- ROLLBACK (önce kod geri alınır):
--   1) ⚠️ TEK TRANSACTION (BEGIN … COMMIT) içinde, ikisi birlikte:
--        a) 20271001000300_admin_member_commercial.sql içindeki admin_list_users (11 arg)
--           CREATE OR REPLACE bloğu + o imzanın REVOKE/GRANT satırları,
--        b) DROP FUNCTION IF EXISTS public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text,text,text[],text,date);
--      Ayrı adımlarda yapılırsa arada 11-arg ve 15-arg iki overload birlikte bulunur; eski
--      adlı-argüman çağrıları (PostgREST) bu sürede 42725 "function is not unique" alır
--      (PG17 provasında doğrulandı). Ardından NOTIFY pgrst, 'reload schema';
--   2) DROP FUNCTION IF EXISTS public.admin_member_overview(date),
--        public.admin_pricing_phase_list(uuid),
--        public.admin_pricing_phase_save(uuid,uuid,uuid,date,date,numeric,text,text,text,timestamptz),
--        public.admin_pricing_phase_delete(uuid,uuid,uuid,timestamptz),
--        public.admin_member_activity_state(date,date,date,date);
--   3) Fiyat dönemi tablosu (VERİ KAYBI — yalnız boşsa): DROP TABLE public.member_pricing_phases;
--      DROP FUNCTION public.member_pricing_phases_guard();
--   4) Audit CHECK: 20271003200100 CHECK'i yeniden uygulanmadan ÖNCE 'pricing_phase_changed'
--      satırları korunmalıdır (append-only; silinmez) → bu adım pratikte atlanır.
-- =============================================================================

BEGIN;

-- ── 1) Audit action süperseti ──────────────────────────────────────────────────
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_action_chk;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_action_chk CHECK (action IN (
  'user_created',
  'user_activated',
  'user_deactivated',
  'user_approved',
  'user_rejected',
  'password_changed_by_admin',
  'all_sessions_terminated',
  'single_session_terminated',
  'desktop_limit_changed',
  'mobile_limit_changed',
  'tablet_limit_changed',
  'total_session_limit_changed',
  'module_enabled',
  'module_disabled',
  'payment_status_changed',
  'role_changed',
  'workspace_viewed',
  'user_deleted',
  'user_archived',
  'main_admin_critical_action',
  'library_transfer_completed',
  'library_transfer_failed',
  'library_transfer_retried',
  'user_profile_updated',
  'license_settings_changed',
  'security_exempt_changed',
  'admin_web_login_pending',
  'admin_web_login_approved',
  'admin_web_login_denied',
  'admin_mobile_login_rejected',
  'own_session_terminated',
  'pricing_phase_changed'
));

-- ── 2) Fiyat dönemleri ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_pricing_phases (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  starts_on      date          NOT NULL,
  ends_on        date          NULL,
  amount         numeric(12,2) NOT NULL,
  billing_period text          NOT NULL,
  label          text          NULL,
  terms_note     text          NULL,
  created_by     uuid          NULL,
  updated_by     uuid          NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_pricing_amount_chk'
                  AND conrelid = 'public.member_pricing_phases'::regclass) THEN
    ALTER TABLE public.member_pricing_phases
      ADD CONSTRAINT member_pricing_amount_chk CHECK (amount >= 0 AND amount <= 99999999.99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_pricing_period_chk'
                  AND conrelid = 'public.member_pricing_phases'::regclass) THEN
    ALTER TABLE public.member_pricing_phases
      ADD CONSTRAINT member_pricing_period_chk
      CHECK (billing_period IN ('monthly', 'quarterly', 'semiannual', 'yearly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_pricing_range_chk'
                  AND conrelid = 'public.member_pricing_phases'::regclass) THEN
    ALTER TABLE public.member_pricing_phases
      ADD CONSTRAINT member_pricing_range_chk CHECK (ends_on IS NULL OR ends_on >= starts_on);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_pricing_label_chk'
                  AND conrelid = 'public.member_pricing_phases'::regclass) THEN
    ALTER TABLE public.member_pricing_phases
      ADD CONSTRAINT member_pricing_label_chk CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_pricing_note_chk'
                  AND conrelid = 'public.member_pricing_phases'::regclass) THEN
    ALTER TABLE public.member_pricing_phases
      ADD CONSTRAINT member_pricing_note_chk CHECK (terms_note IS NULL OR char_length(terms_note) BETWEEN 1 AND 500);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_pricing_user_start
  ON public.member_pricing_phases (user_id, starts_on);

COMMENT ON TABLE public.member_pricing_phases IS
  'Üye ticari fiyat dönemleri (admin kaydı; ödeme gateway DEĞİL). Aynı kullanıcının [starts_on, ends_on] aralıkları çakışamaz (tetikleyici + advisory lock). Yalnız admin_pricing_phase_* RPC''leri.';

-- Çakışma koruması (kilit ALTINDA). Doğrudan yazım yolu da olsa korunur (savunma derinliği).
CREATE OR REPLACE FUNCTION public.member_pricing_phases_guard()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'member_pricing_phases: kullanici degistirilemez' USING ERRCODE = 'UY003';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('member_pricing:' || NEW.user_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.member_pricing_phases p
     WHERE p.user_id = NEW.user_id
       AND p.id <> NEW.id
       AND daterange(p.starts_on, p.ends_on, '[]') && daterange(NEW.starts_on, NEW.ends_on, '[]')
  ) THEN
    RAISE EXCEPTION 'member_pricing_phases: tarih araligi baska bir donemle cakisiyor' USING ERRCODE = 'UY004';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_pricing_phases_guard ON public.member_pricing_phases;
CREATE TRIGGER trg_member_pricing_phases_guard
  BEFORE INSERT OR UPDATE ON public.member_pricing_phases
  FOR EACH ROW EXECUTE FUNCTION public.member_pricing_phases_guard();

ALTER TABLE public.member_pricing_phases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_pricing_phases FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_pricing_phases_guard() FROM PUBLIC, anon, authenticated;

-- ── 3) Fiyat dönemi RPC'leri ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_pricing_phase_list(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'amount', p.amount,
           'billing_period', p.billing_period, 'label', p.label, 'terms_note', p.terms_note,
           'created_at', p.created_at, 'updated_at', p.updated_at)
           ORDER BY p.starts_on, p.id), '[]'::jsonb)
    FROM public.member_pricing_phases p
   WHERE p.user_id = p_user_id;
$$;

-- p_phase_id NULL → yeni dönem; dolu → güncelleme (p_expected_updated_at ile bayat ekran → UY001).
-- Hata kodları: UY001 bayat · UY002 iş kuralı (hedef uzman değil) · UY003 girdi/bulunamadı ·
--               UY004 tarih aralığı çakışması.
CREATE OR REPLACE FUNCTION public.admin_pricing_phase_save(
  p_actor_admin_id      uuid,
  p_user_id             uuid,
  p_phase_id            uuid,
  p_starts_on           date,
  p_ends_on             date,
  p_amount              numeric,
  p_billing_period      text,
  p_label               text,
  p_terms_note          text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor  public.users%ROWTYPE;
  v_role   text;
  v_old    public.member_pricing_phases%ROWTYPE;
  v_new    public.member_pricing_phases%ROWTYPE;
  v_label  text := nullif(btrim(coalesce(p_label, '')), '');
  v_note   text := nullif(btrim(coalesce(p_terms_note, '')), '');
  v_fields text[] := '{}';
  v_op     text;
BEGIN
  IF p_actor_admin_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'admin_pricing_phase_save: id/aktor null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role, '')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_pricing_phase_save: yetkisiz aktor';
  END IF;

  SELECT lower(coalesce(role, '')) INTO v_role FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_pricing_phase_save: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  IF v_role <> 'expert' THEN
    RAISE EXCEPTION 'admin_pricing_phase_save: hedef uzman degil' USING ERRCODE = 'UY002';
  END IF;

  IF p_starts_on IS NULL OR p_amount IS NULL OR p_billing_period IS NULL
     OR p_amount < 0 OR p_amount > 99999999.99 OR p_amount <> round(p_amount, 2)
     OR p_billing_period NOT IN ('monthly', 'quarterly', 'semiannual', 'yearly')
     OR (p_ends_on IS NOT NULL AND p_ends_on < p_starts_on)
     OR p_starts_on < DATE '1900-01-01' OR p_starts_on > DATE '2200-12-31'
     OR (p_ends_on IS NOT NULL AND p_ends_on > DATE '2200-12-31')
     OR char_length(coalesce(v_label, '')) > 80 OR char_length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'admin_pricing_phase_save: gecersiz girdi' USING ERRCODE = 'UY003';
  END IF;

  IF p_phase_id IS NULL THEN
    v_op := 'created';
    INSERT INTO public.member_pricing_phases
      (user_id, starts_on, ends_on, amount, billing_period, label, terms_note, created_by, updated_by)
    VALUES
      (p_user_id, p_starts_on, p_ends_on, p_amount, p_billing_period, v_label, v_note,
       p_actor_admin_id, p_actor_admin_id)
    RETURNING * INTO v_new;
    v_fields := ARRAY['starts_on', 'ends_on', 'amount', 'billing_period', 'label', 'terms_note'];
  ELSE
    v_op := 'updated';
    SELECT * INTO v_old FROM public.member_pricing_phases
     WHERE id = p_phase_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'admin_pricing_phase_save: donem bulunamadi' USING ERRCODE = 'UY003';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'admin_pricing_phase_save: donem baska bir islemle degismis' USING ERRCODE = 'UY001';
    END IF;
    IF v_old.starts_on IS DISTINCT FROM p_starts_on THEN v_fields := array_append(v_fields, 'starts_on'); END IF;
    IF v_old.ends_on IS DISTINCT FROM p_ends_on THEN v_fields := array_append(v_fields, 'ends_on'); END IF;
    IF v_old.amount IS DISTINCT FROM p_amount THEN v_fields := array_append(v_fields, 'amount'); END IF;
    IF v_old.billing_period IS DISTINCT FROM p_billing_period THEN v_fields := array_append(v_fields, 'billing_period'); END IF;
    IF v_old.label IS DISTINCT FROM v_label THEN v_fields := array_append(v_fields, 'label'); END IF;
    IF v_old.terms_note IS DISTINCT FROM v_note THEN v_fields := array_append(v_fields, 'terms_note'); END IF;
    IF coalesce(array_length(v_fields, 1), 0) = 0 THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'phase', to_jsonb(v_old) - 'user_id' - 'created_by' - 'updated_by');
    END IF;
    UPDATE public.member_pricing_phases
       SET starts_on = p_starts_on, ends_on = p_ends_on, amount = p_amount,
           billing_period = p_billing_period, label = v_label, terms_note = v_note,
           updated_by = p_actor_admin_id
     WHERE id = p_phase_id
    RETURNING * INTO v_new;
  END IF;

  -- Audit: yalnız işlem türü + dönem id + değişen ALAN ADLARI (tutar/etiket/not DEĞERİ YOK).
  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
  VALUES
    (p_actor_admin_id, coalesce(v_actor.is_super_admin, false), p_user_id, 'pricing_phase_changed',
     jsonb_build_object('op', v_op, 'phase_id', v_new.id, 'fields', to_jsonb(v_fields)));

  RETURN jsonb_build_object('ok', true, 'changed', true, 'op', v_op, 'fields', to_jsonb(v_fields),
                            'phase', to_jsonb(v_new) - 'user_id' - 'created_by' - 'updated_by');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pricing_phase_delete(
  p_actor_admin_id      uuid,
  p_user_id             uuid,
  p_phase_id            uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_old   public.member_pricing_phases%ROWTYPE;
BEGIN
  IF p_actor_admin_id IS NULL OR p_user_id IS NULL OR p_phase_id IS NULL THEN
    RAISE EXCEPTION 'admin_pricing_phase_delete: id/aktor null' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role, '')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_pricing_phase_delete: yetkisiz aktor';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('member_pricing:' || p_user_id::text, 0));
  SELECT * INTO v_old FROM public.member_pricing_phases
   WHERE id = p_phase_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_pricing_phase_delete: donem bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'admin_pricing_phase_delete: donem baska bir islemle degismis' USING ERRCODE = 'UY001';
  END IF;
  DELETE FROM public.member_pricing_phases WHERE id = p_phase_id;
  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
  VALUES
    (p_actor_admin_id, coalesce(v_actor.is_super_admin, false), p_user_id, 'pricing_phase_changed',
     jsonb_build_object('op', 'deleted', 'phase_id', p_phase_id, 'fields', '[]'::jsonb));
  RETURN jsonb_build_object('ok', true, 'deleted', true);
END;
$$;

-- ── 4) Aktivite durumu (tek tanım; liste + özet aynı kuralı kullanır) ──────────────
-- p_last_day     : son gerçek aktivite TR günü (usage_daily) — NULL = ölçüm içinde hiç yok
-- p_window_start : hareketsizlik iddia edilebilecek ilk gün = max(ölçüm başlangıcı, kayıt, onay)
-- Dönüş: today|d7|d30|idle30|idle60|idle90|unmeasured
CREATE OR REPLACE FUNCTION public.admin_member_activity_state(
  p_today date, p_mstart date, p_last_day date, p_window_start date
)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_last_day IS NOT NULL THEN
      CASE WHEN p_today - p_last_day <= 0  THEN 'today'
           WHEN p_today - p_last_day <= 6  THEN 'd7'
           WHEN p_today - p_last_day <= 29 THEN 'd30'
           WHEN p_today - p_last_day <= 59 THEN 'idle30'
           WHEN p_today - p_last_day <= 89 THEN 'idle60'
           ELSE 'idle90' END
    WHEN p_mstart IS NULL OR p_window_start IS NULL THEN 'unmeasured'
    WHEN p_today - p_window_start + 1 >= 90 THEN 'idle90'
    WHEN p_today - p_window_start + 1 >= 60 THEN 'idle60'
    WHEN p_today - p_window_start + 1 >= 30 THEN 'idle30'
    ELSE 'unmeasured'
  END;
$$;

-- ── 5) admin_list_users: aktivite + ödeme kovaları + modül + güvenlik + yeni sıralamalar ──
DROP FUNCTION IF EXISTS public.admin_list_users(text, text, text, text, text, text, text, integer, integer, text, text);

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
       AND (coalesce(p_active, 'all') = 'all' OR (p_active = 'active' AND u.active IS TRUE) OR (p_active = 'passive' AND u.active IS NOT TRUE))
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

-- ── 6) Yönetim Özeti ───────────────────────────────────────────────────────────
-- Payda: demo olmayan + role=expert + approved + active uzmanlar.
-- idle30/60/90: ölçüm penceresi N günü doldurmadıysa NULL (sahte 0 YOK).
-- Ödeme sayaçları: mevcut yenileme uygunluğu (onaylı + aktif + muaf olmayan uzman) — liste p_due ile aynı küme.
-- Güvenlik: orta/yüksek olayı olan, arşiv DIŞI kullanıcılar (liste "Üyeler" görünümü + p_security=alert ile aynı küme).
CREATE OR REPLACE FUNCTION public.admin_member_overview(p_today date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_today  date := coalesce(p_today, (now() AT TIME ZONE 'Europe/Istanbul')::date);
  v_mstart date := public.usage360_measurement_start();
  v_days   integer;
  v_out    jsonb;
BEGIN
  v_days := CASE WHEN v_mstart IS NULL THEN NULL ELSE GREATEST(0, v_today - v_mstart + 1) END;

  WITH denom AS (
    SELECT u.id, u.created_at, u.approved_at
      FROM public.users u
     WHERE lower(coalesce(u.role, '')) = 'expert'
       AND lower(coalesce(u.approval_status, '')) = 'approved'
       AND u.active IS TRUE
       AND coalesce(u.is_demo_account, false) = false
  ),
  st AS (
    SELECT d.id,
           public.admin_member_activity_state(
             v_today, v_mstart, la.day_tr,
             GREATEST(v_mstart, (d.created_at AT TIME ZONE 'Europe/Istanbul')::date,
                      (coalesce(d.approved_at, d.created_at) AT TIME ZONE 'Europe/Istanbul')::date)) AS state
      FROM denom d
      LEFT JOIN LATERAL (
        SELECT x.day_tr FROM public.usage_daily x
         WHERE x.user_id = d.id AND x.day_tr <= v_today
         ORDER BY x.day_tr DESC LIMIT 1
      ) la ON true
  ),
  pay AS (
    SELECT u.next_payment_date::date AS npd
      FROM public.users u
     WHERE lower(coalesce(u.role, '')) = 'expert'
       AND lower(coalesce(u.approval_status, '')) = 'approved'
       AND u.active IS TRUE
       AND lower(coalesce(u.payment_status, '')) <> 'exempt'
  )
  SELECT jsonb_build_object(
    'today', v_today,
    'measurement', jsonb_build_object('start', v_mstart, 'measured_days', v_days),
    'denominator', (SELECT count(*) FROM denom),
    'active7',  CASE WHEN v_mstart IS NULL THEN NULL
                     ELSE (SELECT count(*) FROM st WHERE state IN ('today', 'd7')) END,
    'active30', CASE WHEN v_mstart IS NULL THEN NULL
                     ELSE (SELECT count(*) FROM st WHERE state IN ('today', 'd7', 'd30')) END,
    'coverage7',  CASE WHEN v_mstart IS NULL THEN 'none' WHEN v_days >= 7  THEN 'full' ELSE 'partial' END,
    'coverage30', CASE WHEN v_mstart IS NULL THEN 'none' WHEN v_days >= 30 THEN 'full' ELSE 'partial' END,
    'idle30', CASE WHEN v_days >= 30 THEN (SELECT count(*) FROM st WHERE state IN ('idle30', 'idle60', 'idle90')) END,
    'idle60', CASE WHEN v_days >= 60 THEN (SELECT count(*) FROM st WHERE state IN ('idle60', 'idle90')) END,
    'idle90', CASE WHEN v_days >= 90 THEN (SELECT count(*) FROM st WHERE state = 'idle90') END,
    'unmeasured', CASE WHEN v_mstart IS NULL THEN NULL ELSE (SELECT count(*) FROM st WHERE state = 'unmeasured') END,
    'payment_overdue', (SELECT count(*) FROM pay WHERE npd < v_today),
    'payment_due7',    (SELECT count(*) FROM pay WHERE npd BETWEEN v_today AND v_today + 7),
    'payment_due30',   (SELECT count(*) FROM pay WHERE npd BETWEEN v_today AND v_today + 30),
    'pending', (SELECT count(*) FROM public.users u
                 WHERE lower(coalesce(u.role, '')) = 'expert'
                   AND lower(coalesce(u.approval_status, '')) NOT IN ('approved', 'rejected')),
    'security_alerts', (SELECT count(*) FROM public.users u
                         WHERE NOT (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE)
                           AND EXISTS (SELECT 1 FROM public.security_events se
                                        WHERE se.user_id = u.id AND se.severity IN ('medium', 'high')))
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- ── 7) Yetkiler: yalnız service_role EXECUTE ───────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_member_activity_state(date, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_member_activity_state(date, date, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, text, text, text, text, text, integer, integer, text, text, text, text[], text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, text, text, text, text, text, integer, integer, text, text, text, text[], text, date)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_member_overview(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_member_overview(date) TO service_role;

REVOKE ALL ON FUNCTION public.admin_pricing_phase_list(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pricing_phase_list(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_pricing_phase_save(uuid, uuid, uuid, date, date, numeric, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pricing_phase_save(uuid, uuid, uuid, date, date, numeric, text, text, text, timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_pricing_phase_delete(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pricing_phase_delete(uuid, uuid, uuid, timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (salt-okunur, uygulama sonrası):
--   SELECT p.oid::regprocedure FROM pg_proc p WHERE p.proname = 'admin_list_users';          -- yalnız 15 arg
--   SELECT has_function_privilege('anon', 'public.admin_member_overview(date)', 'EXECUTE');    -- f
--   SELECT has_table_privilege('authenticated', 'public.member_pricing_phases', 'SELECT');   -- f
--   SELECT has_table_privilege('service_role', 'public.member_pricing_phases', 'SELECT');    -- f (yalnız RPC)
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.member_pricing_phases'::regclass; -- t
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'admin_audit_action_chk'; -- pricing_phase_changed
--   SELECT public.admin_member_overview();                                                      -- jsonb
-- =============================================================================
