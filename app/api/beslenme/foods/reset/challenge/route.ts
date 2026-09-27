import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { hasOnlyKeys } from "@/lib/beslenme/contracts";
import { isSystemNutritionTenant } from "@/lib/beslenme/systemTenant";
import { computeFoodResetScope } from "@/lib/beslenme/foodReset";
import { createDestructiveChallenge } from "@/lib/beslenme/destructiveChallenge";

export const runtime = "nodejs";

/**
 * POST /api/beslenme/foods/reset/challenge — "Sistem değerine dön" AŞAMA 3 kodunu üret.
 * body: { scope: "one", food_id } | { scope: "all" }
 * Kapsam sunucuda hesaplanır (yalnız kişisel kopyalar; özgün besinler hariç; rehberde kullanılanlar
 * ayrı listelenir). Dönüş: kod + etkilenecek kayıt sayısı/adları. Kod 5 dk geçerli, tek kullanımlık.
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
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["scope", "food_id"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const scope = await computeFoodResetScope(db, tenantId, body.scope, body.food_id);
  if (!scope.ok) return beslenmeJson({ ok: false, code: scope.code }, scope.status);
  if (scope.ids.length === 0) {
    return beslenmeJson({ ok: false, code: "NOTHING_TO_RESET", blocked: scope.blocked }, 409);
  }

  const action = body.scope === "one" ? "food_reset_one" : "food_reset_all";
  const ch = await createDestructiveChallenge(db, { tenantId, userId, action, scopeKeys: scope.ids });
  if (!ch.ok) return beslenmeJson({ ok: false, code: ch.code }, ch.status);
  return NextResponse.json(
    {
      ok: true,
      ...ch.value,
      names: scope.names.slice(0, 50),
      more: Math.max(0, scope.names.length - 50),
      blocked: scope.blocked,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
