/**
 * Stok Envanter Word Raporu
 *
 * KAPSAM: Yalnızca `dogaltas_inventory` tablosu (Supabase).
 * Yağ, sabun/krem, aksesuar ve "Diğer" kategorileri localStorage tabanlıdır;
 * server-side API bu kayıtlara erişemez ve rapora dahil edilmez.
 *
 * Kritik stok eşiği: adet <= 5 (liveStockLogic.ts CRITICAL_ADET sabiti ile aynı)
 */

import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
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

const CRITICAL_ADET = 5;

type ExportMode = "all" | "critical";

type DogaltasRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  adet: number;
  unit_cost_try: number;
  total_cost_try: number;
  adet_price: number;
};

function fmtMoney(n: number): string {
  if (!n || n <= 0) return "—";
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isCritical(adet: number): boolean {
  return adet > 0 && adet <= CRITICAL_ADET;
}

function computeUnitCost(row: DogaltasRow): number {
  if (row.unit_cost_try > 0) return row.unit_cost_try;
  if (row.total_cost_try > 0 && row.adet > 0) return row.total_cost_try / row.adet;
  return row.adet_price || 0;
}

function computeStockValue(row: DogaltasRow, unitCost: number): number {
  if (row.total_cost_try > 0) return row.total_cost_try;
  return unitCost * row.adet;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all" } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
  };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // GÜVENLIK: tenant_id filtresi zorunlu
  let query = db
    .from("dogaltas_inventory")
    .select("id, tenant_id, name, type, adet, unit_cost_try, total_cost_try, adet_price")
    .eq("tenant_id", tenantId)
    .gt("adet", 0)   // yalnızca stoğu olan ürünler
    .order("name");

  if (exportMode === "critical") {
    query = query.lte("adet", CRITICAL_ADET);
  }

  const { data, error } = await query;
  if (error)
    return Response.json({ ok: false, error: `Stok verisi okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as DogaltasRow[];
  if (!rows.length)
    return Response.json({
      ok: false,
      error: exportMode === "critical"
        ? "Kritik stokta ürün bulunamadı."
        : "Stokta ürün bulunamadı.",
    }, { status: 404 });

  // ─── İstatistikler ────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);

  let totalAdet = 0;
  let totalValue = 0;
  let criticalCount = 0;

  for (const row of rows) {
    const unitCost = computeUnitCost(row);
    totalAdet += row.adet;
    totalValue += computeStockValue(row, unitCost);
    if (isCritical(row.adet)) criticalCount++;
  }

  // Türe göre grupla
  const typeMap = new Map<string, DogaltasRow[]>();
  for (const row of rows) {
    const t = row.type?.trim() || "Türsüz";
    const list = typeMap.get(t);
    if (list) list.push(row); else typeMap.set(t, [row]);
  }
  const sortedTypes = Array.from(typeMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "tr-TR"));

  const exportLabel = exportMode === "critical" ? "Kritik Stok" : "Tüm Doğaltaş Stoku";

  const all: ReportChild[] = [];

  // ── Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   exportMode === "critical" ? "KRİTİK STOK RAPORU" : "DOĞALTAŞ STOK RAPORU",
    subtitle: `Doğaltaş Envanter Raporu · ${exportLabel}`,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Ürün Çeşidi",      value: String(rows.length) },
      { label: "Toplam Adet",       value: String(totalAdet) },
      { label: "Kritik Stok",       value: String(criticalCount) },
      { label: "Tahmini Stok Değeri", value: fmtMoney(totalValue) },
      { label: "Kapsam",            value: exportLabel },
    ],
  }));

  // ── Sistem özeti
  all.push(...buildStatsPage([
    ["Ürün Çeşidi",        String(rows.length)],
    ["Toplam Adet",         String(totalAdet)],
    ["Kritik Stok Sayısı", String(criticalCount)],
    ["Tahmini Stok Değeri", fmtMoney(totalValue)],
    ["Tür / Grup Sayısı",  String(sortedTypes.length)],
    ["Kapsam",             exportLabel],
    ["Not",                "Yalnızca Doğaltaş envanteri (Supabase). Diğer kategoriler yerel depolama tabanlıdır."],
  ]));

  // ── TOC
  all.push(...buildTOCPage());

  // ── Bölüm 1: Stok Özeti
  all.push(h1Colored("1. Stok Özeti", C_STOK, true));

  all.push(twoColTable([
    ["Toplam Ürün Çeşidi",   String(rows.length)],
    ["Toplam Adet",           String(totalAdet)],
    ["Kritik Stok Sayısı",   `${criticalCount} ürün (≤ ${CRITICAL_ADET} adet)`],
    ["Tahmini Stok Değeri",  fmtMoney(totalValue)],
    ["Tür / Grup Sayısı",    String(sortedTypes.length)],
    ["Rapor Kapsamı",        exportLabel],
  ]));

  all.push(spacer());
  all.push(muted("Not: Bu rapor yalnızca dogaltas_inventory tablosundaki Doğaltaş envanterini içerir. Yağ, sabun/krem, aksesuar ve diğer kategoriler yerel depolama (localStorage) tabanlıdır ve server-side raporda yer almaz."));

  // ── Bölüm 2: Kritik Stok (tüm modda bile göster, varsa)
  const criticalRows = exportMode === "all" ? rows.filter((r) => isCritical(r.adet)) : rows.filter((r) => isCritical(r.adet));
  if (criticalRows.length > 0 && exportMode !== "critical") {
    all.push(h1Colored("2. Kritik Stok Uyarısı", "dc2626"));
    all.push(muted(`${criticalRows.length} ürün kritik stok seviyesinde (≤ ${CRITICAL_ADET} adet)`));
    all.push(spacer());
    const critTable: [string, string][] = criticalRows.map((r) => [
      r.name,
      `${r.adet} adet · Tür: ${r.type || "—"}`,
    ]);
    all.push(twoColTable(critTable));
  }

  // ── Bölüm 3 (veya 2 kritik modda): Ürün Listesi
  const stockSectionN = exportMode === "critical" ? 2 : (criticalRows.length > 0 ? 3 : 2);
  all.push(h1Colored(`${stockSectionN}. Ürün Listesi`, C_STOK, true));
  all.push(muted(`${rows.length} ürün · türe göre gruplu`));
  all.push(spacer());

  let globalN = 0;
  sortedTypes.forEach(([typeName, typeRows], ti) => {
    if (ti > 0) all.push(divider());
    all.push(h2(typeName));
    all.push(muted(`${typeRows.length} ürün`));

    typeRows.forEach((row, ri) => {
      globalN++;
      const unitCost = computeUnitCost(row);
      const stockValue = computeStockValue(row, unitCost);
      const critical = isCritical(row.adet);

      all.push(profileLabel(
        `${critical ? "⚠ KRİTİK — " : ""}ÜRÜN #${String(globalN).padStart(3, "0")}`,
        critical ? "dc2626" : C_STOK,
      ));
      all.push(h3(row.name));
      all.push(twoColTable([
        ["Mevcut Stok",      `${row.adet} adet${critical ? " ⚠ Kritik" : ""}`],
        ["Tür",              row.type || "—"],
        ...(unitCost > 0 ? [["Birim Maliyet", fmtMoney(unitCost)] as [string, string]] : []),
        ...(stockValue > 0 ? [["Tahmini Değer", fmtMoney(stockValue)] as [string, string]] : []),
      ]));
    });
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Doğaltaş Stok Raporu · ${exportLabel}`) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = exportMode === "critical" ? "kritik" : "tumu";
  const filename = `dogaltas-stok-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
