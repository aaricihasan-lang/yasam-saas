import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { isNotificationStateValue, isUuid } from "@/lib/danisan/appointmentNotifications";

export const runtime = "nodejs";

/**
 * POST /api/appointments/notifications/state — bildirim kararı (done | muted) (AŞAMA 2 · §4.2).
 *
 * Gövde: { appointmentId: uuid, state: "done" | "muted" } (≤ 1 KB).
 *
 * Güvenlik:
 *   - requireModuleAccess("appointments"); tenant_id + user_id YALNIZ guard'dan.
 *   - appointmentId UUID; randevu bu tenant'a ait değilse 404 (IDOR yok, varlık sızmaz).
 *   - appointment_at İSTEMCİDEN ALINMAZ: randevunun SUNUCUDAKİ güncel appointment_date'i.
 *     (Yeniden planlanan randevu yeni anahtar üretir → bildirim tekrar görünür.)
 *   - "done" randevu statüsünü DEĞİŞTİRMEZ (yalnız bildirimi kapatır).
 *   - Demo hesap: yazma YOK (200 no-op; mevcut appointments demo deseni).
 *   - Yanıt no-store; ham hata istemciye dönmez.
 *
 * Usage360: bildirim görünürlük tercihi iş kaydı değildir → telemetri muaf
 * (scripts/usage360/route-events/appointments.json "exempt" girdisi).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_BODY_BYTES = 1024;

function bad(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "appointments");
  if (!guard.ok) return guard.response;

  const { db, tenantId, userId, is_demo_account } = guard;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > MAX_BODY_BYTES) return bad(413, "İstek gövdesi çok büyük.");

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return bad(413, "İstek gövdesi çok büyük.");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return bad(400, "Geçersiz istek gövdesi.");
    body = parsed as Record<string, unknown>;
  } catch {
    return bad(400, "Geçersiz istek gövdesi.");
  }

  const appointmentId = body.appointmentId;
  const state = body.state;
  if (!isUuid(appointmentId)) return bad(400, "Geçersiz randevu.");
  if (!isNotificationStateValue(state)) return bad(400, "Geçersiz bildirim durumu.");

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, state }, { headers: NO_STORE });
  }

  const { data: appt, error: apptError } = await db
    .from("appointments")
    .select("id, appointment_date")
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (apptError) {
    const res = serverErrorResponse({ route: "appointments/notifications/state", action: "POST:lookup", tenantId, cause: apptError });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  const appointmentAt = (appt as { appointment_date?: string | null } | null)?.appointment_date ?? null;
  if (!appt || !appointmentAt) return bad(404, "Randevu bulunamadı.");

  const { error: upsertError } = await db
    .from("appointment_notification_states")
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        appointment_id: appointmentId,
        appointment_at: appointmentAt,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,appointment_id,appointment_at" },
    );

  if (upsertError) {
    const res = serverErrorResponse({ route: "appointments/notifications/state", action: "POST", tenantId, cause: upsertError });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  return NextResponse.json({ ok: true, state, appointmentAt }, { headers: NO_STORE });
}
