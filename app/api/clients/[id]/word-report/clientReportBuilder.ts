/**
 * Danışan Word raporu — SAF belge kurucusu (DB/ağ YOK). Route veriyi (tenant-kapsamlı) okur,
 * görselleri indirir; bu modül yalnız DOCX Document üretir → harness gerçek DOCX test eder.
 *
 * FINAL HARDENING (PAKET WORD) — korunur:
 *  - FA-02: timestamptz (randevu/analiz) → Europe/Istanbul (lib/time/reportTime); DATE/TEXT
 *    alanlar (stone_date, session_date, charge_date, clients.dogum/gorusme) ASLA kaydırılmaz.
 *  - FA-16: danışana giden belgede sade "Bilgilendirme" notu (footer + rapor sonu) + "Hazırlayan".
 *  - FA-26: ödev "Uzman Notu" (expert_note) iç nottur → VARSAYILAN HARİÇ; yalnız
 *    includeExpertNotes=true ile eklenir.
 *  - FA-41: kullanıcı/uzman yazımı KORUNUR (otomatik title-case YOK).
 *
 * AŞAMA 2 / W1 (BUG-005, DY-001…DY-014) — Danışan Yolculuğu Word standardı:
 *  - Her çıktıda premium kapak (onaylı logo değiştirilmeden, danışan, rapor adı, tarih, uzman).
 *  - Kapaktan sonra danışanın KAYITLI ve DOLU genel bilgileri (boş alanlar gizlenir).
 *  - İÇİNDEKİLER YOK; zorunlu boş sayfa / ayraç sayfası / kapanış sayfası YOK.
 *  - Verisi olmayan bölüm, ölçülmemiş enerji bedeni/çakra satırı, boş analiz şeması ve
 *    içeriksiz/gelecek tarihli (gerçekleşmemiş) seans rapora girmez.
 *  - Ücretlendirme yalnız AÇIKÇA seçilirse eklenir (Tam Rapor dahil varsayılan HARİÇ).
 *  - Tablolar sabit düzen + tam sayfa genişliği (clientReportLayout).
 *  - Kayıtlı analizler yeniden HESAPLANMAZ; HD bölümü route'un okuduğu DONMUŞ snapshot'tan gelir.
 */
import { Document, Paragraph, TextRun } from "docx";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { calcElementleri, ELEMENT_ORDER } from "@/lib/numeroloji/elementler";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";
import { odevDurumLabel } from "@/lib/odevStatus";
import { notesToPlainText } from "@/lib/clientNotes";
import { analysisTypeLabel } from "@/lib/clients/analysisLabels";
import {
  buildFooter,
  C_LIGHT,
  C_MID,
  embedImageParagraph,
  REPORT_FONT,
  ReportChild,
} from "@/lib/docx/reportHelpers";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import {
  formatDateLoose,
  formatDateOnly,
  formatInstantDateTime,
  looseDayKey,
  reportFileDate,
  reportGeneratedLabel,
  toInstant,
  zonedDayKey,
} from "@/lib/time/reportTime";
import { mizacLabel, tidyUserText } from "@/lib/clients/wordReportText";
import { buildSavedNumerologySection, type SavedNumerologyRow } from "./numerologySavedSection";
import { paymentStatusLabelTR, summarizeUnpaid } from "@/lib/danisan/chargePayment";
import {
  DY_NAVY,
  DY_PAGE,
  dyBody,
  dyCover,
  dyDataTable,
  dyDivider,
  dyGap,
  dyItemTitle,
  dyKvTable,
  dyLabeledText,
  dyNote,
  dySectionTitle,
  dyStatStrip,
  dySubTitle,
  filledRows,
  safe,
  type DyCell,
} from "./clientReportLayout";

// ─── Bölüm renkleri ──────────────────────────────────────────────────────────

