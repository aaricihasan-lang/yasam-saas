import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { cuppingError, deleteEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/calendar/days/[id] — tek seçili günü sil (tenant-safe). Tekrar-kuralı YOK. */

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Gün id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const res = await deleteEntity(db, CUPPING_TABLES.calendarPlanDays, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
