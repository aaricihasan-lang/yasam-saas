-- =============================================================================
-- 20271120001200_personal_archive_limits.sql
--
-- SATIŞ ÖNCESİ AŞAMA 1 — DIJ-03 (owner kararı: YAPALIM; owner ek kararı 2026-10-20: tenant başına
-- toplam 2 GB, dosya başına 50 MB): Kişisel Arşiv kota ve tekil dosya sınırının DB tarafı.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply ayrı owner onayıyla (Dashboard SQL Editor).
--
-- DEPLOY SIRASI (ZORUNLU): Bu migration, uygulama kodundan ÖNCE uygulanmalıdır. Kod kotayı
--   fail-closed uygular: RPC'ler yoksa/hata verirse YENİ yükleme 503 ile durdurulur (mevcut dosyaların
--   listelenmesi/indirilmesi/silinmesi etkilenmez). Kod önce gelirse yükleme geçici olarak kapalı kalır.
--
-- BU DOSYANIN YAPTIĞI:
--   (1) `personal-archive` bucket'ına SERT tekil nesne tavanı file_size_limit = 50 MB (52 428 800 bayt).
--       allowed_mime_types BİLİNÇLİ OLARAK NULL (tür kararı uygulamada; tarayıcı bilinmeyen türde
--       octet-stream gönderir). Bucket yoksa PRIVATE oluşturulur.
--   (2) `personal_archive_upload_reservations`: yükleme hazırlığında (signed URL) ayrılan beyan boyut.
--       Eşzamanlı yüklemelerin kotayı birlikte aşmasını önler. RLS açık, istemci rollerine KAPALI.
--   (3) `personal_archive_tenant_bytes(uuid)`: tenant'ın depodaki GERÇEK bayt toplamı (storage.objects).
--   (4) `personal_archive_reserve_upload(...)`: tenant başına danışma kilidi altında
--         kullanım = depodaki gerçek bayt + henüz depoya düşmemiş geçerli rezervasyonlar
--       hesaplanır; kullanım + yeni beyan > kota ise RED; değilse rezervasyon yazılır.
--   (5) `personal_archive_commit_upload(...)`: aynı kilit altında nesnenin GERÇEK boyut/türü
--       storage.objects'ten okunur; tekil sınır ve toplam kota (gerçek bayt + diğer rezervasyonlar)
--       yeniden denetlenir; rezervasyon her sonuçta kapatılır. Metadata boyutu yoksa RED (fail-closed).
--   Tüm fonksiyonlar SECURITY DEFINER + search_path='' + yalnız service_role EXECUTE.
--
-- GB/GiB: Uygulama kotası 2 GB = 2 × 1024³ = 2 147 483 648 bayt (PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES);
--   fonksiyonlar kotayı PARAMETRE olarak alır (tek kaynak uygulama sabiti).
-- TENANT/RLS: storage.objects RLS'i ve politikaları DEĞİŞMEZ. Toplamlar yalnız `<tenant_id>/` önekini
--   sayar. Fonksiyonlar kişisel veri döndürmez (bayt/MIME/neden kodu).
-- VERİ KAYBI: YOK. Mevcut nesne/kayıt silinmez; limit yalnız yeni yüklemelerde.
-- KİLİT: bucket UPDATE tek satır; yeni tablo/fonksiyon. Uzun kilit yok.
-- İDEMPOTENT: ON CONFLICT / IF NOT EXISTS / CREATE OR REPLACE.
-- ROLLBACK (güvenliği düşürmez; mevcut dosyalar korunur):
--   DROP FUNCTION IF EXISTS public.personal_archive_commit_upload(uuid, text, bigint, bigint);
--   DROP FUNCTION IF EXISTS public.personal_archive_reserve_upload(uuid, text, bigint, bigint, integer, integer);
--   DROP FUNCTION IF EXISTS public.personal_archive_tenant_bytes(uuid);
--   DROP TABLE IF EXISTS public.personal_archive_upload_reservations;
--   (Kod fail-closed olduğundan rollback sonrası YENİ yükleme kapanır; okuma etkilenmez.)
--   Bucket tavanı 50 MB bırakılabilir; kaldırmak yalnız owner kararıyla:
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'personal-archive';
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('personal-archive', 'personal-archive', false, 52428800)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      public          = false;

