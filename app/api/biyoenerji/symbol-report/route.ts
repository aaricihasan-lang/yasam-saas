import { NextRequest } from "next/server";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { readBioReportRows } from "@/lib/biyoenerji/reportRead";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  reportRateLimit,
  MAX_EXPORT_RECORDS,
  MAX_SELECTED_IDS,
} from "@/lib/biyoenerji/reportSecurity";
import {
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  buildStatsPage,
  divider,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "@/lib/docx/premiumToc";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { sanitizeBioenergyRow, sanitizeBioenergyXmlText } from "@/lib/biyoenerji/xmlSafeText";

import { reportFileDate } from "@/lib/time/reportTime";
import { resolveReportLocale } from "@/lib/i18n/reportLocale";
// I18N-F1-R5 RAPOR-E (P22): sistem metinleri reports.bioenergy.* (çıktı dili; TR birebir — golden). Kayıt içeriği çevrilmez.
import { bioTextFor } from "@/lib/biyoenerji/reportText";

/** A1 — hazırlayan adı da XML-güvenli. */
function safeExpertName(profile: Record<string, unknown> | null | undefined): string | null {
  const n = expertDisplayName(profile);
  return n === null ? null : sanitizeBioenergyXmlText(n);
}

export const runtime = "nodejs";

const C_SEMBOL = "059669"; // emerald-600

type ExportMode = "all" | "selected" | "single";

type SymbolRow = {
  id: string;
  tenant_id: string;
  symbol: string | null;
  title: string | null;
  category: string | null;
  meaning: string | null;
  source: string | null;
  created_at: string;
};

// created_at (timestamptz) → Europe/Istanbul takvim günü (FA-02): B.dateLong (çıktı dilinde).

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export async function POST(request: NextRequest): Promise<Response> {
  // GÜVENLİK: kimlik yalnızca sunucu tarafında x-user-id + x-session-token
  // (requireModuleAccess) ile belirlenir. Body'deki tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.

  const guard = await requireModuleAccess(request, "energy_body");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // FAZ1: best-effort rate-limit (asıl koruma aşağıdaki HARD CAP'tir).
  const rl = reportRateLimit("symbol", tenantId);
  if (rl) return rl;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, code: "BIO_INVALID_BODY", error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", ids, id } = body as {
    exportMode?: ExportMode;
    ids?: string[];
    id?: string;
  };

  // AA-6: route kendi service_role client'ını KURMAZ — guard'ın sunucu client'ı (guard.db).
  const { db } = guard;
  const B = bioTextFor(await resolveReportLocale(request, { db, tenantId, userId: guard.userId }));
  const C = B.t;

  // BIO-01 + A4-A — sayfalı, sayım doğrulamalı okuma; seçili modda uzun id listesi parçalı
  // okunur, eksik kayıt varsa rapor üretilmez (lib/biyoenerji/reportRead).
  const read = await readBioReportRows<Record<string, unknown>>({
    db,
    table: "bioenergy_symbols",
    select: "id,tenant_id,symbol,title,category,meaning,source,created_at",
    tenantId,
    orderCol: "created_at",
    orderAsc: false,
    maxRows: MAX_EXPORT_RECORDS,
    mode:
      exportMode === "single" && id
        ? "single"
        : exportMode === "selected" && Array.isArray(ids) && ids.length > 0
          ? "selected"
          : "all",
    singleId: id ?? null,
    ids: Array.isArray(ids) ? ids : null,
    maxSelected: MAX_SELECTED_IDS,
  });
  if (!read.ok && read.status !== 500) {
    return Response.json({ ok: false, error: read.error }, { status: read.status });
  }
  const data = read.ok ? read.rows : [];
  const error = read.ok ? null : (read.cause ?? read.error);
  const truncatedRead = read.ok ? read.truncated : false;
  if (error) {
    console.error("[symbol-report] read failed:", error);
    await trackUsage(guard, request, { module: "energy_body", action: "action_failed", failedAction: "report_generated", subEntity: "symbol", errorClass: "server" });
    return Response.json({ ok: false, error: "Semboller okunamadı." }, { status: 500 });
  }

  // A1 — XML 1.0 geçersiz kontrol karakterleri (eski kayıtlar dahil) Word öncesi temizlenir.
  const rows = (data || []).map((r) => sanitizeBioenergyRow(r)) as SymbolRow[];
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için sembol kaydı bulunamadı." }, { status: 404 });

  const today = B.generated();
  const dateSlug = reportFileDate();
  const isSingle = exportMode === "single" || (exportMode === "selected" && rows.length === 1);

  const exportLabel =
    B.scope("symbol", isSingle ? "single" : exportMode === "selected" ? "selected" : "all", rows.length, rows[0]!.symbol || rows[0]!.title || "");

  const categories = new Set(rows.map((r) => r.category?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  const firstTitle = rows[0]?.symbol?.trim() || rows[0]?.title?.trim() || C("symbol.nameFallback");

  all.push(...buildPremiumCover({
    title1:   C("common.brand"),
    title2:   C("symbol.title"),
    subtitle: isSingle && rows[0]
      ? C("symbol.singleSubtitle", { name: firstTitle })
      : C("symbol.catalogSubtitle"),
    date:     C("common.generatedOn", { date: today }),
    stats: [
      { label: C("common.recordCount"), value: String(rows.length) },
      { label: C("common.category"), value: String(categories.size) },
      { label: C("common.scope"),  value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    [C("common.recordCount"), String(rows.length)],
    [C("common.category"), String(categories.size)],
    [C("common.scope"),  exportLabel],
  ], undefined, B.common));

  // İçindekiler: eski boş Word TOC alanı yerine STATİK + tıklanabilir girişler (gövde
  // başlıklarından toplanır, gövde bittikten sonra bu konuma yerleştirilir; başlık yoksa sayfa yok).
  const toc = new StaticTocCollector("bsym");
  const tocAt = all.length;

  if (truncatedRead) {
    all.push(muted(B.truncated(MAX_EXPORT_RECORDS)));
  }

  all.push(toc.h1Colored(C("symbol.heading"), C_SEMBOL, true));
  all.push(muted(B.records(rows.length)));
  all.push(spacer());

  rows.forEach((row, i) => {
    const displayTitle = row.symbol?.trim() || row.title?.trim() || C("symbol.unnamed");

    if (i > 0) all.push(divider());

    all.push(profileLabel(B.recordNo(i), C_SEMBOL));
    all.push(toc.h2(displayTitle));

    all.push(twoColTable([
      [C("common.date"),     B.dateLong(row.created_at)],
      [C("common.category"), row.category?.trim() || C("common.notSpecified")],
      ...(row.source?.trim() ? [[C("common.source"), row.source.trim()] as [string, string]] : []),
    ]));

    if (row.meaning?.trim()) { all.push(h3(C("symbol.meaning"))); all.push(bodyText(row.meaning.trim())); }
  });

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("biyoenerji", safeExpertName(guard.profile), B.common));

  all.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, B.common));

  const doc = new Document({
    ...toc.documentOptions(),
    ...B.styles(),
    sections: [{
      properties: {},
      footers: { default: buildFooter(C("symbol.footer"), { note: "biyoenerji", common: B.common }) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  // USAGE360: rapor YALNIZ docx başarıyla üretildikten sonra sayılır (hata yanıtları olay değildir).
  await trackUsage(guard, request, {
    module: "energy_body",
    action: "report_generated",
    subEntity: "symbol",
    resourceId: exportMode === "single" && typeof id === "string" ? id : null,
    itemCount: rows.length,
  });
  const filename = B.fileName("symbol", isSingle && (rows[0]?.symbol || rows[0]?.title) ? slugify(rows[0]!.symbol || rows[0]!.title || "") : null, exportMode, dateSlug);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
