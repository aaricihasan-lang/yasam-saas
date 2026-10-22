import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, eduNotFound, requireEducationViewer } from "@/lib/human-design/education/educationAccess";
import { getPublishedDetail } from "@/lib/human-design/education/educationStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/hd/education/charts/[id] — yetkili eğitmen + yayımlı (okuma anında hâlâ uygun) kayıt: kişi + kaynak + UTC +
 * KAYITLI doğrulanmış snapshot. Sağlayıcı çağrısı / yeniden hesap / danışan kaydı YOK. Aksi hâlde (tahmin edilen id dahil) 404.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationViewer(req);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await context.params;
    const item = await getPublishedDetail(gate.ctx.db, String(id ?? ""));
    if (!item) return eduNotFound();
    return NextResponse.json({ ok: true, item }, { headers: EDU_NO_STORE });
  } catch {
    return eduNotFound();
  }
}
