import { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseListParams } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { listGlossaryTerms, GLOSSARY_STATUS } from "@/lib/aromaterapi/service/glossaryReads";

export const runtime = "nodejs";

/**
 * GET /api/aromaterapi/glossary — Sözlük terimleri tenant-scoped listesi.
 * NOT: ayrı `language` kolonu şemada YOK (TR/EN ayrı kolonlar) → language filtresi
 * uygulanmaz; arama TR/EN terim + kısa tanım üzerinde çalışır.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const parsed = parseListParams(url.searchParams, {
    sorts: {
      term: { column: "canonical_term_tr", ascending: true },
      updated: { column: "updated_at", ascending: false },
    },
    filters: {
      status: { column: "status", allow: GLOSSARY_STATUS },
    },
  });
  if (!parsed.ok) return readFail(parsed.code);

  try {
    const { rows, total } = await listGlossaryTerms(guard.db, guard.tenantId, parsed.value);
    return readListOk(rows, parsed.value.page, parsed.value.limit, total);
  } catch (e) {
    return readServerError("glossary:list", e);
  }
}
