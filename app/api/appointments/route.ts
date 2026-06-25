import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/appointments — uzmanın randevu listesi/oluşturma (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - verifyUserRequest → binding. tenant_id SUNUCUDA; request'ten GÜVENİLMEZ.
 *   - Sorgu/insert tenant_id ile bağlanır.
 *   - client_id verilmişse o danışanın bu tenant'a ait olduğu doğrulanır (IDOR).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

const PROTECTED_KEYS = new Set(["tenant_id", "id", "created_at"]);

function sanitizePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!PROTECTED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── GET /api/appointments ───────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const url = new URL(req.url);

  const from = url.searchParams.get("from")?.trim() || null;
  const to = url.searchParams.get("to")?.trim() || null;
  const clientId = url.searchParams.get("client_id")?.trim() || null;
  const ascending = url.searchParams.get("order") !== "desc";

  let query = db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("appointment_date", { ascending });

  if (clientId) query = query.eq("client_id", clientId);
  if (from) query = query.gte("appointment_date", from);
  if (to) query = query.lte("appointment_date", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, appointments: data ?? [] });
}

// ─── POST /api/appointments ──────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, appointment: null });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const fields = sanitizePayload(body);

  // client_id verilmişse sahiplik doğrula
  const clientId = fields.client_id != null ? String(fields.client_id) : null;
  if (clientId && !(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  const { data, error } = await db
    .from("appointments")
    .insert({ ...fields, tenant_id: tenantId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, appointment: data });
}
