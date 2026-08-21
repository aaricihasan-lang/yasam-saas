import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { istanbulMonthRange, istanbulNow } from "@/lib/danisan/istanbulTime";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * /api/clients/stats — Danışan Yolculuğu ana sayfa "Genel Özet" için HAFİF özet.
 *
 * Amaç: tüm danışan + randevu satırlarını indirmeden (ana sayfa eskiden iki tam
 * tablo çekiyordu) sunucuda sayım yapmak. Yanıt yalnızca 6 sayı/tarih içerir.
 *
 * TZ tutarlılığı (FAZ 2 F6): ay sınırları ve "şimdi" SUNUCUDA Europe/Istanbul'a
 * göre deterministik üretilir. Tarayıcı/Vercel runtime saat dilimi sonucu ETKİLEMEZ;
 * istemciden tarih parametresi ALINMAZ.
 *
 * Randevu semantiği (FAZ 2 F1/F2):
 *   - "Bu Ay Randevu": bu ay içindeki randevular, iptal HARİÇ (bekliyor+tamamlandi+null).
 *   - "En Yakın Randevu": now sonrası EN ERKEN AKTİF randevu (bekliyor+null;
 *     iptal VE tamamlandi hariç).
 *
 * Güvenlik: requireModuleAccess → tenant_id sunucuda; tüm sorgular tenant'a bağlı.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  // Canonical Europe/Istanbul ay penceresi + "şimdi" (server-side, deterministik).
  const { monthStart, monthEnd } = istanbulMonthRange();
  const now = istanbulNow().toISOString();

  const [
    totalRes,
    monthClientsRes,
    lastClientRes,
    monthApptsRes,
    nextApptRes,
    completedRes,
  ] = await Promise.all([
    // Toplam danışan
    db.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    // Bu ay yeni danışan
    db.from("clients").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", monthStart).lt("created_at", monthEnd),
    // Son kayıt tarihi
    db.from("clients").select("created_at").eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }).limit(1),
    // Bu ay randevu — iptal HARİÇ (bekliyor + tamamlandi + legacy null dahil). F1
    db.from("appointments").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .or("status.is.null,status.neq.iptal")
      .gte("appointment_date", monthStart).lt("appointment_date", monthEnd),
    // En yakın AKTİF (gelecek) randevu — bekliyor + legacy null; iptal VE tamamlandi hariç. F2
    db.from("appointments").select("appointment_date").eq("tenant_id", tenantId)
      .or("status.is.null,and(status.neq.iptal,status.neq.tamamlandi)").gt("appointment_date", now)
      .order("appointment_date", { ascending: true }).limit(1),
    // Bu ay tamamlanan randevu
    db.from("appointments").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "tamamlandi")
      .gte("appointment_date", monthStart).lt("appointment_date", monthEnd),
  ]);

  const err =
    totalRes.error || monthClientsRes.error || lastClientRes.error ||
    monthApptsRes.error || nextApptRes.error || completedRes.error;
  if (err) {
    return serverErrorResponse({ route: "clients/stats", action: "GET", tenantId, cause: err });
  }

  return NextResponse.json({
    ok: true,
    stats: {
      totalClients: totalRes.count ?? 0,
      thisMonthClients: monthClientsRes.count ?? 0,
      lastClientDate: lastClientRes.data?.[0]?.created_at ?? null,
      thisMonthAppts: monthApptsRes.count ?? 0,
      nextApptDate: nextApptRes.data?.[0]?.appointment_date ?? null,
      thisMonthCompleted: completedRes.count ?? 0,
    },
  });
}
