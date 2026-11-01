/**
 * KİŞİSEL DİJİTAL OFİS — sunucu tarafı görsel doğrulama + yeniden kodlama (YALNIZ SUNUCU; sharp).
 *
 * Güven sırası: uzantı ve MIME yalnız BEYANDIR → dosya içeriği (sihirli bayt + yapı ayrıştırma) karar verir; beyan ile
 * içerik uyuşmazsa reddedilir. Kabul: PNG, JPEG, WebP. SVG / HTML / GIF / HEIC / bozuk / kesik dosya reddedilir.
 * Polyglot: görselin yapısal sonundan sonra ek veri varsa reddedilir (tek istisna: telefonların "hareketli fotoğraf"
 * JPEG'ine eklediği MP4 kabı — yeniden kodlamada atılır; içinde betik / arşiv / belge imzası varsa yine reddedilir).
 * Piksel bombası: boyutlar ÇÖZÜMLEMEDEN önce başlıktan okunur (toplam piksel + en uzun kenar sınırı); çözümleme de
 * limitInputPixels ile sınırlıdır. Çıktı her zaman yeniden kodlanmış WebP'dir: EXIF / GPS / XMP / ICC metaverisi
 * TAŞINMAZ (sharp varsayılanı; withMetadata/keepExif çağrılmaz), EXIF yönü piksellere uygulanır (rotate).
 */
import crypto from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import {
  ASSET_ALLOWED, ASSET_MAX_PIXELS, ASSET_MAX_SIDE, ASSET_MIN_SIDE, ASSET_VARIANT_MAX_BYTES, ASSET_VARIANTS, IMAGE_PROCESS_CONCURRENCY,
  type AssetKind,
} from "./catalog";

assertServerOnly("lib/workspace/imageProcess");
sharp.cache(false);

export type ImageFormat = "png" | "jpeg" | "webp";
export type ImageErrorCode =
  | "unsupported_type" | "heic_unsupported" | "type_mismatch" | "corrupt" | "trailing_data" | "animated"
  | "too_large_pixels" | "too_small" | "variant_too_large" | "process_failed";
export type ImageError = { ok: false; code: ImageErrorCode; error: string };

const fail = (code: ImageErrorCode, error: string): ImageError => ({ ok: false, code, error });
const ascii = (b: Uint8Array, start: number, len: number) => Buffer.from(b.subarray(start, start + len)).toString("latin1");

/** İçerikten tür tanıma (beyandan bağımsız). */
export function sniffFormat(b: Uint8Array): ImageFormat | "heic" | "gif" | "markup" | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp" && /^(heic|heix|hevc|mif1|msf1|avif)$/.test(ascii(b, 8, 4))) return "heic";
  if (b.length >= 4 && ascii(b, 0, 4) === "GIF8") return "gif";
  const head = Buffer.from(b.subarray(0, 256)).toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (head.startsWith("<")) return "markup";
  return null;
}

/** Görselin yapısal sonu (bayt); ayrıştırılamazsa null (bozuk / kesik). */
export function structuralEnd(b: Uint8Array, f: ImageFormat): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (f === "png") {
    let i = 8;
    while (i + 12 <= b.length) {
      const len = dv.getUint32(i);
      const type = ascii(b, i + 4, 4);
      const next = i + 12 + len;
      if (len > 0x7fffffff || next > b.length) return null;
      if (type === "IEND") return next;
      i = next;
    }
    return null;
  }
  if (f === "webp") {
    if (b.length < 12) return null;
    const end = 8 + dv.getUint32(4, true);
    return end <= b.length ? end : null;
  }
  // JPEG: işaretçi segmentleri + entropi kodlu veri (FF00 dolgu, RSTn) taranarak gerçek EOI bulunur.
  let i = 2;
  while (i + 2 <= b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; }
    if (m === 0xd9) return i + 2;
    if (m >= 0xd0 && m <= 0xd7) { i += 2; continue; }
    if (i + 4 > b.length) return null;
    const segLen = (b[i + 2] << 8) | b[i + 3];
    if (segLen < 2 || i + 2 + segLen > b.length) return null;
    i += 2 + segLen;
    if (m === 0xda) {
      // SOS: bir sonraki gerçek işaretçiye kadar entropi verisini atla.
      while (i + 1 < b.length) {
        if (b[i] === 0xff) {
          const n = b[i + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { i += n === 0xff ? 1 : 2; continue; }
          break;
        }
        i++;
      }
    }
  }
  return null;
}

