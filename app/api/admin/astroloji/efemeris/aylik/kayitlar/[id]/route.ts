import type { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { getMonthlyRecord } from "@/lib/astrology/pro/monthly/records";
import { json, monthlyAfterGate } from "@/lib/astrology/pro/monthly/routeKit";

export const runtime = "nodejs";
export const maxDuration = 60;
type RouteContext = { params: Promise<{ id: string }> };

/** GET — kayıtlı aylık efemeris (değişmez anlık görüntü). Yeniden hesap / sağlayıcı çağrısı YOK. */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const off = monthlyAfterGate(gate.ctx);
  if (off) return off;
  const g = gate;
  const { id } = await ctx.params;
  const r = await getMonthlyRecord({ db: g.ctx.db, tenantId: g.ctx.tenantId, userId: g.ctx.userId }, id);
  return json(r.body, r.status);
}
