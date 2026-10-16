/**
 * Doğaltaş Word — çok kaynaklı taşta ALAN BAŞINA kaynak ayrımı (manuel test Madde 14).
 *
 * Aynı alan (ör. Fiziksel Etkiler) için her kaynağın metni kendi "Kaynak: <ad>" etiketinin altında
 * ayrı paragraf olarak basılır; metinler birleştirilmez/kısaltılmaz. Tek kaynaklı (eski) taşta
 * çağıranlar bu yardımcıları KULLANMAZ → eski rapor düzeni birebir korunur.
 */
import { Paragraph, TextRun } from "docx";
import { C_LIGHT, C_MID, REPORT_FONT } from "@/lib/docx/reportHelpers";
import { sourceDisplayName, type SourceFields, type SourceTextField } from "@/lib/dogaltas/stoneSources";

export type ReportSource = { name: string | null; fields: SourceFields };
export type ReportFieldEntry = { name: string | null; text: string };

/** Bir alanın dolu kaynak içerikleri (kaynak sırası korunur; boş kaynak atlanır). Metin trim'li, aynen. */
export function reportFieldEntries(sources: readonly ReportSource[], field: SourceTextField): ReportFieldEntry[] {
  const out: ReportFieldEntry[] = [];
  for (const s of sources) {
    const v = s.fields[field];
    if (v?.trim()) out.push({ name: s.name, text: v.trim() });
  }
  return out;
}

/** Çakraların kaynak başına listesi (boş kaynak atlanır). */
export function reportChakraEntries(sources: readonly ReportSource[]): { name: string | null; chakras: string[] }[] {
  const out: { name: string | null; chakras: string[] }[] = [];
  for (const s of sources) {
    const list = Array.isArray(s.fields.chakras) ? s.fields.chakras.map((c) => String(c ?? "").trim()).filter(Boolean) : [];
    if (list.length) out.push({ name: s.name, chakras: list });
  }
  return out;
}

/** "Kaynak: <ad>" etiketi — metnin hemen üstünde, metinle aynı sayfada kalır (keepNext). */
export function sourceAttribution(name: string | null, color: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "Kaynak: ", bold: true, size: 20, font: REPORT_FONT, color }),
      new TextRun({ text: sourceDisplayName(name), bold: true, italics: !name, size: 20, font: REPORT_FONT, color }),
    ],
    spacing: { before: 140, after: 40 },
    keepNext: true,
  });
}

/** Madde imli liste (arraySection ile aynı görünüm, başlıksız) — çok kaynaklıda çakralar kaynak etiketinin altında. */
export function bulletParagraphs(items: readonly string[]): Paragraph[] {
  return items.map((item) => new Paragraph({
    children: [
      new TextRun({ text: "·  ", size: 20, font: REPORT_FONT, color: C_LIGHT }),
      new TextRun({ text: item.trim(), size: 20, font: REPORT_FONT, color: C_MID }),
    ],
    indent: { left: 360 },
    spacing: { after: 80 },
  }));
}
