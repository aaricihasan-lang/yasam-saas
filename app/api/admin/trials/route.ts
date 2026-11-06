import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const STATUSES = new Set(["all", "not_started", "active", "expired", "review", "suspended", "pro_request"]);
const PAGE_SIZE = 50;

/**
 * GET /api/admin/trials?status=&q=&page= — "Deneme Üyeleri" listesi (yalnız 7 günlük deneme rejimindeki
 * uzmanlar; Premium / özel hesaplar bu listede YOKTUR). Durum sayaçları, kalan süre için sunucu zamanı,
 * günlük Roxy tüketimi (TR günü) ve açık Pro talepleri tek RPC'de (admin_trial_list) döner.
 * Güvenlik: verifyAdminRequest → SECURITY DEFINER RPC (aktör DB'de yeniden doğrulanır).
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "all";
  if (!STATUSES.has(status)) return NextResponse.json({ ok: false, error: "Geçersiz durum filtresi." }, { status: 400, headers: NO_STORE });
  const q = (sp.get("q") ?? "").slice(0, 100);
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.get("page") ?? "1", 10) || 1));
  const { data, error } = await guard.db.rpc("admin_trial_list", {
    p_actor: guard.adminId,
    p_status: status,
    p_search: q,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error || !data) return NextResponse.json({ ok: false, error: "Deneme üyeleri okunamadı." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, pageSize: PAGE_SIZE, page, ...(data as Record<string, unknown>) }, { headers: NO_STORE });
}
