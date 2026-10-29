import { NextRequest } from "next/server";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { buildComparison, maskClientId, validateAlignRequest } from "@/lib/numeroloji-klasik/server/compareService";

export const runtime = "nodejs";

/**
 * POST /api/numeroloji-klasik/karsilastirma/hizala { legacyId?: uuid, classicId?: uuid } (en az biri)
 *   → { ok, alignment, stones: { classic: { mode, reason?, reasonText?, result, stock } | null,
 *                                legacyAssignments: [{ analysisType, labelTr, value, stones[] }] },
 *       sources: { legacy: {...} | null, classic: {...} | null } }
 * Kayıtlar KAYDEDİLDİĞİ GİBİ okunur (yeniden hesap yok, 0 sağlayıcı çağrısı, yazma yok).
 * Başka tenant / yok → 404. POST yalnız gövde taşımak içindir (okuma işlemi; demo dahil serbest).
 * clients izni yoksa sources.*.clientId null.
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validateAlignRequest(body.value);
  if (!v.ok) return validationResponse(v);

  const r = await buildComparison({ db: guard.db, tenantId: guard.tenantId, viewerId: guard.userId, futureYears: canSeeNumerologyFutureYears(guard.profile), canSeeStock: resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "stones") }, v.value);
  if (!r.ok) return r.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
  const { alignment, stones, sources } = r.value;
  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  const masked = {
    legacy: sources.legacy ? maskClientId(sources.legacy, canSeeClients) : null,
    classic: sources.classic ? maskClientId(sources.classic, canSeeClients) : null,
  };
  return classicJson(200, { ok: true, alignment, stones, sources: masked });
}
