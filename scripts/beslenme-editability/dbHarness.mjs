// ============================================================
// Beslenme — Düzenlenebilirlik / Sil / Reset / Snapshot DB harness'i (PGlite, DB-GERÇEK).
// TÜM nutrition migration'ları uygulanır; yeni RPC'ler iki tenant ile uçtan uca test edilir.
//   A) atomik replace (INSERT hatasında eski veri korunur) + source_id/quantity koruması
//   B) kişiselleştirme (fork) + iki tenant izolasyonu + effective çözüm + arama çift kayıt
//   C) Sil (özgün/kopya/sistem) + rehber RESTRICT + sistem satırı korunur
//   D) Sistem değerine dön (tek/toplu) — özgün besine dokunmaz
//   E) 4 haneli challenge tüketimi (yanlış/süre/tenant/kullanıcı/kapsam/tekrar/kilit)
//   F) taslak plan snapshot yenileme (yalnız draft; eski plan otomatik değişmez)
// FAIL → exit 1.
// ============================================================
import { bootstrapNutritionDb } from "./pgBootstrap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };
async function expectErr(db, sql, params, code, name) {
  try { await db.query(sql, params); ok(name, false, "(hata bekleniyordu)"); }
  catch (e) { ok(name, e.code === code || String(e.message).includes(code), `(got ${e.code} ${e.message})`); }
}

const SYS = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
const UB = "bbbbbbbb-1111-4000-8000-00000000000b";

const { db } = await bootstrapNutritionDb();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const all = async (sql, p = []) => (await db.query(sql, p)).rows;

const nut = async (code) => (await one(`SELECT id FROM nutrition_nutrients WHERE code=$1`, [code])).id;
const unit = async (code) => (await one(`SELECT id FROM nutrition_units WHERE code=$1`, [code])).id;
const ENERGY = await nut("energy"), PROTEIN = await nut("protein");
const KCAL = await unit("kcal"), G = await unit("g"), PIECE = await unit("piece");

// ── Seed: SYSTEM "Elma Suyu" 46 kcal + porsiyon + geleneksel ──
const SYS_FOOD = (await one(
  `INSERT INTO nutrition_foods (tenant_id, name_tr, aliases) VALUES ($1,'Elma Suyu','{}') RETURNING id`, [SYS])).id;
await db.query(`INSERT INTO nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams)
  VALUES ($1,$2,$3,46,$4,100), ($1,$2,$5,0.1,$6,100)`, [SYS, SYS_FOOD, ENERGY, KCAL, PROTEIN, G]);
await db.query(`INSERT INTO nutrition_food_portions (tenant_id, food_id, label_tr, quantity, measure_unit_id, gram_weight)
  VALUES ($1,$2,'1 su bardağı',1,$3,200)`, [SYS, SYS_FOOD, PIECE]);
await db.query(`INSERT INTO nutrition_food_traditional (tenant_id, food_id, thermal_quality) VALUES ($1,$2,'cold')`, [SYS, SYS_FOOD]);
const SYS_FOOD2 = (await one(
  `INSERT INTO nutrition_foods (tenant_id, name_tr, aliases) VALUES ($1,'Muz','{}') RETURNING id`, [SYS])).id;

const search = async (tenant, q = null) => all(
  `SELECT id, name_tr, is_system, total_count FROM nutrition_food_search($1,$2,$3,NULL,false,50,0)`, [tenant, SYS, q]);
const energyOf = async (tenant, foodId) => Number((await one(
  `SELECT amount FROM nutrition_food_nutrients WHERE tenant_id=$1 AND food_id=$2 AND nutrient_id=$3`, [tenant, foodId, ENERGY]))?.amount);
const effective = async (tenant, foodId) => one(`SELECT * FROM nutrition_food_resolve_effective($1,$2,$3)`, [tenant, SYS, foodId]);

