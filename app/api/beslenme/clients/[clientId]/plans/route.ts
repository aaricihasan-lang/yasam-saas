import { NextRequest, NextResponse } from "next/server";
import { beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";

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
