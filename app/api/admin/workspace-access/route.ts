import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { serverErrorResponse } from "@/lib/http/apiError";
import { grantAccess, listGrants, revokeAccess } from "@/lib/workspace/access";
import { onlyKeys, readJson } from "@/lib/workspace/http";
import { UUID_RE } from "@/lib/workspace/schema";

export const runtime = "nodejs";

/**
 * Kişisel Dijital Ofis — kullanıcı bazlı açılış izin listesi (YALNIZ OWNER).
 * GET  → izin kayıtları (etkin + geri alınmış; denetim izi).
 * POST → { action: "grant", userId, note? } | { action: "revoke", userId }
 * Yetki: verifyAdminRequest (admin oturumu) + requireMainAdmin (users.is_super_admin). Diğer adminler 403.
 * Kayıt silinmez; geri alma revoked_at / revoked_by / revoke_reason ile tutulur (granted_by / revoked_by = Owner).
 */
const ROUTE = "api/admin/workspace-access";
const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

async function ownerGuard(req: NextRequest) {
  const g = await verifyAdminRequest(req);
  if (!g.ok) return { ok: false as const, response: g.response };
  const main = await requireMainAdmin(g.db, g.adminId);
  if (!main.ok) return { ok: false as const, response: json({ ok: false, error: main.error }, main.status) };
  return { ok: true as const, db: g.db, adminId: g.adminId };
}

export async function GET(req: NextRequest): Promise<Response> {
  const g = await ownerGuard(req);
  if (!g.ok) return g.response;
  const r = await listGrants(g.db);
  if (!r.ok) return serverErrorResponse({ route: ROUTE, action: "list", cause: r.cause });
  return json({ ok: true, grants: r.grants });
}

export async function POST(req: NextRequest): Promise<Response> {
  const g = await ownerGuard(req);
  if (!g.ok) return g.response;
  const b = await readJson(req);
  if (!b.ok) return b.response;
  const extra = onlyKeys(b.body, ["action", "userId", "note"]);
  if (extra) return json({ ok: false, error: "Bilinmeyen alan.", path: extra }, 400);
  const { action, userId, note } = b.body;
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return json({ ok: false, error: "Geçersiz kullanıcı." }, 400);
  if (action === "grant") {
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) return json({ ok: false, error: "Not en fazla 500 karakter." }, 400);
    const r = await grantAccess(g.db, g.adminId, userId, typeof note === "string" && note.trim() ? note.trim() : null);
    if (r.ok) return json({ ok: true, grant: r.grant });
    if (r.status === 500) return serverErrorResponse({ route: ROUTE, action: "grant", cause: r.cause });
    return json({ ok: false, error: r.error }, r.status);
  }
  if (action === "revoke") {
    if (note !== undefined) return json({ ok: false, error: "Geri almada not alanı kullanılmaz." }, 400);
    const r = await revokeAccess(g.db, g.adminId, userId, "owner_revoked");
    if (r.ok) return json({ ok: true, grant: r.grant });
    if (r.status === 500) return serverErrorResponse({ route: ROUTE, action: "revoke", cause: r.cause });
    return json({ ok: false, error: r.error }, r.status);
  }
  return json({ ok: false, error: "Geçersiz işlem (grant | revoke)." }, 400);
}
