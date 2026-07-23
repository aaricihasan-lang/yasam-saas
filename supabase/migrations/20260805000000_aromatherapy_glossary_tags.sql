-- ============================================================
-- 20260805000000_aromatherapy_glossary_tags.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2M-B
-- İKİ TABLO:
--   1) public.aromatherapy_glossary_tags        (tenant-scoped kontrollü DÜZ tag sözlüğü)
--   2) public.aromatherapy_glossary_term_tags   (glossary term ↔ controlled tag M:N junction)
--
-- TEK SORUMLULUK: glossary kavramlarını kontrollü, tekrar kullanılabilir, tenant-safe
--   etiketlerle FİLTRELEME/KEŞİF. Tag = düz kontrollü filtreleme anahtarı; hiyerarşisiz;
--   birden çok terimde tekrar kullanılabilir; bir terime birden çok tag bağlanabilir.
--
-- TAG DEĞİLDİR (bilinçle KAPSAM DIŞI): kategori (C2M-A), synonym/abbreviation/spelling-variant/
--   former-name (C2M-C), evidence_layer (claims'te), route/population/chemical-family kanonik
--   modeli (C2N/C2P/C2Q), genel facet/taxonomy node, kaynak kanıtı, UI ayarı. Bu tabloda YOKTUR:
--   parent_tag_id, tag hierarchy, tag synonym/alias, slug, canonical_key, tag_type/facet_type,
--   icon, color, sort_order, verification metadata, revision/series.
--
-- DOMAIN-ALANI ↔ TAG SINIRI: aynı ifade bir domain alanında (ör. claims.route='inhalation')
--   ve bir tag adında ('inhalasyon') bulunabilir; ancak TAG yapısal domain alanının KANONİK
--   DOĞRULUK KAYNAĞI DEĞİLDİR — yalnız keşif/arama yardımcısıdır. Bu migration domain
--   alanlarından tag TÜRETMEZ; otomatik senkronizasyon / backfill / seed YOKTUR.
--
-- DÜZ SÖZLÜK / TEKİLLİK: tag hiyerarşisi olmadığından kardeş kapsamı yoktur. Aynı tenant
--   içinde NORMALIZE edilmiş name_tr GLOBAL TEKİLDİR (expression UNIQUE index; NULLS NOT
--   DISTINCT GEREKSİZ — tenant_id ve name_tr NOT NULL, anahtarda NULL yok). Normalizasyon
--   glossary_terms (C2G) / glossary_categories (C2M-A) deseniyle BİREBİR aynı (btrim + \s+→' '
--   + Türkçe İ/I/Ş/Ğ/Ç/Ö/Ü case-fold + lower; tümü IMMUTABLE bileşen). name_en yalnız gösterim
--   alanıdır; UNIQUE DEĞİLDİR.
--
-- IDENTITY IMMUTABILITY:
--   tags:     (id, tenant_id, created_at) immutable; name/status DÜZELTİLEBİLİR.
--   junction: (id, tenant_id, glossary_term_id, tag_id, created_at) immutable → saf bağ;
--             yanlış bağ = DELETE + yeni INSERT. No-op identity SET İZİNLİDİR (append-only DEĞİL).
--   Her ikisi BEFORE UPDATE trigger + IS DISTINCT FROM guard + SQLSTATE 23514.
--
-- LIFECYCLE INVARIANT: status active/archived. Archived tag SİLİNMEZ; archived olunca mevcut
--   term-tag bağları OTOMATİK SİLİNMEZ (cascade yok). Archived tag'a yeni bağ kurulması BU
--   MIGRATION'DA trigger ile ENGELLENMEZ → gelecekteki C2S/C2T writer invariant'ıdır. Tag FK
--   RESTRICT yalnız BAĞLI tag'ın fiziksel silinmesini engeller; unlinked tag serbestçe silinir
--   (ek silme-engel trigger'ı YOK).
--
-- Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE + service_role REVOKE-sonra
--   yalnız S/I/U/D GRANT — C2K/C2M-A production dersi baştan; GRANT ALL DEĞİL; TRUNCATE/
--   REFERENCES/TRIGGER/MAINTAIN yok). Tenant-scoped (tenant tablosuna FK yok — proje standardı).
--   Deterministik/fail-fast: düz ifadeler; IF (NOT) EXISTS / DROP / CREATE OR REPLACE /
--   ALTER DEFAULT PRIVILEGES / seed / backfill / idempotent telafi YOK. set_updated_at() yalnız
--   reuse. Glossary term FK hedefi (tenant_id, id) [C2K] zaten mevcut; parent glossary_terms
--   DEĞİŞTİRİLMEZ. Yeni parent aday anahtarı yalnız yeni tags tablosunun kendisine eklenir.
-- ============================================================

BEGIN;

-- ── TABLO 1: glossary_tags (8 kolon; düz kontrollü sözlük) ────────────────────
CREATE TABLE public.aromatherapy_glossary_tags (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  name_tr         text        NOT NULL,
  name_en         text,
  description_tr  text,
  status          text        NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- CHECK 1) name_tr kimliktir: boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_tags_name_tr_chk CHECK (
    btrim(name_tr) <> ''
  ),
  -- CHECK 2) name_en opsiyonel; değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_tags_name_en_chk CHECK (
    name_en IS NULL OR btrim(name_en) <> ''
  ),
  -- CHECK 3) description_tr opsiyonel; değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_tags_description_tr_chk CHECK (
    description_tr IS NULL OR btrim(description_tr) <> ''
  ),
  -- CHECK 4) status allowlist.
  CONSTRAINT aromatherapy_glossary_tags_status_chk CHECK (
    status IN ('active', 'archived')
  )
);