const C = {
  danisan:    DY_NAVY,    // lacivert
  notlar:     "4c1d95",   // derin mor
  randevular: "9a3412",   // turuncu
  taslar:     "0e7490",   // turkuaz
  seanslar:   "14532d",   // yeşil
  ucret:      "065f46",   // zümrüt (ücretlendirme)
  odevler:    "713f12",   // amber
  analizler:  "4a1d96",   // koyu mor
  hd:         "7c2d12",   // HD bölümü başlığı
  numeroloji: "1e40af",   // mavi
  yolculuk:   "1e1b4b",   // indigo
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientRow = {
  id: string;
  ad?: string | null;
  soyad?: string | null;
  telefon?: string | null;
  dogum?: string | null;
  gorusme?: string | null;
  burc?: string | null;
  kan?: string | null;
  mizac?: string | null;
  profile_image_url?: string | null;
};

export type ClientNoteRow = {
  saglik_notu?: string | null;
  adres?: string | null;
  oneriler?: string | null;
  notlar?: string | null;
};

export type AppointmentRow = {
  id: string;
  title?: string | null;
  notes?: string | null;
  appointment_date: string;
  status?: string | null;
};

export type ClientStoneRow = {
  id: string;
  stone_name?: string | null;
  stone_type?: string | null;
  note?: string | null;
  usage_area?: string | null;
  combination_text?: string | null;
  warning_text?: string | null;
  other_notes?: string | null;
  stone_date?: string | null;
  created_at: string;
};

export type ClientSessionRow = {
  id: string;
  session_date?: string | null;
  session_type?: string | null;
  duration_minutes?: number | null;
  fee?: number | null;
  session_note?: string | null;
  actions_done?: string | null;
  suggestions?: string | null;
  next_plan?: string | null;
  created_at: string;
};

export type ClientChargeRow = {
  id: string;
  charge_date?: string | null;
  category?: string | null;   // session | homework | analysis | other
  detail?: string | null;
  note?: string | null;
  amount?: number | null;
  /** WT7: paid | unpaid | null (Belirtilmemiş). */
  payment_status?: string | null;
  created_at: string;
};

export type ClientHomeworkRow = {
  id: string;
  title?: string | null;
  homework_type?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  expert_note?: string | null;
  client_feedback?: string | null;
  created_at: string;
};

type ChakraValueEntry = { mark?: string; male?: string; female?: string };

export type ClientAnalysisRow = {
  id: string;
  analysis_type?: string | null;
  // chakra kayıtlarında hücreler {mark,male,female}; planet kayıtlarında düz string.
  analysis_data?: { title?: string; values?: Record<string, ChakraValueEntry | string>; saved_at?: string } | null;
  note?: string | null;
  created_at: string;
  image_url?: string | null;
};

/** Route'un DONMUŞ HD snapshot'ından ürettiği gövde (HD motoru çağrılmaz). */
export type ClientHdSection = {
  children: ReportChild[];
  /** Snapshot üretim anı (ISO). */
  generatedAt?: string | null;
};

// ─── Bölüm seçimi (DY-008) ───────────────────────────────────────────────────

/** Tam / Özel raporda seçilebilen bölümler. "Danışan Bilgileri" HER ZAMAN vardır (seçilemez). */
export const CLIENT_REPORT_SECTIONS = [
  "notlar",
  "seanslar",
  "randevular",
  "taslar",
  "odevler",
  "analizler",
  "humanDesign",
  "numeroloji",
  "yolculuk",
  "ucretlendirme",
] as const;
export type ClientReportSection = (typeof CLIENT_REPORT_SECTIONS)[number];

/** Tam Rapor varsayılanı: Ücretlendirme HARİÇ her bölüm (DY-008 / owner kuralı). */
export const DEFAULT_FULL_SECTIONS: readonly ClientReportSection[] = CLIENT_REPORT_SECTIONS.filter((s) => s !== "ucretlendirme");

/** İstemciden gelen bölüm listesini doğrular (bilinmeyen anahtar atılır, sıra sabit). */
export function normalizeReportSections(raw: unknown): ClientReportSection[] | null {
  if (!Array.isArray(raw)) return null;
  const set = new Set(raw.filter((x): x is string => typeof x === "string"));
  return CLIENT_REPORT_SECTIONS.filter((s) => set.has(s));
}

// ─── Metin yardımcıları ───────────────────────────────────────────────────────

/** FA-41: kullanıcı yazımı korunur (yalnız trim + boşluk sadeleştirme). */
function tidy(text: string | null | undefined): string {
  return tidyUserText(text ?? "");
}

/** DATE / TEXT takvim alanları — kaydırmasız; boş → "". */
function dateTR(date: string | null | undefined): string {
  return formatDateLoose(date, { fallback: "" });
}

/** timestamptz → Europe/Istanbul tarih + saat; boş → "". */
function dateTimeTR(value: string | null | undefined): string {
  return formatInstantDateTime(value ?? null, { fallback: "" });
}

const CHARGE_CAT_LABEL: Record<string, string> = {
  session: "Seans",
  homework: "Ödev",
  analysis: "Analiz",
  other: "Diğer",
};
function chargeCatLabel(cat?: string | null): string {
  return CHARGE_CAT_LABEL[cat ?? ""] ?? "Diğer";
}
function formatTRY(amount: number): string {
  return `${new Intl.NumberFormat("tr-TR").format(amount)} ₺`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** FA-44 ile uyumlu: geçmiş + bekliyor → "Sonuç girilmedi" (türetilmiş; DB değişmez). */
function aptStatus(s: string | null | undefined, date: string, now: Date): string {
  if (s === "tamamlandi") return "Tamamlandı";
  if (s === "iptal") return "İptal";
  const at = toInstant(date);
  if (!at) return "Yaklaşan";
  return at.getTime() < now.getTime() ? "Sonuç girilmedi" : "Yaklaşan";
}

function toTs(dateStr: string | null | undefined, fallback: string): number {
  const t = new Date(dateStr || fallback).getTime();
  return isNaN(t) ? new Date(fallback).getTime() : t;
}

// ─── Veri ayıklama (DY-001 / DY-003) ─────────────────────────────────────────

const has = (v: string | null | undefined) => !!v?.trim();

/**
 * DY-003: rapora giren seanslar — içeriksiz kayıt (tür/not/işlem/öneri/plan/süre hiçbiri yok)
 * ve rapor gününden SONRA tarihli (henüz gerçekleşmemiş) seans dahil edilmez.
 */
export function reportableSessions(sessions: ClientSessionRow[], now: Date): ClientSessionRow[] {
  const today = zonedDayKey(now);
  return sessions.filter((s) => {
    const content = has(s.session_type) || has(s.session_note) || has(s.actions_done) || has(s.suggestions) || has(s.next_plan) || (s.duration_minutes ?? 0) > 0;
    if (!content) return false;
    const day = looseDayKey(s.session_date ?? "");
    return !(day && today && day > today);
  });
}

function stoneHasContent(s: ClientStoneRow): boolean {
  return has(s.stone_name) || has(s.stone_type) || has(s.usage_area) || has(s.combination_text) || has(s.warning_text) || has(s.note) || has(s.other_notes);
}

function homeworkHasContent(h: ClientHomeworkRow, includeExpertNotes: boolean): boolean {
  return has(h.title) || has(h.description) || has(h.client_feedback) || has(h.homework_type) || (includeExpertNotes && has(h.expert_note));
}

// ─── Çakra / Çakra-Gezegen analiz tabloları (DY-002 / DY-003) ────────────────

const CHAKRA_ENERGY_BODIES = [
  { key: "ruhsal",   label: "Ruhsal Enerji Bedeni",   color: "6d5bd0" },
  { key: "zihinsel", label: "Zihinsel Enerji Bedeni", color: "43a047" },
  { key: "duygusal", label: "Duygusal Enerji Bedeni", color: "b7791f" },
  { key: "eterik",   label: "Eterik Enerji Bedeni",   color: "2196c9" },
  { key: "fiziksel", label: "Fiziksel Enerji Bedeni", color: "4b5563" },
] as const;

const CHAKRA_ROWS = [
  { key: "tac",    label: "Tepe / Taç Çakrası",     color: "7c3aed" },
  { key: "goz",    label: "3. Göz Çakrası",          color: "4f46e5" },
  { key: "bogaz",  label: "Boğaz Çakrası",           color: "0284c7" },
  { key: "kalp",   label: "Kalp Çakrası",            color: "16a34a" },
  { key: "mide",   label: "Mide Çakrası",            color: "a16207" },
  { key: "sakral", label: "Sakral (Karın) Çakrası",  color: "ea580c" },
  { key: "kok",    label: "Kök Çakrası",             color: "dc2626" },
] as const;

const PLANET_LABELS = ["GÜNEŞ", "AY", "MERKÜR", "MARS", "VENÜS"] as const;

function chakraTextColor(val: string): string {
  const t = val.trim();
  if (t.startsWith("+")) return "166534"; // yeşil
  if (t.startsWith("-")) return "991b1b"; // kırmızı
  return "1e293b";
}

const valCell = (raw: string | undefined): DyCell => {
  const v = (raw ?? "").trim();
  return { text: v || "—", bold: !!v, textColor: v ? chakraTextColor(v) : C_LIGHT };
};

/** Bir çakra tablosu — YALNIZ ölçülmüş satırlar; hiç ölçüm yoksa null (DY-003). */
function chakraTable(title: string, scope: string, rows: ReadonlyArray<{ key: string; label: string; color: string }>, values: Record<string, ChakraValueEntry>): ReportChild[] | null {
  const measured = rows
    .map((r) => ({ r, v: values[`${scope}_${r.key}`] ?? {} }))
    .filter(({ v }) => has(v.mark) || has(v.male) || has(v.female));
  if (!measured.length) return null;
  return [
    dySubTitle(title, C.analizler),
    dyDataTable(
      [
        { header: "Alan", pct: 34 },
        { header: "İşaret / Sayı %", pct: 22, align: "center" },
        { header: "Eril Enerji", pct: 22, align: "center" },
        { header: "Dişil Enerji", pct: 22, align: "center" },
      ],
      measured.map(({ r, v }) => [
        { text: r.label, bold: true, fill: r.color, textColor: "ffffff" },
        valCell(v.mark),
        valCell(v.male),
        valCell(v.female),
      ]),
    ),
    dyGap(120),
  ];
}

function planetTable(title: string, scope: string, values: Record<string, string>): ReportChild[] | null {
  const measured = CHAKRA_ROWS.filter((r) => PLANET_LABELS.some((p) => has(values[`${scope}_${r.key}_${p}`])));
  if (!measured.length) return null;
  return [
    dySubTitle(title, C.analizler),
    dyDataTable(
      [{ header: "Çakra", pct: 25 }, ...PLANET_LABELS.map((p) => ({ header: p, pct: 15, align: "center" as const }))],
      measured.map((r) => [
        { text: r.label.replace(/ Çakrası$/, ""), bold: true, fill: r.color, textColor: "ffffff" },
        ...PLANET_LABELS.map((p) => valCell(values[`${scope}_${r.key}_${p}`])),
      ]),
    ),
    dyGap(120),
  ];
}

/**
 * Tek doğruluk kaynağı: bir analiz kaydının Word tabloları (tam / sekme / tarih-aralığı /
 * tek-analiz / toplu). Kayıtlı değerler AYNEN aktarılır (yeniden hesap YOK). Ölçüm yoksa null.
 */
function buildAnalysisTables(an: ClientAnalysisRow): ReportChild[] | null {
  const values = an.analysis_data?.values;
  if (!values || Object.keys(values).length === 0) return null;
  const parts: (ReportChild[] | null)[] = [];
  if (an.analysis_type === "chakra") {
    const v = values as Record<string, ChakraValueEntry>;
    parts.push(
      chakraTable("Seans Öncesi — Enerji Bedenleri", "before_energy", CHAKRA_ENERGY_BODIES, v),
      chakraTable("Seans Sonrası — Enerji Bedenleri", "after_energy", CHAKRA_ENERGY_BODIES, v),
      chakraTable("Çakralar — Seans Öncesi", "before_chakra", CHAKRA_ROWS, v),
      chakraTable("Çakralar — Seans Sonrası", "after_chakra", CHAKRA_ROWS, v),
    );
  } else if (an.analysis_type === "planet") {
    const v = values as Record<string, string>;
    parts.push(planetTable("Seans Öncesi", "before", v), planetTable("Seans Sonrası", "after", v));
  }
  const out = parts.filter((p): p is ReportChild[] => !!p).flat();
  return out.length ? out : null;
}

/** DY-003: tablo, görsel veya not taşımayan (boş şema) analiz rapora girmez. */
function analysisHasContent(an: ClientAnalysisRow, img: Buffer | null): boolean {
  return !!buildAnalysisTables(an) || !!img || has(an.note);
}

// ─── Belge (kapak bölümü + gövde bölümü) ─────────────────────────────────────

/**
 * Görsel analiz şeması: dikey sayfada tam genişlik (DY-010 — eski yatay bölüm geçişi, önceki
 * sayfanın kalanını ve sonrasını BOŞ bırakıyordu). Oran korunur; sayfaya sığacak şekilde sınırlanır.
 */
function analysisImage(img: Buffer): Paragraph {
  return embedImageParagraph(img, 620, 760);
}

/**
 * FA-16 bilgilendirme notu + "Hazırlayan" — tek blok (başlık/metin/ad sayfa sonunda bölünmez;
 * "Hazırlayan" satırı tek başına yeni sayfaya düşmez).
 */
function wellnessBlock(expertName?: string | null): Paragraph[] {
  const note = wellnessNote("danisan");
  const name = expertName?.trim();
  return [
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: 360, after: 60 },
      children: [new TextRun({ text: "Bilgilendirme", bold: true, size: 18, font: REPORT_FONT, color: C_MID })],
    }),
    new Paragraph({
      keepNext: !!name,
      keepLines: true,
      spacing: { after: 80 },
      children: [new TextRun({ text: note.full, italics: true, size: 16, font: REPORT_FONT, color: C_LIGHT })],
    }),
    ...(name ? [new Paragraph({
      keepLines: true,
      spacing: { after: 60 },
      children: [new TextRun({ text: `Hazırlayan: ${safe(name)}`, size: 16, font: REPORT_FONT, color: C_MID })],
    })] : []),
  ];
}

