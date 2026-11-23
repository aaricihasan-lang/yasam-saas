-- =============================================================================
-- Şifa Rehberi V1 — HARD DELETE (OWNER ONAYLI, 22.11.2026) · DEMO HESAP KORUNUR
--
-- Owner envanteri (production): healing_guides 37 · healing_guide_sections 62 · healing_guide_create_idempotency 1
--   normal uzman tenant'ı 35 rehber / 62 bölüm · admin tenant'ı 1 rehber · DEMO tenant'ı 1 rehber (KORUNUR)
--
-- KAPSAM: YALNIZ demo olmayan 2 tenant'ın 36 healing_guides kaydı (+ ON DELETE CASCADE: bölümler, idempotency).
-- DOKUNULMAZ: demo tenant'ı ve tüm verisi · users / tenants / user_sessions / danışanlar / diğer modüller ·
--   yasam_hafizasi_report_snapshots · admin_library_transfer_batches · Storage nesneleri (bu aşamada SİLİNMEZ).
-- YH: healing_* üzerindeki CDC tetikleyicileri silinen kayıtlar için 'delete' olayı kuyruğa ekler (beklenen;
--   kaynak aktifse worker bu 36 rehberin TÜRETİLMİŞ indeks satırlarını temizler). Bağımsız YH kaydı silinmez.
--
-- ÇALIŞTIRMA (Supabase SQL Editor, production) — ADIMLARI AYRI AYRI çalıştırın (metni seçip "Run"):
--   ADIM 1  salt-okunur ön izleme (tek SELECT) — sonucu kontrol edin.
--   ADIM 2  tek DO bloğu — yedek + doğrulama + silme + son doğrulama. TEK İFADE → ATOMİK: herhangi bir doğrulama
--           tutmazsa RAISE EXCEPTION ile TAMAMI geri alınır (yedek dahil hiçbir şey kalmaz). Başarıda "Success.
--           No rows returned" görülür.
--   ADIM 3  salt-okunur son kontrol (tek SELECT) — kalan rehber TAM 1 ve demo'ya ait olmalı.
--   GERİ DÖNÜŞ  dosya sonunda (yorum) — yalnız gerekirse.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- ADIM 1 · ÖN İZLEME (YALNIZ OKUMA — tek SELECT; hiçbir şey değiştirmez)
-- ═════════════════════════════════════════════════════════════════════════════
SELECT jsonb_build_object(
  'toplam', jsonb_build_object(
    'healing_guides', (SELECT count(*) FROM public.healing_guides),
    'healing_guide_sections', (SELECT count(*) FROM public.healing_guide_sections),
    'healing_guide_create_idempotency', (SELECT count(*) FROM public.healing_guide_create_idempotency)),
  'tenantlar', (SELECT jsonb_agg(jsonb_build_object(
        'tenant_id', g.tenant_id,
        'demo_tenant', EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = g.tenant_id AND u.is_demo_account),
        'demo_olmayan_kullanici', (SELECT count(*) FROM public.users u WHERE u.tenant_id = g.tenant_id AND NOT u.is_demo_account),
        'rehber', g.n,
        'bolum', (SELECT count(*) FROM public.healing_guide_sections s JOIN public.healing_guides x ON x.id = s.guide_id WHERE x.tenant_id = g.tenant_id),
        'idempotency', (SELECT count(*) FROM public.healing_guide_create_idempotency i JOIN public.healing_guides x ON x.id = i.guide_id WHERE x.tenant_id = g.tenant_id),
        'islem', CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = g.tenant_id AND u.is_demo_account) THEN 'KORUNACAK' ELSE 'SILINECEK' END)
      ORDER BY g.n DESC)
    FROM (SELECT tenant_id, count(*) AS n FROM public.healing_guides GROUP BY tenant_id) g)
) AS on_izleme;


-- ═════════════════════════════════════════════════════════════════════════════
-- ADIM 2 · YEDEK + DOĞRULAMA + HARD DELETE (tek DO bloğu = tek işlem; hata → tamamı geri alınır)
-- ═════════════════════════════════════════════════════════════════════════════
DO $hard_delete$
DECLARE
  -- Owner envanteri (beklenen değerler; uyuşmazsa DURUR)
  c_total_guides    constant int := 37;
  c_total_sections  constant int := 62;
  c_total_idem      constant int := 1;
  c_target_guides   constant int := 36;
  c_target_sections constant int := 62;
  c_target_tenants  constant int := 2;
  c_demo_guides     constant int := 1;

  v_demo_tenants   uuid[];
  v_target_tenants uuid[];
  v_mixed          int;
  v_n              int;
  v_tg int; v_ts int; v_ti int;           -- hedef: rehber / bölüm / idempotency
  v_dg int; v_ds int; v_di int;           -- demo:  rehber / bölüm / idempotency
  v_before jsonb; v_after jsonb;
  v_deleted int;
