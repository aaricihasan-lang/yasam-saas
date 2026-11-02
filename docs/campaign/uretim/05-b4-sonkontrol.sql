-- KAMPANYA MERKEZİ — 20271229000500 (B-4 sağlayıcı farkı sertleştirmesi) production SON KONTROL (SALT OKUNUR). Her satır ok = true olmalı.
WITH fn AS (SELECT p.oid, p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) AS src FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('campaign_observe_usage', 'campaign_observe_header'))
SELECT 'dört yeni kolon var (gap_verified_at, gap_drift, gap_drift_at, usage_remaining_real)' AS kontrol,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaign_provider_state'
     AND column_name IN ('gap_verified_at', 'gap_drift', 'gap_drift_at', 'usage_remaining_real')) = 4 AS ok
UNION ALL SELECT 'politika: 24 saat geçerlilik, 60 dk ara, 48 saat karşılaştırma',
  (SELECT (r->>'valid_hours')::int = 24 AND (r->>'min_spacing_minutes')::int = 60 AND (r->>'compare_max_hours')::int = 48 FROM (SELECT public.campaign__gap_policy() r) x)
UNION ALL SELECT 'başlık gözlemi sertleştirilmiş sürümde (7 günlük kabul yok, doğrulama şartı var)',
  (SELECT src NOT LIKE '%7 days%' AND src LIKE '%fark_dogrulanmadi%' AND src LIKE '%24 hours%' FROM fn WHERE proname = 'campaign_observe_header')
UNION ALL SELECT 'iki RPC SECURITY DEFINER + sabit search_path; yalnız service_role çalıştırır',
  (SELECT count(*) FROM fn WHERE prosecdef AND 'search_path=pg_catalog, public, pg_temp' = ANY (coalesce(proconfig, '{}'))
     AND has_function_privilege('service_role', oid, 'EXECUTE') AND NOT has_function_privilege('anon', oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) = 2
UNION ALL SELECT 'service_role sağlayıcı durumuna doğrudan yazamaz',
  NOT has_table_privilege('service_role', 'public.campaign_provider_state', 'UPDATE') AND NOT has_table_privilege('service_role', 'public.campaign_provider_state', 'INSERT');
