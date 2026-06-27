import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stone-exclusions — kütüphane taşını "kendi görünümünden gizleme".
 * GET: bu tenant'ın gizlediği stone_id listesi.
 * POST { stoneIds }: gizle (upsert, tenant_id oturumdan).
 * DELETE { stoneIds }: gizlemeyi kaldır.
 * Kütüphane tenant'ı kendi kütüphanesini gizleyemez.
 */

function readIds(body: { stoneIds?: unknown }): string[] {
  return Array.isArray(body.stoneIds)
    ? body.stoneIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("stone_exclusions").select("stone_id").eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, stoneIds: (data ?? []).map((r) => String((r as { stone_id: unknown }).stone_id)) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (tenantId === ADMIN_LIBRARY_TENANT_ID) {
    return NextResponse.json({ ok: false, error: "Kütüphane kendi kayıtlarını gizleyemez." }, { status: 400 });
  }

  let body: { stoneIds?: unknown };
  try { body = (await req.json()) as { stoneIds?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const ids = readIds(body);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "stoneIds boş." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const rows = ids.map((id) => ({ tenant_id: tenantId, stone_id: id }));
  const { error } = await db
    .from("stone_exclusions")
    .upsert(rows, { onConflict: "tenant_id,stone_id", ignoreDuplicates: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hidden: ids.length });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { stoneIds?: unknown };
  try { body = (await req.json()) as { stoneIds?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const ids = readIds(body);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "stoneIds boş." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("stone_exclusions").delete()
    .eq("tenant_id", tenantId).in("stone_id", ids)
    .select("stone_id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, removed: data?.length ?? 0 });
}
