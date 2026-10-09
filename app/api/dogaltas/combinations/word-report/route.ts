import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { serverErrorResponse } from "@/lib/http/apiError";
import { fetchAllRows, fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";
import { badSelectionResponse, missingSelectionResponse } from "@/lib/dogaltas/reportIds";
import { trackUsage } from "@/lib/usage/trackUsage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { hydrateCombinationStoneNames } from "@/lib/dogaltas/combinationStonesRead";
import { Packer } from "docx";
import { buildCombinationReportDocument, type CombinationRow as CombinationReportRow } from "@/lib/dogaltas/combinationReportDoc";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { reportFileDate } from "@/lib/time/reportTime";

export const runtime = "nodejs";

type ExportMode = "all" | "selected" | "filtered" | "single";

type CombinationRow = CombinationReportRow;

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

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

  const { exportMode = "all", issues, combinationTitle } = body as {
    exportMode?: ExportMode;
    issues?: string[];        // issue names for selected/filtered
    combinationTitle?: string; // single issue name
  };

  const SELECT = "id,tenant_id,source_id,issue,description,variant_index,source,stones_text,notes_text,notes_text_2,notes_text_3,created_at";

  // P2-02: seçim doğrulaması (tip + uzunluk + üst sınır) DB'ye gitmeden.
  const MAX_ISSUE_LEN = 500;
  const MAX_ISSUES = 5000;
  let issueList: string[] | null = null;
  if (exportMode === "single") {
    if (typeof combinationTitle !== "string" || !combinationTitle.trim() || combinationTitle.length > MAX_ISSUE_LEN) {
      return badSelectionResponse("Kombinasyon başlığı geçersiz.");
    }
    issueList = [combinationTitle];
  } else if ((exportMode === "selected" || exportMode === "filtered") && issues != null) {
    if (!Array.isArray(issues)) return badSelectionResponse("Seçili kayıt listesi geçersiz.");
    if (issues.length > 0) {
      if (issues.some((i) => typeof i !== "string" || !i.trim() || i.length > MAX_ISSUE_LEN)) {
        return badSelectionResponse("Seçili kayıtlardan biri geçersiz. Listeyi yenileyip tekrar deneyin.");
      }
      issueList = Array.from(new Set(issues as string[]));
      if (issueList.length > MAX_ISSUES) return badSelectionResponse(`Tek raporda en fazla ${MAX_ISSUES} başlık seçilebilir.`);
    }
  }

  // P2-07: sayfalı + parçalı okuma (1000-satır tavanı / URL sınırı yok; tenant her sayfada).
  const res = issueList
    ? await fetchAllRowsByIds<CombinationRow>(issueList, (chunk, from, to) =>
        db.from("combinations").select(SELECT).eq("tenant_id", tenantId).in("issue", chunk)
          .order("issue").order("variant_index").order("id").range(from, to), { chunkSize: 40 })
    : await fetchAllRows<CombinationRow>((from, to) =>
        db.from("combinations").select(SELECT).eq("tenant_id", tenantId)
          .order("issue").order("variant_index").order("id").range(from, to));
  if (!res.ok)
    return serverErrorResponse({ route: "dogaltas/combinations/word-report", action: "POST", tenantId, cause: res.error, usage: { guard: usageGuard, req, module: "stones", failedAction: "report_generated", subEntity: "combination" } });
  // P2-02: seçilen başlıklardan biri bile yoksa (silinmiş / başka tenant) rapor ÜRETİLMEZ.
  if (issueList) {
    const found = new Set(res.rows.map((r) => r.issue));
    if (issueList.some((i) => !found.has(i))) return missingSelectionResponse();
  }
  const data = res.rows;

  // F-02 READ: yapısal kayıtlar junction'dan resolve (güncel ad; silinende snapshot);
  // legacy stones_text fallback. SALT-OKUMA + batch. Sonra XML sanitize.
  const hydrated = await hydrateCombinationStoneNames(db, tenantId, (data || []) as CombinationRow[]);
  const rows = sanitizeXmlDeep(hydrated as CombinationRow[]); // RPT-XML
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için kombinasyon bulunamadı." }, { status: 404 });

  const dateSlug = reportFileDate();
  const doc = buildCombinationReportDocument(rows, exportMode, combinationTitle, expertDisplayName(auth.profile));

  const buffer = await Packer.toBuffer(doc);
  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: kombinasyon; çoklu → itemCount).
  await trackUsage(usageGuard, req, {
    module: "stones",
    action: "report_generated",
    subEntity: "combination",
    resourceId: rows.map((r) => r.id).sort().join(","),
    itemCount: rows.length,
  });
  const modeSlug =
    exportMode === "single" && combinationTitle ? slugify(combinationTitle) :
    exportMode === "selected" ? "secili" :
    exportMode === "filtered" ? "filtreli" : "tumu";
  const filename = `kombinasyon-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
