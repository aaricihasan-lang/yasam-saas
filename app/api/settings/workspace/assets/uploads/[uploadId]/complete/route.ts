import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { completeUpload } from "@/lib/workspace/assets";
import { guardWorkspace, json } from "@/lib/workspace/http";
import { UUID_RE } from "@/lib/workspace/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settings/workspace/assets/uploads/{uploadId}/complete — parçaları birleştirir, içeriği doğrular
 * (tür / polyglot / piksel bombası), EXIF/GPS'siz WebP olarak yeniden kodlar, masaüstü + mobil varyantları private
 * bucket'a SUNUCU yazar ve assetId döndürür. Doğrulama hatasında oturum iptal edilir ve geçici parçalar silinir.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ uploadId: string }> }): Promise<Response> {
  const g = await guardWorkspace(req, "write");
  if (!g.ok) return g.response;
  const { uploadId } = await ctx.params;
  if (!UUID_RE.test(uploadId)) return json({ ok: false, error: "Yükleme bulunamadı." }, 404);
  const r = await completeUpload(g.db, g.owner, uploadId);
  if (r.ok) return json({ ok: true, asset: r.asset });
  if (r.status >= 500) return serverErrorResponse({ route: "api/settings/workspace/assets/uploads/[uploadId]/complete", action: "complete", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: false, code: r.code, error: r.error }, r.status);
}
