/**
 * Klasik Numeroloji — Word raporu kurucuları (SAF; sunucu tarafında çağrılır).
 *
 * Girdi YALNIZ kayıtlı normalize analiz nesnesidir → Buffer. Bu dosyada sağlayıcı çağrısı, DB erişimi,
 * ağ / dosya IO'su YOKTUR. `provider_meta` kullanılmaz (sağlayıcı adı rapora giremez).
 *
 * Kurallar:
 *   • Yöntem adları "Pisagor (Batı)" / "Kalde (Cheiro)"; sağlayıcı yorumları "Klasik ekol yorumu" başlığıyla.
 *   • Her metin `safeText` + run düzeyinde `safeInline` ile temizlenir, uzunluk sınırlanır.
 *   • Taş önerileri: sembolik / geleneksel; tıbbi iddia yok; üç kaynak AYRI (haritanın önerdiği / titreşim
 *     (birebir ↔ kök) / gezegen). Yalnız beyaz listedeki alanlar (taş adı + gerekçe açıklaması) yazılır →
 *     kütüphane kaynak adı / lisans / iç kimlik rapora sızamaz.
 *   • Karşılaştırma raporunda iki ekol AYRI bölümlerdedir; birleşik / ortak sayı ÜRETİLMEZ.
 *   • Deterministik: rapor tarihi enjekte edilir; çekirdek özellikler (docProps/core.xml) bu tarihle yazılır.
 */
import { Document, Packer, Paragraph, type TextRun } from "docx";
import { getOutputTranslator, SOURCE_OUTPUT_LOCALE, type OutputLocale } from "@/lib/i18n/output";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import { expertFooterParagraph, expertSignatureBlock } from "@/lib/docx/expertBranding";
import {
  BRIDGE_LABELS,
  BUSINESS_RATING_LABELS,
  COMPOUND_NATURE_LABELS,
  CORE_NUMBER_LABELS,
  INTERPRETATION_HEADING,
  KARMIC_DEBT_LABEL,
  METHOD_LABELS,
  NUMBER_KIND_LABELS,
  VERIFICATION_LABELS,
} from "../labels";
import * as TR_LABELS from "../labels";
import type {
  BridgeResult,
  BusinessNameResult,
  ChaldeanPart,
  ChaldeanResult,
  ChartResult,
  CompatibilityResult,
  DualResult,
  MeaningBlock,
  Period,
  PersonalDayResult,
  DailyResult,
  Verification,
} from "../model";
import type { StoneMatchGroup, StoneMatchMethod, StoneMatchResult, StoneSuggestion } from "../stones/types";
import {
  AMBER_BG,
  badge,
  bullets,
  coverPage,
  dataTable,
  FONT,
  BODY,
  kvTable,
  noteBox,
  para,
  paraRuns,
  run,
  runningFooter,
  runningHeader,
  S_BODY,
  S_SMALL,
  SECONDARY,
  sectionHeading,
  spacer,
  subHeading,
  valueCards,
  INDIGO,
  LILA,
  MOR,
  type Block,
  type Cell,
} from "./primitives";
import { isObj, num, safeList, safeText, safeTrace, TEXT_CAP } from "./sanitize";
import {
  PERSON_REPORT_GROUPS,
  type ClassicReportRecord,
  type CommonReportOptions,
  type ComparisonOnlyItem,
  type ComparisonReportInput,
  type ComparisonStoneItem,
  type PersonReportGroup,
  type ReportVariant,
} from "./types";

export type { ClassicReportRecord, ComparisonReportInput, PersonReportGroup, ReportVariant } from "./types";

export type PersonReportOptions = CommonReportOptions & {
  variant: ReportVariant;
  /** Dahil edilecek bölüm grupları ('full' bunu yok sayar ve tümünü basar). Boş → mevcut tüm gruplar. */
  include?: readonly PersonReportGroup[];
  stones?: StoneMatchResult | null;
};

export type NamesReportOptions = CommonReportOptions & { variant?: ReportVariant };

// ── Sabit metinler ─────────────────────────────────────────────────────────────────────────────

export const CLASSIC_REPORT_FOOTER = "Kişisel farkındalık amaçlıdır · tıbbi, psikolojik, hukuki veya finansal tavsiye değildir";
export const CLASSIC_REPORT_DISCLAIMER =
  "Bu rapordaki sayılar seçilen klasik numeroloji yöntemleriyle hesaplanmıştır; yorumlar geleneksel yöntem yorumlarıdır ve kesin hüküm, öngörü ya da garanti içermez.";
export const STONE_REPORT_DISCLAIMER =
  "Taş önerileri numerolojinin sembolik ve geleneksel yorumlarına dayanır; tıbbi tanı, tedavi ya da sağlık önerisi değildir ve bir uzman değerlendirmesinin yerine geçmez.";
export const COMPARISON_NO_MERGE_NOTE =
  "İki yöntemin sayıları birleştirilmez ve tek bir sonuca indirgenmez; her sayı kendi yönteminin formülüyle okunmalıdır.";
export const SAME_NAME_DIFFERENT_FORMULA = "Aynı ad, farklı formül";

// ── I18N-F1-R5 (P37): çıktı dili metin katmanı ─────────────────────────────────────────────────
// Yok / kaynak dil → bugünkü Türkçe çıktı BAYT-EŞİT (golden: scripts/numeroloji/report-golden). Dil yalnız görünen
// metni seçer; hesap / snapshot / gelecek yıl gizleme kararına GİRMEZ. Kanonik kodlar (variant, group, technique,
// method, slot) yalnız etiketlenir. Sağlayıcı yorumları ve kayıt verisi (labelTr, açıklamalar) çevrilmez.

