import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, requireEducationOwner } from "@/lib/human-design/education/educationAccess";
import { listInventory } from "@/lib/human-design/education/educationStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/hd/education/subjects — YALNIZ platform owner: 43 kişilik envanter (salt-okunur). Diğer herkes: 404. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  try {
    const data = await listInventory(gate.ctx.db);
    return NextResponse.json({ ok: true, data }, { headers: EDU_NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "Envanter okunamadı." }, { status: 500, headers: EDU_NO_STORE });
  }
}
