import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/stones/bulk-delete — Doğaltaş Listesi toplu silme (UAT #1).
 * Body: { ids: string[] }. Tek istekte siler → sıralı tekil DELETE yerine batch.
 * Silme yalnız .in("id", ids).eq("tenant_id", tenantId) →
 * yalnız kendi tenant kayıtları silinir; başka tenant / kütüphane id'leri yok sayılır
 * (kütüphane taşları client tarafında exclusion ile ayrı ele alınır).
 * Tek atomik istek olduğu için "sayfadan çıkınca kısmi silme" riski ortadan kalkar.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { ids?: unknown };
  try { body = (await req.json()) as { ids?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Silinecek kayıt seçilmedi." }, { status: 400 });
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deletedIds: [] });

  const { data, error } = await db
    .from("stones").delete()
    .in("id", ids).eq("tenant_id", tenantId) // tenant guard — cross-tenant delete engellenir
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const deletedIds = (data ?? []).map((r: { id: string }) => r.id);
  return NextResponse.json({ ok: true, deletedIds, deleted: deletedIds.length });
}
