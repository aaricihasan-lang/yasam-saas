import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { buildFilledAnamnesisPdf } from "@/lib/danisan/anamnez/filledFormPdf";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import { asciiSlug, clientDisplayFromSnapshot } from "@/lib/danisan/anamnez/format";
import { isKnownTemplateVersion, normalizeLocale } from "@/lib/danisan/anamnez/schema";
import { validateFormCustom } from "@/lib/danisan/anamnez/validate";
import {
  ANAMNEZ_FULL_COLUMNS,
  anamnezError,
  isMissingRelation,
  loadAnamnesis,
  loadClientInTenant,
  notFound,
  notReady,
} from "@/lib/danisan/anamnez/server";
import type { AnamnezRecord } from "@/lib/danisan/anamnez/types";

export const runtime = "nodejs";

/**
 * GET /api/clients/[id]/anamnez/[anamnesisId]/pdf[?rev=N][&locale=tr|en]
 *
 * KAYITLI (dolu) anamnez formu — PDF. Taslak veya tamamlanmış kaydın SUNUCUDAKİ son hâli yazılır
 * (kaydedilmemiş editör değişiklikleri dahil edilmez). Gizli alan cevapları yazılmaz.
 *
 * - Kimlik/tenant: requireModuleAccess(req, "clients"); tenant YALNIZ guard'dan.
 * - Danışan + anamnez tenant + client + id üçlüsüyle okunur; eşleşme yoksa 404 (IDOR kapısı).
 * - Demo hesap: 404 (kayıt GET ile aynı — demo anamnez kaydı yoktur).
 * - `rev` verilir ve kayıttaki revizyonla uyuşmazsa 409 CONFLICT (istemci eski sürümü indirmez).
 * - Android dahil tüm istemcilere açıktır (cihaz tespitiyle kapatılmaz — K8).
 * - Telemetri: report_generated; danışan adı / form içeriği telemetriye ve loglara GİRMEZ.
 */

type RouteCtx = { params: Promise<{ id: string; anamnesisId: string }> };

export async function GET(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return notFound();

  const rl = checkRateLimit(`anamnez-filled:${tenantId}`, 20, 60_000, Date.now());
  if (!rl.ok) return anamnezError("RATE_LIMITED", 429);

  const revRaw = req.nextUrl.searchParams.get("rev");
  if (revRaw !== null && !/^\d{1,9}$/.test(revRaw)) return anamnezError("INVALID", 400);

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();

  const { row, error } = await loadAnamnesis<AnamnezRecord>(db, tenantId, clientId, anamnesisId, ANAMNEZ_FULL_COLUMNS);
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]/pdf", action: "load", tenantId, cause: error });
  }
  if (!row || !isKnownTemplateVersion(row.template_version)) return notFound();
  if (revRaw !== null && Number(revRaw) !== row.revision) return anamnezError("CONFLICT", 409, { revision: row.revision });

  // Form farkı doğrulanamazsa gizli alan listesi güvenilmez → kapalı başarısızlık (cevap sızdırılmaz).
  const fc = validateFormCustom(row.template_version, row.form_custom ?? {});
  if (!fc.ok) {
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]/pdf", action: "form_custom", tenantId, cause: new Error("invalid form_custom") });
  }

  const locale = normalizeLocale(req.nextUrl.searchParams.get("locale") ?? req.cookies.get("NEXT_LOCALE")?.value);
  let bytes: Uint8Array;
  try {
    bytes = buildFilledAnamnesisPdf({ locale, record: { ...row, form_custom: fc.value }, fontBase64: anamnezPdfFontBase64() });
  } catch (cause) {
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]/pdf", action: "build", tenantId, cause, usage: { guard, req, module: "clients", failedAction: "report_generated", subEntity: "anamnesis" } });
  }

  // USAGE360: kayıtlı form PDF'i üretildi; danışan adı / cevaplar telemetriye GİRMEZ.
  await trackUsage(guard, req, { module: "clients", action: "report_generated", subEntity: "anamnesis", resourceId: `${clientId}:filled:${row.id}` });
  const name = clientDisplayFromSnapshot(row.client_snapshot) || [client.ad, client.soyad].filter(Boolean).join(" ").trim();
  const slug = name ? asciiSlug(name) : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(row.assessment_date)) ? `-${row.assessment_date}` : "";
  const file = `${locale === "en" ? "intake" : "anamnez"}${slug ? `-${slug}` : ""}${date}.pdf`;
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store, private",
      "Content-Length": String(bytes.length),
      "X-Anamnez-Revision": String(row.revision),
    },
  });
}
