import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUuid } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; linkId: string }> };

/** DELETE: food↔source bağını kaldır (kaynak entity'si etkilenmez). */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: foodId, linkId } = await ctx.params;
  if (!isUuid(foodId) || !isUuid(linkId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { error, count } = await db
    .from("nutrition_food_sources")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("food_id", foodId)
    .eq("id", linkId);
  if (error) return beslenmeJson({ ok: false, code: "UNLINK_FAILED" }, 500);
  if (!count) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  return NextResponse.json({ ok: true, deleted: true });
}
