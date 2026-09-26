import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson, resolveBeslenmeCapabilities } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { hasOnlyKeys, isUuid, inEnum } from "@/lib/beslenme/contracts";
import { mapRpcError, getDayScope } from "@/lib/beslenme/planEngine";
import { getTemplate } from "@/lib/beslenme/templateEngine";
import { TEMPLATE_APPLY_KEYS, TEMPLATE_APPLY_MODES } from "@/lib/beslenme/templateContracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: şablonu plan gününe uygula.
 *   mode 'meal' → hedef güne EKLER (append).
 *   mode 'day'  → hedef gün BOŞ olmalı (409 TARGET_NOT_EMPTY); silent overwrite YOK.
 * Body: { mode, target_plan_id, target_day_id }. Snapshot verbatim (server-authoritative).
 *
 * CAPABILITY-aware (admin↔uzman + clients-only paritesi): target_plan_id requireBeslenmePlanAccess
 * ile yetkilendirilir (module → own tenant her plan; client → yalnız bound plan). target_day_id
 * AYNI plana ait olmalı; şablon AYNI tenant'ta olmalı (foreign → 404). Body'den kimlik ÇIKARILMAZ.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  // Kimlik + yetenek (403 if neither).
  const caps = await resolveBeslenmeCapabilities(req);
  if (!caps.ok) return caps.response;
  const demo = denyDemoMutation(caps);
  if (demo) return demo;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, TEMPLATE_APPLY_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (!inEnum(body.mode, TEMPLATE_APPLY_MODES)) return beslenmeJson({ ok: false, code: "BAD_MODE" }, 400);
  if (!isUuid(body.target_plan_id)) return beslenmeJson({ ok: false, code: "BAD_PLAN" }, 400);
  if (!isUuid(body.target_day_id)) return beslenmeJson({ ok: false, code: "BAD_DAY" }, 400);

  // Hedef plan yetkilendirmesi (module → own tenant; client → yalnız bound). tenant burada belirlenir.
  const access = await requireBeslenmePlanAccess(req, body.target_plan_id as string);
  if (!access.ok) return access.response;
  const { db, tenantId } = access;

  // Ownership pre-checks (server-side; RPC de doğrular, ama net 404 için).
  const template = await getTemplate(db, tenantId, id);
  if (!template) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  const dayScope = await getDayScope(db, tenantId, body.target_day_id as string);
  if (!dayScope || dayScope.plan_id !== body.target_plan_id) {
    return beslenmeJson({ ok: false, code: "DAY_NOT_FOUND" }, 404);
  }

  const fn = body.mode === "meal" ? "nutrition_template_apply_meal" : "nutrition_template_apply_day";
  const { data, error } = await db.rpc(fn, {
    p_tenant_id: tenantId,
    p_template_id: id,
    p_target_plan_id: body.target_plan_id,
    p_target_day_id: body.target_day_id,
  });
  if (error) {
    const m = mapRpcError(error.code);
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  return NextResponse.json({ ok: true, result: data }, { status: 201 });
}
