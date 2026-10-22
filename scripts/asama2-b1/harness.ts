/**
 * AŞAMA 2 / B1 — BESLENME satış öncesi hata paketi harness'ı (BES-01..04, BUG-002/004/017, BS-005).
 *
 * GERÇEK Next route handler'ları + GERÇEK nutrition migration zinciri (yerel embedded-postgres +
 * test PostgREST shim'i; scripts/dogal-destek-p2/beslenme/env.ts). PRODUCTION'A SIFIR TEMAS — yalnız
 * 127.0.0.1, sentetik ZZ_ verisi.
 *
 *  BES-01  Plan meta PATCH atomik CAS: iki sekme, eşzamanlı çift istek, ÖN KONTROL SONRASI YARIŞ
 *          (başka işlem satır kilidini tutarken) → 409 + veri ezilmez; sürüm zorunlu; yetki.
 *  BES-02  Plan Word: tam / kısmi / boş gün / uzun / Türkçe / tarih sırası → gerçek DOCX; plan, gün,
 *          danışan bağı, besin sorgusu GERÇEK hata (yetki geri alma) → 500, DOCX yok; GET plan/gün 500.
 *  BES-03  Ölçüm DELETE: gerçek silme 200 · tekrar 404 · yok 404 · başka danışan/tenant 404 + satır
 *          korunur · DB hatası 500 · demo 403. (Alerjen sürüm kontrolü BLOKE — migration gerekir.)
 *  BES-04  Kalem kopyalama: doğru öğün 201 · başka plan / başka danışan / başka tenant / silinmiş
 *          öğün 404 · geçersiz UUID 400 · yetkisiz denemelerde veri değişimi 0.
 *  BUG-002/004/BS-005  saf ayrıştırıcı + hata anahtarı + i18n + tarih biçimi + kaynak kapıları.
 *
 * Çalıştır: npx tsx scripts/asama2-b1/harness.ts [--out <klasör>]   (FAIL → exit 1)
 * Port: 54641.
 */
import Module from "node:module";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import JSZip from "jszip";
import { NextRequest } from "next/server";

// Test shim'i zaman damgalarını JS Date → ms'lik ISO'ya çeviriyordu; gerçek PostgREST tam
// mikrosaniyeli metin döndürür. Ham metin → CAS `eq(updated_at)` karşılaştırması gerçekçi olur.
pg.types.setTypeParser(1184, (v: string) => v);
pg.types.setTypeParser(1114, (v: string) => v);

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: unknown, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type U = { id: string; token: string };
const SYS = "00000000-0000-4000-8000-000000000001";

