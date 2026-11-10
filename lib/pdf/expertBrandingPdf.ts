/**
 * F3B — Uzman rapor markalaması: jsPDF raporları için ORTAK, SAF çizim yardımcısı.
 *
 * Word tarafındaki `expertSignatureBlock` (lib/docx/expertBranding.ts, üretim varyantı B "Uzman İmzalı") ile AYNI veriden ve
 * AYNI kurallarla PDF'e "Hazırlayan" imza kartı + uzman dipnotu çizer. Gökyüzü Atlası PDF'i ve Hacamat PDF'i bu yardımcıyı
 * kullanır → Word ↔ PDF aynı ad / unvan / kurum / iletişim / dipnot / logo; eksik alanlarda aynı davranış:
 *   - branding null / gösterilecek alan yok → HİÇBİR ŞEY çizilmez (PDF bugünküyle birebir).
 *   - Yalnız dipnot varsa → yalnız "Uzman Notu" bölümü (Word ile aynı).
 *   - Ad: `omitName` değilse profil adı, yoksa `fallbackName` (Hacamat: formdaki serbest "Hazırlayan" adı).
 *
 * DB / ağ / dosya okumaz. Yazı tipi çağıranın belgeye gömdüğü Türkçe destekli TTF'tir (Geist). Gömülü yazı tipinde glifi
 * olmayan karakterler (emoji vb.) PDF'te boş kutu yerine atlanır (`pdfSafeText`); Word metni değişmez.
 */
import type { jsPDF } from "jspdf";
import { fitLogo, hasExpertBranding, expertBrandingFields, type ExpertBranding } from "@/lib/docx/expertBranding";

export type Rgb = [number, number, number];

/** Çağıranın sayfa imleci: `y` (mm) + yer yoksa yeni sayfa açan `ensure`. */
export type PdfCursor = { y: number; ensure: (heightMm: number) => void };

export type ExpertSignaturePdfOptions = {
  /** Belgeye kayıtlı yazı tipi ailesi (ör. "Geist"); çizimden sonra bu aileye dönülür. */
  font: string;
  /** Kartın sol kenarı ve genişliği (mm). */
  x: number;
  width: number;
  /** Modülün vurgu rengi (üst çizgi + etiket). */
  accent: Rgb;
  ink?: Rgb;
  mid?: Rgb;
  light?: Rgb;
  /** Kart zemini (varsayılan çok açık gri). */
  fill?: Rgb | null;
  /** Profil adı yoksa kullanılacak ad (Hacamat: formdaki "Hazırlayan"). */
  fallbackName?: string | null;
  omitName?: boolean;
  /** Etiket (varsayılan "Hazırlayan"). */
  label?: string;
  /** Kart öncesi boşluk (mm). */
  before?: number;
};

const LH = 0.42; // punto × LH = satır yüksekliği (mm) — Atlas / Hacamat PDF'leriyle aynı
const DEF_INK: Rgb = [30, 41, 59];
const DEF_MID: Rgb = [71, 85, 105];
const DEF_LIGHT: Rgb = [148, 163, 184];
const DEF_FILL: Rgb = [248, 250, 252];
const SZ = { label: 7, name: 11.5, line: 9, small: 7.8, sig: 6.6, noteHead: 7.6, note: 8.2 } as const;

/**
 * Gömülü yazı tipinde karşılığı olmayan karakterleri atar (emoji, değişken seçici, ZWJ…). Türkçe ve Latin-1/Latin Genişletilmiş
 * harfler, noktalama ve yaygın semboller korunur. Word tarafı bu süzmeyi YAPMAZ (Word yedek yazı tipiyle gösterir).
 */
export function pdfSafeText(s: string): string {
  return Array.from(s)
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp > 0xffff) return false; // emoji / astral düzlem
      if (cp >= 0xfe00 && cp <= 0xfe0f) return false; // değişken seçiciler
      if (cp === 0x200d) return false; // ZWJ
      if (cp >= 0x2600 && cp <= 0x27bf) return false; // çeşitli semboller / dingbat (emoji sunumu)
      return true;
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ");
}

type Fields = NonNullable<ReturnType<typeof expertBrandingFields>>;

function resolvedFields(b: ExpertBranding | null | undefined): Fields | null {
  if (!hasExpertBranding(b)) return null;
  return expertBrandingFields(b);
}

/** Kartta gösterilecek ad (Word `expertSignatureBlock` ile aynı kural). */
function cardName(f: Fields, o: ExpertSignaturePdfOptions): string {
  if (o.omitName) return "";
  const n = f.name ?? (typeof o.fallbackName === "string" ? o.fallbackName.replace(/\s+/g, " ").trim() : "");
  return n;
}

type Line = { text: string; size: number; color: Rgb; gapAfter: number };

function wrap(doc: jsPDF, text: string, size: number, width: number): string[] {
  doc.setFontSize(size);
  const safe = pdfSafeText(text);
  if (!safe.trim()) return [];
  return doc.splitTextToSize(safe, width) as string[];
}

/** Kartın metin satırları (sarılmış) — ölçüm ve çizim aynı listeyi kullanır. */
function cardLines(doc: jsPDF, f: Fields, o: ExpertSignaturePdfOptions, textW: number): Line[] {
  const ink = o.ink ?? DEF_INK;
  const mid = o.mid ?? DEF_MID;
  const light = o.light ?? DEF_LIGHT;
  const out: Line[] = [];
  const push = (text: string | null, size: number, color: Rgb, gapAfter: number) => {
    if (!text) return;
    const ls = wrap(doc, text, size, textW);
    ls.forEach((t, i) => out.push({ text: t, size, color, gapAfter: i === ls.length - 1 ? gapAfter : 0 }));
  };
  push(cardName(f, o) || null, SZ.name, ink, 0.8);
  push(f.title, SZ.line, mid, 0.5);
  push(f.organization, SZ.line, mid, 0.5);
  push(f.contactLine, SZ.small, light, 0);
  return out;
}

