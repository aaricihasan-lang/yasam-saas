-- HD TRANSİT L2 önbelleği — İLERİ YÖNLÜ YETKİ DARALTMA (20271226000000'ın düzeltmesi; o dosya DEĞİŞTİRİLMEZ).
--
-- Supabase'de public şemasının varsayılan yetkileri (pg_default_acl: postgres / supabase_admin → service_role arwdDxtm) yeni
-- tablolara service_role için TÜM yetkileri verir. 20271226000000 yalnız anon / authenticated / PUBLIC'ten geri alıyordu →
-- prod'da service_role'de UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER / MAINTAIN (PG17+) kaldı. Uygulama bu tabloda yalnız SELECT + INSERT
-- kullanır (lib/human-design/transit/transitPlanetStore.ts); bozuk kayıt kodla silinmez/ezilmez → veritabanı da zorlasın.
--
-- YALNIZ bu tablo ve YALNIZ service_role. Başka rol / tablo / varsayılan yetki DEĞİŞMEZ. Veri DEĞİŞMEZ. IDEMPOTENT.

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.hd_transit_planet_positions FROM service_role;
GRANT SELECT, INSERT ON TABLE public.hd_transit_planet_positions TO service_role;
