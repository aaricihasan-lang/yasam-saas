-- =============================================================================
-- 20271228000000_campaign_center_core.sql
--
-- KAMPANYA MERKEZİ — KM-1 çekirdek veri modeli (Owner talimatı 2026-11-01; yalnız YEREL geçici veritabanında
-- çalıştırıldı — production / staging'e uygulanması AYRI Owner onayı ister).
--
-- Tablolar:
--   * campaign_settings        : tek satır genel ayar (acil kapatma, genel günlük analiz/kredi bütçesi, sağlayıcı aylık
--                                kotası, ücretli uzman payı %, sağlayıcı dakika tavanı, rezervasyon süresi).
--   * campaigns                : kampanya + reklam metinleri + durum (kapali/yakinda/aktif) + tarih penceresi.
--   * campaign_techniques      : kampanyada seçilen teknik/paket satırları (IP/gün, günlük analiz hakkı, kredi bütçesi,
--                                katalogdan alınmış analiz başına azami kredi, yorum politikası).
--   * campaign_text_templates  : Owner'ın kaydettiği reklam metni setleri.
--   * campaign_usage_daily     : Türkiye takvim günü (ve ay) bazında sayaçlar (rezerve / kullanılan analiz ve kredi).
--   * campaign_subject_daily   : IP / tarayıcı kimliği başına günlük sayaç — HAM IP YOK, yalnız sunucuda günlük dönen
--                                anahtarla üretilmiş HMAC-SHA256 (64 hex).
--   * campaign_reservations    : kota rezervasyonları (idempotency anahtarı tekil).
--   * campaign_provider_calls  : sağlayıcı çağrı defteri (kişisel veri YOK). Her çağrı ÖNCEDEN yetkilendirilir; rezervasyon
--                                başına toplam kredi azami krediyi aşamaz.
--   * campaign_provider_state  : gözlenen sağlayıcı kotası (kalan, sıfırlanma) + dakika penceresi + bekleme.
--   * campaign_audit_log       : Owner ayar değişikliklerinin değişmez denetim kaydı.
--
-- GÜVENLİK:
--   * Tüm tablolarda RLS açık, politika YOK; PUBLIC / anon / authenticated hiçbir yetkiye sahip değil.
--   * service_role YALNIZ SELECT alır. Hiçbir tabloya doğrudan INSERT / UPDATE / DELETE / TRUNCATE yetkisi yoktur:
--     tüm yazmalar 20271228000100'deki SECURITY DEFINER RPC'lerle yapılır (sayaçlar uygulama kodundan değiştirilemez).
--   * Aynı anda en fazla BİR yayındaki (yakinda/aktif, arşivlenmemiş) kampanya — kısmi TEKİL indeks (DB düzeyinde).
--   * campaign_actor_is_owner(): is_super_admin + role=admin + active + demo değil (mevcut katı owner kapısıyla aynı);
--     herkese (service_role dahil) kapalı iç yardımcı.
--   * Tenant / danışan / uzman tablolarına dokunulmaz; yeni tablolar tenant verisi içermez.
--
-- VERİ KORUMA: Mevcut tablo / politika / veri DEĞİŞMEZ. IDEMPOTENT (iki kez çalıştırılabilir). Varsayılan ayar satırı
-- kredi bütçesi 0 ile oluşur (ücretli çağrı kapalı başlar). Geri alma = campaign_settings.kill_switch / kampanyayı
-- kapatma + kod geri alma. DROP / TRUNCATE / veri silen geri alma migration'ı YOKTUR.
-- =============================================================================

BEGIN;

-- ── 1) Genel ayar (tek satır) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_settings (
  id boolean PRIMARY KEY DEFAULT true,
  kill_switch boolean NOT NULL DEFAULT false,
  global_daily_credit_budget integer NOT NULL DEFAULT 0,
  global_daily_analysis_limit integer NULL,
  provider_monthly_quota integer NULL,
  expert_reserve_pct smallint NOT NULL DEFAULT 60,
  provider_minute_limit integer NOT NULL DEFAULT 30,
  provider_state_max_age_seconds integer NOT NULL DEFAULT 900,
  reservation_ttl_seconds integer NOT NULL DEFAULT 600,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_settings_singleton_chk CHECK (id),
  CONSTRAINT campaign_settings_credit_chk CHECK (global_daily_credit_budget BETWEEN 0 AND 1000000),
  CONSTRAINT campaign_settings_analysis_chk CHECK (global_daily_analysis_limit IS NULL OR global_daily_analysis_limit BETWEEN 0 AND 1000000),
  CONSTRAINT campaign_settings_quota_chk CHECK (provider_monthly_quota IS NULL OR provider_monthly_quota BETWEEN 1 AND 100000000),
  CONSTRAINT campaign_settings_reserve_chk CHECK (expert_reserve_pct BETWEEN 0 AND 95),
  CONSTRAINT campaign_settings_minute_chk CHECK (provider_minute_limit BETWEEN 1 AND 10000),
  CONSTRAINT campaign_settings_age_chk CHECK (provider_state_max_age_seconds BETWEEN 60 AND 86400),
  CONSTRAINT campaign_settings_ttl_chk CHECK (reservation_ttl_seconds BETWEEN 60 AND 3600),
  CONSTRAINT campaign_settings_version_chk CHECK (version >= 1)
);
INSERT INTO public.campaign_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ── 2) Kampanyalar ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'kapali',
  undated boolean NOT NULL DEFAULT true,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  slogan text NOT NULL DEFAULT '',
  alt_slogan text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  affirmation text NOT NULL DEFAULT '',
  cta_text text NOT NULL DEFAULT '',
  cta_target text NOT NULL DEFAULT 'bolum',
  image_ref text NULL,
  hd_options jsonb NOT NULL DEFAULT '{"word": true, "kb": true}'::jsonb,
  module_comments jsonb NOT NULL DEFAULT '{}'::jsonb,
  catalog_version integer NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CONSTRAINT campaigns_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT campaigns_status_chk CHECK (status IN ('kapali', 'yakinda', 'aktif')),
  CONSTRAINT campaigns_dated_start_chk CHECK (undated OR starts_at IS NOT NULL),
  CONSTRAINT campaigns_window_chk CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT campaigns_text_chk CHECK (
    char_length(slogan) <= 90 AND char_length(alt_slogan) <= 110 AND char_length(description) <= 220
    AND char_length(affirmation) <= 120 AND char_length(cta_text) <= 32),
  -- İzin listesi: sayfa içi bölüm, kayıt sayfası veya "<modül>:<teknik>" (şema / dış adres / yol yok).
  CONSTRAINT campaigns_cta_target_chk CHECK (cta_target ~ '^(bolum|register|(hd|numk|numb|atlas|kozmik):[a-z0-9_]{1,30}(\.[a-z0-9_]{1,30})?)$'),
  -- Yalnız assets/ veya campaign/ altında, her bölüm harf/rakamla başlar ('..' ve mutlak yol imkânsız), görsel uzantısı.
  CONSTRAINT campaigns_image_ref_chk CHECK (image_ref IS NULL OR image_ref ~ '^(assets|campaign)/[a-z0-9][a-z0-9_-]{0,63}(/[a-z0-9][a-z0-9_-]{0,63}){0,3}\.(webp|png|jpg|jpeg|avif)$'),
  CONSTRAINT campaigns_hd_options_chk CHECK (jsonb_typeof(hd_options) = 'object' AND octet_length(hd_options::text) <= 512),
  CONSTRAINT campaigns_module_comments_chk CHECK (jsonb_typeof(module_comments) = 'object' AND octet_length(module_comments::text) <= 2048),
  CONSTRAINT campaigns_catalog_version_chk CHECK (catalog_version BETWEEN 1 AND 100000),
  CONSTRAINT campaigns_version_chk CHECK (version >= 1),
  CONSTRAINT campaigns_archived_closed_chk CHECK (archived_at IS NULL OR status = 'kapali')
);
-- Aynı anda en fazla BİR yayındaki kampanya (yakinda veya aktif). Sabit ifade + kısmi indeks → ikinci satır 23505.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_single_live_uq ON public.campaigns ((true))
  WHERE status IN ('yakinda', 'aktif') AND archived_at IS NULL;

