// ============================================================
// Beslenme FAZ 6 — Genelleştirilmiş USDA katalog importer'ı
// (importUsda.mjs süperkümesi; idempotent, dry-run VARSAYILAN).
//
// KULLANIM:
//   node scripts/beslenme-food-engine/importCatalog.mjs                                  # DRY-RUN (yazma YOK)
//   node scripts/beslenme-food-engine/importCatalog.mjs --manifest data/nutrition/x.json # farklı manifest
//   node scripts/beslenme-food-engine/importCatalog.mjs --apply                          # gerçek yazma (SYSTEM tenant)
//
// ENV (yalnız --apply için): SUPABASE_URL (veya NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
//
// İLKELER (importUsda ile BİREBİR aynı idempotency + provenance):
//   - Yalnız SYSTEM tenant'a yazar (rezerve UUID; body/query'den seçilmez).
//   - external_ref (usda_fdc, fdc_id) ile idempotent: yeni → oluştur; içerik değiştiyse → güncelle;
//     aynıysa → atla. Duplicate fdc_id çift kayıt yaratmaz.
//   - Değerler /100 g (manifest zaten normalize). Eksik nutrient satırı yazılmaz (0 uydurma YOK).
//   - Çocuk satırlar (nutrients + portions) tam SİL + yeniden EKLE. basis_grams = 100.
//   - RAW USDA response saklanmaz; yalnız content_hash.
//   - PRODUCTION'a otomatik uygulanmaz; --apply açık niyet ister.
//
// §7 FIX vs importUsda.hashFood:
//   importUsda hash'i name_tr + aliases'ı DIŞLADIĞI için yalnız Türkçe-ad/alias düzenlemeleri
//   "unchanged" görünüp asla yeniden import edilmiyordu. Buradaki hashFood ŞUNLARI hashler:
//     name_tr, name_en, aliases (KANONİK SIRALI KOPYA), nutrients, portions,
//     food_group, prep_state, fdc_id.
//   aliases bir KOPYA üzerinde sıralanır → dizi sırası değişimi sahte "updated" üretmez.
//   nutrients/portions deterministik yazıldığı için YENİDEN SIRALANMAZ (sıra-duyarlı bırakılır).
// ============================================================
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DEFAULT_MANIFEST = resolve(ROOT, "data", "nutrition", "usda-curated-v2.json");

// SYSTEM tenant — lib/beslenme/systemTenant.ts ile AYNI değer (tek kaynak; burada script sabiti).
const SYSTEM_NUTRITION_TENANT_ID = "00000000-0000-4000-8000-000000000001";

// ── §7 düzeltilmiş içerik hash'i ──
// HASHLENEN ALAN KÜMESİ: name_tr, name_en, aliases(kanonik-sıralı kopya),
// nutrients, portions, food_group, prep_state, fdc_id.
export function hashFood(f) {
  const aliasesSorted = [...(f.aliases ?? [])].sort(); // KOPYA; orijinal dizi mutasyona uğramaz
  return createHash("sha256")
    .update(JSON.stringify({
      nt: f.name_tr,
      en: f.name_en ?? null,
      al: aliasesSorted,
      n: f.nutrients,
      p: f.portions,
      g: f.food_group,
      pr: f.prep_state ?? null,
      fdc: f.fdc_id,
    }))
    .digest("hex");
}

// CLI arg parse: --manifest <path> (opsiyonel), --apply.
export function parseArgs(argv) {
  const apply = argv.includes("--apply");
  let manifestPath = DEFAULT_MANIFEST;
  const mi = argv.indexOf("--manifest");
  if (mi !== -1 && argv[mi + 1]) {
    manifestPath = resolve(process.cwd(), argv[mi + 1]);
  }
  return { apply, manifestPath };
}

export function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

// Deterministik plan sayacı (dry-run + apply raporu için). DB'ye bağlanmaz.
// fdc_id'ye göre tekilleştirir → aynı fdc_id çift sayılmaz.
export function computePlan(doc) {
  const foods = Array.isArray(doc.foods) ? doc.foods : [];
  const seenFdc = new Set();
  let uniqueFoods = 0, nutrients = 0, portions = 0;
  for (const f of foods) {
    if (f.fdc_id && seenFdc.has(f.fdc_id)) continue; // dedup: aynı fdc_id çift kayıt yaratmaz
    if (f.fdc_id) seenFdc.add(f.fdc_id);
    uniqueFoods += 1;
    nutrients += Object.keys(f.nutrients ?? {}).length;
    portions += (f.portions ?? []).length;
  }
  return { foods: uniqueFoods, nutrients, portions, externalRefs: uniqueFoods, total: foods.length };
}

async function main() {
  const { apply, manifestPath } = parseArgs(process.argv);
  const doc = readManifest(manifestPath);
  const plan = computePlan(doc);

  console.log(`[importCatalog] ${doc.manifest_version} · ${doc.foods.length} food · ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`[importCatalog] provider=${doc.provider} dataset=${doc.dataset} license=${doc.license}`);
  console.log(`[importCatalog] manifest=${manifestPath}`);

  if (!apply) {
    // Dry-run: yazma yok; yalnız deterministik plan (DB'ye bağlanmadan manifest bütünlüğü).
    console.log(`[DRY-RUN] planlanan: ${plan.foods} food · ${plan.nutrients} nutrient · ${plan.portions} porsiyon · ${plan.externalRefs} external_ref`);
    console.log(`[DRY-RUN] created/updated/unchanged --apply modunda belirlenir (DB gerekli).`);
    console.log(`[DRY-RUN] Yazma YAPILMADI. Uygulamak için --apply (ENV: SERVICE_ROLE + URL).`);
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("[importCatalog] ENV eksik: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
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
  let nutrientRows = 0, portionRows = 0, externalRefRows = 0;
  const seenFdc = new Set();

  for (const f of doc.foods) {
    try {
      if (f.fdc_id && seenFdc.has(f.fdc_id)) { continue; } // dedup: aynı fdc_id çift işlenmez
      if (f.fdc_id) seenFdc.add(f.fdc_id);

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
        externalRefRows++;
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
        externalRefRows++;
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
      nutrientRows += nutRows.length;

      // portions (replace).
      await db.from("nutrition_food_portions").delete().eq("tenant_id", T).eq("food_id", foodId);
      const portRows = (f.portions ?? []).map((p, i) => {
        const u = unitBy.get(p.measure_unit);
        if (!u) throw new Error(`unit miss ${p.measure_unit}`);
        return { tenant_id: T, food_id: foodId, label_tr: p.label_tr, label_en: p.label_en ?? null, quantity: p.quantity ?? 1, measure_unit_id: u.id, gram_weight: p.gram_weight, is_default: p.is_default === true, sort_order: i };
      });
      if (portRows.length) await db.from("nutrition_food_portions").insert(portRows);
      portionRows += portRows.length;
    } catch (e) {
      errors++;
      console.error(`[importCatalog] HATA ${f.name_tr}: ${e.message}`);
    }
  }

  console.log(`[importCatalog] created=${created} updated=${updated} unchanged=${unchanged} errors=${errors} total=${doc.foods.length}`);
  console.log(`[importCatalog] yazılan çocuk satırlar: nutrients=${nutrientRows} portions=${portionRows} external_refs=${externalRefRows}`);
  if (errors) process.exit(1);
}

// Yalnız doğrudan çalıştırıldığında main() (import edildiğinde harness'i tetiklemez).
const INVOKED = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (INVOKED) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
