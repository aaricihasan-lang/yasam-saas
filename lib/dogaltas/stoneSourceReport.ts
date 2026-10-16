/**
 * Doğaltaş Word — çok kaynaklı taşta ALAN BAŞINA kaynak ayrımı (manuel test Madde 14).
 *
 * Aynı alan (ör. Fiziksel Etkiler) için her kaynağın metni kendi "Kaynak: <ad>" etiketinin altında
 * ayrı paragraf olarak basılır; metinler birleştirilmez/kısaltılmaz. Tek kaynaklı (eski) taşta
 * çağıranlar bu yardımcıları KULLANMAZ → eski rapor düzeni birebir korunur.
 */
import { Paragraph, TextRun } from "docx";
import { C_LIGHT, C_MID, REPORT_FONT } from "@/lib/docx/reportHelpers";
import { sourceDisplayName, type SourceFields, type SourceTextField, type StoneSourceView } from "@/lib/dogaltas/stoneSources";
import { buildFieldEntries, ENTRY_FIELDS, entrySourceSummary, type StoneEntriesByField } from "@/lib/dogaltas/stoneEntries";

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

/** Rapor kaynaklarını (birincil + ek) bilgi kaydı kurucusunun beklediği görünüme çevirir. */
export function reportSourcesView(sources: readonly ReportSource[]): StoneSourceView[] {
  return sources.map((s, i) => ({ id: i === 0 ? "primary" : `extra-${i}`, name: s.name, isPrimary: i === 0, sortOrder: i - 1, fields: s.fields, updatedAt: null }));
}

/** Tüm alanların bilgi kayıtları (eski metinler + stone_entries), gösterimle AYNI sıra. */
export function reportEntriesByField(sources: readonly ReportSource[], entryRows: readonly Record<string, unknown>[]): StoneEntriesByField {
  const view = reportSourcesView(sources);
  const out = {} as StoneEntriesByField;
  for (const f of ENTRY_FIELDS) out[f] = buildFieldEntries(view, entryRows, f);
  return out;
}

/** Rapordaki kaynak listesi (yalnız gerçekten bilgi taşıyan kaynaklar, ilk görülme sırasıyla). */
export function reportSourceNames(byField: StoneEntriesByField): string[] {
  return entrySourceSummary(byField).map((x) => sourceDisplayName(x.name));
}

/**
 * Tek bilgi kaydı: "•  <metin>" + hemen altında "Kaynak: <ad>" (ikisi aynı sayfada). Metin AYNEN
 * (satır sonları korunur, kısaltma yok).
 */
export function entryParagraphs(content: string, sourceName: string | null, color: string): Paragraph[] {
  const lines = content.trim().split(/\r?\n/);
  const runs: TextRun[] = [new TextRun({ text: "•  ", size: 22, font: REPORT_FONT, color })];
  lines.forEach((line, i) => runs.push(new TextRun({ text: line, size: 22, font: REPORT_FONT, color: "1e293b", ...(i > 0 ? { break: 1 } : {}) })));
  return [
    new Paragraph({ children: runs, indent: { left: 360, hanging: 240 }, spacing: { before: 120, after: 20 }, keepNext: true, keepLines: true }),
    new Paragraph({
      children: [
        new TextRun({ text: "Kaynak: ", bold: true, italics: true, size: 18, font: REPORT_FONT, color }),
        new TextRun({ text: sourceDisplayName(sourceName), italics: true, size: 18, font: REPORT_FONT, color }),
      ],
      indent: { left: 360 },
      spacing: { after: 100 },
    }),
  ];
}
