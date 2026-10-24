
-- Alternatif ad RPC'sinin F1 yetkisi geri verilir; yayın belgeleri F2 biçimiyle yeniden üretilir.
GRANT EXECUTE ON FUNCTION public.stone_library_name_add(uuid, uuid, text, text, text, uuid, uuid) TO service_role;
SELECT public.stone_library_refresh_all();
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20271201000200';
COMMIT;
