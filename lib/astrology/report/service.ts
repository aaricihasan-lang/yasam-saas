// Astroloji Aşama 8 — kayıtlı analiz raporu (Word / PDF) servis katmanı. YALNIZ SUNUCU.
//
// Güvenlik: rapor verisi YALNIZ getAnalysis üzerinden okunur → tenant + uzman sahipliği (owner_user_id),
// GÜNCEL Roxy yorum yetkisi (yetkisizse yorum kolonu DB'den hiç okunmaz) ve owner önizleme kuralı
// aynen uygulanır. Rapor yeni hesap yapmaz, sağlayıcı (Roxy) çağırmaz, snapshot'a yazmaz.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import { getAnalysis } from "../analyses/service";
import type { EngineCtx } from "../engine/service";
import { renderWheelPng } from "./chartPng";
import { DOCX_MIME, renderAstroReportDocx } from "./docx";
import { buildAstroReport, type ReportAnalysisInput } from "./model";
import { buildAstroReportPdf } from "./pdf";

assertServerOnly("lib/astrology/report/service");

export type ReportFormat = "docx" | "pdf";
export const PDF_MIME = "application/pdf";

export type ReportResult =
  | { ok: true; bytes: Uint8Array; filename: string; contentType: string; hasInterpretation: boolean; hasChart: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function buildAnalysisReport(ctx: EngineCtx, id: string, format: ReportFormat, ownerPreviewHideInterp: boolean): Promise<ReportResult> {
  const r = await getAnalysis(ctx, id, ownerPreviewHideInterp);
  if (r.status !== 200) return { ok: false, status: r.status, body: r.body as Record<string, unknown> };
  const analysis = (r.body as { analysis: ReportAnalysisInput }).analysis;
  const report = buildAstroReport(analysis);
  const chartBlock = report.blocks.find((b) => b.kind === "chart");
  const chart = chartBlock && chartBlock.kind === "chart" ? renderWheelPng(chartBlock.chart) : null;
  if (format === "docx") {
    const buf = await renderAstroReportDocx(report, chart?.png ?? null);
    return { ok: true, bytes: new Uint8Array(buf), filename: `${report.fileBase}.docx`, contentType: DOCX_MIME, hasInterpretation: report.hasInterpretation, hasChart: !!chart };
  }
  const bytes = buildAstroReportPdf(report, chart, anamnezPdfFontBase64());
  return { ok: true, bytes, filename: `${report.fileBase}.pdf`, contentType: PDF_MIME, hasInterpretation: report.hasInterpretation, hasChart: !!chart };
}
