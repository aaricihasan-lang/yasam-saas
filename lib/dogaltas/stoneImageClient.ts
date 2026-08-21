"use client";
/**
 * lib/dogaltas/stoneImageClient.ts — Doğaltaş taş görselleri PRIVATE-read çözümleyici (F-016).
 *
 * Nihai model (adanmış private `dogaltas-photos` bucket):
 *   - DB source-of-truth = `file_path` (kalıcı public URL YOK).
 *   - Render (liste/detay/drawer/create-preview) kısa ömürlü, runtime üretilen signed URL
 *     kullanır → TOPLU (batch) çözülür, 291–400 taşta N+1 YARATMAZ.
 *   - Legacy uyumluluk: bir görselde yalnız `url` (eski public) varsa doğrudan kullanılır
 *     (Model B dual-read; prod'da 0 legacy referans var → savunma amaçlı).
 *
 * Signed URL DB'ye ASLA yazılmaz; yalnız görüntüleme için tutulur.
 */
import { useEffect, useState } from "react";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

function rec(img: unknown): Record<string, unknown> | null {
  return img && typeof img === "object" ? (img as Record<string, unknown>) : null;
}

/** Görselin file_path'i (private, dogaltas-photos) — yoksa null. */
export function imageFilePath(img: unknown): string | null {
  const r = rec(img);
  const p = r?.file_path;
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

/** Legacy public url (yalnız http/https) — file_path yoksa fallback. */
export function imageLegacyUrl(img: unknown): string | null {
  const r = rec(img);
  const u = r?.url;
  return typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null;
}

/** stones.images[0] (varsa). */
export function firstStoneImage(images: unknown): unknown | null {
  return Array.isArray(images) && images.length > 0 ? images[0] : null;
}

/** Bir görsel için nihai src: signed(file_path) → yoksa legacy url → yoksa null. */
export function resolveImageSrc(img: unknown, signed: Record<string, string>): string | null {
  const fp = imageFilePath(img);
  if (fp && signed[fp]) return signed[fp];
  return imageLegacyUrl(img);
}

/** Bir images dizisinden çözülmesi gereken (legacy url'i olmayan) file_path'ler. */
export function pendingFilePaths(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const img of images) {
    const fp = imageFilePath(img);
    if (fp && !imageLegacyUrl(img)) out.push(fp);
  }
  return out;
}

/** Batch signed URL üretimi (server route, tenant-path guard'lı, kısa ömürlü). */
export async function fetchSignedStoneImageUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const userId = readYasamUser()?.id;
  const token = readSessionToken();
  try {
    const res = await fetch("/api/dogaltas/stones/photos/signed-urls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify({ paths: unique }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; urls?: Record<string, string> };
    return json.ok && json.urls ? json.urls : {};
  } catch {
    return {};
  }
}

/**
 * Verilen file_path'ler için signed URL haritası (accumulate; yalnız EKSİKLER istenir).
 * Liste büyüdükçe (lazy-load) yeni path'ler eklenir → tek batch çağrısı, N+1 yok.
 */
export function useSignedStoneImageUrls(paths: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = paths.filter(Boolean).slice().sort().join("|");
  useEffect(() => {
    const missing = key ? key.split("|").filter((p) => p && !map[p]) : [];
    if (missing.length === 0) return;
    let cancelled = false;
    void fetchSignedStoneImageUrls(missing).then((u) => {
      if (!cancelled && Object.keys(u).length > 0) setMap((prev) => ({ ...prev, ...u }));
    });
    return () => { cancelled = true; };
    // key path kümesini özetler; map bağımlılığı kasıtlı dışarıda (accumulate).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
