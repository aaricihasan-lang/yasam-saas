import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { logServerError, serverErrorResponse } from "@/lib/http/apiError";
import {
  ANAMNEZ_BUCKET,
  ANAMNEZ_MAX_ATTACHMENTS,
  checkUploadedBytes,
  isOwnedAttachmentPath,
  sanitizeAttachmentName,
} from "@/lib/danisan/anamnez/storage";
import {
  ATTACHMENT_COLUMNS,
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
 * POST /api/clients/[id]/anamnez/[anamnesisId]/attachments/finalize
 *   body: { path, originalName }  →  { ok, attachment }
 *
 * İmzalı yükleme SONRASI gerçek doğrulama + metadata:
 *   - Yol TAM OLARAK bu tenant/danışan/anamnez önekinde ve sunucu biçiminde olmalı (traversal/
 *     yabancı önek → 400). Başka uzmanın yolu verilse dahi bu uzmanın anamnezine bağlanamaz.
 *   - Nesne sunucuda indirilir: gerçek boyut ≤ 10 MB + `%PDF-` imzası (uzantı/MIME beyanına güvenilmez).
 *   - Geçersizse nesne HEMEN silinir (yetim/zararlı dosya kalmaz) ve 422/413 döner.
 *   - sha256 hesaplanır; ≤ 5 ek sınırı DB trigger'ı ile de zorlanır.
 */

type RouteCtx = { params: Promise<{ id: string; anamnesisId: string }> };

export async function POST(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnly();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return anamnezError("INVALID", 400);
  }

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();
  const { row, error } = await loadAnamnesis<{ id: string }>(db, tenantId, clientId, anamnesisId, "id");
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "anamnez/attachments/finalize", action: "load", tenantId, cause: error });
  }
  if (!row) return notFound();

  const path = body.path;
  if (!isOwnedAttachmentPath(path, tenantId, clientId, row.id)) return anamnezError("INVALID", 400);

  const bucket = db.storage.from(ANAMNEZ_BUCKET);
  const reject = async (code: "INVALID_TYPE" | "TOO_LARGE" | "EMPTY" | "LIMIT_REACHED", status: number) => {
    const { error: rmErr } = await bucket.remove([path]);
    if (rmErr) logServerError({ route: "anamnez/attachments/finalize", action: "reject-remove", tenantId, cause: rmErr });
    return anamnezError(code, status);
  };

  const { data: blob, error: dlErr } = await bucket.download(path);
  if (dlErr || !blob) return anamnezError("UPLOAD_MISSING", 409);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const check = checkUploadedBytes(bytes);
  if (!check.ok) return reject(check.code, check.code === "TOO_LARGE" ? 413 : 422);

  const { count } = await db
    .from("client_anamnesis_attachments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("anamnesis_id", row.id);
  if ((count ?? 0) >= ANAMNEZ_MAX_ATTACHMENTS) return reject("LIMIT_REACHED", 409);

  const { data: inserted, error: insErr } = await db
    .from("client_anamnesis_attachments")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      anamnesis_id: row.id,
      storage_path: path,
      original_name: sanitizeAttachmentName(body.originalName),
      size_bytes: bytes.length,
      mime_type: "application/pdf",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploaded_by_user_id: userId,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();
  if (insErr) {
    if (insErr.code === "23514") return reject("LIMIT_REACHED", 409);
    if (insErr.code === "23505") return anamnezJson({ ok: true, duplicate: true });
    const { error: rmErr } = await bucket.remove([path]);
    if (rmErr) logServerError({ route: "anamnez/attachments/finalize", action: "insert-fail-remove", tenantId, cause: rmErr });
    return serverErrorResponse({ route: "anamnez/attachments/finalize", action: "insert", tenantId, cause: insErr });
  }

  logAnamnezEvent("attachment_added", { tenant: tenantId, user: userId, client: clientId, anamnesis: row.id, bytes: bytes.length });
  return anamnezJson({ ok: true, attachment: inserted }, 201);
}
