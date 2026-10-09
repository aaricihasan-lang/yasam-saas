import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { sanitizeMineralRowsForReport } from "@/lib/dogaltas/reportSafe";
import { fetchAllRows, fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";
import { badSelectionResponse, missingSelectionResponse, parseReportIds, sortByTrField } from "@/lib/dogaltas/reportIds";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { Packer } from "docx";
import { buildMineralReportDocument, type MineralRow as MineralReportRow } from "@/lib/dogaltas/mineralReportDoc";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { reportFileDate } from "@/lib/time/reportTime";

export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportMode = "all" | "filtered" | "viewed" | "selected";

type MineralRow = MineralReportRow;

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  // F-018: doğrulanmış oturum kapısı — tenantId/userId SUNUCUDAN (body'den DEĞİL).
  const auth = await requireDogaltasReportAccess(req);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;
  // Usage360 kimliği yalnız doğrulanmış rapor kapısından; demo orada zaten 403.
  const usageGuard = { ...auth, is_demo_account: false };

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", mineralIds } = body as {
    exportMode?: ExportMode;
    mineralIds?: string[];
  };

  const SELECT =
    "id, name, aciklama, kategori, source_id, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar, created_at";

  // P2-02: seçili id listesi DB'ye gitmeden doğrulanır (UUID + üst sınır).
  const wantsSubset = exportMode === "filtered" || exportMode === "viewed" || exportMode === "selected";
  const parsedIds = wantsSubset ? parseReportIds(mineralIds) : ({ ok: true, ids: null } as const);
  if (!parsedIds.ok) return badSelectionResponse(parsedIds.error);
  const ids = parsedIds.ids;

  let exportLabel = "Tüm Mineraller";
  if (ids) {
    exportLabel =
      exportMode === "viewed"   ? "Görüntülenen Kayıtlar" :
      exportMode === "selected" ? "Seçili Mineraller"     :
      "Filtrelenmiş Sonuçlar";
  }

  // P2-07: 1000-satır tavanına takılmadan TÜM ilgili satırlar (tenant filtresi her sayfada).
  const res = ids
    ? await fetchAllRowsByIds<MineralRow>(ids, (chunk, from, to) =>
        db.from("minerals").select(SELECT).eq("tenant_id", tenantId).in("id", chunk)
          .order("name").order("id").range(from, to))
    : await fetchAllRows<MineralRow>((from, to) =>
        db.from("minerals").select(SELECT).eq("tenant_id", tenantId)
          .order("name").order("id").range(from, to));
  if (!res.ok) return serverErrorResponse({ route: "dogaltas/mineral-report", action: "POST", tenantId, cause: res.error, usage: { guard: usageGuard, req, module: "stones", failedAction: "report_generated", subEntity: "mineral" } });
  // P2-02: seçilen kayıtlardan biri bile tenant'ta yoksa (silinmiş / başka tenant) rapor ÜRETİLMEZ.
  if (ids && res.rows.length !== ids.length) return missingSelectionResponse();

  const ordered = ids && ids.length > 150 ? sortByTrField(res.rows, "name") : res.rows;
  // RPT-XML + P2-01: bozuk/legacy dizi alanı tüm raporu çökertmez (normalize + teknik log).
  const minerals = sanitizeMineralRowsForReport(sanitizeXmlDeep(ordered), {
    route: "dogaltas/mineral-report",
    tenantId,
  }).rows;
  if (!minerals.length) return Response.json({ ok: false, error: "Bu seçim için mineral bulunamadı." }, { status: 404 });

  const doc = buildMineralReportDocument(minerals, exportLabel, expertDisplayName(auth.profile));

  const buffer = await Packer.toBuffer(doc);
  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: mineral; çoklu → itemCount).
  await trackUsage(usageGuard, req, {
    module: "stones",
    action: "report_generated",
    subEntity: "mineral",
    resourceId: minerals.map((r) => r.id).sort().join(","),
    itemCount: minerals.length,
  });
  const dateSlug = reportFileDate();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="mineral-bankasi-raporu-${dateSlug}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