BEGIN
  -- 1) Toplamlar envanterle aynı mı?
  IF (SELECT count(*) FROM public.healing_guides) <> c_total_guides
     OR (SELECT count(*) FROM public.healing_guide_sections) <> c_total_sections
     OR (SELECT count(*) FROM public.healing_guide_create_idempotency) <> c_total_idem THEN
    RAISE EXCEPTION 'DUR: toplamlar envanterden farklı (rehber %, bölüm %, idempotency %) — envanter yenilenmeli',
      (SELECT count(*) FROM public.healing_guides), (SELECT count(*) FROM public.healing_guide_sections),
      (SELECT count(*) FROM public.healing_guide_create_idempotency);
  END IF;

  -- 2) Demo tenant(lar)ı: V1 kaydı olan ve demo hesabı (users.is_demo_account) bulunan tenant. KAPSAM DIŞI.
  SELECT coalesce(array_agg(DISTINCT g.tenant_id), '{}') INTO v_demo_tenants
    FROM public.healing_guides g
   WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = g.tenant_id AND u.is_demo_account);
  -- Hedef: V1 kaydı olan ve HİÇ demo hesabı bulunmayan tenant'lar.
  SELECT coalesce(array_agg(DISTINCT g.tenant_id), '{}') INTO v_target_tenants
    FROM public.healing_guides g
   WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = g.tenant_id AND u.is_demo_account);

  IF cardinality(v_demo_tenants) <> 1 THEN
    RAISE EXCEPTION 'DUR: demo tenant sayısı % (beklenen 1)', cardinality(v_demo_tenants);
  END IF;
  IF cardinality(v_target_tenants) <> c_target_tenants THEN
    RAISE EXCEPTION 'DUR: hedef (demo olmayan) tenant sayısı % (beklenen %)', cardinality(v_target_tenants), c_target_tenants;
  END IF;
  IF v_demo_tenants && v_target_tenants THEN
    RAISE EXCEPTION 'DUR: demo tenant hedef listesine karıştı';
  END IF;
  -- Demo tenant'ında demo OLMAYAN hesap da varsa (karışık tenant) → güvenli değil, DUR.
  SELECT count(*) INTO v_mixed FROM public.users u WHERE u.tenant_id = ANY (v_demo_tenants) AND NOT u.is_demo_account;
  IF v_mixed <> 0 THEN
    RAISE EXCEPTION 'DUR: demo tenantında % demo olmayan hesap var — kapsam Owner ile netleşmeli', v_mixed;
  END IF;

  -- 3) Hedef / demo sayıları
  SELECT count(*) INTO v_tg FROM public.healing_guides WHERE tenant_id = ANY (v_target_tenants);
  SELECT count(*) INTO v_ts FROM public.healing_guide_sections s JOIN public.healing_guides g ON g.id = s.guide_id WHERE g.tenant_id = ANY (v_target_tenants);
  SELECT count(*) INTO v_ti FROM public.healing_guide_create_idempotency i JOIN public.healing_guides g ON g.id = i.guide_id WHERE g.tenant_id = ANY (v_target_tenants);
  SELECT count(*) INTO v_dg FROM public.healing_guides WHERE tenant_id = ANY (v_demo_tenants);
  SELECT count(*) INTO v_ds FROM public.healing_guide_sections s JOIN public.healing_guides g ON g.id = s.guide_id WHERE g.tenant_id = ANY (v_demo_tenants);
  SELECT count(*) INTO v_di FROM public.healing_guide_create_idempotency i JOIN public.healing_guides g ON g.id = i.guide_id WHERE g.tenant_id = ANY (v_demo_tenants);
  IF v_tg <> c_target_guides OR v_ts <> c_target_sections OR v_dg <> c_demo_guides THEN
    RAISE EXCEPTION 'DUR: hedef rehber % / bölüm % (beklenen % / %), demo rehber % (beklenen %)',
      v_tg, v_ts, c_target_guides, c_target_sections, v_dg, c_demo_guides;
  END IF;
  IF v_tg + v_dg <> c_total_guides OR v_ts + v_ds <> c_total_sections OR v_ti + v_di <> c_total_idem THEN
    RAISE EXCEPTION 'DUR: hedef + demo toplamı envanterle tutmuyor';
  END IF;

  -- 4) Kapsam dışı veri — ÖNCE özeti (aynı işlem içinde sonra karşılaştırılır)
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.users),
    'tenants', (SELECT count(*) FROM public.tenants),
    'user_sessions', (SELECT count(*) FROM public.user_sessions),
    'clients', (SELECT count(*) FROM public.clients),
    'client_stone_photos', (SELECT count(*) FROM public.client_stone_photos),
    'yh_report_snapshots', (SELECT count(*) FROM public.yasam_hafizasi_report_snapshots),
    'yh_index', (SELECT count(*) FROM public.yasam_hafizasi_index),
    'admin_transfer_batches', (SELECT count(*) FROM public.admin_library_transfer_batches),
    'storage_objects', (SELECT count(*) FROM storage.objects),
    'demo_guides', (SELECT md5(coalesce(string_agg(g::text, '|' ORDER BY g.id), '')) FROM public.healing_guides g WHERE g.tenant_id = ANY (v_demo_tenants)),
    'demo_sections', (SELECT md5(coalesce(string_agg(s::text, '|' ORDER BY s.id), '')) FROM public.healing_guide_sections s JOIN public.healing_guides g ON g.id = s.guide_id WHERE g.tenant_id = ANY (v_demo_tenants)))
  INTO v_before;

  -- 5) GERİ DÖNÜŞ YEDEĞİ — ayrı şema (public DIŞI → PostgREST/API'ye açık değil), yalnız hedef satırlar, tam satır jsonb.
  CREATE SCHEMA IF NOT EXISTS sifa_v1_silme_yedek;
  REVOKE ALL ON SCHEMA sifa_v1_silme_yedek FROM PUBLIC;
  CREATE TABLE sifa_v1_silme_yedek.yedek_20261122 (
    tablo text NOT NULL, satir jsonb NOT NULL, alindi timestamptz NOT NULL DEFAULT now());   -- zaten varsa HATA → DUR
  REVOKE ALL ON sifa_v1_silme_yedek.yedek_20261122 FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA sifa_v1_silme_yedek FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON sifa_v1_silme_yedek.yedek_20261122 FROM anon, authenticated';
  END IF;
  INSERT INTO sifa_v1_silme_yedek.yedek_20261122 (tablo, satir)
    SELECT 'healing_guides', to_jsonb(g) FROM public.healing_guides g WHERE g.tenant_id = ANY (v_target_tenants);
  INSERT INTO sifa_v1_silme_yedek.yedek_20261122 (tablo, satir)
    SELECT 'healing_guide_sections', to_jsonb(s) FROM public.healing_guide_sections s JOIN public.healing_guides g ON g.id = s.guide_id WHERE g.tenant_id = ANY (v_target_tenants);
  INSERT INTO sifa_v1_silme_yedek.yedek_20261122 (tablo, satir)
    SELECT 'healing_guide_create_idempotency', to_jsonb(i) FROM public.healing_guide_create_idempotency i JOIN public.healing_guides g ON g.id = i.guide_id WHERE g.tenant_id = ANY (v_target_tenants);
  SELECT count(*) INTO v_n FROM sifa_v1_silme_yedek.yedek_20261122;
  IF v_n <> v_tg + v_ts + v_ti THEN
    RAISE EXCEPTION 'DUR: yedek satır sayısı % (beklenen %)', v_n, v_tg + v_ts + v_ti;
  END IF;

  -- 6) HARD DELETE — YALNIZ hedef tenant'ların rehberleri (CASCADE: bölümler + idempotency)
  DELETE FROM public.healing_guides WHERE tenant_id = ANY (v_target_tenants);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> c_target_guides THEN
    RAISE EXCEPTION 'DUR: silinen rehber % (beklenen %) → GERİ ALINDI', v_deleted, c_target_guides;
  END IF;

  -- 7) CASCADE + son durum doğrulaması
  IF (SELECT count(*) FROM public.healing_guides) <> c_demo_guides
     OR EXISTS (SELECT 1 FROM public.healing_guides WHERE NOT (tenant_id = ANY (v_demo_tenants))) THEN
    RAISE EXCEPTION 'DUR: kalan rehber demo''ya ait TEK kayıt değil → GERİ ALINDI';
  END IF;
  IF (SELECT count(*) FROM public.healing_guide_sections) <> v_ds
     OR (SELECT count(*) FROM public.healing_guide_create_idempotency) <> v_di THEN
    RAISE EXCEPTION 'DUR: CASCADE beklenen gibi çalışmadı (bölüm %, idempotency %; beklenen %, %) → GERİ ALINDI',
      (SELECT count(*) FROM public.healing_guide_sections), (SELECT count(*) FROM public.healing_guide_create_idempotency), v_ds, v_di;
  END IF;
  IF EXISTS (SELECT 1 FROM public.healing_guide_sections s WHERE NOT EXISTS (SELECT 1 FROM public.healing_guides g WHERE g.id = s.guide_id)) THEN
    RAISE EXCEPTION 'DUR: yetim bölüm kaldı → GERİ ALINDI';
  END IF;

  -- 8) Kapsam dışı veri BİREBİR korundu mu? (demo rehber + bölüm içeriği dahil)
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.users),
    'tenants', (SELECT count(*) FROM public.tenants),
    'user_sessions', (SELECT count(*) FROM public.user_sessions),
    'clients', (SELECT count(*) FROM public.clients),
    'client_stone_photos', (SELECT count(*) FROM public.client_stone_photos),
    'yh_report_snapshots', (SELECT count(*) FROM public.yasam_hafizasi_report_snapshots),
    'yh_index', (SELECT count(*) FROM public.yasam_hafizasi_index),
    'admin_transfer_batches', (SELECT count(*) FROM public.admin_library_transfer_batches),
    'storage_objects', (SELECT count(*) FROM storage.objects),
    'demo_guides', (SELECT md5(coalesce(string_agg(g::text, '|' ORDER BY g.id), '')) FROM public.healing_guides g WHERE g.tenant_id = ANY (v_demo_tenants)),
    'demo_sections', (SELECT md5(coalesce(string_agg(s::text, '|' ORDER BY s.id), '')) FROM public.healing_guide_sections s JOIN public.healing_guides g ON g.id = s.guide_id WHERE g.tenant_id = ANY (v_demo_tenants)))
  INTO v_after;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'DUR: kapsam dışı veri değişti → GERİ ALINDI. önce=% sonra=%', v_before, v_after;
  END IF;

  RAISE NOTICE 'TAMAM: % rehber + % bölüm + % idempotency silindi; yedek sifa_v1_silme_yedek.yedek_20261122 (% satır); kalan rehber % (demo).',
    v_tg, v_ts, v_ti, v_n, c_demo_guides;
