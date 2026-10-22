"use client";

// Hazır Eğitim Haritaları — eğitmen istek yardımcısı (FAZ 2-B3). Kimlik başlıkları yalnız merkezi yardımcılardan
// (readYasamUser + sessionTokenHeader); yetki her istekte sunucuda yeniden verilir (requireEducationViewer).
// Sunucu tüm red dallarında aynı 404'ü döner → istemci de tek tip "bulunamadı" gösterir (özelliğin varlığı sızdırılmaz).
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

export type CatalogResult<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

export async function catalogGet<T>(url: string, pick: (body: Record<string, unknown>) => T | undefined): Promise<CatalogResult<T>> {
  try {
    const res = await fetch(url, {
      headers: { "x-user-id": readYasamUser()?.id ?? "", ...sessionTokenHeader() },
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const data = res.ok && body?.ok === true ? pick(body) : undefined;
    if (data !== undefined) return { ok: true, data };
    return { ok: false, notFound: res.status === 404 || res.status === 401 || res.status === 403 };
  } catch {
    return { ok: false, notFound: false };
  }
}

/** Takvim tarihi (YYYY-MM-DD metni) → GG.AA.YYYY. Date nesnesine ÇEVRİLMEZ: saat dilimi kayması olmaz (1869-11-22 → 22.11.1869). */
export const fmtCalendarDate = (d: string) => {
  const [y, m, g] = String(d ?? "").slice(0, 10).split("-");
  return y && m && g ? `${g}.${m}.${y}` : "—";
};
