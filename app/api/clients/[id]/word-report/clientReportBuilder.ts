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
import { notesToPlainText } from "@/lib/clientNotes";
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
  expertFooterParagraph,
  expertSignatureBlock,
  type ExpertBranding,
  type ExpertBrandingVariant,
} from "@/lib/docx/expertBranding";
import {
  looseDayKey,
  reportFileDate,
  reportGeneratedLabel,
  toInstant,
  zonedDayKey,
} from "@/lib/time/reportTime";
import { tidyUserText } from "@/lib/clients/wordReportText";
import type { ReportLocale } from "@/lib/i18n/reportLocale";
import { dyText, type DyText } from "./clientReportText";
import { buildSavedNumerologySection, type SavedNumerologyRow } from "./numerologySavedSection";
import { buildAnamnezSection, buildBeslenmeSection, type AnamnezReportRow, type BeslenmeReportInput } from "./sensitiveSections";
import { summarizeUnpaid } from "@/lib/danisan/chargePayment";
import {
  DY_CONTENT_W,
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
  anamnez:    "0f766e",   // camgöbeği (Anamnez sekmesi rengi)
  beslenme:   "047857",   // yeşil (Beslenme sekmesi rengi)
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

/** B5: danışana özel kayıtlı kombinasyon (client_combinations) — Taşlar Word'ü için. */
export type ClientCombinationReportRow = {
  id: string;
  name?: string | null;
  description?: string | null;
  note?: string | null;
  stones_text?: string | null;
  notes_text?: string | null;
  notes_text_2?: string | null;
  created_at: string;
};

/** C11: Taşlar Word'ü için taş başına fotoğraf seti (route'ta yüklenir). */
export type StoneReportPhotoSet = { images: Buffer[]; total: number; omitted: number; unreadable: number };

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

/**
 * I18N çıktı dili: rapor kurucuları EŞZAMANLIDIR; her dışa açık kurucu girişte `withText(ctx, …)` ile bu
 * modül metin katmanını (`X`) ayarlar ve çıkışta geri alır. Verilmezse kaynak dil (tr) = bugünkü çıktı.
 */
let X: DyText = dyText();
function withText<T>(ctx: ClientReportCtx, fn: () => T): T {
  const prev = X;
  X = dyText(ctx.output);
  try {
    return fn();
  } finally {
    X = prev;
  }
}

/** DATE / TEXT takvim alanları — kaydırmasız; boş → "". */
function dateTR(date: string | null | undefined): string {
  return X.dateTR(date);
}

/** timestamptz → Europe/Istanbul tarih + saat; boş → "". */
function dateTimeTR(value: string | null | undefined): string {
  return X.dateTimeTR(value);
}

function chargeCatLabel(cat?: string | null): string {
  return X.chargeCategory(cat);
}
function formatTRY(amount: number): string {
  // C4 (2026-11-04): kuruş varsa daima 2 hane ("1.500,50 ₺"; eskiden "1.500,5 ₺");
  // tam tutar mevcut biçimde kalır ("1.500 ₺"). TRY sabit; yalnız biçim dile göre.
  return X.money(amount);
}

function slugify(text: string): string {
  // C3 (2026-11-04): yerel ayarsız toLowerCase "İ" → "i̇" üretip "bi-r" yapıyordu.
  return text
    .toLocaleLowerCase("tr-TR")
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
  if (s === "tamamlandi") return X.aptStatus("completed");
  if (s === "iptal") return X.aptStatus("cancelled");
  const at = toInstant(date);
  if (!at) return X.aptStatus("upcoming");
  return at.getTime() < now.getTime() ? X.aptStatus("noResult") : X.aptStatus("upcoming");
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

// Etiketler katalogda (reports.clients.analysis.bodies|chakras|planetRows); burada yalnız kanonik anahtar + renk.
const CHAKRA_ENERGY_BODIES = [
  { key: "ruhsal",   color: "6d5bd0" },
  { key: "zihinsel", color: "43a047" },
  { key: "duygusal", color: "b7791f" },
  { key: "eterik",   color: "2196c9" },
  { key: "fiziksel", color: "4b5563" },
] as const;

const CHAKRA_ROWS = [
  { key: "tac",    color: "7c3aed" },
  { key: "goz",    color: "4f46e5" },
  { key: "bogaz",  color: "0284c7" },
  { key: "kalp",   color: "16a34a" },
  { key: "mide",   color: "a16207" },
  { key: "sakral", color: "ea580c" },
  { key: "kok",    color: "dc2626" },
] as const;

/**
 * Gezegen sütunları: `code` analysis_data.values anahtarındaki KANONİK değerdir (kayıtlı veri; ASLA çevrilmez);
 * `key` yalnız görünen başlığın katalog anahtarı.
 */
const PLANETS = [
  { code: "GÜNEŞ", key: "gunes" },
  { code: "AY", key: "ay" },
  { code: "MERKÜR", key: "merkur" },
  { code: "MARS", key: "mars" },
  { code: "VENÜS", key: "venus" },
] as const;

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
function chakraTable(title: string, scope: string, rows: ReadonlyArray<{ key: string; color: string }>, labelNs: "bodies" | "chakras", values: Record<string, ChakraValueEntry>): ReportChild[] | null {
  const measured = rows
    .map((r) => ({ r, v: values[`${scope}_${r.key}`] ?? {} }))
    .filter(({ v }) => has(v.mark) || has(v.male) || has(v.female));
  if (!measured.length) return null;
  return [
    dySubTitle(title, C.analizler),
    dyDataTable(
      [
        { header: X.t("analysis.cols.area"), pct: 34 },
        { header: X.t("analysis.cols.mark"), pct: 22, align: "center" },
        { header: X.t("analysis.cols.male"), pct: 22, align: "center" },
        { header: X.t("analysis.cols.female"), pct: 22, align: "center" },
      ],
      measured.map(({ r, v }) => [
        { text: X.t(`analysis.${labelNs}.${r.key}`), bold: true, fill: r.color, textColor: "ffffff" },
        valCell(v.mark),
        valCell(v.male),
        valCell(v.female),
      ]),
    ),
    dyGap(120),
  ];
}

function planetTable(title: string, scope: string, values: Record<string, string>): ReportChild[] | null {
  const measured = CHAKRA_ROWS.filter((r) => PLANETS.some((p) => has(values[`${scope}_${r.key}_${p.code}`])));
  if (!measured.length) return null;
  return [
    dySubTitle(title, C.analizler),
    dyDataTable(
      [{ header: X.t("analysis.cols.chakra"), pct: 25 }, ...PLANETS.map((p) => ({ header: X.t(`analysis.planets.${p.key}`), pct: 15, align: "center" as const }))],
      measured.map((r) => [
        { text: X.t(`analysis.planetRows.${r.key}`), bold: true, fill: r.color, textColor: "ffffff" },
        ...PLANETS.map((p) => valCell(values[`${scope}_${r.key}_${p.code}`])),
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
      chakraTable(X.t("analysis.tables.beforeEnergy"), "before_energy", CHAKRA_ENERGY_BODIES, "bodies", v),
      chakraTable(X.t("analysis.tables.afterEnergy"), "after_energy", CHAKRA_ENERGY_BODIES, "bodies", v),
      chakraTable(X.t("analysis.tables.beforeChakra"), "before_chakra", CHAKRA_ROWS, "chakras", v),
      chakraTable(X.t("analysis.tables.afterChakra"), "after_chakra", CHAKRA_ROWS, "chakras", v),
    );
  } else if (an.analysis_type === "planet") {
    const v = values as Record<string, string>;
    parts.push(planetTable(X.t("analysis.tables.before"), "before", v), planetTable(X.t("analysis.tables.after"), "after", v));
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
function wellnessBlock(expertName?: string | null, ctx: ClientReportCtx = {}): ReportChild[] {
  const note = wellnessNote("danisan", X.common);
  const name = expertName?.trim();
  // F3A: markalama açıksa "Hazırlayan" satırı genişletilmiş imza bloğuyla değişir (bilgilendirme metni AYNEN).
  const signature = expertSignatureBlock(ctx.branding, { variant: ctx.brandingVariant, accent: DY_NAVY, fallbackName: name, contentWidth: DY_CONTENT_W, fill: "f8fafc", common: X.common });
  return [
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: 360, after: 60 },
      children: [new TextRun({ text: X.common.information, bold: true, size: 18, font: REPORT_FONT, color: C_MID })],
    }),
    new Paragraph({
      // Sayfa düzeni (10.11): imza kartı bilgilendirmeyle ZORLA birlikte tutulmaz (kart kendi içinde bölünmez).
      keepNext: !!name && signature.length === 0,
      keepLines: true,
      spacing: { after: 80 },
      children: [new TextRun({ text: note.full, italics: true, size: 16, font: REPORT_FONT, color: C_LIGHT })],
    }),
    ...(signature.length ? signature : name ? [new Paragraph({
      keepLines: true,
      spacing: { after: 60 },
      children: [new TextRun({ text: `${X.common.preparedBy}: ${safe(name)}`, size: 16, font: REPORT_FONT, color: C_MID })],
    })] : []),
  ];
}

/** Kapak (üst/alt bilgisiz, tek sayfa) + gövde (A4 dikey, 2 cm kenar). */
function buildDocument(cover: ReportChild[], body: ReportChild[], footerText: string, title: string, ctx: ClientReportCtx = {}): Document {
  // FA-16: danışana giden belge → sayfa altında kısa bilgilendirme notu.
  // F3A: markalama açıksa alt bilgide küçük kurum satırı (yoksa footer birebir aynı).
  const footer = buildFooter(safe(footerText), { note: "danisan", brandLine: expertFooterParagraph(ctx.branding, { variant: ctx.brandingVariant }), common: X.common });
  const page = { size: DY_PAGE.size, margin: DY_PAGE.margin };
  return new Document({
    creator: "Yaşam Sistemi",
    title: safe(title),
    // I18N: belge dili yalnız TR dışında (w:lang); TR'de stil birebir.
    styles: { default: { document: { run: { font: REPORT_FONT, ...(X.rl.isSource ? {} : { language: { value: X.rl.documentLang } }) } } } },
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
  /**
   * F3A: uzman rapor markalaması (render-hazır; `normalizeExpertBranding`). null/yok → çıktı bugünküyle
   * birebir. Veri kaynağı (expert_profiles / logo) F1/F2 ile bağlanacak; route'lar şimdilik null geçer.
   */
  branding?: ExpertBranding | null;
  /** Yalnız örnek/test üretimi için tasarım varyantı; üretimde DEFAULT_EXPERT_BRANDING_VARIANT. */
  brandingVariant?: ExpertBrandingVariant;
  /** I18N çıktı dili (route `resolveReportLocale`); verilmezse TR = bugünkü çıktı (golden). */
  output?: ReportLocale | null;
};

export type ClientReportResult = { doc: Document; filename: string };

function reportDates(ctx: ClientReportCtx) {
  const now = ctx.now ?? new Date();
  return { now, today: reportGeneratedLabel(X.rl.isSource ? undefined : { locale: X.rl.intlTag }, now), dateSlug: reportFileDate(undefined, now) };
}

function clientNames(cli: ClientRow) {
  const rawName = `${cli.ad ?? ""} ${cli.soyad ?? ""}`.trim();
  return { rawName, fullName: tidy(rawName) || X.t("untitledClient"), nameSlug: slugify(rawName || X.t("fileClient")) };
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
    [X.t("info.phone"),       tidy(cli.telefon)],
    [X.t("info.birthDate"),   dateTR(cli.dogum)],
    [X.t("info.meetingDate"), dateTR(cli.gorusme)],
    [X.t("info.zodiac"),      tidy(cli.burc)],
    [X.t("info.bloodType"),   tidy(cli.kan)],
    [X.t("info.temperament"), X.temperament(cli.mizac, "")],
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
  out.push(dySectionTitle(`${num}. ${X.t("info.heading")}`, C.danisan, { pageBreakBefore: !opts.badge && opts.pageBreakBefore === true }));
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
      { label: X.t("stats.sessions"), value: opts.stats.seanslar, color: C.seanslar },
      { label: X.t("stats.appointments"), value: opts.stats.randevular, color: C.randevular },
      { label: X.t("stats.stones"), value: opts.stats.taslar, color: C.taslar },
      { label: X.t("stats.homeworks"), value: opts.stats.odevler, color: C.odevler },
      { label: X.t("stats.analyses"), value: opts.stats.analizler, color: C.analizler },
    ]);
    if (strip) out.push(strip, dyGap());
  }
  out.push(
    ...dyLabeledText(X.t("info.healthNote"), notes?.saglik_notu),
    ...dyLabeledText(X.t("info.address"), notes?.adres),
    ...dyLabeledText(X.t("info.suggestions"), notes?.oneriler),
  );
  return out;
}

// ─── Bölüm gövdeleri (veri yoksa [] döner → bölüm eklenmez) ──────────────────

function sessionsBody(sessions: ClientSessionRow[]): ReportChild[] {
  const out: ReportChild[] = [];
  const total = sessions.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  out.push(dyNote(`${X.count("sessions.count", sessions.length)}${total > 0 ? X.t("sessions.totalMinutes", { minutes: String(total) }) : ""}`));
  sessions.forEach((s, i) => {
    out.push(dyItemTitle(`${i + 1}. ${tidy(s.session_type) || X.t("sessions.fallbackTitle")}`, C.seanslar, dateTR(s.session_date) || dateTR(s.created_at)));
    const kv = dyKvTable(filledRows([[X.t("sessions.duration"), (s.duration_minutes ?? 0) > 0 ? X.t("sessions.minutes", { minutes: String(s.duration_minutes) }) : ""]]));
    if (kv) out.push(kv);
    out.push(
      ...dyLabeledText(X.t("sessions.note"), s.session_note),
      ...dyLabeledText(X.t("sessions.actions"), s.actions_done),
      ...dyLabeledText(X.t("sessions.suggestions"), s.suggestions),
      ...dyLabeledText(X.t("sessions.nextPlan"), s.next_plan),
    );
    if (i < sessions.length - 1) out.push(dyDivider());
  });
  return out;
}

function appointmentsBody(apts: AppointmentRow[], now: Date): ReportChild[] {
  return [
    dyDataTable(
      [
        { header: X.t("appointments.colDate"), pct: 22 },
        { header: X.t("appointments.colTitle"), pct: 30 },
        { header: X.t("appointments.colStatus"), pct: 18 },
        { header: X.t("appointments.colNote"), pct: 30 },
      ],
      apts.map((a) => [dateTimeTR(a.appointment_date), tidy(a.title) || X.t("appointments.defaultTitle"), aptStatus(a.status, a.appointment_date, now), tidy(a.notes) || "—"]),
    ),
    dyGap(),
  ];
}

/**
 * C11 (2026-11-04): `photos` verilirse (yalnız Taşlar Word'ü) taşın fotoğrafları kaydın altına
 * eklenir. Harita route'ta bu tenant + danışan + taş yoluna göre süzülüp küçültülmüş olarak gelir;
 * verilmezse (tam/toplu rapor) çıktı AYNEN eskisi gibidir.
 */
function stonesBody(stones: ClientStoneRow[], photos?: ReadonlyMap<string, StoneReportPhotoSet>): ReportChild[] {
  const out: ReportChild[] = [];
  stones.forEach((st, i) => {
    out.push(dyItemTitle(`${i + 1}. ${tidy(st.stone_name) || X.t("stones.fallbackTitle")}`, C.taslar, dateTR(st.stone_date)));
    const kv = dyKvTable(filledRows([[X.t("stones.usageType"), tidy(st.stone_type)]]));
    if (kv) out.push(kv);
    out.push(
      ...dyLabeledText(X.t("stones.usageDetail"), st.usage_area),
      ...dyLabeledText(X.t("stones.combination"), st.combination_text),
      ...dyLabeledText(X.t("stones.warning"), st.warning_text),
      ...dyLabeledText(X.t("stones.generalNote"), st.note),
      ...dyLabeledText(X.t("stones.otherNotes"), st.other_notes),
    );
    const ph = photos?.get(st.id);
    if (ph && ph.total > 0) {
      const added = ph.images.length;
      out.push(...dyLabeledText(X.t("stones.photos"), added === ph.total ? X.count("stones.photosAll", added) : X.t("stones.photosPartial", { total: String(ph.total), added: String(added) })));
      for (const img of ph.images) out.push(embedImageParagraph(img, 260, 260));
      // Sessiz eksiltme YOK: eklenemeyen her fotoğraf nedeniyle yazılır.
      const why: string[] = [];
      if (ph.omitted > 0) why.push(X.count("stones.omitted", ph.omitted));
      if (ph.unreadable > 0) why.push(X.count("stones.unreadable", ph.unreadable));
      if (why.length) out.push(dyNote(X.t("stones.photosNote", { reasons: why.join(X.t("stones.reasonsJoin")) })));
    }
    if (i < stones.length - 1) out.push(dyDivider());
  });
  return out;
}

/**
 * B5 (05.11): Taşlar Word'ü — danışana kaydedilmiş kombinasyonlar. Uygulamadaki "Kayıtlı
 * Kombinasyonlar" kartıyla aynı alanlar ve etiketler (Taşlar, Amaç, Not, Mineral Özeti,
 * Uyarı / Stok Özeti). Kombinasyon yoksa hiçbir şey eklenmez → rapor eskisiyle birebir aynı.
 */
function combinationsBody(combos: ClientCombinationReportRow[]): ReportChild[] {
  const out: ReportChild[] = [dySubTitle(X.t("combinations.heading"), C.taslar)];
  combos.forEach((cb, i) => {
    out.push(dyItemTitle(`${i + 1}. ${tidy(cb.name) || X.t("combinations.fallbackTitle")}`, C.taslar, X.instantDate(cb.created_at)));
    const stones = String(cb.stones_text ?? "").split(",").map((s) => tidy(s)).filter(Boolean);
    out.push(
      ...dyLabeledText(X.t("combinations.stones"), stones.join(", ")),
      ...dyLabeledText(X.t("combinations.purpose"), cb.description),
      ...dyLabeledText(X.t("combinations.note"), cb.note),
      ...dyLabeledText(X.t("combinations.mineral"), cb.notes_text),
      ...dyLabeledText(X.t("combinations.warning"), cb.notes_text_2),
    );
    if (i < combos.length - 1) out.push(dyDivider());
  });
  return out;
}

function combinationHasContent(cb: ClientCombinationReportRow): boolean {
  return has(cb.name) || has(cb.stones_text) || has(cb.description) || has(cb.note) || has(cb.notes_text) || has(cb.notes_text_2);
}

function homeworksBody(hws: ClientHomeworkRow[], includeExpertNotes: boolean): ReportChild[] {
  const out: ReportChild[] = [];
  hws.forEach((hw, i) => {
    out.push(dyItemTitle(`${i + 1}. ${tidy(hw.title) || X.t("homework.fallbackTitle")}`, C.odevler));
    const kv = dyKvTable(filledRows([
      [X.t("homework.type"), tidy(hw.homework_type)],
      [X.t("homework.start"), dateTR(hw.start_date)],
      [X.t("homework.end"), dateTR(hw.end_date)],
      [X.t("homework.status"), X.homeworkStatus(hw.status)],
    ]), { cols: 4 });
    if (kv) out.push(kv);
    out.push(...dyLabeledText(X.t("homework.description"), hw.description));
    if (includeExpertNotes && hw.expert_note?.trim()) out.push(...dyLabeledText(X.t("homework.expertNote"), hw.expert_note));
    out.push(...dyLabeledText(X.t("homework.feedback"), hw.client_feedback));
    if (i < hws.length - 1) out.push(dyDivider());
  });
  return out;
}

/** Analiz blokları — yalnız içerikli analizler (çağıran süzer). Tablo yoksa kayıtlı şema görseli. */
function analysesBody(items: { an: ClientAnalysisRow; img: Buffer | null }[]): ReportChild[] {
  const out: ReportChild[] = [];
  items.forEach(({ an, img }, i) => {
    out.push(dyItemTitle(`${i + 1}. ${X.analysisType(an.analysis_type)}`, C.analizler, dateTimeTR(an.created_at)));
    const tables = buildAnalysisTables(an);
    if (tables) out.push(...tables);
    else if (img) out.push(analysisImage(img));
    out.push(...dyLabeledText(X.t("analysis.note"), an.note));
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
        { header: X.t("charges.colDate"), pct: 15 },
        { header: X.t("charges.colCategory"), pct: 14 },
        { header: X.t("charges.colDetail"), pct: 37 },
        { header: X.t("charges.colPayment"), pct: 15 },
        { header: X.t("charges.colAmount"), pct: 19, align: "right" },
      ],
      charges.map((c) => [
        dateTR(c.charge_date) || dateTR(c.created_at),
        chargeCatLabel(c.category),
        { text: tidy(c.detail) || "—", sub: c.note },
        X.paymentStatus(c.payment_status),
        { text: formatTRY(c.amount ?? 0), bold: true },
      ]),
      { headerFill: C.ucret },
    ),
  ];
  const summary: [string, string][] = [[X.t("charges.totalRecords"), String(charges.length)], [X.t("charges.totalFee"), formatTRY(total)]];
  // WT7: yalnız açıkça "Ödenmedi" kayıtlar; eski/Belirtilmemiş kayıtlar sayılmaz.
  if (unpaid.count > 0) summary.push([X.t("charges.unpaid"), X.count("charges.unpaidValue", unpaid.count, { amount: formatTRY(unpaid.total) })]);
  out.push(dyGap(120));
  const kv = dyKvTable(summary, { labelColor: C.ucret });
  if (kv) out.push(kv);
  return out;
}

// ─── Kronolojik yolculuk (tablo) ─────────────────────────────────────────────

type TimelineEvent = { ts: number; dateLabel: string; category: string; title: string; note?: string };

function journeyBody(events: TimelineEvent[]): ReportChild[] {
  return [
    dyDataTable(
      [
        { header: X.t("journey.colDate"), pct: 22 },
        { header: X.t("journey.colType"), pct: 16 },
        { header: X.t("journey.colRecord"), pct: 62 },
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

// Başlık + dosya adı parçası katalogda (reports.clients.tabs.title|slug); burada yalnız renk.
const TAB_COLOR: Record<ClientReportTab, string> = {
  genel:         C.danisan,
  notlar:        C.notlar,
  randevular:    C.randevular,
  taslar:        C.taslar,
  seanslar:      C.seanslar,
  ucretlendirme: C.ucret,
  odevler:       C.odevler,
  analizler:     C.analizler,
};
function tabCfg(tab: ClientReportTab): { title: string; color: string; slug: string } {
  return { title: X.t(`tabs.title.${tab}`), color: TAB_COLOR[tab], slug: X.t(`tabs.slug.${tab}`) };
}

/**
 * Sekme (tab) modu — DY-012: kapak + danışanın dolu genel bilgileri + sekmenin içeriği.
 * `rows` sekmenin tablosundan okunan satırlar; analysisImages rows ile hizalı.
 */
export function buildClientTabReport(
  input: Parameters<typeof buildClientTabReportImpl>[0],
  ctx: ClientReportCtx = {},
): ClientReportResult & { empty: boolean } {
  return withText(ctx, () => buildClientTabReportImpl(input, ctx));
}

function buildClientTabReportImpl(
  input: {
    tab: ClientReportTab;
    client: ClientRow;
    notes: ClientNoteRow | null;
    rows: Record<string, unknown>[];
    analysisImages?: (Buffer | null)[];
    /** C11: yalnız "taslar" sekmesi — taş id → (küçültülmüş) fotoğraflar + sayım. */
    stonePhotos?: ReadonlyMap<string, StoneReportPhotoSet>;
    /** B5: yalnız "taslar" sekmesi — bu danışanın kayıtlı kombinasyonları. */
    combinations?: ClientCombinationReportRow[];
  },
  ctx: ClientReportCtx = {},
): ClientReportResult & { empty: boolean } {
  const { tab, client: cli, notes } = input;
  const { now, today, dateSlug } = reportDates(ctx);
  const { fullName, nameSlug } = clientNames(cli);
  const cfg = tabCfg(tab);
  const num = counter();
  const all: ReportChild[] = [];

  all.push(...buildClientInfoSection(cli, notes, num(), {}));

  // DY-04: sekmede rapora girecek gerçek kayıt yoksa `empty` (route boş Word üretmez). "genel" hep dolu.
  let empty = tab !== "genel";
  const section = (body: ReportChild[]) => {
    if (body.length) empty = false;
    all.push(dySectionTitle(`${num()}. ${cfg.title}`, cfg.color));
    all.push(...(body.length ? body : [dyNote(X.t("tabs.empty"))]));
  };

  if (tab === "notlar") {
    const text = notesToPlainText(notes?.notlar).trim();
    section(text ? [dyBody(text)] : []);
  } else if (tab === "randevular") {
    const apts = input.rows as AppointmentRow[];
    section(apts.length ? appointmentsBody(apts, now) : []);
  } else if (tab === "taslar") {
    const stones = (input.rows as ClientStoneRow[]).filter(stoneHasContent);
    const combos = (input.combinations ?? []).filter(combinationHasContent);
    const body = stones.length ? stonesBody(stones, input.stonePhotos) : [];
    if (combos.length) {
      if (body.length) body.push(dyDivider());
      body.push(...combinationsBody(combos));
    }
    section(body);
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

  all.push(...wellnessBlock(ctx.expertName, ctx));

  const cover = dyCover({ logo: ctx.logo ?? null, reportTitle: cfg.title, reportSubtitle: X.t("tabs.subtitle"), clientName: fullName, dateLabel: today, expertName: ctx.expertName, branding: ctx.branding, brandingVariant: ctx.brandingVariant, text: X });
  const doc = buildDocument(cover, all, `${cfg.title} · ${fullName}`, `${cfg.title} — ${fullName}`, ctx);
  return { doc, filename: `${X.t("tabs.file")}-${cfg.slug}-${nameSlug}-${dateSlug}.docx`, empty };
}

/** Tek analiz modu (analiz modalindeki "Word Al") — kapak + danışan bilgileri + analiz. */
export function buildClientSingleAnalysisReport(
  input: { client: ClientRow; analysis: ClientAnalysisRow; imageBuf: Buffer | null; notes?: ClientNoteRow | null },
  ctx: ClientReportCtx = {},
): ClientReportResult {
  return withText(ctx, () => buildClientSingleAnalysisReportImpl(input, ctx));
}

function buildClientSingleAnalysisReportImpl(
  input: { client: ClientRow; analysis: ClientAnalysisRow; imageBuf: Buffer | null; notes?: ClientNoteRow | null },
  ctx: ClientReportCtx,
): ClientReportResult {
  const an = input.analysis;
  const { today, dateSlug } = reportDates(ctx);
  const { fullName, nameSlug } = clientNames(input.client);
  const label = X.analysisType(an.analysis_type);
  const num = counter();
  const all: ReportChild[] = [];

  all.push(...buildClientInfoSection(input.client, input.notes ?? null, num(), {}));
  all.push(dySectionTitle(`${num()}. ${label}`, C.analizler));
  all.push(dyNote(X.t("analysis.singleDate", { date: dateTimeTR(an.created_at) })));
  if (analysisHasContent(an, input.imageBuf)) {
    const tables = buildAnalysisTables(an);
    if (tables) all.push(...tables);
    else if (input.imageBuf) all.push(analysisImage(input.imageBuf));
    all.push(...dyLabeledText(X.t("analysis.note"), an.note));
  } else {
    all.push(dyNote(X.t("analysis.singleEmpty")));
  }
  all.push(...wellnessBlock(ctx.expertName, ctx));

  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: label,
    reportSubtitle: X.t("analysis.singleSubtitle"),
    clientName: fullName,
    dateLabel: today,
    expertName: ctx.expertName,
    branding: ctx.branding,
    brandingVariant: ctx.brandingVariant,
    meta: [[X.t("analysis.singleMetaDate"), dateTimeTR(an.created_at)]],
    text: X,
  });
  const doc = buildDocument(cover, all, `${label} · ${fullName}`, `${label} — ${fullName}`, ctx);
  return { doc, filename: `${X.t("analysis.file")}-${slugify(label)}-${nameSlug}-${dateSlug}.docx` };
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
  /**
   * B5 (06.11): Tam / Özel rapor — danışana kayıtlı kombinasyonlar (route yalnız bu iki modda okur).
   * Verilmezse (tarih aralığı / toplu) Taş Önerileri bölümü AYNEN eskisi gibidir.
   */
  combinations?: ClientCombinationReportRow[];
  /** Kayıtlı HD analizinin DONMUŞ snapshot gövdesi (route okur; yoksa bölüm yok). */
  hd?: ClientHdSection | null;
  /**
   * DY-005/006: danışana BAĞLI ve uzmanın bu rapor için seçtiği kayıtlı Numeroloji analizi (route
   * tenant + client_id bağını doğrular). Verilirse Numeroloji bölümü bu kaydın snapshot'ından üretilir
   * (yeniden hesap YOK); verilmezse mevcut DY-004 özeti korunur.
   */
  numerologyRecord?: SavedNumerologyRow | null;
  /** SUNUCUDA doğrulanmış Numeroloji "Gelecek Yılları Göster" yetkisi (kronolojik bölümler). */
  numerologyFutureYears?: boolean;
  /**
   * BUG-005: uzmanın AÇIKÇA seçtiği tamamlanmış + açık rızalı anamnez (route doğrular). Verilmezse
   * bölüm YOK — Tam Rapor dahil otomatik eklenmez.
   */
  anamnez?: AnamnezReportRow | null;
  /** BUG-005: uzmanın AÇIKÇA seçtiği Beslenme özeti (profil · alerjen · ölçüm). Verilmezse bölüm YOK. */
  beslenme?: BeslenmeReportInput | null;
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
  const combos = (input.combinations ?? []).filter(combinationHasContent);
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
  if (sel.has("notlar") && notesText) { open(X.t("sections.notes"), C.notlar); all.push(dyBody(notesText)); }
  // BUG-005: hassas bölüm — yalnız route açık seçimle verdiyse (Tam Rapor'da da otomatik DEĞİL).
  if (input.anamnez) {
    const body = buildAnamnezSection(input.anamnez, C.anamnez, X);
    if (body.length) { open(X.t("sections.anamnez"), C.anamnez); all.push(...body); }
  }
  if (sel.has("seanslar") && sessions.length) { open(X.t("sections.sessions"), C.seanslar); all.push(...sessionsBody(sessions)); }
  if (sel.has("randevular") && appointments.length) { open(X.t("sections.appointments"), C.randevular); all.push(...appointmentsBody(appointments, now)); }
  if (sel.has("taslar") && (stones.length || combos.length)) {
    open(X.t("sections.stones"), C.taslar);
    if (stones.length) all.push(...stonesBody(stones));
    if (combos.length) { if (stones.length) all.push(dyDivider()); all.push(...combinationsBody(combos)); }
  }
  if (sel.has("odevler") && homeworks.length) { open(X.t("sections.homeworks"), C.odevler); all.push(...homeworksBody(homeworks, includeExpertNotes)); }
  if (sel.has("analizler") && analyses.length) { open(X.t("sections.analyses"), C.analizler); all.push(...analysesBody(analyses)); }
  if (input.beslenme) {
    const body = buildBeslenmeSection(input.beslenme, C.beslenme, X);
    if (body.length) { open(X.t("sections.nutrition"), C.beslenme); all.push(...body); }
  }

  // Human Design — DONMUŞ snapshot gövdesi (HD motoru/hesaplama YOK). Kendi sayfasından başlar.
  if (sel.has("humanDesign") && input.hd?.children.length) {
    open(X.t("sections.humanDesign"), C.hd, { pageBreakBefore: true });
    const genDate = input.hd.generatedAt ? X.dateLong(String(input.hd.generatedAt).slice(0, 10), "") : "";
    all.push(dyNote(X.t("humanDesignNote", { dateSuffix: genDate ? X.t("humanDesignDateSuffix", { date: genDate }) : "" })));
    all.push(...input.hd.children);
  }

  if (sel.has("numeroloji") && input.numerologyRecord) {
    open(X.t("sections.numerology"), C.numeroloji);
    all.push(...buildSavedNumerologySection(input.numerologyRecord, C.numeroloji, { futureYears: input.numerologyFutureYears === true }));
  }
  // H-10 (OWNER KARARI BEKLİYOR): kayıtlı analiz SEÇİLMEDİYSE Numeroloji bölümü EKLENMEZ. Danışan Word'ü
  // Numeroloji motorunu çağırmaz/yeniden hesaplamaz; yalnız açıkça seçilmiş, danışana bağlı ve yetkiyle
  // (route: numerology izni) okunan kayıtlı snapshot kullanılır.

  if (sel.has("yolculuk")) {
    const events: TimelineEvent[] = [];
    if (sel.has("randevular")) for (const a of appointments) {
      const at = toInstant(a.appointment_date);
      if (at) events.push({ ts: at.getTime(), dateLabel: dateTimeTR(a.appointment_date), category: X.t("journey.category.appointment"), title: tidy(a.title) || X.t("appointments.defaultTitle"), note: tidy(a.notes) || undefined });
    }
    if (sel.has("taslar")) for (const s of stones) events.push({ ts: toTs(s.stone_date, s.created_at), dateLabel: dateTR(s.stone_date || s.created_at), category: X.t("journey.category.stone"), title: tidy(s.stone_name) || X.t("stones.fallbackTitle"), note: tidy(s.stone_type) || undefined });
    if (sel.has("seanslar")) for (const s of sessions) events.push({ ts: toTs(s.session_date, s.created_at), dateLabel: dateTR(s.session_date || s.created_at), category: X.t("journey.category.session"), title: tidy(s.session_type) || X.t("sessions.fallbackTitle"), note: tidy(s.session_note).slice(0, 160) || undefined });
    if (sel.has("odevler")) for (const h of homeworks) events.push({ ts: toTs(h.start_date, h.created_at), dateLabel: dateTR(h.start_date || h.created_at), category: X.t("journey.category.homework"), title: tidy(h.title) || X.t("homework.fallbackTitle"), note: tidy(h.homework_type) || undefined });
    if (sel.has("analizler")) for (const { an } of analyses) events.push({ ts: toInstant(an.created_at)?.getTime() ?? 0, dateLabel: dateTimeTR(an.created_at), category: X.t("journey.category.analysis"), title: X.analysisType(an.analysis_type), note: tidy(an.note).slice(0, 160) || undefined });
    if (events.length) {
      events.sort((a, b) => a.ts - b.ts);
      open(X.t("sections.journey"), C.yolculuk);
      all.push(dyNote(X.count("journey.summary", events.length)));
      all.push(...journeyBody(events));
    }
  }

  // Ücretlendirme — YALNIZ açıkça seçildiyse (varsayılan HARİÇ).
  if (sel.has("ucretlendirme") && charges.length) { open(X.t("sections.charges"), C.ucret); all.push(...chargesBody(charges)); }

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
  return X.t(ctx.variant === "custom" ? "full.variant.custom" : "full.variant.full");
}

/** Tam / Özel danışan dosyası. HD bölümü ve BF-14 eki route'ta async okunup verilir. */
/**
 * DY-04: Tam/Özel raporda gerçek kayıt içeren bölüm sayısı (kapak + "Danışan Bilgileri" sayılmaz).
 * 0 ise route boş Word üretmez. Belgeyi oluşturmaz; buildClientFullReport ile AYNI seçim/ayıklama kuralı.
 */
export function countClientReportSections(input: ClientFullInput, ctx: ClientReportCtx = {}): number {
  return withText(ctx, () => buildClientBody(input, ctx, {}).sectionCount);
}

export function buildClientFullReport(input: ClientFullInput, ctx: ClientReportCtx = {}): ClientReportResult {
  return withText(ctx, () => buildClientFullReportImpl(input, ctx));
}

function buildClientFullReportImpl(input: ClientFullInput, ctx: ClientReportCtx): ClientReportResult {
  const { today, dateSlug } = reportDates(ctx);
  const body = buildClientBody(input, ctx, {});
  body.all.push(...wellnessBlock(ctx.expertName, ctx));
  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: X.t("full.title"),
    reportSubtitle: X.t("full.subtitle", { variant: variantLabel(ctx) }),
    clientName: body.fullName,
    dateLabel: today,
    expertName: ctx.expertName,
    branding: ctx.branding,
    brandingVariant: ctx.brandingVariant,
    text: X,
  });
  const doc = buildDocument(cover, body.all, X.t("full.footer", { name: body.fullName }), X.t("full.docTitle", { name: body.fullName }), ctx);
  return { doc, filename: `${X.t("full.file")}-${body.nameSlug}-${dateSlug}.docx` };
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
): ClientReportResult & { empty: boolean } {
  return withText(ctx, () => buildClientDateRangeReportImpl(input, ctx));
}

function buildClientDateRangeReportImpl(
  input: Parameters<typeof buildClientDateRangeReport>[0],
  ctx: ClientReportCtx,
): ClientReportResult & { empty: boolean } {
  const { today } = reportDates(ctx);
  const startFmt = X.dateLong(input.drStart, input.drStart);
  const endFmt = X.dateLong(input.drEnd, input.drEnd);
  // Tarih aralığında HD/Numeroloji (tarihsiz bütünsel bölümler) yer almaz.
  const sections = (ctx.sections ?? DEFAULT_FULL_SECTIONS).filter((s) => s !== "humanDesign" && s !== "numeroloji");
  const body = buildClientBody(
    { data: input.data, profileImg: input.profileImg, analysisImages: input.analysisImages },
    { ...ctx, sections },
    { scopeNote: X.t("range.scopeNote", { start: startFmt, end: endFmt }) },
  );
  if (body.sectionCount === 0) body.all.push(dyNote(X.t("range.empty")));
  body.all.push(...wellnessBlock(ctx.expertName, ctx));
  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: X.t("range.title"),
    reportSubtitle: X.t("range.subtitle"),
    clientName: body.fullName,
    dateLabel: today,
    expertName: ctx.expertName,
    branding: ctx.branding,
    brandingVariant: ctx.brandingVariant,
    meta: [[X.t("range.meta"), `${startFmt} — ${endFmt}`]],
    text: X,
  });
  const doc = buildDocument(cover, body.all, X.t("range.footer", { name: body.fullName }), X.t("range.docTitle", { name: body.fullName }), ctx);
  // DY-04: aralıkta gerçek kayıt yoksa `empty` (route boş Word üretmez).
  return { doc, filename: `${X.t("range.file")}-${body.nameSlug}-${input.drStart}-${input.drEnd}.docx`, empty: body.sectionCount === 0 };
}

