-- =============================================================================
-- 20260627140000_oil_inventory.sql
--
-- YAĞ ÜRÜN / STOK — kalıcı tablo (K-2)
--
-- BAĞLAM:
--   Yağ modülü (app/urun-stok/yag) şimdiye dek yalnızca localStorage
--   (oil_inventory_v1) kullanıyordu → manuel eklenen kayıt sayfa yenilenince
--   ya da başka cihazda kayboluyordu. Bu tablo, Doğaltaş'taki (K-1)
--   dogaltas_inventory + /api/dogaltas/inventory desenini birebir izler:
--     • Tüm erişim service_role'lü /api/urun-stok/yag route'undan gider.
--     • tenant_id daima oturumdan; istemciden gönderilmez.
--     • Tarayıcı (anon/authenticated) bu tabloya DOĞRUDAN erişemez.
--
-- KİMLİK:
--   client_id  — istemcinin ürettiği kalıcı kimlik (oil_… ). Satış geçmişi
--                bu id'ye (productId) bağlandığından, yeniden yüklemede
--                değişmemesi için DB'de saklanır. (tenant_id, client_id) tekildir.
--
-- service_role: BYPASSRLS taşır → API route'ları okuma+yazma yapar. Politika
--   yalnızca anon/authenticated'ı reddeder.
--
-- IDEMPOTENT: IF NOT EXISTS + CREATE POLICY (drop önce).
-- =============================================================================

CREATE TABLE IF NOT EXISTS oil_inventory (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  client_id            text        NOT NULL,
  name                 text        NOT NULL,
  oil_type             text        NOT NULL DEFAULT '',
  measure_type         text        NOT NULL DEFAULT 'ML / Litre',
  base_unit            text        NOT NULL DEFAULT 'ml',
  stock_base           double precision NOT NULL DEFAULT 0,
  cost_per_base        double precision NOT NULL DEFAULT 0,
  sale_per_base        double precision NOT NULL DEFAULT 0,
  profit_pct           double precision NOT NULL DEFAULT 0,
  bottle_volume        text        NOT NULL DEFAULT '',
  bottle_volume_custom text        NOT NULL DEFAULT '',
  package_type         text        NOT NULL DEFAULT '',
  photos               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  note                 text        NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_oil_inventory_tenant
  ON oil_inventory(tenant_id);

CREATE INDEX IF NOT EXISTS idx_oil_inventory_tenant_created
  ON oil_inventory(tenant_id, created_at DESC);

-- RLS: yalnızca service_role (API route'ları) erişebilir.
ALTER TABLE oil_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oil_inventory_deny_direct" ON oil_inventory;
CREATE POLICY "oil_inventory_deny_direct"
  ON oil_inventory
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Tarayıcı rollerinden tablo yetkilerini de geri al (politikaya ek savunma).
REVOKE ALL PRIVILEGES ON TABLE oil_inventory FROM anon, authenticated;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   SELECT has_table_privilege('anon','public.oil_inventory','SELECT');   -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname='oil_inventory';     -- true
-- =============================================================================
