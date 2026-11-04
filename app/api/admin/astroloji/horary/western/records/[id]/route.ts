import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, requireAstrologyAccess, astrologyTechniqueDenied } from "@/lib/astrology/access/ownerGate";
import { ASTRO_GRANT_HORARY_LILLY } from "@/lib/astrology/access/techniqueGrants";
import { getHoraryRecord, patchHoraryRecord } from "@/lib/astrology/horary/westernRecords";
import { readJsonBody } from "@/lib/astrology/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/** GET — kayıtlı Horary (anlık görüntüden; yeniden hesap yok). PATCH — yalnız başlık / danışan bağlantısı. Silme YOK. */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // 2026-11-03 teknik izni (kapalıysa 403; hesap / kayıt / rapor yapılmaz).
  const denied = astrologyTechniqueDenied(gate.ctx, ASTRO_GRANT_HORARY_LILLY);
  if (denied) return denied;
  const { id } = await ctx.params;
  const r = await getHoraryRecord({ db: gate.ctx.db, tenantId: gate.ctx.tenantId, userId: gate.ctx.userId }, id);
  return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // 2026-11-03 teknik izni (kapalıysa 403; hesap / kayıt / rapor yapılmaz).
  const denied = astrologyTechniqueDenied(gate.ctx, ASTRO_GRANT_HORARY_LILLY);
  if (denied) return denied;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const { id } = await ctx.params;
  const r = await patchHoraryRecord({ db: gate.ctx.db, tenantId: gate.ctx.tenantId, userId: gate.ctx.userId }, id, b.body);
  return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
}
