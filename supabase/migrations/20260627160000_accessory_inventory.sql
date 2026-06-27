-- =============================================================================
-- 20260627160000_accessory_inventory.sql
--
-- TESPİH / TAKI / AKSESUAR ÜRÜN-STOK — kalıcı tablo (K-2)
--
-- BAĞLAM:
--   Aksesuar modülü (app/urun-stok/aksesuar) şimdiye dek yalnızca localStorage
--   (accessory_inventory_v1) kullanıyordu → manuel kayıt sayfa yenilenince/başka
--   cihazda kayboluyordu. Bu tablo, Yağ/Sabun-Krem (K-2) desenini birebir izler:
--     • Tüm erişim service_role'lü /api/urun-stok/aksesuar route'undan gider.
--     • tenant_id daima oturumdan; istemciden gönderilmez.
--     • Tarayıcı (anon/authenticated) bu tabloya DOĞRUDAN erişemez.
--
-- KİMLİK:
--   client_id — istemcinin ürettiği kalıcı kimlik (acc_… ). Satış geçmişi
--               (productId) buna bağlandığından yeniden yüklemede değişmemesi
--               için DB'de saklanır. (tenant_id, client_id) tekildir.
--
-- service_role: BYPASSRLS taşır → API route'ları okuma+yazma yapar. Politika
--   yalnızca anon/authenticated'ı reddeder.
--
-- IDEMPOTENT: IF NOT EXISTS + CREATE POLICY (drop önce).
-- =============================================================================

CREATE TABLE IF NOT EXISTS accessory_inventory (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  client_id     text        NOT NULL,
  name          text        NOT NULL,
  product_group text        NOT NULL DEFAULT '',
  product_model text        NOT NULL DEFAULT '',
  material      text        NOT NULL DEFAULT '',
  color         text        NOT NULL DEFAULT '',
  size_kind     text        NOT NULL DEFAULT 'standart',
  size_detail   text        NOT NULL DEFAULT '',
  stock_qty     double precision NOT NULL DEFAULT 0,
  cost_per_unit double precision NOT NULL DEFAULT 0,
  sale_per_unit double precision NOT NULL DEFAULT 0,
  profit_pct    double precision NOT NULL DEFAULT 0,
  barcode       text        NOT NULL DEFAULT '',
  photos        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  note          text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_accessory_inventory_tenant
  ON accessory_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accessory_inventory_tenant_created
  ON accessory_inventory(tenant_id, created_at DESC);

-- RLS: yalnızca service_role (API route'ları) erişebilir.
ALTER TABLE accessory_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accessory_inventory_deny_direct" ON accessory_inventory;
CREATE POLICY "accessory_inventory_deny_direct"
  ON accessory_inventory
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Tarayıcı rollerinden tablo yetkilerini de geri al (politikaya ek savunma).
REVOKE ALL PRIVILEGES ON TABLE accessory_inventory FROM anon, authenticated;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   SELECT has_table_privilege('anon','public.accessory_inventory','SELECT'); -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname='accessory_inventory';   -- true
-- =============================================================================
