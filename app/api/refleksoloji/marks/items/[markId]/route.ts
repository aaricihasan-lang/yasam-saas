import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { validateMarkPatch } from "@/lib/refleksoloji/markSurfaces";
import {
  MARK_COLUMNS,
  NO_STORE,
  isMissingTable,
  isUuid,
  jsonError,
  marksNotReady,
  readJsonBody,
  toMark,
} from "@/lib/refleksoloji/marksServer";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/marks/items/[markId] — tek nokta güncelle / sil.
 *
 * PATCH  { x?, y?, size?, intensity?, note? } — yüzey/taraf/seans DEĞİŞMEZ (API kabul etmez,
 *        DB trigger'ı da reddeder) → nokta yüzeyler arası taşınamaz.
 * DELETE → tek nokta (tek onay; toplu silme kuralı tek noktaya uygulanmaz).
 * Güvenlik: id + tenant_id eşleşmesi; başka tenant'ın noktası → 404.
 */

type Ctx = { params: Promise<{ markId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  const { markId } = await params;
  if (!isUuid(markId)) return jsonError(400, "Geçersiz nokta.");

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const v = validateMarkPatch(parsed.body);
  if (!v.ok) return jsonError(400, v.error);

  const { data, error } = await db
    .from("reflexology_marks")
    .update(v.value)
    .eq("tenant_id", tenantId)
    .eq("id", markId)
    .select(MARK_COLUMNS);
  if (error) return isMissingTable(error)
      ? marksNotReady()
      : jsonServerError("marks.item.PATCH", error, { usage: { guard, req, failedAction: "record_updated", subEntity: "mark" } });
  if (!data || data.length === 0) return jsonError(404, "Nokta bulunamadı.");

  await trackUsage(guard, req, { module: "reflexology", action: "record_updated", subEntity: "mark", resourceId: markId });
  return NextResponse.json({ ok: true, mark: toMark(data[0] as Record<string, unknown>) }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  const { markId } = await params;
  if (!isUuid(markId)) return jsonError(400, "Geçersiz nokta.");

  const { data, error } = await db
    .from("reflexology_marks")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", markId)
    .select("id");
  if (error) return isMissingTable(error)
      ? marksNotReady()
      : jsonServerError("marks.item.DELETE", error, { usage: { guard, req, failedAction: "record_deleted", subEntity: "mark" } });
  if (!data || data.length === 0) return jsonError(404, "Nokta bulunamadı.");

  await trackUsage(guard, req, { module: "reflexology", action: "record_deleted", subEntity: "mark", resourceId: markId });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
