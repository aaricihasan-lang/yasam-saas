import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { getCanonicalReportForDownload } from "@/lib/human-design/api/reportPersistence";
import { buildProfessionalReportSummary } from "@/lib/human-design/reporting/reportSummary";

/**
 * GET /api/hd/reports/professional/summary?id=<reportId>
 *
 * P2-3 (Android): Word indirilemeyen cihazlarda profesyonel raporun "yalnız Sil" ile
 * kalmaması için GÜVENLİ özet görünümü. Canonical metin (yorum gövdesi) DÖNMEZ — mevcut
 * mimari kararı korunur: canonical içerik uzmana yalnız donmuş DOCX ile ulaşır. Dönen
 * yalnız rapordaki danışan/harita özeti + bölüm BAŞLIKLARI (görünen adlar) + sayılar.
 *
 * Güvenlik: requireModuleAccess (token↔user, modül izni); rapor tenant-scoped okunur
 * (başka tenant → 404). Android guard YOK (bu uç tam olarak Android için).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });
  }
  const read = await getCanonicalReportForDownload(guard.db, guard.tenantId, id);
  if (!read.data) {
    return NextResponse.json({ ok: false, error: read.error }, { status: read.status, headers: NO_STORE });
  }
  const summary = buildProfessionalReportSummary(read.data.title, read.data.snapshot);
  return NextResponse.json({ ok: true, summary }, { status: 200, headers: NO_STORE });
}
