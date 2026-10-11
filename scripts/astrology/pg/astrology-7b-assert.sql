-- ASTROLOJİ AŞAMA 7B — DB doğrulaması (yalnız yerel embedded-postgres; SENTETİK veri).
--   Türkçe normalizasyon · profil sayfası (sahiplik, arama, doğum tarihi, arşiv, >200 kayıt, sayılar) ·
--   analiz özeti/sayfası (>200 analiz) · danışan adayları (aynı kimlikli üç danışan, başka tenant yok) ·
--   eşleştir / yeniden bağla / kaldır (iyimser kilit, yabancı danışan reddi) · durum alanı · danışan silme.

INSERT INTO public.clients (id, tenant_id, ad, soyad, dogum, telefon) VALUES
  ('c7b70001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'İlknur', 'IŞIK', '1985-05-06', '05321234567'),
  ('c7b70002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ilknur ', ' ışık', '1985-05-06', NULL),
  ('c7b70003-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'İLKNUR', 'Işık', '1985-05-06', '05559876543'),
  ('c7b70004-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'İlknur', 'Işık', '1990-01-01', NULL),
  ('c7b7000b-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'İlknur', 'Işık', '1985-05-06', NULL)
ON CONFLICT (id) DO NOTHING;

SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  u1 uuid := '81818181-8181-4181-8181-818181818181';
  u2 uuid := '82828282-8282-4282-8282-828282828282';
  ub uuid := '8b8b8b8b-8b8b-4b8b-8b8b-8b8b8b8b8b8b';
  k1 uuid := 'c7b70001-0000-4000-8000-000000000001';
  k2 uuid := 'c7b70002-0000-4000-8000-000000000002';
  k3 uuid := 'c7b70003-0000-4000-8000-000000000003';
  kb uuid := 'c7b7000b-0000-4000-8000-00000000000b';
  r jsonb; p uuid; pk uuid; px uuid; n bigint; m bigint; ok boolean; i integer; t text; ids uuid[];
BEGIN
  -- 1) Normalizasyon (TS lib/astrology/search/normalize.ts test vektörleriyle AYNI).
  IF public.astro_norm('  İLKNUR   IŞIK ') <> 'ilknur isik' THEN RAISE EXCEPTION 'norm 1: %', public.astro_norm('  İLKNUR   IŞIK '); END IF;
  IF public.astro_norm('ılık İğde Üzüm Şeker Öğün Çay') <> 'ilik igde uzum seker ogun cay' THEN RAISE EXCEPTION 'norm 2'; END IF;
  IF public.astro_norm('Iİıi') <> 'iiii' THEN RAISE EXCEPTION 'norm 3'; END IF;
  IF public.astro_norm(NULL) <> '' THEN RAISE EXCEPTION 'norm null'; END IF;
  IF public.astro_like_escape('50%_\') <> '50\%\_\\' THEN RAISE EXCEPTION 'like escape'; END IF;

  -- 2) U1: 230 profil (aynı tenant'ta U2'nin 3 profili + başka tenant UB'nin 1 profili).
  FOR i IN 1..230 LOOP
    r := public.astro_profile_create(ta, u1, NULL, 'Sentetik Kişi ' || lpad(i::text, 3, '0'), '1990-01-01'::date + i, NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1990-01-01T10:00:00Z'::timestamptz + make_interval(days => i));
  END LOOP;
  r := public.astro_profile_create(ta, u1, k1, 'İlknur Işık — natal', '1985-05-06', '08:15', true, 'exact_record', NULL, 'İzmir', 38.4, 27.1, 'Europe/Istanbul', 'auto', 10800, '1985-05-06T05:15:00Z');
  pk := (r->>'profile_id')::uuid;
  FOR i IN 1..3 LOOP
    PERFORM public.astro_profile_create(ta, u2, NULL, 'U2 İlknur ' || i, '1985-05-06', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1985-05-06T10:00:00Z');
  END LOOP;
  PERFORM public.astro_profile_create(tb, ub, NULL, 'UB İlknur', '1985-05-06', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1985-05-06T10:00:00Z');

  SELECT max(total_count) INTO n FROM public.astro_profile_page(ta, u1, NULL, NULL, false, 'recent', 100, 0);
  IF n <> 231 THEN RAISE EXCEPTION 'U1 toplam profil 231 olmalı, %', n; END IF;
  -- Sayfalama: 3 sayfada 231 kaydın hepsi, tekrarsız (200 sınırı yok).
  SELECT count(DISTINCT id) INTO n FROM (
    SELECT id FROM public.astro_profile_page(ta, u1, NULL, NULL, false, 'name', 100, 0)
    UNION ALL SELECT id FROM public.astro_profile_page(ta, u1, NULL, NULL, false, 'name', 100, 100)
    UNION ALL SELECT id FROM public.astro_profile_page(ta, u1, NULL, NULL, false, 'name', 100, 200)) s;
  IF n <> 231 THEN RAISE EXCEPTION 'sayfalama tüm profilleri vermedi: %', n; END IF;
  SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, NULL, NULL, false, 'name', 1000, 0);
  IF n <> 100 THEN RAISE EXCEPTION 'sayfa boyu üst sınırı 100 olmalı'; END IF;
  SELECT label INTO t FROM public.astro_profile_page(ta, u1, NULL, NULL, false, 'name', 1, 230);
  IF t <> 'Sentetik Kişi 230' THEN RAISE EXCEPTION 'ad sıralaması son kayıt: %', t; END IF;

  -- Sahiplik: U2 yalnız 3, UB yalnız 1; U1 araması U2/UB kayıtlarını içermez.
  SELECT max(total_count) INTO n FROM public.astro_profile_page(ta, u2, NULL, NULL, false, 'recent', 50, 0);
  IF n <> 3 THEN RAISE EXCEPTION 'U2 toplamı 3 olmalı, %', n; END IF;
  SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, 'ilknur', NULL, false, 'recent', 50, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'U1 "ilknur" araması yalnız kendi profilini dönmeli, %', n; END IF;
  SELECT count(*) INTO n FROM public.astro_profile_page(tb, ub, 'ilknur', NULL, false, 'recent', 50, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'UB araması'; END IF;

  -- Türkçe arama: İ/I/ı/i ve büyük-küçük + boşluk; danışan adıyla da bulunur.
  FOREACH t IN ARRAY ARRAY['İLKNUR', 'ilknur ışık', '  IŞIK ', 'isik', 'ılknur'] LOOP
    SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, t, NULL, false, 'recent', 50, 0);
    IF n <> 1 THEN RAISE EXCEPTION 'Türkçe arama "%" → % sonuç', t, n; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, '%', NULL, false, 'recent', 50, 0);
  IF n <> 0 THEN RAISE EXCEPTION '%% joker olarak yorumlandı'; END IF;
  SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, NULL, '1985-05-06', false, 'recent', 50, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'doğum tarihi filtresi'; END IF;

  -- 3) >200 kayıtlı analiz (aynı profil) + özet / gelenek sayfası.
  ids := ARRAY[]::uuid[];
  FOR i IN 1..205 LOOP
    r := public.astro_analysis_save_v2(ta, u1, pk, 1, NULL, NULL, NULL, CASE WHEN i % 3 = 0 THEN 'vedic.d1' WHEN i % 3 = 1 THEN 'western.natal' ELSE 'kp.chart' END,
         'Analiz ' || i, gen_random_uuid(), '{}', '{"label":"İlknur Işık — natal"}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  END LOOP;
  SELECT analysis_count INTO n FROM public.astro_profile_page(ta, u1, 'ilknur', NULL, false, 'recent', 50, 0);
  IF n <> 205 THEN RAISE EXCEPTION 'profil analiz sayısı 205 olmalı, %', n; END IF;
  SELECT sum(analysis_count) INTO n FROM public.astro_analysis_summary(ta, u1, pk);
  IF n <> 205 THEN RAISE EXCEPTION 'özet toplamı'; END IF;
  SELECT count(*) INTO n FROM public.astro_analysis_summary(ta, u2, pk);
  IF n <> 0 THEN RAISE EXCEPTION 'U2 U1 analiz özetini gördü'; END IF;
  SELECT count(DISTINCT id) INTO n FROM (
    SELECT id FROM public.astro_analysis_page(ta, u1, pk, 'western', NULL, 50, 0)
    UNION ALL SELECT id FROM public.astro_analysis_page(ta, u1, pk, 'western', NULL, 50, 50)) s;
  SELECT analysis_count INTO m FROM public.astro_analysis_summary(ta, u1, pk) WHERE technique = 'western.natal';
  IF n <> m OR m <> 69 THEN RAISE EXCEPTION 'Batı sayfaları % / özet %', n, m; END IF;
  SELECT count(*) INTO n FROM public.astro_analysis_page(ta, u1, pk, 'kp', NULL, 100, 0) WHERE technique NOT LIKE 'kp.%';
  IF n <> 0 THEN RAISE EXCEPTION 'KP sayfasına başka gelenek girdi'; END IF;
  SELECT count(*) INTO n FROM public.astro_analysis_page(ta, u2, pk, NULL, NULL, 100, 0);
  IF n <> 0 THEN RAISE EXCEPTION 'U2 U1 analiz sayfasını gördü'; END IF;

  -- 4) Danışan adayları: aynı ad/soyad/doğum tarihli ÜÇ ayrı kayıt; başka tenant'ınki YOK; tarih daraltır.
  SELECT count(*) INTO n FROM public.astro_client_candidates(ta, u1, 'İlknur Işık', '1985-05-06', 20);
  IF n <> 3 THEN RAISE EXCEPTION 'aynı kimlikli üç aday beklenirdi, %', n; END IF;
  SELECT count(*) INTO n FROM public.astro_client_candidates(ta, u1, 'ILKNUR ISIK', NULL, 20);
  IF n <> 4 THEN RAISE EXCEPTION 'tarihsiz aday sayısı 4 olmalı, %', n; END IF;
  SELECT count(*) INTO n FROM public.astro_client_candidates(ta, u1, 'İlknur Işık', '1985-05-06', 20) WHERE id = kb;
  IF n <> 0 THEN RAISE EXCEPTION 'başka tenant danışanı aday oldu'; END IF;
  SELECT count(*) INTO n FROM public.astro_client_candidates(tb, ub, 'İlknur Işık', '1985-05-06', 20);
  IF n <> 1 THEN RAISE EXCEPTION 'UB kendi tenantında 1 aday görmeli'; END IF;
  SELECT count(*) INTO n FROM public.astro_client_candidates(ta, u1, 'i', NULL, 20);
  IF n <> 0 THEN RAISE EXCEPTION 'tek harf arama tüm danışanları döktü'; END IF;
  SELECT linked_profile_count INTO n FROM public.astro_client_candidates(ta, u1, 'İlknur Işık', '1985-05-06', 20) WHERE id = k1;
  IF n <> 1 THEN RAISE EXCEPTION 'aday bağlı profil sayısı'; END IF;
  SELECT linked_profile_count INTO n FROM public.astro_client_candidates(ta, u2, 'İlknur Işık', '1985-05-06', 20) WHERE id = k1;
  IF n <> 0 THEN RAISE EXCEPTION 'U2 U1 bağlarını sayıda gördü'; END IF;

  -- 5) Eşleştirme: iyimser kilit, yeniden bağlama, kaldırma, yabancı danışan / yabancı profil reddi.
  ok := false;
  BEGIN PERFORM public.astro_profile_set_client(ta, u1, pk, k2, NULL);
  EXCEPTION WHEN SQLSTATE '40001' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'bayat beklenen bağ kabul edildi'; END IF;
  r := public.astro_profile_set_client(ta, u1, pk, k2, k1);
  IF (r->>'previous_client_id')::uuid <> k1 THEN RAISE EXCEPTION 'yeniden bağlama sonucu'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_set_client(ta, u1, pk, kb, k2);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'başka tenant danışanına bağlandı'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_set_client(ta, u1, pk, 'deadbeef-0000-4000-8000-000000000000', k2);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'var olmayan danışana bağlandı'; END IF;
  ok := false;
  BEGIN PERFORM public.astro_profile_set_client(ta, u2, pk, k3, k2);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'U2 U1 profilini eşleştirdi'; END IF;
  SELECT client_id INTO px FROM public.astro_birth_profiles WHERE id = pk;
  IF px <> k2 THEN RAISE EXCEPTION 'reddedilen işlemler bağı değiştirdi'; END IF;

  -- 6) Durum alanı: bağlı + 205 analiz; U2 için yok; kaldırınca bağlantı yok, analizler aynen.
  SELECT linked_profile_count, analysis_count INTO n, m FROM public.astro_client_status(ta, u1, k2);
  IF n <> 1 OR m <> 205 THEN RAISE EXCEPTION 'durum k2: % profil / % analiz', n, m; END IF;
  SELECT linked_profile_count INTO n FROM public.astro_client_status(ta, u2, k2);
  IF n <> 0 THEN RAISE EXCEPTION 'U2 U1 eşleştirmesini durumda gördü'; END IF;
  -- Eşleşme var ama analiz yok.
  SELECT id INTO px FROM public.astro_birth_profiles WHERE owner_user_id = u1 AND label = 'Sentetik Kişi 001';
  PERFORM public.astro_profile_set_client(ta, u1, px, k3, NULL);
  SELECT linked_profile_count, analysis_count INTO n, m FROM public.astro_client_status(ta, u1, k3);
  IF n <> 1 OR m <> 0 THEN RAISE EXCEPTION 'eşleşme var analiz yok durumu'; END IF;
  -- Kaldır.
  PERFORM public.astro_profile_set_client(ta, u1, pk, NULL, k2);
  SELECT linked_profile_count INTO n FROM public.astro_client_status(ta, u1, k2);
  IF n <> 0 THEN RAISE EXCEPTION 'kaldırma sonrası bağ duruyor'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = pk;
  IF n <> 205 THEN RAISE EXCEPTION 'eşleştirme kaldırma analiz sildi'; END IF;

  -- 7) Arşiv: listeden çıkar, arşiv filtresinde bulunur, analizler aynen, geri alınır.
  -- (arama 'natal' = yalnız pk etiketi; 'ilknur' danışan adı üzerinden eşleşen başka profili de bulur)
  UPDATE public.astro_birth_profiles SET archived_at = now() WHERE tenant_id = ta AND owner_user_id = u1 AND id = pk;
  SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, 'natal', NULL, false, 'recent', 50, 0);
  IF n <> 0 THEN RAISE EXCEPTION 'arşivli profil etkin listede'; END IF;
  SELECT analysis_count INTO n FROM public.astro_profile_page(ta, u1, 'natal', NULL, true, 'recent', 50, 0);
  IF n <> 205 THEN RAISE EXCEPTION 'arşiv filtresi / analiz sayısı'; END IF;
  SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, 'ilknur', NULL, false, 'recent', 50, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'danışan adıyla arama (eşleşmiş profil) bulunmadı'; END IF;
  UPDATE public.astro_birth_profiles SET archived_at = NULL WHERE tenant_id = ta AND owner_user_id = u1 AND id = pk;
  SELECT count(*) INTO n FROM public.astro_profile_page(ta, u1, 'natal', NULL, false, 'recent', 50, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'arşivden çıkarma'; END IF;
  IF has_table_privilege('service_role', 'public.astro_birth_profiles', 'DELETE') THEN RAISE EXCEPTION 'profil silme yetkisi açıldı'; END IF;
END
$$;
RESET ROLE;

-- 8) Danışan Yolculuğu'nda danışan silme: bağ NULL, profil + analizler korunur; durum "bağlantı yok".
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u1 uuid := '81818181-8181-4181-8181-818181818181';
  k3 uuid := 'c7b70003-0000-4000-8000-000000000003';
  n bigint; m bigint;
BEGIN
  SELECT count(*) INTO m FROM public.astro_analyses;
  DELETE FROM public.clients WHERE id = k3;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE owner_user_id = u1 AND label = 'Sentetik Kişi 001' AND client_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'danışan silme profili sildi ya da bağı bıraktı'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses;
  IF n <> m THEN RAISE EXCEPTION 'danışan silme analiz sildi'; END IF;
  SELECT linked_profile_count INTO n FROM public.astro_client_status(ta, u1, k3);
  IF n <> 0 THEN RAISE EXCEPTION 'silinen danışan için bağ görünüyor'; END IF;
  IF has_function_privilege('authenticated', 'public.astro_profile_page(uuid, uuid, text, date, boolean, text, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.astro_client_candidates(uuid, uuid, text, date, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon/authenticated 7B fonksiyonlarını çalıştırabiliyor';
  END IF;
END
$$;
