-- =============================================================================
-- TRIAL7 — 7 günlük ücretsiz deneme üyeliği (Owner kararı 2026-11-06)
-- =============================================================================
-- Kapsam (YALNIZ ekleme; mevcut satır DEĞİŞMEZ):
--   1) users: trial_kind / trial_status kolonları (NULL = deneme rejimi DIŞI → mevcut Premium, admin,
--      demo, eski deneme ve onay bekleyen hesaplar HİÇ etkilenmez; backfill YOK).
--   2) Deneme modül kapısı (DB savunma katmanı): deneme paketindeki uzmanın module_permissions'ında
--      allowlist DIŞI anahtar (Dijital İçerik + tüm alt modülleri, Kişisel Arşiv, Belge Çeviri, Video,
--      Ders Notu, Yaşam Hafızası, alt yetkiler, gelecekte eklenecek her anahtar) true OLAMAZ (fail-closed).
--   3) trial_profiles (kayıt risk sinyali + kişiye özel kredi limiti), trial_claims (tek deneme hakkı;
--      HMAC'lı kanonik e-posta — ham e-posta yok), trial_credit_ledger (günlük Roxy kredi defteri),
--      pro_upgrade_requests (uygulama içi Pro talebi; uzman başına tek açık talep), trial_admin_events.
--   4) RPC'ler: trial_register_expert, trial_activate_on_login, trial_credit_reserve/settle/usage,
--      trial_pro_request_create, admin_trial_list, admin_trial_set_limits, admin_trial_set_state,
--      admin_trial_convert_to_pro, admin_pro_request_close.
-- Süre UZATMA fonksiyonu YOKTUR (Owner kararı): trial_started_at/trial_ends_at yalnız
-- trial_activate_on_login içinde, yalnız trial_started_at NULL iken BİR KEZ yazılır.
-- Sistem geneli Roxy bütçesi YOKTUR (Owner kararı): limit yalnız kişi başıdır.
-- Uygulama sırası: bu migration KODDAN ÖNCE uygulanır (kod yeni kolonları SELECT eder).
-- =============================================================================
BEGIN;

-- ─── 1) users kolonları ───────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_kind text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_status text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_trial_kind_chk') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_trial_kind_chk
      CHECK (trial_kind IS NULL OR trial_kind = 'self_7d');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_trial_status_chk') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_trial_status_chk
      CHECK (trial_status IS NULL OR trial_status IN ('not_started','active','review','suspended','converted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_trial_state_chk') THEN
    -- trial_kind ⇔ trial_status birlikte; 'active' ise pencere (başlangıç + bitiş) dolu olmalı.
    ALTER TABLE public.users ADD CONSTRAINT users_trial_state_chk
      CHECK (
        (trial_kind IS NULL AND trial_status IS NULL)
        OR (trial_kind IS NOT NULL AND trial_status IS NOT NULL
            AND (trial_status <> 'active' OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL)))
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_trial_kind_idx
  ON public.users (trial_status, trial_ends_at) WHERE trial_kind IS NOT NULL;

-- ─── 2) Deneme modül allowlist'i (TS: lib/trial/trialCore.ts TRIAL_ALLOWED_PERMISSION_KEYS ile AYNI) ──
CREATE OR REPLACE FUNCTION public.trial_allowed_module_keys()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT ARRAY[
    'clients','danisan_yonetimi','appointments','ajanda','numerology','numeroloji',
    'stones','dogaltas','stok','stock','sifa_rehberi','healing','energy_body','biyoenerji',
    'reflexology','refleksoloji','aromatherapy','aromaterapi','cosmic_calendar','human_design',
    'cupping','kupa','hacamat_terapi','beslenme','astrology'
  ]::text[];
$$;

