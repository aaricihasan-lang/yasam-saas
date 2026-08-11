import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getCanonicalEvidencePool } from "@/lib/human-design/consultation/admin/consultationAdminService";
import {
  httpStatusForConsultationError,
  messageForConsultationError,
} from "@/lib/human-design/consultation/admin/consultationErrorHttp";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET ?entityId=<uuid> → seçili entity'nin canonical içeriğine bağlı evidence/
 * passage aday havuzu (read-only). entity-scoped; cross-entity aday sızıntısı yok.
 * Effective rights F0B resolver ile; tam kaynak metni taşınmaz; unknown → deny.
 * Yalnız verifyAdminRequest; service_role SELECT (yeni yazma yolu YOK).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const entityId = req.nextUrl.searchParams.get("entityId")?.trim();
  if (!entityId) return NextResponse.json({ ok: false, error: "entityId gerekli." }, { status: 400, headers: NO_STORE });

  const r = await getCanonicalEvidencePool(guard.db, entityId);
  if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
  return NextResponse.json({ ok: true, pool: r.data, count: r.data.candidates.length }, { headers: NO_STORE });
}
