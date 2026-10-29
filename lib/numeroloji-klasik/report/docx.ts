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
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
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

const VARIANT_LABELS: Readonly<Record<ReportVariant, string>> = Object.freeze({
  summary: "Özet Rapor",
  technical: "Teknik Rapor",
  full: "Tam Rapor",
});

const GROUP_LABELS: Readonly<Record<PersonReportGroup, string>> = Object.freeze({
  core: "Pisagor çekirdek sayılar",
  karmic: "Karmik dersler ve borçlar",
  timing: "Zamanlama (zirveler, zorluklar, kişisel döngüler)",
  bridge: "Köprü sayıları",
  name_letters: "İsim harfleri",
  hidden_subconscious: "Gizli tutku ve bilinçaltı benlik",
  birthday_profile: "Doğum günü profili",
  maturity: "Olgunluk durumu",
  chaldean: "Kalde (Cheiro) isim analizi",
  dual: "İki sistem karşılaştırması",
  lucky: "Uğurlu ilişkiler",
  stones: "Numeroloji – Doğaltaş",
});

const TECHNIQUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  chart: "Tam numeroloji haritası",
  core: "Tam numeroloji haritası",
  bridge: "Köprü sayıları",
  personal_day: "Kişisel gün",
  daily: "Günün sayısı (sembolik)",
  chaldean: "Kalde isim analizi",
  dual: "İki sistem karşılaştırması",
  compatibility: "Numerolojik uyum",
  business_name: "İşletme adı analizi",
});

const CORE_KEYS = ["lifePath", "expression", "soulUrge", "personality", "birthDay", "maturity"] as const;
type CoreKey = (typeof CORE_KEYS)[number];

const CORE_METHOD_NOTES: Readonly<Record<CoreKey, string>> = Object.freeze({
  lifePath: "Doğum tarihinin ay, gün ve yıl bileşenleri ayrı ayrı indirgenir, ardından toplanıp yeniden indirgenir. 11, 22 ve 33 usta sayı olarak korunur.",
  expression: "Tam addaki tüm harflerin Pisagor değerleri (A=1 … I=9 döngüsü) her ad için ayrı toplanır ve indirgenir; ara toplamlar 13/14/16/19 ise karmik borç işaretlenir.",
  soulUrge: "Yalnız sesli harflerin Pisagor değerleri toplanır ve indirgenir.",
  personality: "Yalnız sessiz harflerin Pisagor değerleri toplanır ve indirgenir.",
  birthDay: "Doğum günü (ayın kaçı olduğu) doğrudan alınır; iki basamaklı günler gerekirse indirgenir.",
  maturity: "Yaşam Yolu ile İfade sayısı toplanır ve indirgenir.",
});

const CHALDEAN_METHOD_NOTE =
  "Kalde (Cheiro) yönteminde harflere 1–8 değerleri verilir (9 kutsal kabul edilir ve harfe atanmaz). Toplam bileşik sayı (10–52) kendi anlamıyla okunur, ardından tek basamaklı köke indirgenir.";

const RELATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  same: "Aynı değer",
  equal: "Aynı değer",
  same_value: "Aynı değer",
  same_root: "Aynı kök",
  different: "Farklı",
  differs: "Farklı",
  not_comparable: "Karşılaştırılamaz",
  incomparable: "Karşılaştırılamaz",
  missing: "Eksik",
  one_missing: "Bir tarafta yok",
  only_legacy: "Yalnız A yönteminde",
  only_classic: "Yalnız B yönteminde",
});

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

const TR_DATE_TIME = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const TR_DATE = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric" });

function fmtInstant(d: Date): string {
  return TR_DATE_TIME.format(d);
}
function fmtInstantStr(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? TR_DATE.format(d) : "";
}
/** "YYYY-MM-DD" → "GG.AA.YYYY" (saat dilimi kayması yok). */
function fmtCalendar(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : safeText(v, 40);
}
function fmtBirth(b: unknown): string {
  if (!isObj(b)) return "";
  const y = num(b.year), m = num(b.month), d = num(b.day);
  if (y === null || m === null || d === null) return "";
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function verificationRuns(v: Verification | undefined | null): TextRun[] {
  const s = v?.status ?? "unverified";
  const tone = s === "match" ? "ok" : s === "mismatch" ? "bad" : "info";
  const out: TextRun[] = [badge(VERIFICATION_LABELS[s] ?? VERIFICATION_LABELS.unverified, tone)];
  if (s === "mismatch" && v?.oracleValue !== undefined) {
    const ov = Array.isArray(v.oracleValue) ? v.oracleValue.join(", ") : String(v.oracleValue);
    out.push(run(`  Bağımsız hesap: ${safeText(ov, 80)}`, { size: S_SMALL, color: SECONDARY }));
  }
  if (v?.note) out.push(run(`  ${safeText(v.note, TEXT_CAP.line)}`, { size: S_SMALL, color: SECONDARY }));
  return out;
}

function verificationPara(v: Verification | undefined | null): Paragraph {
  return paraRuns([run("Doğrulama: ", { bold: true, size: S_SMALL, color: INDIGO }), ...verificationRuns(v)], { after: 80 });
}

/** Sayı rozetleri: usta sayı + karmik borç (+ isteğe bağlı bileşik). */
function numberBadges(n: { value?: number; type?: string; karmicDebt?: number | null; verification?: Verification | null } | null | undefined, o: { master?: boolean } = {}): TextRun[] {
  if (!n) return [];
  const out: TextRun[] = [];
  // NK-R4: bağımsız kontrolde fark çıkan değer HER düzeyde (özet dahil) işaretlenir — kesin sonuç gibi basılmaz.
  if (n.verification?.status === "mismatch") out.push(badge("Kontrol farkı", "warn"));
  const isMaster = n.type === "master" || n.value === 11 || n.value === 22 || n.value === 33;
  if (isMaster && n.type !== "compound" && o.master !== false) out.push(badge(NUMBER_KIND_LABELS.master, "master"));
  if (typeof n.karmicDebt === "number") out.push(badge(`${KARMIC_DEBT_LABEL} ${n.karmicDebt}`, "karmic"));
  return out;
}

function traceBlock(label: string, calc: unknown): Block[] {
  const t = safeTrace(calc);
  if (!t) return [];
  return [noteBox(`Nasıl Hesaplandı? — ${label}`, [t])];
}

function interpretation(m: MeaningBlock | null | undefined, lv: Level, titlePrefix?: string): Block[] {
  if (!m) return [];
  const out: Block[] = [];
  const title = safeText(m.title, TEXT_CAP.short);
  out.push(para(`${INTERPRETATION_HEADING}${titlePrefix ? ` — ${titlePrefix}` : ""}${title ? `: ${title}` : ""}`, { bold: true, color: INDIGO, size: S_SMALL, after: 60, keepNext: true }));
  const kw = safeList(m.keywords, 12, 60);
  if (kw.length) out.push(para(`Anahtar kelimeler: ${kw.join(", ")}`, { size: S_SMALL, color: SECONDARY, after: 60 }));
  const d = safeText(m.description, lv.textCap);
  if (d) out.push(para(d, { justify: true }));
  if (lv.details) {
    const st = safeList(m.strengths, lv.fullDetails ? 10 : 3, lv.fullDetails ? TEXT_CAP.para : 400);
    if (st.length) { out.push(para("Güçlü yönler", { bold: true, size: S_SMALL, color: INDIGO, after: 40, keepNext: true })); out.push(...bullets(st)); }
    const ch = safeList(m.challenges, lv.fullDetails ? 10 : 3, lv.fullDetails ? TEXT_CAP.para : 400);
    if (ch.length) { out.push(para("Zorlayıcı yönler", { bold: true, size: S_SMALL, color: INDIGO, after: 40, keepNext: true })); out.push(...bullets(ch)); }
  }
  if (lv.fullDetails) {
    for (const [k, lab] of [["career", "Kariyer"], ["relationships", "İlişkiler"], ["spirituality", "Ruhsallık"]] as const) {
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

async function pack(children: Block[], o: { headerLabel: string; docTitle: string; at: Date }): Promise<Buffer> {
  const docTitle = safeText(o.docTitle, TEXT_CAP.short) || "Klasik Numeroloji Raporu";
  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: docTitle,
    styles: { default: { document: { run: { font: FONT, size: S_BODY, color: BODY } } } },
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, size: { width: 11906, height: 16838 } } },
      headers: { default: runningHeader(safeText(o.headerLabel, TEXT_CAP.short)) },
      footers: { default: runningFooter(CLASSIC_REPORT_FOOTER) },
      children,
    }],
  });
  return Packer.toBuffer(doc, false, [{ path: "docProps/core.xml", data: coreXml(docTitle, o.at) }]);
}

