-- ============================================================
-- 20260802010000_aromatherapy_glossary_term_passages_privilege_fix.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2K — PRIVILEGE FIX (additif)
-- Tablo: public.aromatherapy_glossary_term_passages
--
-- BULGU (production, kanıtlı): C2K ana migration
--   (20260802000000_aromatherapy_glossary_term_passages.sql) service_role'a
--   yalnız GRANT SELECT/INSERT/UPDATE/DELETE verdi; ancak service_role'dan
--   önce REVOKE etmediği için tablo ACL'sinde postgres tarafından doğrudan
--   verilmiş TRUNCATE / REFERENCES / TRIGGER / MAINTAIN yetkileri KALDI.
--   (Sorun rol-üyeliği inheritance DEĞİL; tablo ACL'sindeki doğrudan grant.)
--
-- BU MIGRATION'IN TEK SORUMLULUĞU: hedef junction tablosundaki service_role
--   privilege kümesini tam allowlist'e (SELECT/INSERT/UPDATE/DELETE) indirmek.
--   Önce service_role üzerindeki TÜM grantable tablo yetkilerini kaldırır,
--   ardından yalnız izinli dört yetkiyi geri verir. TRUNCATE/REFERENCES/
--   TRIGGER/MAINTAIN kaldırılır; SELECT/INSERT/UPDATE/DELETE korunur.
--
-- ADDİTİF & DAR KAPSAM: eski migration DEĞİŞTİRİLMEZ. Tablo/kolon oluşturmaz,
--   DROP yapmaz, ALTER DEFAULT PRIVILEGES kullanmaz, anon/authenticated/PUBLIC
--   yetkilerine dokunmaz, global/schema-wide privilege değiştirmez, GRANT ALL
--   kullanmaz, IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE kullanmaz.
--   Executable SQL kapsamı bilinçli olarak yalnız iki ifadedir (REVOKE + GRANT).
-- ============================================================

-- 1) service_role üzerindeki TÜM grantable tablo yetkilerini kaldır
--    (TRUNCATE / REFERENCES / TRIGGER / MAINTAIN dahil; yalnız hedef tablo, yalnız service_role).
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_passages FROM service_role;

-- 2) Yalnız izinli dört DML yetkisini geri ver (GRANT ALL DEĞİL).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_glossary_term_passages TO service_role;
