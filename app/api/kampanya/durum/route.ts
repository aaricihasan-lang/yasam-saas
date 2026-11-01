/** KM-3 — ziyaretçi kampanya durumu (herkese açık alanlar + kalan kontenjan; ortam kapısı kapalıyken 404). */
import type { NextRequest } from "next/server";
import { handleVisitorState } from "@/lib/campaign/visitor/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handleVisitorState(req);
}
