import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { getBioResource, pickWritableBioFields } from "@/lib/biyoenerji/resourceConfig";

export const runtime = "nodejs";

/**
 * /api/biyoenerji/[resource]/[id] — tek kayıt oku/güncelle/sil.
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - id + tenant_id eşleşmesi zorunlu (IDOR engellenir).
 *   - Body'de yalnız izinli kolonlar; tenant_id/id/created_at yok sayılır.
 *   - Demo hesap: yazma yapılmaz.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;

  const { resource, id } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });

  const { db, tenantId } = guard;
  const { data, error } = await db
    .from(cfg.table)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Kayıt bu hesaba ait değil." }, { status: 404 });
  return NextResponse.json({ ok: true, row: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;

  const { resource, id } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, row: null });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const fields = pickWritableBioFields(cfg, body);
  const { data, error } = await db
    .from(cfg.table)
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya yetki yok." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;

  const { resource, id } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { error } = await db.from(cfg.table).delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
