import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, eduNotFound, requireEducationViewer } from "@/lib/human-design/education/educationAccess";
import { parseBioLang } from "@/lib/human-design/education/biography/biographyContract";
import { getTrainerBiography } from "@/lib/human-design/education/biography/biographyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/hd/education/charts/[id]/biography?lang=tr|en — FAZ 10 "Hayat Hikâyesi".
 * Yetkili eğitmen + kişi OKUMA ANINDA yayımlı → yayımlı biyografi (yoksa biography=null + mevcut diller).
 * Diğer her durum (yetki kapalı, taslak harita, tahmin edilen id) → tek tip 404. Sunucu kaynak bağlantılarını indirmez.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationViewer(req);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await context.params;
    const lang = parseBioLang(req.nextUrl.searchParams.get("lang") ?? "tr");
    if (!lang) return eduNotFound();
    const data = await getTrainerBiography(gate.ctx.db, String(id ?? ""), lang);
    if (!data) return eduNotFound();
    return NextResponse.json({ ok: true, ...data }, { headers: EDU_NO_STORE });
  } catch {
    return eduNotFound();
  }
}
