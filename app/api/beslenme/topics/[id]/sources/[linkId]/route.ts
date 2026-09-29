import { NextRequest, NextResponse } from "next/server";
import { trackUsage } from "@/lib/usage/trackUsage";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isActiveTopicInTenant } from "@/lib/beslenme/topicGuard";
import { isUuid } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; linkId: string }> };

/** DELETE: topic↔source bağını kaldır (kaynak entity'si etkilenmez). */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId, linkId } = await ctx.params;
  if (!isUuid(topicId) || !isUuid(linkId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);
  // Rehber bu tenant'a ait + aktif olmalı (legacy pasif rehberin alt kayıtları API'den de değişmez).
  if (!(await isActiveTopicInTenant(db, tenantId, topicId))) return beslenmeJson({ ok: false, code: "TOPIC_NOT_FOUND" }, 404);

  const { error, count } = await db
    .from("nutrition_topic_sources")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("topic_id", topicId)
    .eq("id", linkId);
  if (error) {
    await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_deleted", subEntity: "source_link", errorClass: "server" });
    return beslenmeJson({ ok: false, code: "UNLINK_FAILED" }, 500);
  }
  if (!count) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  await trackUsage(guard, req, { module: "beslenme", action: "record_deleted", subEntity: "source_link", resourceId: linkId });
  return NextResponse.json({ ok: true, deleted: true });
}
