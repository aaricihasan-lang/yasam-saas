import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid } from "@/lib/numeroloji-klasik/input";
import { classicError, classicJson, classicNotFound } from "@/lib/numeroloji-klasik/server/http";
import { listClassicSources, listLegacySources, maskClientId, validateCompareQuery } from "@/lib/numeroloji-klasik/server/compareService";

export const runtime = "nodejs";

/**
 * GET /api/numeroloji-klasik/karsilastirma/kaynaklar?clientId=<uuid>&q=<ad ≤ 60>
 *   → { ok, legacy: [{ id, fullName, birthDate, createdAt, methodologyVersion, clientId }],
 *            classic: [{ id, title, kind, createdAt, clientId }] }   (her biri son 20; tenant oturumdan)
 * Mevcut Numeroloji kayıtları YALNIZ select ile okunur (analysis_data taşınmaz). clientId → clients izni zorunlu;
 * clients izni yoksa yanıttaki her clientId null.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const clientIdRaw = sp.get("clientId");
  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  let clientId: string | null = null;
  if (clientIdRaw !== null && clientIdRaw !== "") {
    if (!isUuid(clientIdRaw)) return classicJson(400, { ok: false, code: "INVALID_CLIENT_ID", error: "Geçersiz danışan kimliği." });
    if (!canSeeClients) {
      return classicJson(403, { ok: false, code: "CLIENTS_PERMISSION_REQUIRED", error: "Danışana göre listelemek için Danışan Yönetimi izniniz olmalı." });
    }
    clientId = clientIdRaw.toLowerCase();
  }
  const q = validateCompareQuery(sp.get("q"));
  if (!q.ok) return classicJson(400, { ok: false, code: q.code, error: q.error, ...(q.field ? { field: q.field } : {}) });

  const [legacy, classic] = await Promise.all([
    listLegacySources(guard.db, guard.tenantId, { clientId, q: q.value }),
    listClassicSources(guard.db, guard.tenantId, { clientId, q: q.value }),
  ]);
  if (!legacy.ok || !classic.ok) return classicError("DB_ERROR");
  return classicJson(200, {
    ok: true,
    legacy: legacy.value.map((x) => maskClientId(x, canSeeClients)),
    classic: classic.value.map((x) => maskClientId(x, canSeeClients)),
  });
}
