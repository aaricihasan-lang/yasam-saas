import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { PLAN_COLUMNS, PLAN_PATCH_KEYS, PLAN_STATUSES, isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, isPlanEditable, loadPlanDaySummaries } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/** GET: plan + lightweight day summaries (meal_count + energy total). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { data: plan, error } = await db
    .from("nutrition_plans").select(PLAN_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const days = await loadPlanDaySummaries(db, tenantId, id);
  return NextResponse.json({ ok: true, plan, days }, { headers: { "Cache-Control": "no-store" } });
}

/** PATCH: plan meta (title/note/daily_energy_target/status). Archived → 403. Optimistic concurrency. */
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PLAN_PATCH_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);

  // Optimistic concurrency (§25): expectedUpdatedAt eşleşmezse stale.
  if (typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt !== plan.updated_at) {
    return beslenmeJson({ ok: false, code: "PLAN_STALE" }, 409);
  }

  const patch: Record<string, unknown> = {};
  if ("title" in body) {
    const t = cleanStr(body.title, 200);
    if (!t) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);
    patch.title = t;
  }
  if ("note" in body) patch.note = cleanStr(body.note, 4000);
  if ("daily_energy_target" in body) {
    if (body.daily_energy_target == null) patch.daily_energy_target = null;
    else {
      const v = cleanNumber(body.daily_energy_target, { min: 0.0001, max: 100000 });
      if (v == null) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
      patch.daily_energy_target = v;
    }
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !(PLAN_STATUSES as readonly string[]).includes(body.status)) {
      return beslenmeJson({ ok: false, code: "BAD_STATUS" }, 400);
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_UPDATE" }, 400);

  const { data, error } = await db
    .from("nutrition_plans").update(patch).eq("tenant_id", tenantId).eq("id", id).select(PLAN_COLUMNS).single();
  if (error) return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  return NextResponse.json({ ok: true, plan: data });
}

/** DELETE: planı kalıcı sil (cascade: gün/öğün/item/nutrient). Owner-only. */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { error } = await db.from("nutrition_plans").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) return beslenmeJson({ ok: false, code: "DELETE_FAILED" }, 500);
  return NextResponse.json({ ok: true });
}