CREATE TABLE IF NOT EXISTS public.personal_archive_upload_reservations (
  path           text        PRIMARY KEY,
  tenant_id      uuid        NOT NULL,
  declared_bytes bigint      NOT NULL CHECK (declared_bytes > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS personal_archive_upload_reservations_tenant_idx
  ON public.personal_archive_upload_reservations (tenant_id, expires_at);
COMMENT ON TABLE public.personal_archive_upload_reservations IS
  'DIJ-03: Kişisel Arşiv yükleme rezervasyonları (eşzamanlı kota güvencesi). Yalnız service_role RPC''leri yazar.';
ALTER TABLE public.personal_archive_upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.personal_archive_upload_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personal_archive_upload_reservations TO service_role;

-- (3) Gerçek bayt toplamı ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.personal_archive_tenant_bytes(p_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(CASE WHEN o.metadata->>'size' ~ '^[0-9]{1,18}$'
                           THEN (o.metadata->>'size')::bigint ELSE 0 END), 0)::bigint
    FROM storage.objects o
   WHERE o.bucket_id = 'personal-archive'
     AND p_tenant_id IS NOT NULL
     AND o.name LIKE p_tenant_id::text || '/%';
$$;

-- (4) Rezervasyon -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.personal_archive_reserve_upload(
  p_tenant_id   uuid,
  p_path        text,
  p_bytes       bigint,
  p_quota       bigint,
  p_max_pending integer,
  p_ttl_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now      timestamptz := now();
  v_stored   bigint;
  v_reserved bigint;
  v_pending  integer;
BEGIN
  IF p_tenant_id IS NULL OR coalesce(p_path, '') = '' OR p_path NOT LIKE p_tenant_id::text || '/%'
     OR p_bytes IS NULL OR p_bytes <= 0 OR p_quota IS NULL OR p_quota <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('personal_archive_quota:' || p_tenant_id::text, 0));

  DELETE FROM public.personal_archive_upload_reservations
   WHERE tenant_id = p_tenant_id AND expires_at <= v_now;

  v_stored := public.personal_archive_tenant_bytes(p_tenant_id);
  SELECT coalesce(sum(r.declared_bytes), 0)::bigint, count(*)::integer
    INTO v_reserved, v_pending
    FROM public.personal_archive_upload_reservations r
   WHERE r.tenant_id = p_tenant_id
     AND NOT EXISTS (SELECT 1 FROM storage.objects o
                      WHERE o.bucket_id = 'personal-archive' AND o.name = r.path);

  IF v_pending >= greatest(1, coalesce(p_max_pending, 1)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pending_limit', 'used_bytes', v_stored + v_reserved);
  END IF;
  IF v_stored + v_reserved + p_bytes > p_quota THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'quota', 'used_bytes', v_stored + v_reserved);
  END IF;

  INSERT INTO public.personal_archive_upload_reservations (path, tenant_id, declared_bytes, created_at, expires_at)
  VALUES (p_path, p_tenant_id, p_bytes, v_now, v_now + make_interval(secs => greatest(60, coalesce(p_ttl_seconds, 3600))))
  ON CONFLICT (path) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_path');
  END IF;

  RETURN jsonb_build_object('ok', true, 'used_bytes', v_stored + v_reserved);
END $$;

-- (5) Commit (finalize) -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.personal_archive_commit_upload(
  p_tenant_id uuid,
  p_path      text,
  p_quota     bigint,
  p_max_file  bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_size     bigint;
  v_raw      text;
  v_mime     text;
  v_found    boolean;
  v_stored   bigint;
  v_reserved bigint;
BEGIN
  IF p_tenant_id IS NULL OR coalesce(p_path, '') = '' OR p_path NOT LIKE p_tenant_id::text || '/%'
     OR p_quota IS NULL OR p_quota <= 0 OR p_max_file IS NULL OR p_max_file <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('personal_archive_quota:' || p_tenant_id::text, 0));

  SELECT true, o.metadata->>'size', o.metadata->>'mimetype'
    INTO v_found, v_raw, v_mime
    FROM storage.objects o
   WHERE o.bucket_id = 'personal-archive' AND o.name = p_path
   LIMIT 1;

  -- Rezervasyon her sonuçta kapatılır (yeniden deneme yeni hazırlık ister).
  DELETE FROM public.personal_archive_upload_reservations WHERE path = p_path AND tenant_id = p_tenant_id;

  IF v_found IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing');
  END IF;
  IF v_raw IS NULL OR v_raw !~ '^[0-9]{1,18}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'size_unknown');
  END IF;
  v_size := v_raw::bigint;
  IF v_size > p_max_file THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_large', 'size', v_size, 'mimetype', v_mime);
  END IF;

  v_stored := public.personal_archive_tenant_bytes(p_tenant_id);   -- bu nesne DAHİL
  SELECT coalesce(sum(r.declared_bytes), 0)::bigint
    INTO v_reserved
    FROM public.personal_archive_upload_reservations r
   WHERE r.tenant_id = p_tenant_id
     AND r.expires_at > now()
     AND NOT EXISTS (SELECT 1 FROM storage.objects o
                      WHERE o.bucket_id = 'personal-archive' AND o.name = r.path);
  IF v_stored + v_reserved > p_quota THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'quota', 'size', v_size, 'mimetype', v_mime,
                              'used_bytes', v_stored + v_reserved);
  END IF;

  RETURN jsonb_build_object('ok', true, 'size', v_size, 'mimetype', v_mime, 'used_bytes', v_stored + v_reserved);
END $$;

REVOKE ALL ON FUNCTION public.personal_archive_tenant_bytes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.personal_archive_reserve_upload(uuid, text, bigint, bigint, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.personal_archive_commit_upload(uuid, text, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personal_archive_tenant_bytes(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.personal_archive_reserve_upload(uuid, text, bigint, bigint, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.personal_archive_commit_upload(uuid, text, bigint, bigint) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
