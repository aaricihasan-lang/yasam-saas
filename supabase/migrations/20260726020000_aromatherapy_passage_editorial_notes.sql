-- ============================================================
-- 20260726020000_aromatherapy_passage_editorial_notes.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2J
-- İKİ TABLO: editöryal not SERİSİ (değişmez kimlik) + REVISION kayıtları (değişebilir metin)
--   1) public.aromatherapy_passage_editorial_note_series  (seri kimliği; APPEND-ONLY)
--   2) public.aromatherapy_passage_editorial_notes         (revision metinleri)
--
-- ÜRÜN AMACI: kaynak pasaj ve sadık çeviriden TAMAMEN AYRI editöryal açıklama katmanı.
--   Bilgi Bankası/Bilgi Pasaportu üç katmanı ayrı gösterir: (1) Kaynakta yazan (C2H
--   passage.original_text; reference_only → yalnız locator), (2) Sadık çeviri (C2I),
--   (3) Editör açıklaması/yorumu (C2J). Editöryal içerik ASLA kaynak metin veya sadık
--   çeviri gibi gösterilmez.
--
-- SERİ-BÜTÜNLÜĞÜ (kritik): seri-kimlik alanları (passage_id, translation_id, note_type,
--   editorial_class, note_lang) YALNIZ seri tablosunda tek satır olarak yaşar; revision
--   tablosunda BU KOLONLAR YOKTUR. Revision'lar seriye (tenant_id, note_series_id) FK ile
--   bağlanır ve kimliği MİRAS ALIR → farklı revision'ların farklı passage/dil/tür/çeviriye
--   kayması YAPISAL OLARAK İMKÂNSIZDIR (normalizasyon; CHECK/trigger değil).
--
-- SERİ APPEND-ONLY (DB-seviye): seri satırının tüm alanları kimliktir; geriye dönük
--   yeniden yazımı engellemek için seri tablosuna yapılan HER UPDATE, BEFORE UPDATE
--   trigger'ı ile (SQLSTATE 23514 = check_violation) reddedilir. Trigger yalnız UPDATE'i
--   engeller; INSERT ve ON DELETE RESTRICT davranışına dokunmaz. (Cross-revision bütünlük
--   iki-tablolu normalizasyonla; trigger yalnız tek seri satırının mutasyonunu kapatır.)
--
-- Tenant-scoped: her iki tablo tenant_id uuid NOT NULL (tenant tablosuna FK yok — proje
--   standardı). Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE +
--   service_role GRANT). Deterministik/fail-fast: düz ifadeler; IF NOT EXISTS/DROP yok.
--   Ortak public.set_updated_at() yalnız revision tablosunda reuse (seride updated_at yok).
--
-- Kapsam dışı (bilinçli): claim_id/glossary_term_id (C2K/C2L), note-to-note parent/supersedes,
--   rights/telif alanı (kilitli içerik politikası: C2J yalnız bize ait özgün editöryal içerik;
--   üçüncü-kişi metni kopyalanamaz; kaynak cümlesi C2H'ye, sadık çeviri C2I'ye, claim C2D'ye,
--   glossary tanımı C2G'ye aittir).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HASH SÖZLEŞMESİ (KRİTİK — migration hash ÜRETMEZ):
--   * note_hash = SHA-256( note_text'in BİREBİR UTF-8 byte dizisi ) → 64 hex.
--   * service_role uygulama/API katmanında Node.js crypto üretir; pgcrypto/digest YOK.
--   * Hash öncesi trim/lowercase/Unicode-normalize/whitespace-collapse/punct/line-ending/
--     dilsel-normalize YOK. Migration yalnız '^[0-9a-f]{64}$' formatını zorlar.
--
-- YAYIN SÖZLEŞMESİ (uygulama/writer katmanı — DB DEĞİL; sonraki fazda unutulmasın):
--   * Seri translation_id taşıyorsa, bir revision 'verified' yapılırken bağlı çevirinin O AN
--     'verified' olduğu UYGULAMA KATMANINDA zorunlu kontrol edilir. Bu FK'ye/DB status bağına
--     EKLENMEZ: seri→translation FK belirli çeviri REVISION'ına tarihsel bağdır; çeviri sonradan
--     archived olabilir, notun tarihsel dayanağı SİLİNMEZ. İleride UI "dayanak çeviri arşivlendi"
--     uyarısı gösterebilmelidir.
-- ─────────────────────────────────────────────────────────────────────────────
-- ============================================================


-- ── 1) C2I'ye additif aday anahtar — Enhanced seri→translation FK hedefi ──────
--    (tenant_id, id) zaten tekil → bu küme trivially tekil; mevcut veriyle çakışma imkânsız.
--    C2I migration dosyası DEĞİŞTİRİLMEZ; bu ALTER yalnız burada. Fail-fast (IF NOT EXISTS yok).
ALTER TABLE public.aromatherapy_passage_translations
  ADD CONSTRAINT aromatherapy_passage_translations_tenant_id_passage_unique
  UNIQUE (tenant_id, passage_id, id);


-- ── 2) SERİ TABLOSU (değişmez kimlik; append-only) ───────────────────────────
CREATE TABLE public.aromatherapy_passage_editorial_note_series (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  passage_id       uuid        NOT NULL,
  translation_id   uuid,
  note_type        text        NOT NULL,
  editorial_class  text        NOT NULL,
  note_lang        text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Passage bağı (zorunlu): hem excerpt hem reference_only. Serili passage silinemez.
  CONSTRAINT aromatherapy_passage_editorial_note_series_passage_fk
    FOREIGN KEY (tenant_id, passage_id)
    REFERENCES public.aromatherapy_source_passages (tenant_id, id)
    ON DELETE RESTRICT,

  -- Enhanced çeviri bağı (opsiyonel): aynı tenant + AYNI passage'a ait çeviri. MATCH SIMPLE
  -- (translation_id NULL → atlanır). reference_only passage'ın çevirisi olmadığından, non-null
  -- translation FAIL-CLOSED reddedilir (eşleşecek satır yok).
  CONSTRAINT aromatherapy_passage_editorial_note_series_translation_fk
    FOREIGN KEY (tenant_id, passage_id, translation_id)
    REFERENCES public.aromatherapy_passage_translations (tenant_id, passage_id, id)
    ON DELETE RESTRICT,

  -- note_type allowlist.
  CONSTRAINT aromatherapy_passage_editorial_note_series_note_type_chk CHECK (
    note_type IN ('summary', 'context', 'terminology', 'cultural', 'plain_language', 'expert_commentary')
  ),

  -- editorial_class allowlist.
  CONSTRAINT aromatherapy_passage_editorial_note_series_class_chk CHECK (
    editorial_class IN ('editorial_explanation', 'editorial_interpretation')
  ),

  -- type ↔ class coupling.
  CONSTRAINT aromatherapy_passage_editorial_note_series_type_class_chk CHECK (
    (note_type IN ('summary', 'context', 'terminology', 'plain_language')
       AND editorial_class = 'editorial_explanation')
    OR (note_type = 'expert_commentary'
       AND editorial_class = 'editorial_interpretation')
    OR (note_type = 'cultural'
       AND editorial_class IN ('editorial_explanation', 'editorial_interpretation'))
  ),

  -- note_lang: boş olamaz + BCP-47-lite guard (tam doğrulama app'te).
  CONSTRAINT aromatherapy_passage_editorial_note_series_note_lang_chk CHECK (
    btrim(note_lang) <> '' AND note_lang ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'
  )
);

-- Seri aday anahtarı — revision→seri FK hedefi (+ FK bileşimlerinin tenant güvenliği).
ALTER TABLE public.aromatherapy_passage_editorial_note_series
  ADD CONSTRAINT aromatherapy_passage_editorial_note_series_tenant_id_unique UNIQUE (tenant_id, id);

-- Seri APPEND-ONLY: her UPDATE'i reddeden module-scoped trigger fonksiyonu.
-- SQLSTATE 23514 (check_violation) → harness öngörülebilir biçimde yakalar.
CREATE FUNCTION public.aromatherapy_note_series_no_update()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'aromatherapy_passage_editorial_note_series is append-only; UPDATE forbidden'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_aromatherapy_note_series_no_update
  BEFORE UPDATE ON public.aromatherapy_passage_editorial_note_series
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_note_series_no_update();

-- Listeleme index (non-unique): aynı passage/type/lang için BİRDEN ÇOK bağımsız seri serbest.
-- Prefix (tenant_id, passage_id) passage-FK delete-check'i de destekler.
CREATE INDEX aromatherapy_passage_editorial_note_series_list_idx
  ON public.aromatherapy_passage_editorial_note_series (tenant_id, passage_id, note_type, note_lang);

-- Partial translation index: translation-FK delete-check + ters bağlantı sorgusu.
CREATE INDEX aromatherapy_passage_editorial_note_series_translation_idx
  ON public.aromatherapy_passage_editorial_note_series (tenant_id, passage_id, translation_id)
  WHERE translation_id IS NOT NULL;

-- Güvenlik: doğuştan-kilitli.
ALTER TABLE public.aromatherapy_passage_editorial_note_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_passage_editorial_note_series FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_passage_editorial_note_series TO service_role;


-- ── 3) REVISION TABLOSU (değişebilir metin; seri kimliğini MİRAS ALIR) ────────
CREATE TABLE public.aromatherapy_passage_editorial_notes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  note_series_id   uuid        NOT NULL,
  revision         integer     NOT NULL DEFAULT 1,
  note_text        text        NOT NULL,
  note_hash        text        NOT NULL,
  author_name      text,
  creation_method  text        NOT NULL,
  provenance       jsonb,
  status           text        NOT NULL DEFAULT 'draft',
  review_status    text        NOT NULL DEFAULT 'unreviewed',
  reviewed_by      text,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Seri bağı. Serili revision'lı seri silinemez. (passage/type/lang/translation seride yaşar.)
  CONSTRAINT aromatherapy_passage_editorial_notes_series_fk
    FOREIGN KEY (tenant_id, note_series_id)
    REFERENCES public.aromatherapy_passage_editorial_note_series (tenant_id, id)
    ON DELETE RESTRICT,

  -- 1) note_text boş/whitespace olamaz.
  CONSTRAINT aromatherapy_passage_editorial_notes_note_text_chk CHECK (
    btrim(note_text) <> ''
  ),

  -- 2) note_hash: tam 64 karakter lowercase SHA-256 hex.
  CONSTRAINT aromatherapy_passage_editorial_notes_note_hash_chk CHECK (
    note_hash ~ '^[0-9a-f]{64}$'
  ),

  -- 3) creation_method allowlist.
  CONSTRAINT aromatherapy_passage_editorial_notes_creation_method_chk CHECK (
    creation_method IN ('human', 'machine', 'machine_assisted', 'unknown')
  ),

  -- 4) provenance: değer varsa JSON object.
  CONSTRAINT aromatherapy_passage_editorial_notes_provenance_object_chk CHECK (
    provenance IS NULL OR jsonb_typeof(provenance) = 'object'
  ),

  -- 5) machine provenance coupling: machine/machine_assisted → provenance NOT NULL + boş obje değil.
  CONSTRAINT aromatherapy_passage_editorial_notes_machine_prov_chk CHECK (
    creation_method NOT IN ('machine', 'machine_assisted')
    OR (provenance IS NOT NULL AND provenance <> '{}'::jsonb)
  ),

  -- 6) author_name: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_passage_editorial_notes_author_name_chk CHECK (
    author_name IS NULL OR btrim(author_name) <> ''
  ),

  -- 7) status allowlist.
  CONSTRAINT aromatherapy_passage_editorial_notes_status_chk CHECK (
    status IN ('draft', 'verified', 'archived')
  ),

  -- 8) review_status allowlist.
  CONSTRAINT aromatherapy_passage_editorial_notes_review_status_chk CHECK (
    review_status IN ('unreviewed', 'in_review', 'approved', 'rejected')
  ),

  -- 9) verified coupling.
  CONSTRAINT aromatherapy_passage_editorial_notes_verified_coupling_chk CHECK (
    status <> 'verified' OR review_status = 'approved'
  ),

  -- 10) reviewed_by: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_passage_editorial_notes_reviewed_by_chk CHECK (
    reviewed_by IS NULL OR btrim(reviewed_by) <> ''
  ),

  -- 11) review metadata coupling.
  CONSTRAINT aromatherapy_passage_editorial_notes_review_meta_chk CHECK (
    (review_status = 'unreviewed'
      AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status = 'in_review'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NULL)
    OR (review_status IN ('approved', 'rejected')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),

  -- 12) revision pozitif.
  CONSTRAINT aromatherapy_passage_editorial_notes_revision_chk CHECK (
    revision > 0
  )
);

