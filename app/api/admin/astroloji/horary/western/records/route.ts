import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, requireAstrologyAccess, astrologyTechniqueDenied } from "@/lib/astrology/access/ownerGate";
import { ASTRO_GRANT_HORARY_LILLY } from "@/lib/astrology/access/techniqueGrants";
import { listHoraryRecords, saveHoraryRecord } from "@/lib/astrology/horary/westernRecords";
import { readJsonBody } from "@/lib/astrology/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET — uzmanın kendi Horary kayıtları (?q=&from=&to=&clientId=&limit=&offset=). POST — kaydet (sunucuda yeniden hesap). */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // 2026-11-03 teknik izni (kapalıysa 403; hesap / kayıt / rapor yapılmaz).
  const denied = astrologyTechniqueDenied(gate.ctx, ASTRO_GRANT_HORARY_LILLY);
  if (denied) return denied;
  const r = await listHoraryRecords({ db: gate.ctx.db, tenantId: gate.ctx.tenantId, userId: gate.ctx.userId }, req.nextUrl.searchParams);
  return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  // 2026-11-03 teknik izni (kapalıysa 403; hesap / kayıt / rapor yapılmaz).
  const denied = astrologyTechniqueDenied(gate.ctx, ASTRO_GRANT_HORARY_LILLY);
  if (denied) return denied;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const r = await saveHoraryRecord({ db: gate.ctx.db, tenantId: gate.ctx.tenantId, userId: gate.ctx.userId }, b.body);
  return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
}
