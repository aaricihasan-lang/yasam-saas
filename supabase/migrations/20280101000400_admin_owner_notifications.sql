-- =============================================================================
-- ADMIN ÜYE YÖNETİMİ V2 · AŞAMA 1 — OWNER BİLDİRİM ZİLİ (Owner onayı 2026-11-07)
-- =============================================================================
-- Owner'a özel, yalnız uygulama içi bildirimler. E-posta / SMS / WhatsApp / ücretli servis YOK.
--
-- İki sınıf:
--   action (Karar bekleyen) — yalnız kaynak işlem sonuçlanınca kapanır; "okundu" onu KAPATMAZ:
--     basvuru     : uzman başvurusu yönetici onayı bekliyor (approval_status pending/boş)
--     pro_talebi  : açık Pro üyelik talebi (pro_upgrade_requests.status='open')
--     inceleme    : 7 günlük deneme hesabı incelemede (trial_status='review')
--     eski_kayit  : onaylı + aktif ama paketi Premium olmayan eski kayıt (H2)
--     odeme       : yöneticinin AÇIKÇA "Gecikti" işaretlediği ödeme (payment_status='overdue').
--                   Yalnız sonraki ödeme tarihinin geçmesi borç SAYILMAZ → bildirim üretmez.
--   info (Bilgi) — okununca okunmuş olur:
--     deneme_basladi : uzmanın 7 günlük denemesi ilk girişte başladı (her uzman için ayrı)
--     deneme_bitti   : 7 günlük deneme süresi doldu
--
-- Kaynak = mevcut kayıtlar. Her olay mevcut verilerden YENİDEN TÜRETİLEBİLİR:
--   · Ertelenmiş (DEFERRABLE INITIALLY DEFERRED) satır tetikleyicileri users ve pro_upgrade_requests
--     değişikliklerinde, AYNI transaction'ın commit anında admin_notifications_sync_user çağırır.
--     Tetikleyici hatayı YUTAR (RAISE WARNING) → kayıt / giriş / onay ASLA bildirim yüzünden düşmez.
--   · admin_notifications_reconcile() kaçan / zamana bağlı olayları (deneme bitişi) tamamlar ve artık
--     geçerli olmayan açık kararları kapatır. Owner bildirimleri okurken en fazla 20 sn'de bir çalışır.
-- Tekillik (DB otoritesi): event_key UNIQUE + aynı tür/üye için tek AÇIK karar (kısmi UNIQUE index);
-- tüm eklemeler ON CONFLICT DO NOTHING, tüm kapatmalar WHERE resolved_at IS NULL → idempotent.
--
-- Geçmiş: bilgi bildirimleri yalnız bu migration ANINDAN (admin_notification_settings.info_since)
-- sonraki olaylar için üretilir (geçmiş denemeler toplu oluşturulmaz). Açık kararlar ise ilk
-- uzlaştırmada eksiksiz oluşturulur (occurred_at = kaynak kaydın zamanı).
--
-- Kişisel veri: tablolarda ad / e-posta / danışan / analiz / sağlık verisi YOK; yalnız üye kimliği ve
-- olay zamanı (bunlar da kişisel veriyle ilişkilendirilebilir). Ad/e-posta okuma anında users'tan
-- birleştirilir. Kalıcı silmede target_user_id ON DELETE SET NULL. Saklama süresi bu migration'da
-- TANIMLANMAZ (Owner kararı bekliyor; otomatik imha yok).
--
-- Erişim: üç tabloda RLS açık, politika yok; anon / authenticated / service_role doğrudan erişemez.
-- Okuma/işaretleme yalnız SECURITY DEFINER fonksiyonlar ile; aktör DB'de yeniden doğrulanır:
-- role='admin' ∧ active ∧ is_super_admin (Owner). Fonksiyonları yalnız service_role çalıştırır.
-- Mevcut tablolarda tek değişiklik: users ve pro_upgrade_requests'e AFTER (ertelenmiş) tetikleyici.
-- Hiçbir mevcut satır değiştirilmez.
-- =============================================================================
BEGIN;

