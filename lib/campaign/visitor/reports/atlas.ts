/**
 * KAMPANYA MERKEZİ — Gökyüzü Atlası ziyaretçi raporu (Word). YALNIZ SUNUCU; 0 sağlayıcı çağrısı, 0 DB, kayıt yok.
 *
 * Mevcut ortak rapor hattı DEĞİŞTİRİLMEDEN kullanılır: buildTechniqueView (uzman ekranıyla AYNI maske / yorum kuralları,
 * natal klasik ev düzeltmesi dahil) → buildAstroReport (saf model) → çark / Vedik-KP figürü PNG (resvg) → renderAstroReportDocx.
 * Girdi: ziyaretçinin bu istekte hesaplanan teknik sonucu + bellek içi doğum revizyonu. Kampanya farkları:
 *   - Uzman notları, Bilgi Bankası ve kayıt künyesi bölümleri rapordan ÇIKARILIR (kampanyada bu veriler yok / gizli);
 *     yerine "Rapor bilgisi" bölümü (aynı istekte hesap, kayıt oluşturulmadı) eklenir.
 *   - Yorum katmanı yalnız Owner modül + teknik anahtarları açıksa; kapalıysa model yorum bölümünü hiç kurmaz.
 *   - Kapakta "Danışan" yerine "Kişi"; uzman kaydına atıf yapan sabit cümle kampanya diline uyarlanır (yalnız .docx metni).
 * PDF sunulmaz: ortak PDF işleyicisinin sabit "kayıtlı analizden" cümlesi uzman koduna dokunmadan değiştirilemez ve yanıt
 * boyutu sınırı (Word + görseller) korunur.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { buildTechniqueView, type ResultRowLike } from "@/lib/astrology/view/techniqueView";
import { publicRevision } from "@/lib/astrology/view/natalView";
import { buildAstroReport, type AstroReport, type ReportBlock } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { renderWheelPng } from "@/lib/astrology/report/chartPng";
import { renderFigurePng } from "@/lib/astrology/report/figurePng";
import { symbolFontBuffers } from "@/lib/astrology/report/symbolFontData";
import { buildHoraryReport, horaryWheelInput } from "@/lib/astrology/horary/westernReport";
import type { WesternHoraryResult } from "@/lib/astrology/horary/westernRun";
import type { RevisionRow } from "@/lib/astrology/persistence/repo";
import { campaignFilename, rewriteDocxText, toReportFile, type ReportFile } from "./files";
import { isEvaluative } from "../evaluative";

assertServerOnly("lib/campaign/visitor/reports/atlas");

/** Kampanya raporundan çıkarılan (uzman / kayıt) bölüm başlıkları — h1 başlığından bir sonraki h1'e kadar. */
export const ATLAS_DROP_SECTIONS: readonly string[] = ["Uzman notları", "Bilgi Bankası", "Kayıt bilgisi"];
export const ATLAS_DOCX_REWRITE: readonly (readonly [string, string])[] = [
  ["Danışan:  ", "Kişi:  "],
  ["Danışan", "Kişi"],
  ["Rapor Yaşam Sistemi Astroloji modülünde, kayıtlı analizden oluşturulmuştur.", "Rapor Yaşam Sistemi Gökyüzü Atlası'nda, ücretsiz analizin hesap sonucundan oluşturulmuştur."],
];
export const ATLAS_REPORT_INFO =
  "Bu rapor, ücretsiz analizde ekranda gösterilen hesap sonucundan aynı anda üretilmiştir. Rapor için ayrıca hesap yapılmamış, girdiler ve sonuç kaydedilmemiştir. Yorumlar (varsa) hesaplama altyapısının genel metinleridir; kişiye özel uzman değerlendirmesi değildir.";

export function stripExpertSections(blocks: readonly ReportBlock[]): ReportBlock[] {
  const out: ReportBlock[] = [];
  let skipping = false;
  for (const b of blocks) {
    if (b.kind === "heading" && b.level === 1) skipping = ATLAS_DROP_SECTIONS.includes(b.text);
    if (!skipping) out.push(b);
  }
  return out;
}

