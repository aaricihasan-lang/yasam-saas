// ============================================================
// Beslenme — importCatalog GÜVENLİ ÖLÇEK harness'i (MOCK DB; env-siz, gerçek DB YOK).
// classifyFood + writeFood sözleşmelerini doğrular:
//   unchanged / skipped_existing(313 KORUMA) / updated / created / rejected / repair(partial-heal)
//   + retry(transient) + commit-marker sıralaması + tenant izolasyonu + idempotent re-run.
//   node scripts/beslenme-food-engine/catalogImportHarness.mjs  ·  FAIL → exit 1
// ============================================================
import { classifyFood, writeFood, hashFood } from "./importCatalog.mjs";

const T = "00000000-0000-4000-8000-000000000001";
const FOREIGN = "ffffffff-ffff-ffff-ffff-ffffffffffff";
let uid = 0; const nextId = () => `id-${++uid}`;

// ── Mock Supabase (in-memory tables + fault injection) ──
function makeDb(seed = {}, faults = []) {
  const tables = {
    nutrition_foods: [], nutrition_food_external_refs: [], nutrition_food_nutrients: [], nutrition_food_portions: [],
    ...seed,
  };
  const calls = [];
  const maybeFault = (table, op) => {
    for (const f of faults) {
      if (f.table === table && f.op === op) { f._n = (f._n || 0) + 1; if (f._n === f.nth) { if (f.once) f.nth = -1; throw new Error(f.kind === "transient" ? "fetch failed (simulated transient)" : "hard db error"); } }
    }
  };
  function builder(table) {
    const st = { table, op: "select", filters: [], patch: null, rows: null, cols: "*", single: false, maybe: false };
    const api = {
      select(c) { st.cols = c; return api; },
      insert(rows) { st.op = "insert"; st.rows = Array.isArray(rows) ? rows : [rows]; return api; },
      update(p) { st.op = "update"; st.patch = p; return api; },
      delete() { st.op = "delete"; return api; },
      eq(col, val) { st.filters.push((r) => r[col] === val); st._eq = st._eq || {}; st._eq[col] = val; return api; },
      single() { st.single = true; return api; },
      maybeSingle() { st.maybe = true; return api; },
      then(res, rej) { return Promise.resolve().then(() => run(st)).then(res, rej); },
    };
    return api;
  }
  function run(st) {
    calls.push({ table: st.table, op: st.op });
    maybeFault(st.table, st.op);
    const rowsOf = () => tables[st.table].filter((r) => st.filters.every((f) => f(r)));
    if (st.op === "select") {
      const found = rowsOf();
      if (st.single) return { data: found[0], error: found[0] ? null : { message: "no row" } };
      if (st.maybe) return { data: found[0] ?? null, error: null };
      return { data: found, error: null };
    }
    if (st.op === "insert") {
      const ins = st.rows.map((r) => ({ ...r, id: r.id ?? nextId() }));
      tables[st.table].push(...ins);
      if (st.single) return { data: { id: ins[0].id }, error: null };
      return { data: ins, error: null };
    }
    if (st.op === "update") { for (const r of rowsOf()) Object.assign(r, st.patch); return { data: null, error: null }; }
    if (st.op === "delete") { tables[st.table] = tables[st.table].filter((r) => !st.filters.every((f) => f(r))); return { data: null, error: null }; }
    return { data: null, error: null };
  }
  return { from: builder, _tables: tables, _calls: calls };
}

const dicts = {
  groupBy: new Map([["dairy", "g-dairy"], ["fruits", "g-fruits"]]),
  nutBy: new Map([["energy", { id: "n-en" }], ["protein", { id: "n-pro" }]]),
  unitBy: new Map([["kcal", { id: "u-kcal" }], ["g", { id: "u-g" }]]),
};
const doc = { dataset: "TEST", manifest_version: "test-v1", retrieved_at: "2026-09-21" };
const mkFood = (fdc, name, extra = {}) => ({ fdc_id: fdc, name_tr: name, name_en: name + " en", aliases: [], food_group: "dairy", prep_state: null, nutrients: { energy: { amount: 100, unit: "kcal" }, protein: { amount: 5, unit: "g" } }, portions: [], ...extra });

let pass = 0, fail = 0; const fails = [];
const chk = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } console.log(`  ${c ? "PASS" : "FAIL"}  ${n}`); };

// seed helper: existing food + ref with given hash
function seedExisting(db, food, hash, opts = {}) {
  const fid = opts.foodId || nextId();
  db._tables.nutrition_foods.push({ id: fid, tenant_id: T, name_tr: food.name_tr, name_en: food.name_en, food_group_id: "g-dairy", is_active: true });
  db._tables.nutrition_food_external_refs.push({ id: nextId(), tenant_id: T, food_id: fid, provider: "usda_fdc", external_id: food.fdc_id, content_hash: hash });
  db._tables.nutrition_food_nutrients.push({ id: nextId(), tenant_id: T, food_id: fid, nutrient_id: "n-en", amount: 100, unit_id: "u-kcal", basis_grams: 100 });
  return fid;
}

