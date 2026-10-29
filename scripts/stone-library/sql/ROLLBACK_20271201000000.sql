-- Doğaltaş Kütüphanesi F1 — GERİ DÖNÜŞ (YALNIZ OWNER ONAYIYLA, YALNIZ KÜTÜPHANE BOŞKEN).
-- Yalnız migration 20271201000000'ın oluşturduğu stone_library_* nesnelerini kaldırır. Mevcut hiçbir tabloya
-- (users, stones, stone_sources, stone_entries, minerals, combinations, client_stones, dogaltas_inventory, YH …) DOKUNMAZ.
-- pg_trgm / pgcrypto uzantıları KALDIRILMAZ (başka modüller kullanır).
-- Koruma: kütüphanede taş / kaynak / ham veri / yetki varsa DURUR (veri kaybı yok). Önce owner kararıyla dışa aktarım yapılmalı.
-- Çalıştırmadan önce: SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F1';
BEGIN;
DO $$
BEGIN
  IF coalesce(current_setting('stone_library.rollback_confirm', true), '') <> 'DROP_STONE_LIBRARY_F1' THEN
    RAISE EXCEPTION 'ROLLBACK durdu: onay ayarı yok (stone_library.rollback_confirm)';
  END IF;
  IF to_regclass('public.stone_library_stones') IS NULL THEN
    RAISE NOTICE 'stone_library tabloları zaten yok';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones) OR EXISTS (SELECT 1 FROM public.stone_library_sources)
     OR EXISTS (SELECT 1 FROM public.stone_library_raw) OR EXISTS (SELECT 1 FROM public.stone_library_access_grants) THEN
    RAISE EXCEPTION 'ROLLBACK durdu: kütüphanede veri var (taş / kaynak / ham veri / yetki). Veri kaybı yaratılmaz.';
  END IF;
END $$;

DO $$
DECLARE fn record; t text;
BEGIN
  IF to_regclass('public.stone_library_stones') IS NULL THEN RETURN; END IF;
  -- append-only tetikleyicileri TRUNCATE/DELETE'i engeller → önce tablolar (CASCADE ile tetikleyiciler) düşer.
  FOREACH t IN ARRAY ARRAY['stone_library_published','stone_library_access_grants','stone_library_delete_ops','stone_library_history',
                           'stone_library_reviews','stone_library_facets','stone_library_records','stone_library_raw',
                           'stone_library_import_events','stone_library_import_batches','stone_library_external_ids','stone_library_names',
                           'stone_library_stones','stone_library_vocab','stone_library_source_documents','stone_library_sources',
                           'stone_library_settings'] LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP;
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.sig);
  END LOOP;
END $$;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20271201000000';
COMMIT;
