import { NextRequest, NextResponse } from "next/server";
import { readAllPaged } from "@/lib/db/readAllPaged";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { validateSourceInput, safeDbError } from "@/app/numeroloji/bilgi-bankasi/helpers/sourcesValidation";

export const runtime = "nodejs";

/** I18N: safeDbError eşlemesinin dil-bağımsız kodu (yanıta ek `code`; TR `error` metni ve HTTP durumu aynen). */
function dbErrorCode(error: unknown): string {
  const c = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return c === "23505" ? "DUPLICATE" : c === "23503" ? "RELATED_RECORD" : "DB_ERROR";
}

/**
 * /api/numeroloji/sources — numerology_sources güvenli sunucu kapısı (NKB-V2-C).
 *
 * Güvenlik:
 *   - requireModuleAccess → tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma .eq("tenant_id", tenantId) ile bağlı (çapraz-tenant okuma/yazma engelli).
 *   - Demo hesap: yazma yapılmaz.
 *   - Hata cevaplarında iç DB ayrıntısı sızmaz (safeDbError).
 *   - display_label yazımı korunur (yalnız uç boşluk temizliği).
 *
 * GET                                   → { ok, rows }
 * POST { display_label, ... }           → { ok, id }
 * PATCH { id, ...fields }               → { ok, id }
 * DELETE { id } | { ids: [] }           → { ok, deleted }   (bağlı kaynak → 409)
 */

const TABLE = "numerology_sources";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // NUM-F09: sayfalı tam okuma (PostgREST 1000 satır sınırında sessiz kesilme yok).
  const { rows: data, error } = await readAllPaged((from, to) =>
    db
      .from(TABLE)
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message, code: dbErrorCode(error) }, { status: e.status });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi.", code: "INVALID_BODY" }, { status: 400 }); }

  const parsed = validateSourceInput(body, { partial: false });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error, code: "INVALID_INPUT" }, { status: parsed.status });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = {
    ...parsed.value,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error) {
    const e = safeDbError(error);
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_created", subEntity: "source", errorClass: usageErrorClassForStatus(e.status) ?? "server" });
    return NextResponse.json({ ok: false, error: e.message, code: dbErrorCode(error) }, { status: e.status });
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_created", subEntity: "source", resourceId: (data as { id: string }).id });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi.", code: "INVALID_BODY" }, { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur.", code: "INVALID_ID" }, { status: 400 });

  const { id: _omit, ...rest } = body;
  void _omit;
  const parsed = validateSourceInput(rest, { partial: true });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error, code: "INVALID_INPUT" }, { status: parsed.status });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const update = { ...parsed.value, updated_at: new Date().toISOString() };

  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    const e = safeDbError(error);
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_updated", subEntity: "source", errorClass: usageErrorClassForStatus(e.status) ?? "server" });
    return NextResponse.json({ ok: false, error: e.message, code: dbErrorCode(error) }, { status: e.status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil.", code: "NOT_FOUND" }, { status: 404 });
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_updated", subEntity: "source", resourceId: id });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { id?: unknown; ids?: unknown } = {};
  try { body = (await req.json()) as { id?: unknown; ids?: unknown }; } catch { /* boş gövde olabilir */ }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1000)
    : str(body.id) ? [str(body.id)] : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "id veya ids gerekli.", code: "INVALID_ID" }, { status: 400 });

  const { data, error } = await db
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");
  if (error) {
    // ON DELETE RESTRICT: bağlı kaynak → 23503 → 409 (bağlantı bilgisi sızdırılmaz).
    const e = safeDbError(error);
    const message =
      e.status === 409
        ? "Bu kaynak bir veya daha fazla bilgi kaydına bağlı. Önce bağlantıları kaldırın."
        : e.message;
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_deleted", subEntity: "source", errorClass: usageErrorClassForStatus(e.status) ?? "server" });
    return NextResponse.json({ ok: false, error: message, code: e.status === 409 ? "SOURCE_IN_USE" : dbErrorCode(error) }, { status: e.status });
  }
  const deletedIds = (data ?? []).map((r) => (r as { id: string }).id);
  if (deletedIds.length > 0) {
    // Toplu silme → TEK olay + itemCount (hiçbiri silinmediyse olay yok).
    await trackUsage(guard, req, { module: "numerology", action: "record_deleted", subEntity: "source", resourceId: [...deletedIds].sort().join(","), itemCount: deletedIds.length });
  }
  // AŞAMA 1 P3: hiçbir satır silinmediyse (yok/başka tenant/zaten silinmiş) sahte başarı DÖNMEZ.
  if (deletedIds.length === 0) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya zaten silinmiş.", code: "NOT_FOUND", deleted: 0 }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: deletedIds.length });
}