async function call(handler: unknown, method: string, params: Record<string, string>, auth: U | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (auth) { headers["x-user-id"] = auth.id; headers["x-session-token"] = auth.token; }
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest("http://localhost/api/test", { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  let json: Json = {};
  let buf: Buffer | null = null;
  if ((res.headers.get("content-type") ?? "").includes("wordprocessingml")) buf = Buffer.from(await res.arrayBuffer());
  else { try { json = (await res.clone().json()) as Json; } catch { json = {}; } }
  return { status: res.status, json, buf, ctype: res.headers.get("content-type") ?? "" };
}

function unescapeXml(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
async function docText(buf: Buffer): Promise<{ text: string; xml: string }> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xml.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
  return { text, xml };
}

async function main(): Promise<void> {
  // ── Saf birim testleri (DB yok) ─────────────────────────────────────────────
  section("BUG-002 ondalık ayrıştırıcı (saf)");
  const D = await import("../../lib/beslenme/decimalInput");
  const R = { min: 0.0001, max: 500 };
  const cases: Array<[string, string, number | null]> = [
    ["65,5", "ok", 65.5], ["65.5", "ok", 65.5], [" 65,5 ", "ok", 65.5], ["70", "ok", 70], ["0,25", "ok", 0.25],
    ["", "empty", null], ["   ", "empty", null], ["abc", "invalid", null], ["6,5,5", "invalid", null], ["1.234,5", "invalid", null],
    ["-3", "invalid", null], ["Infinity", "invalid", null], ["NaN", "invalid", null], ["1e3", "invalid", null], [",5", "invalid", null],
    ["0", "out_of_range", 0], ["501", "out_of_range", 501], ["65,55555", "ok", 65.55555],
  ];
  for (const [inp, kind, val] of cases) {
    const r = D.parseDecimalInput(inp, R);
    ok(r.kind === kind && (val === null || ("value" in r && r.value === val)), `parseDecimalInput(${JSON.stringify(inp)}) → ${kind}${val !== null ? ` ${val}` : ""}`, r);
  }
  ok(Number.isNaN(Number("65,5")), "ÖNCE: Number('65,5') = NaN (JSON'da null → sunucu WEIGHT_REQUIRED) — hata yeniden üretildi");
  const mb = D.buildMeasurementBody({ weight: "65,5", height: "170,2", waist: "", hip: "98" });
  ok(mb.ok && mb.values.weight_kg === 65.5 && mb.values.height_cm === 170.2 && mb.values.waist_cm === null && mb.values.hip_cm === 98, "buildMeasurementBody: virgüllü değerler + boş bel → null (yuvarlama yok)", mb);
  const mb2 = D.buildMeasurementBody({ weight: "", height: "", waist: "", hip: "" });
  ok(!mb2.ok && mb2.field === "weight_kg" && mb2.reason === "required", "kilo boş → required");
  const mb3 = D.buildMeasurementBody({ weight: "65", height: "yüz yetmiş", waist: "", hip: "" });
  ok(!mb3.ok && mb3.field === "height_cm" && mb3.reason === "invalid", "geçersiz boy → AÇIK hata (sessiz null değil)");
  const mb4 = D.buildMeasurementBody({ weight: "65", height: "", waist: "999", hip: "" });
  ok(!mb4.ok && mb4.field === "waist_cm" && mb4.reason === "out_of_range", "aralık dışı bel → hata");

  section("BUG-004 hata anahtarı + i18n (saf)");
  ok(D.beslenmeErrorKey("WEIGHT_REQUIRED") === "weightRequired" && D.beslenmeErrorKey("BAD_HIP_CM") === "badHip", "WEIGHT_REQUIRED / BAD_HIP_CM → anlaşılır anahtar");
  ok(D.beslenmeErrorKey("SOME_SQL_42P01") === "generic" && D.beslenmeErrorKey(undefined, 0) === "network" && D.beslenmeErrorKey("X", 403) === "forbidden", "bilinmeyen kod → genel mesaj; ağ/yetki ayrımı");
  const tr = JSON.parse(src("messages/tr/beslenme.json")).beslenme.detail.errors as Record<string, string>;
  const en = JSON.parse(src("messages/en/beslenme.json")).beslenme.detail.errors as Record<string, string>;
  const keys = new Set([...Object.values({ a: "weightRequired" }), "invalidWeight", "badHeight", "badWaist", "badHip", "generic", "network", "forbidden", "notFound", "invalidInput", "measurementNotFound"]);
  ok([...keys].every((k) => typeof tr[k] === "string" && typeof en[k] === "string"), "TR + EN çeviri anahtarları eksiksiz");
  ok(tr.weightRequired === "Kilo bilgisi gerekli. Lütfen geçerli bir kilo değeri girin.", "TR WEIGHT_REQUIRED metni owner örneğiyle aynı");
  ok(JSON.stringify(Object.keys(tr).sort()) === JSON.stringify(Object.keys(en).sort()), "TR/EN anahtar eşliği");
  const tab = src("app/dashboard/clients/[id]/components/BeslenmeTab.tsx");
  ok(!/\(\$\{r\.code\}\)/.test(tab) && !/r\.code \?/.test(tab), "BeslenmeTab: ham `(r.code)` ekleme kalmadı (8 nokta)");
  ok(!/Number\(w\)|Number\(h\)|Number\(waist\)|Number\(hip\)/.test(tab) && !/type="number"/.test(tab), "BeslenmeTab: Number('65,5') / type=number sessiz NaN yolu kalmadı");

  section("BS-005 tarih sunumu (saf)");
  const { formatDateLoose } = await import("../../lib/time/reportTime");
  ok(formatDateLoose("2026-10-25", { locale: "tr-TR" }) === "25.10.2026", "DATE '2026-10-25' → 25.10.2026 (kayma yok)");
  ok(formatDateLoose("2026-10-22T09:20:00.000Z", { locale: "tr-TR" }) === "22.10.2026", "ISO an → yerel gün 22.10.2026");
  ok(formatDateLoose("2026-10-22T21:30:00.000Z", { locale: "tr-TR" }) === "23.10.2026", "UTC 21:30 → İstanbul 23.10.2026 (gerçek yerel gün)");
  ok(formatDateLoose("2026-10-25", { locale: "en-GB" }) === "25/10/2026", "EN arayüz: en-GB biçimi korunur");
  ok(!/\{f\.latest\.start_date\} →/.test(tab) && /displayDay\(f\.latest\.start_date, locale\)/.test(tab), "BeslenmeTab: plan aralığı ham ISO DEĞİL");
  ok(/dayLabel=\{formatDateTr\(selectedDay\.plan_date\)\}/.test(src("app/beslenme/planlar/_components/PlanTools.tsx")), "Gün şablonu diyaloğu: ham plan_date DEĞİL");

  section("BUG-017 kaynak kapısı");
  const shell = src("app/beslenme/_components/BeslenmeShell.tsx");
  ok(/min-h-screen overflow-x-clip/.test(shell) && !/min-h-screen overflow-hidden/.test(shell), "BeslenmeShell main: overflow-hidden (kaydırılabilir) → overflow-x-clip");
  ok(/absolute inset-0 overflow-clip/.test(shell), "dekor blob'ları kendi kırpma katmanında");
  ok(!/flex shrink-0 flex-wrap items-center gap-2">\{actions\}/.test(shell) && /sm:max-w-\[60%\] sm:justify-end">\{actions\}/.test(shell), "başlık eylemleri sarılır (shrink-0 tek satır taşması yok)");

  // ── Gerçek DB + route ───────────────────────────────────────────────────────
  const { startBesDb, pointRoutesTo } = await import("../dogal-destek-p2/beslenme/env");
  const { startEmbedShim } = await import("../dogal-destek-p2/beslenme/pgrestEmbedShim");
  const db = await startBesDb({ port: 54641, dirName: "asama2-b1-pgdata", includeNewMigration: true });
  const shim = await startEmbedShim(db.pool);
  pointRoutesTo(shim.url);
  console.log(`\nembedded-postgres (${db.applied.length} nutrition migration) + shim (${shim.url})`);

  try {
    const AP = "../../app/api/beslenme";
    const plansRoute = await import(`${AP}/plans/route`);
    const planRoute = await import(`${AP}/plans/[id]/route`);
    const dayRoute = await import(`${AP}/plans/[id]/days/[dayId]/route`);
    const mealsRoute = await import(`${AP}/plans/[id]/days/[dayId]/meals/route`);
    const itemsRoute = await import(`${AP}/plans/[id]/meals/[mealId]/items/route`);
    const copyRoute = await import(`${AP}/plans/[id]/items/[itemId]/copy/route`);
    const wordRoute = await import(`${AP}/plans/[id]/word/route`);
    const clientPlansRoute = await import(`${AP}/clients/[clientId]/plans/route`);
    const measRoute = await import(`${AP}/clients/[clientId]/measurements/route`);
    const measOne = await import(`${AP}/clients/[clientId]/measurements/[measurementId]/route`);

    const S = db.seed;
    const US = S.users;
    const q = async (sql: string, args: unknown[] = []) => (await db.env.su.query(sql, args)).rows;
    const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
    const nid = async (code: string) => (await q1(`select id from nutrition_nutrients where code=$1`, [code])).id as string;
    const uidU = async (code: string) => (await q1(`select id from nutrition_units where code=$1`, [code])).id as string;
    async function sysFood(name: string, kcal: number) {
      const id = (await q1(`insert into nutrition_foods (tenant_id, name_tr, aliases) values ($1,$2,'{}') returning id`, [SYS, name])).id as string;
      await q(`insert into nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams)
               values ($1,$2,$3,$4,$5,100), ($1,$2,$6,3.5,$7,100)`, [SYS, id, await nid("energy"), kcal, await uidU("kcal"), await nid("protein"), await uidU("g")]);
      return id;
    }
    async function newPlan(user: U, title: string, start = "2026-10-05", end = "2026-10-06") {
      const r = await call(plansRoute.POST, "POST", {}, user, { title, start_date: start, end_date: end });
      const plan = r.json.plan as Json;
      const days = await q(`select id from nutrition_plan_days where plan_id=$1 order by plan_date`, [plan.id]);
      return { r, id: plan.id as string, days: days.map((d) => d.id as string) };
    }
    async function newClientPlan(user: U, clientId: string, title: string) {
      const r = await call(clientPlansRoute.POST, "POST", { clientId }, user, { title, start_date: "2026-10-05", end_date: "2026-10-06" });
      const plan = r.json.plan as Json;
      const days = await q(`select id from nutrition_plan_days where plan_id=$1 order by plan_date`, [plan?.id]);
      return { r, id: plan?.id as string, days: days.map((d) => d.id as string) };
    }
    async function newMeal(user: U, planId: string, dayId: string, label = "Kahvaltı", type = "breakfast") {
      const r = await call(mealsRoute.POST, "POST", { id: planId, dayId }, user, { plan_day_id: dayId, meal_type: type, label });
      return ((r.json.meal as Json | undefined)?.id ?? "") as string;
    }
    async function newItem(user: U, planId: string, mealId: string, foodId: string, grams = 100) {
      const r = await call(itemsRoute.POST, "POST", { id: planId, mealId }, user, { food_id: foodId, grams });
      return ((r.json.item as Json | undefined)?.id ?? "") as string;
    }
    const planRow = (id: string) => q1(`select title, note, daily_energy_target, status, updated_at::text as v from nutrition_plans where id=$1`, [id]);
    const itemCount = async () => Number((await q1(`select count(*)::int n from nutrition_plan_items`)).n);
    const mealItems = async (mealId: string) => Number((await q1(`select count(*)::int n from nutrition_plan_items where meal_id=$1`, [mealId])).n);

    const ELMA = await sysFood("ZZ Elma (çğıöşü)", 52);
    const PEYNIR = await sysFood("ZZ Beyaz Peynir ŞİİR", 264);

    // ═════════════════════════════════════════════════════════════════════
    section("BES-01 plan meta — atomik optimistic concurrency");
    const P = await newPlan(US.A, "ZZ CAS Planı");
    ok(P.r.status === 201, "plan oluşturuldu", P.r.json);
    const g0 = await call(planRoute.GET, "GET", { id: P.id }, US.A);
    const v0 = (g0.json.plan as Json).updated_at as string;
    ok(typeof v0 === "string" && v0.length > 10, "GET plan sürümü (updated_at) okunur", v0);
    // İki sekme aynı sürümü açtı.
    const tabA = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.A, { title: "Sekme A", expectedUpdatedAt: v0 });
    ok(tabA.status === 200 && (tabA.json.plan as Json).title === "Sekme A", "Sekme A kaydeder → 200", tabA.json);
    const v1 = (tabA.json.plan as Json).updated_at as string;
    ok(v1 !== v0, "sürüm ilerledi (trigger)");
    const tabB = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.A2, { title: "Sekme B (eski)", expectedUpdatedAt: v0 });
    ok(tabB.status === 409 && tabB.json.code === "PLAN_STALE", "Sekme B eski sürümle → 409 PLAN_STALE", tabB);
    ok((await planRow(P.id)).title === "Sekme A", "Sekme A'nın verisi KORUNDU (ezilmedi)");
    const noVer = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.A, { title: "Sürümsüz" });
    ok(noVer.status === 400 && noVer.json.code === "VERSION_REQUIRED" && (await planRow(P.id)).title === "Sekme A", "sürümsüz PATCH → 400 VERSION_REQUIRED, yazım YOK");

    // Eşzamanlı çift istek (aynı sürüm) × 5 tur → tam olarak biri kazanır.
    let cur = v1;
    let raceOk = true;
    for (let i = 0; i < 5; i++) {
      const [x, y] = await Promise.all([
        call(planRoute.PATCH, "PATCH", { id: P.id }, US.A, { title: `Yarış X${i}`, expectedUpdatedAt: cur }),
        call(planRoute.PATCH, "PATCH", { id: P.id }, US.A2, { title: `Yarış Y${i}`, expectedUpdatedAt: cur }),
      ]);
      const codes = [x.status, y.status].sort().join(",");
      const winner = x.status === 200 ? `Yarış X${i}` : `Yarış Y${i}`;
      const row = await planRow(P.id);
      if (codes !== "200,409" || row.title !== winner) { raceOk = false; console.error("   yarış turu", i, codes, row.title); }
      cur = row.v;
    }
    ok(raceOk, "eşzamanlı çift PATCH (5 tur): her turda tam 1×200 + 1×409, DB = kazananın değeri");

    // ÖN KONTROL SONRASI YARIŞ: başka bir işlem satırı kilitleyip değiştiriyor (henüz commit yok).
    // Rota ön kontrolü eski (commit'li) sürümü görür ve geçer; asıl UPDATE kilitte bekler →
    // kilit bırakılınca koşul yeni satırda yeniden değerlendirilir → 0 satır → 409.
    const before = await planRow(P.id);
    const locker = new pg.Client({ host: "127.0.0.1", port: 54641, user: "postgres", password: "testpw", database: "postgres" });
    await locker.connect();
    await locker.query("begin");
    await locker.query(`update nutrition_plans set note='ZZ_PARALEL_YAZAR' where id=$1`, [P.id]);
    const pending = call(planRoute.PATCH, "PATCH", { id: P.id }, US.A, { title: "Kilit Sonrası", expectedUpdatedAt: before.v });
    await new Promise((r) => setTimeout(r, 1200));
    await locker.query("commit");
    await locker.end();
    const lateRes = await pending;
    const afterLock = await planRow(P.id);
    ok(lateRes.status === 409 && afterLock.note === "ZZ_PARALEL_YAZAR" && afterLock.title === before.title,
      "YARIŞ PENCERESİ YOK: ön kontrolden sonra değişen satır → 409, paralel yazarın notu + eski başlık korunur", { s: lateRes.status, row: afterLock });

    // Arşiv / tenant / demo / yetkisiz
    await q(`update nutrition_plans set status='archived' where id=$1`, [P.id]);
    const arch = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.A, { title: "x", expectedUpdatedAt: (await planRow(P.id)).v });
    ok(arch.status === 403 && arch.json.code === "PLAN_ARCHIVED", "arşiv plan → 403", arch.json);
    await q(`update nutrition_plans set status='draft' where id=$1`, [P.id]);
    const vNow = (await planRow(P.id)).v;
    const tB = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.B, { title: "B tenant", expectedUpdatedAt: vNow });
    ok(tB.status === 404 || tB.status === 403, "başka tenant → erişim yok (404/403), yazım yok", tB.status);
    const dm = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.DEMO, { title: "demo", expectedUpdatedAt: vNow });
    ok(dm.status === 403, "demo hesap → 403", dm.json);
    const nm = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.NOMOD, { title: "nomod", expectedUpdatedAt: vNow });
    ok(nm.status === 403 || nm.status === 404, "modül izni yok → reddedilir", nm.status);
    ok((await planRow(P.id)).title === before.title, "yetkisiz denemeler başlığı DEĞİŞTİRMEDİ");
    const okAfter = await call(planRoute.PATCH, "PATCH", { id: P.id }, US.A, { title: "Güncel Sürümle", expectedUpdatedAt: (await planRow(P.id)).v });
    ok(okAfter.status === 200, "güncel veri yüklenip tekrar denenince 200 (akış kilitlenmez)");

    // ═════════════════════════════════════════════════════════════════════
    section("BES-04 kalem kopyalama — hedef öğün aynı plana ait olmalı");
    const P1 = await newPlan(US.A, "ZZ Kopya Kaynak");
    const M1 = await newMeal(US.A, P1.id, P1.days[0]);
    const M1b = await newMeal(US.A, P1.id, P1.days[1], "Öğle", "lunch");
    const I1 = await newItem(US.A, P1.id, M1, ELMA, 150);
    const P2 = await newPlan(US.A, "ZZ İlgisiz Plan");
    const M2 = await newMeal(US.A, P2.id, P2.days[0]);
    const PC = await newClientPlan(US.A, S.clients.a2, "ZZ Başka Danışan Planı");
    ok(PC.r.status === 201, "başka danışana (a2) bağlı plan", PC.r.json);
    const M3 = await newMeal(US.A, PC.id, PC.days[0]);
    const PB = await newPlan(US.B, "ZZ B Tenant Planı");
    const MB = await newMeal(US.B, PB.id, PB.days[0]);
    const MDEL = await newMeal(US.A, P1.id, P1.days[0], "Silinecek", "snack");
    await q(`delete from nutrition_plan_meals where id=$1`, [MDEL]);
    ok(!!I1 && !!M2 && !!M3 && !!MB, "fixture: kaynak kalem + 3 yabancı öğün");

    // ÖNCE: RPC tek başına plan doğrulamıyor (eski rota yalnız kaynağı kontrol ediyordu) — rollback'li kanıt.
    await db.env.su.query("begin");
    let rpcCross = false;
    try {
      await db.env.su.query(`select nutrition_plan_item_copy($1,$2,$3)`, [S.TA, I1, M2]);
      rpcCross = Number((await db.env.su.query(`select count(*)::int n from nutrition_plan_items where meal_id=$1`, [M2])).rows[0].n) === 1;
    } finally { await db.env.su.query("rollback"); }
    ok(rpcCross, "ÖNCE: nutrition_plan_item_copy RPC başka plandaki öğüne yazabiliyor (kök neden doğrulandı; işlem geri alındı)");

    const total0 = await itemCount();
    const good = await call(copyRoute.POST, "POST", { id: P1.id, itemId: I1 }, US.A, { targetMealId: M1b });
    ok(good.status === 201 && (await mealItems(M1b)) === 1, "doğru plan içi öğün → 201", good.json);
    const total1 = await itemCount();
    for (const [label, target, user, exp] of [
      ["ilgisiz plan (aynı tenant)", M2, US.A, 404],
      ["başka danışanın planı", M3, US.A, 404],
      ["başka tenant öğünü", MB, US.A, 404],
      ["silinmiş öğün", MDEL, US.A, 404],
    ] as Array<[string, string, U, number]>) {
      const r = await call(copyRoute.POST, "POST", { id: P1.id, itemId: I1 }, user, { targetMealId: target });
      ok(r.status === exp && r.json.code === "TARGET_NOT_FOUND", `${label} → ${exp} TARGET_NOT_FOUND`, r);
    }
    const bad = await call(copyRoute.POST, "POST", { id: P1.id, itemId: I1 }, US.A, { targetMealId: "not-a-uuid" });
    ok(bad.status === 400 && bad.json.code === "BAD_TARGET", "geçersiz UUID → 400", bad.json);
    const fromOther = await call(copyRoute.POST, "POST", { id: P2.id, itemId: I1 }, US.A, { targetMealId: M2 });
    ok(fromOther.status === 404, "kaynak kalem başka planın → 404 (mevcut koruma)", fromOther.json);
    const tenantB = await call(copyRoute.POST, "POST", { id: P1.id, itemId: I1 }, US.B, { targetMealId: MB });
    ok(tenantB.status === 404 || tenantB.status === 403, "başka tenant kullanıcısı kaynak plana erişemez", tenantB.status);
    const demoC = await call(copyRoute.POST, "POST", { id: P1.id, itemId: I1 }, US.DEMO, { targetMealId: M1b });
    ok(demoC.status === 403, "demo → 403");
    ok((await itemCount()) === total1 && total1 === total0 + 1 && (await mealItems(M2)) === 0 && (await mealItems(M3)) === 0,
      "yetkisiz denemelerde veri değişimi SIFIR (yalnız meşru kopya eklendi)");

    // ═════════════════════════════════════════════════════════════════════
    section("BES-03 ölçüm silme — sahte başarı yok");
    const addM = async (clientId: string, w: unknown, user: U = US.A) => call(measRoute.POST, "POST", { clientId }, user, { weight_kg: w });
    const m1 = await addM(S.clients.a1, 65.5);
    const m1id = (m1.json.measurement as Json)?.id as string;
    ok(m1.status === 201 && Number((m1.json.measurement as Json).weight_kg) === 65.5, "BUG-002 API: 65.5 tam kaydedilir (yuvarlama yok)", m1.json);
    const mNull = await addM(S.clients.a1, null);
    ok(mNull.status === 400 && mNull.json.code === "WEIGHT_REQUIRED", "ÖNCE: istemci NaN→null gönderiyordu → WEIGHT_REQUIRED (yeniden üretildi)");
    const mStr = await addM(S.clients.a1, "72,25");
    ok(mStr.status === 201 && Number((mStr.json.measurement as Json).weight_kg) === 72.25, "sunucu virgüllü metni de kabul eder (72,25)");
    const d1 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a1, measurementId: m1id }, US.A);
    ok(d1.status === 200 && d1.json.ok === true && !(await q1(`select 1 x from nutrition_client_measurements where id=$1`, [m1id])), "gerçek silme → 200 + satır yok");
    const d2 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a1, measurementId: m1id }, US.A);
    ok(d2.status === 404 && d2.json.code === "MEASUREMENT_NOT_FOUND" && d2.json.ok === false, "aynı kaydı tekrar silme → 404 (eskiden ok:true)", d2.json);
    const d3 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a1, measurementId: "11111111-1111-4111-8111-111111111111" }, US.A);
    ok(d3.status === 404, "hiç olmayan kayıt → 404");
    const mA2 = await addM(S.clients.a2, 80);
    const mA2id = (mA2.json.measurement as Json).id as string;
    const d4 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a1, measurementId: mA2id }, US.A);
    ok(d4.status === 404 && !!(await q1(`select 1 x from nutrition_client_measurements where id=$1`, [mA2id])), "başka danışanın ölçümü (yol a1) → 404 + satır KORUNUR");
    const d5 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a2, measurementId: mA2id }, US.B);
    ok((d5.status === 404 || d5.status === 403) && !!(await q1(`select 1 x from nutrition_client_measurements where id=$1`, [mA2id])), "başka tenant → reddedilir, veri sızmaz, satır korunur", d5);
    const d6 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a2, measurementId: mA2id }, US.DEMO);
    ok(d6.status === 403, "demo → 403");
    const d7 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a2, measurementId: "bad" }, US.A);
    ok(d7.status === 400, "geçersiz id → 400");
    await q(`revoke delete on public.nutrition_client_measurements from service_role`);
    const d8 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a2, measurementId: mA2id }, US.A);
    await q(`grant delete on public.nutrition_client_measurements to service_role`);
    ok(d8.status === 500 && d8.json.ok === false && d8.json.code === "MEASUREMENT_DELETE_FAILED" && !JSON.stringify(d8.json).includes("permission"),
      "DB hatası → 500 güvenli kod (ham hata yok, başarı yok)", d8.json);
    const d9 = await call(measOne.DELETE, "DELETE", { clientId: S.clients.a2, measurementId: mA2id }, US.A);
    ok(d9.status === 200, "yetki geri gelince gerçek silme 200");

    // ═════════════════════════════════════════════════════════════════════
    section("BES-02 Word — gerçek DOCX + hata yutma yok");
    const W = await newClientPlan(US.A2, S.clients.a1, "ZZ Word Planı — Çiğdem Şükrü İçli");
    const wMealD1a = await newMeal(US.A2, W.id, W.days[1], "Öğle Yemeği", "lunch");
    const wMealD1b = await newMeal(US.A2, W.id, W.days[1], "Kahvaltı", "breakfast");
    await newItem(US.A2, W.id, wMealD1a, PEYNIR, 60);
    await newItem(US.A2, W.id, wMealD1b, ELMA, 150);
    await newItem(US.A2, W.id, wMealD1b, PEYNIR, 30);
    // W.days[0] gerçekten BOŞ gün (öğün yok); D1 tam dolu.
    const wordA = await call(wordRoute.POST, "POST", { id: W.id }, US.A2);
    ok(wordA.status === 200 && !!wordA.buf && wordA.buf.length > 3000, "kısmen dolu plan (1 boş gün) → 200 DOCX", { s: wordA.status, j: wordA.json });
    if (wordA.buf) {
      if (OUT) writeFileSync(path.join(OUT, "b1-word-kismi.docx"), wordA.buf);
      const { text } = await docText(wordA.buf);
      ok(text.includes("Çiğdem Şükrü İçli") && text.includes("ZZ Elma (çğıöşü)") && text.includes("ZZ Beyaz Peynir ŞİİR"), "Türkçe karakterler + kayıtlı içerik birebir");
      ok(text.includes("ZZ Ayşe") , "bağlı danışan adı (doğru danışan)");
      ok(!text.includes("ZZ Mehmet") && !text.includes("ZZ Bora"), "başka danışan / tenant verisi YOK");
      const i05 = text.search(/05\.10\.2026|5 Ekim 2026/);
      const i06 = text.search(/06\.10\.2026|6 Ekim 2026/);
      ok(i05 >= 0 && i06 > i05, "tarih sıralaması (05.10 → 06.10)", { i05, i06 });
    }
    const E = await newPlan(US.A2, "ZZ Boş Plan");
    const wordE = await call(wordRoute.POST, "POST", { id: E.id }, US.A2);
    ok(wordE.status === 200 && !!wordE.buf, "gerçekten boş plan (sorgular başarılı, 0 öğün) → 200 DOCX (hata DEĞİL)", wordE.status);
    if (wordE.buf && OUT) writeFileSync(path.join(OUT, "b1-word-bos.docx"), wordE.buf);

    // Uzun plan: 21 gün × 3 öğün × 2 kalem (SQL ile hızlı; snapshot nutrient'li gerçek route kalemleri yerine
    // route ile 1 kalem + SQL çoğaltma yerine tüm kalemler route ile → gerçek snapshot).
    const L = await newPlan(US.A, "ZZ Uzun Plan", "2026-11-01", "2026-11-21");
    for (const dayId of L.days) {
      for (const [lbl, typ] of [["Kahvaltı", "breakfast"], ["Öğle", "lunch"], ["Akşam", "dinner"]] as const) {
        const m = await newMeal(US.A, L.id, dayId, lbl, typ);
        await newItem(US.A, L.id, m, ELMA, 100);
        await newItem(US.A, L.id, m, PEYNIR, 40);
      }
    }
    const wordL = await call(wordRoute.POST, "POST", { id: L.id }, US.A);
    ok(wordL.status === 200 && !!wordL.buf, "uzun plan (21 gün × 3 öğün × 2 kalem = 126 kalem) → 200", wordL.status);
    if (wordL.buf) {
      if (OUT) writeFileSync(path.join(OUT, "b1-word-uzun.docx"), wordL.buf);
      const { text } = await docText(wordL.buf);
      ok((text.match(/ZZ Beyaz Peynir ŞİİR/g) ?? []).length >= 63, "uzun plan: 63 peynir kalemi eksiksiz", (text.match(/ZZ Beyaz Peynir ŞİİR/g) ?? []).length);
    }
    const wordB = await call(wordRoute.POST, "POST", { id: W.id }, US.B);
    ok(wordB.status === 404 || wordB.status === 403, "başka tenant planı Word → erişim yok", wordB.status);

    // Gerçek sorgu hataları: tablo okuma yetkisi geri alınır (prod'da ağ/DB hatası temsili).
    for (const table of ["nutrition_plan_days", "nutrition_plan_clients", "clients", "nutrition_plan_meals", "nutrition_plan_items", "nutrition_plan_item_nutrients", "nutrition_plans"]) {
      await q(`revoke select on public.${table} from service_role`);
      const r = await call(wordRoute.POST, "POST", { id: W.id }, US.A2);
      await q(`grant select on public.${table} to service_role`);
      const leaked = JSON.stringify(r.json).includes("permission");
      if (table === "nutrition_plans") {
        // Ortak erişim kapısı (requireBeslenmePlanAccess) planı okuyamazsa fail-closed 404 döner (B1 kapsamı dışı, değişmedi).
        ok(r.status >= 400 && !r.buf && r.json.ok === false && !leaked, `${table} okunamaz → erişim kapısı fail-closed (${r.status}), DOCX ÜRETİLMEZ`, { s: r.status, j: r.json });
      } else {
        ok(r.status === 500 && !r.buf && r.json.code === "WORD_FAILED" && !leaked, `${table} okunamaz → 500 WORD_FAILED, eksik DOCX ÜRETİLMEZ`, { s: r.status, j: r.json });
      }
    }
    await q(`revoke select on public.nutrition_plan_days from service_role`);
    const gp = await call(planRoute.GET, "GET", { id: W.id }, US.A2);
    await q(`grant select on public.nutrition_plan_days to service_role`);
    ok(gp.status === 500 && gp.json.code === "READ_FAILED", "GET plan: gün okunamaz → 500 (boş plan gibi gösterilmez)", gp.json);
    await q(`revoke select on public.nutrition_plan_items from service_role`);
    const gd = await call(dayRoute.GET, "GET", { id: W.id, dayId: W.days[1] }, US.A2);
    await q(`grant select on public.nutrition_plan_items to service_role`);
    ok(gd.status === 500 && gd.json.code === "READ_FAILED", "GET gün: kalem okunamaz → 500 (boş gün gibi gösterilmez)", gd.json);
    const gdOk = await call(dayRoute.GET, "GET", { id: W.id, dayId: W.days[0] }, US.A2);
    ok(gdOk.status === 200 && Array.isArray((gdOk.json.day as Json).meals) && ((gdOk.json.day as Json).meals as unknown[]).length === 0, "gerçekten boş gün → 200 + 0 öğün");
    const wordAgain = await call(wordRoute.POST, "POST", { id: W.id }, US.A);
    ok(wordAgain.status === 200, "yetkiler geri gelince Word yine 200", wordAgain.status);
  } finally {
    await shim.close?.();
    await db.stop();
  }
}

main()
  .catch((e) => { fail++; failures.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / B1 harness: ${pass} PASS / ${fail} FAIL`);
    if (failures.length) console.log("FAILURES:\n - " + failures.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
