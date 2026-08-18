import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseExportBody, docxResponse } from "@/lib/aromaterapi/report/request";
import { MAX_EXPORT_BODY_BYTES, OIL_TYPE_ORDER } from "@/lib/aromaterapi/report/theme";
import { buildOilsCatalogDoc } from "@/lib/aromaterapi/report/builders";
import type { ExportSelector } from "@/lib/aromaterapi/report/reads";

export const runtime = "nodejs";

/**
 * POST /api/aromaterapi/oils/word-report — seçili/tüm/typed yağ kataloğu (.docx).
 * Body: { mode:"selected", ids:[...] } | { mode:"all", oilType?:"essential"|... }.
 * tenant oturumdan; selected ids server'da tenant-scope ile yeniden doğrulanır.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_EXPORT_BODY_BYTES) return NextResponse.json({ ok: false, error: "İstek gövdesi çok büyük." }, { status: 413 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const parsed = parseExportBody(body, { oilTypeAllow: OIL_TYPE_ORDER });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  const sel: ExportSelector = parsed.mode === "selected"
    ? { mode: "selected", ids: parsed.ids }
    : { mode: "all", oilType: parsed.oilType };

  const res = await buildOilsCatalogDoc(db, tenantId, sel, { expertName: null, date: new Date() });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return docxResponse(res.buffer, res.filename);
}
