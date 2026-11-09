import type { NextRequest } from "next/server";
import { handleArchiveClients } from "@/lib/archive/server/handlers";
import { runArchiveRoute } from "@/lib/archive/server/http";

export const runtime = "nodejs";

/** POST /api/settings/archive/clients — arşiv danışan seçicisi (ad / soyad araması; tenant içi; en fazla 50 sonuç). */
export async function POST(req: NextRequest): Promise<Response> {
  return runArchiveRoute(req, "archive-clients", 120, (ctx, body) => handleArchiveClients(ctx, body));
}
