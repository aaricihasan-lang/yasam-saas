import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { buildBackupPlan } from "@/lib/backup/service";

export const runtime = "nodejs";

/**
 * GET /api/settings/backup — Yedek PLANI (v3.0).
 *
 * FA-01: Eski tek-yanıt yedek (`.limit(2000)`, hata yutma, 4.5 MB riski) kaldırıldı. Artık istemci
 * bu planı alır, her tablo için `GET /api/settings/backup/table` ile BOŞ sayfa gelene kadar okur ve
 * dosyayı kendisi birleştirir (lib/backup/client.ts). Tablo listesi registry'den (lib/backup/registry.ts).
 *
 * Üyelik kapısı YOK (bilinçli): üyeliği biten uzman da kendi verisini dışa aktarabilir.
 * Kimlik: x-user-id + x-session-token (verifyUserRequest). tenant yalnız oturumdan.
 */
export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }
  return NextResponse.json(buildBackupPlan(guard.tenantId), {
    headers: { "Cache-Control": "no-store" },
  });
}
