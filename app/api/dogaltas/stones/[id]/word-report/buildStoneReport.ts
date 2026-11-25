/**
 * Doğaltaş tekil taş Word raporu — SAF belge kurucusu (DB/ağ YOK → harness gerçek DOCX test eder).
 * Route; tenant kapsamlı okuma, XML sanitize ve sahiplik doğrulamalı görsel indirmeyi yapar.
 *
 * FA-02: kayıt tarihi (created_at timestamptz) + rapor tarihi/dosya adı Europe/Istanbul.
 * FA-16: sade "Bilgilendirme" notu (footer + rapor sonu) + "Hazırlayan".
 * Türkçe büyük harf: kapak başlığı `toLocaleUpperCase("tr-TR")` (i → İ); içerik DEĞİŞMEZ.
 */
import { Document } from "docx";
import { asStringArray, safeJoin, safeLen } from "@/lib/dogaltas/reportSafe";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildWellnessNoteSection,
  divider,
  embedImageParagraph,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "@/lib/docx/premiumToc";
import { reportFileDate } from "@/lib/time/reportTime";
import { pickSourceFields, type SourceFields, type SourceTextField } from "@/lib/dogaltas/stoneSources";
import { bulletParagraphs, entryParagraphs, reportChakraEntries, reportEntriesByField, reportSourceNames, sourceAttribution, type ReportSource } from "@/lib/dogaltas/stoneSourceReport";
import type { ReportLocale } from "@/lib/i18n/reportLocale";
import { stonesSourceName, stonesText, upperContent, withStonesOutput } from "@/lib/dogaltas/reportText";

/** I18N-F1-R5 RAPOR-E (P12): sistem metinleri `reports.stones.stoneDetail.*` (TR birebir — golden kilitli). */
const T = (key: string, values?: Record<string, string | number>): string => stonesText().t(`stoneDetail.${key}`, values);

/** WT9: rapora girecek EK kaynak (birincil kaynak taş satırıdır). */
export type StoneReportExtraSource = { name: string | null; fields: SourceFields };

const C_STONE = "0e7490"; // turkuaz — taş rengi

export type StoneReportRow = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, string[][]> | null;
  images: { id: string; name: string; url?: string; file_path?: string }[] | null;
  created_at: string;
  updated_at: string | null;
  /** WT9: birincil kaynağın adı (NULL/yok = belirtilmemiş; eski kayıt). */
  primary_source_name?: string | null;
};

// B9: "İ" önce "i" yapılır — toLowerCase("İ") = "i" + U+0307 olup "-"ye dönüşüyordu ("AKİK" → "aki-k").
function slugify(text: string): string {
  return text
    .replace(/İ/g, "i")
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

const COUNTED_FIELDS: readonly SourceTextField[] = [
  "short_description", "general_info", "source_note",
  "physical_effects", "spiritual_effects", "other_effects",
  "warning_text", "feng_shui", "meditation", "care", "application",
];

/** Dolu bölüm sayısı — çok kaynaklı taşta bir alan HERHANGİ bir kaynakta doluysa sayılır. */
function countFilledSections(stone: StoneReportRow, sources: readonly ReportSource[]): number {
  const fields = COUNTED_FIELDS.map((f) => (sources.some((s) => s.fields[f]?.trim()) ? "x" : null));
  const arrays = [sources.length > 1 ? sources.flatMap((s) => asStringArray(s.fields.chakras)) : stone.chakras, stone.warning_tags];
  const hasAssignments = stone.assignments && typeof stone.assignments === "object" &&
    !Array.isArray(stone.assignments) && Object.keys(stone.assignments).length > 0;
  return fields.filter((f) => f?.trim()).length +
    arrays.filter((a) => safeLen(a) > 0).length +
    (hasAssignments ? 1 : 0);
}

function buildAssignmentSections(assignments: Record<string, string[][]> | null): ReportChild[] {
  // F-011: assignments legacy/transfer satırlarında beklenen nested-array yapısı yerine
  // string/obje olabilir. Her seviyede Array.isArray guard → rapor çökmez.
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) return [];
  const out: ReportChild[] = [];
  for (const [category, rows] of Object.entries(assignments)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const items = rows
      .filter((row) => Array.isArray(row) && row.length > 0)
      .map((row) => asStringArray(row).join(" / "))
      .filter(Boolean);
    if (items.length === 0) continue;
    out.push(...arraySection(category, items));
  }
  return out;
}

export function buildStoneReportDoc(input: {
  /** sanitizeXmlDeep uygulanmış satır. */
  stone: StoneReportRow;
  imageBuf: Buffer | null;
  isLibrary: boolean;
  expertName?: string | null;
  now?: Date;
  /** WT9: taşın EK kaynakları (sıralı). Yoksa rapor eski tek-kaynak düzeniyle AYNI. */
  extraSources?: readonly StoneReportExtraSource[];
  /** Bilgi kaydı modeli: stone_entries satırları (her kaydın kendi kaynağı). Yoksa eski düzen. */
  entries?: readonly Record<string, unknown>[];
  /** I18N çıktı dili (route `resolveReportLocale`); verilmezse tr → bugünkü rapor birebir. */
  output?: ReportLocale | null;
}): { doc: Document; filename: string } {
  return withStonesOutput(input.output, () => buildStoneReportDocIn(input));
}

