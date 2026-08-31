import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { isUuid } from "@/lib/beslenme/planContracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; dayId: string }> };

/** POST: günü hedef güne DEEP COPY (hedef gün BOŞ olmalı → 409 TARGET_NOT_EMPTY; §21). Archived → 403. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, dayId } = await ctx.params;
  if (!isUuid(id) || !isUuid(dayId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["targetDayId"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (!isUuid(body.targetDayId)) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
  if (body.targetDayId === dayId) return beslenmeJson({ ok: false, code: "SAME_DAY" }, 400);

  const { error } = await db.rpc("nutrition_plan_day_copy", {
    p_tenant_id: tenantId, p_plan_id: id, p_source_day_id: dayId, p_target_day_id: body.targetDayId,
  });
  if (error) { const m = mapRpcError(error.code); return beslenmeJson({ ok: false, code: m.code }, m.status); }
  return NextResponse.json({ ok: true });
}
