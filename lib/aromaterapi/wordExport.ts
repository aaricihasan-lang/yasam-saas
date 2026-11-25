"use client";

/**
 * Aromaterapi Word export — istemci indirme yardımcısı.
 * POST → .docx blob → tarayıcı indirmesi. Auth header'ları (x-user-id/x-session-token)
 * ile; tenant server tarafında oturumdan belirlenir (istemci göndermez).
 */

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

/** I18N: `errorCode` dil-bağımsız EK alan (aromatherapy.errors.codes.<KOD>); Türkçe `error` AYNEN. */
export async function downloadWord(url: string, body?: unknown): Promise<{ ok: boolean; error: string | null; errorCode?: string | null }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body ?? {}) });
  } catch {
    return { ok: false, error: "Bağlantı hatası. Lütfen tekrar deneyin.", errorCode: "AROMA_NETWORK" };
  }
  if (!res.ok) {
    try { const j = await res.json(); return { ok: false, error: String(j.error ?? `HTTP ${res.status}`), errorCode: typeof j.code === "string" ? j.code : null }; }
    catch { return { ok: false, error: `HTTP ${res.status}`, errorCode: null }; }
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(cd);
  const filename = m?.[1] || "aromaterapi.docx";
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
  return { ok: true, error: null };
}
