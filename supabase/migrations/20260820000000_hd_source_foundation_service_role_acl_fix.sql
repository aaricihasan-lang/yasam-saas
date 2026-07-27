-- =============================================================================
-- 20260820000000_hd_source_foundation_service_role_acl_fix.sql
--
-- HUMAN DESIGN — HD-2D1 · SERVICE_ROLE ACL FIX (additif, dar kapsam)
--
-- BULGU (production, kanıtlı): HD-2D1 ana migration
--   (20260811000000_hd_source_foundation.sql) üç tabloya service_role'a yalnız
--   GRANT SELECT/INSERT/UPDATE verdi; ancak service_role'dan ÖNCE REVOKE etmediği
--   için tablo ACL'sinde postgres/public DEFAULT TABLE PRIVILEGES üzerinden doğrudan
--   verilmiş DELETE / TRUNCATE / REFERENCES / TRIGGER / MAINTAIN yetkileri KALDI.
--   (Kök neden rol-üyeliği inheritance DEĞİL; postgres/public default ACL nedeniyle
--    tablo CREATE anında service_role'a doğan doğrudan geniş grant'tır.)
--
-- BU MIGRATION'IN TEK SORUMLULUĞU: üç HD source-foundation tablosunda service_role
--   privilege kümesini tam allowlist'e (SELECT/INSERT/UPDATE) indirmek. Her tablo
--   için önce service_role üzerindeki TÜM grantable tablo yetkileri kaldırılır,
--   ardından yalnız izinli üç yetki geri verilir. DELETE/TRUNCATE/REFERENCES/
--   TRIGGER/MAINTAIN kaldırılır; SELECT/INSERT/UPDATE korunur (born-locked sözleşme).
--
-- ADDİTİF & DAR KAPSAM (bağlayıcı):
--   * Uygulanmış eski migration (20260811000000_hd_source_foundation.sql) DEĞİŞTİRİLMEZ,
--     yeniden adlandırılmaz, amend edilmez, yeniden uygulanmaz.
--   * Kapsam yalnız üç HD tablosu + yalnız service_role rolüdür.
--   * anon / authenticated / PUBLIC yetkilerine DOKUNULMAZ (bunlar zaten doğru revoke'lu).
--   * Global / schema-wide ALTER DEFAULT PRIVILEGES DEĞİŞTİRİLMEZ (başka modülleri ve
--     gelecekteki tabloları etkiler; bu düzeltme yalnız üç hedef tabloya scoped'tır).
--   * Tablo owner (postgres) değiştirilmez.
--   * RLS / policy / constraint / index / trigger / kolon / tablo yapısı değiştirilmez.
--   * DML (INSERT/UPDATE/DELETE), TRUNCATE, DROP, CASCADE, DO/dynamic SQL,
--     SECURITY DEFINER, GRANT ALL, IF EXISTS / CREATE OR REPLACE YOKTUR.
--   * Final service_role allowlist: yalnız SELECT, INSERT, UPDATE.
--   * REVOKE ALL → GRANT allowlist deseni final-state açısından İDEMPOTENTTİR
--     (tekrar çalıştırma aynı nihai ACL'yi üretir).
--
-- NOT: lock_timeout / statement_timeout bu dosyaya KONULMAZ; yalnız gelecekteki
--   production apply envelope'ında kullanılır. Migration byte-for-byte korunur.
-- =============================================================================

BEGIN;

-- 1) public.hd_sources
REVOKE ALL PRIVILEGES ON TABLE public.hd_sources FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;

-- 2) public.hd_source_passages
REVOKE ALL PRIVILEGES ON TABLE public.hd_source_passages FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_source_passages TO service_role;

-- 3) public.hd_original_texts
REVOKE ALL PRIVILEGES ON TABLE public.hd_original_texts FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_original_texts TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — ileri turda canlı DB'de; beklenen):
--   Her üç tablo için direct service_role ACL = {INSERT, SELECT, UPDATE}, grant
--   option false; DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN YOK. Effective:
--   SELECT/INSERT/UPDATE=true, diğerleri=false. RLS=true, FORCE=false, policy=0,
--   anon/authenticated tüm tablo yetkileri false, PUBLIC direct yok, 3 tablo 0 satır.
-- ROLLBACK: destructive DOWN YOK (fail-fast; hata → tüm BEGIN...COMMIT geri alınır).
-- =============================================================================
