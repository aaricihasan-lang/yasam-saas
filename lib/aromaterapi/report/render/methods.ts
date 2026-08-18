/**
 * Aromaterapi Word — Yöntem (method series + revision) renderer'ı. Saf.
 * Immutable series/revision modeline sadık: identity + revizyon geçmişi + doğrulanmış/son
 * revizyonun TAM içeriği (method_text/steps/quality/safety). faithful/editorial/expert ayrı.
 */

import { h1Colored, twoColTable, bodyText, muted, spacer, orderedSteps, repeatingHeaderTable, type ReportChild } from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS } from "../theme";
import { statusLabel } from "./catalog";
import type { MethodSeriesDetail, MethodRevisionDetail } from "@/lib/aromaterapi/readTypes";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;

const KIND_LABEL: Record<string, string> = { faithful_source: "Kaynağa Sadık Yöntem", editorial: "Editoryal Yöntem", expert: "Uzman Yöntemi" };

export interface MethodSeriesExport { series: MethodSeriesDetail; content: MethodRevisionDetail | null; prepLabel?: string | null }

export function renderMethodSeries(m: MethodSeriesExport, nameLevel: "h2" | "h3" = "h2", stepInstance = 0): ReportChild[] {
  const { series, content } = m;
  const out: ReportChild[] = [];
  const kind = KIND_LABEL[s(series.method_kind)] ?? s(series.method_kind);
  const title = has(m.prepLabel) ? `${s(m.prepLabel)} — ${kind}` : has(series.source_title) ? `${kind}: ${s(series.source_title)}` : kind;
  out.push(nameLevel === "h2" ? h2(title) : h3(title));

  const rows: [string, string][] = [["Yöntem Türü", kind]];
  const add = (l: string, v: unknown) => { if (has(v)) rows.push([l, s(v)]); };
  add("Dil", series.method_lang);
  add("Kaynak", series.source_title);
  add("Pasaj", series.passage_locator);
  if (typeof series.revision_count === "number") rows.push(["Toplam Revizyon", String(series.revision_count)]);
  if (series.verified_revision != null) rows.push(["Doğrulanmış Revizyon", `Rev. ${series.verified_revision}`]);
  out.push(twoColTable(rows));

  if (content) {
    out.push(h3(`Yöntem İçeriği (Revizyon ${content.revision} · ${statusLabel(content.status)})`));
    const c = content;
    const meta: [string, string][] = [];
    const cadd = (l: string, v: unknown) => { if (has(v)) meta.push([l, s(v)]); };
    cadd("Kullanılan Bitki Bölümü", c.plant_part_used);
    cadd("Materyal Durumu", c.material_state);
    cadd("Ekipman", c.equipment);
    cadd("Miktar / Oran", c.amount_ratio);
    cadd("Çözücü / Taşıyıcı", c.solvent_carrier);
    cadd("Süre", c.duration_text);
    cadd("Sıcaklık", c.temperature_text);
    cadd("Filtrasyon", c.filtration);
    cadd("Dinlendirme", c.resting);
    cadd("Saklama", c.storage);
    if (meta.length) out.push(twoColTable(meta));
    if (has(c.method_text)) out.push(bodyText(s(c.method_text)));
    out.push(...orderedSteps("Uygulama Adımları", c.steps, stepInstance));
    if (has(c.quality_notes)) out.push(h3("Kalite Notları"), bodyText(s(c.quality_notes)));
    if (has(c.safety_notes)) out.push(h3("Güvenlik Notları"), bodyText(s(c.safety_notes)));
  } else {
    out.push(muted("Doğrulanmış veya yayımlanabilir revizyon içeriği bulunamadı."));
  }

  // Revizyon geçmişi
  const revs = series.revisions ?? [];
  if (revs.length) {
    out.push(h3("Revizyon Geçmişi"));
    out.push(...repeatingHeaderTable(["Revizyon", "Durum", "Güncellenme"], [30, 40, 30],
      revs.map((r) => [`Rev. ${r.revision}`, statusLabel(r.status), s(r.updated_at).slice(0, 10)])));
  }
  out.push(spacer());
  return out;
}

export function renderMethodsSection(list: MethodSeriesExport[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!list.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored("YÖNTEMLER & REVİZYONLAR", AROMA_COLORS.methods, opts.sectionBreak ?? true));
  // Her yöntemin adım listesi ayrı `instance` → Word numaralaması her listede 1'den başlar.
  list.forEach((m, i) => out.push(...renderMethodSeries(m, "h2", i + 1)));
  return out;
}