-- ── 3) Kampanya teknikleri / paketleri ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_techniques (
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE RESTRICT,
  technique_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  ip_daily_limit integer NOT NULL DEFAULT 1,
  daily_analysis_limit integer NOT NULL DEFAULT 30,
  daily_credit_budget integer NOT NULL DEFAULT 0,
  max_credit_per_analysis smallint NOT NULL,
  comments_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, technique_key),
  CONSTRAINT campaign_tech_key_chk CHECK (technique_key ~ '^[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$'),
  CONSTRAINT campaign_tech_ip_chk CHECK (ip_daily_limit BETWEEN 0 AND 10000),
  CONSTRAINT campaign_tech_daily_chk CHECK (daily_analysis_limit BETWEEN 0 AND 1000000),
  CONSTRAINT campaign_tech_credit_chk CHECK (daily_credit_budget BETWEEN 0 AND 1000000),
  CONSTRAINT campaign_tech_max_chk CHECK (max_credit_per_analysis BETWEEN 0 AND 50),
  -- 0 kredili teknik/paket (ör. Kozmik Takvim): kredi bütçesi işletilmez.
  CONSTRAINT campaign_tech_zero_cost_chk CHECK (max_credit_per_analysis > 0 OR daily_credit_budget = 0)
);

-- ── 4) Reklam metni şablonları ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_text_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slogan text NOT NULL DEFAULT '',
  alt_slogan text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  affirmation text NOT NULL DEFAULT '',
  cta_text text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CONSTRAINT campaign_tpl_text_chk CHECK (
    char_length(slogan) <= 90 AND char_length(alt_slogan) <= 110 AND char_length(description) <= 220
    AND char_length(affirmation) <= 120 AND char_length(cta_text) <= 32
    AND char_length(slogan || alt_slogan || description || affirmation) > 0)
);

