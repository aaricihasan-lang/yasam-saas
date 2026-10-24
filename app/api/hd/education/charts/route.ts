import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, eduNotFound, requireEducationViewer } from "@/lib/human-design/education/educationAccess";
import { listPublishedCards } from "@/lib/human-design/education/educationStore";
import { listPublishedBioMeta } from "@/lib/human-design/education/biography/biographyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hd/education/charts — yetkili eğitmen: YALNIZ yayımlı kayıtlar. Diğer herkes: 404. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireEducationViewer(req);
  if (!gate.ok) return gate.response;
  try {
    const cards = await listPublishedCards(gate.ctx.db);
    // FAZ 10: yayımlı Hayat Hikâyesi varsa arama alanları (meslek / ülke / dönem). Biyografi okunamazsa katalog aynen döner.
    const meta = await listPublishedBioMeta(gate.ctx.db, cards.map((c) => c.id), "tr").catch(() => new Map());
    const items = cards.map((c) => ({ ...c, bio: meta.get(c.id) ?? null }));
    return NextResponse.json({ ok: true, items }, { headers: EDU_NO_STORE });
  } catch {
    return eduNotFound();
  }
}