console.log("\n[A] atomik replace + koruma");
const CUSTOM = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,'Ev Yoğurdu') RETURNING id`, [A])).id;
const SRC = (await one(`INSERT INTO nutrition_sources (tenant_id, title, source_type) VALUES ($1,'Kaynak X','book') RETURNING id`, [A])).id;
await db.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { nutrient_id: ENERGY, amount: 61, unit_id: KCAL, source_id: SRC }, { nutrient_id: PROTEIN, amount: 3.5, unit_id: G }])]);
ok("nutrients replace yazdı (2 satır)", (await all(`SELECT 1 FROM nutrition_food_nutrients WHERE tenant_id=$1 AND food_id=$2`, [A, CUSTOM])).length === 2);
// source_id anahtarı YOK → korunur
await db.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { nutrient_id: ENERGY, amount: 62, unit_id: KCAL }, { nutrient_id: PROTEIN, amount: 3.6, unit_id: G }])]);
ok("source_id anahtarı yoksa mevcut kaynak bağı KORUNUR",
  (await one(`SELECT source_id FROM nutrition_food_nutrients WHERE tenant_id=$1 AND food_id=$2 AND nutrient_id=$3`, [A, CUSTOM, ENERGY])).source_id === SRC);
ok("değer güncellendi 62", (await energyOf(A, CUSTOM)) === 62);
// source_id: null açıkça → temizlenir
await db.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { nutrient_id: ENERGY, amount: 62, unit_id: KCAL, source_id: null }, { nutrient_id: PROTEIN, amount: 3.6, unit_id: G }])]);
ok("source_id:null açıkça verilirse temizlenir",
  (await one(`SELECT source_id FROM nutrition_food_nutrients WHERE tenant_id=$1 AND food_id=$2 AND nutrient_id=$3`, [A, CUSTOM, ENERGY])).source_id === null);
// TRANSACTION TESTİ: ikinci satır geçersiz birim (FK ihlali) → tüm işlem geri alınır, eski veri durur
await expectErr(db, `SELECT nutrition_food_nutrients_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { nutrient_id: ENERGY, amount: 999, unit_id: KCAL }, { nutrient_id: PROTEIN, amount: 1, unit_id: "11111111-1111-4111-8111-111111111111" }])],
  "23503", "yapay INSERT hatası → hata döner");
ok("TRANSACTION: başarısız replace sonrası ESKİ değerler duruyor (62, 2 satır)",
  (await energyOf(A, CUSTOM)) === 62 && (await all(`SELECT 1 FROM nutrition_food_nutrients WHERE tenant_id=$1 AND food_id=$2`, [A, CUSTOM])).length === 2);
// porsiyon: quantity + id koruma
await db.query(`SELECT nutrition_food_portions_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { label_tr: "1 kase", quantity: 2, measure_unit_id: PIECE, gram_weight: 150, is_default: true, sort_order: 0, source_id: SRC }])]);
const P1 = await one(`SELECT id, quantity FROM nutrition_food_portions WHERE tenant_id=$1 AND food_id=$2`, [A, CUSTOM]);
await db.query(`SELECT nutrition_food_portions_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { id: P1.id, label_tr: "1 büyük kase", measure_unit_id: PIECE, gram_weight: 180, is_default: true, sort_order: 0 }])]);
const P1b = await one(`SELECT id, quantity, gram_weight, label_tr, source_id FROM nutrition_food_portions WHERE tenant_id=$1 AND food_id=$2`, [A, CUSTOM]);
ok("porsiyon quantity anahtarı yoksa KORUNUR (2, 1'e sıfırlanmaz)", Number(P1b.quantity) === 2);
ok("porsiyon id korunur + etiket/gram güncellenir", P1b.id === P1.id && P1b.label_tr === "1 büyük kase" && Number(P1b.gram_weight) === 180);
ok("porsiyon source_id korunur", P1b.source_id === SRC);
await expectErr(db, `SELECT nutrition_food_portions_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { id: "22222222-2222-4222-8222-222222222222", label_tr: "x", measure_unit_id: PIECE, gram_weight: 1 }])], "45014", "başka besine ait porsiyon id → 45014");
await expectErr(db, `SELECT nutrition_food_portions_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify([
  { label_tr: "a", measure_unit_id: PIECE, gram_weight: 1 }, { label_tr: "A", measure_unit_id: PIECE, gram_weight: 2 }])], "23505", "porsiyon etiket çakışması → 23505");