END
$hard_delete$;


-- ═════════════════════════════════════════════════════════════════════════════
-- ADIM 3 · SON KONTROL (YALNIZ OKUMA — tek SELECT)
--   Beklenen: rehber 1 + kalan_rehber_demo true · bölüm = demo bölüm sayısı · yedek 36 rehber + 62 bölüm + hedefe ait
--   idempotency · yh_outbox'ta silinen kayıtlar için 'delete' olayları (kaynak aktifse; worker sonra indeksi temizler).
-- ═════════════════════════════════════════════════════════════════════════════
SELECT jsonb_build_object(
  'healing_guides', (SELECT count(*) FROM public.healing_guides),
  'kalan_rehber_demo', (SELECT bool_and(EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = g.tenant_id AND u.is_demo_account)) FROM public.healing_guides g),
  'healing_guide_sections', (SELECT count(*) FROM public.healing_guide_sections),
  'healing_guide_create_idempotency', (SELECT count(*) FROM public.healing_guide_create_idempotency),
  'yedek', (SELECT jsonb_object_agg(tablo, n) FROM (SELECT tablo, count(*) AS n FROM sifa_v1_silme_yedek.yedek_20261122 GROUP BY tablo) z),
  'yh_outbox_delete_olaylari', (SELECT jsonb_object_agg(source_key || ':' || status, n) FROM (
      SELECT source_key, status, count(*) AS n FROM public.yasam_hafizasi_outbox
       WHERE source_key IN ('sifa_rehberi:guides', 'sifa_rehberi:guide-sections') AND operation = 'delete' GROUP BY 1, 2) z),
  'yh_v1_indeks_satiri', (SELECT count(*) FROM public.yasam_hafizasi_index WHERE source_table IN ('healing_guides', 'healing_guide_sections'))
) AS son_kontrol;


