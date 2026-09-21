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
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
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

// CLI arg parse: --manifest <path>, --apply, --diff, --allow-update, --checkpoint, --report, --max-errors, --retries.
export function parseArgs(argv) {
  const has = (f) => argv.includes(f);
  const val = (f, d = null) => { const i = argv.indexOf(f); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
  let manifestPath = DEFAULT_MANIFEST;
  const mv = val("--manifest");
  if (mv) manifestPath = resolve(process.cwd(), mv);
  return {
    apply: has("--apply"),
    diff: has("--diff"),
    allowUpdate: has("--allow-update"), // VARSAYILAN OFF: mevcut besinler (313) korunur, overwrite YOK
    manifestPath,
    checkpoint: val("--checkpoint"),
    report: val("--report"),
    maxErrors: Math.max(0, Number(val("--max-errors", "25")) || 25),
    retries: Math.max(0, Number(val("--retries", "3")) || 3),
  };
}

export function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

// ── Ölçek/güvenlik yardımcıları ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Transient (ağ/5xx/429) hatalarda sınırlı retry + exponential backoff. Kalıcı hata anında fırlatılır. */
export async function withRetry(fn, retries) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      const transient = /fetch failed|ETIMEDOUT|ECONNRESET|EAI_AGAIN|network|timeout|ENOTFOUND|socket hang up|50[234]|429/i.test(msg);
      if (!transient || i === retries) throw e;
      await sleep(250 * 2 ** i);
    }
  }
  throw lastErr;
}

/**
 * READ-ONLY sınıflandırma (yazma YOK): bir food'un import planını verir.
 *   created  → external_ref yok (yeni besin).
 *   unchanged→ ref var + content_hash aynı.
 *   updated  → ref var + hash farklı + allowUpdate=true (KASITLI güncelleme).
 *   skipped_existing → ref var + hash farklı + allowUpdate=false (MEVCUT KORUNUR; default).
 *   repair   → ref var ama content_hash boş (yarım kalmış önceki import → onar).
 *   rejected → vocab miss (nutrient/unit/group sözlükte yok) → yazılamaz.
 */
