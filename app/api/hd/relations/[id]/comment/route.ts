import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { quotaCheck } from "@/lib/security/testQuotaExemption";
import { getRelationComment, updateRelationComment } from "@/lib/human-design/relations/relationExtras";

export const runtime = "nodejs";

/**
 * GET   /api/hd/relations/:id/comment — analizin Uzman Yorumu (tenant-scoped; başka hesabın analizi → 404).
 * PATCH /api/hd/relations/:id/comment — { text, expected_updated_at, confirm_clear? } · düz metin ≤ 10.000.
 *       İyimser eşzamanlılık (409); kayıtlı yorumu boşaltmak açık onay ister. Demo → 403. Roxy çağrısı YOK.
 */
type RouteContext = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const r = await getRelationComment({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, id);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const rl = await quotaCheck("hd-relation-comment", guard.userId, () => hitDbRateLimit(guard.db, rateLimitBucket("hd-relation-comment", guard.userId), 120, 60 * 60), { isDemo: guard.is_demo_account, tenantId: guard.tenantId });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Çok fazla kayıt isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec || 60) } },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const { id } = await ctx.params;
  const r = await updateRelationComment({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, id, raw);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
