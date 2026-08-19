import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, KNOWLEDGE_WRITABLE } from "@/lib/cupping/fields";
import { deleteEntity, getEntity, parseJsonBody, pickWritable, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/knowledge/[id] — tek bilgi kaydı oku/güncelle/sil. */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "Kayıt id gerekli." }, { status: 400 });
  const res = await getEntity(guard.db, CUPPING_TABLES.knowledge, guard.tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, record: res.data });
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
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, record: null });
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, KNOWLEDGE_WRITABLE);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }
  const res = await updateEntity(db, CUPPING_TABLES.knowledge, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, record: res.data });
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
  const res = await deleteEntity(db, CUPPING_TABLES.knowledge, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
