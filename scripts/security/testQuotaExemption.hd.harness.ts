/**
 * Geçici test kotası muafiyeti — HUMAN DESIGN ROUTE hacim testi (GERÇEK route handler + izole Postgres; Roxy SAHTE, ücret 0).
 * Çalıştırma: npx tsx scripts/security/testQuotaExemption.hd.harness.ts   (QUOTA_PG_PORT varsayılan 54481, QUOTA_PG_DIR)
 *   • Yetkili test hesabı: 1000 FARKLI kişi BodyGraph (charts/roxy) + 500 Connection + 100 Penta (ortak hd-roxy-user 20/sa,
 *     hd-roxy-tenant 100/gün) + 1100 yerel hesap (hd-compute-user 60/sa) → hiç 429 yok.
 *   • Normal uzman (aynı tenant) ve başka tenant: 21. yeni BodyGraph'ta / 61. yerel hesapta 429 (eski davranış aynen).
 *   • Demo hesap listede olsa da muaf değil; istemci bayrağı etkisiz; pencere bitince eski sınır; eşzamanlı aynı girdi → tek çağrı.
 */
import { randomUUID } from "node:crypto";
import { mkUser, callRoute, FIXTURE, startHdFlowEnv, src, TA, TB, type Auth, type Json } from "../hd-analysis-word-flow/env";
import type { TestEnv } from "../anamnez/testEnv";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";
import { engineChart, fakeConnectionResponse, fakePentaResponse, type Moment } from "../hd-relations/fakeRelationRoxy";
import { __resetRateLimitForTest } from "../../lib/security/rateLimit";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const setWindow = (ids: string[], fromMs: number, toMs: number) => {
  process.env.TEST_QUOTA_EXEMPT_USER_IDS = ids.join(",");
  process.env.TEST_QUOTA_EXEMPT_WINDOW = `${new Date(fromMs).toISOString()}/${new Date(toMs).toISOString()}`;
};

