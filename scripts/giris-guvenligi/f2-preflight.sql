-- GİRİŞ GÜVENLİĞİ F2 — production ÖN KONTROLÜ (SALT-OKUNUR; hiçbir migration uygulamaz, hiçbir şey yazmaz).
-- ÜRETİLMİŞ DOSYA: scripts/giris-guvenligi/f2-katalog.mjs --uret (elle değiştirmeyin). Tek SELECT; READ ONLY transaction içinde
-- çalıştırın: BEGIN READ ONLY; \i scripts/giris-guvenligi/f2-preflight.sql ; ROLLBACK;
-- Her F2 migration'ı için tek satır: on_kontrol|<sürüm>|<KARAR>|<ayrıntı>. Kararlar:
--   UYGULANABİLİR · ZATEN UYGULANMIŞ · YENİDEN UYGULAMA YASAK · SIRA HATASI · ŞEMA SAPMASI · İNSAN İNCELEMESİ GEREKLİ
-- Kaynaklar: kayıt (auth_f2_schema_level gövdesi), katalog parmak izleri, aşama bazında katalog özeti (fonksiyon imza+gövde+
-- SECURITY DEFINER+search_path+yetki, tetikleyici, tablo RLS/yetki, kolon), migration geçmişi (supabase_migrations).
WITH obj(kind, name, lvl) AS (VALUES
  ('col', 'auth_mfa_challenges.approved_device_id', 300),
  ('col', 'auth_mfa_challenges.denied_reason', 300),
  ('col', 'auth_mfa_challenges.match_code', 300),
  ('col', 'auth_mfa_challenges.match_options', 300),
  ('col', 'auth_mfa_challenges.qr_nonce_hash', 300),
  ('col', 'auth_mfa_challenges.recovery_code_id', 500),
  ('col', 'auth_mfa_challenges.step_action', 700),
  ('col', 'auth_mfa_challenges.step_session_id', 700),
  ('col', 'auth_mfa_challenges.step_target', 700),
  ('col', 'auth_recovery_events.subject_user_id', 600),
  ('col', 'user_sessions.bound_device_id', 1000),
  ('col', 'user_sessions.device_bound_at', 1000),
  ('col', 'user_sessions.device_proof_at', 1000),
  ('col', 'user_sessions.mfa_challenge_id', 100),
  ('col', 'user_sessions.mfa_method', 100),
  ('col', 'user_sessions.token_hash', 0),
  ('col', 'users.email_verified_at', 400),
  ('col', 'users.mfa_required', 100),
  ('col', 'users.mfa_required_at', 100),
  ('fn', 'admin_notification_history', 400),
  ('fn', 'auth_admin_create_admin', 1100),
  ('fn', 'auth_admin_grant_email_target', 1100),
  ('fn', 'auth_admin_grant_finish', 1100),
  ('fn', 'auth_admin_grant_proof', 1100),
  ('fn', 'auth_admin_role_grant', 1100),
  ('fn', 'auth_audit_retention_report', 700),
  ('fn', 'auth_credentials_changed_deny_challenges', 900),
  ('fn', 'auth_device_activate', 300),
  ('fn', 'auth_device_decisions_append_only', 300),
  ('fn', 'auth_device_enroll_begin', 300),
  ('fn', 'auth_device_list', 300),
  ('fn', 'auth_device_notify', 300),
  ('fn', 'auth_device_owner_decide', 300),
  ('fn', 'auth_device_pending_expire', 1100),
  ('fn', 'auth_device_public_key', 300),
  ('fn', 'auth_device_replace_begin', 500),
  ('fn', 'auth_device_replace_cancel', 500),
  ('fn', 'auth_device_replace_status', 500),
  ('fn', 'auth_device_revoke', 300),
  ('fn', 'auth_device_revoke_internal', 500),
  ('fn', 'auth_device_status', 300),
  ('fn', 'auth_email_alerts_ack', 400),
  ('fn', 'auth_email_change_begin', 500),
  ('fn', 'auth_email_change_confirm', 500),
  ('fn', 'auth_email_delivery_result', 400),
  ('fn', 'auth_email_notice_reserve', 500),
  ('fn', 'auth_email_notify', 400),
  ('fn', 'auth_email_otp_issue', 400),
  ('fn', 'auth_email_otp_step_up_guard', 900),
  ('fn', 'auth_email_otp_verify', 400),
  ('fn', 'auth_email_owner_test_reserve', 400),
  ('fn', 'auth_email_status', 400),
  ('fn', 'auth_f2_schema_level', 0),
  ('fn', 'auth_finalize_login', 100),
  ('fn', 'auth_is_owner_admin', 0),
  ('fn', 'auth_legacy_session_policy_set', 1000),
  ('fn', 'auth_mfa_begin', 100),
  ('fn', 'auth_mfa_challenge_status', 100),
  ('fn', 'auth_mfa_is_test_account', 100),
  ('fn', 'auth_mfa_mark_verified', 100),
  ('fn', 'auth_mfa_match_code6', 1100),
  ('fn', 'auth_mfa_required_end_sessions', 900),
  ('fn', 'auth_mfa_set_required', 100),
  ('fn', 'auth_mfa_user_has_method', 100),
  ('fn', 'auth_mfa_user_methods', 400),
  ('fn', 'auth_owner_bootstrap_issue', 300),
  ('fn', 'auth_owner_offline_bootstrap', 500),
  ('fn', 'auth_owner_offline_kit_issue', 500),
  ('fn', 'auth_owner_session_stale', 600),
  ('fn', 'auth_owner_step_up_begin', 700),
  ('fn', 'auth_owner_step_up_status', 700),
  ('fn', 'auth_owner_step_up_take', 900),
  ('fn', 'auth_qr_decide', 300),
  ('fn', 'auth_qr_fetch', 300),
  ('fn', 'auth_recovery_case_close', 500),
  ('fn', 'auth_recovery_case_execute', 500),
  ('fn', 'auth_recovery_case_list', 500),
  ('fn', 'auth_recovery_case_open', 500),
  ('fn', 'auth_recovery_code_verify', 500),
  ('fn', 'auth_recovery_codes_generate', 500),
  ('fn', 'auth_recovery_events_append_only', 500),
  ('fn', 'auth_recovery_hash', 500),
  ('fn', 'auth_recovery_log', 500),
  ('fn', 'auth_recovery_notify', 500),
  ('fn', 'auth_recovery_random_code', 500),
  ('fn', 'auth_recovery_status', 500),
  ('fn', 'auth_retention_active_run', 800),
  ('fn', 'auth_retention_cancel', 800),
  ('fn', 'auth_retention_count', 800),
  ('fn', 'auth_retention_execute', 800),
  ('fn', 'auth_retention_held_dec', 900),
  ('fn', 'auth_retention_held_rec', 900),
  ('fn', 'auth_retention_held_sec', 900),
  ('fn', 'auth_retention_hold_release', 800),
  ('fn', 'auth_retention_hold_set', 800),
  ('fn', 'auth_retention_log_append_only', 800),
  ('fn', 'auth_retention_overview', 800),
  ('fn', 'auth_retention_owner', 800),
  ('fn', 'auth_retention_policy_fp', 800),
  ('fn', 'auth_retention_policy_set', 800),
  ('fn', 'auth_retention_preview', 800),
  ('fn', 'auth_retention_table_uuid', 800),
  ('fn', 'auth_retention_zero_uuid', 800),
  ('fn', 'auth_session_actor', 300),
  ('fn', 'auth_session_device_bind', 1000),
  ('fn', 'auth_session_device_bind_begin', 1000),
  ('fn', 'auth_session_fresh_mfa', 600),
  ('fn', 'auth_session_legacy_info', 1000),
  ('fn', 'auth_session_mfa', 500),
  ('fn', 'auth_step_up_consume', 700),
  ('fn', 'auth_step_up_lock', 700),
  ('fn', 'auth_trusted_devices_pending_ttl_guard', 1100),
  ('fn', 'create_session_admin_web', 100),
  ('fn', 'create_session_v2', 0),
  ('fn', 'touch_active_session', 0),
  ('fn', 'user_sessions_device_bind_guard', 1000),
  ('fn', 'user_sessions_mfa_guard', 100),
  ('fn', 'user_sessions_token_hash_fill', 0),
  ('fn', 'user_sessions_user_id_immutable', 900),
  ('fn', 'users_admin_grant_guard', 1100),
  ('fn', 'users_email_change_guard', 500),
  ('fn', 'users_email_changed_after', 500),
  ('fn', 'users_mfa_policy_guard', 100),
  ('tbl', 'auth_audit_retention_policy', 700),
  ('tbl', 'auth_device_decisions', 300),
  ('tbl', 'auth_device_replacements', 500),
  ('tbl', 'auth_email_change_requests', 500),
  ('tbl', 'auth_email_deliveries', 400),
  ('tbl', 'auth_email_otps', 400),
  ('tbl', 'auth_legacy_session_policy', 1000),
  ('tbl', 'auth_mfa_challenges', 100),
  ('tbl', 'auth_mfa_test_accounts', 100),
  ('tbl', 'auth_owner_bootstrap_codes', 300),
  ('tbl', 'auth_recovery_attempts', 500),
  ('tbl', 'auth_recovery_cases', 500),
  ('tbl', 'auth_recovery_codes', 500),
  ('tbl', 'auth_recovery_events', 500),
  ('tbl', 'auth_retention_context', 800),
  ('tbl', 'auth_retention_holds', 800),
  ('tbl', 'auth_retention_log', 800),
  ('tbl', 'auth_retention_runs', 800),
  ('tbl', 'auth_session_device_proofs', 1000),
  ('tbl', 'auth_trusted_devices', 300),
  ('trg', 'auth_device_decisions_append_only_trg', 300),
  ('trg', 'auth_recovery_events_append_only_trg', 500),
  ('trg', 'auth_retention_log_append_only_trg', 800),
  ('trg', 'trg_auth_credentials_changed_deny_challenges', 900),
  ('trg', 'trg_auth_email_otp_step_up_guard', 900),
  ('trg', 'trg_auth_mfa_required_end_sessions', 900),
  ('trg', 'trg_auth_trusted_devices_pending_ttl_guard', 1100),
  ('trg', 'trg_user_sessions_device_bind_guard', 1000),
  ('trg', 'trg_user_sessions_user_id_immutable', 900),
  ('trg', 'trg_users_admin_grant_guard', 1100),
  ('trg', 'user_sessions_mfa_guard_trg', 100),
  ('trg', 'user_sessions_token_hash_trg', 0),
  ('trg', 'users_email_change_guard_trg', 500),
  ('trg', 'users_email_changed_after_trg', 500),
  ('trg', 'users_mfa_policy_guard_trg', 100)
),
fnl AS (
  SELECT o.lvl, 'fn|' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')|'
         || md5(replace(p.prosrc, chr(13), '')) || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '-')
         || '|api=' || (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
         || '|svc=' || CASE WHEN p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype THEN '*'
                            ELSE has_function_privilege('service_role', p.oid, 'EXECUTE')::text END AS line
    FROM obj o JOIN pg_catalog.pg_proc p ON p.proname = o.name
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE o.kind = 'fn'),
trl AS (
  SELECT o.lvl, 'trg|' || c.relname || '.' || g.tgname || '|' || p.proname || '|' || g.tgenabled::text || '|'
         || md5(pg_catalog.pg_get_triggerdef(g.oid)) AS line
    FROM obj o JOIN pg_catalog.pg_trigger g ON g.tgname = o.name AND NOT g.tgisinternal
    JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_proc p ON p.oid = g.tgfoid
   WHERE o.kind = 'trg'),
