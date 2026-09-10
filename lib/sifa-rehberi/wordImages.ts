/**
 * Şifa Rehberi — Premium Word görsel embedding için GÜVENLİ görsel getirme.
 *
 * P1 PHASE A NOTU: Word raporu ARTIK kalıcı public storage URL FETCH etmez. Görseller
 * `file_path` (source-of-truth) üzerinden service_role storage `download` ile getirilir
 * (aşağıdaki downloadSafeStonePhoto[s]). Aşağıdaki SSRF-korumalı public-URL fetch yardımcıları
 * (isSafeImageUrl / fetchSafeImage / fetchSafeImages / extractImageUrls) GERİYE DÖNÜK
 * uyumluluk ve mevcut birim testleri için KORUNUR; Word ROUTE'u bunları artık ÇAĞIRMAZ.
 *
 * SSRF / abuse kapıları (EK FAZ 3 Premium Word — legacy public-URL yolu):
 *   - Yalnız Şifa'nın kendi Supabase Storage public host'undan (EXACT host eşleşmesi;
 *     endsWith DEĞİL) ve `/storage/v1/object/public/` yolundan HTTPS URL'ler getirilir.
 *   - credentials/localhost/private-IP/file/data/javascript şeması reddedilir (host
 *     zaten sabit storage host'una eşitlenerek dolaylı olarak engellenir).
 *   - content-type allowlist (png/jpeg) + max-bytes (content-length precheck + hard cap)
 *     + timeout. Herhangi bir ihlal/broken/timeout → sessizce null (export FAIL etmez).
 *   - Storage bucket policy DEĞİŞTİRİLMEZ; bu yalnız okuma-tarafı güvenli getirmedir.
 *
 * SAF/INJECTABLE: fetch fonksiyonu ve host dışarıdan verilir → harness ağ olmadan test eder.
 */

export const IMAGE_MAX_BYTES = 3_000_000; // Word export için makul; bucket cap'ten bağımsız güvenli sınır
export const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg"]);
const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/";

/** healing_guides.images / healing_guide_sections.images ([{url}]) → URL listesi (sıra korunur). */
export function extractImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const it of images) {
    if (it && typeof it === "object") {
      const url = (it as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) out.push(url.trim());
    }
  }
  return out;
}

/** URL yalnız beklenen storage host + public yolu ise güvenli. EXACT host (endsWith yok). */
export function isSafeImageUrl(rawUrl: string, allowedHost: string): boolean {
  if (!allowedHost) return false;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.host !== allowedHost) return false; // EXACT — evil-supabase-host.com geçmez
  if (!u.pathname.startsWith(STORAGE_PUBLIC_PREFIX)) return false;
  return true;
}

/** NEXT_PUBLIC_SUPABASE_URL → host (route bunu türetir). Geçersizse boş. */
export function storageHostFromEnv(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) return "";
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return "";
  }
}

export type SafeFetchDeps = {
  fetchFn: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
};

export type SafeImage = { data: Buffer; mime: string };

/**
 * Güvenli tekil görsel getirme. İhlal/broken/timeout/oversize/bad-mime → null (throw etmez).
 * Profesyonel içerik/URL LOGLANMAZ (EK FAZ 1 error-safety prensibi).
 */
export async function fetchSafeImage(
  rawUrl: string,
  allowedHost: string,
  deps: SafeFetchDeps,
): Promise<SafeImage | null> {
  if (!isSafeImageUrl(rawUrl, allowedHost)) return null;
  const maxBytes = deps.maxBytes ?? IMAGE_MAX_BYTES;
  const timeoutMs = deps.timeoutMs ?? 5000;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await deps.fetchFn(rawUrl, { signal: ctrl.signal, redirect: "error" });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mime)) return null;
    const clen = Number(res.headers.get("content-length") || "");
    if (Number.isFinite(clen) && clen > maxBytes) return null; // precheck
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > maxBytes) return null; // hard cap
    return { data: Buffer.from(ab), mime };
  } catch {
    return null; // AbortError (timeout) dahil → sessiz atla
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bir dizi URL'yi sabit eşzamanlılıkla güvenli getirir; sıra KORUNUR (deterministik).
 * Başarısızlar null olarak yerinde kalır (çağıran filtreler). Görsel başına küçük cap.
 */
export async function fetchSafeImages(
  urls: string[],
  allowedHost: string,
  deps: SafeFetchDeps,
  concurrency = 6,
): Promise<(SafeImage | null)[]> {
  const out: (SafeImage | null)[] = new Array(urls.length).fill(null);
  for (let i = 0; i < urls.length; i += concurrency) {
    const slice = urls.slice(i, i + concurrency);
    const settled = await Promise.all(
      slice.map((u) => fetchSafeImage(u, allowedHost, deps)),
    );
    settled.forEach((r, j) => {
      out[i + j] = r;
    });
  }
  return out;
}

// ── P1 PHASE A: service_role STORAGE DOWNLOAD (public-URL fetch YERİNE) ──────────
//
// Word raporu görselleri artık `file_path` ile PRIVATE-ready service_role download'dan gelir.
// Kalıcı public URL / `/storage/v1/object/public/...` FETCH edilmez; cross-tenant download
// olamaz (path'ler çağıran route'ta tenant-owned doğrulanır). Bad-MIME/oversize/eksik obje →
// sessizce null (tek kötü görsel export'u bozmaz — mevcut ürün semantiği korunur).

/** wordImages'ın ihtiyaç duyduğu minimal storage download arayüzü (service_role db). */
export type StorageDownloader = {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};

/** Tek objeyi service_role ile indir + MIME/size doğrula. İhlal → null. */
export async function downloadSafeStonePhoto(
  db: StorageDownloader,
  bucket: string,
  path: string,
  maxBytes = IMAGE_MAX_BYTES,
): Promise<SafeImage | null> {
  try {
    const { data, error } = await db.storage.from(bucket).download(path);
    if (error || !data) return null;
    const mime = (data.type || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mime)) return null;
    if (typeof data.size === "number" && data.size > maxBytes) return null; // precheck
    const ab = await data.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > maxBytes) return null; // hard cap
    return { data: Buffer.from(ab), mime };
  } catch {
    return null; // eksik obje / bozuk indirme → sessiz atla
  }
}

/** Path listesini sabit eşzamanlılıkla indirir; sıra KORUNUR (deterministik). */
export async function downloadSafeStonePhotos(
  db: StorageDownloader,
  bucket: string,
  paths: string[],
  maxBytes = IMAGE_MAX_BYTES,
  concurrency = 6,
): Promise<(SafeImage | null)[]> {
  const out: (SafeImage | null)[] = new Array(paths.length).fill(null);
  for (let i = 0; i < paths.length; i += concurrency) {
    const slice = paths.slice(i, i + concurrency);
    const settled = await Promise.all(
      slice.map((p) => downloadSafeStonePhoto(db, bucket, p, maxBytes)),
    );
    settled.forEach((r, j) => {
      out[i + j] = r;
    });
  }
  return out;
}
