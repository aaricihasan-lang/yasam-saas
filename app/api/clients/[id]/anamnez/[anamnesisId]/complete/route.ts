import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
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
 * POST /api/clients/[id]/anamnez/[anamnesisId]/complete  body: { baseRevision }
 *
 * Taslağı TAMAMLANDI yapar. Bu andan sonra satır DB trigger'ıyla kilitlidir (yeniden açma YOK);
 * düzeltme/güncelleme yeni anamnez kaydıyla yapılır. Koşullu UPDATE (status='draft' AND
 * revision=base) → eşzamanlı düzenleme veya çift tamamlama 409.
 */

type RouteCtx = { params: Promise<{ id: string; anamnesisId: string }> };

export async function POST(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId, anamnesisId } = await params;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnly();

  let body: { baseRevision?: unknown } = {};
  try {
    body = (await req.json()) as { baseRevision?: unknown };
  } catch {
    return anamnezError("INVALID", 400);
  }
  const base = body.baseRevision;
  if (typeof base !== "number" || !Number.isInteger(base) || base < 1) return anamnezError("INVALID", 400);

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();
  const { row, error } = await loadAnamnesis<{ id: string; status: string; revision: number }>(
    db, tenantId, clientId, anamnesisId, "id, status, revision",
  );
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]/complete", action: "load", tenantId, cause: error });
  }
  if (!row) return notFound();
  if (row.status !== "draft") return anamnezError("LOCKED", 409);
  if (row.revision !== base) return anamnezError("CONFLICT", 409, { revision: row.revision });

  const now = new Date().toISOString();
  const { data, error: upErr } = await db
    .from("client_anamneses")
    .update({
      status: "completed",
      completed_at: now,
      completed_by_user_id: userId,
      updated_by_user_id: userId,
      revision: row.revision + 1,
    })
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("id", row.id)
    .eq("status", "draft")
    .eq("revision", row.revision)
    .select("id, revision, completed_at");
  if (upErr) {
    if (upErr.code === "23514") return anamnezError("LOCKED", 409);
    return serverErrorResponse({ route: "clients/[id]/anamnez/[anamnesisId]/complete", action: "update", tenantId, cause: upErr });
  }
  const saved = ((data ?? []) as Array<{ id: string; revision: number; completed_at: string }>)[0];
  if (!saved) return anamnezError("CONFLICT", 409);

  logAnamnezEvent("completed", { tenant: tenantId, user: userId, client: clientId, anamnesis: row.id });
  return anamnezJson({ ok: true, revision: saved.revision, completed_at: saved.completed_at });
}
