"use client";

// Eğitim Çalışma Alanı · istek yardımcısı (FAZ 8). Kimlik başlıkları YALNIZ merkezi yardımcılardan (readYasamUser +
// sessionTokenHeader). Yetki her istekte sunucuda + DB'de yeniden verilir; 404 = tek tip "bulunamadı".
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import type { AnnDoc, AnnLayer, AnnOwnerLayerRow, AnnSourceKind } from "@/lib/human-design/education/annotations/annotationContract";

export type AnnRes<T> =
  | { ok: true; body: T }
  | { ok: false; status: number; code: string | null; error: string; currentRevision: number | null };

async function req<T>(side: "trainer" | "owner", url: string, method = "GET", body?: unknown): Promise<AnnRes<T>> {
  const id = readYasamUser()?.id ?? "";
  try {
    const res = await fetch(url, {
      method,
      headers: { [side === "owner" ? "x-admin-id" : "x-user-id"]: id, ...sessionTokenHeader(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
    const j = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string; code?: string; currentRevision?: number }) | null;
    if (res.ok && j?.ok === true) return { ok: true, body: j as T };
    return {
      ok: false, status: res.status, code: j?.code ?? null, currentRevision: typeof j?.currentRevision === "number" ? j.currentRevision : null,
      error: res.status === 404 ? "Kayıt bulunamadı veya erişiminiz yok." : j?.error ?? "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
    };
  } catch {
    return { ok: false, status: 0, code: "NETWORK", currentRevision: null, error: "Ağ hatası — bağlantınızı kontrol edip tekrar deneyin." };
  }
}

const base = (kind: AnnSourceKind, id: string) => `/api/hd/education/annotations/${kind}/${encodeURIComponent(id)}`;
export const annGet = (kind: AnnSourceKind, id: string) => req<{ layer: AnnLayer | null }>("trainer", base(kind, id));
export const annSave = (kind: AnnSourceKind, id: string, doc: AnnDoc, expectedRevision: number) =>
  req<{ layer: AnnLayer }>("trainer", base(kind, id), "PUT", { doc, expectedRevision });
export const annClear = (kind: AnnSourceKind, id: string, expectedRevision: number) =>
  req<{ deleted: number }>("trainer", base(kind, id), "DELETE", { confirm: true, expectedRevision });

export const annOwnerList = (q = "") => req<{ layers: AnnOwnerLayerRow[] }>("owner", `/api/admin/hd/education/annotations${q}`);
export const annOwnerGet = (layerId: string) => req<{ layer: AnnLayer & { trainerUserId: string; trainerName: string } }>("owner", `/api/admin/hd/education/annotations/${encodeURIComponent(layerId)}`);
export const annOwnerDelete = (layerId: string) => req<{ deleted: number }>("owner", `/api/admin/hd/education/annotations/${encodeURIComponent(layerId)}`, "DELETE", { confirm: true });
