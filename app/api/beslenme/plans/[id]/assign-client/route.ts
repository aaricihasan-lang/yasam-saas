import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { requireClientInTenant, clientDisplayName } from "@/lib/danisan/clientGuard";
import { mapAssignError } from "@/lib/beslenme/clientContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET: bu planın family'sinin mevcut danışan bağı (varsa) + kompakt bağlam özeti.
 * Plan editor context şeridi + kaçınılan-besin advisory'si için (§15/§16/§17).
 *
 * SPOOF-PROOF: client_id URL/body'den ALINMAZ; plan_id → tenant → family →
 * nutrition_plan_clients → client zincirinden SERVER çözer. Yabancı danışan bağlamı
 * enjekte edilemez. Yalnız non-PII alanlar döner (telefon/adres YOK — §15/§22).
 */
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
  if (!client) {
    // binding var ama client çözülemedi (yarış/silme) → bağsız gibi davran (fail-safe).
    return NextResponse.json({ ok: true, bound: false, canBind: false }, { headers: { "Cache-Control": "no-store" } });
  }

  // Kompakt bağlam: hedef + beyan alerjiler + kaçınılan besinler (id + label).
  // client_id server-doğrulanmış clientId'dir (spoof edilemez). Tek round-trip demeti.
  const [profileRes, allergenRes, avoidedRes] = await Promise.all([
    db.from("nutrition_client_profiles")
      .select("goal_type, goal_note")
      .eq("tenant_id", tenantId).eq("client_id", clientId).maybeSingle(),
    db.from("nutrition_client_allergens")
      .select("nutrition_allergens(code, name_tr, name_en)")
      .eq("tenant_id", tenantId).eq("client_id", clientId),
    db.from("nutrition_client_food_preferences")
      .select("food_id, food_label")
      .eq("tenant_id", tenantId).eq("client_id", clientId).eq("stance", "avoided"),
  ]);

  const profile = (profileRes.data ?? null) as { goal_type: string | null; goal_note: string | null } | null;
  const allergenRows = (allergenRes.data ?? []) as unknown as Array<{
    nutrition_allergens: { code: string; name_tr: string | null; name_en: string | null } | null;
  }>;
  const avoidedRows = (avoidedRes.data ?? []) as Array<{ food_id: string | null; food_label: string }>;

  const context = {
    goal_type: profile?.goal_type ?? null,
    goal_note: profile?.goal_note ?? null,
    allergens: allergenRows
      .map((r) => r.nutrition_allergens)
      .filter((a): a is { code: string; name_tr: string | null; name_en: string | null } => a != null)
      .map((a) => ({ code: a.code, name_tr: a.name_tr, name_en: a.name_en })),
    avoided: avoidedRows.map((r) => ({ food_id: r.food_id, food_label: r.food_label })),
    kan: client.kan ?? null,
    mizac: client.mizac ?? null,
  };

  return NextResponse.json(
    { ok: true, bound: true, client: { id: client.id, display_name: clientDisplayName(client) }, context },
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