const DANGEROUS_TRAILER = [/<\s*(script|html|svg|iframe|object|embed|\?php)/i, /PK\u0003\u0004/, /%PDF-/, /^MZ/, /#!\//];

/** Sondaki ek veri yalnız "hareketli fotoğraf" MP4 kabıysa ve tehlikeli imza içermiyorsa kabul (yalnız JPEG). */
function benignTrailer(f: ImageFormat, trailer: Uint8Array): boolean {
  if (f !== "jpeg" || trailer.length < 12) return false;
  if (ascii(trailer, 4, 4) !== "ftyp") return false;
  const text = Buffer.from(trailer).toString("latin1");
  return !DANGEROUS_TRAILER.some((re) => re.test(text));
}

export type DeclaredFile = { fileName: string; mime: string };

/** Beyan (ad + MIME) izinli mi ve birbirleriyle uyumlu mu? (İçerik denetimi ayrıca yapılır.) */
export function checkDeclared(d: DeclaredFile): { ok: true; format: ImageFormat } | ImageError {
  const ext = (d.fileName.split(".").pop() ?? "").toLowerCase();
  const byMime = ASSET_ALLOWED.find((a) => a.mime === d.mime.toLowerCase());
  if (/^(heic|heif|avif)$/.test(ext) || /image\/(heic|heif|avif)/i.test(d.mime)) return fail("heic_unsupported", "HEIC/AVIF desteklenmiyor. Fotoğrafı JPEG, PNG veya WebP olarak seçin.");
  if (!byMime) return fail("unsupported_type", "Yalnız PNG, JPEG veya WebP görsel yüklenebilir.");
  if (!byMime.ext.includes(ext)) return fail("type_mismatch", "Dosya uzantısı ile dosya türü uyuşmuyor.");
  return { ok: true, format: byMime.format };
}

export type ProcessedVariant = { data: Buffer; width: number; height: number; bytes: number; quality: number };

// Örnek içi eşzamanlılık sınırı (Fluid Compute bir örnekte birden çok isteği işleyebilir → bellek tepe değeri sınırlı kalır).
let active = 0;
const waiters: (() => void)[] = [];
async function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= IMAGE_PROCESS_CONCURRENCY) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}
/** Test / izleme: şu an işlenen görsel sayısı. */
export const imageSlotsInUse = () => active;
export type ProcessedImage = {
  ok: true;
  format: ImageFormat;
  originalWidth: number;
  originalHeight: number;
  desktop: ProcessedVariant;
  mobile: ProcessedVariant;
  sha256: string;
};

/**
 * İçerik doğrulama + yeniden kodlama. `declaredFormat` beyandan gelir; içerikle aynı olmalıdır.
 */
export async function processImage(bytes: Uint8Array, kind: AssetKind, declaredFormat: ImageFormat): Promise<ProcessedImage | ImageError> {
  return withImageSlot(() => processImageUnbounded(bytes, kind, declaredFormat));
}

