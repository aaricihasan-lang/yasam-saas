// ============================================================
// Beslenme BES-01 — Alternatif Motoru GERÇEK RETRIEVAL akışı harness'i (DB-siz, deterministik).
//
// AMAÇ: lib/beslenme/alternativeEngine.ts `resolveAlternativesForItem` fonksiyonunun
//   aday (nutrition_foods) + nutrient (nutrition_food_nutrients) okumalarını PostgREST
//   1000-satır yanıt sınırı karşısında EKSİKSİZ yaptığını (fetchAllPaged + chunkIds ile)
//   kanıtlar. YALNIZ saf pagination helper'ını değil, motorun helper'ı DOĞRU kullandığını test eder.
//
// Sahte Supabase istemcisi PostgREST davranışını taklit eder:
//   - filtre + `.order("id")` uygulanır, sonra `.range(from,to)` penceresi,
//   - her yanıt sunucu max-row (SERVER_MAX=1000) ile SINIRLI (kırpma davranışı).
//   - `.range` olmadan awaited sorgu da SERVER_MAX ile sınırlı (eski tek-sorgu davranışı).
//
// Çalıştır:  node scripts/beslenme-alternatives/altRetrievalHarness.mjs
// FAIL → exit 1.
// ============================================================
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
register("./altLoader.mjs", pathToFileURL(join(HERE, "/")).href);

const ENGINE = pathToFileURL(join(HERE, "..", "..", "lib", "beslenme", "alternativeEngine.ts")).href;
const SYSTEM = pathToFileURL(join(HERE, "..", "..", "lib", "beslenme", "systemTenant.ts")).href;
const { resolveAlternativesForItem } = await import(ENGINE);
const { SYSTEM_NUTRITION_TENANT_ID } = await import(SYSTEM);

const SERVER_MAX = 1000; // PostgREST/Supabase varsayılan max-row.
const CALLER = "11111111-1111-1111-1111-111111111111";
const FOREIGN = "22222222-2222-2222-2222-222222222222";
const CODES = ["energy", "protein", "carbohydrate", "total_fat", "fiber"];

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  const ok = Boolean(cond);
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// zero-padded id → lexicographic sort == numeric sort (mock `.order("id")` ile uyumlu).
const pad = (n) => String(n).padStart(9, "0");

// ── Sahte Supabase istemcisi ─────────────────────────────────────────────────
// tables: { [table]: row[] }; her row bir `id` alanı taşımalı (order/range için).
// errorPlan: { [table]: callIndex } → o tablonun N'inci _run çağrısında error döndürür.
// log: her _run çağrısını kaydeder (chunk/tenant/kırpma doğrulaması için).
function makeDb(tables, { errorPlan = {}, log = null } = {}) {
  const callCount = {};
  function run(table, filters, orderBy, rangeWin) {
    callCount[table] = (callCount[table] ?? 0) + 1;
    if (errorPlan[table] && callCount[table] === errorPlan[table]) {
      if (log) log.push({ table, error: true });
      return { data: null, error: { message: `simulated db error @ ${table}` } };
    }
    let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (orderBy) {
      rows = rows.slice().sort((a, b) => (a[orderBy] < b[orderBy] ? -1 : a[orderBy] > b[orderBy] ? 1 : 0));
    }
    let out;
    if (rangeWin) {
      const windowSize = Math.max(0, rangeWin.to - rangeWin.from + 1);
      const take = Math.min(windowSize, SERVER_MAX);
      out = rows.slice(rangeWin.from, rangeWin.from + take);
    } else {
      out = rows.slice(0, SERVER_MAX); // range'siz awaited sorgu da sunucu sınırına tabi.
    }
    if (log) {
      const inFoodIds = filters._inFoodIds ?? null;
      log.push({ table, rangeWin, returned: out.length, returnedIds: out.map((r) => r.id), foodIds: inFoodIds });
    }
    return { data: out, error: null };
  }
  function builder(table) {
    const filters = [];
    let orderBy = null;
    let rangeWin = null;
    const self = {
      select() { return self; },
      eq(col, val) { filters.push((r) => r[col] === val); return self; },
      neq(col, val) { filters.push((r) => r[col] !== val); return self; },
      in(col, arr) {
        const set = new Set(arr);
        if (col === "food_id") filters._inFoodIds = arr.slice();
        filters.push((r) => set.has(r[col]));
        return self;
      },
      order(col) { orderBy = col; return self; },
      range(from, to) {
        rangeWin = { from, to };
        return Promise.resolve(run(table, filters, orderBy, rangeWin));
      },
      maybeSingle() {
        const res = run(table, filters, orderBy, rangeWin);
        return Promise.resolve({ data: res.data && res.data.length ? res.data[0] : null, error: res.error });
      },
      // filtre zinciri sonunda doğrudan await edilirse (snapRows gibi): thenable.
      then(resolve, reject) {
        return Promise.resolve(run(table, filters, orderBy, rangeWin)).then(resolve, reject);
      },
    };
    return self;
  }
  return { from: (table) => builder(table), _callCount: callCount };
}

