/** KM-3 — ücretsiz kampanya analizi (herkese açık; kota DB'de; ortam kapısı kapalıyken 404). İşleyici: lib/campaign/visitor/handlers.ts */
import type { NextRequest } from "next/server";
import { handleVisitorAnalysis } from "@/lib/campaign/visitor/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return handleVisitorAnalysis(req);
}
