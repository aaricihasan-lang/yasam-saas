-- ============================================================
-- 20260726020000_yebs_traditions.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D1
-- Tablo: public.yebs_traditions (kanonik gelenek/kültürel-tarihsel kimlik)
--
-- Tek sorumluluk: yalnız yebs_traditions tablosu.
-- Merkezî referans: tenant_id YOK (tenant-lokal veri ileride ayrı, additif
--   yebs_tenant_notes ile tasarlanacak). İzolasyon tenant-FK ile değil,
--   doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok (aynı isimli
--   nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Kapsam: yalnız kanonik/taksonomik kimlik. Tarihçe, kurucu, dönem, öğreti veya
--   açıklama (description) burada YER ALMAZ — bunlar kaynak gerektiren içerik olup
--   ileride kaynaklandırılmış claim/source modeliyle sunulacaktır.
-- ============================================================

CREATE TABLE public.yebs_traditions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text        NOT NULL,
  name_tr              text        NOT NULL,
  tradition_type       text        NOT NULL,
  native_name          text,
  native_language_tag  text,
  native_script_code   text,
  status               text        NOT NULL DEFAULT 'draft',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Kararlı makine kimliği (insana bağımlı olmayan).
  CONSTRAINT yebs_traditions_slug_chk CHECK (
    slug ~ '^[a-z][a-z0-9_]*$'
  ),

  -- Birincil Türkçe editöryal ad boş olamaz.
  CONSTRAINT yebs_traditions_name_tr_chk CHECK (
    btrim(name_tr) <> ''
  ),

  -- Geleneğin editöryal sınıflandırması (ontolojik statü). Değer kümesi kilitli.
  CONSTRAINT yebs_traditions_tradition_type_chk CHECK (
    tradition_type IN (
      'cultural_tradition',
      'historical_system',
      'modern_system',
      'professional_framework',
      'research_framework'
    )
  ),

  -- Yayın yaşam döngüsü (geçişler server-side; generic CRUD 'published' yazamaz).
  CONSTRAINT yebs_traditions_status_chk CHECK (
    status IN ('draft', 'verified', 'approved', 'published')
  ),

  -- Endonym (özgün öz-ad) çift yönlü coupling: ya üçü de NULL ya da üçü de dolu.
  -- Kısmi doluluk reddedilir.
  CONSTRAINT yebs_traditions_native_coupling_chk CHECK (
    (native_name IS NULL AND native_language_tag IS NULL AND native_script_code IS NULL)
    OR
    (native_name IS NOT NULL AND native_language_tag IS NOT NULL AND native_script_code IS NOT NULL)
  ),

  -- Özgün ad doluysa boş/whitespace olamaz.
  CONSTRAINT yebs_traditions_native_name_chk CHECK (
    native_name IS NULL OR btrim(native_name) <> ''
  ),

  -- BCP-47 gevşek biçim (dar dil listesi yok; tam doğrulama/normalizasyon server-side).
  CONSTRAINT yebs_traditions_native_language_tag_chk CHECK (
    native_language_tag IS NULL
    OR native_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- ISO-15924 biçim (dört harf, ilk büyük).
  CONSTRAINT yebs_traditions_native_script_code_chk CHECK (
    native_script_code IS NULL
    OR native_script_code ~ '^[A-Z][a-z]{3}$'
  ),

  -- Kararlı kimlik tekilliği.
  CONSTRAINT yebs_traditions_slug_key UNIQUE (slug)
);

-- Statüye göre listeleme (ör. yalnız published gelenekler).
CREATE INDEX yebs_traditions_status_idx
  ON public.yebs_traditions (status);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_traditions_updated_at
  BEFORE UPDATE ON public.yebs_traditions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.yebs_traditions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_traditions FROM anon;
REVOKE ALL ON TABLE public.yebs_traditions FROM authenticated;
REVOKE ALL ON TABLE public.yebs_traditions FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_traditions TO service_role;
