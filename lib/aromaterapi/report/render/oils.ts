/**
 * Aromaterapi Word — Yağ monografi renderer'ı. Saf: (OilExportRow) → ReportChild[].
 * 40+ gerçek alan semantik bölümlere ayrılır; long-form TAM (truncation YOK);
 * boş/null alan ATLANIR ("undefined"/"null" YAZILMAZ); dizi alanları gerçek madde-imli.
 */

import {
  h1Colored, twoColTable, bodyText, muted, spacer, bulletItem,
  profileLabel, tidyInlineList, type ReportChild,
} from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS, oilTypeLabel, OIL_TYPE_ORDER } from "../theme";
import type { OilExportRow } from "../reads";
import { derivePhotosensitivity } from "@/lib/aromaterapi/oilFields";
import { aromaText } from "../text";

/** Fotosensitivite tri-state etiketi (ARO-004). 'no'/'unknown' ASLA "güvenli" iddiası değildir. */
function photoLabel(status: "yes" | "no" | "unknown"): string {
  const t = aromaText().t;
  return status === "yes"
    ? t("oils.photo.yes")
    : status === "no"
      ? t("oils.photo.no")
      : t("oils.photo.unknown");
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;
const heading = (level: "h2" | "h3", text: string) => (level === "h2" ? h2(text) : h3(text));

function kvRows(oil: OilExportRow): [string, string][] {
  const t = aromaText().t;
  const rows: [string, string][] = [];
  const add = (label: string, v: unknown) => { if (has(v)) rows.push([label, s(v)]); };
  add(t("oils.field.latinName"), oil.latin_name);
  add(t("oils.field.englishName"), oil.english_name);
  rows.push([t("oils.field.oilType"), oilTypeLabel(oil.oil_type)]);
  add(t("oils.field.category"), oil.category);
  add(t("oils.field.origin"), oil.origin);
  add(t("oils.field.plantPart"), oil.plant_part);
  add(t("oils.field.extraction"), oil.extraction_method);
  add(t("oils.field.shelfLife"), oil.shelf_life);
  add(t("oils.field.aromaNote"), oil.aroma_note);
  add(t("oils.field.color"), oil.color);
  add(t("oils.field.consistency"), oil.consistency);
  // ARO-004: tri-state (yes/no/unknown); geriye-uyum için derivePhotosensitivity (kolon yoksa is_photosensitive'e düşer).
  rows.push([t("oils.field.photosensitivity"), photoLabel(derivePhotosensitivity(oil))]);
  add(t("oils.field.dilution"), oil.dilution_ratio);
  add(t("oils.field.chakra"), oil.chakra_connection);
  add(t("oils.field.element"), oil.element_connection);
  return rows;
}

function arrayBlock(label: string, arr: string[] | null | undefined): ReportChild[] {
  const clean = (arr ?? []).map(s).filter(Boolean);
  if (!clean.length) return [];
  return [h3(label), ...clean.map(bulletItem)];
}

/** Tek yağın tam monografisi. nameLevel: tekil export "h2", gruplu genel rapor "h3". */
export function renderOilMonograph(oil: OilExportRow, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const t = aromaText().t;
  const out: ReportChild[] = [];
  out.push(profileLabel(oilTypeLabel(oil.oil_type), AROMA_COLORS.oils));
  out.push(heading(nameLevel, s(oil.name) || t("oils.unnamed")));
  if (has(oil.latin_name)) out.push(muted(s(oil.latin_name)));

  out.push(twoColTable(kvRows(oil)));

  if (has(oil.aroma_profile)) out.push(h3(t("oils.aromaProfile")), bodyText(s(oil.aroma_profile)));
  if (has(oil.main_components)) out.push(h3(t("oils.components")), bodyText(tidyInlineList(s(oil.main_components))));
  out.push(...arrayBlock(t("oils.therapeutic"), oil.therapeutic_properties));

  const benefits: [string, unknown][] = [
    [t("oils.benefit.physical"), oil.physical_benefits],
    [t("oils.benefit.emotional"), oil.emotional_benefits],
    [t("oils.benefit.spiritual"), oil.spiritual_benefits],
    [t("oils.benefit.skin"), oil.skin_benefits],
    [t("oils.benefit.general"), oil.benefits],
  ];
  const benefitBlocks = benefits.filter(([, v]) => has(v));
  if (benefitBlocks.length) {
    out.push(h3(t("oils.benefits")));
    for (const [l, v] of benefitBlocks) out.push(bodyText(`${l}: ${s(v)}`));
  }

  const usage: [string, unknown][] = [
    [t("oils.usage.diffuser"), oil.diffuser_usage],
    [t("oils.usage.massage"), oil.massage_usage],
    [t("oils.usage.general"), oil.usage_methods],
  ];
  for (const [l, v] of usage) if (has(v)) out.push(h3(l), bodyText(s(v)));

  out.push(...arrayBlock(t("oils.blendsWell"), oil.blends_well_with));
  out.push(...arrayBlock(t("oils.targetSystems"), oil.target_systems));

  if (has(oil.safety_notes)) out.push(h3(t("oils.safety")), bodyText(s(oil.safety_notes)));
  if (has(oil.contraindications)) out.push(h3(t("oils.contraindications")), bodyText(s(oil.contraindications)));

  if (has(oil.notes)) out.push(h3(t("oils.notes")), bodyText(s(oil.notes)));
  if (has(oil.source)) out.push(bodyText(t("oils.source", { value: s(oil.source) })));
  if (s(oil.origin_type) === "admin_transfer" && has(oil.origin_label)) {
    out.push(muted(t("oils.infoSource", { value: s(oil.origin_label) })));
  }
  out.push(spacer());
  return out;
}

/**
 * Çok yağlı bölüm. asMainSection → H1 "YAĞLAR"; her oil_type grubu H2 ("Uçucu Yağ (N)");
 * her yağ H3 monografi. Gruplar OIL_TYPE_ORDER sırasıyla (read zaten oil_type,name sıralı).
 */
export function renderOilsSection(oils: OilExportRow[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!oils.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored(aromaText().t("oils.section"), AROMA_COLORS.oils, opts.sectionBreak ?? true));

  const byType = new Map<string, OilExportRow[]>();
  for (const o of oils) {
    const t = s(o.oil_type) || "essential";
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(o);
  }
  const orderedTypes = [
    ...OIL_TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !(OIL_TYPE_ORDER as readonly string[]).includes(t)),
  ];
  for (const t of orderedTypes) {
    const group = byType.get(t)!;
    out.push(h2(aromaText().t("oils.groupTitle", { type: oilTypeLabel(t), count: String(group.length) })));
    for (const oil of group) out.push(...renderOilMonograph(oil, "h3"));
  }
  return out;
}
