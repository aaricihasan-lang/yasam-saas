import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";
import { uniqueSourceNames } from "@/lib/dogaltas/stoneSources";
import { isSourcesSchemaMissing } from "@/lib/dogaltas/stoneSourcesServer";
import { isEntriesSchemaMissing } from "@/lib/dogaltas/stoneEntriesServer";

export const runtime = "nodejs";

/**
 * GET /api/dogaltas/stone-sources/names — kaynak adı ÖNERİLERİ (WT9 autocomplete).
 * YALNIZ oturumdaki uzmanın KENDİ tenant'ında daha önce girdiği adlar (birincil + ek kaynaklar +
 * bilgi kayıtlarının kaynakları).
 * Başka uzmanın kaynakları, hazır katalog veya owner/admin kütüphanesi GÖSTERİLMEZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const primary = await fetchAllRows<{ primary_source_name: unknown }>((from, to) =>
    db.from("stones").select("primary_source_name")
      .eq("tenant_id", tenantId).not("primary_source_name", "is", null)
      .order("id", { ascending: true }).range(from, to),
  );
  if (!primary.ok) {
    if (isSourcesSchemaMissing(primary.error as { code?: string; message?: string })) return NextResponse.json({ ok: true, names: [] });
    return serverErrorResponse({ route: "dogaltas/stone-sources/names", action: "GET", tenantId, cause: primary.error });
  }
  const extra = await fetchAllRows<{ source_name: unknown }>((from, to) =>
    db.from("stone_sources").select("source_name").eq("tenant_id", tenantId)
      .order("id", { ascending: true }).range(from, to),
  );
  if (!extra.ok && !isSourcesSchemaMissing(extra.error as { code?: string; message?: string })) {
    return serverErrorResponse({ route: "dogaltas/stone-sources/names", action: "GET", tenantId, cause: extra.error });
  }
  const entries = await fetchAllRows<{ source_name: unknown }>((from, to) =>
    db.from("stone_entries").select("source_name").eq("tenant_id", tenantId).not("source_name", "is", null)
      .order("id", { ascending: true }).range(from, to),
  );
  if (!entries.ok && !isEntriesSchemaMissing(entries.error as { code?: string; message?: string })) {
    return serverErrorResponse({ route: "dogaltas/stone-sources/names", action: "GET", tenantId, cause: entries.error });
  }
  const names = uniqueSourceNames([
    ...primary.rows.map((r) => (typeof r.primary_source_name === "string" ? r.primary_source_name : null)),
    ...(extra.ok ? extra.rows.map((r) => (typeof r.source_name === "string" ? r.source_name : null)) : []),
    ...(entries.ok ? entries.rows.map((r) => (typeof r.source_name === "string" ? r.source_name : null)) : []),
  ]);
  return NextResponse.json({ ok: true, names }, { headers: { "Cache-Control": "no-store" } });
}