/** Model metinlerindeki uzman kaydı atıfları (ör. figür açıklaması "kayıtlı analizden çizilmiştir") → kampanya dili. */
const fixText = (t: string) =>
  /Kendi Yorumum/.test(t)
    ? "Bu analiz türünde otomatik yorum bulunmuyor; rapor yalnız teknik hesaplama sonuçlarını içerir. Kişiye özel değerlendirme profesyonel üyelikte uzmanınızla yapılır."
    : t.replace(/kayıtlı analizden/g, "bu analizin hesap sonucundan").replace(/kayıtlı veriden/g, "bu analizin hesap sonucundan");

/** Çark açıklamasındaki renk anlamı (değerlendirme dili) → nötr ifade. */
const WHEEL_LEGEND_FROM = "Açı çizgileri: mavi uyumlu, kırmızı zorlayıcı, gri nötr; kesikli çizgi minör açı.";
const WHEEL_LEGEND_TO = "Açı çizgilerinin rengi açı grubunu gösterir; kesikli çizgi minör açı.";

/**
 * D-2: yorum KAPALI → değerlendirme içeren kv satırı, tablo sütunu (ilk sütun hariç; ilk sütun değerlendirmeyse satır),
 * madde ve paragraf çıkarılır; başlıklar ve hesap verisi kalır.
 */
export function scrubEvaluativeReport(blocks: readonly ReportBlock[]): ReportBlock[] {
  const out: ReportBlock[] = [];
  for (const b0 of blocks) {
    const b: ReportBlock = b0.kind === "chart" ? { ...b0, caption: b0.caption.replace(WHEEL_LEGEND_FROM, WHEEL_LEGEND_TO) } : b0;
    if (b.kind === "kv") {
      const rows = b.rows.filter(([k, v]) => !isEvaluative(k) && !isEvaluative(v));
      if (rows.length) out.push({ ...b, rows });
    } else if (b.kind === "table") {
      const t = b.table;
      const keep = t.columns.map((c, i) => i === 0 || !(isEvaluative(c) || t.rows.some((r) => isEvaluative(r[i]))));
      const columns = t.columns.filter((_, i) => keep[i]);
      const rows = t.rows.map((r) => r.filter((_, i) => keep[i])).filter((r) => !isEvaluative(r[0]));
      const widths = t.widths ? t.widths.filter((_, i) => keep[i]) : undefined;
      out.push({ ...b, table: { ...t, columns, rows, ...(widths ? { widths } : {}) }, ...(b.caption && isEvaluative(b.caption) ? { caption: undefined } : {}) });
    } else if (b.kind === "bullets") {
      const items = b.items.filter((x) => !isEvaluative(x));
      if (items.length) out.push({ ...b, items });
    } else if (b.kind === "para") {
      if (!isEvaluative(b.text)) out.push(b);
    } else if (b.kind === "chart") {
      out.push(isEvaluative(b.caption) ? { ...b, caption: "" } : b);
    } else out.push(b);
  }
  return out;
}

function campaignizeReport(r: AstroReport, now: Date, commentsEnabled = true): AstroReport {
  const base = commentsEnabled ? stripExpertSections(r.blocks) : scrubEvaluativeReport(stripExpertSections(r.blocks));
  const blocks = base.map((b): ReportBlock => {
    if (b.kind === "para" || b.kind === "heading") return { ...b, text: fixText(b.text) };
    if (b.kind === "chart") return { ...b, caption: fixText(b.caption) };
    if (b.kind === "table") return { ...b, ...(b.caption ? { caption: fixText(b.caption) } : {}) };
    // Kampanyada danışan yok: "Danışan" satırı (değer "—") çıkarılır.
    if (b.kind === "kv") return { ...b, rows: b.rows.filter(([k]) => k !== "Danışan") };
    return b;
  });
  blocks.push({ kind: "heading", level: 1, text: "Rapor bilgisi" });
  blocks.push({ kind: "kv", rows: [["Rapor tarihi", now.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })], ["Kaynak", "Ücretsiz analiz (kayıt oluşturulmadı)"]] });
  blocks.push({ kind: "para", text: ATLAS_REPORT_INFO, tone: "muted" });
  return { ...r, blocks };
}

