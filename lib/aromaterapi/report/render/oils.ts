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

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;
const heading = (level: "h2" | "h3", text: string) => (level === "h2" ? h2(text) : h3(text));

function kvRows(oil: OilExportRow): [string, string][] {
  const rows: [string, string][] = [];
  const add = (label: string, v: unknown) => { if (has(v)) rows.push([label, s(v)]); };
  add("Latince Adı", oil.latin_name);
  add("İngilizce Adı", oil.english_name);
  rows.push(["Yağ Tipi", oilTypeLabel(oil.oil_type)]);
  add("Kategori", oil.category);
  add("Menşei", oil.origin);
  add("Bitki Bölümü", oil.plant_part);
  add("Çıkarma Yöntemi", oil.extraction_method);
  add("Raf Ömrü", oil.shelf_life);
  add("Koku Notası", oil.aroma_note);
  add("Renk", oil.color);
  add("Kıvam", oil.consistency);
  if (oil.is_photosensitive === true) rows.push(["Fotosensitif", "Evet (güneş ışığına dikkat)"]);
  add("Seyreltme Oranı", oil.dilution_ratio);
  add("Çakra Bağlantısı", oil.chakra_connection);
  add("Element Bağlantısı", oil.element_connection);
  return rows;
}

function arrayBlock(label: string, arr: string[] | null | undefined): ReportChild[] {
  const clean = (arr ?? []).map(s).filter(Boolean);
  if (!clean.length) return [];
  return [h3(label), ...clean.map(bulletItem)];
}

/** Tek yağın tam monografisi. nameLevel: tekil export "h2", gruplu genel rapor "h3". */
export function renderOilMonograph(oil: OilExportRow, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const out: ReportChild[] = [];
  out.push(profileLabel(oilTypeLabel(oil.oil_type), AROMA_COLORS.oils));
  out.push(heading(nameLevel, s(oil.name) || "İsimsiz Yağ"));
  if (has(oil.latin_name)) out.push(muted(s(oil.latin_name)));

  out.push(twoColTable(kvRows(oil)));

  if (has(oil.aroma_profile)) out.push(h3("Koku Profili"), bodyText(s(oil.aroma_profile)));
  if (has(oil.main_components)) out.push(h3("Ana Kimyasal Bileşenler"), bodyText(tidyInlineList(s(oil.main_components))));
  out.push(...arrayBlock("Terapötik Özellikler", oil.therapeutic_properties));

  const benefits: [string, unknown][] = [
    ["Fiziksel Faydalar", oil.physical_benefits],
    ["Duygusal Etkiler", oil.emotional_benefits],
    ["Ruhsal Etkiler", oil.spiritual_benefits],
    ["Cilt Faydaları", oil.skin_benefits],
    ["Genel Faydalar", oil.benefits],
  ];
  const benefitBlocks = benefits.filter(([, v]) => has(v));
  if (benefitBlocks.length) {
    out.push(h3("Faydalar"));
    for (const [l, v] of benefitBlocks) out.push(bodyText(`${l}: ${s(v)}`));
  }

  const usage: [string, unknown][] = [
    ["Difüzyon / Buharlaştırıcı", oil.diffuser_usage],
    ["Masaj Kullanımı", oil.massage_usage],
    ["Genel Kullanım Yöntemleri", oil.usage_methods],
  ];
  for (const [l, v] of usage) if (has(v)) out.push(h3(l), bodyText(s(v)));

  out.push(...arrayBlock("İyi Karıştığı Yağlar", oil.blends_well_with));
  out.push(...arrayBlock("Hedef Sistemler", oil.target_systems));

  if (has(oil.safety_notes)) out.push(h3("Güvenlik Notları"), bodyText(s(oil.safety_notes)));
  if (has(oil.contraindications)) out.push(h3("Kontrendikasyonlar"), bodyText(s(oil.contraindications)));

  if (has(oil.notes)) out.push(h3("Ek Notlar"), bodyText(s(oil.notes)));
  if (has(oil.source)) out.push(bodyText(`Kaynak: ${s(oil.source)}`));
  if (s(oil.origin_type) === "admin_transfer" && has(oil.origin_label)) {
    out.push(muted(`Bilgi kaynağı: ${s(oil.origin_label)}`));
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
  if (opts?.asMainSection) out.push(h1Colored("YAĞLAR", AROMA_COLORS.oils, opts.sectionBreak ?? true));

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
    out.push(h2(`${oilTypeLabel(t)} (${group.length})`));
    for (const oil of group) out.push(...renderOilMonograph(oil, "h3"));
  }
  return out;
}