type Vars = Record<string, string | number>;
type RawT = (k: string, v?: Record<string, string>) => string;
type LabelSet = {
  METHOD_LABELS: Readonly<Record<string, string>> & typeof TR_LABELS.METHOD_LABELS;
  INTERPRETATION_HEADING: string;
  NUMBER_KIND_LABELS: Readonly<Record<string, string>> & typeof TR_LABELS.NUMBER_KIND_LABELS;
  COMPOUND_NATURE_LABELS: Readonly<Record<string, string>> & typeof TR_LABELS.COMPOUND_NATURE_LABELS;
  BUSINESS_RATING_LABELS: Readonly<Record<string, string>> & typeof TR_LABELS.BUSINESS_RATING_LABELS;
  VERIFICATION_LABELS: Readonly<Record<string, string>> & typeof TR_LABELS.VERIFICATION_LABELS;
  CORE_NUMBER_LABELS: Readonly<Record<string, string>> & typeof TR_LABELS.CORE_NUMBER_LABELS;
  BRIDGE_LABELS: Readonly<Record<string, string>> & typeof TR_LABELS.BRIDGE_LABELS;
  KARMIC_DEBT_LABEL: string;
};
type ClassicText = { out: OutputLocale; isSource: boolean; t: (key: string, vars?: Vars) => string; labels: LabelSet; dateTime: Intl.DateTimeFormat; date: Intl.DateTimeFormat };
const strVars = (v?: Vars): Record<string, string> | undefined => (v ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : undefined);
const TEXT_CACHE = new Map<string, ClassicText>();
function classicText(out: OutputLocale | null | undefined): ClassicText {
  const o = out ?? SOURCE_OUTPUT_LOCALE;
  const hit = TEXT_CACHE.get(o.locale);
  if (hit) return hit;
  const isSource = o.locale === DEFAULT_LOCALE;
  const raw = getOutputTranslator(o, "reports.numerologyClassic") as unknown as RawT;
  const t = (k: string, v?: Vars) => raw(k, strVars(v));
  let labels: LabelSet;
  if (isSource) {
    labels = {
      METHOD_LABELS: TR_LABELS.METHOD_LABELS, INTERPRETATION_HEADING: TR_LABELS.INTERPRETATION_HEADING, NUMBER_KIND_LABELS: TR_LABELS.NUMBER_KIND_LABELS,
      COMPOUND_NATURE_LABELS: TR_LABELS.COMPOUND_NATURE_LABELS, BUSINESS_RATING_LABELS: TR_LABELS.BUSINESS_RATING_LABELS, VERIFICATION_LABELS: TR_LABELS.VERIFICATION_LABELS,
      CORE_NUMBER_LABELS: TR_LABELS.CORE_NUMBER_LABELS, BRIDGE_LABELS: TR_LABELS.BRIDGE_LABELS, KARMIC_DEBT_LABEL: TR_LABELS.KARMIC_DEBT_LABEL,
    };
  } else {
    // Ekranla AYNI katalog (numerology.classic.labels); ekranda olmayanlar reports.numerologyClassic.labels.
    const INTERPRETATION_KEY = "interpretationHeading"; // numerology.classic.labels.interpretationHeading
    const lr = getOutputTranslator(o, "numerology.classic.labels") as unknown as { raw: (k: string) => unknown };
    const obj = (k: string) => (lr.raw(k) ?? {}) as Record<string, string>;
    labels = {
      METHOD_LABELS: obj("method") as LabelSet["METHOD_LABELS"],
      INTERPRETATION_HEADING: String(lr.raw(INTERPRETATION_KEY)),
      NUMBER_KIND_LABELS: obj("numberKind") as LabelSet["NUMBER_KIND_LABELS"],
      COMPOUND_NATURE_LABELS: obj("compoundNature") as LabelSet["COMPOUND_NATURE_LABELS"],
      BUSINESS_RATING_LABELS: obj("businessRating") as LabelSet["BUSINESS_RATING_LABELS"],
      VERIFICATION_LABELS: obj("verification") as LabelSet["VERIFICATION_LABELS"],
      CORE_NUMBER_LABELS: { ...obj("core"), destiny: t("labels.destiny"), pinnacles: t("labels.pinnacles"), challenges: t("labels.challenges"), luckyAssociations: t("labels.luckyAssociations"), maturityStatus: t("labels.maturityStatus") } as LabelSet["CORE_NUMBER_LABELS"],
      BRIDGE_LABELS: obj("bridge") as LabelSet["BRIDGE_LABELS"],
      KARMIC_DEBT_LABEL: t("labels.karmicDebt"),
    };
  }
  const tag = isSource ? "tr-TR" : o.intlTag;
  const ct: ClassicText = {
    out: o, isSource, t, labels,
    dateTime: new Intl.DateTimeFormat(tag, { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    date: new Intl.DateTimeFormat(tag, { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric" }),
  };
  TEXT_CACHE.set(o.locale, ct);
  return ct;
}
/** Etkin metin katmanı — kurucular SENKRON bölümde ayarlar ve geri alır (paketleme await'i dışarıda → istekler karışmaz). */
let X: ClassicText | null = null;
const L = (): ClassicText => X ?? classicText(null);
const LB = (): LabelSet => L().labels;
const T = (key: string, vars?: Vars): string => L().t(key, vars);
function withText<R>(out: OutputLocale | null | undefined, fn: () => R): R {
  const prev = X;
  X = classicText(out);
  try { return fn(); } finally { X = prev; }
}

const CORE_KEYS = ["lifePath", "expression", "soulUrge", "personality", "birthDay", "maturity"] as const;
type CoreKey = (typeof CORE_KEYS)[number];

const VARIANT_LABEL = (v: ReportVariant): string => T(`variant.${v}`);
const GROUP_LABEL = (g: PersonReportGroup): string => T(`group.${g}`);
const TECHNIQUES = new Set(["chart", "core", "bridge", "personal_day", "daily", "chaldean", "dual", "compatibility", "business_name"]);
const TECHNIQUE_LABEL = (k: string): string | undefined => (TECHNIQUES.has(k) ? T(`technique.${k}`) : undefined);
const CORE_METHOD_NOTE = (k: CoreKey): string => T(`coreMethod.${k}`);
const RELATIONS = new Set(["same", "equal", "same_value", "same_root", "different", "differs", "not_comparable", "incomparable", "missing", "one_missing", "only_legacy", "only_classic"]);
const RELATION_LABEL = (k: string): string | undefined => (RELATIONS.has(k) ? T(`relation.${k}`) : undefined);

// ── Ortak yardımcılar ──────────────────────────────────────────────────────────────────────────

type Level = { variant: ReportVariant; trace: boolean; verify: boolean; textCap: number; details: boolean; fullDetails: boolean };

function levelOf(variant: ReportVariant): Level {
  if (variant === "summary") return { variant, trace: false, verify: false, textCap: 700, details: false, fullDetails: false };
  if (variant === "technical") return { variant, trace: true, verify: true, textCap: TEXT_CAP.para, details: true, fullDetails: false };
  return { variant, trace: true, verify: true, textCap: TEXT_CAP.long, details: true, fullDetails: true };
}

function toDate(v: string | Date | undefined): Date {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    if (Number.isFinite(d.getTime())) return d;
  }
  return new Date();
}

function fmtInstant(d: Date): string {
  return L().dateTime.format(d);
}
function fmtInstantStr(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? L().date.format(d) : "";
}
/** Takvim günü ayıracı: TR "GG.AA.YYYY", diğer diller "GG/AA/YYYY" (gün-ay-yıl sırası ve rakamlar aynı). */
const dsep = (): string => (L().isSource ? "." : "/");
/** "YYYY-MM-DD" → "GG.AA.YYYY" (saat dilimi kayması yok). */
function fmtCalendar(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}${dsep()}${m[2]}${dsep()}${m[1]}` : safeText(v, 40);
}
function fmtBirth(b: unknown): string {
  if (!isObj(b)) return "";
  const y = num(b.year), m = num(b.month), d = num(b.day);
  if (y === null || m === null || d === null) return "";
  return `${String(d).padStart(2, "0")}${dsep()}${String(m).padStart(2, "0")}${dsep()}${y}`;
}
/** Hesap izi: TR'de sağlayıcı terimleri Türkçeleştirilir (bugünkü davranış); diğer dillerde iz aynen (İngilizce terimler). */
const trace = (v: unknown): string => (L().isSource ? safeTrace(v) : safeText(v, TEXT_CAP.trace));

function verificationRuns(v: Verification | undefined | null): TextRun[] {
  const s = v?.status ?? "unverified";
  const tone = s === "match" ? "ok" : s === "mismatch" ? "bad" : "info";
  const out: TextRun[] = [badge(LB().VERIFICATION_LABELS[s] ?? LB().VERIFICATION_LABELS.unverified, tone)];
  if (s === "mismatch" && v?.oracleValue !== undefined) {
    const ov = Array.isArray(v.oracleValue) ? v.oracleValue.join(", ") : String(v.oracleValue);
    out.push(run(T("verify.independent", { v: safeText(ov, 80) }), { size: S_SMALL, color: SECONDARY }));
  }
  if (v?.note) out.push(run(`  ${safeText(v.note, TEXT_CAP.line)}`, { size: S_SMALL, color: SECONDARY }));
  return out;
}

function verificationPara(v: Verification | undefined | null): Paragraph {
  return paraRuns([run(T("verify.label"), { bold: true, size: S_SMALL, color: INDIGO }), ...verificationRuns(v)], { after: 80 });
}

/** Sayı rozetleri: usta sayı + karmik borç (+ isteğe bağlı bileşik). */
function numberBadges(n: { value?: number; type?: string; karmicDebt?: number | null; verification?: Verification | null } | null | undefined, o: { master?: boolean } = {}): TextRun[] {
  if (!n) return [];
  const out: TextRun[] = [];
  // NK-R4: bağımsız kontrolde fark çıkan değer HER düzeyde (özet dahil) işaretlenir — kesin sonuç gibi basılmaz.
  if (n.verification?.status === "mismatch") out.push(badge(T("verify.mismatchBadge"), "warn"));
  const isMaster = n.type === "master" || n.value === 11 || n.value === 22 || n.value === 33;
  if (isMaster && n.type !== "compound" && o.master !== false) out.push(badge(LB().NUMBER_KIND_LABELS.master, "master"));
  if (typeof n.karmicDebt === "number") out.push(badge(`${LB().KARMIC_DEBT_LABEL} ${n.karmicDebt}`, "karmic"));
  return out;
}

function traceBlock(label: string, calc: unknown): Block[] {
  const t = trace(calc);
  if (!t) return [];
  return [noteBox(T("trace", { label }), [t])];
}

function interpretation(m: MeaningBlock | null | undefined, lv: Level, titlePrefix?: string): Block[] {
  if (!m) return [];
  const out: Block[] = [];
  const title = safeText(m.title, TEXT_CAP.short);
  out.push(para(`${LB().INTERPRETATION_HEADING}${titlePrefix ? ` — ${titlePrefix}` : ""}${title ? `: ${title}` : ""}`, { bold: true, color: INDIGO, size: S_SMALL, after: 60, keepNext: true }));
  const kw = safeList(m.keywords, 12, 60);
  if (kw.length) out.push(para(T("keywordsLine", { list: kw.join(", ") }), { size: S_SMALL, color: SECONDARY, after: 60 }));
  const d = safeText(m.description, lv.textCap);
  if (d) out.push(para(d, { justify: true }));
  if (lv.details) {
    const st = safeList(m.strengths, lv.fullDetails ? 10 : 3, lv.fullDetails ? TEXT_CAP.para : 400);
    if (st.length) { out.push(para(T("m.strengths"), { bold: true, size: S_SMALL, color: INDIGO, after: 40, keepNext: true })); out.push(...bullets(st)); }
    const ch = safeList(m.challenges, lv.fullDetails ? 10 : 3, lv.fullDetails ? TEXT_CAP.para : 400);
    if (ch.length) { out.push(para(T("m.challenges"), { bold: true, size: S_SMALL, color: INDIGO, after: 40, keepNext: true })); out.push(...bullets(ch)); }
  }
  if (lv.fullDetails) {
    for (const [k, lab] of [["career", T("m.career")], ["relationships", T("m.relationships")], ["spirituality", T("m.spirituality")]] as const) {
      const t = safeText(m[k], TEXT_CAP.para);
      if (t) out.push(paraRuns([run(`${lab}: `, { bold: true, color: INDIGO }), run(t)], { after: 80 }));
    }
  }
  return out;
}

function listRun(items: readonly number[] | undefined | null): string {
  return Array.isArray(items) && items.length ? items.filter((x) => typeof x === "number").join(", ") : "—";
}

function chartOf(r: Record<string, unknown>): ChartResult | null {
  const c = r.chart;
  return isObj(c) && isObj(c.core) ? (c as unknown as ChartResult) : null;
}
function objOf<T>(r: Record<string, unknown>, key: string, probe: string): T | null {
  const v = r[key];
  return isObj(v) && probe in v ? (v as unknown as T) : null;
}

function personName(record: ClassicReportRecord, chart: ChartResult | null): string {
  const inp = isObj(record.input) ? record.input : {};
  return safeText(inp.fullName, TEXT_CAP.short) || safeText(chart?.profile?.name, TEXT_CAP.short);
}
function personBirth(record: ClassicReportRecord, chart: ChartResult | null): string {
  const inp = isObj(record.input) ? record.input : {};
  return fmtBirth(inp.birth) || fmtCalendar(chart?.profile?.birthdate);
}
function referenceDateOf(record: ClassicReportRecord): string | null {
  const inp = isObj(record.input) ? record.input : {};
  const t = typeof inp.targetDate === "string" ? inp.targetDate : null;
  return t ?? (typeof record.referenceDate === "string" ? record.referenceDate : null);
}

function coreXml(title: string, at: Date): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const iso = `${at.toISOString().slice(0, 19)}Z`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(title)}</dc:title><dc:creator>Yaşam Sistemi</dc:creator><cp:lastModifiedBy>Yaşam Sistemi</cp:lastModifiedBy><cp:revision>1</cp:revision>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

/** Belge SENKRON kurulur (etkin metin katmanıyla); paketleme ayrı (`packDoc`). */
function makeDoc(children: Block[], o: { headerLabel: string; docTitle: string; at: Date; brand?: CommonReportOptions }): { doc: Document; core: string } {
  const { isSource, out } = L();
  const docTitle = safeText(o.docTitle, TEXT_CAP.short) || T("docTitleFallback");
  // Belge dili: TR'de dil işareti EKLENMEZ (golden bayt-eşit); diğer dillerde w:lang = documentLang.
  const baseRun = isSource ? { font: FONT, size: S_BODY, color: BODY } : { font: FONT, size: S_BODY, color: BODY, language: { value: out.documentLang } };
  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: docTitle,
    styles: { default: { document: { run: baseRun } } },
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, size: { width: 11906, height: 16838 } } },
      headers: { default: runningHeader(safeText(o.headerLabel, TEXT_CAP.short)) },
      // F3A: markalama açıksa alt bilgide küçük kurum satırı (yoksa birebir).
      footers: { default: runningFooter(isSource ? CLASSIC_REPORT_FOOTER : T("footer"), expertFooterParagraph(o.brand?.branding, { variant: o.brand?.brandingVariant, color: SECONDARY }), isSource ? undefined : T("footerPage")) },
      children,
    }],
  });
  return { doc, core: coreXml(docTitle, o.at) };
}
function packDoc(d: { doc: Document; core: string }): Promise<Buffer> {
  return Packer.toBuffer(d.doc, false, [{ path: "docProps/core.xml", data: d.core }]);
}
/** Değer kartları — etiket büyük harfi çıktı dilinin kuralıyla (TR → "tr-TR", birebir). */
const vcards = (items: Parameters<typeof valueCards>[0]) => valueCards(items, L().isSource ? "tr-TR" : L().out.intlTag);
/** Kapak sabit metinleri (çıktı dili); TR → undefined (primitives bugünkü metni basar). */
const coverText = () => (L().isSource ? undefined : { brand: T("cover.brand"), platform: T("cover.platform"), brandFooter: T("cover.brandFooter"), motto: T("cover.motto") });

function disclaimerSection(o: { stones?: boolean; expertName?: string | null; brand?: CommonReportOptions }): Block[] {
  const src = L().isSource;
  const out: Block[] = [sectionHeading(T("disc.heading"))];
  // Not (#855): wellnessNote ortak motordur; bu dalda yalnız TR (KISMİ) — #855 `common.wellness` ile çevrilir.
  out.push(para(wellnessNote("numeroloji").full, { italics: true, size: S_SMALL, color: SECONDARY }));
  out.push(para(src ? CLASSIC_REPORT_DISCLAIMER : T("disclaimer"), { italics: true, size: S_SMALL, color: SECONDARY }));
  if (o.stones) {
    out.push(para(src ? STONE_REPORT_DISCLAIMER : T("stoneDisclaimer"), { italics: true, size: S_SMALL, color: SECONDARY }));
    out.push(para(wellnessNote("dogaltas").full, { italics: true, size: S_SMALL, color: SECONDARY }));
  }
  const name = safeText(o.expertName, TEXT_CAP.short);
  // F3A: markalama açıksa "Hazırlayan" satırı genişletilmiş imza bloğuyla değişir (bilgilendirme metinleri AYNEN).
  const signature = expertSignatureBlock(o.brand?.branding, { variant: o.brand?.brandingVariant, accent: MOR, fallbackName: name, contentWidth: 11906 - 2 * 1080, fill: LILA });
  if (signature.length) out.push(...signature);
  else if (name) out.push(para(T("disc.preparedBy", { name }), { size: S_SMALL, color: SECONDARY, before: 60 }));
  return out;
}

function methodSection(record: ClassicReportRecord, at: Date, methods: readonly string[], variantLabel: string): Block[] {
  const out: Block[] = [sectionHeading(T("method.heading"))];
  const rows: [string, string][] = [
    [T("method.reportType"), variantLabel],
    [T("method.methods"), methods.length ? methods.join(" · ") : "—"],
    [T("method.techniques"), record.techniques.map((t) => TECHNIQUE_LABEL(t) ?? safeText(t, 40)).filter(Boolean).join(", ") || "—"],
    [T("method.methodology"), safeText(record.methodologyVersion, 60) || "—"],
    [T("method.schema"), safeText(record.apiSchemaVersion, 60) || "—"],
  ];
  const ref = referenceDateOf(record);
  if (ref) rows.push([T("method.refDate"), fmtCalendar(ref)]);
  const created = fmtInstantStr(record.createdAt);
  if (created) rows.push([T("info.analysisDate"), created]);
  rows.push([T("info.reportDate"), fmtInstant(at)]);
  out.push(kvTable(rows));
  out.push(spacer(80));
  out.push(para(T("method.note"), { size: S_SMALL, color: SECONDARY }));
  if (record.status === "partial" || (record.failed?.length ?? 0) > 0) {
    const f = (record.failed ?? []).map((x) => TECHNIQUE_LABEL(x) ?? safeText(x, 40)).filter(Boolean);
    out.push(noteBox(T("method.partialTitle"), [f.length ? T("method.partialWith", { list: f.join(", ") }) : T("method.partial")], "warn"));
  }
  return out;
}

function methodsUsed(r: Record<string, unknown>): string[] {
  const keys = Object.keys(r);
  const pyth = keys.some((k) => ["chart", "bridge", "personal_day", "compatibility"].includes(k) || k.startsWith("dual"));
  const chal = keys.some((k) => k === "chaldean" || k === "business_name" || k.startsWith("dual"));
  return [pyth ? LB().METHOD_LABELS.pythagorean : "", chal ? LB().METHOD_LABELS.chaldean : ""].filter(Boolean);
}

// ── Kişi raporu bölümleri ──────────────────────────────────────────────────────────────────────

function coreSection(chart: ChartResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading(T("core.heading", { method: LB().METHOD_LABELS.pythagorean }))];
  const headers = [T("th.number"), T("th.value"), T("th.kind"), T("th.title"), ...(lv.verify ? [T("th.verify")] : [])];
  const rows: Cell[][] = [];
  for (const k of CORE_KEYS) {
    const n = chart.core[k];
    if (!n) continue;
    const row: Cell[] = [
      { text: LB().CORE_NUMBER_LABELS[k], bold: true },
      { text: String(n.value), bold: true, color: INDIGO, badges: numberBadges(n, { master: false }) },
      LB().NUMBER_KIND_LABELS[n.type] ?? "—",
      safeText(n.meaning?.title, TEXT_CAP.short) || "—",
    ];
    if (lv.verify) row.push({ text: "", badges: verificationRuns(n.verification) });
    rows.push(row);
  }
  out.push(dataTable(headers, rows, lv.verify ? [20, 14, 14, 30, 22] : [24, 18, 18, 40]));
  for (const k of CORE_KEYS) {
    const n = chart.core[k];
    if (!n) continue;
    out.push(subHeading(`${LB().CORE_NUMBER_LABELS[k]}: ${n.value}`));
    const b = numberBadges(n);
    if (b.length) out.push(paraRuns(b, { after: 60 }));
    out.push(...interpretation(n.meaning, lv));
    if (lv.trace) {
      out.push(...traceBlock(LB().CORE_NUMBER_LABELS[k], n.calculation));
      out.push(para(T("core.methodNote", { method: LB().METHOD_LABELS.pythagorean, note: CORE_METHOD_NOTE(k) }), { size: S_SMALL, color: SECONDARY, before: 60 }));
    }
    if (lv.verify) out.push(verificationPara(n.verification));
  }
  return out;
}

function karmicSection(chart: ChartResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading(T("karmic.heading"))];
  const kl = chart.karmicLessons;
  out.push(subHeading(T("karmic.lessonsSub")));
  const missing = new Set(Array.isArray(kl?.missingNumbers) ? kl.missingNumbers : []);
  const counts: Cell[] = [];
  for (let i = 1; i <= 9; i++) {
    const c = num(kl?.presentNumbers?.[String(i)]) ?? 0;
    counts.push(missing.has(i) ? { text: T("karmic.missingCell", { c }), bold: true, fill: AMBER_BG } : { text: String(c) });
  }
  out.push(dataTable(["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((x) => T("karmic.numberCol", { x })), [counts]));
  out.push(para(missing.size ? T("karmic.missing", { list: [...missing].join(", ") }) : T("karmic.none"), { size: S_SMALL, color: SECONDARY, before: 60 }));
  for (const l of Array.isArray(kl?.lessons) ? kl.lessons : []) {
    out.push(subHeading(T("karmic.lesson", { n: l.number, lesson: safeText(l.lesson, TEXT_CAP.short) })));
    const d = safeText(l.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    const h = safeText(l.howToOvercome, lv.textCap);
    if (h) out.push(paraRuns([run(T("overcome"), { bold: true, color: INDIGO }), run(h)], { after: 80 }));
  }
  if (lv.verify && kl) out.push(verificationPara(kl.verification));

  const kd = chart.karmicDebt;
  out.push(subHeading(T("karmic.debtsSub")));
  if (kd?.hasKarmicDebt && Array.isArray(kd.debtNumbers) && kd.debtNumbers.length) {
    out.push(paraRuns(kd.debtNumbers.map((n) => badge(`${LB().KARMIC_DEBT_LABEL} ${n}`, "karmic")), { after: 80 }));
    for (const m of Array.isArray(kd.meanings) ? kd.meanings : []) {
      out.push(para(`${LB().KARMIC_DEBT_LABEL} ${m.number}: ${safeText(m.description, TEXT_CAP.line)}`, { bold: true, color: INDIGO, after: 60, keepNext: true }));
      const c = safeText(m.challenge, lv.textCap);
      if (c) out.push(paraRuns([run(T("karmic.challenge"), { bold: true, color: INDIGO }), run(c)], { after: 60 }));
      const r = safeText(m.resolution, lv.textCap);
      if (r) out.push(paraRuns([run(T("karmic.resolution"), { bold: true, color: INDIGO }), run(r)], { after: 80 }));
    }
  } else {
    out.push(para(T("karmic.noDebt"), { color: SECONDARY }));
  }
  const msg = safeText(kd?.message, lv.textCap);
  if (msg) out.push(para(msg, { justify: true }));
  if (lv.verify && kd) out.push(verificationPara(kd.verification));
  return out;
}

function ageRange(p: Period): string {
  if (p.endAge === null || p.endAge === undefined) return p.startAge <= 0 ? T("age.life") : T("age.from", { age: p.startAge });
  return T("age.range", { start: p.startAge, end: p.endAge });
}

/** Dönem türü KODU (kontrol akışı koda bağlı; yalnız etiket dile göre). */
type PeriodKind = "pinnacle" | "challenge";
const periodLabel = (kind: PeriodKind, position: number): string => T(`period.${kind}`, { pos: position });

function periodsTable(list: readonly Period[], kind: PeriodKind, lv: Level): Block[] {
  const headers = [T("th.period"), T("th.number"), T("th.ageRange"), T("th.title"), ...(lv.verify ? [T("th.verify")] : [])];
  const rows: Cell[][] = list.map((p) => {
    const r: Cell[] = [
      { text: kind === "challenge" && p.position === 3 && p.endAge === null && p.startAge <= 0 ? T("period.mainChallenge") : periodLabel(kind, p.position), bold: true },
      { text: String(p.number), bold: true, color: INDIGO, badges: numberBadges({ value: p.number }) },
      ageRange(p),
      safeText(p.title, TEXT_CAP.short) || "—",
    ];
    if (lv.verify) r.push({ text: "", badges: verificationRuns(p.verification) });
    return r;
  });
  return [dataTable(headers, rows, lv.verify ? [16, 12, 20, 32, 20] : [18, 14, 24, 44])];
}

function periodDetails(list: readonly Period[], kind: PeriodKind, lv: Level): Block[] {
  if (!lv.details) return [];
  const out: Block[] = [];
  for (const p of list) {
    out.push(para(`${periodLabel(kind, p.position)} (${ageRange(p)}) — ${p.number}: ${safeText(p.title, TEXT_CAP.short)}`, { bold: true, color: INDIGO, size: S_SMALL, before: 80, after: 40, keepNext: true }));
    const d = safeText(p.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    if (lv.fullDetails) {
      const op = safeList(p.opportunities, 6, 400);
      if (op.length) { out.push(para(T("opportunities"), { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(op)); }
      const ch = safeList(p.challenges, 6, 400);
      if (ch.length) { out.push(para(T("period.challenges"), { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(ch)); }
    }
    const les = safeText(p.lesson, lv.textCap);
    if (les) out.push(paraRuns([run(T("period.lesson"), { bold: true, color: INDIGO }), run(les)], { after: 60 }));
    const how = safeText(p.howToOvercome, lv.textCap);
    if (how) out.push(paraRuns([run(T("overcome"), { bold: true, color: INDIGO }), run(how)], { after: 80 }));
  }
  return out;
}

function timingSection(chart: ChartResult, day: PersonalDayResult | null, refDate: string | null, lv: Level, daily: DailyResult | null = null): Block[] {
  const out: Block[] = [sectionHeading(T("timing.heading"))];
  const pins = Array.isArray(chart.pinnacles) ? chart.pinnacles : [];
  const chs = Array.isArray(chart.challenges) ? chart.challenges : [];
  if (pins.length) {
    out.push(subHeading(T("timing.pinSub")));
    out.push(...periodsTable(pins, "pinnacle", lv));
    out.push(...periodDetails(pins, "pinnacle", lv));
  }
  if (chs.length) {
    out.push(subHeading(T("timing.chSub")));
    out.push(...periodsTable(chs, "challenge", lv));
    out.push(...periodDetails(chs, "challenge", lv));
  }
  const py = chart.personalYear;
  if (py) {
    out.push(subHeading(T("timing.pySub")));
    out.push(vcards([
      { label: T("timing.py"), value: String(py.personalYear) },
      ...(py.personalMonth ? [{ label: T("timing.pm"), value: String(py.personalMonth.personalMonth) }] : []),
      ...(day ? [{ label: T("timing.pd"), value: String(day.personalDay) }] : []),
    ]));
    out.push(spacer(80));
    const rows: [string, string][] = [];
    if (refDate) rows.push([T("timing.target"), fmtCalendar(refDate)]);
    rows.push([T("timing.pyTheme"), safeText(py.theme, TEXT_CAP.short)]);
    if (py.cycle) rows.push([T("timing.cycle"), safeText(py.cycle, TEXT_CAP.short)]);
    if (py.personalMonth) rows.push([T("timing.pmTheme"), safeText(py.personalMonth.theme, TEXT_CAP.short)]);
    out.push(kvTable(rows));
    const f = safeText(py.forecast, lv.textCap);
    if (f) out.push(para(f, { justify: true, before: 80 }));
    if (lv.details) {
      const op = safeList(py.opportunities, 8, 300);
      if (op.length) { out.push(para(T("opportunities"), { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(op)); }
      const ch = safeList(py.challenges, 8, 300);
      if (ch.length) { out.push(para(T("timing.watch"), { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(ch)); }
    }
    const adv = safeText(py.advice, lv.textCap);
    if (adv) out.push(paraRuns([run(T("adviceRun"), { bold: true, color: INDIGO }), run(adv)], { after: 80 }));
    const focus = safeText(py.personalMonth?.focus, lv.textCap);
    if (focus) out.push(paraRuns([run(T("timing.focus"), { bold: true, color: INDIGO }), run(focus)], { after: 80 }));
    if (lv.verify) out.push(verificationPara(py.verification));
  }
  if (day) {
    out.push(subHeading(T("timing.daySub", { date: fmtCalendar(day.targetDate) })));
    out.push(kvTable([
      [T("timing.target"), fmtCalendar(day.targetDate)],
      [T("timing.dayRow"), `${day.personalDay} · ${safeText(day.theme, TEXT_CAP.short)}`],
      [T("timing.monthRow"), `${day.personalMonth} · ${safeText(day.personalMonthTheme, TEXT_CAP.short)}`],
      [T("timing.yearRow"), `${day.personalYear} · ${safeText(day.personalYearTheme, TEXT_CAP.short)}`],
    ]));
    const g = safeText(day.guidance, lv.textCap);
    if (g) out.push(para(g, { justify: true, before: 80 }));
    if (lv.verify) out.push(verificationPara(day.verification));
  }
  if (daily && daily.number && typeof daily.number.value === "number") {
    // Günün Sayısı: Kişisel Gün'den AYRI ve sembolik olduğu açıkça yazılır (doğrulama satırı yok — doğrulanamaz).
    out.push(subHeading(T("timing.dailySub", { date: fmtCalendar(daily.date) })));
    out.push(kvTable([
      [T("timing.date"), fmtCalendar(daily.date)],
      [T("timing.dailyNum"), `${daily.number.value}${daily.number.meaning?.title ? ` · ${safeText(daily.number.meaning.title, TEXT_CAP.short)}` : ""}`],
      [T("th.kind"), daily.seedMode === "common" ? T("timing.dailyCommon") : T("timing.dailySeed")],
    ]));
    out.push(para(T("timing.dailyNote"), { size: S_SMALL, before: 60 }));
    const m = safeText(daily.dailyMessage, lv.textCap);
    if (m) out.push(para(m, { justify: true, before: 60 }));
  }
  return out;
}

const BRIDGE_KEYS = ["lifePathExpression", "expressionSoulUrge", "soulUrgePersonality", "expressionPersonality"] as const;

function bridgeSection(b: BridgeResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading(T("bridge.heading"))];
  out.push(para(T("bridge.lead"), { size: S_SMALL, color: SECONDARY }));
  const rows: Cell[][] = [];
  for (const k of BRIDGE_KEYS) {
    const it = b[k];
    if (!it) continue;
    const r: Cell[] = [
      { text: LB().BRIDGE_LABELS[k], bold: true },
      `${it.from?.number ?? "—"} ↔ ${it.to?.number ?? "—"}`,
      { text: String(it.bridge), bold: true, color: INDIGO },
    ];
    if (lv.verify) r.push({ text: "", badges: verificationRuns(it.verification) });
    rows.push(r);
  }
  out.push(dataTable([T("bridge.th"), T("bridge.numbers"), T("bridge.number"), ...(lv.verify ? [T("th.verify")] : [])], rows, lv.verify ? [34, 18, 18, 30] : [44, 28, 28]));
  for (const k of BRIDGE_KEYS) {
    const it = b[k];
    const m = safeText(it?.meaning, lv.textCap);
    if (it && m) out.push(paraRuns([run(`${LB().BRIDGE_LABELS[k]} (${it.bridge}): `, { bold: true, color: INDIGO }), run(m)], { before: 60, after: 60 }));
  }
  return out;
}

function nameLettersSection(chart: ChartResult, lv: Level): Block[] {
  const nl = chart.nameLetters;
  if (!nl) return [];
  const out: Block[] = [sectionHeading(T("letters.heading"))];
  const rows: Cell[][] = [];
  if (nl.cornerstone) rows.push([{ text: LB().CORE_NUMBER_LABELS.cornerstone, bold: true }, safeText(nl.cornerstone.letter, 4), String(nl.cornerstone.number), safeText(nl.cornerstone.meaning, lv.textCap) || "—"]);
  if (nl.capstone) rows.push([{ text: LB().CORE_NUMBER_LABELS.capstone, bold: true }, safeText(nl.capstone.letter, 4), String(nl.capstone.number), safeText(nl.capstone.meaning, lv.textCap) || "—"]);
  if (nl.firstVowel) rows.push([{ text: LB().CORE_NUMBER_LABELS.firstVowel, bold: true }, nl.firstVowel.letter === "Y" ? T("letters.yVowel") : safeText(nl.firstVowel.letter, 4), "—", safeText(nl.firstVowel.meaning, lv.textCap) || "—"]);
  if (!rows.length) return [];
  out.push(dataTable([T("letters.role"), T("letters.letter"), T("th.number"), LB().INTERPRETATION_HEADING], rows, [20, 10, 10, 60]));
  return out;
}

function hiddenSection(chart: ChartResult, lv: Level): Block[] {
  const hp = chart.hiddenPassion;
  const sc = chart.subconsciousSelf;
  if (!hp && !sc) return [];
  const out: Block[] = [sectionHeading(T("hidden.heading"))];
  out.push(vcards([
    ...(hp ? [{ label: LB().CORE_NUMBER_LABELS.hiddenPassion, value: String(hp.number) }] : []),
    ...(sc ? [{ label: LB().CORE_NUMBER_LABELS.subconsciousSelf, value: String(sc.number) }] : []),
  ]));
  if (hp) {
    out.push(subHeading(`${LB().CORE_NUMBER_LABELS.hiddenPassion}: ${hp.number} — ${safeText(hp.title, TEXT_CAP.short)}`));
    out.push(para(T("hidden.frequent", { list: listRun(hp.allPassions), count: hp.count }), { size: S_SMALL, color: SECONDARY }));
    const d = safeText(hp.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    if (lv.verify) out.push(verificationPara(hp.verification));
  }
  if (sc) {
    out.push(subHeading(`${LB().CORE_NUMBER_LABELS.subconsciousSelf}: ${sc.number} — ${safeText(sc.title, TEXT_CAP.short)}`));
    const d = safeText(sc.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    if (lv.verify) out.push(verificationPara(sc.verification));
  }
  return out;
}

function birthdayProfileSection(chart: ChartResult, lv: Level): Block[] {
  const b = chart.birthDayProfile;
  if (!b) return [];
  const out: Block[] = [sectionHeading(T("birthday.heading"))];
  out.push(kvTable([
    [T("birthday.day"), String(b.day)],
    [T("birthday.reduced"), String(b.reducesTo)],
    [T("th.title"), safeText(b.title, TEXT_CAP.short)],
    [T("keywords"), safeList(b.keywords, 12, 60).join(", ") || "—"],
  ]));
  out.push(para(LB().INTERPRETATION_HEADING, { bold: true, color: INDIGO, size: S_SMALL, before: 100, after: 60, keepNext: true }));
  const d = safeText(b.description, lv.textCap);
  if (d) out.push(para(d, { justify: true }));
  if (lv.details) {
    const st = safeList(b.strengths, 8, 400);
    if (st.length) { out.push(para(T("m.strengths"), { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(st)); }
    const ch = safeList(b.challenges, 8, 400);
    if (ch.length) { out.push(para(T("m.challenges"), { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(ch)); }
  }
  if (lv.fullDetails) {
    const c = safeText(b.career, TEXT_CAP.para);
    if (c) out.push(paraRuns([run(`${T("m.career")}: `, { bold: true, color: INDIGO }), run(c)], { after: 80 }));
    const r = safeText(b.relationships, TEXT_CAP.para);
    if (r) out.push(paraRuns([run(`${T("m.relationships")}: `, { bold: true, color: INDIGO }), run(r)], { after: 80 }));
  }
  return out;
}

function maturitySection(chart: ChartResult, lv: Level): Block[] {
  const m = chart.maturityStatus;
  if (!m) return [];
  const out: Block[] = [sectionHeading(T("maturity.heading"))];
  const mat = chart.core?.maturity;
  out.push(kvTable([
    [T("maturity.number"), mat ? String(mat.value) : "—"],
    [T("maturity.status"), m.isActive ? T("maturity.active") : T("maturity.inactive")],
    [T("maturity.age"), String(m.currentAge)],
    [T("maturity.range"), T("maturity.rangeValue", { r: safeText(m.activationRange, 40) })],
  ]));
  out.push(para(T("maturity.note"), { size: S_SMALL, color: SECONDARY, before: 60 }));
  if (lv.verify) out.push(verificationPara(m.verification));
  return out;
}

function chaldeanPartRow(label: string, p: ChaldeanPart | undefined, lv: Level): Cell[] | null {
  if (!p) return null;
  const r: Cell[] = [
    { text: label, bold: true },
    String(p.total),
    p.compound !== null && p.compound !== undefined ? String(p.compound) : "—",
    { text: String(p.root), bold: true, color: INDIGO, badges: numberBadges({ value: p.value, type: p.type, karmicDebt: p.karmicDebt }) },
    safeText(p.compoundMeaning?.name, TEXT_CAP.short) || "—",
    p.compoundMeaning ? LB().COMPOUND_NATURE_LABELS[p.compoundMeaning.nature] ?? "—" : "—",
  ];
  if (lv.verify) r.push({ text: "", badges: verificationRuns(p.verification) });
  return r;
}

function chaldeanSection(c: ChaldeanResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading(T("chaldean.heading", { method: LB().METHOD_LABELS.chaldean }))];
  if (lv.trace) out.push(para(T("methodNoteLine", { note: T("chaldeanMethod") }), { size: S_SMALL, color: SECONDARY }));
  const parts: [string, ChaldeanPart | undefined][] = [
    [LB().CORE_NUMBER_LABELS.destiny, c.destiny],
    [LB().CORE_NUMBER_LABELS.soulUrge, c.soulUrge],
    [LB().CORE_NUMBER_LABELS.personality, c.personality],
  ];
  const rows = parts.map(([l, p]) => chaldeanPartRow(l, p, lv)).filter((x): x is Cell[] => !!x);
  out.push(dataTable([T("th.number"), T("chaldean.total"), T("chaldean.compound"), T("chaldean.root"), T("chaldean.compoundName"), T("chaldean.nature"), ...(lv.verify ? [T("th.verify")] : [])], rows, lv.verify ? [18, 10, 10, 10, 20, 12, 20] : [22, 12, 12, 12, 28, 14]));
  const nm = c.numberMeaning;
  if (nm) {
    out.push(subHeading(T("chaldean.destinySub", { n: nm.number, title: safeText(nm.title, TEXT_CAP.short) })));
    out.push(paraRuns([
      run(T("chaldean.planetRun"), { bold: true, color: INDIGO }),
      run(safeText(nm.planet, 60) || "—"),
      ...(nm.caution || c.caution ? [run("  "), badge(T("cautionBadge"), "warn")] : []),
    ], { after: 60 }));
    const kw = safeList(nm.keywords, 12, 60);
    if (kw.length) out.push(para(T("keywordsLine", { list: kw.join(", ") }), { size: S_SMALL, color: SECONDARY, after: 60 }));
    const m = safeText(nm.meaning, lv.textCap);
    if (m) {
      out.push(para(LB().INTERPRETATION_HEADING, { bold: true, color: INDIGO, size: S_SMALL, after: 40, keepNext: true }));
      out.push(para(m, { justify: true }));
    }
    if (nm.caution || c.caution) out.push(para(T("chaldean.cautionNote"), { size: S_SMALL, color: SECONDARY }));
  }
  for (const [l, p] of parts) {
    if (!p) continue;
    const cm = p.compoundMeaning;
    if (cm && (lv.details || l === LB().CORE_NUMBER_LABELS.destiny)) {
      const t = safeText(cm.meaning, lv.textCap);
      if (t) out.push(paraRuns([run(cm.name ? T("chaldean.compoundLineNamed", { label: l, n: cm.number, name: safeText(cm.name, 80) }) : T("chaldean.compoundLine", { label: l, n: cm.number }), { bold: true, color: INDIGO }), run(t)], { before: 60, after: 60 }));
    }
    if (lv.trace) out.push(...traceBlock(`${l} (${LB().METHOD_LABELS.chaldean})`, p.calculation));
  }
  const s = safeText(c.summary, lv.textCap);
  if (s) out.push(noteBox(T("summary"), [s]));
  return out;
}

function dualSection(d: DualResult, lv: Level, title = T("dual.heading")): Block[] {
  const out: Block[] = [sectionHeading(title)];
  out.push(para(T("dual.lead"), { size: S_SMALL, color: SECONDARY }));
  const py = d.pythagorean;
  const ch = d.chaldean;
  const rows: Cell[][] = [];
  if (py) rows.push([{ text: LB().METHOD_LABELS.pythagorean, bold: true }, { text: String(py.value), bold: true, color: INDIGO, badges: numberBadges(py) }, safeText(py.title, TEXT_CAP.short) || "—", safeList(py.keywords, 5, 40).join(", ") || "—"]);
  if (ch) rows.push([
    { text: LB().METHOD_LABELS.chaldean, bold: true },
    { text: String(ch.root ?? ch.value), bold: true, color: INDIGO, badges: ch.caution ? [badge(T("cautionBadge"), "warn")] : [] },
    safeText(ch.title, TEXT_CAP.short) || "—",
    [ch.compound ? (ch.compoundMeaning?.name ? T("dual.compoundNamed", { n: ch.compound, name: safeText(ch.compoundMeaning.name, 60) }) : T("dual.compound", { n: ch.compound })) : "", ch.planet ? T("dual.planet", { p: safeText(ch.planet, 40) }) : ""].filter(Boolean).join(" · ") || "—",
  ]);
  out.push(dataTable([T("dual.method"), T("th.number"), T("th.title"), T("dual.extra")], rows, [24, 14, 26, 36]));
  out.push(paraRuns([
    run(T("dual.agreementRun"), { bold: true, color: INDIGO }),
    d.agreement ? badge(T("dual.same"), "ok") : badge(T("dual.diff"), "warn"),
  ], { before: 80, after: 60 }));
  const n = safeText(d.note, lv.textCap);
  if (n) out.push(para(n, { justify: true }));
  if (lv.trace) {
    if (py) out.push(...traceBlock(LB().METHOD_LABELS.pythagorean, py.calculation));
    if (ch) out.push(...traceBlock(LB().METHOD_LABELS.chaldean, ch.calculation));
  }
  if (lv.verify) out.push(verificationPara(d.verification));
  return out;
}

function luckySection(chart: ChartResult): Block[] {
  const l = chart.luckyAssociations;
  if (!l) return [];
  const out: Block[] = [sectionHeading(T("lucky.heading"))];
  out.push(para(T("lucky.lead"), { size: S_SMALL, color: SECONDARY }));
  out.push(kvTable([
    [T("planet"), safeText(l.rulingPlanet, 60) || "—"],
    [T("lucky.element"), safeText(l.element, 60) || "—"],
    [T("lucky.day"), safeText(l.day, 60) || "—"],
    [T("lucky.colors"), safeList(l.colors, 12, 40).join(", ") || "—"],
    [T("lucky.gems"), safeList(l.gemstones, 12, 60).join(", ") || "—"],
    [T("lucky.compat"), listRun(l.compatibleNumbers)],
    [T("lucky.incompat"), listRun(l.incompatibleNumbers)],
  ]));
  return out;
}

// ── Taş bölümü (üç kaynak AYRI; yalnız beyaz liste alanları) ────────────────────────────────────

function stoneName(s: { nameTr?: unknown; nameEn?: unknown } | null | undefined): string {
  const tr = safeText(s?.nameTr, 80);
  const en = safeText(s?.nameEn, 80);
  return tr && en && en.toLocaleLowerCase("tr-TR") !== tr.toLocaleLowerCase("tr-TR") ? `${tr} (${en})` : tr || en;
}

function suggestionRows(items: readonly StoneSuggestion[], method: StoneMatchMethod): Cell[][] {
  return items.map((s) => {
    const reasons = (Array.isArray(s.reasons) ? s.reasons : [])
      .filter((r) => r && r.method === method)
      .map((r) => safeText(r.explanation, 300))
      .filter(Boolean);
    const other = (Array.isArray(s.reasons) ? s.reasons : []).filter((r) => r && r.method !== method).length;
    return [{ text: stoneName(s), bold: true }, [reasons.join(" ") || "—", other ? T("stones.extraReasons", { n: other }) : ""].filter(Boolean).join(" ")];
  });
}

function groupOf(stones: StoneMatchResult, m: StoneMatchMethod): StoneMatchGroup | null {
  return (Array.isArray(stones.groups) ? stones.groups : []).find((g) => g && g.method === m) ?? null;
}

function stonesSection(stones: StoneMatchResult): Block[] {
  const src = L().isSource;
  const out: Block[] = [sectionHeading(T("stones.heading"))];
  out.push(noteBox("", [src ? STONE_REPORT_DISCLAIMER : T("stoneDisclaimer")]));
  out.push(spacer(80));

  // 1) Haritanın önerdiği
  out.push(subHeading(T("stones.s1")));
  out.push(para(T("stones.s1lead"), { size: S_SMALL, color: SECONDARY }));
  const direct = Array.isArray(stones.providerDirect) ? stones.providerDirect : [];
  const STATUS = new Set(["matched", "ambiguous", "unmatched", "text_only"]);
  out.push(dataTable([T("stones.thListed"), T("maturity.status"), T("stones.thLibrary")], direct.map((d) => [
    { text: safeText(d.input, 80) || "—", bold: true },
    STATUS.has(d.status) ? T(`stones.status.${d.status}`) : "—",
    d.status === "matched" ? safeText(d.nameTr, 80) || "—" : d.status === "ambiguous" ? (Array.isArray(d.candidates) ? d.candidates.map((c) => stoneName(c)).filter(Boolean).join(", ") : "—") : "—",
  ]), [32, 28, 40]));
  const pairs = groupOf(stones, "pairs_with");
  if (pairs?.items?.length) {
    // Grup etiketi taş servisinin TR sistem metnidir → diğer dillerde yöntem KODUNDAN katalog etiketi.
    out.push(para(src ? safeText(pairs.label, TEXT_CAP.short) || T("stones.pairsFallback") : T("stones.pairsFallback"), { bold: true, size: S_SMALL, color: INDIGO, before: 80, after: 40 }));
    out.push(dataTable([T("stones.thStone"), T("stones.thReason")], suggestionRows(pairs.items, "pairs_with"), [32, 68]));
  }

  // 2) Titreşim eşleşmesi (birebir ↔ kök ayrı)
  out.push(subHeading(T("stones.s2")));
  const exact = groupOf(stones, "vibration_exact");
  const root = groupOf(stones, "vibration_root");
  out.push(para(T("stones.exact"), { bold: true, size: S_SMALL, color: INDIGO, after: 40 }));
  out.push(exact?.items?.length ? dataTable([T("stones.thStone"), T("stones.thReason")], suggestionRows(exact.items, "vibration_exact"), [32, 68]) : para(T("stones.noExact"), { color: SECONDARY, size: S_SMALL }));
  out.push(para(T("stones.root"), { bold: true, size: S_SMALL, color: INDIGO, before: 80, after: 40 }));
  out.push(root?.items?.length ? dataTable([T("stones.thStone"), T("stones.thReason")], suggestionRows(root.items, "vibration_root"), [32, 68]) : para(T("stones.noRoot"), { color: SECONDARY, size: S_SMALL }));

  // 3) Gezegen ilişkisi
  out.push(subHeading(T("stones.s3")));
  const planet = groupOf(stones, "planet");
  out.push(planet?.items?.length ? dataTable([T("stones.thStone"), T("stones.thReason")], suggestionRows(planet.items, "planet"), [32, 68]) : para(T("stones.noPlanet"), { color: SECONDARY, size: S_SMALL }));

  const element = groupOf(stones, "element");
  if (element?.items?.length) {
    out.push(subHeading(T("stones.elementSub")));
    out.push(dataTable([T("stones.thStone"), T("stones.thReason")], suggestionRows(element.items, "element"), [32, 68]));
  }
  const notes = safeList(stones.notes, 12, TEXT_CAP.line);
  if (!stones.libraryAvailable) notes.unshift(T("stones.noLibrary"));
  if (notes.length) out.push(noteBox(T("stones.notes"), notes));
  const disc = safeText(stones.disclaimer?.text, TEXT_CAP.line);
  if (disc && disc !== STONE_REPORT_DISCLAIMER) out.push(para(disc, { italics: true, size: S_SMALL, color: SECONDARY, before: 60 }));
  return out;
}

// ── Genel kapak ────────────────────────────────────────────────────────────────────────────────

function cover(o: { heading: string; subtitle: string; bulletsList?: string[]; info: [string, string][] }, brand: CommonReportOptions = {}): Block[] {
  // F3A: markalama (null/yok → kapak birebir).
  return coverPage({ ...o, branding: brand.branding, brandingVariant: brand.brandingVariant, text: coverText() });
}

function summaryCards(chart: ChartResult): Block[] {
  const cards = CORE_KEYS.filter((k) => chart.core[k]).map((k) => ({ label: LB().CORE_NUMBER_LABELS[k], value: String(chart.core[k].value), badges: numberBadges(chart.core[k]) }));
  return [vcards(cards.slice(0, 3)), spacer(60), ...(cards.length > 3 ? [vcards(cards.slice(3))] : [])];
}

// ── Dışa açık kurucular ────────────────────────────────────────────────────────────────────────

/** Kişi raporu (özet / teknik / tam). */
export async function buildPersonReport(record: ClassicReportRecord, opts: PersonReportOptions): Promise<Buffer> {
  // Belge senkron kurulur (metin katmanı yalnız bu bölümde etkin); paketleme sonra.
  return packDoc(withText(opts.output, () => personReportDoc(record, opts)));
}

function personReportDoc(record: ClassicReportRecord, opts: PersonReportOptions): { doc: Document; core: string } {
  const at = toDate(opts.generatedAt);
  const lv = levelOf(opts.variant);
  const R = isObj(record.result) ? record.result : {};
  const chart = chartOf(R);
  const bridge = objOf<BridgeResult>(R, "bridge", "lifePathExpression");
  const day = objOf<PersonalDayResult>(R, "personal_day", "personalDay");
  const daily = objOf<DailyResult>(R, "daily", "number");
  const chal = objOf<ChaldeanResult>(R, "chaldean", "destiny");
  const dual = objOf<DualResult>(R, "dual", "pythagorean");
  const stones = opts.stones ?? null;

  const wanted = new Set<PersonReportGroup>(opts.variant === "full" || !opts.include?.length ? PERSON_REPORT_GROUPS : opts.include);
  const has = (g: PersonReportGroup): boolean => {
    if (!wanted.has(g)) return false;
    if (g === "bridge") return !!bridge;
    if (g === "chaldean") return !!chal;
    if (g === "dual") return !!dual;
    if (g === "stones") return !!stones;
    if (g === "timing") return !!chart || !!day || !!daily;
    return !!chart;
  };
  const groups = PERSON_REPORT_GROUPS.filter(has);

  const name = personName(record, chart);
  const title = safeText(record.title, TEXT_CAP.short) || name || T("person.titleFallback");
  const children: Block[] = [];
  children.push(...cover({
    heading: T("person.cover"),
    subtitle: VARIANT_LABEL(opts.variant),
    bulletsList: groups.map((g) => GROUP_LABEL(g)),
    info: [
      [T("info.title"), title],
      [T("info.client"), name || "—"],
      [T("info.birth"), personBirth(record, chart) || "—"],
      [T("info.analysisDate"), fmtInstantStr(record.createdAt) || "—"],
      [T("info.reportDate"), fmtInstant(at)],
    ],
  }, opts));

  // Özet
  children.push(sectionHeading(T("summary"), true));
  if (chart) {
    children.push(...summaryCards(chart));
    const s = safeText(chart.summary, lv.textCap);
    if (s) {
      children.push(para(LB().INTERPRETATION_HEADING, { bold: true, color: INDIGO, size: S_SMALL, before: 120, after: 40, keepNext: true }));
      children.push(para(s, { justify: true }));
    }
  } else {
    children.push(para(T("person.noChart"), { color: SECONDARY }));
  }
  children.push(para(T("person.methods", { list: methodsUsed(R).join(" · ") || "—" }), { size: S_SMALL, color: SECONDARY, before: 60 }));

  const refDate = referenceDateOf(record);
  for (const g of groups) {
    if (g === "core" && chart) children.push(...coreSection(chart, lv));
    if (g === "karmic" && chart) children.push(...karmicSection(chart, lv));
    if (g === "timing" && chart) children.push(...timingSection(chart, day, refDate, lv, daily));
    if (g === "timing" && !chart && (day || daily)) children.push(...timingSection({ pinnacles: [], challenges: [] } as unknown as ChartResult, day, refDate, lv, daily));
    if (g === "bridge" && bridge) children.push(...bridgeSection(bridge, lv));
    if (g === "name_letters" && chart) children.push(...nameLettersSection(chart, lv));
    if (g === "hidden_subconscious" && chart) children.push(...hiddenSection(chart, lv));
    if (g === "birthday_profile" && chart) children.push(...birthdayProfileSection(chart, lv));
    if (g === "maturity" && chart) children.push(...maturitySection(chart, lv));
    if (g === "chaldean" && chal) children.push(...chaldeanSection(chal, lv));
    if (g === "dual" && dual) children.push(...dualSection(dual, lv));
    if (g === "lucky" && chart) children.push(...luckySection(chart));
    if (g === "stones" && stones) children.push(...stonesSection(stones));
  }
  children.push(...methodSection(record, at, methodsUsed(R), VARIANT_LABEL(opts.variant)));
  children.push(...disclaimerSection({ stones: groups.includes("stones"), expertName: opts.expertName, brand: opts }));
  return makeDoc(children, { headerLabel: T("person.header", { title }), docTitle: T("person.docTitle", { title }), at, brand: opts });
}

/** Numeroloji – Doğaltaş raporu (kayıtlı harita + eşleştirme sonucu). */
export async function buildStonesReport(record: ClassicReportRecord, stones: StoneMatchResult, opts: CommonReportOptions = {}): Promise<Buffer> {
  // Belge senkron kurulur (metin katmanı yalnız bu bölümde etkin); paketleme sonra.
  return packDoc(withText(opts.output, () => stonesReportDoc(record, stones, opts)));
}

function stonesReportDoc(record: ClassicReportRecord, stones: StoneMatchResult, opts: CommonReportOptions): { doc: Document; core: string } {
  const at = toDate(opts.generatedAt);
  const R = isObj(record.result) ? record.result : {};
  const chart = chartOf(R);
  const name = personName(record, chart);
  const title = safeText(record.title, TEXT_CAP.short) || name || T("stonesReport.titleFallback");
  const children: Block[] = [];
  children.push(...cover({
    heading: T("stonesReport.cover"),
    subtitle: T("stonesReport.subtitle"),
    info: [[T("info.title"), title], [T("info.client"), name || "—"], [T("info.birth"), personBirth(record, chart) || "—"], [T("info.reportDate"), fmtInstant(at)]],
  }, opts));
  children.push(sectionHeading(T("stonesReport.numbersUsed"), true));
  if (chart) children.push(...summaryCards(chart));
  else children.push(para(T("stonesReport.noChart"), { color: SECONDARY }));
  if (chart) children.push(...luckySection(chart));
  children.push(...stonesSection(stones));
  children.push(...methodSection(record, at, methodsUsed(R), T("stonesReport.type")));
  children.push(...disclaimerSection({ stones: true, expertName: opts.expertName, brand: opts }));
  return makeDoc(children, { headerLabel: T("stonesReport.header", { title }), docTitle: T("stonesReport.docTitle", { title }), at, brand: opts });
}

/** İlişki (numerolojik uyum) raporu. */
export async function buildRelationshipReport(record: ClassicReportRecord, opts: CommonReportOptions = {}): Promise<Buffer> {
  // Belge senkron kurulur (metin katmanı yalnız bu bölümde etkin); paketleme sonra.
  return packDoc(withText(opts.output, () => relationshipReportDoc(record, opts)));
}

function relationshipReportDoc(record: ClassicReportRecord, opts: CommonReportOptions): { doc: Document; core: string } {
  const at = toDate(opts.generatedAt);
  const lv = levelOf("technical");
  const R = isObj(record.result) ? record.result : {};
  const c = objOf<CompatibilityResult>(R, "compatibility", "overallScore");
  const inp = isObj(record.input) ? record.input : {};
  const p1 = isObj(inp.person1) ? inp.person1 : {};
  const p2 = isObj(inp.person2) ? inp.person2 : {};
  const n1 = safeText(p1.fullName, TEXT_CAP.short) || T("rel.p1");
  const n2 = safeText(p2.fullName, TEXT_CAP.short) || T("rel.p2");
  const title = safeText(record.title, TEXT_CAP.short) || `${n1} – ${n2}`;
  const children: Block[] = [];
  children.push(...cover({
    heading: T("rel.cover"),
    subtitle: LB().METHOD_LABELS.pythagorean,
    info: [[T("info.title"), title], [T("rel.p1"), `${n1}${fmtBirth(p1.birth) ? ` · ${fmtBirth(p1.birth)}` : ""}`], [T("rel.p2"), `${n2}${fmtBirth(p2.birth) ? ` · ${fmtBirth(p2.birth)}` : ""}`], [T("info.reportDate"), fmtInstant(at)]],
  }, opts));
  children.push(sectionHeading(T("rel.summary"), true));
  if (c) {
    children.push(vcards([{ label: T("rel.overall"), value: T("percent", { n: c.overallScore }) }, { label: T("rating"), value: safeText(c.rating, 40) || "—" }]));
    children.push(para(T("rel.scoreNote"), { size: S_SMALL, before: 60 }));
    children.push(spacer(100));
    const pairs: [string, CompatibilityResult["lifePath"] | undefined][] = [[T("rel.lifePath"), c.lifePath], [T("rel.expression"), c.expression], [T("rel.soulUrge"), c.soulUrge]];
    children.push(dataTable([T("th.number"), n1, n2, T("rel.compat")], pairs.filter(([, p]) => !!p).map(([l, p]) => [{ text: l, bold: true }, { text: String(p!.person1), badges: numberBadges({ value: p!.person1 }) }, { text: String(p!.person2), badges: numberBadges({ value: p!.person2 }) }, { text: T("percent", { n: p!.compatibility }), bold: true, color: INDIGO }]), [28, 22, 22, 28]));
    children.push(sectionHeading(T("rel.perNumber")));
    for (const [l, p] of pairs) {
      const d = safeText(p?.description, lv.textCap);
      if (p && d) { children.push(subHeading(`${l}: ${p.person1} – ${p.person2}`)); children.push(para(`${LB().INTERPRETATION_HEADING}`, { bold: true, color: INDIGO, size: S_SMALL, after: 40 })); children.push(para(d, { justify: true })); }
    }
    const st = safeList(c.strengths, 10, 400);
    if (st.length) { children.push(subHeading(T("m.strengths"))); children.push(...bullets(st)); }
    const ch = safeList(c.challenges, 10, 400);
    if (ch.length) { children.push(subHeading(T("m.challenges"))); children.push(...bullets(ch)); }
    const adv = safeText(c.advice, lv.textCap);
    if (adv) children.push(noteBox(T("advice"), [adv]));
    // NK-005: bu doğrulama yalnız sayı eşleşmelerini kapsar; puan doğrulanamaz.
    children.push(para(T("rel.verifyNote"), { bold: true, size: S_SMALL, color: INDIGO, before: 80, after: 20 }));
    children.push(verificationPara(c.verification));
  } else {
    children.push(para(T("rel.none"), { color: SECONDARY }));
  }
  children.push(...methodSection(record, at, [LB().METHOD_LABELS.pythagorean], T("rel.type")));
  children.push(...disclaimerSection({ expertName: opts.expertName, brand: opts }));
  return makeDoc(children, { headerLabel: T("rel.header", { title }), docTitle: T("rel.docTitle", { title }), at, brand: opts });
}

/** İşletme adı raporu (Kalde). */
export async function buildBusinessReport(record: ClassicReportRecord, opts: CommonReportOptions = {}): Promise<Buffer> {
  // Belge senkron kurulur (metin katmanı yalnız bu bölümde etkin); paketleme sonra.
  return packDoc(withText(opts.output, () => businessReportDoc(record, opts)));
}

function businessReportDoc(record: ClassicReportRecord, opts: CommonReportOptions): { doc: Document; core: string } {
  const at = toDate(opts.generatedAt);
  const lv = levelOf("technical");
  const R = isObj(record.result) ? record.result : {};
  const b = objOf<BusinessNameResult>(R, "business_name", "rating");
  const inp = isObj(record.input) ? record.input : {};
  const bname = safeText(inp.name, TEXT_CAP.short) || safeText(b?.name, TEXT_CAP.short);
  const title = safeText(record.title, TEXT_CAP.short) || bname || T("biz.name");
  const children: Block[] = [];
  children.push(...cover({ heading: T("biz.cover"), subtitle: LB().METHOD_LABELS.chaldean, info: [[T("info.title"), title], [T("biz.name"), bname || "—"], [T("info.reportDate"), fmtInstant(at)]] }, opts));
  children.push(sectionHeading(T("biz.result"), true));
  if (b) {
    const tone = b.rating === "excellent" || b.rating === "good" ? "ok" : b.rating === "caution" ? "warn" : "bad";
    children.push(vcards([
      { label: T("biz.root"), value: String(b.number?.root ?? b.number?.value ?? "—") },
      { label: T("biz.compound"), value: b.number?.compound ? String(b.number.compound) : "—" },
      { label: T("rating"), value: LB().BUSINESS_RATING_LABELS[b.rating] ?? "—", badges: [badge(LB().BUSINESS_RATING_LABELS[b.rating] ?? "—", tone)] },
    ]));
    children.push(spacer(100));
    children.push(kvTable([
      [T("chaldean.total"), String(b.number?.total ?? "—")],
      [T("biz.compoundName"), safeText(b.number?.compoundMeaning?.name, 80) || "—"],
      [T("biz.compoundNature"), b.number?.compoundMeaning ? LB().COMPOUND_NATURE_LABELS[b.number.compoundMeaning.nature] ?? "—" : "—"],
      [T("biz.favorable"), b.favorableCompound ? T("yes") : T("no")],
      [T("planet"), safeText(b.planet, 60) || "—"],
      [T("biz.industries"), safeList(b.industries, 12, 80).join(", ") || "—"],
    ]));
    children.push(sectionHeading(LB().INTERPRETATION_HEADING));
    const g = safeText(b.guidance, lv.textCap);
    if (g) children.push(para(g, { justify: true }));
    const cm = safeText(b.number?.compoundMeaning?.meaning, lv.textCap);
    if (cm) children.push(paraRuns([run(T("biz.compoundRun", { n: b.number.compound ?? "" }), { bold: true, color: INDIGO }), run(cm)], { after: 80 }));
    const s = safeText(b.summary, lv.textCap);
    if (s) children.push(noteBox(T("summary"), [s]));
    children.push(para(T("methodNoteLine", { note: T("chaldeanMethod") }), { size: S_SMALL, color: SECONDARY, before: 80 }));
    children.push(...traceBlock(T("biz.traceLabel", { method: LB().METHOD_LABELS.chaldean }), b.number?.calculation));
    children.push(verificationPara(b.verification));
  } else {
    children.push(para(T("biz.none"), { color: SECONDARY }));
  }
  children.push(...methodSection(record, at, [LB().METHOD_LABELS.chaldean], T("biz.type")));
  children.push(...disclaimerSection({ expertName: opts.expertName, brand: opts }));
  return makeDoc(children, { headerLabel: T("biz.header", { title }), docTitle: T("biz.docTitle", { title }), at, brand: opts });
}

/** İsim adayları raporu (her aday için iki sistem yan yana; birleştirme yok). */
export async function buildNamesReport(record: ClassicReportRecord, opts: NamesReportOptions = {}): Promise<Buffer> {
  // Belge senkron kurulur (metin katmanı yalnız bu bölümde etkin); paketleme sonra.
  return packDoc(withText(opts.output, () => namesReportDoc(record, opts)));
}

function namesReportDoc(record: ClassicReportRecord, opts: NamesReportOptions): { doc: Document; core: string } {
  const at = toDate(opts.generatedAt);
  const lv = levelOf(opts.variant ?? "technical");
  const R = isObj(record.result) ? record.result : {};
  const inp = isObj(record.input) ? record.input : {};
  const candidates = safeList(inp.candidates, 12, TEXT_CAP.short);
  const entries: { label: string; d: DualResult | null }[] = [];
  const keys = Object.keys(R).filter((k) => /^dual(#\d+)?$/.test(k)).sort((a, b) => (Number(a.split("#")[1] ?? 0) - Number(b.split("#")[1] ?? 0)));
  keys.forEach((k, i) => {
    const d = objOf<DualResult>(R, k, "pythagorean");
    entries.push({ label: safeText(d?.name, TEXT_CAP.short) || candidates[i] || T("names.candidateN", { n: i + 1 }), d });
  });
  const title = safeText(record.title, TEXT_CAP.short) || T("names.titleFallback");
  const children: Block[] = [];
  children.push(...cover({ heading: T("names.cover"), subtitle: `${LB().METHOD_LABELS.pythagorean} · ${LB().METHOD_LABELS.chaldean}`, bulletsList: entries.map((e) => e.label), info: [[T("info.title"), title], [T("names.count"), String(entries.length)], [T("info.reportDate"), fmtInstant(at)]] }, opts));
  children.push(sectionHeading(T("names.heading"), true));
  children.push(para(T("names.lead"), { size: S_SMALL, color: SECONDARY }));
  children.push(dataTable([
    T("names.thCandidate"), LB().METHOD_LABELS.pythagorean, LB().METHOD_LABELS.chaldean, T("names.thPlanet"), T("names.thTwo"),
  ], entries.map(({ label, d }) => d ? [
    { text: label, bold: true },
    { text: String(d.pythagorean?.value ?? "—"), bold: true, color: INDIGO, badges: numberBadges(d.pythagorean) },
    { text: `${d.chaldean?.root ?? d.chaldean?.value ?? "—"}${d.chaldean?.compound ? T("names.compoundSuffix", { n: d.chaldean.compound }) : ""}`, bold: true, color: INDIGO, badges: d.chaldean?.caution ? [badge(T("cautionBadge"), "warn")] : [] },
    safeText(d.chaldean?.planet, 40) || "—",
    d.agreement ? { text: T("names.sameRoot"), badges: [] } : { text: T("names.different") },
  ] : [{ text: label, bold: true }, "—", "—", "—", T("names.notCalc")]), [28, 18, 22, 16, 16]));
  for (const { label, d } of entries) {
    if (!d) continue;
    children.push(...dualSection(d, lv, T("names.candidate", { label })));
  }
  children.push(...methodSection(record, at, [LB().METHOD_LABELS.pythagorean, LB().METHOD_LABELS.chaldean], T("names.type")));
  children.push(...disclaimerSection({ expertName: opts.expertName, brand: opts }));
  return makeDoc(children, { headerLabel: T("names.header", { title }), docTitle: T("names.docTitle", { title }), at, brand: opts });
}

// ── Karşılaştırma raporu ───────────────────────────────────────────────────────────────────────

const STONE_METHODS = new Set(["provider_direct", "vibration_exact", "vibration_root", "planet", "pairs_with", "element"]);
const STONE_METHOD_LABEL = (k: string): string | undefined => (STONE_METHODS.has(k) ? T(`cmp.stoneMethod.${k}`) : undefined);
/** Slot KODU (bileklik/kolye/kutle) yalnız etiketlenir. */
const SLOTS = new Set(["bileklik", "kolye", "kutle"]);
const SLOT_LABEL = (k: string): string | undefined => (SLOTS.has(k) ? T(`cmp.slot.${k}`) : undefined);
const MISSING_SIDES = new Set(["legacy", "classic", "both"]);
const MISSING_SIDE_LABEL = (k: string): string | undefined => (MISSING_SIDES.has(k) ? T(`cmp.missingSide.${k}`) : undefined);

function onlyLabel(x: ComparisonOnlyItem): string {
  if (typeof x === "string") return safeText(x, TEXT_CAP.short);
  const l = safeText(x?.labelTr, TEXT_CAP.short);
  const d = safeText(x?.display, 80);
  const base = l && d ? `${l}: ${d}` : l;
  if (!base) return "";
  return x.present === true ? `${base}${T("cmp.present")}` : x.present === false ? `${base}${T("cmp.absent")}` : base;
}
function stoneLabel(x: ComparisonStoneItem): string {
  if (typeof x === "string") return safeText(x, 80);
  const name = safeText(x?.nameTr ?? x?.name ?? x?.nameLegacy, 80);
  if (!name) return "";
  const tags: string[] = [];
  if (x.slot) tags.push(SLOT_LABEL(x.slot) ?? safeText(x.slot, 20));
  if (Array.isArray(x.slots)) for (const sl of x.slots) tags.push(SLOT_LABEL(sl) ?? safeText(sl, 20));
  if (Array.isArray(x.methods)) for (const m of x.methods) tags.push(STONE_METHOD_LABEL(m) ?? safeText(m, 30));
  if (x.status === "ambiguous") tags.push(T("cmp.ambiguous"));
  if (x.status === "unmatched") tags.push(T("cmp.unmatched"));
  const uniq = tags.filter((t, i) => t && tags.indexOf(t) === i);
  return uniq.length ? `${name} (${uniq.join(", ")})` : name;
}
function rowLabel(r: { labelTr: string; position?: number | null }): string {
  const l = safeText(r.labelTr, TEXT_CAP.short);
  return typeof r.position === "number" && !l.includes(`${r.position}.`) ? T("cmp.period", { label: l, n: r.position }) : l;
}
function legacyCell(v: { display: string; root: number | null; extra?: Readonly<Record<string, unknown>> } | null): Cell {
  if (!v) return { text: "—", color: SECONDARY };
  const d = safeText(v.display, 60) || "—";
  // H1: Kulvar satırında karşılaştırılan değer Bütüncül anahtarıdır; "kök" etiketi anahtarla karıştırılmaz.
  const basis = v.extra?.compareBasis;
  if (basis === "anahtar_yok") return { text: T("cmp.keyMissing", { d }), bold: true, color: INDIGO };
  if (basis === "anahtar" && typeof v.extra?.key === "number") {
    const key = v.extra.key;
    return { text: v.root !== null && v.root !== key ? T("cmp.keyRoot", { d, key, root: v.root }) : T("cmp.key", { d, key }), bold: true, color: INDIGO };
  }
  return { text: v.root !== null && v.root !== undefined && String(v.root) !== d ? T("cmp.root", { d, root: v.root }) : d, bold: true, color: INDIGO };
}
function classicCell(v: { value: number | null; type: string | null; karmicDebt: number | null } | null): Cell {
  if (!v || v.value === null || v.value === undefined) return { text: "—", color: SECONDARY };
  return { text: String(v.value), bold: true, color: INDIGO, badges: numberBadges({ value: v.value, type: v.type ?? undefined, karmicDebt: v.karmicDebt }) };
}

/** Karşılaştırma raporu: iki ekol ayrı bölümlerde; birleşik / ortak sayı YOK. */
export async function buildComparisonReport(input: ComparisonReportInput, opts: CommonReportOptions = {}): Promise<Buffer> {
  // Belge senkron kurulur (metin katmanı yalnız bu bölümde etkin); paketleme sonra.
  return packDoc(withText(opts.output, () => comparisonReportDoc(input, opts)));
}

function comparisonReportDoc(input: ComparisonReportInput, opts: CommonReportOptions): { doc: Document; core: string } {
  const at = toDate(opts.generatedAt);
  const a = input.alignment;
  const rows = Array.isArray(a?.rows) ? a.rows : [];
  const src = L().isSource;
  const sameName = src ? SAME_NAME_DIFFERENT_FORMULA : T("sameNameDiff");
  const aLabel = safeText(input.legacyMeta?.schoolLabel, 80) || T("cmp.aLabel");
  const bLabel = safeText(input.classicMeta?.schoolLabel, 80) || T("cmp.bLabel");
  const person = safeText(input.classicMeta?.personName, TEXT_CAP.short) || safeText(input.legacyMeta?.personName, TEXT_CAP.short);
  const title = safeText(input.classicMeta?.title, TEXT_CAP.short) || safeText(input.legacyMeta?.title, TEXT_CAP.short) || person || T("cmp.titleFallback");
  const children: Block[] = [];
  children.push(...cover({
    heading: T("cmp.cover"),
    subtitle: `${aLabel}  ·  ${bLabel}`,
    info: [
      [T("info.title"), title],
      [T("info.client"), person || "—"],
      [T("info.birth"), safeText(input.classicMeta?.birthDate ?? input.legacyMeta?.birthDate, 40) || "—"],
      [T("cmp.record", { label: aLabel }), fmtInstantStr(input.legacyMeta?.createdAt) || "—"],
      [T("cmp.record", { label: bLabel }), fmtInstantStr(input.classicMeta?.createdAt) || "—"],
      [T("info.reportDate"), fmtInstant(at)],
    ],
  }, opts));
  children.push(sectionHeading(T("cmp.readingNote"), true));
  children.push(noteBox("", [src ? COMPARISON_NO_MERGE_NOTE : T("noMerge"), T("cmp.sameNameNote", { label: sameName })]));

  // A ekolü
  children.push(sectionHeading(aLabel));
  const aRows = rows.filter((r) => r.legacy && safeText(r.legacy.display, 60));
  children.push(aRows.length ? dataTable([T("cmp.concept"), T("th.value")], aRows.map((r) => [{ text: rowLabel(r), bold: true }, legacyCell(r.legacy)]), [60, 40]) : para(T("cmp.noValues"), { color: SECONDARY }));
  if (input.legacyMeta?.methodologyVersion) children.push(para(T("cmp.methodology", { v: safeText(input.legacyMeta.methodologyVersion, 60) }), { size: S_SMALL, color: SECONDARY, before: 60 }));

  // B ekolü
  children.push(sectionHeading(bLabel));
  const bRows = rows.filter((r) => r.classic && typeof r.classic.value === "number");
  children.push(bRows.length ? dataTable([T("cmp.concept"), T("th.value")], bRows.map((r) => [{ text: rowLabel(r), bold: true }, classicCell(r.classic)]), [60, 40]) : para(T("cmp.noValues"), { color: SECONDARY }));
  if (input.classicMeta?.methodologyVersion) children.push(para(T("cmp.methodology", { v: safeText(input.classicMeta.methodologyVersion, 60) }), { size: S_SMALL, color: SECONDARY, before: 60 }));

  // Kavram tablosu
  children.push(sectionHeading(T("cmp.table")));
  children.push(dataTable([T("cmp.concept"), aLabel, bLabel, T("cmp.relation"), T("cmp.mark")], rows.map((r) => [
    { text: rowLabel(r), bold: true },
    legacyCell(r.legacy),
    classicCell(r.classic),
    RELATION_LABEL(r.relation) ?? (safeText(r.relation, 40) || "—"),
    r.sameNameDifferentFormula ? { text: "", badges: [badge(sameName, "warn")] } : "—",
  ]), [24, 18, 18, 16, 24]));

  const gloss = rows.filter((r) => safeText(r.explanation, 10));
  if (gloss.length) {
    children.push(sectionHeading(T("cmp.glossary")));
    for (const r of gloss) {
      children.push(paraRuns([
        run(`${safeText(r.labelTr, TEXT_CAP.short)}`, { bold: true, color: INDIGO }),
        ...(r.sameNameDifferentFormula ? [run("  "), badge(sameName, "warn")] : []),
      ], { before: 80, after: 30 }));
      children.push(para(safeText(r.explanation, TEXT_CAP.para), { justify: true }));
    }
  }

  // Yalnız A / yalnız B
  children.push(sectionHeading(T("cmp.onlyOne")));
  const oa = (Array.isArray(a?.onlyLegacy) ? a.onlyLegacy : []).map(onlyLabel).filter(Boolean);
  const ob = (Array.isArray(a?.onlyClassic) ? a.onlyClassic : []).map(onlyLabel).filter(Boolean);
  children.push(subHeading(T("cmp.only", { label: aLabel })));
  children.push(...(oa.length ? bullets(oa) : [para(T("cmp.none"), { color: SECONDARY })]));
  children.push(subHeading(T("cmp.only", { label: bLabel })));
  children.push(...(ob.length ? bullets(ob) : [para(T("cmp.none"), { color: SECONDARY })]));
  const miss = (Array.isArray(a?.missing) ? (a.missing as readonly (string | { labelTr: string })[]) : []).map((m) => (typeof m === "string" ? safeText(m, TEXT_CAP.short) : safeText(m?.labelTr, TEXT_CAP.short))).filter(Boolean);
  const missSide = typeof a?.missing === "string" ? MISSING_SIDE_LABEL(a.missing) ?? "" : "";
  if (missSide) children.push(noteBox(T("cmp.missingSideTitle"), [missSide], "warn"));
  if (miss.length) { children.push(subHeading(T("cmp.missingSub"))); children.push(...bullets(miss)); }

  // Taşlar (üç sütun)
  const st = a?.stones;
  if (st) {
    children.push(sectionHeading(T("cmp.stonesHeading")));
    children.push(para(src ? STONE_REPORT_DISCLAIMER : T("stoneDisclaimer"), { italics: true, size: S_SMALL, color: SECONDARY }));
    const c1 = (st.legacyAssigned ?? []).map(stoneLabel).filter(Boolean);
    const c2 = (st.classicDirect ?? []).map(stoneLabel).filter(Boolean);
    const c3 = (st.classicDerived ?? []).map(stoneLabel).filter(Boolean);
    const n = Math.max(c1.length, c2.length, c3.length, 1);
    const trows: Cell[][] = [];
    for (let i = 0; i < Math.min(n, 30); i++) trows.push([c1[i] ?? "", c2[i] ?? "", c3[i] ?? ""]);
    children.push(dataTable([T("cmp.colA", { a: aLabel }), T("cmp.colB", { b: bLabel }), T("cmp.colC", { b: bLabel })], trows, [33, 33, 34]));
    const ov = (st.overlap ?? []).map(stoneLabel).filter(Boolean);
    children.push(para(ov.length ? T("cmp.overlap", { list: ov.join(", ") }) : T("cmp.noOverlap"), { size: S_SMALL, color: SECONDARY, before: 80 }));
  }

  // Uzman notu (SONDA)
  const note = safeText(input.note, TEXT_CAP.long);
  if (note) {
    children.push(sectionHeading(T("cmp.expertNote")));
    children.push(para(note, { justify: true }));
  }
  children.push(...disclaimerSection({ stones: !!st, expertName: opts.expertName, brand: opts }));
  return makeDoc(children, { headerLabel: T("cmp.header", { title }), docTitle: T("cmp.docTitle", { title }), at, brand: opts });
}

/** Repository satırı (snake_case) ya da uzman görünümü (camelCase) → rapor kaydı. provider_meta'dan YALNIZ tarih/başarısız etiketleri alınır. */
export function toReportRecord(row: Record<string, unknown>): ClassicReportRecord {
  const pm = isObj(row.provider_meta) ? row.provider_meta : {};
  const meta = isObj(row.meta) ? row.meta : {};
  const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const failedRaw = Array.isArray(meta.failed) ? meta.failed : Array.isArray(pm.failed) ? pm.failed : [];
  const kind = row.kind;
  return {
    id: strOrNull(row.id),
    kind: kind === "relationship" || kind === "business" || kind === "names" ? kind : "person",
    title: typeof row.title === "string" ? row.title : "",
    input: row.input ?? null,
    techniques: Array.isArray(row.techniques) ? row.techniques.filter((x): x is string => typeof x === "string") : [],
    status: row.status === "partial" ? "partial" : "complete",
    result: isObj(row.result) ? row.result : {},
    methodologyVersion: strOrNull(row.methodology_version) ?? strOrNull(meta.methodologyVersion) ?? strOrNull(row.methodologyVersion) ?? "",
    apiSchemaVersion: strOrNull(row.api_schema_version) ?? strOrNull(row.apiSchemaVersion),
    referenceDate: strOrNull(pm.reference_date) ?? strOrNull(meta.referenceDate),
    createdAt: strOrNull(row.created_at) ?? strOrNull(row.createdAt),
    failed: failedRaw.filter((x): x is string => typeof x === "string"),
  };
}

/** Kişi raporu bölüm grubu doğrulaması (route girdisi için). */
export function parsePersonReportGroups(v: unknown): PersonReportGroup[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(PERSON_REPORT_GROUPS as readonly string[]);
  return v.filter((x): x is PersonReportGroup => typeof x === "string" && set.has(x)).filter((x, i, arr) => arr.indexOf(x) === i);
}