-- ═════════════════════════════════════════════════════════════════════════════
-- GERİ DÖNÜŞ (YALNIZ GEREKİRSE — yorum; ayrı onayla çalıştırılır)
--   Sıra: rehberler → bölümler → idempotency. YH tetikleyicileri 'upsert' olayı üretir → yeniden indekslenir.
--   Önce: SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'
--         AND table_name LIKE 'healing_guide%' AND is_generated = 'ALWAYS';  → satır dönerse o kolonlar INSERT'ten çıkarılır.
-- ═════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- INSERT INTO public.healing_guides
--   SELECT (jsonb_populate_record(NULL::public.healing_guides, satir)).* FROM sifa_v1_silme_yedek.yedek_20261122 WHERE tablo = 'healing_guides';
-- INSERT INTO public.healing_guide_sections
--   SELECT (jsonb_populate_record(NULL::public.healing_guide_sections, satir)).* FROM sifa_v1_silme_yedek.yedek_20261122 WHERE tablo = 'healing_guide_sections';
-- INSERT INTO public.healing_guide_create_idempotency
--   SELECT (jsonb_populate_record(NULL::public.healing_guide_create_idempotency, satir)).* FROM sifa_v1_silme_yedek.yedek_20261122 WHERE tablo = 'healing_guide_create_idempotency';
-- COMMIT;
-- Yedek, Owner silmenin kalıcı olduğunu onayladıktan sonra kaldırılabilir:  DROP SCHEMA sifa_v1_silme_yedek CASCADE;
