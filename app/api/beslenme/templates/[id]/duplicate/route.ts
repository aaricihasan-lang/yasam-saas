import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { cleanStr, hasOnlyKeys, isUuid } from "@/lib/beslenme/contracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";
import { TEMPLATE_DUPLICATE_KEYS } from "@/lib/beslenme/templateContracts";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/** POST: şablonu yeni şablona verbatim deep-copy. Body: { title? }. */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!hasOnlyKeys(body, TEMPLATE_DUPLICATE_KEYS)) return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  const title = cleanStr(body.title, 200);

  const { data, error } = await db.rpc("nutrition_template_duplicate", {
    p_tenant_id: tenantId,
    p_template_id: id,
    p_title: title,
  });
  if (error) {
    const m = mapRpcError(error.code);
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  return NextResponse.json({ ok: true, template: data }, { status: 201 });
}
