import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getConceptRelationById } from "@/lib/yebs/service/conceptRelations";
import { listConceptRelationSources } from "@/lib/yebs/service/conceptRelationSources";
import { isUuid, resolveConceptTitle, resolveSourceTitle } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible, isEvidenceVisible } from "@/lib/yebs/showcase/visibility";
import { toRelationDTO, toRelationEvidenceDTO } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/relations/[id] — bir ilişki + uç kavram başlıkları + kanıtları.
 * Evidence'ta 'rejected' elenir; ham verification_status DTO'ya çıkmaz.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "Geçersiz kimlik.", code: "YEBS_INVALID_ID" }, { status: 400 });
  }
  const view = resolveView(req.nextUrl.searchParams.get("preview"));

  const rel = await getConceptRelationById(db, id);
  if (!rel.ok) {
    const status = rel.code === "YEBS_CONCEPT_RELATION_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: "İlişki bulunamadı.", code: rel.code }, { status });
  }
  if (!isEntityStatusVisible(rel.row.status, view)) {
    return NextResponse.json({ ok: false, error: "İlişki bulunamadı.", code: "YEBS_CONCEPT_RELATION_NOT_FOUND" }, { status: 404 });
  }

  const [sourceTitle, targetTitle] = await Promise.all([
    resolveConceptTitle(db, rel.row.source_concept_id),
    resolveConceptTitle(db, rel.row.target_concept_id),
  ]);

  const evRes = await listConceptRelationSources(db, id, { limit: 100, offset: 0 });
  const evRows = evRes.ok ? evRes.rows.filter((e) => isEvidenceVisible(e.verification_status)) : [];
  const evidence = await Promise.all(
    evRows.map(async (e) => toRelationEvidenceDTO(e, await resolveSourceTitle(db, e.source_id))),
  );

  return NextResponse.json(
    {
      ok: true,
      row: toRelationDTO(rel.row, sourceTitle ?? "Kavram", targetTitle ?? "Kavram"),
      evidence,
      view,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