function buildStoneReportDocIn(input: Parameters<typeof buildStoneReportDoc>[0]): { doc: Document; filename: string } {
  const X = stonesText();
  const { stone, imageBuf, isLibrary } = input;
  const extraSources = input.extraSources ?? [];
  const primaryName = (stone.primary_source_name ?? "").trim();
  // Kaynak etiketi yalnız kaynak bilgisi varsa basılır (eski kayıt raporu değişmez).
  const entryRows = input.entries ?? [];
  // Bilgi kaydı modeli: ek kaynak ya da ayrı bilgi kaydı varsa HER ALAN kendi başlığı altında kayıt
  // kayıt basılır ("•  metin" + "Kaynak: <ad>"). İkisi de yoksa eski tek-kaynak düzeni BİREBİR.
  const multi = extraSources.length > 0 || entryRows.length > 0;
  const sources: ReportSource[] = [
    { name: primaryName || null, fields: pickSourceFields(stone as unknown as Record<string, unknown>) },
    ...extraSources,
  ];
  const byField = reportEntriesByField(sources, entryRows);
  const sourceNames = reportSourceNames(byField);
  const showSources = Boolean(primaryName) || multi;
  const now = input.now ?? new Date();
  const stoneName = stone.stone_name || T("unnamed");
  const today = X.date(now, { style: "long" });
  const dateSlug = reportFileDate(undefined, now);
  const nameSlug = slugify(stoneName);

  const filledSections = multi
    ? countFilledSections(stone, sources) - COUNTED_FIELDS.filter((f) => sources.some((s) => s.fields[f]?.trim())).length
      + COUNTED_FIELDS.filter((f) => byField[f].length > 0).length
    : countFilledSections(stone, sources.slice(0, 1));
  const imageCount = Array.isArray(stone.images)
    ? stone.images.filter((img) => (img.file_path || img.url)?.trim()).length
    : 0;
  // F-011 guard; çok kaynaklıda kaynakların çakra birleşimi (tekil).
  const allChakras = multi
    ? [...new Set(sources.flatMap((s) => asStringArray(s.fields.chakras)))]
    : asStringArray(stone.chakras);
  const chakraCount = allChakras.length;

  const all: ReportChild[] = [];

  // ── Premium kapak
  all.push(...buildPremiumCover({
    title1:   X.t("brand"),
    // Taş adı uzman kaydıdır (TR) → TR büyük harf kuralı; ad yoksa sistem yedeği çıktı dilinin kuralıyla.
    title2:   upperContent(stoneName, !stone.stone_name),
    subtitle: T("subtitle"),
    date:     X.t("generatedOnDate", { date: today }),
    // RPT (boş sayaç): sayaçlar her zaman gerçek sayı (0 dahil) taşır; ek savunma
    // olarak boş/whitespace değerli sayaç render edilmez → boş etiket oluşmaz.
    stats: [
      { label: T("stat.stoneName"),      value: stoneName },
      { label: T("stat.filledSections"), value: String(filledSections) },
      { label: T("stat.imageCount"),     value: String(imageCount) },
      { label: T("stat.chakraCount"),    value: String(chakraCount) },
      ...(isLibrary ? [{ label: T("stat.source"), value: T("stat.library") }] : []),
      ...(showSources ? [{ label: T("stat.infoSource"), value: String(multi ? sourceNames.length : 1 + extraSources.length) }] : []),
    ].filter((s) => s.value.trim().length > 0),
  }));

  // ── Sistem özeti
  all.push(...buildStatsPage([
    [T("stat.stoneName"),        stoneName],
    [T("stat.filledSections"),   T("summary.filledSections", { count: filledSections, shown: String(filledSections) })],
    [T("stat.imageCount"),       T("summary.imageCount", { count: imageCount, shown: String(imageCount) })],
    [T("summary.chakra"),        chakraCount > 0 ? safeJoin(allChakras) : X.t("notSpecified")],
    [T("summary.recordDate"),    X.date(stone.created_at, { fallback: "-" })],
    ...(showSources
      ? [[T("summary.infoSources"), (multi ? sourceNames : [stonesSourceName(primaryName), ...extraSources.map((s) => stonesSourceName(s.name))]).join(" · ")] as [string, string]]
      : []),
  ], undefined, X.common));

  // ── İçindekiler: eski boş Word TOC alanı yerine STATİK + tıklanabilir girişler (gövde
  // başlıklarından toplanır, gövde bittikten sonra bu konuma yerleştirilir; başlık yoksa sayfa yok).
  const toc = new StaticTocCollector("dstn");
  const tocAt = all.length;

  // ── Görsel (varsa)
  if (imageBuf) {
    all.push(embedImageParagraph(imageBuf, 320));
    all.push(spacer());
  }

  // ── WT9: tek kaynaklı taşta birincil kaynak etiketi — Bölüm 1–4'teki metinler bu kaynağa aittir.
  // Madde 14: çok kaynaklıda etiket her metnin üstünde (alan içi), genel etiket basılmaz.
  if (showSources && !multi) {
    all.push(profileLabel(T("sourceBanner", { name: upperContent(stonesSourceName(primaryName), !primaryName) }), C_STONE));
  }

  /** Bir alanı basar; dolu ise true. Tek kaynak: başlık + metin (eski). Çok kaynak: başlık + kaynak blokları. */
  const field = (label: string, f: SourceTextField): boolean => {
    if (!multi) {
      const v = (stone[f] as string | null | undefined)?.trim();
      if (!v) return false;
      all.push(toc.h2(label));
      all.push(bodyText(v));
      return true;
    }
    const entries = byField[f];
    if (entries.length === 0) return false;
    all.push(toc.h2(label));
    for (const e of entries) all.push(...entryParagraphs(e.content, e.sourceName, C_STONE));
    return true;
  };

  // ── Bölüm 1: Genel Bilgiler
  all.push(profileLabel(T("sectionNo", { n: 1 }), C_STONE));
  all.push(toc.h1Colored(T("section.general"), C_STONE, true));

  const b1 = [
    field(T("field.shortDescription"), "short_description"),
    field(T("field.generalInfo"), "general_info"),
    field(T("field.sourceNote"), "source_note"),
  ];
  if (!b1.some(Boolean)) {
    all.push(muted(T("emptySection")));
  }

  // ── Bölüm 2: Etkiler
  all.push(divider());
  all.push(profileLabel(T("sectionNo", { n: 2 }), C_STONE));
  all.push(toc.h1Colored(T("section.effects"), C_STONE));

  const b2 = [
    field(T("field.physical"), "physical_effects"),
    field(T("field.spiritual"), "spiritual_effects"),
    field(T("field.other"), "other_effects"),
    field(T("field.warnings"), "warning_text"),
  ];
  all.push(...arraySection(T("field.warningTags"), asStringArray(stone.warning_tags)));

  if (!b2.some(Boolean) && !safeLen(stone.warning_tags)) {
    all.push(muted(T("emptySection")));
  }

  // ── Bölüm 3: Kullanım Alanları
  all.push(divider());
  all.push(profileLabel(T("sectionNo", { n: 3 }), C_STONE));
  all.push(toc.h1Colored(T("section.usage"), C_STONE));

  const b3 = [
    field(T("field.fengShui"), "feng_shui"),
    field(T("field.meditation"), "meditation"),
    field(T("field.care"), "care"),
    field(T("field.application"), "application"),
  ];
  if (!b3.some(Boolean)) {
    all.push(muted(T("emptySection")));
  }

  // ── Bölüm 4: Çakralar ve Atamalar
  all.push(divider());
  all.push(profileLabel(T("sectionNo", { n: 4 }), C_STONE));
  all.push(toc.h1Colored(T("section.chakras"), C_STONE));

  if (multi) {
    const chakraEntries = reportChakraEntries(sources);
    if (chakraEntries.length) {
      all.push(h3(T("field.chakras")));
      for (const e of chakraEntries) {
        all.push(sourceAttribution(e.name, C_STONE));
        all.push(...bulletParagraphs(e.chakras));
      }
    }
  } else {
    all.push(...arraySection(T("field.chakras"), asStringArray(stone.chakras)));
  }
  all.push(...buildAssignmentSections(stone.assignments));

  if (!(multi ? chakraCount : safeLen(stone.chakras)) && (!stone.assignments || typeof stone.assignments !== "object" ||
      Array.isArray(stone.assignments) || Object.keys(stone.assignments).length === 0)) {
    all.push(muted(T("emptySection")));
  }

  // ── Ek görsel referansı
  if (imageCount > 1) {
    all.push(divider());
    all.push(h3(T("extraImages")));
    all.push(muted(T("extraImagesNote", { count: imageCount, shown: String(imageCount) })));
  }

  // ── FA-16: sade bilgilendirme notu + Hazırlayan
  all.push(...buildWellnessNoteSection("dogaltas", input.expertName, X.common));

  all.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, X.common));

  const styles = X.output.docxStyles();
  const doc = new Document({
    ...toc.documentOptions(),
    ...(styles ? { styles } : {}),
    sections: [{
      properties: {},
      footers: { default: buildFooter(T("footer", { name: stoneName }), { note: "dogaltas", common: X.common }) },
      children: all,
    }],
  });

  return { doc, filename: `${T("file")}-${nameSlug}-${dateSlug}.docx` };
}
