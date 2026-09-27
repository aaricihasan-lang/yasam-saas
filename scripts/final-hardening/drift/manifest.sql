-- =============================================================================
-- scripts/final-hardening/drift/manifest.sql — SALT-OKUNUR güvenlik katalog manifesti
--
-- AMAÇ: Canlı (veya staging) veritabanının güvenlik açısından kritik durumunu tek
--   bir JSON olarak çıkarmak; supabase/expected-manifest.json ile compare.mjs karşılaştırır.
--   Prod migration takibi kısmi olduğundan ("supabase db push" YOK) drift bu yolla izlenir.
--
-- YALNIZ SELECT: hiçbir tablo/fonksiyon/yetki DEĞİŞTİRMEZ; kullanıcı verisi OKUMAZ
--   (yalnız pg_catalog / pg_policies / storage.buckets metadata'sı).
--
-- ÇALIŞTIRMA (owner / SQL Editor, READ ONLY):
--   psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c 'SET default_transaction_read_only = on' \
--        -f scripts/final-hardening/drift/manifest.sql > manifest.json
--   Supabase SQL Editor: sorguyu çalıştır → tek hücredeki JSON'u manifest.json olarak kaydet.
--   Sonra: node scripts/final-hardening/drift/compare.mjs manifest.json
--
-- ÇIKTI: tek satır, tek kolon `manifest` (jsonb):
--   { format, version, captured_at, server_version,
--     tables:    [{schema,name,kind,rls,force_rls,anon:{select,insert,update,delete},authenticated:{…}}],
--     policies:  [{schema,table,name,cmd,roles,permissive}],               -- public + storage
--     functions: [{name,args,security_definer,search_path,anon_execute,authenticated_execute,extension}],
--     buckets:   [{id,public,file_size_limit,allowed_mime_types}] }
-- =============================================================================
WITH
tbl AS (
  SELECT
    n.nspname                         AS schema,
    c.relname                         AS name,
    c.relkind::text                   AS kind,
    c.relrowsecurity                  AS rls,
    c.relforcerowsecurity             AS force_rls,
    jsonb_build_object(
      'select', has_table_privilege('anon', c.oid, 'SELECT'),
      'insert', has_table_privilege('anon', c.oid, 'INSERT'),
      'update', has_table_privilege('anon', c.oid, 'UPDATE'),
      'delete', has_table_privilege('anon', c.oid, 'DELETE')
    )                                 AS anon,
    jsonb_build_object(
      'select', has_table_privilege('authenticated', c.oid, 'SELECT'),
      'insert', has_table_privilege('authenticated', c.oid, 'INSERT'),
      'update', has_table_privilege('authenticated', c.oid, 'UPDATE'),
      'delete', has_table_privilege('authenticated', c.oid, 'DELETE')
    )                                 AS authenticated
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
pol AS (
  SELECT
    p.schemaname  AS schema,
    p.tablename   AS "table",
    p.policyname  AS name,
    p.cmd         AS cmd,
    p.roles::text[] AS roles,
    p.permissive  AS permissive
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname IN ('public', 'storage')
),
fn AS (
  SELECT
    p.proname                                          AS name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
    p.prosecdef                                        AS security_definer,
    (SELECT string_agg(cfg, ',') FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%') AS search_path,
    has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
    )                                                  AS extension
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
),
bk AS (
  SELECT b.id, b.public, b.file_size_limit, b.allowed_mime_types
  FROM storage.buckets b
)
SELECT jsonb_build_object(
  'format',         'yasam-drift-manifest',
  'version',        1,
  'captured_at',    now(),
  'server_version', current_setting('server_version'),
  'tables',    COALESCE((SELECT jsonb_agg(to_jsonb(tbl) ORDER BY tbl.name) FROM tbl), '[]'::jsonb),
  'policies',  COALESCE((SELECT jsonb_agg(to_jsonb(pol) ORDER BY pol.schema, pol."table", pol.name) FROM pol), '[]'::jsonb),
  'functions', COALESCE((SELECT jsonb_agg(to_jsonb(fn) ORDER BY fn.name, fn.args) FROM fn), '[]'::jsonb),
  'buckets',   COALESCE((SELECT jsonb_agg(to_jsonb(bk) ORDER BY bk.id) FROM bk), '[]'::jsonb)
) AS manifest;
