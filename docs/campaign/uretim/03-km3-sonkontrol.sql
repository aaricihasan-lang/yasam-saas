-- KAMPANYA MERKEZİ KM-3 — 20271229000300 production SON KONTROL (SALT OKUNUR). Her satır ok = true olmalı.
WITH fn AS (SELECT p.oid, p.proname, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('campaign_observe_usage', 'campaign_observe_header'))
SELECT 'sağlayıcı durumunda 4 yeni kolon var' AS kontrol,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaign_provider_state'
         AND column_name IN ('remaining_gap', 'gap_observed_at', 'gap_window', 'usage_observed_at')) = 4 AS ok
UNION ALL SELECT 'iki yeni RPC var; SECURITY DEFINER + sabit search_path',
  (SELECT count(*) FROM fn WHERE prosecdef AND 'search_path=pg_catalog, public, pg_temp' = ANY (coalesce(proconfig, '{}'))) = 2
UNION ALL SELECT 'yalnız service_role çalıştırabilir',
  (SELECT bool_and(has_function_privilege('service_role', oid, 'EXECUTE') AND NOT has_function_privilege('anon', oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) FROM fn)
UNION ALL SELECT 'mevcut kalan değeri korunur; fark henüz bilinmiyor (Owner doğrulaması bekleniyor)',
  (SELECT count(*) = 1 AND bool_and(remaining_gap IS NULL AND usage_observed_at IS NULL) FROM public.campaign_provider_state WHERE provider = 'roxy');
