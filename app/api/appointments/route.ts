import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { validateAppointmentCreate } from "@/lib/danisan/appointmentRules";
import { advanceClientGorusme } from "@/lib/danisan/appointmentGorusme";

export const runtime = "nodejs";

/**
 * /api/appointments — uzmanın randevu listesi/oluşturma (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA; request'ten GÜVENİLMEZ.
 *   - Sorgu/insert tenant_id ile bağlanır.
 *   - client_id verilmişse o danışanın bu tenant'a ait olduğu doğrulanır (IDOR).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *   - DY-A: POST alan izin listesi + status enum; gelecekte "tamamlandi" → 409;
 *     geçmiş tarihli "tamamlandi" kayıtta clients.gorusme sunucuda ilerletilir.
 */

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
  const guard = await requireModuleAccess(req, "appointments");
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
    return serverErrorResponse({ route: "appointments", action: "GET", tenantId, cause: error });
  }

  return NextResponse.json({ ok: true, appointments: data ?? [] });
}

// ─── POST /api/appointments ──────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "appointments");
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

  const now = new Date();
  const verdict = validateAppointmentCreate(body, now);
  if (!verdict.ok) {
    if (verdict.status === 409) {
      await trackUsage(guard, req, {
        module: "appointments",
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

  // client_id verilmişse sahiplik doğrula
  const clientId = fields.client_id != null && fields.client_id !== "" ? String(fields.client_id) : null;
  if (!clientId) fields.client_id = null;
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
    return serverErrorResponse({
      route: "appointments",
      action: "POST",
      tenantId,
      cause: error,
      usage: { guard, req, module: "appointments", failedAction: "record_created", subEntity: "appointment" },
    });
  }

  let gorusme: string | null = null;
  if (fields.status === "tamamlandi" && clientId) {
    gorusme = await advanceClientGorusme(db, tenantId, clientId, fields.appointment_date, now);
  }

  const newAppointmentId = (data as { id?: unknown } | null)?.id;
  await trackUsage(guard, req, {
    module: "appointments",
    action: "record_created",
    subEntity: "appointment",
    resourceId: newAppointmentId != null ? String(newAppointmentId) : null,
  });

  return NextResponse.json({ ok: true, appointment: data, ...(gorusme ? { gorusme } : {}) });
}
