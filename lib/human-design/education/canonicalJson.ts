// Human Design — Hazır Eğitim Haritaları · KANONİK JSON (saf; IO yok).
// Anahtarları sözlük sırasına dizilmiş, boşluksuz deterministik JSON. Sağlayıcı yanıtı yalnız JSON dizgi/sayı/bool/null
// içerir; aynı veri hangi anahtar sırasıyla gelirse gelsin (HTTP gövdesi, JSON.parse nesnesi, PostgreSQL jsonb geri
// okuması) AYNI kanonik metni ve AYNI özeti üretir → jsonb gidiş-dönüşü doğrulanabilir.
import { createHash } from "node:crypto";

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error("kanonik JSON: sonlu olmayan sayı");
  return JSON.stringify(v);
}

export function canonicalSha256(v: unknown): string {
  return createHash("sha256").update(canonicalJson(v)).digest("hex");
}

/** HTTP gövdesi baytlarını KATI UTF-8 ile çözer (BOM korunur, geçersiz bayt → null). Birebir metin saklamak içindir. */
export function strictUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}
