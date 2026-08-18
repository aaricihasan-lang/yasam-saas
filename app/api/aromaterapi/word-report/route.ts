import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { parseExportBody, docxResponse } from "@/lib/aromaterapi/report/request";
import { MAX_EXPORT_BODY_BYTES } from "@/lib/aromaterapi/report/theme";
import { buildGeneralDoc, GENERAL_SECTIONS } from "@/lib/aromaterapi/report/builders";

export const runtime = "nodejs";

/**
 * POST /api/aromaterapi/word-report — GENEL Aromaterapi raporu (.docx).
 * Body opsiyonel: { sections?: [...allowlist] } (verilmezse tüm izinli bölümler).
 * tenant'ın TÜM export-eligible aktif kaydını tek DOCX'te toplar; boş bölüm başlık üretmez.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_EXPORT_BODY_BYTES) return NextResponse.json({ ok: false, error: "İstek gövdesi çok büyük." }, { status: 413 });

  let body: unknown = {};
  try { body = (await req.json()) ?? {}; } catch { body = {}; }
  // Genel rapor mode gerektirmez; yalnız opsiyonel sections. Varsayılan mode=all enjekte edilir.
  const parsed = parseExportBody({ ...(body as object), mode: "all" }, { sectionAllow: GENERAL_SECTIONS });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  const res = await buildGeneralDoc(db, tenantId, parsed.sections, { expertName: null, date: new Date() });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return docxResponse(res.buffer, res.filename);
}
