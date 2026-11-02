-- KAMPANYA MERKEZİ — 20271229000600 (D-4 eski sağlayıcı RPC yetki daraltması) production SON KONTROL (SALT OKUNUR). Her satır ok = true.
-- Not: 02-sonkontrol.sql'in "16 RPC var ve service_role çalıştırabilir" satırı 000600'den SONRA beklenen şekilde false olur (15):
-- campaign_observe_provider artık service_role'e kapalıdır.
WITH f AS (SELECT p.oid, p.proname, p.prosecdef FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'campaign%')
SELECT 'campaign_observe_provider var (silinmedi) ve HİÇBİR rol çalıştıramaz' AS kontrol,
  (SELECT count(*) = 1 AND bool_and(NOT has_function_privilege('service_role', oid, 'EXECUTE') AND NOT has_function_privilege('anon', oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) FROM f WHERE proname = 'campaign_observe_provider') AS ok
UNION ALL SELECT 'campaign_record_provider_call yalnız service_role (kod kullanır)',
  (SELECT bool_and(has_function_privilege('service_role', oid, 'EXECUTE') AND NOT has_function_privilege('anon', oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) FROM f WHERE proname = 'campaign_record_provider_call')
UNION ALL SELECT 'hiçbir kampanya fonksiyonu anon / authenticated tarafından çalıştırılamaz',
  NOT EXISTS (SELECT 1 FROM f WHERE has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE'))
UNION ALL SELECT 'B-4 sertleştirmesi etkin (campaign__gap_policy header_hardened)',
  (SELECT (public.campaign__gap_policy()->>'header_hardened')::boolean);
