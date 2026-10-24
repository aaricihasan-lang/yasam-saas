import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { serverErrorResponse } from "@/lib/http/apiError";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { ensureClientNumerologyAnalysis } from "@/lib/danisan/numerologyAuto";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/clients/[id]/numerology-analysis — danışan detayı "Numeroloji" sekmesi (owner kararı 24.10.2026).
 *
 * Danışanın TAM Numeroloji analizini döndürür; yoksa (ilk açılış, yetki sonradan verildi, doğum tarihi
 * sonradan girildi, ad/soyad/doğum değişti, metodoloji güncellendi) Numeroloji modülünün kayıt biçiminde
 * OLUŞTURUR ve danışana bağlar (lib/danisan/numerologyAuto). Kapılar (sunucu-otoriter):
 *   1. "clients" modülü (requireModuleAccess: kimlik + oturum + tenant)
 *   2. "numerology" modülü — yoksa 403 NUMEROLOGY_FORBIDDEN, hiçbir hesap / kayıt yapılmaz
 *   3. danışan bu tenant'a ait olmalı (yoksa 404)
 * Demo vitrin hesabı: DB'ye yazılmaz, geçici sonuç döner.
 * Gelecek Yıllar: `futureYears` bayrağı Numeroloji modülüyle AYNI kuralla döner; kronolojik bölümler
 * sekmede modülün kendi bileşenleriyle (useChronoView) sınırlanır.
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
      { ok: false, code: "NUMEROLOGY_FORBIDDEN", error: "Numeroloji analizi için Numeroloji modülü yetkisi gerekir." },
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
  if (error) return serverErrorResponse({ route: "clients/[id]/numerology-analysis", action: "GET-read-client", tenantId, cause: error });
  if (!client) return NextResponse.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404, headers: NO_STORE });

  const futureYears = canSeeNumerologyFutureYears(guard.profile);
  const r = await ensureClientNumerologyAnalysis(db, tenantId, client, { persist: guard.is_demo_account !== true });
  if (r.status === "missing_birth" || r.status === "missing_name") {
    return NextResponse.json({ ok: true, status: r.status, futureYears }, { headers: NO_STORE });
  }
  if (r.status === "unavailable") {
    return NextResponse.json({ ok: false, code: "NUMEROLOGY_LINK_UNAVAILABLE", error: "Numeroloji danışan bağlantısı şu anda kullanılamıyor." }, { status: 503, headers: NO_STORE });
  }
  if (r.status === "error") {
    return serverErrorResponse({ route: "clients/[id]/numerology-analysis", action: "GET-ensure", tenantId, cause: new Error("numerology_auto_ensure") });
  }
  return NextResponse.json({ ok: true, status: "ok", futureYears, record: r.record, created: r.created }, { headers: NO_STORE });
}
