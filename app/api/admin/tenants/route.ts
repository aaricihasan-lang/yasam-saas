import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * Admin tenant kontrol — tenants id/name listesi (Faz 1F).
 *
 * tenants tablosu publishable key erişiminden çıkarıldığı için admin paneli
 * tenant isim haritasını bu service_role route üzerinden okur.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id, role=admin + active (service_role).
 *   - Yalnızca GET (admin paneli listeler, yazmaz).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  const { data, error } = await db
    .from("tenants")
    .select("id, name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tenants: data ?? [] });
}
