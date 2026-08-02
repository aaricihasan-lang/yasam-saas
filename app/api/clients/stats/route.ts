import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/clients/stats — Danışan Yolculuğu ana sayfa "Genel Özet" için HAFİF özet.
 *
 * Amaç: tüm danışan + randevu satırlarını indirmeden (ana sayfa eskiden iki tam
 * tablo çekiyordu) sunucuda sayım yapmak. Yanıt yalnızca 6 sayı/tarih içerir.
 *
 * TZ tutarlılığı: ay sınırları ve "şimdi" istemcinin YEREL saat diliminde
 * hesaplanıp ISO olarak gelir; sunucu bunları timestamptz karşılaştırmasında
 * kullanır. Böylece "bu ay" sayımı tarayıcıdaki eski hesapla birebir aynı kalır.
 *
 * Güvenlik: requireModuleAccess → tenant_id sunucuda; tüm sorgular tenant'a bağlı.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const url = new URL(req.url);
  const monthStart = url.searchParams.get("monthStart");
  const monthEnd = url.searchParams.get("monthEnd");
  const now = url.searchParams.get("now");

  if (!monthStart || !monthEnd || !now) {
    return NextResponse.json({ ok: false, error: "Zaman aralığı parametreleri gerekli." }, { status: 400 });
  }

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
    // Bu ay randevu
    db.from("appointments").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("appointment_date", monthStart).lt("appointment_date", monthEnd),
    // En yakın (gelecek, iptal olmayan) randevu — NULL statü de dahil (istemci mantığıyla aynı)
    db.from("appointments").select("appointment_date").eq("tenant_id", tenantId)
      .or("status.is.null,status.neq.iptal").gt("appointment_date", now)
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
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
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
