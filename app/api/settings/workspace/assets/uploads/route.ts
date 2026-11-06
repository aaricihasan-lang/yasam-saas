import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { startUpload } from "@/lib/workspace/assets";
import { guardWorkspace, json, onlyKeys, readJson } from "@/lib/workspace/http";

export const runtime = "nodejs";

/**
 * POST /api/settings/workspace/assets/uploads — { kind: "logo"|"photo", fileName, mimeType, size }
 * Parçalı yükleme oturumu açar (15 dk; logo ≤ 2 MB, fotoğraf ≤ 10 MB; PNG/JPEG/WebP). Dosya bu uçtan GELMEZ; parçalar
 * .../uploads/{id}/chunks/{n} ile sunucuya gönderilir, sunucu private staging bucket'a yazar (istemci Storage'a yazmaz).
 * Storage yolu istemciden alınmaz.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const g = await guardWorkspace(req, "write");
  if (!g.ok) return g.response;
  const b = await readJson(req);
  if (!b.ok) return b.response;
  const extra = onlyKeys(b.body, ["kind", "fileName", "mimeType", "size"]);
  if (extra) return json({ ok: false, error: "Bilinmeyen alan.", path: extra }, 400);
  const r = await startUpload(g.db, g.owner, b.body);
  if (r.ok) return json({ ok: true, uploadId: r.uploadId, chunkSize: r.chunkSize, chunkCount: r.chunkCount, expiresAt: r.expiresAt });
  if (r.status >= 500) return serverErrorResponse({ route: "api/settings/workspace/assets/uploads", action: "start", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: false, code: r.code, error: r.error }, r.status);
}
