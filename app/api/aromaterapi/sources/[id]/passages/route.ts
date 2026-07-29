import { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseListParams, isUuid } from "@/lib/aromaterapi/service/readValidation";
import { READ_MAX_Q_LEN } from "@/lib/aromaterapi/readTypes";
import {
  readFail,
  readListOk,
  readNotFound,
  readServerError,
} from "@/lib/aromaterapi/service/readErrors";
import { listSourcePassages } from "@/lib/aromaterapi/service/sourceReads";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/aromaterapi/sources/[id]/passages — Kaynağa bağlı pasaj listesi.
 * Kaynak aynı tenant'ta yoksa 404. Opsiyonel `language` (original_lang) eşitliği.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  const url = new URL(req.url);
  const parsed = parseListParams(url.searchParams, {
    sorts: { sort: { column: "sort_key", ascending: true } },
  });
  if (!parsed.ok) return readFail(parsed.code);

  // language — serbest dil etiketi; yalnız biçim/uzunluk doğrulaması.
  let language: string | null = null;
  const langRaw = url.searchParams.get("language");
  if (langRaw !== null && langRaw.trim() !== "") {
    const l = langRaw.trim();
    if (l.length > READ_MAX_Q_LEN || !/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(l)) {
      return readFail("AROMA_INVALID_FILTER");
    }
    language = l;
  }

  try {
    const result = await listSourcePassages(guard.db, guard.tenantId, id, parsed.value, language);
    if (!result) return readNotFound();
    return readListOk(result.rows, parsed.value.page, parsed.value.limit, result.total);
  } catch (e) {
    return readServerError("sources:passages", e);
  }
}
