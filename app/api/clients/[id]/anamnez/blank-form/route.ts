import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { buildBlankAnamnesisPdf } from "@/lib/danisan/anamnez/blankFormPdf";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import { asciiSlug } from "@/lib/danisan/anamnez/format";
import { CURRENT_TEMPLATE_VERSION, isKnownTemplateVersion, normalizeLocale } from "@/lib/danisan/anamnez/schema";
import { validateFormCustom } from "@/lib/danisan/anamnez/validate";
import {
  anamnezError,
  isMissingRelation,
  loadAnamnesis,
  loadClientInTenant,
  notFound,
  notReady,
} from "@/lib/danisan/anamnez/server";
import type { FormCustom } from "@/lib/danisan/anamnez/types";

export const runtime = "nodejs";

/**
 * GET /api/clients/[id]/anamnez/blank-form[?aid=<anamnesisId>][&locale=tr|en]
 *
 * Yazdırılabilir BOŞ anamnez formu (PDF). `aid` verilirse o anamnezin danışana özel form farkı
 * uygulanır; verilmezse güncel standart şablon. Cevap İÇERMEZ (boş form) — yalnız danışan adı
 * başlığa yazılır. Android dahil tüm istemcilere açıktır (cihaz tespitiyle kapatılmaz).
 */

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId } = await params;
  const { db, tenantId } = guard;

  const rl = checkRateLimit(`anamnez-blank:${tenantId}`, 20, 60_000, Date.now());
  if (!rl.ok) return anamnezError("RATE_LIMITED", 429);

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();

  const locale = normalizeLocale(req.nextUrl.searchParams.get("locale") ?? req.cookies.get("NEXT_LOCALE")?.value);
  const aid = req.nextUrl.searchParams.get("aid");
  let version = CURRENT_TEMPLATE_VERSION;
  let formCustom: FormCustom | null = null;
  if (aid) {
    const { row, error } = await loadAnamnesis<{ template_version: string; form_custom: unknown }>(
      db, tenantId, clientId, aid, "template_version, form_custom",
    );
    if (error) {
      if (isMissingRelation(error)) return notReady();
      return serverErrorResponse({ route: "anamnez/blank-form", action: "load", tenantId, cause: error });
    }
    if (!row || !isKnownTemplateVersion(row.template_version)) return notFound();
    const fc = validateFormCustom(row.template_version, row.form_custom ?? {});
    version = row.template_version;
    formCustom = fc.ok ? fc.value : null;
  }

  const name = [client.ad, client.soyad].filter(Boolean).join(" ").trim() || null;
  let bytes: Uint8Array;
  try {
    bytes = buildBlankAnamnesisPdf({ locale, version, formCustom, clientName: name, fontBase64: anamnezPdfFontBase64() });
  } catch (cause) {
    return serverErrorResponse({ route: "anamnez/blank-form", action: "build", tenantId, cause, usage: { guard, req, module: "clients", failedAction: "report_generated", subEntity: "anamnesis" } });
  }

  // USAGE360: form PDF'i başarıyla üretildi; danışan adı / form içeriği telemetriye GİRMEZ.
  await trackUsage(guard, req, { module: "clients", action: "report_generated", subEntity: "anamnesis", resourceId: `${clientId}:blank-form:${aid ?? "-"}` });
  const base = locale === "en" ? "intake-form" : "anamnez-formu";
  const file = `${base}${name ? `-${asciiSlug(name)}` : ""}.pdf`;
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store, private",
      "Content-Length": String(bytes.length),
    },
  });
}
