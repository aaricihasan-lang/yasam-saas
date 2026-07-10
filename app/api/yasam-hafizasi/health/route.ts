import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { YH_TABLES, YH_DEFAULT_FLAGS } from "@/lib/yasam-hafizasi/config";

export const runtime = "nodejs";

/**
 * GET /api/yasam-hafizasi/health — indeks erişilebilirliği + özet sayaçlar.
 *
 * Güvenlik:
 *   - verifyUserRequest binding; tenant SUNUCUDA oturumdan.
 *   - HAM İÇERİK DÖNDÜRMEZ — yalnız aggregate sayaçlar (head:true ile satır çekilmez).
 *   - Başka tenant'a ait detay/kırılım DÖNDÜRMEZ (yalnız: global toplam, bu tenant, shared).
 *   - Demo hesap → sıfır sayaçlar + güvenli varsayılan.
 *
 * Bu route retrieval/arama YAPMAZ (Sprint 1 / A1).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({
      ok: true,
      demo: true,
      accessible: true,
      mainIndexRows: 0,
      tenantRows: 0,
      sharedRows: 0,
      flags: { ...YH_DEFAULT_FLAGS },
    });
  }

  const table = YH_TABLES.index;

  // head:true → yalnızca sayım; hiçbir satır içeriği dönmez.
  const totalQ = await db.from(table).select("*", { count: "exact", head: true });
  const tenantQ = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const sharedQ = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .is("tenant_id", null);

  const accessible = !totalQ.error && !tenantQ.error && !sharedQ.error;
  const flags = await getTenantFlags(tenantId, db);

  return NextResponse.json({
    ok: true,
    accessible,
    mainIndexRows: totalQ.count ?? 0,
    tenantRows: tenantQ.count ?? 0,
    sharedRows: sharedQ.count ?? 0,
    flags,
  });
}
