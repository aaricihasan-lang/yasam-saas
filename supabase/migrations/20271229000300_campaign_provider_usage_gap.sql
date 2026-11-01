-- =============================================================================
-- 20271229000300_campaign_provider_usage_gap.sql
--
-- KAMPANYA MERKEZİ — KM-3: sağlayıcı (Roxy) GERÇEK hesap kalanı gözlemi. Owner talimatı 2026-11-01 ("Roxy kredi hesabını
-- tahmine dayandırma; sağlayıcının gerçek yanıtları ve mevcut muhasebe sistemiyle doğrula"). YALNIZ yerel geçici DB'de
-- çalıştırıldı — production'a uygulanması AYRI Owner onayı ister. BAĞIMLILIK: 20271229000000 + 000100 (+ 000200).
--
-- SORUN: Yanıt başlığındaki X-RateLimit-Remaining ANAHTAR/pencere sayacıdır; hesabın gerçek kalanı (/usage) ondan DÜŞÜKTÜR
-- (canlı ölçüm 29.10.2026: başlık 49.629 ↔ hesap 27.709). Başlığı doğrudan "kalan" saymak uzman payını aşındırabilir.
-- ÇÖZÜM:
--   * campaign_observe_usage  : Owner'ın açıkça başlattığı /usage okuması (1 kredi) → gerçek kalan + o andaki başlık farkı
--                               (remaining_gap = max(0, başlık − gerçek)) kalıcı yazılır. Owner yeniden doğrulanır, denetlenir.
--   * campaign_observe_header : sonraki başlık gözlemleri (kampanya çağrıları + uzman Klasik Numeroloji defteri) yalnız
--                               GEÇERLİ bir fark varken (aynı UTC ayı, ≤ 7 gün) "kalan = başlık − fark" olarak işlenir.
--                               Fark yoksa / bayatsa kalan GÜNCELLENMEZ → durum bayatlar → ücretli çağrı fail-closed.
-- Mevcut RPC'ler (campaign_observe_provider / campaign_record_provider_call) DEĞİŞMEZ. DROP / TRUNCATE / DELETE yok.
-- =============================================================================

BEGIN;

ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS remaining_gap integer NULL;
ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS gap_observed_at timestamptz NULL;
ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS gap_window text NULL;
ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS usage_observed_at timestamptz NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_ps_gap_chk') THEN
    ALTER TABLE public.campaign_provider_state
      ADD CONSTRAINT campaign_ps_gap_chk CHECK ((remaining_gap IS NULL OR remaining_gap >= 0)
        AND (gap_window IS NULL OR gap_window ~ '^[0-9]{4}-[0-9]{2}$'));
  END IF;
END $$;

-- ── Owner: gerçek hesap kalanı (/usage) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_observe_usage(
  p_actor uuid,
  p_remaining_real integer,
  p_header_remaining integer,
  p_quota_limit integer,
  p_reset_at timestamptz DEFAULT NULL,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := public.campaign__now(p_now);
  v_gap integer;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_remaining_real IS NULL OR p_remaining_real < 0 OR p_remaining_real > 100000000
     OR (p_header_remaining IS NOT NULL AND (p_header_remaining < 0 OR p_header_remaining > 100000000))
     OR (p_quota_limit IS NOT NULL AND (p_quota_limit < 1 OR p_quota_limit > 100000000)) THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  v_gap := CASE WHEN p_header_remaining IS NULL THEN NULL ELSE greatest(0, p_header_remaining - p_remaining_real) END;
  UPDATE public.campaign_provider_state
     SET remaining = p_remaining_real,
         observed_at = v_now,
         usage_observed_at = v_now,
         quota_limit = coalesce(p_quota_limit, quota_limit),
         limit_observed_at = CASE WHEN p_quota_limit IS NOT NULL THEN v_now ELSE limit_observed_at END,
         reset_at = coalesce(p_reset_at, reset_at),
         remaining_gap = v_gap,
         gap_observed_at = CASE WHEN v_gap IS NULL THEN NULL ELSE v_now END,
         gap_window = CASE WHEN v_gap IS NULL THEN NULL ELSE to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM') END
   WHERE provider = 'roxy';
  PERFORM public.campaign__audit(p_actor, 'provider_usage_observed', NULL,
    jsonb_build_object('remaining', p_remaining_real, 'header_remaining', p_header_remaining, 'gap', v_gap, 'quota_limit', p_quota_limit));
  RETURN jsonb_build_object('ok', true, 'gap', v_gap);
END;
$$;

-- ── Başlık gözlemi (kampanya çağrıları + uzman Klasik Numeroloji defteri) ────
CREATE OR REPLACE FUNCTION public.campaign_observe_header(
  p_header_remaining integer,
  p_quota_limit integer DEFAULT NULL,
  p_reset_at timestamptz DEFAULT NULL,
  p_observed_at timestamptz DEFAULT NULL,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := public.campaign__now(p_now);
  v_at timestamptz;
  ps public.campaign_provider_state;
  v_rem integer;
  v_gap_ok boolean;
BEGIN
  IF (p_header_remaining IS NOT NULL AND (p_header_remaining < 0 OR p_header_remaining > 100000000))
     OR (p_quota_limit IS NOT NULL AND (p_quota_limit < 1 OR p_quota_limit > 100000000))
     OR (p_header_remaining IS NULL AND p_quota_limit IS NULL) THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  -- Gözlem anı gelecekte olamaz; verilmezse şimdi. Çok eski gözlem (10 dk) tazelik sağlamaz.
  v_at := least(coalesce(p_observed_at, v_now), v_now);
  IF v_at < v_now - interval '10 minutes' THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'why', 'eski_gozlem');
  END IF;
  SELECT * INTO ps FROM public.campaign_provider_state WHERE provider = 'roxy' FOR UPDATE;
  IF p_quota_limit IS NOT NULL THEN
    UPDATE public.campaign_provider_state SET quota_limit = p_quota_limit, limit_observed_at = v_at WHERE provider = 'roxy';
  END IF;
  IF p_header_remaining IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'why', 'kalan_yok');
  END IF;
  v_gap_ok := ps.remaining_gap IS NOT NULL AND ps.gap_observed_at IS NOT NULL
              AND ps.gap_observed_at >= v_now - interval '7 days'
              AND ps.gap_window = to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM');
  IF NOT v_gap_ok THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'why', 'fark_bilinmiyor');
  END IF;
  v_rem := greatest(0, p_header_remaining - ps.remaining_gap);
  -- Sıra dışı (daha eski) gözlem daha yeni ve daha düşük değeri ezmesin: yalnız daha yeni anlı gözlem uygulanır.
  IF ps.observed_at IS NOT NULL AND v_at < ps.observed_at THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'why', 'daha_yeni_gozlem_var');
  END IF;
  UPDATE public.campaign_provider_state
     SET remaining = v_rem, observed_at = v_at, reset_at = coalesce(p_reset_at, reset_at)
   WHERE provider = 'roxy';
  RETURN jsonb_build_object('ok', true, 'applied', true, 'remaining', v_rem);
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_observe_usage(uuid, integer, integer, integer, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_observe_header(integer, integer, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_observe_usage(uuid, integer, integer, integer, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_observe_header(integer, integer, timestamptz, timestamptz, timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
