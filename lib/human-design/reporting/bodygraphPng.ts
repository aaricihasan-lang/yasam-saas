/**
 * HD AŞAMA 4B — Tarayıcıda üretilen BodyGraph PNG'sinin SUNUCU doğrulaması (SAF; DB/ağ yok).
 *
 * İstemciden gelen bayt dizisi GÜVENİLMEZ. DOCX'e yalnız bu doğrulamadan geçen, gerçekten
 * çözülebilen bir PNG gömülür. SVG / HTML / başka biçim KABUL EDİLMEZ.
 *
 * Kontroller:
 *   • byte limiti (HD_BODYGRAPH_PNG_MAX_BYTES)
 *   • PNG imzası + chunk yapısı + HER chunk CRC32'si + IHDR ilk / IEND son (sonrası boş)
 *   • IHDR: 8-bit RGB/RGBA, sıkıştırma/filtre 0, interlace YOK
 *   • piksel sınırları: yükseklik ≥ 1800 (net baskı), en/boy ≤ 3072
 *   • en/boy oranı: Roxy BodyGraph viewBox'ı (432×612 ≈ 0,706) etrafında dar pencere
 *   • IDAT akışı zlib ile GERÇEKTEN açılır ve beklenen ham boyuta BİREBİR eşittir
 *     (maxOutputLength ile sıkıştırma bombası engellenir) + her satır filtre baytı 0..4
 */

import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";

/** JSON base64 taşımada (+%33) Vercel ~4,5 MB gövde sınırının altında kalır. */
export const HD_BODYGRAPH_PNG_MAX_BYTES = Math.floor(2.5 * 1024 * 1024);
export const HD_BODYGRAPH_PNG_MIN_HEIGHT = 1800;
/** Üst sınır: çözme belleği sınırlı kalır (oran kısıtıyla en fazla ~2170×3072 RGBA ≈ 27 MB). */
export const HD_BODYGRAPH_PNG_MAX_SIDE = 3072;
/** Roxy viewBox oranı 432/612 ≈ 0,7059; ±%6 tolerans (yuvarlama/kenar payı). */
export const HD_BODYGRAPH_ASPECT = 432 / 612;
export const HD_BODYGRAPH_ASPECT_TOLERANCE = 0.06;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_CHUNKS = 4096;

let CRC_TABLE: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type BodygraphPngCheck =
  | { ok: true; width: number; height: number; sha256: string }
  | { ok: false; code: BodygraphPngError; error: string };

export type BodygraphPngError =
  | "EMPTY"
  | "TOO_LARGE"
  | "NOT_PNG"
  | "CORRUPT"
  | "UNSUPPORTED_FORMAT"
  | "TOO_SMALL"
  | "TOO_BIG_DIMENSIONS"
  | "BAD_ASPECT";

const fail = (code: BodygraphPngError, error: string): BodygraphPngCheck => ({ ok: false, code, error });

