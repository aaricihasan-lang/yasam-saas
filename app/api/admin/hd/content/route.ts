import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  createContent,
  deleteContent,
  getCanonicalDetail,
  getContentByEntity,
  getRow,
  updateContent,
} from "@/lib/human-design/admin/centralContentPersistence";
import { validateContentWrite } from "@/lib/human-design/admin/centralContentValidation";
import { HdContentAuditError } from "@/lib/human-design/admin/centralContentAudit";
import type { HdPersistError } from "@/lib/human-design/admin/centralContentTypes";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

function statusFor(e: HdPersistError): number {
  switch (e.code) {
    case "validation": return 400;
    case "not_found": return 404;
    case "dependency_conflict": return 409;
    default: return 500;
  }
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** /api/admin/hd/content — Kaynaklandırılmış Ana Metin CRUD (admin-only, tenant'sız). */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const entityId = req.nextUrl.searchParams.get("entityId")?.trim();
  if (!entityId) return NextResponse.json({ ok: false, error: "entityId gerekli." }, { status: 400, headers: NO_STORE });
  const r = await getContentByEntity(guard.db, entityId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: statusFor(r.error), headers: NO_STORE });
  return NextResponse.json({ ok: true, row: r.data }, { headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  if (!isObj(raw)) return NextResponse.json({ ok: false, error: "Gövde nesne olmalı." }, { status: 400, headers: NO_STORE });

  const entityId = typeof raw.entity_id === "string" ? raw.entity_id : "";
  const ent = await getCanonicalDetail(guard.db, entityId);
  if (!ent.ok) return NextResponse.json({ ok: false, error: ent.error.message }, { status: statusFor(ent.error), headers: NO_STORE });

  const targetStatus = raw.status === "published" ? "published" : "draft";
  const problems = validateContentWrite(raw, { dbEntityKind: ent.data.entity_kind, dbCanonicalKey: ent.data.canonical_key, targetStatus });
  if (problems.length) return NextResponse.json({ ok: false, error: problems.join("; ") }, { status: 400, headers: NO_STORE });

  try {
    const r = await createContent(guard.db, guard.adminId, ent.data, raw);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: statusFor(r.error), headers: NO_STORE });
    return NextResponse.json({ ok: true, id: r.data.id }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof HdContentAuditError) return NextResponse.json({ ok: false, error: `audit: ${e.message}` }, { status: 500, headers: NO_STORE });
    throw e;
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  if (!isObj(raw)) return NextResponse.json({ ok: false, error: "Gövde nesne olmalı." }, { status: 400, headers: NO_STORE });
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });

  const existing = await getRow(guard.db, "hd_canonical_content", id);
  if (!existing.ok) return NextResponse.json({ ok: false, error: existing.error.message }, { status: statusFor(existing.error), headers: NO_STORE });
  const entityId = String(existing.data.entity_id);
  const ent = await getCanonicalDetail(guard.db, entityId);
  if (!ent.ok) return NextResponse.json({ ok: false, error: ent.error.message }, { status: statusFor(ent.error), headers: NO_STORE });

  const targetStatus = (raw.status ?? existing.data.status) === "published" ? "published" : "draft";
  const problems = validateContentWrite(raw, { dbEntityKind: ent.data.entity_kind, dbCanonicalKey: ent.data.canonical_key, targetStatus });
  if (problems.length) return NextResponse.json({ ok: false, error: problems.join("; ") }, { status: 400, headers: NO_STORE });

  try {
    const r = await updateContent(guard.db, guard.adminId, id, ent.data, raw);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: statusFor(r.error), headers: NO_STORE });
    return NextResponse.json({ ok: true, id: r.data.id }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof HdContentAuditError) return NextResponse.json({ ok: false, error: `audit: ${e.message}` }, { status: 500, headers: NO_STORE });
    throw e;
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });
  try {
    const r = await deleteContent(guard.db, guard.adminId, id);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message }, { status: statusFor(r.error), headers: NO_STORE });
    return NextResponse.json({ ok: true, id: r.data.id }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof HdContentAuditError) return NextResponse.json({ ok: false, error: `audit: ${e.message}` }, { status: 500, headers: NO_STORE });
    throw e;
  }
}
