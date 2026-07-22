-- ============================================================
-- 20260726030000_yebs_schools.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D2
-- Tablo: public.yebs_schools (bir geleneğe bağlı ekol/yöntem/soy kanonik kimliği)
--
-- Tek sorumluluk: yalnız yebs_schools tablosu (+ D3 kompozit FK aday anahtarı).
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Kapsam: yalnız kanonik/taksonomik kimlik. Tarihçe, kurucu (founder), dönem
--   (period) veya açıklama (description) burada YER ALMAZ — bunlar kaynak
--   gerektiren içerik olup ileride kaynaklandırılmış claim/source modeliyle sunulur.
--
-- İlişki: tradition_id -> yebs_traditions(id) ON DELETE RESTRICT
--   → Altında en az bir school olan gelenek silinemez.
--   → School'un kendisi bu fazda serbestçe silinebilir; D3'te concepts geldiğinde
--     (school_id, tradition_id) -> yebs_schools(id, tradition_id) ON DELETE RESTRICT
--     ile bir concept'e bağlı school silinemez hâle gelecektir.
--
-- İndeks kararı: ayrı INDEX(tradition_id) OLUŞTURULMAZ. UNIQUE(tradition_id, slug)
--   tarafından üretilen B-tree, öncü sütun tradition_id olduğundan tradition_id
--   filtrelerini ve parent-silme FK taramalarını zaten karşılar; ayrı tek-sütun
--   index mükerrer olurdu.
-- ============================================================

CREATE TABLE public.yebs_schools (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tradition_id         uuid        NOT NULL,
  slug                 text        NOT NULL,
  name_tr              text        NOT NULL,
  native_name          text,
  native_language_tag  text,
  native_script_code   text,
  status               text        NOT NULL DEFAULT 'draft',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Geleneğe bağ. Altında school olan gelenek silinemez.
  CONSTRAINT yebs_schools_tradition_fk
    FOREIGN KEY (tradition_id)
    REFERENCES public.yebs_traditions (id)
    ON DELETE RESTRICT,

  -- Kararlı makine kimliği (insana bağımlı olmayan).
  CONSTRAINT yebs_schools_slug_chk CHECK (
    slug ~ '^[a-z][a-z0-9_]*$'
  ),

  -- Birincil Türkçe editöryal ad boş olamaz.
  CONSTRAINT yebs_schools_name_tr_chk CHECK (
    btrim(name_tr) <> ''
  ),

  -- Yayın yaşam döngüsü (geçişler server-side; generic CRUD 'published' yazamaz).
  CONSTRAINT yebs_schools_status_chk CHECK (
    status IN ('draft', 'verified', 'approved', 'published')
  ),

  -- Endonym (özgün öz-ad) çift yönlü coupling: ya üçü de NULL ya da üçü de dolu.
  CONSTRAINT yebs_schools_native_coupling_chk CHECK (
    (native_name IS NULL AND native_language_tag IS NULL AND native_script_code IS NULL)
    OR
    (native_name IS NOT NULL AND native_language_tag IS NOT NULL AND native_script_code IS NOT NULL)
  ),

  -- Özgün ad doluysa boş/whitespace olamaz.
  CONSTRAINT yebs_schools_native_name_chk CHECK (
    native_name IS NULL OR btrim(native_name) <> ''
  ),

  -- BCP-47 gevşek biçim (dar dil listesi yok; tam doğrulama/normalizasyon server-side).
  CONSTRAINT yebs_schools_native_language_tag_chk CHECK (
    native_language_tag IS NULL
    OR native_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- ISO-15924 biçim (dört harf, ilk büyük).
  CONSTRAINT yebs_schools_native_script_code_chk CHECK (
    native_script_code IS NULL
    OR native_script_code ~ '^[A-Z][a-z]{3}$'
  ),

  -- Gelenek-içi doğal kimlik (global slug tekilliği yok).
  CONSTRAINT yebs_schools_tradition_slug_key UNIQUE (tradition_id, slug),

  -- D3 kompozit FK aday anahtarı: (school_id, tradition_id) -> yebs_schools(id, tradition_id).
  -- PostgreSQL kompozit FK referans sütun kümesinin birebir üzerinde UNIQUE ister;
  -- id PK'si tek başına bunu karşılamaz.
  CONSTRAINT yebs_schools_id_tradition_key UNIQUE (id, tradition_id)
);

-- Statüye göre listeleme (ör. yalnız published ekoller).
-- (tradition_id için ayrı index YOK — UNIQUE(tradition_id, slug) öncü sütunuyla karşılanır.)
CREATE INDEX yebs_schools_status_idx
  ON public.yebs_schools (status);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_schools_updated_at
  BEFORE UPDATE ON public.yebs_schools
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_schools ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_schools FROM anon;
REVOKE ALL ON TABLE public.yebs_schools FROM authenticated;
REVOKE ALL ON TABLE public.yebs_schools FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_schools TO service_role;
