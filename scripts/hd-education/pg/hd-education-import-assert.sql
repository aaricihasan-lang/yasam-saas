-- HD Eğitim Kataloğu — özel taslak içe aktarım doğrulaması (yalnız SAYIM; kişi verisi içermez).
-- Kullanım: pg-migration-check --fixture <SET dosyası> --migration <migration> --migration <repo-dışı import.sql> --assert bu dosya
DO $$
DECLARE n int; v int; p int; e int; lu int; m1 int; m2 int; m3 int; m4 int; nb int; ns int;
BEGIN
  SELECT count(*) INTO n FROM public.hd_education_subjects;
  IF n <> 43 THEN RAISE EXCEPTION 'kişi sayısı % ≠ 43', n; END IF;
  SELECT count(*) INTO v FROM public.hd_education_subjects WHERE utc_status = 'VERIFIED';
  SELECT count(*) INTO e FROM public.hd_education_subjects WHERE legal_status = 'E';
  SELECT count(*) INTO lu FROM public.hd_education_subjects WHERE legal_status = 'LOW_UNREVIEWED';
  IF v <> 19 OR e <> 16 OR lu <> 27 THEN RAISE EXCEPTION 'UTC/hukuk sayıları beklenmedik: verified=% E=% low_unreviewed=%', v, e, lu; END IF;
  SELECT count(*) INTO m1 FROM public.hd_education_subjects WHERE utc_status = 'VERIFIED' AND legal_status <> 'E';
  SELECT count(*) INTO m2 FROM public.hd_education_subjects WHERE utc_status <> 'VERIFIED' AND legal_status <> 'E';
  SELECT count(*) INTO m3 FROM public.hd_education_subjects WHERE utc_status = 'VERIFIED' AND legal_status = 'E';
  SELECT count(*) INTO m4 FROM public.hd_education_subjects WHERE utc_status <> 'VERIFIED' AND legal_status = 'E';
  IF (m1, m2, m3, m4) IS DISTINCT FROM (10, 17, 9, 7) THEN RAISE EXCEPTION 'matris % / % / % / % ≠ 10/17/9/7', m1, m2, m3, m4; END IF;
  SELECT count(*) INTO p FROM public.hd_education_publications WHERE status <> 'draft';
  IF p <> 0 THEN RAISE EXCEPTION 'draft olmayan yayın kaydı: %', p; END IF;
  SELECT count(*) INTO p FROM public.hd_education_publications;
  IF p <> 43 THEN RAISE EXCEPTION 'yayın satırı % ≠ 43', p; END IF;
  -- Her kişinin yayın engeli var (B1'de hiçbiri yayına uygun değil: UTC/hukuk/avukat incelemesi).
  SELECT count(*) INTO nb FROM public.hd_education_subjects WHERE cardinality(blockers) = 0;
  IF nb <> 0 THEN RAISE EXCEPTION 'engelsiz kişi: %', nb; END IF;
  SELECT count(*) INTO ns FROM public.hd_education_subjects s
   WHERE NOT EXISTS (SELECT 1 FROM public.hd_education_sources x WHERE x.subject_id = s.id AND x.role = 'birth_time' AND x.subject_revision = s.revision);
  IF ns <> 0 THEN RAISE EXCEPTION 'saat kaynağı olmayan kişi: %', ns; END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_charts) THEN RAISE EXCEPTION 'içe aktarım hesap kaydı üretmemeli'; END IF;
  -- Yayın denemesi DB tarafından reddedilmeli.
  BEGIN
    UPDATE public.hd_education_publications SET status = 'published' WHERE subject_id = (SELECT id FROM public.hd_education_subjects ORDER BY natural_key LIMIT 1);
    RAISE EXCEPTION 'içe aktarılan kayıt yayımlanabildi';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
