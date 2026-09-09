/**
 * lib/sifa-rehberi/stonePhotoClient.ts — Şifa Rehberi görsel depolama İSTEMCİ yardımcıları (P1 PHASE A).
 *
 * Tarayıcı ARTIK stone-photos üzerinde anon `.upload()/.getPublicUrl()/.remove()` KULLANMAZ.
 * Tüm storage yetkilendirmesi SUNUCUDA (requireModuleAccess + service_role) yapılır. Tarayıcı
 * yalnız: (1) prepare ile aldığı kısa ömürlü token'la `uploadToSignedUrl`, (2) finalize/signed-read/
 * delete/cleanup uçlarını canonical oturum başlıklarıyla çağırır.
 *
 * Kalıcı public URL üretilmez; signed URL'ler yalnız UI state'inde tutulur, DB'ye persist EDİLMEZ.
 */
import { supabase } from "@/lib/supabase";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { STONE_PHOTOS_BUCKET } from "@/lib/sifa-rehberi/stonePhotoStorage";

export type PreparedPhoto = {
  id: string;
  name: string;
  file_path: string;
  section?: string;
  /** Kısa ömürlü önizleme signed URL — YALNIZ UI state; DB'ye persist EDİLMEZ. */
  previewUrl: string;
};

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-user-id": readYasamUser()?.id ?? "",
    "x-session-token": readSessionToken() ?? "",
  };
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || fallback;
}

/**
 * SUNUCU-YETKİLİ signed upload + finalize. Dosya byte'ları API route'tan geçmez; yalnız
 * kısa ömürlü signed URL'e yüklenir. guideId verilirse guide-scoped, yoksa staging path.
 */
export async function uploadSifaPhoto(params: {
  file: File;
  guideId?: string;
  section?: string;
}): Promise<PreparedPhoto> {
  const { file, guideId, section } = params;

  // 1) PREPARE — server signed upload capability (path SUNUCUDAN üretilir).
  const prepRes = await fetch("/api/sifa-rehberi/photos/prepare", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      ...(guideId ? { guideId } : {}),
      ...(section ? { section } : {}),
      mimeType: file.type,
      size: file.size,
      fileName: file.name,
    }),
  });
  if (!prepRes.ok) throw new Error(await readError(prepRes, "Yükleme hazırlanamadı."));
  const prep = (await prepRes.json()) as { ok?: boolean; demo?: boolean; path?: string; token?: string };
  if (prep.demo) throw new Error("Demo hesabında görsel yüklenemez.");
  if (!prep.path || !prep.token) throw new Error("Yükleme hazırlanamadı.");

  // 2) UPLOAD — tarayıcı signed token ile yükler (anon ALL policy'ye BAĞLI DEĞİL).
  const { error: upErr } = await supabase.storage
    .from(STONE_PHOTOS_BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, file);
  if (upErr) throw new Error(`Görsel yüklenemedi: ${upErr.message}`);

  // 3) FINALIZE — obje varlığı SUNUCUDA doğrulanır + normalize metadata + preview signed URL.
  const finRes = await fetch("/api/sifa-rehberi/photos/finalize", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      ...(guideId ? { guideId } : {}),
      ...(section ? { section } : {}),
      path: prep.path,
      name: file.name,
    }),
  });
  if (!finRes.ok) {
    // Rollback: finalize başarısızsa orphan staging objesini SUNUCU-YETKİLİ temizle
    // (guide-scoped path finalize edilmediği için DB referansı yoktur; staging cleanup uygundur).
    void cleanupSifaPhoto(prep.path).catch(() => {});
    throw new Error(await readError(finRes, "Görsel kaydedilemedi."));
  }
  const fin = (await finRes.json()) as {
    ok?: boolean;
    image?: { id: string; name: string; file_path: string; section?: string };
    previewUrl?: string;
  };
  if (!fin.image || !fin.previewUrl) throw new Error("Görsel kaydedilemedi.");

  return { ...fin.image, previewUrl: fin.previewUrl };
}

/** Guide-scoped signed READ. Yalnız guideId verilir; sunucu DB metadata'sından türetir. */
export async function fetchSifaPhotoSignedUrls(
  guideId: string,
): Promise<{ byId: Record<string, string>; urls: Record<string, string> }> {
  const res = await fetch("/api/sifa-rehberi/photos/signed-urls", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ guideId }),
  });
  if (!res.ok) return { byId: {}, urls: {} };
  const data = (await res.json()) as { byId?: Record<string, string>; urls?: Record<string, string> };
  return { byId: data.byId ?? {}, urls: data.urls ?? {} };
}

/** SUNUCU-YETKİLİ silme (edit akışı). Membership + guide ownership sunucuda doğrulanır. */
export async function deleteSifaPhoto(guideId: string, filePath: string): Promise<void> {
  const res = await fetch("/api/sifa-rehberi/photos", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ guideId, file_path: filePath }),
  });
  if (!res.ok) throw new Error(await readError(res, "Görsel silinemedi."));
}

/** SUNUCU-YETKİLİ orphan temizliği (create akışı / rollback; yalnız metadata'sız objeler). */
export async function cleanupSifaPhoto(path: string): Promise<void> {
  const res = await fetch("/api/sifa-rehberi/photos/cleanup", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await readError(res, "Temizlenemedi."));
}
