// Doğaltaş Kütüphanesi · GÖRSEL DOĞRULAMA + OPTİMİZE SÜRÜM (YALNIZ SUNUCU).
// Yalnız yazılı izinli kristal görselleri için kullanılır. Özgün dosya DEĞİŞTİRİLMEZ (SHA-256 ile korunur); optimize
// sürüm ayrı dosyadır. Bozuk / yanlış türde / aşırı büyük dosya reddedilir.

import { createHash } from "node:crypto";
import sharp from "sharp";
import { IMAGE_MAX_BYTES } from "./roxyCrystalsClient";

export const IMAGE_MAX_PIXELS = 4000;
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export type ProcessedVariant = { bytes: Buffer; mime: ImageMime; ext: "jpg" | "png" | "webp"; width: number; height: number; sha256: string };
export type ImageCheck =
  | { ok: true; original: ProcessedVariant; optimized: ProcessedVariant; flags: ("size_unexpected")[] }
  | { ok: false; reason: "empty" | "too_large" | "type_unknown" | "mime_mismatch" | "corrupt" | "dimensions" };

export function sha256Hex(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

/** İçerikten tür tespiti (uzantıya / başlığa güvenilmez). */
export function sniffImage(b: Buffer): ImageMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

const EXT: Record<ImageMime, "jpg" | "png" | "webp"> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * @param expected beklenen piksel ölçüsü (sağlayıcı yazılı olarak 300×300 bildirdi). Farklıysa REDDEDİLMEZ, işaretlenir.
 */
export async function processImage(bytes: Buffer, contentType: string | null, expected = { width: 300, height: 300 }): Promise<ImageCheck> {
  if (!bytes || bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: "too_large" };
  const mime = sniffImage(bytes);
  if (!mime) return { ok: false, reason: "type_unknown" };
  const declared = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (declared && declared !== mime && !(declared === "image/jpg" && mime === "image/jpeg")) return { ok: false, reason: "mime_mismatch" };
  let width = 0;
  let height = 0;
  const limitInputPixels = IMAGE_MAX_PIXELS * IMAGE_MAX_PIXELS;
  try {
    const meta = await sharp(bytes, { failOn: "error", limitInputPixels: false }).metadata(); // yalnız başlık okunur (piksel çözülmez)
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  // Ölçü, tam çözümlemeden ÖNCE denetlenir (dekompresyon bombası belleğe açılmaz).
  if (width < 1 || height < 1 || width > IMAGE_MAX_PIXELS || height > IMAGE_MAX_PIXELS) return { ok: false, reason: "dimensions" };
  try {
    await sharp(bytes, { failOn: "error", limitInputPixels }).raw().toBuffer(); // tam çözümleme: kesik / bozuk dosya burada hata verir
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  const original: ProcessedVariant = { bytes, mime, ext: EXT[mime], width, height, sha256: sha256Hex(bytes) };
  let opt: Buffer;
  try {
    opt = await sharp(bytes, { failOn: "error", limitInputPixels }).rotate().webp({ quality: 82, effort: 4 }).toBuffer();
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  const om = await sharp(opt).metadata();
  const optimized: ProcessedVariant = { bytes: opt, mime: "image/webp", ext: "webp", width: om.width ?? width, height: om.height ?? height, sha256: sha256Hex(opt) };
  const flags: ("size_unexpected")[] = width !== expected.width || height !== expected.height ? ["size_unexpected"] : [];
  return { ok: true, original, optimized, flags };
}

export function imageStoragePath(variant: "original" | "optimized", sourceId: string, v: ProcessedVariant): string {
  return `${variant === "original" ? "orig" : "opt"}/${sourceId}/${v.sha256}.${v.ext}`;
}
