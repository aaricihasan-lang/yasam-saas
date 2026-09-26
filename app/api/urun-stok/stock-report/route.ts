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
import { NextRequest, NextResponse } from "next/server";
import { Document, Packer } from "docx";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import {
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  divider,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

const C_STOK = "4338ca"; // stok indigo
const C_CRIT = "dc2626"; // kritik kırmızı

// Birim tipine göre kritik eşiği (liveStockLogic DEFAULT_THRESHOLDS ile aynı).
const THRESHOLD_ADET = 5;
const THRESHOLD_ML = 300;
const THRESHOLD_GRAM = 300;

type ExportMode = "all" | "critical";

type UnifiedRow = {
  category: string;
  categoryLabel: string;
  name: string;
  subtitle: string;
  stock: number;
  unit: string;
  unitCost: number;
  stockValue: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  dogaltas: "Doğaltaş",
  oil: "Yağ",
  soap_cream: "Sabun / Krem",
  accessory: "Tespih / Takı / Aksesuar",
  other: "Diğer Ürünler",
};
const CATEGORY_ORDER = ["dogaltas", "oil", "soap_cream", "accessory", "other"];

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function thresholdForUnit(unit: string): number {
  const u = (unit || "").toLowerCase();
  if (u.includes("ml")) return THRESHOLD_ML;
  if (u.includes("gram") || u.includes("gr")) return THRESHOLD_GRAM;
  return THRESHOLD_ADET;
}

function isCritical(row: UnifiedRow): boolean {
  // 0 ve negatif dahil: stock <= eşik → kritik/tükenmiş.
  return row.stock <= thresholdForUnit(row.unit);
}

function fmtMoney(n: number): string {
  if (!n || n <= 0) return "—";
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtStock(row: UnifiedRow): string {
  const u = row.unit || "adet";
  const val = Number.isInteger(row.stock) ? String(row.stock) : row.stock.toFixed(2);
  if (row.stock <= 0) return `${val} ${u} (Tükenmiş)`;
  return `${val} ${u}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  const androidBlocked = androidWordGuard(request);
  if (androidBlocked) return androidBlocked;

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
  const [dg, oil, soap, acc, other] = await Promise.all([
    db.from("dogaltas_inventory")
      .select("name, type, adet, unit_cost_try, total_cost_try, adet_price")
      .eq("tenant_id", tenantId).order("name"),
    db.from("oil_inventory")
      .select("name, oil_type, base_unit, stock_base, cost_per_base")
      .eq("tenant_id", tenantId).order("name"),
    db.from("soap_cream_inventory")
      .select("name, product_group, base_unit, stock_base, cost_per_base")
      .eq("tenant_id", tenantId).order("name"),
    db.from("accessory_inventory")
      .select("name, product_group, product_model, stock_qty, cost_per_unit")
      .eq("tenant_id", tenantId).order("name"),
    db.from("other_inventory")
      .select("name, product_group, sub_category, base_unit, stock_base, cost_per_base")
      .eq("tenant_id", tenantId).order("name"),
  ]);

  const firstErr = dg.error || oil.error || soap.error || acc.error || other.error;
  if (firstErr) {
    console.error("[stock-report] okuma hata", { code: (firstErr as { code?: string }).code });
    return NextResponse.json({ ok: false, error: "Stok verisi okunamadı." }, { status: 500 });
  }

  const rows: UnifiedRow[] = [];

  for (const r of (dg.data ?? []) as Record<string, unknown>[]) {
    const adet = num(r.adet);
    const unitCost = num(r.unit_cost_try) > 0
      ? num(r.unit_cost_try)
      : (num(r.total_cost_try) > 0 && adet > 0 ? num(r.total_cost_try) / adet : num(r.adet_price));
    rows.push({
      category: "dogaltas", categoryLabel: CATEGORY_LABELS.dogaltas,
      name: String(r.name ?? ""), subtitle: String(r.type ?? ""),
      stock: adet, unit: "adet", unitCost,
      stockValue: unitCost * Math.max(adet, 0),
    });
  }
  for (const r of (oil.data ?? []) as Record<string, unknown>[]) {
    const stock = num(r.stock_base); const unitCost = num(r.cost_per_base);
    rows.push({
      category: "oil", categoryLabel: CATEGORY_LABELS.oil,
      name: String(r.name ?? ""), subtitle: String(r.oil_type ?? ""),
      stock, unit: String(r.base_unit || "ml"), unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }
  for (const r of (soap.data ?? []) as Record<string, unknown>[]) {
    const stock = num(r.stock_base); const unitCost = num(r.cost_per_base);
    rows.push({
      category: "soap_cream", categoryLabel: CATEGORY_LABELS.soap_cream,
      name: String(r.name ?? ""), subtitle: String(r.product_group ?? ""),
      stock, unit: String(r.base_unit || "gram"), unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }
  for (const r of (acc.data ?? []) as Record<string, unknown>[]) {
    const stock = num(r.stock_qty); const unitCost = num(r.cost_per_unit);
    const grp = String(r.product_group ?? ""); const model = String(r.product_model ?? "");
    rows.push({
      category: "accessory", categoryLabel: CATEGORY_LABELS.accessory,
      name: String(r.name ?? ""), subtitle: [grp, model].filter(Boolean).join(" · "),
      stock, unit: "adet", unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }
  for (const r of (other.data ?? []) as Record<string, unknown>[]) {
    const stock = num(r.stock_base); const unitCost = num(r.cost_per_base);
    const grp = String(r.product_group ?? ""); const sub = String(r.sub_category ?? "");
    rows.push({
      category: "other", categoryLabel: CATEGORY_LABELS.other,
      name: String(r.name ?? ""), subtitle: [grp, sub].filter(Boolean).join(" · "),
      stock, unit: String(r.base_unit || "adet"), unitCost,
      stockValue: unitCost * Math.max(stock, 0),
    });
  }

  const criticalAll = rows.filter(isCritical);
  const reportRows = exportMode === "critical" ? criticalAll : rows;

  if (!reportRows.length)
    return NextResponse.json({
      ok: false,
      error: exportMode === "critical"
        ? "Kritik stokta ürün bulunamadı."
        : "Kayıtlı ürün bulunamadı.",
    }, { status: 404 });

  // ── İstatistikler ──
  let totalValue = 0;
  for (const r of rows) totalValue += Math.max(r.stockValue, 0);
  const depletedCount = rows.filter((r) => r.stock <= 0).length;
  const criticalCount = criticalAll.length;

  const perCategoryCount = new Map<string, number>();
  for (const r of rows) perCategoryCount.set(r.category, (perCategoryCount.get(r.category) ?? 0) + 1);

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const exportLabel = exportMode === "critical" ? "Kritik Stok" : "Tüm Ürün Stoku";

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1: "YAŞAM SİSTEMİ",
    title2: exportMode === "critical" ? "KRİTİK STOK RAPORU" : "ÜRÜN & STOK RAPORU",
    subtitle: `Ürün & Stok Envanter Raporu · ${exportLabel}`,
    date: `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Ürün Çeşidi", value: String(rows.length) },
      { label: "Kategori", value: String(perCategoryCount.size) },
      { label: "Kritik Stok", value: String(criticalCount) },
      { label: "Tükenmiş", value: String(depletedCount) },
      { label: "Tahmini Stok Değeri", value: fmtMoney(totalValue) },
    ],
  }));

  all.push(...buildStatsPage([
    ["Ürün Çeşidi", String(rows.length)],
    ["Kategori Sayısı", String(perCategoryCount.size)],
    ["Kritik Stok Sayısı", String(criticalCount)],
    ["Tükenmiş Ürün", String(depletedCount)],
    ["Tahmini Stok Değeri", fmtMoney(totalValue)],
    ["Kapsam", exportLabel],
  ]));

  all.push(...buildTOCPage());

  // ── Bölüm 1: Stok Özeti ──
  all.push(h1Colored("1. Stok Özeti", C_STOK, true));
  all.push(twoColTable([
    ["Toplam Ürün Çeşidi", String(rows.length)],
    ["Kategori Sayısı", String(perCategoryCount.size)],
    ["Kritik Stok Sayısı", `${criticalCount} ürün`],
    ["Tükenmiş Ürün", `${depletedCount} ürün`],
    ["Tahmini Stok Değeri", fmtMoney(totalValue)],
    ["Rapor Kapsamı", exportLabel],
  ]));
  all.push(spacer());
  all.push(muted("Bu rapor tüm DB-tabanlı ürün-stok kategorilerini (Doğaltaş, Yağ, Sabun/Krem, Aksesuar, Diğer) kapsar. Stok değerine yalnız pozitif stok katkı sağlar."));

  // ── Bölüm 2: Kritik / Tükenmiş (all modda da göster) ──
  if (criticalAll.length > 0 && exportMode !== "critical") {
    all.push(h1Colored("2. Kritik & Tükenmiş Stok Uyarısı", C_CRIT));
    all.push(muted(`${criticalAll.length} ürün kritik seviyede veya tükenmiş`));
    all.push(spacer());
    all.push(twoColTable(
      criticalAll.map((r) => [
        `${r.name} (${r.categoryLabel})`,
        fmtStock(r) + (r.subtitle ? ` · ${r.subtitle}` : ""),
      ] as [string, string]),
    ));
  }

  // ── Bölüm 3 (veya 2 kritik modda): Kategori bazlı ürün listesi ──
  const listSectionN = exportMode === "critical" ? 2 : (criticalAll.length > 0 ? 3 : 2);
  all.push(h1Colored(`${listSectionN}. Ürün Listesi`, C_STOK, true));
  all.push(muted(`${reportRows.length} ürün · kategoriye göre gruplu`));
  all.push(spacer());

  let globalN = 0;
  let sectionShown = 0;
  for (const cat of CATEGORY_ORDER) {
    const catRows = reportRows.filter((r) => r.category === cat);
    if (!catRows.length) continue;
    if (sectionShown > 0) all.push(divider());
    sectionShown++;
    all.push(h2(CATEGORY_LABELS[cat]));
    all.push(muted(`${catRows.length} ürün`));

    for (const row of catRows) {
      globalN++;
      const critical = isCritical(row);
      all.push(profileLabel(
        `${critical ? (row.stock <= 0 ? "⚠ TÜKENMİŞ — " : "⚠ KRİTİK — ") : ""}ÜRÜN #${String(globalN).padStart(3, "0")}`,
        critical ? C_CRIT : C_STOK,
      ));
      all.push(h3(row.name));
      all.push(twoColTable([
        ["Mevcut Stok", fmtStock(row) + (critical && row.stock > 0 ? " ⚠ Kritik" : "")],
        ...(row.subtitle ? [["Tür / Grup", row.subtitle] as [string, string]] : []),
        ...(row.unitCost > 0 ? [["Birim Maliyet", fmtMoney(row.unitCost)] as [string, string]] : []),
        ...(row.stockValue > 0 ? [["Tahmini Değer", fmtMoney(row.stockValue)] as [string, string]] : []),
      ]));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Ürün & Stok Raporu · ${exportLabel}`) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = exportMode === "critical" ? "kritik" : "tumu";
  const filename = `urun-stok-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
