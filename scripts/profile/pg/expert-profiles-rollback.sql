-- =============================================================================
-- UZMAN PROFİLİ (F1) — GERİ ALMA PROVA BETİĞİ (migration DEĞİLDİR; supabase/migrations klasörüne KONMAZ).
--
-- 20280102000000_expert_profiles.sql'in nesnelerini kaldırır. YALNIZ Owner'ın ayrı onayıyla ve önce kod geri alındıktan
-- sonra çalıştırılır. Veri kaybını önlemek için tabloda satır varsa HİÇBİR ŞEY yapmadan hata verir
-- (EXPERT_PROFILES_NOT_EMPTY) — önce yedek alınması ve satırların bilinçli olarak ele alınması gerekir.
-- Mevcut başka tabloya / politikaya dokunmaz. İki kez çalıştırılabilir (nesne yoksa sessizce geçer).
-- Yerel prova: node scripts/profile/pg/expert-profiles-tables.mjs (R bölümü).
-- =============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.expert_profiles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.expert_profiles LIMIT 1) THEN
      RAISE EXCEPTION 'EXPERT_PROFILES_NOT_EMPTY: tabloda kayıt var; geri alma durduruldu' USING ERRCODE = 'P0001';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.expert_profiles;
DROP FUNCTION IF EXISTS public.expert_profile_row_guard();

COMMIT;

NOTIFY pgrst, 'reload schema';
