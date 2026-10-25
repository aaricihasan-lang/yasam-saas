-- 0300 yarıda kaldıysa HİÇBİR iz kalmamalı: rol, ayrım tablosu, raw_put'un yeni yetkisi yok; F1–F3 nesneleri yerinde.
-- Uygulayıcı hata sonrası işlemi geri alır (psql / CLI davranışı); işlem yoksa ROLLBACK yalnız uyarı verir.
ROLLBACK;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stone_library_importer') THEN RAISE EXCEPTION 'F6C ATOMIK: rol kaldı'; END IF;
  IF to_regclass('public.stone_library_call_reservations') IS NOT NULL THEN RAISE EXCEPTION 'F6C ATOMIK: ayrım tablosu kaldı'; END IF;
  IF NOT has_function_privilege('service_role', 'public.stone_library_raw_put(uuid,uuid,text,text,text,integer,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'F6C ATOMIK: raw_put yetkisi yarım değişti';
  END IF;
  IF to_regclass('public.stone_library_records') IS NULL THEN RAISE EXCEPTION 'F6C ATOMIK: F1 tablosu yok'; END IF;
END $$;