-- Allowlist DIŞINDAKİ her true anahtar false yapılır (anahtar silinmez; veri izi korunur).
CREATE OR REPLACE FUNCTION public.trial_sanitize_module_permissions(p_perms jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_perms IS NULL OR jsonb_typeof(p_perms) <> 'object' THEN '{}'::jsonb
    ELSE coalesce((
      SELECT jsonb_object_agg(
               e.key,
               CASE WHEN e.value = 'true'::jsonb AND NOT (e.key = ANY (public.trial_allowed_module_keys()))
                    THEN 'false'::jsonb ELSE e.value END)
        FROM jsonb_each(p_perms) e), '{}'::jsonb)
  END;
$$;

-- DB savunma katmanı: deneme paketindeki satırda hangi yoldan yazılırsa yazılsın (admin modül
-- düzenleme dahil) allowlist dışı modül AÇILAMAZ. Pro'ya geçişte package_type='premium' olduğundan
-- tetikleyici devreden çıkar (Pro yetkileri admin seçimiyle uygulanır). trial_kind NULL satırlar
-- (mevcut tüm hesaplar) için erken çıkış → davranış değişmez.
CREATE OR REPLACE FUNCTION public.trial_users_module_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.trial_kind IS NULL THEN
    RETURN NEW;
  END IF;
  IF lower(coalesce(NEW.package_type, '')) = 'trial' THEN
    NEW.module_permissions := public.trial_sanitize_module_permissions(NEW.module_permissions);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trial_users_module_guard_trg ON public.users;
CREATE TRIGGER trial_users_module_guard_trg
  BEFORE INSERT OR UPDATE OF module_permissions, package_type, trial_kind ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trial_users_module_guard();

-- ─── 3) Tablolar ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trial_profiles (
  user_id              uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  claim_hash           text NOT NULL CHECK (claim_hash ~ '^[A-Za-z0-9:_-]{8,200}$'),
  registered_at        timestamptz NOT NULL DEFAULT now(),
  ip_bucket            text CHECK (ip_bucket IS NULL OR ip_bucket ~ '^[A-Za-z0-9:_-]{8,200}$'),
  risk_score           integer NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_flags           text[] NOT NULL DEFAULT '{}'::text[],
  daily_credit_limit   integer NOT NULL DEFAULT 50 CHECK (daily_credit_limit BETWEEN 0 AND 1000),
  module_credit_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_reason        text CHECK (review_reason IS NULL OR length(review_reason) <= 300),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trial_profiles_module_limits_chk CHECK (jsonb_typeof(module_credit_limits) = 'object')
);
CREATE INDEX IF NOT EXISTS trial_profiles_ip_bucket_idx ON public.trial_profiles (ip_bucket, registered_at);

-- Tek deneme hakkı: kanonik e-postanın HMAC'ı (ham e-posta tutulmaz). users'a FK YOK → hesap
-- silinse bile hak tekrar kullanılamaz.
CREATE TABLE IF NOT EXISTS public.trial_claims (
  claim_hash    text PRIMARY KEY CHECK (claim_hash ~ '^[A-Za-z0-9:_-]{8,200}$'),
  first_user_id uuid NOT NULL,
  claimed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trial_credit_ledger (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_day   date NOT NULL,
  module      text NOT NULL CHECK (module IN ('astrology','human_design','numerology')),
  state       text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','charged','refunded')),
  label       text CHECK (label IS NULL OR label ~ '^[a-z0-9:/_.-]{1,64}$'),
  http_status integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  settled_at  timestamptz
);
CREATE INDEX IF NOT EXISTS trial_credit_ledger_day_idx
  ON public.trial_credit_ledger (user_id, usage_day) WHERE state <> 'refunded';

CREATE TABLE IF NOT EXISTS public.pro_upgrade_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel      text NOT NULL DEFAULT 'in_app' CHECK (channel = 'in_app'),
  note         text CHECK (note IS NULL OR length(note) <= 500),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  close_reason text CHECK (close_reason IS NULL OR close_reason IN ('converted','dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  closed_by    uuid
);
-- Mükerrer açık talep YOK (eşzamanlı istekler dahil — DB otoritesi).
CREATE UNIQUE INDEX IF NOT EXISTS pro_upgrade_requests_one_open_uidx
  ON public.pro_upgrade_requests (user_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.trial_admin_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action         text NOT NULL CHECK (action IN (
                   'limits_changed','review_started','review_cleared','trial_suspended',
                   'trial_resumed','converted_to_pro','pro_request_dismissed')),
  old_value      jsonb,
  new_value      jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trial_admin_events_target_idx ON public.trial_admin_events (target_user_id, created_at DESC);

-- RPC-only erişim: istemci rolleri hiçbir tabloya dokunamaz; service_role yalnız OKUR.
ALTER TABLE public.trial_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_claims         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_credit_ledger  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_admin_events   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_profiles, public.trial_claims, public.trial_credit_ledger,
              public.pro_upgrade_requests, public.trial_admin_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.trial_profiles, public.trial_credit_ledger,
                public.pro_upgrade_requests, public.trial_admin_events TO service_role;

-- ─── 4) Yardımcılar ───────────────────────────────────────────────────────────
-- Türkiye günü (00:00 Europe/Istanbul sıfırlama).
CREATE OR REPLACE FUNCTION public.trial_usage_day(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$ SELECT (p_at AT TIME ZONE 'Europe/Istanbul')::date; $$;

-- Deneme fazı (TS resolveTrialPhase ile AYNI kural). 'none' = deneme rejimi dışı.
CREATE OR REPLACE FUNCTION public.trial_phase_of(
  p_kind text, p_status text, p_package text, p_ends timestamptz, p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_kind IS NULL THEN 'none'
    WHEN p_status = 'converted' OR lower(coalesce(p_package,'')) = 'premium' THEN 'converted'
    WHEN p_status = 'review' THEN 'review'
    WHEN p_status = 'suspended' THEN 'suspended'
    WHEN p_status = 'not_started' THEN 'not_started'
    WHEN p_status = 'active' AND p_ends IS NOT NULL AND p_ends > p_now THEN 'active'
    WHEN p_status = 'active' THEN 'expired'
    ELSE 'none'
  END;
$$;

-- Ortak: aktif admin aktörü doğrula.
CREATE OR REPLACE FUNCTION public.trial_assert_admin(p_actor uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_role text; v_active boolean; v_main boolean;
BEGIN
  SELECT role, active, coalesce(is_super_admin, false) INTO v_role, v_active, v_main
    FROM public.users WHERE id = p_actor;
  IF NOT FOUND OR lower(coalesce(v_role,'')) <> 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'trial: yetkisiz aktor' USING ERRCODE = 'TR401';
  END IF;
  RETURN v_main;
END;
$$;

-- ─── 5) Kayıt: provision_expert(public) + deneme durumu + tek hak — TEK TRANSACTION ─────────
CREATE OR REPLACE FUNCTION public.trial_register_expert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email    text := lower(btrim(coalesce(p_payload->>'email','')));
  v_claim    text := p_payload->>'claim_hash';
  v_ip       text := nullif(p_payload->>'ip_bucket','');
  v_risk     integer := coalesce((p_payload->>'risk_score')::integer, 0);
  v_flags    text[] := coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'risk_flags','[]'::jsonb))), '{}'::text[]);
  v_review   boolean := coalesce((p_payload->>'review')::boolean, false);
  v_perms    jsonb := p_payload->'module_permissions';
  v_existing uuid;
  v_claimed  text;
  v_res      jsonb;
  v_uid      uuid;
  v_status   text;
