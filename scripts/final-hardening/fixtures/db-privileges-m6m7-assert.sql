-- SEC-NEW-03a / MI-P08 (M6 + M7) davranış doğrulaması — M5'TEN BAĞIMSIZ (hata → FAIL). Yerel embedded-pg.
-- db-privileges-assert.sql'in M5'e ait "A) yeni nesneler" bloğu çıkarılmış hâlidir; B/C/A0/C7 birebir aynıdır.
-- Ön koşul: db-privileges-fixture.sql + 20271120001500 + 20271120001600 (iki kez).
DO $$
DECLARE
  t text;
  r text;
  n int;
  v_pg17 boolean := current_setting('server_version_num')::int >= 170000;
  v_tables text[] := ARRAY['bio_imaginations','chakra_notes','client_gifts','client_photos','client_tasks',
    'energy_bodies','healing_guide_sections','module_records','stone_combinations','subconscious_causes',
    'symbols_view','user_location_prefs'];
BEGIN
  -- ── B) 12 tablo: tehlikeli istemci yetkileri yok; CRUD ve sunucu yetkileri aynen ──
  FOREACH t IN ARRAY v_tables LOOP
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(r, format('public.%I', t), 'TRUNCATE') THEN RAISE EXCEPTION 'B1 % % TRUNCATE kaldı', t, r; END IF;
      IF has_table_privilege(r, format('public.%I', t), 'REFERENCES') THEN RAISE EXCEPTION 'B2 % % REFERENCES kaldı', t, r; END IF;
      IF has_table_privilege(r, format('public.%I', t), 'TRIGGER') THEN RAISE EXCEPTION 'B3 % % TRIGGER kaldı', t, r; END IF;
      IF v_pg17 AND has_table_privilege(r, format('public.%I', t), 'MAINTAIN') THEN RAISE EXCEPTION 'B4 % % MAINTAIN kaldı', t, r; END IF;
      -- Kapsam dışı: CRUD (fixture'da açıktı) DEĞİŞMEMELİ
      IF NOT has_table_privilege(r, format('public.%I', t), 'SELECT') THEN RAISE EXCEPTION 'B5 % % SELECT beklenmedik şekilde değişti', t, r; END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role', format('public.%I', t), 'TRUNCATE')
       OR NOT has_table_privilege('service_role', format('public.%I', t), 'SELECT') THEN
      RAISE EXCEPTION 'B6 % service_role yetkisi bozuldu', t;
    END IF;
  END LOOP;
  -- Numeroloji tablosu DOKUNULMADI
  IF NOT has_table_privilege('anon', 'public.demo_numerology_ip_usage', 'TRUNCATE')
     OR NOT has_table_privilege('authenticated', 'public.demo_numerology_ip_usage', 'REFERENCES') THEN
    RAISE EXCEPTION 'B7 Numeroloji tablosunun yetkileri değişti (kapsam dışı olmalıydı)';
  END IF;
  -- Veri korunur
  FOREACH t IN ARRAY array_remove(v_tables, 'symbols_view') || ARRAY['demo_numerology_ip_usage'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n <> 2 THEN RAISE EXCEPTION 'B8 % satır sayısı değişti (%)', t, n; END IF;
  END LOOP;
  -- RLS korunur
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION 'B9 RLS kapalı tablo oluştu (%)', n; END IF;

  -- ── C) Geniş politikalar kaldırıldı; dar/sunucu politikaları ve veri duruyor ──
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('client_homeworks','client_stone_photos','tenants')
     AND roles && ARRAY['public','anon','authenticated']::name[] AND btrim(coalesce(qual, with_check)) IN ('true','(true)');
  IF n <> 0 THEN RAISE EXCEPTION 'C1 geniş istemci politikası kaldı (%)', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND policyname IN ('hw tenant scoped', 'tenants service');
  IF n <> 2 THEN RAISE EXCEPTION 'C2 dar/sunucu politikası silindi (%)', n; END IF;
  SELECT count(*) INTO n FROM public.client_homeworks;    IF n <> 2 THEN RAISE EXCEPTION 'C3 client_homeworks verisi değişti'; END IF;
  SELECT count(*) INTO n FROM public.client_stone_photos; IF n <> 1 THEN RAISE EXCEPTION 'C4 client_stone_photos verisi değişti'; END IF;
  SELECT count(*) INTO n FROM public.tenants;             IF n <> 2 THEN RAISE EXCEPTION 'C5 tenants verisi değişti'; END IF;
  SELECT count(*) INTO n FROM pg_class WHERE oid IN ('public.client_homeworks'::regclass,'public.client_stone_photos'::regclass,'public.tenants'::regclass) AND relrowsecurity;
  IF n <> 3 THEN RAISE EXCEPTION 'C6 RLS bayrağı değişti'; END IF;

  -- ── A) Mevcut nesne otomatik düzelmez (beklenen; belgelenen sınır) ──
  IF NOT has_function_privilege('anon', 'public.existing_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'A0 mevcut fonksiyon ACL''i değişti — ALTER DEFAULT PRIVILEGES mevcut nesneye dokunmamalıydı';
  END IF;
  RAISE NOTICE 'db-privileges assert (B/C/A0): PASS';
END $$;


-- ── C7) M7 sonrası ortak tenants tablosu: sunucu yolları aynen çalışır, istemci yine kapalı ──
CREATE FUNCTION public.zz_tenant_count_definer() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = ''
  AS 'SELECT count(*)::int FROM public.tenants';
REVOKE ALL ON FUNCTION public.zz_tenant_count_definer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zz_tenant_count_definer() TO service_role;
DO $$
DECLARE n int; denied boolean := false;
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO n FROM public.tenants;
  IF n <> 2 THEN RAISE EXCEPTION 'C7a service_role tenants okuyamadı (%)', n; END IF;
  SELECT count(*) INTO n FROM public.client_homeworks;
  IF n <> 2 THEN RAISE EXCEPTION 'C7b service_role client_homeworks okuyamadı (%)', n; END IF;
  n := public.zz_tenant_count_definer();
  IF n <> 2 THEN RAISE EXCEPTION 'C7c SECURITY DEFINER fonksiyon tenants okuyamadı (%)', n; END IF;
  EXECUTE 'RESET ROLE';
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM count(*) FROM public.tenants;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT denied THEN RAISE EXCEPTION 'C7d anon tenants okuyabildi'; END IF;
  RAISE NOTICE 'db-privileges assert (C7 tenants sunucu yolu): PASS';
END $$;
DROP FUNCTION public.zz_tenant_count_definer();
