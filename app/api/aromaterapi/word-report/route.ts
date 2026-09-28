import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { parseExportBody, docxResponse } from "@/lib/aromaterapi/report/request";
import { MAX_EXPORT_BODY_BYTES } from "@/lib/aromaterapi/report/theme";
import { readJsonBounded } from "@/lib/aromaterapi/service/requestBody";
import { buildGeneralDoc, GENERAL_SECTIONS } from "@/lib/aromaterapi/report/builders";

export const runtime = "nodejs";
// GÜVENLİK BANDI (ARO-010): kesin platform süre tavanı ÖLÇÜLMEDİ; konservatif üst sınır.
export const maxDuration = 60;

/**
 * Usage360 rapor konusu: genel katalog bölüm anahtarı → alt-varlık (sabit eşleme).
 * Tek bölüm seçildiyse o bölümün alt-varlığı; çok bölümlü / tam katalogda yağ kataloğu
 * (genel raporun ilk ve çekirdek bölümü) → "oil".
 */
const GENERAL_SECTION_SUB: Record<string, "oil" | "plant_taxon" | "preparation" | "blend" | "method" | "claim" | "source" | "glossary_term"> = {
  oils: "oil",
  taxa: "plant_taxon",
  preparations: "preparation",
  blends: "blend",
  methods: "method",
  knowledge: "claim",
  sources: "source",
  glossary: "glossary_term",
};

/**
 * POST /api/aromaterapi/word-report — GENEL Aromaterapi raporu (.docx).
 * Body opsiyonel: { sections?: [...allowlist] } (verilmezse tüm izinli bölümler).
 * tenant'ın TÜM export-eligible aktif kaydını tek DOCX'te toplar; boş bölüm başlık üretmez.
 */
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

  // Genel rapor gövdesi opsiyoneldir: boş/geçersiz JSON → {} (mode=all enjekte edilir).
  // Yalnız too_large fail-closed 413; parse hatası tolere edilir (mevcut davranış korunur).
  const bounded = await readJsonBounded(req, MAX_EXPORT_BODY_BYTES);
  if (!bounded.ok && bounded.reason === "too_large") {
    return NextResponse.json({ ok: false, error: "İstek gövdesi çok büyük." }, { status: 413 });
  }
  const body: unknown = bounded.ok ? (bounded.value ?? {}) : {};

  const parsed = parseExportBody({ ...(body as object), mode: "all" }, { sectionAllow: GENERAL_SECTIONS });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  const subEntity =
    parsed.sections && parsed.sections.length === 1 ? (GENERAL_SECTION_SUB[parsed.sections[0]] ?? "oil") : "oil";
  try {
    const res = await buildGeneralDoc(db, tenantId, parsed.sections, { expertName: expertDisplayName(guard.profile), date: new Date() });
    if (!res.ok) {
      if (res.status >= 500) await trackUsage(guard, req, { module: "aromatherapy", action: "action_failed", failedAction: "report_generated", subEntity, errorClass: "server" });
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    }
    // Usage360: DOCX tamponu BAŞARIYLA üretildikten sonra (rapor konusu alt-varlık).
    await trackUsage(guard, req, { module: "aromatherapy", action: "report_generated", subEntity, itemCount: res.count });
    return docxResponse(res.buffer, res.filename);
  } catch {
    await trackUsage(guard, req, { module: "aromatherapy", action: "action_failed", failedAction: "report_generated", subEntity, errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Rapor oluşturulamadı." }, { status: 500 });
  }
}