ok("porsiyon: başarısız replace sonrası eski porsiyon DURUYOR", (await all(`SELECT 1 FROM nutrition_food_portions WHERE tenant_id=$1 AND food_id=$2`, [A, CUSTOM])).length === 1);
// geleneksel
await db.query(`SELECT nutrition_food_traditional_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify({ thermal_quality: "hot", source_id: SRC })]);
await db.query(`SELECT nutrition_food_traditional_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify({ thermal_quality: "cold", notes: "n" })]);
const T1 = await one(`SELECT thermal_quality, source_id FROM nutrition_food_traditional WHERE tenant_id=$1 AND food_id=$2`, [A, CUSTOM]);
ok("geleneksel: source_id anahtarı yoksa KORUNUR + değer güncellenir", T1.thermal_quality === "cold" && T1.source_id === SRC);
await expectErr(db, `SELECT nutrition_food_traditional_replace($1,$2,$3,$4::jsonb)`, [A, SYS, CUSTOM, JSON.stringify({ thermal_quality: "BOGUS" })], "23514", "geleneksel geçersiz nitelik → hata");
ok("geleneksel: başarısız yazma sonrası eski kayıt DURUYOR", (await one(`SELECT thermal_quality FROM nutrition_food_traditional WHERE tenant_id=$1 AND food_id=$2`, [A, CUSTOM])).thermal_quality === "cold");
// sistem satırı / başka tenant yazılamaz
await expectErr(db, `SELECT nutrition_food_nutrients_replace($1,$2,$3,'[]'::jsonb)`, [A, SYS, SYS_FOOD], "45014", "A tenant'ı SYSTEM satırına replace yapamaz (45014)");
await expectErr(db, `SELECT nutrition_food_nutrients_replace($1,$2,$3,'[]'::jsonb)`, [SYS, SYS, SYS_FOOD], "45030", "SYSTEM tenant bağlamı ile yazma → 45030");
await expectErr(db, `SELECT nutrition_food_nutrients_replace($1,$2,$3,'[]'::jsonb)`, [B, SYS, CUSTOM], "45014", "B tenant'ı A'nın besinine yazamaz (IDOR)");
ok("SYSTEM Elma Suyu hâlâ 46 kcal", (await energyOf(SYS, SYS_FOOD)) === 46);

console.log("\n[B] kişiselleştirme + iki tenant izolasyonu");
const FORK_A = (await one(`SELECT nutrition_food_fork_system($1,$2,$3) AS id`, [A, SYS, SYS_FOOD])).id;
ok("fork oluştu (A tenant'ında, origin=SYSTEM)", !!(await one(`SELECT 1 FROM nutrition_foods WHERE id=$1 AND tenant_id=$2 AND origin_food_id=$3`, [FORK_A, A, SYS_FOOD])));
ok("fork idempotent (ikinci çağrı aynı id)", (await one(`SELECT nutrition_food_fork_system($1,$2,$3) AS id`, [A, SYS, SYS_FOOD])).id === FORK_A);
ok("fork tam kopya: enerji 46 + protein + porsiyon + geleneksel",
  (await energyOf(A, FORK_A)) === 46
  && (await all(`SELECT 1 FROM nutrition_food_nutrients WHERE tenant_id=$1 AND food_id=$2`, [A, FORK_A])).length === 2
  && (await all(`SELECT 1 FROM nutrition_food_portions WHERE tenant_id=$1 AND food_id=$2`, [A, FORK_A])).length === 1
  && (await one(`SELECT thermal_quality FROM nutrition_food_traditional WHERE tenant_id=$1 AND food_id=$2`, [A, FORK_A]))?.thermal_quality === "cold");
