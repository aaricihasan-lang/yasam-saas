import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { SYSTEM_NUTRITION_TENANT_ID, isSystemNutritionTenant } from "@/lib/beslenme/systemTenant";
import { computeFoodResetScope } from "@/lib/beslenme/foodReset";
import { consumeDestructiveChallenge } from "@/lib/beslenme/destructiveChallenge";
import { mapFoodRpcError } from "@/lib/beslenme/foodEngine";

export const runtime = "nodejs";

/** GET /api/beslenme/foods/reset — kişiselleştirilmiş (sistemden türemiş) besin sayısı (UI butonu için). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  if (isSystemNutritionTenant(tenantId)) return NextResponse.json({ ok: true, count: 0 });
  const { count, error } = await db
    .from("nutrition_foods")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .not("origin_food_id", "is", null);
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, count: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/beslenme/foods/reset — "Sistem değerine dön" SON ADIM.
 * body: { scope: "one", food_id, challenge_id, code } | { scope: "all", challenge_id, code }
 * Sunucu kapsamı YENİDEN hesaplar ve challenge'ı (kullanıcı + tenant + işlem + kapsam özeti +
 * kod + süre + tek kullanım) atomik tüketir; geçerli challenge olmadan hiçbir kayıt silinmez.
 * Etki: yalnız bu tenant'ın kişisel kopyaları kaldırılır, sistem besini yeniden kullanılır.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId, userId } = guard;
  if (isSystemNutritionTenant(tenantId)) return beslenmeJson({ ok: false, code: "SYSTEM_READONLY" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["scope", "food_id", "challenge_id", "code"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const scope = await computeFoodResetScope(db, tenantId, body.scope, body.food_id);
  if (!scope.ok) return beslenmeJson({ ok: false, code: scope.code }, scope.status);
  if (scope.ids.length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_RESET" }, 409);

  const action = body.scope === "one" ? "food_reset_one" : "food_reset_all";
  const rejected = await consumeDestructiveChallenge(db, {
    tenantId,
    userId,
    action,
    challengeId: body.challenge_id,
    code: body.code,
    scopeKeys: scope.ids,
  });
  if (rejected) return beslenmeJson({ ok: false, code: rejected.code }, rejected.status);

  const { data, error } = await db.rpc("nutrition_food_reset_personalized", {
    p_tenant_id: tenantId,
    p_system_tenant_id: SYSTEM_NUTRITION_TENANT_ID,
    p_food_ids: scope.ids,
  });
  if (error) {
    const m = mapFoodRpcError(error.code);
    return beslenmeJson({ ok: false, code: m.code === "WRITE_FAILED" ? "RESET_FAILED" : m.code }, m.status);
  }
  return NextResponse.json({ ok: true, reset: Number(data ?? 0) });
}
