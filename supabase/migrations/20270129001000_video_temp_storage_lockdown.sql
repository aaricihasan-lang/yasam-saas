-- =============================================================================
-- 20270129001000_video_temp_storage_lockdown.sql
--
-- FAZ1 FINAL HARDENING (PAKET AUTH / item 11) — video-temp bucket kilidi.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Yalnız HAZIRLANDI (owner onayı + kontrollü apply gerekir).
--
-- AMAÇ:
--   video-temp bucket'ında anon rolün INSERT/SELECT yapabildiği storage.objects
--   politikaları (prod: `video_temp_insert`, `video_temp_select`, path regex
--   `^[0-9a-f-]{36}/[0-9a-f-]{36}/`) tarayıcıdan kimliksiz yükleme/okuma yüzeyi açıyordu.
--   Uygulama artık YALNIZ sunucunun ürettiği imzalı yükleme URL'ini
--   (/api/video-ceviri/get-upload-url → createSignedUploadUrl) + service_role
--   indirmeyi (transcribe) kullanır → bu politikalara ihtiyaç YOKTUR.
--   Ayrıca bucket sınırları koddaki gerçek kabul kurallarına hizalanır:
--     public = false, file_size_limit = 26214400 (25 MB = Whisper limiti = istemci limiti),
--     allowed_mime_types = lib/video-ceviri/videoTempPath.ts VIDEO_TEMP_BUCKET_MIME_TYPES.
--
-- PRECONDITION:
--   - storage.objects / storage.buckets mevcut (Supabase). Yoksa RAISE NOTICE + atla.
--   - video-temp bucket'ı yoksa UPDATE 0 satır (NOTICE) — hata değil.
--
-- UYGULAMA SIRASI (ÖNEMLİ):
--   Önce KOD deploy edilir (istemci anon `.upload` yerine get-upload-url +
--   uploadToSignedUrl kullanır), SONRA bu migration. Tersi sırada eski istemci
--   anon politikasız yükleme yapamaz (video yükleme kırılır).
--
-- VERİ-YIKICI MI?  HAYIR.
--   - storage.objects içindeki HİÇBİR nesne silinmez (prod'daki 13 eski nesne AŞAMA 3'e kalır).
--   - Yalnız politika DROP + bucket metadata UPDATE. Mevcut nesneler yeni boyut/MIME
--     limitlerinden etkilenmez (limitler yalnız yeni yüklemelerde uygulanır).
--
-- İDEMPOTENT: DROP POLICY IF EXISTS + koşullu UPDATE → iki kez çalıştırılabilir.
--
-- GERİ ALMA (rollback):
--   Politikaları geri açmak GÜVENLİK AÇIĞINI geri getirir; yalnız eski istemciye dönülürse:
--     CREATE POLICY video_temp_insert ON storage.objects FOR INSERT TO anon
--       WITH CHECK (bucket_id = 'video-temp' AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/');
--     CREATE POLICY video_temp_select ON storage.objects FOR SELECT TO anon
--       USING (bucket_id = 'video-temp' AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/');
--     UPDATE storage.buckets SET file_size_limit = 5368709120, allowed_mime_types = NULL
--       WHERE id = 'video-temp';
-- =============================================================================

BEGIN;

-- 1) video-temp'e atıf yapan TÜM storage.objects politikalarını kaldır.
DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects yok — politika adımı atlandı.';
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        policyname IN ('video_temp_insert', 'video_temp_select')
        OR coalesce(qual, '') LIKE '%video-temp%'
        OR coalesce(with_check, '') LIKE '%video-temp%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    RAISE NOTICE 'video-temp politikası kaldırıldı: %', pol.policyname;
  END LOOP;
END
$$;

-- 2) Bucket sınırlarını koddaki gerçek kabul kurallarına hizala (NESNE SİLME YOK).
DO $$
DECLARE
  v_rows integer;
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets yok — bucket adımı atlandı.';
    RETURN;
  END IF;

  UPDATE storage.buckets
  SET public = false,
      file_size_limit = 26214400,
      allowed_mime_types = ARRAY[
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/mpeg',
        'video/ogg',
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/aac',
        'audio/x-aac',
        'audio/ogg',
        'audio/amr',
        'audio/amr-wb',
        'audio/x-amr',
        'audio/3gpp',
        'audio/3gpp2'
      ]::text[]
  WHERE id = 'video-temp';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE NOTICE 'video-temp bucket bulunamadı — bucket adımı atlandı.';
  END IF;
END
$$;

COMMIT;
