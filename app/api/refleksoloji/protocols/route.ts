import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/protocols — uzmanın refleksoloji protokolleri (C2-B3a).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/insert tenant_id ile bağlanır (çapraz-tenant erişim engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Not: reflexology_protocols tenant-scoped (client_id yok). `id` ve `created_at`
 *      kayıt katmanında istemci tarafından üretilir; yalnızca `tenant_id` zorlanır.
 */

// ─── GET /api/refleksoloji/protocols ───────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("reflexology_protocols")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("title");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, protocols: data ?? [] });
}

// ─── POST /api/refleksoloji/protocols ──────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, protocol: null });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // tenant_id payload'dan yok sayılır; server her zaman kendi tenant'ını yazar.
  const fields = { ...body };
  delete (fields as { tenant_id?: unknown }).tenant_id;

  const { data, error } = await db
    .from("reflexology_protocols")
    .insert({ ...fields, tenant_id: tenantId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, protocol: data });
}