// A 46 → 52
await db.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,$4::jsonb)`, [A, SYS, FORK_A, JSON.stringify([
  { nutrient_id: ENERGY, amount: 52, unit_id: KCAL }, { nutrient_id: PROTEIN, amount: 0.1, unit_id: G }])]);
ok("Senaryo: A 52 kcal görür (effective = kopya)", (await effective(A, SYS_FOOD)).id === FORK_A && (await energyOf(A, FORK_A)) === 52);
ok("Senaryo: B 46 kcal görür (effective = SYSTEM)", (await effective(B, SYS_FOOD)).id === SYS_FOOD && (await energyOf(SYS, SYS_FOOD)) === 46);
ok("SYSTEM global satırı DEĞİŞMEDİ (46)", (await energyOf(SYS, SYS_FOOD)) === 46);
const sA = await search(A, "elma"), sB = await search(B, "elma");
ok("arama A: tek 'Elma Suyu' (kopya), çift kayıt YOK", sA.length === 1 && sA[0].id === FORK_A && Number(sA[0].total_count) === 1);
ok("arama B: tek 'Elma Suyu' (SYSTEM)", sB.length === 1 && sB[0].id === SYS_FOOD);
ok("browse A toplam = 3 (kopya + Muz + Ev Yoğurdu)", Number((await search(A))[0].total_count) === 3);
ok("effective: B, A'nın kopyasını ASLA çözemez (üçüncü tenant)", (await effective(B, FORK_A)) === undefined);
await expectErr(db, `UPDATE nutrition_foods SET origin_food_id=$2 WHERE id=$1`, [FORK_A, SYS_FOOD2], "23514", "origin_food_id sonradan değiştirilemez");
await expectErr(db, `INSERT INTO nutrition_foods (tenant_id, name_tr, origin_food_id) VALUES ($1,'Elma Suyu 2',$2)`, [A, SYS_FOOD], "23505", "aynı tenant+origin için ikinci kopya DB'de reddedilir");
// isim çakışması: B tenant'ında özgün 'Muz' var → Muz fork → 45031
await db.query(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,'Muz')`, [B]);
await expectErr(db, `SELECT nutrition_food_fork_system($1,$2,$3)`, [B, SYS, SYS_FOOD2], "45031", "aynı adlı özgün besin varken fork → 45031");
await expectErr(db, `SELECT nutrition_food_fork_system($1,$2,$3)`, [A, SYS, CUSTOM], "45014", "SYSTEM olmayan besin fork edilemez");
await expectErr(db, `SELECT nutrition_food_fork_system($1,$2,$3)`, [SYS, SYS, SYS_FOOD], "45015", "SYSTEM tenant kendini fork edemez");

console.log("\n[C] Sil (özgün / kopya / sistem) + rehber RESTRICT");
// SYSTEM Muz → B'de (özgün Muz var ama SYSTEM Muz ayrı) → A için gizle
const rHide = (await one(`SELECT nutrition_food_remove($1,$2,$3) AS r`, [A, SYS, SYS_FOOD2])).r;
ok("SYSTEM besini Sil → 'hidden' (fiziksel DELETE yok)", rHide.action === "hidden" && !!(await one(`SELECT 1 FROM nutrition_foods WHERE id=$1`, [SYS_FOOD2])));
ok("Senaryo 7: A'da Muz görünmez, B'de görünür",
  !(await search(A, "muz")).some((r) => r.id === SYS_FOOD2) && (await search(B, "muz")).some((r) => r.id === SYS_FOOD2));
