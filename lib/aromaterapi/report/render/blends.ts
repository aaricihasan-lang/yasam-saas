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
import { AROMA_COLORS, oilTypeLabel, dateStamp } from "../theme";
import type { BlendExportRow, BlendItemSnapshot } from "../reads";
import { derivePhotosensitivity, type PhotosensitivityStatus } from "@/lib/aromaterapi/oilFields";
import { aromaText } from "../text";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;
const heading = (level: "h2" | "h3", text: string) => (level === "h2" ? h2(text) : h3(text));

/** Formül tablosu için kısa fotosensitivite hücresi (tri-state; ARO-024). */
function photoCell(status: PhotosensitivityStatus): string {
  const t = aromaText().t;
  return status === "yes" ? t("blends.photo.yes") : status === "no" ? t("blends.photo.no") : t("blends.photo.unknown");
}

/** Kalemlerin damla toplamı (formül gerçeği). Hedef damla (total_drops) ile KONFLATE edilmez (ARO-006). */
function itemsDropSum(items: BlendItemSnapshot[]): number {
  return items.reduce((a, it) => a + Math.max(0, Math.floor(it.drops || 0)), 0);
}

/** Karışım snapshot tarihi (ARO-023) — gerçek created_at/updated_at; yoksa UYDURULMAZ. */
function snapshotDateStamp(b: BlendExportRow): string {
  const raw = s(b.created_at) || s(b.updated_at);
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : dateStamp(d);
}

/**
 * Küçük/orta karışım eşiği (yağ sayısı — SEMANTİK boyut ölçütü; kırılgan piksel-yükseklik
 * tahmini DEĞİL). Bu sınıra kadar başlangıç bloğu (ad+künye+Formül+formül tablosu)
 * keepTogetherCard ile birlikte tutulur; üstünde ise düz akış (uzun formül doğal bölünür).
 * ~12 yağ + künye + başlıklar bir sayfanın altında rahat sığar.
 */
const BLEND_KEEP_TOGETHER_MAX_ITEMS = 12;

function kvRows(b: BlendExportRow): [string, string][] {
  const t = aromaText().t;
  const drops = (n: number) => t("blends.dropsValue", { count: n, value: String(n) });
  const rows: [string, string][] = [];
  if (has(b.carrier_oil_name)) rows.push([t("blends.field.carrier"), s(b.carrier_oil_name)]);
  if (b.bottle_ml > 0) rows.push([t("blends.field.bottle"), `${b.bottle_ml} ml`]);
  if (b.dilution_percent > 0) rows.push([t("blends.field.dilution"), t("blends.percentValue", { value: String(b.dilution_percent) })]);
  if (b.drops_per_ml > 0) rows.push([t("blends.field.dropsPerMl"), t("blends.dropsPerMlValue", { value: String(b.drops_per_ml) })]);
  // ARO-006: Hedef damla (reçetenin hedefi) ile yağların gerçek damla toplamı AYRI gösterilir.
  if (b.total_drops > 0) rows.push([t("blends.field.targetDrops"), drops(b.total_drops)]);
  rows.push([t("blends.field.dropSum"), drops(itemsDropSum(b.items ?? []))]);
  rows.push([t("blends.field.oilCount"), String((b.items ?? []).length)]);
  return rows;
}

/**
 * Karışım güvenlik özeti — kalem (item) fotosensitivite + kontrendikasyon/uyarı VE taşıyıcı
 * (carrier) yağ güvenliği (ARO-024). Fotosensitivite tri-state derivePhotosensitivity ile
 * (eski snapshot'larda kolon yoksa is_photosensitive'e düşer). Snapshot-tarih notu (ARO-023).
 */
function safetyBlock(b: BlendExportRow): ReportChild[] {
  const t = aromaText().t;
  const items = b.items ?? [];
  const photo = items.filter((it) => derivePhotosensitivity(it) === "yes").map((it) => s(it.oil_name)).filter(Boolean);
  const warns: string[] = [];
  for (const it of items) {
    const c = s(it.contraindications), sn = s(it.safety_notes);
    if (c) warns.push(t("blends.contraLine", { name: s(it.oil_name), value: c }));
    if (sn) warns.push(t("blends.safetyLine", { name: s(it.oil_name), value: sn }));
  }

  // ARO-024: taşıyıcı (sabit) yağ güvenliği — status yalnız kolon; is_photosensitive yok → derive status'tan okur.
  const carrierName = s(b.carrier_oil_name);
  const carrierPhoto = derivePhotosensitivity({ photosensitivity_status: b.carrier_photosensitivity_status });
  const carrierC = s(b.carrier_contraindications), carrierSn = s(b.carrier_safety_notes);
  const carrierLines: string[] = [];
  if (carrierName) {
    if (carrierPhoto === "yes") carrierLines.push(t("blends.photoLine", { name: carrierName }));
    if (carrierC) carrierLines.push(t("blends.contraLine", { name: carrierName, value: carrierC }));
    if (carrierSn) carrierLines.push(t("blends.safetyLine", { name: carrierName, value: carrierSn }));
  }

  const out: ReportChild[] = [];
  if (!photo.length && !warns.length && !carrierLines.length) {
    // ARO: "Bilinen uyarı yok ≠ güvenli" disclaimer KORUNUR.
    out.push(muted(t("blends.noWarnings")));
  } else {
    out.push(h3(t("blends.safetyTitle")));
    if (photo.length) out.push(bodyText(t("blends.photoOils", { names: photo.join(", ") })));
    for (const w of warns) out.push(bulletItem(w));
    if (carrierLines.length) {
      out.push(bodyText(t("blends.carrierSafety")));
      for (const cl of carrierLines) out.push(bulletItem(cl));
    }
  }

  // ARO-023: güvenlik bilgisi snapshot tarihine aittir (gerçek tarih varsa eklenir; yoksa uydurulmaz).
  const ds = snapshotDateStamp(b);
  out.push(muted(ds
    ? t("blends.snapshotDated", { date: ds })
    : t("blends.snapshotUndated")));
  return out;
}

/** Tek karışımın formül/reçetesi. */
export function renderBlendFormula(b: BlendExportRow, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const t = aromaText().t;
  const items = b.items ?? [];

  // Başlangıç bloğu: karışım adı + künye + "Formül" başlığı + formül tablosu.
  const startBlock: (Paragraph | Table)[] = [heading(nameLevel, s(b.name) || t("blends.unnamed")), twoColTable(kvRows(b))];
  if (items.length) {
    startBlock.push(h3(t("blends.formula")));
    const rows = items.map((it) => [
      s(it.oil_name), s(it.latin_name), oilTypeLabel(it.oil_type), `${Math.max(0, Math.floor(it.drops || 0))}`,
      photoCell(derivePhotosensitivity(it)),
    ]);
    startBlock.push(...repeatingHeaderTable(
      [t("blends.col.oil"), t("blends.col.latin"), t("blends.col.type"), t("blends.col.drops"), t("blends.col.photo")],
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

  out.push(...safetyBlock(b));
  if (has(b.notes)) out.push(h3(t("blends.notes")), bodyText(s(b.notes)));
  out.push(spacer());
  return out;
}

/** Çok karışımlı bölüm. asMainSection → H1 "KARIŞIMLAR". */
export function renderBlendsSection(blends: BlendExportRow[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!blends.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored(aromaText().t("blends.section"), AROMA_COLORS.blends, opts.sectionBreak ?? true));
  for (const b of blends) out.push(...renderBlendFormula(b, "h2"));
  return out;
}
