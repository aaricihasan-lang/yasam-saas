// Doğaltaş Kütüphanesi · F6 OWNER KATMAN YARDIMCILARI (SAF; IO yok).
// Sağlık işareti SUNUCUDA sağlık sözlüğünden hesaplanır (istemci değeri yok sayılır) ve owner RPC'sine iletilir;
// DB ayrıca fiziksel etki alanını ve kaynak alanın sağlık durumunu zorlar (owner metni sağlık kilidini atlatamaz).
// Görsel doğrulaması: imza (magic bytes) + boyut başlığı + bayt sınırı; uzantı / istemci MIME türüne güvenilmez.

import { hasHealthClaim } from "./import/healthLexicon";

export const OWNER_TEXT_FIELDS = ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation"] as const;
export const OWNER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const OWNER_IMAGE_MAX_SIDE = 4000;
export const BULK_DELETE_MIN = 3;
export const BULK_DELETE_CONFIRM_TEXT = "SİL";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Owner sürüm verisindeki sağlık hassas alanlar (metin alanları + Türkçe/İngilizce anahtar kelimeler). */
export function ownerHealthFields(data: Obj): string[] {
  const out = new Set<string>();
  const fields = isObj(data.fields) ? data.fields : {};
  for (const f of OWNER_TEXT_FIELDS) {
    const v = fields[f];
    if (typeof v !== "string") continue;
    if (f === "meaning_physical" || hasHealthClaim(v)) out.add(f);
  }
  const kw = isObj(data.keywords) ? data.keywords : {};
  const words = [...(Array.isArray(kw.tr) ? kw.tr : []), ...(Array.isArray(kw.en) ? kw.en : [])].filter((x): x is string => typeof x === "string");
  if (words.some((w) => hasHealthClaim(w))) out.add("keywords");
  return [...out];
}

/** Ek bilgi metni sağlık iddiası içeriyor mu (başlık + gövde). */
export function noteHealthSensitive(title: unknown, body: unknown): boolean {
  return hasHealthClaim(typeof title === "string" ? title : "") || hasHealthClaim(typeof body === "string" ? body : "");
}

export type SniffedImage = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp"; width: number; height: number };

/** Dosya içeriğinden tür + boyut. Tanınmayan / bozuk başlık → null (yüklenmez). */
export function sniffImage(b: Buffer): SniffedImage | null {
  if (b.length < 32) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString("ascii", 12, 16) === "IHDR") {
    return dims({ mime: "image/png", ext: "png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
  }
  // JPEG: FF D8 FF … SOFn (C0–CF, C4/C8/CC hariç)
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (len < 2) return null;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return dims({ mime: "image/jpeg", ext: "jpg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) });
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return dims({ mime: "image/webp", ext: "webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) });
    if (chunk === "VP8L" && b[20] === 0x2f) {
      const v = b.readUInt32LE(21);
      return dims({ mime: "image/webp", ext: "webp", width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) });
    }
    if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return dims({ mime: "image/webp", ext: "webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff });
    }
  }
  return null;
}

function dims(s: SniffedImage): SniffedImage | null {
  return s.width >= 1 && s.height >= 1 && s.width <= OWNER_IMAGE_MAX_SIDE && s.height <= OWNER_IMAGE_MAX_SIDE ? s : null;
}

/** Özel kovada taşa bağlı güvenli yol (DB CHECK ile aynı biçim). */
export function ownerImagePath(stoneId: string, sha256: string, ext: SniffedImage["ext"]): string {
  return `owner/${stoneId.toLowerCase()}/${sha256}.${ext}`;
}
