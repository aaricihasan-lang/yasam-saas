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
import { StaticTocCollector } from "@/lib/docx/premiumToc";
import { formatInstantDate, reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";
import { pickSourceFields, sourceDisplayName, type SourceFields, type SourceTextField } from "@/lib/dogaltas/stoneSources";
import { bulletParagraphs, entryParagraphs, reportChakraEntries, reportEntriesByField, reportSourceNames, sourceAttribution, type ReportSource } from "@/lib/dogaltas/stoneSourceReport";

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
}): { doc: Document; filename: string } {
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
  const stoneName = stone.stone_name || "İsimsiz Taş";
  const today = reportGeneratedLabel(undefined, now);
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
    title1:   "YAŞAM SİSTEMİ",
    title2:   stoneName.toLocaleUpperCase("tr-TR"),
    subtitle: "Doğaltaş Detay Raporu",
    date:     `Oluşturulma Tarihi: ${today}`,
    // RPT (boş sayaç): sayaçlar her zaman gerçek sayı (0 dahil) taşır; ek savunma
    // olarak boş/whitespace değerli sayaç render edilmez → boş etiket oluşmaz.
    stats: [
      { label: "Taş Adı",       value: stoneName },
      { label: "Dolu Bölüm",    value: String(filledSections) },
      { label: "Görsel Sayısı", value: String(imageCount) },
      { label: "Çakra Sayısı",  value: String(chakraCount) },
      ...(isLibrary ? [{ label: "Kaynak", value: "Kütüphane" }] : []),
      ...(showSources ? [{ label: "Bilgi Kaynağı", value: String(multi ? sourceNames.length : 1 + extraSources.length) }] : []),
    ].filter((s) => s.value.trim().length > 0),
  }));

  // ── Sistem özeti
  all.push(...buildStatsPage([
    ["Taş Adı",       stoneName],
    ["Dolu Bölüm",    `${filledSections} bölüm`],
    ["Görsel Sayısı", `${imageCount} görsel`],
    ["Çakra",         chakraCount > 0 ? safeJoin(allChakras) : "Belirtilmemiş"],
    ["Kayıt Tarihi",  formatInstantDate(stone.created_at, { fallback: "-" })],
    ...(showSources
      ? [["Bilgi Kaynakları", (multi ? sourceNames : [sourceDisplayName(primaryName), ...extraSources.map((s) => sourceDisplayName(s.name))]).join(" · ")] as [string, string]]
      : []),
  ]));

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
    all.push(profileLabel(`KAYNAK: ${sourceDisplayName(primaryName).toLocaleUpperCase("tr-TR")}`, C_STONE));
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
  all.push(profileLabel("BÖLÜM 1", C_STONE));
  all.push(toc.h1Colored("1. Genel Bilgiler", C_STONE, true));

  const b1 = [
    field("Kısa Açıklama", "short_description"),
    field("Genel Taş Açıklaması", "general_info"),
    field("Kaynak Notu", "source_note"),
  ];
  if (!b1.some(Boolean)) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 2: Etkiler
  all.push(divider());
  all.push(profileLabel("BÖLÜM 2", C_STONE));
  all.push(toc.h1Colored("2. Etkiler", C_STONE));

  const b2 = [
    field("Fiziksel Etkiler", "physical_effects"),
    field("Ruhsal Etkiler", "spiritual_effects"),
    field("Diğer Etkiler", "other_effects"),
    field("Uyarılar ve Hassasiyetler", "warning_text"),
  ];
  all.push(...arraySection("Uyarı Etiketleri", asStringArray(stone.warning_tags)));

  if (!b2.some(Boolean) && !safeLen(stone.warning_tags)) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 3: Kullanım Alanları
  all.push(divider());
  all.push(profileLabel("BÖLÜM 3", C_STONE));
  all.push(toc.h1Colored("3. Kullanım Alanları", C_STONE));

  const b3 = [
    field("Feng Shui", "feng_shui"),
    field("Meditasyon", "meditation"),
    field("Bakım", "care"),
    field("Uygulama", "application"),
  ];
  if (!b3.some(Boolean)) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 4: Çakralar ve Atamalar
  all.push(divider());
  all.push(profileLabel("BÖLÜM 4", C_STONE));
  all.push(toc.h1Colored("4. Çakralar ve Atamalar", C_STONE));

  if (multi) {
    const chakraEntries = reportChakraEntries(sources);
    if (chakraEntries.length) {
      all.push(h3("Çakralar"));
      for (const e of chakraEntries) {
        all.push(sourceAttribution(e.name, C_STONE));
        all.push(...bulletParagraphs(e.chakras));
      }
    }
  } else {
    all.push(...arraySection("Çakralar", asStringArray(stone.chakras)));
  }
  all.push(...buildAssignmentSections(stone.assignments));

  if (!(multi ? chakraCount : safeLen(stone.chakras)) && (!stone.assignments || typeof stone.assignments !== "object" ||
      Array.isArray(stone.assignments) || Object.keys(stone.assignments).length === 0)) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Ek görsel referansı
  if (imageCount > 1) {
    all.push(divider());
    all.push(h3(`Ek Görseller`));
    all.push(muted(`Bu taş kaydında toplam ${imageCount} görsel bulunmaktadır. Sistemi ziyaret edin.`));
  }

  // ── FA-16: sade bilgilendirme notu + Hazırlayan
  all.push(...buildWellnessNoteSection("dogaltas", input.expertName));

  all.splice(tocAt, 0, ...toc.page());

  const doc = new Document({
    ...toc.documentOptions(),
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Doğaltaş Raporu · ${stoneName}`, { note: "dogaltas" }) },
      children: all,
    }],
  });

  return { doc, filename: `dogaltas-${nameSlug}-${dateSlug}.docx` };
}
