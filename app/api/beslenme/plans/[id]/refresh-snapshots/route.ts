import { NextRequest, NextResponse } from "next/server";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";
import { computeSnapshotRefresh } from "@/lib/beslenme/snapshotRefresh";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET: TASLAK plan için "Besin değerlerini güncelle" ÖNİZLEMESİ — hangi kalemlerin hangi
 * besinde farklılaştığı (100 g enerji önce/sonra). Hiçbir şey yazmaz.
 */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const r = await computeSnapshotRefresh(db, tenantId, id);
  if (!r.ok) return beslenmeJson({ ok: false, code: r.code }, r.status);
  const { payload: _p, ...preview } = r.value;
  void _p;
  return NextResponse.json({ ok: true, ...preview }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST: kullanıcı ONAYIYLA değişen kalemlerin snapshot'larını effective besinden yeniden yaz.
 * body: { expected_count } — önizlemede gösterilen sayı; arada değiştiyse 409 (yeniden önizleme).
 * Yalnız status='draft' (RPC de zorlar). Tek transaction (nutrition_plan_refresh_item_snapshots).
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
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
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["expected_count"]) || !Number.isInteger(body.expected_count)) {
    return beslenmeJson({ ok: false, code: "BAD_INPUT" }, 400);
  }

  const r = await computeSnapshotRefresh(db, tenantId, id);
  if (!r.ok) return beslenmeJson({ ok: false, code: r.code }, r.status);
  if (!r.value.eligible) return beslenmeJson({ ok: false, code: "PLAN_NOT_DRAFT" }, 409);
  if (r.value.changes.length !== body.expected_count) {
    await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_updated", subEntity: "plan", errorClass: "conflict" });
    return beslenmeJson({ ok: false, code: "REFRESH_STALE" }, 409);
  }
  if (r.value.payload.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const { data, error } = await db.rpc("nutrition_plan_refresh_item_snapshots", {
    p_tenant_id: tenantId,
    p_plan_id: id,
    p_items: r.value.payload,
  });
  if (error) {
    if (error.code === "45010") return beslenmeJson({ ok: false, code: "PLAN_NOT_DRAFT" }, 409);
    const m = mapRpcError(error.code);
    const errorClass = usageErrorClassForStatus(m.status);
    if (errorClass) {
      await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_updated", subEntity: "plan", errorClass });
    }
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  const updated = Number(data ?? 0);
  if (updated > 0) {
    await trackUsage(guard, req, { module: "beslenme", action: "record_updated", subEntity: "plan", resourceId: id, itemCount: updated });
  }
  return NextResponse.json({ ok: true, updated });
}