BEGIN
  IF v_claim IS NULL OR v_claim !~ '^[A-Za-z0-9:_-]{8,200}$' THEN
    RAISE EXCEPTION 'trial_register_expert: claim_hash gecersiz';
  END IF;
  IF v_perms IS NULL OR jsonb_typeof(v_perms) <> 'object' THEN
    RAISE EXCEPTION 'trial_register_expert: module_permissions gecersiz';
  END IF;
  -- Fail-closed: istemci/uygulama allowlist dışı modül gönderemez (sessiz düzeltme değil, RED).
  IF EXISTS (SELECT 1 FROM jsonb_each(v_perms) e
              WHERE e.value = 'true'::jsonb AND NOT (e.key = ANY (public.trial_allowed_module_keys()))) THEN
    RAISE EXCEPTION 'trial_register_expert: deneme paketinde izinsiz modul';
  END IF;
  IF v_risk < 0 OR v_risk > 100 THEN RAISE EXCEPTION 'trial_register_expert: risk_score gecersiz'; END IF;

  -- Mevcut hesap (aynı e-posta) → hesap OLUŞTURULMAZ; hak harcanmaz.
  SELECT id INTO v_existing FROM public.users WHERE lower(btrim(email)) = v_email LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'already_exists');
  END IF;

  -- Tek deneme hakkı (kanonik e-posta). Eşzamanlı aynı kanonik e-posta → PK yarışı, biri kazanır.
  INSERT INTO public.trial_claims (claim_hash, first_user_id)
    VALUES (v_claim, '00000000-0000-0000-0000-000000000000'::uuid)
    ON CONFLICT (claim_hash) DO NOTHING
    RETURNING claim_hash INTO v_claimed;
  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'trial_already_used');
  END IF;

  v_res := public.provision_expert(jsonb_build_object(
    'mode', 'public',
    'email', v_email,
    'password_hash', p_payload->>'password_hash',
    'full_name', p_payload->>'full_name',
    'tenant_name', p_payload->>'tenant_name',
    'tenant_slug_base', p_payload->>'tenant_slug_base',
    'module_permissions', v_perms));

  IF coalesce(v_res->>'outcome','') <> 'provisioned' THEN
    -- Yarış (eşzamanlı aynı e-posta): hak kaydı geri alınır, hesap oluşmadı.
    DELETE FROM public.trial_claims WHERE claim_hash = v_claim;
    RETURN jsonb_build_object('ok', false, 'outcome', coalesce(v_res->>'outcome','error'));
  END IF;
  v_uid := (v_res->>'user_id')::uuid;
  v_status := CASE WHEN v_review THEN 'review' ELSE 'not_started' END;

  -- provision_expert(public) satırı pending/pasif üretir → deneme uzmanı olarak etkinleştir.
  -- Süre BAŞLAMAZ (trial_started_at/ends_at NULL): ilk başarılı girişte trial_activate_on_login.
  UPDATE public.users SET
    active              = true,
    approval_status     = 'approved',
    approved_at         = now(),
    package_type        = 'trial',
    plan                = 'trial',
    subscription_status = 'trial',
    membership_status   = 'trial',
    trial_started_at    = NULL,
    trial_ends_at       = NULL,
    trial_kind          = 'self_7d',
    trial_status        = v_status,
    -- Gökyüzü Atlası deneme paketinde (Owner: Premium seti + Atlas): yayımlanmış teknikler açık;
    -- maliyet günlük ortak Roxy kredisiyle sınırlıdır (trial_credit_reserve).
    astrology_technique_grants = '{"mode":"all"}'::jsonb
  WHERE id = v_uid;

  UPDATE public.trial_claims SET first_user_id = v_uid WHERE claim_hash = v_claim;

  INSERT INTO public.trial_profiles (user_id, claim_hash, ip_bucket, risk_score, risk_flags, review_reason)
    VALUES (v_uid, v_claim, v_ip, v_risk, v_flags,
            CASE WHEN v_review THEN 'Otomatik inceleme: ' || array_to_string(v_flags, ', ') END);

  RETURN jsonb_build_object('ok', true, 'outcome', 'provisioned', 'user_id', v_uid,
                            'tenant_id', v_res->>'tenant_id', 'trial_status', v_status);
