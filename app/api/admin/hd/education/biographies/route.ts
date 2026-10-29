import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, requireEducationOwner } from "@/lib/human-design/education/educationAccess";
import { listBiographyStatus } from "@/lib/human-design/education/biography/biographyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/hd/education/biographies — YALNIZ platform owner: kişi bazında doğum verisi / HD hesap / Hayat Hikâyesi / yayın aşamaları. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  try {
    const rows = await listBiographyStatus(gate.ctx.db);
    return NextResponse.json({ ok: true, data: { rows } }, { headers: EDU_NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "Hayat hikâyesi durumları okunamadı." }, { status: 500, headers: EDU_NO_STORE });
  }
}