/** Kapak (üst/alt bilgisiz, tek sayfa) + gövde (A4 dikey, 2 cm kenar). */
function buildDocument(cover: ReportChild[], body: ReportChild[], footerText: string, title: string): Document {
  // FA-16: danışana giden belge → sayfa altında kısa bilgilendirme notu.
  const footer = buildFooter(safe(footerText), { note: "danisan" });
  const page = { size: DY_PAGE.size, margin: DY_PAGE.margin };
  return new Document({
    creator: "Yaşam Sistemi",
    title: safe(title),
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    sections: [
      { properties: { page }, children: cover },
      { properties: { page }, footers: { default: footer }, children: body },
    ],
  });
}

// ─── Ortak bağlam ────────────────────────────────────────────────────────────

export type ClientReportCtx = {
  /** Rapor anı (test sabitler). Varsayılan: şimdi. */
  now?: Date;
  /** Hazırlayan uzmanın görünen adı (guard.profile → expertDisplayName). */
  expertName?: string | null;
  /** FA-26: ödev "Uzman Notu" yalnız açıkça istenirse (varsayılan HARİÇ). */
  includeExpertNotes?: boolean;
  /** Onaylı Yaşam Sistemi logosu (route paket içi asset'ten okur). Yoksa yazı ile marka. */
  logo?: Buffer | null;
  /** Tam/Özel/Tarih aralığı/Toplu raporda dahil edilecek bölümler. Yoksa DEFAULT_FULL_SECTIONS. */
  sections?: readonly ClientReportSection[];
  /** Kapakta "Tam Rapor" / "Özel Rapor" ibaresi. */
  variant?: "full" | "custom";
};

export type ClientReportResult = { doc: Document; filename: string };

function reportDates(ctx: ClientReportCtx) {
  const now = ctx.now ?? new Date();
  return { now, today: reportGeneratedLabel(undefined, now), dateSlug: reportFileDate(undefined, now) };
}

function clientNames(cli: ClientRow) {
  const rawName = `${cli.ad ?? ""} ${cli.soyad ?? ""}`.trim();
  return { rawName, fullName: tidy(rawName) || "İsimsiz Danışan", nameSlug: slugify(rawName || "danisan") };
}

/** Bölüm numaralayıcı (yalnız eklenen bölümler numara alır → atlama olmaz). */
function counter() {
  let n = 0;
  return () => ++n;
}

// ─── Danışan Bilgileri (DY-011 / DY-012) ─────────────────────────────────────

