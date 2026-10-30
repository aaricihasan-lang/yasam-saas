import { NextRequest } from "next/server";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid } from "@/lib/numeroloji-klasik/input";
import { classicError, classicJson, classicNotFound } from "@/lib/numeroloji-klasik/server/http";
import { getAnalysis } from "@/lib/numeroloji-klasik/server/repository";
import { buildClassicStonesView } from "@/lib/numeroloji-klasik/server/stonesService";

export const runtime = "nodejs";

/**
 * GET /api/numeroloji-klasik/analyses/[id]/taslar — kayıtlı kişi analizinden Numeroloji–Doğaltaş eşleştirmesi.
 * 0 sağlayıcı çağrısı (kayıtlı harita + katalog + Doğaltaş Kütüphanesi yayın RPC'leri + stok select).
 * → { ok, mode: "library"|"text_only", reason?, reasonText?, result: StoneMatchResult, stock: { [ad]: adet } }
 * Başka tenant / silinmiş / yok → 404. Haritası olmayan analiz → 422 STONES_NOT_AVAILABLE.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();

  const r = await getAnalysis(guard.db, guard.tenantId, id.toLowerCase());
  if (!r.ok) return r.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
  const view = await buildClassicStonesView({ db: guard.db, tenantId: guard.tenantId, viewerId: guard.userId, canSeeStock: resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "stones") }, r.value.result, undefined, { full: true });
  if (!view) return classicJson(422, { ok: false, code: "STONES_NOT_AVAILABLE", error: "Bu analizde taş eşleştirmesi için kişi haritası bulunmuyor." });
  return classicJson(200, { ok: true, ...view });
}
