import { NextRequest } from "next/server";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { listAtlasOrganNames, resolveOrganInAtlas, resolveProtocolAtlas } from "@/lib/refleksoloji/atlasRegionsCore";
import { normalizeAtlasDocument } from "@/lib/refleksoloji/atlasNormalize";
import type { AtlasDocument } from "@/lib/atlasStorage";
import { buildAtlasReport, reflexologyHeaders, reflexologyFooters } from "@/lib/refleksoloji/reflexologyWord";

export const runtime = "nodejs";

/**
 * W07 — /api/refleksoloji/atlas-report: Kayıtlı Atlas Word (.docx) dışa aktarma.
 *
 * Body: { exportMode: "all" | "selected", organs?: string[] }
 *   - "all"      → bu tenant'ın atlas belgesindeki TÜM organlar,
 *   - "selected" → yalnız verilen organ adları (atlas belgesinde kanonik eşleşenler).
 *
 * Güvenlik:
 *   - Kimlik/tenant YALNIZ sunucuda (requireModuleAccess). Body'de tenant/kullanıcı kabul edilmez;
 *     veri yalnız guard.db üzerinden `tenant_id = guard.tenantId` satırından OKUNUR (yazma YOK).
 *   - İstemcinin gönderdiği organ adları yalnız FİLTREDİR; bölge verisi her zaman sunucudaki
 *     belgeden gelir (istemci içerik enjekte edemez).
 *   - Demo hesap: 403 (protokol raporu ile aynı kural). Ham DB mesajı istemciye sızmaz.
 */

type ExportMode = "all" | "selected";

/** Seçili dışa aktarımda en çok bu kadar organ adı. */
const MAX_SELECTED_ORGANS = 500;
const MAX_ORGAN_NAME_LENGTH = 200;
/** REF-04 ile aynı: Vercel yanıt gövdesi sınırı 4,5 MB → aşmadan anlaşılır 413. */
const REPORT_MAX_BYTES = 4_400_000;

const TR_TZ = "Europe/Istanbul";

function reportDateTR(): string {
  return new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", timeZone: TR_TZ });
}

function reportDateSlug(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TR_TZ }).format(new Date());
}

const EMPTY_ATLAS: AtlasDocument = { _meta: { version: "1", updated_at: "1970-01-01T00:00:00.000Z" } };

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(request, "reflexology");
  if (!guard.ok) return guard.response;
  const { tenantId, db } = guard;

  if (guard.is_demo_account)
    return Response.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });

  const { exportMode = "all", organs } = body as { exportMode?: ExportMode; organs?: unknown };
  if (exportMode !== "all" && exportMode !== "selected")
    return Response.json({ ok: false, error: "Geçersiz dışa aktarma türü." }, { status: 400 });

  const requested: string[] = [];
  if (exportMode === "selected") {
    if (!Array.isArray(organs) || organs.length === 0)
      return Response.json({ ok: false, error: "Seçili dışa aktarma için en az bir organ gerekli." }, { status: 400 });
    if (organs.some((o) => typeof o !== "string" || !o.trim() || o.length > MAX_ORGAN_NAME_LENGTH))
      return Response.json({ ok: false, error: "Geçersiz organ adı." }, { status: 400 });
    const seen = new Set<string>();
    for (const o of organs as string[]) {
      const key = o.trim().toLocaleLowerCase("tr");
      if (seen.has(key)) continue;
      seen.add(key);
      requested.push(o.trim());
    }
    if (requested.length > MAX_SELECTED_ORGANS)
      return Response.json({ ok: false, error: `Tek raporda en fazla ${MAX_SELECTED_ORGANS} organ seçilebilir.` }, { status: 400 });
  }

  // Tenant atlas belgesi (READ-ONLY).
  const { data: atlasRow, error: atlasErr } = await db
    .from("reflexology_atlas")
    .select("document")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (atlasErr) {
    console.error(`[refleksoloji] atlas-report.atlas: ${atlasErr.code ?? ""} ${atlasErr.message}`);
    await trackUsage(guard, request, { module: "reflexology", action: "action_failed", failedAction: "report_generated", subEntity: "atlas", errorClass: "server" });
    return Response.json({ ok: false, error: "Atlas okunamadı." }, { status: 500 });
  }
  const atlasDoc = normalizeAtlasDocument((atlasRow?.document as AtlasDocument | null) ?? EMPTY_ATLAS);

  // Seçili adlar atlas belgesindeki GERÇEK kayıt adına çevrilir (raporda kaydın kendi yazımı görünür);
  // eşleşmeyen ad olduğu gibi kalır ve "bulunmayan organlar" notunda listelenir.
  const names = exportMode === "all"
    ? listAtlasOrganNames(atlasDoc)
    : [...new Set(requested.map((n) => resolveOrganInAtlas(atlasDoc, n) ?? n))];
  const resolved = resolveProtocolAtlas(atlasDoc, names);
  const found = resolved.organs.filter((o) => o.found).length;
  if (found === 0)
    return Response.json({ ok: false, error: "Bu seçim için atlas kaydı bulunamadı." }, { status: 404 });

  const scopeLabel = exportMode === "selected" ? "Seçili Atlas Kayıtları" : "Tüm Atlas Kayıtları";
  const children = await buildAtlasReport(resolved, reportDateTR(), scopeLabel);

  const doc = new Document({
    sections: [{
      properties: {
        titlePage: true,
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
        },
      },
      headers: reflexologyHeaders(),
      footers: reflexologyFooters("Refleksoloji Atlas Raporu"),
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  if (buffer.length > REPORT_MAX_BYTES) {
    await trackUsage(guard, request, { module: "reflexology", action: "action_failed", failedAction: "report_generated", subEntity: "atlas", errorClass: "too_large" });
    return Response.json({
      ok: false,
      error: "Rapor indirilebilir boyutu (4,4 MB) aşıyor. Lütfen daha az kayıt seçerek tekrar deneyin.",
    }, { status: 413 });
  }
  await trackUsage(guard, request, {
    module: "reflexology",
    action: "report_generated",
    subEntity: "atlas",
    resourceId: null,
    itemCount: found,
  });
  const filename = `refleksoloji-atlas-${exportMode === "selected" ? "secili" : "tumu"}-${reportDateSlug()}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
