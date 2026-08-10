import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { listTraditions } from "@/lib/yebs/service/traditions";
import { parseListParams } from "@/lib/yebs/showcase/apiHelpers";
import { resolveView, isEntityStatusVisible } from "@/lib/yebs/showcase/visibility";
import { toTraditionDTO } from "@/lib/yebs/showcase/dto";

export const runtime = "nodejs";

/**
 * GET /api/yebs/traditions — YEBS uzman vitrini SALT-OKUNUR gelenek listesi.
 *
 * Güvenlik: verifyAdminRequest (x-admin-id + x-session-token → role=admin+active).
 * Default published-only; ?preview=1 yalnız doğrulanmış admin isteğinde yayınlanmamış
 * kayıtları da döner (archived hariç). Mutation YOK; service_role istemciye çıkmaz.
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

  const result = await listTraditions(db, {
    limit: params.limit,
    offset: params.offset,
    q: params.q,
    ...(view === "published" ? { status: "published" as const } : {}),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Gelenekler yüklenemedi.", code: result.code }, { status: 500 });
  }

  const visible = result.rows.filter((r) => isEntityStatusVisible(r.status, view));
  const rows = visible.map(toTraditionDTO);
  const count = view === "published" ? result.count : rows.length;

  return NextResponse.json(
    { ok: true, rows, count, limit: params.limit, offset: params.offset, view },
    { headers: { "Cache-Control": "no-store" } },
  );
}
