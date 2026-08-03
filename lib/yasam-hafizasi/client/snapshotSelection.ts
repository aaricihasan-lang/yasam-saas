/**
 * BF-14 Paket 2 — Snapshot seçim isteği doğrulama (SAF; test edilebilir).
 *
 * BAĞLAYICI SÖZLEŞME (§5): seçim isteği SERBEST METİN veya snapshot İÇERİĞİ TAŞIMAZ.
 * İstemci yalnız bir REFERANS gönderir: { scope, indexId, ordering?, expertNote? }.
 * title/snippet/selectedText/evidence/provenance/sourceTable/sourceId/tenantId/clientId
 * gibi alanlar BURADA OKUNMAZ (server tarafı içeriği index satırından yeniden üretir).
 * tenant/client de BURADA OKUNMAZ (tenant session'dan, client URL'den).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SNAPSHOT_MAX_ITEMS = 50;
export const SNAPSHOT_EXPERT_NOTE_MAX = 2000;

export type SnapshotScope = "professional" | "client";
export type SnapshotTargetKind = "report" | "protocol" | "guide";

/** Tek seçim referansı (İÇERİK DEĞİL — yalnız index satırına işaret eder). */
export interface SnapshotSelectionRef {
  scope: SnapshotScope;
  indexId: string;
  ordering?: number;
  expertNote?: string;
}

export interface ParsedSnapshotCreate {
  targetKind: SnapshotTargetKind;
  /** protocol/guide → zorunlu uuid; report → daima null. */
  targetRef: string | null;
  /** Var → mevcut seçim grubuna ekle; yok → server yeni grup üretir. */
  selectionGroupId?: string;
  items: SnapshotSelectionRef[];
}

export type ParseSnapshotCreateResult =
  | { ok: true; value: ParsedSnapshotCreate }
  | { ok: false; code: string };

function isScope(v: unknown): v is SnapshotScope {
  return v === "professional" || v === "client";
}
function isTargetKind(v: unknown): v is SnapshotTargetKind {
  return v === "report" || v === "protocol" || v === "guide";
}

/** POST gövdesini doğrular. İçerik alanları GÖRMEZDEN GELİNİR (server-derived). */
export function parseSnapshotCreate(body: unknown): ParseSnapshotCreateResult {
  if (!body || typeof body !== "object") return { ok: false, code: "YH_SNAP_INVALID_BODY" };
  const b = body as Record<string, unknown>;

  if (!isTargetKind(b.targetKind)) return { ok: false, code: "YH_SNAP_INVALID_TARGET" };
  const targetKind = b.targetKind;

  // report → target_ref daima null; protocol/guide → geçerli uuid ZORUNLU.
  let targetRef: string | null = null;
  if (targetKind === "protocol" || targetKind === "guide") {
    if (typeof b.targetRef !== "string" || !UUID_RE.test(b.targetRef)) {
      return { ok: false, code: "YH_SNAP_INVALID_TARGET_REF" };
    }
    targetRef = b.targetRef;
  }

  let selectionGroupId: string | undefined;
  if (b.selectionGroupId !== undefined && b.selectionGroupId !== null) {
    if (typeof b.selectionGroupId !== "string" || !UUID_RE.test(b.selectionGroupId)) {
      return { ok: false, code: "YH_SNAP_INVALID_GROUP" };
    }
    selectionGroupId = b.selectionGroupId;
  }

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, code: "YH_SNAP_NO_ITEMS" };
  }
  if (b.items.length > SNAPSHOT_MAX_ITEMS) {
    return { ok: false, code: "YH_SNAP_TOO_MANY_ITEMS" };
  }

  const items: SnapshotSelectionRef[] = [];
  const seen = new Set<string>();
  for (const raw of b.items) {
    if (!raw || typeof raw !== "object") return { ok: false, code: "YH_SNAP_INVALID_ITEM" };
    const it = raw as Record<string, unknown>;
    if (!isScope(it.scope)) return { ok: false, code: "YH_SNAP_INVALID_SCOPE" };
    if (typeof it.indexId !== "string" || !UUID_RE.test(it.indexId)) {
      return { ok: false, code: "YH_SNAP_INVALID_INDEX_ID" };
    }
    // Aynı istek içinde (scope+indexId) tekrarını idempotent düşür.
    const key = `${it.scope}:${it.indexId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let ordering: number | undefined;
    if (it.ordering !== undefined) {
      const n = Number(it.ordering);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return { ok: false, code: "YH_SNAP_INVALID_ORDERING" };
      ordering = n;
    }

    let expertNote: string | undefined;
    if (it.expertNote !== undefined && it.expertNote !== null) {
      if (typeof it.expertNote !== "string") return { ok: false, code: "YH_SNAP_INVALID_NOTE" };
      if (it.expertNote.length > SNAPSHOT_EXPERT_NOTE_MAX) return { ok: false, code: "YH_SNAP_NOTE_TOO_LONG" };
      const trimmed = it.expertNote.trim();
      if (trimmed.length > 0) expertNote = trimmed;
    }

    // NOT: it.title / it.selectedText / it.evidence / it.provenance / it.sourceTable /
    // it.sourceId / it.tenantId / it.clientId GÖRMEZDEN GELİNİR — asla okunmaz.
    items.push({ scope: it.scope, indexId: it.indexId, ...(ordering !== undefined ? { ordering } : {}), ...(expertNote ? { expertNote } : {}) });
  }

  if (items.length === 0) return { ok: false, code: "YH_SNAP_NO_ITEMS" };

  return { ok: true, value: { targetKind, targetRef, ...(selectionGroupId ? { selectionGroupId } : {}), items } };
}

/** DELETE isteği: seçim grubundan tek snapshot kaldırma referansı. */
export interface ParsedSnapshotDelete {
  selectionGroupId: string;
  snapshotId: string;
}
export type ParseSnapshotDeleteResult =
  | { ok: true; value: ParsedSnapshotDelete }
  | { ok: false; code: string };

export function parseSnapshotDelete(body: unknown): ParseSnapshotDeleteResult {
  if (!body || typeof body !== "object") return { ok: false, code: "YH_SNAP_INVALID_BODY" };
  const b = body as Record<string, unknown>;
  if (typeof b.selectionGroupId !== "string" || !UUID_RE.test(b.selectionGroupId)) {
    return { ok: false, code: "YH_SNAP_INVALID_GROUP" };
  }
  if (typeof b.snapshotId !== "string" || !UUID_RE.test(b.snapshotId)) {
    return { ok: false, code: "YH_SNAP_INVALID_SNAPSHOT" };
  }
  return { ok: true, value: { selectionGroupId: b.selectionGroupId, snapshotId: b.snapshotId } };
}

export function isSnapshotScope(v: unknown): v is SnapshotScope {
  return isScope(v);
}