ok("gizlenen besin A için effective çözülemez", (await effective(A, SYS_FOOD2)) === undefined);
await expectErr(db, `SELECT nutrition_food_fork_system($1,$2,$3)`, [A, SYS, SYS_FOOD2], "45014", "gizlenen besin fork edilemez");
// rehber RESTRICT: A kopyası rehberde kullanılıyor
const TOPIC = (await one(`INSERT INTO nutrition_topics (tenant_id, topic_type, title) VALUES ($1,'dietary_pattern','Akdeniz') RETURNING id`, [A])).id;
await db.query(`INSERT INTO nutrition_topic_foods (tenant_id, topic_id, food_id, relation_type) VALUES ($1,$2,$3,'recommended')`, [A, TOPIC, FORK_A]);
await expectErr(db, `SELECT nutrition_food_remove($1,$2,$3)`, [A, SYS, FORK_A], "23503", "rehberde kullanılan kopya silinemez (23503)");
ok("başarısız Sil sonrası kopya duruyor + gizleme yok",
  !!(await one(`SELECT 1 FROM nutrition_foods WHERE id=$1`, [FORK_A])) && !(await one(`SELECT 1 FROM nutrition_food_tenant_hidden WHERE tenant_id=$1 AND food_id=$2`, [A, SYS_FOOD])));
// özgün besin gerçek DELETE (cascade)
const rDel = (await one(`SELECT nutrition_food_remove($1,$2,$3) AS r`, [A, SYS, CUSTOM])).r;
ok("özgün besin Sil → gerçek DELETE + cascade (değer/porsiyon/geleneksel)", rDel.action === "deleted"
  && !(await one(`SELECT 1 FROM nutrition_foods WHERE id=$1`, [CUSTOM]))
  && (await all(`SELECT 1 FROM nutrition_food_nutrients WHERE food_id=$1`, [CUSTOM])).length === 0
  && (await all(`SELECT 1 FROM nutrition_food_portions WHERE food_id=$1`, [CUSTOM])).length === 0);
await expectErr(db, `SELECT nutrition_food_remove($1,$2,$3)`, [B, SYS, FORK_A], "45014", "B, A'nın kopyasını silemez (IDOR)");
// kopya Sil (rehber bağı kaldırıldıktan sonra) → kopya gider + origin gizlenir
await db.query(`DELETE FROM nutrition_topic_foods WHERE tenant_id=$1`, [A]);
const FORK_A2 = FORK_A;
const rRm = (await one(`SELECT nutrition_food_remove($1,$2,$3) AS r`, [A, SYS, FORK_A2])).r;
ok("kopya Sil → 'removed_personal' + origin A için gizli (sistem aslı geri BELİRMEZ)", rRm.action === "removed_personal"
  && !(await one(`SELECT 1 FROM nutrition_foods WHERE id=$1`, [FORK_A2]))
  && !!(await one(`SELECT 1 FROM nutrition_food_tenant_hidden WHERE tenant_id=$1 AND food_id=$2`, [A, SYS_FOOD]))
  && !(await search(A, "elma")).length);
ok("B hâlâ SYSTEM Elma Suyu'nu görür (46)", (await search(B, "elma")).length === 1 && (await energyOf(SYS, SYS_FOOD)) === 46);
ok("SYSTEM satırları hiç silinmedi (2)", (await all(`SELECT 1 FROM nutrition_foods WHERE tenant_id=$1`, [SYS])).length === 2);

