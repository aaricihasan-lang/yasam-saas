-- =============================================================================
-- 20260928000000_hd_consultation_hash_helper_acl_fix.sql
--
-- HUMAN DESIGN — DANIŞMANLIK KATMANI · F1.2 · HASH HELPER EXECUTE ACL KİLİDİ
--
-- BLOCKER (production doğrulandı): 20260925000000 foundation, internal-only
--   yardımcı fonksiyon public.hd_consultation_canonical_hash(uuid) için EXECUTE
--   hakkını yalnız PUBLIC/anon/authenticated'tan REVOKE etti; service_role'dan
--   REVOKE ETMEDİ. Supabase varsayılan ayrıcalıkları (ALTER DEFAULT PRIVILEGES
--   ... GRANT EXECUTE ON FUNCTIONS ... TO service_role) yeni fonksiyonlara
--   service_role EXECUTE hakkını OTOMATİK verdiğinden, helper production'da
--   service_role tarafından doğrudan çağrılabilir kaldı. POST-APPLY D8 bu
--   ihlali (violation=1) exact bu fonksiyona indirgedi.
--
-- SÖZLEŞME: hash helper INTERNAL-only'dir. Yalnız 6 SECURITY DEFINER mutation
--   RPC onu owner bağlamında çağırır. Hiçbir client rolü (public/anon/
--   authenticated/service_role) helper'ı DOĞRUDAN çağıramamalıdır.
--
-- DÜZELTME (additif; minimum; merged migration DEĞİŞTİRİLMEZ): helper üzerindeki
--   service_role default EXECUTE grant'ini de kaldıracak biçimde tüm client
--   rollerinden EXECUTE'u REVOKE eder. 6 mutation RPC'nin service_role EXECUTE
--   hakkına DOKUNULMAZ.
--
-- KAPSAM DIŞI (KESİN): function body replace YOK, DROP FUNCTION YOK, RPC body
--   değişikliği YOK, tablo privilege değişikliği YOK, RLS/policy değişikliği YOK,
--   owner değişikliği YOK, data/seed/DML YOK, dinamik SQL YOK, başka ACL
--   genişletme/daraltma YOK. destructive DOWN YOK.
-- =============================================================================

BEGIN;

-- Helper INTERNAL-only: EXECUTE'u TÜM client rollerinden (service_role dahil)
-- kaldır. Foundation yalnız PUBLIC/anon/authenticated'ı revoke etmişti; buradaki
-- ek REVOKE, Supabase default-grant kaynaklı service_role EXECUTE'unu da kaldırır.
-- (REVOKE idempotenttir: zaten olmayan hakkın kaldırılması no-op'tur.)
REVOKE ALL ON FUNCTION public.hd_consultation_canonical_hash(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma; beklenen):
--   has_function_privilege('public',        'public.hd_consultation_canonical_hash(uuid)','EXECUTE') = false
--   has_function_privilege('anon',          'public.hd_consultation_canonical_hash(uuid)','EXECUTE') = false
--   has_function_privilege('authenticated', 'public.hd_consultation_canonical_hash(uuid)','EXECUTE') = false
--   has_function_privilege('service_role',  'public.hd_consultation_canonical_hash(uuid)','EXECUTE') = false
-- 6 mutation RPC DEĞİŞMEZ: service_role EXECUTE = true; public/anon/authenticated = false.
-- ROLLBACK: destructive DOWN YOK. Manuel geri alma gerekirse (İSTENMEZ; helper
--   internal-only olduğundan geri alma güvenlik gerilemesi olur):
--   GRANT EXECUTE ON FUNCTION public.hd_consultation_canonical_hash(uuid) TO service_role;
-- =============================================================================
