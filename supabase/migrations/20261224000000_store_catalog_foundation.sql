-- ============================================================
-- 20261224000000_store_catalog_foundation.sql
--
-- YAŞAM SİSTEMİ — Platform Mağazası V1 (tek satıcılı ticari katalog şema temeli)
--
-- YAŞAM SİSTEMİ DOĞAL PAZAR — doğal/bütüncül yaşam ürünleri vitrini.
--
-- KAPSAM (tek transaction, fail-fast; IF NOT EXISTS / sessiz DO YOK):
--   1. store_categories       — mağaza kategorileri (platform sahipli).
--   2. store_products         — ticari ürün kataloğu (platform sahipli).
--   3. store_product_images   — ürün görselleri (file_path referansı).
--   4. store_settings         — mağaza tekil ayarı (WhatsApp numarası + aktif/pasif).
--   5. store-product-images   — public storefront görsel bucket'ı (server-yetkili yükleme).
--
-- SATIŞ MODELİ (V1): uygulama içi sepet/checkout/ödeme YOK. Ana dönüşüm kanalı
-- WhatsApp click-to-chat ("WhatsApp'tan Bilgi Al"). Numara store_settings'te tutulur
-- (component'e hard-code EDİLMEZ); feature kapalı/numarasız iken CTA gösterilmez.
--
-- MİMARİ KARAR:
--   * Bu tablo PLATFORM SAHİPLİDİR (tek satıcı = Yaşam Sistemi). tenant_id YOKTUR —
--     bu Ürün & Stok modülünün tenant-scoped operasyonel envanterinden AYRI bir
--     müşteriye-dönük ticari katalogdur. Ürün & Stok tablolarına DOKUNULMAZ.
--   * RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE + service_role GRANT.
--     Tüm okuma/yazma admin-gate'li (owner-only) service_role API route'larından geçer.
--     Storefront okuması da service_role server component'inden yalnız status='active'
--     satırları döndürür — draft/archived DB dışına SIZMAZ.
--   * enum'lar text + CHECK(... IN (...)); PG ENUM tipi KULLANILMAZ.
--   * Ortak public.set_updated_at() yalnız REUSE edilir (yeniden tanımlanmaz).
--
-- GELECEĞE AÇIKLIK (YAGNI korunur — vendor UI/API/permission/komisyon YOK):
--   * store_products.owner_user_id (nullable) düşük-maliyetli bir sahiplik primitive'idir.
--     V1'de HER ÜRÜN owner_user_id = NULL (platform sahipli). Gelecekte uzman/vendor
--     ürünleri geldiğinde bu kolon set edilerek tablo yıkılmadan genişletilebilir.
--     Bu turda bu kolon üzerine HİÇBİR mantık kurulmaz.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) store_categories — mağaza kategorileri.
-- ------------------------------------------------------------
CREATE TABLE public.store_categories (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  slug         text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT store_categories_pkey PRIMARY KEY (id),

  CONSTRAINT store_categories_name_chk CHECK (
    btrim(name) <> '' AND char_length(name) <= 200
  ),
  CONSTRAINT store_categories_slug_chk CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 200
  ),
  CONSTRAINT store_categories_description_chk CHECK (
    char_length(description) <= 2000
  ),
  CONSTRAINT store_categories_slug_unique UNIQUE (slug)
);

CREATE INDEX store_categories_active_sort_idx
  ON public.store_categories (is_active, sort_order, name);

CREATE TRIGGER trg_store_categories_updated_at
  BEFORE UPDATE ON public.store_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.store_categories FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.store_categories FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_categories TO service_role;

-- ------------------------------------------------------------
-- 2) store_products — ticari ürün kataloğu.
--    Para: numeric(12,2) (float DEĞİL). Enum'lar text + CHECK.
--    sku: NULL semantiği (boş string duplicate problemi yok) + partial unique.
-- ------------------------------------------------------------
CREATE TABLE public.store_products (
  id                   uuid           NOT NULL DEFAULT gen_random_uuid(),
  category_id          uuid,
  owner_user_id        uuid,                                  -- V1: her zaman NULL (platform). Gelecek vendor primitive'i.
  name                 text           NOT NULL,
  slug                 text           NOT NULL,
  short_description    text           NOT NULL DEFAULT '',
  description          text           NOT NULL DEFAULT '',
  product_type         text           NOT NULL,
  sku                  text,
  price                numeric(12, 2) NOT NULL DEFAULT 0,
  compare_at_price     numeric(12, 2),
  currency             text           NOT NULL DEFAULT 'TRY',
  vat_rate             numeric(5, 2)  NOT NULL DEFAULT 0,
  track_inventory      boolean        NOT NULL DEFAULT false,
  stock_quantity       integer        NOT NULL DEFAULT 0,
  low_stock_threshold  integer        NOT NULL DEFAULT 0,
  status               text           NOT NULL DEFAULT 'draft',
  is_featured          boolean        NOT NULL DEFAULT false,
  is_new               boolean        NOT NULL DEFAULT false,
  sort_order           integer        NOT NULL DEFAULT 0,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT store_products_pkey PRIMARY KEY (id),

  CONSTRAINT store_products_name_chk CHECK (
    btrim(name) <> '' AND char_length(name) <= 300
  ),
  CONSTRAINT store_products_slug_chk CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 300
  ),
  CONSTRAINT store_products_short_description_chk CHECK (
    char_length(short_description) <= 600
  ),
  CONSTRAINT store_products_description_chk CHECK (
    char_length(description) <= 20000
  ),
  CONSTRAINT store_products_type_chk CHECK (
    product_type IN ('physical', 'digital', 'service')
  ),
  CONSTRAINT store_products_sku_chk CHECK (
    sku IS NULL OR (btrim(sku) <> '' AND char_length(sku) <= 100)
  ),
  CONSTRAINT store_products_price_chk CHECK (price >= 0),
  CONSTRAINT store_products_compare_price_chk CHECK (
    compare_at_price IS NULL OR compare_at_price >= 0
  ),
  CONSTRAINT store_products_currency_chk CHECK (
    currency ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT store_products_vat_rate_chk CHECK (
    vat_rate >= 0 AND vat_rate <= 100
  ),
  CONSTRAINT store_products_stock_chk CHECK (stock_quantity >= 0),
  CONSTRAINT store_products_low_stock_chk CHECK (low_stock_threshold >= 0),
  CONSTRAINT store_products_status_chk CHECK (
    status IN ('draft', 'active', 'archived')
  ),

  CONSTRAINT store_products_slug_unique UNIQUE (slug),

  CONSTRAINT store_products_category_fk
    FOREIGN KEY (category_id)
    REFERENCES public.store_categories (id)
    ON DELETE SET NULL
);

