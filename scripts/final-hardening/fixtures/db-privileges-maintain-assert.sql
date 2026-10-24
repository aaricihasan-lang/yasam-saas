-- SEC-NEW-03a MAINTAIN doğrulaması (PG17+; yerel embedded-pg). Hata → FAIL.
-- (VACUUM işlem bloğunda çalışmadığı için REINDEX/ANALYZE ile sınanır; aynı MAINTAIN yetkisi.)
-- MAINTAIN = VACUUM / ANALYZE / REINDEX / CLUSTER / REFRESH MATERIALIZED VIEW / LOCK TABLE yetkisi.
--   M1  Tablo sahibi (postgres; migration'lar) ve service_role (uygulama/yedekleme) bakım yapabilir.
--   M2  İstemci rolleri (anon/authenticated) 12 tabloda REINDEX/VACUUM yapamaz (M6 sonrası).
--   M3  Numeroloji tablosu kapsam dışı: istemci MAINTAIN'i DEĞİŞMEDİ (ikinci owner onayı bekliyor).
--   M4  MAINTAIN'in hiç verilmediği tabloda (PG17 öncesi ACL) REVOKE hatasız no-op.
-- Ön koşul: db-privileges-fixture.sql (+ M5–M7 sonrası için db-privileges-assert ile aynı zincir).
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 170000 THEN
    RAISE NOTICE 'MAINTAIN assert: PG<17, atlandı'; RETURN;
  END IF;
  -- M1 sunucu rolleri: tablo sahibi (postgres) ve service_role bakım yapabilir
  IF NOT has_table_privilege('service_role', 'public.chakra_notes', 'MAINTAIN') THEN RAISE EXCEPTION 'M1 service_role MAINTAIN kaybetti'; END IF;
  EXECUTE 'REINDEX TABLE public.chakra_notes';            -- sahip
  EXECUTE 'ANALYZE public.chakra_notes';
  EXECUTE 'SET LOCAL ROLE service_role';
  EXECUTE 'REINDEX TABLE public.healing_guide_sections';  -- service_role
  EXECUTE 'ANALYZE public.healing_guide_sections';
  EXECUTE 'RESET ROLE';
END $$;

DO $$
DECLARE t text; r text; denied boolean;
BEGIN
  IF current_setting('server_version_num')::int < 170000 THEN RETURN; END IF;
  -- M2 istemci rolleri bakım yapamaz (12 tablodan örnekler)
  FOREACH t IN ARRAY ARRAY['chakra_notes', 'healing_guide_sections', 'user_location_prefs', 'subconscious_causes'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(r, format('public.%I', t), 'MAINTAIN') THEN RAISE EXCEPTION 'M2 % % MAINTAIN kaldı', t, r; END IF;
      denied := false;
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', r);
        EXECUTE format('REINDEX TABLE public.%I', t);
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      EXECUTE 'RESET ROLE';
      IF NOT denied THEN RAISE EXCEPTION 'M2b % REINDEX % yapabildi', r, t; END IF;
    END LOOP;
  END LOOP;
  -- M3 Numeroloji dokunulmadı
  IF NOT has_table_privilege('anon', 'public.demo_numerology_ip_usage', 'MAINTAIN') THEN
    RAISE EXCEPTION 'M3 Numeroloji tablosunun MAINTAIN yetkisi değişti (kapsam dışıydı)'; END IF;
  -- M4 MAINTAIN'siz ACL'de REVOKE no-op
  CREATE TABLE public.zz_pre17 (id int);
  REVOKE ALL ON public.zz_pre17 FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.zz_pre17 TO anon;
  EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.zz_pre17 FROM PUBLIC, anon, authenticated';
  IF NOT has_table_privilege('anon', 'public.zz_pre17', 'SELECT') OR has_table_privilege('anon', 'public.zz_pre17', 'TRUNCATE') THEN
    RAISE EXCEPTION 'M4 no-op REVOKE beklenmeyen etki'; END IF;
  DROP TABLE public.zz_pre17;
  RAISE NOTICE 'MAINTAIN assert: PASS';
END $$;
