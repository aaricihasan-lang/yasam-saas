import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";

export const runtime = "nodejs";

/**
 * GET /api/numeroloji/entitlements — Numeroloji alt-yetkileri (yalnız okuma).
 *
 * Sıra: oturum (401) → numerology modülü (403) → alt-yetkiler SUNUCUDA, doğrulanmış profilden
 * (users.module_permissions) çözülür. İstemci localStorage'daki izin haritası burada yetki
 * sayılmaz; ekran bu yanıtla karar verir (yanıt gelene kadar / hata olursa KAPALI).
 * `futureYears`: module_permissions.numerology_future_years (admin her zaman).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { ok: true, futureYears: canSeeNumerologyFutureYears(guard.profile) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
