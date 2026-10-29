/**
 * Klasik Numeroloji · Karşılaştırma — kanonik JSON + SHA-256 (SAF; bağımlılıksız, istemci + sunucu güvenli).
 *
 * Kanonik JSON: nesne anahtarları sıralı (UTF-16 kod birimi sırası), `undefined` alanlar atılır, dizi sırası
 * korunur, sonlu olmayan sayılar `null` (JSON.stringify ile aynı). Amaç: aynı içerik → aynı özet; anahtar sırası
 * farkı özeti DEĞİŞTİRMEZ. Girdi nesnesi değiştirilmez.
 */

export function canonicalJson(value: unknown): string {
  return write(value, new Set());
}

function write(v: unknown, seen: Set<object>): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "string":
      return JSON.stringify(v);
    case "number":
      return Number.isFinite(v) ? JSON.stringify(v) : "null";
    case "boolean":
      return v ? "true" : "false";
    case "bigint":
      return JSON.stringify(v.toString());
    case "undefined":
    case "function":
    case "symbol":
      return "null";
    default:
      break;
  }
  const o = v as object;
  if (seen.has(o)) throw new Error("canonicalJson: döngüsel yapı");
  seen.add(o);
  try {
    if (Array.isArray(o)) return `[${o.map((x) => write(x, seen)).join(",")}]`;
    const toJSON = (o as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") return write((toJSON as () => unknown).call(o), seen);
    const rec = o as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => {
        const t = typeof rec[k];
        return t !== "undefined" && t !== "function" && t !== "symbol";
      })
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${write(rec[k], seen)}`).join(",")}}`;
  } finally {
    seen.delete(o);
  }
}

// ── SHA-256 (FIPS 180-4) — saf uygulama ─────────────────────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function sha256Hex(input: string | Uint8Array): string {
  const msg = typeof input === "string" ? utf8(input) : input;
  const bitLen = msg.length * 8;
  const padLen = ((msg.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padLen - 4, bitLen >>> 0);

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, "0");
  return out;
}

/** Kanonik JSON'un SHA-256 özeti (64 hex). */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
