-- =============================================================================
-- 20260625130000_combinations_deny_anon_writes.sql
--
-- security(db): deny anon writes on combinations
--
-- AMAÇ:
--   public.combinations tablosunda anon / authenticated (publishable key)
--   INSERT / UPDATE / DELETE erişimi KAPATILIR.
--   SELECT ŞİMDİLİK AÇIK KALIR — okuma akışları (liste/detay) Faz B'de
--   service_role'lü sunucu API'lerine taşınacak; bu fazda okumaya dokunulmaz.
--
-- ÖN ŞART (Faz A Adım 1 — tamamlandı):
--   combinations'a TÜM yazma artık service_role'lü sunucu API'leri üzerinden:
--     - /api/dogaltas/combinations/save        (verifyUserRequest)
--     - /api/admin/dogaltas/combinations/import (verifyAdminRequest)
--     - /api/dogaltas/combinations/delete       (verifyUserRequest)
--   Kodda publishable/anon write KALMADI. Bu yüzden anon write güvenle kapatılır.
--
-- YÖNTEM:
--   1) ENABLE ROW LEVEL SECURITY.
--   2) SELECT policy → anon, authenticated için USING (true)  (Faz B'de daraltılır).
--   3) INSERT/UPDATE/DELETE policy → anon, authenticated için izin VERMEZ
--      (WITH CHECK (false) / USING (false)). RLS açıkken yazma için izin veren
--      permissive policy bulunmadığından yazma reddedilir.
--   4) service_role'e DOKUNULMAZ — BYPASSRLS taşıdığından tüm sunucu API'leri
--      (getServerDb / service_role) çalışmaya devam eder.
--
-- GÜVENLİ:
--   - Idempotent: aynı isimli policy'ler önce DROP edilir.
--   - Transaction içinde — kısmi uygulama olmaz (hata → ROLLBACK, eski açık
--     davranış korunur; RLS açık ama SELECT policy yok durumu OLUŞMAZ).
--   - Veri SİLİNMEZ. public.combinations DIŞINDA tabloya DOKUNULMAZ.
--
-- KAPSAM:
--   Yalnız public.combinations.
--
-- ROLLBACK (geri alma):
--   BEGIN;
--     DROP POLICY IF EXISTS "combinations_select_anon"   ON public.combinations;
--     DROP POLICY IF EXISTS "combinations_insert_denied"  ON public.combinations;
--     DROP POLICY IF EXISTS "combinations_update_denied"  ON public.combinations;
--     DROP POLICY IF EXISTS "combinations_delete_denied"  ON public.combinations;
--     ALTER TABLE public.combinations DISABLE ROW LEVEL SECURITY;
--   COMMIT;
-- =============================================================================

BEGIN;

ALTER TABLE public.combinations ENABLE ROW LEVEL SECURITY;

-- Idempotent: tekrar çalıştırmaya karşı aynı isimli policy'leri temizle.
DROP POLICY IF EXISTS "combinations_select_anon"  ON public.combinations;
DROP POLICY IF EXISTS "combinations_insert_denied" ON public.combinations;
DROP POLICY IF EXISTS "combinations_update_denied" ON public.combinations;
DROP POLICY IF EXISTS "combinations_delete_denied" ON public.combinations;

-- SELECT: şimdilik açık (Faz B'de tenant-scoped server API'ye taşınınca daraltılır).
CREATE POLICY "combinations_select_anon"
  ON public.combinations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT: anon/authenticated reddedilir (yalnız service_role yazabilir — RLS bypass).
CREATE POLICY "combinations_insert_denied"
  ON public.combinations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- UPDATE: anon/authenticated reddedilir.
CREATE POLICY "combinations_update_denied"
  ON public.combinations
  FOR UPDATE
  TO anon, authenticated
  USING (false);

-- DELETE: anon/authenticated reddedilir.
CREATE POLICY "combinations_delete_denied"
  ON public.combinations
  FOR DELETE
  TO anon, authenticated
  USING (false);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası — salt analiz):
--   - publishable (anon) SELECT  → ÇALIŞIR.
--   - publishable (anon) INSERT/UPDATE/DELETE → ENGELLENİR (RLS reddi).
--   - service_role (save/import/delete API'leri) → ÇALIŞMAYA DEVAM EDER.
--   - Faz B: SELECT policy daraltılıp okuma server API'sine taşınacak.
-- =============================================================================
