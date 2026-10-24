import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { serverErrorResponse } from "@/lib/http/apiError";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { currentIstanbulYear } from "@/lib/numeroloji/currentYear";
import { computeNumerologySummary } from "@/lib/danisan/numerologySummary";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/clients/[id]/numerology-summary — Danışan Yolculuğu "Numerolojik Özet" (H-10, owner kararı 24.10.2026).
 *
 * Danışan detay kartı ve Yolculuk sekmesinin otomatik Numeroloji olayı bu değerleri ARTIK yalnız buradan alır
 * (tarayıcıda hesap yok). Kapılar (sunucu-otoriter, istemcinin gönderdiği hiçbir değer yetki sayılmaz):
 *   1. "clients" modülü (requireModuleAccess: kimlik + oturum + tenant)
 *   2. "numerology" modülü — yoksa 403 NUMEROLOGY_FORBIDDEN, HİÇBİR hesap yapılmaz
 *   3. danışan bu tenant'a ait olmalı (yoksa 404)
 *   4. Gelecek Yıllar: numerology_future_years alt-yetkisi yoksa henüz başlamamış zirveler çıkarılır
 *
 * İsteğe bağlı ?ad=&soyad=&dogum=(YYYY-MM-DD): Genel Bilgiler formu düzenlenirken kart canlı önizleme yapar
 * (eski davranış). Aynı kapılardan geçer; yalnız Numeroloji yetkili uzman için hesaplanır.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId } = await params;
  if (!clientId || !UUID_RE.test(clientId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz danışan." }, { status: 400, headers: NO_STORE });
  }
  if (!hasModulePermissionForProfile(guard.profile, "numerology")) {
    return NextResponse.json(
      { ok: false, code: "NUMEROLOGY_FORBIDDEN", error: "Numeroloji özeti için Numeroloji modülü yetkisi gerekir." },
      { status: 403, headers: NO_STORE },
    );
  }
  const { db, tenantId } = guard;
  const { data: client, error } = await db
    .from("clients")
    .select("id, ad, soyad, dogum")
    .eq("tenant_id", tenantId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) return serverErrorResponse({ route: "clients/[id]/numerology-summary", action: "GET-read-client", tenantId, cause: error });
  if (!client) return NextResponse.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404, headers: NO_STORE });

  const sp = req.nextUrl.searchParams;
  const pick = (k: "ad" | "soyad" | "dogum", fallback: unknown) => {
    const v = sp.get(k);
    return v !== null ? v.slice(0, 120) : String(fallback ?? "");
  };
  const dogum = pick("dogum", client.dogum);
  if (dogum && !ISO_DATE_RE.test(dogum)) {
    return NextResponse.json({ ok: true, summary: null }, { headers: NO_STORE });
  }
  const futureYears = canSeeNumerologyFutureYears(guard.profile);
  const summary = computeNumerologySummary(
    { ad: pick("ad", client.ad), soyad: pick("soyad", client.soyad), dogum },
    { futureYears, currentYear: currentIstanbulYear() },
  );
  return NextResponse.json({ ok: true, summary, futureYears }, { headers: NO_STORE });
}
