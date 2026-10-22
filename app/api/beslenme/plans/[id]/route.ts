import { NextRequest, NextResponse } from "next/server";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { cleanStr, cleanNumber, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { PLAN_COLUMNS, PLAN_PATCH_KEYS, PLAN_STATUSES, isUuid } from "@/lib/beslenme/planContracts";
import { isPlanEditable, loadPlanDaySummaries, mapRpcError } from "@/lib/beslenme/planEngine";
import { requireClientInTenant, clientDisplayName } from "@/lib/danisan/clientGuard";
import { consumeDestructiveChallenge } from "@/lib/beslenme/destructiveChallenge";
import { loadPlanDeleteScope } from "@/lib/beslenme/planDeleteScope";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/** GET: plan + lightweight day summaries (meal_count + energy total). */
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  const { data: plan, error } = await db
    .from("nutrition_plans").select(PLAN_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);

  let days: Awaited<ReturnType<typeof loadPlanDaySummaries>>;
  try {
    days = await loadPlanDaySummaries(db, tenantId, id);
  } catch {
    // BES-02: gün özeti okunamadı → boş plan gibi GÖSTERİLMEZ.
    return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  }

  // authority (module/client) + bağlı danışan → editör bağlam navigasyonu ("Danışana Dön").
  // NOT: authority UI'da feature AYRIMI YARATMAZ (admin↔uzman paritesi); yalnız binding bağlamı.
  let boundClient: { id: string; display_name: string } | null = null;
  if (guard.boundClientId) {
    const c = await requireClientInTenant(db, tenantId, guard.boundClientId);
    if (c) boundClient = { id: c.id, display_name: clientDisplayName(c) };
  }
  return NextResponse.json(
    { ok: true, plan, days, authority: guard.authority, boundClient },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH: plan meta (title/note/daily_energy_target/status). Archived → 403. Optimistic concurrency. */
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, PLAN_PATCH_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  // BES-01 (AŞAMA 2 / B1): sürüm ZORUNLU. Eskiden expectedUpdatedAt gönderilmezse koşulsuz
  // yazılıyordu; tek istemci (plan editörü) her zaman gönderir.
  const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
  if (!expected) return beslenmeJson({ ok: false, code: "VERSION_REQUIRED" }, 400);

  const stale = async () => {
    await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_updated", subEntity: "plan", errorClass: "conflict" });
    return beslenmeJson({ ok: false, code: "PLAN_STALE" }, 409);
  };

  const { data: current, error: readErr } = await db
    .from("nutrition_plans").select("id, status, updated_at").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (readErr) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
  const plan = current as { id: string; status: string; updated_at: string } | null;
  if (!plan) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
  if (!isPlanEditable(plan.status)) return beslenmeJson({ ok: false, code: "PLAN_ARCHIVED" }, 403);
  // Hızlı ret (asıl güvence aşağıdaki koşullu UPDATE'tir).
  if (expected !== plan.updated_at) return stale();

  const patch: Record<string, unknown> = {};
  if ("title" in body) {
    const t = cleanStr(body.title, 200);
    if (!t) return beslenmeJson({ ok: false, code: "TITLE_REQUIRED" }, 400);
    patch.title = t;
  }
  if ("note" in body) patch.note = cleanStr(body.note, 4000);
  if ("daily_energy_target" in body) {
    if (body.daily_energy_target == null) patch.daily_energy_target = null;
    else {
      const v = cleanNumber(body.daily_energy_target, { min: 0.0001, max: 100000 });
      if (v == null) return beslenmeJson({ ok: false, code: "BAD_TARGET" }, 400);
      patch.daily_energy_target = v;
    }
  }
  if ("status" in body) {
    // Beslenme'de kullanıcıya yönelik arşiv kaldırıldı: 'archived' durumu artık ÜRETİLMEZ.
    if (
      typeof body.status !== "string" ||
      !(PLAN_STATUSES as readonly string[]).includes(body.status) ||
      body.status === "archived"
    ) {
      return beslenmeJson({ ok: false, code: "BAD_STATUS" }, 400);
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) return beslenmeJson({ ok: false, code: "NOTHING_TO_UPDATE" }, 400);

  // ATOMİK CAS: karşılaştırma ile yazma TEK UPDATE'te (WHERE updated_at = beklenen). Eşzamanlı
  // ikinci yazar satır kilidini bekler, kilit bırakılınca koşul yeni satırda yeniden değerlendirilir;
  // trg_nutrition_plans_updated_at sürümü ilerlettiği için 0 satır döner → 409 (veri ezilmez).
  // Yalnız taslak/aktif planlar (arşiv bu arada üretilemez ama koşul yine de sabitlenir).
  const { data, error } = await db
    .from("nutrition_plans").update(patch)
    .eq("tenant_id", tenantId).eq("id", id).eq("updated_at", expected).in("status", ["draft", "active"])
    .select(PLAN_COLUMNS);
  if (error) {
    await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_updated", subEntity: "plan", errorClass: "server" });
    return beslenmeJson({ ok: false, code: "UPDATE_FAILED" }, 500);
  }
  const rows = (data ?? []) as unknown[];
  if (rows.length !== 1) {
    // 0 satır: sürüm değişti (ya da plan bu arada silindi) → hiçbir şey yazılmadı.
    const { data: still, error: e2 } = await db
      .from("nutrition_plans").select("id").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (e2) return beslenmeJson({ ok: false, code: "READ_FAILED" }, 500);
    if (!still) return beslenmeJson({ ok: false, code: "NOT_FOUND" }, 404);
    return stale();
  }
  await trackUsage(guard, req, { module: "beslenme", action: "record_updated", subEntity: "plan", resourceId: id });
  return NextResponse.json({ ok: true, plan: rows[0] });
}

/**
 * DELETE: bu plan REVİZYONUNU kalıcı sil (cascade: gün/öğün/item/nutrient). Admin↔uzman parity:
 * requireBeslenmePlanAccess (module | bound-plan client). Atomik nutrition_plan_delete_revision
 * RPC: tek revizyon silinir; family'de BAŞKA revizyon varsa binding KORUNUR, SON revizyon
 * silinirse family-binding de temizlenir (yetim binding önle). GERÇEK client kaydına dokunulmaz.
 * RPC FOR UPDATE ile eşzamanlı son-revizyon silmelerine karşı yarışsızdır (bkz. migration).
 *
 * 3 AŞAMALI KORUMA ("Günü Temizle" ile aynı): kapsam + ikinci uyarı UI'da; SON ADIM burada sunucu
 * doğrulamalı 4 haneli kod: body { challenge_id, code } ZORUNLU (…/delete/challenge ile üretilir).
 * Kapsam (plan + family + revizyon + gün/öğün/kalem kimlikleri) onay anında YENİDEN hesaplanır;
 * değiştiyse, kod yanlışsa, süresi dolmuş/kullanılmışsa veya başka işlem/plan içinse → hiçbir
 * kayıt silinmez. Geçerli challenge olmadan → 400 CHALLENGE_REQUIRED.
 */
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId, userId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || !hasOnlyKeys(body, ["challenge_id", "code"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }

  const scope = await loadPlanDeleteScope(db, tenantId, id);
  if (!scope.ok) return beslenmeJson({ ok: false, code: scope.code }, scope.status);

  // Challenge TÜKETİLMEDEN silme RPC'si çağrılmaz (yanlış kod / başka plan / başka işlem → 0 silme).
  const rejected = await consumeDestructiveChallenge(db, {
    tenantId,
    userId,
    action: "plan_delete",
    challengeId: body.challenge_id,
    code: body.code,
    scopeKeys: scope.value.keys,
  });
  if (rejected) return beslenmeJson({ ok: false, code: rejected.code }, rejected.status);

  const { data, error } = await db.rpc("nutrition_plan_delete_revision", {
    p_tenant_id: tenantId,
    p_plan_id: id,
  });
  if (error) {
    const m = mapRpcError(error.code);
    const errorClass = usageErrorClassForStatus(m.status);
    if (errorClass) {
      await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_deleted", subEntity: "plan", errorClass });
    }
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }
  await trackUsage(guard, req, { module: "beslenme", action: "record_deleted", subEntity: "plan", resourceId: id });
  return NextResponse.json({ ok: true, result: data });
}