/**
 * WT7 — TOPLU danışan dosyası: seçili danışanların HER BİRİ için tekli raporun AYNI gövdesi
 * (aynı kod yolu). Yapı: kapak + danışan dizini → her danışan yeni sayfada "DANIŞAN i / N"
 * → bilgilendirme notu bir kez. Analiz yatay sayfaları danışan bazında doğru konuma yerleşir.
 */
export function buildClientsBulkFullReport(items: ClientFullInput[], ctx: ClientReportCtx = {}): ClientReportResult {
  return withText(ctx, () => buildClientsBulkFullReportImpl(items, ctx));
}

function buildClientsBulkFullReportImpl(items: ClientFullInput[], ctx: ClientReportCtx): ClientReportResult {
  const { today, dateSlug } = reportDates(ctx);
  const total = items.length;
  const all: ReportChild[] = [];

  all.push(dySectionTitle(X.t("bulk.indexHeading"), C.danisan));
  all.push(dyNote(X.count("bulk.indexNote", total)));
  all.push(dyDataTable(
    [{ header: X.t("bulk.colNo"), pct: 10, align: "center" }, { header: X.t("bulk.colClient"), pct: 60 }, { header: X.t("bulk.colBirth"), pct: 30 }],
    items.map((it, i) => [String(i + 1).padStart(3, "0"), clientNames(it.data.client).fullName, dateTR(it.data.client.dogum) || "—"]),
  ));

  items.forEach((it, i) => {
    all.push(...buildClientBody(it, ctx, { badge: X.t("bulk.badge", { index: String(i + 1), total: String(total) }), pageBreakBefore: true }).all);
  });

  all.push(...wellnessBlock(ctx.expertName, ctx));
  const cover = dyCover({
    logo: ctx.logo ?? null,
    reportTitle: X.t("bulk.title"),
    reportSubtitle: X.t("bulk.subtitle"),
    clientName: X.count("bulk.clients", total),
    dateLabel: today,
    expertName: ctx.expertName,
    branding: ctx.branding,
    brandingVariant: ctx.brandingVariant,
    text: X,
  });
  const doc = buildDocument(cover, all, X.t("bulk.footer"), X.t("bulk.docTitle"), ctx);
  return { doc, filename: `${X.t("bulk.file", { total: String(total) })}-${dateSlug}.docx` };
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
