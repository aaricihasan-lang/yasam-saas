import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { listConceptRelations } from "@/lib/yebs/service/conceptRelations";
import { parseListParams, isUuid, resolveConceptTitle } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible } from "@/lib/yebs/showcase/visibility";
import { toRelationDTO } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/relations — SALT-OKUNUR ilişki listesi ("A → tip → B").
 * Filtre: conceptId (herhangi bir uç). Uç kavram başlıkları JOIN'siz çözülür.
 * relations.status 'archived' içerir → hiçbir görünümde archived gösterilmez.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;
  const params = parseListParams(sp);
  if (!params.ok) {
    return NextResponse.json({ ok: false, error: params.message, code: params.code }, { status: 400 });
  }
  const view = resolveView(sp.get("preview"));

  const conceptId = sp.get("conceptId");
  if (conceptId !== null && !isUuid(conceptId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz kavram kimliği.", code: "YEBS_INVALID_ID" }, { status: 400 });
  }

  const result = await listConceptRelations(db, {
    limit: params.limit,
    offset: params.offset,
    ...(conceptId ? { conceptId } : {}),
    ...(view === "published" ? { status: "published" as const } : {}),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "İlişkiler yüklenemedi.", code: result.code }, { status: 500 });
  }

  const visible = result.rows.filter((r) => isEntityStatusVisible(r.status, view));
  const rows = await Promise.all(
    visible.map(async (r) =>
      toRelationDTO(
        r,
        (await resolveConceptTitle(db, r.source_concept_id)) ?? "Kavram",
        (await resolveConceptTitle(db, r.target_concept_id)) ?? "Kavram",
      ),
    ),
  );
  const count = view === "published" ? result.count : rows.length;

  return NextResponse.json(
    { ok: true, rows, count, limit: params.limit, offset: params.offset, view },
    { headers: { "Cache-Control": "no-store" } },
  );
}
