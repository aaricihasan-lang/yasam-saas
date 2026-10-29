// Gökyüzü Atlası — Batı Horary Word / PDF üretimi (YALNIZ SUNUCU). Mevcut ortak işleyiciler kullanılır: wheelSvg → resvg PNG
// (chartPng), docx (renderAstroReportDocx), jsPDF + Geist/sembol yazı tipleri (buildAstroReportPdf). Veritabanı YOK; kayıt YOK.
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import { renderWheelPng } from "@/lib/astrology/report/chartPng";
import { DOCX_MIME, renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { buildHoraryReport, horaryWheelInput } from "./westernReport";
import type { WesternHoraryResult } from "./westernRun";

assertServerOnly("lib/astrology/horary/westernReportService");

export const PDF_MIME = "application/pdf";

export async function renderHoraryReport(
  r: WesternHoraryResult,
  format: "docx" | "pdf",
  opts: { question: string | null; demo: boolean; generatedAt: string },
): Promise<{ bytes: Uint8Array; filename: string; contentType: string; hasChart: boolean }> {
  const report = buildHoraryReport(r, opts);
  const chart = renderWheelPng(horaryWheelInput(r), 1200);
  if (!chart) console.error("[astro-horary-report] çark görseli üretilemedi");
  if (format === "docx") {
    const buf = await renderAstroReportDocx(report, chart?.png ?? null, symbolFontBuffers());
    return { bytes: new Uint8Array(buf), filename: `${report.fileBase}.docx`, contentType: DOCX_MIME, hasChart: !!chart };
  }
  const bytes = buildAstroReportPdf(report, chart, anamnezPdfFontBase64(), symbolFontsBase64());
  return { bytes, filename: `${report.fileBase}.pdf`, contentType: PDF_MIME, hasChart: !!chart };
}
