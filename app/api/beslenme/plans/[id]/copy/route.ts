import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { PLAN_COPY_KEYS, cleanDate, isUuid } from "@/lib/beslenme/planContracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/** POST: planı kopyala → YENİ AİLE, revision=1, draft (deep snapshots). Archived kopyalanabilir. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
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
  return NextResponse.json({ ok: true, plan: data }, { status: 201 });
}
