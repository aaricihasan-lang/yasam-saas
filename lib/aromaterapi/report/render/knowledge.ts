/**
 * Aromaterapi Word — Bilgi Kaydı / Claim renderer'ı. Saf.
 * Epistemik katmanlar AYRI: sonuç ≠ gerekçe ≠ kaynak alıntısı ≠ sadık çeviri ≠ ilişki.
 * Tek paragrafta eritme YOK; long-form TAM.
 */

import { h1Colored, twoColTable, bodyText, muted, spacer, bulletItem, type ReportChild } from "@/lib/docx/reportHelpers";
import { h2, h3 } from "../headings";
import { AROMA_COLORS } from "../theme";
import { statusLabel } from "./catalog";
import {
  formatApplicationRoute, formatTargetPopulation, formatRelationType, formatEvidenceRelation,
  formatRationaleStatus, formatEvidenceLayer, formatConclusionProvenance, formatOutcomeType, formatSourceRole, formatPassageKind,
} from "../labels";
import type { KnowledgeRecordDetail } from "@/lib/aromaterapi/readTypes";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const has = (v: unknown): boolean => s(v).length > 0;

const CLAIM_TYPE: Record<string, string> = { safety: "Güvenlik", use: "Kullanım", identity: "Kimlik", chemistry: "Kimya" };

export function renderKnowledgeRecord(k: KnowledgeRecordDetail, nameLevel: "h2" | "h3" = "h2"): ReportChild[] {
  const out: ReportChild[] = [];
  const prep = k.preparation?.taxon_canonical_name ?? "";
  const title = [s(prep), CLAIM_TYPE[s(k.claim_type)] ?? s(k.claim_type), has(k.safety_topic) ? s(k.safety_topic) : ""].filter(Boolean).join(" — ") || "Bilgi Kaydı";
  out.push(nameLevel === "h2" ? h2(title) : h3(title));

  const meta: [string, string][] = [];
  const add = (l: string, v: unknown) => { if (has(v)) meta.push([l, s(v)]); };
  // Enum alanlar SUNUM katmanında Türkçeleşir (DB değeri değişmez); bilinmeyen → humanize.
  const addMapped = (l: string, raw: unknown, fmt: (c: string | null | undefined) => string) => { if (has(raw)) meta.push([l, fmt(s(raw))]); };
  add("İddia Türü", CLAIM_TYPE[s(k.claim_type)] ?? s(k.claim_type));
  add("Güvenlik Konusu", k.safety_topic);
  addMapped("Uygulama Yolu", k.route, formatApplicationRoute);
  add("Preparat Bağlamı", k.preparation_context);
  addMapped("Kanıt Katmanı", k.evidence_layer, formatEvidenceLayer);
  addMapped("Sonuç Kaynağı", k.conclusion_provenance, formatConclusionProvenance);
  addMapped("Sonuç Türü", k.outcome_type, formatOutcomeType);
  rows_push(meta, "Durum", statusLabel(k.status));
  out.push(twoColTable(meta));

  if (has(k.conclusion)) out.push(h3("Sonuç"), bodyText(s(k.conclusion)));
  if (has(k.rationale)) out.push(h3(`Gerekçe${has(k.rationale_status) ? ` (${formatRationaleStatus(s(k.rationale_status))})` : ""}`), bodyText(s(k.rationale)));

  // Popülasyon / uygulama yolları (kodlar → Türkçe etiket)
  const routes = (k.routes ?? []).map((r) => s(r.route_code)).filter(Boolean);
  if (routes.length) { out.push(h3("Uygulama Yolları")); routes.forEach((r) => out.push(bulletItem(formatApplicationRoute(r)))); }
  const pops = (k.populations ?? []).map((p) => `${formatTargetPopulation(s(p.population_code))}${p.age_min != null || p.age_max != null ? ` (${p.age_min ?? "?"}–${p.age_max ?? "?"})` : ""}`);
  if (pops.length) { out.push(h3("Hedef Popülasyonlar")); pops.forEach((p) => out.push(bulletItem(p))); }

  // Kaynaklar — epistemik katmanlar AYRI
  for (const src of k.sources ?? []) {
    out.push(h3(`Kaynak: ${s(src.source_title) || s(src.source_id)}${has(src.source_role) ? ` (${formatSourceRole(s(src.source_role))})` : ""}`));
    if (has(src.locator_text)) out.push(muted(`Konum: ${s(src.locator_text)}`));
    if (has(src.source_original_excerpt)) out.push(bodyText(`Özgün Kaynak Alıntısı: ${s(src.source_original_excerpt)}`));
    if (has(src.faithful_translation)) out.push(bodyText(`Sadık Çeviri: ${s(src.faithful_translation)}`));
  }

  // İlişkili pasajlar (passage_kind + evidence_relation → Türkçe)
  const pas = (k.passages ?? []).map((p) => `${s(p.passage_locator_label) || s(p.passage_id)} — ${formatPassageKind(s(p.passage_kind))} / ${formatEvidenceRelation(s(p.evidence_relation))}`);
  if (pas.length) { out.push(h3("İlişkili Pasajlar")); pas.forEach((p) => out.push(bulletItem(p))); }

  // İlişkiler (relation_type → Türkçe; "supports" vb. de Türkçeleşir)
  for (const rel of k.relations ?? []) {
    if (has(rel.explanation_tr)) out.push(h3(`İlişki (${formatRelationType(s(rel.relation_type))})`), bodyText(s(rel.explanation_tr)));
  }
  out.push(spacer());
  return out;
}

function rows_push(rows: [string, string][], l: string, v: string) { rows.push([l, v]); }

export function renderKnowledgeSection(list: KnowledgeRecordDetail[], opts?: { asMainSection?: boolean; sectionBreak?: boolean }): ReportChild[] {
  if (!list.length) return [];
  const out: ReportChild[] = [];
  if (opts?.asMainSection) out.push(h1Colored("BİLGİ KAYITLARI", AROMA_COLORS.knowledge, opts.sectionBreak ?? true));
  for (const k of list) out.push(...renderKnowledgeRecord(k, "h2"));
  return out;
}
