// Astroloji Aşama 8 — kayıtlı analiz raporu (Word / PDF) servis katmanı. YALNIZ SUNUCU.
//
// Güvenlik: rapor verisi YALNIZ getAnalysis üzerinden okunur → tenant + uzman sahipliği (owner_user_id),
// GÜNCEL Roxy yorum yetkisi (yetkisizse yorum kolonu DB'den hiç okunmaz) ve owner önizleme kuralı
// aynen uygulanır. Rapor yeni hesap yapmaz, sağlayıcı (Roxy) çağırmaz, snapshot'a yazmaz.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import { getAnalysis, listAnalyses } from "../analyses/service";
import type { EngineCtx } from "../engine/service";
import { renderWheelPng } from "./chartPng";
import { DOCX_MIME, renderAstroReportDocx } from "./docx";
import { buildAstroReport, buildCombinedAstroReport, type AstroReport, type ReportAnalysisInput } from "./model";
import { buildAstroReportPdf } from "./pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "./symbolFontData";

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
    const buf = await renderAstroReportDocx(report, chart?.png ?? null, symbolFontBuffers());
    return { ok: true, bytes: new Uint8Array(buf), filename: `${report.fileBase}.docx`, contentType: DOCX_MIME, hasInterpretation: report.hasInterpretation, hasChart: !!chart };
  }
  const bytes = buildAstroReportPdf(report, chart, anamnezPdfFontBase64(), symbolFontsBase64());
  return { ok: true, bytes, filename: `${report.fileBase}.pdf`, contentType: PDF_MIME, hasInterpretation: report.hasInterpretation, hasChart: !!chart };
}

// ─── 2026-10-12 (UAT 2. tur, madde L): seçili / tüm analizler TEK Word / TEK PDF ───────────────────────

/** Tek dosyada en çok analiz (sunucu süresi + dosya boyutu sınırı). */
export const COMBINED_REPORT_MAX = 30;

const isUuidLike = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const err = (status: number, code: string, error: string): ReportResult => ({ ok: false, status, body: { ok: false, code, error } });

function chartImages(report: AstroReport, widthPx: number) {
  return report.blocks.filter((b) => b.kind === "chart").map((b) => (b.kind === "chart" ? renderWheelPng(b.chart, widthPx) : null));
}

/**
 * Bir danışan profilinin SEÇİLİ (ids) ya da TÜM kayıtlı analizlerini tek rapora dizer. Her analiz getAnalysis ile
 * okunur (tenant + uzman sahipliği + güncel yorum yetkisi aynen); 0 sağlayıcı isteği, yeni hesap yok, kayda yazım yok.
 * Profil karışması engellenir: her analizin profileId'si istenen profille AYNI olmalı (aksi 400, dosya üretilmez).
 */
export async function buildCombinedAnalysisReport(
  ctx: EngineCtx,
  input: { profileId: unknown; ids?: unknown; all?: unknown },
  format: ReportFormat,
  ownerPreviewHideInterp: boolean,
): Promise<ReportResult> {
  if (!isUuidLike(input.profileId)) return err(400, "INVALID_PROFILE", "Geçerli danışan profili gerekli.");
  const profileId = input.profileId;
  let ids: string[];
  const scope: "selected" | "all" = input.all === true ? "all" : "selected";
  if (scope === "all") {
    ids = [];
    for (let offset = 0; ; offset += 100) {
      const l = await listAnalyses(ctx, profileId, new URLSearchParams({ limit: "100", offset: String(offset) }));
      if (l.status !== 200) return { ok: false, status: l.status, body: l.body as Record<string, unknown> };
      const body = l.body as { analyses: { id: string }[]; hasMore: boolean; total: number };
      if (body.total > COMBINED_REPORT_MAX) return err(413, "TOO_MANY_ANALYSES", `Tek dosyada en çok ${COMBINED_REPORT_MAX} analiz indirilebilir; bu danışanda ${body.total} analiz var. Lütfen analizleri seçerek indirin.`);
      ids.push(...body.analyses.map((a) => a.id));
      if (!body.hasMore) break;
    }
    if (!ids.length) return err(404, "NO_ANALYSES", "Bu danışanın kayıtlı analizi yok.");
  } else {
    if (!Array.isArray(input.ids) || !input.ids.every(isUuidLike)) return err(400, "INVALID_IDS", "Seçili analiz listesi geçersiz.");
    ids = [...new Set(input.ids as string[])];
    if (!ids.length) return err(400, "EMPTY_SELECTION", "En az bir analiz seçin.");
    if (ids.length > COMBINED_REPORT_MAX) return err(413, "TOO_MANY_ANALYSES", `Tek dosyada en çok ${COMBINED_REPORT_MAX} analiz indirilebilir.`);
  }
  const items: ReportAnalysisInput[] = [];
  for (const id of ids) {
    const r = await getAnalysis(ctx, id, ownerPreviewHideInterp);
    if (r.status !== 200) return { ok: false, status: r.status, body: r.body as Record<string, unknown> };
    const a = (r.body as { analysis: ReportAnalysisInput & { profileId?: string } }).analysis;
    if (a.profileId !== profileId) return err(400, "MIXED_PROFILE", "Seçili analizler aynı danışan profiline ait olmalı.");
    items.push(a);
  }
  // Bölüm sırası: kayıt tarihine göre eskiden yeniye (genelde Natal önce); aynı anda kaydedilenler listedeki sırayı korur.
  items.sort((x, y) => String(x.analysisAt).localeCompare(String(y.analysisAt)));
  const today = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const report = buildCombinedAstroReport(items, scope, today);
  const charts = chartImages(report, 1000);
  const hasChart = charts.some(Boolean);
  if (format === "docx") {
    const buf = await renderAstroReportDocx(report, charts.map((c) => c?.png ?? null), symbolFontBuffers());
    return { ok: true, bytes: new Uint8Array(buf), filename: `${report.fileBase}.docx`, contentType: DOCX_MIME, hasInterpretation: report.hasInterpretation, hasChart };
  }
  const bytes = buildAstroReportPdf(report, charts, anamnezPdfFontBase64(), symbolFontsBase64());
  return { ok: true, bytes, filename: `${report.fileBase}.pdf`, contentType: PDF_MIME, hasInterpretation: report.hasInterpretation, hasChart };
}
