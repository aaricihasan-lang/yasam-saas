import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/refleksoloji/uuid";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/protocols/[id] — tek protokol oku/sil (C2-B3a).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - id + tenant_id eşleşmesi zorunlu (IDOR engellenir; istemci üretimli id güvenilmez).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

// ─── GET /api/refleksoloji/protocols/[id] ───────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "protokol id gerekli." }, { status: 400 });
  }
  // Bozuk UUID DB'ye ulaşmadan 400 ile reddedilir (ham Postgres 22P02 → 500 sızıntısı yok).
  // Geçerli ama var olmayan UUID → aşağıda 404 semantiği korunur.
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "Geçersiz protokol kimliği." }, { status: 400 });
  }

  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("reflexology_protocols")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Protokol bu hesaba ait değil." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, protocol: data });
}

// ─── DELETE /api/refleksoloji/protocols/[id] ────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "protokol id gerekli." }, { status: 400 });
  }
  // Bozuk UUID → 400 (ham Postgres hatası / 500 sızıntısı yerine).
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "Geçersiz protokol kimliği." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
