import { NextRequest, NextResponse } from "next/server";
import { BULK_DELETE_LIMIT_ERROR, exceedsBulkDeleteLimit } from "@/lib/api/bulkDeleteLimits";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stone-exclusions — kütüphane taşını "kendi görünümünden gizleme".
 * GET: bu tenant'ın gizlediği stone_id listesi.
 * POST { stoneIds }: gizle (upsert, tenant_id oturumdan).
 * DELETE { stoneIds }: gizlemeyi kaldır.
 * Kütüphane tenant'ı kendi kütüphanesini gizleyemez.
 */

/** Usage360 idempotency anahtarı: gizleme örneği (stone_id + excluded_at) — ham saklanmaz, HMAC'lanır. */
function exclusionResourceId(rows: unknown): string | null {
  const keys = ((rows ?? []) as { stone_id?: unknown; excluded_at?: unknown }[])
    .map((r) => `${String(r.stone_id)}@${String(r.excluded_at)}`)
    .sort();
  return keys.length > 0 ? keys.join(",") : null;
}

function readIds(body: { stoneIds?: unknown }): string[] {
  return Array.isArray(body.stoneIds)
    ? body.stoneIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const res = await fetchAllRows<{ stone_id: unknown }>((from, to) =>
    db.from("stone_exclusions").select("stone_id").eq("tenant_id", tenantId)
      .order("stone_id", { ascending: true }).range(from, to),
  );

  if (!res.ok) return serverErrorResponse({ route: "dogaltas/stone-exclusions", action: "GET", tenantId, cause: res.error });
  return NextResponse.json({ ok: true, stoneIds: res.rows.map((r) => String(r.stone_id)) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { stoneIds?: unknown };
  try { body = (await req.json()) as { stoneIds?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const ids = readIds(body);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "stoneIds boş." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const rows = ids.map((id) => ({ tenant_id: tenantId, stone_id: id }));
  // Usage360: yalnız GERÇEKTEN eklenen satırlar geri döner (ignoreDuplicates → mevcutlar dönmez);
  // yanıt gövdesi değişmez.
  const { data: insertedRows, error } = await db
    .from("stone_exclusions")
    .upsert(rows, { onConflict: "tenant_id,stone_id", ignoreDuplicates: true })
    .select("stone_id, excluded_at");

  if (error) return serverErrorResponse({ route: "dogaltas/stone-exclusions", action: "POST", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_created", subEntity: "exclusion" } });
  const insertedCount = insertedRows?.length ?? 0;
  if (insertedCount > 0) {
    // Tekli/toplu gizleme → TEK olay + itemCount (hepsi zaten gizliyse no-op → olay yok).
    await trackUsage(guard, req, { module: "stones", action: "record_created", subEntity: "exclusion", resourceId: exclusionResourceId(insertedRows), itemCount: insertedCount });
  }
  return NextResponse.json({ ok: true, hidden: ids.length });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { stoneIds?: unknown };
  try { body = (await req.json()) as { stoneIds?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const ids = readIds(body);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "stoneIds boş." }, { status: 400 });
  if (exceedsBulkDeleteLimit(ids)) return NextResponse.json({ ok: false, error: BULK_DELETE_LIMIT_ERROR }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("stone_exclusions").delete()
    .eq("tenant_id", tenantId).in("stone_id", ids)
    .select("stone_id, excluded_at");

  if (error) return serverErrorResponse({ route: "dogaltas/stone-exclusions", action: "DELETE", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_deleted", subEntity: "exclusion" } });
  const removedCount = data?.length ?? 0;
  if (removedCount > 0) {
    // Tekli/toplu gizleme kaldırma → TEK olay + itemCount.
    await trackUsage(guard, req, { module: "stones", action: "record_deleted", subEntity: "exclusion", resourceId: exclusionResourceId(data), itemCount: removedCount });
  }
  return NextResponse.json({ ok: true, removed: data?.length ?? 0 });
}
