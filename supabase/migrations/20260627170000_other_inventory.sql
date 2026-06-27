-- =============================================================================
-- 20260627170000_other_inventory.sql
--
-- DİĞER ÜRÜNLER ÜRÜN-STOK — kalıcı tablo (K-2)
--
-- BAĞLAM:
--   Diğer Ürünler modülü (app/urun-stok/diger) şimdiye dek yalnızca localStorage
--   (other_inventory_v1) kullanıyordu → manuel kayıt sayfa yenilenince/başka
--   cihazda kayboluyordu. Bu tablo, Yağ/Sabun-Krem/Aksesuar (K-2) desenini
--   birebir izler:
--     • Tüm erişim service_role'lü /api/urun-stok/diger route'undan gider.
--     • tenant_id daima oturumdan; istemciden gönderilmez.
--     • Tarayıcı (anon/authenticated) bu tabloya DOĞRUDAN erişemez.
--
-- KİMLİK:
--   client_id — istemcinin ürettiği kalıcı kimlik (oth_… ). Satış geçmişi
--               (productId) buna bağlandığından yeniden yüklemede değişmemesi
--               için DB'de saklanır. (tenant_id, client_id) tekildir.
--
-- service_role: BYPASSRLS taşır → API route'ları okuma+yazma yapar. Politika
--   yalnızca anon/authenticated'ı reddeder.
--
-- IDEMPOTENT: IF NOT EXISTS + CREATE POLICY (drop önce).
-- =============================================================================

CREATE TABLE IF NOT EXISTS other_inventory (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  client_id       text        NOT NULL,
  name            text        NOT NULL,
  product_group   text        NOT NULL DEFAULT '',
  sub_category    text        NOT NULL DEFAULT '',
  measure_type    text        NOT NULL DEFAULT 'Adet',
  base_unit       text        NOT NULL DEFAULT 'adet',
  stock_base      double precision NOT NULL DEFAULT 0,
  cost_per_base   double precision NOT NULL DEFAULT 0,
  sale_per_base   double precision NOT NULL DEFAULT 0,
  profit_pct      double precision NOT NULL DEFAULT 0,
  variation_kind  text        NOT NULL DEFAULT 'özel',
  variation_detail text       NOT NULL DEFAULT '',
  barcode         text        NOT NULL DEFAULT '',
  photos          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  note            text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_other_inventory_tenant
  ON other_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_other_inventory_tenant_created
  ON other_inventory(tenant_id, created_at DESC);

-- RLS: yalnızca service_role (API route'ları) erişebilir.
ALTER TABLE other_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "other_inventory_deny_direct" ON other_inventory;
CREATE POLICY "other_inventory_deny_direct"
  ON other_inventory
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Tarayıcı rollerinden tablo yetkilerini de geri al (politikaya ek savunma).
REVOKE ALL PRIVILEGES ON TABLE other_inventory FROM anon, authenticated;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   SELECT has_table_privilege('anon','public.other_inventory','SELECT'); -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname='other_inventory';   -- true
-- =============================================================================
