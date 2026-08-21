import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { computeBurc } from "@/lib/danisan/burc";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * /api/clients/[id] — tek danışan oku/güncelle (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - id + tenant_id eşleşmesi zorunlu (IDOR engellenir).
 *   - Body'deki tenant_id/id/created_at yok sayılır.
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

// ─── GET /api/clients/[id] ───────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return serverErrorResponse({ route: "clients/[id]", action: "GET", tenantId, cause: error });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, client: data });
}

// ─── PATCH /api/clients/[id] ─────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

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

  // F7: burç server-authoritative. `dogum` gönderildiyse burç yeniden hesaplanır
  // (dogum boş/null → burç null); `dogum` gönderilmediyse burç DEĞİŞMEZ ve client'ın
  // doğrudan gönderdiği `burc` yok sayılır (strip).
  if (Object.prototype.hasOwnProperty.call(fields, "dogum")) {
    fields.burc = computeBurc(fields.dogum == null ? null : String(fields.dogum));
  } else {
    delete fields.burc;
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { data, error } = await db
    .from("clients")
    .update(fields)
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) {
    return serverErrorResponse({ route: "clients/[id]", action: "PATCH", tenantId, cause: error });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, client: data });
}
