import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { isWesternHoraryPreviewEnabled } from "@/lib/astrology/horary/westernPreview";
import { getHoraryRecord, patchHoraryRecord } from "@/lib/astrology/horary/westernRecords";
import { readJsonBody } from "@/lib/astrology/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/** GET — kayıtlı Horary (anlık görüntüden; yeniden hesap yok). PATCH — yalnız başlık / danışan bağlantısı. Silme YOK. */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // Önizleme bayrağı kapalıyken uç yokmuş gibi davranır (aynı 404).
  if (!isWesternHoraryPreviewEnabled()) return astrologyNotFoundResponse();
  const { id } = await ctx.params;
  const r = await getHoraryRecord({ db: gate.ctx.db, tenantId: gate.ctx.tenantId, userId: gate.ctx.userId }, id);
  return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // Önizleme bayrağı kapalıyken uç yokmuş gibi davranır (aynı 404).
  if (!isWesternHoraryPreviewEnabled()) return astrologyNotFoundResponse();
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const { id } = await ctx.params;
  const r = await patchHoraryRecord({ db: gate.ctx.db, tenantId: gate.ctx.tenantId, userId: gate.ctx.userId }, id, b.body);
  return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
}
