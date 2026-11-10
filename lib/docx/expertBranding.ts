/**
 * Uzman rapor markalaması (F3A) — Word raporları için ORTAK, SAF çizim katmanı.
 *
 * Veri kaynağından BAĞIMSIZDIR: uzman profili (expert_profiles, F1) ve logo (F2) bu modüle
 * `normalizeExpertBranding()` üzerinden, doğrulanmış/render-hazır `ExpertBranding` olarak gelir.
 * Bu modül DB / ağ / dosya okumaz; yalnız docx öğeleri üretir.
 *
 * Kurallar (owner):
 *   - `branding` null / tüm alanlar boş → yardımcılar HİÇBİR öğe üretmez (rapor bugünküyle birebir).
 *   - Yaşam Sistemi logosu/kimliği kaldırılmaz; uzman logosu her zaman İKİNCİL (küçük) yerleşir.
 *   - Uzmanın dipnotu mevcut bilgilendirme/uyarı metinlerinin yerine GEÇMEZ; ek satır olarak gelir.
 *   - Metinler XML 1.0 güvenli temizlenir (kontrol karakteri / yalnız kalmış vekil karakter);
 *     uzunluk KIRPILMAZ (Word satırı kendisi kırar); Türkçe ve tüm normal Unicode korunur.
 *     docx metni XML-escape eder → `<script>`, `&` vb. düz metin olarak görünür.
 *
 * Tasarım varyantları (Owner örnek seçimi için; ÜRETİMDE tek varsayılan kullanılır):
 *   A "Kurumsal Premium" — kapakta düzenli uzman kimlik bloğu (küçük logo + ad + unvan + kurum + iletişim).
 *   B "Uzman İmzalı"     — kapakta kompakt ad · unvan / kurum; rapor sonunda küçük logolu imza kartı.
 *   C "Minimal"          — kapakta yalnız ad — unvan (logo varsa küçük); rapor sonunda tek satır; alt bilgi yok.
 */

import {
  AlignmentType,
  BorderStyle,
  ImageRun,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { C_DARK, C_LIGHT, C_MID, sanitizeXmlText, type ReportChild } from "./reportHelpers";

// ─── Tipler ──────────────────────────────────────────────────────────────────

/** Render-hazır PNG logo (sunucuda doğrulanmış / dönüştürülmüş). Boyut piksel cinsindendir. */
export type ExpertBrandingLogo = { data: Buffer; width: number; height: number };

/** Doğrulanmış, render-hazır uzman markalaması. Tüm alanlar isteğe bağlıdır. */
export type ExpertBranding = {
  name?: string | null;
  title?: string | null;
  organization?: string | null;
  /** Telefon / e-posta / web sitesi — tek satır ("·" ile ayrılmış). */
  contactLine?: string | null;
  /** Uzmanın rapor dipnotu (çok satırlı olabilir). Bilgilendirme metninin YERİNE GEÇMEZ. */
  note?: string | null;
  logoPng?: ExpertBrandingLogo | null;
};

/** Tasarım varyantı: A Kurumsal Premium · B Uzman İmzalı · C Minimal. */
export type ExpertBrandingVariant = "A" | "B" | "C";

export const EXPERT_BRANDING_VARIANT_LABELS: Record<ExpertBrandingVariant, string> = {
  A: "Kurumsal Premium",
  B: "Uzman İmzalı",
  C: "Minimal",
};

/**
 * ÜRETİM varsayılanı: B "Uzman İmzalı".
 * Gerekçe: kapakta yalnız kompakt bir kimlik satırı ekler → Yaşam Sistemi logosu ve mevcut premium
 * kapak hiyerarşisi bozulmaz, tek sayfalık kapak taşma riski en düşüktür; uzman logosu ve iletişim
 * bilgisi rapor sonundaki imza kartında İKİNCİL konumda yer alır; kurum adı her sayfanın alt bilgisinde
 * küçük punto görünür. A kapağı kalabalıklaştırır (uzun kurum adı + logo + iletişim), C ise
 * kurum/iletişim göstermediği için markalama beklentisini zayıf karşılar.
 */
export const DEFAULT_EXPERT_BRANDING_VARIANT: ExpertBrandingVariant = "B";

// ─── Metin temizliği ─────────────────────────────────────────────────────────

// Yalnız kalmış UTF-16 vekil karakterleri XML'de geçersizdir (emoji çiftleri KORUNUR).
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function xmlClean(v: unknown): string {
  if (typeof v !== "string") return "";
  return sanitizeXmlText(v).replace(LONE_SURROGATE, "");
}

/** Tek satırlık alan: XML-güvenli, iç boşluklar tek boşluğa indirgenir. Kırpma YOK. */
export function brandingLine(v: unknown): string {
  return xmlClean(v).replace(/\s+/g, " ").trim();
}

/** Çok satırlı alan (dipnot): satır sonları korunur, satır içi boşluklar sadeleşir, 3+ boş satır → 1. */
export function brandingMultiline(v: unknown): string {
  return xmlClean(v)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** PNG imzası + IHDR boyutu. Geçersizse null. */
export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => buf[i] === b)) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// ─── Normalize (F1/F2 giriş noktası) ─────────────────────────────────────────

