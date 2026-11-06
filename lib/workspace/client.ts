/**
 * KİŞİSEL DİJİTAL OFİS (P4) — tarayıcı istemcisi: P1 tasarım/tercih uçları + P2 parçalı görsel yükleme.
 *
 * - Kimlik: x-user-id + koşullu x-session-token (sessionTokenHeader; web'de HttpOnly cookie). Başlık asla koşulsuz yazılmaz.
 * - Erişim yoksa (bayrak kapalı / izin yok) uçlar 404 döner → `{ kind: "off" }`. Çağıran bu durumda HİÇBİR şey değiştirmez.
 * - Görseller sunucudan akar (imzalı URL yok); <img> başlık taşıyamadığı için baytlar fetch ile alınır ve blob: URL'ye çevrilir.
 * - Sunucu kodu içe aktarılmaz; yalnız tipler.
 */
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import { ASSET_ALLOWED, ASSET_MAX_BYTES, type AssetKind } from "./catalog";
import type { UiPrefs, WorkspaceDesign } from "./schema";
import type { DesignState, PrefsState } from "./service";
import type { AssetView } from "./assets";

export type { DesignState, PrefsState, AssetView };

const BASE = "/api/settings/workspace";

export type ApiFail = { kind: "off" } | { kind: "conflict"; current: unknown; error: string } | { kind: "error"; status: number; code?: string; error: string; issues?: unknown; where?: string[] };
export type ApiResult<T> = { kind: "ok"; value: T } | ApiFail;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-user-id": readYasamUser()?.id ?? "", ...sessionTokenHeader(), ...extra };
}

async function call<T>(path: string, init: RequestInit, pick: (body: Record<string, unknown>) => T, signal?: AbortSignal): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, signal, cache: "no-store", headers: headers((init.headers as Record<string, string>) ?? {}) });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return { kind: "error", status: 0, error: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin." };
  }
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* boş / JSON olmayan gövde */ }
  if (res.status === 404 && body.code === undefined && !String(path).startsWith("/assets/")) return { kind: "off" };
  if (res.ok) return { kind: "ok", value: pick(body) };
  if (res.status === 409 && body.code === "VERSION_CONFLICT") return { kind: "conflict", current: body.design ?? body.prefs, error: String(body.error ?? "") };
  return {
    kind: "error", status: res.status, code: typeof body.code === "string" ? body.code : undefined,
    error: typeof body.error === "string" ? body.error : "İşlem tamamlanamadı. Lütfen yeniden deneyin.",
    issues: body.issues, where: Array.isArray(body.where) ? (body.where as string[]) : undefined,
  };
}

// ── Tasarım / tercih ───────────────────────────────────────────────────────────

export const getDesign = (signal?: AbortSignal) => call<DesignState>("/design", { method: "GET" }, (b) => b.design as DesignState, signal);
export const getPrefs = (signal?: AbortSignal) => call<PrefsState>("/prefs", { method: "GET" }, (b) => b.prefs as PrefsState, signal);

export type DesignActionBody =
  | { action: "saveDraft"; draft: WorkspaceDesign }
  | { action: "apply"; draft?: WorkspaceDesign }
  | { action: "discardDraft" | "reset" }
  | { action: "restore" | "loadHistory"; historyId: string };

export function postDesign(expectedVersion: number, body: DesignActionBody): Promise<ApiResult<DesignState>> {
  return call("/design", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, expectedVersion }) }, (b) => b.design as DesignState);
}

