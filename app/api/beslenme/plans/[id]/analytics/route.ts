import { NextRequest, NextResponse } from "next/server";
import { beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { computePlanAnalytics } from "@/lib/beslenme/analytics";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET: plan analitiği (günlük/haftalık/özet) — server-authoritative, SNAPSHOT-only.
 * Owner gate + tenant IDOR (computePlanAnalytics → getPlan tenant-scoped; yabancı plan 404).
 */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const result = await computePlanAnalytics(db, tenantId, id);
  if (!result.ok) return beslenmeJson({ ok: false, code: result.error.code }, result.error.status);

  return NextResponse.json(
    { ok: true, analytics: result.analytics },
    { headers: { "Cache-Control": "no-store" } },
  );
}
