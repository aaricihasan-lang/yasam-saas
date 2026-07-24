-- ============================================================
-- 20260809000000_aromatherapy_claim_routes.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2N
-- Claim Route Canonical Model — İddia Uygulama Yolları Kanonik Modeli
-- Tablo: public.aromatherapy_claim_routes
--   (bir claim'in geçerli olduğu BİR veya BİRDEN ÇOK uygulama yolunu tenant-safe,
--    sabit-anahtarlı, tekrar-edilemez biçimde modelleyen SAF junction; payload yok)
--
-- TEK SORUMLULUK: yalnız bu junction tablo + tek-seferlik migration-anı backfill.
--   Route değerleri sabit sistem anahtarlarıdır (editöryal kayıt değil) → ayrı
--   public.aromatherapy_routes controlled-vocabulary/lookup tablosu KURULMAZ; değerler
--   text + CHECK ile taşınır (veri sözlüğü §16). Tag/category/label (C2M) modeliyle
--   karıştırılmaz; genel taxonomy/ontology engine kurulmaz.
--
-- GEÇİŞ OTORİTESİ (kalıcı doğruluk kaynağı sırası — DİKKAT):
--   * public.aromatherapy_claim_routes, C2N ile kurulan HEDEF kanonik çoklu-route
--     modelidir. Bu migration yalnız DB relation'ı + migration-anı backfill temelini kurar.
--   * Uygulama/API writer cutover BU MIGRATION'DA YAPILMAZ ve hiçbir sync trigger kurulmaz.
--   * Bu nedenle C2S/C2T writer cutover TAMAMLANANA KADAR operasyonel mevcut doğruluk
--     kaynağı public.aromatherapy_claims.route olarak KALIR; claim_routes bu geçiş
--     döneminde backfill edilmiş HEDEF ilişki modelidir.
--   * claims.route bu turda legacy compatibility alanına dönüşüm sürecine girmiştir fakat
--     bu migration onu DÜŞÜRMEZ / DEĞİŞTİRMEZ (DROP/ALTER/CHECK/nullable/trigger YOK).
--   * Yeni yazılar bu turda junction'a GEÇİRİLMEZ. Sürekli/iki-yönlü sync trigger YOKTUR.
--   * C2S/C2T writer cutover gerçekleşince operasyonel kanonik yazma noktası claim_routes olur.
--   * Migration sonrası backfill eşitliği bir MIGRATION-KAPANIŞ doğrulamasıdır; gelecekteki
--     writer cutover ve çoklu-route kayıtlar sonrasında aynı eşitlik kuralı geçerli OLMAYABİLİR.
--
-- Doğuştan-kilitli (RLS enable + anon/authenticated/PUBLIC REVOKE + service_role REVOKE-sonra
--   yalnız S/I/U/D GRANT — C2K/C2M dersi; GRANT ALL DEĞİL; TRUNCATE/REFERENCES/TRIGGER/MAINTAIN yok).
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor).
-- Çapraz-tenant bağını DB düzeyinde engellemek için kompozit yabancı anahtar
--   (tenant_id, claim_id) → aromatherapy_claims(tenant_id, id) ON DELETE CASCADE.
--   Parent aday anahtarı aromatherapy_claims_tenant_id_unique (tenant_id, id) C2E'de zaten
--   MEVCUTTUR; bu migration onu YENİDEN EKLEMEZ ve public.aromatherapy_claims'i DEĞİŞTİRMEZ.
-- Deterministik ve fail-fast: yalnız düz ifadeler; IF (NOT) EXISTS / DROP / CREATE OR REPLACE /
--   ON CONFLICT / seed / idempotent telafi / extension YOK. set_updated_at() KULLANILMAZ
--   (güncellenebilir alan yok → updated_at kolonu ve trigger'ı yok; tek user trigger = identity guard).
-- ============================================================

BEGIN;

-- ── 1) Saf junction tablo (5 kolon; payload yok) ─────────────────────────────
CREATE TABLE public.aromatherapy_claim_routes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  claim_id    uuid        NOT NULL,
  route_code  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- route_code sabit sistem anahtarıdır: C2D allowlist'i aynen; normalizasyon/lower/btrim yok.
  -- (NULL OR yok — route_code NOT NULL.)
  CONSTRAINT aromatherapy_claim_routes_route_code_chk CHECK (
    route_code IN ('oral', 'topical', 'inhalation', 'other', 'unknown')
  ),

  -- Doğal tekillik: aynı (claim, route) bağı tekrar edemez. Üç kolon da NOT NULL →
  -- NULLS NOT DISTINCT gereksiz. Claim→routes sorgusu (tenant_id, claim_id) prefix'iyle karşılanır.
  CONSTRAINT aromatherapy_claim_routes_natural_key
    UNIQUE (tenant_id, claim_id, route_code),

  -- Kompozit, tenant-güvenli claim bağı. Claim silinince route bağları da silinir (saf bağ).
  CONSTRAINT aromatherapy_claim_routes_claim_fk
    FOREIGN KEY (tenant_id, claim_id)
    REFERENCES public.aromatherapy_claims (tenant_id, id)
    ON DELETE CASCADE
);

-- ── 2) Reverse lookup: bir route_code'un tüm claim'leri (route→claims ters arama) ─
-- (claim→routes forward araması doğal UNIQUE'in (tenant_id, claim_id) prefix'iyle karşılanır.)
CREATE INDEX aromatherapy_claim_routes_reverse_idx
  ON public.aromatherapy_claim_routes (tenant_id, route_code);

-- ── 3) Identity guard (fail-fast düz CREATE). Tüm 5 kolon immutable; no-op SET izinli. ─
-- (append-only DEĞİL: aynı değeri SET eden UPDATE reddedilmez; yanlış bağ = DELETE + re-INSERT.)
CREATE FUNCTION public.aromatherapy_claim_routes_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
     OR NEW.claim_id   IS DISTINCT FROM OLD.claim_id
     OR NEW.route_code IS DISTINCT FROM OLD.route_code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_claim_routes identity columns are immutable; DELETE + re-INSERT to correct'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Junction'da yalnız 1 user trigger (identity guard). updated_at YOK (güncellenebilir alan yok).
CREATE TRIGGER trg_aromatherapy_claim_routes_identity_guard
  BEFORE UPDATE ON public.aromatherapy_claim_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_claim_routes_identity_guard();

-- ── 4) Backfill (tek-seferlik, tek-yönlü, migration-anı snapshot; sürekli sync DEĞİL) ─
-- Yeni tablo bu noktada boştur → çakışma imkânsız → ON CONFLICT yok. claims.route CHECK
-- garantisi tüm değerlerin allowlist içinde olmasını sağlar. claims.route tek-değerli
-- olduğundan her claim en çok bir satır üretir → natural key çakışamaz. claims üzerinde
-- HİÇBİR yazma (UPDATE/ALTER) yapılmaz; yalnız okunur. DISTINCT/lower/btrim yok; değer değişmez.
INSERT INTO public.aromatherapy_claim_routes (tenant_id, claim_id, route_code)
SELECT tenant_id, id, route
FROM   public.aromatherapy_claims
WHERE  route IS NOT NULL;

-- ── 5) Güvenlik: doğuştan-kilitli (backfill'den SONRA). ───────────────────────
ALTER TABLE public.aromatherapy_claim_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_routes FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_routes FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_claim_routes TO service_role;

COMMIT;