-- ─── 1) Tablolar ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_notification_settings (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  info_since         timestamptz NOT NULL DEFAULT now(),
  last_reconciled_at timestamptz
);
INSERT INTO public.admin_notification_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key      text NOT NULL CHECK (length(event_key) BETWEEN 3 AND 200),
  kind           text NOT NULL CHECK (kind IN ('info','action')),
  type           text NOT NULL CHECK (type IN ('basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti')),
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  resolved_by    uuid,
  resolution     text CHECK (resolution IS NULL OR resolution IN (
                   'deneme_onaylandi','pro_onaylandi','reddedildi','pro_gecirildi','talep_kapatildi',
                   'inceleme_kaldirildi','deneme_durduruldu','pasife_alindi','odeme_durumu_guncellendi',
                   'kayit_silindi','kapandi')),
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT admin_notifications_event_key_uq UNIQUE (event_key),
  CONSTRAINT admin_notifications_info_never_resolved CHECK (kind = 'action' OR (resolved_at IS NULL AND resolution IS NULL)),
  CONSTRAINT admin_notifications_kind_type CHECK (
    (kind = 'info' AND type IN ('deneme_basladi','deneme_bitti')) OR
    (kind = 'action' AND type IN ('basvuru','pro_talebi','inceleme','eski_kayit','odeme')))
);
-- Aynı tür + aynı üye için en fazla TEK açık karar (eşzamanlı tetikleyici + uzlaştırma güvencesi).
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_one_open_action_uidx
  ON public.admin_notifications (type, target_user_id) WHERE kind = 'action' AND resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS admin_notifications_occurred_idx ON public.admin_notifications (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_open_idx ON public.admin_notifications (kind, resolved_at);
CREATE INDEX IF NOT EXISTS admin_notifications_target_idx ON public.admin_notifications (target_user_id);

CREATE TABLE IF NOT EXISTS public.admin_notification_reads (
  notification_id bigint NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  admin_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, admin_id)
);

ALTER TABLE public.admin_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_reads    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_notification_settings, public.admin_notifications, public.admin_notification_reads
  FROM PUBLIC, anon, authenticated, service_role;

-- ─── 2) Owner doğrulaması ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_notif_assert_owner(p_actor uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users
        WHERE id = p_actor AND lower(coalesce(role,'')) = 'admin' AND active IS TRUE
          AND coalesce(is_super_admin, false) IS TRUE) THEN
    RAISE EXCEPTION 'admin_notifications: yalniz owner' USING ERRCODE = 'AN401';
  END IF;
END;
$$;

