-- ============================================================
-- 20260726000000_yebs_concepts.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D3
-- Tablo: public.yebs_concepts (bir geleneğe ve isteğe bağlı aynı gelenek
--   içindeki bir school'a bağlı kanonik kavram kimliği)
--
-- Tek sorumluluk: yalnız yebs_concepts tablosu.
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Kapsam: yalnız kanonik/taksonomik kimlik. description_tr, explanation, meaning,
--   historical_note, energetic_effect, source alıntısı, claim metni veya modül
--   bağlantısı YER ALMAZ — kaynaklı tanım/açıklama ileride yebs_claims içinde
--   claim_type='identity' olarak tutulacaktır.
--
-- İlişkiler:
--   1) tradition_id -> yebs_traditions(id) ON DELETE RESTRICT
--      → Concept bağlıyken gelenek silinemez.
--   2) (school_id, tradition_id) -> yebs_schools(id, tradition_id) ON DELETE RESTRICT
--      → Kompozit, gelenek-tutarlı bağ (D2 aday anahtarı yebs_schools_id_tradition_key).
--        Başka geleneğe ait school bağlanamaz; school varsa concept.tradition_id ile
--        school.tradition_id aynı olmak zorundadır. MATCH SIMPLE: school_id NULL ise
--        kompozit FK zorlanmaz → concept doğrudan tradition seviyesinde yaşayabilir.
--   Concept silme davranışı ileri fazlarda: D4 labels CASCADE, D6 claims RESTRICT,
--   D8 relations CASCADE. D3 tek başına iken concept serbestçe silinebilir.
--
-- İndeks kararı: ayrı INDEX(tradition_id) ve INDEX(school_id, tradition_id)
--   OLUŞTURULMAZ. UNIQUE(tradition_id, slug) tradition_id öncüllü B-tree sağlar;
--   kompozit FK child taraması school_id öncüllü kısmi index ile karşılanır
--   (school_id global tekil id tuttuğundan tradition_id ek seçicilik vermez;
--   nullable olduğundan partial index daha küçük/hedeflidir).
-- ============================================================

CREATE TABLE public.yebs_concepts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tradition_id   uuid        NOT NULL,
  school_id      uuid,
  slug           text        NOT NULL,
  concept_type   text        NOT NULL,
  status         text        NOT NULL DEFAULT 'draft',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Geleneğe bağ. Concept bağlıyken gelenek silinemez.
  CONSTRAINT yebs_concepts_tradition_fk
    FOREIGN KEY (tradition_id)
    REFERENCES public.yebs_traditions (id)
    ON DELETE RESTRICT,

  -- Kompozit, gelenek-tutarlı school bağı (MATCH SIMPLE; school_id NULL ise zorlanmaz).
  CONSTRAINT yebs_concepts_school_fk
    FOREIGN KEY (school_id, tradition_id)
    REFERENCES public.yebs_schools (id, tradition_id)
    ON DELETE RESTRICT,

  -- Kararlı makine kimliği (insana bağımlı olmayan).
  CONSTRAINT yebs_concepts_slug_chk CHECK (
    slug ~ '^[a-z][a-z0-9_]*$'
  ),

  -- Kavramın ontolojik türü.
  CONSTRAINT yebs_concepts_concept_type_chk CHECK (
    concept_type IN (
      'energy_center',
      'channel',
      'vital_substance',
      'anatomy_model',
      'technique',
      'principle',
      'other'
    )
  ),

  -- Yayın yaşam döngüsü (geçişler server-side; generic CRUD 'published' yazamaz).
  CONSTRAINT yebs_concepts_status_chk CHECK (
    status IN ('draft', 'verified', 'approved', 'published')
  ),

  -- Gelenek-içi kanonik doğal kimlik. Global slug tekilliği YOK;
  -- (tradition_id, school_id, slug) da KULLANILMAZ — kimlik gelenek seviyesindedir.
  CONSTRAINT yebs_concepts_tradition_slug_key UNIQUE (tradition_id, slug)
);

-- Statüye göre listeleme (ör. yalnız published kavramlar).
CREATE INDEX yebs_concepts_status_idx
  ON public.yebs_concepts (status);

-- Kompozit FK child taraması (parent school silme/güncelleme RESTRICT kontrolü).
-- Kısmi: yalnız school'a bağlı kavramlar (çoğu concept tradition seviyesi/NULL olabilir).
CREATE INDEX yebs_concepts_school_id_idx
  ON public.yebs_concepts (school_id)
  WHERE school_id IS NOT NULL;

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_concepts_updated_at
  BEFORE UPDATE ON public.yebs_concepts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_concepts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_concepts FROM anon;
REVOKE ALL ON TABLE public.yebs_concepts FROM authenticated;
REVOKE ALL ON TABLE public.yebs_concepts FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_concepts TO service_role;
