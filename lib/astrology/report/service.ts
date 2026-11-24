// Astroloji Aşama 8 — kayıtlı analiz raporu (Word / PDF) servis katmanı. YALNIZ SUNUCU.
//
// Güvenlik: rapor verisi YALNIZ getAnalysis üzerinden okunur → tenant + uzman sahipliği (owner_user_id),
// GÜNCEL Roxy yorum yetkisi (yetkisizse yorum kolonu DB'den hiç okunmaz) ve owner önizleme kuralı
// aynen uygulanır. Rapor yeni hesap yapmaz, sağlayıcı (Roxy) çağırmaz, snapshot'a yazmaz.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import type { ExpertBranding } from "@/lib/docx/expertBranding";
import { getAnalysis, listAnalyses } from "../analyses/service";
import type { EngineCtx } from "../engine/service";
import { renderWheelPng } from "./chartPng";
import { renderFigurePng } from "./figurePng";
import { DOCX_MIME, renderAstroReportDocx } from "./docx";
import { buildAstroReport, buildCombinedAstroReport, type AstroReport, type ReportAnalysisInput, type ReportBlock } from "./model";
import { buildAstroReportPdf } from "./pdf";
import { COMBINED_REPORT_MAX } from "./limits";
import { symbolFontBuffers, symbolFontsBase64 } from "./symbolFontData";

assertServerOnly("lib/astrology/report/service");

export type ReportFormat = "docx" | "pdf";
export const PDF_MIME = "application/pdf";

