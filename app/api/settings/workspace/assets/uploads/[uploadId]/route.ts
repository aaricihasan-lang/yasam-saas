import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { abortUpload } from "@/lib/workspace/assets";
import { guardWorkspace, json } from "@/lib/workspace/http";
import { UUID_RE } from "@/lib/workspace/schema";

export const runtime = "nodejs";

/** DELETE /api/settings/workspace/assets/uploads/{uploadId} — açık yüklemeyi iptal eder, geçici parçaları siler. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ uploadId: string }> }): Promise<Response> {
  const g = await guardWorkspace(req, "write");
  if (!g.ok) return g.response;
  const { uploadId } = await ctx.params;
  if (!UUID_RE.test(uploadId)) return json({ ok: false, error: "Yükleme bulunamadı." }, 404);
  const r = await abortUpload(g.db, g.owner, uploadId);
  if (r.ok) return json({ ok: true });
  if (r.status >= 500) return serverErrorResponse({ route: "api/settings/workspace/assets/uploads/[uploadId]", action: "abort", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: false, code: r.code, error: r.error }, r.status);
}
