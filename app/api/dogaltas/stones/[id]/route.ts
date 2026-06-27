import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stones/[id] — tek taş okuma/güncelleme/silme (Faz 1-A).
 * Her işlem .eq("id", id).eq("tenant_id", tenantId) ile korunur → başka tenant'ın
 * id'si gelse bile 0 satır etkilenir (cross-tenant update/delete İMKÂNSIZ).
 */

const STONE_WRITABLE = [
  "stone_name", "short_description", "general_info", "source_note",
  "physical_effects", "spiritual_effects", "other_effects", "warning_text",
  "warning_tags", "feng_shui", "meditation", "care", "application",
  "chakras", "assignments", "images",
] as const;

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

// ─── GET: tek taş detay ──────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await params;

  // Detay (read-only) kütüphane taşını da id ile gösterebilir (mevcut sayfa davranışı).
  // Düzenleme/silme PATCH/DELETE'te .eq(tenant_id) ile yalnız kendi taşına izinli.
  const ids = tenantId === ADMIN_LIBRARY_TENANT_ID ? [tenantId] : [tenantId, ADMIN_LIBRARY_TENANT_ID];

  const { data, error } = await db
    .from("stones").select("*")
    .eq("id", id).in("tenant_id", ids).maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Taş bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true, row: data });
}

// ─── PATCH: güncelle (yalnız kendi tenant) ───────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const fields = pick(body, STONE_WRITABLE);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }
  fields.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("stones").update(fields)
    .eq("id", id).eq("tenant_id", tenantId) // tenant guard — cross-tenant update engellenir
    .select("*");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id, row: data[0] });
}

// ─── DELETE: sil (yalnız kendi tenant) ───────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("stones").delete()
    .eq("id", id).eq("tenant_id", tenantId) // tenant guard — cross-tenant delete engellenir
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}
