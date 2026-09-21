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
 * Supabase sorgu YÜRÜTÜCÜSÜ — throw/catch YETMEZ: {data, error} sözleşmesini kontrol eder.
 *   - `makeQuery` bir THUNK'tır: HER denemede sorguyu YENİDEN oluşturur (aynı builder'ı ikinci kez
 *     await etmek güvenilir değildir).
 *   - Sonuçta `error` varsa işlem BAŞARILI SAYILMAZ → hata fırlatılır (mesaj error'dan taşınır →
 *     withRetry transient tespiti error mesajını da görür → yalnız transient'te retry).
 *   - Başarıda {data,...} döner.
 */
export async function execQuery(makeQuery, retries = 3) {
  return withRetry(async () => {
    const res = await makeQuery();
    if (res && res.error) {
      const e = new Error(`db-error: ${res.error.message || res.error.code || JSON.stringify(res.error)}`);
      e.dbError = res.error;
      throw e;
    }
    return res;
  }, retries);
}

const isTransientMsg = (m) => /fetch failed|ETIMEDOUT|ECONNRESET|EAI_AGAIN|network|timeout|ENOTFOUND|socket hang up|50[234]|429/i.test(String(m ?? ""));

/**
 * YAZMA yürütücüsü — SELECT'ten FARKLI: **OTOMATİK RETRY YOK**.
 *   Ağ hatası sonrası bir INSERT'in DB'ye yazılıp yazılmadığı BELİRSİZDİR; körlemesine tekrar
 *   duplicate satır üretebilir. Bu yüzden yazma TEK KEZ çalışır; error → throw (`.transient`
 *   işareti taşınır). Uzlaştırma (reconciliation) gerekiyorsa çağıran tarafta doğal-anahtar
 *   SELECT ile yapılır (execQuery). Böylece "DB yazdı ama yanıt kayboldu" senaryosu güvenli.
 */
export async function execWrite(makeQuery) {
  try {
    const res = await makeQuery();
    if (res && res.error) {
      const e = new Error(`db-write-error: ${res.error.message || res.error.code || JSON.stringify(res.error)}`);
      e.dbError = res.error; e.transient = isTransientMsg(res.error.message || res.error.code); e.write = true;
      throw e;
    }
    return res;
  } catch (e) {
    if (e.transient === undefined) e.transient = isTransientMsg(e.message);
    e.write = true;
    throw e;
  }
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
export async function classifyFood(db, T, food, { allowUpdate, dicts, retries = 3 }) {
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
  // SELECT: {data,error} kontrol edilir (execQuery). error → throw (created SANILMAZ → duplicate önlenir).
  const { data: ref } = await execQuery(() => db
    .from("nutrition_food_external_refs").select("id, food_id, content_hash")
    .eq("tenant_id", T).eq("provider", "usda_fdc").eq("external_id", food.fdc_id).maybeSingle(), retries);
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
 * Bir food'u güvenle YAZAR. YAZMA RETRY YOK (execWrite) — ağ hatası sonrası INSERT belirsizdir.
 *   CREATE: food → external_ref(hash=NULL) → children → external_ref.hash=hash (commit-marker SON).
 *   Reads (uzlaştırma/refId) execQuery ile retry'lı.
 *   "DB yazdı ama yanıt kayboldu" politikası:
 *     - food INSERT (doğal anahtar YOK): belirsiz hatada UZLAŞTIRILAMAZ → DUR + olası orphan raporla (fatal).
 *     - external_ref INSERT (doğal anahtar tenant+provider+fdc VAR): hatada SELECT ile uzlaştır —
 *         yazılmışsa devam (idempotent), yazılmamışsa orphan → DUR (fatal).
 *     - nutrient/portion & commit-marker: hata → throw (commit-marker düşmez) → RE-RUN "repair"
 *         (delete+reinsert + doğal anahtar) TEMİZ uzlaştırır; duplicate oluşmaz. Auto-retry gerekmez.
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
  const selectRefId = () => execQuery(() => db.from("nutrition_food_external_refs").select("id").eq("tenant_id", T).eq("provider", "usda_fdc").eq("external_id", food.fdc_id).maybeSingle(), retries);

  // vocab guard (rejected zaten classify'de; burada da yazma öncesi kesin güvence).
  const nutRows = Object.entries(food.nutrients ?? {}).map(([code, v]) => {
    const n = dicts.nutBy.get(code), u = dicts.unitBy.get(v.unit);
    if (!n || !u) throw new Error(`vocab miss ${code}/${v.unit}`);
    return { tenant_id: T, food_id: null, nutrient_id: n.id, amount: v.amount, unit_id: u.id, basis_grams: 100 };
  });
  const portDefs = (food.portions ?? []).map((p, i) => {
    const u = dicts.unitBy.get(p.measure_unit);
    if (!u) throw new Error(`unit miss ${p.measure_unit}`);
    return { p, i, unitId: u.id };
  });

  let foodId = cls.ref?.food_id;
  if (cls.status === "created") {
    // ── FOOD INSERT — doğal anahtar YOK → belirsiz (transient) hata UZLAŞTIRILAMAZ → DUR + raporla ──
    try {
      const ins = await execWrite(() => db.from("nutrition_foods").insert(foodCore).select("id").single());
      foodId = ins.data?.id;
      if (!foodId) throw new Error(`food insert döndü ama id yok`);
    } catch (e) {
      const ae = new Error(`AMBIGUOUS food INSERT (fdc=${food.fdc_id}): ${e.transient ? "ağ hatası → DB'ye yazıldı mı BELİRSİZ (olası orphan food; external_ref YOK)" : "yazma hatası"} — OTOMATİK RETRY YAPILMADI; manuel inceleme. Sebep: ${e.message}`);
      ae.fdc = food.fdc_id; ae.fatal = true; ae.ambiguous = !!e.transient; ae.phase = "food_insert"; ae.orphanFoodId = null;
      throw ae;
    }
    // ── EXTERNAL_REF INSERT — doğal anahtar (tenant,provider,fdc) VAR → hatada SELECT ile UZLAŞTIR ──
    try {
      await execWrite(() => db.from("nutrition_food_external_refs").insert({
        tenant_id: T, food_id: foodId, provider: "usda_fdc", external_id: food.fdc_id, content_hash: null, ...refPatch,
      }));
    } catch (e) {
      const { data: existing } = await selectRefId(); // uzlaştırma: ref gerçekten yazıldı mı?
      if (!existing) {
        const oe = new Error(`ORPHAN: food(id=${foodId}) yazıldı ama external_ref(fdc=${food.fdc_id}) yazılamadı+uzlaştırılamadı. Otomatik silme YOK; manuel inceleme. Sebep: ${e.message}`);
        oe.orphanFoodId = foodId; oe.fdc = food.fdc_id; oe.fatal = true; oe.phase = "ref_insert"; oe.ambiguous = !!e.transient;
        throw oe;
      }
      // ref aslında yazılmış (yanıt kaybolmuştu) → idempotent uzlaşma → devam.
    }
  } else {
    // repair / updated: mevcut food_id; çekirdeği güncelle, ref hash'ini geçici NULL'la (commit-marker düşür).
    await execWrite(() => db.from("nutrition_foods").update(foodCore).eq("tenant_id", T).eq("id", foodId));
    await execWrite(() => db.from("nutrition_food_external_refs").update({ content_hash: null, ...refPatch }).eq("id", cls.ref.id));
  }
  for (const r of nutRows) r.food_id = foodId;
  const portRows = portDefs.map(({ p, i, unitId }) => ({ tenant_id: T, food_id: foodId, label_tr: p.label_tr, label_en: p.label_en ?? null, quantity: p.quantity ?? 1, measure_unit_id: unitId, gram_weight: p.gram_weight, is_default: p.is_default === true, sort_order: i }));

  // children replace — execWrite (retry YOK). Hata → throw → commit-marker YAZILMAZ → re-run "repair"
  //   (delete+reinsert + doğal anahtar) temiz uzlaştırır (belirsiz child INSERT'i tekrar-yazma DEĞİL, re-run onarır).
  await execWrite(() => db.from("nutrition_food_nutrients").delete().eq("tenant_id", T).eq("food_id", foodId));
  for (let i = 0; i < nutRows.length; i += 500) { const chunk = nutRows.slice(i, i + 500); await execWrite(() => db.from("nutrition_food_nutrients").insert(chunk)); }
  await execWrite(() => db.from("nutrition_food_portions").delete().eq("tenant_id", T).eq("food_id", foodId));
  for (let i = 0; i < portRows.length; i += 500) { const chunk = portRows.slice(i, i + 500); await execWrite(() => db.from("nutrition_food_portions").insert(chunk)); }

  // COMMIT MARKER — YALNIZ buraya (tüm child DELETE/INSERT başarılı) gelinirse hash finalize edilir.
  let refId = cls.ref?.id;
  if (!refId) { const r = await selectRefId(); refId = r.data?.id; }
  if (!refId) throw new Error(`commit-marker: external_ref bulunamadı (fdc ${food.fdc_id})`);
  await execWrite(() => db.from("nutrition_food_external_refs").update({ content_hash: hash }).eq("id", refId));
  return { foodId, nutrients: nutRows.length, portions: portRows.length };
}

/**
 * Sözlükleri yükler — SELECT {error} KONTROL EDİLİR (execQuery). Hata sessizce yutulursa
 * boş sözlük → TÜM food'lar yanlışlıkla "rejected" olurdu; bu yüzden:
 *   - her SELECT error → throw (transient ise retry),
 *   - sonuç BOŞ ise → throw (seed eksikliği/yanlış hedef; sessiz toplu-rejected engellenir).
 */
export async function loadDicts(db, retries = 3) {
  const [gRes, nRes, uRes] = await Promise.all([
    execQuery(() => db.from("nutrition_food_groups").select("id, code"), retries),
    execQuery(() => db.from("nutrition_nutrients").select("id, code, category").eq("is_active", true), retries),
    execQuery(() => db.from("nutrition_units").select("id, code, unit_type").eq("is_active", true), retries),
  ]);
  const groups = gRes.data ?? [], nutrients = nRes.data ?? [], units = uRes.data ?? [];
  if (!groups.length || !nutrients.length || !units.length) {
    throw new Error(`sözlük BOŞ (groups=${groups.length} nutrients=${nutrients.length} units=${units.length}) → import iptal (yanlış hedef / seed eksik; toplu-rejected engellendi).`);
  }
  return {
    groupBy: new Map(groups.map((r) => [r.code, r.id])),
    nutBy: new Map(nutrients.map((r) => [r.code, r])),
    unitBy: new Map(units.map((r) => [r.code, r])),
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
  const dicts = await loadDicts(db, retries);
  const T = SYSTEM_NUTRITION_TENANT_ID;
  const targetRef = String(url).replace(/^https?:\/\//, "").split(".")[0];

  // ── CHECKPOINT (resume) — manifest/hedef GÜVENLİ + tamamlanma DOĞRULAMALI ──
  // Header: `#v=<manifest_version>|url=<targetRef>`. Header uyuşmazsa checkpoint YOK SAYILIR
  //   (yanlış manifest/sürüm/hedef için hatalı atlama engellenir). Ayrıca resume edilen her fdc
  //   classify ile DOĞRULANIR (yalnız status===unchanged ise atlanır) → stale/eksik kayıt atlanmaz.
  const cpHeader = `#v=${doc.manifest_version}|url=${targetRef}`;
  const done = new Set();
  if (checkpoint && existsSync(checkpoint)) {
    const lines = readFileSync(checkpoint, "utf8").split(/\r?\n/);
    if (lines[0] === cpHeader) { for (const l of lines.slice(1)) { const s = l.trim(); if (s && !s.startsWith("#")) done.add(s); } }
    else console.warn(`[importCatalog] UYARI: checkpoint header uyuşmuyor (farklı manifest/sürüm/hedef) → checkpoint YOK SAYILDI (yanlış atlama engellendi).`);
  }
  if (checkpoint && apply && (!existsSync(checkpoint) || readFileSync(checkpoint, "utf8").split(/\r?\n/)[0] !== cpHeader)) {
    writeFileSync(checkpoint, `${cpHeader}\n`); done.clear();
  }

  const tally = { created: 0, updated: 0, unchanged: 0, skipped_existing: 0, repair: 0, rejected: 0, errors: 0, resumed_skipped: 0 };
  const rec = { created: [], updated: [], unchanged: [], skipped_existing: [], repair: [], rejected: [], errors: [], orphans: [] };
  let nutrientRows = 0, portionRows = 0, stopped = false;
  const seenFdc = new Set();

  for (const f of doc.foods) {
    if (f.fdc_id && seenFdc.has(f.fdc_id)) continue; // manifest-içi dedup
    if (f.fdc_id) seenFdc.add(f.fdc_id);
    try {
      // classify HER ZAMAN (checkpoint'li olsa da) → resume tamamlanma doğrulaması.
      const cls = await classifyFood(db, T, f, { allowUpdate, dicts, retries });
      if (checkpoint && done.has(String(f.fdc_id))) {
        if (cls.status === "unchanged") { tally.resumed_skipped++; continue; } // gerçekten tamamlanmış → atla
        // stale checkpoint: kayıt aslında tamam DEĞİL → normal işle (atlama YOK).
      }
      if (cls.status === "rejected") { tally.rejected++; rec.rejected.push({ fdc: f.fdc_id, name_tr: f.name_tr, reason: cls.reason }); continue; }
      if (cls.status === "unchanged") { tally.unchanged++; rec.unchanged.push(f.fdc_id); if (checkpoint && apply) appendFileSync(checkpoint, `${f.fdc_id}\n`); continue; }
      if (cls.status === "skipped_existing") { tally.skipped_existing++; rec.skipped_existing.push({ fdc: f.fdc_id, name_tr: f.name_tr }); continue; } // MEVCUT KORUNUR

      if (diff) { // READ-ONLY: yazma YOK, yalnız sınıf say.
        tally[cls.status]++; rec[cls.status].push(f.fdc_id); continue;
      }
      // APPLY: güvenli yazma (commit-marker yalnız tüm child başarılıysa).
      const w = await writeFood(db, T, doc, f, cls, dicts, retries);
      nutrientRows += w.nutrients; portionRows += w.portions;
      tally[cls.status]++; rec[cls.status].push(f.fdc_id);
      if (checkpoint && apply) appendFileSync(checkpoint, `${f.fdc_id}\n`);
    } catch (e) {
      tally.errors++;
      if (e && e.fatal) { // olası yarım kayıt (ambiguous food INSERT / orphan ref) → GÜVENLE DUR + raporla
        const half = { fdc: e.fdc ?? f.fdc_id, phase: e.phase ?? null, ambiguous: !!e.ambiguous, orphan_food_id: e.orphanFoodId ?? null, error: String(e.message) };
        rec.orphans.push(half);
        rec.errors.push({ fdc: f.fdc_id, name_tr: f.name_tr, error: String(e.message), fatal: true });
        console.error(`[importCatalog] FATAL (${half.phase}) → DURDURULUYOR (olası yarım kayıt): ${JSON.stringify(half)}`);
        stopped = true; break; // otomatik retry/silme YOK; operatör re-run ile uzlaştırır.
      }
      rec.errors.push({ fdc: f.fdc_id, name_tr: f.name_tr, error: String((e && e.message) || e) });
      console.error(`[importCatalog] HATA ${f.name_tr} (${f.fdc_id}): ${(e && e.message) || e}`);
      if (tally.errors >= maxErrors) { console.error(`[importCatalog] SAFE-STOP: hata eşiği (${maxErrors}) aşıldı; güvenle durduruluyor.`); break; }
    }
  }

  console.log(`[importCatalog] ${diff ? "DIFF" : "APPLY"} tally: ${JSON.stringify(tally)}`);
  if (!diff) console.log(`[importCatalog] yazılan çocuk satırlar: nutrients=${nutrientRows} portions=${portionRows}`);
  if (allowUpdate === false && tally.skipped_existing > 0) console.log(`[importCatalog] NOT: ${tally.skipped_existing} mevcut besin KORUNDU (--allow-update verilmedi → overwrite YOK).`);
  if (rec.orphans.length) console.error(`[importCatalog] ⚠ REFERANSSIZ YARIM KAYIT (${rec.orphans.length}): ${JSON.stringify(rec.orphans)} — manuel inceleme; otomatik silme YAPILMADI.`);
  if (stopped) console.error(`[importCatalog] İŞLEM GÜVENLE DURDURULDU (fatal orphan / safe-stop).`);
  if (report) { writeFileSync(report, JSON.stringify({ manifest: doc.manifest_version, mode, allowUpdate, stopped, tally, records: rec }, null, 2)); console.log(`[importCatalog] rapor → ${report}`); }
  if (tally.errors) process.exit(1);
}

// Yalnız doğrudan çalıştırıldığında main() (import edildiğinde harness'i tetiklemez).
const INVOKED = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (INVOKED) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
