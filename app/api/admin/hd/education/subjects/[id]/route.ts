import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, eduNotFound, requireEducationOwner } from "@/lib/human-design/education/educationAccess";
import { EduManageError, applyOwnerAction, getOwnerSubjectDetail, parseOwnerAction } from "@/lib/human-design/education/educationManage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const fail = (status: number, error: string, code?: string) => NextResponse.json({ ok: false, error, code }, { status, headers: EDU_NO_STORE });

/** GET /api/admin/hd/education/subjects/[id] — YALNIZ platform owner: kişi ayrıntısı + hesap + yayın kontrol listesi + geçmiş. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await context.params;
    const data = await getOwnerSubjectDetail(gate.ctx.db, String(id ?? ""));
    if (!data) return eduNotFound();
    return NextResponse.json({ ok: true, data }, { headers: EDU_NO_STORE });
  } catch (e) {
    return e instanceof EduManageError ? fail(e.status, e.message, e.code) : fail(500, "Kayıt ayrıntısı okunamadı.");
  }
}

/**
 * POST /api/admin/hd/education/subjects/[id] — owner eylemi:
 * { action: "pilot" | "unpilot" | "verify_chart" | "legal_review" | "clear_blocker" | "verify_blocker" | "approve" | "publish" | "withdraw", ... }
 * Aktör = oturum token'ıyla doğrulanmış owner (gövdeden aktör ALINMAZ). DB tetikleyicileri her şartı yeniden uygular.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 8192) return fail(413, "İstek çok büyük.");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Geçerli JSON gövdesi gerekli.");
  }
  const action = parseOwnerAction(body);
  if (!action) return fail(400, "Geçersiz işlem veya eksik alan.");
  try {
    const { id } = await context.params;
    await applyOwnerAction(gate.ctx.db, gate.ctx.ownerId, String(id ?? ""), action);
    return NextResponse.json({ ok: true }, { headers: EDU_NO_STORE });
  } catch (e) {
    return e instanceof EduManageError ? fail(e.status, e.message, e.code) : fail(500, "İşlem tamamlanamadı.");
  }
}
