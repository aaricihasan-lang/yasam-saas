import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { PLAN_COLUMNS, PLAN_CREATE_KEYS, PLAN_STATUSES, cleanDate, daysBetween } from "@/lib/beslenme/planContracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";

/** GET: plan listesi (opsiyonel status filtresi). Tenant-scoped. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = db.from("nutrition_plans").select(PLAN_COLUMNS).eq("tenant_id", tenantId);
  if (status && (PLAN_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  query = query.order("updated_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) return beslenmeJson({ ok: false, code: "LIST_FAILED" }, 500);
  return NextResponse.json({ ok: true, plans: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** POST: yeni plan + dense day rows (atomik RPC). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PLAN_CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const title = cleanStr(body.title, 200);
  if (!title) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);
  const start = cleanDate(body.start_date);
  const end = cleanDate(body.end_date);
  if (!start || !end) return beslenmeJson({ ok: false, code: "BAD_DATE" }, 400);
  if (daysBetween(start, end) < 0) return beslenmeJson({ ok: false, code: "BAD_RANGE" }, 400);
  if (daysBetween(start, end) > 366) return beslenmeJson({ ok: false, code: "RANGE_TOO_LONG" }, 400);
  let target: number | null = null;
  if (body.daily_energy_target != null) {
    target = cleanNumber(body.daily_energy_target, { min: 0.0001, max: 100000 });
    if (target == null) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
  }
  const note = cleanStr(body.note, 4000);

  const { data, error } = await db.rpc("nutrition_plan_create_with_days", {
    p_tenant_id: tenantId,
    p_title: title,
    p_start_date: start,
    p_end_date: end,
    p_daily_energy_target: target,
    p_note: note,
  });
  if (error) {
    const m = mapRpcError(error.code);
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  return NextResponse.json({ ok: true, plan: data }, { status: 201 });
}
