-- Doğaltaş Kütüphanesi F2 — GERİ DÖNÜŞ (YALNIZ OWNER ONAYIYLA). F1'i KORUR, yalnız F2 nesnelerini kaldırır.
-- Koruma: görsel veya lisans izni kaydı varsa DURUR (veri kaybı yok). Mevcut hiçbir uygulama tablosuna dokunmaz.
-- SONRAKİ ADIM (zorunlu): 20271201000000_stone_library_core.sql yeniden uygulanır (idempotent) → F1 fonksiyonlarının
-- özgün gövdeleri (refresh / delete / restore / expert_search / guard) geri gelir. Kanıt: scripts/stone-library/pg/f2-rollback-check.mjs
-- Çalıştırmadan önce: SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F2';
-- ÖNEMLİ: Bu betik ile F1 yeniden uygulaması ARASINDA uzman araması / yayın yenilemesi hata verir (F2 kolonları yok).
-- Bu yüzden ikisi aynı bakım penceresinde art arda (kütüphane kapısı STONE_LIBRARY_ENABLED kapalıyken) çalıştırılır.
BEGIN;
DO $$
BEGIN
  IF coalesce(current_setting('stone_library.rollback_confirm', true), '') <> 'DROP_STONE_LIBRARY_F2' THEN
    RAISE EXCEPTION 'F2 ROLLBACK durdu: onay ayarı yok (stone_library.rollback_confirm)';
  END IF;
  IF to_regclass('public.stone_library_images') IS NULL THEN RAISE NOTICE 'F2 zaten yok'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_images) OR EXISTS (SELECT 1 FROM public.stone_library_license_grants) THEN
    RAISE EXCEPTION 'F2 ROLLBACK durdu: görsel / lisans izni kaydı var. Veri kaybı yaratılmaz.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_records WHERE quality_flags <> '{}') OR EXISTS (SELECT 1 FROM public.stone_library_facets WHERE quality_flags <> '{}') THEN
    RAISE EXCEPTION 'F2 ROLLBACK durdu: kalite işaretli kayıt var (owner kararı gerekir).';
  END IF;
END $$;

DO $$
DECLARE fn record;
BEGIN
  IF to_regclass('public.stone_library_images') IS NULL THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS trg_stone_library_sources_image_refresh ON public.stone_library_sources;
  DROP TABLE IF EXISTS public.stone_library_images CASCADE;
  DROP TABLE IF EXISTS public.stone_library_license_grants CASCADE;
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('stone_library_after_image_change','stone_library_license_grant_save','stone_library_license_grant_set_status',
               'stone_library_image_register','stone_library_image_review','stone_library_image_guard','stone_library_quality_flags','stone_library_owner_stones',
               'stone_library_owner_batch','stone_library_owner_raw_index','stone_library_owner_raw_get','stone_library_owner_external_lookup',
               'stone_library_owner_images','stone_library_owner_licenses','stone_library_owner_find_orphan','stone_library_expert_image',
               'stone_library_record_add_flagged','stone_library_facet_add_flagged','stone_library_batch_recover') LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.sig);
  END LOOP;
  DROP INDEX IF EXISTS public.stone_library_raw_ok_uidx;
  DROP INDEX IF EXISTS public.stone_library_raw_source_endpoint_idx;
  ALTER TABLE public.stone_library_records DROP CONSTRAINT IF EXISTS stone_library_records_quality_flags_chk;
  ALTER TABLE public.stone_library_facets DROP CONSTRAINT IF EXISTS stone_library_facets_quality_flags_chk;
  ALTER TABLE public.stone_library_records DROP COLUMN IF EXISTS quality_flags;
  ALTER TABLE public.stone_library_facets DROP COLUMN IF EXISTS quality_flags;
  ALTER TABLE public.stone_library_published DROP COLUMN IF EXISTS has_image;
  ALTER TABLE public.stone_library_delete_ops DROP CONSTRAINT IF EXISTS stone_library_delete_ops_entity_check;
  ALTER TABLE public.stone_library_delete_ops ADD CONSTRAINT stone_library_delete_ops_entity_check
    CHECK (entity IN ('source','document','stone','name','external_id','record','facet','batch'));
  ALTER TABLE public.stone_library_reviews DROP CONSTRAINT IF EXISTS stone_library_reviews_entity_check;
  ALTER TABLE public.stone_library_reviews ADD CONSTRAINT stone_library_reviews_entity_check
    CHECK (entity IN ('settings','source','document','stone','name','external_id','record','facet','batch','grant'));
  DELETE FROM public.stone_library_vocab WHERE facet = 'color' AND value_key IN ('beige','turquoise')
    AND NOT EXISTS (SELECT 1 FROM public.stone_library_facets f WHERE f.facet = 'color' AND f.value_key IN ('beige','turquoise'));
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    DELETE FROM storage.buckets b WHERE b.id = 'stone-library-images'
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'stone-library-images');
  END IF;
END $$;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20271201000100';
COMMIT;
