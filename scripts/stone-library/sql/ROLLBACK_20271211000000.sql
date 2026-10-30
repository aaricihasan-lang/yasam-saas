-- GERİ ALMA: 20271211000000_stone_library_owner_rpc_timeout.sql
-- Yalnız işlev düzeyindeki statement_timeout ayarını kaldırır (bağlantı rolünün sınırı yeniden geçerli olur). Veri değişmez.
BEGIN;
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.stone_library_owner_publish(uuid, uuid, text)',
    'public.stone_library_stone_set_status(uuid, uuid, text, text)',
    'public.stone_library_license_grant_set_status(uuid, uuid, text, text)',
    'public.stone_library_license_grant_save(uuid, uuid, jsonb)',
    'public.stone_library_source_save(uuid, uuid, jsonb)',
    'public.stone_library_image_review(uuid, uuid, text, text)',
    'public.stone_library_owner_bulk_review(uuid, jsonb, text)',
    'public.stone_library_translation_publish(uuid, uuid, text, text, boolean)',
    'public.stone_library_owner_version_save(uuid, uuid, jsonb, jsonb, boolean, integer, text)',
    'public.stone_library_owner_version_set_current(uuid, uuid, integer, text)',
    'public.stone_library_health_decision(uuid, uuid, text, text)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s RESET statement_timeout', fn);
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