/** Ham profil alanları (F1 `expert_profiles` + F2 logo PNG'si). Görünürlük süzmesi çağıranda yapılır. */
export type ExpertBrandingInput = {
  name?: unknown;
  title?: unknown;
  organization?: unknown;
  phone?: unknown;
  email?: unknown;
  website?: unknown;
  /** Hazır iletişim satırı (phone/email/website yerine). */
  contactLine?: unknown;
  note?: unknown;
  /** PNG bayt dizisi (F2: WebP → sharp → PNG). PNG değilse yok sayılır. */
  logoPng?: Buffer | ExpertBrandingLogo | null;
};

/**
 * Ham girdiyi render-hazır `ExpertBranding`'e çevirir. Hiçbir gösterilebilir alan yoksa `null`.
 * Çağıran (F1/F2 bağlantısı) `report_branding_enabled` kapalıysa bu fonksiyonu çağırmadan `null` geçer.
 */
export function normalizeExpertBranding(input: ExpertBrandingInput | null | undefined): ExpertBranding | null {
  if (!input || typeof input !== "object") return null;
  const name = brandingLine(input.name);
  const title = brandingLine(input.title);
  const organization = brandingLine(input.organization);
  const contactLine = brandingLine(input.contactLine)
    || [input.phone, input.email, input.website].map(brandingLine).filter(Boolean).join(" · ");
  const note = brandingMultiline(input.note);
  let logoPng: ExpertBrandingLogo | null = null;
  const raw = input.logoPng;
  const data = Buffer.isBuffer(raw) ? raw : raw && typeof raw === "object" && Buffer.isBuffer(raw.data) ? raw.data : null;
  if (data) {
    const size = readPngSize(data);
    if (size) logoPng = { data, width: size.width, height: size.height };
  }
  const out: ExpertBranding = {};
  if (name) out.name = name;
  if (title) out.title = title;
  if (organization) out.organization = organization;
  if (contactLine) out.contactLine = contactLine;
  if (note) out.note = note;
  if (logoPng) out.logoPng = logoPng;
  return Object.keys(out).length ? out : null;
}

/** Render katmanı için savunmacı yeniden temizlik (idempotent). */
function resolved(b: ExpertBranding | null | undefined): Required<{ [K in keyof ExpertBranding]: NonNullable<ExpertBranding[K]> | null }> | null {
  if (!b) return null;
  const n = normalizeExpertBranding({
    name: b.name, title: b.title, organization: b.organization, contactLine: b.contactLine, note: b.note, logoPng: b.logoPng ?? null,
  });
  if (!n) return null;
  return {
    name: n.name ?? null,
    title: n.title ?? null,
    organization: n.organization ?? null,
    contactLine: n.contactLine ?? null,
    note: n.note ?? null,
    logoPng: n.logoPng ?? null,
  };
}

