-- =============================================================================
-- 20271228000000_expert_workspace_assets_access.sql
--
-- KİŞİSEL DİJİTAL OFİS — P2 güvenli görsel depolama + kullanıcı bazlı açılış (Owner talimatı 2026-11-01; yalnız YEREL
-- geçici veritabanında çalıştırıldı — production / staging'e uygulanması AYRI Owner onayı ister).
--
-- 1) Storage bucket'ları — İKİSİ DE PRIVATE; storage.objects üzerinde politika YOK → yalnız service_role (sunucu rotaları)
--    yazar/okur; istemci doğrudan yazamaz/okuyamaz:
--      * `expert-workspace`         : yalnız sunucuda doğrulanıp yeniden kodlanmış WebP varyantları (kalıcı).
--      * `expert-workspace-staging` : sunucu rotasının yazdığı geçici ham yükleme parçaları (≤ 3 MB); hiçbir okuma ucu yok,
--                                     tamamlama / iptal / saatlik temizlikte silinir. Doğrulanmamış içerik buradan çıkmaz.
-- 2) expert_workspace_assets — assetId ↔ Storage yolu eşleşmesinin KALICI kaydı (yollar sunucuda üretilir, tenant önekli).
--    Silme = açık kullanıcı eylemi; satır SİLİNMEZ, deleted_at işaretlenir (denetim izi). service_role DELETE yok.
-- 3) expert_workspace_uploads — Vercel 4,5 MB gövde sınırı nedeniyle sunucu rotası üzerinden PARÇALI yükleme oturumu
--    (15 dk). Ham parçalar PostgreSQL'de DEĞİL, private staging bucket'ta tutulur (Owner mimari kararı B, 2026-11-01).
--    İşleme kilidi (processing + processing_started_at) → tamamlama iki kez çağrılsa da tek görsel oluşur (assetId = uploadId).
-- 4) expert_workspace_access_grants — kullanıcı bazlı açılış izin listesi. Yalnız Owner (is_super_admin) verir/geri alır;
--    kendi kendine yetki CHECK ile imkânsız; satır silinmez, yalnız geri alınır (revoked_at).
-- 5) expert_storage_usage() — kapasite raporuna YALNIZ 'expert-workspace' + 'expert-workspace-staging' eklenir; geri kalanı AYNEN.
--
-- GÜVENLİK: RLS açık, politika yok; PUBLIC / anon / authenticated yetkisi yok. Tetikleyici fonksiyonları istemciye kapalı.
-- VERİ KORUMA: P1 tabloları ve mevcut veriler DEĞİŞMEZ. IDEMPOTENT. DROP TABLE / TRUNCATE / veri silen geri alma YOK.
-- Geri alma = EXPERT_WORKSPACE_DESIGN_ENABLED kapatma + kod geri alma; bucket ve kullanıcı dosyaları korunur.
-- Hesap kalıcı silmede tablolar tenant_id (uuid) ile admin_purge_archived_expert keşfine girer; bucket önekleri
-- lib/admin/expertPurge.ts tenantStorageTargets listesine eklenir (DB COMMIT sonrası Storage temizliği).
-- =============================================================================

BEGIN;

-- ── 1) Private bucket ────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'storage.buckets yok — expert-workspace bucket oluşturulamaz';
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('expert-workspace', 'expert-workspace', false, 5242880, ARRAY['image/webp']::text[])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('expert-workspace-staging', 'expert-workspace-staging', false, 3145728, ARRAY['application/octet-stream']::text[])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  -- Bu iki bucket'a ait istemci politikası olmamalı (varsa kaldırılır; başka bucket'ı da kapsayan politika varsa DUR).
  IF to_regclass('storage.objects') IS NOT NULL THEN
    FOR r IN SELECT policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS body FROM pg_policies
              WHERE schemaname = 'storage' AND tablename = 'objects'
                AND (coalesce(qual, '') LIKE '%expert-workspace%' OR coalesce(with_check, '') LIKE '%expert-workspace%') LOOP
      IF r.body ~ 'bucket_id\s*=\s*''(?!expert-workspace(-staging)?'')' THEN
        RAISE EXCEPTION 'storage.objects politikası % başka bucket''ı da kapsıyor — elle inceleme gerekli', r.policyname;
      END IF;
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'expert-workspace' AND public = false AND file_size_limit = 5242880
                   AND allowed_mime_types = ARRAY['image/webp']::text[]) THEN
    RAISE EXCEPTION 'expert-workspace bucket doğrulaması başarısız';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'expert-workspace-staging' AND public = false AND file_size_limit = 3145728
                   AND allowed_mime_types = ARRAY['application/octet-stream']::text[]) THEN
    RAISE EXCEPTION 'expert-workspace-staging bucket doğrulaması başarısız';
  END IF;
