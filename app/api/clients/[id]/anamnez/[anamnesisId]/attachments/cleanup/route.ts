import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { ANAMNEZ_BUCKET, isOwnedAttachmentPath } from "@/lib/danisan/anamnez/storage";
import {
  anamnezError,
  anamnezJson,
  demoReadOnly,
  isMissingRelation,
  loadAnamnesis,
  loadClientInTenant,
  notFound,
  notReady,
} from "@/lib/danisan/anamnez/server";

export const runtime = "nodejs";

/**
 * POST /api/clients/[id]/anamnez/[anamnesisId]/attachments/cleanup  body: { path }
 *
 * Yükleme/finalize yarıda kalırsa istemci çağırır: YALNIZ bu anamnez önekindeki ve metadata
 * satırı OLMAYAN (finalize edilmemiş) nesneyi siler. Kayıtlı bir eki bu uçla silmek mümkün değil.
 */

type RouteCtx = { params: Promise<{ id: string; anamnesisId: string }> };

export async function POST(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, is_demo_account } = guard;
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
    return serverErrorResponse({ route: "anamnez/attachments/cleanup", action: "load", tenantId, cause: error });
  }
  if (!row) return notFound();

  const path = body.path;
  if (!isOwnedAttachmentPath(path, tenantId, clientId, row.id)) return anamnezError("INVALID", 400);

  const { data: meta, error: metaErr } = await db
    .from("client_anamnesis_attachments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("storage_path", path)
    .maybeSingle();
  if (metaErr) return serverErrorResponse({ route: "anamnez/attachments/cleanup", action: "meta", tenantId, cause: metaErr });
  if (meta) return anamnezJson({ ok: true, skipped: "registered" });

  const { error: rmErr } = await db.storage.from(ANAMNEZ_BUCKET).remove([path]);
  if (rmErr) return anamnezError("STORAGE_FAILED", 502);
  return anamnezJson({ ok: true, removed: true });
}