-- Aday anahtar — junction FK hedefi (additif; kendi tablosuna).
ALTER TABLE public.aromatherapy_glossary_tags
  ADD CONSTRAINT aromatherapy_glossary_tags_tenant_id_unique UNIQUE (tenant_id, id);

-- Normalized GLOBAL (tenant içi) UNIQUE: düz sözlük → kardeş kapsamı yok. NULLS NOT DISTINCT
-- GEREKSİZ (anahtarda NULL yok). Normalizasyon glossary_terms/glossary_categories ile birebir.
CREATE UNIQUE INDEX aromatherapy_glossary_tags_name_tr_uidx
  ON public.aromatherapy_glossary_tags (
    tenant_id,
    lower(translate(regexp_replace(btrim(name_tr), '\s+', ' ', 'g'), 'İIŞĞÇÖÜ', 'iışğçöü'))
  );

-- Identity guard (fail-fast CREATE). (id, tenant_id, created_at) immutable; no-op SET izinli.
CREATE FUNCTION public.aromatherapy_glossary_tags_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_glossary_tags id/tenant_id/created_at are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger sırası: identity_guard < updated_at (alfabetik) → guard önce çalışır.
CREATE TRIGGER trg_aromatherapy_glossary_tags_identity_guard
  BEFORE UPDATE ON public.aromatherapy_glossary_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_glossary_tags_identity_guard();

CREATE TRIGGER trg_aromatherapy_glossary_tags_updated_at
  BEFORE UPDATE ON public.aromatherapy_glossary_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli.
ALTER TABLE public.aromatherapy_glossary_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_tags FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_tags FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_glossary_tags TO service_role;


-- ── TABLO 2: glossary_term_tags (5 kolon; saf M:N bağ) ────────────────────────
CREATE TABLE public.aromatherapy_glossary_term_tags (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  glossary_term_id  uuid        NOT NULL,
  tag_id            uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Doğal tekillik: aynı (term, tag) bağı tekrar edemez.
  CONSTRAINT aromatherapy_glossary_term_tags_natural_key
    UNIQUE (tenant_id, glossary_term_id, tag_id),

  -- Term bağı (tenant-safe). Term silinince ona ait tag bağları da silinir.
  CONSTRAINT aromatherapy_glossary_term_tags_term_fk
    FOREIGN KEY (tenant_id, glossary_term_id)
    REFERENCES public.aromatherapy_glossary_terms (tenant_id, id)
    ON DELETE CASCADE,

  -- Tag bağı (tenant-safe). Bağlı tag (kontrollü sözlük) silinemez.
  CONSTRAINT aromatherapy_glossary_term_tags_tag_fk
    FOREIGN KEY (tenant_id, tag_id)
    REFERENCES public.aromatherapy_glossary_tags (tenant_id, id)
    ON DELETE RESTRICT
);

-- Reverse lookup: bir tag'ın tüm terimleri + tag-FK delete-check prefix.
-- (term→tags doğal UNIQUE'in (tenant_id, glossary_term_id) prefix'iyle karşılanır.)
CREATE INDEX aromatherapy_glossary_term_tags_reverse_idx
  ON public.aromatherapy_glossary_term_tags (tenant_id, tag_id);

-- Identity guard (fail-fast CREATE). Tüm kimlik kolonları immutable; no-op SET izinli.
-- (append-only DEĞİL: aynı değeri SET eden UPDATE reddedilmez.)
CREATE FUNCTION public.aromatherapy_glossary_term_tags_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id              IS DISTINCT FROM OLD.id
     OR NEW.tenant_id        IS DISTINCT FROM OLD.tenant_id
     OR NEW.glossary_term_id IS DISTINCT FROM OLD.glossary_term_id
     OR NEW.tag_id           IS DISTINCT FROM OLD.tag_id
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_glossary_term_tags identity columns are immutable; DELETE + re-INSERT to correct'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Junction'da yalnız 1 user trigger (identity guard). updated_at YOK (güncellenebilir alan yok).
CREATE TRIGGER trg_aromatherapy_glossary_term_tags_identity_guard
  BEFORE UPDATE ON public.aromatherapy_glossary_term_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_glossary_term_tags_identity_guard();

-- Güvenlik: doğuştan-kilitli.
ALTER TABLE public.aromatherapy_glossary_term_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_tags FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_tags FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_glossary_term_tags TO service_role;

COMMIT;
