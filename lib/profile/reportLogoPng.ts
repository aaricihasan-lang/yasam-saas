/**
 * UZMAN PROFİLİ (F2) — rapor logosu dönüşümü: Kişisel Dijital Ofis WebP varyantı → rapora gömülecek PNG (YALNIZ SUNUCU; sharp).
 *
 * Neden PNG? Word (docx) ImageRun ve PDF gömme yolları WebP'yi güvenilir taşımaz; PNG kayıpsız ve şeffaflığı korur.
 * Neden en uzun kenar ≤ 600 px? Rapor şablonundaki (F3 "B · Uzman İmzalı") en büyük logo yuvası 150 × 60 px (≈ 1,56 × 0,63 inç;
 * Word 96 px/inç) — 600 px bu yuvada ≈ 384 DPI'ya karşılık gelir: 300 DPI baskının üstünde keskin, ama dosya küçük kalır
 * (rapor başına tek kopya; tipik 10–150 KB). Daha büyük kaynak rapora hiçbir kalite katmaz, yalnız docx/PDF'i şişirir.
 *
 * Kurallar: oran korunur (fit: inside), BÜYÜTME YOK (withoutEnlargement), şeffaflık (alfa) korunur, metaveri taşınmaz
 * (sharp varsayılanı), çıktı ≤ REPORT_LOGO_MAX_BYTES (aşarsa paletli PNG → daha küçük kenar; yine aşarsa reddedilir).
 * Girdi YALNIZ WebP kabul edilir (depoda yalnız yeniden kodlanmış WebP bulunur; SVG / metin / başka biçim → red).
 * Piksel bombası: boyut ÇÖZÜMLEMEDEN önce başlıktan okunur; çözümleme limitInputPixels + failOn ile, kodlama zaman
 * sınırıyla (sharp timeout) korunur. Hiçbir hata fırlatılmaz: sonuç { ok:false, reason } (çağıran → logosuz rapor).
 */
import sharp, { type OutputInfo } from "sharp";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";

assertServerOnly("lib/profile/reportLogoPng");
sharp.cache(false);

/** Çıktının en uzun kenarı (px). Gerekçe yukarıda. */
export const REPORT_LOGO_MAX_EDGE = 600;
/** Paletli PNG de sığmazsa denenen ikinci kenar. */
export const REPORT_LOGO_FALLBACK_EDGE = 400;
/** Çıktı üst sınırı (bayt). */
export const REPORT_LOGO_MAX_BYTES = 1_000_000;
/** Girdi üst sınırı: depodaki varyant tavanı (lib/workspace/catalog ASSET_VARIANT_MAX_BYTES) ile aynı. */
export const REPORT_LOGO_INPUT_MAX_BYTES = 4_000_000;
/** Logo masaüstü varyantı ≤ 1200 px kenar; bunun çok üstündeki girdi beklenmez → reddedilir. */
export const REPORT_LOGO_INPUT_MAX_SIDE = 4096;
export const REPORT_LOGO_INPUT_MAX_PIXELS = 4_000_000;
/** Tek sharp boru hattı için zaman sınırı (sn). */
export const REPORT_LOGO_SHARP_TIMEOUT_SEC = 5;

export type ReportLogo = { data: Buffer; width: number; height: number };
export type ReportLogoFailure =
  | "empty" | "not_webp" | "too_large_bytes" | "corrupt" | "animated" | "too_large_pixels" | "encode_failed" | "too_large_output";
export type ReportLogoConversion = { ok: true; logo: ReportLogo; palette: boolean } | { ok: false; reason: ReportLogoFailure };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** RIFF/WEBP kabı ve RIFF uzunluğu tutarlı mı? (İçerik çözümlemesi sharp'tadır.) */
function isWebpContainer(b: Uint8Array): boolean {
  if (b.length < 20) return false;
  const tag = (s: number) => String.fromCharCode(b[s], b[s + 1], b[s + 2], b[s + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return false;
  const riff = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0;
  return riff >= 12 && 8 + riff <= b.length;
}

/** Çıktı denetimi: PNG imzası + IHDR boyutu (F3 readPngSize ile aynı okuma). */
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || !PNG_SIG.every((v, i) => buf[i] === v) || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export async function webpToReportPng(input: Uint8Array | null | undefined): Promise<ReportLogoConversion> {
  if (!input || input.length === 0) return { ok: false, reason: "empty" };
  if (input.length > REPORT_LOGO_INPUT_MAX_BYTES) return { ok: false, reason: "too_large_bytes" };
  if (!isWebpContainer(input)) return { ok: false, reason: "not_webp" };
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const opts = { failOn: "error" as const, limitInputPixels: REPORT_LOGO_INPUT_MAX_PIXELS, animated: false };

  let w: number, h: number;
  try {
    const meta = await sharp(buf, { ...opts, limitInputPixels: false }).metadata(); // yalnız başlık
    if (meta.format !== "webp" || !meta.width || !meta.height) return { ok: false, reason: "corrupt" };
    if ((meta.pages ?? 1) > 1) return { ok: false, reason: "animated" };
    w = meta.width; h = meta.height;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (Math.max(w, h) > REPORT_LOGO_INPUT_MAX_SIDE || w * h > REPORT_LOGO_INPUT_MAX_PIXELS) return { ok: false, reason: "too_large_pixels" };

  const encode = async (edge: number, palette: boolean) => {
    const png = palette
      ? { palette: true, quality: 90, effort: 7, compressionLevel: 9, dither: 1 }
      : { compressionLevel: 9, adaptiveFiltering: true };
    return sharp(buf, opts)
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .png(png)
      .timeout({ seconds: REPORT_LOGO_SHARP_TIMEOUT_SEC })
      .toBuffer({ resolveWithObject: true });
  };
  const attempts: [number, boolean][] = [[REPORT_LOGO_MAX_EDGE, false], [REPORT_LOGO_MAX_EDGE, true], [REPORT_LOGO_FALLBACK_EDGE, true]];
  for (const [edge, palette] of attempts) {
    let out: { data: Buffer; info: OutputInfo };
    try {
      out = await encode(edge, palette);
    } catch {
      return { ok: false, reason: "encode_failed" };
    }
    if (out.data.length > REPORT_LOGO_MAX_BYTES) continue;
    const size = pngSize(out.data);
    if (!size || size.width !== out.info.width || size.height !== out.info.height || Math.max(size.width, size.height) > REPORT_LOGO_MAX_EDGE) {
      return { ok: false, reason: "encode_failed" };
    }
    return { ok: true, logo: { data: out.data, width: size.width, height: size.height }, palette };
  }
  return { ok: false, reason: "too_large_output" };
}
