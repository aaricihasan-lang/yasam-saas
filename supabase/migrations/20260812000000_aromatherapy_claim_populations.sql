-- ============================================================
-- 20260812000000_aromatherapy_claim_populations.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2P
-- Claim Population Applicability Model — Claim Popülasyon Uygulanabilirlik Modeli
-- Tablo: public.aromatherapy_claim_populations
--   (bir claim'in HANGİ popülasyon veya fizyolojik durum için geçerli olduğunu ve
--    kaynakta açıkça verilmişse yaş sınırını tenant-safe, sabit-anahtarlı,
--    tekrar-edilemez biçimde modelleyen junction; opsiyonel yaş payload'ı)
--
-- TEK SORUMLULUK: yalnız "kim için?" bağı. population_code sabit sistem anahtarıdır
--   (editöryal kayıt değil) → ayrı public.aromatherapy_populations controlled-vocabulary/
--   lookup tablosu KURULMAZ; değerler text + CHECK ile taşınır (veri sözlüğü §16). Display
--   adları DB'de tutulmaz (UI/i18n katmanı sorumlu). Tag/category/label (C2M), route (C2N) ve
--   chemical-family (C2Q) modelleriyle karıştırılmaz; genel taxonomy/ontology engine kurulmaz.
--
-- KAPSAM DIŞI (bu satıra EKLENMEZ): allowed/caution/contraindicated/effect/safety_level,
--   recommendation/conclusion/outcome, source/passage/evidence/confidence/verification,
--   editorial note. Güvenlik/kontrendikasyon anlamı claim'in kendi claim_type/outcome_type/
--   conclusion semantiğinde yaşar; C2P yalnız uygulanabilir popülasyonu bağlar.
--
-- Doğuştan-kilitli (RLS enable + anon/authenticated/PUBLIC REVOKE + service_role REVOKE-sonra
--   yalnız S/I/U/D GRANT — C2K/C2M/C2N dersi; GRANT ALL DEĞİL; TRUNCATE/REFERENCES/TRIGGER/MAINTAIN yok).
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor).
-- Çapraz-tenant bağını DB düzeyinde engellemek için kompozit yabancı anahtar
--   (tenant_id, claim_id) → aromatherapy_claims(tenant_id, id) ON DELETE CASCADE.
--   Parent aday anahtarı aromatherapy_claims_tenant_id_unique (tenant_id, id) C2E'de zaten
--   MEVCUTTUR; bu migration onu YENİDEN EKLEMEZ ve public.aromatherapy_claims'i DEĞİŞTİRMEZ.
-- Deterministik ve fail-fast: yalnız düz ifadeler; IF (NOT) EXISTS / DROP / CREATE OR REPLACE /
--   ON CONFLICT / seed / idempotent telafi / extension YOK. set_updated_at() KULLANILMAZ
--   (güncellenebilir alan yok → updated_at kolonu ve trigger'ı yok; tek user trigger = identity guard).
-- BACKFILL YOK: mevcut claims'te veya app katmanında kanonik population/age alanı yoktur;
--   conclusion text parse / regex / AI çıkarımı YAPILMAZ. Migration yalnız boş kanonik tabloyu kurar.
-- ============================================================

BEGIN;

-- ── 1) Junction tablo (7 kolon; opsiyonel yaş payload'ı) ─────────────────────
CREATE TABLE public.aromatherapy_claim_populations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  claim_id        uuid        NOT NULL,
  population_code text        NOT NULL,
  age_min         integer,
  age_max         integer,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- population_code sabit sistem anahtarıdır: kilitli allowlist; normalizasyon/lower/btrim yok.
  -- (NULL OR yok — population_code NOT NULL.) 'general'/'unknown'/'other' YOK: population satırı
  -- olmaması = genel/tüm popülasyonlar (belirsizlik claim/editorial/writer katmanının işidir).
  CONSTRAINT aromatherapy_claim_populations_population_code_chk CHECK (
    population_code IN (
      'infant', 'child', 'adolescent', 'adult', 'older_adult', 'pregnancy', 'lactation'
    )
  ),

  -- Yaş birimi: tamamlanmış yıl (age_unit kolonu YOK). age_min DAHİL alt sınır; age_max HARİÇ
  -- üst sınır. Min-only/max-only ve iki NULL izinli (named population için kaynakta eşik yoksa).
  CONSTRAINT aromatherapy_claim_populations_age_bounds_chk CHECK (
    (age_min IS NULL OR (age_min >= 0 AND age_min <= 120))
    AND
    (age_max IS NULL OR (age_max >= 1 AND age_max <= 120))
  ),

  -- İki sınır da mevcutsa alt sınır üst sınırdan KESİN küçük (age_max exclusive → age_min=age_max
  -- boş aralık üretir ve reddedilir). '<=' DEĞİL.
  CONSTRAINT aromatherapy_claim_populations_age_order_chk CHECK (
    age_min IS NULL
    OR age_max IS NULL
    OR age_min < age_max
  ),

  -- Doğal tekillik: aynı (claim, population_code) bağı tekrar edemez. Üç kolon da NOT NULL →
  -- NULLS NOT DISTINCT gereksiz. age natural key'e GİRMEZ (aynı population'a iki yaş aralığı
  -- yasak; yaş düzeltmesi = DELETE + INSERT). Claim→populations sorgusu (tenant_id, claim_id)
  -- prefix'iyle karşılanır.
  CONSTRAINT aromatherapy_claim_populations_natural_key
    UNIQUE (tenant_id, claim_id, population_code),

  -- Kompozit, tenant-güvenli claim bağı. Claim silinince population bağları da silinir (saf bağ).
  CONSTRAINT aromatherapy_claim_populations_claim_fk
    FOREIGN KEY (tenant_id, claim_id)
    REFERENCES public.aromatherapy_claims (tenant_id, id)
    ON DELETE CASCADE
);

-- ── 2) Reverse lookup: bir population_code'un tüm claim'leri (population→claims ters arama) ─
-- (claim→populations forward araması doğal UNIQUE'in (tenant_id, claim_id) prefix'iyle karşılanır.)
CREATE INDEX aromatherapy_claim_populations_reverse_idx
  ON public.aromatherapy_claim_populations (tenant_id, population_code);

-- ── 3) Identity guard (fail-fast düz CREATE). Tüm 7 kolon immutable; no-op SET izinli. ─
-- (append-only DEĞİL: aynı değeri SET eden UPDATE reddedilmez; yanlış bağ/yaş = DELETE + re-INSERT.)
CREATE FUNCTION public.aromatherapy_claim_populations_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id              IS DISTINCT FROM OLD.id
     OR NEW.tenant_id       IS DISTINCT FROM OLD.tenant_id
     OR NEW.claim_id        IS DISTINCT FROM OLD.claim_id
     OR NEW.population_code IS DISTINCT FROM OLD.population_code
     OR NEW.age_min         IS DISTINCT FROM OLD.age_min
     OR NEW.age_max         IS DISTINCT FROM OLD.age_max
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_claim_populations identity columns are immutable; DELETE + re-INSERT to correct'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Junction'da yalnız 1 user trigger (identity guard). updated_at YOK (güncellenebilir alan yok).
CREATE TRIGGER trg_aromatherapy_claim_populations_identity_guard
  BEFORE UPDATE ON public.aromatherapy_claim_populations
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_claim_populations_identity_guard();

-- ── 4) Güvenlik: doğuştan-kilitli. (Backfill YOK → tablo boş kalır.) ──────────
ALTER TABLE public.aromatherapy_claim_populations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_populations FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_populations FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_claim_populations TO service_role;

COMMIT;
