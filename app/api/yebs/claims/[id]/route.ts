import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getClaimById } from "@/lib/yebs/service/claims";
import { listClaimSources } from "@/lib/yebs/service/claimSources";
import { getConceptById } from "@/lib/yebs/service/concepts";
import { isUuid, resolveConceptTitle, resolveSourceTitle } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible, isEvidenceVisible } from "@/lib/yebs/showcase/visibility";
import { toClaimDTO, toClaimEvidenceDTO } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/claims/[id] — bir "Kaynaklı Bilgi" + kanıtları (claim sources).
 * Evidence'ta `verification_status='rejected'` ELENİR; ham verification_status
 * DTO'ya çıkmaz. contradiction rolü gösterilir (rozet).
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

  const c = await getClaimById(db, id);
  if (!c.ok) {
    const status = c.code === "YEBS_CLAIM_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: "Bilgi bulunamadı.", code: c.code }, { status });
  }
  if (!isEntityStatusVisible(c.row.status, view)) {
    return NextResponse.json({ ok: false, error: "Bilgi bulunamadı.", code: "YEBS_CLAIM_NOT_FOUND" }, { status: 404 });
  }

  const evidenceRes = await listClaimSources(db, id, { limit: 100, offset: 0 });
  const evRows = evidenceRes.ok ? evidenceRes.rows.filter((e) => isEvidenceVisible(e.verification_status)) : [];
  const evidence = await Promise.all(
    evRows.map(async (e) => toClaimEvidenceDTO(e, await resolveSourceTitle(db, e.source_id))),
  );

  const concept = await getConceptById(db, c.row.concept_id);
  const conceptTitle = concept.ok ? await resolveConceptTitle(db, c.row.concept_id) : null;

  return NextResponse.json(
    {
      ok: true,
      row: toClaimDTO(c.row),
      concept: concept.ok ? { id: c.row.concept_id, title: conceptTitle ?? "Kavram" } : null,
      evidence,
      view,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
