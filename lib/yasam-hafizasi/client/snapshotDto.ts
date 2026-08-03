/**
 * BF-14 Paket 2 — Snapshot güvenli DTO + rapor öğesi eşlemesi (SAF).
 *
 * Ham tenant_id / client_id / selected_by / source_id / source_table DÖNMEZ (§5, §11).
 * Kullanıcıya yalnız modül etiketi + başlık + seçilen içerik + provenans-tarihi +
 * kaynak-mevcut durumu gösterilir; teknik tablo/UUID gizlenir (§7).
 */
import { moduleLabel as professionalModuleLabel } from "@/lib/yasam-hafizasi/ui/moduleLabels";
import { clientModuleLabel } from "./clientSources";

export type SnapshotTargetKind = "report" | "protocol" | "guide";

export interface SnapshotEvidence {
  kind: string;
  text: string;
}

/** yasam_hafizasi_report_snapshots satırının okunan alt kümesi (server-side). */
export interface SnapshotRow {
  id: string;
  target_kind: string;
  target_ref: string | null;
  selection_group: string;
  source_module: string;
  title: string | null;
  selected_text: string | null;
  evidence: unknown;
  provenance: unknown;
  source_updated_at: string | null;
  ordering: number;
  expert_note: string | null;
  source_available_at_snapshot: boolean;
  created_at: string;
}

/** UI'ya dönen güvenli snapshot DTO (ham scope/tablo/UUID YOK). */
export interface SnapshotDto {
  id: string;
  targetKind: SnapshotTargetKind;
  targetRef: string | null;
  selectionGroupId: string;
  module: string;
  moduleLabel: string;
  title: string | null;
  selectedText: string | null;
  evidence: SnapshotEvidence[];
  sourceUpdatedAt: string | null;
  ordering: number;
  expertNote: string | null;
  sourceAvailable: boolean;
  createdAt: string;
}

/** Word teslim katmanında kullanılan minimal rapor öğesi (PII-siz, server-derived). */
export interface SnapshotReportItem {
  moduleLabel: string;
  title: string | null;
  selectedText: string | null;
  evidence: SnapshotEvidence[];
  sourceUpdatedAt: string | null;
  expertNote: string | null;
  sourceAvailable: boolean;
}

/** Client + professional modül etiketlerini tek noktadan çözer (bilinmezse ham değer). */
export function snapshotModuleLabel(module: string): string {
  const client = clientModuleLabel(module);
  if (client !== module) return client;
  return professionalModuleLabel(module);
}

function asEvidence(v: unknown): SnapshotEvidence[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ kind: typeof e.kind === "string" ? e.kind : "", text: typeof e.text === "string" ? e.text : "" }))
    .filter((e) => e.text.length > 0)
    .slice(0, 12);
}

function normTargetKind(v: string): SnapshotTargetKind {
  return v === "protocol" || v === "guide" ? v : "report";
}

/** Snapshot satırı → güvenli UI DTO (ham alanlar hariç). */
export function toSnapshotDto(row: SnapshotRow): SnapshotDto {
  return {
    id: row.id,
    targetKind: normTargetKind(row.target_kind),
    targetRef: row.target_ref,
    selectionGroupId: row.selection_group,
    module: row.source_module,
    moduleLabel: snapshotModuleLabel(row.source_module),
    title: row.title,
    selectedText: row.selected_text,
    evidence: asEvidence(row.evidence),
    sourceUpdatedAt: row.source_updated_at,
    ordering: Number.isInteger(row.ordering) ? row.ordering : 0,
    expertNote: row.expert_note,
    sourceAvailable: row.source_available_at_snapshot !== false,
    createdAt: row.created_at,
  };
}

/** Snapshot satırı → Word teslim öğesi (yalnız gösterime giren PII-siz alanlar). */
export function toSnapshotReportItem(row: SnapshotRow): SnapshotReportItem {
  return {
    moduleLabel: snapshotModuleLabel(row.source_module),
    title: row.title,
    selectedText: row.selected_text,
    evidence: asEvidence(row.evidence),
    sourceUpdatedAt: row.source_updated_at,
    expertNote: row.expert_note,
    sourceAvailable: row.source_available_at_snapshot !== false,
  };
}

/** Kararlı sıralama: ordering → created_at → id (server + UI ortak sözleşme). */
export function compareSnapshotRows(a: SnapshotRow, b: SnapshotRow): number {
  const ao = Number.isInteger(a.ordering) ? a.ordering : 0;
  const bo = Number.isInteger(b.ordering) ? b.ordering : 0;
  if (ao !== bo) return ao - bo;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