-- ─── 3) Tek üye için olayları türet (idempotent) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_notifications_sync_user(p_user_id uuid, p_source text DEFAULT 'trigger')
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  u        public.users%ROWTYPE;
  v_since  timestamptz;
  v_role   text;
  v_appr   text;
  v_demo   boolean;
  v_pkg    text;
  v_phase  text;
  v_actor  uuid;
  v_want   boolean;
  v_type   text;
  v_res    text;
  v_occ    timestamptz;
  r        record;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  SELECT info_since INTO v_since FROM public.admin_notification_settings WHERE id;
  SELECT * INTO u FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    UPDATE public.admin_notifications SET resolved_at = now(), resolution = 'kayit_silindi'
     WHERE target_user_id = p_user_id AND kind = 'action' AND resolved_at IS NULL;
    RETURN;
  END IF;

  v_role  := lower(coalesce(u.role, ''));
  v_appr  := lower(coalesce(u.approval_status, ''));
  v_demo  := coalesce(u.is_demo_account, false);
  -- Paket türü: uygulama katmanıyla AYNI kural (package_type, yoksa plan) — H2 onarım RPC'siyle aynı.
  v_pkg   := lower(btrim(coalesce(nullif(btrim(u.package_type), ''), nullif(btrim(u.plan), ''), '')));
  v_phase := public.trial_phase_of(u.trial_kind, u.trial_status, u.package_type, u.trial_ends_at);
  -- Kararı veren yönetici: aynı transaction'da yazılan son audit satırı (ertelenmiş tetikleyici commit
  -- anında çalıştığı için RPC'nin audit kaydı görünür). Bulunamazsa NULL.
  SELECT actor_admin_id INTO v_actor FROM public.admin_audit_log
   WHERE target_user_id = p_user_id AND created_at = now()
   ORDER BY id DESC LIMIT 1;

  -- 3a) Karar bekleyenler (pro_talebi hariç)
  FOREACH v_type IN ARRAY ARRAY['basvuru','inceleme','eski_kayit','odeme'] LOOP
    v_want := v_role = 'expert' AND NOT v_demo AND CASE v_type
      WHEN 'basvuru'    THEN v_appr IN ('', 'pending')
      WHEN 'inceleme'   THEN v_phase = 'review'
      WHEN 'eski_kayit' THEN v_appr = 'approved' AND u.active IS TRUE AND u.trial_kind IS NULL AND v_pkg <> 'premium'
      WHEN 'odeme'      THEN v_appr = 'approved' AND u.active IS TRUE AND lower(coalesce(u.payment_status, '')) = 'overdue'
    END;
    IF v_want THEN
      v_occ := CASE v_type WHEN 'basvuru' THEN coalesce(u.created_at, now()) ELSE now() END;
      INSERT INTO public.admin_notifications (event_key, kind, type, target_user_id, occurred_at, payload)
      SELECT v_type || ':' || p_user_id || ':' || (count(*) + 1), 'action', v_type, p_user_id, v_occ,
             jsonb_build_object('source', p_source)
        FROM public.admin_notifications
       WHERE type = v_type AND target_user_id = p_user_id
      HAVING NOT bool_or(resolved_at IS NULL) OR count(*) = 0
      ON CONFLICT DO NOTHING;
    ELSE
      v_res := CASE v_type
        WHEN 'basvuru' THEN CASE WHEN v_appr = 'rejected' THEN 'reddedildi'
                                 WHEN u.trial_kind IS NOT NULL THEN 'deneme_onaylandi'
                                 WHEN v_pkg = 'premium' THEN 'pro_onaylandi' ELSE 'kapandi' END
        WHEN 'inceleme' THEN CASE WHEN v_phase = 'suspended' THEN 'deneme_durduruldu'
                                  WHEN v_phase = 'converted' THEN 'pro_gecirildi' ELSE 'inceleme_kaldirildi' END
        WHEN 'eski_kayit' THEN CASE WHEN v_pkg = 'premium' THEN 'pro_gecirildi'
                                    WHEN u.active IS NOT TRUE THEN 'pasife_alindi' ELSE 'kapandi' END
        WHEN 'odeme' THEN CASE WHEN u.active IS NOT TRUE THEN 'pasife_alindi' ELSE 'odeme_durumu_guncellendi' END
      END;
      UPDATE public.admin_notifications
         SET resolved_at = now(), resolution = v_res, resolved_by = v_actor
       WHERE type = v_type AND target_user_id = p_user_id AND kind = 'action' AND resolved_at IS NULL;
    END IF;
  END LOOP;

  -- 3b) Pro talepleri (talep başına tek kayıt)
  FOR r IN SELECT id, created_at FROM public.pro_upgrade_requests WHERE user_id = p_user_id AND status = 'open' LOOP
    INSERT INTO public.admin_notifications (event_key, kind, type, target_user_id, occurred_at, payload)
    VALUES ('pro_talebi:' || r.id, 'action', 'pro_talebi', p_user_id, r.created_at,
            jsonb_build_object('request_id', r.id, 'source', p_source))
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR r IN SELECT n.id, q.close_reason, q.closed_by, q.status
             FROM public.admin_notifications n
             LEFT JOIN public.pro_upgrade_requests q ON q.id::text = n.payload->>'request_id'
            WHERE n.type = 'pro_talebi' AND n.target_user_id = p_user_id AND n.resolved_at IS NULL LOOP
    IF r.status IS DISTINCT FROM 'open' THEN
      UPDATE public.admin_notifications
         SET resolved_at = now(),
             resolution = CASE r.close_reason WHEN 'converted' THEN 'pro_gecirildi' WHEN 'dismissed' THEN 'talep_kapatildi'
                                              ELSE CASE WHEN r.status IS NULL THEN 'kayit_silindi' ELSE 'kapandi' END END,
             resolved_by = coalesce(r.closed_by, v_actor)
       WHERE id = r.id AND resolved_at IS NULL;
    END IF;
  END LOOP;

  -- 3c) Bilgi (yalnız info_since SONRASI olaylar; geçmiş denemeler toplu oluşturulmaz)
  IF u.trial_kind IS NOT NULL AND u.trial_started_at IS NOT NULL AND u.trial_started_at >= v_since THEN
    INSERT INTO public.admin_notifications (event_key, kind, type, target_user_id, occurred_at)
    VALUES ('deneme_basladi:' || p_user_id || ':' || floor(extract(epoch FROM u.trial_started_at))::bigint,
            'info', 'deneme_basladi', p_user_id, u.trial_started_at)
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_phase = 'expired' AND u.trial_ends_at >= v_since THEN
    INSERT INTO public.admin_notifications (event_key, kind, type, target_user_id, occurred_at)
    VALUES ('deneme_bitti:' || p_user_id || ':' || floor(extract(epoch FROM u.trial_ends_at))::bigint,
            'info', 'deneme_bitti', p_user_id, u.trial_ends_at)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ─── 4) Ertelenmiş tetikleyiciler (hata YUTULUR; kaynak işlem asla düşmez) ───
