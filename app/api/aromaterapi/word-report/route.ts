import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { parseExportBody, docxResponse } from "@/lib/aromaterapi/report/request";
import { MAX_EXPORT_BODY_BYTES } from "@/lib/aromaterapi/report/theme";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { buildGeneralDoc, GENERAL_SECTIONS } from "@/lib/aromaterapi/report/builders";

export const runtime = "nodejs";
// GÜVENLİK BANDI (ARO-010): kesin platform süre tavanı ÖLÇÜLMEDİ; konservatif üst sınır.
export const maxDuration = 60;

/**
 * POST /api/aromaterapi/word-report — GENEL Aromaterapi raporu (.docx).
 * Body opsiyonel: { sections?: [...allowlist] } (verilmezse tüm izinli bölümler).
 * tenant'ın TÜM export-eligible aktif kaydını tek DOCX'te toplar; boş bölüm başlık üretmez.
 */
export async function POST(req: NextRequest): Promise<Response> {
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

  // Genel rapor gövdesi opsiyoneldir: boş/geçersiz JSON → {} (mode=all enjekte edilir).
  // Yalnız too_large fail-closed 413; parse hatası tolere edilir (mevcut davranış korunur).
  const bounded = await readJsonBounded(req, MAX_EXPORT_BODY_BYTES);
  if (!bounded.ok && bounded.reason === "too_large") {
    return NextResponse.json({ ok: false, error: "İstek gövdesi çok büyük." }, { status: 413 });
  }
  const body: unknown = bounded.ok ? (bounded.value ?? {}) : {};

  const parsed = parseExportBody({ ...(body as object), mode: "all" }, { sectionAllow: GENERAL_SECTIONS });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  try {
    const res = await buildGeneralDoc(db, tenantId, parsed.sections, { expertName: null, date: new Date() });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    return docxResponse(res.buffer, res.filename);
  } catch {
    return NextResponse.json({ ok: false, error: "Rapor oluşturulamadı." }, { status: 500 });
  }
}
