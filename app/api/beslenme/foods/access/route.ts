import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeFoodContributor } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/**
 * Manuel/CUSTOM besin KATKI (WRITE) erişim probe'u (server-authoritative). "Besinlerim" sayfası
 * + dashboard/nav girişi bunu çağırır. Geçer: owner (super-admin) VEYA TAM Beslenme modülü
 * (module_permissions.beslenme=true; admin dahil) VEYA dar bayrak (beslenme_manual_food===true).
 * `clients` (Danışan Yolculuğu) izni TEK BAŞINA GEÇMEZ → clients-only uzman 403 (besin OKUMA
 * ayrı: requireBeslenmeFoodRead). Aksi → 401/403 (fail-closed). UI gizleme tek katman DEĞİLDİR;
 * asıl kapı server guard'dır (bkz. requireBeslenmeFoodContributor).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeFoodContributor(req);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { ok: true, authority: guard.authority },
    { headers: { "Cache-Control": "no-store" } },
  );
}
