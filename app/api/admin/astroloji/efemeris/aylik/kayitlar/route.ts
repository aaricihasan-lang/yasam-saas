import type { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody } from "@/lib/astrology/http";
import { listMonthlyRecords, saveMonthlyRecord } from "@/lib/astrology/pro/monthly/records";
import { json, monthlyAfterGate } from "@/lib/astrology/pro/monthly/routeKit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET — uzmanın kendi kayıtlı aylık efemerisleri (?kind=&year=&limit=&offset=). */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const off = monthlyAfterGate(gate.ctx);
  if (off) return off;
  const g = gate;
  const r = await listMonthlyRecords({ db: g.ctx.db, tenantId: g.ctx.tenantId, userId: g.ctx.userId }, req.nextUrl.searchParams);
  return json(r.body, r.status);
}

/** POST — kaydet: { kind, year, month, title?, saveRequestId }. İçerik sunucu önbelleğinden (sağlayıcı çağrısı YOK). */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const off = monthlyAfterGate(gate.ctx);
  if (off) return off;
  const g = gate;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const r = await saveMonthlyRecord({ db: g.ctx.db, tenantId: g.ctx.tenantId, userId: g.ctx.userId }, b.body, { db: g.ctx.db });
  return json(r.body, r.status);
}
