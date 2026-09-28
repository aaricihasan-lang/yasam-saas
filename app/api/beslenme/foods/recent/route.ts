import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule } from "@/lib/beslenme/ownerGuard";
import { isSystemNutritionTenant } from "@/lib/beslenme/systemTenant";
import { resolveEffectiveFoodsBatch } from "@/lib/beslenme/effectiveBatch";

export const runtime = "nodejs";

/**
 * GET: "Son Kullanılanlar" — tenant plan item'larından türetilir (YENİ TABLO YOK; §11, §49).
 *   food_id bazında en son kullanım; silinmiş custom food → snapshot adı güvenli fallback.
 *   SYSTEM + current tenant accessible union korunur (foreign tenant leak YOK — tenant-scoped).
 *   EFFECTIVE: sistem besininin kişisel kopyası varsa KOPYA döner (food_id = kopya); çalışma
 *   alanından kaldırılan besin "kullanılamaz" işaretlenir. Besin okuma yalnız tenant ∪ SYSTEM.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
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
  // Effective eşleme (tenant ∪ SYSTEM; başka tenant satırı ASLA okunmaz).
  const effective = await resolveEffectiveFoodsBatch(db, tenantId, foodIds);

  const byEffective = new Map<string, { food_id: string; name: string; ownership: string; available: boolean }>();
  for (const r of seen.values()) {
    const fresh = effective.get(r.food_id) ?? null;
    const key = fresh?.id ?? r.food_id;
    if (byEffective.has(key)) continue; // aynı effective besin (sistem id + kopya id) tek satır
    byEffective.set(key, {
      food_id: key,
      // Silinmiş/kaldırılmış besin → snapshot adı fallback; canlı besin → güncel ad.
      name: fresh?.name_tr ?? r.snapshotName,
      ownership: fresh ? (isSystemNutritionTenant(fresh.tenant_id) ? "system" : "custom") : r.ownership,
      available: !!fresh,
    });
  }
  const recent = [...byEffective.values()];

  return NextResponse.json({ ok: true, recent }, { headers: { "Cache-Control": "no-store" } });
}