END $$;

-- ── 2) Görsel kayıtları ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expert_workspace_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  original_format text NOT NULL,
  original_bytes integer NOT NULL,
  original_width integer NOT NULL,
  original_height integer NOT NULL,
  desktop_path text NOT NULL,
  desktop_width integer NOT NULL,
  desktop_height integer NOT NULL,
  desktop_bytes integer NOT NULL,
  mobile_path text NOT NULL,
  mobile_width integer NOT NULL,
  mobile_height integer NOT NULL,
  mobile_bytes integer NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  CONSTRAINT expert_wa_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expert_wa_kind_chk CHECK (kind IN ('logo', 'photo')),
  CONSTRAINT expert_wa_format_chk CHECK (original_format IN ('png', 'jpeg', 'webp')),
  CONSTRAINT expert_wa_size_chk CHECK (original_bytes > 0 AND original_bytes <= 10485760
    AND (kind = 'photo' OR original_bytes <= 2097152)),
  CONSTRAINT expert_wa_dims_chk CHECK (original_width BETWEEN 1 AND 20000 AND original_height BETWEEN 1 AND 20000
    AND desktop_width BETWEEN 1 AND 4096 AND desktop_height BETWEEN 1 AND 4096
    AND mobile_width BETWEEN 1 AND 2048 AND mobile_height BETWEEN 1 AND 2048
    AND desktop_bytes BETWEEN 1 AND 5242880 AND mobile_bytes BETWEEN 1 AND 5242880),
  -- Yol sunucuda üretilir: <tenant>/<kullanıcı>/<asset>/<varyant>.webp (tenant öneki purge/yedek ile uyumlu).
  CONSTRAINT expert_wa_path_chk CHECK (
    desktop_path ~ ('^' || tenant_id::text || '/[0-9a-f-]{36}/' || id::text || '/desktop\.webp$')
    AND mobile_path ~ ('^' || tenant_id::text || '/[0-9a-f-]{36}/' || id::text || '/mobile\.webp$')),
  CONSTRAINT expert_wa_sha_chk CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT expert_wa_deleted_chk CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
CREATE INDEX IF NOT EXISTS expert_wa_owner_idx ON public.expert_workspace_assets (tenant_id, user_id) WHERE deleted_at IS NULL;

-- ── 3) Parçalı yükleme oturumları (ham parçalar staging bucket'ta) ──────────
CREATE TABLE IF NOT EXISTS public.expert_workspace_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  declared_mime text NOT NULL,
  file_name text NOT NULL,
  declared_bytes integer NOT NULL,
  chunk_size integer NOT NULL,
  chunk_count smallint NOT NULL,
  status text NOT NULL DEFAULT 'open',
  asset_id uuid NULL,
  processing_started_at timestamptz NULL,
  staging_cleared_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expert_wu_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expert_wu_kind_chk CHECK (kind IN ('logo', 'photo')),
  CONSTRAINT expert_wu_mime_chk CHECK (declared_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT expert_wu_name_chk CHECK (char_length(file_name) BETWEEN 1 AND 200),
  CONSTRAINT expert_wu_size_chk CHECK (declared_bytes > 0 AND declared_bytes <= 10485760 AND (kind = 'photo' OR declared_bytes <= 2097152)),
  CONSTRAINT expert_wu_chunk_chk CHECK (chunk_size BETWEEN 65536 AND 3145728 AND chunk_count BETWEEN 1 AND 160),
  CONSTRAINT expert_wu_status_chk CHECK (status IN ('open', 'processing', 'completed', 'aborted')),
  CONSTRAINT expert_wu_asset_chk CHECK ((status = 'completed') = (asset_id IS NOT NULL)),
  -- Tamamlanan oturumun görseli = oturum kimliği (aynı yükleme iki görsel üretemez).
  CONSTRAINT expert_wu_asset_id_chk CHECK (asset_id IS NULL OR asset_id = id),
  CONSTRAINT expert_wu_processing_chk CHECK (status <> 'processing' OR processing_started_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS expert_wu_owner_idx ON public.expert_workspace_uploads (tenant_id, user_id, status);
-- Saatlik temizlik: süresi geçen açık/işlenen oturumlar + geçici dosyası henüz silinmemiş kapalı oturumlar.
CREATE INDEX IF NOT EXISTS expert_wu_cleanup_idx ON public.expert_workspace_uploads (expires_at) WHERE staging_cleared_at IS NULL;

-- ── 4) Kullanıcı bazlı açılış izin listesi ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expert_workspace_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text NULL,
  revoked_by uuid NULL,
  revoked_at timestamptz NULL,
  revoke_reason text NULL,
  CONSTRAINT expert_wag_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expert_wag_self_chk CHECK (user_id <> granted_by),
  CONSTRAINT expert_wag_note_chk CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT expert_wag_revoke_chk CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT expert_wag_reason_chk CHECK (revoke_reason IS NULL OR revoke_reason IN ('owner_revoked', 'role_changed', 'tenant_changed', 'other'))
);
CREATE UNIQUE INDEX IF NOT EXISTS expert_wag_active_uq ON public.expert_workspace_access_grants (user_id) WHERE revoked_at IS NULL;

-- ── 5) Koruma tetikleyicileri (rol fark etmeksizin) ─────────────────────────
-- Görsel: yalnız deleted_at / deleted_by bir kez (NULL → değer) değişebilir; geri alınamaz, başka kolon değişmez.
CREATE OR REPLACE FUNCTION public.expert_workspace_asset_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by') THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_ASSET_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by) THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_ASSET_ALREADY_DELETED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.deleted_by IS NOT NULL AND NEW.deleted_by <> OLD.user_id THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_ASSET_DELETE_OWNER_ONLY' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

