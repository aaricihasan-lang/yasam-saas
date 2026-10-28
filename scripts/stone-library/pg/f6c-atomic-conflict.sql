-- F6-C atomiklik provası: 0300'ün ORTASINDA (bölüm 2) bilerek hata üretir. stone_library_raw_insert_guard() farklı dönüş
-- tipiyle önceden var → CREATE OR REPLACE "cannot change return type" verir. Rol + tablo (bölüm 0–1) bundan ÖNCE oluşur.
CREATE OR REPLACE FUNCTION public.stone_library_raw_insert_guard() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