END;
$$;

-- Aynı IP kovasından son 24 saatteki deneme kaydı sayısı (risk sinyali; kalıcı engel DEĞİL).
CREATE OR REPLACE FUNCTION public.trial_recent_signups_for_ip(p_ip_bucket text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::integer FROM public.trial_profiles
   WHERE p_ip_bucket IS NOT NULL AND ip_bucket = p_ip_bucket AND registered_at > now() - interval '24 hours';
$$;

-- ─── 6) İlk başarılı giriş: 168 saatlik pencereyi BİR KEZ başlat (eşzamanlı giriş güvenli) ────
CREATE OR REPLACE FUNCTION public.trial_activate_on_login(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_activated boolean := false;
  r public.users%ROWTYPE;
BEGIN
  -- Koşullu UPDATE: ikinci eşzamanlı çağrı satır kilidini bekler, koşulu yeniden değerlendirir
  -- (trial_status artık 'active') → 0 satır. Süre ASLA sıfırlanmaz/uzatılmaz.
  UPDATE public.users SET
    trial_status     = 'active',
    trial_started_at = now(),
    trial_ends_at    = now() + interval '168 hours'
  WHERE id = p_user_id
    AND trial_kind = 'self_7d'
    AND trial_status = 'not_started'
    AND trial_started_at IS NULL
    AND lower(coalesce(package_type,'')) = 'trial'
    AND active = true
    AND lower(coalesce(approval_status,'')) = 'approved';
  v_activated := FOUND;

  SELECT * INTO r FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'activated', v_activated,
    'trial_kind', r.trial_kind,
    'trial_status', r.trial_status,
    'phase', public.trial_phase_of(r.trial_kind, r.trial_status, r.package_type, r.trial_ends_at),
    'trial_started_at', r.trial_started_at,
    'trial_ends_at', r.trial_ends_at,
    'server_now', now());
END;
$$;

