import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { istanbulToday } from "@/lib/danisan/istanbulTime";
import { isHomeworkOverdue } from "@/lib/odevStatus";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * client_homeworks — tenant geneli "geciken ödev" uyarı özeti (Faz 1C).
 *
 * danisan-yolculugu/liste sayfası, danışan başına geciken ödev sayısını gösterir.
 * Bu sorgu client_id'ye değil tenant'a göredir (uzmanın tüm danışanları).
 *
 * FAZ 2 F3/F6: "geciken" TEK canonical model ile hesaplanır (overview/detay ile
 * aynı) → açık `gecikti` statüsü VEYA (`devam` && end_date ≤ Istanbul bugünü).
 * "bugün" SUNUCUDA Europe/Istanbul'a göre üretilir (eski UTC gün kayması giderildi).
 * Dahil edilecek adaylar `devam`+`gecikti`; kullanıcı tarafından kapatılmış
 * (alert_dismissed_at) uyarılar sayılmaz.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA user kaydından alınır.
 *   - Sorgu yalnızca bu tenant'ın kayıtlarını döndürür.
 *
 * Yalnız tenant'ta HÂLÂ VAR OLAN danışanlar sayılır (silinmiş danışana bağlı yetim satır sayaca
 * yansımaz — FK cascade'e ek savunma). Aktif Uyarı listesinde ad gösterilebilsin diye yalnız
 * uyarısı olan danışanların adları döner.
 *
 * Dönüş: { ok, alerts: { [clientId]: adet }, names: { [clientId]: "Ad Soyad" } }
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const today = istanbulToday();

  const { data, error } = await db
    .from("client_homeworks")
    .select("client_id,end_date,status,alert_dismissed_at")
    .eq("tenant_id", tenantId)
    .in("status", ["devam", "gecikti"])
    .is("alert_dismissed_at", null);

  if (error) {
    return serverErrorResponse({ route: "clients/homeworks-alerts", action: "GET", tenantId, cause: error });
  }

  const alerts: Record<string, number> = {};
  for (const row of (data ?? []) as {
    client_id?: string | null;
    status?: string | null;
    end_date?: string | null;
  }[]) {
    if (!row.client_id) continue;
    if (!isHomeworkOverdue(row, today)) continue;
    alerts[row.client_id] = (alerts[row.client_id] || 0) + 1;
  }

  const ids = Object.keys(alerts);
  const names: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: rows, error: clientErr } = await db
      .from("clients")
      .select("id,ad,soyad")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (clientErr) {
      return serverErrorResponse({ route: "clients/homeworks-alerts", action: "GET", tenantId, cause: clientErr });
    }
    const existing = new Set<string>();
    for (const c of (rows ?? []) as { id: string; ad?: string | null; soyad?: string | null }[]) {
      existing.add(c.id);
      names[c.id] = [c.ad, c.soyad].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
    }
    for (const id of ids) if (!existing.has(id)) delete alerts[id];
  }

  return NextResponse.json({ ok: true, alerts, names });
}
