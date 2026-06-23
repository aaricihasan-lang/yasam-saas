-- =============================================================================
-- 20260623200000_bioenergy_rls_tenant_isolation.sql
--
-- Biyoenerji Tabloları — RLS Güvenlik Katmanı
--
-- SORUN:
--   bioenergy_energy_bodies, bioenergy_subconscious_causes,
--   bioenergy_imaginations, bioenergy_symbols, bioenergy_chakras tablolarında
--   RLS yoktu. Publishable key ile herhangi bir tenant'ın verisine
--   INSERT / UPDATE / DELETE yapılabiliyordu.
--   bioenergy_sessions'da INSERT'i bloke eden bir policy vardı, ancak
--   tutarsız bir yapıydı; bu migration tutarsızlığı da giderir.
--
-- ÇÖZÜM:
--   6 biyoenerji tablosuna standart RLS katmanı eklenir:
--
--   SELECT  → Herkes okuyabilir (mevcut uygulama davranışı korunur).
--             Uygulama kodu zaten .eq("tenant_id", userTenantId) ile filtreler.
--
--   INSERT  → Demo tenant'a (is_demo_account=true hesabın tenant_id'si) veri
--             eklenemez. Diğer tenant'lar için kısıtlama uygulanmaz
--             (mevcut app-layer güvenlik modeli korunur).
--             Ek olarak: INSERT'te tenant_id'nin kullanıcılar tablosunda
--             gerçekten var olması şartı aranır.
--
--             NOT: EXISTS yerine IN kullanılır. EXISTS ile
--             "WHERE u.tenant_id = tenant_id" yazıldığında PostgreSQL
--             sağ taraftaki tenant_id'yi de u.tenant_id olarak çözümler
--             (trivially true). IN desen ile dış referans netleşir.
--
--   UPDATE  → Demo tenant'a ait satırlar güncellenemez.
--
--   DELETE  → Demo tenant'a ait satırlar silinemez.
--
-- DEMO TENANT:
--   uzman@test.com → tenant_id: 40f842a0-e3e8-448c-8971-9a938e1faccb
--
-- TEST KRİTERİ (migration sonrası):
--   publishable key + demo tenant INSERT → 42501 BLOCKED ✅
--   publishable key + demo tenant UPDATE → 0 rows (BLOCKED) ✅
--   publishable key + demo tenant DELETE → 0 rows (BLOCKED) ✅
--   publishable key + normal tenant INSERT → OK (app-layer filter)
--   service_role INSERT/UPDATE/DELETE → Hep OK (RLS bypass)
--
-- MİMARİ NOT:
--   Bu proje app-layer tenant izolasyonu modelini kullanır.
--   Tam çapraz-tenant izolasyonu için Supabase Auth veya custom JWT
--   gereklidir (gelecek iyileştirme).
--
-- GERİ ALMA:
--   DROP POLICY IF EXISTS ... ON bioenergy_sessions; (vs diğer tablolar)
--   ALTER TABLE bioenergy_sessions DISABLE ROW LEVEL SECURITY; (vs diğer)
-- =============================================================================

DO $$
DECLARE
  -- Demo hesabın tenant_id'si — sabit, değişmez
  demo_uuid CONSTANT UUID := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  tbl       TEXT;
  pol       RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'bioenergy_sessions',
    'bioenergy_energy_bodies',
    'bioenergy_subconscious_causes',
    'bioenergy_imaginations',
    'bioenergy_symbols',
    'bioenergy_chakras'
  ] LOOP

    -- 1. RLS'yi etkinleştir (IF NOT ALREADY idempotent)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- 2. Mevcut tüm policy'leri temizle (idempotent çalıştırma için)
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- 3. GRANT: anon ve authenticated rollerine tablo erişim izinleri
    --    (RLS etkinken grant, policy'lerin devreye girmesi için gereklidir)
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated',
      tbl
    );

    -- 4. SELECT: Tüm satırlar okunabilir (uygulama tenant filtresi uygular)
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I
         FOR SELECT
         USING (true)$p$,
      tbl || '_select_open', tbl
    );

    -- 5. INSERT: Demo tenant'a ekleme yasak + geçerli tenant kontrolü
    --    IN pattern: EXISTS yazınca "WHERE u.tenant_id = tenant_id" ifadesinde
    --    sağ taraftaki tenant_id iç scope'da u.tenant_id olarak çözümlenir (trivially true).
    --    IN ile dış tablo referansı netleşir.
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I
         FOR INSERT
         WITH CHECK (
           tenant_id != %L::uuid
           AND tenant_id IN (
             SELECT DISTINCT u.tenant_id
             FROM public.users u
             WHERE u.active = true
           )
         )$p$,
      tbl || '_insert_no_demo', tbl, demo_uuid
    );

    -- 6. UPDATE: Demo tenant satırlarını güncelleme yasak
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I
         FOR UPDATE
         USING (tenant_id != %L::uuid)$p$,
      tbl || '_update_no_demo', tbl, demo_uuid
    );

    -- 7. DELETE: Demo tenant satırlarını silme yasak
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I
         FOR DELETE
         USING (tenant_id != %L::uuid)$p$,
      tbl || '_delete_no_demo', tbl, demo_uuid
    );

    RAISE NOTICE 'RLS configured: %', tbl;
  END LOOP;
END
$$;

-- =============================================================================
-- Doğrulama: Oluşturulan policy'leri listele
-- =============================================================================
SELECT
  tablename,
  policyname,
  cmd,
  permissive,
  LEFT(qual::text, 60)       AS using_clause,
  LEFT(with_check::text, 60) AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'bioenergy%'
ORDER BY tablename, cmd;
