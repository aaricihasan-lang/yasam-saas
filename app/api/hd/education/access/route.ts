import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, requireEducationViewer } from "@/lib/human-design/education/educationAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hd/education/access — Hazır Eğitim Haritaları görünürlük yoklaması.
 * Yalnız owner'ın kişi bazında yetki verdiği eğitmene 200; diğer HERKESE (admin, owner, demo, yetkisiz uzman,
 * oturumsuz) aynı 404. Arayüz kartı yalnız 200'de çizilir. Kart metni de burada (istemci paketinde sabit değil).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireEducationViewer(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    { ok: true, visible: true, card: { title: "Hazır Eğitim Haritaları", desc: "Belgeli doğum verisiyle hazırlanmış eğitim örnekleri" } },
    { headers: EDU_NO_STORE },
  );
}
