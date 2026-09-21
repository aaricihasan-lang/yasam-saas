// ============================================================
// Beslenme — importCatalog GÜVENLİ ÖLÇEK harness'i (MOCK DB; env-siz, gerçek DB YOK).
// classifyFood + writeFood sözleşmelerini doğrular:
//   unchanged / skipped_existing(313 KORUMA) / updated / created / rejected / repair(partial-heal)
//   + retry(transient) + commit-marker sıralaması + tenant izolasyonu + idempotent re-run.
//   node scripts/beslenme-food-engine/catalogImportHarness.mjs  ·  FAIL → exit 1
// ============================================================
import { classifyFood, writeFood, hashFood, loadDicts } from "./importCatalog.mjs";

const T = "00000000-0000-4000-8000-000000000001";
const FOREIGN = "ffffffff-ffff-ffff-ffff-ffffffffffff";
let uid = 0; const nextId = () => `id-${++uid}`;

// ── Mock Supabase (in-memory tables + fault injection) ──
function makeDb(seed = {}, faults = []) {
  const tables = {
    nutrition_foods: [], nutrition_food_external_refs: [], nutrition_food_nutrients: [], nutrition_food_portions: [],
    nutrition_food_groups: [], nutrition_nutrients: [], nutrition_units: [],
    ...seed,
  };
  const calls = [];
  // fault kinds: "transient"/"hard" = THROW (transport-level); "error"/"error-transient" = RETURN {error} (no throw).
  const faultAction = (table, op) => {
    for (const f of faults) {
      if (f.table === table && f.op === op) { f._n = (f._n || 0) + 1; if (f._n === f.nth) { if (f.once) f.nth = -1; return f; } }
    }
    return null;
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
    const fa = faultAction(st.table, st.op);
    // fa.after=false → hata MUTASYONDAN ÖNCE (yazma OLMAZ). fa.after=true → MUTASYON UYGULANIR sonra hata
    //   ("DB yazdı ama yanıt kayboldu" senaryosu). throw kinds vs {error}-return kinds.
    const applyFault = () => {
      if (fa.kind === "transient") throw new Error("fetch failed (simulated transient thrown)");
      if (fa.kind === "hard") throw new Error("hard db error thrown");
      if (fa.kind === "error") return { data: null, error: { message: "permanent db error (returned)" } };
      if (fa.kind === "error-transient") return { data: null, error: { message: "fetch failed (returned transient)" } };
      return null;
    };
    if (fa && !fa.after) { const r = applyFault(); if (r) return r; }
    const rowsOf = () => tables[st.table].filter((r) => st.filters.every((f) => f(r)));
    let result;
    if (st.op === "select") {
      const found = rowsOf();
      result = st.single ? { data: found[0], error: found[0] ? null : { message: "no row" } } : st.maybe ? { data: found[0] ?? null, error: null } : { data: found, error: null };
    } else if (st.op === "insert") {
      const ins = st.rows.map((r) => ({ ...r, id: r.id ?? nextId() }));
      tables[st.table].push(...ins);
      result = st.single ? { data: { id: ins[0].id }, error: null } : { data: ins, error: null };
    } else if (st.op === "update") { for (const r of rowsOf()) Object.assign(r, st.patch); result = { data: null, error: null }; }
    else if (st.op === "delete") { tables[st.table] = tables[st.table].filter((r) => !st.filters.every((f) => f(r))); result = { data: null, error: null }; }
    else result = { data: null, error: null };
    if (fa && fa.after) { const r = applyFault(); if (r) return r; } // mutasyon uygulandı, sonra hata
    return result;
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
// ── T7 YAZMA RETRY YOK: food INSERT transient (yazılmadan) → fatal, otomatik retry YOK ──
{
  const f = mkFood("500", "Cheddar");
  const db = makeDb({}, [{ table: "nutrition_foods", op: "insert", nth: 1, kind: "transient" }]); // mutasyon ÖNCESİ throw
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let err = null; try { await writeFood(db, T, doc, f, cls, dicts, 3); } catch (e) { err = e; }
  chk("T7 food INSERT transient → YAZMA RETRY YOK → fatal (ambiguous)", err && err.fatal === true && err.phase === "food_insert");
  chk("T7 yazılmadan hata → food satırı YOK (körlemesine tekrar YOK)", db._tables.nutrition_foods.length === 0);
}
// ── T8 foreign-tenant seed görünmez (izolasyon): classify yalnız SYSTEM ref'e bakar ──
{
  const f = mkFood("600", "Feta"); const db = makeDb();
  db._tables.nutrition_food_external_refs.push({ id: nextId(), tenant_id: FOREIGN, food_id: "x", provider: "usda_fdc", external_id: "600", content_hash: hashFood(f) });
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T8 foreign-tenant ref görünmez → created (SYSTEM izole)", cls.status === "created");
}

// ── T9 SELECT {error} (throw YOK) → classify BAŞARI SAYMAZ (created SANMAZ) ──
{
  const f = mkFood("700", "Süt"); const db = makeDb({}, [{ table: "nutrition_food_external_refs", op: "select", nth: 1, kind: "error" }]);
  let threw = false; try { await classifyFood(db, T, f, { allowUpdate: false, dicts, retries: 0 }); } catch { threw = true; }
  chk("T9 SELECT {error} → classify THROW (created/duplicate ÖNLENDİ)", threw);
}
// ── T10 nutrient DELETE {error} → writeFood throw, commit-marker YAZILMAZ ──
{
  const f = mkFood("701", "Ayran"); const db = makeDb({}, [{ table: "nutrition_food_nutrients", op: "delete", nth: 1, kind: "error" }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let threw = false; try { await writeFood(db, T, doc, f, cls, dicts, 0); } catch { threw = true; }
  const ref = db._tables.nutrition_food_external_refs.find((r) => r.external_id === "701");
  chk("T10 nutrient DELETE {error} → throw", threw);
  chk("T10 commit-marker YAZILMADI (content_hash NULL)", !!ref && ref.content_hash == null);
}
// ── T11 nutrient INSERT {error} → writeFood throw, commit-marker YAZILMAZ ──
{
  const f = mkFood("702", "Kefir"); const db = makeDb({}, [{ table: "nutrition_food_nutrients", op: "insert", nth: 1, kind: "error" }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let threw = false; try { await writeFood(db, T, doc, f, cls, dicts, 0); } catch { threw = true; }
  const ref = db._tables.nutrition_food_external_refs.find((r) => r.external_id === "702");
  chk("T11 nutrient INSERT {error} → throw", threw);
  chk("T11 commit-marker YAZILMADI", !!ref && ref.content_hash == null);
}
// ── T12 commit-marker UPDATE {error} → throw; hash NULL kalır → re-run repair ──
{
  const f = mkFood("703", "Sucuk"); const db = makeDb({}, [{ table: "nutrition_food_external_refs", op: "update", nth: 1, kind: "error" }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let threw = false; try { await writeFood(db, T, doc, f, cls, dicts, 0); } catch { threw = true; }
  const ref = db._tables.nutrition_food_external_refs.find((r) => r.external_id === "703");
  chk("T12 commit-marker UPDATE {error} → throw", threw);
  chk("T12 hash NULL kaldı (yarım işaret yok)", !!ref && ref.content_hash == null);
  const cls2 = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T12 re-run → repair (content_hash boş)", cls2.status === "repair");
}
// ── T13 Food INSERT ok + external_ref INSERT {error} → ORPHAN: food_id ile raporla, otomatik silme YOK ──
{
  const f = mkFood("704", "Pastırma"); const db = makeDb({}, [{ table: "nutrition_food_external_refs", op: "insert", nth: 1, kind: "error" }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let orphanId = null; try { await writeFood(db, T, doc, f, cls, dicts, 0); } catch (e) { orphanId = e.orphanFoodId; chk("T13 orphan error fatal işaretli", e.fatal === true && e.fdc === "704"); }
  chk("T13 food yazıldı (1) ama ref YOK → orphan food_id raporlandı", db._tables.nutrition_foods.length === 1 && orphanId === db._tables.nutrition_foods[0].id);
  chk("T13 otomatik silme YOK (food satırı duruyor)", db._tables.nutrition_foods.length === 1 && db._tables.nutrition_food_external_refs.length === 0);
}
// ── T14 SELECT RETRY KORUNUR: classify SELECT returned-transient {error} bir kez → retry → başarı ──
{
  const f = mkFood("705", "Simit"); const db = makeDb({}, [{ table: "nutrition_food_external_refs", op: "select", nth: 1, kind: "error-transient", once: true }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts, retries: 3 });
  chk("T14 SELECT transient {error} → retry ile toparlar (okuma retry KORUNDU)", cls.status === "created");
}
// ── T15 stale/mismatched checkpoint: tamamlanmamış fdc classify unchanged DEĞİL → atlanmamalı ──
{
  const f = mkFood("706", "Lavaş"); const db = makeDb(); // hiç yazılmamış
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T15 checkpoint'te olsa bile tamamlanmamış kayıt classify≠unchanged → resume ATLAMAZ", cls.status !== "unchanged");
}
// ── T16 sözlük SELECT {error} → loadDicts THROW (sessiz boş-sözlük/toplu-rejected ÖNLENDİ) ──
{
  const seed = { nutrition_food_groups: [{ id: "g1", code: "dairy" }], nutrition_nutrients: [{ id: "n1", code: "energy", category: "energy", is_active: true }], nutrition_units: [{ id: "u1", code: "kcal", unit_type: "energy", is_active: true }] };
  const db = makeDb(seed, [{ table: "nutrition_food_groups", op: "select", nth: 1, kind: "error" }]);
  let threw = false; try { await loadDicts(db, 0); } catch { threw = true; }
  chk("T16 sözlük SELECT {error} → loadDicts THROW (boş sözlük sanılmaz)", threw);
}
// ── T17 sözlük BOŞ (0 satır) → loadDicts THROW (yanlış hedef/seed eksik → toplu-rejected engellendi) ──
{
  const db = makeDb(); // tüm dict tabloları boş
  let threw = false, msg = ""; try { await loadDicts(db, 0); } catch (e) { threw = true; msg = String(e.message); }
  chk("T17 boş sözlük → loadDicts THROW", threw && /BOŞ/.test(msg));
}
// ── T18 sözlükler dolu → loadDicts başarı (map'ler kurulur) ──
{
  const seed = { nutrition_food_groups: [{ id: "g1", code: "dairy" }], nutrition_nutrients: [{ id: "n1", code: "energy", category: "energy", is_active: true }], nutrition_units: [{ id: "u1", code: "kcal", unit_type: "energy", is_active: true }] };
  const db = makeDb(seed);
  const d = await loadDicts(db, 0);
  chk("T18 dolu sözlük → loadDicts map'leri kurar", d.groupBy.get("dairy") === "g1" && d.nutBy.get("energy")?.id === "n1" && d.unitBy.get("kcal")?.id === "u1");
}

// ══ "DB YAZDI AMA YANIT KAYBOLDU" (mutasyon uygulandı + transient hata) — otomatik retry YOK ══
// ── T19 food INSERT yazıldı-ama-yanıt-kayboldu → AMBIGUOUS fatal, RETRY YOK, food duplicate OLMAZ ──
{
  const f = mkFood("800", "Hellim");
  const db = makeDb({}, [{ table: "nutrition_foods", op: "insert", nth: 1, kind: "transient", after: true }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let err = null; try { await writeFood(db, T, doc, f, cls, dicts, 3); } catch (e) { err = e; }
  chk("T19 food INSERT belirsiz → fatal + ambiguous (retry YOK)", err && err.fatal === true && err.ambiguous === true && err.phase === "food_insert");
  chk("T19 food DB'ye 1 kez yazıldı (retry ile ikinci food OLUŞMADI)", db._tables.nutrition_foods.length === 1);
  chk("T19 external_ref YOK → olası orphan raporlanır", db._tables.nutrition_food_external_refs.length === 0);
}
// ── T20 external_ref INSERT yazıldı-ama-kayboldu → SELECT ile UZLAŞTIR → devam, duplicate YOK ──
{
  const f = mkFood("801", "Tulum");
  const db = makeDb({}, [{ table: "nutrition_food_external_refs", op: "insert", nth: 1, kind: "transient", after: true }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let ok = true; try { await writeFood(db, T, doc, f, cls, dicts, 3); } catch { ok = false; }
  const refs = db._tables.nutrition_food_external_refs.filter((r) => r.external_id === "801");
  chk("T20 ref belirsiz → uzlaştır (SELECT) → tamamlandı", ok);
  chk("T20 external_ref TEK (duplicate YOK)", refs.length === 1);
  chk("T20 commit-marker finalize (hash yazıldı)", refs[0]?.content_hash === hashFood(f));
}
// ── T21 nutrient INSERT yazıldı-ama-kayboldu → throw, commit-marker YOK → re-run repair TEMİZ ──
{
  const f = mkFood("802", "Çökelek");
  const db = makeDb({}, [{ table: "nutrition_food_nutrients", op: "insert", nth: 1, kind: "transient", after: true }]);
  const cls = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  let threw = false; try { await writeFood(db, T, doc, f, cls, dicts, 3); } catch { threw = true; }
  const ref = db._tables.nutrition_food_external_refs.find((r) => r.external_id === "802");
  chk("T21 nutrient INSERT belirsiz → throw (retry YOK)", threw);
  chk("T21 commit-marker YAZILMADI (content_hash NULL)", !!ref && ref.content_hash == null);
  // re-run repair: delete+reinsert → duplicate OLMAZ, doğru sayı, hash finalize
  const cls2 = await classifyFood(db, T, f, { allowUpdate: false, dicts });
  chk("T21 re-run → repair", cls2.status === "repair");
  const w2 = await writeFood(db, T, doc, f, cls2, dicts, 3);
  chk("T21 repair: nutrient satırları TAM 2 (duplicate YOK)", db._tables.nutrition_food_nutrients.filter((r) => r.food_id === w2.foodId).length === 2 && ref.content_hash === hashFood(f));
}

console.log(`\n${"=".repeat(52)}\n  CATALOG IMPORT HARNESS: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("  FAILURES:\n   - " + fails.join("\n   - ")); process.exit(1); }
console.log("  ✅ Güvenli-ölçek importer sözleşmeleri GEÇTİ"); process.exit(0);
