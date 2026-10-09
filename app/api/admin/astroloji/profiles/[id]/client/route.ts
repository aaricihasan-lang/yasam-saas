import { NextRequest } from "next/server";
import { requireAstrologyOwner } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { linkProfileClient, unlinkProfileClient } from "@/lib/astrology/clients/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT { clientId, expectedClientId, confirmRelink? } — profili merkezî danışanla AÇIK onayla eşleştir.
 * Yalnız uzmanın kendi profili + kendi tenant'ındaki danışan; başka danışana yeniden bağlama confirmRelink ister.
 */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await linkProfileClient(gate.ctx, id, b.body));
}

/** DELETE ?expectedClientId= — eşleştirmeyi kaldır (profil, revizyonlar ve analizler SİLİNMEZ). */
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  return serviceJson(await unlinkProfileClient(gate.ctx, id, req.nextUrl.searchParams.get("expectedClientId")));
}
