-- =============================================================================
-- 20271229000400_campaign_event_stats.sql
--
-- KAMPANYA MERKEZİ — gece operasyonu (02.11.2026): GERÇEK kampanya istatistikleri altyapısı. YALNIZ yerel geçici DB'de
-- çalıştırıldı — production'a uygulanması AYRI Owner onayı ister. BAĞIMLILIK: 20271229000000 + 000100 (+ 000200, 000300).
--
-- NE TUTULUR (veri en aza indirme):
--   campaign_event_daily   : Türkiye günü × kampanya × olay × teknik × UTM kaynağı başına TOPLU SAYAÇ. IP, çerez, tarayıcı
--                            kimliği, ad, doğum bilgisi YOK. Olaylar: sayfa (görüntüleme), analiz_baslat, analiz_tamam,
--                            rapor_indir, uyelik_tikla. analiz_baslat / analiz_tamam ayrıca rezervasyonlardan da doğrulanabilir.
--   campaign_event_uniques : YALNIZ analitik onayı veren tarayıcının günlük dönen HMAC özeti (64 hex; sunucuda üretilir,
--                            ham kimlik DB'ye gelmez). Tekil ziyaret = günlük özet sayısı. Varsayılan saklama 90 gün.
-- DÖNÜŞÜM (üyelik tamamlama) bu tablolarda YOK: kampanya ↔ kayıt bağlantısı kurulmadı (kişisel veri birleştirmesi gerekir);
-- panel bunu "Veri henüz toplanmıyor" olarak gösterir.
-- Yazma YALNIZ SECURITY DEFINER RPC ile (service_role); tablolar RLS açık, service_role yalnız SELECT. DROP / TRUNCATE yok.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_event_daily (
  day_tr date NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  event text NOT NULL,
  technique_key text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '',
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_tr, campaign_id, event, technique_key, utm_source),
  CONSTRAINT campaign_ed_event_chk CHECK (event IN ('sayfa', 'analiz_baslat', 'analiz_tamam', 'rapor_indir', 'uyelik_tikla')),
  CONSTRAINT campaign_ed_tech_chk CHECK (technique_key = '' OR technique_key ~ '^[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$'),
  CONSTRAINT campaign_ed_utm_chk CHECK (utm_source ~ '^[a-z0-9_.-]{0,40}$'),
  CONSTRAINT campaign_ed_count_chk CHECK (count BETWEEN 0 AND 100000000)
);

CREATE TABLE IF NOT EXISTS public.campaign_event_uniques (
  day_tr date NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  subject_hash text NOT NULL,
  PRIMARY KEY (day_tr, campaign_id, subject_hash),
  CONSTRAINT campaign_eu_hash_chk CHECK (subject_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS campaign_event_daily_campaign_day_idx ON public.campaign_event_daily (campaign_id, day_tr);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaign_event_daily', 'campaign_event_uniques'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- ── Olay kaydı (herkese açık uç → sunucu → bu RPC) ──────────────────────────
-- Yalnız yayındaki (aktif / yakında, arşivlenmemiş) kampanya için; teknik verilmişse o kampanyada açık olmalı.
CREATE OR REPLACE FUNCTION public.campaign_record_event(
  p_campaign_id uuid,
  p_event text,
  p_technique_key text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_subject_hash text DEFAULT NULL,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := public.campaign__now(p_now);
  v_day date := public.campaign__day(public.campaign__now(p_now));
  v_tech text := coalesce(p_technique_key, '');
  v_utm text := lower(coalesce(p_utm_source, ''));
  v_unique boolean := false;
BEGIN
  IF p_campaign_id IS NULL OR p_event IS NULL
     OR p_event NOT IN ('sayfa', 'analiz_baslat', 'analiz_tamam', 'rapor_indir', 'uyelik_tikla')
     OR (v_tech <> '' AND v_tech !~ '^[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$')
     OR v_utm !~ '^[a-z0-9_.-]{0,40}$'
     OR (p_subject_hash IS NOT NULL AND p_subject_hash !~ '^[0-9a-f]{64}$') THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = p_campaign_id AND c.archived_at IS NULL AND c.status IN ('aktif', 'yakinda')) THEN
    RETURN public.campaign__deny('kampanya_kapali');
  END IF;
  IF v_tech <> '' AND NOT EXISTS (SELECT 1 FROM public.campaign_techniques t WHERE t.campaign_id = p_campaign_id AND t.technique_key = v_tech AND t.enabled) THEN
    RETURN public.campaign__deny('teknik_kapali');
  END IF;
  INSERT INTO public.campaign_event_daily AS d (day_tr, campaign_id, event, technique_key, utm_source, count, updated_at)
  VALUES (v_day, p_campaign_id, p_event, v_tech, v_utm, 1, v_now)
  ON CONFLICT (day_tr, campaign_id, event, technique_key, utm_source)
  DO UPDATE SET count = least(d.count + 1, 100000000), updated_at = v_now;
  IF p_subject_hash IS NOT NULL THEN
    INSERT INTO public.campaign_event_uniques (day_tr, campaign_id, subject_hash) VALUES (v_day, p_campaign_id, p_subject_hash)
    ON CONFLICT DO NOTHING;
    v_unique := FOUND;
  END IF;
  RETURN jsonb_build_object('ok', true, 'day_tr', v_day, 'new_unique', v_unique);
END;
$$;

-- ── Tekil özet saklama (veri en aza indirme; toplu sayaçlar kişisel veri içermez, silinmez) ──
CREATE OR REPLACE FUNCTION public.campaign_purge_event_subjects(p_keep_days integer DEFAULT 90, p_now timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cut date;
  v_n integer;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 1 OR p_keep_days > 400 THEN
    RETURN public.campaign__deny('gecersiz_istek');
  END IF;
  v_cut := public.campaign__day(public.campaign__now(p_now)) - p_keep_days;
  DELETE FROM public.campaign_event_uniques WHERE day_tr < v_cut;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n, 'before', v_cut);
END;
$$;

-- ── Panel: gün × kampanya tekil sayısı (özetlerin kendisi panele gelmez) ──────
CREATE OR REPLACE FUNCTION public.campaign_event_unique_counts(p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('day_tr', x.day_tr, 'campaign_id', x.campaign_id, 'uniques', x.n) ORDER BY x.day_tr), '[]'::jsonb)
  FROM (
    SELECT u.day_tr, u.campaign_id, count(*)::int AS n
    FROM public.campaign_event_uniques u
    WHERE p_from IS NOT NULL AND p_to IS NOT NULL AND p_to - p_from BETWEEN 0 AND 400 AND u.day_tr BETWEEN p_from AND p_to
    GROUP BY u.day_tr, u.campaign_id
  ) x;
$$;

REVOKE ALL ON FUNCTION public.campaign_event_unique_counts(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_event_unique_counts(date, date) TO service_role;
REVOKE ALL ON FUNCTION public.campaign_record_event(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_purge_event_subjects(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_record_event(uuid, text, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_purge_event_subjects(integer, timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
