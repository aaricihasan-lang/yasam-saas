/**
 * photoValidation.ts — Ürün fotoğrafı yükleme doğrulaması (USM-010).
 *
 * Sınırsız base64 fotoğraf kabulünü engeller:
 *   • MIME allowlist: JPEG / PNG / WebP (SVG ve diğerleri REDDEDİLİR)
 *   • magic-byte imza doğrulaması (yalnız file.type'a güvenilmez)
 *   • tek dosya ≤ 1 MB, en fazla 5 fotoğraf, toplam ham ≤ 3 MB
 * İhlalde tüm parti reddedilir ve kullanıcı dostu Türkçe mesaj döner.
 *
 * 2026-10-14: Sınır kontrolünden ÖNCE kalite koruyan optimizasyon (lib/media/imageOptimize):
 * telefon fotoğrafları yüksek kaliteli WebP'ye (uzun kenar ≤ 2048 px, q ≥ 0.80) indirilir;
 * PNG/animasyon korunur. Optimizasyon sonrası hâlâ sınır aşılırsa AÇIK hata döner (sessiz değil).
 * Tarayıcı dışında (Node testleri) optimizasyon devre dışıdır → dosyalar aynen doğrulanır.
 *
 * Tarayıcı + Node (test) uyumlu: FileReader yerine Blob.arrayBuffer kullanır.
 */

export const PHOTO_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 1 * 1024 * 1024, // 1 MB
  maxTotalBytes: 3 * 1024 * 1024, // ~3 MB
  allowedMime: ["image/jpeg", "image/png", "image/webp"] as const,
};

const MB = 1024 * 1024;

export type PhotoValidationResult = { urls: string[]; error: string | null };

/** Tür allowlist + magic byte imzası eşleşiyor mu? */
function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Seçilen dosyaları doğrular ve data URL listesine çevirir.
 * @param opts.existingCount  formda halihazırda bulunan fotoğraf sayısı (ekleme senaryosu)
 * @param opts.existingBytes  formdaki mevcut fotoğrafların ham bayt toplamı (ekleme senaryosunda
 *                            toplam ~3 MB sınırı korunur; bkz. dataUrlsByteSize)
 */
export async function filesToValidatedDataUrls(
  files: FileList | File[],
  opts?: { existingCount?: number; existingBytes?: number },
): Promise<PhotoValidationResult> {
  const list = Array.from(files);
  if (list.length === 0) return { urls: [], error: null };

  const existingCount = Math.max(0, opts?.existingCount ?? 0);
  if (existingCount + list.length > PHOTO_LIMITS.maxFiles) {
    return {
      urls: [],
      error: `En fazla ${PHOTO_LIMITS.maxFiles} fotoğraf ekleyebilirsiniz.`,
    };
  }

  // Önce optimize et, sonra boyut/tür kontrolü (sıra bilinçli: 1 MB sınırı telefon fotoğrafları için).
  // Tarayıcıda dinamik yüklenir: Node testleri (düz `node`, yol takma adı yok) bu modülü hiç yüklemez.
  const optimizeImageFile =
    typeof document === "undefined"
      ? null
      : (await import("@/lib/media/imageOptimize")).optimizeImageFile;
  const prepared: File[] = [];
  for (const original of list) {
    if (!optimizeImageFile) {
      prepared.push(original);
      continue;
    }
    const result = await optimizeImageFile(original, {
      profile: "photo",
      maxBytes: PHOTO_LIMITS.maxFileBytes,
      maxDimension: 2048,
      minDimension: 1280,
    });
    if (result.reason === "heic-undecodable") {
      return {
        urls: [],
        error: `HEIC/HEIF biçimi bu cihazda dönüştürülemedi: ${original.name || "dosya"}. Fotoğrafı JPEG olarak paylaşın.`,
      };
    }
    prepared.push(result.file);
  }

  let totalBytes = Math.max(0, opts?.existingBytes ?? 0);
  const urls: string[] = [];
  for (const file of prepared) {
    if (file.size > PHOTO_LIMITS.maxFileBytes) {
      return {
        urls: [],
        error: `Fotoğraf kalite korunarak ${Math.round(PHOTO_LIMITS.maxFileBytes / MB)} MB sınırına sığdırılamadı: ${file.name || "dosya"}. Daha küçük bir fotoğraf seçin.`,
      };
    }
    totalBytes += file.size;
    if (totalBytes > PHOTO_LIMITS.maxTotalBytes) {
      return {
        urls: [],
        error: `Toplam fotoğraf boyutu en fazla ${Math.round(PHOTO_LIMITS.maxTotalBytes / MB)} MB olabilir.`,
      };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = detectImageMime(bytes);
    if (!sniffed || !PHOTO_LIMITS.allowedMime.includes(file.type as (typeof PHOTO_LIMITS.allowedMime)[number])) {
      return {
        urls: [],
        error: "Yalnızca JPEG, PNG veya WebP fotoğraf yükleyebilirsiniz.",
      };
    }
    urls.push(`data:${sniffed};base64,${toBase64(bytes)}`);
  }

  return { urls, error: null };
}

/** Data URL listesinin yaklaşık ham bayt toplamı (base64 → 3/4). Ekleme senaryosunda kullanılır. */
export function dataUrlsByteSize(urls: readonly string[]): number {
  let total = 0;
  for (const u of urls) {
    const comma = u.indexOf(",");
    const b64 = comma >= 0 ? u.slice(comma + 1) : u;
    total += Math.floor((b64.length * 3) / 4);
  }
  return total;
}
