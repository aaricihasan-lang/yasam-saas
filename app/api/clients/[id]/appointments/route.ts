import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAppointmentCreate } from "@/lib/danisan/appointmentRules";
import { advanceClientGorusme } from "@/lib/danisan/appointmentGorusme";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";

export const runtime = "nodejs";

/**
 * /api/clients/[id]/appointments — bir danışanın randevuları (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - Önce client_id'nin bu tenant'a ait olduğu doğrulanır (IDOR).
 *   - Sorgu/insert tenant_id + client_id ile bağlanır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

const PROTECTED_KEYS = new Set(["tenant_id", "id", "created_at", "client_id"]);

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

// ─── GET /api/clients/[id]/appointments ────────────────────────────────────────────
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

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("appointment_date", { ascending: true });

  if (error) {
    return serverErrorResponse({ route: "clients/[id]/appointments", action: "GET", tenantId, cause: error });
  }

  return NextResponse.json({ ok: true, appointments: data ?? [] });
}

// ─── POST /api/clients/[id]/appointments ───────────────────────────────────────────
export async function POST(
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

  if (is_demo_account) return demoReadOnlyResponse();

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // DY-A: alan izin listesi + status enum + gelecekte "tamamlandi" yasağı (409).
  const now = new Date();
  const verdict = validateAppointmentCreate(sanitizePayload(body), now);
  if (!verdict.ok) {
    if (verdict.status === 409) {
      await trackUsage(guard, req, {
        module: "clients",
        action: "action_failed",
        failedAction: "record_created",
        subEntity: "appointment",
        errorClass: "conflict",
      });
    }
    return NextResponse.json(
      { ok: false, code: verdict.code, error: verdict.error },
      { status: verdict.status },
    );
  }
  const fields = verdict.fields;

  const { data, error } = await db
    .from("appointments")
    .insert({ ...fields, tenant_id: tenantId, client_id: clientId })
    .select()
    .single();

  if (error) {
    return serverErrorResponse({
      route: "clients/[id]/appointments",
      action: "POST",
      tenantId,
      cause: error,
      usage: { guard, req, module: "clients", failedAction: "record_created", subEntity: "appointment" },
    });
  }

  let gorusme: string | null = null;
  if (fields.status === "tamamlandi") {
    gorusme = await advanceClientGorusme(db, tenantId, clientId, fields.appointment_date, now);
  }

  const newAppointmentId = (data as { id?: unknown } | null)?.id;
  await trackUsage(guard, req, {
    module: "clients",
    action: "record_created",
    subEntity: "appointment",
    resourceId: newAppointmentId != null ? String(newAppointmentId) : null,
  });

  return NextResponse.json({ ok: true, appointment: data, ...(gorusme ? { gorusme } : {}) });
}
