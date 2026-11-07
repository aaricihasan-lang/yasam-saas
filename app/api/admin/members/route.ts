import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { rpcErrorStatus } from "@/lib/admin/memberRequestValidation";
import {
  memberV2RpcArgs,
  parseMemberV2Counts,
  parseMemberV2Decisions,
  parseMemberV2Presets,
  parseMemberV2Query,
  MEMBER_V2_PAGE_SIZE,
} from "@/lib/admin/memberListV2";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * GET /api/admin/members — Üye listesi V2 (Aşama 2; YALNIZ OKUMA).
 * Query: f (hazır filtre) · q · sort(attn|new|login|name) · mod (modül) · pay(all|check|paid|pending|overdue|exempt)
 *        · rol(expert|admin) · page
 * Yetki: mevcut üye listesiyle aynı (aktif admin) — route'ta verifyAdminRequest, DB'de aktör yeniden doğrulanır.
 * Satırlar + sayaçlar + hazır filtre sayıları + karar bekleyenler TEK RPC'den (admin_list_members_v2).
 * Eski /api/admin/users (admin_list_users) değişmez.
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  const parsed = parseMemberV2Query(req.nextUrl.searchParams);
  if (!parsed.ok) return bad(parsed.error);
  const q = parsed.value;

  const { data, error } = await db.rpc("admin_list_members_v2", memberV2RpcArgs(adminId, q));
  if (error) {
    const st = rpcErrorStatus(error);
    if ((error as { code?: string }).code === "UY401") return bad("Yetkisiz.", 403);
    return bad(st === 400 ? "Geçersiz filtre." : "Üye listesi okunamadı.", st === 400 ? 400 : 500);
  }
  const r = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(r.rows) ? r.rows : [];
  return NextResponse.json(
    {
      ok: true,
      rows,
      total: Math.max(0, Math.trunc(Number(r.total) || 0)),
      page: q.page,
      pageSize: MEMBER_V2_PAGE_SIZE,
      presets: parseMemberV2Presets(r.presets),
      counts: parseMemberV2Counts(r.counts),
      decisions: parseMemberV2Decisions(r.decisions),
      today: typeof r.today === "string" ? r.today : null,
      serverNow: typeof r.server_now === "string" ? r.server_now : null,
    },
    { headers: NO_STORE },
  );
}
