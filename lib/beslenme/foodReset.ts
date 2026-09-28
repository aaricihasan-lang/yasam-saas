import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectiveFood, listFoodTopicUsage } from "./foodEngine";

/**
 * "Sistem değerine dön" KAPSAMI — sunucu tarafında hesaplanır (challenge oluşturma + onay anında
 * AYNI fonksiyon → kapsam değiştiyse özet tutmaz, işlem reddedilir).
 *
 * YALNIZ sistem besininden türemiş kişisel kopyalar (origin_food_id DOLU) kapsamdadır; uzmanın
 * kendi oluşturduğu özgün besinler ASLA kapsama girmez. Rehberde kullanılan kopya silinemeyeceği
 * için kapsam DIŞINDA tutulur ve kullanıcıya ayrıca listelenir (sessiz atlama yok).
 */

export type ResetScope =
  | { ok: true; ids: string[]; names: string[]; blocked: Array<{ name: string; topics: string[] }> }
  | { ok: false; code: string; status: number };

export async function computeFoodResetScope(
  db: SupabaseClient,
  tenantId: string,
  scope: unknown,
  foodId: unknown,
): Promise<ResetScope> {
  let rows: Array<{ id: string; name_tr: string }> = [];
  if (scope === "one") {
    if (typeof foodId !== "string") return { ok: false, code: "BAD_FOOD", status: 400 };
    const eff = await resolveEffectiveFood(db, tenantId, foodId);
    if (!eff || eff.tenant_id !== tenantId || !eff.origin_food_id) {
      return { ok: false, code: "NOT_PERSONALIZED", status: 404 };
    }
    const { data } = await db
      .from("nutrition_foods")
      .select("id, name_tr")
      .eq("tenant_id", tenantId)
      .eq("id", eff.id)
      .not("origin_food_id", "is", null)
      .maybeSingle();
    if (!data) return { ok: false, code: "NOT_PERSONALIZED", status: 404 };
    rows = [data as { id: string; name_tr: string }];
  } else if (scope === "all") {
    const { data, error } = await db
      .from("nutrition_foods")
      .select("id, name_tr")
      .eq("tenant_id", tenantId)
      .not("origin_food_id", "is", null)
      .order("name_tr", { ascending: true })
      .limit(5000);
    if (error) return { ok: false, code: "READ_FAILED", status: 500 };
    rows = (data as Array<{ id: string; name_tr: string }> | null) ?? [];
  } else {
    return { ok: false, code: "BAD_SCOPE", status: 400 };
  }

  const usage = await listFoodTopicUsage(db, tenantId, rows.map((r) => r.id));
  const usedBy = new Map<string, Set<string>>();
  for (const u of usage) {
    if (!usedBy.has(u.food_id)) usedBy.set(u.food_id, new Set());
    usedBy.get(u.food_id)!.add(u.title);
  }
  const ids: string[] = [];
  const names: string[] = [];
  const blocked: Array<{ name: string; topics: string[] }> = [];
  for (const r of rows) {
    const topics = usedBy.get(r.id);
    if (topics && topics.size > 0) blocked.push({ name: r.name_tr, topics: [...topics] });
    else {
      ids.push(r.id);
      names.push(r.name_tr);
    }
  }
  return { ok: true, ids, names, blocked };
}
