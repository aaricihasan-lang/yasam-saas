-- HD Eğitim Kataloğu — özel taslak içe aktarım doğrulaması (yalnız SAYIM; kişi verisi içermez).
-- Kullanım: pg-migration-check --fixture <SET dosyası> --migration <migration> --migration <repo-dışı import.sql> --assert bu dosya
-- Beklenen değerler build-private-import.ts'in kaynaklardan (envanter + FAZ 2-A hukuk uzlaştırması) ürettiği
-- <out>.ozet.json ile aynıdır: hukuk E 18 / LOW_UNREVIEWED 25 (21 avukat teyidi yok + 4 araştırma raporu düşük risk) /
-- LOW_REVIEWED 0; UTC doğrulanmış 19; güncel matris 8 / 17 / 11 / 7; yayınlanabilir 0.
DO $$
DECLARE n int; v int; p int; e int; lu int; lr int; m1 int; m2 int; m3 int; m4 int; nb int; ns int; r4 int; r21 int; rE int;
BEGIN
  SELECT count(*) INTO n FROM public.hd_education_subjects;
  IF n <> 43 THEN RAISE EXCEPTION 'kişi sayısı % ≠ 43', n; END IF;
  SELECT count(*) INTO v FROM public.hd_education_subjects WHERE utc_status = 'VERIFIED';
  SELECT count(*) INTO e FROM public.hd_education_subjects WHERE legal_status = 'E';
  SELECT count(*) INTO lu FROM public.hd_education_subjects WHERE legal_status = 'LOW_UNREVIEWED';
  SELECT count(*) INTO lr FROM public.hd_education_subjects WHERE legal_status = 'LOW_REVIEWED';
  IF v <> 19 OR e <> 18 OR lu <> 25 OR lr <> 0 THEN
    RAISE EXCEPTION 'UTC/hukuk sayıları beklenmedik: verified=% E=% low_unreviewed=% low_reviewed=%', v, e, lu, lr; END IF;
  -- 25 LOW_UNREVIEWED içindeki ayrım (21 + 4) ve uzlaştırmayla E'ye çıkan 2 kişi hukuk notunda işaretli.
  SELECT count(*) INTO r21 FROM public.hd_education_subjects WHERE legal_status = 'LOW_UNREVIEWED' AND legal_note LIKE '[Hukuk incelemesi eksik%';
  SELECT count(*) INTO r4  FROM public.hd_education_subjects WHERE legal_status = 'LOW_UNREVIEWED' AND legal_note LIKE '[Araştırma raporu (L1): düşük risk — AVUKAT ONAYI DEĞİL]%';
  SELECT count(*) INTO rE  FROM public.hd_education_subjects WHERE legal_status = 'E' AND legal_note LIKE '[FAZ 2-A hukuk uzlaştırması%';
  IF (r21, r4, rE) IS DISTINCT FROM (21, 4, 2) THEN RAISE EXCEPTION 'hukuk ayrımı % / % / % ≠ 21 / 4 / 2', r21, r4, rE; END IF;
  SELECT count(*) INTO m1 FROM public.hd_education_subjects WHERE utc_status = 'VERIFIED' AND legal_status <> 'E';
  SELECT count(*) INTO m2 FROM public.hd_education_subjects WHERE utc_status <> 'VERIFIED' AND legal_status <> 'E';
  SELECT count(*) INTO m3 FROM public.hd_education_subjects WHERE utc_status = 'VERIFIED' AND legal_status = 'E';
  SELECT count(*) INTO m4 FROM public.hd_education_subjects WHERE utc_status <> 'VERIFIED' AND legal_status = 'E';
  IF (m1, m2, m3, m4) IS DISTINCT FROM (8, 17, 11, 7) THEN RAISE EXCEPTION 'güncel matris % / % / % / % ≠ 8/17/11/7', m1, m2, m3, m4; END IF;
  -- Her E kişisinde HUKUK-E, her düşük riskli kişide AVUKAT-GÖRMEDİ engeli var.
  IF EXISTS (SELECT 1 FROM public.hd_education_subjects WHERE legal_status = 'E' AND NOT ('HUKUK-E' = ANY (blockers))) THEN RAISE EXCEPTION 'HUKUK-E engeli eksik'; END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_subjects WHERE legal_status = 'LOW_UNREVIEWED' AND NOT ('AVUKAT-GÖRMEDİ' = ANY (blockers))) THEN RAISE EXCEPTION 'AVUKAT-GÖRMEDİ engeli eksik'; END IF;
  SELECT count(*) INTO p FROM public.hd_education_publications WHERE status <> 'draft';
  IF p <> 0 THEN RAISE EXCEPTION 'draft olmayan yayın kaydı: %', p; END IF;
  SELECT count(*) INTO p FROM public.hd_education_publications;
  IF p <> 43 THEN RAISE EXCEPTION 'yayın satırı % ≠ 43', p; END IF;
  -- Yayına uygun (UTC doğrulanmış + hukuk E değil + engel yok + yaşamıyor) kişi sayısı: 0.
  SELECT count(*) INTO nb FROM public.hd_education_subjects
   WHERE utc_status = 'VERIFIED' AND legal_status <> 'E' AND cardinality(blockers) = 0 AND NOT is_living;
  IF nb <> 0 THEN RAISE EXCEPTION 'yayına uygun kişi: % (beklenen 0)', nb; END IF;
  SELECT count(*) INTO nb FROM public.hd_education_subjects WHERE cardinality(blockers) = 0;
  IF nb <> 0 THEN RAISE EXCEPTION 'engelsiz kişi: %', nb; END IF;
  SELECT count(*) INTO ns FROM public.hd_education_subjects s
   WHERE NOT EXISTS (SELECT 1 FROM public.hd_education_sources x WHERE x.subject_id = s.id AND x.role = 'birth_time' AND x.subject_revision = s.revision);
  IF ns <> 0 THEN RAISE EXCEPTION 'saat kaynağı olmayan kişi: %', ns; END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_charts) THEN RAISE EXCEPTION 'içe aktarım hesap kaydı üretmemeli'; END IF;
  -- Tekrar çalıştırma: mükerrer kaynak / yayın satırı yok.
  IF EXISTS (SELECT 1 FROM public.hd_education_sources GROUP BY subject_id, subject_revision, role, url HAVING count(*) > 1) THEN RAISE EXCEPTION 'mükerrer kaynak satırı'; END IF;
  IF (SELECT count(*) FROM public.hd_education_audit_events WHERE action = 'subject_revised') <> 0 THEN RAISE EXCEPTION 'tekrar içe aktarım kanıtı değiştirdi'; END IF;
  -- Yayın denemesi DB tarafından reddedilmeli.
  BEGIN
    UPDATE public.hd_education_publications SET status = 'published' WHERE subject_id = (SELECT id FROM public.hd_education_subjects ORDER BY natural_key LIMIT 1);
    RAISE EXCEPTION 'içe aktarılan kayıt yayımlanabildi';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
