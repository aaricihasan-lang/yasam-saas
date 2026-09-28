import { NextRequest, NextResponse } from "next/server";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { mapRpcError, isPlanEditable } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: yeni revizyon → AYNI AİLE, revision=max+1, draft (verbatim deep copy; §19).
 * Erişim: requireBeslenmePlanAccess (admin | bound-plan uzmanı). Yeni revizyon AYNI family
 * olduğundan mevcut danışan binding'i otomatik korunur (ek bağlama gerekmez).
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);
  // Legacy arşiv (status='archived') plandan revizyon açılamaz — UI gizlemesine güvenilmez.
  if (!isPlanEditable(guard.plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);

  const { data, error } = await db.rpc("nutrition_plan_revise", { p_tenant_id: tenantId, p_source_plan_id: id });
  if (error) {
    const m = mapRpcError(error.code);
    const errorClass = usageErrorClassForStatus(m.status);
    if (errorClass) {
      await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_created", subEntity: "plan", errorClass });
    }
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  // Usage360: revizyon YENİ plan satırı (aynı aile, revision+1) üretir → record_created.
  await trackUsage(guard, req, {
    module: "beslenme",
    action: "record_created",
    subEntity: "plan",
    resourceId: (data as { id?: string } | null)?.id ?? null,
  });
  return NextResponse.json({ ok: true, plan: data }, { status: 201 });
}