-- SKU benzersizliği yalnız NULL-olmayan değerlerde (boş/atlanmış SKU duplicate sayılmaz).
CREATE UNIQUE INDEX store_products_sku_uidx
  ON public.store_products (sku)
  WHERE sku IS NOT NULL;

CREATE INDEX store_products_status_sort_idx
  ON public.store_products (status, sort_order, created_at DESC);
CREATE INDEX store_products_category_idx
  ON public.store_products (category_id);
CREATE INDEX store_products_featured_idx
  ON public.store_products (is_featured)
  WHERE is_featured = true;

CREATE TRIGGER trg_store_products_updated_at
  BEFORE UPDATE ON public.store_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.store_products FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.store_products FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_products TO service_role;

-- ------------------------------------------------------------
-- 3) store_product_images — ürün görselleri (bucket file_path referansı).
--    Ürün silinirse CASCADE ile satırlar gider; storage objesi temizliği
--    uygulama katmanında (image DELETE route + arşivleme akışı) yapılır.
-- ------------------------------------------------------------
CREATE TABLE public.store_product_images (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  product_id   uuid        NOT NULL,
  file_path    text        NOT NULL,
  alt_text     text        NOT NULL DEFAULT '',
  is_primary   boolean     NOT NULL DEFAULT false,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT store_product_images_pkey PRIMARY KEY (id),

  CONSTRAINT store_product_images_file_path_chk CHECK (
    btrim(file_path) <> '' AND char_length(file_path) <= 500
  ),
  CONSTRAINT store_product_images_alt_chk CHECK (
    char_length(alt_text) <= 300
  ),

  CONSTRAINT store_product_images_product_fk
    FOREIGN KEY (product_id)
    REFERENCES public.store_products (id)
    ON DELETE CASCADE
);

CREATE INDEX store_product_images_product_idx
  ON public.store_product_images (product_id, sort_order, created_at);

-- Ürün başına EN FAZLA bir ana görsel.
CREATE UNIQUE INDEX store_product_images_primary_uidx
  ON public.store_product_images (product_id)
  WHERE is_primary = true;

ALTER TABLE public.store_product_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.store_product_images FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.store_product_images FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_product_images TO service_role;

-- ------------------------------------------------------------
-- 4) store_settings — mağaza tekil ayar satırı (singleton).
--    id boolean = true + CHECK → en fazla BİR satır (klasik singleton deseni).
--    whatsapp_number: yalnız rakam, E.164 gövdesi (ülke kodu dahil, + ve ayraç YOK),
--    8..15 hane; NULL geçerli (numara girilmemiş). whatsapp_enabled kapalıyken CTA yok.
--    Varsayılan satır burada oluşturulur (boş/pasif) — gerçek numara admin'de girilir.
-- ------------------------------------------------------------
CREATE TABLE public.store_settings (
  id                boolean     NOT NULL DEFAULT true,
  whatsapp_number   text,
  whatsapp_enabled  boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT store_settings_pkey PRIMARY KEY (id),
  CONSTRAINT store_settings_singleton_chk CHECK (id = true),
  CONSTRAINT store_settings_whatsapp_number_chk CHECK (
    whatsapp_number IS NULL OR whatsapp_number ~ '^[0-9]{8,15}$'
  )
);

CREATE TRIGGER trg_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.store_settings FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.store_settings FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.store_settings TO service_role;

-- Tekil ayar satırını başlat (boş/pasif). Bu bir yapılandırma başlangıcıdır, test verisi değil.
INSERT INTO public.store_settings (id, whatsapp_number, whatsapp_enabled)
VALUES (true, NULL, false);

-- ------------------------------------------------------------
-- 5) store-product-images bucket.
--    Storefront'ta müşteriye gösterilen KASITLI-PUBLIC görsel varlığı.
--    Yükleme yine SUNUCU-YETKİLİ: yalnız owner admin route, server MIME/boyut
--    doğrulaması, server-üretilen path. Client path/URL kabul edilmez.
--    MIME allowlist: yalnız jpeg/png/webp (SVG/gif KABUL EDİLMEZ). 5 MB sınır.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-product-images',
  'store-product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
