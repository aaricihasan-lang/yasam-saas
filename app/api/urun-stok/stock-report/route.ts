/**
 * Stok Envanter Word Raporu (USM-002 / USM-006 / USM-007)
 *
 * KAPSAM: DB-backed tüm ürün-stok kategorileri:
 *   dogaltas_inventory, oil_inventory, soap_cream_inventory,
 *   accessory_inventory, other_inventory.
 *
 * GÜVENLİK (USM-002): Kimlik/tenant BODY'den ALINMAZ. requireModuleAccess(req,"stok")
 *   ile token-bound doğrulama; tenant_id oturumdan gelir. Body'de tenantId/userId
 *   gönderilse bile ownership için KULLANILMAZ.
 *
 * KRİTİK / 0-STOK (USM-006): stock <= eşik → kritik; 0 (ve negatif) stok TÜKENMİŞ
 *   olarak kritik sayılır ve raporda görünür. Stok değerine 0 katkı sağlar.
 */

import { requireModuleAccess } from "@/lib/auth/userGuard";
import { readInventoryRowsPaged } from "@/lib/urun-stok/pagedInventoryRead";
import { trackUsage } from "@/lib/usage/trackUsage";
import { NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { resolveReportLocale } from "@/lib/i18n/reportLocale";
// Belge kurucusu SAF modül (I18N RAPOR-AB): etiket/kategori haritaları + kritik eşikleri lib'de.
import {
  buildStockReportDoc,
  isCriticalStockRow,
  type StockReportExportMode,
  type StockReportRow,
} from "@/lib/urun-stok/stockReportWord";

export const runtime = "nodejs";

type ExportMode = StockReportExportMode;
type UnifiedRow = StockReportRow;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: NextRequest): Promise<Response> {

  // ── USM-002: token-bound auth; tenant oturumdan.
  const guard = await requireModuleAccess(request, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account)
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let body: { exportMode?: ExportMode } = {};
  try { body = (await request.json()) as { exportMode?: ExportMode }; }
  catch { /* gövde opsiyonel */ }
  const exportMode: ExportMode = body.exportMode === "critical" ? "critical" : "all";

  // ── USM-007: tüm DB kategorilerini tenant-scoped oku (0 stok DAHİL).
  // STK-04: sayfalı + kararlı sıralı (ad + id) okuma → >1000 kalemde rapor eksik kalmaz;
  // okuma eksik kalırsa rapor ÜRETİLMEZ (hata döner).
  const [dg, oil, soap, acc, other] = await Promise.all([
    readInventoryRowsPaged(db, "dogaltas_inventory", tenantId,
      "id, name, type, adet, unit_cost_try, total_cost_try, adet_price", { orderBy: "name" }),
    readInventoryRowsPaged(db, "oil_inventory", tenantId,
      "id, name, oil_type, base_unit, stock_base, cost_per_base", { orderBy: "name" }),
    readInventoryRowsPaged(db, "soap_cream_inventory", tenantId,
      "id, name, product_group, base_unit, stock_base, cost_per_base", { orderBy: "name" }),
    readInventoryRowsPaged(db, "accessory_inventory", tenantId,
      "id, name, product_group, product_model, stock_qty, cost_per_unit", { orderBy: "name" }),
    readInventoryRowsPaged(db, "other_inventory", tenantId,
      "id, name, product_group, sub_category, base_unit, stock_base, cost_per_base", { orderBy: "name" }),
  ]);

  const firstErr = dg.error || oil.error || soap.error || acc.error || other.error;
  if (firstErr) {
    console.error("[stock-report] okuma hata", { code: (firstErr as { code?: string }).code });
    await trackUsage(guard, request, { module: "stok", action: "action_failed", failedAction: "report_generated", subEntity: "inventory", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Stok verisi okunamadı." }, { status: 500 });
  }

  const rows: UnifiedRow[] = [];

  for (const r of dg.rows as Record<string, unknown>[]) {
    const adet = num(r.adet);
    const unitCost = num(r.unit_cost_try) > 0
      ? num(r.unit_cost_try)
      : (num(r.total_cost_try) > 0 && adet > 0 ? num(r.total_cost_try) / adet : num(r.adet_price));
    rows.push({
      category: "dogaltas",
      name: String(r.name ?? ""), subtitle: String(r.type ?? ""),
      stock: adet, unit: "adet", unitCost,
      stockValue: unitCost * Math.max(adet, 0),
    });
  }
  for (const r of oil.rows as Record<string, unknown>[]) {
    const stock = num(r.stock_base); const unitCost = num(r.cost_per_base);
    rows.push({
      category: "oil",
      name: String(r.name ?? ""), subtitle: String(r.oil_type ?? ""),
      stock, unit: String(r.base_unit || "ml"), unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }
  for (const r of soap.rows as Record<string, unknown>[]) {
    const stock = num(r.stock_base); const unitCost = num(r.cost_per_base);
    rows.push({
      category: "soap_cream",
      name: String(r.name ?? ""), subtitle: String(r.product_group ?? ""),
      stock, unit: String(r.base_unit || "gram"), unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }
  for (const r of acc.rows as Record<string, unknown>[]) {
    const stock = num(r.stock_qty); const unitCost = num(r.cost_per_unit);
    const grp = String(r.product_group ?? ""); const model = String(r.product_model ?? "");
    rows.push({
      category: "accessory",
      name: String(r.name ?? ""), subtitle: [grp, model].filter(Boolean).join(" · "),
      stock, unit: "adet", unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }
  for (const r of other.rows as Record<string, unknown>[]) {
    const stock = num(r.stock_base); const unitCost = num(r.cost_per_base);
    const grp = String(r.product_group ?? ""); const sub = String(r.sub_category ?? "");
    rows.push({
      category: "other",
      name: String(r.name ?? ""), subtitle: [grp, sub].filter(Boolean).join(" · "),
      stock, unit: String(r.base_unit || "adet"), unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }

  const criticalAll = rows.filter(isCriticalStockRow);
  const reportRows = exportMode === "critical" ? criticalAll : rows;

  if (!reportRows.length)
    return NextResponse.json({
      ok: false,
      error: exportMode === "critical"
        ? "Kritik stokta ürün bulunamadı."
        : "Kayıtlı ürün bulunamadı.",
    }, { status: 404 });

  // I18N çıktı dili sözleşmesi: dil route girişinde tek kez çözülür (kapı > hesap tercihi > çerez > tr).
  const output = await resolveReportLocale(request, { db, tenantId, userId: guard.userId });
  const { doc, filename } = buildStockReportDoc({ rows, exportMode, expertName: expertDisplayName(guard.profile), output });

  const buffer = await Packer.toBuffer(doc);
  await trackUsage(guard, request, { module: "stok", action: "report_generated", subEntity: "inventory", itemCount: reportRows.length });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
