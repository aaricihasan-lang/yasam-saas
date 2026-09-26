import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/urun-stok/sales/catalog — DB-CANONICAL satış kataloğu (USM-001 §28).
 *
 * Merkezî Satış ekranı artık ürünleri localStorage yerine bu uçtan çeker; her
 * ürün gerçek DB `id`'si (inventory_id) ile döner → satış RPC'si satırı bu id ile
 * kilitler (name-eşleşmesi kırılganlığı yok). tenant-scoped (service_role).
 *
 * NOT (USM-054): fotoğraf base64 verisi DÖNMEZ; yalnız photo_count. Yalnız
 * stoğu > 0 olan (satılabilir) ürünler döner.
 */

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function photoCount(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

type CatalogProduct = {
  inventory_type: string;
  inventory_id: string;
  client_id: string;
  name: string;
  subtitle: string;
  stock: number;
  unit: string;
  measure_type: string;
  cost_per_unit: number;
  sale_per_unit: number;
  profit_pct: number;
  photo_count: number;
};

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const [dg, oil, soap, acc, other] = await Promise.all([
    db.from("dogaltas_inventory")
      .select("id, name, type, adet, unit_cost_try, total_cost_try, adet_price")
      .eq("tenant_id", tenantId).gt("adet", 0),
    db.from("oil_inventory")
      .select("id, client_id, name, oil_type, measure_type, base_unit, stock_base, cost_per_base, sale_per_base, profit_pct, photos")
      .eq("tenant_id", tenantId).gt("stock_base", 0),
    db.from("soap_cream_inventory")
      .select("id, client_id, name, product_group, measure_type, base_unit, stock_base, cost_per_base, sale_per_base, profit_pct, photos")
      .eq("tenant_id", tenantId).gt("stock_base", 0),
    db.from("accessory_inventory")
      .select("id, client_id, name, product_group, product_model, stock_qty, cost_per_unit, sale_per_unit, profit_pct, photos")
      .eq("tenant_id", tenantId).gt("stock_qty", 0),
    db.from("other_inventory")
      .select("id, client_id, name, product_group, sub_category, measure_type, base_unit, stock_base, cost_per_base, sale_per_base, profit_pct, photos")
      .eq("tenant_id", tenantId).gt("stock_base", 0),
  ]);

  const firstErr = dg.error || oil.error || soap.error || acc.error || other.error;
  if (firstErr) {
    console.error("[urun-stok/sales/catalog] okuma hata", { code: (firstErr as { code?: string }).code });
    return NextResponse.json({ ok: false, error: "Katalog okunamadı." }, { status: 500 });
  }

  const products: CatalogProduct[] = [];

  for (const r of (dg.data ?? []) as Record<string, unknown>[]) {
    const adet = num(r.adet);
    const unitCost = num(r.unit_cost_try) > 0
      ? num(r.unit_cost_try)
      : (num(r.total_cost_try) > 0 && adet > 0 ? num(r.total_cost_try) / adet : num(r.adet_price));
    products.push({
      inventory_type: "dogaltas", inventory_id: String(r.id), client_id: "",
      name: String(r.name ?? ""), subtitle: String(r.type ?? ""),
      stock: adet, unit: "adet", measure_type: "Adet",
      cost_per_unit: unitCost, sale_per_unit: num(r.adet_price), profit_pct: 0,
      photo_count: 0,
    });
  }
  for (const r of (oil.data ?? []) as Record<string, unknown>[]) {
    products.push({
      inventory_type: "oil", inventory_id: String(r.id), client_id: String(r.client_id ?? ""),
      name: String(r.name ?? ""), subtitle: String(r.oil_type ?? ""),
      stock: num(r.stock_base), unit: String(r.base_unit || "ml"), measure_type: String(r.measure_type ?? ""),
      cost_per_unit: num(r.cost_per_base), sale_per_unit: num(r.sale_per_base), profit_pct: num(r.profit_pct),
      photo_count: photoCount(r.photos),
    });
  }
  for (const r of (soap.data ?? []) as Record<string, unknown>[]) {
    products.push({
      inventory_type: "soap_cream", inventory_id: String(r.id), client_id: String(r.client_id ?? ""),
      name: String(r.name ?? ""), subtitle: String(r.product_group ?? ""),
      stock: num(r.stock_base), unit: String(r.base_unit || "gram"), measure_type: String(r.measure_type ?? ""),
      cost_per_unit: num(r.cost_per_base), sale_per_unit: num(r.sale_per_base), profit_pct: num(r.profit_pct),
      photo_count: photoCount(r.photos),
    });
  }
  for (const r of (acc.data ?? []) as Record<string, unknown>[]) {
    const model = String(r.product_model ?? "");
    const grp = String(r.product_group ?? "");
    products.push({
      inventory_type: "accessory", inventory_id: String(r.id), client_id: String(r.client_id ?? ""),
      name: String(r.name ?? ""), subtitle: [grp, model].filter(Boolean).join(" · "),
      stock: num(r.stock_qty), unit: "adet", measure_type: "Adet",
      cost_per_unit: num(r.cost_per_unit), sale_per_unit: num(r.sale_per_unit), profit_pct: num(r.profit_pct),
      photo_count: photoCount(r.photos),
    });
  }
  for (const r of (other.data ?? []) as Record<string, unknown>[]) {
    const grp = String(r.product_group ?? "");
    const sub = String(r.sub_category ?? "");
    products.push({
      inventory_type: "other", inventory_id: String(r.id), client_id: String(r.client_id ?? ""),
      name: String(r.name ?? ""), subtitle: [grp, sub].filter(Boolean).join(" · "),
      stock: num(r.stock_base), unit: String(r.base_unit || "adet"), measure_type: String(r.measure_type ?? ""),
      cost_per_unit: num(r.cost_per_base), sale_per_unit: num(r.sale_per_base), profit_pct: num(r.profit_pct),
      photo_count: photoCount(r.photos),
    });
  }

  return NextResponse.json({ ok: true, products });
}
