"use client";

// Eğitim Merkezi · Bana Özel Eğitim Haritaları — istek yardımcısı (FAZ 7).
// Kimlik başlıkları YALNIZ merkezi yardımcılardan (readYasamUser + sessionTokenHeader; H6 cookie modunda token JS'te yoktur).
// Yetki her istekte sunucuda yeniden verilir (requirePrivateTrainer / requirePrivateOwner + DB RPC). Sunucu tüm red dallarında aynı
// 404'ü döner → istemci de tek tip "bulunamadı" gösterir. Başarı yalnız sunucu `ok:true` dönerse gösterilir (sahte başarı yok).
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

export type Side = "trainer" | "owner";
export type ApiRes<T = Record<string, unknown>> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; code: string | null; error: string; notFound: boolean; data?: Record<string, unknown> | null };

function headers(side: Side): Record<string, string> {
  const id = readYasamUser()?.id ?? "";
  return { [side === "owner" ? "x-admin-id" : "x-user-id"]: id, ...sessionTokenHeader() };
}

export async function privCall<T = Record<string, unknown>>(side: Side, url: string, init: { method?: string; body?: unknown } = {}): Promise<ApiRes<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { ...headers(side), ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string; code?: string }) | null;
    if (res.ok && body?.ok === true) return { ok: true, status: res.status, body: body as T };
    return {
      ok: false, status: res.status, code: body?.code ?? null, notFound: res.status === 404, data: (body as Record<string, unknown> | null) ?? null,
      error: res.status === 404 ? "Kayıt bulunamadı veya erişiminiz yok." : body?.error ?? "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
    };
  } catch {
    return { ok: false, status: 0, code: "NETWORK", notFound: false, error: "Ağ hatası — bağlantınızı kontrol edip tekrar deneyin." };
  }
}

/** Kanıt dosyası indirme (kimlik başlıklarıyla; tarayıcıda dosya kaydetme). */
export async function privDownload(side: Side, url: string, fallbackName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { headers: headers(side), cache: "no-store", credentials: "same-origin" });
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: res.status === 404 ? "Kayıt bulunamadı veya erişiminiz yok." : b?.error ?? "Dosya indirilemedi." };
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") ?? "";
    const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return { ok: true };
  } catch {
    return { ok: false, error: "Ağ hatası — dosya indirilemedi." };
  }
}

/** Takvim tarihi (YYYY-MM-DD) → GG.AA.YYYY (Date nesnesi YOK: saat dilimi kayması olmaz). */
export const fmtDay = (d: string | null | undefined) => {
  const [y, m, g] = String(d ?? "").slice(0, 10).split("-");
  return y && m && g ? `${g}.${m}.${y}` : "—";
};
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";