/** Kayıtlı ve DOLU kimlik alanları (boşlar gizlenir). */
function clientIdentityRows(cli: ClientRow): [string, string][] {
  return filledRows([
    ["Telefon",        tidy(cli.telefon)],
    ["Doğum Tarihi",   dateTR(cli.dogum)],
    ["Görüşme Tarihi", dateTR(cli.gorusme)],
    ["Burç",           tidy(cli.burc)],
    ["Kan Grubu",      tidy(cli.kan)],
    ["Mizaç",          mizacLabel(cli.mizac, "")],
  ]);
}

type StatCounts = { seanslar: number; randevular: number; taslar: number; odevler: number; analizler: number };

/**
 * "Danışan Bilgileri" bölümü — her Danışan Yolculuğu Word çıktısının ilk içerik bölümü.
 * Ad büyük başlık olarak (dar tabloya sıkışmaz), dolu kimlik alanları 4 kolonlu künyede,
 * kayıt özeti (yalnız sıfırdan büyük sayılar) ve dolu Genel Bilgiler (sağlık notu/adres/öneriler).
 */
function buildClientInfoSection(
  cli: ClientRow,
  notes: ClientNoteRow | null,
  num: number,
  opts: { profileImg?: Buffer | null; stats?: StatCounts | null; badge?: string; pageBreakBefore?: boolean },
): ReportChild[] {
  const { fullName } = clientNames(cli);
  const out: ReportChild[] = [];
  if (opts.badge) {
    out.push(new Paragraph({
      pageBreakBefore: opts.pageBreakBefore === true,
      keepNext: true,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: safe(opts.badge), bold: true, size: 20, font: REPORT_FONT, color: C_LIGHT, allCaps: true })],
    }));
  }
  out.push(dySectionTitle(`${num}. Danışan Bilgileri`, C.danisan, { pageBreakBefore: !opts.badge && opts.pageBreakBefore === true }));
  if (opts.profileImg) out.push(embedImageParagraph(opts.profileImg, 120, 140));
  out.push(new Paragraph({
    keepNext: true,
    spacing: { before: 60, after: 160 },
    children: [new TextRun({ text: safe(fullName), bold: true, size: 36, font: REPORT_FONT, color: C.danisan })],
  }));
  const idTable = dyKvTable(clientIdentityRows(cli), { cols: 4 });
  if (idTable) out.push(idTable, dyGap());
  if (opts.stats) {
    const strip = dyStatStrip([
      { label: "Seans", value: opts.stats.seanslar, color: C.seanslar },
      { label: "Randevu", value: opts.stats.randevular, color: C.randevular },
      { label: "Taş Kaydı", value: opts.stats.taslar, color: C.taslar },
      { label: "Ödev", value: opts.stats.odevler, color: C.odevler },
      { label: "Analiz", value: opts.stats.analizler, color: C.analizler },
    ]);
    if (strip) out.push(strip, dyGap());
  }
  out.push(
    ...dyLabeledText("Sağlık Notu", notes?.saglik_notu),
    ...dyLabeledText("Adres", notes?.adres),
    ...dyLabeledText("Öneriler", notes?.oneriler),
  );
  return out;
}

// ─── Bölüm gövdeleri (veri yoksa [] döner → bölüm eklenmez) ──────────────────

function sessionsBody(sessions: ClientSessionRow[]): ReportChild[] {
  const out: ReportChild[] = [];
  const total = sessions.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  out.push(dyNote(`${sessions.length} seans${total > 0 ? ` · toplam ${total} dk` : ""}`));
  sessions.forEach((s, i) => {
    out.push(dyItemTitle(`${i + 1}. ${tidy(s.session_type) || "Seans"}`, C.seanslar, dateTR(s.session_date) || dateTR(s.created_at)));
    const kv = dyKvTable(filledRows([["Süre", (s.duration_minutes ?? 0) > 0 ? `${s.duration_minutes} dk` : ""]]));
    if (kv) out.push(kv);
    out.push(
      ...dyLabeledText("Seans Notu", s.session_note),
      ...dyLabeledText("Yapılan İşlemler", s.actions_done),
      ...dyLabeledText("Öneriler", s.suggestions),
      ...dyLabeledText("Sonraki Seans Planı", s.next_plan),
    );
    if (i < sessions.length - 1) out.push(dyDivider());
  });
  return out;
}

function appointmentsBody(apts: AppointmentRow[], now: Date): ReportChild[] {
  return [
    dyDataTable(
      [
        { header: "Tarih", pct: 22 },
        { header: "Randevu", pct: 30 },
        { header: "Durum", pct: 18 },
        { header: "Not", pct: 30 },
      ],
      apts.map((a) => [dateTimeTR(a.appointment_date), tidy(a.title) || "Görüşme", aptStatus(a.status, a.appointment_date, now), tidy(a.notes) || "—"]),
    ),
    dyGap(),
  ];
}

function stonesBody(stones: ClientStoneRow[]): ReportChild[] {
  const out: ReportChild[] = [];
  stones.forEach((st, i) => {
    out.push(dyItemTitle(`${i + 1}. ${tidy(st.stone_name) || "Taş"}`, C.taslar, dateTR(st.stone_date)));
    const kv = dyKvTable(filledRows([["Kullanım Türü", tidy(st.stone_type)]]));
    if (kv) out.push(kv);
    out.push(
      ...dyLabeledText("Kullanım Detayı", st.usage_area),
      ...dyLabeledText("Kombin", st.combination_text),
      ...dyLabeledText("Uyarı", st.warning_text),
      ...dyLabeledText("Genel Not", st.note),
      ...dyLabeledText("Diğer Notlar", st.other_notes),
    );
    if (i < stones.length - 1) out.push(dyDivider());
  });
  return out;
}

function homeworksBody(hws: ClientHomeworkRow[], includeExpertNotes: boolean): ReportChild[] {
  const out: ReportChild[] = [];
  hws.forEach((hw, i) => {
    out.push(dyItemTitle(`${i + 1}. ${tidy(hw.title) || "Ödev"}`, C.odevler));
    const kv = dyKvTable(filledRows([
      ["Tür", tidy(hw.homework_type)],
      ["Başlangıç", dateTR(hw.start_date)],
      ["Bitiş", dateTR(hw.end_date)],
      ["Durum", odevDurumLabel(hw.status)],
    ]), { cols: 4 });
    if (kv) out.push(kv);
    out.push(...dyLabeledText("Açıklama", hw.description));
    if (includeExpertNotes && hw.expert_note?.trim()) out.push(...dyLabeledText("Uzman Notu", hw.expert_note));
    out.push(...dyLabeledText("Danışan Geri Bildirimi", hw.client_feedback));
    if (i < hws.length - 1) out.push(dyDivider());
  });
  return out;
}

