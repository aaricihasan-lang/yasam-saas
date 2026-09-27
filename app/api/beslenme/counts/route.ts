import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule } from "@/lib/beslenme/ownerGuard";
import { SYSTEM_NUTRITION_TENANT_ID } from "@/lib/beslenme/systemTenant";

export const runtime = "nodejs";

/**
 * Genel Bakış sayaçları (owner-only, tenant-scoped, service_role head-count).
 * Yalnız AKTİF (is_active=true) kayıtlar sayılır — liste route'larıyla aynı contract;
 * arşivlenen (is_active=false) kayıt listede görünmediği gibi sayaçta da görünmez.
 *
 * FAZ1 FINAL HARDENING (INFRA): Besin listesi (nutrition_food_search RPC) SYSTEM katalog ∪
 * uzmanın kendi (CUSTOM) besinlerini gösterir; sayaç da aynı kümeyi sayar
 * (`foods` = sistem + sizin). Ayrım için `foodsSystem` / `foodsCustom` eklendi.
 * Konu/kaynak listeleri yalnız tenant'a ait → o sayaçlar tenant-scoped kalır.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  try {
    // Class A framework id'leri (tenant-siz global vocab).
    const { data: frameworks } = await db
      .from("nutrition_traditional_frameworks")
      .select("id, code")
      .in("code", ["mizac", "blood_type"]);
    const fwId = (code: string): string | null =>
      (frameworks ?? []).find((f: { code: string; id: string }) => f.code === code)?.id ?? null;
    const mizacId = fwId("mizac");
    const bloodId = fwId("blood_type");

    const countFoods = async (ownerTenantId: string): Promise<number> => {
      const { count } = await db
        .from("nutrition_foods")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ownerTenantId)
        .eq("is_active", true);
      return count ?? 0;
    };
    const isSystemTenant = tenantId === SYSTEM_NUTRITION_TENANT_ID;
    const [foodsSystem, foodsCustom] = await Promise.all([
      countFoods(SYSTEM_NUTRITION_TENANT_ID),
      isSystemTenant ? Promise.resolve(0) : countFoods(tenantId),
    ]);

    const guidesRes = await db
      .from("nutrition_topics")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("topic_type", "dietary_pattern")
      .eq("is_active", true);

    const sourcesRes = await db
      .from("nutrition_sources")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    const profileCount = async (frameworkId: string | null): Promise<number> => {
      if (!frameworkId) return 0;
      const { count } = await db
        .from("nutrition_topics")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("topic_type", "traditional_profile")
        .eq("framework_id", frameworkId)
        .eq("is_active", true);
      return count ?? 0;
    };

    const counts = {
      foods: foodsSystem + foodsCustom,
      foodsSystem,
      foodsCustom,
      guides: guidesRes.count ?? 0,
      mizac: await profileCount(mizacId),
      bloodType: await profileCount(bloodId),
      sources: sourcesRes.count ?? 0,
    };

    return NextResponse.json({ ok: true, counts }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, code: "COUNT_FAILED" }, { status: 500 });
  }
}
