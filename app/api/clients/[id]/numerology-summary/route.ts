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
 * GET  → danışanın KAYITLI ad/soyad/doğum değerleriyle. Sorgu parametresi KABUL EDİLMEZ.
 * POST → Genel Bilgiler formu düzenlenirken canlı önizleme; { ad, soyad, dogum(YYYY-MM-DD) } JSON GÖVDESİNDE.
 *        Kişisel veri URL'ye (erişim günlükleri, tarayıcı ağ geçmişi) hiç yazılmaz. Salt-okur: veri
 *        değiştirmez; aynı kapılardan + cookie oturumda CSRF (Origin/Sec-Fetch-Site) denetiminden geçer.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(req, ctx, null);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(req, ctx, async () => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : "");
    return { ad: str(body?.ad), soyad: str(body?.soyad), dogum: str(body?.dogum) };
  });
}

/** readOverrides: POST gövdesi YALNIZ tüm kapılar (oturum/CSRF, numerology, tenant) geçildikten sonra okunur. */
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  readOverrides: (() => Promise<{ ad: string; soyad: string; dogum: string }>) | null,
): Promise<Response> {
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

  const overrides = readOverrides ? await readOverrides() : null;
  const pick = (k: "ad" | "soyad" | "dogum", fallback: unknown) => (overrides ? overrides[k] : String(fallback ?? ""));
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
