import type { NextRequest } from "next/server";
import { handleArchivePart } from "@/lib/archive/server/handlers";
import { runArchiveRoute } from "@/lib/archive/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settings/archive/part — tek arşiv parçası: kayıt dökümü Word bölümü, danışan dosyası, hazır rapor
 * (kayıtlı snapshot'tan; hesap / sağlayıcı çağrısı YOK) veya dosya için 60 sn geçerli imzalı bağlantı.
 * Body: `{ options, job, state? }` — iş, seçeneklerle ve oturumdaki tenant / uzmanla sunucuda yeniden doğrulanır.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return runArchiveRoute(req, "archive-part", 600, (ctx, body) => handleArchivePart(ctx, body));
}
