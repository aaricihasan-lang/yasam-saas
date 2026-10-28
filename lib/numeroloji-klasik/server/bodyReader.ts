/**
 * Klasik Numeroloji — sınırlı istek gövdesi okuyucu (YALNIZ SUNUCU).
 *
 * Gövde AKIŞ olarak okunur ve bayt sayılır; sınır aşıldığı AN okuma iptal edilir (413) — Content-Length
 * olmasa da (chunked) veya yanlış (küçük) beyan edilse de bellek sınırı aşılmaz. Content-Length ön kontrolü
 * ayrıca korunur (beyan zaten büyükse hiç okunmaz).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";

assertServerOnly("lib/numeroloji-klasik/server/bodyReader");

export type LimitedBodyText = { ok: true; text: string } | { ok: false; code: "PAYLOAD_TOO_LARGE" | "MALFORMED_JSON" };

export async function readBodyTextLimited(req: Request, maxBytes: number): Promise<LimitedBodyText> {
  const cl = req.headers.get("content-length");
  if (cl && /^\d+$/.test(cl) && Number(cl) > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  const body = req.body;
  if (!body) return { ok: true, text: "" };
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    return { ok: false, code: "MALFORMED_JSON" };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // iptal en iyi çaba
        }
        return { ok: false, code: "PAYLOAD_TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: "MALFORMED_JSON" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // kilit zaten bırakıldı
    }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return { ok: true, text: new TextDecoder("utf-8").decode(buf) };
}
