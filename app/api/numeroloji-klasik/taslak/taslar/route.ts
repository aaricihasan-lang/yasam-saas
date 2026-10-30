import { NextRequest } from "next/server";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { validateDraftRef } from "@/lib/numeroloji-klasik/input";
import { resolveDraftRow } from "@/lib/numeroloji-klasik/server/draftRoute";
import { classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { buildClassicStonesView } from "@/lib/numeroloji-klasik/server/stonesService";

export const runtime = "nodejs";

/**
 * POST /api/numeroloji-klasik/taslak/taslar   { draft: { request, referenceDate, resultHash } }
 * Kaydedilmemiş kişi analizinden Numeroloji–Doğaltaş eşleştirmesi. Taslak YALNIZ önbellekten doğrulanır
 * (0 sağlayıcı çağrısı); veritabanına yazma YOK. Yanıt GET /analyses/[id]/taslar ile aynı biçimde.
 * Önbellekte yoksa / sonuç değiştiyse 409 DRAFT_STALE. Haritası olmayan taslak → 422 STONES_NOT_AVAILABLE.
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const o = body.value;
  if (!o || typeof o !== "object" || Array.isArray(o)) return classicJson(400, { ok: false, code: "INVALID_INPUT", error: "Geçersiz istek." });
  const keys = Object.keys(o as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "draft") return classicJson(400, { ok: false, code: "UNKNOWN_FIELD", error: "Beklenmeyen alan.", field: (keys.find((k) => k !== "draft") ?? "draft").slice(0, 40) });
  const dv = validateDraftRef((o as { draft?: unknown }).draft, "draft");
  if (!dv.ok) return validationResponse(dv);
  const d = await resolveDraftRow(guard, dv.value);
  if (!d.ok) return d.response;

  const view = await buildClassicStonesView({ db: guard.db, tenantId: guard.tenantId, viewerId: guard.userId, canSeeStock: resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "stones") }, d.row.result, undefined, { full: true });
  if (!view) return classicJson(422, { ok: false, code: "STONES_NOT_AVAILABLE", error: "Bu analizde taş eşleştirmesi için kişi haritası bulunmuyor." });
  return classicJson(200, { ok: true, ...view });
}