-- Görsel tavanı: uzman başına en fazla 60 etkin görsel (advisory kilit → eşzamanlı eklemede aşılmaz).
CREATE OR REPLACE FUNCTION public.expert_workspace_asset_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('expert_workspace_asset:' || NEW.user_id::text, 0));
  IF (SELECT count(*) FROM public.expert_workspace_assets WHERE user_id = NEW.user_id AND deleted_at IS NULL) >= 60 THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_ASSET_CAP' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

-- Yükleme oturumu: kimlik/beyan kolonları değişmez. Durum geçişleri:
--   open → processing | aborted ;  processing → processing (kilit yenileme) | open (geçici hata, yeniden dene) | completed | aborted
--   completed / aborted SON durumdur. staging_cleared_at yalnız bir kez (NULL → değer) yazılır.
CREATE OR REPLACE FUNCTION public.expert_workspace_upload_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('expert_workspace_upload:' || NEW.user_id::text, 0));
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'EXPERT_WORKSPACE_UPLOAD_STATUS' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(*) FROM public.expert_workspace_uploads WHERE user_id = NEW.user_id AND status IN ('open', 'processing') AND expires_at > now()) >= 5 THEN
      RAISE EXCEPTION 'EXPERT_WORKSPACE_UPLOAD_CAP' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'asset_id' - 'processing_started_at' - 'staging_cleared_at' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'asset_id' - 'processing_started_at' - 'staging_cleared_at' - 'updated_at') THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_UPLOAD_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'open' AND NEW.status IN ('processing', 'aborted'))
    OR (OLD.status = 'processing' AND NEW.status IN ('open', 'completed', 'aborted'))) THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_UPLOAD_STATUS' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status IN ('completed', 'aborted') AND (NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.processing_started_at IS DISTINCT FROM OLD.processing_started_at) THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_UPLOAD_STATUS' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.staging_cleared_at IS NOT NULL AND NEW.staging_cleared_at IS DISTINCT FROM OLD.staging_cleared_at THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_UPLOAD_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- İzin: yalnız geri alma (revoked_* bir kez); verilmiş izin düzenlenemez, geri alınan izin diriltilemez.
CREATE OR REPLACE FUNCTION public.expert_workspace_grant_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF (to_jsonb(NEW) - 'revoked_by' - 'revoked_at' - 'revoke_reason') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_by' - 'revoked_at' - 'revoke_reason') THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_GRANT_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_GRANT_ALREADY_REVOKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.expert_workspace_asset_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expert_workspace_asset_cap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expert_workspace_upload_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expert_workspace_grant_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expert_wa_guard ON public.expert_workspace_assets;
CREATE TRIGGER expert_wa_guard BEFORE UPDATE ON public.expert_workspace_assets FOR EACH ROW EXECUTE FUNCTION public.expert_workspace_asset_guard();
DROP TRIGGER IF EXISTS expert_wa_cap ON public.expert_workspace_assets;
CREATE TRIGGER expert_wa_cap BEFORE INSERT ON public.expert_workspace_assets FOR EACH ROW EXECUTE FUNCTION public.expert_workspace_asset_cap();
DROP TRIGGER IF EXISTS expert_wu_guard ON public.expert_workspace_uploads;
CREATE TRIGGER expert_wu_guard BEFORE INSERT OR UPDATE ON public.expert_workspace_uploads FOR EACH ROW EXECUTE FUNCTION public.expert_workspace_upload_guard();
DROP TRIGGER IF EXISTS expert_wag_guard ON public.expert_workspace_access_grants;
CREATE TRIGGER expert_wag_guard BEFORE UPDATE ON public.expert_workspace_access_grants FOR EACH ROW EXECUTE FUNCTION public.expert_workspace_grant_guard();