-- Revision aday anahtarı (proaktif; gelecek audit/child).
ALTER TABLE public.aromatherapy_passage_editorial_notes
  ADD CONSTRAINT aromatherapy_passage_editorial_notes_tenant_id_unique UNIQUE (tenant_id, id);

-- Seri içi revision tekil + seri geçmişi sorgusu (prefix) + seri-FK delete-check.
CREATE UNIQUE INDEX aromatherapy_passage_editorial_notes_series_revision_uidx
  ON public.aromatherapy_passage_editorial_notes (tenant_id, note_series_id, revision);

-- Kanonik verified: seri başına AYNI ANDA tek verified. Draft/archived serbest.
CREATE UNIQUE INDEX aromatherapy_passage_editorial_notes_verified_uidx
  ON public.aromatherapy_passage_editorial_notes (tenant_id, note_series_id)
  WHERE status = 'verified';

-- updated_at trigger — YALNIZ revision tablosunda; ortak public.set_updated_at() reuse.
CREATE TRIGGER trg_aromatherapy_passage_editorial_notes_updated_at
  BEFORE UPDATE ON public.aromatherapy_passage_editorial_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli.
ALTER TABLE public.aromatherapy_passage_editorial_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_passage_editorial_notes FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_passage_editorial_notes TO service_role;
