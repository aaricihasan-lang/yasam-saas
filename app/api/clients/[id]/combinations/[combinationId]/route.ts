import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/clients/[id]/combinations/[combinationId] — tek danışan kombinasyonu.
 *
 * PATCH  → ad / amaç / not günceller (taş listesi değişmez).
 * DELETE → kombinasyonu siler.
 *
 * Güvenlik:
 *   - verifyUserRequest → binding. tenant_id SUNUCUDA.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır (IDOR).
 *   - Tüm işlemler tenant_id + client_id + id kapsamıyla yapılır.
 *   - Demo hesap: yazma yapılmaz.
 */

const MAX_NAME = 200;
const MAX_TEXT = 4000;

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; combinationId: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id: clientId, combinationId } = await params;
  if (!clientId || !combinationId) {
    return NextResponse.json({ ok: false, error: "Eksik parametre." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  let body: { name?: unknown; description?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  if ("name" in body) {
    const name = str(body.name, MAX_NAME);
    if (!name) {
      return NextResponse.json({ ok: false, error: "Kombinasyon adı boş olamaz." }, { status: 400 });
    }
    fields.name = name;
  }
  if ("description" in body) fields.description = str(body.description, MAX_TEXT);
  if ("note" in body) fields.note = str(body.note, MAX_TEXT);

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { data, error } = await db
    .from("client_combinations")
    .update(fields)
    .eq("id", combinationId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Kombinasyon bulunamadı." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; combinationId: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id: clientId, combinationId } = await params;
  if (!clientId || !combinationId) {
    return NextResponse.json({ ok: false, error: "Eksik parametre." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  const { error } = await db
    .from("client_combinations")
    .delete()
    .eq("id", combinationId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