console.log("\n[D] Sistem değerine dön (tek / toplu)");
// B: iki kopya + bir özgün
const S3 = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,'Armut') RETURNING id`, [SYS])).id;
const FB1 = (await one(`SELECT nutrition_food_fork_system($1,$2,$3) AS id`, [B, SYS, SYS_FOOD])).id;
const FB2 = (await one(`SELECT nutrition_food_fork_system($1,$2,$3) AS id`, [B, SYS, S3])).id;
const B_ORIG = (await one(`SELECT id FROM nutrition_foods WHERE tenant_id=$1 AND name_tr='Muz'`, [B])).id;
await expectErr(db, `SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [B, SYS, [FB1, B_ORIG]], "45014", "özgün besin reset kapsamına KONULAMAZ (kısmi işlem yok)");
ok("başarısız reset sonrası hiçbir şey silinmedi", (await all(`SELECT 1 FROM nutrition_foods WHERE id = ANY($1::uuid[])`, [[FB1, FB2, B_ORIG]])).length === 3);
await expectErr(db, `SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [A, SYS, [FB1]], "45014", "A, B'nin kopyasını resetleyemez");
ok("tek reset: 1 kopya", Number((await one(`SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[]) AS n`, [B, SYS, [FB1]])).n) === 1);
ok("tek reset sonrası B için SYSTEM Elma Suyu effective (46)", (await effective(B, SYS_FOOD)).id === SYS_FOOD);
// A'da gizli Elma Suyu + (yeniden) kopya yok → A reset kapsamı boş; gizleme kalır (Sil kararı korunur)
ok("toplu reset (B): kalan 1 kopya; özgün Muz DOKUNULMADI",
  Number((await one(`SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[]) AS n`, [B, SYS, [FB2]])).n) === 1 && !!(await one(`SELECT 1 FROM nutrition_foods WHERE id=$1`, [B_ORIG])));
// reset gizlemeyi temizler: A'da Elma Suyu gizli → yeniden görünmesi için (gizleme + kopya birlikte oluşamaz; senaryo: kopya sonra reset)
await db.query(`DELETE FROM nutrition_food_tenant_hidden WHERE tenant_id=$1 AND food_id=$2`, [A, SYS_FOOD]);
const FA3 = (await one(`SELECT nutrition_food_fork_system($1,$2,$3) AS id`, [A, SYS, SYS_FOOD])).id;
await db.query(`INSERT INTO nutrition_food_tenant_hidden (tenant_id, food_id) VALUES ($1,$2)`, [A, SYS_FOOD]);
await db.query(`SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [A, SYS, [FA3]]);
ok("reset ilgili gizleme kaydını temizler → sistem besini yeniden kullanılır", (await effective(A, SYS_FOOD))?.id === SYS_FOOD);

console.log("\n[E] challenge tüketimi");
const mk = async (over = {}) => (await one(`INSERT INTO nutrition_destructive_challenges
  (tenant_id, user_id, action, scope_hash, item_count, code_hash, expires_at)
  VALUES ($1,$2,$3,$4,1,$5, now() + ($6 || ' seconds')::interval) RETURNING id`,
  [over.tenant ?? A, over.user ?? UA, over.action ?? "food_reset_all", "s".repeat(64), "c".repeat(64), over.ttl ?? "300"])).id;
const consume = async (id, o = {}) => (await one(`SELECT nutrition_challenge_consume($1,$2,$3,$4,$5,$6) AS r`,
  [id, o.tenant ?? A, o.user ?? UA, o.action ?? "food_reset_all", o.scope ?? "s".repeat(64), o.code ?? "c".repeat(64)])).r;
let cid = await mk();
ok("yanlış kod → invalid_code", (await consume(cid, { code: "d".repeat(64) })) === "invalid_code");
ok("başka tenant → not_found", (await consume(cid, { tenant: B })) === "not_found");
ok("başka kullanıcı → not_found", (await consume(cid, { user: UB })) === "not_found");
ok("farklı işlem türü → not_found", (await consume(cid, { action: "plan_day_clear" })) === "not_found");
ok("doğru kod → ok", (await consume(cid)) === "ok");
ok("kullanılmış challenge tekrar → used", (await consume(cid)) === "used");
cid = await mk({ ttl: "-1" });
ok("süresi dolmuş → expired", (await consume(cid)) === "expired");
cid = await mk();
ok("kapsam değişmiş → scope_changed", (await consume(cid, { scope: "t".repeat(64) })) === "scope_changed");
ok("scope_changed sonrası challenge geçersiz (used)", (await consume(cid)) === "used");
cid = await mk();
for (let i = 0; i < 5; i++) await consume(cid, { code: "e".repeat(64) });
ok("5 yanlış deneme → kilit (doğru kod da reddedilir)", (await consume(cid)) !== "ok");
await expectErr(db, `INSERT INTO nutrition_destructive_challenges (tenant_id,user_id,action,scope_hash,item_count,code_hash,expires_at)
  VALUES ($1,$2,'drop_everything',$3,1,$3,now())`, [A, UA, "x".repeat(64)], "23514", "bilinmeyen işlem türü CHECK ile reddedilir");

