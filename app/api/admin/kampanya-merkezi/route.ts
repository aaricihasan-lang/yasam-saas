/** KAMPANYA MERKEZİ — Owner yönetim API'si (YALNIZ Owner; public DEĞİL). İşleyiciler: lib/campaign/ownerHandlers.ts */
import type { NextRequest } from "next/server";
import { handleCampaignGet, handleCampaignPost } from "@/lib/campaign/ownerHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handleCampaignGet(req);
}

export function POST(req: NextRequest) {
  return handleCampaignPost(req);
}