async function main() {
  const roxy = { bodygraph: 0, connection: 0, penta: 0, external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    const json = (s: string) => new Response(s, { status: 200, headers: { "content-type": "application/json" } });
    if (/roxyapi\.com\/.*human-design\/bodygraph/.test(u)) { roxy.bodygraph++; await new Promise((r) => setTimeout(r, 30)); return json(consistentRoxyResponse(FIXTURE, init?.body)); }
    const body = JSON.parse(String(init?.body ?? "{}")) as { personA?: Moment; personB?: Moment; members?: Moment[] };
    if (/roxyapi\.com\/.*human-design\/connection/.test(u)) { roxy.connection++; await new Promise((r) => setTimeout(r, 30)); return json(JSON.stringify(fakeConnectionResponse(body.personA!, body.personB!, { lang: "tr" }))); }
    if (/roxyapi\.com\/.*human-design\/penta/.test(u)) { roxy.penta++; return json(JSON.stringify(fakePentaResponse(body.members!))); }
    roxy.external.push(u);
    throw new Error("harness: dış ağ yasak");
  }) as typeof fetch;
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
  delete process.env.ROXY_API_BASE_URL;
  console.info = () => undefined; // muafiyet iz logu (PII'siz) testte susturulur

  const env: TestEnv = await startHdFlowEnv({ port: Number(process.env.QUOTA_PG_PORT ?? 54481), dirName: process.env.QUOTA_PG_DIR ?? "hd-test-quota-pgdata" });
  const su = env.su;
  await su.query(src("supabase/migrations/20271102000000_hd_relation_analyses.sql"));
  await su.query(src("supabase/migrations/20271103000000_hd_relation_comments_reports.sql"));
  try {
    const P = { human_design: true, clients: true };
    const U = {
      TESTER: await mkUser(su, "QTEST", TA, P),
      EXPERT: await mkUser(su, "QEXP", TA, P),
      OTHER: await mkUser(su, "QOTH", TB, P),
      DEMO: await mkUser(su, "QDEMO", TA, P),
    };
    await su.query(`update public.users set is_demo_account=true where id=$1`, [U.DEMO.id]);
    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      compute: await import("../../app/api/hd/compute/route"),
      relations: await import("../../app/api/hd/relations/route"),
    };
    const now = Date.now();
    setWindow([U.TESTER.id!, U.DEMO.id!], now - 60_000, now + 4 * 3600_000);
    const birthOf = (i: number) => new Date(Date.UTC(1950, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    const newPerson = async (a: Auth, i: number) => {
      const r = await callRoute(routes.journey.POST, "POST", a, { action: "create_new", ad: `Test${i}`, soyad: "Kişi", dogum: birthOf(i), birth_time: `${String(6 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`, birth_location_ref: i % 2 ? "tr-06-ankara" : "trd-42-selcuklu", request_id: randomUUID() });
      if (r.status !== 200) throw new Error(`kişi ${i}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
      return String(r.json.hd_client_id);
    };
    const bodygraph = (a: Auth, clientId: string, body: Json = {}) => callRoute(routes.roxy.POST, "POST", a, { client_id: clientId, location_id: "client", ...body });

    section("1. Yetkili test hesabı — 1000 farklı kişi BodyGraph (ücretli kota 20/sa · 100/gün ATLANIR)");
    let first429 = -1;
    const ms: Record<number, number> = {};
    for (let i = 0; i < 1000; i++) {
      const id = await newPerson(U.TESTER, i);
      const r = await bodygraph(U.TESTER, id);
      if (r.status === 429 && first429 < 0) first429 = i + 1;
      if ([20, 21, 100, 101, 200, 201, 1000].includes(i + 1)) ms[i + 1] = r.status;
      if (r.status !== 200) { ok(false, `BodyGraph ${i + 1}. kişi`, { s: r.status, j: r.json }); break; }
    }
    ok(first429 < 0 && Object.values(ms).every((s) => s === 200) && roxy.bodygraph === 1000, `1a 1000 BodyGraph: 21./101./201./1000. hesapta devam, hiç 429 yok (Roxy ${roxy.bodygraph})`, ms);

    section("2. Yetkili test hesabı — 500 Connection + 100 Penta (aynı ortak sayaçlar ATLANIR)");
    // Tutarlı natal: 1000 kişi DB'ye yerel motor haritasıyla (Connection/Penta doğrulaması kayıtlı haritalarla 1:1)
    const rel: Array<{ c: string; h: string }> = [];
    for (let i = 0; i < 1000; i++) {
      const m: Moment = { date: birthOf(3000 + i), time: `${String(5 + (i % 14)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}:00`, timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
      const c = randomUUID();
      const h = randomUUID();
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [c, TA, `Rel${i} Kişi`, m.date, m.time.slice(0, 5)]);
      await su.query(`insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,'computed','roxyapi',$5,$6,$7)`,
        [h, TA, c, `Rel${i} Kişi`, JSON.stringify({ ...m, nodeType: "true", lang: "tr" }), `ihq-${i}`, JSON.stringify(engineChart(m))]);
      rel.push({ c, h });
    }
    const relPost = (a: Auth, idx: number[], extra: Json = {}) => callRoute(routes.relations.POST, "POST", a, { participants: idx.map((i) => ({ client_id: rel[i].c, chart_id: rel[i].h })), relation_type: idx.length === 2 ? "friends" : "family", ...extra });
    let c429 = -1;
    let cBad = 0;
    for (let k = 0; k < 500; k++) { const r = await relPost(U.TESTER, [2 * k, 2 * k + 1]); if (r.status === 429 && c429 < 0) c429 = k + 1; if (r.status !== 200) cBad++; }
    let p429 = -1;
    let pBad = 0;
    for (let k = 0; k < 100; k++) { const size = 3 + (k % 3); const idx = Array.from({ length: size }, (_, j) => (k * 7 + j * 101) % 1000); const r = await relPost(U.TESTER, idx); if (r.status === 429 && p429 < 0) p429 = k + 1; if (r.status !== 200) pBad++; }
    ok(c429 < 0 && cBad === 0 && roxy.connection === 500, `2a 500 Connection: hiç 429 yok, hepsi 200 (Roxy ${roxy.connection})`, { c429, cBad });
    ok(p429 < 0 && pBad === 0 && roxy.penta === 100, `2b 100 Penta (3/4/5 kişi): hiç 429 yok, hepsi 200 (Roxy ${roxy.penta})`, { p429, pBad });
    ok(roxy.bodygraph + roxy.connection + roxy.penta === 1600, "2c toplam 1600 ücretli analiz (ortak kota 20/sa'in 80 katı) — uygulama kotası engellemedi");

    section("3. Yetkili test hesabı — yerel hesap 1100 istek (60/sa ATLANIR)");
    let y429 = -1;
    for (let i = 0; i < 1100; i++) { const r = await callRoute(routes.compute.POST, "POST", U.TESTER, "{bozuk"); if (r.status === 429 && y429 < 0) y429 = i + 1; }
    ok(y429 < 0, "3a 1100 yerel hesap isteği: hiç 429 yok (geçersiz gövde → 400; kota kontrolü atlandı)", y429);

    section("4. Çift ücret ve yeniden kullanım korumaları (muaf hesapta da)");
    const fresh = await newPerson(U.TESTER, 7000);
    const b0 = roxy.bodygraph;
    const [x1, x2] = await Promise.all([bodygraph(U.TESTER, fresh), bodygraph(U.TESTER, fresh)]);
    ok(roxy.bodygraph === b0 + 1, "4a aynı kişiye eşzamanlı iki BodyGraph → tek ücretli çağrı", { calls: roxy.bodygraph - b0, s: [x1.status, x2.status] });
    const x3 = await bodygraph(U.TESTER, fresh);
    ok(x3.json.reused === true && roxy.bodygraph === b0 + 1, "4b aynı kişi tekrar → kayıtlı analiz, yeni ücret yok");
    const c0 = roxy.connection;
    await Promise.all([relPost(U.TESTER, [998, 999]), relPost(U.TESTER, [998, 999])]);
    ok(roxy.connection === c0, "4c zaten kayıtlı çift (998-999) eşzamanlı → yeni ücretli çağrı YOK (yeniden kullanım)");

    section("5. Normal uzman (aynı tenant) ve başka tenant — eski sınırlar AYNEN");
    __resetRateLimitForTest();
    let e429 = -1;
    for (let i = 0; i < 21; i++) { const id = await newPerson(U.EXPERT, 10_000 + i); const r = await bodygraph(U.EXPERT, id, { test: true, testQuotaExempt: true }); if (r.status === 429 && e429 < 0) e429 = i + 1; }
    ok(e429 === 21, `5a normal uzman: 21. yeni BodyGraph'ta 429 (eski 20/sa) — istek gövdesindeki test=true / testQuotaExempt etkisiz (${e429})`);
    let ec = -1;
    for (let i = 0; i < 61; i++) { const r = await callRoute(routes.compute.POST, "POST", U.EXPERT, "{bozuk"); if (r.status === 429 && ec < 0) ec = i + 1; }
    ok(ec === 61, `5b normal uzman: 61. yerel hesapta 429 (eski 60/sa) — ${ec}`);
    let o429 = -1;
    for (let i = 0; i < 21; i++) { const id = await newPerson(U.OTHER, 20_000 + i); const r = await bodygraph(U.OTHER, id); if (r.status === 429 && o429 < 0) o429 = i + 1; }
    ok(o429 === 21, `5c başka tenant: 21. yeni BodyGraph'ta 429 — muafiyetten etkilenmez (${o429})`);
    let d429 = -1;
    for (let i = 0; i < 61; i++) { const r = await callRoute(routes.compute.POST, "POST", U.DEMO, "{bozuk"); if (r.status === 429 && d429 < 0) d429 = i + 1; }
    ok(d429 === 61, `5d demo hesap env listesinde olsa bile muaf DEĞİL: 61. hesapta 429 (${d429})`);

    section("6. Pencere bitince / env yokken eski davranış");
    __resetRateLimitForTest();
    setWindow([U.TESTER.id!], now - 9 * 3600_000, now - 3600_000 - 1);
    let t429 = -1;
    for (let i = 0; i < 21; i++) { const id = await newPerson(U.TESTER, 25_000 + i); const r = await bodygraph(U.TESTER, id); if (r.status === 429 && t429 < 0) t429 = i + 1; }
    ok(t429 === 21, `6a pencere bitti: yetkili hesap da 21. yeni BodyGraph'ta 429 (eski sınır otomatik geri) — ${t429}`);
    __resetRateLimitForTest();
    setWindow([U.TESTER.id!], now - 60_000, now + 8 * 3600_000 + 60_000);
    let l429 = -1;
    for (let i = 0; i < 61; i++) { const r = await callRoute(routes.compute.POST, "POST", U.TESTER, "{bozuk"); if (r.status === 429 && l429 < 0) l429 = i + 1; }
    ok(l429 === 61, `6b 8 saatten uzun pencere → muafiyet KAPALI, 61. hesapta 429 — ${l429}`);
    delete process.env.TEST_QUOTA_EXEMPT_USER_IDS;
    delete process.env.TEST_QUOTA_EXEMPT_WINDOW;
    __resetRateLimitForTest();
    let n429 = -1;
    for (let i = 0; i < 61; i++) { const r = await callRoute(routes.compute.POST, "POST", U.TESTER, "{bozuk"); if (r.status === 429 && n429 < 0) n429 = i + 1; }
    ok(n429 === 61, `6c env yok (production'daki mevcut durum): 61. hesapta 429 — birebir eski davranış (${n429})`);
    ok(roxy.external.length === 0, "7 dış ağ çağrısı yok (gerçek Roxy / ücret 0)", roxy.external);
  } finally {
    await env.stop();
    globalThis.fetch = realFetch;
  }
  console.log(`\nHD test-quota route hacim testi: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
