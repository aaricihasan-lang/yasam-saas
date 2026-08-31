import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner } from "@/lib/beslenme/ownerGuard";
import { isSystemNutritionTenant } from "@/lib/beslenme/systemTenant";

export const runtime = "nodejs";

/**
 * GET: "Son Kullanılanlar" — tenant plan item'larından türetilir (YENİ TABLO YOK; §11, §49).
 *   food_id bazında en son kullanım; silinmiş custom food → snapshot adı güvenli fallback.
 *   SYSTEM + current tenant accessible union korunur (foreign tenant leak YOK — tenant-scoped).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // En son plan item'ları (tenant-scoped) → food_id bazında dedupe (en yeni korunur).
  const { data: items, error } = await db
    .from("nutrition_plan_items")
    .select("food_id, food_name_snapshot, food_ownership_snapshot, created_at")
    .eq("tenant_id", tenantId)
    .not("food_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return NextResponse.json({ ok: false, code: "RECENT_FAILED" }, { status: 500 });

  const seen = new Map<string, { food_id: string; snapshotName: string; ownership: string }>();
  for (const raw of items ?? []) {
    const it = raw as { food_id: string; food_name_snapshot: string; food_ownership_snapshot: string };
    if (!it.food_id || seen.has(it.food_id)) continue;
    seen.set(it.food_id, {
      food_id: it.food_id,
      snapshotName: it.food_name_snapshot,
      ownership: it.food_ownership_snapshot,
    });
    if (seen.size >= 20) break;
  }

  const foodIds = [...seen.keys()];
  const freshById = new Map<string, { name_tr: string; is_active: boolean; tenant_id: string }>();
  if (foodIds.length > 0) {
    const { data: foods } = await db
      .from("nutrition_foods")
      .select("id, name_tr, is_active, tenant_id")
      .in("id", foodIds);
    for (const f of foods ?? []) {
      const row = f as { id: string; name_tr: string; is_active: boolean; tenant_id: string };
      freshById.set(row.id, { name_tr: row.name_tr, is_active: row.is_active, tenant_id: row.tenant_id });
    }
  }

  const recent = [...seen.values()].map((r) => {
    const fresh = freshById.get(r.food_id);
    return {
      food_id: r.food_id,
      // Silinmiş custom food → snapshot adı fallback; canlı food → güncel ad.
      name: fresh?.name_tr ?? r.snapshotName,
      ownership: fresh ? (isSystemNutritionTenant(fresh.tenant_id) ? "system" : "custom") : r.ownership,
      available: !!fresh && fresh.is_active,
    };
  });

  return NextResponse.json({ ok: true, recent }, { headers: { "Cache-Control": "no-store" } });
}
