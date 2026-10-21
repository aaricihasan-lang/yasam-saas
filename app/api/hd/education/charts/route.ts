import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, eduNotFound, requireEducationViewer } from "@/lib/human-design/education/educationAccess";
import { listPublishedCards } from "@/lib/human-design/education/educationStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hd/education/charts — yetkili eğitmen: YALNIZ yayımlı kayıtlar. Diğer herkes: 404. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireEducationViewer(req);
  if (!gate.ok) return gate.response;
  try {
    const items = await listPublishedCards(gate.ctx.db);
    return NextResponse.json({ ok: true, items }, { headers: EDU_NO_STORE });
  } catch {
    return eduNotFound();
  }
}
