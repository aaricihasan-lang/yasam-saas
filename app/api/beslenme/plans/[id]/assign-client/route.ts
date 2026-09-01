import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { requireClientInTenant, clientDisplayName } from "@/lib/danisan/clientGuard";
import { mapAssignError } from "@/lib/beslenme/clientContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** GET: bu planın family'sinin mevcut danışan bağı (varsa). Plan editor context için. */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { data: plan } = await db
    .from("nutrition_plans").select("plan_family_id, status")
    .eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!plan) return beslenmeJson({ ok: false, code: "PLAN_NOT_FOUND" }, 404);
  const family = (plan as { plan_family_id: string }).plan_family_id;

  const { data: bind } = await db
    .from("nutrition_plan_clients").select("client_id")
    .eq("tenant_id", tenantId).eq("plan_family_id", family).maybeSingle();
  const clientId = (bind as { client_id?: string } | null)?.client_id ?? null;
  if (!clientId) {
    // arşiv-family (bağsız) → yeni atama yasağı bilgisini de döndür (§11).
    const familyArchived = (plan as { status?: string }).status === "archived";
    return NextResponse.json({ ok: true, bound: false, canBind: !familyArchived }, { headers: { "Cache-Control": "no-store" } });
  }
  const client = await requireClientInTenant(db, tenantId, clientId);
  return NextResponse.json(
    { ok: true, bound: true, client: client ? { id: client.id, display_name: clientDisplayName(client) } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST: plan FAMILY'sini danışana bağla (immutable recipient — §4/§11).
 * Reassign farklı danışana YASAK (RPC 45021 → 409). Unassign YOK.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId, userId } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["client_id"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  const clientId = String(body.client_id ?? "");
  if (!isUuid(clientId)) return beslenmeJson({ ok: false, code: "BAD_CLIENT_ID" }, 400);

  // client ownership server doğrula (RPC de doğrular; burada minimal display için de gerekli).
  const client = await requireClientInTenant(db, tenantId, clientId);
  if (!client) return beslenmeJson({ ok: false, code: "CLIENT_NOT_FOUND" }, 404);

  const { data, error } = await db.rpc("nutrition_plan_assign_client", {
    p_tenant_id: tenantId,
    p_plan_id: id,
    p_client_id: clientId,
    p_assigned_by: userId,
  });
  if (error) {
    const m = mapAssignError(error.code);
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }

  return NextResponse.json(
    { ok: true, binding: data, client: { id: client.id, display_name: clientDisplayName(client) } },
    { status: 200 },
  );
}
