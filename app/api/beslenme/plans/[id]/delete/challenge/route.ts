import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { createDestructiveChallenge } from "@/lib/beslenme/destructiveChallenge";
import { loadPlanDeleteScope } from "@/lib/beslenme/planDeleteScope";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: "Planı Sil" AŞAMA 3 kodu. Kapsam sunucuda hesaplanır (plan adı + revizyon + gün/öğün/kalem
 * sayıları; özet bu kimliklerden). Kod 5 dk geçerli, tek kullanımlık, kullanıcı + tenant + işlem
 * ("plan_delete") + kapsama bağlı. Hiçbir kayıt SİLMEZ.
 * Veritabanında "plan_delete" işlem türü henüz tanımlı değilse (migration 20271003100100
 * uygulanmamış) → 503 DELETE_UNAVAILABLE; challenge oluşmaz, silme onayı da çalışamaz.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId, userId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const scope = await loadPlanDeleteScope(db, tenantId, id);
  if (!scope.ok) return beslenmeJson({ ok: false, code: scope.code }, scope.status);
  const s = scope.value;

  const ch = await createDestructiveChallenge(db, { tenantId, userId, action: "plan_delete", scopeKeys: s.keys });
  if (!ch.ok) {
    if (ch.code === "ACTION_UNAVAILABLE") return beslenmeJson({ ok: false, code: "DELETE_UNAVAILABLE" }, 503);
    return beslenmeJson({ ok: false, code: ch.code }, ch.status);
  }
  return NextResponse.json(
    {
      ok: true,
      challenge_id: ch.value.challenge_id,
      code: ch.value.code,
      expires_at: ch.value.expires_at,
      plan: { id: s.plan.id, title: s.plan.title, status: s.plan.status, revision_number: s.plan.revision_number },
      days: s.dayCount,
      meals: s.mealCount,
      items: s.itemCount,
      other_revisions: s.otherRevisions,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
