import { NextRequest, NextResponse } from "next/server";
import { trackUsage } from "@/lib/usage/trackUsage";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { getPlan, isPlanEditable, getDayScope } from "@/lib/beslenme/planEngine";
import { consumeDestructiveChallenge } from "@/lib/beslenme/destructiveChallenge";
import { loadDayClearScope } from "@/lib/beslenme/dayClearScope";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; dayId: string }> };

/**
 * POST: günü temizle — TOPLU SİLME (günün tüm öğünleri + kalemleri). Gün row'u KALIR (dense).
 * 3 AŞAMALI KORUMA: kapsam + ikinci uyarı UI'da; SON ADIM burada sunucu doğrulamalı 4 haneli
 * kod ile: body { challenge_id, code } ZORUNLU (…/clear/challenge ile üretilir). Kapsam (öğün +
 * kalem kimlikleri) onay anında yeniden hesaplanır; değiştiyse işlem reddedilir. Yalnız onaylanan
 * öğünler silinir. Archived → 403.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId, userId } = guard;
  const { id, dayId } = await ctx.params;
  if (!isUuid(id) || !isUuid(dayId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["challenge_id", "code"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  const scope = await getDayScope(db, tenantId, dayId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  const clear = await loadDayClearScope(db, tenantId, id, dayId);
  if (!clear.ok) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  if (clear.mealIds.length === 0) return NextResponse.json({ ok: true, cleared: 0 });

  const rejected = await consumeDestructiveChallenge(db, {
    tenantId,
    userId,
    action: "plan_day_clear",
    challengeId: body.challenge_id,
    code: body.code,
    scopeKeys: clear.keys,
  });
  if (rejected) return beslenmeJson({ ok: false, code: rejected.code }, rejected.status);

  const { error } = await db
    .from("nutrition_plan_meals")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("plan_day_id", dayId)
    .in("id", clear.mealIds);
  if (error) {
    await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_updated", subEntity: "day", errorClass: "server" });
    return beslenmeJson({ ok: false, code: "CLEAR_FAILED" }, 500);
  }
  // Usage360: "Günü temizle" = günün içeriğini değiştiren TEK kullanıcı eylemi (gün satırı kalır).
  await trackUsage(guard, req, {
    module: "beslenme",
    action: "record_updated",
    subEntity: "day",
    resourceId: dayId,
    itemCount: clear.mealIds.length,
  });
  return NextResponse.json({ ok: true, cleared: clear.mealIds.length });
}
