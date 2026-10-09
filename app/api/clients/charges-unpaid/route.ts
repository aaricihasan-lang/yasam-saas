import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * client_charges — tenant geneli "Ücret Alınmadı" rozet özeti (WT7).
 *
 * danisan-yolculugu/liste her danışan satırında ödenmemiş ücret rozetini TEK istekle alır
 * (danışan başına sorgu yok → N+1 yok). Yalnız payment_status = 'unpaid' satırlar okunur
 * (kısmi index client_charges_unpaid_idx); NULL (eski/Belirtilmemiş) ve 'paid' ASLA sayılmaz.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA user kaydından; sorgu yalnız bu tenant'ın satırlarını döndürür.
 *   - client_id → clients FK ON DELETE CASCADE → silinmiş danışana ait satır kalmaz.
 *
 * Dönüş: { ok, unpaid: { [clientId]: { count, total } } }
 */
const PAGE = 1000;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const unpaid: Record<string, { count: number; total: number }> = {};

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("client_charges")
      .select("id,client_id,amount")
      .eq("tenant_id", tenantId)
      .eq("payment_status", "unpaid")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return serverErrorResponse({ route: "clients/charges-unpaid", action: "GET", tenantId, cause: error });
    }
    const rows = (data ?? []) as { client_id?: string | null; amount?: number | string | null }[];
    for (const row of rows) {
      if (!row.client_id) continue;
      const e = (unpaid[row.client_id] ??= { count: 0, total: 0 });
      e.count++;
      const n = Number(row.amount);
      if (Number.isFinite(n)) e.total = Math.round((e.total + n) * 100) / 100;
    }
    if (rows.length < PAGE) break;
  }

  return NextResponse.json({ ok: true, unpaid });
}
