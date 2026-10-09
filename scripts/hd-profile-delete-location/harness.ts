/**
 * HD satış öncesi son iki düzeltme — UÇTAN UCA harness (PRODUCTION'A SIFIR TEMAS).
 *
 *   A) Yurt dışı doğum yeri: Türkçe yabancı şehir adları (Londra → London …) yalnız ARAMA kolaylığı;
 *      konum kimliği/koordinat/ülke/saat dilimi dataset ya da sağlayıcı sonucundan gelir.
 *   B) Profil silme (owner kararı 2026-10-09): profil + bağlı Human Design analizleri + Word raporları.
 *
 * Ortam: geçici embedded-postgres + PostgREST shim + Storage emülatörü (scripts/anamnez/testEnv),
 * GERÇEK route handler'ları, GERÇEK FK/trigger (20271010000100). RoxyAPI: sahte anahtar + sahte
 * fetch (bodygraph fixture + konum araması); çağrılar SAYILIR, başka her dış istek reddedilir.
 *
 * Çalıştır: npm run hd:profile-delete-location:harness
 */
import { randomUUID } from "node:crypto";
import { BODYGRAPH, FIXTURE, HD_BUCKET, TA, TB, callRoute, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";
import type { TestEnv } from "../anamnez/testEnv";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 600) : "");
  }
}
const section = (s: string) => console.log(`\n[${s}]`);

// Sahte Roxy konum araması: gönderilen sorgu kaydedilir. "Londra" HAM olarak gelirse Londrina döner
// (gerçek hatayı taklit eder) — sunucu Türkçe adı kanonik ada çevirmeliydi.
const CITY = (city: string, province: string, country: string, iso2: string, lat: number, lon: number, tz: string) =>
  ({ city, province, country, iso2, latitude: lat, longitude: lon, timezone: tz });
function roxyLocationAnswer(q: string) {
  const n = q.toLocaleLowerCase("tr-TR");
  if (n === "london") return [CITY("London", "England", "United Kingdom", "GB", 51.50853, -0.12574, "Europe/London"), CITY("London", "Ontario", "Canada", "CA", 42.98339, -81.23304, "America/Toronto")];
  if (n === "munich") return [CITY("Munich", "Bavaria", "Germany", "DE", 48.13743, 11.57549, "Europe/Berlin")];
  if (n.startsWith("londr")) return [CITY("Londrina", "Paraná", "Brazil", "BR", -23.31028, -51.16278, "America/Sao_Paulo")];
  if (n === "cey") return [CITY("Cey", "Hakkâri", "Turkey", "TR", 37.3, 43.9, "Asia/Baghdad")];
  return [];
}

