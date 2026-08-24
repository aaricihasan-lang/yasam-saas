import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { createReportSnapshotFromChart } from "@/lib/human-design/reporting/reportSnapshotService";
import { saveCanonicalReport } from "@/lib/human-design/api/reportPersistence";
import { hdReportTitle } from "@/lib/human-design/reporting/wordReport";

export const runtime = "nodejs";

/**
 * POST /api/hd/reports/professional — PROFESYONEL (canonical) rapor snapshot OLUŞTUR.
 *
 * Güvenlik / sözleşme (§16, §42):
 *   - requireModuleAccess("human_design") → x-user-id + x-session-token binding.
 *   - tenantId + userId YALNIZ guard'dan; body'den GÜVENİLMEZ.
 *   - chart_id tenant-scoped; başka tenant/eksik → 404 (ayırt etme).
 *   - Demo hesap YAZAMAZ (report create bir write'tır).
 *   - Beklenen published canonical eksikse → 422 fail-loud (metin uydurulmaz).
 *   - DONMUŞ snapshot INSERT edilir (report_kind='canonical'); LIVE canonical
 *     lookup indirmede YAPILMAZ. Yanıt no-store.
 *   - Rate limit: tenant başına 10/60s (pahalı üretim).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında profesyonel rapor oluşturulamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  const rl = checkRateLimit(`hd-word:${guard.tenantId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const chartId = String((raw as Record<string, unknown> | null)?.chartId ?? "").trim();
  if (!chartId) {
    return NextResponse.json({ ok: false, error: "chartId gerekli." }, { status: 400, headers: NO_STORE });
  }

  const built = await createReportSnapshotFromChart(guard.db, guard.tenantId, chartId);
  if (!built.ok) {
    return NextResponse.json({ ok: false, code: built.code, error: built.error }, { status: built.status, headers: NO_STORE });
  }

  const saved = await saveCanonicalReport(guard.db, guard.tenantId, guard.userId, {
    chartId,
    clientId: built.clientId,
    title: hdReportTitle(built.clientName),
    snapshot: built.snapshot,
    provenance: built.snapshot.provenance.canonical,
  });
  if (saved.error || !saved.id) {
    return NextResponse.json({ ok: false, error: saved.error ?? "Rapor kaydedilemedi." }, { status: 400, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true, id: saved.id }, { status: 200, headers: NO_STORE });
}
