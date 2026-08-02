import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/dogaltas/minerals/[id] — tek mineral okuma/güncelleme/silme (Faz 1-A).
 * Tenant-only: her işlem .eq("id", id).eq("tenant_id", tenantId).
 */

const MINERAL_WRITABLE = [
  "source_id", "name", "aciklama", "kategori", "organ_etkileri", "fiziksel",
  "zihinsel", "cakralar", "fizyoloji", "eksiklik_belirtileri",
  "fazlalik_belirtileri", "doz_asimi", "iceren_taslar",
] as const;

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await params;

  const { data, error } = await db
    .from("minerals").select("*")
    .eq("id", id).eq("tenant_id", tenantId).maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Mineral bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true, row: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const fields = pick(body, MINERAL_WRITABLE);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }
  // Ad gönderildiyse boş/yalnız-boşluk olamaz (POST ile aynı kural).
  if ("name" in fields) {
    const nm = String(fields.name ?? "").trim();
    if (!nm) return NextResponse.json({ ok: false, error: "Mineral adı zorunludur." }, { status: 400 });
    fields.name = nm;
  }

  const { data, error } = await db
    .from("minerals").update(fields)
    .eq("id", id).eq("tenant_id", tenantId)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Mineral bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("minerals").delete()
    .eq("id", id).eq("tenant_id", tenantId)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Mineral bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}
