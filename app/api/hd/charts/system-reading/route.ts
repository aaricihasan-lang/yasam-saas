import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getChartSystemReading } from "@/lib/human-design/api/systemReadingService";

export const runtime = "nodejs";

/**
 * GET /api/hd/charts/system-reading?id=<chartId> — Human Design "Sistem Yorumu" (salt-okunur).
 *
 * Sıra: oturum (401) → human_design modülü (403) → hd_system_reading alt-yetkisi (403; admin geçer)
 *       → tenant-scoped kayıt (başka tenant = 404, varlık sızdırılmaz) → computed + roxyapi +
 *       provider_raw → sunucuda whitelist çıkarıcı → yalnız güvenli DTO.
 *
 *   - RoxyAPI ÇAĞRILMAZ: kaynak, ilk hesapta saklanan provider_raw. Kayıt yoksa / Roxy değilse
 *     sağlayıcıya geri dönüş çağrısı YAPILMAZ → { available: false }.
 *   - Ham provider_raw, API anahtarı, doğum/konum verisi yanıta GİRMEZ. Yanıt no-store.
 *   - Uzmanın Bilgi Bankası ile ilgisizdir (hiçbir yere yazmaz, hiçbir içerikle birleşmez).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  if (!hasModulePermissionForProfile(guard.profile, "hd_system_reading")) {
    return NextResponse.json(
      { ok: false, code: "SYSTEM_READING_DENIED", error: "Sistem Yorumu bu hesap için açık değil." },
      { status: 403, headers: NO_STORE },
    );
  }

  const id = new URL(req.url).searchParams.get("id");
  const result = await getChartSystemReading(guard.db, guard.tenantId, id);
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}
