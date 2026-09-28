import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  ANAMNEZ_BUCKET,
  ANAMNEZ_SIGNED_URL_TTL_SECONDS,
  isOwnedAttachmentPath,
} from "@/lib/danisan/anamnez/storage";
import { isUuid } from "@/lib/danisan/anamnez/validate";
import {
  anamnezError,
  anamnezJson,
  demoReadOnly,
  isMissingRelation,
  loadAnamnesis,
  loadClientInTenant,
  logAnamnezEvent,
  notFound,
  notReady,
} from "@/lib/danisan/anamnez/server";

export const runtime = "nodejs";

/**
 *   GET    …/attachments/[attachmentId]?mode=view|download → { ok, url, expiresIn: 60 }
 *   DELETE …/attachments/[attachmentId]                     → { ok }
 *
 * İmzalanacak yol YALNIZ DB satırından çözülür (tenant + danışan + anamnez + ek eşleşmesi) →
 * route bir imzalama oracle'ı değildir; tahmin edilen yol / başka tenant eki → 404.
 * Signed URL 60 sn geçerlidir ve her tıklamada yeniden üretilir.
 * Silme: Storage ÖNCE; başarısızsa metadata korunur (sessiz yetim dosya oluşmaz).
 */

type RouteCtx = { params: Promise<{ id: string; anamnesisId: string; attachmentId: string }> };

type AttachmentRow = { id: string; storage_path: string; original_name: string };

async function resolveAttachment(req: NextRequest, ctx: RouteCtx) {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return { response: guard.response } as const;
  const { id: clientId, anamnesisId, attachmentId } = await ctx.params;
  const { db, tenantId } = guard;
  if (!isUuid(attachmentId)) return { response: notFound() } as const;
  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return { response: notFound() } as const;
  const { row, error } = await loadAnamnesis<{ id: string }>(db, tenantId, clientId, anamnesisId, "id");
  if (error) {
    if (isMissingRelation(error)) return { response: notReady() } as const;
    return { response: serverErrorResponse({ route: "anamnez/attachments/[id]", action: "load", tenantId, cause: error }) } as const;
  }
  if (!row) return { response: notFound() } as const;
  const { data, error: attErr } = await db
    .from("client_anamnesis_attachments")
    .select("id, storage_path, original_name")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("anamnesis_id", row.id)
    .eq("id", attachmentId)
    .maybeSingle();
  if (attErr) return { response: serverErrorResponse({ route: "anamnez/attachments/[id]", action: "att", tenantId, cause: attErr }) } as const;
  const att = data as AttachmentRow | null;
  // İkinci savunma: DB'deki yol da bu önekte olmalı (DB CHECK ile zaten zorunlu).
  if (!att || !isOwnedAttachmentPath(att.storage_path, tenantId, clientId, row.id)) return { response: notFound() } as const;
  return { guard, clientId, anamnesisId: row.id, att } as const;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const r = await resolveAttachment(req, ctx);
  if ("response" in r) return r.response!;
  const { guard, att } = r;
  const rl = checkRateLimit(`anamnez-url:${guard.tenantId}`, 60, 60_000, Date.now());
  if (!rl.ok) return anamnezError("RATE_LIMITED", 429);

  const mode = req.nextUrl.searchParams.get("mode") === "download" ? "download" : "view";
  const { data, error } = await guard.db.storage
    .from(ANAMNEZ_BUCKET)
    .createSignedUrl(att.storage_path, ANAMNEZ_SIGNED_URL_TTL_SECONDS, mode === "download" ? { download: att.original_name } : undefined);
  if (error || !data?.signedUrl) return anamnezError("UPLOAD_MISSING", 404);
  return anamnezJson({ ok: true, url: data.signedUrl, expiresIn: ANAMNEZ_SIGNED_URL_TTL_SECONDS });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const r = await resolveAttachment(req, ctx);
  if ("response" in r) return r.response!;
  const { guard, att, clientId, anamnesisId } = r;
  if (guard.is_demo_account) return demoReadOnly();

  const { error: rmErr } = await guard.db.storage.from(ANAMNEZ_BUCKET).remove([att.storage_path]);
  if (rmErr) return anamnezError("STORAGE_FAILED", 502);

  const { error } = await guard.db
    .from("client_anamnesis_attachments")
    .delete()
    .eq("tenant_id", guard.tenantId)
    .eq("client_id", clientId)
    .eq("id", att.id);
  if (error) return serverErrorResponse({ route: "anamnez/attachments/[id]", action: "DELETE", tenantId: guard.tenantId, cause: error });

  logAnamnezEvent("attachment_deleted", { tenant: guard.tenantId, user: guard.userId, client: clientId, anamnesis: anamnesisId });
  return anamnezJson({ ok: true });
}
