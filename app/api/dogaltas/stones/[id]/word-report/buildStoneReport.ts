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
  buildTOCPage,
  buildWellnessNoteSection,
  divider,
  embedImageParagraph,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
} from "@/lib/docx/reportHelpers";
import { formatInstantDate, reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";
import { SOURCE_FIELD_LABELS, SOURCE_TEXT_FIELDS, sourceDisplayName, type SourceFields } from "@/lib/dogaltas/stoneSources";

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

/** WT9: tek bir ek kaynağın bölümü — her dolu alan kendi başlığıyla, metin AYNEN (kısaltma yok). */
function buildExtraSourceSection(src: StoneReportExtraSource, index: number): ReportChild[] {
  const out: ReportChild[] = [];
  const name = sourceDisplayName(src.name);
  out.push(divider());
  out.push(profileLabel(`KAYNAK: ${name.toLocaleUpperCase("tr-TR")}`, C_STONE));
  out.push(h1Colored(`Ek Kaynak ${index + 1}: ${name}`, C_STONE));
  let filled = 0;
  for (const f of SOURCE_TEXT_FIELDS) {
    const v = src.fields[f];
    if (!v?.trim()) continue;
    filled++;
    out.push(h2(SOURCE_FIELD_LABELS[f]));
    out.push(bodyText(v.trim()));
  }
  const chakras = asStringArray(src.fields.chakras);
  if (chakras.length) { filled++; out.push(...arraySection("Çakralar", chakras)); }
  if (filled === 0) out.push(muted("Bu kaynakta henüz bilgi girilmemiş."));
  return out;
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

function countFilledSections(stone: StoneReportRow): number {
  const fields = [
    stone.short_description, stone.general_info, stone.source_note,
    stone.physical_effects, stone.spiritual_effects, stone.other_effects,
    stone.warning_text, stone.feng_shui, stone.meditation, stone.care, stone.application,
  ];
  const arrays = [stone.chakras, stone.warning_tags];
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
}): { doc: Document; filename: string } {
  const { stone, imageBuf, isLibrary } = input;
  const extraSources = input.extraSources ?? [];
  const primaryName = (stone.primary_source_name ?? "").trim();
  // Kaynak etiketi yalnız kaynak bilgisi varsa basılır (eski kayıt raporu değişmez).
  const showSources = Boolean(primaryName) || extraSources.length > 0;
  const now = input.now ?? new Date();
  const stoneName = stone.stone_name || "İsimsiz Taş";
  const today = reportGeneratedLabel(undefined, now);
  const dateSlug = reportFileDate(undefined, now);
  const nameSlug = slugify(stoneName);

  const filledSections = countFilledSections(stone);
  const imageCount = Array.isArray(stone.images)
    ? stone.images.filter((img) => (img.file_path || img.url)?.trim()).length
    : 0;
  const chakraCount = asStringArray(stone.chakras).length; // F-011 guard

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
      ...(showSources ? [{ label: "Bilgi Kaynağı", value: String(1 + extraSources.length) }] : []),
    ].filter((s) => s.value.trim().length > 0),
  }));

  // ── Sistem özeti
  all.push(...buildStatsPage([
    ["Taş Adı",       stoneName],
    ["Dolu Bölüm",    `${filledSections} bölüm`],
    ["Görsel Sayısı", `${imageCount} görsel`],
    ["Çakra",         chakraCount > 0 ? safeJoin(stone.chakras) : "Belirtilmemiş"],
    ["Kayıt Tarihi",  formatInstantDate(stone.created_at, { fallback: "-" })],
    ...(showSources
      ? [["Bilgi Kaynakları", [sourceDisplayName(primaryName), ...extraSources.map((s) => sourceDisplayName(s.name))].join(" · ")] as [string, string]]
      : []),
  ]));

  // ── İçindekiler
  all.push(...buildTOCPage());

  // ── Görsel (varsa)
  if (imageBuf) {
    all.push(embedImageParagraph(imageBuf, 320));
    all.push(spacer());
  }

  // ── WT9: birincil kaynak etiketi — Bölüm 1–4'teki metinler bu kaynağa aittir.
  if (showSources) {
    all.push(profileLabel(`KAYNAK: ${sourceDisplayName(primaryName).toLocaleUpperCase("tr-TR")}`, C_STONE));
  }

  // ── Bölüm 1: Genel Bilgiler
  all.push(profileLabel("BÖLÜM 1", C_STONE));
  all.push(h1Colored("1. Genel Bilgiler", C_STONE, true));

  if (stone.short_description?.trim()) {
    all.push(h2("Kısa Açıklama"));
    all.push(bodyText(stone.short_description.trim()));
  }
  if (stone.general_info?.trim()) {
    all.push(h2("Genel Taş Açıklaması"));
    all.push(bodyText(stone.general_info.trim()));
  }
  if (stone.source_note?.trim()) {
    all.push(h2("Kaynak Notu"));
    all.push(bodyText(stone.source_note.trim()));
  }
  if (!stone.short_description?.trim() && !stone.general_info?.trim() && !stone.source_note?.trim()) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 2: Etkiler
  all.push(divider());
  all.push(profileLabel("BÖLÜM 2", C_STONE));
  all.push(h1Colored("2. Etkiler", C_STONE));

  if (stone.physical_effects?.trim()) { all.push(h2("Fiziksel Etkiler"));  all.push(bodyText(stone.physical_effects.trim())); }
  if (stone.spiritual_effects?.trim()) { all.push(h2("Ruhsal Etkiler"));   all.push(bodyText(stone.spiritual_effects.trim())); }
  if (stone.other_effects?.trim()) { all.push(h2("Diğer Etkiler"));        all.push(bodyText(stone.other_effects.trim())); }
  if (stone.warning_text?.trim()) { all.push(h2("Uyarılar ve Hassasiyetler")); all.push(bodyText(stone.warning_text.trim())); }
  all.push(...arraySection("Uyarı Etiketleri", asStringArray(stone.warning_tags)));

  if (!stone.physical_effects?.trim() && !stone.spiritual_effects?.trim() &&
      !stone.other_effects?.trim() && !stone.warning_text?.trim() && !safeLen(stone.warning_tags)) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 3: Kullanım Alanları
  all.push(divider());
  all.push(profileLabel("BÖLÜM 3", C_STONE));
  all.push(h1Colored("3. Kullanım Alanları", C_STONE));

  if (stone.feng_shui?.trim())    { all.push(h2("Feng Shui")); all.push(bodyText(stone.feng_shui.trim())); }
  if (stone.meditation?.trim())   { all.push(h2("Meditasyon")); all.push(bodyText(stone.meditation.trim())); }
  if (stone.care?.trim())         { all.push(h2("Bakım")); all.push(bodyText(stone.care.trim())); }
  if (stone.application?.trim())  { all.push(h2("Uygulama")); all.push(bodyText(stone.application.trim())); }

  if (!stone.feng_shui?.trim() && !stone.meditation?.trim() && !stone.care?.trim() && !stone.application?.trim()) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 4: Çakralar ve Atamalar
  all.push(divider());
  all.push(profileLabel("BÖLÜM 4", C_STONE));
  all.push(h1Colored("4. Çakralar ve Atamalar", C_STONE));

  all.push(...arraySection("Çakralar", asStringArray(stone.chakras)));
  all.push(...buildAssignmentSections(stone.assignments));

  if (!safeLen(stone.chakras) && (!stone.assignments || typeof stone.assignments !== "object" ||
      Array.isArray(stone.assignments) || Object.keys(stone.assignments).length === 0)) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── WT9: ek kaynaklar — her biri kendi "KAYNAK:" başlığıyla, karışmadan.
  extraSources.forEach((src, i) => all.push(...buildExtraSourceSection(src, i)));

  // ── Ek görsel referansı
  if (imageCount > 1) {
    all.push(divider());
    all.push(h3(`Ek Görseller`));
    all.push(muted(`Bu taş kaydında toplam ${imageCount} görsel bulunmaktadır. Sistemi ziyaret edin.`));
  }

  // ── FA-16: sade bilgilendirme notu + Hazırlayan
  all.push(...buildWellnessNoteSection("dogaltas", input.expertName));

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Doğaltaş Raporu · ${stoneName}`, { note: "dogaltas" }) },
      children: all,
    }],
  });

  return { doc, filename: `dogaltas-${nameSlug}-${dateSlug}.docx` };
}