// ── Katalog üreteci ──────────────────────────────────────────────────────────
// numFoods aday food (SYSTEM), her food `codesPerFood` nutrient satırı. Global nutrient
// id'leri food sırasına göre artan → yüksek-indeksli food'un satırları en sonda (kırpma tail'i).
function buildCatalog({ numFoods, codesPerFood = 5, target, includeForeign = false, includeTargetFood = false, includeDeep = false }) {
  const foods = [];
  const nutr = [];
  let nid = 0;
  const addFoodNutrients = (foodId, tenant, energy, macros) => {
    const vals = { energy, protein: macros.protein ?? 0, carbohydrate: macros.carbohydrate ?? 0, total_fat: macros.total_fat ?? 0, fiber: macros.fiber ?? 0 };
    for (let c = 0; c < codesPerFood; c++) {
      const code = CODES[c % CODES.length];
      nutr.push({ id: pad(nid++), tenant_id: tenant, food_id: foodId, amount: vals[code] ?? 0, nutrient: { code } });
    }
  };

  // target food (item.food_id) — aday sorgusundan neq ile dışlanmalı.
  const TARGET_FOOD_ID = "ffff0000-0000-0000-0000-0000000000tf";
  if (includeTargetFood) {
    foods.push({ id: TARGET_FOOD_ID, tenant_id: SYSTEM_NUTRITION_TENANT_ID, name_tr: "Hedef Besin", food_group_id: null, is_active: true });
    addFoodNutrients(TARGET_FOOD_ID, SYSTEM_NUTRITION_TENANT_ID, target.energyPer100, target.macrosPer100);
  }

  // filler SYSTEM adayları — enerji hedefe yakın (band içi), makro sabit.
  for (let i = 0; i < numFoods; i++) {
    const id = `s-${pad(i)}`;
    const energy = target.energyPer100 + ((i % 7) - 3); // ±3 kcal → dar bant içi.
    foods.push({ id, tenant_id: SYSTEM_NUTRITION_TENANT_ID, name_tr: `Sistem ${pad(i)}`, food_group_id: null, is_active: true });
    addFoodNutrients(id, SYSTEM_NUTRITION_TENANT_ID, energy, target.macrosPer100);
  }

  // foreign-tenant aday — TAM eşleşir ama TENANT dışı → asla sorgulanmamalı/dönmemeli.
  const FOREIGN_FOOD_ID = "aaaa1111-2222-3333-4444-foreignfood0";
  if (includeForeign) {
    foods.push({ id: FOREIGN_FOOD_ID, tenant_id: FOREIGN, name_tr: "Yabanci Tenant Besin", food_group_id: null, is_active: true });
    addFoodNutrients(FOREIGN_FOOD_ID, FOREIGN, target.energyPer100, target.macrosPer100);
  }

  // "deep" aday — TAM eşleşir (distance≈0); en yüksek id ("zzzz…") → food sırasında SON,
  //   nutrient satırları en son eklenir (en büyük nid) → eski tek-sorgu kırpma tail'inde kalır.
  const DEEP_FOOD_ID = "zzzz9999-9999-9999-9999-deepcandid00";
  if (includeDeep) {
    foods.push({ id: DEEP_FOOD_ID, tenant_id: SYSTEM_NUTRITION_TENANT_ID, name_tr: "Derin Aday", food_group_id: null, is_active: true });
    addFoodNutrients(DEEP_FOOD_ID, SYSTEM_NUTRITION_TENANT_ID, target.energyPer100, target.macrosPer100);
  }

  return { foods, nutr, TARGET_FOOD_ID, FOREIGN_FOOD_ID, DEEP_FOOD_ID };
}

