/**
 * Ortak rapor motorları (lib/docx/*) için golden fikstürü: dışa açık metin üreten yardımcıların
 * VARSAYILAN (dil parametresiz = Türkçe) çıktısını tek bir belgede toplar. Ortak motor imzasına isteğe
 * bağlı `common` (ReportCommonStrings) eklendikten sonra:
 *   - parametresiz çağrı → taban golden'a bayt-bayt eşit,
 *   - TR katalog metinleriyle çağrı → yine taban golden'a eşit (katalog TR = eski sabitler),
 *   - EN katalog metinleriyle çağrı → Türkçe sistem metni içermez.
 */
import { Document, Packer, Paragraph, TextRun } from "docx";
import {
  buildCompactFrontMatter,
  buildFooter,
  buildStatsPage,
  buildTOCPage,
  buildWellnessNoteSection,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import { buildCompactSummary, buildStaticToc, buildStaticTocPage, tocBookmarkId } from "@/lib/docx/premiumToc";
import { expertCoverBlock, expertSignatureBlock, type ExpertBranding } from "@/lib/docx/expertBranding";
import { wellnessNote, type WellnessNoteKind } from "@/lib/docx/reportDisclaimer";

export const WELLNESS_KINDS: WellnessNoteKind[] = ["general", "danisan", "dogaltas", "sifa", "aromaterapi", "hacamat", "numeroloji", "human_design", "biyoenerji", "refleksoloji", "beslenme"];

// Taban (dil parametresiz) ile yeni imzaları aynı dosyadan çağırabilmek için gevşek tipli erişim.
type AnyFn = (...args: unknown[]) => unknown;
const call = <T>(fn: unknown, ...args: unknown[]) => (fn as AnyFn)(...args) as T;

/** `common` verilmezse (undefined) çağrılar tabandaki parametresiz çağrıyla aynıdır. */
export async function buildEnginesDoc(branding: ExpertBranding, common?: unknown, documentStyles?: unknown): Promise<Buffer> {
  const c = common;
  const rows: [string, string][] = [["⟦KULLANICI etiket⟧", "⟦KULLANICI değer⟧"], ["A", "B"]];
  const toc = [
    { id: tocBookmarkId("sec", 1), title: "⟦KULLANICI bölüm 1⟧", level: 1 as const },
    { id: tocBookmarkId("sec", 2), title: "⟦KULLANICI bölüm 2⟧" },
  ];
  const opt = (o: Record<string, unknown>) => (c === undefined ? o : { ...o, common: c });
  const children: ReportChild[] = [
    ...call<ReportChild[]>(buildStatsPage, rows, ["⟦KULLANICI ek satır⟧"], c),
    ...call<ReportChild[]>(buildCompactFrontMatter, rows, true, c),
    ...call<ReportChild[]>(buildTOCPage, c),
    ...call<ReportChild[]>(buildCompactSummary, rows, opt({ pageBreakBefore: true })),
    ...call<ReportChild[]>(buildStaticToc, toc, opt({})),
    ...call<ReportChild[]>(buildStaticTocPage, toc, c),
    ...WELLNESS_KINDS.flatMap((k) => call<ReportChild[]>(buildWellnessNoteSection, k, "⟦KULLANICI uzman⟧", c)),
    ...WELLNESS_KINDS.map((k) => new Paragraph({ children: [new TextRun(call<{ short: string }>(wellnessNote, k, c).short)] })),
    ...call<ReportChild[]>(expertCoverBlock, branding, opt({ variant: "A" })),
    ...(["A", "B", "C"] as const).flatMap((v) => call<ReportChild[]>(expertSignatureBlock, branding, opt({ variant: v }))),
  ];
  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: "engines",
    ...(documentStyles ? { styles: documentStyles as never } : {}),
    sections: [
      {
        footers: { default: call(buildFooter, "⟦KULLANICI rapor adı⟧", opt({ note: "hacamat" })) as never },
        children: children as Paragraph[],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