export function validateBodygraphPng(buf: Buffer | null | undefined): BodygraphPngCheck {
  if (!buf || buf.length === 0) return fail("EMPTY", "BodyGraph görseli boş.");
  if (buf.length > HD_BODYGRAPH_PNG_MAX_BYTES) return fail("TOO_LARGE", "BodyGraph görseli çok büyük.");
  if (buf.length < SIGNATURE.length + 12 + 13 || !buf.subarray(0, 8).equals(SIGNATURE)) {
    return fail("NOT_PNG", "BodyGraph görseli geçerli bir PNG değil.");
  }

  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let sawIhdr = false;
  let sawIend = false;
  let idatDone = false;
  const idat: Buffer[] = [];
  let chunks = 0;

  while (off < buf.length) {
    if (++chunks > MAX_CHUNKS) return fail("CORRUPT", "BodyGraph görseli bozuk.");
    if (off + 12 > buf.length) return fail("CORRUPT", "BodyGraph görseli bozuk.");
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return fail("CORRUPT", "BodyGraph görseli bozuk.");
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (len > buf.length || dataEnd + 4 > buf.length) return fail("CORRUPT", "BodyGraph görseli bozuk.");
    const crc = buf.readUInt32BE(dataEnd);
    if (crc32(buf.subarray(off + 4, dataEnd)) !== crc) return fail("CORRUPT", "BodyGraph görseli bozuk (CRC).");

    if (!sawIhdr) {
      if (type !== "IHDR" || len !== 13) return fail("CORRUPT", "BodyGraph görseli bozuk.");
      sawIhdr = true;
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      const bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
      const compression = buf[dataStart + 10];
      const filter = buf[dataStart + 11];
      const interlace = buf[dataStart + 12];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || compression !== 0 || filter !== 0 || interlace !== 0) {
        return fail("UNSUPPORTED_FORMAT", "BodyGraph görseli desteklenmeyen PNG biçiminde.");
      }
      if (width === 0 || height === 0) return fail("CORRUPT", "BodyGraph görseli bozuk.");
      if (width > HD_BODYGRAPH_PNG_MAX_SIDE || height > HD_BODYGRAPH_PNG_MAX_SIDE) {
        return fail("TOO_BIG_DIMENSIONS", "BodyGraph görselinin piksel ölçüsü çok büyük.");
      }
      if (height < HD_BODYGRAPH_PNG_MIN_HEIGHT) {
        return fail("TOO_SMALL", `BodyGraph görseli en az ${HD_BODYGRAPH_PNG_MIN_HEIGHT} piksel yüksekliğinde olmalı.`);
      }
      const aspect = width / height;
      if (Math.abs(aspect - HD_BODYGRAPH_ASPECT) / HD_BODYGRAPH_ASPECT > HD_BODYGRAPH_ASPECT_TOLERANCE) {
        return fail("BAD_ASPECT", "BodyGraph görselinin en/boy oranı beklenen BodyGraph oranıyla uyuşmuyor.");
      }
    } else if (type === "IHDR") {
      return fail("CORRUPT", "BodyGraph görseli bozuk.");
    } else if (type === "IDAT") {
      if (idatDone) return fail("CORRUPT", "BodyGraph görseli bozuk."); // IDAT'lar ardışık olmalı
      idat.push(buf.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      sawIend = true;
      off = dataEnd + 4;
      break;
    } else {
      if (idat.length > 0) idatDone = true;
      if (type === "PLTE") return fail("UNSUPPORTED_FORMAT", "BodyGraph görseli desteklenmeyen PNG biçiminde.");
    }
    off = dataEnd + 4;
  }

  if (!sawIend || off !== buf.length || idat.length === 0) return fail("CORRUPT", "BodyGraph görseli bozuk.");

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp + 1;
  const expected = stride * height;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1 });
  } catch {
    return fail("CORRUPT", "BodyGraph görseli çözülemedi.");
  }
  if (raw.length !== expected) return fail("CORRUPT", "BodyGraph görseli bozuk (boyut).");
  for (let row = 0; row < height; row++) {
    if (raw[row * stride] > 4) return fail("CORRUPT", "BodyGraph görseli bozuk (filtre).");
  }

  return { ok: true, width, height, sha256: createHash("sha256").update(buf).digest("hex") };
}

/** "data:image/png;base64,…" ya da düz base64 → Buffer (yalnız PNG data URL'i kabul edilir). */
export function decodePngBase64(v: unknown): Buffer | null {
  if (typeof v !== "string" || !v) return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(v.trim()) ?? /^([A-Za-z0-9+/=]+)$/.exec(v.trim());
  if (!m) return null;
  // base64 → byte üst sınırı (decode etmeden önce kaba kontrol).
  if ((m[1].length * 3) / 4 > HD_BODYGRAPH_PNG_MAX_BYTES + 3) return Buffer.alloc(HD_BODYGRAPH_PNG_MAX_BYTES + 1);
  return Buffer.from(m[1], "base64");
}
