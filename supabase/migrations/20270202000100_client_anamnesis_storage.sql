-- =============================================================================
-- 20270202000100_client_anamnesis_storage.sql   [ADDITIVE — PRIVATE BUCKET]
--
-- DANIŞAN YOLCULUĞU — ANAMNEZ V1: taranmış / doldurulmuş anamnez formu PDF'leri için
-- ADANMIŞ PRIVATE bucket `client-anamnesis-files`.
--
-- GÜVENLİK MODELİ:
--   * public = false; storage.objects üzerinde bu bucket için HİÇBİR policy YOK → anon /
--     authenticated (publishable anahtar) okuyamaz, listeleyemez, yazamaz, silemez.
--   * Upload/okuma/silme yalnız sunucu (service_role) üzerinden, requireModuleAccess +
--     tenant/danışan/anamnez sahiplik kontrolüyle (app/api/clients/[id]/anamnez/**).
--   * Yükleme: sunucunun ürettiği yol için createSignedUploadUrl (Vercel gövde sınırı);
--     finalize'da gerçek PDF imzası (%PDF-) + boyut sunucuda doğrulanır.
--   * Okuma: yalnız DB satırından çözülen yol için 60 sn'lik signed URL.
--   * Bucket sınırları (defense-in-depth): yalnız application/pdf, ≤ 10 MB.
--
-- VERİ-YIKICI MI: HAYIR (nesne silinmez; yalnız bucket oluşturulur/hizalanır ve bu bucket'a
--   atıf yapan olası policy'ler kaldırılır — başka bucket policy'lerine dokunulmaz).
-- İDEMPOTENT: EVET (ON CONFLICT DO UPDATE + DROP POLICY IF EXISTS).
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply sırası: 20270202000000 → bu migration → kod deploy.
--
-- ROLLBACK (yalnız bucket boşken):
--   DELETE FROM storage.buckets WHERE id = 'client-anamnesis-files';
-- =============================================================================

BEGIN;

-- 1) Bucket (private, PDF-only, 10 MB).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'client-anamnesis-files: storage.buckets bulunamadı (precondition)';
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('client-anamnesis-files', 'client-anamnesis-files', false, 10485760, ARRAY['application/pdf']::text[])
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = 10485760,
        allowed_mime_types = ARRAY['application/pdf']::text[];
END
$$;

-- 2) Bu bucket'a atıf yapan TÜM storage.objects policy'lerini kaldır (olmamalı; savunma).
DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects yok — policy adımı atlandı.';
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        coalesce(qual, '') LIKE '%client-anamnesis-files%'
        OR coalesce(with_check, '') LIKE '%client-anamnesis-files%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    RAISE NOTICE 'client-anamnesis-files politikası kaldırıldı: %', pol.policyname;
  END LOOP;
END
$$;

-- 3) Son durum doğrulaması (fail-closed).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'client-anamnesis-files'
      AND public = false
      AND file_size_limit = 10485760
      AND allowed_mime_types = ARRAY['application/pdf']::text[]
  ) THEN
    RAISE EXCEPTION 'client-anamnesis-files: bucket private/limit doğrulaması başarısız';
  END IF;
END
$$;

COMMIT;
