/** Gece operasyonu — kampanya istatistik olayı (toplu sayaç; kişisel veri yok; ortam kapısı kapalıyken 404). */
import type { NextRequest } from "next/server";
import { handleVisitorEvent } from "@/lib/campaign/visitor/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return handleVisitorEvent(req);
}
