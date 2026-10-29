import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PRIV_NO_STORE, requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hd/education/private/access — "Bana Özel Eğitim Haritaları" görünürlük yoklaması.
 * Yalnız owner'ın özel arşiv yetkisi verdiği (arşiv anahtarı açıkken) eğitmene ve owner'ın kendisine 200; diğer herkese aynı 404.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ ok: true, visible: true, actor: gate.ctx.kind }, { headers: PRIV_NO_STORE });
}
