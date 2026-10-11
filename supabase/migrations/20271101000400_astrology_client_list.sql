-- =============================================================================
-- 20271101000400_astrology_client_list.sql   [ADDITIVE — 1 KOLON + 7 FONKSİYON; VERİ SİLMEZ]
--
-- ASTROLOJİ — AŞAMA 7B: DANIŞAN LİSTESİ · ANALİZ GEÇMİŞİ · DANIŞAN EŞLEŞTİRME · ARŞİV. OWNER-ONLY PİLOT.
--
--   • astro_birth_profiles.archived_at  → güvenli arşiv (silme DEĞİL; analizler aynen kalır, geri alınabilir).
--   • astro_norm(text)                  → Türkçe arama normalizasyonu (İ/I/ı/i → i, ğ→g, ü→u, ş→s, ö→o, ç→c,
--                                          küçük harf, boşluk sıkıştırma). lib/astrology/search/normalize.ts ile AYNI.
--                                          translate() önce uygulanır → sunucu yereli (C / tr_TR / en_US) sonucu değiştirmez.
--   • astro_profile_page                → sunucu tarafı arama + doğum tarihi filtresi + arşiv filtresi + sayfalama
--                                          + analiz sayısı / son analiz tarihi (200 kayıt sınırı kalkar).
--   • astro_analysis_summary / _page    → kayıtlı analizler teknik bazında özet + gelenek (western/vedic/kp) sayfası.
--   • astro_client_candidates           → merkezî danışanlarda (YALNIZ çağıranın tenant'ı) aday arama; kesin eşleşme
--                                          varsayılmaz, otomatik bağ YOK.
--   • astro_profile_set_client          → eşleştir / yeniden bağla / kaldır — iyimser kilit (beklenen mevcut bağ).
--   • astro_client_status               → bir danışanın, çağıran uzmanın eşleştirilmiş profillerindeki GERÇEK kayıtlı
--                                          analiz sayısı (Danışan Yolculuğu'ndaki küçük durum alanı için; içerik YOK).
--
-- SAHİPLİK: Her fonksiyon p_tenant_id + p_owner_user_id alır ve YALNIZ o uzmanın satırlarını görür. clients
--   yalnız tenant kapsamlıdır (Danışan Yolculuğu'nun erişim kuralı: requireModuleAccess("clients") + tenant_id).
--   Hepsi SECURITY INVOKER; yalnız service_role çalıştırır (owner API'si).
-- clients KOLONLARI (mevcut şema; yeni kolon EKLENMEZ): id, tenant_id, ad, soyad, dogum, telefon, created_at.
--
-- PRECONDITION: 20271101000000…000300.   VERİ-YIKICI MI: HAYIR.   İDEMPOTENT: EVET.
-- ⚠️ PRODUCTION'A UYGULANMADI (work/astrology-roxy, Aşama 7B yerel).
-- GERİ ALMA: fonksiyonları DROP; ALTER TABLE public.astro_birth_profiles DROP COLUMN archived_at.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'astro_birth_profiles' AND column_name = 'owner_user_id') THEN
    RAISE EXCEPTION 'ASTRO 7B: önce 20271101000300 uygulanmalı';
  END IF;
END
$pre$;

-- ─── 1) Arşiv ────────────────────────────────────────────────────────────────
ALTER TABLE public.astro_birth_profiles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
COMMENT ON COLUMN public.astro_birth_profiles.archived_at IS
  'Arşiv zamanı (NULL = etkin). Arşiv SİLME değildir: revizyonlar, sonuçlar, notlar ve kayıtlı analizler korunur; geri alınabilir.';
CREATE INDEX IF NOT EXISTS astro_bp_owner_active_idx
  ON public.astro_birth_profiles (tenant_id, owner_user_id, (archived_at IS NULL), updated_at DESC);

-- ─── 2) Türkçe normalizasyon ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.astro_norm(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT btrim(regexp_replace(lower(translate(coalesce(p, ''), 'İIıĞğÜüŞşÖöÇçÂâÎîÛû', 'iiigguussooccaaiiuu')), '\s+', ' ', 'g'))
$fn$;

-- LIKE joker karakterlerini kaçır (kullanıcı metni desen olamaz).
CREATE OR REPLACE FUNCTION public.astro_like_escape(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$fn$;

-- ─── 3) Profil sayfası (arama + filtre + sayfalama + analiz özeti) ───────────
CREATE OR REPLACE FUNCTION public.astro_profile_page(
  p_tenant_id uuid,
  p_owner_user_id uuid,
  p_query text,
  p_birth_date date,
  p_archived boolean,
  p_sort text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  id uuid, label text, client_id uuid, client_ad text, client_soyad text, current_revision integer,
  birth_date date, birth_time time, time_known boolean, location_label text,
  archived_at timestamptz, created_at timestamptz, updated_at timestamptz,
  analysis_count bigint, last_analysis_at timestamptz, total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  WITH q AS (
    SELECT public.astro_like_escape(public.astro_norm(p_query)) AS pat
  ), base AS (
    SELECT p.id, p.label, p.client_id, c.ad AS client_ad, c.soyad AS client_soyad, p.current_revision,
           r.birth_date, r.birth_time, r.time_known, r.location_label,
           p.archived_at, p.created_at, p.updated_at,
           (SELECT count(*) FROM public.astro_analyses a
             WHERE a.tenant_id = p.tenant_id AND a.owner_user_id = p.owner_user_id AND a.profile_id = p.id) AS analysis_count,
           (SELECT max(a.analysis_at) FROM public.astro_analyses a
             WHERE a.tenant_id = p.tenant_id AND a.owner_user_id = p.owner_user_id AND a.profile_id = p.id) AS last_analysis_at
      FROM public.astro_birth_profiles p
      JOIN public.astro_birth_profile_revisions r
        ON r.tenant_id = p.tenant_id AND r.owner_user_id = p.owner_user_id AND r.profile_id = p.id AND r.revision = p.current_revision
      LEFT JOIN public.clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
      CROSS JOIN q
     WHERE p.tenant_id = p_tenant_id
       AND p.owner_user_id = p_owner_user_id
       AND (CASE WHEN coalesce(p_archived, false) THEN p.archived_at IS NOT NULL ELSE p.archived_at IS NULL END)
       AND (p_birth_date IS NULL OR r.birth_date = p_birth_date)
       AND (q.pat = '' OR public.astro_norm(p.label) LIKE '%' || q.pat || '%' ESCAPE '\'
            OR public.astro_norm(coalesce(c.ad, '') || ' ' || coalesce(c.soyad, '')) LIKE '%' || q.pat || '%' ESCAPE '\')
  )
  SELECT b.*, count(*) OVER () AS total_count
    FROM base b
   ORDER BY
     CASE WHEN p_sort = 'name' THEN public.astro_norm(b.label) END ASC,
     greatest(b.updated_at, coalesce(b.last_analysis_at, b.updated_at)) DESC,
     b.id
   LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  OFFSET greatest(0, coalesce(p_offset, 0))
$fn$;

-- ─── 4) Kayıtlı analiz özeti + sayfası ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.astro_analysis_summary(p_tenant_id uuid, p_owner_user_id uuid, p_profile_id uuid)
RETURNS TABLE (technique text, analysis_count bigint, last_analysis_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.technique, count(*), max(a.analysis_at)
    FROM public.astro_analyses a
   WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND a.profile_id = p_profile_id
   GROUP BY a.technique
   ORDER BY a.technique
$fn$;

CREATE OR REPLACE FUNCTION public.astro_analysis_page(
  p_tenant_id uuid,
  p_owner_user_id uuid,
  p_profile_id uuid,
  p_tradition text,
  p_technique text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  id uuid, title text, technique text, technique_params jsonb, partner_label text, analysis_at timestamptz,
  profile_revision integer, house_system text, provider_interp_included boolean, client_id uuid, event_kind text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.id, a.title, a.technique, a.technique_params, a.profile_snapshot->'partner'->>'label', a.analysis_at,
         a.profile_revision, a.method_snapshot->>'houseSystem', a.provider_interp_included, a.client_id, a.event_kind
    FROM public.astro_analyses a
   WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND a.profile_id = p_profile_id
     AND (p_tradition IS NULL OR a.technique LIKE p_tradition || '.%')
     AND (p_technique IS NULL OR a.technique = p_technique)
   ORDER BY a.analysis_at DESC, a.id DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  OFFSET greatest(0, coalesce(p_offset, 0))
$fn$;

-- ─── 5) Danışan adayları (merkezî danışanlar; yalnız çağıranın tenant'ı) ─────
CREATE OR REPLACE FUNCTION public.astro_client_candidates(
  p_tenant_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_birth_date date,
  p_limit integer
)
RETURNS TABLE (id uuid, ad text, soyad text, dogum text, created_at timestamptz, linked_profile_count bigint, name_exact boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  WITH q AS (
    SELECT public.astro_norm(p_name) AS n, public.astro_like_escape(public.astro_norm(p_name)) AS pat
  )
  SELECT c.id, c.ad, c.soyad, left(c.dogum::text, 10), c.created_at,
         (SELECT count(*) FROM public.astro_birth_profiles p
           WHERE p.tenant_id = c.tenant_id AND p.owner_user_id = p_owner_user_id AND p.client_id = c.id),
         public.astro_norm(coalesce(c.ad, '') || ' ' || coalesce(c.soyad, '')) = q.n
    FROM public.clients c
    CROSS JOIN q
   WHERE c.tenant_id = p_tenant_id
     AND (char_length(q.n) >= 2 OR p_birth_date IS NOT NULL)
     AND (q.n = '' OR public.astro_norm(coalesce(c.ad, '') || ' ' || coalesce(c.soyad, '')) LIKE '%' || q.pat || '%' ESCAPE '\')
     AND (p_birth_date IS NULL OR left(c.dogum::text, 10) = to_char(p_birth_date, 'YYYY-MM-DD'))
   ORDER BY 7 DESC, c.created_at DESC NULLS LAST, c.id
   LIMIT greatest(1, least(coalesce(p_limit, 20), 50))
$fn$;

-- ─── 6) Eşleştir / yeniden bağla / kaldır (iyimser kilit) ────────────────────
CREATE OR REPLACE FUNCTION public.astro_profile_set_client(
  p_tenant_id uuid,
  p_owner_user_id uuid,
  p_profile_id uuid,
  p_client_id uuid,
  p_expected_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_current uuid;
BEGIN
  SELECT client_id INTO v_current FROM public.astro_birth_profiles
   WHERE tenant_id = p_tenant_id AND owner_user_id = p_owner_user_id AND id = p_profile_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASTRO_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  -- Ekranda görülen bağ hâlâ geçerli mi? (bayat ekrandan yanlış ilişkilendirme engellenir)
  IF v_current IS DISTINCT FROM p_expected_client_id THEN
    RAISE EXCEPTION 'ASTRO_CLIENT_LINK_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.tenant_id = p_tenant_id AND c.id = p_client_id
  ) THEN
    RAISE EXCEPTION 'ASTRO_CLIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.astro_birth_profiles SET client_id = p_client_id
   WHERE tenant_id = p_tenant_id AND owner_user_id = p_owner_user_id AND id = p_profile_id;
  RETURN jsonb_build_object('profile_id', p_profile_id, 'client_id', p_client_id, 'previous_client_id', v_current);
END
$fn$;

-- ─── 7) Danışan Yolculuğu durum alanı: gerçek kayıtlı analiz sayısı ──────────
CREATE OR REPLACE FUNCTION public.astro_client_status(p_tenant_id uuid, p_owner_user_id uuid, p_client_id uuid)
RETURNS TABLE (linked_profile_count bigint, analysis_count bigint, last_analysis_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  SELECT (SELECT count(*) FROM public.astro_birth_profiles p
           WHERE p.tenant_id = p_tenant_id AND p.owner_user_id = p_owner_user_id AND p.client_id = p_client_id),
         (SELECT count(*) FROM public.astro_analyses a
            JOIN public.astro_birth_profiles p ON p.tenant_id = a.tenant_id AND p.owner_user_id = a.owner_user_id AND p.id = a.profile_id
           WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND p.client_id = p_client_id),
         (SELECT max(a.analysis_at) FROM public.astro_analyses a
            JOIN public.astro_birth_profiles p ON p.tenant_id = a.tenant_id AND p.owner_user_id = a.owner_user_id AND p.id = a.profile_id
           WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND p.client_id = p_client_id)
$fn$;

-- ─── 8) Yetkiler: yalnız service_role ────────────────────────────────────────
REVOKE ALL ON FUNCTION public.astro_norm(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_like_escape(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_profile_page(uuid, uuid, text, date, boolean, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_analysis_summary(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_analysis_page(uuid, uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_client_candidates(uuid, uuid, text, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_profile_set_client(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_client_status(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astro_norm(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_like_escape(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_profile_page(uuid, uuid, text, date, boolean, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_analysis_summary(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_analysis_page(uuid, uuid, uuid, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_client_candidates(uuid, uuid, text, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_profile_set_client(uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_client_status(uuid, uuid, uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
