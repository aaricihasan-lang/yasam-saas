import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { updateConsultation } from "@/lib/human-design/consultation/admin/consultationAdminService";
import {
  httpStatusForConsultationError,
  messageForConsultationError,
} from "@/lib/human-design/consultation/admin/consultationErrorHttp";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;
type RouteContext = { params: Promise<{ id: string }> };
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * PATCH: rpc_hd_consultation_update — YALNIZ is_ai_generated patch + explicit repin.
 * expected_version zorunlu; uyuşmazlık → 409. Canonical pin doğrudan yamanamaz.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  if (!isObj(raw)) return NextResponse.json({ ok: false, error: "Gövde nesne olmalı." }, { status: 400, headers: NO_STORE });

  const expectedVersion = raw.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ ok: false, error: "expectedVersion (pozitif tam sayı) zorunlu." }, { status: 400, headers: NO_STORE });
  }
  const isAiGenerated = typeof raw.isAiGenerated === "boolean" ? raw.isAiGenerated : undefined;
  const repin = raw.repin === true;
  if (isAiGenerated === undefined && !repin) {
    return NextResponse.json({ ok: false, error: "Güncellenecek bir alan yok (isAiGenerated veya repin)." }, { status: 400, headers: NO_STORE });
  }

  const r = await updateConsultation(guard.db, guard.adminId, id, { expectedVersion, isAiGenerated, repin });
  if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
  return NextResponse.json({ ok: true, version: r.data.version }, { headers: NO_STORE });
}
