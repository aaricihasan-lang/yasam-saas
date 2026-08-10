import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getConceptById, listConceptLabels } from "@/lib/yebs/service/concepts";
import { getTradition } from "@/lib/yebs/service/traditions";
import { getSchoolById } from "@/lib/yebs/service/schools";
import { isUuid } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible } from "@/lib/yebs/showcase/visibility";
import {
  toConceptDTO,
  toConceptLabelDTO,
  toSchoolDTO,
  pickDisplayTitle,
} from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/concepts/[id] — kavram + etiketler + gelenek + (varsa) ekol.
 * Salt-okunur; görünürlük politikası uygulanır (yayınlanmamış/archived → 404).
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

  const c = await getConceptById(db, id);
  if (!c.ok) {
    const status = c.code === "YEBS_CONCEPT_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: "Kavram bulunamadı.", code: c.code }, { status });
  }
  if (!isEntityStatusVisible(c.row.status, view)) {
    return NextResponse.json({ ok: false, error: "Kavram bulunamadı.", code: "YEBS_CONCEPT_NOT_FOUND" }, { status: 404 });
  }

  const labelsRes = await listConceptLabels(db, id);
  const labelRows = labelsRes.ok ? labelsRes.rows : [];
  const title = pickDisplayTitle(labelRows, c.row.slug);

  const tradition = await getTradition(db, c.row.tradition_id);
  const school = c.row.school_id ? await getSchoolById(db, c.row.school_id) : null;

  return NextResponse.json(
    {
      ok: true,
      row: toConceptDTO(c.row, title),
      labels: labelRows.map(toConceptLabelDTO),
      tradition: tradition.ok ? { id: tradition.row.id, nameTr: tradition.row.name_tr } : null,
      school: school && school.ok ? toSchoolDTO(school.row) : null,
      view,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
