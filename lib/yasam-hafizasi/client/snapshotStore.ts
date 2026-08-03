/**
 * BF-14 Paket 2 — Snapshot deposu (SERVER; service_role DB erişimi).
 *
 * BAĞLAYICI GÜVENLİK:
 *   - snapshot İÇERİĞİ index satırından SERVER tarafında yeniden üretilir (client'tan
 *     title/text/evidence ALINMAZ). scope+indexId allowlist; arbitrary tablo/id lookup YOK.
 *   - professional satır görünürlüğü: tenant eşleşmesi VEYA shared (tenant NULL) + yh_shared.
 *   - client satır: tenant_id + client_id ile TAM eşleşme (cross-client fail-closed).
 *   - append-only: snapshot UPDATE YOK; seçim kaldırma yalnız kontrollü DELETE.
 *   - selection_group tenant+client ile izole; başka tenant/client grubu okunamaz.
 *   - Şema henüz uygulanmadıysa (dormant) delivery okuması güvenli boş döner.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildReportSnapshot,
  type SnapshotSourceCandidate,
} from "./snapshotBuilder";
import {
  compareSnapshotRows,
  toSnapshotDto,
  toSnapshotReportItem,
  type SnapshotDto,
  type SnapshotReportItem,
  type SnapshotRow,
} from "./snapshotDto";
import type {
  ParsedSnapshotCreate,
  SnapshotSelectionRef,
  SnapshotTargetKind,
} from "./snapshotSelection";

const SNAP_TABLE = "yasam_hafizasi_report_snapshots";
const PRO_INDEX = "yasam_hafizasi_index";
const CLIENT_INDEX = "yasam_hafizasi_client_index";

/** undefined table/function → şema henüz yok (dormant) → güvenli boş. */
const UNAVAILABLE_CODES = new Set(["42883", "42P01", "PGRST202", "PGRST205", "PGRST302"]);

const SNAP_SELECT =
  "id, target_kind, target_ref, selection_group, source_module, title, selected_text, evidence, provenance, source_updated_at, ordering, expert_note, source_available_at_snapshot, created_at";

export interface SnapshotContext {
  db: SupabaseClient;
  tenantId: string;
  clientId: string;
  actorUserId: string;
  /** professional shared (tenant NULL) satırlarına izin (flags.yh_shared). */
  allowShared: boolean;
}

export interface SnapshotTarget {
  targetKind: SnapshotTargetKind;
  targetRef: string | null;
}

export type CreateSnapshotsResult =
  | {
      ok: true;
      selectionGroupId: string;
      targetKind: SnapshotTargetKind;
      targetRef: string | null;
      total: number;
      added: number;
      skipped: number;
      items: SnapshotDto[];
    }
  | { ok: false; code: string; status: number };

interface IndexCandidate extends SnapshotSourceCandidate {
  sourceModule: string;
  sourceTable: string;
  sourceId: string;
}

function evidenceFrom(v: unknown): { kind: string; text: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ kind: typeof e.kind === "string" ? e.kind : "", text: typeof e.text === "string" ? e.text : "" }))
    .filter((e) => e.text.length > 0)
    .slice(0, 12);
}