function makeItem(tenant, itemId, foodId, grams, target) {
  const item = { id: itemId, tenant_id: tenant, food_id: foodId, grams, food_name_snapshot: "Hedef", food_ownership_snapshot: "system" };
  const snap = [];
  snap.push({ id: pad(0), tenant_id: tenant, item_id: itemId, nutrient_code: "energy", amount: target.energyPer100 });
  for (const [k, v] of Object.entries(target.macrosPer100)) {
    snap.push({ id: pad(1), tenant_id: tenant, item_id: itemId, nutrient_code: k, amount: v });
  }
  return { item, snap };
}

const TARGET = { energyPer100: 100, macrosPer100: { protein: 5, carbohydrate: 20, total_fat: 1, fiber: 2 } };

// ════════════════════════════════════════════════════════════════════════════
// TEST A — >1000 nutrient satırı: yeni retrieval TÜM satırları alır; eski tek-sorgu 1000'de kırpar.
// TEST C — food_id chunking: >400 aday → chunkIds çok chunk; hepsi sorgulanır, aday kaybı YOK.
// TEST D — ranking regression: kırpma tail'indeki TAM-eşleşen "deep" aday yeni akışta #1 döner.
// TEST E — tenant isolation: foreign-tenant aday sorgulanmaz/dönmez.
// TEST F — target food exclusion: item.food_id adaylara dahil edilmez.
// ════════════════════════════════════════════════════════════════════════════
console.log("── TEST A/C/D/E/F: gerçek motor akışı (601 aday, ~3005 nutrient satırı) ──");
{
  const cat = buildCatalog({ numFoods: 600, codesPerFood: 5, target: TARGET, includeForeign: true, includeTargetFood: true, includeDeep: true });
  const itemId = "item-0000-0000-0000-000000000001";
  const { item, snap } = makeItem(CALLER, itemId, cat.TARGET_FOOD_ID, 100, TARGET);
  const log = [];
  const db = makeDb(
    {
      nutrition_plan_items: [item],
      nutrition_plan_item_nutrients: snap,
      nutrition_foods: cat.foods,
      nutrition_food_nutrients: cat.nutr,
    },
    { log },
  );

  const res = await resolveAlternativesForItem(db, CALLER, itemId, { sameGroupOnly: false });
  check("A: motor ok:true döndü", res.ok === true);

  // Retrieval log analizi (yalnız nutrient tablosu range çağrıları).
  const nutrCalls = log.filter((l) => l.table === "nutrition_food_nutrients" && !l.error);
  const deliveredIds = nutrCalls.flatMap((l) => l.returnedIds);
  const deliveredSet = new Set(deliveredIds);
  // beklenen: SYSTEM + deep food'ların nutrient satırları (foreign HARİÇ, target food HARİÇ-neq).
  const candidateFoodIds = new Set(cat.foods.filter((f) => f.tenant_id === SYSTEM_NUTRITION_TENANT_ID && f.id !== cat.TARGET_FOOD_ID).map((f) => f.id));
  const expectedNutr = cat.nutr.filter((n) => candidateFoodIds.has(n.food_id));
  const expectedIds = new Set(expectedNutr.map((n) => n.id));

  check(`A: teslim edilen nutrient satırı > 1000 (kırpma YOK) — ${deliveredIds.length}`, deliveredIds.length > 1000);
  check(`A: teslim = beklenen (${expectedIds.size}) — eksik YOK`, deliveredSet.size === expectedIds.size && [...expectedIds].every((id) => deliveredSet.has(id)));
  check("A: duplicate satır YOK", deliveredIds.length === deliveredSet.size, `delivered ${deliveredIds.length} vs distinct ${deliveredSet.size}`);

  // ESKİ tek-sorgu simülasyonu: order("id") + SERVER_MAX cap → deep tail düşer.
  const oldSingle = cat.nutr
    .filter((n) => candidateFoodIds.has(n.food_id))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .slice(0, SERVER_MAX);
  const oldSet = new Set(oldSingle.map((n) => n.id));
  const oldHasDeep = cat.nutr.some((n) => n.food_id === cat.DEEP_FOOD_ID && oldSet.has(n.id));
  check("A: ESKİ tek-sorgu davranışı 1000'de kırpardı", oldSingle.length === SERVER_MAX);
  check("A: ESKİ davranışta deep aday nutrient'ları DÜŞERDİ", !oldHasDeep);

  // C: chunking — nutrient sorgularında tüm candidate food_id'leri kapsanmış mı?
  const queriedFoodIds = new Set(nutrCalls.flatMap((l) => l.foodIds ?? []));
  const chunkGroups = new Set(nutrCalls.map((l) => (l.foodIds ?? []).join("|")));
  check("C: >1 chunk kullanıldı (601 aday, size=400)", chunkGroups.size >= 2, `chunks=${chunkGroups.size}`);
  check("C: tüm candidate food_id'ler sorgulandı (aday kaybı YOK)", [...candidateFoodIds].every((id) => queriedFoodIds.has(id)) && queriedFoodIds.size === candidateFoodIds.size);

  // D: ranking regression — deep aday (TAM eşleşme) yeni akışta sonuçta ve en yakınlarda.
  const altIds = res.alternatives.map((a) => a.food_id);
  const deepRank = altIds.indexOf(cat.DEEP_FOOD_ID);
  check("D: deep aday sonuçta MEVCUT (eski akışta kaybolurdu)", deepRank >= 0, `rank=${deepRank}`);
  const deepAlt = res.alternatives.find((a) => a.food_id === cat.DEEP_FOOD_ID);
  check("D: deep adayın energyPer100 doğru okundu (100, 0 değil)", deepAlt && deepAlt.energyPer100 === 100, deepAlt ? String(deepAlt.energyPer100) : "yok");
  check("D: deep aday TAM-eşleşme → distance ≈ 0 (en yakın)", deepAlt && deepAlt.distance < 1e-9, deepAlt ? String(deepAlt.distance) : "yok");

  // E: tenant isolation.
  const foreignQueried = nutrCalls.some((l) => (l.foodIds ?? []).includes(cat.FOREIGN_FOOD_ID));
  check("E: foreign-tenant aday HİÇ sorgulanmadı", !foreignQueried);
  check("E: foreign-tenant aday sonuçta YOK", !altIds.includes(cat.FOREIGN_FOOD_ID));

  // F: target exclusion.
  const targetQueried = nutrCalls.some((l) => (l.foodIds ?? []).includes(cat.TARGET_FOOD_ID));
  check("F: item.food_id (target) adaylarda sorgulanmadı", !targetQueried);
  check("F: item.food_id sonuçta YOK", !altIds.includes(cat.TARGET_FOOD_ID));
}

