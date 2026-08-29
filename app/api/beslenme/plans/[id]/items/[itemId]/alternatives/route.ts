import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { getPlan, getItemScope } from "@/lib/beslenme/planEngine";
import { resolveAlternativesForItem } from "@/lib/beslenme/alternativeEngine";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string; itemId: string }> };

/**
 * GET: bir plan item için "Yaklaşık Besin Alternatifleri".
 *   UI metni: "Yaklaşık Besin Alternatifleri" / "Benzer enerji ve makro besin profiline göre
 *   hesaplanır." — TIBBİ/klinik iddia YOK; deterministik sayısal benzerlik.
 *
 * GÜVENLİK: hedef enerji/makro/gram DAİMA DB'deki donmuş item snapshot'ından okunur; client
 *   YALNIZ opsiyon gönderebilir (sameGroupOnly, all). Snapshot/hedef değeri client'tan ALINMAZ.
 *   IDOR: plan + item guard.tenantId'e ait olmalı (yoksa 404). Read-only (demo gate gerekmez).
 */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id, itemId } = await ctx.params;
  if (!isUuid(id) || !isUuid(itemId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  // Plan + item tenant-scoped doğrulama (IDOR fail-closed).
  const plan = await getPlan(db, tenantId, id);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  const scope = await getItemScope(db, tenantId, itemId);
  if (!scope || scope.plan_id !== id) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  // Opsiyonlar YALNIZ query'den (hedef/snapshot DEĞİL): sameGroupOnly + all.
  const sp = req.nextUrl.searchParams;
  const sameGroupOnly = sp.get("sameGroupOnly") === "1" || sp.get("sameGroupOnly") === "true";
  const all = sp.get("all") === "1" || sp.get("all") === "true";

  const result = await resolveAlternativesForItem(db, tenantId, itemId, { sameGroupOnly });
  if (!result.ok) return beslenmeJson({ ok: false, code: result.error.code }, result.error.status);

  // `all` (varsayılan false) → UI kısa liste (8); all=true → tam sıralı liste (≤20).
  const alternatives = all ? result.alternatives : result.alternatives.slice(0, 8);

  return NextResponse.json(
    {
      ok: true,
      target: { name: result.target.name, grams: result.target.grams, energyTotal: result.target.energyTotal },
      band: result.band,
      alternatives,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
