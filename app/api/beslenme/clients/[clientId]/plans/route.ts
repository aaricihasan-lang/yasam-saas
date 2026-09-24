import { NextRequest, NextResponse } from "next/server";
import { beslenmeJson, denyDemoMutation } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";
import { createPlanForTenant } from "@/lib/beslenme/planEngine";
import { mapAssignError } from "@/lib/beslenme/clientContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ clientId: string }> };

const PLAN_META = "id, title, status, plan_family_id, revision_number, start_date, end_date, daily_energy_target, updated_at";

type PlanMeta = {
  id: string; title: string; status: string; plan_family_id: string;
  revision_number: number; start_date: string; end_date: string;
  daily_energy_target: number | null; updated_at: string;
};

/** GET: bu danışana bağlı plan AİLELERİ + revizyon metadata (item/nutrient YOK; §20 N+1 yok). */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const { db, tenantId } = g.guard;

  const { data: binds, error: bErr } = await db
    .from("nutrition_plan_clients")
    .select("plan_family_id, assigned_at")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (bErr) return beslenmeJson({ ok: false, code: "BINDING_READ_FAILED" }, 500);

  const familyIds = (binds ?? []).map((b) => (b as { plan_family_id: string }).plan_family_id);
  if (familyIds.length === 0) return NextResponse.json({ ok: true, families: [] }, { headers: { "Cache-Control": "no-store" } });

  const { data: plans, error: pErr } = await db
    .from("nutrition_plans")
    .select(PLAN_META)
    .eq("tenant_id", tenantId)
    .in("plan_family_id", familyIds)
    .order("revision_number", { ascending: false });
  if (pErr) return beslenmeJson({ ok: false, code: "PLANS_READ_FAILED" }, 500);

  // aile bazında grupla; latest = en yüksek revizyon.
  const byFamily = new Map<string, PlanMeta[]>();
  for (const p of (plans ?? []) as PlanMeta[]) {
    const arr = byFamily.get(p.plan_family_id) ?? [];
    arr.push(p);
    byFamily.set(p.plan_family_id, arr);
  }
  const families = familyIds
    .filter((fid) => byFamily.has(fid))
    .map((fid) => {
      const revs = (byFamily.get(fid) ?? []).sort((a, b) => b.revision_number - a.revision_number);
      return { plan_family_id: fid, latest: revs[0] ?? null, revisions: revs };
    })
    .sort((a, b) => (b.latest?.updated_at ?? "").localeCompare(a.latest?.updated_at ?? ""));

  return NextResponse.json({ ok: true, families }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST: bu danışan İÇİN yeni plan oluştur + AYNI istekte family'yi danışana BAĞLA.
 *
 * Global POST /api/beslenme/plans (owner-only) uzmana AÇILMAZ — uzman yeni planı YALNIZ
 * danışan içinden bu client-scoped uçtan oluşturur. Kapı: requireBeslenmeClient (clients
 * yetkisi + tenant + client-ownership). tenant_id/client_id/user_id body'den KABUL EDİLMEZ;
 * createPlanForTenant yalnız PLAN_CREATE_KEYS kabul eder, tenant server session'dan gelir.
 *
 * ATOMIKLİK (§3): create başarılı ama bind BAŞARISIZ ise → oluşan plan family'si
 * compensating delete ile GERİ ALINIR. "standalone/unbound plan bırak" davranışı uzmanda
 * YASAK. Cleanup da başarısızsa güvenli 500 (kullanıcıya başarı gösterme); binding olmadığı
 * için plan zaten expert plan-guard'ında erişilemez kalır.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const demo = denyDemoMutation(g.guard);
  if (demo) return demo;
  const { db, tenantId, userId } = g.guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }

  const created = await createPlanForTenant(db, tenantId, body);
  if (!created.ok) return beslenmeJson({ ok: false, code: created.code }, created.status);

  const { error: assignErr } = await db.rpc("nutrition_plan_assign_client", {
    p_tenant_id: tenantId,
    p_plan_id: created.plan.id,
    p_client_id: clientId,
    p_assigned_by: userId,
  });
  if (assignErr) {
    // Compensating delete: yeni family'nin TÜM plan satırlarını sil (cascade: gün/öğün/item).
    // Binding hiç oluşmadığından cascade-trigger devreye girmez; doğrudan plan silmesi güvenli.
    const { error: cleanupErr } = await db
      .from("nutrition_plans")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("plan_family_id", created.plan.plan_family_id);
    if (cleanupErr) {
      console.error("[beslenme] client-scoped plan create: bind failed AND cleanup failed", {
        tenantId, clientId, planId: created.plan.id, planFamilyId: created.plan.plan_family_id,
        assignCode: assignErr.code, cleanupCode: cleanupErr.code,
      });
      return beslenmeJson({ ok: false, code: "PLAN_BIND_FAILED" }, 500);
    }
    const m = mapAssignError(assignErr.code);
    return beslenmeJson({ ok: false, code: m.code }, m.status);
  }

  return NextResponse.json({ ok: true, plan: created.plan }, { status: 201 });
}