export type ReportResult =
  | { ok: true; bytes: Uint8Array; filename: string; contentType: string; hasInterpretation: boolean; hasChart: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

type ChartImg = { png: Buffer; width: number; height: number };

/**
 * Bir "chart" bloğunun PNG'si: batı çarkı (wheelSvg) ya da Vedik/KP figürü (figurePng). Üretilemezse null → Word/PDF
 * harita yerinde açık not gösterir (başka analizin görseli ASLA kullanılmaz) ve hata sunucu günlüğüne yazılır
 * (yalnız teknik + kısa neden; kişisel veri yok).
 */
async function renderChartBlock(block: Extract<ReportBlock, { kind: "chart" }>, widthPx: number, technique: string, natalWidthPx = widthPx): Promise<ChartImg | null> {
  if ("chart" in block) {
    // G3: Natal çarkı 170 mm'de basılır → baskı çözünürlüğü için daha geniş PNG (tekli 2000 px ≈ 300 dpi).
    const png = renderWheelPng(block.chart, block.chart.natal ? natalWidthPx : widthPx);
    if (!png) console.error(`[astro-report] harita görseli üretilemedi (${technique}, çark)`);
    return png;
  }
  const r = await renderFigurePng(block.figure, widthPx);
  if ("error" in r) {
    console.error(`[astro-report] harita görseli üretilemedi (${technique}, ${block.figure.type}): ${r.error}`);
    return null;
  }
  return r;
}

/**
 * F3B — rapor markalaması seçeneği. `loadBranding` yalnız rapor verisi doğrulandıktan SONRA bir kez çağrılır; Word ve PDF
 * AYNI sonucu kullanır. Verilmezse (arşiv / kampanya / testler) rapor bugünküyle birebir.
 */
export type AstroReportBrandingLoader = { loadBranding?: () => Promise<ExpertBranding | null> };

async function loadBrandingSafe(opts: AstroReportBrandingLoader): Promise<ExpertBranding | null> {
  if (!opts.loadBranding) return null;
  try {
    return await opts.loadBranding();
  } catch {
    return null;
  }
}

export async function buildAnalysisReport(ctx: EngineCtx, id: string, format: ReportFormat, ownerPreviewHideInterp: boolean, opts: AstroReportBrandingLoader = {}): Promise<ReportResult> {
  const r = await getAnalysis(ctx, id, ownerPreviewHideInterp);
  if (r.status !== 200) return { ok: false, status: r.status, body: r.body as Record<string, unknown> };
  const analysis = (r.body as { analysis: ReportAnalysisInput }).analysis;
  const report = buildAstroReport(analysis);
  const chartBlock = report.blocks.find((b) => b.kind === "chart");
  // G3: Natal çarkı 2000 px (170 mm ≈ 300 dpi); diğer çarklar önceki gibi 1200 px.
  const chart = chartBlock && chartBlock.kind === "chart" ? await renderChartBlock(chartBlock, 1200, analysis.technique, 2000) : null;
  // G3 (2026-11-23): YALNIZ Batı Natal — yoğun burç derece cetveli ayrı "chart" (figür) blok(lar)ı; çarktan SONRA aynı sırada
  // çizilir (170 mm ≈ 300 dpi için 2000 px). Diğer teknikler önceki gibi tek görsel.
  const rest = analysis.technique === "western.natal" ? report.blocks.filter((b): b is Extract<ReportBlock, { kind: "chart" }> => b.kind === "chart").slice(1) : [];
  const charts = rest.length ? [chart, ...(await Promise.all(rest.map((b) => renderChartBlock(b, 2000, analysis.technique))))] : null;
  const branding = await loadBrandingSafe(opts);
  if (format === "docx") {
    const buf = await renderAstroReportDocx(report, charts ? charts.map((c) => c?.png ?? null) : (chart?.png ?? null), symbolFontBuffers(), { branding });
    return { ok: true, bytes: new Uint8Array(buf), filename: `${report.fileBase}.docx`, contentType: DOCX_MIME, hasInterpretation: report.hasInterpretation, hasChart: !!chart };
  }
  const bytes = buildAstroReportPdf(report, charts ?? chart, anamnezPdfFontBase64(), symbolFontsBase64(), { branding });
  return { ok: true, bytes, filename: `${report.fileBase}.pdf`, contentType: PDF_MIME, hasInterpretation: report.hasInterpretation, hasChart: !!chart };
}

// ─── 2026-10-12 (UAT 2. tur, madde L): seçili / tüm analizler TEK Word / TEK PDF ───────────────────────

/** Tek dosyada en çok analiz (sunucu süresi + dosya boyutu sınırı) — değer limits.ts'te (istemci düğmeleriyle ortak). */
export { COMBINED_REPORT_MAX };

const isUuidLike = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const err = (status: number, code: string, error: string): ReportResult => ({ ok: false, status, body: { ok: false, code, error } });

/**
 * YENİ-P2-01 (2026-10-20): toplu rapor tek parça döner; platform yanıt sınırı (Vercel 4,5 MB) aşılırsa kullanıcı JSON'suz bir
 * hata ve yalnız "Rapor oluşturulamadı." görüyordu. Ölçüm: en ağır türlerden 30 analiz 5,35 MB Word / 5,62 MB PDF; karışık 30
 * analiz ~2,4–2,6 MB. Sınırın altında güvenlik payıyla kapı → anlaşılır 413 ve önerilen analiz sayısı.
 */
export const COMBINED_REPORT_MAX_BYTES = 4_200_000;
export function combinedReportTooLarge(byteLength: number, analysisCount: number): ReportResult | null {
  if (byteLength <= COMBINED_REPORT_MAX_BYTES) return null;
  const mb = (byteLength / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  const suggest = Math.max(1, Math.floor((analysisCount * 4_000_000) / byteLength));
  return err(413, "REPORT_TOO_LARGE", `Dosya tek seferde indirilemeyecek kadar büyük (~${mb} MB). Lütfen daha az analiz seçin (bu seçim için en çok yaklaşık ${suggest} analiz) ya da analizleri birkaç dosyaya bölün.`);
}

/** Toplu rapor: "chart" bloklarıyla AYNI sırada görseller (her blok kendi analizinin kayıtlı verisinden). */
async function chartImages(report: AstroReport, widthPx: number): Promise<(ChartImg | null)[]> {
  const out: (ChartImg | null)[] = [];
  // G3: toplu raporda Natal çarkı 1200 px (170 mm ≈ 180 dpi) — dosya boyutu sınırı (4,2 MB) için tekli rapordaki 2000 px yerine.
  for (const b of report.blocks) if (b.kind === "chart") out.push(await renderChartBlock(b, widthPx, "toplu rapor", 1200));
  return out;
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
  opts: AstroReportBrandingLoader = {},
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
      const body = l.body as { analyses: { id: string; locked?: boolean }[]; hasMore: boolean; total: number };
      if (body.total > COMBINED_REPORT_MAX) return err(413, "TOO_MANY_ANALYSES", `Tek dosyada en çok ${COMBINED_REPORT_MAX} analiz indirilebilir; bu danışanda ${body.total} analiz var. Lütfen analizleri seçerek indirin.`);
      // 2026-11-03: "tümü" kapsamında izni kapalı tekniklerin analizleri atlanır (seçili kapsamda getAnalysis 403 döner).
      ids.push(...body.analyses.filter((a) => a.locked !== true).map((a) => a.id));
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
  const charts = await chartImages(report, 1000);
  const hasChart = charts.some(Boolean);
  const branding = await loadBrandingSafe(opts);
  if (format === "docx") {
    const buf = await renderAstroReportDocx(report, charts.map((c) => c?.png ?? null), symbolFontBuffers(), { branding });
    const tooLarge = combinedReportTooLarge(buf.byteLength, items.length);
    if (tooLarge) return tooLarge;
    return { ok: true, bytes: new Uint8Array(buf), filename: `${report.fileBase}.docx`, contentType: DOCX_MIME, hasInterpretation: report.hasInterpretation, hasChart };
  }
  const bytes = buildAstroReportPdf(report, charts, anamnezPdfFontBase64(), symbolFontsBase64(), { branding });
  const tooLarge = combinedReportTooLarge(bytes.byteLength, items.length);
  if (tooLarge) return tooLarge;
  return { ok: true, bytes, filename: `${report.fileBase}.pdf`, contentType: PDF_MIME, hasInterpretation: report.hasInterpretation, hasChart };
}
