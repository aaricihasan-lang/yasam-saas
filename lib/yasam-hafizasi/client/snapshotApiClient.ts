/**
 * BF-14 Paket 2 — Snapshot seçim istemci yardımcısı (client-safe).
 * Auth başlıkları mevcut kalıpla (x-user-id + x-session-token) gönderilir.
 * İstemci yalnız REFERANS gönderir; içerik server tarafında üretilir (§5).
 */
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { SnapshotDto, SnapshotTargetKind } from "./snapshotDto";

export interface CreateSelectionItem {
  scope: "professional" | "client";
  indexId: string;
  ordering?: number;
  expertNote?: string;
}

export interface CreateSelectionResponse {
  ok: boolean;
  selectionGroupId?: string;
  targetKind?: SnapshotTargetKind;
  targetRef?: string | null;
  total?: number;
  added?: number;
  skipped?: number;
  items?: SnapshotDto[];
  code?: string;
}

function headers(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export async function createSnapshotSelectionGroup(
  clientId: string,
  body: {
    targetKind: SnapshotTargetKind;
    targetRef?: string | null;
    selectionGroupId?: string;
    items: CreateSelectionItem[];
  },
  signal?: AbortSignal,
): Promise<CreateSelectionResponse> {
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/yasam-hafizasi/snapshots`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (data && typeof data === "object") return data as CreateSelectionResponse;
    return { ok: false, code: `HTTP_${res.status}` };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, code: "ABORTED" };
    return { ok: false, code: "NETWORK" };
  }
}

export async function deleteSnapshotSelectionItem(
  clientId: string,
  selectionGroupId: string,
  snapshotId: string,
): Promise<{ ok: boolean; deleted?: boolean; code?: string }> {
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/yasam-hafizasi/snapshots`, {
      method: "DELETE",
      headers: headers(),
      body: JSON.stringify({ selectionGroupId, snapshotId }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (data && typeof data === "object") return data as { ok: boolean; deleted?: boolean; code?: string };
    return { ok: false, code: `HTTP_${res.status}` };
  } catch {
    return { ok: false, code: "NETWORK" };
  }
}
