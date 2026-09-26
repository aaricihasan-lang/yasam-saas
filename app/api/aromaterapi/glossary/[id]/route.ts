import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail } from "@/lib/aromaterapi/service/readErrors";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import {
  pickWritableGlossaryFields,
  glossaryRequiredOk,
} from "@/lib/aromaterapi/glossaryFields";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const GLOSSARY_BODY_LIMIT = 32 * 1024;

function writeFail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * PATCH /api/aromaterapi/glossary/[id] — Sözlük terimi kısmi güncelleme (tenant-scoped).
 * Yalnız gövdede bulunan yazılabilir alanlar değişir. Kayıt caller tenant'ında yoksa 404.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  const bodyRes = await readJsonBounded(req, GLOSSARY_BODY_LIMIT);
  if (!bodyRes.ok) {
    return bodyRes.reason === "too_large"
      ? writeFail("AROMA_WRITE_PAYLOAD_TOO_LARGE", 413)
      : writeFail("AROMA_WRITE_INVALID_BODY", 400);
  }

  const fields = pickWritableGlossaryFields(bodyRes.value, { partial: true });
  if (Object.keys(fields).length === 0) return writeFail("AROMA_WRITE_INVALID_BODY", 400);
  if (!glossaryRequiredOk(fields, true)) return writeFail("AROMA_WRITE_INVALID_BODY", 400);

  if (guard.is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await guard.db
    .from("aromatherapy_glossary_terms")
    .update(fields)
    .eq("tenant_id", guard.tenantId)
    .eq("id", id)
    .select("id");

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return writeFail("AROMA_UNIQUE_VIOLATION", 409);
    }
    console.error("[aromaterapi:glossary:update]", (error as { message?: unknown })?.message);
    return writeFail("AROMA_WRITE_FAILED", 500);
  }
  if (!data || data.length === 0) return writeFail("AROMA_NOT_FOUND", 404);
  return NextResponse.json({ ok: true, id });
}

/**
 * DELETE /api/aromaterapi/glossary/[id] — Sözlük terimi kalıcı silme (tenant-scoped).
 * Sözlük terimi uzmanın kendi hafif verisidir; onaylı silme UI'dan gelir. Kayıt caller
 * tenant'ında yoksa 404 (varlık sızdırmaz).
 */
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return readFail("AROMA_INVALID_UUID");

  if (guard.is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await guard.db
    .from("aromatherapy_glossary_terms")
    .delete()
    .eq("tenant_id", guard.tenantId)
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[aromaterapi:glossary:delete]", (error as { message?: unknown })?.message);
    return writeFail("AROMA_WRITE_FAILED", 500);
  }
  if (!data || data.length === 0) return writeFail("AROMA_NOT_FOUND", 404);
  return NextResponse.json({ ok: true, id });
}
