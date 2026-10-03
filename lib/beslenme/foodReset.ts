import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectiveFood, listFoodTopicUsage } from "./foodEngine";
import { chunkIds, fetchAllPaged } from "./pagedFetch";

/**
 * "Sistem değerine dön" KAPSAMI — sunucu tarafında hesaplanır (challenge oluşturma + onay anında
 * AYNI fonksiyon → kapsam değiştiyse özet tutmaz, işlem reddedilir).
 *
 * YALNIZ sistem besininden türemiş kişisel kopyalar (origin_food_id DOLU) kapsamdadır; uzmanın
 * kendi oluşturduğu özgün besinler ASLA kapsama girmez. Rehberde kullanılan kopya silinemeyeceği
 * için kapsam DIŞINDA tutulur ve kullanıcıya ayrıca listelenir (sessiz atlama yok).
 */

export type ResetScope =
  | {
      ok: true;
      ids: string[];
      names: string[];
      blocked: Array<{ name: string; topics: string[] }>;
      /** Kapsamdaki her kopya → türediği SİSTEM besini (referans yeniden bağlama için). */
      origins: Array<{ id: string; origin_food_id: string }>;
    }
  | { ok: false; code: string; status: number };

export async function computeFoodResetScope(
  db: SupabaseClient,
  tenantId: string,
  scope: unknown,
  foodId: unknown,
): Promise<ResetScope> {
  let rows: Array<{ id: string; name_tr: string; origin_food_id: string }> = [];
  if (scope === "one") {
    if (typeof foodId !== "string") return { ok: false, code: "BAD_FOOD", status: 400 };
    const eff = await resolveEffectiveFood(db, tenantId, foodId);
    if (!eff || eff.tenant_id !== tenantId || !eff.origin_food_id) {
      return { ok: false, code: "NOT_PERSONALIZED", status: 404 };
    }
    const { data } = await db
      .from("nutrition_foods")
      .select("id, name_tr, origin_food_id")
      .eq("tenant_id", tenantId)
      .eq("id", eff.id)
      .not("origin_food_id", "is", null)
      .maybeSingle();
    if (!data) return { ok: false, code: "NOT_PERSONALIZED", status: 404 };
    rows = [data as { id: string; name_tr: string; origin_food_id: string }];
  } else if (scope === "all") {
    const { data, error } = await db
      .from("nutrition_foods")
      .select("id, name_tr, origin_food_id")
      .eq("tenant_id", tenantId)
      .not("origin_food_id", "is", null)
      .order("name_tr", { ascending: true })
      .limit(5000);
    if (error) return { ok: false, code: "READ_FAILED", status: 500 };
    rows = (data as Array<{ id: string; name_tr: string; origin_food_id: string }> | null) ?? [];
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
  const origins: Array<{ id: string; origin_food_id: string }> = [];
  for (const r of rows) {
    const topics = usedBy.get(r.id);
    if (topics && topics.size > 0) blocked.push({ name: r.name_tr, topics: [...topics] });
    else {
      ids.push(r.id);
      names.push(r.name_tr);
      origins.push({ id: r.id, origin_food_id: r.origin_food_id });
    }
  }
  return { ok: true, ids, names, blocked, origins };
}

/**
 * Kişisel kopyaya işaret eden SOFT food_id referansları (fiziksel FK YOK → kopya silinince
 * referans boşa düşer). "Sistem değerine dön" kopyayı sildiğinde bu satırlar kopyanın türediği
 * SİSTEM besinine yeniden bağlanır; aksi halde plan kalemi "besini çalışma alanınızda artık
 * bulunmuyor" (unavailable) görünür, porsiyon düzenleme/"Besin değerlerini güncelle" çalışmaz.
 *
 * Tablo kararları:
 *   • nutrition_plan_items          → YENİDEN BAĞLA (taslak/aktif/eski tüm revizyonlar; snapshot DEĞİŞMEZ)
 *   • nutrition_template_items      → YENİDEN BAĞLA (şablon uygulandığında aynı lineage; snapshot DEĞİŞMEZ)
 *   • nutrition_client_food_preferences → YENİDEN BAĞLA (food_label önbelleği DEĞİŞMEZ; "kaçınılan
 *     besin" uyarısı plan kalemiyle AYNI id üzerinden eşleşmeye devam eder — ikisi birlikte taşınır)
 *   • nutrition_topic_foods          → DOKUNULMAZ: rehberde kullanılan kopya reset kapsamı DIŞINDA
 *     (computeFoodResetScope "blocked"; DB RESTRICT FK)
 *   • nutrition_food_nutrients / portions / traditional / external_refs / food_sources → kopyanın
 *     KENDİ alt kayıtları; kopyayla birlikte silinir (doğru davranış)
 *   • nutrition_food_tenant_hidden   → yalnız SİSTEM id tutar (reset RPC zaten temizler)
 */
export const FOOD_REFERENCE_TABLES = [
  "nutrition_plan_items",
  "nutrition_template_items",
  "nutrition_client_food_preferences",
] as const;

/**
 * Kopya → SİSTEM besini referans yeniden bağlama (tenant-scoped; yalnız food_id değişir).
 *
 * GÜVENLİ ÇÜNKÜ DEĞER-NÖTR: kopya varken effective çözüm (SQL nutrition_food_resolve_effective +
 * TS computeEffectiveMap) bir SİSTEM id'sini bu tenant için KOPYAYA yönlendirir. Yani referansı
 * kopyadan SİSTEM id'sine taşımak, reset başarısız olsa bile hiçbir okuma sonucunu değiştirmez
 * (aynı kopya çözülür); reset başarılı olunca aynı id doğal olarak sistem besinine çözülür.
 * Bu yüzden ayrı transaction / yeni migration gerekmez: reset RPC'sinden ÖNCE çağrılır ve
 * aradaki yarış penceresinde eklenen kalemler için reset SONRASI bir kez daha çağrılır.
 * Snapshot kolonlarına (ad/sahiplik/porsiyon/nutrient) DOKUNULMAZ.
 */
export async function remapFoodReferencesToOrigin(
  db: SupabaseClient,
  tenantId: string,
  pairs: ReadonlyArray<{ id: string; origin_food_id: string }>,
): Promise<{ ok: true; remapped: number } | { ok: false }> {
  const originOf = new Map(pairs.filter((p) => p.id && p.origin_food_id).map((p) => [p.id, p.origin_food_id]));
  if (originOf.size === 0) return { ok: true, remapped: 0 };
  let remapped = 0;
  try {
    for (const table of FOOD_REFERENCE_TABLES) {
      // Önce yalnız gerçekten referans verilen kopyaları bul (N kopya × tablo UPDATE'i yerine).
      const used = new Set<string>();
      for (const part of chunkIds([...originOf.keys()], 200)) {
        const rows = await fetchAllPaged<{ id: string; food_id: string }>((from, to) =>
          db.from(table).select("id, food_id").eq("tenant_id", tenantId).in("food_id", part)
            .order("id", { ascending: true }).range(from, to),
        );
        for (const r of rows) used.add(r.food_id);
      }
      for (const forkId of used) {
        const { data, error } = await db
          .from(table)
          .update({ food_id: originOf.get(forkId) })
          .eq("tenant_id", tenantId)
          .eq("food_id", forkId)
          .select("id");
        if (error) return { ok: false };
        remapped += ((data as unknown[] | null) ?? []).length;
      }
    }
  } catch {
    return { ok: false };
  }
  return { ok: true, remapped };
}
