import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { cleanDate, isUuid } from "@/lib/beslenme/planContracts";
import { mapRpcError } from "@/lib/beslenme/planEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: span_days günü kaynak başlangıçtan hedef başlangıca date-offset DEEP COPY (§21).
 * Kaynak+hedef günler plan aralığında olmalı (409 RANGE_OUT_OF_BOUNDS); hedef günler BOŞ olmalı
 * (409 TARGET_NOT_EMPTY); atomik (yarım hafta YOK). Archived → 403.
 */
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
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["source_start", "target_start", "span_days"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  const src = cleanDate(body.source_start);
  const tgt = cleanDate(body.target_start);
  if (!src || !tgt) return beslenmeJson({ ok: false, code: "BAD_DATE" }, 400);
  const span = body.span_days;
  if (!Number.isInteger(span) || (span as number) < 1 || (span as number) > 31) {
    return beslenmeJson({ ok: false, code: "BAD_SPAN" }, 400);
  }

  const { error } = await db.rpc("nutrition_plan_week_copy", {
    p_tenant_id: tenantId, p_plan_id: id, p_source_start: src, p_target_start: tgt, p_span_days: span,
  });
  if (error) { const m = mapRpcError(error.code); return beslenmeJson({ ok: false, code: m.code }, m.status); }
  return NextResponse.json({ ok: true });
}
