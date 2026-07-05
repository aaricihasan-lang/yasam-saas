import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/numeroloji/stones — numerology_stone_assignments güvenli sunucu kapısı.
 *
 * Güvenlik: verifyUserRequest + tenant SUNUCUDA session'dan + .eq("tenant_id") binding.
 * Demo hesap: yazma yapılmaz.
 *
 * GET               → { ok, rows }
 * POST { analysis_type, value, reason, stones[] } → upsert (tenant+type+value) → { ok, id }
 * PATCH { id, ...fields }                         → { ok, id }
 * DELETE { id } | { ids: [] }                     → { ok, deleted }
 */

const TABLE = "numerology_stone_assignments";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s)).map((s) => s.trim()).filter(Boolean);
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

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const analysis_type = str(body.analysis_type);
  const value = str(body.value);
  if (!analysis_type || !value) {
    return NextResponse.json({ ok: false, error: "analysis_type ve value zorunludur." }, { status: 400 });
  }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = {
    tenant_id: tenantId,
    analysis_type,
    value,
    reason: str(body.reason),
    stones: strArray(body.stones),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: findErr } = await db
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("analysis_type", analysis_type)
    .eq("value", value)
    .maybeSingle();
  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });

  if (existing?.id) {
    const { error } = await db.from(TABLE).update(payload).eq("id", existing.id).eq("tenant_id", tenantId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: existing.id });
  }

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.analysis_type !== undefined) update.analysis_type = str(body.analysis_type);
  if (body.value !== undefined) update.value = str(body.value);
  if (body.reason !== undefined) update.reason = str(body.reason);
  if (body.stones !== undefined) update.stones = strArray(body.stones);

  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
