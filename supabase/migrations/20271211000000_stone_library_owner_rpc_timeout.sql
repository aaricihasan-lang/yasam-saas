-- Doğaltaş Kütüphanesi — ağır owner RPC'lerine işlev düzeyinde statement_timeout.
--
-- Kök neden (production 29.10.2026, salt-okunur kanıt): PostgREST bağlantı rolü `authenticator` statement_timeout=8s.
-- Taş yayını (stone_library_owner_publish) taşı + onu eşleşme olarak kullanan taşları tek sorguda yeniden hesaplar;
-- 88 başarılı çağrının en uzunu 7 788 ms. Sitrin / Yakut / Rutilli Kuvars çağrıları 8 sn'yi aşıp iptal edildi.
-- Görsel izni durumu (stone_library_license_grant_set_status) tetikleyiciyle kaynağın bütün taşlarını (91) tek sorguda
-- yeniden hesaplar; aynı sınıra takılır.
--
-- Çözüm: yalnız aşağıdaki owner yazma RPC'lerine `SET statement_timeout`. PostgREST (12.x) RPC çağrısında işlevin
-- statement_timeout ayarını işleme taşır (db-hoisted-tx-settings). Gövde, yetki, güvenlik kontrolleri DEĞİŞMEZ; veri yazılmaz.
-- Not: bir sonraki CREATE OR REPLACE bu ayarı sıfırlar → ilgili migration ayarı yeniden vermelidir.
-- Geri alma: scripts/stone-library/sql/ROLLBACK_20271211000000.sql
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
    IF to_regprocedure(fn) IS NULL THEN
      RAISE EXCEPTION 'stone_library owner RPC zaman aşımı: % yok (F6 migration zinciri önce uygulanmalı)', fn;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET statement_timeout = %L', fn, '240s');
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
