-- ============================================================
-- 20260804000000_aromatherapy_glossary_categories.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2M-A
-- İKİ TABLO:
--   1) public.aromatherapy_glossary_categories        (sığ hiyerarşik kontrollü kategori sözlüğü)
--   2) public.aromatherapy_glossary_term_categories   (glossary term ↔ category M:N junction)
--
-- TEK SORUMLULUK: glossary kavramlarını tenant-safe, kontrollü, sığ-hiyerarşik NAVİGASYON/
--   ANA-KONU kategorileri altında sınıflandırmak. Kategori = navigasyon + ana konu; hiyerarşik
--   olabilir; bir terim birden çok kategoriye bağlanabilir.
--
-- KATEGORİ DEĞİLDİR (bilinçle KAPSAM DIŞI): tag (C2M-B), synonym/abbreviation/variant (C2M-C),
--   evidence_layer (claims'te), entity type, genel facet/dimension, source evidence,
--   UI icon/color/sort. Bu tabloda YOKTUR: slug, canonical_key, icon, color, sort_order,
--   verification metadata, revision/series. Tag/label tabloları BU MIGRATION'DA OLUŞTURULMAZ.
--
-- HİYERARŞİ (adjacency list): parent_category_id self-referans. Tenant-safe kompozit self-FK
--   (tenant_id, parent_category_id) → (tenant_id, id) çapraz-tenant parent'ı engeller. Self-loop
--   (1-cycle) DB CHECK ile kapatılır. ÇOK-DÜĞÜMLÜ CYCLE (A→B→A) BU MIGRATION'DA trigger ile
--   ZORLANMAZ → gelecekteki C2S/C2T writer/admin invariant'ıdır. Uygulama katmanı ayrıca:
--   archived kategori yeni parent seçilemez · archived kategoriye yeni term link kurulamaz ·
--   mevcut link'ler kategori archived olunca otomatik SİLİNMEZ.
--
-- SIBLING NORMALIZED UNIQUE: kategori adı tenant GENELİNDE global tekil DEĞİLDİR; aynı normalize
--   ad farklı parent dallarında serbesttir. Aynı tenant + aynı parent altında normalize name_tr
--   tekildir. NULLS NOT DISTINCT → root kategoriler de (parent NULL) kardeş bazında tekil.
--   Normalizasyon glossary_terms (C2G) deseniyle BİREBİR aynı (btrim + \s+→' ' + Türkçe
--   İ/I/Ş/Ğ/Ç/Ö/Ü case-fold + lower; tümü IMMUTABLE bileşen).
--
-- IDENTITY IMMUTABILITY:
--   categories: (id, tenant_id, created_at) immutable; parent/name/status DÜZELTİLEBİLİR/TAŞINABİLİR.
--   junction:   (id, tenant_id, glossary_term_id, category_id, created_at) immutable → saf bağ;
--               yanlış bağ = DELETE + yeni INSERT. No-op identity SET İZİNLİDİR (append-only DEĞİL).
--   Her ikisi BEFORE UPDATE trigger + IS DISTINCT FROM guard + SQLSTATE 23514.
--
-- Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE + service_role REVOKE-sonra
--   yalnız S/I/U/D GRANT — C2K production dersi baştan; GRANT ALL DEĞİL; TRUNCATE/REFERENCES/
--   TRIGGER/MAINTAIN yok). Tenant-scoped (tenant tablosuna FK yok — proje standardı).
--   Deterministik/fail-fast: düz ifadeler; IF (NOT) EXISTS / DROP / CREATE OR REPLACE /
--   ALTER DEFAULT PRIVILEGES / seed / idempotent telafi YOK. set_updated_at() yalnız reuse.
--   Glossary term FK hedefi (tenant_id, id) [C2K] zaten mevcut; parent glossary_terms
--   DEĞİŞTİRİLMEZ. Yeni parent aday anahtarı yalnız yeni categories tablosunun kendisine eklenir.
-- ============================================================

BEGIN;

-- ── TABLO 1: glossary_categories (9 kolon) ───────────────────────────────────
CREATE TABLE public.aromatherapy_glossary_categories (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  parent_category_id  uuid,
  name_tr             text        NOT NULL,
  name_en             text,
  description_tr      text,
  status              text        NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- CHECK 1) name_tr kimliktir: boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_categories_name_tr_chk CHECK (
    btrim(name_tr) <> ''
  ),
  -- CHECK 2) name_en opsiyonel; değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_categories_name_en_chk CHECK (
    name_en IS NULL OR btrim(name_en) <> ''
  ),
  -- CHECK 3) description_tr opsiyonel; değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_categories_description_tr_chk CHECK (
    description_tr IS NULL OR btrim(description_tr) <> ''
  ),
  -- CHECK 4) status allowlist.
  CONSTRAINT aromatherapy_glossary_categories_status_chk CHECK (
    status IN ('active', 'archived')
  ),
  -- CHECK 5) self-parent (1-cycle) yasağı.
  CONSTRAINT aromatherapy_glossary_categories_not_self_parent_chk CHECK (
    parent_category_id IS NULL OR parent_category_id <> id
  )
);

