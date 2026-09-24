import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { isUuid, docxResponse } from "@/lib/aromaterapi/report/request";
import { buildSourcesDoc } from "@/lib/aromaterapi/report/builders";

export const runtime = "nodejs";
// GÜVENLİK BANDI (ARO-010): kesin platform süre tavanı ÖLÇÜLMEDİ; konservatif üst sınır.
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // Maliyet-abuse koruması (ARO-010): DOCX üretimi pahalıdır; tenant başına dakikada makul
  // sayıda export'a izin ver, art arda burst'ü kes. Anahtar DAİMA oturumdan doğrulanmış
  // tenant (guard.tenantId) — body/query/header'dan ASLA. Kontrol guard'dan SONRA: başarısız
  // kimlik kotayı TÜKETMEZ. In-memory/instance-başına (lib/rateLimit.ts): best-effort, global/
  // atomik DEĞİL; kesin koruma sabit kayıt tavanıdır.
  const rl = checkRateLimit(`aromaterapi-word:${guard.tenantId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }
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
