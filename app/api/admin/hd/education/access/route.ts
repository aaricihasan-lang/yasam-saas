import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, requireEducationOwner } from "@/lib/human-design/education/educationAccess";
import { EduStoreError, grantAccess, listAccessOverview, revokeAccess } from "@/lib/human-design/education/educationStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERR: Record<string, [number, string]> = {
  INVALID_TARGET: [400, "Geçersiz kullanıcı."],
  ED003: [400, "Kendinize erişim veremezsiniz."],
  ED005: [409, "Bu hesaba erişim verilemez (aktif, onaylı, demo olmayan, Human Design izinli uzman olmalı)."],
  ED006: [409, "Bu uzmanın etkin erişimi zaten var."],
  ED008: [409, "Bu uzmanın etkin erişimi yok."],
  ED004: [404, "Kullanıcı bulunamadı."],
};
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: EDU_NO_STORE });

/** GET /api/admin/hd/education/access?q= — YALNIZ platform owner: uzmanlar, etkin yetkiler, değişiklik geçmişi. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const data = await listAccessOverview(gate.ctx.db, q);
    return NextResponse.json({ ok: true, data }, { headers: EDU_NO_STORE });
  } catch {
    return fail(500, "Erişim listesi okunamadı.");
  }
}

/**
 * POST /api/admin/hd/education/access — { action: "grant" | "revoke", userId, note? }
 * Aktör = oturum token'ıyla doğrulanmış owner (gövdeden aktör ALINMAZ). DB RPC aktörü yeniden doğrular.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return fail(413, "İstek çok büyük.");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Geçerli JSON gövdesi gerekli.");
  }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = b.action;
  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  const note = typeof b.note === "string" ? b.note : null;
  if (action !== "grant" && action !== "revoke") return fail(400, "Geçersiz işlem.");
  try {
    if (action === "grant") await grantAccess(gate.ctx.db, gate.ctx.ownerId, userId, note);
    else await revokeAccess(gate.ctx.db, gate.ctx.ownerId, userId);
    return NextResponse.json({ ok: true }, { headers: EDU_NO_STORE });
  } catch (e) {
    const code = e instanceof EduStoreError ? e.code : "DB_ERROR";
    const [status, msg] = ERR[code] ?? [500, "İşlem tamamlanamadı."];
    return fail(status, msg);
  }
}
