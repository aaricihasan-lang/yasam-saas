import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { PLAN_COLUMNS, PLAN_STATUSES } from "@/lib/beslenme/planContracts";
import { createPlanForTenant } from "@/lib/beslenme/planEngine";

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

  const created = await createPlanForTenant(db, tenantId, body);
  if (!created.ok) return beslenmeJson({ ok: false, code: created.code }, created.status);
  return NextResponse.json({ ok: true, plan: created.plan }, { status: 201 });
}