/** Analiz blokları — yalnız içerikli analizler (çağıran süzer). Tablo yoksa kayıtlı şema görseli. */
function analysesBody(items: { an: ClientAnalysisRow; img: Buffer | null }[]): ReportChild[] {
  const out: ReportChild[] = [];
  items.forEach(({ an, img }, i) => {
    out.push(dyItemTitle(`${i + 1}. ${analysisTypeLabel(an.analysis_type)}`, C.analizler, dateTimeTR(an.created_at)));
    const tables = buildAnalysisTables(an);
    if (tables) out.push(...tables);
    else if (img) out.push(analysisImage(img));
    out.push(...dyLabeledText("Analiz Notu", an.note));
    if (i < items.length - 1) out.push(dyDivider());
  });
  return out;
}

function chargesBody(charges: ClientChargeRow[]): ReportChild[] {
  const total = charges.reduce((s, c) => s + (c.amount ?? 0), 0);
  const unpaid = summarizeUnpaid(charges);
  const out: ReportChild[] = [
    dyDataTable(
      [
        { header: "Tarih", pct: 15 },
        { header: "Ana Tür", pct: 14 },
        { header: "Detay", pct: 37 },
        { header: "Ödeme", pct: 15 },
        { header: "Tutar", pct: 19, align: "right" },
      ],
      charges.map((c) => [
        dateTR(c.charge_date) || dateTR(c.created_at),
        chargeCatLabel(c.category),
        { text: tidy(c.detail) || "—", sub: c.note },
        paymentStatusLabelTR(c.payment_status),
        { text: formatTRY(c.amount ?? 0), bold: true },
      ]),
      { headerFill: C.ucret },
    ),
  ];
  const summary: [string, string][] = [["Toplam Kayıt", String(charges.length)], ["Toplam Ücret", formatTRY(total)]];
  // WT7: yalnız açıkça "Ödenmedi" kayıtlar; eski/Belirtilmemiş kayıtlar sayılmaz.
  if (unpaid.count > 0) summary.push(["Ödenmemiş", `${unpaid.count} kayıt · ${formatTRY(unpaid.total)}`]);
  out.push(dyGap(120));
  const kv = dyKvTable(summary, { labelColor: C.ucret });
  if (kv) out.push(kv);
  return out;
}

// ─── Numeroloji özeti (DY-004) — motor DEĞİŞMEZ, yalnız mevcut fonksiyon çıktısı tabloya ──

function isoToDDMMYYYY(iso: string): string {
  const p = iso.split("-");
  if (p.length !== 3 || p[0]!.length !== 4) return "";
  return `${p[2]}.${p[1]}.${p[0]}`;
}

function numerologyBody(client: ClientRow): ReportChild[] {
  const dogum = client.dogum?.trim() ?? "";
  if (!dogum) return [];
  const firstName = client.ad?.trim() ?? "";
  const lastName = client.soyad?.trim() ?? "";
  const dogumTR = isoToDDMMYYYY(dogum);
  const tryDisplay = (fn: () => { display: string }) => { try { return fn().display; } catch { return ""; } };

  const core = filledRows([
    ["Hayat Yolu / DM", tryDisplay(() => calcHayatYolu(dogum))],
    ["İfade Sayısı",    firstName || lastName ? tryDisplay(() => calcIfadeSayisi(firstName, lastName)) : ""],
    ["Ana Kulvar",      firstName || lastName ? tryDisplay(() => calcAnaKulvar(firstName, lastName)) : ""],
    ["Yan Kulvar",      firstName || lastName ? tryDisplay(() => calcYanKulvar(firstName, lastName)) : ""],
    ["Kişisel Yıl",     tryDisplay(() => calcKisiselYil(dogum))],
  ]);
  const out: ReportChild[] = [];
  const coreTable = dyKvTable(core, { cols: core.length > 2 ? 4 : 2, labelColor: C.numeroloji });
  if (coreTable) out.push(coreTable, dyGap());

  if (dogumTR) {
    try {
      const el = calcElementleri(dogumTR);
      out.push(dySubTitle("Element Dağılımı", C.numeroloji));
      out.push(dyDataTable(
        ELEMENT_ORDER.map((e) => ({ header: String(e), pct: 1, align: "center" as const })),
        [ELEMENT_ORDER.map((e) => String(el.counts[e] ?? 0))],
        { headerFill: C.numeroloji },
      ));
      if (el.key) out.push(dyNote(`Baskın element: ${el.key}`));
      else out.push(dyGap());
    } catch { /* sessiz */ }
    try {
      const zirve = calcZirveYillari(dogumTR);
      if (zirve?.peaks?.length) {
        out.push(dySubTitle("Zirve Yılları", C.numeroloji));
        out.push(dyDataTable(
          [
            { header: "Zirve", pct: 22 },
            { header: "Metot 1 (yaş)", pct: 26, align: "center" },
            { header: "Metot 2 (yaş)", pct: 26, align: "center" },
            { header: "Çakra", pct: 26, align: "center" },
          ],
          zirve.peaks.slice(0, 4).map((p) => [
            `${p.index}. Zirve`,
            String(p.yasMetot1 ?? p.age),
            String(p.yasMetot2 ?? p.age),
            `${p.topic}. çakra`,
          ]),
          { headerFill: C.numeroloji },
        ));
        out.push(dyGap());
      }
    } catch { /* sessiz */ }
  }
  return out;
}

// ─── Kronolojik yolculuk (tablo) ─────────────────────────────────────────────

type TimelineEvent = { ts: number; dateLabel: string; category: string; title: string; note?: string };

function journeyBody(events: TimelineEvent[]): ReportChild[] {
  return [
    dyDataTable(
      [
        { header: "Tarih", pct: 22 },
        { header: "Tür", pct: 16 },
        { header: "Kayıt", pct: 62 },
      ],
      events.map((e) => [e.dateLabel, e.category, { text: e.title, sub: e.note }]),
      { headerFill: C.yolculuk },
    ),
    dyGap(),
  ];
}

// ─── Sekme (tab) modu ────────────────────────────────────────────────────────

export const CLIENT_REPORT_TABS = ["genel","notlar","randevular","taslar","seanslar","ucretlendirme","odevler","analizler"] as const;
export type ClientReportTab = (typeof CLIENT_REPORT_TABS)[number];

const TAB_CFG: Record<ClientReportTab, { title: string; color: string; slug: string }> = {
  genel:         { title: "Genel Bilgiler",   color: C.danisan,    slug: "genel-bilgiler" },
  notlar:        { title: "Danışan Notları",  color: C.notlar,     slug: "notlar" },
  randevular:    { title: "Randevu Geçmişi",  color: C.randevular, slug: "randevular" },
  taslar:        { title: "Taş Önerileri",    color: C.taslar,     slug: "taslar" },
  seanslar:      { title: "Seans Geçmişi",    color: C.seanslar,   slug: "seanslar" },
  ucretlendirme: { title: "Ücretlendirme",    color: C.ucret,      slug: "ucretlendirme" },
  odevler:       { title: "Ödev Takibi",      color: C.odevler,    slug: "odevler" },
  analizler:     { title: "Analiz Sonuçları", color: C.analizler,  slug: "analizler" },
};

const EMPTY_TAB_NOTE = "Bu bölümde kayıtlı veri bulunmuyor.";