type ChartImg = { png: Buffer; width: number; height: number };
async function chartOf(r: AstroReport): Promise<ChartImg | null> {
  const b = r.blocks.find((x) => x.kind === "chart");
  if (!b || b.kind !== "chart") return null;
  if ("chart" in b) return renderWheelPng(b.chart, 1200);
  const f = await renderFigurePng(b.figure, 1200);
  return "error" in f ? null : f;
}

export type AtlasReportInput = {
  technique: string;
  title: string;
  options: Record<string, unknown>;
  technical: unknown;
  /** Birim başına sağlayıcı yorumu (yalnız yorumlar açıksa; kapalıyken verilmez). */
  interpretations: (Record<string, unknown> | null)[] | null;
  combineInterpretation?: (parts: Record<string, unknown>[]) => Record<string, unknown>;
  me: RevisionRow;
  partner: RevisionRow | null;
  commentsEnabled: boolean;
  now: Date;
  dayTr: string;
};

/** Teknik + yorum → kampanya Word raporu (çark / figür PNG gömülü). Görsel üretilemezse rapor görselsiz üretilir. */
export async function buildAtlasReport(i: AtlasReportInput): Promise<{ files: ReportFile[]; hasInterpretation: boolean; hasChart: boolean }> {
  const row: ResultRowLike = {
    id: "kampanya", technique: i.technique, provider: "roxy", provider_api_version: "", adapter_version: "", projection_version: "",
    technical: (i.technical ?? {}) as Record<string, unknown>, created_at: i.now.toISOString(),
  } as ResultRowLike;
  const view = buildTechniqueView({
    technique: i.technique,
    rows: [row],
    combined: i.technical,
    options: i.options,
    timeKnowledge: { primary: true, partner: i.partner ? true : null },
    visibility: i.commentsEnabled ? { visible: true } : { visible: false, reason: "not_entitled" },
    interpretations: i.commentsEnabled ? (i.interpretations ?? []).map((c) => (c ? { provider: "roxy", lang: "tr", content: c } : null)) : null,
    combineInterpretation: i.combineInterpretation,
  });
  const report = buildAstroReport({
    id: "kampanya",
    title: i.title,
    technique: i.technique,
    params: i.options,
    analysisAt: i.now.toISOString(),
    profile: { label: "Ücretsiz analiz", client: null, revision: publicRevision(i.me), ...(i.partner ? { partner: { label: "2. kişi", client: null, revision: publicRevision(i.partner) } } : {}) },
    method: { ...view.method, warnings: view.warnings, timeUnknownMasked: view.timeUnknownMasked },
    technical: view.technical,
    knowledgeBank: [],
    notes: [],
    interpretation: i.commentsEnabled ? view.interpretation : { visible: false, reason: "not_entitled" },
    versions: {},
  });
  const r = campaignizeReport(report, i.now, i.commentsEnabled);
  const chart = await chartOf(r);
  const docx = await renderAstroReportDocx(r, chart?.png ?? null, symbolFontBuffers());
  const { buffer } = await rewriteDocxText(docx, ATLAS_DOCX_REWRITE);
  const stem = `gokyuzu-atlasi-${i.technique.replace(/[^a-z0-9]+/gi, "-")}`;
  return { files: [toReportFile("docx", campaignFilename(stem, i.dayTr, "docx"), buffer, "Word raporu")], hasInterpretation: r.hasInterpretation, hasChart: !!chart };
}

/** Lilly horary: mevcut saf rapor modeli (soru metni ASLA verilmez — cihazda kalır; demo değil; kayıt künyesi yok). */
export async function buildLillyReport(res: WesternHoraryResult, now: Date, dayTr: string): Promise<ReportFile[]> {
  const report = buildHoraryReport(res, { question: null, demo: false, generatedAt: now.toISOString() });
  // Lilly: otomatik hüküm / yorum katmanı yok → her zaman yorum kapalı politikası (D-2).
  const r = campaignizeReport({ ...report, cover: { ...report.cover, client: "Ücretsiz analiz" } }, now, false);
  const chart = renderWheelPng(horaryWheelInput(res), 1200);
  const docx = await renderAstroReportDocx(r, chart?.png ?? null, symbolFontBuffers());
  const { buffer } = await rewriteDocxText(docx, ATLAS_DOCX_REWRITE);
  return [toReportFile("docx", campaignFilename("horary-lilly", dayTr, "docx"), buffer, "Word raporu")];
}
