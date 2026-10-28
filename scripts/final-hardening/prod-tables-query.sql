-- scripts/final-hardening/prod-tables-query.sql — yedek registry kapsamı için GÜNCEL prod tablo listesi (SALT-OKUNUR).
--
-- Yalnız pg_catalog okur; kullanıcı verisi OKUMAZ, hiçbir şeyi DEĞİŞTİRMEZ. Supabase SQL Editor'da owner çalıştırır.
-- Tek hücre çıktısı olduğu gibi `.hardening/prod-tables.md` dosyasına kaydedilir (yerel; repoya girmez) ya da
-- BACKUP_PROD_TABLES_FILE ile yolu verilir. backup.harness.ts bu biçimi ayrıştırır (bölüm başlıkları birebir).
-- Satır sayısı yazılmaz (yalnız tablo adları); tarih başlıkta kalır → listenin hangi ana ait olduğu görünür.
BEGIN READ ONLY;
WITH t AS (
  SELECT c.relname::text AS name,
         EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS has_tenant
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
)
SELECT '# Prod public tabloları (' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') || ') — yedek registry sınıflandırması için' || E'\n\n'
    || '## tenant_id kolonu OLAN base tablolar' || E'\n'
    || coalesce((SELECT string_agg(name || ' ', '· ' ORDER BY name) FROM t WHERE has_tenant), '') || E'\n\n'
    || '## tenant_id OLMAYAN public tablolar' || E'\n'
    || coalesce((SELECT string_agg(name, ' · ' ORDER BY name) FROM t WHERE NOT has_tenant), '') || E'\n'
    AS prod_tables_md;
ROLLBACK;
