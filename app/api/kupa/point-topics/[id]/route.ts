import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { CUPPING_TABLES, POINT_TOPIC_WRITABLE } from "@/lib/cupping/fields";
import { deleteEntity, parseJsonBody, pickWritable, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/point-topics/[id] — ilişki güncelle (not/kaynak/güç) / sil. FK'ler burada değişmez. */

const RELATION_META_WRITABLE = POINT_TOPIC_WRITABLE.filter(
  (f) => f !== "point_id" && f !== "topic_id",
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "İlişki id gerekli." }, { status: 400 });
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, relation: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, RELATION_META_WRITABLE);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }
  const res = await updateEntity(db, CUPPING_TABLES.pointTopics, tenantId, id, fields);
  if (!res.ok) {
    const errorClass = usageErrorClassForStatus(res.response.status);
    if (errorClass) await trackUsage(guard, req, { module: "cupping", action: "action_failed", failedAction: "record_updated", subEntity: "point_topic", errorClass });
    return res.response;
  }
  await trackUsage(guard, req, { module: "cupping", action: "record_updated", subEntity: "point_topic", resourceId: id });
  return NextResponse.json({ ok: true, relation: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "İlişki id gerekli." }, { status: 400 });
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const res = await deleteEntity(db, CUPPING_TABLES.pointTopics, tenantId, id);
  if (!res.ok) {
    const errorClass = usageErrorClassForStatus(res.response.status);
    if (errorClass) await trackUsage(guard, req, { module: "cupping", action: "action_failed", failedAction: "record_deleted", subEntity: "point_topic", errorClass });
    return res.response;
  }
  if (res.data > 0) await trackUsage(guard, req, { module: "cupping", action: "record_deleted", subEntity: "point_topic", resourceId: id });
  return NextResponse.json({ ok: true, deleted: res.data });
}