async function main() {
  const roxy = { bodygraph: 0, locationQueries: [] as string[], external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    if (/roxyapi\.com\/.*human-design\/bodygraph/.test(u)) {
      roxy.bodygraph++;
      return new Response(FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    }
    const m = /roxyapi\.com\/.*\/location\/search\?q=([^&]*)/.exec(u);
    if (m) {
      const q = decodeURIComponent(m[1]);
      roxy.locationQueries.push(q);
      return new Response(JSON.stringify({ cities: roxyLocationAnswer(q) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    roxy.external.push(u);
    throw new Error("harness: dış ağ çağrısı yasak");
  }) as typeof fetch;

  const env: TestEnv = await startHdFlowEnv({ port: 54431, dirName: "hd-profile-delete-location-pgdata" });
  const su = env.su;
  const count = async (sql: string, p: unknown[] = []) => Number((await su.query(sql, p)).rows[0].n);
  const objects = () => env.storage.objects.get(HD_BUCKET) ?? new Map();
  console.log(`embedded-postgres + PostgREST shim + Storage emülatörü hazır (${env.url}).`);

  try {
    const U = {
      A: await mkUser(su, "PDA", TA, { human_design: true, clients: true, hd_system_reading: true }),
      B: await mkUser(su, "PDB", TB, { human_design: true, clients: true }),
      NOHD: await mkUser(su, "PDN", TA, { clients: true }),
    };
    const demoId = randomUUID();
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
      values ($1,'ZZ_PD_DEMO','zz.pd.demo@example.test','expert',true,'approved','{"human_design":true,"clients":true}','premium','premium',$2,true)`, [demoId, TA]);
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-pd-demo-token')`, [demoId]);
    const DEMO: Auth = { id: demoId, token: "zz-pd-demo-token" };

    const routes = {
      world: await import("../../app/api/location/search/route"),
      hdLoc: await import("../../app/api/hd/location/search/route"),
      journey: await import("../../app/api/hd/clients/journey/route"),
      clients: await import("../../app/api/hd/clients/route"),
      charts: await import("../../app/api/hd/charts/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      reports: await import("../../app/api/hd/reports/route"),
      professional: await import("../../app/api/hd/reports/professional/route"),
      download: await import("../../app/api/hd/reports/professional/download/route"),
    };
    const call = callRoute;
    const world = async (q: string) => ((await call(routes.world.GET, "GET", {}, undefined, `?q=${encodeURIComponent(q)}&limit=6`)).json.results as Json[]) ?? [];
    const top = async (q: string) => (await world(q))[0] as Json | undefined;
    const { TR_EXONYMS } = await import("../../lib/location/server/trExonyms");
    const { activeTrExonyms } = await import("../../lib/location/server/search");

    // ═══════════════════════ A) YURT DIŞI KONUM ARAMASI ═══════════════════════
    section("A1. Türkçe yabancı şehir adları (yerel GeoNames araması; Roxy YOK)");
    const before = roxy.locationQueries.length + roxy.bodygraph;
    const expectTop: Array<[string, string, string, string]> = [
      ["Londra", "gn-2643743", "GB", "Europe/London"], ["London", "gn-2643743", "GB", "Europe/London"],
      ["Münih", "gn-2867714", "DE", "Europe/Berlin"], ["Munich", "gn-2867714", "DE", "Europe/Berlin"],
      ["Viyana", "gn-2761369", "AT", "Europe/Vienna"], ["Vienna", "gn-2761369", "AT", "Europe/Vienna"],
      ["Floransa", "gn-3176959", "IT", "Europe/Rome"], ["Florence", "gn-3176959", "IT", "Europe/Rome"],
      ["Roma", "gn-3169070", "IT", "Europe/Rome"], ["Atina", "gn-264371", "GR", "Europe/Athens"],
      ["Brüksel", "gn-2800866", "BE", "Europe/Brussels"], ["Zürih", "gn-2657896", "CH", "Europe/Zurich"],
      ["Berlin", "gn-2950159", "DE", "Europe/Berlin"], ["Londrina", "gn-3458449", "BR", "America/Sao_Paulo"],
    ];
    for (const [q, id, cc, tz] of expectTop) {
      const t = await top(q);
      ok(!!t && t.id === id && t.countryCode === cc && t.tz === tz, `A1 "${q}" → ilk sonuç ${id} (${cc}, ${tz})`, t);
    }
    const londr = await world("londr");
    ok(londr[0]?.id === "gn-2643743" && londr.some((r) => r.id === "gn-3458449"), "A1b \"londr\" → önce Londra (GB); Londrina listede ama ilk değil", londr.map((r) => r.id));
    const londrina = await world("londrina");
    ok(londrina.every((r) => r.countryCode === "BR") && londrina[0]?.id === "gn-3458449", "A1c \"londrina\" → yalnız Londrina (BR); Londra'ya kaymaz", londrina.map((r) => r.id));

    section("A2. Türkçe karakterler / büyük-küçük harf");
    for (const q of ["MÜNİH", "münih", "Munih", "ZÜRİH", "zurih", "brüksel", "BRUKSEL", "Köln", "koln"]) {
      const t = await top(q);
      ok(!!t && ["gn-2867714", "gn-2657896", "gn-2800866", "gn-2886242"].includes(String(t.id)), `A2 "${q}" doğru şehir`, t?.id);
    }

    section("A3. Aynı adlı farklı ülke şehirleri — isim benzerliğinden yanlış ülke seçilmez");
    const lon = await world("london");
    ok(lon[0]?.countryCode === "GB" && lon.some((r) => r.countryCode === "CA"), "A3a London: GB önce, London/CA ayrı sonuç olarak görünür (otomatik seçilmez)", lon.map((r) => `${r.id}/${r.countryCode}`));
    const flo = await world("Floransa");
    ok(flo[0]?.countryCode === "IT" && !flo.slice(0, 1).some((r) => r.countryCode === "US"), "A3b Floransa → Florence/IT (Florence/US değil)");
    const ath = await world("atina");
    ok(ath[0]?.countryCode === "GR", "A3c Atina → Athens/GR (Athens/US ya da 'Latina' değil)", ath.map((r) => r.name));
    ok((await world("roma"))[0]?.countryCode === "IT", "A3d Roma → Rome/IT");
    ok(lon.every((r) => r.countryCode !== "TR") && (await world("ankara")).every((r) => r.countryCode !== "TR") && (await world("konya")).every((r) => r.countryCode !== "TR"), "A3e global arama asla TR döndürmez (TR ilçe dizini ayrı ve DOKUNULMADI)");

    section("A4. Takma ad tablosu bütünlüğü");
    const active = [...activeTrExonyms().values()].flat().length;
    ok(active === TR_EXONYMS.length && TR_EXONYMS.length >= 80, `A4a ${TR_EXONYMS.length} Türkçe ad; hepsi kimlik + ülke + ad doğrulamasından geçti (${active})`);
    const { searchGlobalLocations } = await import("../../lib/location/server/search");
    let selfOk = 0;
    for (const [tr, id] of TR_EXONYMS) if (searchGlobalLocations(tr, { limit: 1 })[0]?.id === id) selfOk++;
    ok(selfOk === TR_EXONYMS.length, `A4b her Türkçe ad kendi şehrini İLK sonuç getirir (${selfOk}/${TR_EXONYMS.length})`);
    ok(roxy.locationQueries.length + roxy.bodygraph === before, "A4c yerel aramada Roxy (konum/hesap) çağrısı 0");

    section("A5. Açık 'İlçe / şehir ara' (Roxy konum araması) — Türkçe ad kanonik ada çevrilir");
    const hd = (q: string, a: Auth = U.A) => call(routes.hdLoc.GET, "GET", a, undefined, `?q=${encodeURIComponent(q)}`);
    const l1 = await hd("Londra");
    ok(l1.status === 200 && roxy.locationQueries.at(-1) === "London" && (l1.json.results as Json[])[0]?.label === "London, England, United Kingdom", "A5a \"Londra\" → sağlayıcıya \"London\" gider; ilk sonuç London, İngiltere (Londrina değil)", { q: roxy.locationQueries, r: l1.json });
    const callsAfterLondra = roxy.locationQueries.length;
    const l2 = await hd("London");
    ok(l2.status === 200 && l2.json.cached === true && roxy.locationQueries.length === callsAfterLondra, "A5b \"London\" aynı önbellek kaydını kullanır (ek Roxy konum çağrısı yok)");
    const l3 = await hd("Münih");
    ok(l3.status === 200 && roxy.locationQueries.at(-1) === "Munich", "A5c \"Münih\" → \"Munich\"");
    const l4 = await hd("londr");
    ok(l4.status === 200 && roxy.locationQueries.at(-1) === "londr", "A5d tam Türkçe ad değilse sorgu AYNEN gönderilir (tahmin yok)");
    const cey = await hd("Cey");
    ok(cey.status === 200 && (cey.json.results as Json[]).length === 0, "A5e TR etiketli ama Europe/Istanbul olmayan sonuç REDDEDİLİR (saat dilimi koruması)", cey.json);
    ok((await hd("Londra", U.B)).status === 200 && (await hd("Londra", {})).status === 401 && (await hd("Londra", DEMO)).status === 403, "A5f yetki: başka tenant kendi araması, kimliksiz 401, demo 403");
    ok(roxy.bodygraph === 0, "A5g konum araması HD hesaplaması BAŞLATMAZ (bodygraph 0)");

    section("A6. Londra ile kayıt + hesap + eski kaydın yeniden açılması (Roxy tasarrufu)");
    const mkJourney = async (ad: string, soyad: string, dogum: string, ref: string, auth: Auth = U.A) => {
      const r = await call(routes.journey.POST, "POST", auth, { action: "create_new", ad, soyad, dogum, birth_time: "10:30", birth_location_ref: ref, request_id: randomUUID() });
      return { hd: String(r.json.hd_client_id), journey: String(r.json.journey_client_id), status: r.status, json: r.json };
    };
    const lond = await mkJourney("Ada", "Londralı", "1990-05-05", "gn-2643743");
    const prof = (await su.query(`select birth_location_id, birth_timezone, birth_latitude, birth_longitude from public.human_design_clients where id=$1`, [lond.hd])).rows[0];
    ok(lond.status === 200 && prof?.birth_location_id === "gn-2643743" && prof.birth_timezone === "Europe/London" && Math.abs(prof.birth_latitude - 51.5) < 0.1, "A6a Londra seçimi: kimlik gn-2643743, saat dilimi Europe/London, koordinat dataset'ten", { j: lond.json, prof });
    const comp = (auth: Auth, clientId: string) => call(routes.roxy.POST, "POST", auth, { client_id: clientId, location_id: "client" });
    const c1 = await comp(U.A, lond.hd);
    ok(c1.status === 200 && c1.json.reused === false && roxy.bodygraph === 1, "A6b ilk hesap (Roxy 1)", c1.json);
    const c2 = await comp(U.A, lond.hd);
    ok(c2.json.reused === true && c2.json.id === c1.json.id && roxy.bodygraph === 1, "A6c aynı analiz yeniden açıldı (Roxy 0)", c2.json);
    const hashBefore = (await su.query(`select input_hash from public.human_design_charts where id=$1`, [c1.json.id])).rows[0].input_hash;
    ok(typeof hashBefore === "string" && hashBefore.length > 20, "A6d input_hash algoritması değişmedi (kayıtlı analiz eşleşmesi korunuyor)");
    const legacy = await call(routes.charts.GET, "GET", U.A, undefined, "?scope=manual");
    ok(legacy.status === 200 && JSON.stringify(legacy.json).includes("0a0a0a0a-0000-4000-8000-0000000000d1"), "A6e eski manuel kayıt açılıyor");

    // ═══════════════════════ B) PROFİL SİLME ═══════════════════════
    section("B0. Tohum: silinecek profil + korunacak komşular");
    const P = await mkJourney("Elif", "Şahin", "2018-07-20", "trd-42-selcuklu");
    const cP1 = await comp(U.A, P.hd);
    await su.query(`update public.human_design_clients set birth_time='07:15' where id=$1`, [P.hd]);
    const cP2 = await comp(U.A, P.hd);
    const wP = await call(routes.professional.POST, "POST", U.A, { chartId: String(cP1.json.id), requestId: randomUUID(), commentary: "both", bodygraphPng: BODYGRAPH });
    const repP = String(wP.json.id);
    const snapP = (await su.query(`select snapshot->'chartImage'->>'storagePath' p from public.human_design_reports where id=$1`, [repP])).rows[0]?.p as string;
    // Eski manuel analiz + eski (legacy) rapor + analizine bağlı sahipsiz rapor.
    const manualP = (await su.query(`insert into public.human_design_charts(tenant_id, client_id, client_name, source, type_code) values ($1,$2,'Elif Şahin','manual','generator') returning id`, [TA, P.hd])).rows[0].id;
    const legacyRepP = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, chart_id, title, report_kind) values ($1,$2,$3,'ZZ P eski','legacy') returning id`, [TA, P.hd, manualP])).rows[0].id;
    const orphanRepP = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, chart_id, title, report_kind) values ($1,null,$2,'ZZ P sahipsiz','legacy') returning id`, [TA, String(cP2.json.id)])).rows[0].id;
    await su.query(`insert into storage.objects(bucket_id, name) values ($1,$2)`, [HD_BUCKET, `${TA}/${P.hd}/x.png`]).catch(() => undefined);
    objects().set(`${TA}/${P.hd}/x.png`, { bytes: Buffer.from("img"), contentType: "image/png", createdAt: Date.now() });
    // Aynı isimli BAŞKA danışan (farklı merkezî danışan) + analizi + Word'ü.
    const Q = await mkJourney("Elif", "Şahin", "1985-03-03", "trd-42-selcuklu");
    const cQ = await comp(U.A, Q.hd);
    const wQ = await call(routes.professional.POST, "POST", U.A, { chartId: String(cQ.json.id), requestId: randomUUID(), commentary: "expert", bodygraphPng: BODYGRAPH });
    const snapQ = (await su.query(`select snapshot->'chartImage'->>'storagePath' p from public.human_design_reports where id=$1`, [String(wQ.json.id)])).rows[0]?.p as string;
    // Bağımsız analiz + ilişkisiz rapor + başka tenant.
    const freeChart = (await su.query(`insert into public.human_design_charts(tenant_id, client_id, client_name, source) values ($1,null,'Elif Şahin','manual') returning id`, [TA])).rows[0].id;
    const freeRep = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, chart_id, title) values ($1,null,null,'ZZ ilişkisiz') returning id`, [TA])).rows[0].id;
    const Bp = await mkJourney("Elif", "Şahin", "2018-07-20", "trd-42-selcuklu", U.B);
    const cB = await comp(U.B, Bp.hd);
    // Merkezî danışanın başka modül verisi (DY notu).
    await su.query(`insert into public.client_notes(tenant_id, client_id, content) values ($1,$2,'ZZ DY notu')`, [TA, P.journey]).catch(async () => {
      await su.query(`insert into public.client_notes(tenant_id, client_id) values ($1,$2)`, [TA, P.journey]);
    });
    const notesP = await count(`select count(*) n from public.client_notes where client_id=$1`, [P.journey]);
    const legacySnap = JSON.stringify((await su.query(`select * from public.human_design_reports where id in ('0a0a0a0a-0000-4000-8000-0000000000e1') order by id`)).rows);
    ok(P.status === 200 && Q.status === 200 && cP1.json.ok === true && cP2.json.ok === true && wP.json.ok === true && wQ.json.ok === true && cB.json.ok === true && !!snapP && objects().has(snapP),
      "B0 tohum hazır (P: 2 otomatik + 1 manuel analiz, 3 rapor; Q aynı isim; bağımsız; tenant B)", { P: P.json, wP: wP.json });

    section("B1. Önizleme (kesin kapsam) ve yetki");
    const prev = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${P.hd}&delete_preview=1`);
    ok(prev.status === 200 && prev.json.analyses === 3 && prev.json.reports === 3 && prev.json.journeyLinked === true, "B1a önizleme: 3 analiz + 3 Word/rapor (yalnız P kimliğiyle)", prev.json);
    ok((await call(routes.clients.GET, "GET", U.B, undefined, `?id=${P.hd}&delete_preview=1`)).status === 404, "B1b başka tenant önizleyemez (404)");
    const del = (auth: Auth, id: string, a?: number, r?: number) =>
      call(routes.clients.DELETE, "DELETE", auth, undefined, `?id=${id}${a !== undefined ? `&expect_analyses=${a}&expect_reports=${r}` : ""}`);
    const snapshotAll = async () => JSON.stringify([
      (await su.query(`select id from public.human_design_clients order by id`)).rows,
      (await su.query(`select id from public.human_design_charts order by id`)).rows,
      (await su.query(`select id from public.human_design_reports order by id`)).rows,
    ]);
    const s0 = await snapshotAll();
    ok((await del({}, P.hd, 3, 3)).status === 401, "B1c kimliksiz silme 401");
    ok((await del(U.NOHD, P.hd, 3, 3)).status === 403, "B1d HD modül yetkisi olmayan silemez (403)");
    ok((await del(DEMO, P.hd, 3, 3)).status === 403, "B1e demo hesap silemez (403)");
    ok((await del(U.B, P.hd, 3, 3)).status === 404, "B1f başka tenant silemez (404)");
    ok((await snapshotAll()) === s0, "B1g reddedilen isteklerde hiçbir kayıt değişmedi (iptal/yetkisiz = sıfır silme)");

    section("B2. Onaydan sonra kapsam değişirse hiçbir şey silinmez");
    const stale = await del(U.A, P.hd, 2, 3);
    ok(stale.status === 409 && stale.json.code === "DELETE_SCOPE_CHANGED" && (await snapshotAll()) === s0, "B2 gösterilenden fazla kayıt → 409, sıfır silme", stale.json);

    section("B3. Profil silme");
    const done = await del(U.A, P.hd, 3, 3);
    ok(done.status === 200 && done.json.deletedAnalyses === 3 && done.json.deletedReports === 3, "B3a başarılı: 3 analiz + 3 rapor silindi", done.json);
    ok((await count(`select count(*) n from public.human_design_clients where id=$1`, [P.hd])) === 0, "B3b HD profili silindi");
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1 or id = any($2::uuid[])`, [P.hd, [String(cP1.json.id), String(cP2.json.id), manualP]])) === 0, "B3c profilin TÜM analizleri (otomatik + eski manuel) silindi");
    ok((await count(`select count(*) n from public.human_design_reports where id = any($1::uuid[])`, [[repP, legacyRepP, orphanRepP]])) === 0, "B3d Word v2 + eski rapor + analize bağlı sahipsiz rapor silindi");
    ok(!objects().has(snapP) && !objects().has(`${TA}/${P.hd}/x.png`), "B3e storage: Word BodyGraph kopyası + profil klasörü silindi");
    ok((await count(`select count(*) n from public.clients where id=$1`, [P.journey])) === 1 && (await count(`select count(*) n from public.client_notes where client_id=$1`, [P.journey])) === notesP, "B3f Danışan Yolculuğu merkezî danışanı ve diğer modül verisi (not) KORUNDU");
    const dy = await call(routes.journey.GET, "GET", U.A, undefined, `?journey_client_id=${P.journey}`);
    ok(dy.status === 200 && !dy.json.profile && !((dy.json.analyses as Json[]) ?? []).length, "B3g DY özeti: HD bağlantısı ve analizleri kalktı", dy.json);
    ok((await count(`select count(*) n from public.human_design_clients where id=$1`, [Q.hd])) === 1 && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [Q.hd])) === 1
      && (await count(`select count(*) n from public.human_design_reports where id=$1`, [String(wQ.json.id)])) === 1 && objects().has(snapQ), "B3h AYNI İSİMLİ başka danışan + analizi + Word'ü + görseli KORUNDU");
    const dlQ = await call(routes.download.POST, "POST", U.A, { reportId: String(wQ.json.id) });
    ok(dlQ.status === 200 && !!dlQ.buf && dlQ.buf.length > 5000, "B3i korunan danışanın Word'ü hâlâ iniyor");
    ok((await count(`select count(*) n from public.human_design_charts where id=$1`, [freeChart])) === 1 && (await count(`select count(*) n from public.human_design_reports where id=$1`, [freeRep])) === 1, "B3j bağımsız analiz + ilişkisiz rapor KORUNDU");
    ok((await count(`select count(*) n from public.human_design_charts where id=$1`, [String(cB.json.id)])) === 1 && (await count(`select count(*) n from public.human_design_clients where id=$1`, [Bp.hd])) === 1, "B3k başka tenant verisi KORUNDU");
    ok(JSON.stringify((await su.query(`select * from public.human_design_reports where id in ('0a0a0a0a-0000-4000-8000-0000000000e1') order by id`)).rows) === legacySnap && (await count(`select count(*) n from public.human_design_clients where id='0a0a0a0a-0000-4000-8000-0000000000c1'`)) === 1, "B3l eski manuel profil + eski rapor (başka profil) birebir korundu");
    const listAfter = await call(routes.charts.GET, "GET", U.A);
    ok(!((listAfter.json.data as Json[]) ?? []).some((r) => r.client_id === P.hd), "B3m Kayıtlı analiz listesi (sunucu) silinen profilin analizini döndürmez");
    const repsAfter = await call(routes.reports.GET, "GET", U.A, undefined, "?brief=1");
    ok(!((repsAfter.json.rows as Json[]) ?? []).some((r) => r.id === repP), "B3n Kayıtlı Raporlar silinen Word'ü döndürmez");
    ok((await del(U.A, P.hd, 0, 0)).status === 404, "B3o tekrarlanan istek (zaten silinmiş) 404 — başka hiçbir şey silinmez");

    section("B4. Çift tıklama / eşzamanlı istek");
    const R = await mkJourney("Çift", "Tık", "1991-01-01", "trd-42-selcuklu");
    const cR = await comp(U.A, R.hd);
    const prevR = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${R.hd}&delete_preview=1`);
    const keepBefore = await count(`select count(*) n from public.human_design_charts where client_id is distinct from $1`, [R.hd]);
    const conc = await Promise.all([1, 2].map(() => del(U.A, R.hd, Number(prevR.json.analyses), Number(prevR.json.reports))));
    ok(conc.filter((x) => x.status === 200).length >= 1 && conc.every((x) => x.status === 200 || x.status === 404) && (await count(`select count(*) n from public.human_design_clients where id=$1`, [R.hd])) === 0
      && (await count(`select count(*) n from public.human_design_charts where id=$1`, [String(cR.json.id)])) === 0, "B4a iki eşzamanlı silme → tek sonuç; hata/yarım kayıt yok", conc.map((x) => [x.status, x.json]));
    ok((await count(`select count(*) n from public.human_design_charts where client_id is distinct from $1`, [R.hd])) === keepBefore, "B4b başka analiz etkilenmedi");

    section("B5. Yarıda kalan silme (DB hatası) → profil korunur, tekrar 'Sil' tamamlar");
    const F = await mkJourney("ZZ Silme", "Hatası", "1992-02-02", "trd-42-selcuklu");
    const cF = await comp(U.A, F.hd);
    const wF = await call(routes.professional.POST, "POST", U.A, { chartId: String(cF.json.id), requestId: randomUUID(), commentary: "expert", bodygraphPng: BODYGRAPH });
    await su.query(`create function public.zz_fail_chart_delete() returns trigger language plpgsql as $$ begin
      if old.client_name = 'ZZ Silme Hatası' then raise exception 'zz simulated delete failure'; end if; return old; end $$;
      create trigger zz_fail_chart_delete before delete on public.human_design_charts for each row execute function public.zz_fail_chart_delete();`);
    const f1 = await del(U.A, F.hd, 1, 1);
    ok(f1.status === 500 && f1.json.code === "DELETE_INCOMPLETE" && !/zz simulated|exception/i.test(String(f1.json.error)), "B5a yarıda kalan silme başarı DÖNMEZ; anlaşılır hata (ham DB hatası yok)", f1.json);
    ok((await count(`select count(*) n from public.human_design_clients where id=$1`, [F.hd])) === 1 && (await count(`select count(*) n from public.human_design_charts where id=$1`, [String(cF.json.id)])) === 1, "B5b profil + analiz yerinde (yetim kayıt yok)");
    await su.query(`drop trigger zz_fail_chart_delete on public.human_design_charts; drop function public.zz_fail_chart_delete();`);
    const prevF = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${F.hd}&delete_preview=1`);
    const f2 = await del(U.A, F.hd, Number(prevF.json.analyses), Number(prevF.json.reports));
    ok(f2.status === 200 && (await count(`select count(*) n from public.human_design_clients where id=$1`, [F.hd])) === 0 && (await count(`select count(*) n from public.human_design_reports where id=$1`, [String(wF.json.id)])) === 0, "B5c tekrar 'Sil' kalanları tamamladı", { prevF: prevF.json, f2: f2.json });

    section("B6. Storage hatası → DB silme tamam, uyarı döner (yanlış başarı mesajı yok)");
    const S = await mkJourney("Depo", "Hata", "1993-03-03", "trd-42-selcuklu");
    const cS = await comp(U.A, S.hd);
    await call(routes.professional.POST, "POST", U.A, { chartId: String(cS.json.id), requestId: randomUUID(), commentary: "expert", bodygraphPng: BODYGRAPH });
    const prevS = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${S.hd}&delete_preview=1`);
    env.storage.failRemove = true;
    const sDel = await del(U.A, S.hd, Number(prevS.json.analyses), Number(prevS.json.reports));
    env.storage.failRemove = false;
    ok(sDel.status === 200 && (sDel.json.warnings as string[]).includes("storage_cleanup_failed"), "B6 storage temizliği başarısız → uyarı (UI 'bazı görseller temizlenemedi' der)", sDel.json);

    section("B7. Arada yeni analiz (onaydan sonra) → 409");
    const W = await mkJourney("Yarış", "Durumu", "1994-04-04", "trd-42-selcuklu");
    await comp(U.A, W.hd);
    const prevW = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${W.hd}&delete_preview=1`);
    await su.query(`update public.human_design_clients set birth_time='22:22' where id=$1`, [W.hd]);
    await comp(U.A, W.hd);
    const wDel = await del(U.A, W.hd, Number(prevW.json.analyses), Number(prevW.json.reports));
    ok(wDel.status === 409 && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [W.hd])) === 2, "B7 kullanıcının görmediği yeni analiz silinmez (409, sıfır silme)", wDel.json);


    section("B8. Storage hatası sonrası yetim görsellerin güvenli yeniden temizliği");
    const cleanup = await import("../../app/api/hd/clients/storage-cleanup/route");
    const put = (p: string, ageMs: number) => objects().set(p, { bytes: Buffer.from("img"), contentType: "image/png", createdAt: Date.now() - ageMs });
    const HOUR = 60 * 60 * 1000;
    const O = await mkJourney("Yetim", "Görsel", "1995-05-05", "trd-42-selcuklu");
    const cO = await comp(U.A, O.hd);
    const wO = await call(routes.professional.POST, "POST", U.A, { chartId: String(cO.json.id), requestId: randomUUID(), commentary: "expert", bodygraphPng: BODYGRAPH });
    const snapO = (await su.query(`select snapshot->'chartImage'->>'storagePath' p from public.human_design_reports where id=$1`, [String(wO.json.id)])).rows[0]?.p as string;
    // Profil klasörü: kendi görseli + BAŞKA kayıtların da kullandığı (ortak/eski) iki görsel.
    put(`${TA}/${O.hd}/own.png`, 2 * HOUR);
    put(`${TA}/${O.hd}/shared-report.png`, 2 * HOUR);
    put(`${TA}/${O.hd}/shared-chart.png`, 2 * HOUR);
    await su.query(`update public.human_design_clients set chart_image_url=$2 where id=$1`, [O.hd, `${TA}/${O.hd}/own.png`]);
    // Başka profile (Q) ait eski rapor + bağımsız analiz bu klasördeki görselleri kullanıyor.
    const sharedRep = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, title, report_kind, snapshot) values ($1,$2,'ZZ ortak','canonical',$3) returning id`,
      [TA, Q.hd, JSON.stringify({ chartImage: { storagePath: `${TA}/${O.hd}/shared-report.png` } })])).rows[0].id;
    const sharedChart = (await su.query(`insert into public.human_design_charts(tenant_id, client_id, client_name, source, chart_image_url) values ($1,null,'Yetim Görsel','manual',$2) returning id`,
      [TA, `${TA}/${O.hd}/shared-chart.png`])).rows[0].id;
    // Yaşı 15 dk'dan küçük, kaydı henüz olmayan rapor görseli (Word oluşturulurken) — dokunulmamalı.
    const freshSnap = `${TA}/report-snapshots/${randomUUID()}.png`;
    put(freshSnap, 60 * 1000);
    // Silinmeyecek alanlar: eski manuel profil klasörü, geri yükleme geçici klasörü, başka tenant.
    const legacyImg = `${TA}/0a0a0a0a-0000-4000-8000-0000000000c1/legacy.png`;
    put(legacyImg, 30 * 24 * HOUR);
    const restoreTmp = `${TA}/.restore-tmp/${randomUUID()}/0.part`;
    put(restoreTmp, 30 * 24 * HOUR);
    const foreignOrphan = `${TB}/${randomUUID()}/x.png`;
    put(foreignOrphan, 30 * 24 * HOUR);
    const foreignSnap = `${TB}/report-snapshots/${randomUUID()}.png`;
    put(foreignSnap, 30 * 24 * HOUR);
    const keepQ = (await su.query(`select snapshot->'chartImage'->>'storagePath' p from public.human_design_reports where id=$1`, [String(wQ.json.id)])).rows[0]?.p as string;
    ok(!!snapO && objects().has(snapO) && objects().has(keepQ), "B8.0 tohum: profil O (analiz + Word + görseller), ortak görseller, yeni/eski/başka tenant dosyaları");
    // BodyGraph PNG'si az önce yüklendi → yaşlandır (kalan yetim gibi davranacak).
    objects().get(snapO)!.createdAt = Date.now() - 2 * HOUR;

    const prevO = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${O.hd}&delete_preview=1`);
    env.storage.failRemove = true;
    const dO = await del(U.A, O.hd, Number(prevO.json.analyses), Number(prevO.json.reports));
    env.storage.failRemove = false;
    ok(dO.status === 200 && (dO.json.warnings as string[]).includes("storage_cleanup_failed") && (await count(`select count(*) n from public.human_design_clients where id=$1`, [O.hd])) === 0,
      "B8.1 storage hatası: kayıtlar silindi, uyarı döndü", dO.json);
    ok(objects().has(snapO) && objects().has(`${TA}/${O.hd}/own.png`), "B8.2 hata sonrası dosyalar geride kaldı (profil artık yok → aynı Sil çalıştırılamaz)");

    ok((await call(cleanup.POST, "POST", {})).status === 401, "B8.3a kimliksiz yeniden temizleme 401");
    ok((await call(cleanup.POST, "POST", DEMO)).status === 403 && (await call(cleanup.POST, "POST", U.NOHD)).status === 403, "B8.3b demo / HD yetkisiz 403");
    const bBefore = [foreignOrphan, foreignSnap].every((p) => objects().has(p));
    const re1 = await call(cleanup.POST, "POST", U.B);
    ok(re1.status === 200 && objects().has(snapO) && objects().has(`${TA}/${O.hd}/own.png`), "B8.3c başka tenant'ın temizliği A'nın dosyalarına dokunmaz");
    ok(bBefore && !objects().has(foreignOrphan) && !objects().has(foreignSnap), "B8.3d tenant B kendi yetim dosyalarını temizler (yalnız kendi öneki)", re1.json);
    put(foreignOrphan, 30 * 24 * HOUR); // A'nın testinde B dosyası yeniden mevcut olsun
    const re2 = await call(cleanup.POST, "POST", U.A);
    ok(re2.status === 200 && re2.json.ok === true && re2.json.removed === 2 && !JSON.stringify(re2.json).includes(TA), "B8.4 yeniden temizleme: 2 yetim dosya silindi (yanıtta yol yok)", re2.json);
    ok(!objects().has(snapO) && !objects().has(`${TA}/${O.hd}/own.png`), "B8.5 silinen Word'ün BodyGraph kopyası + profil görseli temizlendi");
    ok(objects().has(`${TA}/${O.hd}/shared-report.png`) && objects().has(`${TA}/${O.hd}/shared-chart.png`), "B8.6 başka raporun / bağımsız analizin kullandığı ORTAK görseller korundu");
    ok(objects().has(freshSnap), "B8.7 yeni (15 dk'dan genç) kayıtsız rapor görseli korundu (Word oluşturma yarışı)");
    ok(objects().has(legacyImg) && objects().has(restoreTmp) && objects().has(foreignOrphan) && objects().has(keepQ), "B8.8 eski manuel profil, geri yükleme geçici dosyası, başka tenant, korunan Word korundu");
    ok((await count(`select count(*) n from public.human_design_reports where id=$1`, [sharedRep])) === 1 && (await count(`select count(*) n from public.human_design_charts where id=$1`, [sharedChart])) === 1, "B8.9 temizlik hiçbir DB kaydını silmedi");
    const snapAll = [...objects().keys()].sort().join("|");
    const re3 = await call(cleanup.POST, "POST", U.A);
    ok(re3.status === 200 && re3.json.removed === 0 && [...objects().keys()].sort().join("|") === snapAll, "B8.10 tekrar çalıştırma: 0 silme, hiçbir dosya değişmedi (idempotent)", re3.json);

    section("B9. Sonraki profil silmede otomatik telafi");
    const O2 = await mkJourney("Yetim", "İki", "1996-06-06", "trd-42-selcuklu");
    put(`${TA}/${O2.hd}/a.png`, 2 * HOUR);
    const prevO2 = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${O2.hd}&delete_preview=1`);
    env.storage.failRemove = true;
    await del(U.A, O2.hd, Number(prevO2.json.analyses), Number(prevO2.json.reports));
    env.storage.failRemove = false;
    ok(objects().has(`${TA}/${O2.hd}/a.png`), "B9.1 hata sonrası dosya kaldı");
    const O3 = await mkJourney("Yetim", "Üç", "1997-07-07", "trd-42-selcuklu");
    const prevO3 = await call(routes.clients.GET, "GET", U.A, undefined, `?id=${O3.hd}&delete_preview=1`);
    const dO3 = await del(U.A, O3.hd, Number(prevO3.json.analyses), Number(prevO3.json.reports));
    ok(dO3.status === 200 && !objects().has(`${TA}/${O2.hd}/a.png`) && objects().has(`${TA}/${O.hd}/shared-report.png`) && objects().has(freshSnap) && objects().has(legacyImg),
      "B9.2 sonraki normal silme önceki yetim dosyayı otomatik temizledi; ortak/yeni/eski dosyalar korundu", dO3.json);

    ok(roxy.external.length === 0, "dış ağ: yalnız sahte Roxy; başka servis YOK", roxy.external);
    console.log(`\nRoxy çağrıları (sahte): bodygraph=${roxy.bodygraph}, konum=${roxy.locationQueries.length} [${roxy.locationQueries.join(", ")}]`);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }

  console.log(`\n${passed} PASS / ${failed} FAIL`);
  if (failed) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