/**
 * Sekme (tab) modu — DY-012: kapak + danışanın dolu genel bilgileri + sekmenin içeriği.
 * `rows` sekmenin tablosundan okunan satırlar; analysisImages rows ile hizalı.
 */
export function buildClientTabReport(
  input: {
    tab: ClientReportTab;
    client: ClientRow;
    notes: ClientNoteRow | null;
    rows: Record<string, unknown>[];
    analysisImages?: (Buffer | null)[];
  },
  ctx: ClientReportCtx = {},
): ClientReportResult {
  const { tab, client: cli, notes } = input;
  const { now, today, dateSlug } = reportDates(ctx);
  const { fullName, nameSlug } = clientNames(cli);
  const cfg = TAB_CFG[tab];
  const num = counter();
  const all: ReportChild[] = [];

  all.push(...buildClientInfoSection(cli, notes, num(), {}));

  const section = (body: ReportChild[]) => {
    all.push(dySectionTitle(`${num()}. ${cfg.title}`, cfg.color));
    all.push(...(body.length ? body : [dyNote(EMPTY_TAB_NOTE)]));
  };

  if (tab === "notlar") {
    const text = notesToPlainText(notes?.notlar).trim();
    section(text ? [dyBody(text)] : []);
  } else if (tab === "randevular") {
    const apts = input.rows as AppointmentRow[];
    section(apts.length ? appointmentsBody(apts, now) : []);
  } else if (tab === "taslar") {
    const stones = (input.rows as ClientStoneRow[]).filter(stoneHasContent);
    section(stones.length ? stonesBody(stones) : []);
  } else if (tab === "seanslar") {
    const sessions = reportableSessions(input.rows as ClientSessionRow[], now);
    section(sessions.length ? sessionsBody(sessions) : []);
  } else if (tab === "ucretlendirme") {
    const charges = input.rows as ClientChargeRow[];
    section(charges.length ? chargesBody(charges) : []);
  } else if (tab === "odevler") {
    const inc = ctx.includeExpertNotes === true;
    const hws = (input.rows as ClientHomeworkRow[]).filter((h) => homeworkHasContent(h, inc));
    section(hws.length ? homeworksBody(hws, inc) : []);
  } else if (tab === "analizler") {
    const imgs = input.analysisImages ?? [];
    const items = (input.rows as ClientAnalysisRow[])
      .map((an, i) => ({ an, img: imgs[i] ?? null }))
      .filter(({ an, img }) => analysisHasContent(an, img));
    section(items.length ? analysesBody(items) : []);
  }
  // tab === "genel": içerik = Danışan Bilgileri bölümünün kendisi.

  all.push(...wellnessBlock(ctx.expertName));

  const cover = dyCover({ logo: ctx.logo ?? null, reportTitle: cfg.title, reportSubtitle: "Danışan Yolculuğu", clientName: fullName, dateLabel: today, expertName: ctx.expertName });
  const doc = buildDocument(cover, all, `${cfg.title} · ${fullName}`, `${cfg.title} — ${fullName}`);
  return { doc, filename: `danisan-${cfg.slug}-${nameSlug}-${dateSlug}.docx` };
}

/** Tek analiz modu (analiz modalindeki "Word Al") — kapak + danışan bilgileri + analiz. */
export function buildClientSingleAnalysisReport(
  input: { client: ClientRow; analysis: ClientAnalysisRow; imageBuf: Buffer | null; notes?: ClientNoteRow | null },
  ctx: ClientReportCtx = {},
): ClientReportResult {
  const an = input.analysis;
  const { today, dateSlug } = reportDates(ctx);
  const { fullName, nameSlug } = clientNames(input.client);
  const label = analysisTypeLabel(an.analysis_type);
  const num = counter();
  const all: ReportChild[] = [];

  all.push(...buildClientInfoSection(input.client, input.notes ?? null, num(), {}));
  all.push(dySectionTitle(`${num()}. ${label}`, C.analizler));
  all.push(dyNote(`Analiz tarihi: ${dateTimeTR(an.created_at)}`));
  if (analysisHasContent(an, input.imageBuf)) {
    const tables = buildAnalysisTables(an);
    if (tables) all.push(...tables);
    else if (input.imageBuf) all.push(analysisImage(input.imageBuf));
    all.push(...dyLabeledText("Analiz Notu", an.note));
  } else {
    all.push(dyNote("Bu analiz kaydında ölçülmüş değer bulunmuyor."));
  }
  all.push(...wellnessBlock(ctx.expertName));

  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: label,
    reportSubtitle: "Analiz Raporu",
    clientName: fullName,
    dateLabel: today,
    expertName: ctx.expertName,
    meta: [["Analiz Tarihi", dateTimeTR(an.created_at)]],
  });
  const doc = buildDocument(cover, all, `${label} · ${fullName}`, `${label} — ${fullName}`);
  return { doc, filename: `danisan-analiz-${slugify(label)}-${nameSlug}-${dateSlug}.docx` };
}

// ─── Tam / Özel / Tarih aralığı / Toplu ortak gövde ──────────────────────────

export type ClientDataset = {
  client: ClientRow;
  notes: ClientNoteRow | null;
  appointments: AppointmentRow[];
  stones: ClientStoneRow[];
  sessions: ClientSessionRow[];
  homeworks: ClientHomeworkRow[];
  analyses: ClientAnalysisRow[];
  charges: ClientChargeRow[];
};

/**
 * FA-02: tarih-aralığı filtresi YEREL takvim gününe göre. DATE/TEXT alanlar (stone_date,
 * session_date, start_date, charge_date) kaydırılmaz; timestamptz (appointment_date,
 * created_at) Europe/Istanbul gününe çevrilir → 01:30 randevu kendi gününde filtrelenir.
 */
export function filterClientDatasetByRange(data: ClientDataset, drStart: string, drEnd: string): ClientDataset {
  const dayOf = (primary: string | null | undefined, fallback: string | null | undefined): string => {
    const raw = primary?.trim() || fallback?.trim() || "";
    return looseDayKey(raw) || raw.slice(0, 10);
  };
  const inRange = (d: string): boolean => d >= drStart && d <= drEnd;
  return {
    ...data,
    appointments: data.appointments.filter((a) => inRange(dayOf(a.appointment_date, a.appointment_date))),
    stones:       data.stones.filter((s) => inRange(dayOf(s.stone_date, s.created_at))),
    sessions:     data.sessions.filter((s) => inRange(dayOf(s.session_date, s.created_at))),
    homeworks:    data.homeworks.filter((h) => inRange(dayOf(h.start_date, h.created_at))),
    analyses:     data.analyses.filter((a) => inRange(dayOf(a.created_at, a.created_at))),
    charges:      data.charges.filter((c) => inRange(dayOf(c.charge_date, c.created_at))),
  };
}

