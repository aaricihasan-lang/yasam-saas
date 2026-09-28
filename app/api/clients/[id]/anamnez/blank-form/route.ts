import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { buildBlankAnamnesisPdf } from "@/lib/danisan/anamnez/blankFormPdf";
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

let fontCache: string | null = null;
function fontBase64(): string {
  if (!fontCache) {
    fontCache = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
  }
  return fontCache;
}

function asciiSlug(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

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
    bytes = buildBlankAnamnesisPdf({ locale, version, formCustom, clientName: name, fontBase64: fontBase64() });
  } catch (cause) {
    return serverErrorResponse({ route: "anamnez/blank-form", action: "build", tenantId, cause });
  }

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
