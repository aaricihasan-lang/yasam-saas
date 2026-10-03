/**
 * DD-P2 — BESLENME satış öncesi P2 kapanışı: ROUTE + DB REGRESYON HARNESS
 * (GERÇEK Next route handler'ları + GERÇEK nutrition migration zinciri, yerel embedded-postgres;
 *  PRODUCTION'A SIFIR TEMAS — yalnız 127.0.0.1, sentetik ZZ_ verisi, iş sonunda silinir).
 *
 *  BES-1  Sistem besini → uzman düzenler (kişisel kopya) → plana eklenir → "Sistem değerine dön" →
 *         aynı kalem düzenlenir → "Besin değerlerini güncelle" → kalem UNAVAILABLE DEĞİL.
 *         Snapshot'lar değişmez; yalnız food_id kopya → sistem besini. Şablon kalemi + danışan
 *         besin tercihi de taşınır; rehberde kullanılan (blocked) kopyaya dokunulmaz; B tenant'ı
 *         etkilenmez. Kök neden kontrolü: remap'siz eski reset → kalem unavailable.
 *  BES-2  Plan silme 3 aşama + sunucu 4 haneli kod: challenge'sız/yanlış kod/başka plan/başka işlem/
 *         başka tenant/kapsam değişimi/tekrar kullanım → silme YOK; doğru kod → yalnız hedef
 *         revizyon silinir; eşzamanlı çift istek → tek silme; migration'sız DB → 503
 *         DELETE_UNAVAILABLE + silme YOK; migration sonradan uygulanınca çalışır (idempotent).
 *  NEW-1  Danışan silme önizlemesi: plan AİLESİ + toplam REVİZYON sayısı (tenant-scoped) ve
 *         gerçek cascade ile birebir; tr/en metinleri; dialog kaynak sözleşmesi.
 *  UI     Plan silme giriş noktaları PlanDeleteDialog (DestructiveChallengeDialog) kullanır.
 *
 * Çalıştır: npx tsx scripts/dogal-destek-p2/beslenme/routes.harness.ts   (FAIL → exit 1)
 * Port: 54631 (ana DB) + 54632 (yeni migration'sız DB).
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_KEY } from "../../anamnez/testEnv";
import { startBesDb, pointRoutesTo, readMig, NEW_MIGRATION, type BesDb, type BesUser } from "./env";
import { startEmbedShim } from "./pgrestEmbedShim";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const SYS = "00000000-0000-4000-8000-000000000001";

async function call(handler: unknown, method: string, params: Record<string, string>, auth: BesUser | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (auth) { headers["x-user-id"] = auth.id; headers["x-session-token"] = auth.token; }
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest("http://localhost/api/test", { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  let json: Json = {};
  try { json = (await res.clone().json()) as Json; } catch { json = {}; }
  return { status: res.status, json };
}

async function main(): Promise<void> {
  const main = await startBesDb({ port: 54631, dirName: "ddp2-bes-main-pgdata", includeNewMigration: true });
  let noMig: BesDb | null = null;
  const shim = await startEmbedShim(main.pool);
  pointRoutesTo(shim.url);
  console.log(`embedded-postgres (${main.applied.length} nutrition migration, ${NEW_MIGRATION} DAHİL) + embed shim hazır (${shim.url}).`);

  try {
    const R = "../../../app/api/beslenme";
    const nutrientsRoute = await import(`${R}/foods/[id]/nutrients/route`);
    const plansRoute = await import(`${R}/plans/route`);
    const planRoute = await import(`${R}/plans/[id]/route`);
    const planDelCh = await import(`${R}/plans/[id]/delete/challenge/route`);
    const reviseRoute = await import(`${R}/plans/[id]/revise/route`);
    const mealsRoute = await import(`${R}/plans/[id]/days/[dayId]/meals/route`);
    const itemsRoute = await import(`${R}/plans/[id]/meals/[mealId]/items/route`);
    const itemRoute = await import(`${R}/plans/[id]/items/[itemId]/route`);
    const refreshRoute = await import(`${R}/plans/[id]/refresh-snapshots/route`);
    const resetChRoute = await import(`${R}/foods/reset/challenge/route`);
    const resetRoute = await import(`${R}/foods/reset/route`);
    const dayClearCh = await import(`${R}/plans/[id]/days/[dayId]/clear/challenge/route`);
    const dayClear = await import(`${R}/plans/[id]/days/[dayId]/clear/route`);
    const { collectDeletePreview, DELETE_PREVIEW_TABLES } = await import("../../../lib/danisan/deletePreview");

    let db = main;
    const U = () => db.seed.users;
    const q = async (sql: string, args: unknown[] = []) => (await db.env.su.query(sql, args)).rows;
    const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
    const nid = async (code: string) => (await q1(`select id from nutrition_nutrients where code=$1`, [code])).id as string;
    const uid = async (code: string) => (await q1(`select id from nutrition_units where code=$1`, [code])).id as string;

    async function sysFood(name: string, kcal: number, portion?: { label: string; grams: number }) {
      const id = (await q1(`insert into nutrition_foods (tenant_id, name_tr, aliases) values ($1,$2,'{}') returning id`, [SYS, name])).id as string;
      await q(`insert into nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams)
               values ($1,$2,$3,$4,$5,100), ($1,$2,$6,0.1,$7,100)`, [SYS, id, await nid("energy"), kcal, await uid("kcal"), await nid("protein"), await uid("g")]);
      let portionId: string | null = null;
      if (portion) {
        portionId = (await q1(`insert into nutrition_food_portions (tenant_id, food_id, label_tr, quantity, measure_unit_id, gram_weight)
                                values ($1,$2,$3,1,$4,$5) returning id`, [SYS, id, portion.label, await uid("piece"), portion.grams])).id as string;
      }
      return { id, portionId };
    }
    /** Uzman düzenlemesi → kişisel kopya (GERÇEK PUT /foods/[id]/nutrients). */
    async function expertEdit(user: BesUser, foodId: string, kcal: number) {
      const r = await call(nutrientsRoute.PUT, "PUT", { id: foodId }, user, {
        items: [{ nutrient_code: "energy", amount: kcal, unit_code: "kcal" }, { nutrient_code: "protein", amount: 0.1, unit_code: "g" }],
      });
      return r;
    }
    async function newPlan(user: BesUser, title: string, start = "2026-10-05", end = "2026-10-06") {
      const r = await call(plansRoute.POST, "POST", {}, user, { title, start_date: start, end_date: end });
      const plan = r.json.plan as Json;
      const days = await q(`select id from nutrition_plan_days where plan_id=$1 order by plan_date`, [plan.id]);
      return { r, id: plan.id as string, family: plan.plan_family_id as string, days: days.map((d) => d.id as string) };
    }
    async function newMeal(user: BesUser, planId: string, dayId: string, label = "Kahvaltı") {
      const r = await call(mealsRoute.POST, "POST", { id: planId, dayId }, user, { plan_day_id: dayId, meal_type: "breakfast", label });
      return { r, id: ((r.json.meal as Json | undefined)?.id ?? "") as string };
    }
    async function newItem(user: BesUser, planId: string, mealId: string, body: Json) {
      const r = await call(itemsRoute.POST, "POST", { id: planId, mealId }, user, body);
      return { r, id: ((r.json.item as Json | undefined)?.id ?? "") as string };
    }
    const itemRow = (id: string) => q1(`select food_id, grams, quantity, food_name_snapshot, food_ownership_snapshot, portion_label_snapshot,
                                         portion_gram_snapshot, external_provider_snapshot, sort_order, note from nutrition_plan_items where id=$1`, [id]);
    const itemNut = async (id: string) => (await q(`select nutrient_code, amount::text, unit_code from nutrition_plan_item_nutrients where item_id=$1 order by nutrient_code`, [id]));
    const energyOfItem = async (id: string) => Number((await q1(`select amount from nutrition_plan_item_nutrients where item_id=$1 and nutrient_code='energy'`, [id]))?.amount);

    // ═════════════════════════════════════════════════════════════════════════
    section("BES-1 a) Semantik doğrulama + kök neden (remap'siz eski reset)");
    const ELMA = await sysFood("ZZ Elma Suyu", 46, { label: "1 su bardağı", grams: 200 });
    const e1 = await expertEdit(U().A, ELMA.id, 52);
    const FORK = e1.json.food_id as string;
    ok(e1.status === 200 && e1.json.personalized === true && FORK !== ELMA.id, "uzman sistem besinini düzenler → kişisel kopya (fork)", e1.json);
    const eff = await q1(`select * from nutrition_food_resolve_effective($1,$2,$3)`, [db.seed.TA, SYS, ELMA.id]);
    ok(eff?.id === FORK && eff?.redirected === true, "SEMANTİK: kopya varken SİSTEM id'si A için KOPYAYA çözülür (redirected) → kopya→sistem id taşıma değer-nötr", eff);
    const effB = await q1(`select * from nutrition_food_resolve_effective($1,$2,$3)`, [db.seed.TB, SYS, ELMA.id]);
    ok(effB?.id === ELMA.id, "B tenant'ı için aynı SİSTEM id'si sistem satırına çözülür (kopya tenant'a özel)");

    // Kök neden (kontrol): remap YAPMADAN doğrudan reset RPC'si (düzeltme öncesi davranış).
    const MUZ = await sysFood("ZZ Muz Kontrol", 89);
    const forkMuz = (await expertEdit(U().A, MUZ.id, 95)).json.food_id as string;
    const ctl = await newPlan(U().A, "ZZ Kontrol Planı");
    const ctlMeal = await newMeal(U().A, ctl.id, ctl.days[0]);
    const ctlItem = await newItem(U().A, ctl.id, ctlMeal.id, { food_id: forkMuz, grams: 100 });
    ok(ctlItem.r.status < 300 && (await itemRow(ctlItem.id)).food_id === forkMuz, "kontrol: plan kalemi KOPYA id'sini saklar (seçici kopyayı döndürür)", ctlItem.r.json);
    await q(`select nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [db.seed.TA, SYS, [forkMuz]]);
    const ctlRef = await call(refreshRoute.GET, "GET", { id: ctl.id }, U().A);
    ok(((ctlRef.json.unavailable as unknown[]) ?? []).length === 1, "KÖK NEDEN: remap'siz reset → kalem 'unavailable' (besin çalışma alanında yok) — düzeltme öncesi hata yeniden üretildi", ctlRef.json);

    // ═════════════════════════════════════════════════════════════════════════
    section("BES-1 b) Tam regresyon senaryosu (route'lar)");
    const plan = await newPlan(U().A, "ZZ BES-1 Planı");
    ok(plan.r.status === 201, "plan oluşturuldu", plan.r.json);
    const meal = await newMeal(U().A, plan.id, plan.days[0]);
    const forkPortion = (await q1(`select id from nutrition_food_portions where tenant_id=$1 and food_id=$2`, [db.seed.TA, FORK]))?.id as string;
    const it1 = await newItem(U().A, plan.id, meal.id, { food_id: FORK, grams: 150 });
    const it2 = await newItem(U().A, plan.id, meal.id, { food_id: FORK, portion_id: forkPortion, quantity: 1 });
    ok(it1.r.status < 300 && it2.r.status < 300, "kopya besin plana 2 kalem olarak eklendi (gram + porsiyon)", [it1.r.json, it2.r.json]);
    ok((await itemRow(it1.id)).food_id === FORK && (await energyOfItem(it1.id)) === 52, "kalem food_id=KOPYA, snapshot enerji 52 (uzman değeri)");

    // Şablon kalemi + danışan besin tercihi (KOPYA id'li soft referanslar).
    const tpl = (await q1(`insert into nutrition_templates (tenant_id, template_type, title) values ($1,'meal','ZZ Şablon') returning id`, [db.seed.TA])).id;
    const tplMeal = (await q1(`insert into nutrition_template_meals (tenant_id, template_id, label) values ($1,$2,'Öğün') returning id`, [db.seed.TA, tpl])).id;
    const tplItem = (await q1(`insert into nutrition_template_items (tenant_id, template_id, template_meal_id, food_id, grams, food_name_snapshot, food_ownership_snapshot)
                                values ($1,$2,$3,$4,120,'ZZ Elma Suyu','custom') returning id`, [db.seed.TA, tpl, tplMeal, FORK])).id;
    const pref = (await q1(`insert into nutrition_client_food_preferences (tenant_id, client_id, stance, food_id, food_label)
                             values ($1,$2,'avoided',$3,'ZZ Elma Suyu (kişisel)') returning id`, [db.seed.TA, db.seed.clients.a1, FORK])).id;

    // B tenant'ı: kendi kopyası + plan kalemi (A'nın reset'i DOKUNMAMALI).
    const eB = await expertEdit(U().B, ELMA.id, 60);
    const FORK_B = eB.json.food_id as string;
    const planB = await newPlan(U().B, "ZZ B Planı");
    const mealB = await newMeal(U().B, planB.id, planB.days[0]);
    const itB = await newItem(U().B, planB.id, mealB.id, { food_id: FORK_B, grams: 100 });
    ok(itB.r.status < 300 && FORK_B !== FORK, "B tenant'ı kendi kopyasıyla kalem ekledi");

    // Rehberde kullanılan (blocked) kopya + toplu reset kapsamı.
    const CEVIZ = await sysFood("ZZ Ceviz", 654);
    const forkCeviz = (await expertEdit(U().A, CEVIZ.id, 700)).json.food_id as string;
    const topic = (await q1(`insert into nutrition_topics (tenant_id, topic_type, title) values ($1,'goal','ZZ Rehber') returning id`, [db.seed.TA])).id;
    await q(`insert into nutrition_topic_foods (tenant_id, topic_id, food_id, relation_type) values ($1,$2,$3,'recommended')`, [db.seed.TA, topic, forkCeviz]);
    const itCeviz = await newItem(U().A, plan.id, meal.id, { food_id: forkCeviz, grams: 30 });

    const snapBefore = { i1: await itemRow(it1.id), i2: await itemRow(it2.id), n1: await itemNut(it1.id), n2: await itemNut(it2.id), ic: await itemRow(itCeviz.id) };

    // Reset (tek besin) — GERÇEK challenge + kod akışı.
    const ch = await call(resetChRoute.POST, "POST", {}, U().A, { scope: "one", food_id: ELMA.id });
    ok(ch.status === 200 && typeof ch.json.code === "string", "reset challenge üretildi", ch.json);
    ok(!("origins" in ch.json), "challenge yanıtı iç kapsam eşlemesini (origins) sızdırmaz");
    const rs = await call(resetRoute.POST, "POST", {}, U().A, { scope: "one", food_id: ELMA.id, challenge_id: ch.json.challenge_id, code: ch.json.code });
    ok(rs.status === 200 && rs.json.reset === 1, "Sistem değerine dön → 1 kopya kaldırıldı", rs.json);
    ok(!(await q1(`select 1 as x from nutrition_foods where id=$1`, [FORK])), "kişisel kopya silindi");

    const i1a = await itemRow(it1.id);
    const i2a = await itemRow(it2.id);
    ok(i1a.food_id === ELMA.id && i2a.food_id === ELMA.id, "plan kalemleri food_id → SİSTEM besini (kopya → origin)", [i1a.food_id, i2a.food_id]);
    const strip = (r: Json) => { const { food_id: _f, ...rest } = r; void _f; return JSON.stringify(rest); };
    ok(strip(i1a) === strip(snapBefore.i1) && strip(i2a) === strip(snapBefore.i2), "snapshot kolonları (ad/sahiplik/porsiyon/gram/sıra/not) DEĞİŞMEDİ", [i1a, snapBefore.i1]);
    ok(JSON.stringify(await itemNut(it1.id)) === JSON.stringify(snapBefore.n1) && JSON.stringify(await itemNut(it2.id)) === JSON.stringify(snapBefore.n2), "donmuş nutrient snapshot'ları DEĞİŞMEDİ (52 kcal)");
    ok((await q1(`select food_id from nutrition_template_items where id=$1`, [tplItem])).food_id === ELMA.id, "şablon kalemi food_id → SİSTEM besini");
    const prefRow = await q1(`select food_id, food_label from nutrition_client_food_preferences where id=$1`, [pref]);
    ok(prefRow.food_id === ELMA.id && prefRow.food_label === "ZZ Elma Suyu (kişisel)", "danışan kaçınılan besin tercihi food_id → SİSTEM; etiket değişmedi", prefRow);
    ok((await itemRow(itB.id)).food_id === FORK_B && !!(await q1(`select 1 as x from nutrition_foods where id=$1`, [FORK_B])), "B tenant'ının kopyası + kalemi DOKUNULMADI");
    ok((await itemRow(itCeviz.id)).food_id === forkCeviz, "kapsam dışı kopyanın (ceviz) kalemine dokunulmadı");

    // Aynı kalemi düzenle (miktar + porsiyon) → kaydet.
    const pg1 = await call(itemRoute.PATCH, "PATCH", { id: plan.id, itemId: it1.id }, U().A, { grams: 200 });
    ok(pg1.status === 200 && Number((pg1.json.item as Json).grams) === 200, "reset sonrası kalem miktarı düzenlenir (200 g)", pg1.json);
    const pg2 = await call(itemRoute.PATCH, "PATCH", { id: plan.id, itemId: it2.id }, U().A, { portion_id: ELMA.portionId, quantity: 2 });
    ok(pg2.status === 200 && Number((pg2.json.item as Json).grams) === 400 && (pg2.json.item as Json).portion_label_snapshot === "1 su bardağı",
      "reset sonrası porsiyon düzenlenir (SİSTEM porsiyonu, 2 × 200 g) — FOOD_NOT_FOUND YOK", pg2.json);
    ok((await energyOfItem(it1.id)) === 52, "miktar düzenleme donmuş nutrient snapshot'ını değiştirmez");

    // "Besin değerlerini güncelle" (önizleme + uygula).
    const pv = await call(refreshRoute.GET, "GET", { id: plan.id }, U().A);
    const unavailable = (pv.json.unavailable as Array<Json>) ?? [];
    const changes = (pv.json.changes as Array<Json>) ?? [];
    ok(pv.status === 200 && unavailable.length === 0, "snapshot yenileme önizlemesi: 'unavailable' YOK", pv.json);
    const ch1 = changes.find((c) => c.item_id === it1.id);
    ok(!!ch1 && ch1.energy_per100_before === 52 && ch1.energy_per100_after === 46, "kalem normal 'değişecek' listesinde: 52 → 46 kcal/100 g (sistem besini)", changes);
    const ap = await call(refreshRoute.POST, "POST", { id: plan.id }, U().A, { expected_count: changes.length });
    ok(ap.status === 200 && Number(ap.json.updated) === changes.length, "Besin değerlerini güncelle uygulandı", ap.json);
    const i1b = await itemRow(it1.id);
    ok((await energyOfItem(it1.id)) === 46 && i1b.food_ownership_snapshot === "system" && i1b.food_id === ELMA.id && Number(i1b.grams) === 200,
      "kalem artık sistem besini değerinde (46), gram korunur (200)", i1b);
    const pv2 = await call(refreshRoute.GET, "GET", { id: plan.id }, U().A);
    ok(((pv2.json.unavailable as unknown[]) ?? []).length === 0 && !((pv2.json.changes as Array<Json>) ?? []).some((c) => c.item_id === it1.id || c.item_id === it2.id),
      "ikinci önizleme: kalemler güncel, unavailable YOK", pv2.json);

    section("BES-1 c) Toplu reset: rehberde kullanılan kopya bloklanır, diğerleri taşınır");
    const PEYNIR = await sysFood("ZZ Peynir", 300);
    const forkPeynir = (await expertEdit(U().A, PEYNIR.id, 310)).json.food_id as string;
    const itP = await newItem(U().A, plan.id, meal.id, { food_id: forkPeynir, grams: 40 });
    const chAll = await call(resetChRoute.POST, "POST", {}, U().A, { scope: "all" });
    ok(chAll.status === 200 && Array.isArray(chAll.json.blocked) && (chAll.json.blocked as Json[]).some((b) => b.name === "ZZ Ceviz"), "toplu reset kapsamı: ceviz (rehberde) bloklu listelenir", chAll.json);
    const rsAll = await call(resetRoute.POST, "POST", {}, U().A, { scope: "all", challenge_id: chAll.json.challenge_id, code: chAll.json.code });
    ok(rsAll.status === 200, "toplu reset tamam", rsAll.json);
    ok((await itemRow(itP.id)).food_id === PEYNIR.id, "toplu reset: peynir kalemi SİSTEM besinine taşındı");
    ok((await itemRow(itCeviz.id)).food_id === forkCeviz && !!(await q1(`select 1 as x from nutrition_foods where id=$1`, [forkCeviz])), "bloklu (rehberde kullanılan) kopya + kalemi DOKUNULMADI");
    ok(JSON.stringify(await itemRow(itCeviz.id)) === JSON.stringify(snapBefore.ic), "bloklu kopyanın kalem snapshot'ı birebir aynı");
    const pv3 = await call(refreshRoute.GET, "GET", { id: plan.id }, U().A);
    ok(((pv3.json.unavailable as unknown[]) ?? []).length === 0, "toplu reset sonrası da 'unavailable' YOK", pv3.json);

    section("BES-1 d) Değer-nötrlük (reset başarısız olsa bile ön-taşıma güvenli)");
    const SUT = await sysFood("ZZ Süt", 61);
    const forkSut = (await expertEdit(U().A, SUT.id, 70)).json.food_id as string;
    const itS = await newItem(U().A, plan.id, meal.id, { food_id: forkSut, grams: 200 });
    const { remapFoodReferencesToOrigin } = await import("../../../lib/beslenme/foodReset");
    const svc = createClient(shim.url, SERVICE_KEY, { auth: { persistSession: false } }) as unknown as SupabaseClient;
    const rm = await remapFoodReferencesToOrigin(svc, db.seed.TA, [{ id: forkSut, origin_food_id: SUT.id }]);
    ok(rm.ok && (rm as { remapped: number }).remapped === 1 && (await itemRow(itS.id)).food_id === SUT.id, "yalnız ön-taşıma (kopya hâlâ var): kalem SİSTEM id'sine bağlandı");
    const pv4 = await call(refreshRoute.GET, "GET", { id: plan.id }, U().A);
    const cS = ((pv4.json.changes as Array<Json>) ?? []).find((c) => c.item_id === itS.id);
    ok(((pv4.json.unavailable as unknown[]) ?? []).length === 0 && !!cS && cS.energy_per100_before === 70 && cS.energy_per100_after === 70,
      "kopya dururken SİSTEM id'si kopyaya çözülür → değerler AYNI (70→70), unavailable YOK", cS);
    const rmB = await remapFoodReferencesToOrigin(svc, db.seed.TB, [{ id: forkSut, origin_food_id: SUT.id }]);
    ok(rmB.ok && (rmB as { remapped: number }).remapped === 0, "başka tenant bağlamında taşıma → 0 satır (tenant filtresi)");

    // ═════════════════════════════════════════════════════════════════════════
    section("BES-2 a) Plan silme: challenge zorunlu + 3. aşama sunucu kodu");
    const A = U().A;
    const P = await newPlan(A, "ZZ Silinecek Plan");
    const pMeal = await newMeal(A, P.id, P.days[0]);
    await newItem(A, P.id, pMeal.id, { food_id: ELMA.id, grams: 100 });
    const rev = await call(reviseRoute.POST, "POST", { id: P.id }, A, {});
    const P2 = ((rev.json.plan as Json | undefined)?.id ?? "") as string;
    ok(rev.status < 300 && !!P2, "Yeni Revizyon (V2) açıldı (aynı family)", rev.json);
    await q(`insert into nutrition_plan_clients (tenant_id, plan_family_id, client_id) values ($1,$2,$3)`, [db.seed.TA, P.family, db.seed.clients.a2]);
    const planExists = async (id: string) => !!(await q1(`select 1 as x from nutrition_plans where id=$1`, [id]));
    const counts = async (id: string) => q1(`select (select count(*) from nutrition_plan_days where plan_id=$1)::int d,
      (select count(*) from nutrition_plan_meals where plan_id=$1)::int m, (select count(*) from nutrition_plan_items where plan_id=$1)::int i`, [id]);

    const d0 = await call(planRoute.DELETE, "DELETE", { id: P.id }, A);
    ok(d0.status === 400 && d0.json.code === "CHALLENGE_REQUIRED" && await planExists(P.id), "challenge'sız DELETE → 400 CHALLENGE_REQUIRED, plan duruyor", d0.json);
    const d0b = await call(planRoute.DELETE, "DELETE", { id: P.id }, A, { challenge_id: "00000000-0000-4000-8000-000000000000", code: "12a4" });
    ok(d0b.status === 400 && d0b.json.code === "CHALLENGE_INVALID_CODE" && await planExists(P.id), "biçimsiz kod → 400, plan duruyor", d0b.json);
    const d0c = await call(planRoute.DELETE, "DELETE", { id: P.id }, A, { challenge_id: "x", code: "1234", force: true });
    ok(d0c.status === 400 && d0c.json.code === "UNKNOWN_FIELD", "bilinmeyen alan → 400 UNKNOWN_FIELD", d0c.json);

    const c1 = await call(planDelCh.POST, "POST", { id: P.id }, A, {});
    ok(c1.status === 200 && /^[0-9]{4}$/.test(String(c1.json.code)) && c1.json.days === 2 && c1.json.meals === 1 && c1.json.items === 1 && c1.json.other_revisions === 1
      && (c1.json.plan as Json).title === "ZZ Silinecek Plan" && (c1.json.plan as Json).revision_number === 1,
      "AŞAMA 1 kapsamı sunucudan: plan adı + V1 + 2 gün / 1 öğün / 1 kalem + 1 diğer revizyon", c1.json);
    const row = await q1(`select action, code_hash, scope_hash, item_count from nutrition_destructive_challenges where id=$1`, [c1.json.challenge_id]);
    ok(row.action === "plan_delete" && row.code_hash !== c1.json.code && String(row.code_hash).length === 64, "challenge kaydı: action=plan_delete, kodun kendisi saklanmaz (yalnız özet)", row);
    const wrong = String((Number(c1.json.code) + 1) % 10000).padStart(4, "0");
    const d1 = await call(planRoute.DELETE, "DELETE", { id: P.id }, A, { challenge_id: c1.json.challenge_id, code: wrong });
    ok(d1.status === 400 && d1.json.code === "CHALLENGE_INVALID_CODE" && await planExists(P.id), "yanlış kod → 400, HİÇBİR şey silinmedi", d1.json);

    section("BES-2 b) Başka plan / başka işlem / başka tenant / kapsam değişimi / tekrar");
    const d2 = await call(planRoute.DELETE, "DELETE", { id: P2 }, A, { challenge_id: c1.json.challenge_id, code: c1.json.code });
    ok(d2.status === 409 && d2.json.code === "CHALLENGE_SCOPE_CHANGED" && await planExists(P2) && await planExists(P.id), "plan X (V1) challenge'ı plan Y (V2) için kullanılamaz → 409, ikisi de duruyor", d2.json);
    const d2r = await call(planRoute.DELETE, "DELETE", { id: P.id }, A, { challenge_id: c1.json.challenge_id, code: c1.json.code });
    ok(d2r.status === 409 && d2r.json.code === "CHALLENGE_USED" && await planExists(P.id), "yakılmış challenge tekrar kullanılamaz (doğru plan+kod) → 409 CHALLENGE_USED", d2r.json);

    const dc = await call(dayClearCh.POST, "POST", { id: P2, dayId: (await q1(`select plan_day_id from nutrition_plan_meals where plan_id=$1 limit 1`, [P2])).plan_day_id }, A, {});
    ok(dc.status === 200, "Günü Temizle challenge'ı (V2) üretildi", dc.json);
    const d3 = await call(planRoute.DELETE, "DELETE", { id: P2 }, A, { challenge_id: dc.json.challenge_id, code: dc.json.code });
    ok(d3.status === 404 && d3.json.code === "CHALLENGE_NOT_FOUND" && await planExists(P2), "Günü Temizle challenge'ı plan silmede kullanılamaz → 404, plan duruyor", d3.json);
    const cP2 = await call(planDelCh.POST, "POST", { id: P2 }, A, {});
    const p2Day = (await q1(`select plan_day_id from nutrition_plan_meals where plan_id=$1 limit 1`, [P2])).plan_day_id as string;
    const d4 = await call(dayClear.POST, "POST", { id: P2, dayId: p2Day }, A, { challenge_id: cP2.json.challenge_id, code: cP2.json.code });
    ok(d4.status === 404 && d4.json.code === "CHALLENGE_NOT_FOUND" && (await counts(P2)).m === 1, "plan-silme challenge'ı Günü Temizle'de kullanılamaz → 404, öğün duruyor", d4.json);

    const cB = await call(planDelCh.POST, "POST", { id: P2 }, U().B, {});
    ok(cB.status === 404, "başka tenant challenge isteği → 404", cB.json);
    const dB = await call(planRoute.DELETE, "DELETE", { id: P2 }, U().B, { challenge_id: cP2.json.challenge_id, code: cP2.json.code });
    ok(dB.status === 404 && await planExists(P2), "başka tenant, A'nın geçerli koduyla bile silemez → 404, plan duruyor", dB.json);
    const cDemo = await call(planDelCh.POST, "POST", { id: P2 }, U().DEMO, {});
    ok(cDemo.status === 403 && cDemo.json.code === "DEMO_READONLY", "demo hesap → 403 DEMO_READONLY", cDemo.json);
    const cNomod = await call(planDelCh.POST, "POST", { id: P2 }, U().NOMOD, {});
    ok(cNomod.status === 403, "Beslenme/Danışan izni olmayan → 403", cNomod.json);
    const cAnon = await call(planDelCh.POST, "POST", { id: P2 }, null, {});
    ok(cAnon.status === 401, "kimliksiz → 401", cAnon.json);

    // Kapsam değişimi: challenge sonrası plana kalem eklenir → onay reddedilir.
    const cScope = await call(planDelCh.POST, "POST", { id: P2 }, A, {});
    const p2Meal = (await q1(`select id from nutrition_plan_meals where plan_id=$1 limit 1`, [P2])).id as string;
    await newItem(A, P2, p2Meal, { food_id: ELMA.id, grams: 10 });
    const d5 = await call(planRoute.DELETE, "DELETE", { id: P2 }, A, { challenge_id: cScope.json.challenge_id, code: cScope.json.code });
    ok(d5.status === 409 && d5.json.code === "CHALLENGE_SCOPE_CHANGED" && await planExists(P2) && (await counts(P2)).i === 2, "kapsam değişti (yeni kalem) → 409, plan + kalemler duruyor", d5.json);

    section("BES-2 c) Doğru kod → yalnız hedef revizyon silinir; eşzamanlı çift istek → tek silme");
    const before = await counts(P2);
    const c6 = await call(planDelCh.POST, "POST", { id: P.id }, A, {});
    const d6 = await call(planRoute.DELETE, "DELETE", { id: P.id }, A, { challenge_id: c6.json.challenge_id, code: c6.json.code });
    const p1c = await counts(P.id);
    ok(d6.status === 200 && !(await planExists(P.id)) && p1c.d === 0 && p1c.m === 0 && p1c.i === 0, "doğru kod → V1 + gün/öğün/kalemleri silindi", d6.json);
    ok(await planExists(P2) && JSON.stringify(await counts(P2)) === JSON.stringify(before), "aynı ailenin V2'si DOKUNULMADI (Yeni Revizyon semantiği)");
    ok(!!(await q1(`select 1 as x from nutrition_plan_clients where plan_family_id=$1`, [P.family])), "family'de revizyon kaldığı için danışan bağı KORUNDU");
    const d6r = await call(planRoute.DELETE, "DELETE", { id: P.id }, A, { challenge_id: c6.json.challenge_id, code: c6.json.code });
    ok(d6r.status === 404, "silinmiş plana aynı kodla tekrar → 404 (ikinci silme yok)", d6r.json);
    const totalBefore = Number((await q1(`select count(*)::int n from nutrition_plans where tenant_id=$1`, [db.seed.TA])).n);
    const c7 = await call(planDelCh.POST, "POST", { id: P2 }, A, {});
    const [x1, x2] = await Promise.all([
      call(planRoute.DELETE, "DELETE", { id: P2 }, A, { challenge_id: c7.json.challenge_id, code: c7.json.code }),
      call(planRoute.DELETE, "DELETE", { id: P2 }, A, { challenge_id: c7.json.challenge_id, code: c7.json.code }),
    ]);
    const okCount = [x1, x2].filter((x) => x.status === 200).length;
    const totalAfter = Number((await q1(`select count(*)::int n from nutrition_plans where tenant_id=$1`, [db.seed.TA])).n);
    ok(okCount === 1 && totalAfter === totalBefore - 1 && !(await planExists(P2)), "çift tık (eşzamanlı 2 istek) → TEK silme; diğeri reddedildi", [x1, x2]);
    ok(!(await q1(`select 1 as x from nutrition_plan_clients where plan_family_id=$1`, [P.family])), "son revizyon silinince yetim danışan bağı temizlendi (mevcut RPC davranışı)");
    ok(await planExists(plan.id) && await planExists(planB.id), "diğer planlar (A'nın BES-1 planı, B planı) etkilenmedi");

    // ═════════════════════════════════════════════════════════════════════════
    section("NEW-1 Danışan silme önizlemesi: plan aileleri + revizyonlar (gerçek cascade ile birebir)");
    const mkPlan = async (tenant: string, family: string, revision: number) =>
      (await q1(`insert into nutrition_plans (tenant_id, title, start_date, end_date, status, plan_family_id, revision_number)
                 values ($1,'ZZ Önizleme',current_date,current_date,'draft',$2,$3) returning id`, [tenant, family, revision])).id as string;
    const bind = (tenant: string, family: string, client: string) =>
      q(`insert into nutrition_plan_clients (tenant_id, plan_family_id, client_id) values ($1,$2,$3)`, [tenant, family, client]);
    const { randomUUID } = await import("node:crypto");
    const F1 = randomUUID(); const F2 = randomUUID(); const F3 = randomUUID(); const F4 = randomUUID(); const FB = randomUUID();
    const f1v1 = await mkPlan(db.seed.TA, F1, 1); await mkPlan(db.seed.TA, F1, 2); await mkPlan(db.seed.TA, F2, 1);
    const f3 = await mkPlan(db.seed.TA, F3, 1); const f4 = await mkPlan(db.seed.TA, F4, 1); const fb = await mkPlan(db.seed.TB, FB, 1);
    void f1v1;
    await bind(db.seed.TA, F1, db.seed.clients.a1); await bind(db.seed.TA, F2, db.seed.clients.a1);
    await bind(db.seed.TA, F4, db.seed.clients.a2); await bind(db.seed.TB, FB, db.seed.clients.b1);
    const pvA1 = await collectDeletePreview(svc, db.seed.TA, db.seed.clients.a1);
    const byKey = (p: typeof pvA1) => Object.fromEntries(p.counts.map((c) => [c.key, c.count]));
    ok(byKey(pvA1).nutritionPlans === 2 && byKey(pvA1).nutritionPlanRevisions === 3, "a1: 2 plan ailesi + 3 revizyon sayıldı", byKey(pvA1));
    ok(pvA1.counts.length === DELETE_PREVIEW_TABLES.length, "counts uzunluğu tablo listesiyle aynı (UI/harness sözleşmesi)");
    const pvA2 = await collectDeletePreview(svc, db.seed.TA, db.seed.clients.a2);
    ok(byKey(pvA2).nutritionPlans === 1 && byKey(pvA2).nutritionPlanRevisions === 1, "a2: 1 aile + 1 revizyon", byKey(pvA2));
    const pvX = await collectDeletePreview(svc, db.seed.TB, db.seed.clients.a1);
    ok(byKey(pvX).nutritionPlans === 0 && byKey(pvX).nutritionPlanRevisions === 0, "tenant-scoped: B bağlamında A'nın danışanı → 0/0", byKey(pvX));
    const revsBefore = Number((await q1(`select count(*)::int n from nutrition_plans where tenant_id=$1`, [db.seed.TA])).n);
    await q(`delete from clients where id=$1`, [db.seed.clients.a1]);
    const revsAfter = Number((await q1(`select count(*)::int n from nutrition_plans where tenant_id=$1`, [db.seed.TA])).n);
    ok(revsBefore - revsAfter === 3, "TASARIM DOĞRULAMASI: danışan silinince bağlı ailelerin TÜM revizyonları silinir (önizleme 3 = gerçek 3)", { revsBefore, revsAfter });
    ok(await planExists(f3) && await planExists(f4) && await planExists(fb), "bağsız plan, başka danışanın planı ve B tenant planı etkilenmedi");
    // Sayım hatası → null + partial (silme ENGELLENMEZ).
    const failingDb = {
      from(table: string) {
        const res = table === "nutrition_plans" ? { data: null, count: null, error: { message: "simüle" } } : { data: [{ plan_family_id: F4 }], count: 0, error: null };
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in"]) b[m] = () => b;
        b.then = (resolve: (v: unknown) => unknown) => resolve(res);
        return b;
      },
    } as unknown as SupabaseClient;
    const pvF = await collectDeletePreview(failingDb, db.seed.TA, db.seed.clients.a2);
    ok(byKey(pvF).nutritionPlanRevisions === null && pvF.partial === true, "revizyon sayımı başarısız → null + partial (silme engellenmez)", byKey(pvF));

    const trD = JSON.parse(src("messages/tr/clients.detail.json")).clients?.detail ?? JSON.parse(src("messages/tr/clients.detail.json"));
    const enD = JSON.parse(src("messages/en/clients.detail.json")).clients?.detail ?? JSON.parse(src("messages/en/clients.detail.json"));
    const pick = (o: Json, k: string): unknown => k.split(".").reduce<unknown>((a, s) => (a as Json | undefined)?.[s], o);
    const findRoot = (o: Json): Json => (pick(o, "deletePreview") ? o : (Object.values(o).map((v) => (v && typeof v === "object" ? findRoot(v as Json) : null)).find(Boolean) as Json));
    const tr = findRoot(trD as Json); const en = findRoot(enD as Json);
    const trPlans = String(pick(tr, "deletePreview.table.nutritionPlans")); const enPlans = String(pick(en, "deletePreview.table.nutritionPlans"));
    ok(/tüm revizyonları/.test(trPlans) && /kalıcı silinir/.test(trPlans) && !/bağlantı/.test(trPlans), "TR etiketi: 'Beslenme planları (tüm revizyonları … kalıcı silinir)' — 'bağlantıları' DEĞİL", trPlans);
    ok(/all revisions/.test(enPlans) && /permanently deleted/.test(enPlans) && !/links/.test(enPlans), "EN etiketi: plans permanently deleted with all revisions", enPlans);
    ok(!!pick(tr, "deletePreview.table.nutritionPlanRevisions") && !!pick(en, "deletePreview.table.nutritionPlanRevisions"), "revizyon sayısı etiketi tr/en mevcut");
    ok(/beslenme planları \(tüm revizyonları/.test(String(pick(tr, "delete.previewFailed"))) && /nutrition plans linked to the client \(with all revisions/.test(String(pick(en, "delete.previewFailed"))),
      "sayım alınamazsa sabit uyarı da planların (tüm revizyonlarıyla) silindiğini söyler (tr/en)");
    const page = src("app/dashboard/clients/[id]/page.tsx");
    ok(/t\.has\(`deletePreview\.table\.\$\{c\.key\}`\)/.test(page) && /t\("delete\.previewFailed"\)/.test(page) && /requireText: clientName \|\| "SİL"/.test(page),
      "dialog önizleme etiketlerini anahtarla okur; sayım yoksa previewFailed; yazılı ad onayı KORUNDU");

    // ═════════════════════════════════════════════════════════════════════════
    section("BES-2 d) Migration'sız DB → 503 DELETE_UNAVAILABLE, silme YOK; sonra migration uygulanır");
    noMig = await startBesDb({ port: 54632, dirName: "ddp2-bes-nomig-pgdata", includeNewMigration: false });
    shim.setPool(noMig.pool);
    db = noMig;
    ok(!noMig.applied.includes(NEW_MIGRATION), "ikinci DB: yeni migration UYGULANMADI");
    const chk = await q1(`select pg_get_constraintdef(oid) d from pg_constraint where conname='nutrition_destructive_challenges_action_chk'`);
    ok(!/plan_delete/.test(chk.d), "eski CHECK 'plan_delete' içermiyor", chk.d);
    const NA = noMig.seed.users.A;
    const NP = await newPlan(NA, "ZZ Migration'sız Plan");
    const nc = await call(planDelCh.POST, "POST", { id: NP.id }, NA, {});
    ok(nc.status === 503 && nc.json.code === "DELETE_UNAVAILABLE", "challenge → 503 DELETE_UNAVAILABLE (kararlı kod)", nc.json);
    const nd = await call(planRoute.DELETE, "DELETE", { id: NP.id }, NA);
    const nd2 = await call(planRoute.DELETE, "DELETE", { id: NP.id }, NA, { challenge_id: "11111111-1111-4111-8111-111111111111", code: "1234" });
    ok(nd.status === 400 && nd2.status === 404 && await planExists(NP.id), "challenge'sız / uydurma challenge'lı DELETE reddedildi, plan duruyor", [nd.json, nd2.json]);
    ok(Number((await q1(`select count(*)::int n from nutrition_destructive_challenges where action='plan_delete'`)).n) === 0, "migration'sız DB'de plan_delete challenge kaydı oluşmadı");
    const NF = await sysFood("ZZ Yulaf", 389);
    await expertEdit(NA, NF.id, 400);
    const fr = await call(resetChRoute.POST, "POST", {}, NA, { scope: "one", food_id: NF.id });
    ok(fr.status === 200 && typeof fr.json.code === "string", "mevcut challenge işlemleri (besin reset) migration'sız DB'de de çalışır", fr.json);
    await q(readMig(NEW_MIGRATION));
    await q(readMig(NEW_MIGRATION));
    const chk2 = await q1(`select pg_get_constraintdef(oid) d from pg_constraint where conname='nutrition_destructive_challenges_action_chk'`);
    ok(/plan_delete/.test(chk2.d) && /plan_day_clear/.test(chk2.d) && /food_reset_one/.test(chk2.d) && /food_reset_all/.test(chk2.d), "migration 2 kez uygulandı (idempotent): CHECK 4 işlemi içerir", chk2.d);
    const nc2 = await call(planDelCh.POST, "POST", { id: NP.id }, NA, {});
    const ndel = await call(planRoute.DELETE, "DELETE", { id: NP.id }, NA, { challenge_id: nc2.json.challenge_id, code: nc2.json.code });
    ok(nc2.status === 200 && ndel.status === 200 && !(await planExists(NP.id)), "migration sonrası aynı akış çalışır (silindi)", [nc2.json, ndel.json]);
    let badAction: string | null = null;
    try { await q(`insert into nutrition_destructive_challenges (tenant_id,user_id,action,scope_hash,item_count,code_hash,expires_at) values ($1,$1,'bogus',repeat('a',64),0,repeat('b',64),now())`, [noMig.seed.TA]); }
    catch (e) { badAction = (e as { code?: string }).code ?? "err"; }
    ok(badAction === "23514", "CHECK hâlâ bilinmeyen işlemleri reddeder (23514)");

    // ═════════════════════════════════════════════════════════════════════════
    section("UI / kaynak sözleşmesi");
    const list = src("app/beslenme/planlar/page.tsx");
    const detail = src("app/beslenme/planlar/[id]/page.tsx");
    const dlgPlan = src("app/beslenme/planlar/_components/PlanDeleteDialog.tsx");
    const dlg = src("app/beslenme/_components/DestructiveChallengeDialog.tsx");
    const client = src("lib/beslenme/planClient.ts");
    const route = src("app/api/beslenme/plans/[id]/route.ts");
    for (const [n, s] of [["liste", list], ["detay", detail]] as const) {
      ok(/<PlanDeleteDialog/.test(s) && !/deletePlan\(/.test(s) && !/useDeleteConfirm/.test(s), `plan ${n}: Sil → PlanDeleteDialog (tek onaylı doğrudan DELETE YOK)`);
    }
    ok(/<DestructiveChallengeDialog/.test(dlgPlan) && /requestPlanDeleteChallenge\(plan\.id\)/.test(dlgPlan) && /deletePlan\(plan\.id, challengeId, code\)/.test(dlgPlan),
      "PlanDeleteDialog: 3 aşamalı dialog + sunucu kodu + kodlu silme");
    ok((dlgPlan.match(/deletePlan\(/g) || []).length === 1 && /const confirm = useCallback<ChallengeConfirm>/.test(dlgPlan), "silme isteği YALNIZ son adım (confirm) içinde");
    ok(/onClose=\{busy \? \(\) => undefined : onClose\}/.test(dlg) && /<GhostButton onClick=\{onClose\}>Vazgeç<\/GhostButton>/.test(dlg) && /disabled=\{!codeMatches\}/.test(dlg) && /if \(!info \|\| !codeMatches \|\| busy\) return;/.test(dlg),
      "Vazgeç/Escape/arka plan → onClose (istek yok); kod eşleşmeden buton pasif; meşgulken ikinci tık yok");
    ok(/Bu işlem geri alınamaz/.test(dlg) && /stage === 3/.test(dlg), "aşama 2 'geri alınamaz' + aşama 3 kod");
    ok(/export function deletePlan\(id: string, challengeId: string, code: string\)/.test(client) && /challenge_id: challengeId, code/.test(client) && /\/delete\/challenge`/.test(client),
      "planClient: deletePlan kod ZORUNLU; challenge ucu tanımlı");
    ok(route.indexOf("consumeDestructiveChallenge(") > 0 && route.indexOf("consumeDestructiveChallenge(") < route.indexOf('"nutrition_plan_delete_revision"') && /action: "plan_delete"/.test(route),
      "DELETE: challenge TÜKETİLMEDEN silme RPC'si çağrılmaz; işlem türü plan_delete");
    ok(/case "DELETE_UNAVAILABLE"/.test(src("app/beslenme/planlar/_components/planFormat.ts")), "UI: DELETE_UNAVAILABLE için açık mesaj");
    const mig = src(`supabase/migrations/${NEW_MIGRATION}`);
    ok(/PRODUCTION'A UYGULANMADI/.test(mig) && /ROLLBACK/.test(mig) && /DROP CONSTRAINT IF EXISTS/.test(mig) && /BEGIN;/.test(mig) && /COMMIT;/.test(mig) && !/DROP TABLE|DELETE FROM public\.nutrition_(?!destructive)/.test(mig.split("-- ROLLBACK")[0]),
      "migration başlığı: amaç + PRODUCTION'A UYGULANMADI + ROLLBACK; idempotent; veri-yıkıcı değil");

    console.log(`\nshim: ${shim.stats.requests} istek, desteklenmeyen: ${shim.stats.unsupported.length ? shim.stats.unsupported.join(" | ") : "yok"}`);
  } finally {
    await shim.close().catch(() => undefined);
    if (noMig) await noMig.stop().catch(() => undefined);
    await main.stop().catch(() => undefined);
  }

  console.log(`\nDD-P2 Beslenme route+DB harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
