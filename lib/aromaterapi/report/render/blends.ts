/**
 * Aromaterapi Word — Karışım (blend) formül/reçete renderer'ı. Saf.
 * Profesyonel reçete: künye + formül tablosu (tekrarlayan başlık) + güvenlik + not.
 */

import type { Paragraph, Table } from "docx";
import {
  h1Colored, twoColTable, bodyText, muted, spacer, repeatingHeaderTable, bulletItem,
  keepTogetherCard, type ReportChild,
} from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS, oilTypeLabel } from "../theme";
import type { BlendExportRow, BlendItemSnapshot } from "../reads";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;
const heading = (level: "h2" | "h3", text: string) => (level === "h2" ? h2(text) : h3(text));

/**
 * Küçük/orta karışım eşiği (yağ sayısı — SEMANTİK boyut ölçütü; kırılgan piksel-yükseklik
 * tahmini DEĞİL). Bu sınıra kadar başlangıç bloğu (ad+künye+Formül+formül tablosu)
 * keepTogetherCard ile birlikte tutulur; üstünde ise düz akış (uzun formül doğal bölünür).
 * ~12 yağ + künye + başlıklar bir sayfanın altında rahat sığar.
 */
const BLEND_KEEP_TOGETHER_MAX_ITEMS = 12;

function kvRows(b: BlendExportRow): [string, string][] {
  const rows: [string, string][] = [];
  if (has(b.carrier_oil_name)) rows.push(["Taşıyıcı (Sabit) Yağ", s(b.carrier_oil_name)]);
  if (b.bottle_ml > 0) rows.push(["Şişe Hacmi", `${b.bottle_ml} ml`]);
  if (b.dilution_percent > 0) rows.push(["Seyreltme Oranı", `%${b.dilution_percent}`]);
  if (b.drops_per_ml > 0) rows.push(["ml Başına Damla", `${b.drops_per_ml} damla/ml`]);
  if (b.total_drops > 0) rows.push(["Toplam Uçucu Yağ", `${b.total_drops} damla`]);
  rows.push(["Uçucu Yağ Sayısı", String((b.items ?? []).length)]);
  return rows;
}

/** items[] güvenlik özeti — fotosensitif + kontrendikasyon/uyarı içeren yağlar. */
function safetyBlock(items: BlendItemSnapshot[]): ReportChild[] {
  const photo = items.filter((it) => it.is_photosensitive).map((it) => s(it.oil_name)).filter(Boolean);
  const warns: string[] = [];
  for (const it of items) {
    const c = s(it.contraindications), sn = s(it.safety_notes);
    if (c) warns.push(`${s(it.oil_name)} — Kontrendikasyon: ${c}`);
    if (sn) warns.push(`${s(it.oil_name)} — Güvenlik: ${sn}`);
  }
  if (!photo.length && !warns.length) return [muted("Bilinen uyarı bulunamadı. Bu, güvenli olduğu anlamına gelmez; uzman değerlendirmesi esastır.")];
  const out: ReportChild[] = [h3("Güvenlik & Uyarılar")];
  if (photo.length) out.push(bodyText(`Fotosensitif yağlar (güneş ışığına dikkat): ${photo.join(", ")}`));
  for (const w of warns) out.push(bulletItem(w));
  return out;
}

/** Tek karışımın formül/reçetesi. */
export function renderBlendFormula(b: BlendExportRow, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const items = b.items ?? [];

  // Başlangıç bloğu: karışım adı + künye + "Formül" başlığı + formül tablosu.
  const startBlock: (Paragraph | Table)[] = [heading(nameLevel, s(b.name) || "İsimsiz Karışım"), twoColTable(kvRows(b))];
  if (items.length) {
    startBlock.push(h3("Formül"));
    const rows = items.map((it) => [
      s(it.oil_name), s(it.latin_name), oilTypeLabel(it.oil_type), `${Math.max(0, Math.floor(it.drops || 0))}`,
      it.is_photosensitive ? "☀ Evet" : "—",
    ]);
    startBlock.push(...repeatingHeaderTable(
      ["Uçucu Yağ", "Latince Adı", "Tip", "Damla", "Fotosensitif"],
      [28, 30, 18, 12, 12],
      rows,
    ));
  }

  const out: ReportChild[] = [];
  // Küçük/orta karışım → başlangıç bloğu tek cantSplit sarmalayıcıda birlikte kalır (ad/künye
  // önceki sayfada, Formül sonraki sayfada kalması giderilir). Uzun karışım → düz akış: formül
  // tablosu doğal olarak satır satır bölünür, tekrarlayan başlık + cantSplit korunur.
  if (items.length && items.length <= BLEND_KEEP_TOGETHER_MAX_ITEMS) {
    out.push(keepTogetherCard(startBlock));
  } else {
    out.push(...startBlock);
  }

  out.push(...safetyBlock(items));
  if (has(b.notes)) out.push(h3("Notlar"), bodyText(s(b.notes)));
  out.push(spacer());
  return out;
}

/** Çok karışımlı bölüm. asMainSection → H1 "KARIŞIMLAR". */
export function renderBlendsSection(blends: BlendExportRow[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!blends.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored("KARIŞIMLAR", AROMA_COLORS.blends, opts.sectionBreak ?? true));
  for (const b of blends) out.push(...renderBlendFormula(b, "h2"));
  return out;
}
