import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { putChunk } from "@/lib/workspace/assets";
import { UPLOAD_CHUNK_BYTES } from "@/lib/workspace/catalog";
import { guardWorkspace, json } from "@/lib/workspace/http";
import { UUID_RE } from "@/lib/workspace/schema";

export const runtime = "nodejs";

/**
 * PUT /api/settings/workspace/assets/uploads/{uploadId}/chunks/{index} — ham bayt (application/octet-stream), ≤ 3 MB.
 * Parça boyutu oturumun beyanıyla birebir uyuşmalıdır; parça yalnız bu uzmanın açık oturumuna, SUNUCU tarafından private
 * staging bucket'a yazılır. Güvenli yeniden deneme: parça zaten yazıldıysa 409 chunk_exists (istemci başarılı sayar).
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ uploadId: string; index: string }> }): Promise<Response> {
  const g = await guardWorkspace(req, "write");
  if (!g.ok) return g.response;
  const { uploadId, index } = await ctx.params;
  if (!UUID_RE.test(uploadId)) return json({ ok: false, error: "Yükleme bulunamadı." }, 404);
  if (!/^\d{1,3}$/.test(index)) return json({ ok: false, error: "Parça numarası geçersiz." }, 400);
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > UPLOAD_CHUNK_BYTES) return json({ ok: false, code: "chunk_too_large", error: "Parça en fazla 3 MB olabilir." }, 413);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return json({ ok: false, error: "Parça okunamadı." }, 400);
  }
  if (bytes.length === 0 || bytes.length > UPLOAD_CHUNK_BYTES) return json({ ok: false, code: "chunk_size", error: "Parça boyutu geçersiz." }, bytes.length ? 413 : 400);
  const r = await putChunk(g.db, g.owner, uploadId, Number(index), bytes);
  if (r.ok) return json({ ok: true, index: r.index });
  if (r.status >= 500) return serverErrorResponse({ route: "api/settings/workspace/assets/uploads/[uploadId]/chunks/[index]", action: "chunk", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: false, code: r.code, error: r.error }, r.status);
}
