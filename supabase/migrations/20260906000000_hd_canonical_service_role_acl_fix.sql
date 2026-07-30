-- =============================================================================
-- 20260906000000_hd_canonical_service_role_acl_fix.sql
--
-- HUMAN DESIGN — HD-2C · CANONICAL STORE SERVICE_ROLE ACL PARITY (additif, dar kapsam)
--
-- BULGU (production, kanıtlı): HD-2C ana migration
--   (20260808000000_hd_canonical_store.sql) beş canonical tabloya service_role'a
--   yalnız GRANT SELECT/INSERT/UPDATE verdi; ancak service_role'dan ÖNCE REVOKE
--   ETMEDİĞİ için tablo ACL'sinde postgres/public DEFAULT TABLE PRIVILEGES üzerinden
--   doğrudan verilmiş DELETE / TRUNCATE / REFERENCES / TRIGGER yetkileri KALDI.
--   (Kök neden rol-üyeliği inheritance DEĞİL; tablo CREATE anında postgres/public
--    default ACL nedeniyle service_role'a doğan doğrudan geniş grant'tır. Bu, HD-2D1
--    source foundation'da yaşanan aynı sapmadır — bkz.
--    20260820000000_hd_source_foundation_service_role_acl_fix.sql.)
--
-- BU MIGRATION'IN AMACI (repository parity + yeni/temiz ortam güvenliği):
--   Production'daki ACL düzeltmesi ZATEN MANUEL uygulanmış ve 5/5 doğrulanmıştır
--   (service_role effective = SELECT/INSERT/UPDATE; DELETE/TRUNCATE/REFERENCES/
--   TRIGGER = false). Bu migration o düzeltmeyi repository migration zincirine
--   İLERİ YÖNLÜ ekler; böylece yeni/temiz bir ortamda tüm zincir uygulandığında
--   effective service_role yetkileri yalnız SELECT/INSERT/UPDATE olur.
--
-- BU MIGRATION'IN TEK SORUMLULUĞU: beş HD-2C canonical tablosunda service_role
--   privilege kümesini tam allowlist'e (SELECT/INSERT/UPDATE) indirmek. Her tablo
--   için önce service_role üzerindeki TÜM grantable tablo yetkileri kaldırılır,
--   ardından yalnız izinli üç yetki geri verilir.
--
-- CANONICAL KİMLİKTE DELETE KASITLI OLARAK KAPALIDIR: hd_canonical_entities ve dört
--   typed extension kalıcı kimlik registry'sidir; kimlik satırları silinmemelidir
--   (extension FK'leri de ON DELETE RESTRICT). İçerik katmanlarının (kaynaklandırılmış
--   ana metin, sadık çeviri, evidence) gelecekteki GERÇEK SİLME sözleşmesi BU
--   MIGRATION'IN KONUSU DEĞİLDİR; ayrı içerik-katmanı migration'ında ele alınacaktır.
--
-- ADDİTİF & DAR KAPSAM (bağlayıcı):
--   * Uygulanmış historical migration (20260808000000_hd_canonical_store.sql)
--     DEĞİŞTİRİLMEZ, yeniden adlandırılmaz, amend edilmez, yeniden uygulanmaz.
--   * Kapsam yalnız beş HD-2C canonical tablosu + yalnız service_role rolüdür.
--   * anon / authenticated / PUBLIC yetkilerine DOKUNULMAZ (zaten doğru revoke'lu).
--   * RLS / policy / constraint / index / trigger / kolon / tablo yapısı / veri
--     satırları DEĞİŞTİRİLMEZ.
--   * DML (INSERT/UPDATE/DELETE), TRUNCATE, DROP, CASCADE, DO/dynamic SQL,
--     SECURITY DEFINER, GRANT ALL, IF EXISTS / CREATE OR REPLACE, CREATE/ALTER,
--     function/trigger/policy YOKTUR.
--   * Global / schema-wide ALTER DEFAULT PRIVILEGES DEĞİŞTİRİLMEZ (yalnız beş hedef
--     tabloya scoped'tır).
--   * Tablo owner (postgres) değiştirilmez.
--   * Final service_role allowlist: yalnız SELECT, INSERT, UPDATE.
--   * REVOKE ALL → GRANT allowlist deseni final-state açısından İDEMPOTENTTİR
--     (tekrar çalıştırma aynı nihai ACL'yi üretir).
--
-- NOT: lock_timeout / statement_timeout bu dosyaya KONULMAZ; yalnız gelecekteki
--   production apply envelope'ında kullanılır. Migration byte-for-byte korunur.
-- =============================================================================

BEGIN;

-- 1) public.hd_canonical_entities
REVOKE ALL PRIVILEGES ON TABLE public.hd_canonical_entities FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_entities TO service_role;

-- 2) public.hd_canonical_types
REVOKE ALL PRIVILEGES ON TABLE public.hd_canonical_types FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_types TO service_role;

-- 3) public.hd_canonical_authorities
REVOKE ALL PRIVILEGES ON TABLE public.hd_canonical_authorities FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_authorities TO service_role;

-- 4) public.hd_canonical_gates
REVOKE ALL PRIVILEGES ON TABLE public.hd_canonical_gates FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_gates TO service_role;

-- 5) public.hd_canonical_channels
REVOKE ALL PRIVILEGES ON TABLE public.hd_canonical_channels FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_channels TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — production'da zaten 5/5 PASS; beklenen):
--   Her beş tablo için direct service_role ACL = {INSERT, SELECT, UPDATE}, grant
--   option false; DELETE/TRUNCATE/REFERENCES/TRIGGER YOK. Effective:
--   SELECT/INSERT/UPDATE=true, diğerleri=false. RLS=true, FORCE=false, policy=0,
--   anon/authenticated tüm tablo yetkileri false, PUBLIC direct yok, canonical
--   kimlik sayıları (112/5/7/64/36) DEĞİŞMEZ.
-- ROLLBACK: destructive DOWN YOK (fail-fast; hata → tüm BEGIN...COMMIT geri alınır).
-- =============================================================================
