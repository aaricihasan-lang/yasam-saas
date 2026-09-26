import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { cleanStr, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { PLAN_COPY_KEYS, cleanDate, isUuid } from "@/lib/beslenme/planContracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: planı kopyala → YENİ AİLE, revision=1, draft (deep snapshots). Archived kopyalanabilir.
 *
 * Erişim: requireBeslenmePlanAccess (module | bound-plan client). Kaynak plan yabancı tenant →
 * 404 (guard). Kopya YENİ (unbound) family üretir.
 *   - authority="module" (admin + Beslenme izinli uzman): mevcut global semantik → kopya UNBOUND.
 *   - authority="client" (yalnız clients izinli uzman): kaynak plana danışan üzerinden erişildiğinden
 *     kopyanın unbound kalması onu erişilemez kılardı (dead-end) → kopya AYNI danışana otomatik
 *     bağlanır (cross-client YOK; body'den client_id ALINMAZ). Bind başarısızsa compensating delete.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId, userId, authority, boundClientId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PLAN_COPY_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  const title = body.title == null ? null : cleanStr(body.title, 200);
  let start: string | null = null;
  if (body.start_date != null) {
    start = cleanDate(body.start_date);
    if (!start) return beslenmeJson({ ok: false, code: "BAD_DATE" }, 400);
  }

  const { data, error } = await db.rpc("nutrition_plan_copy", {
    p_tenant_id: tenantId, p_source_plan_id: id, p_new_title: title, p_new_start_date: start,
  });
  if (error) { const m = mapRpcError(error.code); return beslenmeJson({ ok: false, code: m.code }, m.status); }

  const copied = data as { id?: string; plan_family_id?: string } | null;
  // CLIENT-ONLY + bağlı kaynak → kopyayı AYNI danışana bağla (erişim dead-end'i önle).
  // MODULE authority (admin + Beslenme uzmanı) → kopya unbound kalır (global semantik).
  if (authority === "client" && boundClientId && copied?.id && copied?.plan_family_id) {
    const { error: aErr } = await db.rpc("nutrition_plan_assign_client", {
      p_tenant_id: tenantId, p_plan_id: copied.id, p_client_id: boundClientId, p_assigned_by: userId,
    });
    if (aErr) {
      // compensating delete: yeni family'nin tüm plan satırları (binding oluşmadı → cascade yok).
      await db.from("nutrition_plans").delete().eq("tenant_id", tenantId).eq("plan_family_id", copied.plan_family_id);
      return beslenmeJson({ ok: false, code: "PLAN_BIND_FAILED" }, 500);
    }
  }
  return NextResponse.json({ ok: true, plan: data }, { status: 201 });
}
