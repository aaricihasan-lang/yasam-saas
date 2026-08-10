import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { listClaims } from "@/lib/yebs/service/claims";
import { parseListParams, isUuid } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible } from "@/lib/yebs/showcase/visibility";
import { toClaimDTO } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/claims — SALT-OKUNUR "Kaynaklı Bilgiler" listesi.
 * Filtre: conceptId (opsiyonel). `q` claim_text üzerinde arar.
 * claims.status 'archived' içerir → hiçbir görünümde archived gösterilmez.
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

  const result = await listClaims(db, {
    limit: params.limit,
    offset: params.offset,
    q: params.q,
    ...(conceptId ? { conceptId } : {}),
    ...(view === "published" ? { status: "published" as const } : {}),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Kaynaklı bilgiler yüklenemedi.", code: result.code }, { status: 500 });
  }

  const visible = result.rows.filter((r) => isEntityStatusVisible(r.status, view));
  const rows = visible.map(toClaimDTO);
  const count = view === "published" ? result.count : rows.length;

  return NextResponse.json(
    { ok: true, rows, count, limit: params.limit, offset: params.offset, view },
    { headers: { "Cache-Control": "no-store" } },
  );
}