-- ── 5) Günlük / aylık sayaçlar ───────────────────────────────────────────────
-- scope: 'global' (gün), 'month' (day_tr = ayın ilk günü), 'tech:<kampanya uuid>:<teknik anahtarı>' (gün).
CREATE TABLE IF NOT EXISTS public.campaign_usage_daily (
  day_tr date NOT NULL,
  scope text NOT NULL,
  reserved_analyses integer NOT NULL DEFAULT 0,
  used_analyses integer NOT NULL DEFAULT 0,
  reserved_credits integer NOT NULL DEFAULT 0,
  spent_credits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_tr, scope),
  CONSTRAINT campaign_usage_scope_chk CHECK (scope IN ('global', 'month') OR scope ~ '^tech:[0-9a-f-]{36}:[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$'),
  CONSTRAINT campaign_usage_nonneg_chk CHECK (reserved_analyses >= 0 AND used_analyses >= 0 AND reserved_credits >= 0 AND spent_credits >= 0)
);

-- ── 6) Kimlik (IP / tarayıcı) başına günlük sayaç — ham IP YOK ──────────────
CREATE TABLE IF NOT EXISTS public.campaign_subject_daily (
  day_tr date NOT NULL,
  campaign_id uuid NOT NULL,
  technique_key text NOT NULL,
  subject_kind text NOT NULL,
  subject_hash text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day_tr, campaign_id, technique_key, subject_kind, subject_hash),
  CONSTRAINT campaign_subject_kind_chk CHECK (subject_kind IN ('ip', 'browser')),
  CONSTRAINT campaign_subject_hash_chk CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT campaign_subject_used_chk CHECK (used >= 0)
);

-- ── 7) Rezervasyonlar ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE RESTRICT,
  technique_key text NOT NULL,
  day_tr date NOT NULL,
  month_tr date NOT NULL,
  ip_hash text NULL,
  browser_hash text NULL,
  max_credits smallint NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  outcome text NULL,
  spent_credits smallint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  settled_at timestamptz NULL,
  CONSTRAINT campaign_res_idem_uq UNIQUE (idempotency_key),
  CONSTRAINT campaign_res_idem_chk CHECK (idempotency_key ~ '^[A-Za-z0-9_\-]{16,80}$'),
  CONSTRAINT campaign_res_hash_chk CHECK ((ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$') AND (browser_hash IS NULL OR browser_hash ~ '^[0-9a-f]{64}$')),
  CONSTRAINT campaign_res_max_chk CHECK (max_credits BETWEEN 0 AND 50),
  CONSTRAINT campaign_res_state_chk CHECK (state IN ('reserved', 'completed', 'released', 'expired')),
  CONSTRAINT campaign_res_outcome_chk CHECK (outcome IS NULL OR outcome IN ('completed', 'cache_hit', 'aborted_no_call', 'failed_after_call', 'expired')),
  CONSTRAINT campaign_res_spent_chk CHECK (spent_credits IS NULL OR spent_credits BETWEEN 0 AND 50),
  CONSTRAINT campaign_res_settled_chk CHECK ((state = 'reserved') = (settled_at IS NULL))
);
CREATE INDEX IF NOT EXISTS campaign_res_open_idx ON public.campaign_reservations (expires_at) WHERE state = 'reserved';

-- ── 8) Sağlayıcı çağrı defteri (kişisel veri YOK) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_provider_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES public.campaign_reservations (id) ON DELETE RESTRICT,
  provider text NOT NULL,
  endpoint text NOT NULL,
  http_status smallint NULL,
  outcome text NOT NULL,
  credits smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_pc_provider_chk CHECK (provider ~ '^[a-z0-9_]{1,40}$'),
  CONSTRAINT campaign_pc_endpoint_chk CHECK (endpoint ~ '^[A-Za-z0-9_][A-Za-z0-9_./\-]{0,119}$' AND position('..' in endpoint) = 0),
  CONSTRAINT campaign_pc_http_chk CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  -- 'pending': çağrı ÖNCESİ yetkilendirilmiş (campaign_authorize_call); sonuç yazılmasa da harcanmış sayılır.
  CONSTRAINT campaign_pc_outcome_chk CHECK (outcome IN ('pending', 'ok', 'timeout', 'network_error', 'http_error', 'rate_limited')),
  CONSTRAINT campaign_pc_credits_chk CHECK (credits BETWEEN 1 AND 50)
);
CREATE INDEX IF NOT EXISTS campaign_pc_reservation_idx ON public.campaign_provider_calls (reservation_id);

