-- HD Eğitim Kataloğu — FAZ 2-B2 migration doğrulaması (B1 + B2 uygulanmış; yalnız SENTETİK veri).
-- Fixture: hd-education-fixture.sql (owner b…01, admin b…02 [admin_level=owner, super DEĞİL], uzman ea b…03).
DO $$
DECLARE
  owner_id uuid := 'b0000000-0000-4000-8000-000000000001';
  admin_id uuid := 'b0000000-0000-4000-8000-000000000002';
  s1 uuid := gen_random_uuid();   -- yayına götürülecek kişi
  s2 uuid := gen_random_uuid();   -- UTC bekleyen, hukuk E
  ch uuid; ch_bad uuid; ch2 uuid; n int; rev int;
BEGIN
  -- 0) Kolonlar ve eylem listesi
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hd_education_subjects' AND column_name='legal_reviewed_by') THEN RAISE EXCEPTION 'legal_reviewed_by yok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hd_education_publications' AND column_name='chart_verified_by') THEN RAISE EXCEPTION 'chart_verified_by yok'; END IF;
  BEGIN INSERT INTO public.hd_education_audit_events (actor_kind, action) VALUES ('system','uydurma_eylem'); RAISE EXCEPTION 'bilinmeyen eylem kabul edildi';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 1) INSERT: LOW_REVIEWED owner inceleme kaydı olmadan yazılamaz
  BEGIN
    INSERT INTO public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, documented_local_time, document_quote, utc_status, birth_utc, legal_status)
    VALUES (gen_random_uuid(), 'zz-hukuk-hilesi-1900-01-01', 'T-X', 'ZZ X', 'bilim', false, '1900-01-01', 'ZZ', '10:00', 'ZZ', 'VERIFIED', '1900-01-01T09:00:00Z', 'LOW_REVIEWED');
    RAISE EXCEPTION 'incelemesiz LOW_REVIEWED eklendi';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, documented_local_time, document_quote, time_standard, utc_offset_seconds, utc_status, birth_utc, legal_status, blockers)
  VALUES (s1, 'zz-b2-kisi-1900-01-01', 'B2-1', 'ZZ B2 Kişi', 'bilim', false, '1900-01-01', 'ZZ Şehir', '10:00', 'ZZ belge', 'ZZ LMT', 3600, 'VERIFIED', '1900-01-01T09:00:00Z', 'LOW_UNREVIEWED', ARRAY['AVUKAT-GÖRMEDİ']),
         (s2, 'zz-b2-bekleyen-1901-01-01', 'B2-2', 'ZZ B2 Bekleyen', 'sanat', false, '1901-01-01', 'ZZ Kasaba', '11:00', 'ZZ belge 2', NULL, NULL, 'PENDING_VERIFICATION', NULL, 'E', ARRAY['UTC-TEYİT','HUKUK-E']);
  INSERT INTO public.hd_education_publications (subject_id) VALUES (s1), (s2);
  BEGIN UPDATE public.hd_education_publications SET chart_verified_by = owner_id, chart_verified_at = now() WHERE subject_id = s1; RAISE EXCEPTION 'snapshot olmadan doğrulama';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 2) Hukuk alanı değişikliği revizyon ARTIRMAZ, denetlenir; doğum kanıtı revizyon ister
  UPDATE public.hd_education_subjects SET legal_note = 'ZZ not' WHERE id = s1;
  IF (SELECT revision FROM public.hd_education_subjects WHERE id = s1) <> 1 THEN RAISE EXCEPTION 'hukuk notu revizyon artırdı'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_audit_events WHERE action = 'legal_updated' AND subject_id = s1) THEN RAISE EXCEPTION 'hukuk değişikliği denetlenmedi'; END IF;
  BEGIN UPDATE public.hd_education_subjects SET legal_note = 'x', revision = 2 WHERE id = s1; RAISE EXCEPTION 'hukuk değişikliği revizyon artırabildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_subjects SET birth_place = 'ZZ Başka' WHERE id = s1; RAISE EXCEPTION 'revizyonsuz doğum kanıtı değişti';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 3) LOW_REVIEWED: owner olmayan / referanssız / tarihsiz → red; owner + ref + tarih → kabul
  BEGIN UPDATE public.hd_education_subjects SET legal_status='LOW_REVIEWED', legal_reviewed_by=admin_id, legal_reviewed_at=now(), legal_review_ref='AV-1' WHERE id=s1;
    RAISE EXCEPTION 'owner olmayan hukuk incelemesi kaydetti'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_subjects SET legal_status='LOW_REVIEWED', legal_reviewed_by=owner_id, legal_reviewed_at=now(), legal_review_ref=NULL WHERE id=s1;
    RAISE EXCEPTION 'referanssız hukuk incelemesi'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_subjects SET legal_status='LOW_REVIEWED' WHERE id=s1;
    RAISE EXCEPTION 'yazılım kendiliğinden LOW_REVIEWED yaptı'; EXCEPTION WHEN check_violation THEN NULL; END;

  -- 4) Kaynak + snapshot'lar
  INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url) VALUES (s1, 1, 'birth_time', 'https://example.test/zz-b2');
  INSERT INTO public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, computed_result, calc_status)
  VALUES (s1, 1, 1, '{"timezone":"UTC"}', repeat('d',64), 'test', '/test', 't-1', '{}', 'PROVIDER_ERROR') RETURNING id INTO ch_bad;
  INSERT INTO public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, computed_result, calc_status)
  VALUES (s1, 1, 2, '{"timezone":"UTC"}', repeat('e',64), 'test', '/test', 't-1', '{"type":"x"}', 'OK') RETURNING id INTO ch;
  BEGIN UPDATE public.hd_education_publications SET chart_id=ch_bad, chart_verified_by=owner_id, chart_verified_at=now() WHERE subject_id=s1;
    RAISE EXCEPTION 'başarısız hesap doğrulandı'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_publications SET chart_id=ch, chart_verified_by=admin_id, chart_verified_at=now() WHERE subject_id=s1;
    RAISE EXCEPTION 'owner olmayan snapshot doğruladı'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.hd_education_publications SET chart_id=ch, chart_verified_by=owner_id, chart_verified_at=now() WHERE subject_id=s1;
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_audit_events WHERE action='chart_verified' AND subject_id=s1) THEN RAISE EXCEPTION 'doğrulama denetlenmedi'; END IF;

  -- 5) Yayın reddi: LOW_UNREVIEWED + engel → red
  BEGIN UPDATE public.hd_education_publications SET status='approved', approved_by=owner_id, approved_at=now(), legal_clearance_ref='HK-1', updated_by=owner_id WHERE subject_id=s1;
    RAISE EXCEPTION 'LOW_UNREVIEWED onaylandı'; EXCEPTION WHEN check_violation THEN NULL; END;
  -- Owner hukuk incelemesi kaydı (engel kaldırılır); revizyon değişmez → doğrulanmış snapshot geçerli kalır
  UPDATE public.hd_education_subjects SET legal_status='LOW_REVIEWED', legal_reviewed_by=owner_id, legal_reviewed_at=now(), legal_review_ref='AV-2026-001', blockers='{}' WHERE id=s1;
  IF (SELECT revision FROM public.hd_education_subjects WHERE id=s1) <> 1 THEN RAISE EXCEPTION 'hukuk incelemesi snapshotı geçersizleştirdi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_audit_events WHERE action='legal_updated' AND subject_id=s1 AND actor_kind='owner' AND actor_user_id=owner_id) THEN RAISE EXCEPTION 'owner hukuk kaydı denetlenmedi'; END IF;
  BEGIN UPDATE public.hd_education_publications SET status='published', approved_by=owner_id, approved_at=now(), legal_clearance_ref='HK-1', updated_by=owner_id WHERE subject_id=s1;
    RAISE EXCEPTION 'onaysız doğrudan yayın'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_publications SET status='approved', approved_by=admin_id, approved_at=now(), legal_clearance_ref='HK-1', updated_by=admin_id WHERE subject_id=s1;
    RAISE EXCEPTION 'owner olmayan onay'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_publications SET status='approved', approved_by=owner_id, approved_at=now(), legal_clearance_ref=NULL, updated_by=owner_id WHERE subject_id=s1;
    RAISE EXCEPTION 'referanssız onay'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.hd_education_publications SET status='approved', approved_by=owner_id, approved_at=now(), legal_clearance_ref='HK-1', updated_by=owner_id WHERE subject_id=s1;
  UPDATE public.hd_education_publications SET status='published', updated_by=owner_id WHERE subject_id=s1;
  IF (SELECT status FROM public.hd_education_publications WHERE subject_id=s1) <> 'published' THEN RAISE EXCEPTION 'yayın olmadı'; END IF;

  -- 6) Yayındayken kanıt / hukuk / snapshot değişmez
  BEGIN UPDATE public.hd_education_subjects SET legal_note='değişti' WHERE id=s1; RAISE EXCEPTION 'yayında hukuk notu değişti';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_subjects SET birth_place='ZZ Y', revision=2 WHERE id=s1; RAISE EXCEPTION 'yayında doğum kanıtı değişti';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, computed_result, calc_status)
  VALUES (s1, 1, 3, '{"timezone":"UTC"}', repeat('f',64), 'test', '/test', 't-2', '{"type":"y"}', 'OK') RETURNING id INTO ch2;
  BEGIN UPDATE public.hd_education_publications SET chart_id=ch2, chart_verified_by=owner_id, chart_verified_at=now() WHERE subject_id=s1 AND status='published';
    -- yeni snapshot doğrulanabilir, ama yayın koşulları yeniden aranır: geçerli olduğundan kabul edilebilir → bu dal hata beklemez
  EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'geçerli yeni snapshot yayında reddedildi'; END;

  -- 7) Yayından kaldırma → gerekçe zorunlu; sonra kanıt revizyonu eski snapshot'ı geçersiz kılar
  BEGIN UPDATE public.hd_education_publications SET status='withdrawn', updated_by=owner_id WHERE subject_id=s1; RAISE EXCEPTION 'gerekçesiz kaldırma';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.hd_education_publications SET status='withdrawn', withdrawn_at=now(), withdraw_reason='ZZ hak talebi', updated_by=owner_id WHERE subject_id=s1;
  UPDATE public.hd_education_subjects SET documented_local_time='10:05', revision=2 WHERE id=s1;
  BEGIN UPDATE public.hd_education_publications SET status='approved', approved_at=now(), updated_by=owner_id WHERE subject_id=s1;
    RAISE EXCEPTION 'eski revizyon snapshot ile yeniden onay'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_publications SET chart_id=ch, chart_verified_by=owner_id, chart_verified_at=now() WHERE subject_id=s1;
    RAISE EXCEPTION 'eski revizyon snapshot doğrulandı'; EXCEPTION WHEN check_violation THEN NULL; END;
  -- Kaynak yeni revizyonda yok → yeni snapshot doğrulansa bile onay reddedilir
  INSERT INTO public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, computed_result, calc_status)
  VALUES (s1, 2, 4, '{"timezone":"UTC"}', repeat('a',64), 'test', '/test', 't-1', '{"type":"z"}', 'OK') RETURNING id INTO ch2;
  UPDATE public.hd_education_publications SET chart_id=ch2, chart_verified_by=owner_id, chart_verified_at=now() WHERE subject_id=s1;
  BEGIN UPDATE public.hd_education_publications SET status='approved', approved_at=now(), updated_by=owner_id WHERE subject_id=s1;
    RAISE EXCEPTION 'güncel revizyonda kaynak yokken onay'; EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url) VALUES (s1, 2, 'birth_time', 'https://example.test/zz-b2-r2');
  UPDATE public.hd_education_publications SET status='approved', approved_at=now(), updated_by=owner_id WHERE subject_id=s1;

  -- 8) UTC bekleyen + hukuk E kişi hiçbir yolla onaylanamaz
  BEGIN UPDATE public.hd_education_publications SET status='approved', approved_by=owner_id, approved_at=now(), legal_clearance_ref='HK-2', updated_by=owner_id WHERE subject_id=s2;
    RAISE EXCEPTION 'UTC bekleyen kişi onaylandı'; EXCEPTION WHEN check_violation THEN NULL; END;

  -- 9) Yeni draft kayıt dolu eklenemez
  BEGIN INSERT INTO public.hd_education_publications (subject_id, chart_id) VALUES (s2, ch); RAISE EXCEPTION 'dolu draft eklendi';
  EXCEPTION WHEN check_violation OR unique_violation THEN NULL; END;

  -- 10) anon/authenticated yeni kolonlara da erişemez; fonksiyonlar kapalı
  BEGIN SET LOCAL ROLE anon; PERFORM legal_review_ref FROM public.hd_education_subjects; RAISE EXCEPTION 'anon okudu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  IF has_function_privilege('authenticated', 'public.hd_edu_subject_guard()', 'EXECUTE') THEN RAISE EXCEPTION 'tetikleyici fonksiyonu açık'; END IF;
  RAISE NOTICE 'HD EDUCATION B2 MIGRATION ASSERT: OK';
END $$;
