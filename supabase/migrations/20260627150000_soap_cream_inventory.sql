-- =============================================================================
-- 20260627150000_soap_cream_inventory.sql
--
-- SABUN / KREM ÜRÜN-STOK — kalıcı tablo (K-2)
--
-- BAĞLAM:
--   Sabun/Krem modülü (app/urun-stok/sabun-krem) şimdiye dek yalnızca
--   localStorage (soap_cream_inventory_v1) kullanıyordu → manuel kayıt sayfa
--   yenilenince/başka cihazda kayboluyordu. Bu tablo, Yağ (K-2) oil_inventory
--   + /api/urun-stok/yag desenini birebir izler:
--     • Tüm erişim service_role'lü /api/urun-stok/sabun-krem route'undan gider.
--     • tenant_id daima oturumdan; istemciden gönderilmez.
--     • Tarayıcı (anon/authenticated) bu tabloya DOĞRUDAN erişemez.
--
-- KİMLİK:
--   client_id — istemcinin ürettiği kalıcı kimlik (sc_… ). Satış geçmişi
--               (productId) buna bağlandığından yeniden yüklemede değişmemesi
--               için DB'de saklanır. (tenant_id, client_id) tekildir.
--
-- service_role: BYPASSRLS taşır → API route'ları okuma+yazma yapar. Politika
--   yalnızca anon/authenticated'ı reddeder.
--
-- IDEMPOTENT: IF NOT EXISTS + CREATE POLICY (drop önce).
-- =============================================================================

CREATE TABLE IF NOT EXISTS soap_cream_inventory (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  client_id     text        NOT NULL,
  name          text        NOT NULL,
  product_group text        NOT NULL DEFAULT '',
  measure_type  text        NOT NULL DEFAULT 'Gram / KG',
  base_unit     text        NOT NULL DEFAULT 'gram',
  stock_base    double precision NOT NULL DEFAULT 0,
  cost_per_base double precision NOT NULL DEFAULT 0,
  sale_per_base double precision NOT NULL DEFAULT 0,
  profit_pct    double precision NOT NULL DEFAULT 0,
  packaging_type text       NOT NULL DEFAULT '',
  net_amount    text        NOT NULL DEFAULT '',
  expiry_date   text        NOT NULL DEFAULT '',
  lot_no        text        NOT NULL DEFAULT '',
  photos        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  note          text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_soap_cream_inventory_tenant
  ON soap_cream_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soap_cream_inventory_tenant_created
  ON soap_cream_inventory(tenant_id, created_at DESC);

-- RLS: yalnızca service_role (API route'ları) erişebilir.
ALTER TABLE soap_cream_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "soap_cream_inventory_deny_direct" ON soap_cream_inventory;
CREATE POLICY "soap_cream_inventory_deny_direct"
  ON soap_cream_inventory
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Tarayıcı rollerinden tablo yetkilerini de geri al (politikaya ek savunma).
REVOKE ALL PRIVILEGES ON TABLE soap_cream_inventory FROM anon, authenticated;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   SELECT has_table_privilege('anon','public.soap_cream_inventory','SELECT'); -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname='soap_cream_inventory';   -- true
-- =============================================================================
