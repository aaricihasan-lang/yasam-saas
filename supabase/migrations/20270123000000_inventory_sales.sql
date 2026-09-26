-- =============================================================================
-- 20270123000000_inventory_sales.sql
--
-- ÜRÜN & STOK — KALICI SATIŞ ÇEKİRDEĞİ (USM-001 / USM-003 / USM-004 / USM-005 /
--                                       USM-008 / USM-009)
--
-- BAĞLAM:
--   Merkezî Satış ve kategori (dogaltas/oil/soap_cream/accessory/other) satışları
--   şimdiye dek YALNIZCA localStorage'a yazıyordu. Stok düşümü istemcide mutlak
--   overwrite ile senkronlanıyordu (kayıp güncelleme / lost update riski),
--   satış geçmişi cihaz-yerel ve kalıcı değildi.
--
--   Bu migration satışın CANONICAL yerini SERVER + DB yapar:
--     • inventory_sales        — satış ana kaydı (tenant-scoped, para = numeric)
--     • inventory_sale_items   — satır anlık görüntüsü (snapshot; ürün sonradan
--                                değişse/silinse bile geçmiş DEĞİŞMEZ)
--     • inventory_sale_create_atomic(...) — TEK TRANSACTION'da: satır kilidi
--       (FOR UPDATE) → tenant sahiplik → stok yeterlilik → atomik azaltma →
--       sale + sale_items → idempotency. Aksi halde tam rollback.
--     • inventory_sale_cancel_atomic(...) — atomik iptal + stok iadesi;
--       çift iptal güvenli (ikinci kez stok iade ETMEZ).
--
-- GÜVENLİK MODELİ (mevcut envanter tablolarıyla birebir):
--   • RLS ON + anon/authenticated DENY + REVOKE ALL. Erişim yalnız service_role.
--   • tenant_id daima SERVER tarafından RPC parametresine verilir; istemci
--     doğrudan hükmedemez (API route requireModuleAccess ile oturumdan belirler).
--   • RPC SECURITY DEFINER + SET search_path = public, pg_catalog.
--   • Envanter tabloları KULLANICI GİRDİSİ ile dinamik SQL ile SEÇİLMEZ;
--     inventory_type → tablo/kolon eşlemesi HARD-CODED CASE/IF ile yapılır.
--
-- PARA (USM-008): Yeni satış tablolarında tüm parasal değerler numeric
--   (double precision DEĞİL). Yuvarlama tek standart: birim değer 4 hane,
--   satır/satış toplamı 2 hane. Sunucu hesaplar; istemci maliyet snapshot'ına
--   GÜVENİLMEZ (unit_cost DB'den okunur).
--
-- ZAMAN (USM-009): sold_at/created_at = timestamptz DEFAULT now() (gerçek UTC
--   instant). İstemci yerel saat diliminde gösterir.
--
-- IDEMPOTENT: IF NOT EXISTS + CREATE OR REPLACE + DROP POLICY önce.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Satış ana kaydı ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_sales (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  created_by      uuid        NOT NULL,
  source          text        NOT NULL DEFAULT 'central',
  status          text        NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed', 'cancelled')),
  note            text        NOT NULL DEFAULT '',
  idempotency_key text        NOT NULL,
  sold_at         timestamptz NOT NULL DEFAULT now(),
  total_cost      numeric(14,2) NOT NULL DEFAULT 0,
  total_sale      numeric(14,2) NOT NULL DEFAULT 0,
  total_profit    numeric(14,2) NOT NULL DEFAULT 0,
  item_count      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  cancelled_at    timestamptz,
  cancelled_by    uuid,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inventory_sales_tenant_sold
  ON inventory_sales(tenant_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_sales_tenant_status
  ON inventory_sales(tenant_id, status);

-- ─── Satış satırı (snapshot) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_sale_items (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id                  uuid        NOT NULL
                             REFERENCES inventory_sales(id) ON DELETE CASCADE,
  tenant_id                uuid        NOT NULL,
  inventory_type           text        NOT NULL
                             CHECK (inventory_type IN
                               ('dogaltas','oil','soap_cream','accessory','other')),
  inventory_id             uuid        NOT NULL,
  inventory_client_id      text        NOT NULL DEFAULT '',
  product_name_snapshot    text        NOT NULL DEFAULT '',
  product_subtitle_snapshot text       NOT NULL DEFAULT '',
  unit                     text        NOT NULL DEFAULT '',
  quantity                 numeric(16,4) NOT NULL CHECK (quantity > 0),
  unit_cost_snapshot       numeric(14,4) NOT NULL DEFAULT 0,
  unit_sale_price_snapshot numeric(14,4) NOT NULL DEFAULT 0,
  markup_pct               numeric(12,4) NOT NULL DEFAULT 0,
  currency_snapshot        text        NOT NULL DEFAULT 'TRY',
  line_cost_total          numeric(14,2) NOT NULL DEFAULT 0,
  line_sale_total          numeric(14,2) NOT NULL DEFAULT 0,
  line_profit              numeric(14,2) NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_sale_items_sale
  ON inventory_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sale_items_tenant_inv
  ON inventory_sale_items(tenant_id, inventory_type, inventory_id);

-- ─── RLS: yalnızca service_role ──────────────────────────────────────────────
ALTER TABLE inventory_sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_sales_deny_direct" ON inventory_sales;
CREATE POLICY "inventory_sales_deny_direct"
  ON inventory_sales FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "inventory_sale_items_deny_direct" ON inventory_sale_items;
CREATE POLICY "inventory_sale_items_deny_direct"
  ON inventory_sale_items FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL PRIVILEGES ON TABLE inventory_sales      FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE inventory_sale_items FROM anon, authenticated;

-- =============================================================================
-- RPC: inventory_sale_create_atomic
--
-- p_lines jsonb: [{ inventory_type, inventory_id, quantity,
--                   markup_pct?, unit_sale_price? }, ...]
--
-- Custom SQLSTATE:
--   45001 inventory_not_found        (id+tenant eşleşmedi / cross-tenant)
--   45002 insufficient_stock         (mevcut stok < talep)
--   45010 duplicate_line             (aynı ürün iki satır)
--   45011 invalid_inventory_type
--   45012 invalid_quantity
--   45013 invalid_price
--   45014 invalid_request            (boş/aşırı satır, boş idempotency key)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.inventory_sale_create_atomic(
  p_tenant_id      uuid,
  p_created_by     uuid,
  p_idempotency_key text,
  p_source         text,
  p_note           text,
  p_lines          jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_line_count   int;
  v_existing     inventory_sales%ROWTYPE;
  v_sale_id      uuid;
  v_line         jsonb;
  v_type         text;
  v_inv_id       uuid;
  v_qty          numeric;
  v_markup       numeric;
  v_explicit_sale numeric;
  v_seen         text[] := ARRAY[]::text[];
  v_seen_key     text;
  v_stock        numeric;
  v_unit_cost    numeric;
  v_default_sale numeric;
  v_client_id    text;
  v_name         text;
  v_subtitle     text;
  v_unit         text;
  v_unit_sale    numeric;
  v_line_cost    numeric;
  v_line_sale    numeric;
  v_line_profit  numeric;
  v_tot_cost     numeric := 0;
  v_tot_sale     numeric := 0;
  v_tot_profit   numeric := 0;
  v_items        int := 0;
BEGIN
  -- ── temel doğrulama
  IF p_tenant_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '45014',
      DETAIL = 'tenant/kullanıcı zorunlu';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0
     OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '45014',
      DETAIL = 'idempotency_key';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '45014',
      DETAIL = 'lines dizi değil';
  END IF;
  v_line_count := jsonb_array_length(p_lines);
  IF v_line_count < 1 OR v_line_count > 200 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '45014',
      DETAIL = 'satır sayısı 1..200 olmalı';
  END IF;

  -- ── idempotency: aynı (tenant, key) eşzamanlı denemeleri serialize et
  PERFORM pg_advisory_xact_lock(
    hashtext(p_tenant_id::text || ':' || p_idempotency_key));

  SELECT * INTO v_existing FROM inventory_sales
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    -- Aynı işlem tekrar geldi → mevcut satışı güvenle döndür (duplicate-safe).
    RETURN jsonb_build_object(
      'ok', true, 'duplicate', true, 'sale_id', v_existing.id,
      'sale', to_jsonb(v_existing),
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(si) ORDER BY si.created_at)
                         FROM inventory_sale_items si WHERE si.sale_id = v_existing.id),
                        '[]'::jsonb));
  END IF;

  -- ── satış başlığı (toplamlar sonra güncellenir)
  INSERT INTO inventory_sales (tenant_id, created_by, source, status, note,
                               idempotency_key)
  VALUES (p_tenant_id, p_created_by,
          COALESCE(NULLIF(btrim(p_source), ''), 'central'),
          'completed', COALESCE(p_note, ''), p_idempotency_key)
  RETURNING id INTO v_sale_id;

  -- ── satırlar
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_type := btrim(lower(COALESCE(v_line->>'inventory_type', '')));
    IF v_type NOT IN ('dogaltas','oil','soap_cream','accessory','other') THEN
      RAISE EXCEPTION 'invalid_inventory_type' USING ERRCODE = '45011',
        DETAIL = COALESCE(v_line->>'inventory_type', '(boş)');
    END IF;

    BEGIN
      v_inv_id := (v_line->>'inventory_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_request' USING ERRCODE = '45014',
        DETAIL = 'inventory_id uuid değil';
    END;

    -- aynı ürünün iki satırını reddet (beklenmeyen çift kilit / stok hatası önlenir)
    v_seen_key := v_type || ':' || v_inv_id::text;
    IF v_seen_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate_line' USING ERRCODE = '45010', DETAIL = v_seen_key;
    END IF;
    v_seen := array_append(v_seen, v_seen_key);

    v_qty := NULLIF(v_line->>'quantity', '')::numeric;
    IF v_qty IS NULL OR NOT (v_qty > 0) OR v_qty > 1000000000 THEN
      RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '45012',
        DETAIL = COALESCE(v_line->>'quantity', '(boş)');
    END IF;

    v_markup := NULLIF(v_line->>'markup_pct', '')::numeric;
    IF v_markup IS NOT NULL AND (v_markup < 0 OR v_markup > 1000000) THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '45013', DETAIL = 'markup_pct';
    END IF;
    v_explicit_sale := NULLIF(v_line->>'unit_sale_price', '')::numeric;
    IF v_explicit_sale IS NOT NULL
       AND (v_explicit_sale < 0 OR v_explicit_sale > 1000000000) THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '45013', DETAIL = 'unit_sale_price';
    END IF;

    -- ── HARD-CODED tip → tablo/kolon eşlemesi + satır kilidi (FOR UPDATE)
    v_client_id := '';
    v_subtitle  := '';
    IF v_type = 'dogaltas' THEN
      SELECT adet,
             CASE WHEN unit_cost_try > 0 THEN unit_cost_try
                  WHEN total_cost_try > 0 AND adet > 0 THEN total_cost_try / adet
                  ELSE adet_price END,
             adet_price, name, COALESCE(type, ''), 'adet'
        INTO v_stock, v_unit_cost, v_default_sale, v_name, v_subtitle, v_unit
        FROM dogaltas_inventory
        WHERE id = v_inv_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    ELSIF v_type = 'oil' THEN
      SELECT stock_base, cost_per_base, sale_per_base, name, client_id,
             COALESCE(base_unit, 'ml')
        INTO v_stock, v_unit_cost, v_default_sale, v_name, v_client_id, v_unit
        FROM oil_inventory
        WHERE id = v_inv_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    ELSIF v_type = 'soap_cream' THEN
      SELECT stock_base, cost_per_base, sale_per_base, name, client_id,
             COALESCE(base_unit, 'gram')
        INTO v_stock, v_unit_cost, v_default_sale, v_name, v_client_id, v_unit
        FROM soap_cream_inventory
        WHERE id = v_inv_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    ELSIF v_type = 'accessory' THEN
      SELECT stock_qty, cost_per_unit, sale_per_unit, name, client_id, 'adet'
        INTO v_stock, v_unit_cost, v_default_sale, v_name, v_client_id, v_unit
        FROM accessory_inventory
        WHERE id = v_inv_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    ELSE -- other
      SELECT stock_base, cost_per_base, sale_per_base, name, client_id,
             COALESCE(base_unit, 'adet')
        INTO v_stock, v_unit_cost, v_default_sale, v_name, v_client_id, v_unit
        FROM other_inventory
        WHERE id = v_inv_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    END IF;

    IF v_name IS NULL THEN
      -- id+tenant eşleşmedi → yok veya başka tenant (cross-tenant koruması)
      RAISE EXCEPTION 'inventory_not_found' USING ERRCODE = '45001',
        DETAIL = v_type || ':' || v_inv_id::text;
    END IF;

    v_stock := COALESCE(v_stock, 0);
    IF v_stock < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '45002',
        DETAIL = v_name || '|have=' || v_stock::text || '|want=' || v_qty::text;
    END IF;

    v_unit_cost    := COALESCE(v_unit_cost, 0);
    v_default_sale := COALESCE(v_default_sale, 0);

    -- ── fiyat: unit_sale_price > 0 varsa öncelik; yoksa markup; yoksa DB default;
    --    o da 0 ise maliyet (kâr 0). Maliyet DAİMA DB'den (istemciye güvenilmez).
    IF v_explicit_sale IS NOT NULL AND v_explicit_sale > 0 THEN
      v_unit_sale := v_explicit_sale;
      v_markup := CASE WHEN v_unit_cost > 0
                       THEN round((v_unit_sale / v_unit_cost - 1) * 100, 4) ELSE 0 END;
    ELSIF v_markup IS NOT NULL THEN
      v_unit_sale := round(v_unit_cost * (1 + v_markup / 100.0), 4);
    ELSIF v_default_sale > 0 THEN
      v_unit_sale := v_default_sale;
      v_markup := CASE WHEN v_unit_cost > 0
                       THEN round((v_unit_sale / v_unit_cost - 1) * 100, 4) ELSE 0 END;
    ELSE
      v_unit_sale := v_unit_cost;
      v_markup := 0;
    END IF;

    v_line_cost   := round(v_unit_cost * v_qty, 2);
    v_line_sale   := round(v_unit_sale * v_qty, 2);
    v_line_profit := v_line_sale - v_line_cost;

    -- ── atomik stok azaltma (kilitli satır üzerinde)
    IF v_type = 'dogaltas' THEN
      UPDATE dogaltas_inventory SET adet = adet - v_qty
        WHERE id = v_inv_id AND tenant_id = p_tenant_id;
    ELSIF v_type = 'oil' THEN
      UPDATE oil_inventory SET stock_base = stock_base - v_qty, updated_at = now()
        WHERE id = v_inv_id AND tenant_id = p_tenant_id;
    ELSIF v_type = 'soap_cream' THEN
      UPDATE soap_cream_inventory SET stock_base = stock_base - v_qty, updated_at = now()
        WHERE id = v_inv_id AND tenant_id = p_tenant_id;
    ELSIF v_type = 'accessory' THEN
      UPDATE accessory_inventory SET stock_qty = stock_qty - v_qty, updated_at = now()
        WHERE id = v_inv_id AND tenant_id = p_tenant_id;
    ELSE
      UPDATE other_inventory SET stock_base = stock_base - v_qty, updated_at = now()
        WHERE id = v_inv_id AND tenant_id = p_tenant_id;
    END IF;

    INSERT INTO inventory_sale_items (
      sale_id, tenant_id, inventory_type, inventory_id, inventory_client_id,
      product_name_snapshot, product_subtitle_snapshot, unit, quantity,
      unit_cost_snapshot, unit_sale_price_snapshot, markup_pct, currency_snapshot,
      line_cost_total, line_sale_total, line_profit)
    VALUES (
      v_sale_id, p_tenant_id, v_type, v_inv_id, COALESCE(v_client_id, ''),
      v_name, v_subtitle, v_unit, v_qty,
      round(v_unit_cost, 4), round(v_unit_sale, 4), COALESCE(v_markup, 0), 'TRY',
      v_line_cost, v_line_sale, v_line_profit);

    v_tot_cost   := v_tot_cost + v_line_cost;
    v_tot_sale   := v_tot_sale + v_line_sale;
    v_tot_profit := v_tot_profit + v_line_profit;
    v_items      := v_items + 1;
  END LOOP;

  UPDATE inventory_sales
    SET total_cost = v_tot_cost, total_sale = v_tot_sale,
        total_profit = v_tot_profit, item_count = v_items
    WHERE id = v_sale_id;

  SELECT * INTO v_existing FROM inventory_sales WHERE id = v_sale_id;

  RETURN jsonb_build_object(
    'ok', true, 'duplicate', false, 'sale_id', v_sale_id,
    'sale', to_jsonb(v_existing),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(si) ORDER BY si.created_at)
                       FROM inventory_sale_items si WHERE si.sale_id = v_sale_id),
                      '[]'::jsonb));
