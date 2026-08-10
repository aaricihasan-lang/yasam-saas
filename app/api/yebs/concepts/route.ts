import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { listConcepts, listConceptLabels } from "@/lib/yebs/service/concepts";
import { parseListParams, isUuid } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible } from "@/lib/yebs/showcase/visibility";
import { toConceptDTO, pickDisplayTitle } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/concepts — SALT-OKUNUR kavram listesi.
 * Filtre: traditionId (opsiyonel). Arama `q` A8 label-aware davranışını reuse eder.
 * Görünen başlık backend JOIN vermediğinden sayfa başına etiketlerden çözülür.
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

  const traditionId = sp.get("traditionId");
  if (traditionId !== null && !isUuid(traditionId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz gelenek kimliği.", code: "YEBS_INVALID_ID" }, { status: 400 });
  }

  const result = await listConcepts(db, {
    limit: params.limit,
    offset: params.offset,
    q: params.q,
    ...(traditionId ? { traditionId } : {}),
    ...(view === "published" ? { status: "published" as const } : {}),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Kavramlar yüklenemedi.", code: result.code }, { status: 500 });
  }

  const visible = result.rows.filter((r) => isEntityStatusVisible(r.status, view));
  const rows = await Promise.all(
    visible.map(async (r) => {
      const labels = await listConceptLabels(db, r.id);
      const title = pickDisplayTitle(labels.ok ? labels.rows : [], r.slug);
      return toConceptDTO(r, title);
    }),
  );
  const count = view === "published" ? result.count : rows.length;

  return NextResponse.json(
    { ok: true, rows, count, limit: params.limit, offset: params.offset, view },
    { headers: { "Cache-Control": "no-store" } },
  );
}
