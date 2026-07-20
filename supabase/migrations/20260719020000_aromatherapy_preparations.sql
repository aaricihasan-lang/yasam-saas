-- ============================================================
-- 20260719020000_aromatherapy_preparations.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2C
-- Tablo: public.aromatherapy_preparations (bir bitki taksonundan elde edilen
--   preparasyon çekirdeği; yalnız tek taksona bağlı)
--
-- Tek sorumluluk: yalnız bu tablo (+ parent aday anahtarı).
-- Doğuştan-kilitli (satır güvenliği açık + anon/authenticated/PUBLIC REVOKE + service_role GRANT).
-- Tenant-scoped: tenant_id uuid NOT NULL. Çapraz-tenant bağını DB düzeyinde engellemek için
--   kompozit yabancı anahtar (tenant_id, taxon_id) → aromatherapy_plant_taxa(tenant_id, id);
--   bu nedenle parent tabloya additif UNIQUE (tenant_id, id) aday anahtarı eklenir.
-- Deterministik ve fail-fast: yalnız düz ekleme/oluşturma ifadeleri; idempotent-atlama yok
--   (aynı isimli nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
-- ============================================================

-- 1) Parent aday anahtarı — kompozit yabancı anahtarın hedefi (additif; C2B tablosu).
ALTER TABLE public.aromatherapy_plant_taxa
  ADD CONSTRAINT aromatherapy_plant_taxa_tenant_id_unique UNIQUE (tenant_id, id);

-- 2) Preparation çekirdek tablosu.
CREATE TABLE public.aromatherapy_preparations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  taxon_id          uuid        NOT NULL,
  preparation_type  text        NOT NULL,
  plant_part        text        NOT NULL,
  chemotype         text,
  status            text        NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aromatherapy_preparations_taxon_fk
    FOREIGN KEY (tenant_id, taxon_id)
    REFERENCES public.aromatherapy_plant_taxa (tenant_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT aromatherapy_preparations_preparation_type_chk CHECK (
    preparation_type IN (
      'essential_oil',
      'hydrosol',
      'dried_plant_material',
      'tincture',
      'infusion',
      'decoction',
      'extract',
      'infused_oil',
      'absolute',
      'concrete',
      'resinoid',
      'oleoresin',
      'fixed_oil',
      'powder',
      'other'
    )
  ),
  CONSTRAINT aromatherapy_preparations_plant_part_chk CHECK (
    plant_part ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT aromatherapy_preparations_chemotype_chk CHECK (
    chemotype IS NULL OR (chemotype = btrim(chemotype) AND chemotype <> '')
  ),
  CONSTRAINT aromatherapy_preparations_status_chk CHECK (
    status IN ('draft', 'verified', 'approved')
  ),

  -- Tenant içi doğal kimlik. NULLS NOT DISTINCT: aynı tenant/taxon/type/part için
  -- iki adet chemotype=NULL kaydı da engellenir; farklı kemotipler ayrı kayıt olabilir.
  CONSTRAINT aromatherapy_preparations_identity_key
    UNIQUE NULLS NOT DISTINCT (tenant_id, taxon_id, preparation_type, plant_part, chemotype)
);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tek kullanıcı trigger'ı).
CREATE TRIGGER trg_aromatherapy_preparations_updated_at
  BEFORE UPDATE ON public.aromatherapy_preparations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_preparations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_preparations FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_preparations TO service_role;
