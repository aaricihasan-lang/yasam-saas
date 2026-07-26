-- ============================================================
-- 20260813000000_aromatherapy_chemical_families.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2Q
-- Chemical Family Canonical Registry — Kimyasal Aile Kanonik Kayıt Sistemi
-- Tablo: public.aromatherapy_chemical_families
--   (aromaterapi kimyasal aileleri için tenant/preparation/claim/component ve insan-dili
--    etiketlerden BAĞIMSIZ, GLOBAL ve değişmez kanonik sistem kimlikleri sağlayan düz registry)
--
-- TEK SORUMLULUK: yalnız vocabulary foundation. C2Q bu turda component/constituent tablosu,
--   preparation→component kompozisyonu, component→family veya claim→family ilişkisi, family
--   hierarchy, functional_group/chemical_class dimension'ı, source/provenance, label/synonym/
--   translation tablosu KURMAZ; seed/backfill YAPMAZ; preparations.chemotype'a DOKUNMAZ.
--
-- GLOBAL MODEL (BİLİNÇLİ): tablo GLOBAL canonical registry'dir → tenant_id YOKTUR. Bilimsel
--   kimyasal aile kimliği tenant'a göre çoğaltılmaz. Uzman/tenant overlay ve admin/API/writer
--   entegrasyonu bu fazın DIŞINDADIR (ileri faz). Yine de doğuştan-kilitli server-only model:
--   RLS enable + anon/authenticated/PUBLIC REVOKE + service_role REVOKE-sonra yalnız S/I/U/D GRANT
--   (GRANT ALL DEĞİL; TRUNCATE/REFERENCES/TRIGGER/MAINTAIN yok).
--
-- KİMLİK: code kanonik sistem anahtarıdır (lowercase snake_case; normalizasyon/lower/btrim-fix
--   YOK — yanlış kod sessizce düzeltilmez, reddedilir). Human-dili ad/synonym/former-name/çeviri
--   ileri ayrı label katmanının işidir; glossary/tag/category (C2M) domain truth DEĞİLDİR ve FK
--   ile yeniden kullanılmaz.
--
-- IMMUTABILITY / LIFECYCLE: id + code + created_at IMMUTABLE (identity guard, SQLSTATE 23514);
--   status MUTABLE (active/archived); updated_at ortak public.set_updated_at() ile yönetilir.
--   Yanlış kod = yeni doğru satır + eski satırı archived (code UPDATE YOK). archived kodun yeni
--   ilişkilere bağlanmaması ileride writer invariant'ıdır (bu fazda relation yok). İki user
--   trigger: identity guard (önce) + updated_at (sonra) — alfabetik sıra bunu garanti eder.
--
-- Deterministik ve fail-fast: yalnız düz ifadeler; IF (NOT) EXISTS / DROP / CREATE OR REPLACE /
--   ON CONFLICT / seed / backfill / extension YOK. public.set_updated_at() yalnız REUSE edilir
--   (yeniden tanımlanmaz). Mevcut tablolar (preparations/claims/claim_routes/claim_populations)
--   ALTER/UPDATE/trigger/FK ile DEĞİŞTİRİLMEZ; component/constituent tablosu OLUŞTURULMAZ.
-- ============================================================

BEGIN;

-- ── 1) Global düz registry (5 kolon; tenant_id YOK, FK YOK, hierarchy YOK) ────
CREATE TABLE public.aromatherapy_chemical_families (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        NOT NULL,
  status     text        NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- code kanonik sistem anahtarı: lowercase ASCII, tek underscore ayrımı, ilk karakter harf;
  -- leading/trailing/çift underscore ve tire yok. lower()/translate()/otomatik normalizasyon YOK.
  CONSTRAINT aromatherapy_chemical_families_code_chk CHECK (
    code = btrim(code)
    AND code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),

  -- status yaşam döngüsü: yalnız active/archived (deprecated/draft/deleted/unknown YOK).
  CONSTRAINT aromatherapy_chemical_families_status_chk CHECK (
    status IN ('active', 'archived')
  ),

  -- Global tekillik: code tüm sistemde tekil (tenant yok → tenant-scoped unique yok,
  -- (tenant_id, id) candidate key yok). Ayrı code index'i gereksiz (constraint index'i yeter).
  CONSTRAINT aromatherapy_chemical_families_code_key
    UNIQUE (code)
);

-- ── 2) Identity guard (fail-fast düz CREATE). id + code + created_at immutable; status mutable. ─
-- (no-op SET izinli; yanlış kod = yeni satır + eski satırı archived, code UPDATE değil.)
CREATE FUNCTION public.aromatherapy_chemical_families_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.code       IS DISTINCT FROM OLD.code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_chemical_families identity columns (id, code, created_at) are immutable; insert a new row and archive the old one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- İki user trigger. Alfabetik: identity_guard ÖNCE (kimlik kilidi), updated_at SONRA (zaman damgası).
CREATE TRIGGER trg_aromatherapy_chemical_families_identity_guard
  BEFORE UPDATE ON public.aromatherapy_chemical_families
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_chemical_families_identity_guard();

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (yeniden tanımlanmaz).
CREATE TRIGGER trg_aromatherapy_chemical_families_updated_at
  BEFORE UPDATE ON public.aromatherapy_chemical_families
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 3) Güvenlik: doğuştan-kilitli server-only. (Seed/backfill YOK → tablo boş kalır.) ─
ALTER TABLE public.aromatherapy_chemical_families ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_chemical_families FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_chemical_families FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_chemical_families TO service_role;

COMMIT;
