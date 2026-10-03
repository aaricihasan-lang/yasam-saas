import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPaged } from "./pagedFetch";

/**
 * "Planı Sil" (tüm plan REVİZYONU) kapsamı — sunucu tarafında hesaplanır; challenge oluşturma ve
 * onay anında AYNI fonksiyon çalışır → arada tek gün/öğün/kalem eklenip silinse ya da plan başka
 * bir revizyon/aileye ait olsa kapsam özeti tutmaz, işlem reddedilir (kullanıcının görmediği kayıt
 * silinmez).
 *
 * Özet anahtarları: plan id + family + revizyon numarası + günün/öğünün/kalemin kimlikleri.
 * Yalnız düz kolon seçimleri (embed YOK) ve sayfalı okuma (büyük planlarda satır kırpılmaz).
 * Silme yalnız HEDEF revizyonu kapsar; aynı ailedeki diğer revizyonlar sayılır ama silinmez.
 */
export type PlanDeleteScope = {
  plan: { id: string; title: string; status: string; revision_number: number; plan_family_id: string };
  dayCount: number;
  mealCount: number;
  itemCount: number;
  /** Aynı ailede KALACAK diğer revizyon sayısı (bilgi amaçlı; silinmez). */
  otherRevisions: number;
  keys: string[];
};

export async function loadPlanDeleteScope(
  db: SupabaseClient,
  tenantId: string,
  planId: string,
): Promise<{ ok: true; value: PlanDeleteScope } | { ok: false; code: string; status: number }> {
  const { data: planData, error: planErr } = await db
    .from("nutrition_plans")
    .select("id, title, status, revision_number, plan_family_id")
    .eq("tenant_id", tenantId)
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return { ok: false, code: "READ_FAILED", status: 500 };
  if (!planData) return { ok: false, code: "NOT_FOUND", status: 404 };
  const plan = planData as PlanDeleteScope["plan"];

  try {
    const [days, meals, items] = await Promise.all([
      fetchAllPaged<{ id: string }>((from, to) =>
        db.from("nutrition_plan_days").select("id").eq("tenant_id", tenantId).eq("plan_id", planId)
          .order("id", { ascending: true }).range(from, to),
      ),
      fetchAllPaged<{ id: string }>((from, to) =>
        db.from("nutrition_plan_meals").select("id").eq("tenant_id", tenantId).eq("plan_id", planId)
          .order("id", { ascending: true }).range(from, to),
      ),
      fetchAllPaged<{ id: string }>((from, to) =>
        db.from("nutrition_plan_items").select("id").eq("tenant_id", tenantId).eq("plan_id", planId)
          .order("id", { ascending: true }).range(from, to),
      ),
    ]);
    const { count: familyCount, error: famErr } = await db
      .from("nutrition_plans")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("plan_family_id", plan.plan_family_id);
    if (famErr) return { ok: false, code: "READ_FAILED", status: 500 };

    return {
      ok: true,
      value: {
        plan,
        dayCount: days.length,
        mealCount: meals.length,
        itemCount: items.length,
        otherRevisions: Math.max(0, (familyCount ?? 1) - 1),
        keys: [
          `plan:${plan.id}`,
          `family:${plan.plan_family_id}`,
          `revision:${plan.revision_number}`,
          ...days.map((d) => `day:${d.id}`),
          ...meals.map((m) => `meal:${m.id}`),
          ...items.map((i) => `item:${i.id}`),
        ],
      },
    };
  } catch {
    return { ok: false, code: "READ_FAILED", status: 500 };
  }
}
