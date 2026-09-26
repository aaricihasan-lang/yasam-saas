import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { mapSaleRpcError } from "@/lib/urun-stok/salesErrors";

export const runtime = "nodejs";

/**
 * /api/urun-stok/sales/[id]/cancel — atomik satış iptali + stok iadesi (USM-018).
 * inventory_sale_cancel_atomic RPC; çift iptal güvenli (2. kez stok iade etmez).
 * tenant_id + cancelled_by DAİMA oturumdan.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;

  const { id } = await ctx.params;
  const saleId = String(id ?? "").trim();
  if (!UUID_RE.test(saleId))
    return NextResponse.json({ ok: false, error: "Geçersiz satış kimliği." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db.rpc("inventory_sale_cancel_atomic", {
    p_tenant_id: tenantId,
    p_sale_id: saleId,
    p_cancelled_by: userId,
  });

  if (error) {
    const mapped = mapSaleRpcError(error);
    if (mapped.status === 500) {
      console.error("[urun-stok/sales/cancel] RPC hata", { code: (error as { code?: string }).code });
    }
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }

  const result = data as { already_cancelled?: boolean; restored?: number };
  return NextResponse.json({
    ok: true,
    already_cancelled: Boolean(result?.already_cancelled),
    restored: result?.restored ?? 0,
  });
}
