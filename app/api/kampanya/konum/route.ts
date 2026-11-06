/** KM-3 — ziyaretçi formu konum araması (yerel veri; dış API yok; ortam kapısı kapalıyken 404). */
import type { NextRequest } from "next/server";
import { handleLocationSearch } from "@/lib/campaign/visitor/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handleLocationSearch(req);
}