export type ClientFullInput = {
  data: ClientDataset;
  profileImg: Buffer | null;
  analysisImages?: (Buffer | null)[];
  /** BF-14 teslim eki (eski çağıranlar için; numarası çağıranda sabit). */
  snapshotChildren?: ReportChild[];
  /** BF-14 teslim eki — doğru bölüm numarasıyla üretilir (tercih edilen). */
  snapshotSection?: (headingNumber: number) => ReportChild[];
  /** Kayıtlı HD analizinin DONMUŞ snapshot gövdesi (route okur; yoksa bölüm yok). */
  hd?: ClientHdSection | null;
  /**
   * DY-005/006: uzmanın bu rapor için AÇIKÇA seçtiği kayıtlı Numeroloji analizi (route tenant-kapsamlı
   * okur). Verilirse Numeroloji bölümü bu kaydın snapshot'ından üretilir (yeniden hesap YOK);
   * verilmezse mevcut DY-004 özeti korunur.
   */
  numerologyRecord?: SavedNumerologyRow | null;
};

type BodyOpts = { badge?: string; pageBreakBefore?: boolean; scopeNote?: string | null };

/**
 * Tek danışanın rapor gövdesi (tam / özel / tarih-aralığı / toplu ORTAK kaynağı).
 * Bölüm yalnız SEÇİLİ ve VERİSİ VARSA eklenir; numaralar kesintisiz.
 */
function buildClientBody(
  input: ClientFullInput,
  ctx: ClientReportCtx,
  opts: BodyOpts,
): { all: ReportChild[]; fullName: string; nameSlug: string; sectionCount: number } {
  const { client, notes } = input.data;
  const { now } = reportDates(ctx);
  const { fullName, nameSlug } = clientNames(client);
  const includeExpertNotes = ctx.includeExpertNotes === true;
  const sel = new Set<ClientReportSection>(ctx.sections ?? DEFAULT_FULL_SECTIONS);
  const imgs = input.analysisImages ?? [];

  // DY-001 / DY-003: rapora girecek kayıtlar (içeriksiz/gerçekleşmemiş olanlar ayıklanır).
  const sessions = reportableSessions(input.data.sessions, now);
  const appointments = input.data.appointments;
  const stones = input.data.stones.filter(stoneHasContent);
  const homeworks = input.data.homeworks.filter((h) => homeworkHasContent(h, includeExpertNotes));
  const analyses = input.data.analyses
    .map((an, i) => ({ an, img: imgs[i] ?? null }))
    .filter(({ an, img }) => analysisHasContent(an, img));
  const charges = input.data.charges;

  const num = counter();
  const all: ReportChild[] = [];
  let sectionCount = 0;
  const open = (title: string, color: string, o: { pageBreakBefore?: boolean } = {}) => {
    sectionCount++;
    all.push(dySectionTitle(`${num()}. ${title}`, color, o));
  };

  all.push(...buildClientInfoSection(client, notes, num(), {
    profileImg: input.profileImg,
    badge: opts.badge,
    pageBreakBefore: opts.pageBreakBefore,
    stats: {
      seanslar: sel.has("seanslar") ? sessions.length : 0,
      randevular: sel.has("randevular") ? appointments.length : 0,
      taslar: sel.has("taslar") ? stones.length : 0,
      odevler: sel.has("odevler") ? homeworks.length : 0,
      analizler: sel.has("analizler") ? analyses.length : 0,
    },
  }));
  if (opts.scopeNote) all.push(dyNote(opts.scopeNote));

  const notesText = notesToPlainText(notes?.notlar).trim();
  if (sel.has("notlar") && notesText) { open("Notlar", C.notlar); all.push(dyBody(notesText)); }
  if (sel.has("seanslar") && sessions.length) { open("Seanslar", C.seanslar); all.push(...sessionsBody(sessions)); }
  if (sel.has("randevular") && appointments.length) { open("Randevular", C.randevular); all.push(...appointmentsBody(appointments, now)); }
  if (sel.has("taslar") && stones.length) { open("Taş Önerileri", C.taslar); all.push(...stonesBody(stones)); }
  if (sel.has("odevler") && homeworks.length) { open("Ödevler", C.odevler); all.push(...homeworksBody(homeworks, includeExpertNotes)); }
  if (sel.has("analizler") && analyses.length) { open("Analizler", C.analizler); all.push(...analysesBody(analyses)); }

  // Human Design — DONMUŞ snapshot gövdesi (HD motoru/hesaplama YOK). Kendi sayfasından başlar.
  if (sel.has("humanDesign") && input.hd?.children.length) {
    open("Human Design", C.hd, { pageBreakBefore: true });
    const genDate = input.hd.generatedAt ? formatDateOnly(String(input.hd.generatedAt).slice(0, 10), { style: "long", fallback: "" }) : "";
    all.push(dyNote(`Human Design modülündeki kayıtlı profesyonel rapordan aktarılmıştır${genDate ? ` (rapor tarihi: ${genDate})` : ""}.`));
    all.push(...input.hd.children);
  }

  if (sel.has("numeroloji") && input.numerologyRecord) {
    open("Numeroloji — Kayıtlı Analiz", C.numeroloji);
    all.push(...buildSavedNumerologySection(input.numerologyRecord, C.numeroloji));
  } else if (sel.has("numeroloji")) {
    const body = numerologyBody(client);
    if (body.length) {
      open("Numeroloji Özeti", C.numeroloji);
      all.push(dyNote("Danışanın kayıtlı adı ve doğum tarihinden üretilen temel numeroloji özeti."));
      all.push(...body);
    }
  }

  if (sel.has("yolculuk")) {
    const events: TimelineEvent[] = [];
    if (sel.has("randevular")) for (const a of appointments) {
      const at = toInstant(a.appointment_date);
      if (at) events.push({ ts: at.getTime(), dateLabel: dateTimeTR(a.appointment_date), category: "Randevu", title: tidy(a.title) || "Görüşme", note: tidy(a.notes) || undefined });
    }
    if (sel.has("taslar")) for (const s of stones) events.push({ ts: toTs(s.stone_date, s.created_at), dateLabel: dateTR(s.stone_date || s.created_at), category: "Taş Önerisi", title: tidy(s.stone_name) || "Taş", note: tidy(s.stone_type) || undefined });
    if (sel.has("seanslar")) for (const s of sessions) events.push({ ts: toTs(s.session_date, s.created_at), dateLabel: dateTR(s.session_date || s.created_at), category: "Seans", title: tidy(s.session_type) || "Seans", note: tidy(s.session_note).slice(0, 160) || undefined });
    if (sel.has("odevler")) for (const h of homeworks) events.push({ ts: toTs(h.start_date, h.created_at), dateLabel: dateTR(h.start_date || h.created_at), category: "Ödev", title: tidy(h.title) || "Ödev", note: tidy(h.homework_type) || undefined });
    if (sel.has("analizler")) for (const { an } of analyses) events.push({ ts: toInstant(an.created_at)?.getTime() ?? 0, dateLabel: dateTimeTR(an.created_at), category: "Analiz", title: analysisTypeLabel(an.analysis_type), note: tidy(an.note).slice(0, 160) || undefined });
    if (events.length) {
      events.sort((a, b) => a.ts - b.ts);
      open("Danışan Yolculuğu", C.yolculuk);
      all.push(dyNote(`${events.length} kayıt · kronolojik sıralama (eskiden yeniye)`));
      all.push(...journeyBody(events));
    }
  }

  // Ücretlendirme — YALNIZ açıkça seçildiyse (varsayılan HARİÇ).
  if (sel.has("ucretlendirme") && charges.length) { open("Ücretlendirme", C.ucret); all.push(...chargesBody(charges)); }

  // Yaşam Hafızası Seçimleri (BF-14 P2; OPSİYONEL — route okur).
  if (input.snapshotSection) {
    const snap = input.snapshotSection(sectionCount + 2);
    if (snap.length) { sectionCount++; num(); all.push(...snap); }
  } else if (input.snapshotChildren?.length) {
    all.push(...input.snapshotChildren);
  }

  return { all, fullName, nameSlug, sectionCount };
}

