"use client";

/**
 * Anamnez istemci yardımcıları (tarayıcı). Kimlik başlıkları mevcut desenle (x-user-id +
 * x-session-token) eklenir; tenant/istemci kimliği ASLA gövdeye konmaz (sunucu çözer).
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";
import { ANAMNEZ_BUCKET } from "./storage";

export function anamnezAuthHeaders(json = false): Record<string, string> {
  const user = readYasamUser();
  const token = readSessionToken();
  return {
    "x-user-id": user?.id ?? "",
    ...(token ? { "x-session-token": token } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; data: Record<string, unknown> };

export async function anamnezFetch<T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: anamnezAuthHeaders(init.body !== undefined),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, code: "generic", data: {} };
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  if (res.ok && json.ok !== false) return { ok: true, status: res.status, data: json as T };
  return { ok: false, status: res.status, code: typeof json.code === "string" ? json.code : "generic", data: json };
}

export const anamnezBase = (clientId: string) => `/api/clients/${encodeURIComponent(clientId)}/anamnez`;

/** İmzalı URL ile doğrudan Storage'a yükleme (bayt uygulama sunucusundan geçmez). */
export async function uploadToSignedPath(path: string, token: string, file: File): Promise<boolean> {
  const { error } = await supabase.storage
    .from(ANAMNEZ_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: "application/pdf", upsert: false });
  return !error;
}

/**
 * Belgeyi yeni sekmede aç. Pop-up engeline takılmamak için pencere kullanıcı tıklamasıyla
 * SENKRON açılır, URL gelince yönlendirilir. Pencere açılamazsa (ör. bazı WebView'lar) aynı
 * sekmede açılır. Cihaz tespitiyle hiçbir özellik kapatılmaz (K8).
 */
export async function openSignedUrl(fetchUrl: () => Promise<string | null>): Promise<"ok" | "blocked" | "error"> {
  let win: Window | null = null;
  try {
    win = window.open("about:blank", "_blank");
  } catch {
    win = null;
  }
  const url = await fetchUrl();
  if (!url) {
    try { win?.close(); } catch { /* yok */ }
    return "error";
  }
  if (win && !win.closed) {
    try {
      win.opener = null;
      win.location.href = url;
      return "ok";
    } catch {
      /* düş */
    }
  }
  try {
    window.location.assign(url);
    return "ok";
  } catch {
    return "blocked";
  }
}

/** İndirme: signed URL `download` seçeneğiyle Content-Disposition: attachment döner. */
export function triggerUrlDownload(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