function disclaimerSection(o: { stones?: boolean; expertName?: string | null }): Block[] {
  const out: Block[] = [sectionHeading("Bilgilendirme")];
  out.push(para(wellnessNote("numeroloji").full, { italics: true, size: S_SMALL, color: SECONDARY }));
  out.push(para(CLASSIC_REPORT_DISCLAIMER, { italics: true, size: S_SMALL, color: SECONDARY }));
  if (o.stones) {
    out.push(para(STONE_REPORT_DISCLAIMER, { italics: true, size: S_SMALL, color: SECONDARY }));
    out.push(para(wellnessNote("dogaltas").full, { italics: true, size: S_SMALL, color: SECONDARY }));
  }
  const name = safeText(o.expertName, TEXT_CAP.short);
  if (name) out.push(para(`Hazırlayan: ${name}`, { size: S_SMALL, color: SECONDARY, before: 60 }));
  return out;
}

function methodSection(record: ClassicReportRecord, at: Date, methods: readonly string[], variantLabel: string): Block[] {
  const out: Block[] = [sectionHeading("Yöntem Notu")];
  const rows: [string, string][] = [
    ["Rapor türü", variantLabel],
    ["Kullanılan yöntemler", methods.length ? methods.join(" · ") : "—"],
    ["Hesaplanan teknikler", record.techniques.map((t) => TECHNIQUE_LABELS[t] ?? safeText(t, 40)).filter(Boolean).join(", ") || "—"],
    ["Metodoloji sürümü", safeText(record.methodologyVersion, 60) || "—"],
    ["Veri şeması sürümü", safeText(record.apiSchemaVersion, 60) || "—"],
  ];
  const ref = referenceDateOf(record);
  if (ref) rows.push(["Referans tarih", fmtCalendar(ref)]);
  const created = fmtInstantStr(record.createdAt);
  if (created) rows.push(["Analiz tarihi", created]);
  rows.push(["Rapor tarihi", fmtInstant(at)]);
  out.push(kvTable(rows));
  out.push(spacer(80));
  out.push(para("Rapor yalnız kayıtlı analizden üretilir; rapor oluşturulurken yeni hesap yapılmaz. Sayılar ayrıca bağımsız bir hesapla karşılaştırılır ve sonuç her sayının yanında “Doğrulama” olarak belirtilir (teknik ve tam raporda).", { size: S_SMALL, color: SECONDARY }));
  if (record.status === "partial" || (record.failed?.length ?? 0) > 0) {
    const f = (record.failed ?? []).map((x) => TECHNIQUE_LABELS[x] ?? safeText(x, 40)).filter(Boolean);
    out.push(noteBox("Kısmi analiz", [`Bu analizde bazı teknikler hesaplanamadı${f.length ? `: ${f.join(", ")}` : ""}. Eksik bölümler rapora eklenmemiştir.`], "warn"));
  }
  return out;
}

function methodsUsed(r: Record<string, unknown>): string[] {
  const keys = Object.keys(r);
  const pyth = keys.some((k) => ["chart", "bridge", "personal_day", "compatibility"].includes(k) || k.startsWith("dual"));
  const chal = keys.some((k) => k === "chaldean" || k === "business_name" || k.startsWith("dual"));
  return [pyth ? METHOD_LABELS.pythagorean : "", chal ? METHOD_LABELS.chaldean : ""].filter(Boolean);
}

// ── Kişi raporu bölümleri ──────────────────────────────────────────────────────────────────────

function coreSection(chart: ChartResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading(`Pisagor Çekirdek Sayılar — ${METHOD_LABELS.pythagorean}`)];
  const headers = ["Sayı", "Değer", "Tür", "Başlık", ...(lv.verify ? ["Doğrulama"] : [])];
  const rows: Cell[][] = [];
  for (const k of CORE_KEYS) {
    const n = chart.core[k];
    if (!n) continue;
    const row: Cell[] = [
      { text: CORE_NUMBER_LABELS[k], bold: true },
      { text: String(n.value), bold: true, color: INDIGO, badges: numberBadges(n, { master: false }) },
      NUMBER_KIND_LABELS[n.type] ?? "—",
      safeText(n.meaning?.title, TEXT_CAP.short) || "—",
    ];
    if (lv.verify) row.push({ text: "", badges: verificationRuns(n.verification) });
    rows.push(row);
  }
  out.push(dataTable(headers, rows, lv.verify ? [20, 14, 14, 30, 22] : [24, 18, 18, 40]));
  for (const k of CORE_KEYS) {
    const n = chart.core[k];
    if (!n) continue;
    out.push(subHeading(`${CORE_NUMBER_LABELS[k]}: ${n.value}`));
    const b = numberBadges(n);
    if (b.length) out.push(paraRuns(b, { after: 60 }));
    out.push(...interpretation(n.meaning, lv));
    if (lv.trace) {
      out.push(...traceBlock(CORE_NUMBER_LABELS[k], n.calculation));
      out.push(para(`Yöntem notu (${METHOD_LABELS.pythagorean}): ${CORE_METHOD_NOTES[k]}`, { size: S_SMALL, color: SECONDARY, before: 60 }));
    }
    if (lv.verify) out.push(verificationPara(n.verification));
  }
  return out;
}