/** Markalama gösterilebilir bir alan taşıyor mu? */
export function hasExpertBranding(b: ExpertBranding | null | undefined): boolean {
  return resolved(b) !== null;
}

// ─── Ortak tipografi ─────────────────────────────────────────────────────────

const SZ = { label: 16, name: 24, nameCover: 26, line: 20, small: 17, note: 17 } as const;

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

type RunOpts = { size: number; color: string; bold?: boolean; italics?: boolean; allCaps?: boolean; spacing?: number; brk?: boolean; font?: string };
function run(text: string, o: RunOpts): TextRun {
  // Yazı tipi belirtilmez → belgenin varsayılan yazı tipini (modülün kendi tipografisi) devralır.
  // F3B: varsayılan stil tanımlamayan belgeler (Refleksoloji / Kupa / Hacamat) modül yazı tipini `font` ile verir.
  return new TextRun({
    text,
    ...(o.font ? { font: o.font } : {}),
    size: o.size,
    color: o.color,
    bold: o.bold,
    italics: o.italics,
    allCaps: o.allCaps,
    characterSpacing: o.spacing,
    break: o.brk ? 1 : undefined,
  });
}

function multilineRuns(text: string, o: { size: number; color: string; italics?: boolean; font?: string }): TextRun[] {
  return text.split("\n").map((line, i) => run(line, { ...o, brk: i > 0 }));
}

function para(children: (TextRun | ImageRun)[], o: { align?: Align; before?: number; after?: number; keepNext?: boolean; keepLines?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: o.align,
    spacing: { before: o.before ?? 0, after: o.after ?? 0 },
    keepNext: o.keepNext,
    keepLines: o.keepLines ?? true,
    children,
  });
}

// ─── Logo ────────────────────────────────────────────────────────────────────

/** Oranı koruyarak max kutuya sığdırır; asla büyütmez. */
export function fitLogo(logo: ExpertBrandingLogo, maxW: number, maxH: number): { width: number; height: number } {
  const scale = Math.min(1, maxW / logo.width, maxH / logo.height);
  return { width: Math.max(1, Math.round(logo.width * scale)), height: Math.max(1, Math.round(logo.height * scale)) };
}

function logoRun(logo: ExpertBrandingLogo, maxW: number, maxH: number): ImageRun {
  return new ImageRun({ type: "png", data: logo.data, transformation: fitLogo(logo, maxW, maxH) });
}

/** Uzman logosu paragrafı (ikincil boyut). Logo yoksa null. */
export function expertLogoParagraph(
  b: ExpertBranding | null | undefined,
  o: { maxWidth?: number; maxHeight?: number; align?: Align; before?: number; after?: number; keepNext?: boolean } = {},
): Paragraph | null {
  const r = resolved(b);
  if (!r?.logoPng) return null;
  return para([logoRun(r.logoPng, o.maxWidth ?? 140, o.maxHeight ?? 56)], {
    align: o.align ?? AlignmentType.CENTER,
    before: o.before ?? 0,
    after: o.after ?? 80,
    keepNext: o.keepNext ?? true,
  });
}

// ─── Kapak: uzman kimlik bloğu ───────────────────────────────────────────────

export type ExpertCoverOptions = {
  variant?: ExpertBrandingVariant;
  /** Modülün vurgu rengi (etiket/çizgi). */
  accent?: string;
  /** İnce ayırıcı çizgi rengi. */
  ruleColor?: string;
  /** Profil adı yoksa kullanılacak ad (ör. mevcut "Uzman" satırının değeri). */
  fallbackName?: string | null;
  /** Ad gösterilmesin (HD: profil adı otomatik yazılmaz). */
  omitName?: boolean;
  before?: number;
  after?: number;
};

/** Satır tanımı → paragraf; zincirdeki son satır hariç keepNext (blok bölünmez). */
type LineSpec = { runs: (TextRun | ImageRun)[]; align?: Align; before?: number; after?: number };
function chained(lines: LineSpec[], keepLast = false): Paragraph[] {
  return lines.map((l, i) => para(l.runs, { align: l.align, before: l.before, after: l.after, keepNext: keepLast || i < lines.length - 1 }));
}