CREATE OR REPLACE FUNCTION public.admin_notif_users_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  BEGIN
    PERFORM public.admin_notifications_sync_user(NEW.id, 'trigger');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_notifications (users) atlandi: [%] %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_notif_pro_requests_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  BEGIN
    PERFORM public.admin_notifications_sync_user(NEW.user_id, 'trigger');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_notifications (pro_upgrade_requests) atlandi: [%] %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS admin_notif_users_aiu ON public.users;
CREATE CONSTRAINT TRIGGER admin_notif_users_aiu
  AFTER INSERT OR UPDATE OF approval_status, active, role, is_demo_account, package_type, plan,
                            trial_kind, trial_status, trial_started_at, trial_ends_at, payment_status
  ON public.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.admin_notif_users_trg();

DROP TRIGGER IF EXISTS admin_notif_pro_requests_aiu ON public.pro_upgrade_requests;
CREATE CONSTRAINT TRIGGER admin_notif_pro_requests_aiu
  AFTER INSERT OR UPDATE OF status
  ON public.pro_upgrade_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.admin_notif_pro_requests_trg();

-- ─── 5) Uzlaştırma (kaçan / zamana bağlı olaylar; tek koşucu) ─────────────────
CREATE OR REPLACE FUNCTION public.admin_notifications_reconcile()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_since timestamptz;
  v_uid   uuid;
  v_n     integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('admin_notifications_reconcile')) THEN
    RETURN -1;  -- başka bir uzlaştırma çalışıyor
  END IF;
  SELECT info_since INTO v_since FROM public.admin_notification_settings WHERE id;
  FOR v_uid IN
    SELECT id FROM public.users
     WHERE lower(coalesce(role, '')) = 'expert' AND NOT coalesce(is_demo_account, false)
       AND (lower(coalesce(approval_status, '')) IN ('', 'pending')
            OR trial_status = 'review'
            OR lower(coalesce(payment_status, '')) = 'overdue'
            OR (trial_kind IS NOT NULL AND (trial_started_at >= v_since OR trial_ends_at >= v_since))
            OR (lower(coalesce(approval_status, '')) = 'approved' AND active IS TRUE AND trial_kind IS NULL
                AND lower(btrim(coalesce(nullif(btrim(package_type), ''), nullif(btrim(plan), ''), ''))) <> 'premium'))
    UNION
    SELECT target_user_id FROM public.admin_notifications
     WHERE kind = 'action' AND resolved_at IS NULL AND target_user_id IS NOT NULL
    UNION
    SELECT user_id FROM public.pro_upgrade_requests WHERE status = 'open'
  LOOP
    BEGIN
      PERFORM public.admin_notifications_sync_user(v_uid, 'reconcile');
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'admin_notifications_reconcile: % atlandi [%] %', v_uid, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  -- Kalıcı silinmiş üyelerin açık kararları
  UPDATE public.admin_notifications SET resolved_at = now(), resolution = 'kayit_silindi'
   WHERE kind = 'action' AND resolved_at IS NULL AND target_user_id IS NULL;
  UPDATE public.admin_notification_settings SET last_reconciled_at = now() WHERE id;
  RETURN v_n;