export function putPrefs(expectedVersion: number, prefs: UiPrefs): Promise<ApiResult<PrefsState>> {
  const { hiddenModules, favorites, cardLevel, viewMode, reading } = prefs;
  return call("/prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion, prefs: { hiddenModules, favorites, cardLevel, viewMode, reading } }) }, (b) => b.prefs as PrefsState);
}

// ── Görseller ─────────────────────────────────────────────────────────────────

export const listAssets = () => call<AssetView[]>("/assets", { method: "GET" }, (b) => (Array.isArray(b.assets) ? (b.assets as AssetView[]) : []));

/** Kullanılan görsel silinmeye çalışılırsa sunucu 409 + `where` döner (uygulanan / taslak / geçmiş). */
export const deleteAsset = (assetId: string) =>
  call<true>(`/assets/${encodeURIComponent(assetId)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) }, () => true);

/** Varyant baytlarını alır ve blob: URL döndürür (çağıran revokeObjectURL ile bırakır). */
export async function fetchAssetBlobUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  if (!/^\/api\/settings\/workspace\/assets\/[0-9a-f-]{36}\?v=(desktop|mobile)$/.test(url)) return null;
  try {
    const res = await fetch(url, { headers: headers(), signal, cache: "force-cache" });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

export type PreflightResult = { ok: true } | { ok: false; reason: "type" | "heic" | "size" | "empty"; message: string };

/** İstemci ön kontrolü (yalnız kullanıcıya erken ve anlaşılır mesaj içindir; asıl doğrulama sunucudadır). */
export function preflightFile(file: { name: string; type: string; size: number }, kind: AssetKind): PreflightResult {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (file.size <= 0) return { ok: false, reason: "empty", message: "Dosya boş görünüyor. Başka bir görsel seçin." };
  if (/\.(heic|heif)$/.test(name) || type === "image/heic" || type === "image/heif") {
    return { ok: false, reason: "heic", message: "HEIC biçimi desteklenmiyor. Telefonunuzda fotoğrafı JPEG olarak paylaşın veya kamera ayarından \"En uyumlu\" biçimi seçin; ardından JPEG, PNG veya WebP dosyasını yükleyin." };
  }
  const allowed = ASSET_ALLOWED.some((a) => a.mime === type || a.ext.some((e) => name.endsWith(`.${e}`)));
  if (!allowed) return { ok: false, reason: "type", message: "Yalnız JPEG, PNG veya WebP görseller yüklenebilir." };
  const max = ASSET_MAX_BYTES[kind];
  if (file.size > max) return { ok: false, reason: "size", message: `Görsel çok büyük. ${kind === "logo" ? "Logo" : "Fotoğraf"} en fazla ${Math.round(max / (1024 * 1024))} MB olabilir.` };
  return { ok: true };
}

export type UploadProgress = { phase: "start" | "chunk" | "process"; done: number; total: number };

/**
 * P2 parçalı yükleme protokolü (P2-DEVIR-NOTU §2): start → PUT parçalar (409 chunk_exists = başarılı) → complete.
 * Ağ hatasında parça en fazla 3 kez yeniden denenir; complete 409 incomplete → eksikler yeniden gönderilir; 409 processing → bekle.
 */
export async function uploadAsset(file: File, kind: AssetKind, onProgress?: (p: UploadProgress) => void, signal?: AbortSignal): Promise<ApiResult<AssetView>> {
  const pre = preflightFile(file, kind);
  if (!pre.ok) return { kind: "error", status: 400, code: `client_${pre.reason}`, error: pre.message };
  onProgress?.({ phase: "start", done: 0, total: 1 });
  const start = await call<{ uploadId: string; chunkSize: number; chunkCount: number }>(
    "/assets/uploads",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size }) },
    (b) => ({ uploadId: String(b.uploadId), chunkSize: Number(b.chunkSize), chunkCount: Number(b.chunkCount) }),
    signal,
  );
  if (start.kind !== "ok") return start;
  const { uploadId, chunkSize, chunkCount } = start.value;
  const sendChunk = async (i: number): Promise<ApiFail | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const blob = file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize));
      let res: Response;
      try {
        res = await fetch(`${BASE}/assets/uploads/${uploadId}/chunks/${i}`, { method: "PUT", headers: headers({ "content-type": "application/octet-stream" }), body: blob, signal, cache: "no-store" });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        continue;
      }
      if (res.ok) return null;
      let body: Record<string, unknown> = {};
      try { body = (await res.json()) as Record<string, unknown>; } catch { /* */ }
      if (res.status === 409 && body.code === "chunk_exists") return null;
      if (res.status >= 500) continue;
      return { kind: "error", status: res.status, code: typeof body.code === "string" ? body.code : undefined, error: typeof body.error === "string" ? body.error : "Yükleme başarısız oldu." };
    }
    return { kind: "error", status: 0, error: "Bağlantı kesildi; görsel yüklenemedi. Yeniden deneyin." };
  };
  try {
    for (let i = 0; i < chunkCount; i++) {
      onProgress?.({ phase: "chunk", done: i, total: chunkCount });
      const f = await sendChunk(i);
      if (f) { void call(`/assets/uploads/${uploadId}`, { method: "DELETE" }, () => true); return f; }
    }
    onProgress?.({ phase: "process", done: chunkCount, total: chunkCount });
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await call<AssetView>(`/assets/uploads/${uploadId}/complete`, { method: "POST" }, (b) => b.asset as AssetView, signal);
      if (r.kind === "ok") return r;
      if (r.kind === "error" && r.status === 409 && r.code === "incomplete") {
        for (let i = 0; i < chunkCount; i++) { const f = await sendChunk(i); if (f) return f; }
        continue;
      }
      if (r.kind === "error" && (r.status === 409 && r.code === "processing" || r.status >= 500 || r.status === 0)) {
        await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
        continue;
      }
      return r;
    }
    return { kind: "error", status: 0, error: "Görsel işlenemedi. Lütfen yeniden deneyin." };
  } catch (e) {
    void call(`/assets/uploads/${uploadId}`, { method: "DELETE" }, () => true);
    throw e;
  }
}
