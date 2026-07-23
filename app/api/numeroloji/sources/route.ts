import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { validateSourceInput, safeDbError } from "@/app/numeroloji/bilgi-bankasi/helpers/sourcesValidation";

export const runtime = "nodejs";

/**
 * /api/numeroloji/sources — numerology_sources güvenli sunucu kapısı (NKB-V2-C).
 *
 * Güvenlik:
 *   - verifyUserRequest → tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
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
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const parsed = validateSourceInput(body, { partial: false });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = {
    ...parsed.value,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  const { id: _omit, ...rest } = body;
  void _omit;
  const parsed = validateSourceInput(rest, { partial: true });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

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
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { id?: unknown; ids?: unknown } = {};
  try { body = (await req.json()) as { id?: unknown; ids?: unknown }; } catch { /* boş gövde olabilir */ }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1000)
    : str(body.id) ? [str(body.id)] : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "id veya ids gerekli." }, { status: 400 });

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
    return NextResponse.json({ ok: false, error: message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