-- Aday anahtar — self-FK + junction FK hedefi (additif; kendi tablosuna).
ALTER TABLE public.aromatherapy_glossary_categories
  ADD CONSTRAINT aromatherapy_glossary_categories_tenant_id_unique UNIQUE (tenant_id, id);

-- Self parent FK — tenant-güvenli (çapraz-tenant parent engellenir). MATCH SIMPLE:
-- parent_category_id NULL iken FK kontrolü atlanır. Aday anahtardan SONRA eklenir.
ALTER TABLE public.aromatherapy_glossary_categories
  ADD CONSTRAINT aromatherapy_glossary_categories_parent_fk
  FOREIGN KEY (tenant_id, parent_category_id)
  REFERENCES public.aromatherapy_glossary_categories (tenant_id, id)
  ON DELETE RESTRICT;

-- Sibling normalized UNIQUE: (tenant_id, parent_category_id, normalized name_tr).
-- NULLS NOT DISTINCT → root (parent NULL) kardeşleri de tekil. Prefix (tenant_id,
-- parent_category_id) children lookup + parent-FK delete-check'i karşılar (ayrı children
-- index EKLENMEZ). Normalizasyon glossary_terms deseniyle birebir (tümü IMMUTABLE).
CREATE UNIQUE INDEX aromatherapy_glossary_categories_sibling_name_uidx
  ON public.aromatherapy_glossary_categories (
    tenant_id,
    parent_category_id,
    lower(translate(regexp_replace(btrim(name_tr), '\s+', ' ', 'g'), 'İIŞĞÇÖÜ', 'iışğçöü'))
  ) NULLS NOT DISTINCT;

-- Identity guard (fail-fast CREATE). (id, tenant_id, created_at) immutable; no-op SET izinli.
CREATE FUNCTION public.aromatherapy_glossary_categories_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_glossary_categories id/tenant_id/created_at are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger sırası: identity_guard < updated_at (alfabetik) → guard önce çalışır.
CREATE TRIGGER trg_aromatherapy_glossary_categories_identity_guard
  BEFORE UPDATE ON public.aromatherapy_glossary_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_glossary_categories_identity_guard();

CREATE TRIGGER trg_aromatherapy_glossary_categories_updated_at
  BEFORE UPDATE ON public.aromatherapy_glossary_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli.
ALTER TABLE public.aromatherapy_glossary_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_categories FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_categories FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_glossary_categories TO service_role;


-- ── TABLO 2: glossary_term_categories (5 kolon; saf M:N bağ) ──────────────────
CREATE TABLE public.aromatherapy_glossary_term_categories (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  glossary_term_id  uuid        NOT NULL,
  category_id       uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Doğal tekillik: aynı (term, category) bağı tekrar edemez.
  CONSTRAINT aromatherapy_glossary_term_categories_natural_key
    UNIQUE (tenant_id, glossary_term_id, category_id),

  -- Term bağı (tenant-safe). Term silinince ona ait kategori bağları da silinir.
  CONSTRAINT aromatherapy_glossary_term_categories_term_fk
    FOREIGN KEY (tenant_id, glossary_term_id)
    REFERENCES public.aromatherapy_glossary_terms (tenant_id, id)
    ON DELETE CASCADE,

  -- Category bağı (tenant-safe). Bağlı kategori (kontrollü sözlük) silinemez.
  CONSTRAINT aromatherapy_glossary_term_categories_category_fk
    FOREIGN KEY (tenant_id, category_id)
    REFERENCES public.aromatherapy_glossary_categories (tenant_id, id)
    ON DELETE RESTRICT
);

-- Reverse lookup: bir kategorinin tüm terimleri + category-FK delete-check prefix.
-- (term→categories doğal UNIQUE'in (tenant_id, glossary_term_id) prefix'iyle karşılanır.)
CREATE INDEX aromatherapy_glossary_term_categories_reverse_idx
  ON public.aromatherapy_glossary_term_categories (tenant_id, category_id);

-- Identity guard (fail-fast CREATE). Tüm kimlik kolonları immutable; no-op SET izinli.
-- (append-only DEĞİL: aynı değeri SET eden UPDATE reddedilmez.)
CREATE FUNCTION public.aromatherapy_glossary_term_categories_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id              IS DISTINCT FROM OLD.id
     OR NEW.tenant_id        IS DISTINCT FROM OLD.tenant_id
     OR NEW.glossary_term_id IS DISTINCT FROM OLD.glossary_term_id
     OR NEW.category_id      IS DISTINCT FROM OLD.category_id
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_glossary_term_categories identity columns are immutable; DELETE + re-INSERT to correct'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Junction'da yalnız 1 user trigger (identity guard). updated_at YOK (güncellenebilir alan yok).
CREATE TRIGGER trg_aromatherapy_glossary_term_categories_identity_guard
  BEFORE UPDATE ON public.aromatherapy_glossary_term_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_glossary_term_categories_identity_guard();

-- Güvenlik: doğuştan-kilitli.
ALTER TABLE public.aromatherapy_glossary_term_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_categories FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_categories FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_glossary_term_categories TO service_role;

COMMIT;
