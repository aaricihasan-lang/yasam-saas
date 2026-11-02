-- =============================================================================
-- 20271229000500_campaign_provider_gap_hardening.sql
--
-- KAMPANYA MERKEZİ — B-4 (bağımsız güvenlik denetimi, 02.11.2026): sağlayıcı (Roxy) başlık farkının sorgusuz 7 gün geçerli
-- sayılması. YALNIZ yerel geçici DB'de çalıştırıldı — production'a uygulanması AYRI Owner onayı ister.
-- BAĞIMLILIK: 20271229000000 + 000100 + 000200 + 000300 (000400 ile bağımsız).
--
-- SORUN: X-RateLimit-Remaining ANAHTAR sayacıdır; hesabın gerçek kalanı (/usage) hesaptaki TÜM anahtarların tüketimiyle düşer.
-- Fark (başlık − gerçek) yalnız bu anahtar kullanılıyorsa sabit kalır. Aynı hesapta başka bir anahtar tüketirse fark büyür;
-- eski fark ile hesaplanan "kalan" gerçek kalandan YÜKSEK çıkar ve uzman payı aşınabilir. 000300 farkı 7 gün kabul ediyordu.
--
-- ÇÖZÜM (fail-closed):
--   1) Tek gözlemli fark DOĞRULANMAMIŞTIR. Fark, aynı UTC ayında en az 1 saat arayla (≤ 48 saat) yapılan iki Owner /usage
--      okumasında tolerans içinde (max(2, plan sınırının ‰0,5'i)) aynı kalırsa doğrulanır → bu, aradaki sürede başka anahtar
--      tüketimi olmadığının gerçek gözlemidir.
--   2) Doğrulanmış fark EN FAZLA 24 SAAT geçerlidir (7 gün yerine). Süre dolunca başlık gözlemi kalanı güncellemez → durum
--      15 dk içinde bayatlar → ücretli rezervasyon saglayici_durumu_bilinmiyor (mevcut campaign_reserve kuralı).
--   3) Farkta kayma (tolerans dışı) = başka anahtar / izlenemeyen tüketim şüphesi → doğrulama SİLİNİR, kayma kaydedilir;
--      yeniden iki tutarlı okuma gerekir. Owner'a panelde gösterilir.
--   4) Başlıktan türetilen kalan aynı ay içinde ASLA yükselmez (son kayıtlı kalanla sınırlı); kredi eklenmesi yalnız Owner'ın
--      gerçek /usage okumasıyla görünür.
--   5) Owner /usage okuması (gerçek kalan) önceki gibi doğrudan kalan olarak yazılır (15 dk tazelik kuralı campaign_reserve'de).
-- Aylık plan sınırı ve dakika sınırı campaign_reserve'de AYRI denetlenmeye devam eder (bu migration değiştirmez).
-- Mevcut RPC'ler (campaign_reserve / authorize_call / settle / observe_provider / record_provider_call) DEĞİŞMEZ.
-- DROP / TRUNCATE / DELETE yok. Yalnız iki 000300 RPC'si CREATE OR REPLACE ile sertleştirilir (imzalar aynı).
-- =============================================================================

BEGIN;

ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS gap_verified_at timestamptz NULL;
ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS gap_drift integer NULL;
ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS gap_drift_at timestamptz NULL;
ALTER TABLE public.campaign_provider_state ADD COLUMN IF NOT EXISTS usage_remaining_real integer NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_ps_real_chk') THEN
    ALTER TABLE public.campaign_provider_state
      ADD CONSTRAINT campaign_ps_real_chk CHECK (usage_remaining_real IS NULL OR usage_remaining_real >= 0);
  END IF;
END $$;

-- Sabitler tek yerde (testler ve production son kontrolü bunları okur).
CREATE OR REPLACE FUNCTION public.campaign__gap_policy()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object('valid_hours', 24, 'min_spacing_minutes', 60, 'compare_max_hours', 48, 'tol_abs', 2, 'tol_permille', 0.5);
$$;

-- ── Owner: gerçek hesap kalanı (/usage) + fark doğrulaması ──────────────────
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
  v_window text := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM');
  ps public.campaign_provider_state;
  v_gap integer;
  v_limit integer;
  v_tol integer;
  v_comparable boolean := false;
  v_spaced boolean := false;
  v_drift integer := NULL;
  v_status text;
  v_keep_baseline boolean := false;
  v_verified_at timestamptz := NULL;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_remaining_real IS NULL OR p_remaining_real < 0 OR p_remaining_real > 100000000
     OR (p_header_remaining IS NOT NULL AND (p_header_remaining < 0 OR p_header_remaining > 100000000))
     OR (p_quota_limit IS NOT NULL AND (p_quota_limit < 1 OR p_quota_limit > 100000000)) THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  SELECT * INTO ps FROM public.campaign_provider_state WHERE provider = 'roxy' FOR UPDATE;
  v_gap := CASE WHEN p_header_remaining IS NULL THEN NULL ELSE greatest(0, p_header_remaining - p_remaining_real) END;
  v_limit := coalesce(p_quota_limit, ps.quota_limit, 0);
  v_tol := greatest(2, ceil(v_limit::numeric * 0.5 / 1000.0)::int);

  IF v_gap IS NULL THEN
    v_status := 'fark_yok';
  ELSE
    v_comparable := ps.remaining_gap IS NOT NULL AND ps.gap_observed_at IS NOT NULL AND ps.gap_window = v_window
                    AND ps.gap_observed_at >= v_now - interval '48 hours' AND ps.gap_observed_at <= v_now;
    IF v_comparable THEN
      v_drift := v_gap - ps.remaining_gap;
      v_spaced := ps.gap_observed_at <= v_now - interval '60 minutes';
    END IF;
    IF v_comparable AND abs(v_drift) > v_tol THEN
      v_status := 'kayma';                       -- başka anahtar / izlenemeyen tüketim şüphesi → doğrulama silinir
    ELSIF v_comparable AND v_spaced THEN
      v_status := 'dogrulandi';
      v_verified_at := v_now;
    ELSIF v_comparable THEN
      -- 1 saatten yakın tutarlı okuma: eski taban korunur (ayrım süresine ulaşılabilsin), önceki doğrulama sürer.
      v_status := CASE WHEN ps.gap_verified_at IS NOT NULL AND ps.gap_verified_at >= v_now - interval '24 hours' THEN 'dogrulandi' ELSE 'bekliyor_ara' END;
      v_verified_at := CASE WHEN v_status = 'dogrulandi' THEN ps.gap_verified_at ELSE NULL END;
      v_keep_baseline := true;
    ELSE
      v_status := 'ilk_gozlem';                  -- karşılaştırılacak (aynı ay, ≤ 48 sa) önceki okuma yok
    END IF;
  END IF;

  UPDATE public.campaign_provider_state
     SET remaining = p_remaining_real,
         observed_at = v_now,
         usage_observed_at = v_now,
         usage_remaining_real = p_remaining_real,
         quota_limit = coalesce(p_quota_limit, quota_limit),
         limit_observed_at = CASE WHEN p_quota_limit IS NOT NULL THEN v_now ELSE limit_observed_at END,
         reset_at = coalesce(p_reset_at, reset_at),
         remaining_gap = CASE WHEN v_keep_baseline THEN remaining_gap ELSE v_gap END,
         gap_observed_at = CASE WHEN v_keep_baseline THEN gap_observed_at WHEN v_gap IS NULL THEN NULL ELSE v_now END,
         gap_window = CASE WHEN v_keep_baseline THEN gap_window WHEN v_gap IS NULL THEN NULL ELSE v_window END,
         gap_verified_at = v_verified_at,
         gap_drift = CASE WHEN v_comparable THEN v_drift ELSE NULL END,
         gap_drift_at = CASE WHEN v_status = 'kayma' THEN v_now ELSE gap_drift_at END
   WHERE provider = 'roxy';
  PERFORM public.campaign__audit(p_actor, 'provider_usage_observed', NULL,
    jsonb_build_object('remaining', p_remaining_real, 'header_remaining', p_header_remaining, 'gap', v_gap, 'quota_limit', p_quota_limit,
                       'gap_status', v_status, 'drift', v_drift, 'tolerance', v_tol));
  RETURN jsonb_build_object('ok', true, 'gap', v_gap, 'gap_status', v_status, 'drift', v_drift, 'tolerance', v_tol,
                            'verified_until', CASE WHEN v_verified_at IS NULL THEN NULL ELSE v_verified_at + interval '24 hours' END);
END;
$$;

-- ── Başlık gözlemi: yalnız DOĞRULANMIŞ (≤ 24 sa) farkla, kalan aynı ayda yükselmez ──
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
  v_window text := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM');
  v_at timestamptz;
  ps public.campaign_provider_state;
  v_rem integer;
BEGIN
  IF (p_header_remaining IS NOT NULL AND (p_header_remaining < 0 OR p_header_remaining > 100000000))
     OR (p_quota_limit IS NOT NULL AND (p_quota_limit < 1 OR p_quota_limit > 100000000))
     OR (p_header_remaining IS NULL AND p_quota_limit IS NULL) THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
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
  IF ps.remaining_gap IS NULL OR ps.gap_window IS DISTINCT FROM v_window THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'why', 'fark_bilinmiyor');
  END IF;
  IF ps.gap_verified_at IS NULL OR ps.gap_verified_at < v_now - interval '24 hours' OR ps.gap_verified_at > v_now
     OR (ps.gap_drift_at IS NOT NULL AND ps.gap_drift_at >= ps.gap_verified_at) THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'why', 'fark_dogrulanmadi');
  END IF;
  IF ps.observed_at IS NOT NULL AND v_at < ps.observed_at THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'why', 'daha_yeni_gozlem_var');
  END IF;
  v_rem := greatest(0, p_header_remaining - ps.remaining_gap);
  -- Aynı ayda başlıktan türetilen kalan yükselemez (kredi ekleme / anahtar değişimi yalnız Owner /usage okumasıyla görünür).
  IF ps.remaining IS NOT NULL AND ps.observed_at IS NOT NULL AND to_char(ps.observed_at AT TIME ZONE 'UTC', 'YYYY-MM') = v_window THEN
    v_rem := least(v_rem, ps.remaining);
  END IF;
  UPDATE public.campaign_provider_state
     SET remaining = v_rem, observed_at = v_at, reset_at = coalesce(p_reset_at, reset_at)
   WHERE provider = 'roxy';
  RETURN jsonb_build_object('ok', true, 'applied', true, 'remaining', v_rem);
END;
$$;

REVOKE ALL ON FUNCTION public.campaign__gap_policy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_observe_usage(uuid, integer, integer, integer, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_observe_header(integer, integer, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign__gap_policy() TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_observe_usage(uuid, integer, integer, integer, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_observe_header(integer, integer, timestamptz, timestamptz, timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