-- ── 6) RLS + yetkiler ────────────────────────────────────────────────────────
ALTER TABLE public.expert_workspace_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expert_workspace_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expert_workspace_access_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.expert_workspace_assets, public.expert_workspace_uploads,
  public.expert_workspace_access_grants FROM PUBLIC;
REVOKE ALL ON TABLE public.expert_workspace_assets, public.expert_workspace_uploads,
  public.expert_workspace_access_grants FROM anon;
REVOKE ALL ON TABLE public.expert_workspace_assets, public.expert_workspace_uploads,
  public.expert_workspace_access_grants FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.expert_workspace_assets, public.expert_workspace_uploads,
  public.expert_workspace_access_grants FROM service_role;

GRANT SELECT, INSERT ON TABLE public.expert_workspace_assets TO service_role;
GRANT UPDATE (deleted_at, deleted_by) ON TABLE public.expert_workspace_assets TO service_role;
GRANT SELECT, INSERT ON TABLE public.expert_workspace_uploads TO service_role;
GRANT UPDATE (status, asset_id, processing_started_at, staging_cleared_at, updated_at) ON TABLE public.expert_workspace_uploads TO service_role;
GRANT SELECT, INSERT ON TABLE public.expert_workspace_access_grants TO service_role;
GRANT UPDATE (revoked_by, revoked_at, revoke_reason) ON TABLE public.expert_workspace_access_grants TO service_role;

COMMENT ON TABLE public.expert_workspace_assets IS 'Kişisel Dijital Ofis: assetId ↔ private Storage yolu (sunucu üretir). Silme = deleted_at (satır korunur).';
COMMENT ON TABLE public.expert_workspace_uploads IS 'Kişisel Dijital Ofis: sunucu rotası üzerinden parçalı görsel yükleme oturumu (15 dk); ham parçalar private staging bucket''ta.';
COMMENT ON TABLE public.expert_workspace_access_grants IS 'Kişisel Dijital Ofis: kullanıcı bazlı açılış izin listesi (yalnız Owner; geri alınır, silinmez).';

-- ── 7) Kapasite raporu: yalnız 'expert-workspace' + 'expert-workspace-staging' eklenir (geri kalan 20270113000000 ile AYNI) ──
CREATE OR REPLACE FUNCTION public.expert_storage_usage()
RETURNS TABLE (
  tenant_id          uuid,
  bucket             text,
  object_count       bigint,
  total_bytes        bigint,
  missing_size_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage, pg_catalog
AS $$
  WITH base AS (
    SELECT
      o.bucket_id AS bucket,
      -- tenant segmenti: stone-photos'ta özel prefix'ler sonrası, diğerlerinde ilk segment.
      CASE
        WHEN o.bucket_id = 'stone-photos'
             AND split_part(o.name, '/', 1) IN ('catalog','healing-guides')
          THEN split_part(o.name, '/', 2)
        ELSE split_part(o.name, '/', 1)
      END AS tenant_seg,
      -- Boyutu GÜVENLİ ayrıştır: yalnız 1..18 haneli negatif-olmayan tamsayı kabul edilir.
      -- Eksik/bozuk/negatif/bigint-taşıran değer → NULL (RPC ÇÖKMEZ; missing_size_count'a düşer).
      -- (18 hane < 1e18, bigint sınırı 9.2e18 içinde; 19+ hane veya sayı-dışı → geçersiz.)
      CASE WHEN o.metadata->>'size' ~ '^[0-9]{1,18}$'
           THEN (o.metadata->>'size')::bigint
           ELSE NULL END AS size_bytes
    FROM storage.objects o
    WHERE o.bucket_id IN (
      'stone-photos','hd-chart-images','client-analysis-images',
      'video-temp','video-ceviri-output','belge-ceviri','personal-archive',
      'expert-workspace','expert-workspace-staging'
    )
  ),
  attributed AS (
    SELECT
      CASE WHEN tenant_seg ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN tenant_seg::uuid ELSE NULL END AS tenant_id,
      bucket,
      size_bytes
    FROM base
  )
  SELECT
    tenant_id,
    bucket,
    count(*)::bigint                                        AS object_count,
    coalesce(sum(size_bytes), 0)::bigint                    AS total_bytes,
    count(*) FILTER (WHERE size_bytes IS NULL)::bigint       AS missing_size_count
  FROM attributed
  GROUP BY tenant_id, bucket;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
