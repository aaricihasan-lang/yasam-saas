// ============================================================
// Beslenme FAZ 4 — USDA SYSTEM food importer (idempotent, dry-run varsayılan).
//
// KULLANIM:
//   node scripts/beslenme-food-engine/importUsda.mjs            # DRY-RUN (yazma YOK)
//   node scripts/beslenme-food-engine/importUsda.mjs --apply    # gerçek yazma (SYSTEM tenant)
//
// ENV (yalnız --apply için): SUPABASE_URL (veya NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
//
// İLKELER:
//   - Yalnız SYSTEM tenant'a yazar (rezerve UUID; body/query'den seçilmez).
//   - external_ref (usda_fdc, fdc_id) ile idempotent: yeni → oluştur; içerik değiştiyse → güncelle;
//     aynıysa → atla. Duplicate fdc_id çift kayıt yaratmaz.
//   - Değerler /100 g (fixture zaten normalize). Eksik nutrient satırı yazılmaz (0 uydurma YOK).
//   - RAW USDA response saklanmaz; yalnız content_hash.
//   - PRODUCTION'a otomatik uygulanmaz; --apply açık niyet ister.
// ============================================================
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const FIXTURE = resolve(ROOT, "data", "nutrition", "usda-foundation-v1.json");

// SYSTEM tenant — lib/beslenme/systemTenant.ts ile AYNI değer (tek kaynak; burada script sabiti).
const SYSTEM_NUTRITION_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const APPLY = process.argv.includes("--apply");

function hashFood(f) {
  return createHash("sha256")
    .update(JSON.stringify({ n: f.nutrients, p: f.portions, g: f.food_group, pr: f.prep_state ?? null, en: f.name_en ?? null }))
    .digest("hex");
}

async function main() {
  const doc = JSON.parse(readFileSync(FIXTURE, "utf8"));
  console.log(`[importUsda] ${doc.manifest_version} · ${doc.foods.length} food · ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`[importUsda] provider=${doc.provider} license=${doc.license}`);

  if (!APPLY) {
    // Dry-run: yazma yok; yalnız plan/özet (DB'ye bağlanmadan fixture bütünlüğü).
    let nutrientRows = 0, portionRows = 0;
    for (const f of doc.foods) {
      nutrientRows += Object.keys(f.nutrients ?? {}).length;
      portionRows += (f.portions ?? []).length;
    }
    console.log(`[DRY-RUN] ${doc.foods.length} SYSTEM food, ${nutrientRows} nutrient satırı, ${portionRows} porsiyon eklenecek/güncellenecek.`);
    console.log(`[DRY-RUN] Yazma YAPILMADI. Uygulamak için --apply (ENV: SERVICE_ROLE + URL).`);
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("[importUsda] ENV eksik: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Dictionaries.
  const [{ data: groups }, { data: nutrients }, { data: units }] = await Promise.all([
    db.from("nutrition_food_groups").select("id, code"),
    db.from("nutrition_nutrients").select("id, code, category").eq("is_active", true),
    db.from("nutrition_units").select("id, code, unit_type").eq("is_active", true),
  ]);
  const groupBy = new Map((groups ?? []).map((r) => [r.code, r.id]));
  const nutBy = new Map((nutrients ?? []).map((r) => [r.code, r]));
  const unitBy = new Map((units ?? []).map((r) => [r.code, r]));

  const T = SYSTEM_NUTRITION_TENANT_ID;
  let created = 0, updated = 0, unchanged = 0, errors = 0;

  for (const f of doc.foods) {
    try {
      const hash = hashFood(f);
      const { data: ref } = await db
        .from("nutrition_food_external_refs")
        .select("id, food_id, content_hash")
        .eq("tenant_id", T).eq("provider", "usda_fdc").eq("external_id", f.fdc_id)
        .maybeSingle();

      if (ref && ref.content_hash === hash) { unchanged++; continue; }

      const foodCore = {
        tenant_id: T, name_tr: f.name_tr, name_en: f.name_en ?? null, aliases: f.aliases ?? [],
        food_group_id: groupBy.get(f.food_group) ?? null, prep_state: f.prep_state ?? null, is_active: true,
      };

      let foodId = ref?.food_id;
      if (foodId) {
        await db.from("nutrition_foods").update(foodCore).eq("tenant_id", T).eq("id", foodId);
        await db.from("nutrition_food_external_refs").update({ content_hash: hash, external_dataset: doc.dataset, external_version: doc.manifest_version, retrieved_at: doc.retrieved_at, source_url: `https://fdc.nal.usda.gov/food-details/${f.fdc_id}/nutrients` }).eq("id", ref.id);
        updated++;
      } else {
        const { data: inserted, error } = await db.from("nutrition_foods").insert(foodCore).select("id").single();
        if (error) throw error;
        foodId = inserted.id;
        await db.from("nutrition_food_external_refs").insert({
          tenant_id: T, food_id: foodId, provider: "usda_fdc", external_id: f.fdc_id,
          external_dataset: doc.dataset, external_version: doc.manifest_version, retrieved_at: doc.retrieved_at,
          source_url: `https://fdc.nal.usda.gov/food-details/${f.fdc_id}/nutrients`, content_hash: hash,
        });
        created++;
      }

      // nutrients (replace).
      await db.from("nutrition_food_nutrients").delete().eq("tenant_id", T).eq("food_id", foodId);
      const nutRows = [];
      for (const [code, v] of Object.entries(f.nutrients ?? {})) {
        const n = nutBy.get(code); const u = unitBy.get(v.unit);
        if (!n || !u) throw new Error(`vocab miss ${code}/${v.unit}`);
        nutRows.push({ tenant_id: T, food_id: foodId, nutrient_id: n.id, amount: v.amount, unit_id: u.id, basis_grams: 100 });
      }
      if (nutRows.length) await db.from("nutrition_food_nutrients").insert(nutRows);

      // portions (replace).
      await db.from("nutrition_food_portions").delete().eq("tenant_id", T).eq("food_id", foodId);
      const portRows = (f.portions ?? []).map((p, i) => {
        const u = unitBy.get(p.measure_unit);
        if (!u) throw new Error(`unit miss ${p.measure_unit}`);
        return { tenant_id: T, food_id: foodId, label_tr: p.label_tr, label_en: p.label_en ?? null, quantity: p.quantity ?? 1, measure_unit_id: u.id, gram_weight: p.gram_weight, is_default: p.is_default === true, sort_order: i };
      });
      if (portRows.length) await db.from("nutrition_food_portions").insert(portRows);
    } catch (e) {
      errors++;
      console.error(`[importUsda] HATA ${f.name_tr}: ${e.message}`);
    }
  }

  console.log(`[importUsda] created=${created} updated=${updated} unchanged=${unchanged} errors=${errors}`);
  if (errors) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
