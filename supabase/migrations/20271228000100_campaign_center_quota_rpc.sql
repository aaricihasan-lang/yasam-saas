-- =============================================================================
-- 20271228000100_campaign_center_quota_rpc.sql
--
-- KAMPANYA MERKEZİ — KM-1 atomik kota rezervasyonu + Owner yönetim RPC'leri (Owner talimatı 2026-11-01; yalnız YEREL
-- geçici veritabanında çalıştırıldı — production / staging'e uygulanması AYRI Owner onayı ister).
--
-- KOTA (service_role; public endpoint YOK):
--   campaign_reserve            : idempotent rezervasyon. Tüm sınırlar TEK işlemde, sabit kilit sırasıyla denetlenir.
--   campaign_record_provider_call: sağlayıcı çağrı defteri + gözlenen kota (rezervasyon açıkken).
--   campaign_observe_provider   : rezervasyondan bağımsız kota gözlemi (diğer modüllerin yanıt başlıkları için).
--   campaign_settle             : rezervasyonu sonuçlandırır (completed / cache_hit / aborted_no_call / failed_after_call).
--   campaign_expire_stale       : süresi dolan (yarım kalan) rezervasyonları "harcandı" sayarak kapatır.
--   campaign_purge_subjects     : eski IP/tarayıcı kimliği sayaçlarını siler, eski rezervasyonlardan kimlik özetini kaldırır.
--
-- OWNER (p_actor her çağrıda DB'de yeniden doğrulanır; değilse 42501):
--   campaign_admin_save, campaign_admin_set_status, campaign_admin_set_techniques, campaign_admin_archive,
--   campaign_admin_update_settings, campaign_admin_save_template, campaign_admin_archive_template
--
-- ZAMAN: Tüm zaman damgaları timestamptz (UTC). Kota günü = Europe/Istanbul takvim günü (day_tr); ay = o günün ayı.
--   Test saati (p_now) YALNIZ oturumda campaign.allow_clock_override='on' ise ve oturum PostgREST (authenticator) değilse
--   kullanılır; aksi hâlde yok sayılır ve now() kullanılır.
--
-- EŞZAMANLILIK: Kilit sırası her zaman: campaign_settings (FOR SHARE) → genel gün sayacı (FOR UPDATE; serileştirme noktası)
--   → sağlayıcı durumu → ay sayacı → teknik sayacı → kimlik sayaçları. Sonuçlandırma: rezervasyon → genel → ay → teknik →
--   kimlik. Döngüsel bekleme yoktur.
--
-- KREDİ KURALLARI: cache_hit → kredi iade; aborted_no_call (defterde çağrı yoksa) → analiz + kimlik hakkı + kredi iade;
--   failed_after_call (zaman aşımı dahil) → harcanan = max(bildirilen, defter, 1); expired → harcanan = max(azami, defter).
--   Harcama hiçbir durumda defterdeki kredi toplamının altında sayılmaz. 0 kredili teknikte kredi bütçesi ve sağlayıcı
--   denetimi işletilmez.
--
-- VERİ KORUMA: IDEMPOTENT (CREATE OR REPLACE). Tablo / veri değiştirmez. DROP / TRUNCATE yok.
-- =============================================================================

BEGIN;

-- ── İç yardımcılar (kimse doğrudan çağıramaz) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign__now(p_now timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN p_now IS NOT NULL
     AND coalesce(current_setting('campaign.allow_clock_override', true), '') = 'on'
     AND session_user <> 'authenticator'
    THEN p_now ELSE now() END;
$$;

CREATE OR REPLACE FUNCTION public.campaign__day(p_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT (p_at AT TIME ZONE 'Europe/Istanbul')::date; $$;

CREATE OR REPLACE FUNCTION public.campaign__deny(p_reason text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT jsonb_build_object('ok', false, 'reason', p_reason); $$;

CREATE OR REPLACE FUNCTION public.campaign__require_owner(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_actor IS NULL OR NOT public.campaign_actor_is_owner(p_actor) THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_OWNER' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.campaign__audit(p_actor uuid, p_action text, p_campaign uuid, p_detail jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  INSERT INTO public.campaign_audit_log (actor_user_id, action, campaign_id, detail)
  VALUES (p_actor, p_action, p_campaign, coalesce(p_detail, '{}'::jsonb));
$$;

-- Sayaç satırını oluşturur ve kilitler (FOR UPDATE).
CREATE OR REPLACE FUNCTION public.campaign__lock_usage(p_day date, p_scope text)
RETURNS public.campaign_usage_daily
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v public.campaign_usage_daily;
BEGIN
  INSERT INTO public.campaign_usage_daily (day_tr, scope) VALUES (p_day, p_scope) ON CONFLICT (day_tr, scope) DO NOTHING;
  SELECT * INTO v FROM public.campaign_usage_daily WHERE day_tr = p_day AND scope = p_scope FOR UPDATE;
  RETURN v;
END;
$$;

-- ── campaign_reserve ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_reserve(
  p_idempotency_key text,
  p_technique_key text,
  p_ip_hash text,
  p_browser_hash text DEFAULT NULL,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_day date;
  v_month date;
  s public.campaign_settings;
  g public.campaign_usage_daily;
  m public.campaign_usage_daily;
  tu public.campaign_usage_daily;
  c public.campaigns;
  t public.campaign_techniques;
  ps public.campaign_provider_state;
  r public.campaign_reservations;
  v_max integer;
  v_floor bigint;
  v_cap bigint;
  v_minute timestamptz;
  v_minute_used integer;
  v_ip_used integer;
  v_br_used integer;
  v_id uuid;
  v_expires timestamptz;
BEGIN
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_\-]{16,80}$'
     OR p_technique_key IS NULL OR p_technique_key !~ '^[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$'
     OR p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR (p_browser_hash IS NOT NULL AND p_browser_hash !~ '^[0-9a-f]{64}$') THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;

  v_now := public.campaign__now(p_now);
  v_day := public.campaign__day(v_now);
  v_month := date_trunc('month', v_day)::date;

  SELECT * INTO s FROM public.campaign_settings WHERE id FOR SHARE;
  IF NOT FOUND OR s.kill_switch THEN
    RETURN public.campaign__deny('kampanya_kapali');
  END IF;

  -- Serileştirme noktası: genel gün sayacı.
  g := public.campaign__lock_usage(v_day, 'global');

  -- İdempotency: aynı anahtar ikinci kez bütçe tüketmez.
  SELECT * INTO r FROM public.campaign_reservations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF r.technique_key <> p_technique_key THEN
      RETURN public.campaign__deny('idempotency_cakismasi');
    END IF;
    RETURN jsonb_build_object('ok', r.state IN ('reserved', 'completed'), 'replay', true, 'reservation_id', r.id,
      'state', r.state, 'max_credits', r.max_credits, 'day_tr', r.day_tr,
      'reason', CASE WHEN r.state IN ('reserved', 'completed') THEN NULL ELSE 'onceki_istek_sonlandi' END);
  END IF;

  SELECT * INTO c FROM public.campaigns
   WHERE status = 'aktif' AND archived_at IS NULL
     AND (undated OR (starts_at <= v_now AND (ends_at IS NULL OR ends_at > v_now)))
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.campaign__deny('kampanya_kapali');
  END IF;

  SELECT * INTO t FROM public.campaign_techniques WHERE campaign_id = c.id AND technique_key = p_technique_key FOR SHARE;
  IF NOT FOUND OR NOT t.enabled THEN
    RETURN public.campaign__deny('teknik_kapali');
  END IF;
  v_max := t.max_credit_per_analysis;

  IF s.global_daily_analysis_limit IS NOT NULL AND g.reserved_analyses + g.used_analyses >= s.global_daily_analysis_limit THEN
    RETURN public.campaign__deny('genel_kontenjan_doldu');
  END IF;

  IF v_max > 0 THEN
    IF g.reserved_credits + g.spent_credits + v_max > s.global_daily_credit_budget THEN
      RETURN public.campaign__deny('genel_kredi_doldu');
    END IF;
    IF s.provider_monthly_quota IS NULL THEN
      RETURN public.campaign__deny('saglayici_kotasi_tanimsiz');
    END IF;
    SELECT * INTO ps FROM public.campaign_provider_state WHERE provider = 'roxy' FOR UPDATE;
    IF NOT FOUND THEN
      RETURN public.campaign__deny('saglayici_durumu_bilinmiyor');
    END IF;
    IF ps.cooldown_until IS NOT NULL AND ps.cooldown_until > v_now THEN
      RETURN public.campaign__deny('saglayici_bekleme');
    END IF;
    IF ps.observed_at IS NULL OR ps.remaining IS NULL
       OR ps.observed_at < v_now - make_interval(secs => s.provider_state_max_age_seconds) THEN
      RETURN public.campaign__deny('saglayici_durumu_bilinmiyor');
    END IF;
    m := public.campaign__lock_usage(v_month, 'month');
    v_floor := ceil(s.provider_monthly_quota::numeric * s.expert_reserve_pct / 100.0)::bigint;
    v_cap := s.provider_monthly_quota - v_floor;
    IF m.reserved_credits + m.spent_credits + v_max > v_cap THEN
      RETURN public.campaign__deny('aylik_kampanya_payi_doldu');
    END IF;
    -- Gözlenen kalan kotadan, henüz sonuçlanmamış kampanya rezervasyonları da düşülür; uzman payı tabanı korunur.
    IF ps.remaining::bigint - m.reserved_credits - v_max < v_floor THEN
      RETURN public.campaign__deny('uzman_payi_korunuyor');
    END IF;
    v_minute := date_trunc('minute', v_now);
    v_minute_used := CASE WHEN ps.minute_window = v_minute THEN ps.minute_count ELSE 0 END;
    IF v_minute_used + v_max > s.provider_minute_limit THEN
      RETURN public.campaign__deny('saglayici_dakika_siniri');
    END IF;
  END IF;

  tu := public.campaign__lock_usage(v_day, 'tech:' || c.id::text || ':' || p_technique_key);
  IF tu.reserved_analyses + tu.used_analyses >= t.daily_analysis_limit THEN
    RETURN public.campaign__deny('teknik_kontenjan_doldu');
  END IF;
  IF v_max > 0 AND tu.reserved_credits + tu.spent_credits + v_max > t.daily_credit_budget THEN
    RETURN public.campaign__deny('teknik_kredi_doldu');
  END IF;

  INSERT INTO public.campaign_subject_daily (day_tr, campaign_id, technique_key, subject_kind, subject_hash)
  VALUES (v_day, c.id, p_technique_key, 'ip', p_ip_hash) ON CONFLICT DO NOTHING;
  SELECT used INTO v_ip_used FROM public.campaign_subject_daily
   WHERE day_tr = v_day AND campaign_id = c.id AND technique_key = p_technique_key AND subject_kind = 'ip' AND subject_hash = p_ip_hash
   FOR UPDATE;
  IF v_ip_used >= t.ip_daily_limit THEN
    RETURN public.campaign__deny('ip_hakki_doldu');
  END IF;
  IF p_browser_hash IS NOT NULL THEN
    INSERT INTO public.campaign_subject_daily (day_tr, campaign_id, technique_key, subject_kind, subject_hash)
    VALUES (v_day, c.id, p_technique_key, 'browser', p_browser_hash) ON CONFLICT DO NOTHING;
    SELECT used INTO v_br_used FROM public.campaign_subject_daily
     WHERE day_tr = v_day AND campaign_id = c.id AND technique_key = p_technique_key AND subject_kind = 'browser' AND subject_hash = p_browser_hash
     FOR UPDATE;
    IF v_br_used >= t.ip_daily_limit THEN
      RETURN public.campaign__deny('tarayici_hakki_doldu');
    END IF;
  END IF;

  v_expires := v_now + make_interval(secs => s.reservation_ttl_seconds);
  INSERT INTO public.campaign_reservations (idempotency_key, campaign_id, technique_key, day_tr, month_tr, ip_hash, browser_hash,
    max_credits, created_at, expires_at)
  VALUES (p_idempotency_key, c.id, p_technique_key, v_day, v_month, p_ip_hash, p_browser_hash, v_max, v_now, v_expires)
  RETURNING id INTO v_id;

  UPDATE public.campaign_usage_daily SET reserved_analyses = reserved_analyses + 1, reserved_credits = reserved_credits + v_max, updated_at = v_now
   WHERE day_tr = v_day AND scope IN ('global', 'tech:' || c.id::text || ':' || p_technique_key);
  IF v_max > 0 THEN
    UPDATE public.campaign_usage_daily SET reserved_credits = reserved_credits + v_max, updated_at = v_now
     WHERE day_tr = v_month AND scope = 'month';
    UPDATE public.campaign_provider_state
       SET minute_window = v_minute, minute_count = v_minute_used + v_max
     WHERE provider = 'roxy';
  END IF;
  UPDATE public.campaign_subject_daily SET used = used + 1
   WHERE day_tr = v_day AND campaign_id = c.id AND technique_key = p_technique_key
     AND ((subject_kind = 'ip' AND subject_hash = p_ip_hash) OR (subject_kind = 'browser' AND subject_hash = p_browser_hash));

  RETURN jsonb_build_object('ok', true, 'replay', false, 'reservation_id', v_id, 'state', 'reserved', 'max_credits', v_max,
    'day_tr', v_day, 'expires_at', v_expires, 'comments_enabled', t.comments_enabled);
END;
$$;

-- ── Sonuçlandırma çekirdeği (iç) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign__finalize(p_reservation_id uuid, p_outcome text, p_spent integer, p_now timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  r public.campaign_reservations;
  v_outcome text := p_outcome;
  v_ledger integer;
  v_calls integer;
  v_spent integer;
  v_release boolean;
  v_state text;
  v_scope text;
BEGIN
  SELECT * INTO r FROM public.campaign_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.campaign__deny('rezervasyon_yok');
  END IF;
  IF r.state <> 'reserved' THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'state', r.state, 'outcome', r.outcome, 'spent_credits', r.spent_credits);
  END IF;

  SELECT coalesce(sum(credits), 0)::int, count(*)::int INTO v_ledger, v_calls
    FROM public.campaign_provider_calls WHERE reservation_id = r.id;

  -- Defterde çağrı varsa "ücretsiz" sonuçlar kabul edilmez.
  IF v_outcome = 'cache_hit' AND v_calls > 0 THEN v_outcome := 'completed'; END IF;
  IF v_outcome = 'aborted_no_call' AND v_calls > 0 THEN v_outcome := 'failed_after_call'; END IF;

  v_release := v_outcome = 'aborted_no_call';
  v_spent := CASE v_outcome
    WHEN 'cache_hit' THEN 0
    WHEN 'aborted_no_call' THEN 0
    WHEN 'completed' THEN greatest(coalesce(p_spent, 0), v_ledger)
    WHEN 'failed_after_call' THEN greatest(coalesce(p_spent, 0), v_ledger, CASE WHEN r.max_credits > 0 THEN 1 ELSE 0 END)
    WHEN 'expired' THEN greatest(r.max_credits::int, v_ledger)
  END;
  IF r.max_credits = 0 THEN v_spent := 0; END IF;
  v_spent := least(v_spent, 50);
  v_state := CASE WHEN v_release THEN 'released' WHEN v_outcome = 'expired' THEN 'expired' ELSE 'completed' END;
  v_scope := 'tech:' || r.campaign_id::text || ':' || r.technique_key;

  PERFORM public.campaign__lock_usage(r.day_tr, 'global');
  IF r.max_credits > 0 THEN
    PERFORM public.campaign__lock_usage(r.month_tr, 'month');
  END IF;
  PERFORM public.campaign__lock_usage(r.day_tr, v_scope);

  UPDATE public.campaign_usage_daily
     SET reserved_analyses = reserved_analyses - 1,
         reserved_credits = reserved_credits - r.max_credits,
         used_analyses = used_analyses + CASE WHEN v_release THEN 0 ELSE 1 END,
         spent_credits = spent_credits + v_spent,
         updated_at = p_now
   WHERE day_tr = r.day_tr AND scope IN ('global', v_scope);
  IF r.max_credits > 0 THEN
    UPDATE public.campaign_usage_daily
       SET reserved_credits = reserved_credits - r.max_credits, spent_credits = spent_credits + v_spent, updated_at = p_now
     WHERE day_tr = r.month_tr AND scope = 'month';
  END IF;
  IF v_release THEN
    UPDATE public.campaign_subject_daily SET used = greatest(used - 1, 0)
     WHERE day_tr = r.day_tr AND campaign_id = r.campaign_id AND technique_key = r.technique_key
       AND ((subject_kind = 'ip' AND subject_hash = r.ip_hash) OR (subject_kind = 'browser' AND subject_hash = r.browser_hash));
  END IF;

  UPDATE public.campaign_reservations
     SET state = v_state, outcome = v_outcome, spent_credits = v_spent, settled_at = p_now
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', v_state, 'outcome', v_outcome, 'spent_credits', v_spent);
END;
$$;

-- ── campaign_settle ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_settle(
  p_reservation_id uuid,
  p_outcome text,
  p_spent_credits integer DEFAULT NULL,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_reservation_id IS NULL OR p_outcome IS NULL
     OR p_outcome NOT IN ('completed', 'cache_hit', 'aborted_no_call', 'failed_after_call')
     OR (p_spent_credits IS NOT NULL AND p_spent_credits NOT BETWEEN 0 AND 50) THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  RETURN public.campaign__finalize(p_reservation_id, p_outcome, p_spent_credits, public.campaign__now(p_now));
END;
$$;

-- ── campaign_record_provider_call ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_record_provider_call(
  p_reservation_id uuid,
  p_provider text,
  p_endpoint text,
  p_http_status integer,
  p_outcome text,
  p_credits integer,
  p_remaining integer DEFAULT NULL,
  p_quota_limit integer DEFAULT NULL,
  p_reset_at timestamptz DEFAULT NULL,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  r public.campaign_reservations;
  v_now timestamptz := public.campaign__now(p_now);
BEGIN
  IF p_reservation_id IS NULL OR p_provider IS NULL OR p_provider <> 'roxy'
     OR p_endpoint IS NULL OR p_endpoint !~ '^[A-Za-z0-9_./\-]{1,120}$'
     OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599)
     OR p_outcome IS NULL OR p_outcome NOT IN ('ok', 'timeout', 'network_error', 'http_error', 'rate_limited')
     OR p_credits IS NULL OR p_credits NOT BETWEEN 0 AND 50
     OR (p_remaining IS NOT NULL AND p_remaining < 0) OR (p_quota_limit IS NOT NULL AND p_quota_limit < 0) THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  SELECT * INTO r FROM public.campaign_reservations WHERE id = p_reservation_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.campaign__deny('rezervasyon_yok');
  END IF;
  IF r.state <> 'reserved' THEN
    RETURN public.campaign__deny('rezervasyon_kapali');
  END IF;
  IF r.max_credits = 0 THEN
    RETURN public.campaign__deny('sifir_maliyetli_teknik');
  END IF;

  INSERT INTO public.campaign_provider_calls (reservation_id, provider, endpoint, http_status, outcome, credits, created_at)
  VALUES (r.id, p_provider, p_endpoint, p_http_status, p_outcome, p_credits, v_now);

  UPDATE public.campaign_provider_state
     SET remaining = CASE WHEN p_remaining IS NOT NULL THEN p_remaining ELSE remaining END,
         quota_limit = CASE WHEN p_quota_limit IS NOT NULL THEN p_quota_limit ELSE quota_limit END,
         reset_at = CASE WHEN p_remaining IS NOT NULL THEN p_reset_at ELSE reset_at END,
         observed_at = CASE WHEN p_remaining IS NOT NULL THEN v_now ELSE observed_at END,
         cooldown_until = CASE WHEN p_outcome = 'rate_limited' THEN v_now + interval '10 minutes' ELSE cooldown_until END
   WHERE provider = p_provider;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── campaign_observe_provider ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_observe_provider(
  p_provider text,
  p_remaining integer,
  p_quota_limit integer DEFAULT NULL,
  p_reset_at timestamptz DEFAULT NULL,
  p_rate_limited boolean DEFAULT false,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_now timestamptz := public.campaign__now(p_now);
BEGIN
  IF p_provider IS NULL OR p_provider <> 'roxy' OR (p_remaining IS NOT NULL AND p_remaining < 0)
     OR (p_quota_limit IS NOT NULL AND p_quota_limit < 0) OR (p_remaining IS NULL AND NOT coalesce(p_rate_limited, false)) THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  UPDATE public.campaign_provider_state
     SET remaining = coalesce(p_remaining, remaining),
         quota_limit = coalesce(p_quota_limit, quota_limit),
         reset_at = CASE WHEN p_remaining IS NOT NULL THEN p_reset_at ELSE reset_at END,
         observed_at = CASE WHEN p_remaining IS NOT NULL THEN v_now ELSE observed_at END,
         cooldown_until = CASE WHEN coalesce(p_rate_limited, false) THEN v_now + interval '10 minutes' ELSE cooldown_until END
   WHERE provider = p_provider;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── campaign_expire_stale ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_expire_stale(p_now timestamptz DEFAULT NULL, p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := public.campaign__now(p_now);
  v_id uuid;
  v_n integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.campaign_reservations
     WHERE state = 'reserved' AND expires_at < v_now
     ORDER BY expires_at
     LIMIT greatest(1, least(coalesce(p_limit, 500), 5000))
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.campaign__finalize(v_id, 'expired', NULL, v_now);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ── campaign_purge_subjects (veri en aza indirme) ────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_purge_subjects(p_keep_days integer DEFAULT 30, p_now timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cut date := public.campaign__day(public.campaign__now(p_now)) - greatest(1, least(coalesce(p_keep_days, 30), 400));
  v_subjects integer;
  v_res integer;
BEGIN
  DELETE FROM public.campaign_subject_daily WHERE day_tr < v_cut;
  GET DIAGNOSTICS v_subjects = ROW_COUNT;
  UPDATE public.campaign_reservations SET ip_hash = NULL, browser_hash = NULL
   WHERE day_tr < v_cut AND state <> 'reserved' AND (ip_hash IS NOT NULL OR browser_hash IS NOT NULL);
  GET DIAGNOSTICS v_res = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'cutoff_day', v_cut, 'subjects_deleted', v_subjects, 'reservations_anonymized', v_res);
END;
$$;

-- ── Owner: kampanya kaydet (oluştur / güncelle; durum hariç) ─────────────────
CREATE OR REPLACE FUNCTION public.campaign_admin_save(p_actor uuid, p_campaign_id uuid, p_expected_version integer, p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_allowed text[] := ARRAY['name', 'undated', 'starts_at', 'ends_at', 'slogan', 'alt_slogan', 'description', 'affirmation',
    'cta_text', 'cta_target', 'image_ref', 'hd_options', 'module_comments', 'catalog_version'];
  v_key text;
  c public.campaigns;
  v_before jsonb;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'CAMPAIGN_FIELDS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF NOT v_key = ANY (v_allowed) THEN
      RAISE EXCEPTION 'CAMPAIGN_FIELD_UNKNOWN %', v_key USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF p_campaign_id IS NULL THEN
    INSERT INTO public.campaigns (name, undated, starts_at, ends_at, slogan, alt_slogan, description, affirmation, cta_text,
      cta_target, image_ref, hd_options, module_comments, catalog_version, created_by, updated_by)
    VALUES (
      coalesce(p_fields->>'name', ''),
      coalesce((p_fields->>'undated')::boolean, true),
      (p_fields->>'starts_at')::timestamptz,
      (p_fields->>'ends_at')::timestamptz,
      coalesce(p_fields->>'slogan', ''), coalesce(p_fields->>'alt_slogan', ''), coalesce(p_fields->>'description', ''),
      coalesce(p_fields->>'affirmation', ''), coalesce(p_fields->>'cta_text', ''), coalesce(p_fields->>'cta_target', 'bolum'),
      p_fields->>'image_ref',
      coalesce(p_fields->'hd_options', '{"word": true, "kb": true}'::jsonb),
      coalesce(p_fields->'module_comments', '{}'::jsonb),
      coalesce((p_fields->>'catalog_version')::int, 1),
      p_actor, p_actor)
    RETURNING * INTO c;
    PERFORM public.campaign__audit(p_actor, 'campaign_create', c.id, jsonb_build_object('fields', p_fields));
    RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version);
  END IF;

  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR c.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_version IS NULL OR c.version <> p_expected_version THEN
    RAISE EXCEPTION 'CAMPAIGN_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  v_before := to_jsonb(c) - 'created_at' - 'created_by';

  UPDATE public.campaigns SET
    name = CASE WHEN p_fields ? 'name' THEN p_fields->>'name' ELSE name END,
    undated = CASE WHEN p_fields ? 'undated' THEN (p_fields->>'undated')::boolean ELSE undated END,
    starts_at = CASE WHEN p_fields ? 'starts_at' THEN (p_fields->>'starts_at')::timestamptz ELSE starts_at END,
    ends_at = CASE WHEN p_fields ? 'ends_at' THEN (p_fields->>'ends_at')::timestamptz ELSE ends_at END,
    slogan = CASE WHEN p_fields ? 'slogan' THEN coalesce(p_fields->>'slogan', '') ELSE slogan END,
    alt_slogan = CASE WHEN p_fields ? 'alt_slogan' THEN coalesce(p_fields->>'alt_slogan', '') ELSE alt_slogan END,
    description = CASE WHEN p_fields ? 'description' THEN coalesce(p_fields->>'description', '') ELSE description END,
    affirmation = CASE WHEN p_fields ? 'affirmation' THEN coalesce(p_fields->>'affirmation', '') ELSE affirmation END,
    cta_text = CASE WHEN p_fields ? 'cta_text' THEN coalesce(p_fields->>'cta_text', '') ELSE cta_text END,
    cta_target = CASE WHEN p_fields ? 'cta_target' THEN coalesce(p_fields->>'cta_target', 'bolum') ELSE cta_target END,
    image_ref = CASE WHEN p_fields ? 'image_ref' THEN p_fields->>'image_ref' ELSE image_ref END,
    hd_options = CASE WHEN p_fields ? 'hd_options' THEN p_fields->'hd_options' ELSE hd_options END,
    module_comments = CASE WHEN p_fields ? 'module_comments' THEN p_fields->'module_comments' ELSE module_comments END,
    catalog_version = CASE WHEN p_fields ? 'catalog_version' THEN (p_fields->>'catalog_version')::int ELSE catalog_version END,
    version = version + 1, updated_by = p_actor, updated_at = now()
  WHERE id = c.id
  RETURNING * INTO c;
  PERFORM public.campaign__audit(p_actor, 'campaign_update', c.id, jsonb_build_object('before', v_before, 'fields', p_fields));
  RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version);
END;
$$;

-- ── Owner: durum (tek yayındaki kampanya kuralı) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_admin_set_status(p_actor uuid, p_campaign_id uuid, p_status text, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  c public.campaigns;
  v_closed uuid[] := '{}';
  v_other uuid;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_status IS NULL OR p_status NOT IN ('kapali', 'yakinda', 'aktif') THEN
    RAISE EXCEPTION 'CAMPAIGN_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR c.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_version IS NULL OR c.version <> p_expected_version THEN
    RAISE EXCEPTION 'CAMPAIGN_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_status IN ('yakinda', 'aktif') THEN
    FOR v_other IN
      UPDATE public.campaigns SET status = 'kapali', version = version + 1, updated_by = p_actor, updated_at = now()
       WHERE status IN ('yakinda', 'aktif') AND archived_at IS NULL AND id <> c.id
      RETURNING id
    LOOP
      v_closed := v_closed || v_other;
      PERFORM public.campaign__audit(p_actor, 'campaign_auto_close', v_other, jsonb_build_object('reason', 'baska_kampanya_yayinda', 'by', c.id));
    END LOOP;
  END IF;
  UPDATE public.campaigns SET status = p_status, version = version + 1, updated_by = p_actor, updated_at = now()
   WHERE id = c.id RETURNING * INTO c;
  PERFORM public.campaign__audit(p_actor, 'campaign_status', c.id, jsonb_build_object('status', p_status, 'closed', to_jsonb(v_closed)));
  RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'status', c.status, 'closed', to_jsonb(v_closed));
END;
$$;

-- ── Owner: teknik / paket satırları (silinmez; listede olmayan → enabled=false) ─
CREATE OR REPLACE FUNCTION public.campaign_admin_set_techniques(p_actor uuid, p_campaign_id uuid, p_expected_version integer, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  c public.campaigns;
  it jsonb;
  v_keys text[] := '{}';
  v_key text;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'CAMPAIGN_ITEMS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR c.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_version IS NULL OR c.version <> p_expected_version THEN
    RAISE EXCEPTION 'CAMPAIGN_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_key := it->>'technique_key';
    IF v_key IS NULL OR v_key = ANY (v_keys) THEN
      RAISE EXCEPTION 'CAMPAIGN_ITEM_DUPLICATE_OR_MISSING' USING ERRCODE = 'P0001';
    END IF;
    v_keys := v_keys || v_key;
    INSERT INTO public.campaign_techniques (campaign_id, technique_key, enabled, ip_daily_limit, daily_analysis_limit,
      daily_credit_budget, max_credit_per_analysis, comments_enabled, updated_at)
    VALUES (c.id, v_key, coalesce((it->>'enabled')::boolean, false), (it->>'ip_daily_limit')::int,
      (it->>'daily_analysis_limit')::int, (it->>'daily_credit_budget')::int, (it->>'max_credit_per_analysis')::smallint,
      coalesce((it->>'comments_enabled')::boolean, false), now())
    ON CONFLICT (campaign_id, technique_key) DO UPDATE SET
      enabled = EXCLUDED.enabled, ip_daily_limit = EXCLUDED.ip_daily_limit, daily_analysis_limit = EXCLUDED.daily_analysis_limit,
      daily_credit_budget = EXCLUDED.daily_credit_budget, max_credit_per_analysis = EXCLUDED.max_credit_per_analysis,
      comments_enabled = EXCLUDED.comments_enabled, updated_at = now();
  END LOOP;
  UPDATE public.campaign_techniques SET enabled = false, updated_at = now()
   WHERE campaign_id = c.id AND enabled AND NOT (technique_key = ANY (v_keys));
  UPDATE public.campaigns SET version = version + 1, updated_by = p_actor, updated_at = now() WHERE id = c.id RETURNING * INTO c;
  PERFORM public.campaign__audit(p_actor, 'campaign_techniques', c.id, jsonb_build_object('items', p_items));
  RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'count', coalesce(array_length(v_keys, 1), 0));
END;
$$;

-- ── Owner: arşivle (yalnız kapalı kampanya; satır silinmez) ──────────────────
CREATE OR REPLACE FUNCTION public.campaign_admin_archive(p_actor uuid, p_campaign_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE c public.campaigns;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR c.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_version IS NULL OR c.version <> p_expected_version THEN
    RAISE EXCEPTION 'CAMPAIGN_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF c.status <> 'kapali' THEN
    RAISE EXCEPTION 'CAMPAIGN_ARCHIVE_REQUIRES_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.campaigns SET archived_at = now(), version = version + 1, updated_by = p_actor, updated_at = now()
   WHERE id = c.id RETURNING * INTO c;
  PERFORM public.campaign__audit(p_actor, 'campaign_archive', c.id, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version);
END;
$$;

-- ── Owner: genel ayar ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_admin_update_settings(p_actor uuid, p_expected_version integer, p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_allowed text[] := ARRAY['kill_switch', 'global_daily_credit_budget', 'global_daily_analysis_limit', 'provider_monthly_quota',
    'expert_reserve_pct', 'provider_minute_limit', 'provider_state_max_age_seconds', 'reservation_ttl_seconds'];
  v_key text;
  s public.campaign_settings;
  v_before jsonb;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'CAMPAIGN_FIELDS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF NOT v_key = ANY (v_allowed) THEN
      RAISE EXCEPTION 'CAMPAIGN_FIELD_UNKNOWN %', v_key USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  SELECT * INTO s FROM public.campaign_settings WHERE id FOR UPDATE;
  IF p_expected_version IS NULL OR s.version <> p_expected_version THEN
    RAISE EXCEPTION 'CAMPAIGN_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  v_before := to_jsonb(s);
  UPDATE public.campaign_settings SET
    kill_switch = CASE WHEN p_fields ? 'kill_switch' THEN (p_fields->>'kill_switch')::boolean ELSE kill_switch END,
    global_daily_credit_budget = CASE WHEN p_fields ? 'global_daily_credit_budget' THEN (p_fields->>'global_daily_credit_budget')::int ELSE global_daily_credit_budget END,
    global_daily_analysis_limit = CASE WHEN p_fields ? 'global_daily_analysis_limit' THEN (p_fields->>'global_daily_analysis_limit')::int ELSE global_daily_analysis_limit END,
    provider_monthly_quota = CASE WHEN p_fields ? 'provider_monthly_quota' THEN (p_fields->>'provider_monthly_quota')::int ELSE provider_monthly_quota END,
    expert_reserve_pct = CASE WHEN p_fields ? 'expert_reserve_pct' THEN (p_fields->>'expert_reserve_pct')::smallint ELSE expert_reserve_pct END,
    provider_minute_limit = CASE WHEN p_fields ? 'provider_minute_limit' THEN (p_fields->>'provider_minute_limit')::int ELSE provider_minute_limit END,
    provider_state_max_age_seconds = CASE WHEN p_fields ? 'provider_state_max_age_seconds' THEN (p_fields->>'provider_state_max_age_seconds')::int ELSE provider_state_max_age_seconds END,
    reservation_ttl_seconds = CASE WHEN p_fields ? 'reservation_ttl_seconds' THEN (p_fields->>'reservation_ttl_seconds')::int ELSE reservation_ttl_seconds END,
    version = version + 1, updated_by = p_actor, updated_at = now()
  WHERE id RETURNING * INTO s;
  PERFORM public.campaign__audit(p_actor, 'settings_update', NULL, jsonb_build_object('before', v_before, 'fields', p_fields));
  RETURN jsonb_build_object('ok', true, 'version', s.version);
END;
$$;

-- ── Owner: reklam metni şablonları ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_admin_save_template(p_actor uuid, p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'CAMPAIGN_FIELDS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.campaign_text_templates (slogan, alt_slogan, description, affirmation, cta_text, created_by)
  VALUES (coalesce(p_fields->>'slogan', ''), coalesce(p_fields->>'alt_slogan', ''), coalesce(p_fields->>'description', ''),
    coalesce(p_fields->>'affirmation', ''), coalesce(p_fields->>'cta_text', ''), p_actor)
  RETURNING id INTO v_id;
  PERFORM public.campaign__audit(p_actor, 'template_create', NULL, jsonb_build_object('template_id', v_id));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.campaign_admin_archive_template(p_actor uuid, p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  UPDATE public.campaign_text_templates SET archived_at = now() WHERE id = p_template_id AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAMPAIGN_TEMPLATE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.campaign__audit(p_actor, 'template_archive', NULL, jsonb_build_object('template_id', p_template_id));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Yürütme izinleri ─────────────────────────────────────────────────────────
-- İç yardımcılar: herkese (service_role dahil) kapalı.
REVOKE ALL ON FUNCTION public.campaign__now(timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.campaign__day(timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.campaign__deny(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.campaign__require_owner(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.campaign__audit(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.campaign__lock_usage(date, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.campaign__finalize(uuid, text, integer, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

-- Sunucu RPC'leri: yalnız service_role.
REVOKE ALL ON FUNCTION public.campaign_reserve(text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_settle(uuid, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_record_provider_call(uuid, text, text, integer, text, integer, integer, integer, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_observe_provider(text, integer, integer, timestamptz, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_expire_stale(timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_purge_subjects(integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_save(uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_set_status(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_set_techniques(uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_archive(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_update_settings(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_save_template(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_archive_template(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.campaign_reserve(text, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_settle(uuid, text, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_record_provider_call(uuid, text, text, integer, text, integer, integer, integer, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_observe_provider(text, integer, integer, timestamptz, boolean, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_expire_stale(timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_purge_subjects(integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_save(uuid, uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_set_status(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_set_techniques(uuid, uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_archive(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_update_settings(uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_save_template(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_archive_template(uuid, uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