tbl AS (
  SELECT o.lvl, 'tbl|' || c.relname || '|rls=' || c.relrowsecurity::text
         || '|api=' || (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
                        OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))::text
         || '|svc=' || has_table_privilege('service_role', c.oid, 'SELECT')::text || ',' || has_table_privilege('service_role', c.oid, 'INSERT')::text
         || ',' || has_table_privilege('service_role', c.oid, 'UPDATE')::text || ',' || has_table_privilege('service_role', c.oid, 'DELETE')::text AS line
    FROM obj o JOIN pg_catalog.pg_class c ON c.relname = o.name AND c.relkind = 'r'
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE o.kind = 'tbl'),
cll AS (
  SELECT o.lvl, 'col|' || c.relname || '.' || a.attname || '|' || pg_catalog.format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text AS line
    FROM obj o JOIN pg_catalog.pg_class c ON c.relkind = 'r' AND (
           (o.kind = 'tbl' AND c.relname = o.name) OR (o.kind = 'col' AND c.relname = split_part(o.name, '.', 1)))
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
         AND (o.kind = 'tbl' OR a.attname = split_part(o.name, '.', 2))),
lines AS (SELECT lvl, line FROM fnl UNION ALL SELECT lvl, line FROM trl UNION ALL SELECT lvl, line FROM tbl UNION ALL SELECT lvl, line FROM cll),
expected(lvl, hash) AS (VALUES (0, 'c8df9e5bf3db2c1a5670586976869092'), (100, '10a193da0f693addf4895ee64d163df9'), (300, '5faa54e46aadc4ebd290746b624fcc66'), (400, 'e34a756eb98e9efcf891ec8a7fb26feb'), (500, 'c01ff596af7235d716f1aab9cf77ac85'), (600, 'e2538a9ad08b006ef74030023aca00ce'), (700, '3bf7a7f5c63eaf0b98cbf459bdf669c8'), (800, '4cba2fb4eb68df4e0f84eb8c955181c2'), (900, '726e0d5127e8b2b01d39c9a1f0da0fb3'), (1000, 'f5aa59b54c2ab58524630ae7385b1275'), (1100, '09fd31fdab0dc010e8b33bb6f82d3560')),
fps(lvl, file, present) AS (VALUES
    (0, '20280103000000', to_regprocedure('public.auth_is_owner_admin(uuid)') IS NOT NULL),
    (100, '20280103000100', to_regclass('public.auth_mfa_challenges') IS NOT NULL),
    (300, '20280103000300', to_regclass('public.auth_trusted_devices') IS NOT NULL),
    (400, '20280103000400', to_regclass('public.auth_email_otps') IS NOT NULL),
    (500, '20280103000500', to_regclass('public.auth_recovery_codes') IS NOT NULL),
    (600, '20280103000600', EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'auth_owner_session_stale')),
    (700, '20280103000700', to_regclass('public.auth_audit_retention_policy') IS NOT NULL),
    (800, '20280103000800', to_regclass('public.auth_retention_holds') IS NOT NULL),
    (900, '20280103000900', to_regprocedure('public.user_sessions_user_id_immutable()') IS NOT NULL),
    (1000, '20280103001000', to_regclass('public.auth_session_device_proofs') IS NOT NULL),
    (1100, '20280103001100', to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL)
),
reg AS (
  SELECT max(substring(p.prosrc FROM '([0-9]+)')::int) AS lvl
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auth_f2_schema_level'),
cur AS (SELECT coalesce(max(lvl) FILTER (WHERE present), -1) AS fp,
               string_agg(lpad(lvl::text, 6, '0'), ',' ORDER BY lvl) FILTER (WHERE NOT present
                 AND lvl < (SELECT coalesce(max(f2.lvl) FILTER (WHERE f2.present), -1) FROM fps f2)) AS gaps
          FROM fps),
actual AS (SELECT e.lvl, md5(coalesce((SELECT string_agg(l.line, E'\n' ORDER BY l.line) FROM lines l WHERE l.lvl <= e.lvl), '')) AS hash
             FROM expected e),
basefn(line) AS (VALUES
    ('fn|admin_notification_history(p_actor uuid, p_q text, p_type text, p_status text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer)|7fe93f87a3480c0bafd81f4db0f0efe1|true|search_path=pg_catalog, public|api=false|svc=true'),
    ('fn|create_session_v2(p_user_id uuid, p_session_token text, p_ip text, p_country text, p_city text, p_user_agent text, p_platform text, p_client_channel text, p_replace_token text, p_expires_at timestamp with time zone, p_high_risk boolean, p_enforce boolean, p_expert_idle_seconds integer, p_admin_idle_seconds integer, p_admin_absolute_seconds integer, p_expert_stale_seconds integer, p_admin_web_cap integer, p_pending_ttl_seconds integer)|3e812f750adc42c5715e1cc98e1131aa|true|search_path=""|api=false|svc=true'),
    ('fn|touch_active_session(p_token text, p_touch_after_seconds integer, p_idle_seconds integer, p_enforce boolean, p_admin_idle_seconds integer, p_admin_absolute_seconds integer)|c8582aab2a06b6c1e55e9723df7dca46|true|search_path=""|api=false|svc=true')
),
state AS (
  SELECT (SELECT lvl FROM reg) AS reg, c.fp, c.gaps,
         CASE WHEN c.fp < 0 THEN (SELECT count(*) FROM lines l WHERE l.line LIKE 'fn|%' AND l.line NOT IN (SELECT line FROM basefn)
                                     AND split_part(split_part(l.line, '|', 2), '(', 1) IN (SELECT name FROM obj WHERE kind = 'fn' AND lvl = 0)) = 0
                                  AND NOT EXISTS (SELECT 1 FROM lines l WHERE l.line NOT LIKE 'fn|%')
              ELSE (SELECT a.hash = e.hash FROM actual a JOIN expected e USING (lvl) WHERE a.lvl = c.fp) END AS catalog_ok,
         (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL) AS has_ledger,
         has_table_privilege('service_role', 'public.user_sessions', 'INSERT') AS svc_insert
    FROM cur c),
ledger AS (SELECT version FROM supabase_migrations.schema_migrations WHERE version LIKE '20280103%'),
appl AS (SELECT f.file AS version FROM fps f CROSS JOIN state s WHERE f.lvl <= s.fp
         UNION SELECT '20280103000200' FROM state s WHERE NOT s.svc_insert AND s.fp >= 100),
ledger_diff AS (
  SELECT (SELECT string_agg(version, ',' ORDER BY version) FROM (SELECT version FROM appl EXCEPT SELECT version FROM ledger) a) AS missing,
         (SELECT string_agg(version, ',' ORDER BY version) FROM (SELECT version FROM ledger EXCEPT SELECT version FROM appl) b) AS extra),
verdict AS (
  SELECT f.file, f.lvl,
    CASE
      WHEN s.gaps IS NOT NULL THEN 'ŞEMA SAPMASI|eksik ara aşama(lar): ' || s.gaps
      WHEN (s.reg IS NULL AND s.fp >= 0) OR (s.reg IS NOT NULL AND s.reg <> s.fp) THEN
        'İNSAN İNCELEMESİ GEREKLİ|kayıt=' || coalesce(s.reg::text, 'yok') || ' katalog=' || s.fp
      WHEN s.catalog_ok IS NOT TRUE THEN 'ŞEMA SAPMASI|katalog ' || CASE WHEN s.fp < 0 THEN 'F2 öncesi' ELSE lpad(s.fp::text, 6, '0') END
                                         || ' aşamasının beklenen özetiyle uyuşmuyor (gövde/imza/yetki/tetikleyici/kolon)'
      WHEN f.lvl < s.fp THEN 'YENİDEN UYGULAMA YASAK|daha yeni aşama ' || lpad(s.fp::text, 6, '0') || ' uygulanmış'
      WHEN f.lvl = s.fp THEN 'ZATEN UYGULANMIŞ|son aşama; yeniden uygulama gereksiz'
      WHEN f.lvl = (SELECT min(f3.lvl) FROM fps f3 WHERE f3.lvl > s.fp) THEN
        CASE WHEN (SELECT missing IS NULL AND extra IS NULL FROM ledger_diff) THEN 'UYGULANABİLİR|sıradaki aşama'
             ELSE 'İNSAN İNCELEMESİ GEREKLİ|sıradaki aşama ama migration geçmişi katalogla uyuşmuyor' END
      ELSE 'SIRA HATASI|önce ' || (SELECT min(f3.file) FROM fps f3 WHERE f3.lvl > s.fp) || ' uygulanmalı'
    END AS v
    FROM fps f CROSS JOIN state s)
SELECT 'on_kontrol|' || file || '|' || v FROM verdict
UNION ALL
SELECT 'on_kontrol|20280103000200|' || CASE
    WHEN NOT s.svc_insert THEN 'ZATEN UYGULANMIŞ|service_role user_sessions INSERT kapalı'
    WHEN s.fp < 100 THEN 'SIRA HATASI|000100 gerekli'
    WHEN s.fp < 1100 OR s.catalog_ok IS NOT TRUE THEN 'SIRA HATASI|tüm doğrusal zincir + kod yayını + canlı doğrulama SONRASI en son uygulanır'
    WHEN NOT (SELECT missing IS NULL AND extra IS NULL FROM ledger_diff) THEN 'İNSAN İNCELEMESİ GEREKLİ|migration geçmişi katalogla uyuşmuyor'
    ELSE 'UYGULANABİLİR|YALNIZ yeni kod production''da ve canlı doğrulama PASS ise (eski kodla admin web girişi kesilir)' END
  FROM state s
UNION ALL
SELECT 'gecmis|' || CASE WHEN d.missing IS NULL AND d.extra IS NULL THEN 'UYUMLU' ELSE 'UYUMSUZ' END
       || '|katalogda var gecmiste yok=' || coalesce(d.missing, '-') || '|gecmiste var katalogda yok=' || coalesce(d.extra, '-') FROM ledger_diff d
UNION ALL
SELECT 'durum|kayıt=' || coalesce(s.reg::text, 'yok') || '|katalog=' || s.fp || '|katalog_ozeti=' || coalesce(s.catalog_ok::text, 'bilinmiyor')
       || '|gecmis_tablosu=' || s.has_ledger || '|svc_insert=' || s.svc_insert FROM state s
UNION ALL
SELECT 'bilgi|F2 öncesi gövde farkı|' || split_part(l.line, '|', 2) FROM lines l
 WHERE (SELECT fp FROM state) < 0 AND l.line LIKE 'fn|%' AND l.line NOT IN (SELECT line FROM basefn)
   AND split_part(split_part(l.line, '|', 2), '(', 1) IN (SELECT name FROM obj WHERE kind = 'fn')
ORDER BY 1;
