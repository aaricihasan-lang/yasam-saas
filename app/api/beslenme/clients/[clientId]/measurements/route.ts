import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { MEASUREMENT_COLUMNS, MEASUREMENT_POST_KEYS } from "@/lib/beslenme/clientContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ clientId: string }> };

/** GET: ölçüm geçmişi (yeni → eski). */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;

  const { data, error } = await g.guard.db
    .from("nutrition_client_measurements")
    .select(MEASUREMENT_COLUMNS)
    .eq("tenant_id", g.guard.tenantId)
    .eq("client_id", clientId)
    .order("measured_at", { ascending: false })
    .limit(500);
  if (error) return beslenmeJson({ ok: false, code: "MEASUREMENT_READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, measurements: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** POST: yeni ölçüm (aynı gün birden çok mümkün). */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const demo = denyDemoMutation(g.guard);
  if (demo) return demo;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, MEASUREMENT_POST_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const weight = cleanNumber(body.weight_kg, { min: 0.0001, max: 500 });
  if (weight == null) return beslenmeJson({ ok: false, code: "WEIGHT_REQUIRED" }, 400);

  const row: Record<string, unknown> = {
    tenant_id: g.guard.tenantId,
    client_id: clientId,
    weight_kg: weight,
    height_cm: body.height_cm != null ? cleanNumber(body.height_cm, { min: 0.0001, max: 300 }) : null,
    waist_cm: body.waist_cm != null ? cleanNumber(body.waist_cm, { min: 0.0001, max: 400 }) : null,
    hip_cm: body.hip_cm != null ? cleanNumber(body.hip_cm, { min: 0.0001, max: 400 }) : null,
    note: cleanStr(body.note, 1000),
  };
  // dolu gönderilip aralık dışıysa reddet (null bırakma yerine hata)
  for (const k of ["height_cm", "waist_cm", "hip_cm"] as const) {
    if (body[k] != null && row[k] == null) return beslenmeJson({ ok: false, code: `BAD_${k.toUpperCase()}` }, 400);
  }
  if (body.measured_at != null) {
    const s = cleanStr(body.measured_at, 40);
    const t = s ? Date.parse(s) : NaN;
    if (!s || Number.isNaN(t)) return beslenmeJson({ ok: false, code: "BAD_MEASURED_AT" }, 400);
    row.measured_at = new Date(t).toISOString();
  }

  const { data, error } = await g.guard.db
    .from("nutrition_client_measurements")
    .insert(row)
    .select(MEASUREMENT_COLUMNS)
    .single();
  if (error) return beslenmeJson({ ok: false, code: "MEASUREMENT_SAVE_FAILED" }, 500);
  return NextResponse.json({ ok: true, measurement: data }, { status: 201 });
}