/** Professional index satırını görünürlük kurallarıyla server-side okur. */
async function readProfessionalCandidate(
  ctx: SnapshotContext,
  indexId: string,
): Promise<IndexCandidate | null> {
  const { data, error } = await ctx.db
    .from(PRO_INDEX)
    .select("id, tenant_id, source_module, source_table, source_id, section_ref, unit_type, title, snippet, evidence_fields, source_updated_at")
    .eq("id", indexId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const rowTenant = row.tenant_id == null ? null : String(row.tenant_id);
  const visible = rowTenant === ctx.tenantId || (rowTenant === null && ctx.allowShared);
  if (!visible) return null;
  const unit = typeof row.unit_type === "string" ? row.unit_type : "record";
  return {
    sourceModule: String(row.source_module ?? ""),
    sourceTable: String(row.source_table ?? ""),
    sourceId: String(row.source_id ?? ""),
    sectionRef: (row.section_ref as string | null) ?? null,
    unitType: unit === "section" || unit === "row" ? unit : "record",
    title: (row.title as string | null) ?? null,
    selectedText: (row.snippet as string | null) ?? null,
    evidence: evidenceFrom(row.evidence_fields),
    sourceUpdatedAt: (row.source_updated_at as string | null) ?? null,
    sourceAvailable: true,
  };
}

/** Client index satırını TAM tenant+client scope ile server-side okur. */
async function readClientCandidate(
  ctx: SnapshotContext,
  indexId: string,
): Promise<IndexCandidate | null> {
  const { data, error } = await ctx.db
    .from(CLIENT_INDEX)
    .select("id, tenant_id, client_id, source_module, source_table, source_id, section_ref, unit_type, title, snippet, evidence_fields, source_updated_at")
    .eq("id", indexId)
    .eq("tenant_id", ctx.tenantId)
    .eq("client_id", ctx.clientId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const unit = typeof row.unit_type === "string" ? row.unit_type : "record";
  return {
    sourceModule: String(row.source_module ?? ""),
    sourceTable: String(row.source_table ?? ""),
    sourceId: String(row.source_id ?? ""),
    sectionRef: (row.section_ref as string | null) ?? null,
    unitType: unit === "section" || unit === "row" ? unit : "record",
    title: (row.title as string | null) ?? null,
    selectedText: (row.snippet as string | null) ?? null,
    evidence: evidenceFrom(row.evidence_fields),
    sourceUpdatedAt: (row.source_updated_at as string | null) ?? null,
    sourceAvailable: true,
  };
}

async function readCandidate(
  ctx: SnapshotContext,
  ref: SnapshotSelectionRef,
): Promise<IndexCandidate | null> {
  return ref.scope === "professional"
    ? readProfessionalCandidate(ctx, ref.indexId)
    : readClientCandidate(ctx, ref.indexId);
}

/** Ham snapshot satırlarını grup için kararlı sırada okur (tenant+client izole). */
async function readGroupRows(
  ctx: SnapshotContext,
  target: SnapshotTarget,
  selectionGroup: string,
): Promise<{ ok: true; rows: SnapshotRow[] } | { ok: false; unavailable: boolean }> {
  let q = ctx.db
    .from(SNAP_TABLE)
    .select(SNAP_SELECT)
    .eq("tenant_id", ctx.tenantId)
    .eq("client_id", ctx.clientId)
    .eq("target_kind", target.targetKind)
    .eq("selection_group", selectionGroup);
  q = target.targetRef === null ? q.is("target_ref", null) : q.eq("target_ref", target.targetRef);

  const { data, error } = await q;
  if (error) return { ok: false, unavailable: !!error.code && UNAVAILABLE_CODES.has(error.code) };
  const rows = (Array.isArray(data) ? data : []) as SnapshotRow[];
  rows.sort(compareSnapshotRows);
  return { ok: true, rows };
}

function dedupeKey(sourceTable: string, sourceId: string, sectionRef: string | null): string {
  return `${sourceTable}::${sourceId}::${sectionRef ?? ""}`;
}

/** Seçim grubu oluşturur/ekler; içerik server-derived; idempotent (aynı kaynak atlanır). */
export async function createSnapshotSelections(
  ctx: SnapshotContext,
  parsed: ParsedSnapshotCreate,
): Promise<CreateSnapshotsResult> {
  const target: SnapshotTarget = { targetKind: parsed.targetKind, targetRef: parsed.targetRef };
  const selectionGroup = parsed.selectionGroupId ?? randomUUID();

  const existing = await readGroupRows(ctx, target, selectionGroup);
  if (!existing.ok) {
    return { ok: false, code: existing.unavailable ? "YH_SNAP_NOT_ACTIVE" : "YH_SNAP_READ_FAILED", status: existing.unavailable ? 409 : 500 };
  }
  // Mevcut grup varsa: hedef tutarlılığı (aynı target_kind/ref) zaten sorguyla garanti.
  const seen = new Set(existing.rows.map((r) => {
    const p = (r.provenance ?? {}) as Record<string, unknown>;
    return dedupeKey(String(p.sourceTable ?? ""), String(p.sourceId ?? ""), (p.sectionRef as string | null) ?? null);
  }));
  let maxOrdering = existing.rows.reduce((m, r) => Math.max(m, Number.isInteger(r.ordering) ? r.ordering : 0), -1);

  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const ref of parsed.items) {
    const cand = await readCandidate(ctx, ref);
    if (!cand) {
      skipped += 1;
      continue;
    }
    const key = dedupeKey(cand.sourceTable, cand.sourceId, cand.sectionRef ?? null);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const ordering = ref.ordering ?? ++maxOrdering;
    const built = buildReportSnapshot(cand, {
      tenantId: ctx.tenantId,
      clientId: ctx.clientId,
      targetKind: parsed.targetKind,
      targetRef: parsed.targetRef,
      selectionGroup,
      selectedBy: ctx.actorUserId,
      ordering,
      expertNote: ref.expertNote ?? null,
    });
    if (!built.ok) {
      skipped += 1;
      continue;
    }
    toInsert.push(built.row);
  }

  if (toInsert.length > 0) {
    const { error } = await ctx.db.from(SNAP_TABLE).insert(toInsert);
    if (error) {
      return { ok: false, code: error.code && UNAVAILABLE_CODES.has(error.code) ? "YH_SNAP_NOT_ACTIVE" : "YH_SNAP_WRITE_FAILED", status: error.code && UNAVAILABLE_CODES.has(error.code) ? 409 : 500 };
    }
  }

  const after = await readGroupRows(ctx, target, selectionGroup);
  const rows = after.ok ? after.rows : [];
  return {
    ok: true,
    selectionGroupId: selectionGroup,
    targetKind: parsed.targetKind,
    targetRef: parsed.targetRef,
    total: rows.length,
    added: toInsert.length,
    skipped,
    items: rows.map(toSnapshotDto),
  };
}

/** GET: ownership-doğrulanmış seçim grubunu güvenli DTO olarak okur. */
export async function readSnapshotSelectionGroup(
  ctx: SnapshotContext,
  target: SnapshotTarget,
  selectionGroup: string,
): Promise<{ ok: true; items: SnapshotDto[] } | { ok: false; notActive: boolean }> {
  const res = await readGroupRows(ctx, target, selectionGroup);
  if (!res.ok) return { ok: false, notActive: res.unavailable };
  return { ok: true, items: res.rows.map(toSnapshotDto) };
}

/** DELETE: seçim grubundan tek snapshot'ı kontrollü kaldırır (içerik değişmez). */
export async function deleteSnapshotSelection(
  ctx: SnapshotContext,
  selectionGroup: string,
  snapshotId: string,
): Promise<{ ok: true; deleted: boolean } | { ok: false; notActive: boolean }> {
  const { data, error } = await ctx.db
    .from(SNAP_TABLE)
    .delete()
    .eq("id", snapshotId)
    .eq("tenant_id", ctx.tenantId)
    .eq("client_id", ctx.clientId)
    .eq("selection_group", selectionGroup)
    .select("id");
  if (error) return { ok: false, notActive: !!error.code && UNAVAILABLE_CODES.has(error.code) };
  return { ok: true, deleted: Array.isArray(data) && data.length > 0 };
}

/**
 * Word teslim rotaları için: seçilmiş snapshotları PII-siz rapor öğesi olarak okur.
 * Şema yoksa / hata / boş → [] (çağıran rota mevcut çıktısını KORUR — regresyonsuz).
 */
export async function readSnapshotsForDelivery(
  db: SupabaseClient,
  args: {
    tenantId: string;
    clientId: string;
    targetKind: SnapshotTargetKind;
    targetRef: string | null;
    selectionGroup: string;
  },
): Promise<SnapshotReportItem[]> {
  try {
    let q = db
      .from(SNAP_TABLE)
      .select(SNAP_SELECT)
      .eq("tenant_id", args.tenantId)
      .eq("client_id", args.clientId)
      .eq("target_kind", args.targetKind)
      .eq("selection_group", args.selectionGroup);
    q = args.targetRef === null ? q.is("target_ref", null) : q.eq("target_ref", args.targetRef);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    const rows = (data as SnapshotRow[]).slice().sort(compareSnapshotRows);
    return rows.map(toSnapshotReportItem);
  } catch {
    return [];
  }
}
