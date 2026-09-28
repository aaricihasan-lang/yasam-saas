import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { validateAppointmentPatch } from "@/lib/danisan/appointmentRules";
import { advanceClientGorusme } from "@/lib/danisan/appointmentGorusme";

export const runtime = "nodejs";

/**
 * /api/appointments/[id] — randevu güncelle/sil (C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - UPDATE/DELETE her zaman id + tenant_id filtresiyle (IDOR engellenir).
 *   - DY-A: PATCH alan İZİN LİSTESİ (title/notes/appointment_date/status); tenant_id,
 *     id, client_id, created_at ve bilinmeyen alanlar yok sayılır. status enum
 *     (bekliyor/tamamlandi/iptal) dışı → 400. Gelecekteki randevuyu "tamamlandi"
 *     yapmak → 409 APPOINTMENT_IN_FUTURE.
 *   - "tamamlandi" sonrası danışanın son görüşme tarihi (clients.gorusme) SUNUCUDA
 *     ilerletilir (yalnız randevu ≤ şimdi; İstanbul günü; asla geri/ileri-tarih yazmaz).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

// ─── PATCH /api/appointments/[id] ─────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "appointments");
  if (!guard.ok) return guard.response;

  const { id: appointmentId } = await params;
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: "appointment_id gerekli." }, { status: 400 });
  }

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

  const { data: existing, error: readErr } = await db
    .from("appointments")
    .select("id, appointment_date, client_id, status")
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (readErr) {
    return serverErrorResponse({ route: "appointments/[id]", action: "PATCH-read", tenantId, cause: readErr });
  }
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Randevu bu hesaba ait değil." },
      { status: 404 },
    );
  }

  const now = new Date();
  const verdict = validateAppointmentPatch(
    body,
    existing as { appointment_date?: unknown },
    now,
  );
  if (!verdict.ok) {
    if (verdict.status === 409) {
      await trackUsage(guard, req, {
        module: "appointments",
        action: "action_failed",
        failedAction: "record_updated",
        subEntity: "appointment",
        errorClass: "conflict",
      });
    }
    return NextResponse.json(
      { ok: false, code: verdict.code, error: verdict.error },
      { status: verdict.status },
    );
  }

  const { data, error } = await db
    .from("appointments")
    .update(verdict.fields)
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) {
    return serverErrorResponse({
      route: "appointments/[id]",
      action: "PATCH",
      tenantId,
      cause: error,
      usage: { guard, req, module: "appointments", failedAction: "record_updated", subEntity: "appointment" },
    });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Randevu bu hesaba ait değil." },
      { status: 404 },
    );
  }

  const row = data as { client_id?: string | null; appointment_date?: string | null };
  let gorusme: string | null = null;
  if (verdict.fields.status === "tamamlandi" && row.client_id) {
    gorusme = await advanceClientGorusme(db, tenantId, row.client_id, row.appointment_date, now);
  }

  await trackUsage(guard, req, { module: "appointments", action: "record_updated", subEntity: "appointment", resourceId: appointmentId });

  return NextResponse.json({ ok: true, appointment: data, ...(gorusme ? { gorusme } : {}) });
}

// ─── DELETE /api/appointments/[id] ────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "appointments");
  if (!guard.ok) return guard.response;

  const { id: appointmentId } = await params;
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: "appointment_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }

  const { data, error } = await db
    .from("appointments")
    .delete()
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) {
    return serverErrorResponse({
      route: "appointments/[id]",
      action: "DELETE",
      tenantId,
      cause: error,
      usage: { guard, req, module: "appointments", failedAction: "record_deleted", subEntity: "appointment" },
    });
  }

  // Satır bulunmadıysa (0 silindi) değişiklik yok → olay yok.
  if ((data?.length ?? 0) > 0) {
    await trackUsage(guard, req, { module: "appointments", action: "record_deleted", subEntity: "appointment", resourceId: appointmentId });
  }

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