const linesHeight = (ls: Line[]) => ls.reduce((h, l) => h + l.size * LH + l.gapAfter, 0);

/**
 * Rapor sonuna "Hazırlayan" imza kartı (+ uzman dipnotu) çizer ve imleci ilerletir. Gösterilecek alan yoksa hiçbir şey
 * çizmez ve `false` döner. Kart bölünmez (sığmazsa `cursor.ensure` yeni sayfa açar); dipnot satır satır akar.
 */
export function drawExpertSignaturePdf(doc: jsPDF, branding: ExpertBranding | null | undefined, cursor: PdfCursor, o: ExpertSignaturePdfOptions): boolean {
  const f = resolvedFields(branding);
  if (!f) return false;
  const mid = o.mid ?? DEF_MID;
  const light = o.light ?? DEF_LIGHT;
  const fill = o.fill === undefined ? DEF_FILL : o.fill;
  doc.setFont(o.font, "normal");

  const name = cardName(f, o);
  const hasCard = !!(name || f.title || f.organization || f.contactLine || f.logoPng);
  if (hasCard) {
    const pad = 4;
    const logoColW = f.logoPng ? 30 : 0;
    const textX = o.x + logoColW + pad;
    const textW = Math.max(30, o.width - logoColW - pad * 2);
    const label = pdfSafeText(o.label ?? "Hazırlayan").toLocaleUpperCase("tr-TR");
    const lines = cardLines(doc, f, o, textW);
    const labelH = SZ.label * LH + 1.6;
    const sigH = 7 + SZ.sig * LH;
    const textH = labelH + linesHeight(lines) + sigH;
    const logo = f.logoPng ? fitLogo(f.logoPng, 24 * 10, 18 * 10) : null; // 0,1 mm birimiyle oran korunur
    const logoW = logo ? logo.width / 10 : 0;
    const logoH = logo ? logo.height / 10 : 0;
    const cardH = Math.max(textH, logoH) + pad * 2;

    cursor.y += o.before ?? 6;
    cursor.ensure(cardH + 1);
    const top = cursor.y;
    if (fill) {
      doc.setFillColor(...fill);
      doc.rect(o.x, top, o.width, cardH, "F");
    }
    doc.setDrawColor(...o.accent);
    doc.setLineWidth(0.8);
    doc.line(o.x, top, o.x + o.width, top);

    if (f.logoPng && logo) {
      const lx = o.x + pad + (logoColW - pad - logoW) / 2;
      const ly = top + (cardH - logoH) / 2;
      doc.addImage(new Uint8Array(f.logoPng.data), "PNG", lx, ly, logoW, logoH, undefined, "FAST");
    }

    let ty = top + pad + (cardH - pad * 2 - textH) / 2;
    doc.setFontSize(SZ.label);
    doc.setTextColor(...o.accent);
    doc.text(label, textX, ty + SZ.label * LH * 0.8);
    ty += labelH;
    for (const l of lines) {
      doc.setFontSize(l.size);
      doc.setTextColor(...l.color);
      doc.text(l.text, textX, ty + l.size * LH * 0.8);
      ty += l.size * LH + l.gapAfter;
    }
    // İmza alanı: ince çizgi + "İmza" etiketi (Word kartıyla aynı).
    ty += 6;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(textX, ty, textX + textW * 0.55, ty);
    doc.setFontSize(SZ.sig);
    doc.setTextColor(...light);
    doc.text("İmza", textX, ty + 1 + SZ.sig * LH * 0.8);
    cursor.y = top + cardH;
  }

  if (f.note) {
    const noteLines = f.note.split("\n").flatMap((p) => (p.trim() ? wrap(doc, p, SZ.note, o.width) : [" "]));
    const lh = SZ.note * LH + 0.6;
    cursor.y += hasCard ? 4 : (o.before ?? 6);
    cursor.ensure(SZ.noteHead * LH + 1.5 + lh * Math.min(2, noteLines.length));
    doc.setFontSize(SZ.noteHead);
    doc.setTextColor(...mid);
    doc.text("Uzman Notu", o.x, cursor.y + SZ.noteHead * LH * 0.8);
    cursor.y += SZ.noteHead * LH + 1.5;
    for (const l of noteLines) {
      cursor.ensure(lh);
      doc.setFontSize(SZ.note);
      doc.setTextColor(...mid);
      doc.text(l, o.x, cursor.y + SZ.note * LH * 0.8);
      cursor.y += lh;
    }
  }
  doc.setFont(o.font, "normal");
  return true;
}

/**
 * Word ↔ PDF tutarlılık testleri için: PDF'e yazılacak markalama metinleri (sarılmadan önce, `pdfSafeText` uygulanmış).
 * Gösterilecek alan yoksa null.
 */
export function expertSignaturePdfTexts(branding: ExpertBranding | null | undefined, o: Pick<ExpertSignaturePdfOptions, "fallbackName" | "omitName">): {
  name: string | null; title: string | null; organization: string | null; contactLine: string | null; note: string | null; hasLogo: boolean;
} | null {
  const f = resolvedFields(branding);
  if (!f) return null;
  const name = cardName(f, { ...o, font: "", x: 0, width: 0, accent: [0, 0, 0] });
  const safe = (v: string | null) => (v ? pdfSafeText(v) : null);
  return { name: safe(name || null), title: safe(f.title), organization: safe(f.organization), contactLine: safe(f.contactLine), note: safe(f.note), hasLogo: !!f.logoPng };
}
