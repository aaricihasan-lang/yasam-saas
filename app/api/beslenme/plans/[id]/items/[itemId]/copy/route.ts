import { NextRequest, NextResponse } from "next/server";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { isUuid } from "@/lib/beslenme/planContracts";
import { getItemScope, mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; itemId: string }> };

/** POST: item'ı hedef öğüne VERBATIM kopyala (çoğalt / taşı-kopya). Archived → 403 (RPC). */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id, itemId } = await ctx.params;
  if (!isUuid(id) || !isUuid(itemId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["targetMealId"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (!isUuid(body.targetMealId)) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);

  // Kaynak item bu plana ait olmalı (foreign id fail-closed; RPC ayrıca tenant doğrular).
  const scope = await getItemScope(db, tenantId, itemId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const { data, error } = await db.rpc("nutrition_plan_item_copy", {
    p_tenant_id: tenantId, p_item_id: itemId, p_target_meal_id: body.targetMealId,
  });
  if (error) {
    const m = mapRpcError(error.code);
    const errorClass = usageErrorClassForStatus(m.status);
    if (errorClass) {
      await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_created", subEntity: "item", errorClass });
    }
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  // Usage360: VERBATIM kopya hedef öğünde YENİ kalem üretir → record_created(item).
  await trackUsage(guard, req, {
    module: "beslenme",
    action: "record_created",
    subEntity: "item",
    resourceId: (data as { id?: string } | null)?.id ?? null,
  });
  return NextResponse.json({ ok: true, item: data }, { status: 201 });
}