END;
$$;

-- =============================================================================
-- RPC: inventory_sale_cancel_atomic
--   Atomik iptal + stok iadesi. Çift iptal güvenli (2. kez stok iade etmez).
--   45003 sale_not_found
-- =============================================================================
CREATE OR REPLACE FUNCTION public.inventory_sale_cancel_atomic(
  p_tenant_id    uuid,
  p_sale_id      uuid,
  p_cancelled_by uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_sale  inventory_sales%ROWTYPE;
  v_item  inventory_sale_items%ROWTYPE;
  v_restored int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_sale_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '45014';
  END IF;

  SELECT * INTO v_sale FROM inventory_sales
    WHERE id = p_sale_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale_not_found' USING ERRCODE = '45003',
      DETAIL = p_sale_id::text;
  END IF;

  IF v_sale.status = 'cancelled' THEN
    -- Çift iptal: stok İADE ETME, mevcut durumu döndür.
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true,
                              'sale_id', v_sale.id, 'restored', 0);
  END IF;

  FOR v_item IN
    SELECT * FROM inventory_sale_items WHERE sale_id = p_sale_id
  LOOP
    IF v_item.inventory_type = 'dogaltas' THEN
      UPDATE dogaltas_inventory SET adet = adet + v_item.quantity
        WHERE id = v_item.inventory_id AND tenant_id = p_tenant_id;
    ELSIF v_item.inventory_type = 'oil' THEN
      UPDATE oil_inventory SET stock_base = stock_base + v_item.quantity, updated_at = now()
        WHERE id = v_item.inventory_id AND tenant_id = p_tenant_id;
    ELSIF v_item.inventory_type = 'soap_cream' THEN
      UPDATE soap_cream_inventory SET stock_base = stock_base + v_item.quantity, updated_at = now()
        WHERE id = v_item.inventory_id AND tenant_id = p_tenant_id;
    ELSIF v_item.inventory_type = 'accessory' THEN
      UPDATE accessory_inventory SET stock_qty = stock_qty + v_item.quantity, updated_at = now()
        WHERE id = v_item.inventory_id AND tenant_id = p_tenant_id;
    ELSIF v_item.inventory_type = 'other' THEN
      UPDATE other_inventory SET stock_base = stock_base + v_item.quantity, updated_at = now()
        WHERE id = v_item.inventory_id AND tenant_id = p_tenant_id;
    END IF;
    IF FOUND THEN v_restored := v_restored + 1; END IF;
  END LOOP;

  UPDATE inventory_sales
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = p_cancelled_by
    WHERE id = p_sale_id;

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false,
                            'sale_id', p_sale_id, 'restored', v_restored);
END;
$$;

-- ─── Function yetkileri: yalnızca service_role ───────────────────────────────
DO $grants$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.inventory_sale_create_atomic(uuid,uuid,text,text,text,jsonb)',
    'public.inventory_sale_cancel_atomic(uuid,uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$grants$;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   SELECT has_table_privilege('anon','public.inventory_sales','SELECT');       -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname='inventory_sales';         -- true
--   SELECT has_function_privilege('anon',
--     'public.inventory_sale_create_atomic(uuid,uuid,text,text,text,jsonb)','EXECUTE'); -- false
-- =============================================================================