-- ─── 7) Roxy kredi defteri ────────────────────────────────────────────────────
-- Kullanım özeti (bugün, TR günü). Kayıt yoksa varsayılan 50 / modül limiti yok.
CREATE OR REPLACE FUNCTION public.trial_credit_usage(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH d AS (SELECT public.trial_usage_day() AS day),
  p AS (
    SELECT coalesce(tp.daily_credit_limit, 50) AS lim, coalesce(tp.module_credit_limits, '{}'::jsonb) AS mods
      FROM (SELECT 1) one LEFT JOIN public.trial_profiles tp ON tp.user_id = p_user_id
  ),
  u AS (
    SELECT l.module, count(*)::integer AS n
      FROM public.trial_credit_ledger l, d
     WHERE l.user_id = p_user_id AND l.usage_day = d.day AND l.state IN ('reserved','charged')
     GROUP BY l.module
  )
  SELECT jsonb_build_object(
    'day', (SELECT day FROM d),
    'daily_limit', (SELECT lim FROM p),
    'module_limits', (SELECT mods FROM p),
    'used_total', coalesce((SELECT sum(n) FROM u), 0),
    'used_by_module', coalesce((SELECT jsonb_object_agg(module, n) FROM u), '{}'::jsonb));
$$;

-- Rezervasyon: kullanıcı satırı FOR UPDATE ile kilitlenir → aynı uzmanın eşzamanlı çağrıları
-- SERİLEŞİR; sayım + ekleme atomik (limit aşılamaz).
CREATE OR REPLACE FUNCTION public.trial_credit_reserve(p_user_id uuid, p_module text, p_label text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r       public.users%ROWTYPE;
  v_day   date := public.trial_usage_day();
  v_lim   integer;
  v_mods  jsonb;
  v_mlim  integer;
  v_total integer;
  v_mused integer;
  v_id    bigint;
  v_phase text;
BEGIN
  IF p_module NOT IN ('astrology','human_design','numerology') THEN
    RAISE EXCEPTION 'trial_credit_reserve: gecersiz modul';
  END IF;
  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'trial_inactive');
  END IF;
  v_phase := public.trial_phase_of(r.trial_kind, r.trial_status, r.package_type, r.trial_ends_at);
  IF v_phase IN ('none','converted') THEN
    -- Deneme rejimi dışı (Premium / admin / dönüştürülmüş): ölçülmez.
    RETURN jsonb_build_object('ok', true, 'metered', false);
  END IF;
  IF v_phase <> 'active' OR r.active IS NOT TRUE OR lower(coalesce(r.approval_status,'')) <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason',
      CASE v_phase WHEN 'review' THEN 'trial_review' WHEN 'expired' THEN 'trial_expired'
                   WHEN 'suspended' THEN 'trial_suspended' ELSE 'trial_inactive' END);
  END IF;

  SELECT coalesce(daily_credit_limit, 50), coalesce(module_credit_limits, '{}'::jsonb)
    INTO v_lim, v_mods FROM public.trial_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN v_lim := 50; v_mods := '{}'::jsonb; END IF;
  v_mlim := CASE WHEN jsonb_typeof(v_mods->p_module) = 'number' THEN (v_mods->>p_module)::integer END;

  SELECT count(*)::integer INTO v_total FROM public.trial_credit_ledger
   WHERE user_id = p_user_id AND usage_day = v_day AND state IN ('reserved','charged');
  IF v_total >= v_lim THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit', 'daily_limit', v_lim, 'used_total', v_total);
  END IF;
  IF v_mlim IS NOT NULL THEN
    SELECT count(*)::integer INTO v_mused FROM public.trial_credit_ledger
     WHERE user_id = p_user_id AND usage_day = v_day AND module = p_module AND state IN ('reserved','charged');
    IF v_mused >= v_mlim THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'module_limit', 'module_limit', v_mlim, 'used_module', v_mused);
    END IF;
  END IF;

  INSERT INTO public.trial_credit_ledger (user_id, usage_day, module, label)
    VALUES (p_user_id, v_day, p_module,
            CASE WHEN p_label ~ '^[a-z0-9:/_.-]{1,64}$' THEN p_label END)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'metered', true, 'reservation_id', v_id,
                            'remaining', v_lim - v_total - 1);
END;
$$;

-- Kapanış: charged (sağlayıcı isteği işledi) / refunded (sağlayıcı reddetti: 429/5xx).
-- Yalnız 'reserved' satır kapanır (çift kapanış etkisiz).
CREATE OR REPLACE FUNCTION public.trial_credit_settle(p_reservation_id bigint, p_charged boolean, p_http_status integer)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.trial_credit_ledger
     SET state = CASE WHEN p_charged THEN 'charged' ELSE 'refunded' END,
         http_status = p_http_status,
         settled_at = now()
   WHERE id = p_reservation_id AND state = 'reserved';
  RETURN FOUND;
END;
$$;

-- ─── 8) Uygulama içi Pro talebi (uzman başına tek açık talep; idempotent) ──────
CREATE OR REPLACE FUNCTION public.trial_pro_request_create(p_user_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.users%ROWTYPE;
  v_id uuid;
  v_created timestamptz;
BEGIN
  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR r.trial_kind IS NULL OR r.active IS NOT TRUE
     OR public.trial_phase_of(r.trial_kind, r.trial_status, r.package_type, r.trial_ends_at) = 'converted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_trial');
  END IF;
  SELECT id, created_at INTO v_id, v_created FROM public.pro_upgrade_requests
   WHERE user_id = p_user_id AND status = 'open';
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'request_id', v_id, 'created_at', v_created);
  END IF;
  INSERT INTO public.pro_upgrade_requests (user_id, note)
    VALUES (p_user_id, nullif(left(btrim(coalesce(p_note,'')), 500), ''))
    RETURNING id, created_at INTO v_id, v_created;
  RETURN jsonb_build_object('ok', true, 'created', true, 'request_id', v_id, 'created_at', v_created);
END;
$$;

