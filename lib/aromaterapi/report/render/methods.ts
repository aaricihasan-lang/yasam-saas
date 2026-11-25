/**
 * Aromaterapi Word — Yöntem (method series + revision) renderer'ı. Saf.
 * Immutable series/revision modeline sadık: identity + revizyon geçmişi + doğrulanmış/son
 * revizyonun TAM içeriği (method_text/steps/quality/safety). faithful/editorial/expert ayrı.
 */

import { h1Colored, twoColTable, bodyText, muted, spacer, orderedSteps, repeatingHeaderTable, type ReportChild } from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS } from "../theme";
import { statusLabel } from "./catalog";
import { looseDayKey } from "@/lib/time/reportTime";
import type { MethodSeriesDetail, MethodRevisionDetail } from "@/lib/aromaterapi/readTypes";
import { aromaText } from "../text";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;

// Yöntem türü etiketi çıktı dilinde (reports.aromatherapy.methodKind.*). Bilinmeyen kod aynen.
const KIND_CODES = new Set(["faithful_source", "editorial", "expert"]);

export interface MethodSeriesExport { series: MethodSeriesDetail; content: MethodRevisionDetail | null; prepLabel?: string | null }

export function renderMethodSeries(m: MethodSeriesExport, nameLevel: "h2" | "h3" = "h2", stepInstance = 0): ReportChild[] {
  const { series, content } = m;
  const x = aromaText().t;
  const out: ReportChild[] = [];
  const kind = KIND_CODES.has(s(series.method_kind)) ? x(`methodKind.${s(series.method_kind)}`) : s(series.method_kind);
  const title = has(m.prepLabel) ? `${s(m.prepLabel)} — ${kind}` : has(series.source_title) ? `${kind}: ${s(series.source_title)}` : kind;
  out.push(nameLevel === "h2" ? h2(title) : h3(title));

  const rows: [string, string][] = [[x("methods.field.kind"), kind]];
  const add = (l: string, v: unknown) => { if (has(v)) rows.push([l, s(v)]); };
  add(x("methods.field.lang"), series.method_lang);
  add(x("methods.field.source"), series.source_title);
  add(x("methods.field.passage"), series.passage_locator);
  if (typeof series.revision_count === "number") rows.push([x("methods.field.revisionCount"), String(series.revision_count)]);
  if (series.verified_revision != null) rows.push([x("methods.field.verifiedRevision"), x("methods.rev", { n: String(series.verified_revision) })]);
  out.push(twoColTable(rows));

  if (content) {
    out.push(h3(x("methods.contentTitle", { n: String(content.revision), status: statusLabel(content.status) })));
    const c = content;
    const meta: [string, string][] = [];
    const cadd = (l: string, v: unknown) => { if (has(v)) meta.push([l, s(v)]); };
    cadd(x("methods.field.plantPart"), c.plant_part_used);
    cadd(x("methods.field.materialState"), c.material_state);
    cadd(x("methods.field.equipment"), c.equipment);
    cadd(x("methods.field.amountRatio"), c.amount_ratio);
    cadd(x("methods.field.solvent"), c.solvent_carrier);
    cadd(x("methods.field.duration"), c.duration_text);
    cadd(x("methods.field.temperature"), c.temperature_text);
    cadd(x("methods.field.filtration"), c.filtration);
    cadd(x("methods.field.resting"), c.resting);
    cadd(x("methods.field.storage"), c.storage);
    if (meta.length) out.push(twoColTable(meta));
    if (has(c.method_text)) out.push(bodyText(s(c.method_text)));
    out.push(...orderedSteps(x("methods.steps"), c.steps, stepInstance));
    if (has(c.quality_notes)) out.push(h3(x("methods.quality")), bodyText(s(c.quality_notes)));
    if (has(c.safety_notes)) out.push(h3(x("methods.safety")), bodyText(s(c.safety_notes)));
  } else {
    out.push(muted(x("methods.noContent")));
  }

  // Revizyon geçmişi
  const revs = series.revisions ?? [];
  if (revs.length) {
    out.push(h3(x("methods.history")));
    out.push(...repeatingHeaderTable([x("methods.col.revision"), x("methods.col.status"), x("methods.col.updated")], [30, 40, 30],
      // FA-02: updated_at timestamptz → Europe/Istanbul günü (UTC dilimi "dün" üretmez).
      revs.map((r) => [x("methods.rev", { n: String(r.revision) }), statusLabel(r.status), looseDayKey(s(r.updated_at)) || s(r.updated_at).slice(0, 10)])));
  }
  out.push(spacer());
  return out;
}

export function renderMethodsSection(list: MethodSeriesExport[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!list.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored(aromaText().t("methods.section"), AROMA_COLORS.methods, opts.sectionBreak ?? true));
  // Her yöntemin adım listesi ayrı `instance` → Word numaralaması her listede 1'den başlar.
  list.forEach((m, i) => out.push(...renderMethodSeries(m, "h2", i + 1)));
  return out;
}
