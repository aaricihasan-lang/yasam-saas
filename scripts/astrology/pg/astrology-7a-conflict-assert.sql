-- ASTROLOJİ AŞAMA 7A — FAIL-CLOSED doğrulaması: 20271101000300 çapraz-uzman veride DURDU; hiçbir şey
-- uygulanmadı ve hiçbir satır kaybolmadı. (Migration hatası oturumu iptal edilmiş işlemde bırakır.)
ROLLBACK;
DO $$
DECLARE n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'astro_birth_profiles' AND column_name = 'owner_user_id') THEN
    RAISE EXCEPTION 'migration kısmen uygulandı (owner_user_id kolonu var)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_tenant_hash_key') THEN
    RAISE EXCEPTION 'eski önbellek kısıtı kayboldu';
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conname IN ('astro_bp_client_fk', 'astro_an_client_fk') AND confdeltype = 'c';
  IF n <> 2 THEN RAISE EXCEPTION 'danışan FK''leri değişti'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_results WHERE input_hash = repeat('9', 64);
  IF n <> 1 THEN RAISE EXCEPTION 'çakışan veri silindi'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles;
  IF n <> 2 THEN RAISE EXCEPTION 'profil sayısı değişti'; END IF;
END
$$;
