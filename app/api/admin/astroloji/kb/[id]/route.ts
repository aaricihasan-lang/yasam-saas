import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { enforceAstroWrite } from "@/lib/astrology/limits";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { deleteKb, getKbEntry, updateKb } from "@/lib/astrology/kb/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  return serviceJson(await getKbEntry(gate.ctx, id));
}

/** PATCH — düzenle (iyimser kilit: expectedRevision). */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const limited = await enforceAstroWrite(gate.ctx, "kb_update");
  if (limited) return limited;
  return serviceJson(await updateKb(gate.ctx, id, b.body));
}

/** DELETE ?expectedRevision=N — yalnız (tenant, uzman, id, revizyon) tam eşleşirse siler. */
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const rev = Number(req.nextUrl.searchParams.get("expectedRevision"));
  return serviceJson(await deleteKb(gate.ctx, id, Number.isFinite(rev) ? rev : null));
}
