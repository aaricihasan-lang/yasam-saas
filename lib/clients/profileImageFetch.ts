/**
 * lib/clients/profileImageFetch.ts — Danışan Yolculuğu Word raporu profil görseli
 * GÜVENLİ indirme (DYA-06 SSRF kapanışı, DY'ye ÖZEL dar çözüm).
 *
 * BAĞLAM: `client.profile_image_url` mass-assignment ile kullanıcı tarafından yazılabildiği
 * için Word raporu üretilirken keyfi bir URL'nin sunucudan fetch edilmesi SSRF riskidir.
 * Ortak `lib/docx/reportHelpers.fetchImageBuffer` başka modüllerce (Doğaltaş) kullanıldığından
 * DEĞİŞTİRİLMEZ; bu modül yalnız Danışan Yolculuğu word-report için kullanılır.
 *
 * SAVUNMALAR:
 *   - Yalnız EXACT beklenen Supabase Storage origin (NEXT_PUBLIC_SUPABASE_URL host'u), https,
 *     kullanıcı/parola içermeyen URL, `/storage/v1/object/` yolu.
 *   - redirect: "manual" → 3xx/opaqueredirect izlenmez (allow-list'in redirect ile aşılması engellenir).
 *   - Gerçek (stream) byte sınırı → Content-Length'e güvenilmez; sınır aşılırsa indirme iptal edilir.
 *   - AbortController timeout.
 *   - Magic-byte görsel format doğrulaması (png/jpeg/webp/gif) → metin/HTML/JSON gövde embed edilmez.
 *   - Hata/uyumsuzlukta null → meşru görsel yoksa rapor yine üretilir (görsel atlanır).
 */

/** Profil görseli için gerçek indirme sınırı (10 MB). */
export const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;

/** Fetch timeout (ms). */
export const PROFILE_IMAGE_FETCH_TIMEOUT_MS = 5000;

/**
 * URL bu tenant'ın Supabase Storage origin'ine ait güvenilir bir object URL'i mi?
 * PURE — test edilebilir. allowedHost = new URL(NEXT_PUBLIC_SUPABASE_URL).host.
 */
export function isTrustedStorageImageUrl(rawUrl: unknown, allowedHost: string): boolean {
  if (typeof rawUrl !== "string" || !rawUrl || !allowedHost) return false;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.host !== allowedHost) return false; // EXACT host — evil-host / IP / port farkı geçmez
  // Supabase storage object yolları (public veya signed) bu önek altındadır.
  return u.pathname.startsWith("/storage/v1/object/");
}

/**
 * Buffer gerçek bir raster görsel mi (magic-byte)? PURE — test edilebilir.
 * png / jpeg / gif / webp imzaları. Aksi halde false (metin/HTML/JSON reddedilir).
 */
export function isSupportedImageMagic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/** Ortamdan beklenen Supabase storage host'u; geçersizse boş. */
export function expectedStorageHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
}

/**
 * Response gövdesini byte sınırıyla stream ederek okur. Sınır aşılırsa okumayı iptal
 * eder ve null döner (sınırsız RAM'e alınmaz). Body yoksa null.
 */
async function readCappedBody(res: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }
    }
  } catch {
    return null;
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

/**
 * GÜVENLİ indirme mekanikleri (URL doğrulaması ÇAĞIRAN tarafından yapılmış varsayılır):
 * redirect izlemez (redirect:"manual"), byte-sınırlı stream okur, timeout uygular ve
 * magic-byte format doğrular. Test edilebilir olması için ayrı export (URL gate'ten bağımsız).
 * NOT: Bu fonksiyon URL host doğrulaması YAPMAZ — daima isTrustedStorageImageUrl'den SONRA
 * çağrılmalıdır (fetchProfileImageBuffer bunu garanti eder).
 */
export async function fetchValidatedImage(url: string): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROFILE_IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
    // redirect: "manual" → 3xx izlenmez; allow-list dışına redirect ile çıkılamaz.
    if (res.type === "opaqueredirect") return null;
    if (res.status >= 300 && res.status < 400) return null;
    if (!res.ok) return null;
    const buf = await readCappedBody(res, MAX_PROFILE_IMAGE_BYTES);
    if (!buf || !isSupportedImageMagic(buf)) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Güvenli profil görseli indirme. Yalnız trusted Supabase Storage URL'i, redirect
 * izlemeden, byte-sınırlı ve format-doğrulamalı indirilir. Aksi halde null.
 */
export async function fetchProfileImageBuffer(
  rawUrl: string | null | undefined,
): Promise<Buffer | null> {
  const url = rawUrl?.trim();
  if (!url || !isTrustedStorageImageUrl(url, expectedStorageHost())) return null;
  return fetchValidatedImage(url);
}
