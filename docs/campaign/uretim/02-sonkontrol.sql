-- KAMPANYA MERKEZİ — production SON KONTROL (SALT OKUNUR). Üç migration uygulandıktan SONRA çalıştırın.
-- Her satır ok = true olmalı. Kullanıcı verisi okumaz; yalnız katalog + tek ayar satırı.
WITH t(n) AS (VALUES ('campaign_settings'), ('campaigns'), ('campaign_techniques'), ('campaign_text_templates'),
                     ('campaign_usage_daily'), ('campaign_subject_daily'), ('campaign_reservations'),
                     ('campaign_provider_calls'), ('campaign_provider_state'), ('campaign_audit_log')),
rel AS (SELECT t.n, c.oid, c.relrowsecurity FROM t LEFT JOIN pg_class c ON c.relname = t.n AND c.relnamespace = 'public'::regnamespace),
fn AS (SELECT p.oid, p.proname, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'campaign%'),
rpc(n) AS (VALUES ('campaign_reserve'), ('campaign_authorize_call'), ('campaign_record_provider_call'), ('campaign_observe_provider'),
                  ('campaign_settle'), ('campaign_expire_stale'), ('campaign_purge_subjects'), ('campaign_admin_save'),
                  ('campaign_admin_set_status'), ('campaign_admin_set_techniques'), ('campaign_admin_archive'),
                  ('campaign_admin_update_settings'), ('campaign_admin_save_template'), ('campaign_admin_archive_template'),
                  ('campaign_admin_create'), ('campaign_admin_duplicate'))
SELECT '10 kampanya tablosu var' AS kontrol, (SELECT count(oid) FROM rel) = 10 AS ok
UNION ALL SELECT 'tüm kampanya tablolarında RLS açık', (SELECT bool_and(relrowsecurity) FROM rel)
UNION ALL SELECT 'kampanya tablolarında politika yok (yalnız RPC)',
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'campaign%')
UNION ALL SELECT 'anon / authenticated hiçbir kampanya tablosuna erişemez',
  NOT EXISTS (SELECT 1 FROM rel, (VALUES ('anon'), ('authenticated')) r(role), (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
               WHERE has_table_privilege(r.role, rel.oid, p.priv))
UNION ALL SELECT 'service_role kampanya tablolarına yalnız SELECT',
  (SELECT bool_and(has_table_privilege('service_role', oid, 'SELECT')) FROM rel)
  AND NOT EXISTS (SELECT 1 FROM rel, (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
                   WHERE has_table_privilege('service_role', rel.oid, p.priv))
UNION ALL SELECT 'anon / authenticated hiçbir kampanya fonksiyonunu çalıştıramaz',
  NOT EXISTS (SELECT 1 FROM fn, (VALUES ('anon'), ('authenticated')) r(role) WHERE has_function_privilege(r.role, fn.oid, 'EXECUTE'))
UNION ALL SELECT '16 RPC var ve service_role çalıştırabilir',
  (SELECT count(*) FROM rpc JOIN fn ON fn.proname = rpc.n WHERE has_function_privilege('service_role', fn.oid, 'EXECUTE')) = 16
UNION ALL SELECT 'RPC''ler SECURITY DEFINER + sabit search_path',
  (SELECT bool_and(fn.prosecdef AND 'search_path=pg_catalog, public, pg_temp' = ANY (coalesce(fn.proconfig, '{}'))) FROM rpc JOIN fn ON fn.proname = rpc.n)
UNION ALL SELECT 'tek yayındaki kampanya + istek kimliği tekil indeksleri var',
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('campaigns_single_live_uq', 'campaigns_create_request_uq')) = 2
UNION ALL SELECT 'ayar satırı tek ve fail-closed (bütçe 0, aylık kota boş)',
  (SELECT count(*) = 1 AND bool_and(global_daily_credit_budget = 0 AND provider_monthly_quota IS NULL) FROM public.campaign_settings)
UNION ALL SELECT 'kampanya / sayaç / rezervasyon kaydı yok (ilk uygulama)',
  NOT EXISTS (SELECT 1 FROM public.campaigns) AND NOT EXISTS (SELECT 1 FROM public.campaign_usage_daily)
  AND NOT EXISTS (SELECT 1 FROM public.campaign_reservations);
