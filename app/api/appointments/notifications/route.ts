import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { logServerError, serverErrorResponse } from "@/lib/http/apiError";
import {
  buildStateIndex,
  clientDisplayName,
  isNotifiable,
  notificationQueryWindow,
  type NotificationAppointment,
  type NotificationStateRow,
} from "@/lib/danisan/appointmentNotifications";

export const runtime = "nodejs";

/**
 * GET /api/appointments/notifications — bildirim zili akışı (AŞAMA 2 · §4.2).
 *
 * Güvenlik:
 *   - requireModuleAccess("appointments") → binding + üyelik + modül izni. tenant_id ve
 *     user_id YALNIZ guard'dan; istemciden parametre ALINMAZ.
 *   - Randevu SELECT'i yalnız id/title/appointment_date/status/client_id (notes YOK).
 *   - Danışan adı yalnız kullanıcının "clients" modül izni varsa, tek batch
 *     `.in(ids).eq(tenant_id)` sorgusuyla eklenir; izin yoksa ad gizli kalır.
 *   - done/muted durumları yalnız bu kullanıcının + bu tenant'ın kayıtlarıdır.
 *   - Yanıt no-store; ham hata istemciye dönmez.
 *
 * Görünürlük: İstanbul bugünü + bekliyor + appointment_date ≥ now − 30 dk + done/muted değil
 * (lib/danisan/appointmentNotifications.ts → isNotifiable; istemci aynı kuralı zamanla yeniden uygular).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_ROWS = 200;

type ClientRow = { id: string; ad: string | null; soyad: string | null };

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "appointments");
  if (!guard.ok) return guard.response;

  const { db, tenantId, userId } = guard;
  const now = new Date();
  const { fromIso, toIso } = notificationQueryWindow(now);

  const { data: apptData, error: apptError } = await db
    .from("appointments")
    .select("id, title, appointment_date, status, client_id")
    .eq("tenant_id", tenantId)
    .gte("appointment_date", fromIso)
    .lte("appointment_date", toIso)
    .order("appointment_date", { ascending: true })
    .limit(MAX_ROWS);

  if (apptError) {
    const res = serverErrorResponse({ route: "appointments/notifications", action: "GET", tenantId, cause: apptError });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const rows = (apptData ?? []) as NotificationAppointment[];
  const ids = rows.map((r) => r.id);

  // Kullanıcının done/muted kararları. Okuma hatası (ör. migration henüz uygulanmamış)
  // zili düşürmez: durumlar boş sayılır, hata yalnız sunucuda loglanır.
  let states: NotificationStateRow[] = [];
  if (ids.length > 0) {
    const { data: stateData, error: stateError } = await db
      .from("appointment_notification_states")
      .select("appointment_id, appointment_at, state")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .in("appointment_id", ids);
    if (stateError) {
      logServerError({ route: "appointments/notifications", action: "GET:states", tenantId, cause: stateError });
    } else {
      states = (stateData ?? []) as NotificationStateRow[];
    }
  }

  const stateIndex = buildStateIndex(states);
  const visible = rows.filter((r) => isNotifiable(r, now, stateIndex));

  // Danışan adı: yalnız "clients" izni varsa (aynı guard profili; ek users sorgusu YOK).
  const profile = guard.profile ?? {};
  const canClients = resolveModuleAccess(profile.role, profile.module_permissions, "clients");
  const names = new Map<string, string | null>();
  const clientIds = [...new Set(visible.map((r) => r.client_id).filter((v): v is string => !!v))];
  if (canClients && clientIds.length > 0) {
    const { data: clientData, error: clientError } = await db
      .from("clients")
      .select("id, ad, soyad")
      .in("id", clientIds)
      .eq("tenant_id", tenantId);
    if (clientError) {
      // Ad okunamazsa bildirim yine gösterilir ("Kayıtlı danışan"); ham hata dönmez.
      logServerError({ route: "appointments/notifications", action: "GET:clients", tenantId, cause: clientError });
    } else {
      for (const c of (clientData ?? []) as ClientRow[]) names.set(c.id, clientDisplayName(c));
    }
  }

  const items = visible.map((r) => {
    const found = !!r.client_id && names.has(r.client_id);
    return {
      id: r.id,
      title: r.title,
      appointment_date: r.appointment_date,
      status: r.status,
      client_id: r.client_id,
      clientName: found ? names.get(r.client_id as string) ?? null : null,
      canOpenClient: canClients && found,
    };
  });

  return NextResponse.json({ ok: true, serverNow: now.toISOString(), items }, { headers: NO_STORE });
}
