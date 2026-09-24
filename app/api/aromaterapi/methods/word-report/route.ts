import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { parseExportBody, docxResponse } from "@/lib/aromaterapi/report/request";
import { MAX_EXPORT_BODY_BYTES } from "@/lib/aromaterapi/report/theme";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { buildMethodsDoc } from "@/lib/aromaterapi/report/builders";
import type { ExportSelector } from "@/lib/aromaterapi/report/reads";

export const runtime = "nodejs";
// GÜVENLİK BANDI (ARO-010): kesin platform süre tavanı ÖLÇÜLMEDİ; konservatif üst sınır.
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<Response> {
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

  const bounded = await readJsonBounded(req, MAX_EXPORT_BODY_BYTES);
  if (!bounded.ok) {
    return bounded.reason === "too_large"
      ? NextResponse.json({ ok: false, error: "İstek gövdesi çok büyük." }, { status: 413 })
      : NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const parsed = parseExportBody(bounded.value);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  const sel: ExportSelector = parsed.mode === "selected" ? { mode: "selected", ids: parsed.ids } : { mode: "all" };
  try {
    const res = await buildMethodsDoc(db, tenantId, sel, { expertName: null, date: new Date() });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    return docxResponse(res.buffer, res.filename);
  } catch {
    return NextResponse.json({ ok: false, error: "Rapor oluşturulamadı." }, { status: 500 });
  }
}
