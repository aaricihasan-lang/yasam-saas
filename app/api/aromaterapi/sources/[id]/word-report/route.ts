import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid, docxResponse } from "@/lib/aromaterapi/report/request";
import { buildSourcesDoc } from "@/lib/aromaterapi/report/builders";

export const runtime = "nodejs";
// GÜVENLİK BANDI (ARO-010): kesin platform süre tavanı ÖLÇÜLMEDİ; konservatif üst sınır.
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const params = await ctx.params;
  const id = (params.id ?? "").trim();
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  try {
    const res = await buildSourcesDoc(db, tenantId, { mode: "selected", ids: [id] }, { expertName: null, date: new Date() });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    return docxResponse(res.buffer, res.filename);
  } catch {
    return NextResponse.json({ ok: false, error: "Rapor oluşturulamadı." }, { status: 500 });
  }
}
