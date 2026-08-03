/**
 * BF-14 Paket 1 — Rapor snapshot builder FOUNDATION (SAF; test edilebilir).
 *
 * BAĞLAYICI: snapshot metni client'tan gelen serbest DTO'dan ÜRETİLEMEZ. Bu builder
 * yalnız SERVER tarafından okunmuş + ownership doğrulanmış bir kaynak adayından
 * kontrollü snapshot satırı üretir. Immutable içerik + content_hash + limitler.
 *
 * Paket 1'de canlı Word/protokol/guide route'una BAĞLANMAZ (tüketim = Paket 2).
 */
import { createHash } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECTED_TEXT_MAX = 8000;
const EXPERT_NOTE_MAX = 2000;

export type SnapshotTargetKind = "report" | "protocol" | "guide";

/** Server tarafından okunmuş, ownership doğrulanmış kaynak adayı (client metni DEĞİL). */
export interface SnapshotSourceCandidate {
  sourceModule: string;
  sourceTable: string;
  sourceId: string;
  sectionRef?: string | null;
  unitType?: "record" | "section" | "row";
  title?: string | null;
  selectedText?: string | null;
  evidence?: { kind: string; text: string }[];
  sourceUpdatedAt?: string | null;
  sourceAvailable?: boolean;
}

export interface SnapshotContext {
  tenantId: string;
  clientId: string;
  targetKind: SnapshotTargetKind;
  targetRef?: string | null;
  selectionGroup: string;
  selectedBy: string;
  ordering?: number;
  expertNote?: string | null;
}

export type BuildSnapshotResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; code: string };

function contentHash(c: SnapshotSourceCandidate): string {
  const canonical = JSON.stringify({
    st: c.sourceTable,
    sid: c.sourceId,
    sref: c.sectionRef ?? null,
    title: c.title ?? null,
    text: c.selectedText ?? null,
    ev: (c.evidence ?? []).map((e) => [e.kind, e.text]),
  });
  return createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex");
}

/** Kontrollü snapshot satırı üretir (append-only tablo için). */
export function buildReportSnapshot(
  candidate: SnapshotSourceCandidate,
  context: SnapshotContext,
): BuildSnapshotResult {
  if (!UUID_RE.test(context.tenantId) || !UUID_RE.test(context.clientId)) {
    return { ok: false, code: "YH_SNAPSHOT_INVALID_SCOPE" };
  }
  if (!UUID_RE.test(context.selectedBy)) return { ok: false, code: "YH_SNAPSHOT_INVALID_ACTOR" };
  if (!UUID_RE.test(context.selectionGroup)) return { ok: false, code: "YH_SNAPSHOT_INVALID_SELECTION" };
  if (!UUID_RE.test(candidate.sourceId)) return { ok: false, code: "YH_SNAPSHOT_INVALID_SOURCE" };
  if (!["report", "protocol", "guide"].includes(context.targetKind)) {
    return { ok: false, code: "YH_SNAPSHOT_INVALID_TARGET" };
  }
  if (typeof candidate.selectedText === "string" && candidate.selectedText.length > SELECTED_TEXT_MAX) {
    return { ok: false, code: "YH_SNAPSHOT_TEXT_TOO_LONG" };
  }
  if (typeof context.expertNote === "string" && context.expertNote.length > EXPERT_NOTE_MAX) {
    return { ok: false, code: "YH_SNAPSHOT_NOTE_TOO_LONG" };
  }

  const provenance = {
    sourceModule: candidate.sourceModule,
    sourceTable: candidate.sourceTable,
    sourceId: candidate.sourceId,
    sectionRef: candidate.sectionRef ?? null,
    sourceUpdatedAt: candidate.sourceUpdatedAt ?? null,
  };

  return {
    ok: true,
    row: {
      tenant_id: context.tenantId,
      client_id: context.clientId,
      target_kind: context.targetKind,
      target_ref: context.targetRef ?? null,
      selection_group: context.selectionGroup,
      source_module: candidate.sourceModule,
      source_table: candidate.sourceTable,
      source_id: candidate.sourceId,
      section_ref: candidate.sectionRef ?? null,
      unit_type: candidate.unitType ?? "record",
      title: candidate.title ?? null,
      selected_text: candidate.selectedText ?? null,
      evidence: candidate.evidence ?? [],
      provenance,
      source_updated_at: candidate.sourceUpdatedAt ?? null,
      content_hash: contentHash(candidate),
      ordering: Number.isInteger(context.ordering) ? context.ordering : 0,
      expert_note: context.expertNote ?? null,
      selected_by: context.selectedBy,
      source_available_at_snapshot: candidate.sourceAvailable !== false,
    },
  };
}
