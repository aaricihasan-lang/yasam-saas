import { NextRequest, NextResponse } from "next/server";
import { BULK_DELETE_LIMIT_ERROR, exceedsBulkDeleteLimit } from "@/lib/api/bulkDeleteLimits";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/minerals/bulk-delete — Mineral Listesi toplu silme (Faz 1-A).
 * Body: { ids: string[] }. Silme yalnız .in("id", ids).eq("tenant_id", tenantId) →
 * yalnız kendi tenant kayıtları silinir; başka tenant id'leri yok sayılır.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { ids?: unknown };
  try { body = (await req.json()) as { ids?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Silinecek kayıt seçilmedi." }, { status: 400 });
  }
  if (exceedsBulkDeleteLimit(ids)) return NextResponse.json({ ok: false, error: BULK_DELETE_LIMIT_ERROR }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const { data, error } = await db
    .from("minerals").delete()
    .in("id", ids).eq("tenant_id", tenantId) // tenant guard
    .select("id");

  if (error) return serverErrorResponse({ route: "dogaltas/minerals/bulk-delete", action: "POST", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_deleted", subEntity: "mineral" } });
  const deletedIds = (data ?? []).map((r: { id: string }) => r.id);
  if (deletedIds.length > 0) {
    // Usage360: toplu silme → TEK olay + itemCount (hiçbiri silinmediyse olay yok).
    await trackUsage(guard, req, { module: "stones", action: "record_deleted", subEntity: "mineral", resourceId: [...deletedIds].sort().join(","), itemCount: deletedIds.length });
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