console.log("\n[F] taslak plan snapshot yenileme");
const plan = (await one(`SELECT nutrition_plan_create_with_days($1,'P',date '2026-10-01',date '2026-10-01',NULL,NULL) AS p`, [A])).p;
const day = (await one(`SELECT id FROM nutrition_plan_days WHERE plan_id=$1`, [plan.id])).id;
const meal = (await one(`INSERT INTO nutrition_plan_meals (tenant_id, plan_id, plan_day_id, meal_type, label) VALUES ($1,$2,$3,'breakfast','Kahvaltı') RETURNING id`, [A, plan.id, day])).id;
const item = (await one(`SELECT nutrition_plan_item_create_or_replace($1,$2,NULL,$3,200,NULL,$4::jsonb,$5::jsonb) AS it`, [A, meal, SYS_FOOD,
  JSON.stringify({ food_name: "Elma Suyu", food_ownership: "system", external_provider: "usda_fdc" }),
  JSON.stringify([{ nutrient_code: "energy", amount: 46, unit_code: "kcal" }])])).it;
const snapE = async () => Number((await one(`SELECT amount FROM nutrition_plan_item_nutrients WHERE item_id=$1 AND nutrient_code='energy'`, [item.id])).amount);
ok("eski plan kalemi 46 kcal snapshot", (await snapE()) === 46);
// Kopya oluşup 52 yapılsa bile snapshot OTOMATİK değişmez
ok("besin değişince eski plan OTOMATİK değişmez (46 kalır)", (await snapE()) === 46);
const n = (await one(`SELECT nutrition_plan_refresh_item_snapshots($1,$2,$3::jsonb) AS n`, [A, plan.id, JSON.stringify([{
  item_id: item.id, food_id: FA3, food_name: "Elma Suyu", food_ownership: "custom", nutrients: [{ nutrient_code: "energy", amount: 52, unit_code: "kcal" }] }])])).n;
const itAfter = await one(`SELECT grams, food_id, food_ownership_snapshot, external_provider_snapshot FROM nutrition_plan_items WHERE id=$1`, [item.id]);
ok("manuel güncelle → 52; gram (200) korunur; food_id effective; provenance temizlenir",
  Number(n) === 1 && (await snapE()) === 52 && Number(itAfter.grams) === 200 && itAfter.food_id === FA3
  && itAfter.food_ownership_snapshot === "custom" && itAfter.external_provider_snapshot === null);
await expectErr(db, `SELECT nutrition_plan_refresh_item_snapshots($1,$2,$3::jsonb)`, [B, plan.id, JSON.stringify([{ item_id: item.id, food_name: "x", food_ownership: "custom" }])], "45014", "başka tenant planı yenileyemez");
await db.query(`UPDATE nutrition_plans SET status='active' WHERE id=$1`, [plan.id]);
await expectErr(db, `SELECT nutrition_plan_refresh_item_snapshots($1,$2,$3::jsonb)`, [A, plan.id, JSON.stringify([{ item_id: item.id, food_name: "x", food_ownership: "custom" }])], "45010", "taslak olmayan plan yenilenemez (45010)");
ok("reddedilen yenilemede snapshot değişmedi (52)", (await snapE()) === 52);

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