/**
 * Kapak sayfası için uzman kimlik bloğu (ortalanmış). Gösterilecek alan yoksa [].
 * A: etiket + küçük logo + ad + unvan + kurum + iletişim · B: ad · unvan + kurum · C: (küçük logo) + ad — unvan.
 */
export function expertCoverBlock(b: ExpertBranding | null | undefined, o: ExpertCoverOptions = {}): ReportChild[] {
  const r = resolved(b);
  if (!r) return [];
  const variant = o.variant ?? DEFAULT_EXPERT_BRANDING_VARIANT;
  const accent = o.accent ?? C_MID;
  const ruleColor = o.ruleColor ?? "e2e8f0";
  const name = o.omitName ? "" : r.name ?? brandingLine(o.fallbackName);
  const center = AlignmentType.CENTER;
  const lines: LineSpec[] = [];

  if (variant === "A") {
    if (!name && !r.title && !r.organization && !r.contactLine && !r.logoPng) return [];
    lines.push({ runs: [run("Hazırlayan Uzman", { size: SZ.label, color: accent, bold: true, allCaps: true, spacing: 30 })], after: 100 });
    if (r.logoPng) lines.push({ runs: [logoRun(r.logoPng, 150, 60)], after: 100 });
    if (name) lines.push({ runs: [run(name, { size: SZ.nameCover, color: C_DARK, bold: true })], after: 40 });
    if (r.title) lines.push({ runs: [run(r.title, { size: SZ.line, color: C_MID })], after: 40 });
    if (r.organization) lines.push({ runs: [run(r.organization, { size: SZ.line, color: C_MID, bold: true })], after: 40 });
    if (r.contactLine) lines.push({ runs: [run(r.contactLine, { size: SZ.small, color: C_LIGHT })], after: 0 });
  } else if (variant === "B") {
    if (!name && !r.title && !r.organization) return [];
    const top: TextRun[] = [];
    if (name) top.push(run(name, { size: SZ.name, color: C_DARK, bold: true }));
    if (r.title) top.push(run(name ? `  ·  ${r.title}` : r.title, { size: SZ.line, color: C_MID }));
    if (top.length) lines.push({ runs: top, after: r.organization ? 40 : 0 });
    if (r.organization) lines.push({ runs: [run(r.organization, { size: SZ.small, color: C_MID })], after: 0 });
  } else {
    if (!name && !r.title) return [];
    // C: logo isteğe bağlı — varsa ad satırının üstünde küçük.
    if (r.logoPng) lines.push({ runs: [logoRun(r.logoPng, 110, 40)], after: 60 });
    lines.push({ runs: [run([name, r.title].filter(Boolean).join(" — "), { size: SZ.line, color: C_MID })], after: 0 });
  }
  for (const l of lines) l.align = center;

  const out: ReportChild[] = [];
  if (variant === "A") {
    out.push(new Paragraph({ spacing: { before: o.before ?? 240, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ruleColor } }, keepNext: true }));
    out.push(...chained(lines, true));
    out.push(new Paragraph({ spacing: { before: 0, after: o.after ?? 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ruleColor, space: 8 } } }));
  } else {
    out.push(new Paragraph({ spacing: { before: o.before ?? 200, after: 0 }, keepNext: true }));
    out.push(...chained(lines));
    if (o.after) out.push(new Paragraph({ spacing: { before: 0, after: o.after } }));
  }
  return out;
}

// ─── Rapor sonu: "Hazırlayan" (genişletilmiş) ────────────────────────────────

export type ExpertSignatureOptions = {
  variant?: ExpertBrandingVariant;
  accent?: string;
  /** Profil adı yoksa kullanılacak ad (mevcut "Hazırlayan: …" değeri). */
  fallbackName?: string | null;
  /** Ad gösterilmesin (HD). */
  omitName?: boolean;
  /** Kart genişliği (twip) — sayfanın basılabilir genişliği. */
  contentWidth?: number;
  /** Kart dolgu rengi (B). */
  fill?: string;
  /** Etiket metni (varsayılan "Hazırlayan"). */
  label?: string;
  /**
   * F3B: metin yazı tipi. Verilmezse belge varsayılanı devralınır (Kademe A — birebir aynı). Varsayılan stil tanımlamayan
   * belgeler (Refleksoloji / Kupa / Hacamat) modülün kendi yazı tipini verir.
   */
  font?: string;
};

