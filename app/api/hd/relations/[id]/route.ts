import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { deleteRelationAnalysis, getRelationAnalysis } from "@/lib/human-design/relations/relationService";

export const runtime = "nodejs";

/**
 * GET    /api/hd/relations/:id — kayıtlı ilişki/grup analizi (Roxy çağrısı YOK; ham sağlayıcı yanıtı dönmez).
 * DELETE /api/hd/relations/:id — YALNIZ bu analiz (+ katılımcı bağları). Danışanlar ve bireysel
 *        BodyGraph analizleri SİLİNMEZ. Başka tenant'ın analizi → 404.
 */
type RouteContext = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const r = await getRelationAnalysis({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, id);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const r = await deleteRelationAnalysis({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account }, id);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
