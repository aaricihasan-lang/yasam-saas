-- ════════════════════════════════════════════════════════════════════════════
-- BIO-17 — Biyoenerji tarayıcı yüzeyi KESİN KİLİT (forward-only, idempotent)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NEDEN:
--   20260623200000_bioenergy_rls_tenant_isolation.sql, anon + authenticated'a
--   SELECT/INSERT/UPDATE/DELETE GRANT eder ve `*_select_open USING(true)` policy'si
--   kurar (çapraz-tenant okuma). 20261001000000 bunu kapattı; ancak prod migration
--   kaydında 20260623200000 eksikse (manuel SQL Editor uygulaması) `supabase db push`
--   onu TEKRAR çalıştırıp erişimi yeniden açabilir.
--
--   Bu migration zincirin SONUNDA aynı nihai durumu yeniden garanti eder: db push
--   eksik eski migration'ı uygulasa bile bu dosya da (sonra) uygulanır → nihai durum
--   her zaman KİLİTLİ. Eski migration geçmişi SİLİNMEZ / YENİDEN YAZILMAZ.
--
-- NE YAPAR (yalnız bu 7 tablo):
--   1) RLS etkin.
--   2) Tablodaki TÜM policy'ler kaldırılır (uygulama yalnız service_role ile sunucudan
--      erişir; service_role RLS'yi bypass eder → policy'ye ihtiyaç yok).
--   3) anon, authenticated ve PUBLIC'ten tüm tablo yetkileri REVOKE.
--   4) Doğrulama: herhangi bir grant/policy kalırsa EXCEPTION (atomik geri alma).
--
-- service_role davranışı DEĞİŞMEZ (grant'larına dokunulmaz). Tablo yoksa (dormant)
-- atlanır. Tekrar çalıştırılması güvenlidir.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl  TEXT;
  pol  RECORD;
  bad  INTEGER;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'bioenergy_sessions',
    'bioenergy_energy_bodies',
    'bioenergy_subconscious_causes',
    'bioenergy_imaginations',
    'bioenergy_symbols',
    'bioenergy_chakras',
    'bioenergy_chakra_blocks'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      RAISE NOTICE 'BIO-17: % yok (dormant) — atlandı', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated, PUBLIC', tbl);

    SELECT count(*) INTO bad
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = tbl
      AND grantee IN ('anon', 'authenticated', 'PUBLIC');
    IF bad > 0 THEN
      RAISE EXCEPTION 'BIO-17: % üzerinde anon/authenticated/PUBLIC grant kaldı (%)', tbl, bad;
    END IF;

    SELECT count(*) INTO bad FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl;
    IF bad > 0 THEN
      RAISE EXCEPTION 'BIO-17: % üzerinde policy kaldı (%)', tbl, bad;
    END IF;

    RAISE NOTICE 'BIO-17: % kilitli (RLS on, policy 0, anon/authenticated grant 0)', tbl;
  END LOOP;
END
$$;
