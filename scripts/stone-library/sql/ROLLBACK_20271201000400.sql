-- GERİ ALMA: 20271201000400_stone_library_f6_layers.sql (F6-B owner katmanları).
-- Yalnız owner katmanlarında VERİ YOKKEN çalışır (owner sürümü / çeviri / not / owner görseli / owner kökenli taş / toplu silme
-- belirteci). Veri varsa önce dışa aktarılmalı; betik veri SİLMEZ, hata verip durur.
-- Sarmalanan F3 gövdeleri (refresh_stone, readiness, expert_image) özgün adlarına geri döner; yayın yüzeyi yeniden üretilir.
-- Kaynak (sağlayıcı) tablolarına dokunmaz.
BEGIN;

DO $$
DECLARE v_n bigint;
BEGIN
  IF to_regprocedure('public.stone_library_refresh_stone_f3(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK 0400: migration uygulanmamış görünüyor (stone_library_refresh_stone_f3 yok)';
  END IF;
  SELECT (SELECT count(*) FROM public.stone_library_owner_versions) + (SELECT count(*) FROM public.stone_library_translations)
       + (SELECT count(*) FROM public.stone_library_owner_notes) + (SELECT count(*) FROM public.stone_library_owner_images)
       + (SELECT count(*) FROM public.stone_library_bulk_tokens)
       + (SELECT count(*) FROM public.stone_library_stones WHERE origin = 'owner') INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK 0400: owner katmanlarında % satır var; önce dışa aktarın (betik veri silmez)', v_n;
  END IF;
END $$;

-- Yeni RPC'ler / yardımcılar
DROP FUNCTION IF EXISTS public.stone_library_owner_layer_summary(uuid);
DROP FUNCTION IF EXISTS public.stone_library_owner_layers(uuid, uuid);
DROP FUNCTION IF EXISTS public.stone_library_bulk_restore(uuid, uuid);
DROP FUNCTION IF EXISTS public.stone_library_bulk_delete_confirm(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.stone_library_bulk_delete_prepare(uuid, jsonb);
DROP FUNCTION IF EXISTS public.stone_library_translation_publish(uuid, uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.stone_library_translation_import(uuid, jsonb, text, boolean);
DROP FUNCTION IF EXISTS public.stone_library_owner_image_update(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.stone_library_owner_image_set_primary(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.stone_library_owner_image_register(uuid, uuid, jsonb, boolean);
DROP FUNCTION IF EXISTS public.stone_library_owner_note_delete(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.stone_library_owner_note_save(uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.stone_library_owner_stone_create(uuid, jsonb, jsonb, boolean, text);
DROP FUNCTION IF EXISTS public.stone_library_owner_version_set_current(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.stone_library_owner_version_save(uuid, uuid, jsonb, jsonb, boolean, integer, text);
DROP FUNCTION IF EXISTS public.stone_library_owner_publish(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.stone_library_publish_internal(uuid, uuid, text);

-- Sarmalanan F3 gövdeleri özgün adlarına
DROP FUNCTION public.stone_library_expert_image(uuid, text, text);
ALTER FUNCTION public.stone_library_expert_image_f3(uuid, text, text) RENAME TO stone_library_expert_image;
GRANT EXECUTE ON FUNCTION public.stone_library_expert_image(uuid, text, text) TO service_role;
DROP FUNCTION public.stone_library_refresh_stone(uuid);
ALTER FUNCTION public.stone_library_refresh_stone_f3(uuid) RENAME TO stone_library_refresh_stone;
DROP FUNCTION public.stone_library_readiness(uuid);
ALTER FUNCTION public.stone_library_readiness_f3(uuid) RENAME TO stone_library_readiness;

DROP FUNCTION IF EXISTS public.stone_library_health_fields_arr(jsonb);
DROP FUNCTION IF EXISTS public.stone_library_owner_data_check(jsonb, text);
DROP FUNCTION IF EXISTS public.stone_library_field_health(uuid, text);
DROP FUNCTION IF EXISTS public.stone_library_translation_stale(public.stone_library_translations);
DROP FUNCTION IF EXISTS public.stone_library_source_field_text(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.stone_library_kw_canon(text);
DROP FUNCTION IF EXISTS public.stone_library_sha_text(text);

-- Köken koruması
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stone_library_external_ids','stone_library_records','stone_library_facets','stone_library_images','stone_library_names','stone_library_stones'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_origin ON public.%I', t, t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.stone_library_origin_guard();

-- Taş kolonları + tablolar (boş oldukları yukarıda doğrulandı)
ALTER TABLE public.stone_library_stones DROP CONSTRAINT IF EXISTS stone_library_stones_owner_image_fk;
ALTER TABLE public.stone_library_stones DROP CONSTRAINT IF EXISTS stone_library_stones_origin_chk;
-- Not: bu kolonlara yazan UPDATE'ler geçmiş tablosunda (stone_library_history, yalnız eklenir) iz bırakmış olabilir; iz korunur.
ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS primary_owner_image_id;
ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS image_choice;
ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS owner_version_current;
ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS origin;
DROP TABLE public.stone_library_bulk_tokens;
DROP TABLE public.stone_library_owner_images;
DROP TABLE public.stone_library_owner_notes;
DROP TABLE public.stone_library_owner_versions;
DROP TABLE public.stone_library_translations;
DROP FUNCTION IF EXISTS public.stone_library_translation_guard();
DROP FUNCTION IF EXISTS public.stone_library_owner_image_guard();

-- Denetim kaydı varlık listesi GENİŞ bırakılır: stone_library_reviews yalnız eklenir; F6 işlem kayıtları (owner_version,
-- translation, owner_note, owner_image, bulk) silinemez ve korunmalıdır. Genişletilmiş CHECK F1–F3 davranışını etkilemez.

SELECT public.stone_library_refresh_all();
COMMIT;
