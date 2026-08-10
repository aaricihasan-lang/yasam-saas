import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { listSources } from "@/lib/yebs/service/sources";
import { parseListParams, isUuid } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible } from "@/lib/yebs/showcase/visibility";
import { toSourceDTO } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/sources — SALT-OKUNUR kaynak listesi.
 * Filtre: traditionContextId (opsiyonel). Default published; ?preview=1 admin.
 * sources.status 'archived' içerir → hiçbir görünümde archived gösterilmez.
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

  const traditionContextId = sp.get("traditionContextId");
  if (traditionContextId !== null && !isUuid(traditionContextId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz gelenek kimliği.", code: "YEBS_INVALID_ID" }, { status: 400 });
  }

  const result = await listSources(db, {
    limit: params.limit,
    offset: params.offset,
    q: params.q,
    ...(traditionContextId ? { traditionContextId } : {}),
    ...(view === "published" ? { status: "published" as const } : {}),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Kaynaklar yüklenemedi.", code: result.code }, { status: 500 });
  }

  const visible = result.rows.filter((r) => isEntityStatusVisible(r.status, view));
  const rows = visible.map(toSourceDTO);
  const count = view === "published" ? result.count : rows.length;

  return NextResponse.json(
    { ok: true, rows, count, limit: params.limit, offset: params.offset, view },
    { headers: { "Cache-Control": "no-store" } },
  );
}
