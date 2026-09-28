-- =============================================================================
-- 20270205000000_usage360_telemetry_core.sql
--
-- USAGE360 AŞAMA 2A — TELEMETRİ ÇEKİRDEĞİ (additive, tek migration).
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply ayrı owner onayıyla (önce migration, sonra kod).
--    Uygulansa bile USAGE360_ENABLED env açılmadıkça hiçbir yeni telemetri yazılmaz
--    (kod no-op). Retention temizliği de ayrı env ile (varsayılan KAPALI) çalışır.
--
-- KAVRAMLAR (AŞAMA 1 raporu, bölüm J/K):
--   * AUTH LOGIN      = public.user_sessions (DEĞİŞMEZ; bu migration dokunmaz).
--   * KULLANIM ZİYARETİ = public.usage_visits — bir auth oturumu içinde 30 dk sessizlikle
--                       ayrılan etkileşimli kullanım dilimi. Uzun yaşayan auth oturumu
--                       ≠ tek ziyaret.
--   * PING            = satır ÜRETMEZ; ziyareti ve günlük rollup'ı günceller.
--   * ANLAMLI OLAY    = public.expert_usage_events (mevcut tablo, geriye-uyumlu genişletilir).
--   * GÜNLÜK ROLLUP   = public.usage_daily (kullanıcı×gün×kanal TOPLAM) +
--                       public.usage_daily_modules (kullanıcı×gün×modül×kanal).
--     İki AYRI tablo bilinçli: toplam satırları ile modül satırları aynı sorguda
--     toplanıp çift sayım üretemez (yapısal invariant).
--
-- MAHREMİYET (yapısal): serbest metin / JSON metadata kolonu YOK. IP, IP hash, tam UA,
--   koordinat, URL/path, kayıt adı/id'si, dosya adı, hata mesajı YOK. Tüm alanlar
--   enum CHECK'li; idempotency anahtarı sunucuda HMAC'lanır (ham kaynak id'si yok).
--   Konum yalnız Vercel coarse geo (ISO-2 ülke + şehir adı).
--
-- GÜVENLİK: yeni tablolara anon/authenticated/service_role DOĞRUDAN erişemez; tüm yazım
--   SECURITY DEFINER RPC'lerle (search_path=''), EXECUTE yalnız service_role. RPC'ler
--   kullanıcıyı users tablosundan DOĞRULAR: admin / demo → 'noop'; tenant uyuşmazlığı veya
--   başkasının auth oturumu → 'rejected' (IDOR savunması; kimlik route guard'ından gelir).
--
-- ESKİ VERİ: expert_usage_events'in mevcut satırları DEĞİŞMEZ (yalnız nullable kolon
--   eklenir; event_type NOT NULL gevşetilir). Append-only trigger KORUNUR; yalnız
--   usage360_retention_purge içinde transaction-lokal retention bağlamında DELETE'e izin
--   verir (UPDATE her zaman yasak). service_role'ün DELETE yetkisi zaten YOK.
--
-- ROLLBACK (yeni nesneler; eski satırlar etkilenmez):
--   DROP FUNCTION public.usage360_ping(uuid,uuid,text,text,text,text,text,text,text,text);
--   DROP FUNCTION public.usage360_track(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text);
--   DROP FUNCTION public.usage360_retention_purge(boolean);
--   DROP FUNCTION public.usage360__open_visit(...), public.usage360__bump(...), public.usage360__bump_module(...);
--   DROP TABLE public.usage_daily_modules, public.usage_daily, public.usage_visits;
--   ALTER TABLE public.expert_usage_events DROP COLUMN action, ... (yeni kolonlar);
--   expert_usage_summary / expert_activity_stats / trigger fn: 20270112 + 20270115 gövdeleri.
-- =============================================================================

BEGIN;

-- ─── (0) Sabit sözlükler (IMMUTABLE) ─────────────────────────────────────────
-- Tek SQL kaynağı; TS karşılığı lib/usage/usageTaxonomy.ts (harness birebir karşılaştırır).

CREATE OR REPLACE FUNCTION public.usage360_module_keys()
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT ARRAY[
    'clients','appointments','numerology','stones','stok','sifa_rehberi',
    'energy_body','reflexology','aromatherapy','personal_archive','video_ceviri',
    'belge_ceviri','belge_ceviri_ai','ders_notu','human_design','digital_content',
    'cosmic_calendar','cupping','beslenme'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.usage360_actions()
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT ARRAY[
    'module_opened','record_created','record_updated','record_deleted','analysis_run',
    'report_generated','report_exported','file_uploaded','ai_task_completed','action_failed'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.usage360_channels()
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT ARRAY['desktop_web','mobile_web','tablet_web','android_app','android_webview_derived','unknown']::text[];
$$;

CREATE OR REPLACE FUNCTION public.usage360_os_families()
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT ARRAY['android','ios','windows','macos','linux','chromeos','other']::text[];
$$;

CREATE OR REPLACE FUNCTION public.usage360_browser_families()
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT ARRAY['chrome','safari','firefox','edge','samsung','opera','webview','other']::text[];
$$;

CREATE OR REPLACE FUNCTION public.usage360_error_classes()
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT ARRAY['validation','permission','conflict','too_large','server','timeout','network','client_export','client_upload']::text[];
$$;

-- TR takvim günü / saati — IANA bölgesiyle (sabit +03 hack'i YOK).
CREATE OR REPLACE FUNCTION public.usage360_day_tr(p_at timestamptz)
RETURNS date
LANGUAGE sql STABLE PARALLEL SAFE SET search_path = ''
AS $$ SELECT (p_at AT TIME ZONE 'Europe/Istanbul')::date; $$;

CREATE OR REPLACE FUNCTION public.usage360_hour_tr(p_at timestamptz)
RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE SET search_path = ''
AS $$ SELECT extract(hour FROM (p_at AT TIME ZONE 'Europe/Istanbul'))::integer; $$;

-- Aktif süre kredisi (saniye) — lib/usage/activeTime.ts computeActiveCredit ile birebir.
--   Δ ≤ 0           → 0
--   0 < Δ ≤ 150 sn  → min(Δ, 90)   (normal ardışık ping; 60 sn ± jitter)
--   Δ > 150 sn      → 30           (açık ziyaret içinde boşluktan dönüş: küçük sabit kredi)
-- 30 dk üzeri sessizlik bu fonksiyona ULAŞMAZ (yeni ziyaret açılır, kredi 0).
CREATE OR REPLACE FUNCTION public.usage360_active_credit(p_delta_seconds double precision)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_delta_seconds IS NULL OR p_delta_seconds <= 0 THEN 0
    WHEN p_delta_seconds <= 150 THEN floor(least(p_delta_seconds, 90))::integer
    ELSE 30
  END;
$$;

-- ─── (1) expert_usage_events — geriye-uyumlu genişletme ──────────────────────

ALTER TABLE public.expert_usage_events
  ALTER COLUMN event_type DROP NOT NULL;

ALTER TABLE public.expert_usage_events
  ADD COLUMN IF NOT EXISTS action            text,
  ADD COLUMN IF NOT EXISTS sub_entity        text,
  ADD COLUMN IF NOT EXISTS failed_action     text,
  ADD COLUMN IF NOT EXISTS error_class       text,
  ADD COLUMN IF NOT EXISTS item_count_bucket text,
  ADD COLUMN IF NOT EXISTS source            text,
  ADD COLUMN IF NOT EXISTS channel           text,
  ADD COLUMN IF NOT EXISTS visit_id          uuid,
  ADD COLUMN IF NOT EXISTS auth_session_id   uuid,
  ADD COLUMN IF NOT EXISTS day_tr            date;

COMMENT ON COLUMN public.expert_usage_events.action IS
  'Usage360 eylem sözlüğü (usage360_actions). NULL = eski (AŞAMA 1 öncesi) satır; event_type okunur.';
COMMENT ON COLUMN public.expert_usage_events.idempotency_key IS
  'Dedup anahtarı. Usage360 yolunda sunucu HMAC hex (ham kaynak id''si İÇERMEZ).';

-- Modül CHECK'i: belge_ceviri_ai eklenir (AŞAMA 1 bulgusu: sessiz 23514).
ALTER TABLE public.expert_usage_events DROP CONSTRAINT IF EXISTS expert_usage_module_chk;
ALTER TABLE public.expert_usage_events
  ADD CONSTRAINT expert_usage_module_chk CHECK (module_key = ANY (public.usage360_module_keys()));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expert_usage_usage360_chk'
                   AND conrelid = 'public.expert_usage_events'::regclass) THEN
    ALTER TABLE public.expert_usage_events ADD CONSTRAINT expert_usage_usage360_chk CHECK (
          (event_type IS NOT NULL OR action IS NOT NULL)
      AND (action IS NULL OR action = ANY (public.usage360_actions()))
      AND (sub_entity IS NULL OR sub_entity ~ '^[a-z][a-z0-9_]{0,31}$')
      AND (item_count_bucket IS NULL OR item_count_bucket IN ('1','2-10','11-50','51+'))
      AND (source IS NULL OR source IN ('server','client'))
      AND (channel IS NULL OR channel = ANY (public.usage360_channels()))
      -- Hata alanları yalnız action_failed satırında ve birlikte.
      AND (
            (coalesce(action, '') <> 'action_failed' AND error_class IS NULL AND failed_action IS NULL)
         OR (action = 'action_failed' AND error_class = ANY (public.usage360_error_classes())
             AND (failed_action IS NULL
                  OR (failed_action = ANY (public.usage360_actions())
                      AND failed_action NOT IN ('module_opened','action_failed'))))
      )
      -- Yeni model satırları: kaynak + TR günü zorunlu.
      AND (action IS NULL OR (source IS NOT NULL AND day_tr IS NOT NULL))
      -- İstemci kaynaklı olay yalnız izinli eylemler (CREATE/UPDATE/DELETE istemciden ASLA).
      AND (coalesce(source, 'server') <> 'client'
           OR action IN ('module_opened','report_exported','action_failed'))
    );
  END IF;
END $$;

-- Append-only korunur; DELETE yalnız retention bağlamında (transaction-lokal GUC).
-- Bu GUC'u yalnız usage360_retention_purge set eder; service_role'ün DELETE yetkisi
-- zaten olmadığından GUC tek başına bir yol AÇMAZ (derinlemesine savunma).
CREATE OR REPLACE FUNCTION public.expert_usage_events_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('yasam.usage_retention_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'expert_usage_events append-only: % engellendi', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

-- ─── (2) usage_visits ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.usage_visits (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL,
  tenant_id         uuid        NOT NULL,
  -- user_sessions.id (FK YOK: auth oturumu silinse de ziyaret istatistiği kalır).
  auth_session_id   uuid        NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  -- Son etkileşim/olay (ziyaret sınırı: 30 dk).
  last_active_at    timestamptz NOT NULL DEFAULT now(),
  -- Son kabul edilen ping / modül-geçişi (aktif süre kredisinin tabanı + 45 sn hız sınırı).
  last_ping_at      timestamptz,
  active_seconds    integer     NOT NULL DEFAULT 0,
  ping_count        integer     NOT NULL DEFAULT 0,
  module_open_count integer     NOT NULL DEFAULT 0,
  action_count      integer     NOT NULL DEFAULT 0,
  -- Kredinin atfedileceği modül (bir sonraki ping/geçişte ÖNCEKİ modüle yazılır).
  active_module_key text,
  -- Bu ziyarette açılmış modüller (ziyaret-başı ilk açılış sayımı).
  opened_modules    text[]      NOT NULL DEFAULT '{}'::text[],
  channel           text        NOT NULL,
  os_family         text        NOT NULL,
  browser_family    text        NOT NULL,
  app_version       text,
  country           text,
  city              text,
  day_tr            date        NOT NULL,
  CONSTRAINT usage_visits_counts_chk CHECK (
    active_seconds >= 0 AND ping_count >= 0 AND module_open_count >= 0 AND action_count >= 0),
  CONSTRAINT usage_visits_enum_chk CHECK (
        channel = ANY (public.usage360_channels())
    AND os_family = ANY (public.usage360_os_families())
    AND browser_family = ANY (public.usage360_browser_families())
    AND (active_module_key IS NULL OR active_module_key = ANY (public.usage360_module_keys()))
    AND opened_modules <@ public.usage360_module_keys()),
  CONSTRAINT usage_visits_ctx_chk CHECK (
        (app_version IS NULL OR app_version ~ '^[0-9A-Za-z._-]{1,32}$')
    AND (country IS NULL OR country ~ '^[A-Z]{2}$')
    AND (city IS NULL OR (char_length(city) BETWEEN 1 AND 64 AND city !~ '[[:cntrl:]]')))
);

COMMENT ON TABLE public.usage_visits IS
  'Usage360 kullanım ziyareti (auth oturumundan AYRI; 30 dk sessizlik = yeni ziyaret). Ping satır üretmez. IP/tam UA YOK. Yalnız SECURITY DEFINER RPC yazar. Retention 180 gün.';

CREATE INDEX IF NOT EXISTS idx_usage_visits_session_active
  ON public.usage_visits (auth_session_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_visits_user_started
  ON public.usage_visits (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_visits_last_active
  ON public.usage_visits (last_active_at);

-- ─── (3) Günlük rollup'lar ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.usage_daily (
  user_id           uuid        NOT NULL,
  tenant_id         uuid        NOT NULL,
  day_tr            date        NOT NULL,
  channel           text        NOT NULL,
  visits            integer     NOT NULL DEFAULT 0,
  active_seconds    integer     NOT NULL DEFAULT 0,
  pings             integer     NOT NULL DEFAULT 0,
  module_opens      integer     NOT NULL DEFAULT 0,
  creates           integer     NOT NULL DEFAULT 0,
  updates           integer     NOT NULL DEFAULT 0,
  deletes           integer     NOT NULL DEFAULT 0,
  analyses          integer     NOT NULL DEFAULT 0,
  reports_generated integer     NOT NULL DEFAULT 0,
  reports_exported  integer     NOT NULL DEFAULT 0,
  uploads           integer     NOT NULL DEFAULT 0,
  ai_tasks          integer     NOT NULL DEFAULT 0,
  failures          integer     NOT NULL DEFAULT 0,
  -- TR saatine göre aktif saat bitmask'i (bit h = saat h'de sinyal var; 24 bit).
  hour_mask         integer     NOT NULL DEFAULT 0,
  first_at          timestamptz NOT NULL,
  last_at           timestamptz NOT NULL,
  PRIMARY KEY (user_id, day_tr, channel),
  CONSTRAINT usage_daily_channel_chk CHECK (channel = ANY (public.usage360_channels())),
  CONSTRAINT usage_daily_counts_chk CHECK (
    visits >= 0 AND active_seconds >= 0 AND pings >= 0 AND module_opens >= 0 AND creates >= 0
    AND updates >= 0 AND deletes >= 0 AND analyses >= 0 AND reports_generated >= 0
    AND reports_exported >= 0 AND uploads >= 0 AND ai_tasks >= 0 AND failures >= 0),
  CONSTRAINT usage_daily_hour_chk CHECK (hour_mask >= 0 AND hour_mask < 16777216)
);

COMMENT ON TABLE public.usage_daily IS
  'Usage360 kullanıcı×TR-günü×kanal TOPLAM rollup (artımlı; yazım anında). Modül kırılımı AYRI tabloda (usage_daily_modules) — ikisi toplanmaz. Retention 25 ay.';

CREATE TABLE IF NOT EXISTS public.usage_daily_modules (
  user_id           uuid        NOT NULL,
  tenant_id         uuid        NOT NULL,
  day_tr            date        NOT NULL,
  module_key        text        NOT NULL,
  channel           text        NOT NULL,
  active_seconds    integer     NOT NULL DEFAULT 0,
  module_opens      integer     NOT NULL DEFAULT 0,
  creates           integer     NOT NULL DEFAULT 0,
  updates           integer     NOT NULL DEFAULT 0,
  deletes           integer     NOT NULL DEFAULT 0,
  analyses          integer     NOT NULL DEFAULT 0,
  reports_generated integer     NOT NULL DEFAULT 0,
  reports_exported  integer     NOT NULL DEFAULT 0,
  uploads           integer     NOT NULL DEFAULT 0,
  ai_tasks          integer     NOT NULL DEFAULT 0,
  failures          integer     NOT NULL DEFAULT 0,
  hour_mask         integer     NOT NULL DEFAULT 0,
  first_at          timestamptz NOT NULL,
  last_at           timestamptz NOT NULL,
  PRIMARY KEY (user_id, day_tr, module_key, channel),
  CONSTRAINT usage_daily_modules_enum_chk CHECK (
    channel = ANY (public.usage360_channels()) AND module_key = ANY (public.usage360_module_keys())),
  CONSTRAINT usage_daily_modules_counts_chk CHECK (
    active_seconds >= 0 AND module_opens >= 0 AND creates >= 0 AND updates >= 0 AND deletes >= 0
    AND analyses >= 0 AND reports_generated >= 0 AND reports_exported >= 0 AND uploads >= 0
    AND ai_tasks >= 0 AND failures >= 0),
  CONSTRAINT usage_daily_modules_hour_chk CHECK (hour_mask >= 0 AND hour_mask < 16777216)
);

COMMENT ON TABLE public.usage_daily_modules IS
  'Usage360 kullanıcı×TR-günü×modül×kanal rollup. Modülsüz (hub) aktif süre burada YOKTUR → usage_daily.active_seconds >= Σ modül. Retention 25 ay.';

CREATE INDEX IF NOT EXISTS idx_usage_daily_day ON public.usage_daily (day_tr);
CREATE INDEX IF NOT EXISTS idx_usage_daily_modules_day ON public.usage_daily_modules (day_tr);

-- ─── (4) İç yardımcılar (SECURITY INVOKER; yalnız DEFINER RPC'ler içinden) ──

-- Toplam rollup artırımı. p_at'in TR günü/saati kullanılır.
CREATE OR REPLACE FUNCTION public.usage360__bump(
  p_user uuid, p_tenant uuid, p_channel text, p_at timestamptz,
  d_visits integer DEFAULT 0, d_active integer DEFAULT 0, d_pings integer DEFAULT 0,
  d_opens integer DEFAULT 0, d_creates integer DEFAULT 0, d_updates integer DEFAULT 0,
  d_deletes integer DEFAULT 0, d_analyses integer DEFAULT 0, d_rep_gen integer DEFAULT 0,
  d_rep_exp integer DEFAULT 0, d_uploads integer DEFAULT 0, d_ai integer DEFAULT 0,
  d_failures integer DEFAULT 0
) RETURNS void
LANGUAGE sql VOLATILE SET search_path = ''
AS $$
  INSERT INTO public.usage_daily AS d (
    user_id, tenant_id, day_tr, channel, visits, active_seconds, pings, module_opens, creates,
    updates, deletes, analyses, reports_generated, reports_exported, uploads, ai_tasks, failures,
    hour_mask, first_at, last_at)
  VALUES (
    p_user, p_tenant, public.usage360_day_tr(p_at), p_channel, d_visits, d_active, d_pings, d_opens,
    d_creates, d_updates, d_deletes, d_analyses, d_rep_gen, d_rep_exp, d_uploads, d_ai, d_failures,
    (1 << public.usage360_hour_tr(p_at)), p_at, p_at)
  ON CONFLICT (user_id, day_tr, channel) DO UPDATE SET
    visits            = d.visits + EXCLUDED.visits,
    active_seconds    = d.active_seconds + EXCLUDED.active_seconds,
    pings             = d.pings + EXCLUDED.pings,
    module_opens      = d.module_opens + EXCLUDED.module_opens,
    creates           = d.creates + EXCLUDED.creates,
    updates           = d.updates + EXCLUDED.updates,
    deletes           = d.deletes + EXCLUDED.deletes,
    analyses          = d.analyses + EXCLUDED.analyses,
    reports_generated = d.reports_generated + EXCLUDED.reports_generated,
    reports_exported  = d.reports_exported + EXCLUDED.reports_exported,
    uploads           = d.uploads + EXCLUDED.uploads,
    ai_tasks          = d.ai_tasks + EXCLUDED.ai_tasks,
    failures          = d.failures + EXCLUDED.failures,
    hour_mask         = d.hour_mask | EXCLUDED.hour_mask,
    first_at          = least(d.first_at, EXCLUDED.first_at),
    last_at           = greatest(d.last_at, EXCLUDED.last_at);
$$;

-- Modül rollup artırımı (ziyaret/ping sayacı YOK — onlar yalnız toplamdadır).
CREATE OR REPLACE FUNCTION public.usage360__bump_module(
  p_user uuid, p_tenant uuid, p_module text, p_channel text, p_at timestamptz,
  d_active integer DEFAULT 0, d_opens integer DEFAULT 0, d_creates integer DEFAULT 0,
  d_updates integer DEFAULT 0, d_deletes integer DEFAULT 0, d_analyses integer DEFAULT 0,
  d_rep_gen integer DEFAULT 0, d_rep_exp integer DEFAULT 0, d_uploads integer DEFAULT 0,
  d_ai integer DEFAULT 0, d_failures integer DEFAULT 0
) RETURNS void
LANGUAGE sql VOLATILE SET search_path = ''
AS $$
  INSERT INTO public.usage_daily_modules AS m (
    user_id, tenant_id, day_tr, module_key, channel, active_seconds, module_opens, creates, updates,
    deletes, analyses, reports_generated, reports_exported, uploads, ai_tasks, failures,
    hour_mask, first_at, last_at)
  VALUES (
    p_user, p_tenant, public.usage360_day_tr(p_at), p_module, p_channel, d_active, d_opens, d_creates,
    d_updates, d_deletes, d_analyses, d_rep_gen, d_rep_exp, d_uploads, d_ai, d_failures,
    (1 << public.usage360_hour_tr(p_at)), p_at, p_at)
  ON CONFLICT (user_id, day_tr, module_key, channel) DO UPDATE SET
    active_seconds    = m.active_seconds + EXCLUDED.active_seconds,
    module_opens      = m.module_opens + EXCLUDED.module_opens,
    creates           = m.creates + EXCLUDED.creates,
    updates           = m.updates + EXCLUDED.updates,
    deletes           = m.deletes + EXCLUDED.deletes,
    analyses          = m.analyses + EXCLUDED.analyses,
    reports_generated = m.reports_generated + EXCLUDED.reports_generated,
    reports_exported  = m.reports_exported + EXCLUDED.reports_exported,
    uploads           = m.uploads + EXCLUDED.uploads,
    ai_tasks          = m.ai_tasks + EXCLUDED.ai_tasks,
    failures          = m.failures + EXCLUDED.failures,
    hour_mask         = m.hour_mask | EXCLUDED.hour_mask,
    first_at          = least(m.first_at, EXCLUDED.first_at),
    last_at           = greatest(m.last_at, EXCLUDED.last_at);
$$;

-- Kullanıcı kapısı + auth oturumu çözümü. Dönüş:
--   'noop'     → admin / demo / bilinmeyen kullanıcı (telemetri yazılmaz)
--   'rejected' → tenant uyuşmazlığı veya token bu kullanıcının aktif oturumu değil
--   'ok'       → o_session_id dolu (token verildiyse) ya da NULL (token yok)
CREATE OR REPLACE FUNCTION public.usage360__gate(
  p_user uuid, p_tenant uuid, p_session_token text,
  OUT o_status text, OUT o_session_id uuid
)
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  v_role   text;
  v_demo   boolean;
  v_tenant uuid;
BEGIN
  o_session_id := NULL;
  SELECT lower(btrim(coalesce(u.role::text, ''))), coalesce(u.is_demo_account, false), u.tenant_id
    INTO v_role, v_demo, v_tenant
    FROM public.users u
   WHERE u.id = p_user;
  IF NOT FOUND OR v_role <> 'expert' OR v_demo THEN
    o_status := 'noop';
    RETURN;
  END IF;
  IF v_tenant IS DISTINCT FROM p_tenant THEN
    o_status := 'rejected';
    RETURN;
  END IF;
  IF p_session_token IS NOT NULL AND btrim(p_session_token) <> '' THEN
    SELECT s.id INTO o_session_id
      FROM public.user_sessions s
     WHERE s.session_token = p_session_token
       AND s.user_id = p_user
       AND s.is_active = true
     LIMIT 1;
    IF o_session_id IS NULL THEN
      o_status := 'rejected';
      RETURN;
    END IF;
  END IF;
  o_status := 'ok';
END;
$$;

-- Açık ziyareti bulur (son etkinlik ≤ 30 dk) ya da yeni ziyaret açar (+visits rollup).
-- Çağıran auth oturumu başına advisory lock almış olmalıdır (eşzamanlı çift ziyaret yok).
CREATE OR REPLACE FUNCTION public.usage360__open_visit(
  p_user uuid, p_tenant uuid, p_session_id uuid, p_now timestamptz,
  p_channel text, p_os text, p_browser text, p_app_version text, p_country text, p_city text,
  p_module text,
  OUT o_visit_id uuid, OUT o_is_new boolean
)
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $$
DECLARE
  v_last timestamptz;
BEGIN
  SELECT v.id, v.last_active_at INTO o_visit_id, v_last
    FROM public.usage_visits v
   WHERE v.auth_session_id = p_session_id
   ORDER BY v.last_active_at DESC
   LIMIT 1;

  IF o_visit_id IS NOT NULL AND v_last > p_now - interval '30 minutes' THEN
    o_is_new := false;
    RETURN;
  END IF;

  INSERT INTO public.usage_visits (
    user_id, tenant_id, auth_session_id, started_at, last_active_at, last_ping_at,
    active_module_key, channel, os_family, browser_family, app_version, country, city, day_tr)
  VALUES (
    p_user, p_tenant, p_session_id, p_now, p_now, NULL,
    p_module, p_channel, p_os, p_browser, p_app_version, p_country, p_city,
    public.usage360_day_tr(p_now))
  RETURNING id INTO o_visit_id;

  PERFORM public.usage360__bump(p_user, p_tenant, p_channel, p_now, d_visits => 1);
  o_is_new := true;
END;
$$;

-- Bağlam doğrulaması (geçersiz enum → 'rejected'; CHECK istisnası fırlatılmaz).
CREATE OR REPLACE FUNCTION public.usage360__ctx_ok(
  p_channel text, p_os text, p_browser text, p_app_version text, p_country text, p_city text
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p_channel = ANY (public.usage360_channels())
     AND p_os = ANY (public.usage360_os_families())
     AND p_browser = ANY (public.usage360_browser_families())
     AND (p_app_version IS NULL OR p_app_version ~ '^[0-9A-Za-z._-]{1,32}$')
     AND (p_country IS NULL OR p_country ~ '^[A-Z]{2}$')
     AND (p_city IS NULL OR (char_length(p_city) BETWEEN 1 AND 64 AND p_city !~ '[[:cntrl:]]'));
$$;

-- ─── (5) Genel RPC: activity ping ────────────────────────────────────────────
-- Dönüş: 'noop' | 'rejected' | 'throttled' | 'new_visit' | 'ok'. Ping ham olay satırı ÜRETMEZ.
CREATE OR REPLACE FUNCTION public.usage360_ping(
  p_user_id uuid, p_tenant_id uuid, p_session_token text, p_module_key text,
  p_channel text, p_os_family text, p_browser_family text, p_app_version text,
  p_country text, p_city text
) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now    timestamptz := now();
  v_status text;
  v_sid    uuid;
  v_visit  public.usage_visits;
  v_visit_id uuid;
  v_new    boolean;
  v_credit integer;
BEGIN
  SELECT g.o_status, g.o_session_id INTO v_status, v_sid
    FROM public.usage360__gate(p_user_id, p_tenant_id, p_session_token) g;
  IF v_status <> 'ok' THEN RETURN v_status; END IF;
  IF v_sid IS NULL THEN RETURN 'rejected'; END IF; -- ping auth oturumu olmadan anlamsız
  IF (p_module_key IS NOT NULL AND NOT (p_module_key = ANY (public.usage360_module_keys())))
     OR NOT public.usage360__ctx_ok(p_channel, p_os_family, p_browser_family, p_app_version, p_country, p_city)
  THEN
    RETURN 'rejected';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('usage360:' || v_sid::text, 0));

  SELECT o.o_visit_id, o.o_is_new INTO v_visit_id, v_new
    FROM public.usage360__open_visit(p_user_id, p_tenant_id, v_sid, v_now, p_channel, p_os_family,
                                     p_browser_family, p_app_version, p_country, p_city, p_module_key) o;
  SELECT v.* INTO v_visit FROM public.usage_visits v WHERE v.id = v_visit_id;

  IF v_new THEN
    UPDATE public.usage_visits
       SET last_ping_at = v_now, ping_count = 1
     WHERE id = v_visit.id;
    PERFORM public.usage360__bump(p_user_id, p_tenant_id, v_visit.channel, v_now, d_pings => 1);
    RETURN 'new_visit';
  END IF;

  -- Sunucu hız sınırı: aynı auth oturumunda 45 sn'den sık ping KABUL EDİLMEZ
  -- (iki sekme aynı token'ı paylaşır → süre çift sayılmaz).
  IF v_visit.last_ping_at IS NOT NULL AND v_visit.last_ping_at > v_now - interval '45 seconds' THEN
    RETURN 'throttled';
  END IF;

  v_credit := public.usage360_active_credit(
    extract(epoch FROM v_now - coalesce(v_visit.last_ping_at, v_visit.started_at)));

  UPDATE public.usage_visits
     SET last_active_at    = v_now,
         last_ping_at      = v_now,
         ping_count        = ping_count + 1,
         active_seconds    = active_seconds + v_credit,
         active_module_key = p_module_key
   WHERE id = v_visit.id;

  PERFORM public.usage360__bump(p_user_id, p_tenant_id, v_visit.channel, v_now,
                                d_active => v_credit, d_pings => 1);
  -- Kredi, iki ping ARASINDA aktif olan (ÖNCEKİ) modüle yazılır; yeni modüle DEĞİL.
  IF v_credit > 0 AND v_visit.active_module_key IS NOT NULL THEN
    PERFORM public.usage360__bump_module(p_user_id, p_tenant_id, v_visit.active_module_key,
                                         v_visit.channel, v_now, d_active => v_credit);
  END IF;
  RETURN 'ok';
END;
$$;

-- ─── (6) Genel RPC: anlamlı olay (sunucu + izinli istemci olayları) ──────────
-- Dönüş: 'noop' | 'rejected' | 'deduped' | 'ok'.
CREATE OR REPLACE FUNCTION public.usage360_track(
  p_user_id uuid, p_tenant_id uuid, p_session_token text, p_module_key text, p_action text,
  p_sub_entity text, p_failed_action text, p_error_class text, p_item_count_bucket text,
  p_source text, p_idempotency_key text, p_legacy_event_type text,
  p_channel text, p_os_family text, p_browser_family text, p_app_version text,
  p_country text, p_city text
) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now      timestamptz := now();
  v_status   text;
  v_sid      uuid;
  v_visit    public.usage_visits;
  v_visit_id uuid;
  v_new      boolean;
  v_channel  text;
  v_credit   integer;
  v_event_id uuid;
BEGIN
  SELECT g.o_status, g.o_session_id INTO v_status, v_sid
    FROM public.usage360__gate(p_user_id, p_tenant_id, p_session_token) g;
  IF v_status <> 'ok' THEN RETURN v_status; END IF;

  -- Enum / kural doğrulaması (CHECK'lerle aynı; istisna yerine 'rejected').
  IF p_module_key IS NULL OR NOT (p_module_key = ANY (public.usage360_module_keys()))
     OR p_action IS NULL OR NOT (p_action = ANY (public.usage360_actions()))
     OR p_source IS NULL OR p_source NOT IN ('server','client')
     OR (p_source = 'client' AND p_action NOT IN ('module_opened','report_exported','action_failed'))
     OR (p_sub_entity IS NOT NULL AND p_sub_entity !~ '^[a-z][a-z0-9_]{0,31}$')
     OR (p_item_count_bucket IS NOT NULL AND p_item_count_bucket NOT IN ('1','2-10','11-50','51+'))
     OR (p_action = 'action_failed' AND (p_error_class IS NULL
          OR NOT (p_error_class = ANY (public.usage360_error_classes()))
          OR (p_failed_action IS NOT NULL AND (NOT (p_failed_action = ANY (public.usage360_actions()))
              OR p_failed_action IN ('module_opened','action_failed')))))
     OR (p_action <> 'action_failed' AND (p_error_class IS NOT NULL OR p_failed_action IS NOT NULL))
     OR (p_idempotency_key IS NOT NULL AND p_idempotency_key !~ '^[0-9a-f]{64}$')
     OR (p_legacy_event_type IS NOT NULL AND p_legacy_event_type NOT IN (
          'analysis_created','record_created','record_updated','protocol_created',
          'report_generated','guide_created','translation_completed'))
     OR NOT public.usage360__ctx_ok(p_channel, p_os_family, p_browser_family, p_app_version, p_country, p_city)
  THEN
    RETURN 'rejected';
  END IF;
  -- İstemci olayları yalnız doğrulanmış aktif auth oturumuyla.
  IF p_source = 'client' AND v_sid IS NULL THEN RETURN 'rejected'; END IF;

  IF v_sid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('usage360:' || v_sid::text, 0));
    SELECT o.o_visit_id, o.o_is_new INTO v_visit_id, v_new
      FROM public.usage360__open_visit(p_user_id, p_tenant_id, v_sid, v_now, p_channel, p_os_family,
                                       p_browser_family, p_app_version, p_country, p_city,
                                       CASE WHEN p_action = 'module_opened' THEN p_module_key END) o;
    SELECT v.* INTO v_visit FROM public.usage_visits v WHERE v.id = v_visit_id;
    v_channel := v_visit.channel;
  ELSE
    v_channel := p_channel;
  END IF;

  -- MODULE_OPENED: aktif modül geçişi. Önce ÖNCEKİ modülün birikmiş süresi (son ping'ten
  -- bu yana) önceki modüle yazılır, sonra aktif modül değişir. Ziyaret-başı ilk açılış sayılır.
  IF p_action = 'module_opened' THEN
    IF NOT v_new THEN
      v_credit := public.usage360_active_credit(
        extract(epoch FROM v_now - coalesce(v_visit.last_ping_at, v_visit.started_at)));
      IF v_credit > 0 THEN
        PERFORM public.usage360__bump(p_user_id, p_tenant_id, v_channel, v_now, d_active => v_credit);
        IF v_visit.active_module_key IS NOT NULL THEN
          PERFORM public.usage360__bump_module(p_user_id, p_tenant_id, v_visit.active_module_key,
                                               v_channel, v_now, d_active => v_credit);
        END IF;
      END IF;
      UPDATE public.usage_visits
         SET last_active_at = v_now, last_ping_at = v_now,
             active_seconds = active_seconds + v_credit,
             active_module_key = p_module_key
       WHERE id = v_visit.id;
    ELSE
      UPDATE public.usage_visits SET last_ping_at = v_now WHERE id = v_visit.id;
    END IF;

    IF p_module_key = ANY (v_visit.opened_modules) THEN
      RETURN 'deduped'; -- aynı ziyarette aynı modül tekrar sayılmaz
    END IF;
    UPDATE public.usage_visits
       SET opened_modules = array_append(opened_modules, p_module_key),
           module_open_count = module_open_count + 1
     WHERE id = v_visit.id;
  END IF;

  INSERT INTO public.expert_usage_events (
    tenant_id, user_id, module_key, event_type, action, sub_entity, failed_action, error_class,
    item_count_bucket, source, channel, visit_id, auth_session_id, day_tr, idempotency_key, occurred_at)
  VALUES (
    p_tenant_id, p_user_id, p_module_key, p_legacy_event_type, p_action, p_sub_entity,
    p_failed_action, p_error_class, p_item_count_bucket, p_source, v_channel, v_visit.id, v_sid,
    public.usage360_day_tr(v_now), p_idempotency_key, v_now)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN 'deduped'; -- retry / çift tık: sayaçlar artmaz
  END IF;

  IF v_visit.id IS NOT NULL AND p_action <> 'module_opened' THEN
    UPDATE public.usage_visits
       SET last_active_at = v_now, action_count = action_count + 1
     WHERE id = v_visit.id;
  END IF;

  PERFORM public.usage360__bump(
    p_user_id, p_tenant_id, v_channel, v_now,
    d_opens    => (p_action = 'module_opened')::integer,
    d_creates  => (p_action = 'record_created')::integer,
    d_updates  => (p_action = 'record_updated')::integer,
    d_deletes  => (p_action = 'record_deleted')::integer,
    d_analyses => (p_action = 'analysis_run')::integer,
    d_rep_gen  => (p_action = 'report_generated')::integer,
    d_rep_exp  => (p_action = 'report_exported')::integer,
    d_uploads  => (p_action = 'file_uploaded')::integer,
    d_ai       => (p_action = 'ai_task_completed')::integer,
    d_failures => (p_action = 'action_failed')::integer);
  PERFORM public.usage360__bump_module(
    p_user_id, p_tenant_id, p_module_key, v_channel, v_now,
    d_opens    => (p_action = 'module_opened')::integer,
    d_creates  => (p_action = 'record_created')::integer,
    d_updates  => (p_action = 'record_updated')::integer,
    d_deletes  => (p_action = 'record_deleted')::integer,
    d_analyses => (p_action = 'analysis_run')::integer,
    d_rep_gen  => (p_action = 'report_generated')::integer,
    d_rep_exp  => (p_action = 'report_exported')::integer,
    d_uploads  => (p_action = 'file_uploaded')::integer,
    d_ai       => (p_action = 'ai_task_completed')::integer,
    d_failures => (p_action = 'action_failed')::integer);
  RETURN 'ok';
END;
$$;

-- ─── (7) Retention (varsayılan dry-run; zamanlanmış iş varsayılan KAPALI) ────
-- Ham Usage360 olayı 180 gün · ziyaret 180 gün · günlük rollup 25 ay.
-- Eski (action IS NULL) satırlara DOKUNULMAZ.
CREATE OR REPLACE FUNCTION public.usage360_retention_purge(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_event_cut timestamptz := now() - interval '180 days';
  v_visit_cut timestamptz := now() - interval '180 days';
  v_day_cut   date        := (public.usage360_day_tr(now()) - interval '25 months')::date;
  v_events  bigint; v_visits bigint; v_daily bigint; v_mods bigint;
BEGIN
  IF coalesce(p_dry_run, true) THEN
    SELECT count(*) INTO v_events FROM public.expert_usage_events
     WHERE action IS NOT NULL AND occurred_at < v_event_cut;
    SELECT count(*) INTO v_visits FROM public.usage_visits WHERE last_active_at < v_visit_cut;
    SELECT count(*) INTO v_daily  FROM public.usage_daily WHERE day_tr < v_day_cut;
    SELECT count(*) INTO v_mods   FROM public.usage_daily_modules WHERE day_tr < v_day_cut;
  ELSE
    PERFORM set_config('yasam.usage_retention_purge', 'on', true);
    DELETE FROM public.expert_usage_events WHERE action IS NOT NULL AND occurred_at < v_event_cut;
    GET DIAGNOSTICS v_events = ROW_COUNT;
    PERFORM set_config('yasam.usage_retention_purge', 'off', true);
    DELETE FROM public.usage_visits WHERE last_active_at < v_visit_cut;
    GET DIAGNOSTICS v_visits = ROW_COUNT;
    DELETE FROM public.usage_daily WHERE day_tr < v_day_cut;
    GET DIAGNOSTICS v_daily = ROW_COUNT;
    DELETE FROM public.usage_daily_modules WHERE day_tr < v_day_cut;
    GET DIAGNOSTICS v_mods = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object(
    'dry_run', coalesce(p_dry_run, true), 'events', v_events, 'visits', v_visits,
    'daily', v_daily, 'daily_modules', v_mods);
END;
$$;

-- ─── (8) Eski okuma RPC'lerinin dürüstlük güncellemesi ───────────────────────
-- (a) expert_usage_summary: "Ölçülen işlem" yalnız ANLAMLI işlemleri sayar; Usage360
--     modül açılışı ve başarısız işlem satırları sayıma KARIŞMAZ (imza değişmez).
CREATE OR REPLACE FUNCTION public.expert_usage_summary(
  p_tenant_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL
)
RETURNS TABLE (module_key text, event_count bigint, last_occurred timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT module_key, count(*)::bigint AS event_count, max(occurred_at) AS last_occurred
  FROM public.expert_usage_events
  WHERE tenant_id = p_tenant_id
    AND (action IS NULL OR action NOT IN ('module_opened','action_failed'))
    AND (p_from IS NULL OR occurred_at >= p_from)
    AND (p_to   IS NULL OR occurred_at <  p_to)
  GROUP BY module_key;
$$;

-- (b) expert_activity_stats.active_days → "GİRİŞ YAPILAN GÜN": aralıktaki başarılı
--     login'lerin (user_sessions.created_at) farklı TR günleri. Eski hesap (oturum başına
--     tek last_seen günü + 27.09.2026 backfill artefaktı) gerçek aktif günü temsil etmiyordu.
--     Dönüş şekli DEĞİŞMEZ (kolon adı geriye-uyumluluk için active_days).
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
  )
  SELECT
    (SELECT count(*) FROM in_range)::bigint                                    AS login_count,
    (SELECT count(*) FROM s)::bigint                                           AS session_count,
    (SELECT max(created_at)   FROM s)                                          AS last_login,
    (SELECT max(last_seen_at) FROM s)                                          AS last_seen,
    (SELECT count(DISTINCT (created_at AT TIME ZONE 'Europe/Istanbul')::date)
       FROM in_range)::bigint                                                  AS active_days,
    (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(client_channel, 'unrecorded') AS k, count(*) AS c
        FROM in_range GROUP BY 1
     ) q)                                                                      AS channel_breakdown,
    (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
        SELECT coalesce(platform, 'unknown') AS k, count(*) AS c
        FROM in_range GROUP BY 1
     ) q)                                                                      AS platform_breakdown;
$$;

-- ─── (9) Yetkiler ────────────────────────────────────────────────────────────
-- Yeni tablolar: hiçbir istemci rolü (service_role dahil) doğrudan erişemez; yalnız
-- DEFINER RPC'ler (sahip) yazar. Supabase varsayılan ayrıcalıkları açıkça geri alınır.
REVOKE ALL ON TABLE public.usage_visits        FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.usage_daily         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.usage_daily_modules FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.usage_visits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily_modules ENABLE ROW LEVEL SECURITY;
-- (Politika YOK → RLS altında sahip dışı her rol için tüm satırlar reddedilir.)

-- Sözlük/saf yardımcılar: CHECK'lerde kullanılır; yalnız sabit/saf değer döndürür.
-- service_role (eski doğrudan-insert yolu CHECK'i değerlendirir) EXECUTE alır; istemci rolleri almaz.
REVOKE ALL ON FUNCTION public.usage360_module_keys()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_actions()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_channels()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_os_families()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_browser_families() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_error_classes()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_day_tr(timestamptz)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_hour_tr(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_active_credit(double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage360_module_keys()      TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_actions()          TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_channels()         TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_os_families()      TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_browser_families() TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_error_classes()    TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_day_tr(timestamptz)  TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_hour_tr(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_active_credit(double precision) TO service_role;

-- İç yardımcılar: HİÇBİR istemci rolü çağıramaz (yalnız DEFINER RPC'ler, sahip olarak).
REVOKE ALL ON FUNCTION public.usage360__bump(uuid,uuid,text,timestamptz,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.usage360__bump_module(uuid,uuid,text,text,timestamptz,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.usage360__gate(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.usage360__open_visit(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.usage360__ctx_ok(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;

-- Genel RPC'ler: yalnız service_role (sunucu route'ları / Inngest).
REVOKE ALL ON FUNCTION public.usage360_ping(uuid,uuid,text,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_track(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage360_retention_purge(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage360_ping(uuid,uuid,text,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_track(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage360_retention_purge(boolean) TO service_role;

-- Eski okuma RPC'leri CREATE OR REPLACE ile yetkilerini korur; yine de açıkça sabitlenir.
REVOKE ALL ON FUNCTION public.expert_usage_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_usage_summary(uuid, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.expert_activity_stats(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_activity_stats(uuid, timestamptz, timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT count(*) FROM public.expert_usage_events WHERE action IS NULL;        -- = apply öncesi toplam
--   SELECT has_table_privilege('anon','public.usage_visits','SELECT');           -- false
--   SELECT has_table_privilege('authenticated','public.usage_daily','INSERT');   -- false
--   SELECT has_function_privilege('anon','public.usage360_ping(uuid,uuid,text,text,text,text,text,text,text,text)','EXECUTE'); -- false
--   SELECT count(*) FROM public.usage_visits;                                    -- 0 (flag kapalı)
-- =============================================================================