END;
$$;

-- ─── 6) Owner okuma / işaretleme ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_notification_feed(p_actor uuid, p_info_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_last  timestamptz;
  v_limit integer := least(greatest(coalesce(p_info_limit, 30), 1), 100);
BEGIN
  PERFORM public.admin_notif_assert_owner(p_actor);
  SELECT last_reconciled_at INTO v_last FROM public.admin_notification_settings WHERE id;
  IF v_last IS NULL OR v_last < now() - interval '20 seconds' THEN
    PERFORM public.admin_notifications_reconcile();
  END IF;
  RETURN jsonb_build_object(
    'actions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id, 'type', n.type, 'target_user_id', n.target_user_id,
               'full_name', coalesce(nullif(btrim(u.full_name), ''), u.email), 'email', u.email,
               'occurred_at', n.occurred_at) ORDER BY n.occurred_at DESC, n.id DESC)
        FROM public.admin_notifications n LEFT JOIN public.users u ON u.id = n.target_user_id
       WHERE n.kind = 'action' AND n.resolved_at IS NULL), '[]'::jsonb),
    'infos', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'occurred_at')::timestamptz DESC, (x->>'id')::bigint DESC)
        FROM (SELECT jsonb_build_object(
                       'id', n.id, 'type', n.type, 'target_user_id', n.target_user_id,
                       'full_name', coalesce(nullif(btrim(u.full_name), ''), u.email), 'email', u.email,
                       'occurred_at', n.occurred_at,
                       'read', EXISTS (SELECT 1 FROM public.admin_notification_reads r
                                        WHERE r.notification_id = n.id AND r.admin_id = p_actor)) AS x
                FROM public.admin_notifications n LEFT JOIN public.users u ON u.id = n.target_user_id
               WHERE n.kind = 'info'
               ORDER BY n.occurred_at DESC, n.id DESC
               LIMIT v_limit) s), '[]'::jsonb),
    'counts', jsonb_build_object(
      'action', (SELECT count(*) FROM public.admin_notifications WHERE kind = 'action' AND resolved_at IS NULL),
      'unread_info', (SELECT count(*) FROM public.admin_notifications n
                       WHERE n.kind = 'info'
                         AND NOT EXISTS (SELECT 1 FROM public.admin_notification_reads r
                                          WHERE r.notification_id = n.id AND r.admin_id = p_actor))),
    'server_now', now());
END;
$$;