-- ─── 9) Admin: liste ──────────────────────────────────────────────────────────
-- p_status: all | not_started | active | expired | review | suspended | pro_request
CREATE OR REPLACE FUNCTION public.admin_trial_list(
  p_actor uuid, p_status text, p_search text, p_limit integer, p_offset integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day    date := public.trial_usage_day();
  v_status text := coalesce(p_status, 'all');
  v_search text := nullif(lower(btrim(coalesce(p_search,''))), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    jsonb;
BEGIN
  PERFORM public.trial_assert_admin(p_actor);
  IF v_status NOT IN ('all','not_started','active','expired','review','suspended','pro_request') THEN
    RAISE EXCEPTION 'admin_trial_list: gecersiz durum' USING ERRCODE = 'TR400';
  END IF;
  IF v_search IS NOT NULL THEN
    v_search := replace(replace(replace(left(v_search, 100), '\', '\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT u.id, u.full_name, u.email, u.created_at, u.active,
           u.trial_started_at, u.trial_ends_at,
           public.trial_phase_of(u.trial_kind, u.trial_status, u.package_type, u.trial_ends_at) AS phase,
           tp.registered_at, tp.risk_score, tp.risk_flags, tp.review_reason,
           coalesce(tp.daily_credit_limit, 50) AS daily_limit,
           coalesce(tp.module_credit_limits, '{}'::jsonb) AS module_limits,
           pr.created_at AS pro_request_at
      FROM public.users u
      LEFT JOIN public.trial_profiles tp ON tp.user_id = u.id
      LEFT JOIN public.pro_upgrade_requests pr ON pr.user_id = u.id AND pr.status = 'open'
     WHERE u.trial_kind IS NOT NULL
  ),
  counts AS (
    SELECT jsonb_build_object(
      'all', count(*) FILTER (WHERE phase <> 'converted'),
      'not_started', count(*) FILTER (WHERE phase = 'not_started'),
      'active', count(*) FILTER (WHERE phase = 'active'),
      'expired', count(*) FILTER (WHERE phase = 'expired'),
      'review', count(*) FILTER (WHERE phase = 'review'),
      'suspended', count(*) FILTER (WHERE phase = 'suspended'),
      'pro_request', count(*) FILTER (WHERE pro_request_at IS NOT NULL AND phase <> 'converted')) AS c
      FROM base
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (CASE v_status
              WHEN 'all' THEN b.phase <> 'converted'
              WHEN 'pro_request' THEN b.pro_request_at IS NOT NULL AND b.phase <> 'converted'
              ELSE b.phase = v_status END)
       AND (v_search IS NULL
            OR lower(coalesce(b.full_name,'')) LIKE '%' || v_search || '%' ESCAPE '\'
            OR lower(coalesce(b.email,'')) LIKE '%' || v_search || '%' ESCAPE '\')
  ),
  page AS (
    SELECT f.* FROM filtered f
     ORDER BY (f.phase = 'review') DESC, f.pro_request_at DESC NULLS LAST, f.created_at DESC, f.id
     LIMIT v_limit OFFSET v_offset
  ),
  usage AS (
    SELECT l.user_id, l.module, count(*)::integer AS n
      FROM public.trial_credit_ledger l
     WHERE l.usage_day = v_day AND l.state IN ('reserved','charged')
       AND l.user_id IN (SELECT id FROM page)
     GROUP BY l.user_id, l.module
  )
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', p.id, 'full_name', p.full_name, 'email', p.email,
          'created_at', p.created_at, 'registered_at', p.registered_at,
          'phase', p.phase, 'active', p.active,
          'trial_started_at', p.trial_started_at, 'trial_ends_at', p.trial_ends_at,
          'risk_score', coalesce(p.risk_score, 0),
          'risk_flags', to_jsonb(coalesce(p.risk_flags, '{}'::text[])),
          'review_reason', p.review_reason,
          'daily_limit', p.daily_limit, 'module_limits', p.module_limits,
          'pro_request_at', p.pro_request_at,
          'used_total', coalesce((SELECT sum(n) FROM usage WHERE usage.user_id = p.id), 0),
          'used_by_module', coalesce((SELECT jsonb_object_agg(module, n) FROM usage WHERE usage.user_id = p.id), '{}'::jsonb))
        ORDER BY (p.phase = 'review') DESC, p.pro_request_at DESC NULLS LAST, p.created_at DESC, p.id)
        FROM page p), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'counts', (SELECT c FROM counts),
    'server_now', now(),
    'usage_day', v_day)
  INTO v_out;
  RETURN v_out;
END;
$$;

-- ─── 10) Admin: kredi limitleri ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_trial_set_limits(
  p_actor uuid, p_user_id uuid, p_daily_limit integer, p_module_limits jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.users%ROWTYPE;
  v_old jsonb;
  v_mods jsonb := coalesce(p_module_limits, '{}'::jsonb);
BEGIN
  PERFORM public.trial_assert_admin(p_actor);
  IF p_daily_limit IS NULL OR p_daily_limit < 0 OR p_daily_limit > 1000 THEN
    RAISE EXCEPTION 'admin_trial_set_limits: gunluk limit 0-1000' USING ERRCODE = 'TR400';
  END IF;
  IF jsonb_typeof(v_mods) <> 'object' OR EXISTS (
       SELECT 1 FROM jsonb_each(v_mods) e
        WHERE e.key NOT IN ('astrology','human_design','numerology')
           OR jsonb_typeof(e.value) <> 'number'
           OR (e.value::text)::numeric <> floor((e.value::text)::numeric)
           OR (e.value::text)::numeric < 0
           OR (e.value::text)::numeric > p_daily_limit) THEN
    -- Modül limiti ortak günlük limiti AŞAMAZ (aşma hakkı vermez).
    RAISE EXCEPTION 'admin_trial_set_limits: modul limitleri gecersiz' USING ERRCODE = 'TR400';
  END IF;
  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR r.trial_kind IS NULL THEN
    RAISE EXCEPTION 'admin_trial_set_limits: deneme uyesi degil' USING ERRCODE = 'TR404';
  END IF;
  SELECT jsonb_build_object('daily_limit', daily_credit_limit, 'module_limits', module_credit_limits)
    INTO v_old FROM public.trial_profiles WHERE user_id = p_user_id;
  INSERT INTO public.trial_profiles (user_id, claim_hash, daily_credit_limit, module_credit_limits)
    VALUES (p_user_id, 'admin:' || replace(p_user_id::text, '-', ''), p_daily_limit, v_mods)
    ON CONFLICT (user_id) DO UPDATE
      SET daily_credit_limit = EXCLUDED.daily_credit_limit,
          module_credit_limits = EXCLUDED.module_credit_limits,
          updated_at = now();
  INSERT INTO public.trial_admin_events (actor_admin_id, target_user_id, action, old_value, new_value)
    VALUES (p_actor, p_user_id, 'limits_changed', v_old,
            jsonb_build_object('daily_limit', p_daily_limit, 'module_limits', v_mods));
  RETURN jsonb_build_object('ok', true, 'daily_limit', p_daily_limit, 'module_limits', v_mods);
END;
$$;

-- ─── 11) Admin: inceleme / durdurma (süre UZATMA YOK: bitiş zamanına dokunulmaz) ─────────
CREATE OR REPLACE FUNCTION public.admin_trial_set_state(
  p_actor uuid, p_user_id uuid, p_action text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.users%ROWTYPE;
  v_new text;
  v_event text;
  v_resume text;
BEGIN
  PERFORM public.trial_assert_admin(p_actor);
  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR r.trial_kind IS NULL THEN
    RAISE EXCEPTION 'admin_trial_set_state: deneme uyesi degil' USING ERRCODE = 'TR404';
  END IF;
  IF r.trial_status = 'converted' OR lower(coalesce(r.package_type,'')) = 'premium' THEN
    RAISE EXCEPTION 'admin_trial_set_state: Pro uyeye gecmis' USING ERRCODE = 'TR409';
  END IF;
  -- Devam edilecek durum: pencere başlamışsa 'active' (bitiş aynı kalır), başlamamışsa 'not_started'.
  v_resume := CASE WHEN r.trial_started_at IS NOT NULL AND r.trial_ends_at IS NOT NULL THEN 'active' ELSE 'not_started' END;
  IF p_action = 'review' AND r.trial_status IN ('not_started','active') THEN
    v_new := 'review'; v_event := 'review_started';
  ELSIF p_action = 'clear_review' AND r.trial_status = 'review' THEN
    v_new := v_resume; v_event := 'review_cleared';
  ELSIF p_action = 'suspend' AND r.trial_status IN ('not_started','active','review') THEN
    v_new := 'suspended'; v_event := 'trial_suspended';
  ELSIF p_action = 'resume' AND r.trial_status = 'suspended' THEN
    v_new := v_resume; v_event := 'trial_resumed';
  ELSE
    RAISE EXCEPTION 'admin_trial_set_state: gecersiz gecis' USING ERRCODE = 'TR409';
  END IF;

  UPDATE public.users SET trial_status = v_new WHERE id = p_user_id;
  IF p_action IN ('review','clear_review') THEN
    UPDATE public.trial_profiles
       SET review_reason = CASE WHEN p_action = 'review' THEN nullif(left(btrim(coalesce(p_reason,'')), 300), '') ELSE NULL END,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;
  INSERT INTO public.trial_admin_events (actor_admin_id, target_user_id, action, old_value, new_value)
    VALUES (p_actor, p_user_id, v_event,
            jsonb_build_object('trial_status', r.trial_status),
            jsonb_build_object('trial_status', v_new));
  RETURN jsonb_build_object('ok', true, 'trial_status', v_new);
END;
$$;

-- ─── 12) Admin: Pro'ya geçiş (ödeme sonrası; user_id + tenant AYNI, veriler korunur) ──────
-- Mevcut ücretli üyelikle BİREBİR: yh_grade_expert_premium (premium + seçilen modüller + YH kuralı).
-- Deneme pencere tarihleri tarihçe olarak KALIR (p_membership trial_* anahtarı taşımaz).
CREATE OR REPLACE FUNCTION public.admin_trial_convert_to_pro(
  p_actor uuid, p_user_id uuid, p_modules jsonb, p_remove_keys text[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_main    boolean;
  r         public.users%ROWTYPE;
  v_perms   jsonb;
  v_enabled text[];
  v_outcome text;
  v_closed  integer;
BEGIN
  v_main := public.trial_assert_admin(p_actor);
  IF NOT public.admin_module_map_is_valid(p_modules) THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: gecersiz modul haritasi' USING ERRCODE = 'TR400';
  END IF;
  SELECT coalesce(array_agg(e.key ORDER BY e.key), '{}'::text[]) INTO v_enabled
    FROM jsonb_each(p_modules) e WHERE e.value = 'true'::jsonb;
  IF coalesce(array_length(v_enabled, 1), 0) = 0 THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: en az bir modul secilmeli' USING ERRCODE = 'TR400';
  END IF;

  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR r.trial_kind IS NULL OR lower(coalesce(r.role,'')) <> 'expert' THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: deneme uyesi degil' USING ERRCODE = 'TR404';
  END IF;
  IF r.trial_status = 'converted' OR lower(coalesce(r.package_type,'')) = 'premium' THEN
    RAISE EXCEPTION 'admin_trial_convert_to_pro: zaten Pro' USING ERRCODE = 'TR409';
  END IF;

  v_perms := (coalesce(r.module_permissions, '{}'::jsonb) - coalesce(p_remove_keys, '{}'::text[])) || p_modules;
  v_outcome := public.yh_grade_expert_premium(p_user_id, jsonb_build_object(
    'package_type', 'premium', 'plan', 'premium',
    'membership_status', 'active', 'subscription_status', 'active',
    'membership_started_at', now(), 'membership_ends_at', NULL), v_perms);
  UPDATE public.users SET trial_status = 'converted', approved_at = coalesce(r.approved_at, now())
   WHERE id = p_user_id;

  UPDATE public.pro_upgrade_requests
     SET status = 'closed', close_reason = 'converted', closed_at = now(), closed_by = p_actor
   WHERE user_id = p_user_id AND status = 'open';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor, v_main, p_user_id, 'user_approved',
     jsonb_build_object('package_type', r.package_type, 'trial_status', r.trial_status),
     jsonb_build_object('package_type', 'premium', 'trial_status', 'converted'),
     jsonb_build_object('source', 'trial_convert_to_pro', 'premium_outcome', v_outcome,
                        'modules', to_jsonb(v_enabled), 'closed_pro_requests', v_closed));
  INSERT INTO public.trial_admin_events (actor_admin_id, target_user_id, action, old_value, new_value)
    VALUES (p_actor, p_user_id, 'converted_to_pro',
            jsonb_build_object('trial_status', r.trial_status, 'package_type', r.package_type),
            jsonb_build_object('trial_status', 'converted', 'package_type', 'premium', 'modules', to_jsonb(v_enabled)));
  RETURN jsonb_build_object('ok', true, 'premium_outcome', v_outcome, 'tenant_id', r.tenant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pro_request_close(p_actor uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_n integer;
BEGIN
  PERFORM public.trial_assert_admin(p_actor);
  UPDATE public.pro_upgrade_requests
     SET status = 'closed', close_reason = 'dismissed', closed_at = now(), closed_by = p_actor
   WHERE user_id = p_user_id AND status = 'open';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    INSERT INTO public.trial_admin_events (actor_admin_id, target_user_id, action, new_value)
      VALUES (p_actor, p_user_id, 'pro_request_dismissed', jsonb_build_object('closed', v_n));
  END IF;
  RETURN jsonb_build_object('ok', true, 'closed', v_n);
END;
$$;

-- ─── 13) EXECUTE kilidi: yalnız service_role ──────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.trial_allowed_module_keys()',
    'public.trial_sanitize_module_permissions(jsonb)',
    'public.trial_users_module_guard()',
    'public.trial_usage_day(timestamptz)',
    'public.trial_phase_of(text,text,text,timestamptz,timestamptz)',
    'public.trial_assert_admin(uuid)',
    'public.trial_register_expert(jsonb)',
    'public.trial_recent_signups_for_ip(text)',
    'public.trial_activate_on_login(uuid)',
    'public.trial_credit_usage(uuid)',
    'public.trial_credit_reserve(uuid,text,text)',
    'public.trial_credit_settle(bigint,boolean,integer)',
    'public.trial_pro_request_create(uuid,text)',
    'public.admin_trial_list(uuid,text,text,integer,integer)',
    'public.admin_trial_set_limits(uuid,uuid,integer,jsonb)',
    'public.admin_trial_set_state(uuid,uuid,text,text)',
    'public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])',
    'public.admin_pro_request_close(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.trial_register_expert(jsonb)',
    'public.trial_recent_signups_for_ip(text)',
    'public.trial_activate_on_login(uuid)',
    'public.trial_credit_usage(uuid)',
    'public.trial_credit_reserve(uuid,text,text)',
    'public.trial_credit_settle(bigint,boolean,integer)',
    'public.trial_pro_request_create(uuid,text)',
    'public.admin_trial_list(uuid,text,text,integer,integer)',
    'public.admin_trial_set_limits(uuid,uuid,integer,jsonb)',
    'public.admin_trial_set_state(uuid,uuid,text,text)',
    'public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])',
    'public.admin_pro_request_close(uuid,uuid)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
