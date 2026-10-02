import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { ANAMNEZ_BUCKET, buildAttachmentPath, checkPrepare } from "@/lib/danisan/anamnez/storage";
import {
  anamnezError,
  anamnezJson,
  demoReadOnly,
  isMissingBucket,
  isMissingRelation,
  loadAnamnesis,
  loadClientInTenant,
  notFound,
  notReady,
} from "@/lib/danisan/anamnez/server";

export const runtime = "nodejs";

/**
 * POST /api/clients/[id]/anamnez/[anamnesisId]/attachments/prepare
 *   body: { fileName, size, contentType }  →  { ok, path, token }
 *
 * PDF yüklemesini HAZIRLAR (Vercel ~4.5 MB gövde sınırı nedeniyle bayt sunucudan geçmez):
 *   - Sahiplik: tenant (guard) → danışan → anamnez.
 *   - İstemci beyanı ön kontrolü: yalnız application/pdf + `.pdf`, 0 < boyut ≤ 10 MB, ≤ 5 ek.
 *   - Yol SUNUCUDA üretilir ({tenant}/{client}/{anamnesis}/{uuid}.pdf); kullanıcı adı yola girmez.
 *   - createSignedUploadUrl(upsert:false) → mevcut dosyanın üzerine yazılamaz.
 * Asıl içerik doğrulaması (gerçek %PDF- imzası + boyut) finalize'dadır.
 */

type RouteCtx = { params: Promise<{ id: string; anamnesisId: string }> };

export async function POST(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnly();

  const rl = checkRateLimit(`anamnez-upload:${tenantId}`, 30, 60_000, Date.now());
  if (!rl.ok) return anamnezError("RATE_LIMITED", 429);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return anamnezError("INVALID", 400);
  }

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();
  const { row, error } = await loadAnamnesis<{ id: string; status: string }>(db, tenantId, clientId, anamnesisId, "id, status");
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "anamnez/attachments/prepare", action: "load", tenantId, cause: error });
  }
  if (!row) return notFound();
  // Satış öncesi kapanış: tamamlanmış (kilitli) anamneze belge EKLENEMEZ.
  if (row.status !== "draft") return anamnezError("LOCKED", 409);

  const { count, error: cntErr } = await db
    .from("client_anamnesis_attachments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("anamnesis_id", row.id);
  if (cntErr) return serverErrorResponse({ route: "anamnez/attachments/prepare", action: "count", tenantId, cause: cntErr });

  const check = checkPrepare({ fileName: body.fileName, size: body.size, contentType: body.contentType }, count ?? 0);
  if (!check.ok) return anamnezError(check.code, check.code === "LIMIT_REACHED" ? 409 : check.code === "TOO_LARGE" ? 413 : 400);

  const path = buildAttachmentPath(tenantId, clientId, row.id, crypto.randomUUID());
  const { data: signed, error: signErr } = await db.storage
    .from(ANAMNEZ_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (signErr || !signed?.token) {
    if (isMissingBucket(signErr)) return notReady();
    return serverErrorResponse({ route: "anamnez/attachments/prepare", action: "sign", tenantId, cause: signErr ?? "no-token" });
  }
  return anamnezJson({ ok: true, path: signed.path ?? path, token: signed.token });
}