function karmicSection(chart: ChartResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading("Karmik Dersler ve Karmik Borçlar")];
  const kl = chart.karmicLessons;
  out.push(subHeading("Karmik dersler — isimdeki sayı dağılımı (1–9)"));
  const missing = new Set(Array.isArray(kl?.missingNumbers) ? kl.missingNumbers : []);
  const counts: Cell[] = [];
  for (let i = 1; i <= 9; i++) {
    const c = num(kl?.presentNumbers?.[String(i)]) ?? 0;
    counts.push(missing.has(i) ? { text: `${c} · Eksik`, bold: true, fill: AMBER_BG } : { text: String(c) });
  }
  out.push(dataTable(["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((x) => `Sayı ${x}`), [counts]));
  out.push(para(missing.size ? `Eksik sayılar (karmik dersler): ${[...missing].join(", ")}` : "İsimde eksik sayı yok; karmik ders bulunmuyor.", { size: S_SMALL, color: SECONDARY, before: 60 }));
  for (const l of Array.isArray(kl?.lessons) ? kl.lessons : []) {
    out.push(subHeading(`Karmik ders ${l.number}: ${safeText(l.lesson, TEXT_CAP.short)}`));
    const d = safeText(l.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    const h = safeText(l.howToOvercome, lv.textCap);
    if (h) out.push(paraRuns([run("Aşma yolu: ", { bold: true, color: INDIGO }), run(h)], { after: 80 }));
  }
  if (lv.verify && kl) out.push(verificationPara(kl.verification));

  const kd = chart.karmicDebt;
  out.push(subHeading("Karmik borçlar"));
  if (kd?.hasKarmicDebt && Array.isArray(kd.debtNumbers) && kd.debtNumbers.length) {
    out.push(paraRuns(kd.debtNumbers.map((n) => badge(`${KARMIC_DEBT_LABEL} ${n}`, "karmic")), { after: 80 }));
    for (const m of Array.isArray(kd.meanings) ? kd.meanings : []) {
      out.push(para(`${KARMIC_DEBT_LABEL} ${m.number}: ${safeText(m.description, TEXT_CAP.line)}`, { bold: true, color: INDIGO, after: 60, keepNext: true }));
      const c = safeText(m.challenge, lv.textCap);
      if (c) out.push(paraRuns([run("Zorluk: ", { bold: true, color: INDIGO }), run(c)], { after: 60 }));
      const r = safeText(m.resolution, lv.textCap);
      if (r) out.push(paraRuns([run("Çözüm: ", { bold: true, color: INDIGO }), run(r)], { after: 80 }));
    }
  } else {
    out.push(para("Çekirdek sayılarda karmik borç (13, 14, 16, 19) bulunmuyor.", { color: SECONDARY }));
  }
  const msg = safeText(kd?.message, lv.textCap);
  if (msg) out.push(para(msg, { justify: true }));
  if (lv.verify && kd) out.push(verificationPara(kd.verification));
  return out;
}

function ageRange(p: Period): string {
  if (p.endAge === null || p.endAge === undefined) return p.startAge <= 0 ? "Tüm yaşam boyunca" : `${p.startAge} yaş ve sonrası`;
  return `${p.startAge}–${p.endAge} yaş`;
}

function periodsTable(list: readonly Period[], kind: "Zirve" | "Zorluk", lv: Level): Block[] {
  const headers = ["Dönem", "Sayı", "Yaş aralığı", "Başlık", ...(lv.verify ? ["Doğrulama"] : [])];
  const rows: Cell[][] = list.map((p) => {
    const r: Cell[] = [
      { text: kind === "Zorluk" && p.position === 3 && p.endAge === null && p.startAge <= 0 ? "Ana zorluk" : `${p.position}. ${kind}`, bold: true },
      { text: String(p.number), bold: true, color: INDIGO, badges: numberBadges({ value: p.number }) },
      ageRange(p),
      safeText(p.title, TEXT_CAP.short) || "—",
    ];
    if (lv.verify) r.push({ text: "", badges: verificationRuns(p.verification) });
    return r;
  });
  return [dataTable(headers, rows, lv.verify ? [16, 12, 20, 32, 20] : [18, 14, 24, 44])];
}

function periodDetails(list: readonly Period[], kind: "Zirve" | "Zorluk", lv: Level): Block[] {
  if (!lv.details) return [];
  const out: Block[] = [];
  for (const p of list) {
    out.push(para(`${p.position}. ${kind} (${ageRange(p)}) — ${p.number}: ${safeText(p.title, TEXT_CAP.short)}`, { bold: true, color: INDIGO, size: S_SMALL, before: 80, after: 40, keepNext: true }));
    const d = safeText(p.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    if (lv.fullDetails) {
      const op = safeList(p.opportunities, 6, 400);
      if (op.length) { out.push(para("Fırsatlar", { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(op)); }
      const ch = safeList(p.challenges, 6, 400);
      if (ch.length) { out.push(para("Zorluklar", { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(ch)); }
    }
    const les = safeText(p.lesson, lv.textCap);
    if (les) out.push(paraRuns([run("Ders: ", { bold: true, color: INDIGO }), run(les)], { after: 60 }));
    const how = safeText(p.howToOvercome, lv.textCap);
    if (how) out.push(paraRuns([run("Aşma yolu: ", { bold: true, color: INDIGO }), run(how)], { after: 80 }));
  }
  return out;
}

function timingSection(chart: ChartResult, day: PersonalDayResult | null, refDate: string | null, lv: Level, daily: DailyResult | null = null): Block[] {
  const out: Block[] = [sectionHeading("Zamanlama — Zirveler, Zorluklar ve Kişisel Döngüler")];
  const pins = Array.isArray(chart.pinnacles) ? chart.pinnacles : [];
  const chs = Array.isArray(chart.challenges) ? chart.challenges : [];
  if (pins.length) {
    out.push(subHeading("Zirveler (yaşam dönemleri)"));
    out.push(...periodsTable(pins, "Zirve", lv));
    out.push(...periodDetails(pins, "Zirve", lv));
  }
  if (chs.length) {
    out.push(subHeading("Zorluklar (mücadele sayıları)"));
    out.push(...periodsTable(chs, "Zorluk", lv));
    out.push(...periodDetails(chs, "Zorluk", lv));
  }
  const py = chart.personalYear;
  if (py) {
    out.push(subHeading("Kişisel yıl ve kişisel ay"));
    out.push(valueCards([
      { label: "Kişisel Yıl", value: String(py.personalYear) },
      ...(py.personalMonth ? [{ label: "Kişisel Ay", value: String(py.personalMonth.personalMonth) }] : []),
      ...(day ? [{ label: "Kişisel Gün", value: String(day.personalDay) }] : []),
    ]));
    out.push(spacer(80));
    const rows: [string, string][] = [];
    if (refDate) rows.push(["Hedef tarih", fmtCalendar(refDate)]);
    rows.push(["Kişisel yıl teması", safeText(py.theme, TEXT_CAP.short)]);
    if (py.cycle) rows.push(["Döngü", safeText(py.cycle, TEXT_CAP.short)]);
    if (py.personalMonth) rows.push(["Kişisel ay teması", safeText(py.personalMonth.theme, TEXT_CAP.short)]);
    out.push(kvTable(rows));
    const f = safeText(py.forecast, lv.textCap);
    if (f) out.push(para(f, { justify: true, before: 80 }));
    if (lv.details) {
      const op = safeList(py.opportunities, 8, 300);
      if (op.length) { out.push(para("Fırsatlar", { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(op)); }
      const ch = safeList(py.challenges, 8, 300);
      if (ch.length) { out.push(para("Dikkat edilecekler", { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(ch)); }
    }
    const adv = safeText(py.advice, lv.textCap);
    if (adv) out.push(paraRuns([run("Öneri: ", { bold: true, color: INDIGO }), run(adv)], { after: 80 }));
    const focus = safeText(py.personalMonth?.focus, lv.textCap);
    if (focus) out.push(paraRuns([run("Ayın odağı: ", { bold: true, color: INDIGO }), run(focus)], { after: 80 }));
    if (lv.verify) out.push(verificationPara(py.verification));
  }
  if (day) {
    out.push(subHeading(`Kişisel gün — ${fmtCalendar(day.targetDate)}`));
    out.push(kvTable([
      ["Hedef tarih", fmtCalendar(day.targetDate)],
      ["Kişisel gün", `${day.personalDay} · ${safeText(day.theme, TEXT_CAP.short)}`],
      ["Kişisel ay", `${day.personalMonth} · ${safeText(day.personalMonthTheme, TEXT_CAP.short)}`],
      ["Kişisel yıl", `${day.personalYear} · ${safeText(day.personalYearTheme, TEXT_CAP.short)}`],
    ]));
    const g = safeText(day.guidance, lv.textCap);
    if (g) out.push(para(g, { justify: true, before: 80 }));
    if (lv.verify) out.push(verificationPara(day.verification));
  }
  if (daily && daily.number && typeof daily.number.value === "number") {
    // Günün Sayısı: Kişisel Gün'den AYRI ve sembolik olduğu açıkça yazılır (doğrulama satırı yok — doğrulanamaz).
    out.push(subHeading(`Günün sayısı (sembolik) — ${fmtCalendar(daily.date)}`));
    out.push(kvTable([
      ["Tarih", fmtCalendar(daily.date)],
      ["Günün sayısı", `${daily.number.value}${daily.number.meaning?.title ? ` · ${safeText(daily.number.meaning.title, TEXT_CAP.short)}` : ""}`],
      ["Tür", daily.seedMode === "common" ? "Bu güne ait ortak sembolik sayı" : "Kişiye özel tohumla üretilen sembolik sayı"],
    ]));
    out.push(para("Bu sayı doğum verisinden hesaplanmaz ve Kişisel Gün değildir; klasik yöntemin günlük sembolik rehberidir.", { size: S_SMALL, before: 60 }));
    const m = safeText(daily.dailyMessage, lv.textCap);
    if (m) out.push(para(m, { justify: true, before: 60 }));
  }
  return out;
}

const BRIDGE_KEYS = ["lifePathExpression", "expressionSoulUrge", "soulUrgePersonality", "expressionPersonality"] as const;

function bridgeSection(b: BridgeResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading("Köprü Sayıları")];
  out.push(para("Köprü sayısı, iki çekirdek sayı arasındaki farktır; iki enerjiyi uzlaştırmak için geliştirilecek niteliği gösterir.", { size: S_SMALL, color: SECONDARY }));
  const rows: Cell[][] = [];
  for (const k of BRIDGE_KEYS) {
    const it = b[k];
    if (!it) continue;
    const r: Cell[] = [
      { text: BRIDGE_LABELS[k], bold: true },
      `${it.from?.number ?? "—"} ↔ ${it.to?.number ?? "—"}`,
      { text: String(it.bridge), bold: true, color: INDIGO },
    ];
    if (lv.verify) r.push({ text: "", badges: verificationRuns(it.verification) });
    rows.push(r);
  }
  out.push(dataTable(["Köprü", "Sayılar", "Köprü sayısı", ...(lv.verify ? ["Doğrulama"] : [])], rows, lv.verify ? [34, 18, 18, 30] : [44, 28, 28]));
  for (const k of BRIDGE_KEYS) {
    const it = b[k];
    const m = safeText(it?.meaning, lv.textCap);
    if (it && m) out.push(paraRuns([run(`${BRIDGE_LABELS[k]} (${it.bridge}): `, { bold: true, color: INDIGO }), run(m)], { before: 60, after: 60 }));
  }
  return out;
}

function nameLettersSection(chart: ChartResult, lv: Level): Block[] {
  const nl = chart.nameLetters;
  if (!nl) return [];
  const out: Block[] = [sectionHeading("İsim Harfleri")];
  const rows: Cell[][] = [];
  if (nl.cornerstone) rows.push([{ text: CORE_NUMBER_LABELS.cornerstone, bold: true }, safeText(nl.cornerstone.letter, 4), String(nl.cornerstone.number), safeText(nl.cornerstone.meaning, lv.textCap) || "—"]);
  if (nl.capstone) rows.push([{ text: CORE_NUMBER_LABELS.capstone, bold: true }, safeText(nl.capstone.letter, 4), String(nl.capstone.number), safeText(nl.capstone.meaning, lv.textCap) || "—"]);
  if (nl.firstVowel) rows.push([{ text: CORE_NUMBER_LABELS.firstVowel, bold: true }, nl.firstVowel.letter === "Y" ? "Y (sesli işlevinde)" : safeText(nl.firstVowel.letter, 4), "—", safeText(nl.firstVowel.meaning, lv.textCap) || "—"]);
  if (!rows.length) return [];
  out.push(dataTable(["Harf rolü", "Harf", "Sayı", INTERPRETATION_HEADING], rows, [20, 10, 10, 60]));
  return out;
}

function hiddenSection(chart: ChartResult, lv: Level): Block[] {
  const hp = chart.hiddenPassion;
  const sc = chart.subconsciousSelf;
  if (!hp && !sc) return [];
  const out: Block[] = [sectionHeading("Gizli Tutku ve Bilinçaltı Benlik")];
  out.push(valueCards([
    ...(hp ? [{ label: CORE_NUMBER_LABELS.hiddenPassion, value: String(hp.number) }] : []),
    ...(sc ? [{ label: CORE_NUMBER_LABELS.subconsciousSelf, value: String(sc.number) }] : []),
  ]));
  if (hp) {
    out.push(subHeading(`${CORE_NUMBER_LABELS.hiddenPassion}: ${hp.number} — ${safeText(hp.title, TEXT_CAP.short)}`));
    out.push(para(`İsimde en sık geçen sayı(lar): ${listRun(hp.allPassions)} (${hp.count} kez)`, { size: S_SMALL, color: SECONDARY }));
    const d = safeText(hp.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    if (lv.verify) out.push(verificationPara(hp.verification));
  }
  if (sc) {
    out.push(subHeading(`${CORE_NUMBER_LABELS.subconsciousSelf}: ${sc.number} — ${safeText(sc.title, TEXT_CAP.short)}`));
    const d = safeText(sc.description, lv.textCap);
    if (d) out.push(para(d, { justify: true }));
    if (lv.verify) out.push(verificationPara(sc.verification));
  }
  return out;
}

function birthdayProfileSection(chart: ChartResult, lv: Level): Block[] {
  const b = chart.birthDayProfile;
  if (!b) return [];
  const out: Block[] = [sectionHeading("Doğum Günü Profili")];
  out.push(kvTable([
    ["Doğum günü", String(b.day)],
    ["İndirgenmiş", String(b.reducesTo)],
    ["Başlık", safeText(b.title, TEXT_CAP.short)],
    ["Anahtar kelimeler", safeList(b.keywords, 12, 60).join(", ") || "—"],
  ]));
  out.push(para(INTERPRETATION_HEADING, { bold: true, color: INDIGO, size: S_SMALL, before: 100, after: 60, keepNext: true }));
  const d = safeText(b.description, lv.textCap);
  if (d) out.push(para(d, { justify: true }));
  if (lv.details) {
    const st = safeList(b.strengths, 8, 400);
    if (st.length) { out.push(para("Güçlü yönler", { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(st)); }
    const ch = safeList(b.challenges, 8, 400);
    if (ch.length) { out.push(para("Zorlayıcı yönler", { bold: true, size: S_SMALL, color: INDIGO, after: 40 })); out.push(...bullets(ch)); }
  }
  if (lv.fullDetails) {
    const c = safeText(b.career, TEXT_CAP.para);
    if (c) out.push(paraRuns([run("Kariyer: ", { bold: true, color: INDIGO }), run(c)], { after: 80 }));
    const r = safeText(b.relationships, TEXT_CAP.para);
    if (r) out.push(paraRuns([run("İlişkiler: ", { bold: true, color: INDIGO }), run(r)], { after: 80 }));
  }
  return out;
}

function maturitySection(chart: ChartResult, lv: Level): Block[] {
  const m = chart.maturityStatus;
  if (!m) return [];
  const out: Block[] = [sectionHeading("Olgunluk Durumu")];
  const mat = chart.core?.maturity;
  out.push(kvTable([
    ["Olgunluk sayısı", mat ? String(mat.value) : "—"],
    ["Durum", m.isActive ? "Etkin" : "Henüz etkin değil"],
    ["Hesap yaşı", String(m.currentAge)],
    ["Etkinleşme aralığı", `${safeText(m.activationRange, 40)} yaş`],
  ]));
  out.push(para("Olgunluk sayısının etkisi genellikle orta yaşta belirginleşir ve ömrün ikinci yarısına yön verir.", { size: S_SMALL, color: SECONDARY, before: 60 }));
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
    p.compoundMeaning ? COMPOUND_NATURE_LABELS[p.compoundMeaning.nature] ?? "—" : "—",
  ];
  if (lv.verify) r.push({ text: "", badges: verificationRuns(p.verification) });
  return r;
}

function chaldeanSection(c: ChaldeanResult, lv: Level): Block[] {
  const out: Block[] = [sectionHeading(`Kalde İsim Analizi — ${METHOD_LABELS.chaldean}`)];
  if (lv.trace) out.push(para(`Yöntem notu: ${CHALDEAN_METHOD_NOTE}`, { size: S_SMALL, color: SECONDARY }));
  const parts: [string, ChaldeanPart | undefined][] = [
    [CORE_NUMBER_LABELS.destiny, c.destiny],
    [CORE_NUMBER_LABELS.soulUrge, c.soulUrge],
    [CORE_NUMBER_LABELS.personality, c.personality],
  ];
  const rows = parts.map(([l, p]) => chaldeanPartRow(l, p, lv)).filter((x): x is Cell[] => !!x);
  out.push(dataTable(["Sayı", "Toplam", "Bileşik", "Kök", "Bileşik adı", "Nitelik", ...(lv.verify ? ["Doğrulama"] : [])], rows, lv.verify ? [18, 10, 10, 10, 20, 12, 20] : [22, 12, 12, 12, 28, 14]));
  const nm = c.numberMeaning;
  if (nm) {
    out.push(subHeading(`Kader sayısı ${nm.number} — ${safeText(nm.title, TEXT_CAP.short)}`));
    out.push(paraRuns([
      run("Yönetici gezegen: ", { bold: true, color: INDIGO }),
      run(safeText(nm.planet, 60) || "—"),
      ...(nm.caution || c.caution ? [run("  "), badge("Dikkat işareti", "warn")] : []),
    ], { after: 60 }));
    const kw = safeList(nm.keywords, 12, 60);
    if (kw.length) out.push(para(`Anahtar kelimeler: ${kw.join(", ")}`, { size: S_SMALL, color: SECONDARY, after: 60 }));
    const m = safeText(nm.meaning, lv.textCap);
    if (m) {
      out.push(para(INTERPRETATION_HEADING, { bold: true, color: INDIGO, size: S_SMALL, after: 40, keepNext: true }));
      out.push(para(m, { justify: true }));
    }
    if (nm.caution || c.caution) out.push(para("Dikkat işareti: klasik yöntemde bu sayının etkisi dengeli yaşanmadığında zorlayıcı olabileceği belirtilir; kesin bir hüküm değildir.", { size: S_SMALL, color: SECONDARY }));
  }
  for (const [l, p] of parts) {
    if (!p) continue;
    const cm = p.compoundMeaning;
    if (cm && (lv.details || l === CORE_NUMBER_LABELS.destiny)) {
      const t = safeText(cm.meaning, lv.textCap);
      if (t) out.push(paraRuns([run(`${l} — bileşik ${cm.number}${cm.name ? ` (${safeText(cm.name, 80)})` : ""}: `, { bold: true, color: INDIGO }), run(t)], { before: 60, after: 60 }));
    }
    if (lv.trace) out.push(...traceBlock(`${l} (${METHOD_LABELS.chaldean})`, p.calculation));
  }
  const s = safeText(c.summary, lv.textCap);
  if (s) out.push(noteBox("Özet", [s]));
  return out;
}

function dualSection(d: DualResult, lv: Level, title = "İki Sistem Karşılaştırması"): Block[] {
  const out: Block[] = [sectionHeading(title)];
  out.push(para("Aynı ad iki ayrı yöntemle hesaplanır. Sonuçlar yan yana gösterilir; birbirine dönüştürülmez ya da birleştirilmez.", { size: S_SMALL, color: SECONDARY }));
  const py = d.pythagorean;
  const ch = d.chaldean;
  const rows: Cell[][] = [];
  if (py) rows.push([{ text: METHOD_LABELS.pythagorean, bold: true }, { text: String(py.value), bold: true, color: INDIGO, badges: numberBadges(py) }, safeText(py.title, TEXT_CAP.short) || "—", safeList(py.keywords, 5, 40).join(", ") || "—"]);
  if (ch) rows.push([
    { text: METHOD_LABELS.chaldean, bold: true },
    { text: String(ch.root ?? ch.value), bold: true, color: INDIGO, badges: ch.caution ? [badge("Dikkat işareti", "warn")] : [] },
    safeText(ch.title, TEXT_CAP.short) || "—",
    [ch.compound ? `Bileşik ${ch.compound}${ch.compoundMeaning?.name ? ` (${safeText(ch.compoundMeaning.name, 60)})` : ""}` : "", ch.planet ? `Gezegen: ${safeText(ch.planet, 40)}` : ""].filter(Boolean).join(" · ") || "—",
  ]);
  out.push(dataTable(["Yöntem", "Sayı", "Başlık", "Ek bilgi"], rows, [24, 14, 26, 36]));
  out.push(paraRuns([
    run("Uyum: ", { bold: true, color: INDIGO }),
    d.agreement ? badge("İki yöntem aynı kök sayıyı veriyor", "ok") : badge("İki yöntem farklı sayı veriyor", "warn"),
  ], { before: 80, after: 60 }));
  const n = safeText(d.note, lv.textCap);
  if (n) out.push(para(n, { justify: true }));
  if (lv.trace) {
    if (py) out.push(...traceBlock(METHOD_LABELS.pythagorean, py.calculation));
    if (ch) out.push(...traceBlock(METHOD_LABELS.chaldean, ch.calculation));
  }
  if (lv.verify) out.push(verificationPara(d.verification));
  return out;
}

function luckySection(chart: ChartResult): Block[] {
  const l = chart.luckyAssociations;
  if (!l) return [];
  const out: Block[] = [sectionHeading("Uğurlu İlişkiler")];
  out.push(para("Yaşam Yolu sayısının klasik yöntemdeki yönetici gezegeninden türetilen geleneksel ilişkilerdir.", { size: S_SMALL, color: SECONDARY }));
  out.push(kvTable([
    ["Yönetici gezegen", safeText(l.rulingPlanet, 60) || "—"],
    ["Element", safeText(l.element, 60) || "—"],
    ["Uğurlu gün", safeText(l.day, 60) || "—"],
    ["Renkler", safeList(l.colors, 12, 40).join(", ") || "—"],
    ["Taşlar (klasik yöntem listesi)", safeList(l.gemstones, 12, 60).join(", ") || "—"],
    ["Uyumlu sayılar", listRun(l.compatibleNumbers)],
    ["Uyumsuz sayılar", listRun(l.incompatibleNumbers)],
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
    return [{ text: stoneName(s), bold: true }, [reasons.join(" ") || "—", other ? `(+${other} ek gerekçe)` : ""].filter(Boolean).join(" ")];
  });
}

function groupOf(stones: StoneMatchResult, m: StoneMatchMethod): StoneMatchGroup | null {
  return (Array.isArray(stones.groups) ? stones.groups : []).find((g) => g && g.method === m) ?? null;
}

function stonesSection(stones: StoneMatchResult): Block[] {
  const out: Block[] = [sectionHeading("Numeroloji – Doğaltaş")];
  out.push(noteBox("", [STONE_REPORT_DISCLAIMER]));
  out.push(spacer(80));

  // 1) Haritanın önerdiği
  out.push(subHeading("1. Haritanın önerdiği taşlar"));
  out.push(para("Klasik yöntemin Yaşam Yolu sayısı için verdiği uğurlu taşlar listesi.", { size: S_SMALL, color: SECONDARY }));
  const direct = Array.isArray(stones.providerDirect) ? stones.providerDirect : [];
  const STATUS: Record<string, string> = { matched: "Kütüphanede eşleşti", ambiguous: "Birden çok aday (uzman seçer)", unmatched: "Kütüphanede bulunamadı", text_only: "Yalnız ad" };
  out.push(dataTable(["Listede geçen ad", "Durum", "Kütüphane karşılığı"], direct.map((d) => [
    { text: safeText(d.input, 80) || "—", bold: true },
    STATUS[d.status] ?? "—",
    d.status === "matched" ? safeText(d.nameTr, 80) || "—" : d.status === "ambiguous" ? (Array.isArray(d.candidates) ? d.candidates.map((c) => stoneName(c)).filter(Boolean).join(", ") : "—") : "—",
  ]), [32, 28, 40]));
  const pairs = groupOf(stones, "pairs_with");
  if (pairs?.items?.length) {
    out.push(para(safeText(pairs.label, TEXT_CAP.short) || "Doğrudan önerilerle birlikte kullanılan taşlar", { bold: true, size: S_SMALL, color: INDIGO, before: 80, after: 40 }));
    out.push(dataTable(["Taş", "Gerekçe"], suggestionRows(pairs.items, "pairs_with"), [32, 68]));
  }

  // 2) Titreşim eşleşmesi (birebir ↔ kök ayrı)
  out.push(subHeading("2. Titreşim eşleşmesi"));
  const exact = groupOf(stones, "vibration_exact");
  const root = groupOf(stones, "vibration_root");
  out.push(para("Birebir eşleşme (taşın sayısal titreşimi = çekirdek sayınız)", { bold: true, size: S_SMALL, color: INDIGO, after: 40 }));
  out.push(exact?.items?.length ? dataTable(["Taş", "Gerekçe"], suggestionRows(exact.items, "vibration_exact"), [32, 68]) : para("Birebir titreşim eşleşmesi yok.", { color: SECONDARY, size: S_SMALL }));
  out.push(para("Kök sayı üzerinden (usta / bileşik sayının tek basamaklı kökü — birebir eşleşme değildir)", { bold: true, size: S_SMALL, color: INDIGO, before: 80, after: 40 }));
  out.push(root?.items?.length ? dataTable(["Taş", "Gerekçe"], suggestionRows(root.items, "vibration_root"), [32, 68]) : para("Kök sayı üzerinden eşleşme yok.", { color: SECONDARY, size: S_SMALL }));

  // 3) Gezegen ilişkisi
  out.push(subHeading("3. Gezegen ilişkisi"));
  const planet = groupOf(stones, "planet");
  out.push(planet?.items?.length ? dataTable(["Taş", "Gerekçe"], suggestionRows(planet.items, "planet"), [32, 68]) : para("Yönetici gezegenle ilişkili taş bulunamadı.", { color: SECONDARY, size: S_SMALL }));

  const element = groupOf(stones, "element");
  if (element?.items?.length) {
    out.push(subHeading("Ek: Element ilişkisi"));
    out.push(dataTable(["Taş", "Gerekçe"], suggestionRows(element.items, "element"), [32, 68]));
  }
  const notes = safeList(stones.notes, 12, TEXT_CAP.line);
  if (!stones.libraryAvailable) notes.unshift("Taş kütüphanesi bu raporda kullanılamadı; yalnız klasik yöntem listesindeki adlar gösterilir.");
  if (notes.length) out.push(noteBox("Notlar", notes));
  const disc = safeText(stones.disclaimer?.text, TEXT_CAP.line);
  if (disc && disc !== STONE_REPORT_DISCLAIMER) out.push(para(disc, { italics: true, size: S_SMALL, color: SECONDARY, before: 60 }));
  return out;
}

// ── Genel kapak ────────────────────────────────────────────────────────────────────────────────

function cover(o: { heading: string; subtitle: string; bulletsList?: string[]; info: [string, string][] }): Block[] {
  return coverPage(o);
}

function summaryCards(chart: ChartResult): Block[] {
  const cards = CORE_KEYS.filter((k) => chart.core[k]).map((k) => ({ label: CORE_NUMBER_LABELS[k], value: String(chart.core[k].value), badges: numberBadges(chart.core[k]) }));
  return [valueCards(cards.slice(0, 3)), spacer(60), ...(cards.length > 3 ? [valueCards(cards.slice(3))] : [])];
}

// ── Dışa açık kurucular ────────────────────────────────────────────────────────────────────────

/** Kişi raporu (özet / teknik / tam). */
export async function buildPersonReport(record: ClassicReportRecord, opts: PersonReportOptions): Promise<Buffer> {
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
  const title = safeText(record.title, TEXT_CAP.short) || name || "Klasik Numeroloji";
  const children: Block[] = [];
  children.push(...cover({
    heading: "KLASİK NUMEROLOJİ RAPORU",
    subtitle: VARIANT_LABELS[opts.variant],
    bulletsList: groups.map((g) => GROUP_LABELS[g]),
    info: [
      ["Başlık", title],
      ["Danışan", name || "—"],
      ["Doğum tarihi", personBirth(record, chart) || "—"],
      ["Analiz tarihi", fmtInstantStr(record.createdAt) || "—"],
      ["Rapor tarihi", fmtInstant(at)],
    ],
  }));

  // Özet
  children.push(sectionHeading("Özet", true));
  if (chart) {
    children.push(...summaryCards(chart));
    const s = safeText(chart.summary, lv.textCap);
    if (s) {
      children.push(para(INTERPRETATION_HEADING, { bold: true, color: INDIGO, size: S_SMALL, before: 120, after: 40, keepNext: true }));
      children.push(para(s, { justify: true }));
    }
  } else {
    children.push(para("Bu analizde tam numeroloji haritası bulunmuyor; yalnız seçilen teknikler raporlanmıştır.", { color: SECONDARY }));
  }
  children.push(para(`Yöntemler: ${methodsUsed(R).join(" · ") || "—"}`, { size: S_SMALL, color: SECONDARY, before: 60 }));

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
  children.push(...methodSection(record, at, methodsUsed(R), VARIANT_LABELS[opts.variant]));
  children.push(...disclaimerSection({ stones: groups.includes("stones"), expertName: opts.expertName }));
  return pack(children, { headerLabel: `Klasik Numeroloji Raporu  ·  ${title}`, docTitle: `Klasik Numeroloji — ${title}`, at });
}

/** Numeroloji – Doğaltaş raporu (kayıtlı harita + eşleştirme sonucu). */
export async function buildStonesReport(record: ClassicReportRecord, stones: StoneMatchResult, opts: CommonReportOptions = {}): Promise<Buffer> {
  const at = toDate(opts.generatedAt);
  const R = isObj(record.result) ? record.result : {};
  const chart = chartOf(R);
  const name = personName(record, chart);
  const title = safeText(record.title, TEXT_CAP.short) || name || "Numeroloji – Doğaltaş";
  const children: Block[] = [];
  children.push(...cover({
    heading: "NUMEROLOJİ – DOĞALTAŞ RAPORU",
    subtitle: "Sembolik ve geleneksel taş eşleştirmesi",
    info: [["Başlık", title], ["Danışan", name || "—"], ["Doğum tarihi", personBirth(record, chart) || "—"], ["Rapor tarihi", fmtInstant(at)]],
  }));
  children.push(sectionHeading("Eşleştirmede kullanılan sayılar", true));
  if (chart) children.push(...summaryCards(chart));
  else children.push(para("Kayıtta numeroloji haritası bulunmuyor.", { color: SECONDARY }));
  if (chart) children.push(...luckySection(chart));
  children.push(...stonesSection(stones));
  children.push(...methodSection(record, at, methodsUsed(R), "Doğaltaş Raporu"));
  children.push(...disclaimerSection({ stones: true, expertName: opts.expertName }));
  return pack(children, { headerLabel: `Numeroloji – Doğaltaş  ·  ${title}`, docTitle: `Numeroloji – Doğaltaş — ${title}`, at });
}

/** İlişki (numerolojik uyum) raporu. */
export async function buildRelationshipReport(record: ClassicReportRecord, opts: CommonReportOptions = {}): Promise<Buffer> {
  const at = toDate(opts.generatedAt);
  const lv = levelOf("technical");
  const R = isObj(record.result) ? record.result : {};
  const c = objOf<CompatibilityResult>(R, "compatibility", "overallScore");
  const inp = isObj(record.input) ? record.input : {};
  const p1 = isObj(inp.person1) ? inp.person1 : {};
  const p2 = isObj(inp.person2) ? inp.person2 : {};
  const n1 = safeText(p1.fullName, TEXT_CAP.short) || "1. kişi";
  const n2 = safeText(p2.fullName, TEXT_CAP.short) || "2. kişi";
  const title = safeText(record.title, TEXT_CAP.short) || `${n1} – ${n2}`;
  const children: Block[] = [];
  children.push(...cover({
    heading: "NUMEROLOJİK UYUM RAPORU",
    subtitle: METHOD_LABELS.pythagorean,
    info: [["Başlık", title], ["1. kişi", `${n1}${fmtBirth(p1.birth) ? ` · ${fmtBirth(p1.birth)}` : ""}`], ["2. kişi", `${n2}${fmtBirth(p2.birth) ? ` · ${fmtBirth(p2.birth)}` : ""}`], ["Rapor tarihi", fmtInstant(at)]],
  }));
  children.push(sectionHeading("Uyum Özeti", true));
  if (c) {
    children.push(valueCards([{ label: "Genel uyum (klasik yöntem puanı)", value: `%${c.overallScore}` }, { label: "Değerlendirme", value: safeText(c.rating, 40) || "—" }]));
    children.push(para("Genel uyum klasik yöntem puanıdır; formülü kaynakta belgelenmediği için bağımsız doğrulanamaz. Yaşam Yolu, İfade ve Ruh Güdüsü sayıları ayrıca bağımsız olarak kontrol edilir.", { size: S_SMALL, before: 60 }));
    children.push(spacer(100));
    const pairs: [string, CompatibilityResult["lifePath"] | undefined][] = [["Yaşam Yolu", c.lifePath], ["İfade", c.expression], ["Ruh Güdüsü", c.soulUrge]];
    children.push(dataTable(["Sayı", n1, n2, "Uyum"], pairs.filter(([, p]) => !!p).map(([l, p]) => [{ text: l, bold: true }, { text: String(p!.person1), badges: numberBadges({ value: p!.person1 }) }, { text: String(p!.person2), badges: numberBadges({ value: p!.person2 }) }, { text: `%${p!.compatibility}`, bold: true, color: INDIGO }]), [28, 22, 22, 28]));
    children.push(sectionHeading("Sayı Bazında Yorum"));
    for (const [l, p] of pairs) {
      const d = safeText(p?.description, lv.textCap);
      if (p && d) { children.push(subHeading(`${l}: ${p.person1} – ${p.person2}`)); children.push(para(`${INTERPRETATION_HEADING}`, { bold: true, color: INDIGO, size: S_SMALL, after: 40 })); children.push(para(d, { justify: true })); }
    }
    const st = safeList(c.strengths, 10, 400);
    if (st.length) { children.push(subHeading("Güçlü yönler")); children.push(...bullets(st)); }
    const ch = safeList(c.challenges, 10, 400);
    if (ch.length) { children.push(subHeading("Zorlayıcı yönler")); children.push(...bullets(ch)); }
    const adv = safeText(c.advice, lv.textCap);
    if (adv) children.push(noteBox("Öneri", [adv]));
    // NK-005: bu doğrulama yalnız sayı eşleşmelerini kapsar; puan doğrulanamaz.
    children.push(para("Sayıların bağımsız kontrolü (puan hariç):", { bold: true, size: S_SMALL, color: INDIGO, before: 80, after: 20 }));
    children.push(verificationPara(c.verification));
  } else {
    children.push(para("Bu kayıtta uyum sonucu bulunmuyor.", { color: SECONDARY }));
  }
  children.push(...methodSection(record, at, [METHOD_LABELS.pythagorean], "İlişki Raporu"));
  children.push(...disclaimerSection({ expertName: opts.expertName }));
  return pack(children, { headerLabel: `Numerolojik Uyum Raporu  ·  ${title}`, docTitle: `Numerolojik Uyum — ${title}`, at });
}

/** İşletme adı raporu (Kalde). */
export async function buildBusinessReport(record: ClassicReportRecord, opts: CommonReportOptions = {}): Promise<Buffer> {
  const at = toDate(opts.generatedAt);
  const lv = levelOf("technical");
  const R = isObj(record.result) ? record.result : {};
  const b = objOf<BusinessNameResult>(R, "business_name", "rating");
  const inp = isObj(record.input) ? record.input : {};
  const bname = safeText(inp.name, TEXT_CAP.short) || safeText(b?.name, TEXT_CAP.short);
  const title = safeText(record.title, TEXT_CAP.short) || bname || "İşletme adı";
  const children: Block[] = [];
  children.push(...cover({ heading: "İŞLETME ADI ANALİZİ", subtitle: METHOD_LABELS.chaldean, info: [["Başlık", title], ["İşletme adı", bname || "—"], ["Rapor tarihi", fmtInstant(at)]] }));
  children.push(sectionHeading("Sonuç", true));
  if (b) {
    const tone = b.rating === "excellent" || b.rating === "good" ? "ok" : b.rating === "caution" ? "warn" : "bad";
    children.push(valueCards([
      { label: "Kök sayı", value: String(b.number?.root ?? b.number?.value ?? "—") },
      { label: "Bileşik sayı", value: b.number?.compound ? String(b.number.compound) : "—" },
      { label: "Değerlendirme", value: BUSINESS_RATING_LABELS[b.rating] ?? "—", badges: [badge(BUSINESS_RATING_LABELS[b.rating] ?? "—", tone)] },
    ]));
    children.push(spacer(100));
    children.push(kvTable([
      ["Toplam", String(b.number?.total ?? "—")],
      ["Bileşik sayının adı", safeText(b.number?.compoundMeaning?.name, 80) || "—"],
      ["Bileşik nitelik", b.number?.compoundMeaning ? COMPOUND_NATURE_LABELS[b.number.compoundMeaning.nature] ?? "—" : "—"],
      ["Uğurlu bileşik", b.favorableCompound ? "Evet" : "Hayır"],
      ["Yönetici gezegen", safeText(b.planet, 60) || "—"],
      ["Uygun sektörler", safeList(b.industries, 12, 80).join(", ") || "—"],
    ]));
    children.push(sectionHeading(INTERPRETATION_HEADING));
    const g = safeText(b.guidance, lv.textCap);
    if (g) children.push(para(g, { justify: true }));
    const cm = safeText(b.number?.compoundMeaning?.meaning, lv.textCap);
    if (cm) children.push(paraRuns([run(`Bileşik ${b.number.compound ?? ""}: `, { bold: true, color: INDIGO }), run(cm)], { after: 80 }));
    const s = safeText(b.summary, lv.textCap);
    if (s) children.push(noteBox("Özet", [s]));
    children.push(para(`Yöntem notu: ${CHALDEAN_METHOD_NOTE}`, { size: S_SMALL, color: SECONDARY, before: 80 }));
    children.push(...traceBlock(`İşletme adı (${METHOD_LABELS.chaldean})`, b.number?.calculation));
    children.push(verificationPara(b.verification));
  } else {
    children.push(para("Bu kayıtta işletme adı sonucu bulunmuyor.", { color: SECONDARY }));
  }
  children.push(...methodSection(record, at, [METHOD_LABELS.chaldean], "İşletme Raporu"));
  children.push(...disclaimerSection({ expertName: opts.expertName }));
  return pack(children, { headerLabel: `İşletme Adı Analizi  ·  ${title}`, docTitle: `İşletme Adı Analizi — ${title}`, at });
}

/** İsim adayları raporu (her aday için iki sistem yan yana; birleştirme yok). */
export async function buildNamesReport(record: ClassicReportRecord, opts: NamesReportOptions = {}): Promise<Buffer> {
  const at = toDate(opts.generatedAt);
  const lv = levelOf(opts.variant ?? "technical");
  const R = isObj(record.result) ? record.result : {};
  const inp = isObj(record.input) ? record.input : {};
  const candidates = safeList(inp.candidates, 12, TEXT_CAP.short);
  const entries: { label: string; d: DualResult | null }[] = [];
  const keys = Object.keys(R).filter((k) => /^dual(#\d+)?$/.test(k)).sort((a, b) => (Number(a.split("#")[1] ?? 0) - Number(b.split("#")[1] ?? 0)));
  keys.forEach((k, i) => {
    const d = objOf<DualResult>(R, k, "pythagorean");
    entries.push({ label: safeText(d?.name, TEXT_CAP.short) || candidates[i] || `${i + 1}. aday`, d });
  });
  const title = safeText(record.title, TEXT_CAP.short) || "İsim adayları";
  const children: Block[] = [];
  children.push(...cover({ heading: "İSİM ADAYLARI ANALİZİ", subtitle: `${METHOD_LABELS.pythagorean} · ${METHOD_LABELS.chaldean}`, bulletsList: entries.map((e) => e.label), info: [["Başlık", title], ["Aday sayısı", String(entries.length)], ["Rapor tarihi", fmtInstant(at)]] }));
  children.push(sectionHeading("Adaylar", true));
  children.push(para("Her aday iki yöntemle ayrı ayrı hesaplanır; sonuçlar yan yana gösterilir, birleştirilmez ve sıralama/puan üretilmez.", { size: S_SMALL, color: SECONDARY }));
  children.push(dataTable([
    "Aday", METHOD_LABELS.pythagorean, METHOD_LABELS.chaldean, "Kalde gezegeni", "İki sistem",
  ], entries.map(({ label, d }) => d ? [
    { text: label, bold: true },
    { text: String(d.pythagorean?.value ?? "—"), bold: true, color: INDIGO, badges: numberBadges(d.pythagorean) },
    { text: `${d.chaldean?.root ?? d.chaldean?.value ?? "—"}${d.chaldean?.compound ? ` (bileşik ${d.chaldean.compound})` : ""}`, bold: true, color: INDIGO, badges: d.chaldean?.caution ? [badge("Dikkat işareti", "warn")] : [] },
    safeText(d.chaldean?.planet, 40) || "—",
    d.agreement ? { text: "Aynı kök", badges: [] } : { text: "Farklı" },
  ] : [{ text: label, bold: true }, "—", "—", "—", "Hesaplanamadı"]), [28, 18, 22, 16, 16]));
  for (const { label, d } of entries) {
    if (!d) continue;
    children.push(...dualSection(d, lv, `Aday: ${label}`));
  }
  children.push(...methodSection(record, at, [METHOD_LABELS.pythagorean, METHOD_LABELS.chaldean], "İsim Adayları Raporu"));
  children.push(...disclaimerSection({ expertName: opts.expertName }));
  return pack(children, { headerLabel: `İsim Adayları Analizi  ·  ${title}`, docTitle: `İsim Adayları — ${title}`, at });
}

// ── Karşılaştırma raporu ───────────────────────────────────────────────────────────────────────

const STONE_METHOD_TR: Readonly<Record<string, string>> = Object.freeze({
  provider_direct: "haritanın önerdiği", vibration_exact: "titreşim (birebir)", vibration_root: "titreşim (kök)", planet: "gezegen", pairs_with: "eşlikçi", element: "element",
});
const SLOT_TR: Readonly<Record<string, string>> = Object.freeze({ bileklik: "bileklik", kolye: "kolye", kutle: "kütle" });
const MISSING_SIDE_TR: Readonly<Record<string, string>> = Object.freeze({
  legacy: "Bütüncül Numeroloji kaydı bulunamadı; yalnız klasik taraf gösterilir.",
  classic: "Klasik analiz sonucu bulunamadı; yalnız Bütüncül Numeroloji tarafı gösterilir.",
  both: "İki taraf için de karşılaştırılabilir kayıt bulunamadı.",
});

function onlyLabel(x: ComparisonOnlyItem): string {
  if (typeof x === "string") return safeText(x, TEXT_CAP.short);
  const l = safeText(x?.labelTr, TEXT_CAP.short);
  const d = safeText(x?.display, 80);
  const base = l && d ? `${l}: ${d}` : l;
  if (!base) return "";
  return x.present === true ? `${base} — bu kayıtta mevcut` : x.present === false ? `${base} — bu kayıtta yok` : base;
}
function stoneLabel(x: ComparisonStoneItem): string {
  if (typeof x === "string") return safeText(x, 80);
  const name = safeText(x?.nameTr ?? x?.name ?? x?.nameLegacy, 80);
  if (!name) return "";
  const tags: string[] = [];
  if (x.slot) tags.push(SLOT_TR[x.slot] ?? safeText(x.slot, 20));
  if (Array.isArray(x.slots)) for (const sl of x.slots) tags.push(SLOT_TR[sl] ?? safeText(sl, 20));
  if (Array.isArray(x.methods)) for (const m of x.methods) tags.push(STONE_METHOD_TR[m] ?? safeText(m, 30));
  if (x.status === "ambiguous") tags.push("belirsiz ad");
  if (x.status === "unmatched") tags.push("kütüphanede yok");
  const uniq = tags.filter((t, i) => t && tags.indexOf(t) === i);
  return uniq.length ? `${name} (${uniq.join(", ")})` : name;
}
function rowLabel(r: { labelTr: string; position?: number | null }): string {
  const l = safeText(r.labelTr, TEXT_CAP.short);
  return typeof r.position === "number" && !l.includes(`${r.position}.`) ? `${l} — ${r.position}. dönem` : l;
}
function legacyCell(v: { display: string; root: number | null } | null): Cell {
  if (!v) return { text: "—", color: SECONDARY };
  const d = safeText(v.display, 60) || "—";
  return { text: v.root !== null && v.root !== undefined && String(v.root) !== d ? `${d} (kök ${v.root})` : d, bold: true, color: INDIGO };
}
function classicCell(v: { value: number | null; type: string | null; karmicDebt: number | null } | null): Cell {
  if (!v || v.value === null || v.value === undefined) return { text: "—", color: SECONDARY };
  return { text: String(v.value), bold: true, color: INDIGO, badges: numberBadges({ value: v.value, type: v.type ?? undefined, karmicDebt: v.karmicDebt }) };
}

/** Karşılaştırma raporu: iki ekol ayrı bölümlerde; birleşik / ortak sayı YOK. */
export async function buildComparisonReport(input: ComparisonReportInput, opts: CommonReportOptions = {}): Promise<Buffer> {
  const at = toDate(opts.generatedAt);
  const a = input.alignment;
  const rows = Array.isArray(a?.rows) ? a.rows : [];
  const aLabel = safeText(input.legacyMeta?.schoolLabel, 80) || "Bütüncül Numeroloji (A)";
  const bLabel = safeText(input.classicMeta?.schoolLabel, 80) || "Klasik Numeroloji (B)";
  const person = safeText(input.classicMeta?.personName, TEXT_CAP.short) || safeText(input.legacyMeta?.personName, TEXT_CAP.short);
  const title = safeText(input.classicMeta?.title, TEXT_CAP.short) || safeText(input.legacyMeta?.title, TEXT_CAP.short) || person || "Yöntem karşılaştırması";
  const children: Block[] = [];
  children.push(...cover({
    heading: "NUMEROLOJİ YÖNTEM KARŞILAŞTIRMASI",
    subtitle: `${aLabel}  ·  ${bLabel}`,
    info: [
      ["Başlık", title],
      ["Danışan", person || "—"],
      ["Doğum tarihi", safeText(input.classicMeta?.birthDate ?? input.legacyMeta?.birthDate, 40) || "—"],
      [`${aLabel} kaydı`, fmtInstantStr(input.legacyMeta?.createdAt) || "—"],
      [`${bLabel} kaydı`, fmtInstantStr(input.classicMeta?.createdAt) || "—"],
      ["Rapor tarihi", fmtInstant(at)],
    ],
  }));
  children.push(sectionHeading("Okuma notu", true));
  children.push(noteBox("", [COMPARISON_NO_MERGE_NOTE, `“${SAME_NAME_DIFFERENT_FORMULA}” işareti, iki yöntemde aynı adla anılan ama farklı formülle hesaplanan kavramları gösterir.`]));

  // A ekolü
  children.push(sectionHeading(aLabel));
  const aRows = rows.filter((r) => r.legacy && safeText(r.legacy.display, 60));
  children.push(aRows.length ? dataTable(["Kavram", "Değer"], aRows.map((r) => [{ text: rowLabel(r), bold: true }, legacyCell(r.legacy)]), [60, 40]) : para("Bu yöntemde karşılaştırılabilir değer yok.", { color: SECONDARY }));
  if (input.legacyMeta?.methodologyVersion) children.push(para(`Metodoloji sürümü: ${safeText(input.legacyMeta.methodologyVersion, 60)}`, { size: S_SMALL, color: SECONDARY, before: 60 }));

  // B ekolü
  children.push(sectionHeading(bLabel));
  const bRows = rows.filter((r) => r.classic && typeof r.classic.value === "number");
  children.push(bRows.length ? dataTable(["Kavram", "Değer"], bRows.map((r) => [{ text: rowLabel(r), bold: true }, classicCell(r.classic)]), [60, 40]) : para("Bu yöntemde karşılaştırılabilir değer yok.", { color: SECONDARY }));
  if (input.classicMeta?.methodologyVersion) children.push(para(`Metodoloji sürümü: ${safeText(input.classicMeta.methodologyVersion, 60)}`, { size: S_SMALL, color: SECONDARY, before: 60 }));

  // Kavram tablosu
  children.push(sectionHeading("Kavram Eşleştirme Tablosu"));
  children.push(dataTable(["Kavram", aLabel, bLabel, "İlişki", "İşaret"], rows.map((r) => [
    { text: rowLabel(r), bold: true },
    legacyCell(r.legacy),
    classicCell(r.classic),
    RELATION_LABELS[r.relation] ?? (safeText(r.relation, 40) || "—"),
    r.sameNameDifferentFormula ? { text: "", badges: [badge(SAME_NAME_DIFFERENT_FORMULA, "warn")] } : "—",
  ]), [24, 18, 18, 16, 24]));

  const gloss = rows.filter((r) => safeText(r.explanation, 10));
  if (gloss.length) {
    children.push(sectionHeading("Kavram Sözlüğü"));
    for (const r of gloss) {
      children.push(paraRuns([
        run(`${safeText(r.labelTr, TEXT_CAP.short)}`, { bold: true, color: INDIGO }),
        ...(r.sameNameDifferentFormula ? [run("  "), badge(SAME_NAME_DIFFERENT_FORMULA, "warn")] : []),
      ], { before: 80, after: 30 }));
      children.push(para(safeText(r.explanation, TEXT_CAP.para), { justify: true }));
    }
  }

  // Yalnız A / yalnız B
  children.push(sectionHeading("Yalnız Bir Yöntemde Bulunan Kavramlar"));
  const oa = (Array.isArray(a?.onlyLegacy) ? a.onlyLegacy : []).map(onlyLabel).filter(Boolean);
  const ob = (Array.isArray(a?.onlyClassic) ? a.onlyClassic : []).map(onlyLabel).filter(Boolean);
  children.push(subHeading(`Yalnız ${aLabel}`));
  children.push(...(oa.length ? bullets(oa) : [para("Yok.", { color: SECONDARY })]));
  children.push(subHeading(`Yalnız ${bLabel}`));
  children.push(...(ob.length ? bullets(ob) : [para("Yok.", { color: SECONDARY })]));
  const miss = (Array.isArray(a?.missing) ? (a.missing as readonly (string | { labelTr: string })[]) : []).map((m) => (typeof m === "string" ? safeText(m, TEXT_CAP.short) : safeText(m?.labelTr, TEXT_CAP.short))).filter(Boolean);
  const missSide = typeof a?.missing === "string" ? MISSING_SIDE_TR[a.missing] ?? "" : "";
  if (missSide) children.push(noteBox("Eksik taraf", [missSide], "warn"));
  if (miss.length) { children.push(subHeading("Eksik / hesaplanmamış")); children.push(...bullets(miss)); }

  // Taşlar (üç sütun)
  const st = a?.stones;
  if (st) {
    children.push(sectionHeading("Doğaltaş — Üç Kaynak Ayrı"));
    children.push(para(STONE_REPORT_DISCLAIMER, { italics: true, size: S_SMALL, color: SECONDARY }));
    const c1 = (st.legacyAssigned ?? []).map(stoneLabel).filter(Boolean);
    const c2 = (st.classicDirect ?? []).map(stoneLabel).filter(Boolean);
    const c3 = (st.classicDerived ?? []).map(stoneLabel).filter(Boolean);
    const n = Math.max(c1.length, c2.length, c3.length, 1);
    const trows: Cell[][] = [];
    for (let i = 0; i < Math.min(n, 30); i++) trows.push([c1[i] ?? "", c2[i] ?? "", c3[i] ?? ""]);
    children.push(dataTable([`${aLabel} — atanan`, `${bLabel} — haritanın önerdiği`, `${bLabel} — türetilmiş (titreşim / gezegen)`], trows, [33, 33, 34]));
    const ov = (st.overlap ?? []).map(stoneLabel).filter(Boolean);
    children.push(para(ov.length ? `Her iki yöntemde de geçen taşlar: ${ov.join(", ")}` : "İki yöntemde ortak geçen taş yok.", { size: S_SMALL, color: SECONDARY, before: 80 }));
  }

  // Uzman notu (SONDA)
  const note = safeText(input.note, TEXT_CAP.long);
  if (note) {
    children.push(sectionHeading("Uzman Notu"));
    children.push(para(note, { justify: true }));
  }
  children.push(...disclaimerSection({ stones: !!st, expertName: opts.expertName }));
  return pack(children, { headerLabel: `Numeroloji Yöntem Karşılaştırması  ·  ${title}`, docTitle: `Yöntem Karşılaştırması — ${title}`, at });
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
