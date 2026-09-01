import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";
import { isUuid } from "@/lib/beslenme/planContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ clientId: string; preferenceId: string }> };

/** DELETE: tek tercih sil (tenant+client scope). */
export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId, preferenceId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const demo = denyDemoMutation(g.guard);
  if (demo) return demo;
  if (!isUuid(preferenceId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { error } = await g.guard.db
    .from("nutrition_client_food_preferences")
    .delete()
    .eq("tenant_id", g.guard.tenantId)
    .eq("client_id", clientId)
    .eq("id", preferenceId);
  if (error) return beslenmeJson({ ok: false, code: "PREFERENCE_DELETE_FAILED" }, 500);
  return NextResponse.json({ ok: true });
}
