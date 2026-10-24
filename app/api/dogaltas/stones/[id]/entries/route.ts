import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { loadStoneSources } from "@/lib/dogaltas/stoneSourcesServer";
import { buildFieldEntries, nextEntrySortOrder, validateEntryPayload } from "@/lib/dogaltas/stoneEntries";
import { isEntriesSchemaMissing, loadStoneEntryRows, STONE_ENTRIES_SELECT } from "@/lib/dogaltas/stoneEntriesServer";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
export const runtime = "nodejs";

/**
 * /api/dogaltas/stones/[id]/entries — taşın BİLGİ KAYITLARI (her kaydın kendi kaynağı).
 *   GET  → stone_entries satırları (eski metinler istemcide taş + kaynaklardan "eski kayıt" olarak kurulur).
 *   POST → yeni kayıt { field_key, content, source_name } — alanın SONUNA eklenir; başka kayıt DEĞİŞMEZ.
 * Yalnız KENDİ tenant'ının taşı (başka uzmanın taşı → 404).
 */
const UNAVAILABLE = { ok: false, code: "entries_unavailable", error: "Bilgi kaydı özelliği henüz etkin değil." };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const { data: stone, error } = await db.from("stones").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) return serverErrorResponse({ route: "dogaltas/stones/[id]/entries", action: "GET", tenantId, cause: error });
  if (!stone) return NextResponse.json({ ok: false, error: "Taş bulunamadı." }, { status: 404 });
  const loaded = await loadStoneEntryRows(db, tenantId, id);
  if (!loaded.ok) return serverErrorResponse({ route: "dogaltas/stones/[id]/entries", action: "GET", tenantId, cause: loaded.error });
  return NextResponse.json({ ok: true, entries: loaded.rows, schemaMissing: loaded.schemaMissing }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }
  if (is_demo_account) return demoReadOnlyResponse();

  const v = validateEntryPayload(body, { requireAll: true });
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const loaded = await loadStoneSources(db, tenantId, id);
  if (!loaded.ok) {
    if (loaded.status === 404) return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/entries", action: "POST", tenantId, cause: loaded.error });
  }
  const rows = await loadStoneEntryRows(db, tenantId, id);
  if (!rows.ok) return serverErrorResponse({ route: "dogaltas/stones/[id]/entries", action: "POST", tenantId, cause: rows.error });
  if (rows.schemaMissing) return NextResponse.json(UNAVAILABLE, { status: 503 });

  const existing = buildFieldEntries(loaded.sources, rows.rows, v.field!);
  const insert = {
    tenant_id: tenantId, stone_id: id, field_key: v.field, content: v.content, source_name: v.sourceName,
    sort_order: nextEntrySortOrder(existing),
  };
  const { data, error } = await db.from("stone_entries").insert(insert).select(STONE_ENTRIES_SELECT).single();
  if (error) {
    if (isEntriesSchemaMissing(error)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/entries", action: "POST", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "stone" } });
  }
  await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "stone", resourceId: id });
  return NextResponse.json({ ok: true, entry: data }, { status: 201 });
}