function noteParagraphs(note: string, o: { before: number; font?: string }): Paragraph[] {
  return [
    para([run("Uzman Notu", { size: SZ.label, color: C_MID, bold: true, font: o.font })], { before: o.before, after: 40, keepNext: true }),
    para(multilineRuns(note, { size: SZ.note, color: C_MID, italics: true, font: o.font }), { after: 60 }),
  ];
}

/**
 * Bilgilendirme notunun ARDINDAN gelen genişletilmiş "Hazırlayan" bloğu (+ uzman dipnotu).
 * Bilgilendirme metnine dokunmaz. Gösterilecek alan yoksa [].
 * A: metin satırları (ad, unvan · kurum, iletişim) · B: küçük logolu imza kartı · C: tek satır.
 */
export function expertSignatureBlock(b: ExpertBranding | null | undefined, o: ExpertSignatureOptions = {}): ReportChild[] {
  const r = resolved(b);
  if (!r) return [];
  const variant = o.variant ?? DEFAULT_EXPERT_BRANDING_VARIANT;
  const accent = o.accent ?? C_MID;
  const label = o.label ?? "Hazırlayan";
  const name = o.omitName ? "" : r.name ?? brandingLine(o.fallbackName);
  const credential = [r.title, r.organization].filter(Boolean).join(" · ");
  const font = o.font;
  const frun = (text: string, ro: RunOpts): TextRun => run(text, { ...ro, font });
  const out: ReportChild[] = [];

  if (variant === "B" && (name || credential || r.contactLine || r.logoPng)) {
    const W = Math.max(3000, Math.round(o.contentWidth ?? 9638));
    const logoW = r.logoPng ? Math.round(W * 0.22) : 0;
    const textW = W - logoW;
    const text: Paragraph[] = [
      para([frun(label, { size: SZ.label, color: accent, bold: true, allCaps: true, spacing: 30 })], { after: 80 }),
    ];
    if (name) text.push(para([frun(name, { size: SZ.name, color: C_DARK, bold: true })], { after: 30 }));
    if (r.title) text.push(para([frun(r.title, { size: SZ.line, color: C_MID })], { after: 20 }));
    if (r.organization) text.push(para([frun(r.organization, { size: SZ.line, color: C_MID, bold: true })], { after: 20 }));
    if (r.contactLine) text.push(para([frun(r.contactLine, { size: SZ.small, color: C_LIGHT })], { after: 0 }));
    // İmza alanı: ince çizgi + "İmza" etiketi.
    text.push(
      new Paragraph({ spacing: { before: 300, after: 0 }, indent: { right: Math.round(textW * 0.45) }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "cbd5e1" } }, children: [frun(" ", { size: 16, color: C_LIGHT })] }),
      para([frun("İmza", { size: 15, color: C_LIGHT })], { before: 30, after: 0 }),
    );
    const none = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
    const top = { style: BorderStyle.SINGLE, size: 18, color: accent } as const;
    const cells: TableCell[] = [];
    if (r.logoPng) {
      cells.push(new TableCell({
        width: { size: logoW, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 160, bottom: 160, left: 160, right: 80 },
        borders: { top, bottom: none, left: none, right: none },
        shading: o.fill ? { fill: o.fill, color: "auto" } : undefined,
        children: [para([logoRun(r.logoPng, 110, 70)], { align: AlignmentType.CENTER })],
      }));
    }
    cells.push(new TableCell({
      width: { size: textW, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 160, bottom: 160, left: 200, right: 200 },
      borders: { top, bottom: none, left: none, right: none },
      shading: o.fill ? { fill: o.fill, color: "auto" } : undefined,
      children: text,
    }));
    out.push(new Paragraph({ spacing: { before: 240, after: 0 }, keepNext: true }));
    out.push(new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: r.logoPng ? [logoW, textW] : [textW],
      layout: TableLayoutType.FIXED,
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: [new TableRow({ cantSplit: true, children: cells })],
    }));
    if (r.note) out.push(...noteParagraphs(r.note, { before: 160, font }));
    return out;
  }

  if (variant === "A" && (name || credential || r.contactLine)) {
    const lines: LineSpec[] = [
      name
        ? { runs: [frun(`${label}: `, { size: SZ.small, color: C_MID }), frun(name, { size: SZ.small + 1, color: C_DARK, bold: true })], before: 60, after: 20 }
        : { runs: [frun(label, { size: SZ.small, color: C_MID, bold: true })], before: 60, after: 20 },
    ];
    if (credential) lines.push({ runs: [frun(credential, { size: SZ.small, color: C_MID })], after: 20 });
    if (r.contactLine) lines.push({ runs: [frun(r.contactLine, { size: SZ.small - 1, color: C_LIGHT })], after: 40 });
    out.push(...chained(lines, !!r.note));
    if (r.note) out.push(...noteParagraphs(r.note, { before: 120, font }));
    return out;
  }

  if (variant === "C" && (name || r.title)) {
    const t = [name, r.title].filter(Boolean).join(" — ");
    out.push(para([frun(`${label}: ${t}`, { size: 16, color: C_MID })], { before: 0, after: 60, keepNext: !!r.note }));
    if (r.note) out.push(...noteParagraphs(r.note, { before: 80, font }));
    return out;
  }

  // Yalnız dipnot (ya da varyantın göstermediği alanlar) → yalnız dipnot.
  if (r.note) out.push(...noteParagraphs(r.note, { before: 120, font }));
  return out;
}

