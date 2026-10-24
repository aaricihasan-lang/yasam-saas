import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { loadStoneSources } from "@/lib/dogaltas/stoneSourcesServer";
import { legacySortOrder, parseLegacyEntryId, validateEntryPayload } from "@/lib/dogaltas/stoneEntries";
import { isEntriesSchemaMissing, STONE_ENTRIES_SELECT } from "@/lib/dogaltas/stoneEntriesServer";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
export const runtime = "nodejs";

/**
 * /api/dogaltas/stones/[id]/entries/[entryId] — TEK bilgi kaydını düzenle / sil.
 *   entryId = uuid → stone_entries satırı: yalnız o satır (metin ve/veya kaynak) değişir/silinir.
 *   entryId = "legacy:<primary|sourceId>:<alan>" → eski metin: düzenleme onu AYNI SIRAYLA yeni kayda
 *     dönüştürür ve eski kolonu boşaltır; silme eski kolonu boşaltır (ATOMİK RPC). `expected` = istemcinin
 *     gördüğü eski metin; DB'de farklıysa 409 (başka oturumun değişikliği sessizce ezilmez).
 * Diğer kayıtların metni/kaynağı/sırası DEĞİŞMEZ. Tenant: tüm yazmalar oturum tenant'ı ile sınırlı.
 */
type Ctx = { params: Promise<{ id: string; entryId: string }> };
const UNAVAILABLE = { ok: false, code: "entries_unavailable", error: "Bilgi kaydı özelliği henüz etkin değil." };
const CONFLICT = { ok: false, code: "conflict", error: "Bu bilgi başka bir oturumda değişmiş. Sayfayı yenileyip tekrar deneyin." };

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const t = await req.text();
    return t ? (JSON.parse(t) as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

async function legacyAction(
  req: NextRequest,
  guard: Extract<Awaited<ReturnType<typeof requireModuleAccess>>, { ok: true }>,
  stoneId: string,
  legacy: { origin: string; field: string },
  action: "convert" | "delete",
  body: Record<string, unknown>,
): Promise<Response> {
  const { db, tenantId } = guard;
  if (typeof body.expected !== "string") return NextResponse.json({ ok: false, error: "Eski metin doğrulaması eksik." }, { status: 400 });
  const loaded = await loadStoneSources(db, tenantId, stoneId);
  if (!loaded.ok) {
    if (loaded.status === 404) return NextResponse.json({ ok: false, error: "Taş bulunamadı." }, { status: 404 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/entries/[entryId]", action: action.toUpperCase(), tenantId, cause: loaded.error });
  }
  const extras = loaded.sources.filter((s) => !s.isPrimary);
  const src = legacy.origin === "primary" ? loaded.sources[0] : extras.find((s) => s.id === legacy.origin);
  if (!src) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });

  let content: string | null = null;
  let sourceName: string | null = null;
  if (action === "convert") {
    const v = validateEntryPayload(body, { requireAll: false });
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    content = v.content ?? body.expected;
    sourceName = v.sourceName !== undefined ? v.sourceName : src.name;
  }
  const sort = legacySortOrder(legacy.origin === "primary" ? null : extras.findIndex((s) => s.id === legacy.origin));
  const { data, error } = await db.rpc("dogaltas_stone_legacy_entry", {
    p_tenant_id: tenantId, p_stone_id: stoneId, p_legacy: legacy.origin, p_field: legacy.field,
    p_expected: body.expected, p_action: action, p_content: content, p_source_name: sourceName, p_sort_order: sort,
  });
  if (error) {
    if (isEntriesSchemaMissing(error)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/entries/[entryId]", action: action.toUpperCase(), tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "stone" } });
  }
  const r = (data ?? {}) as { ok?: boolean; error?: string; entry?: unknown };
  if (!r.ok) {
    if (r.error === "conflict" || r.error === "legacy_not_found") return NextResponse.json(CONFLICT, { status: 409 });
    if (r.error === "stone_not_found" || r.error === "source_not_found") return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400 });
  }
  await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "stone", resourceId: stoneId });
  return NextResponse.json({ ok: true, ...(r.entry ? { entry: r.entry } : {}) });
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id, entryId: rawEntryId } = await params;
  const entryId = decodeURIComponent(rawEntryId);
  const legacy = parseLegacyEntryId(entryId);
  if (!isUuid(id) || (!legacy && !isUuid(entryId))) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const body = await readBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  if (is_demo_account) return demoReadOnlyResponse();

  if (legacy) return legacyAction(req, guard, id, legacy, "convert", body);

  const v = validateEntryPayload(body, { requireAll: false });
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (v.content !== undefined) patch.content = v.content;
  if (v.sourceName !== undefined) patch.source_name = v.sourceName;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  const { data, error } = await db.from("stone_entries").update(patch)
    .eq("id", entryId).eq("stone_id", id).eq("tenant_id", tenantId)
    .select(STONE_ENTRIES_SELECT).maybeSingle();
  if (error) {
    if (isEntriesSchemaMissing(error)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/entries/[entryId]", action: "PATCH", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "stone" } });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "stone", resourceId: id });
  return NextResponse.json({ ok: true, entry: data });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id, entryId: rawEntryId } = await params;
  const entryId = decodeURIComponent(rawEntryId);
  const legacy = parseLegacyEntryId(entryId);
  if (!isUuid(id) || (!legacy && !isUuid(entryId))) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const body = await readBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  if (is_demo_account) return demoReadOnlyResponse();

  if (legacy) return legacyAction(req, guard, id, legacy, "delete", body);

  const { data, error } = await db.from("stone_entries").delete()
    .eq("id", entryId).eq("stone_id", id).eq("tenant_id", tenantId).select("id");
  if (error) {
    if (isEntriesSchemaMissing(error)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/entries/[entryId]", action: "DELETE", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "stone" } });
  }
  if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "stone", resourceId: id });
  return NextResponse.json({ ok: true, id: entryId });
}