function variantLabel(ctx: ClientReportCtx): string {
  return ctx.variant === "custom" ? "Özel Rapor" : "Tam Rapor";
}

/** Tam / Özel danışan dosyası. HD bölümü ve BF-14 eki route'ta async okunup verilir. */
export function buildClientFullReport(input: ClientFullInput, ctx: ClientReportCtx = {}): ClientReportResult {
  const { today, dateSlug } = reportDates(ctx);
  const body = buildClientBody(input, ctx, {});
  body.all.push(...wellnessBlock(ctx.expertName));
  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: "Danışan Dosyası",
    reportSubtitle: `Bireysel Takip ve Analiz Raporu · ${variantLabel(ctx)}`,
    clientName: body.fullName,
    dateLabel: today,
    expertName: ctx.expertName,
  });
  const doc = buildDocument(cover, body.all, `Danışan Raporu · ${body.fullName}`, `Danışan Dosyası — ${body.fullName}`);
  return { doc, filename: `danisan-raporu-${body.nameSlug}-${dateSlug}.docx` };
}

/** Tarih-aralığı modu. `data` ÖNCEDEN filtrelenmiş olmalı (filterClientDatasetByRange). */
export function buildClientDateRangeReport(
  input: {
    data: ClientDataset;
    drStart: string;
    drEnd: string;
    profileImg: Buffer | null;
    analysisImages?: (Buffer | null)[];
  },
  ctx: ClientReportCtx = {},
): ClientReportResult {
  const { today } = reportDates(ctx);
  const startFmt = formatDateOnly(input.drStart, { style: "long", fallback: input.drStart });
  const endFmt = formatDateOnly(input.drEnd, { style: "long", fallback: input.drEnd });
  // Tarih aralığında HD/Numeroloji (tarihsiz bütünsel bölümler) yer almaz.
  const sections = (ctx.sections ?? DEFAULT_FULL_SECTIONS).filter((s) => s !== "humanDesign" && s !== "numeroloji");
  const body = buildClientBody(
    { data: input.data, profileImg: input.profileImg, analysisImages: input.analysisImages },
    { ...ctx, sections },
    { scopeNote: `Bu rapor ${startFmt} — ${endFmt} arasındaki kayıtları içerir. Danışan bilgileri tarihten bağımsızdır.` },
  );
  if (body.sectionCount === 0) body.all.push(dyNote("Seçilen tarih aralığında rapora girecek kayıt bulunmuyor."));
  body.all.push(...wellnessBlock(ctx.expertName));
  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: "Tarih Aralığı Raporu",
    reportSubtitle: "Danışan Yolculuğu Özeti",
    clientName: body.fullName,
    dateLabel: today,
    expertName: ctx.expertName,
    meta: [["Tarih Aralığı", `${startFmt} — ${endFmt}`]],
  });
  const doc = buildDocument(cover, body.all, `Tarih Aralığı Raporu · ${body.fullName}`, `Tarih Aralığı Raporu — ${body.fullName}`);
  return { doc, filename: `danisan-tarih-araligi-${body.nameSlug}-${input.drStart}-${input.drEnd}.docx` };
}

/**
 * WT7 — TOPLU danışan dosyası: seçili danışanların HER BİRİ için tekli raporun AYNI gövdesi
 * (aynı kod yolu). Yapı: kapak + danışan dizini → her danışan yeni sayfada "DANIŞAN i / N"
 * → bilgilendirme notu bir kez. Analiz yatay sayfaları danışan bazında doğru konuma yerleşir.
 */
export function buildClientsBulkFullReport(items: ClientFullInput[], ctx: ClientReportCtx = {}): ClientReportResult {
  const { today, dateSlug } = reportDates(ctx);
  const total = items.length;
  const all: ReportChild[] = [];

  all.push(dySectionTitle("Danışan Dizini", C.danisan));
  all.push(dyNote(`Bu dosya ${total} danışanın danışan dosyasını sırasıyla içerir.`));
  all.push(dyDataTable(
    [{ header: "No", pct: 10, align: "center" }, { header: "Danışan", pct: 60 }, { header: "Doğum Tarihi", pct: 30 }],
    items.map((it, i) => [String(i + 1).padStart(3, "0"), clientNames(it.data.client).fullName, dateTR(it.data.client.dogum) || "—"]),
  ));

  items.forEach((it, i) => {
    all.push(...buildClientBody(it, ctx, { badge: `Danışan ${i + 1} / ${total}`, pageBreakBefore: true }).all);
  });

  all.push(...wellnessBlock(ctx.expertName));
  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: "Danışan Dosyaları",
    reportSubtitle: "Toplu Danışan Raporu",
    clientName: `${total} Danışan`,
    dateLabel: today,
    expertName: ctx.expertName,
  });
  const doc = buildDocument(cover, all, "Danışan Dosyaları · Yaşam Sistemi", "Danışan Dosyaları — Yaşam Sistemi");
  return { doc, filename: `danisan-dosyalari-${total}-danisan-${dateSlug}.docx` };
}

/** Rapor içerik özeti (UI'daki Özel Rapor seçenekleri için; DB yok). */
export function summarizeClientDataset(data: ClientDataset, ctx: { now?: Date; analysisImageFlags?: boolean[] } = {}) {
  const now = ctx.now ?? new Date();
  const flags = ctx.analysisImageFlags ?? [];
  return {
    notlar: notesToPlainText(data.notes?.notlar).trim() ? 1 : 0,
    seanslar: reportableSessions(data.sessions, now).length,
    randevular: data.appointments.length,
    taslar: data.stones.filter(stoneHasContent).length,
    odevler: data.homeworks.filter((h) => homeworkHasContent(h, false)).length,
    analizler: data.analyses.filter((an, i) => !!buildAnalysisTables(an) || flags[i] === true || has(an.note)).length,
    numeroloji: data.client.dogum?.trim() ? 1 : 0,
    ucretlendirme: data.charges.length,
  };
}