async function processImageUnbounded(bytes: Uint8Array, kind: AssetKind, declaredFormat: ImageFormat): Promise<ProcessedImage | ImageError> {
  const sniffed = sniffFormat(bytes);
  if (sniffed === "heic") return fail("heic_unsupported", "HEIC/AVIF desteklenmiyor. Fotoğrafı JPEG, PNG veya WebP olarak seçin.");
  if (sniffed === "markup") return fail("unsupported_type", "SVG / HTML gibi metin tabanlı dosyalar kabul edilmez.");
  if (sniffed === null || sniffed === "gif") return fail("unsupported_type", "Yalnız PNG, JPEG veya WebP görsel yüklenebilir.");
  if (sniffed !== declaredFormat) return fail("type_mismatch", "Dosyanın içeriği beyan edilen türle uyuşmuyor.");
  const end = structuralEnd(bytes, sniffed);
  if (end === null) return fail("corrupt", "Görsel bozuk veya eksik yüklenmiş.");
  if (end < bytes.length && !benignTrailer(sniffed, bytes.subarray(end))) return fail("trailing_data", "Görsel dosyasının sonunda görsele ait olmayan ek veri var; dosya kabul edilmedi.");

  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let meta: Metadata;
  try {
    meta = await sharp(buf, { failOn: "error", limitInputPixels: false }).metadata(); // yalnız başlık
  } catch {
    return fail("corrupt", "Görsel okunamadı (bozuk dosya).");
  }
  if (meta.format !== sniffed || !meta.width || !meta.height) return fail("corrupt", "Görsel okunamadı (bozuk dosya).");
  if ((meta.pages ?? 1) > 1) return fail("animated", "Hareketli (animasyonlu) görseller kabul edilmez.");
  if (meta.width * meta.height > ASSET_MAX_PIXELS || Math.max(meta.width, meta.height) > ASSET_MAX_SIDE) {
    return fail("too_large_pixels", `Görsel çözünürlüğü çok yüksek (en fazla ${ASSET_MAX_PIXELS / 1_000_000} megapiksel, en uzun kenar ${ASSET_MAX_SIDE} px).`);
  }
  if (Math.min(meta.width, meta.height) < ASSET_MIN_SIDE) return fail("too_small", `Görsel çok küçük (en az ${ASSET_MIN_SIDE} px).`);

  const swap = (meta.orientation ?? 1) >= 5; // EXIF 5–8: 90° döndürülmüş
  const ow = swap ? meta.height : meta.width;
  const oh = swap ? meta.width : meta.height;
  // Kalite kademesi: varyant ASSET_VARIANT_MAX_BYTES'ı (Vercel yanıt sınırı altı) aşarsa kalite düşürülür; boyut / oran değişmez.
  const QUALITIES = kind === "logo" ? [90, 80, 70, 60] : [82, 72, 62, 50, 40];
  const encode = async (longEdge: number): Promise<ProcessedVariant | null> => {
    for (const quality of QUALITIES) {
      const pipe = sharp(buf, { failOn: "error", limitInputPixels: ASSET_MAX_PIXELS })
        .rotate()
        .resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true })
        .webp(kind === "logo" ? { quality, alphaQuality: Math.min(100, quality + 10), effort: 4 } : { quality, effort: 4 });
      const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
      if (data.length <= ASSET_VARIANT_MAX_BYTES) return { data, width: info.width, height: info.height, bytes: data.length, quality };
    }
    return null;
  };
  let desktop: ProcessedVariant | null;
  let mobile: ProcessedVariant | null;
  try {
    desktop = await encode(ASSET_VARIANTS[kind].desktop);
    mobile = await encode(ASSET_VARIANTS[kind].mobile);
  } catch {
    return fail("corrupt", "Görsel işlenemedi (bozuk dosya).");
  }
  if (!desktop || !mobile) return fail("variant_too_large", "Görsel güvenli boyuta sıkıştırılamadı; daha sade veya daha küçük bir görsel seçin.");
  const ratio = ow / oh;
  for (const v of [desktop, mobile]) {
    const r = v.width / v.height;
    // Yuvarlama payı: kısa kenarda ±1 px.
    const tol = Math.max(1 / Math.min(v.width, v.height), 0.005) * ratio;
    if (Math.abs(r - ratio) > tol) return fail("process_failed", "Görsel oranı korunamadı.");
  }
  return {
    ok: true,
    format: sniffed,
    originalWidth: ow,
    originalHeight: oh,
    desktop,
    mobile,
    sha256: crypto.createHash("sha256").update(desktop.data).digest("hex"),
  };
}
