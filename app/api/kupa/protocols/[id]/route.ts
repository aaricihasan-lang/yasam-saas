import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_WRITABLE } from "@/lib/cupping/fields";
import {
  cuppingError,
  deleteEntity,
  getEntity,
  parseJsonBody,
  pickWritable,
  updateEntity,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/protocols/[id] — protokol oku / güncelle / sil (çocuklar DB CASCADE ile). */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Protokol id gerekli.");
  const res = await getEntity(guard.db, CUPPING_TABLES.protocols, guard.tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, protocol: res.data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Protokol id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, protocol: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_WRITABLE);
  if (Object.keys(fields).length === 0) return cuppingError(400, "Güncellenecek alan yok.");
  if (Object.prototype.hasOwnProperty.call(fields, "title") && !String(fields.title ?? "").trim()) {
    return cuppingError(400, "Protokol başlığı boş olamaz.");
  }

  const res = await updateEntity(db, CUPPING_TABLES.protocols, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, protocol: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Protokol id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  // Protokole-sahipli çocuklar (points/techniques/safety/steps/entries/entry_points/sources)
  // DB ON DELETE CASCADE ile birlikte silinir. Master kayıtlar (points/techniques/…) ETKİLENMEZ.
  const res = await deleteEntity(db, CUPPING_TABLES.protocols, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
