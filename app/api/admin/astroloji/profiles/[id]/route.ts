import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { getAstroProfileDetail } from "@/lib/astrology/profiles/service";
import { setProfileArchived } from "@/lib/astrology/clients/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — profil + tüm (değişmez) revizyonları. */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  return serviceJson(await getAstroProfileDetail(gate.ctx, id));
}

/** PATCH { archived: boolean } — arşivle / arşivden çıkar (SİLME DEĞİL; analizler korunur). */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await setProfileArchived(gate.ctx, id, b.body));
}
