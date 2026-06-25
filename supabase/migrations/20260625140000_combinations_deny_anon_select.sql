-- =============================================================================
-- 20260625140000_combinations_deny_anon_select.sql
--
-- security(db): deny anon select on combinations
--
-- AMAÇ:
--   public.combinations tablosunda anon / authenticated (publishable key) SELECT
--   erişimi KAPATILIR. Faz B Adım 1'de TÜM combinations okumaları service_role'lü
--   sunucu API'lerine taşındı:
--     - GET /api/dogaltas/combinations        (verifyUserRequest, tenant=session)
--     - GET /api/admin/dogaltas/combinations  (verifyAdminRequest, tenant=query+uuid)
--   Kodda client-side supabase.from("combinations").select(...) KALMADI; bu yüzden
--   anon/authenticated SELECT güvenle kapatılır.
--
-- ÖN ŞART (Faz A + Faz B Adım 1 — tamamlandı):
--   - Yazma (INSERT/UPDATE/DELETE) zaten service_role API'lerine taşındı ve
--     anon/authenticated için RLS ile reddediliyor (önceki migration).
--   - Okuma artık yalnız service_role API'leri üzerinden.
--
-- YÖNTEM:
--   1) ENABLE ROW LEVEL SECURITY (idempotent — zaten açık).
--   2) combinations_select_anon (USING (true)) policy'si KALDIRILIR.
--      → anon/authenticated için izin veren permissive SELECT policy KALMAZ;
--        RLS açıkken varsayılan-deny gereği anon/authenticated SELECT 0 satır döner.
--   3) INSERT/UPDATE/DELETE deny policy'leri KORUNUR (idempotent yeniden tanım) —
--      anon/authenticated yazma reddi sürer.
--   4) service_role'e DOKUNULMAZ — BYPASSRLS taşıdığından tüm sunucu API'leri
--      (getServerDb / service_role) okuma+yazma yapmaya devam eder.
--
-- GÜVENLİ:
--   - Idempotent: aynı isimli policy'ler önce DROP IF EXISTS edilir.
--   - Transaction içinde — kısmi uygulama olmaz (hata → ROLLBACK).
--   - Veri SİLİNMEZ. public.combinations DIŞINDA tabloya DOKUNULMAZ.
--
-- KAPSAM:
--   Yalnız public.combinations.
--
-- ROLLBACK (geri alma — SELECT'i tekrar açar):
--   BEGIN;
--     CREATE POLICY "combinations_select_anon"
--       ON public.combinations
--       FOR SELECT
--       TO anon, authenticated
--       USING (true);
--   COMMIT;
-- =============================================================================

BEGIN;

ALTER TABLE public.combinations ENABLE ROW LEVEL SECURITY;

-- 1) SELECT-open policy KALDIRILIR → anon/authenticated SELECT artık engellenir.
DROP POLICY IF EXISTS "combinations_select_anon" ON public.combinations;

-- 2) Yazma reddi policy'leri KORUNUR (idempotent yeniden tanım — son durum garanti).
DROP POLICY IF EXISTS "combinations_insert_denied" ON public.combinations;
CREATE POLICY "combinations_insert_denied"
  ON public.combinations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "combinations_update_denied" ON public.combinations;
CREATE POLICY "combinations_update_denied"
  ON public.combinations
  FOR UPDATE
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "combinations_delete_denied" ON public.combinations;
CREATE POLICY "combinations_delete_denied"
  ON public.combinations
  FOR DELETE
  TO anon, authenticated
  USING (false);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası — salt analiz):
--   - publishable (anon) SELECT → 0 satır (RLS varsayılan-deny; SELECT policy yok).
--   - publishable (anon) INSERT/UPDATE/DELETE → ENGELLENİR (deny policy).
--   - service_role (read/save/import/delete/word API'leri) → ÇALIŞMAYA DEVAM EDER.
-- =============================================================================
