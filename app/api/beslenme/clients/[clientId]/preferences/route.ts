import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";
import { cleanStr, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { isUuid } from "@/lib/beslenme/planContracts";
import { SYSTEM_NUTRITION_TENANT_ID } from "@/lib/beslenme/systemTenant";
import { PREFERENCE_COLUMNS, PREFERENCE_POST_KEYS, PREFERENCE_STANCES } from "@/lib/beslenme/clientContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ clientId: string }> };

/** GET: tercih edilen/kaçınılan besinler. */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;

  const { data, error } = await g.guard.db
    .from("nutrition_client_food_preferences")
    .select(PREFERENCE_COLUMNS)
    .eq("tenant_id", g.guard.tenantId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return beslenmeJson({ ok: false, code: "PREFERENCE_READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, preferences: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** POST: tercih ekle. food_id doluysa SYSTEM veya caller-tenant custom olmalı (3. tenant deny). */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const demo = denyDemoMutation(g.guard);
  if (demo) return demo;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PREFERENCE_POST_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const stance = String(body.stance ?? "");
  if (!(PREFERENCE_STANCES as readonly string[]).includes(stance)) {
    return beslenmeJson({ ok: false, code: "BAD_STANCE" }, 400);
  }
  const label = cleanStr(body.food_label, 200);
  if (!label) return beslenmeJson({ ok: false, code: "LABEL_REQUIRED" }, 400);

  let foodId: string | null = null;
  if (body.food_id != null) {
    const fid = String(body.food_id);
    if (!isUuid(fid)) return beslenmeJson({ ok: false, code: "BAD_FOOD_ID" }, 400);
    // besin SYSTEM veya caller-tenant mı? (3. tenant custom food reddi)
    const { data: food, error: fErr } = await g.guard.db
      .from("nutrition_foods").select("id, tenant_id").eq("id", fid)
      .in("tenant_id", [SYSTEM_NUTRITION_TENANT_ID, g.guard.tenantId]).maybeSingle();
    if (fErr) return beslenmeJson({ ok: false, code: "FOOD_READ_FAILED" }, 500);
    if (!food) return beslenmeJson({ ok: false, code: "FOOD_NOT_ACCESSIBLE" }, 400);
    foodId = fid;
  }

  const { data, error } = await g.guard.db
    .from("nutrition_client_food_preferences")
    .insert({ tenant_id: g.guard.tenantId, client_id: clientId, stance, food_id: foodId, food_label: label, note: cleanStr(body.note, 500) })
    .select(PREFERENCE_COLUMNS)
    .single();
  if (error) return beslenmeJson({ ok: false, code: "PREFERENCE_SAVE_FAILED" }, 500);
  return NextResponse.json({ ok: true, preference: data }, { status: 201 });
}
