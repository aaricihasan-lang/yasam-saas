-- DIJ-03 (20271104000200) davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
-- Kota parametre olarak verilir; burada küçük ölçek (Q = 10 000 bayt, tekil sınır 5 000) kullanılır,
-- ayrıca gerçek 2 GB değeriyle sınır testi yapılır.
DO $$
DECLARE
  n bigint; r jsonb;
  ta constant uuid := '10000000-0000-0000-0000-00000000000a';
  tb constant uuid := '10000000-0000-0000-0000-00000000000b';
  tc constant uuid := '10000000-0000-0000-0000-00000000000c';
  q  constant bigint := 10000;
  mx constant bigint := 5000;
  g2 constant bigint := 2147483648;
BEGIN
  -- ── B: bucket ────────────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM storage.buckets
   WHERE id = 'personal-archive' AND public = false AND file_size_limit = 52428800 AND allowed_mime_types IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'B1 personal-archive bucket limiti/özelliği beklenen değil'; END IF;

  -- ── T: gerçek bayt toplamı (bozuk boyut 0, başka bucket/tenant sayılmaz) ──
  n := public.personal_archive_tenant_bytes(ta);
  IF n <> 3500 THEN RAISE EXCEPTION 'T1 tenant A toplamı 3500 değil (%)', n; END IF;
  n := public.personal_archive_tenant_bytes(tb);
  IF n <> 7000 THEN RAISE EXCEPTION 'T2 tenant B toplamı 7000 değil (%)', n; END IF;
  IF public.personal_archive_tenant_bytes(NULL) <> 0 THEN RAISE EXCEPTION 'T3 NULL tenant 0 değil'; END IF;

  -- ── R: rezervasyon (A: depoda 3500) ──────────────────────────────────────
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/r1_a.pdf', 4000, q, 5, 3600);
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'R1 kota altı rezervasyon reddedildi: %', r; END IF;   -- 7500
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/r2_b.pdf', 2500, q, 5, 3600);
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'R2 tam sınır (=kota) reddedildi: %', r; END IF;    -- 10000
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/r3_c.pdf', 1, q, 5, 3600);
  IF r->>'reason' <> 'quota' THEN RAISE EXCEPTION 'R3 kota+1 bayt kabul edildi: %', r; END IF;
  -- Başka tenant (B: depoda 7000) etkilenmez
  r := public.personal_archive_reserve_upload(tb, tb::text || '/arc9/r1_x.pdf', 3000, q, 5, 3600);
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'R4 tenant B, A''nın rezervasyonundan etkilendi: %', r; END IF;
  -- Yol başka tenant öneki → invalid
  r := public.personal_archive_reserve_upload(ta, tb::text || '/arc9/hack.pdf', 1, q, 5, 3600);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'R5 yabancı tenant yolu kabul edildi: %', r; END IF;
  -- Aynı yol ikinci kez
  r := public.personal_archive_reserve_upload('10000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000d/z/dup.pdf', 1, q, 5, 3600);
  r := public.personal_archive_reserve_upload('10000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000d/z/dup.pdf', 1, q, 5, 3600);
  IF r->>'reason' <> 'duplicate_path' THEN RAISE EXCEPTION 'R6 aynı yol iki kez rezerve edildi: %', r; END IF;

  -- ── C: commit (gerçek boyut) ─────────────────────────────────────────────
  -- r1: beyan 4000, gerçek 4000 → ok; rezervasyon kapanır
  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('personal-archive', ta::text || '/arc1/r1_a.pdf', '{"size": 4000, "mimetype": "application/pdf"}');
  r := public.personal_archive_commit_upload(ta, ta::text || '/arc1/r1_a.pdf', q, mx);
  IF r->>'ok' <> 'true' OR (r->>'size')::bigint <> 4000 THEN RAISE EXCEPTION 'C1 geçerli commit reddedildi: %', r; END IF;
  SELECT count(*) INTO n FROM public.personal_archive_upload_reservations WHERE path = ta::text || '/arc1/r1_a.pdf';
  IF n <> 0 THEN RAISE EXCEPTION 'C2 commit sonrası rezervasyon kaldı'; END IF;
  -- r2: beyan 2500 AMA gerçek 4900 (yalan beyan) → depo 3500+4000+4900 = 12400 > kota → quota
  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('personal-archive', ta::text || '/arc1/r2_b.pdf', '{"size": 4900}');
  r := public.personal_archive_commit_upload(ta, ta::text || '/arc1/r2_b.pdf', q, mx);
  IF r->>'reason' <> 'quota' THEN RAISE EXCEPTION 'C3 yalan beyanla kota aşımı yakalanmadı: %', r; END IF;
  DELETE FROM storage.objects WHERE name = ta::text || '/arc1/r2_b.pdf';   -- route nesneyi siler
  -- Tekil sınır
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/big.pdf', 100, q, 5, 3600);
  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('personal-archive', ta::text || '/arc1/big.pdf', '{"size": 5001}');
  r := public.personal_archive_commit_upload(ta, ta::text || '/arc1/big.pdf', q, mx);
  IF r->>'reason' <> 'too_large' THEN RAISE EXCEPTION 'C4 tekil sınır aşımı yakalanmadı: %', r; END IF;
  DELETE FROM storage.objects WHERE name = ta::text || '/arc1/big.pdf';
  -- Metadata boyutu yok → size_unknown (fail-closed)
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/nometa.pdf', 10, q, 5, 3600);
  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('personal-archive', ta::text || '/arc1/nometa.pdf', '{}');
  r := public.personal_archive_commit_upload(ta, ta::text || '/arc1/nometa.pdf', q, mx);
  IF r->>'reason' <> 'size_unknown' THEN RAISE EXCEPTION 'C5 eksik metadata kabul edildi: %', r; END IF;
  DELETE FROM storage.objects WHERE name = ta::text || '/arc1/nometa.pdf';
  -- Nesne yok → missing
  r := public.personal_archive_commit_upload(ta, ta::text || '/arc1/yok.pdf', q, mx);
  IF r->>'reason' <> 'missing' THEN RAISE EXCEPTION 'C6 olmayan nesne kabul edildi: %', r; END IF;

  -- ── D: silme sonrası kota boşalır ────────────────────────────────────────
  n := public.personal_archive_tenant_bytes(ta);              -- 3500 + 4000 = 7500
  IF n <> 7500 THEN RAISE EXCEPTION 'D1 beklenen 7500 (%)', n; END IF;
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/d1.pdf', 3000, q, 5, 3600);
  IF r->>'reason' <> 'quota' THEN RAISE EXCEPTION 'D2 dolu kotada rezervasyon kabul edildi: %', r; END IF;
  DELETE FROM storage.objects WHERE name = ta::text || '/arc1/r1_a.pdf';   -- dosya silindi
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/d1.pdf', 3000, q, 5, 3600);
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'D3 silme sonrası kota boşalmadı: %', r; END IF;

  -- ── E: süresi dolan rezervasyon (iptal/başarısız yükleme) kotadan düşer ──
  UPDATE public.personal_archive_upload_reservations SET expires_at = now() - interval '1 second' WHERE tenant_id = ta;
  r := public.personal_archive_reserve_upload(ta, ta::text || '/arc1/e1.pdf', 6500, q, 5, 3600);  -- 3500 + 6500 = 10000
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'E1 süresi dolan rezervasyon kotada kaldı: %', r; END IF;

  -- ── P: bekleyen yükleme sınırı ──────────────────────────────────────────
  FOR n IN 1..3 LOOP
    r := public.personal_archive_reserve_upload(tc, tc::text || '/a/p' || n || '.pdf', 1, q, 3, 3600);
  END LOOP;
  r := public.personal_archive_reserve_upload(tc, tc::text || '/a/p4.pdf', 1, q, 3, 3600);
  IF r->>'reason' <> 'pending_limit' THEN RAISE EXCEPTION 'P1 bekleyen yükleme sınırı uygulanmadı: %', r; END IF;

  -- ── G: gerçek 2 GB sınırı (2 147 483 648 bayt) ───────────────────────────
  r := public.personal_archive_reserve_upload(tc, tc::text || '/g/full.bin2', g2 - 3, g2, 10, 3600);  -- 3 bayt zaten rezerve
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'G1 tam 2 GB sınırı reddedildi: %', r; END IF;
  r := public.personal_archive_reserve_upload(tc, tc::text || '/g/over.pdf', 1, g2, 10, 3600);
  IF r->>'reason' <> 'quota' THEN RAISE EXCEPTION 'G2 2 GB + 1 bayt kabul edildi: %', r; END IF;

  -- ── Y: yetkiler / RLS ───────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.personal_archive_reserve_upload(uuid,text,bigint,bigint,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.personal_archive_commit_upload(uuid,text,bigint,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.personal_archive_tenant_bytes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Y1 istemci EXECUTE açık';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.personal_archive_commit_upload(uuid,text,bigint,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Y2 service_role EXECUTE yok';
  END IF;
  IF has_table_privilege('anon', 'public.personal_archive_upload_reservations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.personal_archive_upload_reservations', 'INSERT') THEN
    RAISE EXCEPTION 'Y3 rezervasyon tablosu istemciye açık';
  END IF;
  SELECT count(*) INTO n FROM pg_class WHERE oid = 'public.personal_archive_upload_reservations'::regclass AND relrowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION 'Y4 rezervasyon tablosunda RLS kapalı'; END IF;

  RAISE NOTICE 'DIJ-03 personal-archive limits assert: PASS';
END $$;
