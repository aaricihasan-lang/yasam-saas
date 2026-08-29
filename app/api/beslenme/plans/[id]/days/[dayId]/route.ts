import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { DAY_PATCH_KEYS, isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, getDayScope, loadDayDetail } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; dayId: string }> };

/** GET: gün detay (meals + items + frozen nutrient snapshot). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id, dayId } = await ctx.params;
  if (!isUuid(id) || !isUuid(dayId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const day = await loadDayDetail(db, tenantId, id, dayId);
  if (!day) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, day }, { headers: { "Cache-Control": "no-store" } });
}

/** PATCH: günlük hedef override / not. Archived → 403. */
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, dayId } = await ctx.params;
  if (!isUuid(id) || !isUuid(dayId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, DAY_PATCH_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getDayScope(db, tenantId, dayId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const patch: Record<string, unknown> = {};
  if ("energy_target_override" in body) {
    if (body.energy_target_override == null) patch.energy_target_override = null;
    else {
      const v = cleanNumber(body.energy_target_override, { min: 0.0001, max: 100000 });
      if (v == null) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
      patch.energy_target_override = v;
    }
  }
  if ("note" in body) patch.note = cleanStr(body.note, 4000);
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_UPDATE" }, 400);

  const { error } = await db
    .from("nutrition_plan_days").update(patch).eq("tenant_id", tenantId).eq("id", dayId).eq("plan_id", id);
  if (error) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);

  const day = await loadDayDetail(db, tenantId, id, dayId);
  return NextResponse.json({ ok: true, day });
}