// ── T1 unchanged ──
{
  const f = mkFood("100", "Süt"); const db = makeDb();
  seedExisting(db, f, hashFood(f));
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T1 aynı hash → unchanged", cls.status === "unchanged");
}
// ── T2 skipped_existing (313 KORUMA, allowUpdate=false) ──
{
  const f = mkFood("101", "Yoğurt"); const db = makeDb();
  seedExisting(db, f, "OLD_HASH");
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T2 farklı hash + allowUpdate=false → skipped_existing (KORUMA)", cls.status === "skipped_existing");
  chk("T2 mevcut food satırı DEĞİŞMEDİ (yazma yok)", db._tables.nutrition_foods.length === 1);
}
// ── T3 updated (allowUpdate=true) — mevcut food_id korunur, yeni food OLUŞMAZ ──
{
  const f = mkFood("102", "Kaşar"); const db = makeDb();
  const fid = seedExisting(db, f, "OLD_HASH");
  const cls = await classifyFood(db, T, f, { allowUpdate: true, dicts });
  chk("T3 farklı hash + allowUpdate=true → updated", cls.status === "updated");
  await writeFood(db, T, doc, f, cls, dicts, 3);
  chk("T3 aynı food_id kullanıldı (duplicate food YOK)", db._tables.nutrition_foods.length === 1 && db._tables.nutrition_foods[0].id === fid);
  const ref = db._tables.nutrition_food_external_refs.find((r) => r.external_id === "102");
  chk("T3 commit-marker finalize: content_hash = yeni hash", ref.content_hash === hashFood(f));
}
// ── T4 created + commit-marker sırası + tenant izolasyonu ──
{
  const f = mkFood("200", "Ricotta"); const db = makeDb();
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T4 external_ref yok → created", cls.status === "created");
  await writeFood(db, T, doc, f, cls, dicts, 3);
  chk("T4 yeni food + ref + children yazıldı", db._tables.nutrition_foods.length === 1 && db._tables.nutrition_food_nutrients.length === 2);
  const ref = db._tables.nutrition_food_external_refs[0];
  chk("T4 commit-marker: ref.content_hash SON adımda set edildi", ref.content_hash === hashFood(f));
  const allT = [...db._tables.nutrition_foods, ...db._tables.nutrition_food_external_refs, ...db._tables.nutrition_food_nutrients].every((r) => r.tenant_id === T);
  chk("T4 tenant izolasyonu: tüm satırlar SYSTEM tenant", allT);
  // idempotent re-run
  const cls2 = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T4 idempotent re-run → unchanged (duplicate YOK)", cls2.status === "unchanged" && db._tables.nutrition_foods.length === 1);
}
// ── T5 rejected (vocab miss) ──
{
  const f = mkFood("300", "Hatalı", { nutrients: { energy: { amount: 50, unit: "kcal" }, calcium: { amount: 10, unit: "mg" } } });
  const db = makeDb();
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T5 bilinmeyen nutrient (calcium) → rejected", cls.status === "rejected" && /nutrient:calcium/.test(cls.reason));
  chk("T5 rejected → hiç yazma yok", db._tables.nutrition_foods.length === 0);
}
// ── T6 partial-heal: created sırasında children YAZILAMADI → re-run repair ──
{
  const f = mkFood("400", "Provolone");
  // children insert (nutrition_food_nutrients insert) İLK çağrıda hard-fail
  const db = makeDb({}, [{ table: "nutrition_food_nutrients", op: "insert", nth: 1, kind: "hard" }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let threw = false; try { await writeFood(db, T, doc, f, cls, dicts, 0); } catch { threw = true; }
  chk("T6 children yazımı fail → writeFood throw", threw);
  const ref = db._tables.nutrition_food_external_refs.find((r) => r.external_id === "400");
  chk("T6 partial: food+ref var ama content_hash NULL (commit marker düşmedi)", !!ref && ref.content_hash == null && db._tables.nutrition_foods.length === 1);
  // re-run classify → repair
  const cls2 = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T6 re-run → repair (content_hash boş)", cls2.status === "repair");
  const w2 = await writeFood(db, T, doc, f, cls2, dicts, 3);
  chk("T6 repair: DUPLICATE food OLUŞMADI (hâlâ 1)", db._tables.nutrition_foods.length === 1);
  chk("T6 repair: children onarıldı + hash finalize", db._tables.nutrition_food_nutrients.filter((r)=>r.food_id===w2.foodId).length === 2 && ref.content_hash === hashFood(f));
}
// ── T7 retry: transient hata bir kez → withRetry toparlar ──
{
  const f = mkFood("500", "Cheddar");
  const db = makeDb({}, [{ table: "nutrition_foods", op: "insert", nth: 1, kind: "transient" }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let ok = true; try { await writeFood(db, T, doc, f, cls, dicts, 3); } catch { ok = false; }
  chk("T7 transient insert hatası → retry ile başarı", ok && db._tables.nutrition_foods.length === 1);
}
// ── T8 foreign-tenant seed görünmez (izolasyon): classify yalnız SYSTEM ref'e bakar ──
{
  const f = mkFood("600", "Feta"); const db = makeDb();
  db._tables.nutrition_food_external_refs.push({ id: nextId(), tenant_id: FOREIGN, food_id: "x", provider: "usda_fdc", external_id: "600", content_hash: hashFood(f) });
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T8 foreign-tenant ref görünmez → created (SYSTEM izole)", cls.status === "created");
}

console.log(`\n${"=".repeat(52)}\n  CATALOG IMPORT HARNESS: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("  FAILURES:\n   - " + fails.join("\n   - ")); process.exit(1); }
console.log("  ✅ Güvenli-ölçek importer sözleşmeleri GEÇTİ"); process.exit(0);