// ════════════════════════════════════════════════════════════════════════════
// TEST B/H — pagination boundary: N ∈ {999,1000,1001,2000} nutrient satırı tek chunk'ta;
//   teslim = N, duplicate YOK, eksik YOK, sıra `id` artan (skip/dup YOK).
// ════════════════════════════════════════════════════════════════════════════
console.log("── TEST B/H: pagination boundary (999/1000/1001/2000) tek chunk ──");
for (const N of [999, 1000, 1001, 2000]) {
  // codesPerFood=5 → numFoods*5 = totalRows. N'i tam tutmak için numFoods & artık ayarla.
  const numFoods = Math.ceil(N / 5);
  const cat = buildCatalog({ numFoods, codesPerFood: 5, target: TARGET });
  // fazla satırları kırp → tam N.
  cat.nutr = cat.nutr.slice(0, N);
  // numFoods ≤ 400 olduğundan tek chunk (chunkIds size=400). 2000 için 400 food → tam 1 chunk.
  const nf = cat.foods.length;
  const itemId = "item-b";
  const { item, snap } = makeItem(CALLER, itemId, null, 100, TARGET); // food_id=null → target/exclusion sorgusu yok.
  const log = [];
  const db = makeDb(
    {
      nutrition_plan_items: [item],
      nutrition_plan_item_nutrients: snap,
      nutrition_foods: cat.foods,
      nutrition_food_nutrients: cat.nutr,
    },
    { log },
  );
  const res = await resolveAlternativesForItem(db, CALLER, itemId, { sameGroupOnly: false });
  const nutrCalls = log.filter((l) => l.table === "nutrition_food_nutrients" && !l.error);
  const ids = nutrCalls.flatMap((l) => l.returnedIds);
  const set = new Set(ids);
  const chunkGroups = new Set(nutrCalls.map((l) => (l.foodIds ?? []).join("|")));
  const sortedOk = ids.every((id, i) => i === 0 || ids[i - 1] <= id); // global id artan (chunk yok → tek dizi)
  check(`B N=${N}: teslim satır sayısı = ${N} (nf=${nf})`, ids.length === N, `got ${ids.length}`);
  check(`B N=${N}: duplicate YOK`, set.size === N, `distinct ${set.size}`);
  check(`B N=${N}: eksik YOK (id 0..${N - 1})`, [...Array(N).keys()].every((k) => set.has(pad(k))));
  check(`B N=${N}: tek chunk (numFoods=${nf} ≤ 400)`, chunkGroups.size === 1, `chunks=${chunkGroups.size}`);
  check(`H N=${N}: sayfa sınırında sıra artan (skip/dup YOK)`, sortedOk);
  check(`B N=${N}: motor ok:true`, res.ok === true);
}

