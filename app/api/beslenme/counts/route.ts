import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/** Genel Bakış sayaçları (owner-only, tenant-scoped, service_role head-count). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
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

    const foodsRes = await db
      .from("nutrition_foods")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const guidesRes = await db
      .from("nutrition_topics")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("topic_type", "dietary_pattern");

    const sourcesRes = await db
      .from("nutrition_sources")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const profileCount = async (frameworkId: string | null): Promise<number> => {
      if (!frameworkId) return 0;
      const { count } = await db
        .from("nutrition_topics")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("topic_type", "traditional_profile")
        .eq("framework_id", frameworkId);
      return count ?? 0;
    };

    const counts = {
      foods: foodsRes.count ?? 0,
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
