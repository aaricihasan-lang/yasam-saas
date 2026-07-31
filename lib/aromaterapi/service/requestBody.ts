import "server-only";

/**
 * Aromaterapi V2 — C3D-B2A sınırlı JSON gövde okuyucu (server-only).
 *
 * Exact byte limiti uygular: Content-Length hızlı-yolu + gerçek UTF-8 byte ölçümü.
 * Aşım → "too_large" (route 413'e çevirir); parse hatası/JSON dışı → "invalid" (400).
 * Ham hata metni DÖNDÜRÜLMEZ.
 */
export type BoundedBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid" };

export async function readJsonBounded(
  req: Request,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  // Hızlı yol: Content-Length güvenilirse erken reddet.
  const lenHeader = req.headers.get("content-length");
  if (lenHeader !== null) {
    const declared = Number(lenHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, reason: "invalid" };
  }

  // Gerçek boyut (Content-Length yoksa/yanıltıcıysa otoritedir).
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, value };
}
