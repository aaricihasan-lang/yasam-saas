import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { parseListParams, isUuid } from "@/lib/aromaterapi/service/readValidation";
import {
  readFail,
  readListOk,
  readNotFound,
  readServerError,
} from "@/lib/aromaterapi/service/readErrors";
import { listKnowledgeAudit } from "@/lib/aromaterapi/service/claimReads";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/aromaterapi/claims/[id]/audit — Bilgi Kaydı Değişiklik Geçmişi.
 * SALT-OKUNUR (audit tablosuna mutation YOK). Bilgi Kaydı başka tenant'a aitse
 * 404 döner (varlık sızdırmaz). page/limit desteklenir.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  const url = new URL(req.url);
  const parsed = parseListParams(url.searchParams, {
    sorts: { occurred: { column: "occurred_at", ascending: false } },
  });
  if (!parsed.ok) return readFail(parsed.code);

  try {
    const result = await listKnowledgeAudit(guard.db, guard.tenantId, id, parsed.value);
    if (!result) return readNotFound();
    return readListOk(result.rows, parsed.value.page, parsed.value.limit, result.total);
  } catch (e) {
    return readServerError("claims:audit", e);
  }
}
