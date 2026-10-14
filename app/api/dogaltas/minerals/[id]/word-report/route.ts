import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isUuid } from "@/lib/dogaltas/validation";
import { sanitizeMineralRowsForReport } from "@/lib/dogaltas/reportSafe";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { Packer } from "docx";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { reportFileDate } from "@/lib/time/reportTime";
// Belge düzeni saf oluşturucuda (test edilebilir): statik İçindekiler + kompakt düzen.
import { buildMineralDetailDocument, type MineralRow } from "./mineralDetailDoc";

export const runtime = "nodejs";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: mineralId } = await params;
  // F-019: geçersiz UUID DB'ye gitmeden reddedilir.
  if (!isUuid(mineralId))
    return Response.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  // F-018: doğrulanmış oturum kapısı — tenantId/userId SUNUCUDAN (body'den DEĞİL).
  const auth = await requireDogaltasReportAccess(req);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;
  // Usage360 kimliği yalnız doğrulanmış rapor kapısından; demo orada zaten 403.
  const usageGuard = { ...auth, is_demo_account: false };

  const SELECT =
    "id, name, aciklama, kategori, source_id, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar, created_at";

  const { data, error } = await db
    .from("minerals")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", mineralId)
    .maybeSingle();

  if (error)
    return serverErrorResponse({ route: "dogaltas/minerals/[id]/word-report", action: "POST", tenantId, cause: error, usage: { guard: usageGuard, req, module: "stones", failedAction: "report_generated", subEntity: "mineral" } });

  if (!data)
    return Response.json({ ok: false, error: "Mineral kaydı bulunamadı." }, { status: 404 });

  // RPT-XML + P2-01: bozuk/legacy dizi alanı raporu çökertmez (normalize + teknik log).
  const mineral = sanitizeMineralRowsForReport(
    [sanitizeXmlDeep(data as MineralRow)],
    { route: "dogaltas/minerals/[id]/word-report", tenantId },
  ).rows[0];
  const mineralName = mineral.name || "İsimsiz Mineral";
  const dateSlug = reportFileDate();
  const nameSlug = slugify(mineralName);

  const doc = buildMineralDetailDocument(mineral, expertDisplayName(auth.profile));

  const buffer = await Packer.toBuffer(doc);
  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: mineral).
  await trackUsage(usageGuard, req, { module: "stones", action: "report_generated", subEntity: "mineral", resourceId: mineralId });
  const filename = `mineral-${nameSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
