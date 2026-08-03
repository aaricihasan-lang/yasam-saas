/**
 * BF-14 Ertelenmiş Kaynaklar — deterministic passage/chunk üretimi (SAF; test edilebilir).
 *
 * Server-derived job metni → sıralı, bounded, deterministic passage'lar. Aynı girdi → aynı
 * çıktı (ordinal 0..N-1). PII/redaction burada YAPILMAZ; classification 'unclassified' kalır
 * (fail-closed; index yalnız açık safe-non-pii review + hash eşleşmesiyle mümkün olur).
 */
import { createHash } from "node:crypto";

export interface TextChunk {
  ordinal: number;
  text: string;
  textHash: string;
  locator: string;
}

const MAX_CHUNK = 4000; // char
const MAX_CHUNKS = 500;

function hash(s: string): string {
  return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

/**
 * Metni deterministik passage'lara böler:
 *   - önce çift-newline (paragraf) sınırlarında böler,
 *   - MAX_CHUNK üstündeki paragrafları sabit uzunlukta alt-parçalara böler,
 *   - boş parçaları atar, ordinal'i 0'dan sıralar, MAX_CHUNKS ile sınırlar.
 */
export function chunkText(raw: string): TextChunk[] {
  if (typeof raw !== "string") return [];
  const paragraphs = raw.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const pieces: string[] = [];
  for (const p of paragraphs) {
    const t = p.trim();
    if (t.length === 0) continue;
    if (t.length <= MAX_CHUNK) {
      pieces.push(t);
    } else {
      for (let i = 0; i < t.length; i += MAX_CHUNK) {
        const sub = t.slice(i, i + MAX_CHUNK).trim();
        if (sub.length > 0) pieces.push(sub);
      }
    }
    if (pieces.length >= MAX_CHUNKS) break;
  }
  return pieces.slice(0, MAX_CHUNKS).map((text, ordinal) => ({
    ordinal,
    text,
    textHash: hash(text),
    locator: `chunk:${ordinal + 1}`,
  }));
}

/** Kaynak içerik hash'i (duplicate tespiti + stale guard için). */
export function contentHash(s: string): string {
  return hash(typeof s === "string" ? s : "");
}
