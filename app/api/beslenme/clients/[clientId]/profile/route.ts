import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { clientDisplayName } from "@/lib/danisan/clientGuard";
import {
  GOAL_TYPES, ACTIVITY_LEVELS, PROFILE_PUT_KEYS, PROFILE_COLUMNS,
} from "@/lib/beslenme/clientContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ clientId: string }> };

/** GET: beslenme profili + minimal integrative context (id/display_name/kan/mizac). */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const { guard, client } = g;

  const { data, error } = await guard.db
    .from("nutrition_client_profiles")
    .select(PROFILE_COLUMNS)
    .eq("tenant_id", guard.tenantId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "PROFILE_READ_FAILED" }, 500);

  return NextResponse.json(
    {
      ok: true,
      profile: data ?? null,
      client: { id: client.id, display_name: clientDisplayName(client), kan: client.kan, mizac: client.mizac },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PUT: profil upsert (1:1 tenant+client). tenant_id/client_id body'den GELMEZ. */
export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const { guard } = g;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PROFILE_PUT_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const row: Record<string, unknown> = { tenant_id: guard.tenantId, client_id: clientId };

  if (body.goal_type != null) {
    if (!(GOAL_TYPES as readonly string[]).includes(String(body.goal_type)))
      return beslenmeJson({ ok: false, code: "BAD_GOAL_TYPE" }, 400);
    row.goal_type = body.goal_type;
  } else row.goal_type = null;

  if (body.activity_level != null) {
    if (!(ACTIVITY_LEVELS as readonly string[]).includes(String(body.activity_level)))
      return beslenmeJson({ ok: false, code: "BAD_ACTIVITY_LEVEL" }, 400);
    row.activity_level = body.activity_level;
  } else row.activity_level = null;

  if (body.daily_meal_count != null) {
    const n = cleanNumber(body.daily_meal_count, { min: 1, max: 12 });
    if (n == null || !Number.isInteger(n)) return beslenmeJson({ ok: false, code: "BAD_MEAL_COUNT" }, 400);
    row.daily_meal_count = n;
  } else row.daily_meal_count = null;

  if (body.target_weight_kg != null) {
    const n = cleanNumber(body.target_weight_kg, { min: 20, max: 500 });
    if (n == null) return beslenmeJson({ ok: false, code: "BAD_TARGET_WEIGHT" }, 400);
    row.target_weight_kg = n;
  } else row.target_weight_kg = null;

  row.goal_note = cleanStr(body.goal_note, 2000);
  row.dietary_pattern = cleanStr(body.dietary_pattern, 200);
  row.water_note = cleanStr(body.water_note, 1000);
  row.lifestyle_note = cleanStr(body.lifestyle_note, 2000);
  row.general_note = cleanStr(body.general_note, 4000);

  const { data, error } = await guard.db
    .from("nutrition_client_profiles")
    .upsert(row, { onConflict: "tenant_id,client_id" })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) return beslenmeJson({ ok: false, code: "PROFILE_SAVE_FAILED" }, 500);

  return NextResponse.json({ ok: true, profile: data }, { status: 200 });
}
