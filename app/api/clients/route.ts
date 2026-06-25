import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * GET /api/clients — uzmanın danışan listesi (C2-B1a, salt-okuma).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; request'ten GÜVENİLMEZ.
 *   - Tüm sorgu tenant_id ile .eq filtrelenir (çapraz-tenant okuma engellenir).
 *
 * Query (opsiyonel): search (ad/soyad ilike), limit (1..1000), order (asc|desc, created_at).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const url = new URL(req.url);

  const rawSearch = url.searchParams.get("search")?.trim() ?? "";
  // PostgREST .or filtre söz dizimini bozabilecek karakterleri temizle.
  const search = rawSearch.replace(/[,()*%]/g, "").slice(0, 100);

  const limitRaw = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : null;
  const ascending = url.searchParams.get("order") === "asc";

  let query = db
    .from("clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending });

  if (search) {
    query = query.or(`ad.ilike.%${search}%,soyad.ilike.%${search}%`);
  }
  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, clients: data ?? [] });
}
