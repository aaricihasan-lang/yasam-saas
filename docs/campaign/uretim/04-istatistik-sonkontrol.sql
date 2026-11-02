-- KAMPANYA MERKEZİ — 20271229000400 (istatistik olayları) production SON KONTROL (SALT OKUNUR). Her satır ok = true olmalı.
WITH fn AS (SELECT p.oid, p.proname, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
            AND p.proname IN ('campaign_record_event', 'campaign_purge_event_subjects', 'campaign_event_unique_counts')),
     tb AS (SELECT c.oid, c.relname, c.relrowsecurity FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
            AND c.relname IN ('campaign_event_daily', 'campaign_event_uniques'))
SELECT 'iki olay tablosu var, RLS açık' AS kontrol, (SELECT count(*) FILTER (WHERE relrowsecurity) FROM tb) = 2 AS ok
UNION ALL SELECT 'anon / authenticated olay tablolarını okuyamaz',
  (SELECT bool_and(NOT has_table_privilege('anon', oid, 'SELECT') AND NOT has_table_privilege('authenticated', oid, 'SELECT')) FROM tb)
UNION ALL SELECT 'service_role yalnız SELECT (doğrudan yazma yok)',
  (SELECT bool_and(has_table_privilege('service_role', oid, 'SELECT') AND NOT has_table_privilege('service_role', oid, 'INSERT')
                   AND NOT has_table_privilege('service_role', oid, 'UPDATE') AND NOT has_table_privilege('service_role', oid, 'DELETE')) FROM tb)
UNION ALL SELECT 'üç yeni RPC var; SECURITY DEFINER + sabit search_path',
  (SELECT count(*) FROM fn WHERE prosecdef AND 'search_path=pg_catalog, public, pg_temp' = ANY (coalesce(proconfig, '{}'))) = 3
UNION ALL SELECT 'RPC''leri yalnız service_role çalıştırabilir',
  (SELECT bool_and(has_function_privilege('service_role', oid, 'EXECUTE') AND NOT has_function_privilege('anon', oid, 'EXECUTE')
                   AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) FROM fn)
UNION ALL SELECT 'yeni kurulumda olay ve tekil kaydı yok (veri uydurulmadı)',
  (SELECT count(*) FROM public.campaign_event_daily) = 0 AND (SELECT count(*) FROM public.campaign_event_uniques) = 0;
