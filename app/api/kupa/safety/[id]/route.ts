import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, SAFETY_WRITABLE } from "@/lib/cupping/fields";
import { deleteEntity, getEntity, parseJsonBody, pickWritable, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/safety/[id] — tek güvenlik kaydı oku/güncelle/sil. */

const SEVERITIES = new Set(["info", "warning", "contraindication"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "Kayıt id gerekli." }, { status: 400 });
  const res = await getEntity(guard.db, CUPPING_TABLES.safety, guard.tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, note: res.data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "Kayıt id gerekli." }, { status: 400 });
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, note: null });
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, SAFETY_WRITABLE);
  if (fields.severity !== undefined && !SEVERITIES.has(String(fields.severity))) {
    return NextResponse.json({ ok: false, error: "Geçersiz önem düzeyi." }, { status: 400 });
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }
  const res = await updateEntity(db, CUPPING_TABLES.safety, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, note: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "Kayıt id gerekli." }, { status: 400 });
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const res = await deleteEntity(db, CUPPING_TABLES.safety, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
