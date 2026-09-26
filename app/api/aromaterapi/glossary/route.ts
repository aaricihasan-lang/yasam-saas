import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { parseListParams } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import { listGlossaryTerms, GLOSSARY_STATUS } from "@/lib/aromaterapi/service/glossaryReads";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import {
  pickWritableGlossaryFields,
  glossaryRequiredOk,
} from "@/lib/aromaterapi/glossaryFields";

export const runtime = "nodejs";

const GLOSSARY_BODY_LIMIT = 32 * 1024;

/** Hafif yazma hata sözleşmesi (Kaynaklar RPC değil; oils deseniyle aynı). */
function writeFail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * GET /api/aromaterapi/glossary — Sözlük terimleri tenant-scoped listesi.
 * NOT: ayrı `language` kolonu şemada YOK (TR/EN ayrı kolonlar) → language filtresi
 * uygulanmaz; arama TR/EN terim + kısa tanım üzerinde çalışır.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
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

/**
 * POST /api/aromaterapi/glossary — Sözlük terimi CREATE (tenant-scoped, hafif yazma).
 *
 * Güvenlik: requireModuleAccess → tenant/actor YALNIZ oturumdan; body'den tenant_id/id
 * ASLA kabul edilmez (whitelist düşürür). Demo → no-op. Aynı tenant'ta yinelenen kanonik
 * terim → 23505 → AROMA_UNIQUE_VIOLATION (409). Ham DB metni sızmaz.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const bodyRes = await readJsonBounded(req, GLOSSARY_BODY_LIMIT);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large"
      ? writeFail("AROMA_WRITE_PAYLOAD_TOO_LARGE", 413)
      : writeFail("AROMA_WRITE_INVALID_BODY", 400);
  }

  const fields = pickWritableGlossaryFields(bodyRes.value);
  if (!glossaryRequiredOk(fields, false)) {
    return writeFail("AROMA_WRITE_INVALID_BODY", 400);
  }

  if (guard.is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await guard.db
    .from("aromatherapy_glossary_terms")
    .insert({ ...fields, tenant_id: guard.tenantId })
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return writeFail("AROMA_UNIQUE_VIOLATION", 409);
    }
    console.error("[aromaterapi:glossary:create]", (error as { message?: unknown })?.message);
    return writeFail("AROMA_WRITE_FAILED", 500);
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
