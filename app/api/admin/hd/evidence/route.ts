import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { createEvidence, deleteEvidence } from "@/lib/human-design/admin/centralContentPersistence";
import { validateEvidenceWrite } from "@/lib/human-design/admin/centralContentValidation";
import { HdContentAuditError } from "@/lib/human-design/admin/centralContentAudit";
import type { HdPersistError } from "@/lib/human-design/admin/centralContentTypes";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;
function st(e: HdPersistError): number {
  return e.code === "validation" ? 400 : e.code === "not_found" ? 404 : e.code === "dependency_conflict" ? 409 : 500;
}
function isObj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function auditCatch(e: unknown): Response { if (e instanceof HdContentAuditError) return NextResponse.json({ ok: false, error: `audit: ${e.message}` }, { status: 500, headers: NO_STORE }); throw e; }

/** /api/admin/hd/evidence — içerik ↔ kaynak pasajı kanıt bağı (create/delete). */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  if (!isObj(raw)) return NextResponse.json({ ok: false, error: "Gövde nesne olmalı." }, { status: 400, headers: NO_STORE });
  const problems = validateEvidenceWrite(raw);
  if (problems.length) return NextResponse.json({ ok: false, error: problems.join("; ") }, { status: 400, headers: NO_STORE });
  try {
    const r = await createEvidence(guard.db, guard.adminId, raw);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: st(r.error), headers: NO_STORE });
    return NextResponse.json({ ok: true, id: r.data.id }, { headers: NO_STORE });
  } catch (e) { return auditCatch(e); }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });
  try {
    const r = await deleteEvidence(guard.db, guard.adminId, id);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: st(r.error), headers: NO_STORE });
    return NextResponse.json({ ok: true, id: r.data.id }, { headers: NO_STORE });
  } catch (e) { return auditCatch(e); }
}
