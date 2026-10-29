-- Doğaltaş Kütüphanesi F1 — PREFLIGHT (SALT-OKUMA). Migration 20271201000000'dan ÖNCE çalıştırılır; hiçbir şey yazmaz.
-- Beklenen: tek satır, sonuc = 'READY_TO_APPLY'. 'ALREADY_APPLIED' → tekrar uygulamaya gerek yok. 'BLOCKED: …' → DUR.
WITH chk AS (
  SELECT
    current_setting('server_version_num')::int AS pg_ver,
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name IN ('id','role','active','approval_status','module_permissions','tenant_id','is_super_admin','is_demo_account')) AS user_cols,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname LIKE 'stone\_library\_%') AS sl_objects,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'stone\_library\_%') AS sl_functions,
    EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') AS trgm_available,
    EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgcrypto') AS pgcrypto_available,
    (SELECT count(*) FROM public.users WHERE is_super_admin IS TRUE AND lower(coalesce(role,'')) = 'admin' AND active IS TRUE AND coalesce(is_demo_account,false) IS FALSE) AS owner_count,
    EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20271201000000') AS in_ledger
)
SELECT
  CASE
    WHEN in_ledger AND sl_objects >= 17 THEN 'ALREADY_APPLIED'
    WHEN pg_ver < 130000 THEN 'BLOCKED: PostgreSQL 13+ gerekli (trim_scale)'
    WHEN user_cols <> 8 THEN 'BLOCKED: public.users beklenen kolonları taşımıyor'
    WHEN NOT trgm_available OR NOT pgcrypto_available THEN 'BLOCKED: pg_trgm / pgcrypto kullanılabilir değil'
    WHEN owner_count <> 1 THEN 'BLOCKED: tam olarak 1 platform owner bekleniyordu'
    WHEN sl_objects > 0 OR sl_functions > 0 THEN 'BLOCKED: stone_library_* nesneleri kısmen var (yarım uygulama?)'
    ELSE 'READY_TO_APPLY'
  END AS sonuc,
  pg_ver, user_cols, sl_objects, sl_functions, trgm_available, owner_count, in_ledger
FROM chk;
