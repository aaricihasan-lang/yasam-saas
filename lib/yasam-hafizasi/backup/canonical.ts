/**
 * BF-12B — Deterministik (canonical) JSON serileştirme + SHA-256.
 *
 * Amaç: aynı mantıksal veri → byte-için-byte aynı plaintext → deterministik hash.
 * Kayıpsızlık: numeric precision KORUNUR (sayısal alanlar string olarak da gelebilir;
 * bigint/Buffer/Date etiketli sarmalanır). null korunur. Object anahtarları sıralanır;
 * array sırası KORUNUR.
 */
import { createHash } from "node:crypto";

/**
 * Canonical string üretir. JSON.stringify KULLANMAZ (number round-trip precision
 * riskini önlemek + anahtar sırasını garanti etmek için elle üretir).
 */
export function canonicalize(value: unknown): string {
  return emit(value);
}

function emit(value: unknown): string {
  if (value === null || value === undefined) return "null";

  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error("canonicalize: sonlu olmayan sayı serileştirilemez");
    }
    // Number → kaynak gösterimi (2^53 altı güvenli; DB numeric'leri zaten string gelir).
    return JSON.stringify(value);
  }
  if (t === "bigint") {
    return JSON.stringify({ $bigint: (value as bigint).toString() });
  }
  if (value instanceof Date) {
    return JSON.stringify({ $date: value.toISOString() });
  }
  if (Buffer.isBuffer(value)) {
    return JSON.stringify({ $bytea: value.toString("base64") });
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => emit(v)).join(",") + "]";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + emit(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`canonicalize: serileştirilemeyen tip: ${t}`);
}

/** UTF-8 string SHA-256 (hex). */
export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256")
    .update(typeof input === "string" ? Buffer.from(input, "utf8") : input)
    .digest("hex");
}

/** Canonical serialize + hash (plaintext payload fingerprint). */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

/**
 * Sıralı satır dizisinin deterministik hash'i — pagination'ın stream hash'iyle
 * BİREBİR aynı (her satır: canonicalize(row) + "\n"). Doğrulama bunu yeniden üretir.
 */
export function hashRowsCanonical(rows: Record<string, unknown>[]): string {
  const h = createHash("sha256");
  for (const r of rows) {
    h.update(canonicalize(r));
    h.update("\n");
  }
  return h.digest("hex");
}
