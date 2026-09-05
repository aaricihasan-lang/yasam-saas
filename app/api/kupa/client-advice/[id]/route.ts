import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, CLIENT_ADVICE_WRITABLE } from "@/lib/cupping/fields";
import {
  cuppingError,
  deleteEntity,
  getEntity,
  parseJsonBody,
  pickWritable,
  updateEntity,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/client-advice/[id] — danışan bilgilendirme snapshot'ı oku / düzenle / sil.
 *
 * source_template_id CLIENT_ADVICE_WRITABLE DIŞINDA → düzenleme canlı miras yaratmaz
 * (provenance immutable). Snapshot metni yalnız burada açıkça düzenlenir. DELETE yalnız
 * bu bilgilendirme satırını siler — danışan/şablon/takvim ETKİLENMEZ.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Bilgilendirme id gerekli.");
  const res = await getEntity(guard.db, CUPPING_TABLES.clientAdvice, guard.tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, advice: res.data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Bilgilendirme id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, advice: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, CLIENT_ADVICE_WRITABLE);
  if (Object.keys(fields).length === 0) return cuppingError(400, "Güncellenecek alan yok.");
  if (Object.prototype.hasOwnProperty.call(fields, "title") && !String(fields.title ?? "").trim()) {
    return cuppingError(400, "Bilgilendirme başlığı boş olamaz.");
  }

  const res = await updateEntity(db, CUPPING_TABLES.clientAdvice, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, advice: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Bilgilendirme id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const res = await deleteEntity(db, CUPPING_TABLES.clientAdvice, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
