import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_SOURCE_META_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, deleteEntity, parseJsonBody, pickWritable, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/protocol-sources/[id] — künye META güncelle (locator/note/sort_order) / sil. */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Kaynak bağlantısı id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, source: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_SOURCE_META_WRITABLE);
  if (Object.keys(fields).length === 0) return cuppingError(400, "Güncellenecek alan yok.");

  const res = await updateEntity(db, CUPPING_TABLES.protocolSources, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, source: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Kaynak bağlantısı id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const res = await deleteEntity(db, CUPPING_TABLES.protocolSources, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