// ─── Alt bilgi: kurum satırı ─────────────────────────────────────────────────

/**
 * Alt bilgiye eklenecek küçük kurum satırı (A ve B). Kurum yoksa ad · unvan. C → null.
 * Çağıran footer'ın sayfa numarası satırından ÖNCE yerleştirir.
 */
export function expertFooterParagraph(
  b: ExpertBranding | null | undefined,
  o: { variant?: ExpertBrandingVariant; color?: string; size?: number; omitName?: boolean; align?: Align } = {},
): Paragraph | null {
  const r = resolved(b);
  if (!r) return null;
  const variant = o.variant ?? DEFAULT_EXPERT_BRANDING_VARIANT;
  if (variant === "C") return null;
  const name = o.omitName ? "" : r.name ?? "";
  const text = r.organization ?? [name, r.title].filter(Boolean).join(" · ");
  if (!text) return null;
  return new Paragraph({
    alignment: o.align ?? AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [run(text, { size: o.size ?? 15, color: o.color ?? C_LIGHT })],
  });
}

/**
 * Kart/tablo içinde kullanılmak üzere unvan + kurum satırları (HD imza kartı vb.). Boşsa [].
 */
export function expertCredentialLines(
  b: ExpertBranding | null | undefined,
  o: { titleSize?: number; orgSize?: number; color?: string; after?: number } = {},
): Paragraph[] {
  const r = resolved(b);
  if (!r) return [];
  const out: Paragraph[] = [];
  if (r.title) out.push(para([run(r.title, { size: o.titleSize ?? SZ.line, color: o.color ?? C_MID })], { after: 20 }));
  if (r.organization) out.push(para([run(r.organization, { size: o.orgSize ?? SZ.line, color: o.color ?? C_MID, bold: true })], { after: o.after ?? 60 }));
  return out;
}

/** Ham alanlar (tablo satırı vb. için). Boş alanlar null. */
export function expertBrandingFields(b: ExpertBranding | null | undefined): {
  name: string | null; title: string | null; organization: string | null; contactLine: string | null; note: string | null; logoPng: ExpertBrandingLogo | null;
} | null {
  return resolved(b);
}
