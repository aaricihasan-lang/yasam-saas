import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { buildComparison, validateAlignRequest } from "@/lib/numeroloji-klasik/server/compareService";

export const runtime = "nodejs";

/**
 * POST /api/numeroloji-klasik/karsilastirma/hizala { legacyId?: uuid, classicId?: uuid } (en az biri)
 *   → { ok, alignment, stones: { classic: { mode, reason?, reasonText?, result, stock } | null,
 *                                legacyAssignments: [{ analysisType, labelTr, value, stones[] }] },
 *       sources: { legacy: {...} | null, classic: {...} | null } }
 * Kayıtlar KAYDEDİLDİĞİ GİBİ okunur (yeniden hesap yok, 0 sağlayıcı çağrısı, yazma yok).
 * Başka tenant / yok → 404. POST yalnız gövde taşımak içindir (okuma işlemi; demo dahil serbest).
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validateAlignRequest(body.value);
  if (!v.ok) return validationResponse(v);

  const r = await buildComparison({ db: guard.db, tenantId: guard.tenantId, viewerId: guard.userId }, v.value);
  if (!r.ok) return r.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
  const { alignment, stones, sources } = r.value;
  return classicJson(200, { ok: true, alignment, stones, sources });
}
