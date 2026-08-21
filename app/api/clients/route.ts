import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { computeBurc } from "@/lib/danisan/burc";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * /api/clients — uzmanın danışan listesi/oluşturma (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; request body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/insert tenant_id ile bağlanır (çapraz-tenant erişim engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

const PROTECTED_KEYS = new Set(["tenant_id", "id", "created_at"]);

/** Body'den korunan alanları (tenant_id/id/created_at) çıkarır. */
function sanitizePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!PROTECTED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

// ─── GET /api/clients ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const url = new URL(req.url);

  const rawSearch = url.searchParams.get("search")?.trim() ?? "";
  const search = rawSearch.replace(/[,()*%]/g, "").slice(0, 100);

  const limitRaw = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : null;

  // Sunucu tarafı sayfalama: offset verilirse range() ile pencere alınır.
  const offsetRaw = Number(url.searchParams.get("offset"));
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : null;

  // count=1 → toplam kayıt sayısı da döner (sayfalama "daha var mı" için).
  const withCount = url.searchParams.get("count") === "1";
  const ascending = url.searchParams.get("order") === "asc";

  let query = db
    .from("clients")
    .select("*", withCount ? { count: "exact" } : undefined)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending });

  if (search) {
    query = query.or(`ad.ilike.%${search}%,soyad.ilike.%${search}%`);
  }
  if (offset !== null && limit) {
    query = query.range(offset, offset + limit - 1);
  } else if (limit) {
    query = query.limit(limit);
  }

  const { data, error, count } = await query;
  if (error) {
    return serverErrorResponse({ route: "clients", action: "GET", tenantId, cause: error });
  }

  return NextResponse.json({
    ok: true,
    clients: data ?? [],
    ...(withCount ? { count: count ?? 0 } : {}),
  });
}

// ─── POST /api/clients ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, client: null });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const fields = sanitizePayload(body);

  // F7: Burç SUNUCUDA doğum tarihinden türetilir (canonical, giriş yolundan bağımsız).
  // Client'ın gönderdiği `burc` authoritative DEĞİL → overwrite. dogum yoksa burç null.
  fields.burc = computeBurc(fields.dogum == null ? null : String(fields.dogum));

  const { data, error } = await db
    .from("clients")
    .insert({ ...fields, tenant_id: tenantId })
    .select()
    .single();

  if (error) {
    return serverErrorResponse({ route: "clients", action: "POST", tenantId, cause: error });
  }

  return NextResponse.json({ ok: true, client: data });
}
