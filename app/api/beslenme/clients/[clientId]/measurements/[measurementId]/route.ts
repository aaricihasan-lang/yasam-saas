import { NextRequest, NextResponse } from "next/server";
import { trackUsage } from "@/lib/usage/trackUsage";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";
import { isUuid } from "@/lib/beslenme/planContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ clientId: string; measurementId: string }> };

/** DELETE: tek ölçüm sil (tenant+client scope). */
export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId, measurementId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const demo = denyDemoMutation(g.guard);
  if (demo) return demo;
  if (!isUuid(measurementId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { error } = await g.guard.db
    .from("nutrition_client_measurements")
    .delete()
    .eq("tenant_id", g.guard.tenantId)
    .eq("client_id", clientId)
    .eq("id", measurementId);
  if (error) {
    await trackUsage(g.guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_deleted", subEntity: "measurement", errorClass: "server" });
    return beslenmeJson({ ok: false, code: "MEASUREMENT_DELETE_FAILED" }, 500);
  }
  await trackUsage(g.guard, req, { module: "beslenme", action: "record_deleted", subEntity: "measurement", resourceId: measurementId });
  return NextResponse.json({ ok: true });
}
