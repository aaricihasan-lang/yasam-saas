import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { getChartForReportV2 } from "@/lib/human-design/api/chartPersistence";
import { listKnowledgeForReport } from "@/lib/human-design/api/knowledgePersistence";
import { buildExpertKnowledgeCodes, toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { countReportableExpertEntries } from "@/lib/human-design/reporting/reportSnapshotV2";

export const runtime = "nodejs";

/**
 * GET /api/hd/reports/professional/knowledge-match?chartId=<uuid>
 *
 * Yeni Word oluşturma penceresinde "Bilgi Bankamdaki Açıklamaları Ekle" seçilmeden ÖNCE uzmana
 * bilgi: bu analizle eşleşen, Word'e girecek AKTİF açıklama sayısı. Kural Word ile BİREBİR aynı
 * (yalnız bu tenant · aktif · haritanın kodları · dolu başlık/kod/metin). İçerik / özel not
 * DÖNMEZ — yalnız sayı. Salt okunur; Roxy çağrısı yok; başka tenant'ın analizi → 404.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const chartId = (new URL(req.url).searchParams.get("chartId") ?? "").trim();
  if (!UUID_RE.test(chartId)) {
    return NextResponse.json({ ok: false, error: "Geçerli chartId gerekli." }, { status: 400, headers: NO_STORE });
  }
  const { row, error } = await getChartForReportV2(guard.db, guard.tenantId, chartId, { withProviderRaw: false });
  if (error) return NextResponse.json({ ok: false, error: "Analiz okunamadı." }, { status: 500, headers: NO_STORE });
  if (!row) return NextResponse.json({ ok: false, error: "Analiz bulunamadı." }, { status: 404, headers: NO_STORE });

  const kb = await listKnowledgeForReport(guard.db, guard.tenantId, buildExpertKnowledgeCodes(toAppChartCodes(row)));
  if (kb.error) return NextResponse.json({ ok: false, error: "Bilgi Bankası okunamadı." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, count: countReportableExpertEntries(kb.rows) }, { status: 200, headers: NO_STORE });
}
