-- HD Eğitim Kataloğu — migration 20271110000000 doğrulaması (iki kez uygulandıktan sonra). Hata = FAIL.
DO $$
DECLARE
  owner_id uuid := 'b0000000-0000-4000-8000-000000000001';
  admin_id uuid := 'b0000000-0000-4000-8000-000000000002';
  ea uuid := 'b0000000-0000-4000-8000-000000000003';
  eb uuid := 'b0000000-0000-4000-8000-000000000004';
  nohd uuid := 'b0000000-0000-4000-8000-000000000005';
  demo uuid := 'b0000000-0000-4000-8000-000000000006';
  pasif uuid := 'b0000000-0000-4000-8000-000000000007';
  s1 uuid := 'c0000000-0000-4000-8000-000000000001';
  s2 uuid := 'c0000000-0000-4000-8000-000000000002';
  t text; n int; g uuid; v text; ch uuid;
  tbls text[] := ARRAY['hd_education_subjects','hd_education_sources','hd_education_charts','hd_education_publications',
                       'hd_education_audit_events','hd_education_takedown_requests','hd_education_access_grants'];
BEGIN
  -- 1) Ayrıcalıklar ve RLS
  FOREACH t IN ARRAY tbls LOOP
    IF has_table_privilege('anon', 'public.'||t, 'SELECT') OR has_table_privilege('authenticated', 'public.'||t, 'SELECT')
       OR has_table_privilege('anon', 'public.'||t, 'INSERT') OR has_table_privilege('authenticated', 'public.'||t, 'UPDATE') THEN
      RAISE EXCEPTION 'anon/authenticated ayrıcalığı kaldı: %', t; END IF;
    IF has_table_privilege('service_role', 'public.'||t, 'DELETE') THEN RAISE EXCEPTION 'service_role DELETE ayrıcalığı var: %', t; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass) THEN RAISE EXCEPTION 'RLS kapalı: %', t; END IF;
    IF (SELECT relforcerowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass) THEN RAISE EXCEPTION 'FORCE RLS açık: %', t; END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t) <> 0 THEN RAISE EXCEPTION 'policy var: %', t; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='tenant_id') THEN
      RAISE EXCEPTION 'katalog tablosunda tenant_id kolonu var: %', t; END IF;
  END LOOP;
  IF has_table_privilege('service_role', 'public.hd_education_access_grants', 'INSERT') OR has_table_privilege('service_role', 'public.hd_education_access_grants', 'UPDATE') THEN
    RAISE EXCEPTION 'grants tablosuna doğrudan yazma ayrıcalığı var'; END IF;
  IF has_function_privilege('anon', 'public.hd_education_grant_access(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hd_education_grant_access(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hd_education_revoke_access(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hd_education_auto_revoke_ineligible(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hd_edu_actor_is_owner(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC EXECUTE kısıtı ihlali'; END IF;
  IF NOT has_function_privilege('service_role', 'public.hd_education_grant_access(uuid,uuid,text)', 'EXECUTE') THEN RAISE EXCEPTION 'service_role RPC çalıştıramıyor'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname LIKE 'hd_edu%' AND p.prosecdef
             AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')) THEN
    RAISE EXCEPTION 'search_path sabitlenmemiş SECURITY DEFINER fonksiyon var'; END IF;

  -- 2) Kişi + kaynak + sürümlülük
  INSERT INTO public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place,
    documented_local_time, document_quote, utc_status, birth_utc, legal_status, created_by)
  VALUES (s1, 'zz-ornek-kisi-1900-01-01', 'TEST-1', 'ZZ Örnek Kişi', 'bilim', false, '1900-01-01', 'Örnek Şehir',
    '10:00', 'örnek belge ifadesi', 'VERIFIED', '1900-01-01T09:00:00Z', 'LOW_REVIEWED', owner_id),
         (s2, 'zz-ornek-kisi-iki-1950-05-05', 'TEST-2', 'ZZ Örnek Kişi İki', 'sanat', false, '1950-05-05', 'Örnek Kasaba',
    '11:00', 'örnek ifade iki', 'PENDING_VERIFICATION', NULL, 'E', owner_id);
  INSERT INTO public.hd_education_publications (subject_id) VALUES (s1), (s2);
  IF (SELECT count(*) FROM public.hd_education_publications WHERE status = 'draft') <> 2 THEN RAISE EXCEPTION 'varsayılan draft değil'; END IF;
  BEGIN INSERT INTO public.hd_education_publications (subject_id, status) VALUES (gen_random_uuid(), 'published'); RAISE EXCEPTION 'yayımlı INSERT kabul edildi';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
  INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url) VALUES (s1, 1, 'birth_time', 'https://example.test/belge');
  BEGIN INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url) VALUES (s1, 2, 'extra', 'https://example.test/x'); RAISE EXCEPTION 'eski/gelecek revizyona kaynak eklendi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_sources SET url = 'https://example.test/degisti' WHERE subject_id = s1; RAISE EXCEPTION 'kaynak güncellendi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_subjects SET documented_local_time = '10:05' WHERE id = s1; RAISE EXCEPTION 'revizyonsuz kanıt değişti';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.hd_education_subjects SET documented_local_time = '10:05', revision = 2 WHERE id = s1;
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_audit_events WHERE action='subject_revised' AND subject_id=s1 AND detail->'onceki'->>'documented_local_time' = '10:00') THEN
    RAISE EXCEPTION 'önceki kanıt denetime yazılmadı'; END IF;
  BEGIN UPDATE public.hd_education_subjects SET natural_key = 'zz-baska-1900-01-01', revision = 3 WHERE id = s1; RAISE EXCEPTION 'natural_key değişti';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 3) Snapshot sürümlülüğü
  INSERT INTO public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, computed_result, calc_status)
  VALUES (s1, 2, 1, '{"date":"1900-01-01"}', repeat('a',64), 'test', '/test', 't-1', '{"type":"x"}', 'OK') RETURNING id INTO ch;
  BEGIN INSERT INTO public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, computed_result, calc_status)
    VALUES (s1, 2, 3, '{}', repeat('b',64), 'test', '/test', 't-1', '{}', 'OK'); RAISE EXCEPTION 'sürüm atlandı';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_charts SET calc_status = 'TIME_MISMATCH' WHERE id = ch; RAISE EXCEPTION 'snapshot üzerine yazıldı';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 4) Yayın kilidi
  BEGIN UPDATE public.hd_education_publications SET status='published', chart_id=ch, approved_by=admin_id, approved_at=now(), legal_clearance_ref='L-1' WHERE subject_id=s1;
    RAISE EXCEPTION 'owner olmayan onayla yayımlandı'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_publications SET status='published', chart_id=ch, approved_by=owner_id, approved_at=now(), legal_clearance_ref=NULL WHERE subject_id=s1;
    RAISE EXCEPTION 'hukuk referansı olmadan yayımlandı'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.hd_education_publications SET status='published', approved_by=owner_id, approved_at=now(), legal_clearance_ref='L-2' WHERE subject_id=s2;
    RAISE EXCEPTION 'UTC/hukuk engelli kişi yayımlandı'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.hd_education_publications SET status='published', chart_id=ch, approved_by=owner_id, approved_at=now(), legal_clearance_ref='L-1', updated_by=owner_id WHERE subject_id=s1;
  BEGIN UPDATE public.hd_education_publications SET status='withdrawn', updated_by=owner_id WHERE subject_id=s1; RAISE EXCEPTION 'gerekçesiz kaldırıldı';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.hd_education_publications SET status='withdrawn', withdrawn_at=now(), withdraw_reason='test', updated_by=owner_id WHERE subject_id=s1;
  IF (SELECT count(*) FROM public.hd_education_audit_events WHERE action='publication_changed' AND subject_id=s1) <> 2 THEN RAISE EXCEPTION 'yayın değişiklikleri denetlenmedi'; END IF;
  -- yeni kanıt revizyonu eski snapshot'ı geçersiz kılar
  UPDATE public.hd_education_subjects SET documented_local_time = '10:06', revision = 3 WHERE id = s1;
  BEGIN UPDATE public.hd_education_publications SET status='published', withdrawn_at=NULL, withdraw_reason=NULL, approved_at=now(), updated_by=owner_id WHERE subject_id=s1;
    RAISE EXCEPTION 'eski revizyon snapshot ile yayımlandı'; EXCEPTION WHEN check_violation THEN NULL; END;

  -- 5) Denetim append-only
  BEGIN UPDATE public.hd_education_audit_events SET action='access_granted' WHERE subject_id=s1; RAISE EXCEPTION 'denetim değişti';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public.hd_education_audit_events WHERE subject_id=s1; RAISE EXCEPTION 'denetim silindi';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 6) Erişim RPC'leri
  BEGIN PERFORM public.hd_education_grant_access(admin_id, ea, NULL); RAISE EXCEPTION 'owner olmayan admin yetki verdi';
  EXCEPTION WHEN SQLSTATE 'ED002' THEN NULL; END;
  BEGIN PERFORM public.hd_education_grant_access(ea, eb, NULL); RAISE EXCEPTION 'uzman yetki verdi';
  EXCEPTION WHEN SQLSTATE 'ED002' THEN NULL; END;
  FOREACH g IN ARRAY ARRAY[nohd, demo, pasif, admin_id, owner_id] LOOP
    BEGIN PERFORM public.hd_education_grant_access(owner_id, g, NULL); RAISE EXCEPTION 'uygunsuz hedefe yetki verildi: %', g;
    EXCEPTION WHEN SQLSTATE 'ED005' OR SQLSTATE 'ED003' THEN NULL; END;
  END LOOP;
  PERFORM public.hd_education_grant_access(owner_id, ea, 'eğitim programı');
  PERFORM public.hd_education_grant_access(owner_id, eb, NULL);
  BEGIN PERFORM public.hd_education_grant_access(owner_id, ea, NULL); RAISE EXCEPTION 'mükerrer etkin yetki';
  EXCEPTION WHEN SQLSTATE 'ED006' THEN NULL; END;
  IF (SELECT count(*) FROM public.hd_education_access_grants WHERE revoked_at IS NULL) <> 2 THEN RAISE EXCEPTION 'etkin yetki sayısı 2 değil'; END IF;
  IF (SELECT granted_tenant_id FROM public.hd_education_access_grants WHERE user_id = eb AND revoked_at IS NULL) <> 'a0000000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'tenant bağlamı yanlış'; END IF;
  BEGIN PERFORM public.hd_education_revoke_access(admin_id, ea, 'owner_revoked'); RAISE EXCEPTION 'owner olmayan iptal etti';
  EXCEPTION WHEN SQLSTATE 'ED002' THEN NULL; END;
  PERFORM public.hd_education_revoke_access(owner_id, ea, 'owner_revoked');
  BEGIN UPDATE public.hd_education_access_grants SET revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL WHERE user_id = ea; RAISE EXCEPTION 'iptal edilen yetki diriltildi';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.hd_education_grant_access(owner_id, ea, 'yeniden');   -- owner yeniden verebilir (yeni satır)
  IF (SELECT count(*) FROM public.hd_education_access_grants WHERE user_id = ea) <> 2 THEN RAISE EXCEPTION 'yeniden verme yeni satır değil'; END IF;

  -- 7) Otomatik uygunsuzluk iptali: rol değişti → iptal; tekrar uzman → yetki GERİ GELMEZ
  v := public.hd_education_auto_revoke_ineligible(ea);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'uygun kullanıcıda otomatik iptal: %', v; END IF;
  UPDATE public.users SET role = 'admin' WHERE id = ea;
  v := public.hd_education_auto_revoke_ineligible(ea);
  IF v <> 'role_changed' THEN RAISE EXCEPTION 'rol değişiminde iptal yok'; END IF;
  UPDATE public.users SET role = 'expert' WHERE id = ea;
  IF EXISTS (SELECT 1 FROM public.hd_education_access_grants WHERE user_id = ea AND revoked_at IS NULL) THEN RAISE EXCEPTION 'tekrar uzman olunca yetki geri geldi'; END IF;
  -- denetim kaydındaki rol değişikliği (rol şu an expert olsa bile) → iptal
  INSERT INTO public.admin_audit_log (actor_admin_id, target_user_id, action) VALUES (admin_id, eb, 'role_changed');
  v := public.hd_education_auto_revoke_ineligible(eb);
  IF v <> 'role_changed' THEN RAISE EXCEPTION 'denetimdeki rol değişikliği yakalanmadı'; END IF;
  -- tenant değişimi
  PERFORM public.hd_education_grant_access(owner_id, ea, NULL);
  UPDATE public.users SET tenant_id = 'a0000000-0000-4000-8000-000000000002' WHERE id = ea;
  v := public.hd_education_auto_revoke_ineligible(ea);
  IF v <> 'tenant_changed' THEN RAISE EXCEPTION 'tenant değişimi yakalanmadı'; END IF;
  IF (SELECT count(*) FROM public.hd_education_audit_events WHERE action = 'access_auto_revoked') <> 3 THEN RAISE EXCEPTION 'otomatik iptaller denetlenmedi'; END IF;

  -- 8) Kullanıcı silinince yetki dangling kalmaz; denetim kalır (hedef NULL)
  UPDATE public.users SET tenant_id = 'a0000000-0000-4000-8000-000000000001' WHERE id = ea;
  PERFORM public.hd_education_grant_access(owner_id, ea, NULL);
  SELECT count(*) INTO n FROM public.hd_education_audit_events WHERE target_user_id = ea;
  DELETE FROM public.admin_audit_log WHERE target_user_id = ea;
  DELETE FROM public.users WHERE id = ea;
  IF EXISTS (SELECT 1 FROM public.hd_education_access_grants WHERE user_id = ea) THEN RAISE EXCEPTION 'silinen kullanıcının yetkisi kaldı'; END IF;
  IF (SELECT count(*) FROM public.hd_education_audit_events WHERE target_user_id IS NULL AND action LIKE 'access%') < n THEN RAISE EXCEPTION 'denetim satırları korunmadı'; END IF;

  -- 9) anon/authenticated doğrudan okuyamaz
  BEGIN SET LOCAL ROLE anon; PERFORM 1 FROM public.hd_education_subjects; RAISE EXCEPTION 'anon okudu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  BEGIN SET LOCAL ROLE authenticated; PERFORM public.hd_education_grant_access(owner_id, eb, NULL); RAISE EXCEPTION 'authenticated RPC çalıştırdı';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  RAISE NOTICE 'HD EDUCATION MIGRATION ASSERT: OK';
END $$;