-- ── 9) Gözlenen sağlayıcı durumu ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_provider_state (
  provider text PRIMARY KEY,
  remaining integer NULL,
  quota_limit integer NULL,
  observed_at timestamptz NULL,
  reset_at timestamptz NULL,
  minute_window timestamptz NULL,
  minute_count integer NOT NULL DEFAULT 0,
  cooldown_until timestamptz NULL,
  CONSTRAINT campaign_ps_provider_chk CHECK (provider ~ '^[a-z0-9_]{1,40}$'),
  CONSTRAINT campaign_ps_nonneg_chk CHECK ((remaining IS NULL OR remaining >= 0) AND (quota_limit IS NULL OR quota_limit >= 0) AND minute_count >= 0)
);
INSERT INTO public.campaign_provider_state (provider) VALUES ('roxy') ON CONFLICT (provider) DO NOTHING;

-- ── 10) Denetim kaydı (değişmez) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  campaign_id uuid NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_audit_action_chk CHECK (action ~ '^[a-z_]{3,60}$'),
  CONSTRAINT campaign_audit_detail_chk CHECK (jsonb_typeof(detail) = 'object' AND octet_length(detail::text) <= 16384)
);
CREATE INDEX IF NOT EXISTS campaign_audit_campaign_idx ON public.campaign_audit_log (campaign_id, created_at DESC);

-- ── 11) Owner denetimi (iç yardımcı; kimse doğrudan çağıramaz) ───────────────
CREATE OR REPLACE FUNCTION public.campaign_actor_is_owner(p_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = p_actor
       AND u.is_super_admin IS TRUE
       AND lower(btrim(coalesce(u.role, ''))) = 'admin'
       AND u.active IS TRUE
       AND u.is_demo_account IS NOT TRUE
  );
$$;
REVOKE ALL ON FUNCTION public.campaign_actor_is_owner(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ── 12) RLS + yetkiler: service_role YALNIZ SELECT; yazma yalnız RPC ile ─────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaign_settings', 'campaigns', 'campaign_techniques', 'campaign_text_templates',
    'campaign_usage_daily', 'campaign_subject_daily', 'campaign_reservations', 'campaign_provider_calls',
    'campaign_provider_state', 'campaign_audit_log']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.campaign_provider_calls_id_seq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.campaign_audit_log_id_seq FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.campaign_settings IS 'Kampanya Merkezi: tek satır genel ayar (acil kapatma, genel bütçeler, sağlayıcı kotası, uzman payı). Yazma yalnız Owner RPC.';
COMMENT ON TABLE public.campaigns IS 'Kampanya Merkezi: kampanyalar ve reklam metinleri. Aynı anda en fazla bir yayındaki kampanya (tekil kısmi indeks).';
COMMENT ON TABLE public.campaign_techniques IS 'Kampanya Merkezi: seçili teknik/paket satırları, kota ve yorum politikası. Silinmez; enabled=false.';
COMMENT ON TABLE public.campaign_text_templates IS 'Kampanya Merkezi: Owner reklam metni şablonları (arşivlenir, silinmez).';
COMMENT ON TABLE public.campaign_usage_daily IS 'Kampanya Merkezi: Türkiye takvim günü/ay sayaçları. Limit düşürülünce sıfırlanmaz.';
COMMENT ON TABLE public.campaign_subject_daily IS 'Kampanya Merkezi: IP/tarayıcı kimliği başına günlük sayaç. Ham IP yok; sunucu HMAC-SHA256.';
COMMENT ON TABLE public.campaign_reservations IS 'Kampanya Merkezi: kota rezervasyonları (idempotent anahtar).';
COMMENT ON TABLE public.campaign_provider_calls IS 'Kampanya Merkezi: sağlayıcı çağrı defteri (kişisel veri yok).';
COMMENT ON TABLE public.campaign_provider_state IS 'Kampanya Merkezi: gözlenen sağlayıcı kotası, dakika penceresi, bekleme.';
COMMENT ON TABLE public.campaign_audit_log IS 'Kampanya Merkezi: Owner ayar değişikliklerinin değişmez denetim kaydı.';

COMMIT;

NOTIFY pgrst, 'reload schema';