export async function classifyFood(db, T, food, { allowUpdate, dicts }) {
  const hash = hashFood(food);
  // vocab pre-check (rejected) — yazmadan önce sözlük uyumu.
  if (dicts) {
    if (!dicts.groupBy.has(food.food_group)) return { status: "rejected", reason: `group:${food.food_group}` };
    for (const [code, v] of Object.entries(food.nutrients ?? {})) {
      if (!dicts.nutBy.has(code)) return { status: "rejected", reason: `nutrient:${code}` };
      if (!dicts.unitBy.has(v.unit)) return { status: "rejected", reason: `unit:${v.unit}` };
    }
    for (const p of food.portions ?? []) if (!dicts.unitBy.has(p.measure_unit)) return { status: "rejected", reason: `portion_unit:${p.measure_unit}` };
  }
  const { data: ref } = await withRetry(() => db
    .from("nutrition_food_external_refs").select("id, food_id, content_hash")
    .eq("tenant_id", T).eq("provider", "usda_fdc").eq("external_id", food.fdc_id).maybeSingle(), 3);
  if (!ref) return { status: "created", hash };
  if (!ref.content_hash) return { status: "repair", hash, ref };
  if (ref.content_hash === hash) return { status: "unchanged", hash, ref };
  return { status: allowUpdate ? "updated" : "skipped_existing", hash, ref };
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

/**
 * Bir food'u güvenle YAZAR (retry + COMMIT-MARKER sıralaması, partial-heal).
 *   CREATE sırası: food → external_ref(content_hash=NULL) → children → external_ref.content_hash=hash (SON).
 *     content_hash bir "commit marker"dır: yarım kalırsa (children yazılmadan) ref hash'i NULL kalır →
 *     yeniden çalıştırınca "repair" olarak algılanıp children onarılır; DUPLICATE food OLUŞMAZ (ref var).
 *   REPAIR/UPDATE: mevcut food_id'ye children delete+reinsert + hash finalize.
 * external_ref (fdc) idempotency anahtarıdır; retry aynı besini ikinci kez OLUŞTURMAZ.
 */
export async function writeFood(db, T, doc, food, cls, dicts, retries) {
  const hash = cls.hash;
  const foodCore = {
    tenant_id: T, name_tr: food.name_tr, name_en: food.name_en ?? null, aliases: food.aliases ?? [],
    food_group_id: dicts.groupBy.get(food.food_group) ?? null, prep_state: food.prep_state ?? null, is_active: true,
  };
  const refPatch = {
    external_dataset: doc.dataset, external_version: doc.manifest_version, retrieved_at: doc.retrieved_at,
    source_url: `https://fdc.nal.usda.gov/food-details/${food.fdc_id}/nutrients`,
  };
  const run = (q) => withRetry(() => q, retries);

  let foodId = cls.ref?.food_id;
  if (cls.status === "created") {
    const { data: inserted, error } = await run(db.from("nutrition_foods").insert(foodCore).select("id").single());
    if (error) throw error;
    foodId = inserted.id;
    // ref ÖNCE hash'siz (commit marker boş) → children yazılana kadar "incomplete".
    const { error: rErr } = await run(db.from("nutrition_food_external_refs").insert({
      tenant_id: T, food_id: foodId, provider: "usda_fdc", external_id: food.fdc_id, content_hash: null, ...refPatch,
    }));
    if (rErr) throw rErr;
  } else {
    // repair / updated: mevcut food_id; besin çekirdeğini güncelle, ref hash'ini geçici NULL'la.
    await run(db.from("nutrition_foods").update(foodCore).eq("tenant_id", T).eq("id", foodId));
    await run(db.from("nutrition_food_external_refs").update({ content_hash: null, ...refPatch }).eq("id", cls.ref.id));
  }

  // children replace (delete + insert), chunk'lı.
  await run(db.from("nutrition_food_nutrients").delete().eq("tenant_id", T).eq("food_id", foodId));
  const nutRows = Object.entries(food.nutrients ?? {}).map(([code, v]) => {
    const n = dicts.nutBy.get(code), u = dicts.unitBy.get(v.unit);
    if (!n || !u) throw new Error(`vocab miss ${code}/${v.unit}`);
    return { tenant_id: T, food_id: foodId, nutrient_id: n.id, amount: v.amount, unit_id: u.id, basis_grams: 100 };
  });
  for (let i = 0; i < nutRows.length; i += 500) await run(db.from("nutrition_food_nutrients").insert(nutRows.slice(i, i + 500)));
  await run(db.from("nutrition_food_portions").delete().eq("tenant_id", T).eq("food_id", foodId));
  const portRows = (food.portions ?? []).map((p, i) => {
    const u = dicts.unitBy.get(p.measure_unit);
    if (!u) throw new Error(`unit miss ${p.measure_unit}`);
    return { tenant_id: T, food_id: foodId, label_tr: p.label_tr, label_en: p.label_en ?? null, quantity: p.quantity ?? 1, measure_unit_id: u.id, gram_weight: p.gram_weight, is_default: p.is_default === true, sort_order: i };
  });
  for (let i = 0; i < portRows.length; i += 500) await run(db.from("nutrition_food_portions").insert(portRows.slice(i, i + 500)));

  // COMMIT MARKER en son: hash finalize (children tam yazıldı).
  const refId = cls.ref?.id ?? (await run(db.from("nutrition_food_external_refs").select("id").eq("tenant_id", T).eq("provider", "usda_fdc").eq("external_id", food.fdc_id).maybeSingle())).data?.id;
  await run(db.from("nutrition_food_external_refs").update({ content_hash: hash }).eq("id", refId));
  return { foodId, nutrients: nutRows.length, portions: portRows.length };
}

async function loadDicts(db) {
  const [{ data: groups }, { data: nutrients }, { data: units }] = await Promise.all([
    db.from("nutrition_food_groups").select("id, code"),
    db.from("nutrition_nutrients").select("id, code, category").eq("is_active", true),
    db.from("nutrition_units").select("id, code, unit_type").eq("is_active", true),
  ]);
  return {
    groupBy: new Map((groups ?? []).map((r) => [r.code, r.id])),
    nutBy: new Map((nutrients ?? []).map((r) => [r.code, r])),
    unitBy: new Map((units ?? []).map((r) => [r.code, r])),
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  const { apply, diff, manifestPath, allowUpdate, checkpoint, report, maxErrors, retries } = opts;
  const doc = readManifest(manifestPath);
  const plan = computePlan(doc);
  const mode = apply ? "APPLY" : diff ? "DIFF (read-only)" : "DRY-RUN";

  console.log(`[importCatalog] ${doc.manifest_version} · ${doc.foods.length} food · ${mode}`);
  console.log(`[importCatalog] provider=${doc.provider} dataset=${doc.dataset} license=${doc.license}`);
  console.log(`[importCatalog] manifest=${manifestPath} allowUpdate=${allowUpdate}`);

  if (!apply && !diff) {
    console.log(`[DRY-RUN] planlanan: ${plan.foods} food · ${plan.nutrients} nutrient · ${plan.portions} porsiyon · ${plan.externalRefs} external_ref`);
    console.log(`[DRY-RUN] created/updated/unchanged için --diff (read-only DB) veya --apply.`);
    console.log(`[DRY-RUN] Yazma YAPILMADI.`);
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("[importCatalog] ENV eksik: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const dicts = await loadDicts(db);
  const T = SYSTEM_NUTRITION_TENANT_ID;

  // checkpoint (resume): daha önce işlenmiş fdc_id'ler atlanır.
  const done = new Set();
  if (checkpoint && existsSync(checkpoint)) for (const l of readFileSync(checkpoint, "utf8").split(/\r?\n/)) { const s = l.trim(); if (s) done.add(s); }

  const tally = { created: 0, updated: 0, unchanged: 0, skipped_existing: 0, repair: 0, rejected: 0, errors: 0, resumed_skipped: 0 };
  const rec = { created: [], updated: [], unchanged: [], skipped_existing: [], repair: [], rejected: [], errors: [] };
  let nutrientRows = 0, portionRows = 0;
  const seenFdc = new Set();

  for (const f of doc.foods) {
    if (f.fdc_id && seenFdc.has(f.fdc_id)) continue; // manifest-içi dedup
    if (f.fdc_id) seenFdc.add(f.fdc_id);
    if (checkpoint && done.has(String(f.fdc_id))) { tally.resumed_skipped++; continue; }
    try {
      const cls = await classifyFood(db, T, f, { allowUpdate, dicts });
      if (cls.status === "rejected") { tally.rejected++; rec.rejected.push({ fdc: f.fdc_id, name_tr: f.name_tr, reason: cls.reason }); continue; }
      if (cls.status === "unchanged") { tally.unchanged++; rec.unchanged.push(f.fdc_id); if (checkpoint) appendFileSync(checkpoint, `${f.fdc_id}\n`); continue; }
      if (cls.status === "skipped_existing") { tally.skipped_existing++; rec.skipped_existing.push({ fdc: f.fdc_id, name_tr: f.name_tr }); continue; } // MEVCUT KORUNUR

      if (diff) { // READ-ONLY: yazma YOK, yalnız sınıf say.
        tally[cls.status]++; rec[cls.status].push(f.fdc_id); continue;
      }
      // APPLY: güvenli yazma.
      const w = await writeFood(db, T, doc, f, cls, dicts, retries);
      nutrientRows += w.nutrients; portionRows += w.portions;
      tally[cls.status]++; rec[cls.status].push(f.fdc_id);
      if (checkpoint) appendFileSync(checkpoint, `${f.fdc_id}\n`);
    } catch (e) {
      tally.errors++; rec.errors.push({ fdc: f.fdc_id, name_tr: f.name_tr, error: String((e && e.message) || e) });
      console.error(`[importCatalog] HATA ${f.name_tr} (${f.fdc_id}): ${(e && e.message) || e}`);
      if (tally.errors >= maxErrors) { console.error(`[importCatalog] SAFE-STOP: hata eşiği (${maxErrors}) aşıldı; güvenle durduruluyor.`); break; }
    }
  }

  console.log(`[importCatalog] ${diff ? "DIFF" : "APPLY"} tally: ${JSON.stringify(tally)}`);
  if (!diff) console.log(`[importCatalog] yazılan çocuk satırlar: nutrients=${nutrientRows} portions=${portionRows}`);
  if (allowUpdate === false && tally.skipped_existing > 0) console.log(`[importCatalog] NOT: ${tally.skipped_existing} mevcut besin KORUNDU (--allow-update verilmedi → overwrite YOK).`);
  if (report) { writeFileSync(report, JSON.stringify({ manifest: doc.manifest_version, mode, allowUpdate, tally, records: rec }, null, 2)); console.log(`[importCatalog] rapor → ${report}`); }
  if (tally.errors) process.exit(1);
}

// Yalnız doğrudan çalıştırıldığında main() (import edildiğinde harness'i tetiklemez).
const INVOKED = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (INVOKED) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
