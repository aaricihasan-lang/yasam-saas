import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { PLAN_RANGE_KEYS, cleanDate, daysBetween, isUuid } from "@/lib/beslenme/planContracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: plan tarih aralığını senkronize et (genişlet: eksik gün idempotent; daralt: dolu-gün
 * aralık-dışı → 409 RANGE_HAS_CONTENT, ZERO deletion; §20). Archived → 403.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PLAN_RANGE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  const start = cleanDate(body.start_date);
  const end = cleanDate(body.end_date);
  if (!start || !end) return beslenmeJson({ ok: false, code: "BAD_DATE" }, 400);
  if (daysBetween(start, end) < 0) return beslenmeJson({ ok: false, code: "BAD_RANGE" }, 400);
  if (daysBetween(start, end) > 366) return beslenmeJson({ ok: false, code: "RANGE_TOO_LONG" }, 400);

  const { data, error } = await db.rpc("nutrition_plan_sync_range", {
    p_tenant_id: tenantId, p_plan_id: id, p_start_date: start, p_end_date: end,
  });
  if (error) { const m = mapRpcError(error.code); return beslenmeJson({ ok: false, code: m.code }, m.status); }
  return NextResponse.json({ ok: true, plan: data });
}