// ════════════════════════════════════════════════════════════════════════════
// TEST G — query error: nutrient sayfasında (orta) hata → motor THROW; sessiz eksik öneri YOK.
//   Ayrıca aday FOODS sorgusunda hata → THROW (yeni fail-closed davranış).
// ════════════════════════════════════════════════════════════════════════════
console.log("── TEST G: query error propagation (sessiz eksik öneri YOK) ──");
{
  // >1000 nutrient tek chunk (2 sayfa) → 2. nutrient range çağrısında hata.
  const cat = buildCatalog({ numFoods: 300, codesPerFood: 5, target: TARGET }); // 1500 satır → 2 sayfa.
  const itemId = "item-g";
  const { item, snap } = makeItem(CALLER, itemId, null, 100, TARGET);
  const db = makeDb(
    {
      nutrition_plan_items: [item],
      nutrition_plan_item_nutrients: snap,
      nutrition_foods: cat.foods,
      nutrition_food_nutrients: cat.nutr,
    },
    { errorPlan: { nutrition_food_nutrients: 2 } }, // 2. çağrı (orta sayfa) hata.
  );
  let threw = false, msg = "";
  try { await resolveAlternativesForItem(db, CALLER, itemId, { sameGroupOnly: false }); }
  catch (e) { threw = true; msg = String((e && e.message) || e); }
  check("G: nutrient orta-sayfa hatası → motor THROW (kısmî sonuç yok)", threw, msg);
  check("G: hata fetchAllPaged sözleşmesiyle propagate", /fetchAllPaged|simulated db error/.test(msg), msg);
}
{
  // aday FOODS sorgusunda ilk sayfada hata → THROW (eski davranış sessizce boş dönerdi).
  const cat = buildCatalog({ numFoods: 10, codesPerFood: 5, target: TARGET });
  const itemId = "item-g2";
  const { item, snap } = makeItem(CALLER, itemId, null, 100, TARGET);
  const db = makeDb(
    {
      nutrition_plan_items: [item],
      nutrition_plan_item_nutrients: snap,
      nutrition_foods: cat.foods,
      nutrition_food_nutrients: cat.nutr,
    },
    { errorPlan: { nutrition_foods: 1 } },
  );
  let threw = false, msg = "";
  try { await resolveAlternativesForItem(db, CALLER, itemId, { sameGroupOnly: false }); }
  catch (e) { threw = true; msg = String((e && e.message) || e); }
  check("G: aday FOODS sorgu hatası → motor THROW (fail-closed)", threw, msg);
}

console.log("");
console.log(`SONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILURES:", failures.join(", ")); process.exit(1); }
console.log("✅ BES-01 alternatif retrieval — TÜM TESTLER PASS (lossless, chunked, paginated, tenant-safe, fail-closed)");