-- Yalnız BİLGİ bildirimleri okunmuş işaretlenir; karar bekleyenler bu yolla asla kapanmaz.
CREATE OR REPLACE FUNCTION public.admin_notification_mark_read(p_actor uuid, p_ids bigint[], p_all_info boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_n integer;
BEGIN
  PERFORM public.admin_notif_assert_owner(p_actor);
  IF coalesce(array_length(p_ids, 1), 0) > 500 THEN
    RAISE EXCEPTION 'admin_notification_mark_read: en fazla 500 kayit' USING ERRCODE = 'AN400';
  END IF;
  INSERT INTO public.admin_notification_reads (notification_id, admin_id)
  SELECT n.id, p_actor FROM public.admin_notifications n
   WHERE n.kind = 'info' AND (coalesce(p_all_info, false) OR n.id = ANY (coalesce(p_ids, '{}'::bigint[])))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Tüm bildirimler: arama (ad / e-posta), tür, durum, tarih aralığı, sayfalama.
-- p_status: all | open | resolved | unread | read
CREATE OR REPLACE FUNCTION public.admin_notification_history(
  p_actor uuid, p_q text, p_type text, p_status text, p_from timestamptz, p_to timestamptz,
  p_limit integer, p_offset integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_q      text := nullif(lower(btrim(coalesce(p_q, ''))), '');
  v_type   text := coalesce(nullif(p_type, ''), 'all');
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    jsonb;
BEGIN
  PERFORM public.admin_notif_assert_owner(p_actor);
  IF v_type NOT IN ('all','basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti')
     OR v_status NOT IN ('all','open','resolved','unread','read') THEN
    RAISE EXCEPTION 'admin_notification_history: gecersiz filtre' USING ERRCODE = 'AN400';
  END IF;
  IF v_q IS NOT NULL THEN
    v_q := replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_');
  END IF;
  WITH base AS (
    SELECT n.*, coalesce(nullif(btrim(u.full_name), ''), u.email) AS full_name, u.email,
           EXISTS (SELECT 1 FROM public.admin_notification_reads r WHERE r.notification_id = n.id AND r.admin_id = p_actor) AS is_read
      FROM public.admin_notifications n LEFT JOIN public.users u ON u.id = n.target_user_id
     WHERE (v_type = 'all' OR n.type = v_type)
       AND (p_from IS NULL OR n.occurred_at >= p_from)
       AND (p_to IS NULL OR n.occurred_at < p_to)
       AND (v_q IS NULL OR lower(coalesce(u.full_name, '')) LIKE '%' || v_q || '%' ESCAPE '\'
                        OR lower(coalesce(u.email, '')) LIKE '%' || v_q || '%' ESCAPE '\')
  ), filtered AS (
    SELECT * FROM base
     WHERE CASE v_status
             WHEN 'open'     THEN kind = 'action' AND resolved_at IS NULL
             WHEN 'resolved' THEN kind = 'action' AND resolved_at IS NOT NULL
             WHEN 'unread'   THEN kind = 'info' AND NOT is_read
             WHEN 'read'     THEN kind = 'info' AND is_read
             ELSE true END
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', f.id, 'kind', f.kind, 'type', f.type, 'target_user_id', f.target_user_id,
               'full_name', f.full_name, 'email', f.email, 'occurred_at', f.occurred_at,
               'resolved_at', f.resolved_at, 'resolution', f.resolution, 'read', f.is_read)
               ORDER BY f.occurred_at DESC, f.id DESC)
               FROM (SELECT * FROM filtered ORDER BY occurred_at DESC, id DESC LIMIT v_limit OFFSET v_offset) f), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered))
  INTO v_out;
  RETURN v_out;
END;
$$;

-- ─── 7) Yetkiler ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_notif_assert_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_notifications_sync_user(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_notif_users_trg() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_notif_pro_requests_trg() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_notifications_reconcile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_notification_feed(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_notification_mark_read(uuid, bigint[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_notification_history(uuid, text, text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notif_assert_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_notifications_reconcile() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_notification_feed(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_notification_mark_read(uuid, bigint[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_notification_history(uuid, text, text, text, timestamptz, timestamptz, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
