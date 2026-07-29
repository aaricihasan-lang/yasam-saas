import { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseListParams } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { listSources, SOURCE_STATUS, SOURCE_TYPES } from "@/lib/aromaterapi/service/sourceReads";

export const runtime = "nodejs";

/**
 * GET /api/aromaterapi/sources — Kaynak tenant-scoped listesi (+ pasaj sayısı).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const parsed = parseListParams(url.searchParams, {
    sorts: {
      title: { column: "title", ascending: true },
      year: { column: "publication_year", ascending: false },
      updated: { column: "updated_at", ascending: false },
    },
    filters: {
      source_type: { column: "source_type", allow: SOURCE_TYPES },
      status: { column: "status", allow: SOURCE_STATUS },
    },
    yearFilter: { column: "publication_year" },
  });
  if (!parsed.ok) return readFail(parsed.code);

  try {
    const { rows, total } = await listSources(guard.db, guard.tenantId, parsed.value);
    return readListOk(rows, parsed.value.page, parsed.value.limit, total);
  } catch (e) {
    return readServerError("sources:list", e);
  }
}
