// Astroloji UI — tarayıcı API istemcisi (yalnız istemci).
// İki yüzey (Aşama 7C), aynı bileşenler:
//   • Admin kabuğu (/admin/astroloji): x-admin-id (+ oturum) → /api/admin/astroloji (owner-only).
//   • Uzman sayfası (/astroloji): x-user-id (+ oturum) → /api/astroloji (modül yetkisi).
// 9C / HttpOnly H5: oturum kimliği web'de HttpOnly çerezle (aynı köken fetch'i çerezi taşır) ya da varsa yerel
// token'la gider. Token başlığı YALNIZ token varsa eklenir (sessionTokenHeader); Android WebView yalnız token kullanır.
// Token URL'e/loga konmaz. Yetki her çağrıda SUNUCUDA (requireAstrologyAccess) verilir; istemci
// yüzey seçimi yetki DEĞİLDİR (yanlış yüzeyden gelen istek sunucuda 404 alır).

import { hasSessionCredential, readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import { downloadFileResponse } from "@/lib/http/downloadResponse";

const ADMIN_API = "/api/admin/astroloji";
const EXPERT_API = "/api/astroloji";

/** Sayfa admin kabuğunda mı? (Sunucu tarafında render edilirken admin varsayılır; çağrılar zaten istemcide.) */
export function isAdminSurface(): boolean {
  if (typeof window === "undefined") return true;
  return window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
}

/** Bileşenlerdeki kanonik "/api/admin/astroloji/…" yolunu bulunulan yüzeyin API'sine çevirir. */
export function astroPath(path: string): string {
  if (isAdminSurface() || !path.startsWith(ADMIN_API)) return path;
  return EXPERT_API + path.slice(ADMIN_API.length);
}

export function astroHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {
    [isAdminSurface() ? "x-admin-id" : "x-user-id"]: readYasamUser()?.id ?? "",
    ...sessionTokenHeader(),
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; error: string; data: Record<string, unknown> | null };

export async function astroFetch<T>(path: string, init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}): Promise<ApiResult<T>> {
  // Oturum kimliği yoksa (ne token ne web çerez oturumu) istek atılmaz.
  if (!readYasamUser()?.id || !hasSessionCredential()) return { ok: false, status: 401, code: "NO_SESSION", error: "Oturum bulunamadı. Lütfen yeniden giriş yapın.", data: null };
  let res: Response;
  try {
    res = await fetch(astroPath(path), {
      method: init.method ?? "GET",
      headers: astroHeaders(init.body !== undefined),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, code: "NETWORK", error: "Ağ hatası — bağlantıyı kontrol edin.", data: null };
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (res.ok && body && body.ok === true) return { ok: true, status: res.status, data: body as T };
  return {
    ok: false,
    status: res.status,
    code: typeof body?.code === "string" ? body.code : `HTTP_${res.status}`,
    error: typeof body?.error === "string" ? body.error : "Beklenmeyen hata.",
    data: body,
  };
}

/**
 * Aşama 8: rapor indirme (Word / PDF). Dosya sunucuda üretilir; istemci yalnız yanıtı indirir
 * (mevcut ortak indirme yardımcısı). Hata gövdesi JSON ise kullanıcıya okunur metin döner.
 */
export async function astroDownload(path: string, fallbackName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!readYasamUser()?.id || !hasSessionCredential()) return { ok: false, error: "Oturum bulunamadı. Lütfen yeniden giriş yapın." };
  let res: Response;
  try {
    res = await fetch(astroPath(path), { method: "GET", headers: astroHeaders(), cache: "no-store" });
  } catch {
    return { ok: false, error: "Ağ hatası — bağlantıyı kontrol edin." };
  }
  if (!res.ok) {
    let msg = "Rapor oluşturulamadı.";
    try {
      const b = (await res.json()) as { error?: unknown };
      if (typeof b.error === "string") msg = b.error;
    } catch {
      /* gövde yok */
      // YENİ-P2-01: platform yanıt sınırı (JSON'suz 413) → genel mesaj yerine neden.
      if (res.status === 413) msg = "Dosya tek seferde indirilemeyecek kadar büyük. Lütfen daha az analiz seçin.";
    }
    return { ok: false, error: msg };
  }
  await downloadFileResponse(res, fallbackName);
  return { ok: true };
}

export const PREVIEW_STORAGE_KEY = "yasam.astro.previewNoInterp";

export function readPreviewFlag(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const PREVIEW_EVENT = "yasam-astro-preview-flag";

export function writePreviewFlag(v: boolean): void {
  try {
    if (v) window.localStorage.setItem(PREVIEW_STORAGE_KEY, "1");
    else window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
  } catch {
    /* depolama yoksa yoksay */
  }
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}

/** useSyncExternalStore aboneliği (aynı sekme + diğer sekmeler). */
export function subscribePreviewFlag(cb: () => void): () => void {
  window.addEventListener(PREVIEW_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREVIEW_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
