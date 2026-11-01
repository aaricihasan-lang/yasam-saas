import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { listAssets } from "@/lib/workspace/assets";
import { guardWorkspace, json } from "@/lib/workspace/http";

export const runtime = "nodejs";

/**
 * GET /api/settings/workspace/assets — uzmanın KENDİ etkin görselleri (assetId + varyant boyutları + okuma URL'si).
 * Storage yolu döndürülmez. Bayrak / açılış listesi dışı → 404.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const g = await guardWorkspace(req, "read");
  if (!g.ok) return g.response;
  const r = await listAssets(g.db, g.owner);
  if (!r.ok) return serverErrorResponse({ route: "api/settings/workspace/assets", action: "list", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: true, assets: r.assets });
}
