/**
 * HD TRANSİT — GERÇEK TARAYICI + ROUTE testi (Playwright; yerel `next start` + izole Postgres). Roxy ÇAĞRISI YOK.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Ekranlar (13): 1920×1080, 1536×639, 1440×900, 1366×768, 1280×720, 1024×768, 820×1180, 768×1024, 430×932, 390×844,
 *   375×667, 360×800 (Android), 320×568. Ayrıca: dünya geneli saat dilimi (New York tarayıcısı, şehir arama, elle seçim,
 *   iki kez yaşanan / yaşanmamış saat, algılanamayan saat dilimi) ve Human Design ana sayfa transit kartı. Çalıştır: npx tsx scripts/hd-transit/browser-e2e.ts [--out <klasör>]
 * Ortam: HD_TR_PG_PORT (varsayılan 54471), HD_TR_PG_DIR, HD_E2E_ONLY=390,1920 (yalnız seçilen ekranlar).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { mkUser, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import { resolveTransitMoment } from "../../lib/human-design/transit/transitMoment";
import { createClient } from "@supabase/supabase-js";
import { computePersonalTransit } from "../../lib/human-design/transit/personalTransitService";
import { overlaySceneState } from "../../lib/human-design/transit/transitScene";
import { engineChart, PEOPLE, type Moment } from "../hd-relations/fakeRelationRoxy";
import { fakePlanetsResponse, fakeTransitResponse } from "./fakeRoxyTransit";
import { resolveGeneralTransit, __resetTransitResolverCache } from "../../lib/human-design/transit/resolveTransit";
import { PLANET_LABEL_TR } from "../../lib/human-design/bodygraph/planetGlyphs";
import type { PlanetName } from "../../lib/human-design/engine/types";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-transit-browser");
mkdirSync(OUT, { recursive: true });
const PORT = 3998;
const APP = `http://127.0.0.1:${PORT}`;
const TA = "0f0f0f0f-0000-4000-8000-00000000000a";
const CL = ["eeeeeeee-2222-4000-8000-0000000c0001", "eeeeeeee-2222-4000-8000-0000000c0002", "eeeeeeee-2222-4000-8000-0000000c0003"];
const CH = ["eeeeeeee-2222-4000-8000-0000000d0001", "eeeeeeee-2222-4000-8000-0000000d0002", "eeeeeeee-2222-4000-8000-0000000d0003"];
const CL_NAMES = ["Ayşe Yılmaz", "Manuel Kişi", "Mehmet Kaya"];
// Kayıtlı GERÇEK yanıtlar (çevrimdışı): iki aşırı hassas an + bağımsız Swiss Ephemeris referansı. Ücretli çağrı YOK.
const FIX = path.resolve(__dirname, "fixtures");
type SeRow = Record<string, { gate: number; line: number; lineMarginArcsec: number }>;
const readFix = (f: string) => JSON.parse(readFileSync(path.join(FIX, f), "utf8")).results as Record<string, { planets?: unknown } & SeRow>;
const SENSITIVE = (() => {
  const pv = readFix("roxy-planets-validation.json");
  const sw = readFix("roxy-planets-sweep.json");
  const se = { ...readFix("swiss-ephemeris-reference-v2.json"), ...readFix("swiss-ephemeris-reference-sweep.json") } as Record<string, SeRow>;
  return [
    { id: "S08-1b", body: "Moon" as PlanetName, utc: "2100-11-11T01:00:22Z", date: "2100-11-11", time: "04:00", planets: pv["S08-1b"].planets, se: se["S08-1b"] },
    { id: "P463", body: "Venus" as PlanetName, utc: "1947-04-26T00:20:00Z", date: "1947-04-26", time: "03:20", planets: sw["P463"].planets, se: se["P463"] },
  ];
})();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HD_DDL = `
create table public.human_design_clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, name text not null,
  birth_date date, birth_time text, birth_place text, chart_image_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.human_design_charts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null, client_name text,
  birth_date date, birth_time text, birth_place text, source text default 'manual', input jsonb, computed_result jsonb,
  provider text, provider_raw jsonb, input_hash text, timezone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role;
`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
// Owner 2026-10-20 ekran listesi (13) — masaüstü / tablet / telefon; 360×800 Android UA (mobil WebView düzeni).
const DEVICES = [
  { name: "1920x1080", w: 1920, h: 1080 },
  { name: "1536x639", w: 1536, h: 639 },
  { name: "1440x900", w: 1440, h: 900 },
  { name: "1366x768", w: 1366, h: 768 },
  { name: "1280x720", w: 1280, h: 720 },
  { name: "1024x768", w: 1024, h: 768, ua: IPAD },
  { name: "820x1180", w: 820, h: 1180, ua: IPAD },
  { name: "768x1024", w: 768, h: 1024, ua: IPAD },
  { name: "430x932", w: 430, h: 932, ua: IPHONE },
  { name: "390x844", w: 390, h: 844, ua: IPHONE },
  { name: "375x667", w: 375, h: 667, ua: IPHONE },
  { name: "360x800", w: 360, h: 800, ua: ANDROID },
  { name: "320x568", w: 320, h: 568, ua: IPHONE },
];

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`sunucu açılmadı: ${url}`);
}

async function main() {
  const realFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/127\.0\.0\.1|localhost/.test(u)) return realFetch(input, init);
    externalCalls++;
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;
  delete process.env.ROXY_API_KEY;

  const env: TestEnv = await startAnamnezTestEnv({ port: Number(process.env.HD_TR_PG_PORT ?? 54471), dirName: process.env.HD_TR_PG_DIR ?? "hd-transit-browser-pgdata", httpPort: 54523, extraSql: [`insert into public.tenants(id, name) values ('${TA}', 'ZZ_TRANSIT')`, HD_DDL] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    // Kişisel transit tohumu: 2 geçerli otomatik analiz (0, 2) + 1 manuel (1, seçilemez)
    for (let i = 0; i < 3; i++) {
      const m = PEOPLE[i];
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [CL[i], TA, CL_NAMES[i], m.date, m.time.slice(0, 5)]);
      await su.query(
        `insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [CH[i], TA, CL[i], "x", i !== 1 ? "computed" : "manual", i !== 1 ? "roxyapi" : null, JSON.stringify({ date: m.date, time: m.time, timezone: m.timezone, latitude: m.latitude, longitude: m.longitude, nodeType: "true", lang: "tr" }), `ih-${i}`, JSON.stringify(engineChart(m))],
      );
    }
    const PA = { human_design: true };
    const UA: Auth = await mkUser(su, "TRBR", TA, PA);
    const NOHD: Auth = await mkUser(su, "TRNO", TA, { human_design: false });
    const userJson: Json = { id: UA.id, tenant_id: TA, full_name: "ZZ_TRBR", email: "zz.trbr@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: PA };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);

    // ── Route ────────────────────────────────────────────────────────────────
    section("route /api/hd/transit");
    const H = (a: Auth) => ({ "x-user-id": a.id!, "x-session-token": a.token! });
    const api = async (q: string, h: Record<string, string> = H(UA)) => {
      const r = await realFetch(`${APP}/api/hd/transit${q}`, { headers: h });
      return { status: r.status, j: (await r.json().catch(() => ({}))) as Json, cache: r.headers.get("cache-control") ?? "" };
    };
    const countRows = async () => {
      const tables = (await su.query(`select tablename from pg_tables where schemaname='public' and tablename not like '%rate%' order by tablename`)).rows.map((r) => r.tablename as string);
      const out: string[] = [];
      for (const t of tables) out.push(`${t}:${(await su.query(`select count(*)::int n from public."${t}"`)).rows[0].n}`);
      return out.join(",");
    };
    const before = await countRows();
    ok((await api("", {})).status === 401, "oturumsuz istek 401");
    ok((await api("", H(NOHD))).status === 403, "Human Design izni olmayan kullanıcı 403");
    const nowR = await api("");
    ok(nowR.status === 200 && !!(nowR.j.transit as Json).activations && ((nowR.j.transit as Json).activations as unknown[]).length === 13 && nowR.cache.includes("no-store"), "parametresiz → şimdi (Türkiye saati), 13 aktivasyon, no-store");
    const cases: Array<[string, string]> = [["1988-03-21", "06:45"], ["2026-10-19", "09:00"], ["2026-10-20", "00:00"], ["2031-02-14", "23:30"]];
    for (const [d, t] of cases) {
      const r = await api(`?date=${d}&time=${t}`);
      const m = resolveTransitMoment(d, t);
      const exp = m.ok ? computeGeneralTransit(new Date(m.moment.utcIso)) : null;
      const got = r.j.transit as Json | undefined;
      ok(r.status === 200 && !!exp && JSON.stringify(got) === JSON.stringify(exp) && (r.j.moment as Json).localDate === d && (r.j.moment as Json).localTime === t, `${d} ${t}: route = saf motor (birebir), UTC ${m.ok ? m.moment.utcIso : "?"}`);
    }
    const again = await api("?date=2026-10-19&time=09:00");
    const again2 = await api("?date=2026-10-19&time=09:00");
    ok(JSON.stringify(again.j) === JSON.stringify(again2.j), "aynı istek → birebir aynı yanıt (deterministik)");
    ok((await api("?date=2011-03-28&time=03:30")).j.code === "LOCAL_TIME_GAP" && (await api("?date=2026-02-30&time=10:00")).status === 400 && (await api("?date=2026-10-19&time=9")).status === 400, "yaz saati boşluğu / geçersiz tarih / geçersiz saat → 400");
    // Dünya geneli saat dilimi (route)
    const trR = await api("?date=2026-10-21&time=09:00");
    const lnR = await api("?date=2026-10-21&time=07:00&tz=Europe%2FLondon");
    const tkR = await api("?date=2026-10-21&time=15:00&tz=Asia%2FTokyo");
    const nyR = await api("?date=2026-10-21&time=02:00&tz=America%2FNew_York");
    ok([trR, lnR, tkR, nyR].every((r) => r.status === 200 && (r.j.moment as Json).utcIso === "2026-10-21T06:00:00.000Z") && [lnR, tkR, nyR].every((r) => JSON.stringify(r.j.transit) === JSON.stringify(trR.j.transit)) && (lnR.j.moment as Json).timeZone === "Europe/London" && (trR.j.moment as Json).timeZone === "Europe/Istanbul",
      "aynı UTC anı Türkiye 09:00 / Londra 07:00 / Tokyo 15:00 / New York 02:00 → birebir aynı transit; yanıt kendi saat dilimini taşır");
    const badTz = await Promise.all(["Mars%2FOlympus", "Europe%2FIstanbul%3BDROP", "..%2F..%2Fetc", "%3Cscript%3E", "x".repeat(70)].map((z) => api(`?date=2026-10-21&time=09:00&tz=${z}`)));
    ok(badTz.every((r) => r.status === 400 && r.j.code === "INVALID_TIMEZONE"), "geçersiz / zararlı saat dilimi → 400 INVALID_TIMEZONE");
    const ambR = await api("?date=2026-10-25&time=01:30&tz=Europe%2FLondon");
    const pickR = await api("?date=2026-10-25&time=01:30&tz=Europe%2FLondon&offset=3600");
    const badOff = await Promise.all(["7200", "abc", "1.5", "99999999"].map((o) => api(`?date=2026-10-25&time=01:30&tz=Europe%2FLondon&offset=${o}`)));
    ok(ambR.status === 400 && ambR.j.code === "LOCAL_TIME_AMBIGUOUS" && JSON.stringify(ambR.j.offsets) === "[0,3600]" && pickR.status === 200 && (pickR.j.moment as Json).utcIso === "2026-10-25T00:30:00.000Z" && badOff.every((r) => r.status === 400 && r.j.code === "INVALID_OFFSET"),
      "iki kez yaşanan saat → 400 + iki ofset; açık seçimle 200; listede olmayan / bozuk ofset → 400 (körü körüne kabul yok)");
    const nowNy = await api("?tz=America%2FNew_York");
    ok(nowNy.status === 200 && (nowNy.j.moment as Json).timeZone === "America/New_York" && Math.abs(Date.parse((nowNy.j.moment as Json).utcIso as string) - Date.now()) < 3 * 60_000, "şimdi (New York saat dilimi): gerçek güncel an");
    const keys = Object.keys(nowR.j.transit as Json);
    ok(!keys.some((k) => /type|authority|profile|definition|cross/i.test(k)), "yanıtta tip / otorite / profil / tanım / haç YOK", keys);
    const after = await countRows();
    const diff = after.split(",").filter((x) => !before.split(",").includes(x));
    ok(after === before, "transit hesabı veritabanına satır yazmaz (rate-limit tablosu hariç)", { diff, before: before.split(",").filter((x) => diff.some((d) => d.split(":")[0] === x.split(":")[0])) });

    // ── Tarayıcı ─────────────────────────────────────────────────────────────
    const svc = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
    browser = await chromium.launch();
    const only = (process.env.HD_E2E_ONLY ?? "").split(",").filter(Boolean);
    for (const d of DEVICES.filter((x) => !only.length || only.includes(x.name))) {
      section(d.name);
      const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, isMobile: !!d.ua, hasTouch: !!d.ua, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson), UA.token!]);
      const page = await ctx.newPage();
      let roxyDirect = 0;
      page.on("request", (r) => { if (/roxyapi\.com/.test(r.url())) roxyDirect++; });
      page.on("pageerror", (e) => pageErrors.push(`${d.name}: ${e.message}`));
      const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

      await page.goto(`${APP}/human-design/transit`);
      await page.locator("[data-hd-transit-activations]").waitFor({ timeout: 60_000 });
      ok((await page.locator("h1").innerText()).includes("Günün Human Design Transitleri"), `${d.name}: başlık "Günün Human Design Transitleri"`);
      const momentIso = (await page.locator("[data-hd-transit-moment]").getAttribute("data-hd-transit-moment")) ?? "";
      const nowMs = Date.now();
      ok(Math.abs(Date.parse(momentIso) - nowMs) < 3 * 60_000 && (await page.locator("[data-hd-transit-moment]").innerText()).includes("Türkiye saati"), `${d.name}: varsayılan an = şimdi (Türkiye saati), hesaplanan an açıkça yazılı`);
      ok((await page.locator("[data-hd-transit-activation]").count()) === 13, `${d.name}: 13 aktivasyon satırı`);
      ok((await page.locator("input[type=date]").count()) === 1 && (await page.locator("[data-hd-rel-select], [name*=birth], [data-hd-birth]").count()) === 0, `${d.name}: doğum bilgisi alanı YOK (yalnız tarih + saat)`);
      ok((await page.locator("[data-hd-transit-note]").innerText()).includes("doğum haritası değildir"), `${d.name}: "doğum haritası değildir" notu görünür`);
      ok((await page.locator("[data-hd-transit-zone-current]").getAttribute("data-hd-transit-zone-current")) === "Europe/Istanbul" && (await page.locator("[data-hd-transit-zone-source]").getAttribute("data-hd-transit-zone-source")) === "default" && (await page.locator("[data-hd-transit-zone-intro]").innerText()).includes("Türkiye saatine göre transit hesaplaması yapıyorsanız") && (await page.locator("[data-hd-transit-zone-editor]").count()) === 0 && (await page.locator("[data-hd-transit-zone-reset]").count()) === 0,
        `${d.name}: Türkiye tarayıcısı → Türkiye saati varsayılan, ek seçim gerekmiyor; açıklama metni görünür`);
      ok((await page.locator("[data-hd-transit-utc-preview='general']").getAttribute("data-hd-transit-utc")) !== null, `${d.name}: UTC karşılığı önizlemesi görünür`);

      // Seçilen an: geçmiş tarih → ekran = saf motor
      await page.locator("[data-hd-transit-date]").fill("1999-08-11");
      await page.locator("[data-hd-transit-time]").fill("14:03");
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction(() => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === "1999-08-11T11:03:00.000Z", null, { timeout: 15_000 });
      const exp = computeGeneralTransit(new Date("1999-08-11T11:03:00Z"));
      const rows = await page.locator("[data-hd-transit-activation]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-transit-activation")));
      ok(JSON.stringify(rows) === JSON.stringify(exp.activations.map((a) => `${a.body}:${a.gate}.${a.line}`)), `${d.name}: 11.08.1999 14:03 → 11:03Z; 13 aktivasyon = motor`, rows);
      const chRows = await page.locator("[data-hd-transit-channel]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-transit-channel")));
      const graphDef = (await page.locator("[data-hd-transit-graph='general']").getAttribute("data-hd-transit-defined")) ?? "";
      const graphHalf = (await page.locator("[data-hd-transit-graph='general']").getAttribute("data-hd-transit-half")) ?? "";
      ok(JSON.stringify(chRows) === JSON.stringify(exp.channels.map((c) => c.id)) && graphDef === exp.channels.map((c) => c.id).sort().join(",") && graphHalf === exp.halfChannels.map((c) => c.id).sort().join(","), `${d.name}: kanal listesi + grafik tanımlı/yarım = motor (${exp.channels.length} kanal, ${exp.halfChannels.length} yarım)`);
      const centers = await page.locator("[data-hd-transit-center]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-transit-center")));
      ok(centers.length === 9 && centers.filter((c) => c!.endsWith(":on")).map((c) => c!.split(":")[0]).join() === exp.definedCenters.join(), `${d.name}: 9 merkez; bağlı merkezler = transit kanallarının merkezleri`);
      const svg = await page.evaluate(() => {
        const s = document.querySelector("svg[data-hd-cbg]")!;
        const r = s.getBoundingClientRect();
        return { gates: s.querySelectorAll("[data-hd-cbg-gate]").length, centers: s.querySelectorAll("[data-hd-cbg-center]").length, hits: s.querySelectorAll("[data-hd-cbg-hit]").length, w: r.width, left: r.left, right: r.right, transit: s.querySelectorAll("[data-hd-cbg-gate$=':B']").length };
      });
      ok(svg.gates === 64 && svg.centers === 9 && svg.hits === 36 && svg.transit === exp.activeGates.length, `${d.name}: transit BodyGraph 64 kapı / 9 merkez / 36 kanal hedefi; turuncu kapı = aktif kapı (${svg.transit})`, svg);
      ok(svg.left >= -1 && svg.right <= d.w + 1 && !(await overflowX()) && (await page.locator("[data-hd-composite-zoom]").count()) === 0, `${d.name}: grafik ekrana sığar (${Math.round(svg.w)}px), yatay taşma yok, büyüt düğmesi yok`);
      // BodyGraph TEK BAKIŞTA: grafiğe gelindiğinde başı ve sonu aynı ekranda (yükseklik ≤ ekran), oran 602:752 korunur
      await page.evaluate(() => document.querySelector("svg[data-hd-cbg]")!.scrollIntoView({ block: "center" }));
      const fit = await page.evaluate(() => {
        const svgEl = document.querySelector("svg[data-hd-cbg]")!;
        const r = svgEl.getBoundingClientRect();
        const parent = svgEl.parentElement!;
        const cs = getComputedStyle(parent);
        const parentW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return { top: r.top, bottom: r.bottom, h: r.height, w: r.width, vh: window.innerHeight, parentW, rem };
      });
      const ratioOk = Math.abs(fit.w / fit.h - 602 / 752) < 0.01;
      // Beklenen genişlik (tasarım formülü): min(640, max(300, (ekran yüksekliği − 9rem) × 0,8), kapsayıcı genişliği)
      const expectW = Math.min(640, Math.max(300, (fit.vh - 9 * fit.rem) * 0.8), fit.parentW);
      const sizeOk = Math.abs(fit.w - expectW) <= 1;
      ok(fit.h <= fit.vh && fit.top >= -1 && fit.bottom <= fit.vh + 1 && ratioOk && sizeOk, `${d.name}: transit BodyGraph tek ekranda tamamen görünür (${Math.round(fit.w)}×${Math.round(fit.h)} ≤ ekran yüksekliği ${fit.vh}), oran korunur, boyut = formül (${Math.round(expectW)}px; gereksiz büyük / küçük değil)`, { ...fit, expectW });
      await page.locator("svg[data-hd-cbg]").screenshot({ path: path.join(OUT, `${d.name}-transit-bodygraph.png`) });
      // Kanal ayrıntısı: dokunma / fare / klavye
      const target = exp.channels[0]?.id ?? exp.halfChannels[0].id;
      const hit = page.locator(`[data-hd-cbg-hit='${target}']`);
      await hit.focus();
      await page.keyboard.press("Enter");
      ok((await page.locator("[data-hd-transit-info]").getAttribute("data-hd-transit-info")) === target && (await page.locator("[data-hd-transit-info]").innerText()).includes("kapı"), `${d.name}: kanal seçimi → kapı / gezegen ayrıntısı (${target})`);
      // Kesinleştirilemeyen aktivasyon: belirsizlik içeren ilk dakika (yerel motorla bulunur) → rozet + iki aday; kesin olmayan kapı grafikte boyanmaz
      let uMs = Date.parse("2026-10-21T00:00:00Z");
      while (!computeGeneralTransit(new Date(uMs)).hasUncertainty) uMs += 60_000;
      const uExp = computeGeneralTransit(new Date(uMs));
      const uLocal = new Date(uMs + 3 * 3600e3).toISOString();
      await page.locator("[data-hd-transit-date]").fill(uLocal.slice(0, 10));
      await page.locator("[data-hd-transit-time]").fill(uLocal.slice(11, 16));
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction((iso) => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === iso, new Date(uMs).toISOString(), { timeout: 15_000 });
      const uBadges = await page.locator("[data-hd-transit-uncertain]").count();
      const uBodies = await page.locator("[data-hd-transit-uncertain-body]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-transit-uncertain-body")));
      ok(uBadges === uExp.activations.filter((x) => !x.certain).length && uBadges > 0 && (await page.locator("[data-hd-transit-uncertain-note]").isVisible()) && JSON.stringify(uBodies) === JSON.stringify(uExp.activations.filter((x) => !x.certain).map((x) => x.body)), `${d.name}: kesinleştirilemeyen aktivasyon (${new Date(uMs).toISOString()}) → ${uBadges} rozet + iki aday; panelde gezegen adı (${uBodies.join(",")})`);
      ok((await page.locator("svg[data-hd-cbg]").count()) === 0 && (await page.locator("[data-hd-transit-graph]").count()) === 0 && (await page.locator("[data-hd-transit-legend]").count()) === 0 && (await page.locator("[data-hd-transit-uncertainty-panel]").isVisible()), `${d.name}: EKSİK sonuçta BodyGraph ÇİZİLMEZ (kısmi veriden tam harita yok); belirsizlik paneli görünür`);
      // textContent: başlık CSS ile büyük harfe çevrilir (innerText "BODYGRAPH GÖSTERİLMİYOR" döner)
      ok(((await page.locator("[data-hd-transit-uncertainty-panel]").textContent()) ?? "").includes("BodyGraph gösterilmiyor") && (await page.locator("[data-hd-transit-certain-summary]").isVisible()) && (await page.locator("[data-hd-transit-uncertain-summary]").isVisible()), `${d.name}: güvenle hesaplananlar ile kesin olmayanlar AYRI listelenir`);
      ok((await page.locator("[data-hd-transit-complete]").getAttribute("data-hd-transit-complete")) === "0" && (await page.locator("[data-hd-transit-complete]").getAttribute("data-hd-transit-resolution")) === "unresolved" && (await page.locator("[data-hd-transit-complete]").innerText()).includes("EKSİK"), `${d.name}: hassas kaynak yokken sonuç açıkça EKSİK (başarı sayılmaz)`);
      // Aynı an, doğrulanmış Roxy gezegen konumlarıyla çözülmüş GERÇEK çözücü çıktısı (tarayıcı düzeyinde sağlanır) → TAM sonuç
      await page.route("**/api/hd/transit?*", async (route) => {
        const u = new URL(route.request().url());
        const m = resolveTransitMoment(u.searchParams.get("date")!, u.searchParams.get("time")!);
        if (!m.ok) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, code: m.code, error: m.error }) });
        const r = await resolveGeneralTransit(new Date(m.moment.utcIso), { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async (_c, pb) => ({ ok: true, raw: fakePlanetsResponse(`${pb.date}T${pb.time}Z`) }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: "u", tenantId: "t" });
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, moment: m.moment, transit: r.transit, resolution: r.resolution, complete: !r.transit.hasUncertainty }) });
      });
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction(() => document.querySelector("[data-hd-transit-complete]")?.getAttribute("data-hd-transit-resolution") === "roxy-resolved", null, { timeout: 15_000 });
      ok((await page.locator("[data-hd-transit-uncertain]").count()) === 0 && (await page.locator("[data-hd-transit-complete]").getAttribute("data-hd-transit-complete")) === "1" && (await page.locator("[data-hd-transit-activation]").count()) === 13, `${d.name}: doğrulanmış kaynakla çözülen an → TAM sonuç, rozet yok, 13 kesin aktivasyon`);
      ok((await page.locator("svg[data-hd-cbg]").count()) === 1 && (await page.locator("[data-hd-transit-uncertainty-panel]").count()) === 0, `${d.name}: TAM sonuçta premium BodyGraph aynen çizilir, belirsizlik paneli yok`);
      await page.unroute("**/api/hd/transit?*");

      // ── P1-01: kapı düzeyinde belirsizlik → olası kanal + belirsiz merkez (yerel motor; sunucuda hassas kaynak yok → unresolved)
      let pMs = Date.parse("2026-10-21T00:00:00Z");
      for (let i = 0; i < 400_000; i++, pMs += 60_000) {
        const x = computeGeneralTransit(new Date(pMs));
        if (x.possibleChannels.length && x.uncertainCenters.length) break;
      }
      const pExp = computeGeneralTransit(new Date(pMs));
      const pLoc = new Date(pMs + 3 * 3600e3).toISOString();
      await page.locator("[data-hd-transit-date]").fill(pLoc.slice(0, 10));
      await page.locator("[data-hd-transit-time]").fill(pLoc.slice(11, 16));
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction((iso) => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === iso, new Date(pMs).toISOString(), { timeout: 15_000 });
      const pCenters = await page.locator("[data-hd-transit-center]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-hd-transit-center") ?? "", e.textContent ?? ""] as [string, string]));
      const pageTxt = await page.locator("[data-hd-transit-view='general']").innerText();
      ok(pExp.possibleChannels.length > 0 && (await page.locator("[data-hd-transit-possible]").isVisible()) && (await page.locator("[data-hd-transit-uncertain-summary]").innerText()).includes("Olası kanallar") && (await page.locator("[data-hd-transit-uncertainty-panel]").innerText()).includes("kapı da belirsiz"), `${d.name}: olası kanal (${pExp.possibleChannels.map((c) => c.id).join(",")}) "kesin değil" olarak ayrı; kapı belirsizliği açıkça yazılı (${new Date(pMs).toISOString()})`);
      ok(pExp.uncertainCenters.length > 0 && pExp.uncertainCenters.every((c) => pCenters.some(([k, txt]) => k === `${c}:unsure` && txt.includes("kesin değil") && !txt.includes("bağlı değil"))), `${d.name}: belirsiz merkez(ler) (${pExp.uncertainCenters.join(",")}) için "bağlı değil" DENMEZ, "kesin değil" denir`, pCenters);
      ok(!pageTxt.includes("iki kapısında da transit yok") && !pageTxt.includes("beyaz: bağlanmayan") && (await page.locator("svg[data-hd-cbg]").count()) === 0, `${d.name}: belirsiz kanal / merkez için kesin "yok / bağlanmayan" ifadesi YOK; grafik yok`);
      ok(!(await overflowX()), `${d.name}: belirsizlik panelinde yatay taşma yok`);
      await page.screenshot({ path: path.join(OUT, `${d.name}-transit-eksik.png`), fullPage: true });

      // ── İki aşırı hassas an (kayıtlı GERÇEK hassas konum yanıtı; ücretli çağrı YOK) → kesinleştirilmez
      for (const sv of SENSITIVE) {
        __resetTransitResolverCache();
        await page.route("**/api/hd/transit?*", async (route) => {
          const u = new URL(route.request().url());
          const m = resolveTransitMoment(u.searchParams.get("date")!, u.searchParams.get("time")!);
          if (!m.ok) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, code: m.code, error: m.error }) });
          // S08-1b saniyeli bir an (UI dakika seçer): sunum testi için o anın GERÇEK çözücü çıktısı seçilen dakikaya bağlanır
          const r = await resolveGeneralTransit(new Date(sv.utc), { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async () => ({ ok: true, raw: { planets: sv.planets } }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: "u", tenantId: "t" });
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, moment: m.moment, transit: r.transit, resolution: r.resolution, complete: !r.transit.hasUncertainty }) });
        });
        await page.locator("[data-hd-transit-date]").fill(sv.date);
        await page.locator("[data-hd-transit-time]").fill(sv.time);
        await page.locator("[data-hd-transit-submit]").click();
        await page.locator("[data-hd-transit-complete]").waitFor({ timeout: 15_000 });
        const resTag = await page.locator("[data-hd-transit-complete]").getAttribute("data-hd-transit-resolution");
        const rowsS = await page.locator("[data-hd-transit-activation]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-hd-transit-activation") ?? "", e.getAttribute("data-hd-transit-certain") ?? ""] as [string, string]));
        const wrongCertain = rowsS.filter(([a, c]) => {
          if (c !== "1") return false;
          const [b, gl] = a.split(":");
          return gl !== `${sv.se[b].gate}.${sv.se[b].line}`;
        });
        const unc = rowsS.filter(([, c]) => c === "0").map(([a]) => a.split(":")[0]);
        const panel = await page.locator("[data-hd-transit-uncertainty-panel]").innerText();
        const seGl = `${sv.se[sv.body].gate}.${sv.se[sv.body].line}`;
        ok(resTag === "roxy-partial" && (await page.locator("[data-hd-transit-complete]").getAttribute("data-hd-transit-complete")) === "0" && JSON.stringify(unc) === JSON.stringify([sv.body]) && wrongCertain.length === 0 && rowsS.length === 13,
          `${d.name}: ${sv.id} (${sv.utc}) → EKSİK (roxy-partial); yalnız ${sv.body} kesinleştirilmedi; 12 kesin aktivasyon = Swiss Ephemeris (yanlış kesin 0)`, { resTag, unc, wrongCertain });
        ok(panel.includes(PLANET_LABEL_TR[sv.body]) && panel.includes(seGl) && panel.includes("yalnız çizgi belirsiz") && (await page.locator("[data-hd-transit-complete]").innerText()).includes("yeniden denemek sonucu değiştirmez") && (await page.locator("svg[data-hd-cbg]").count()) === 0,
          `${d.name}: ${sv.id} paneli: gezegen adı + Swiss Ephemeris gerçeği adaylarda (${seGl}) + "kapı kesin, yalnız çizgi belirsiz" + yeniden deneme ÖNERİLMEZ; BodyGraph yok`, panel.slice(0, 300));
        await page.unroute("**/api/hd/transit?*");
      }

      // ── P1-02: gecikmeli / ters sıralı / başarısız eski yanıt ekranı DEĞİŞTİREMEZ
      const delays: Record<string, number> = {};
      const failing = new Set<string>();
      let lateDone = 0;
      await page.route("**/api/hd/transit?*", async (route) => {
        const u = new URL(route.request().url());
        const k = `${u.searchParams.get("date")} ${u.searchParams.get("time")}`;
        const wait = delays[k] ?? 0;
        if (wait) await sleep(wait);
        try {
          if (failing.has(k)) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, code: "TRANSIT_FAILED", error: "ESKİ İSTEK HATASI" }) });
          else await route.continue();
        } catch { /* tarayıcı isteği iptal etti (beklenen) */ }
        if (wait) lateDone++;
      });
      const momentAttr = () => page.locator("[data-hd-transit-moment]").getAttribute("data-hd-transit-moment", { timeout: 2_000 }).catch(() => null);
      const utcFor = (dd: string, tt: string) => { const m = resolveTransitMoment(dd, tt); return m.ok ? m.moment.utcIso : "?"; };
      // R1: A sürerken tarih değişir → geç gelen A yanıtı hiçbir şey göstermez
      delays["2030-01-01 10:00"] = 2500;
      await page.locator("[data-hd-transit-date]").fill("2030-01-01");
      await page.locator("[data-hd-transit-time]").fill("10:00");
      await page.locator("[data-hd-transit-submit]").click();
      await sleep(300);
      await page.locator("[data-hd-transit-date]").fill("2030-01-02");
      const enabledAfterChange = await page.locator("[data-hd-transit-submit]").isEnabled();
      await sleep(3200);
      ok(enabledAfterChange && (await page.locator("[data-hd-transit-moment]").count()) === 0 && (await page.locator("[data-hd-transit-activations]").count()) === 0 && (await page.locator("[data-hd-transit-error]").count()) === 0 && (await page.locator("[data-hd-transit-submit]").innerText()).includes("Transitleri Göster"),
        `${d.name}: R1 A tarihi sürerken B tarihi seçildi → geç gelen A yanıtı GÖSTERİLMEZ, yükleniyor durumu bozulmaz`);
      // R2: A (yavaş) sürerken saat değişir, B (hızlı) gönderilir → yanıtlar ters sırada; ekranda yalnız B
      delays["2030-01-03 10:00"] = 2500;
      await page.locator("[data-hd-transit-date]").fill("2030-01-03");
      await page.locator("[data-hd-transit-time]").fill("10:00");
      await page.locator("[data-hd-transit-submit]").click();
      await sleep(300);
      await page.locator("[data-hd-transit-time]").fill("10:05");
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction((iso) => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === iso, utcFor("2030-01-03", "10:05"), { timeout: 15_000 });
      await sleep(3200);
      const bRows = await page.locator("[data-hd-transit-activation]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-transit-activation")));
      const bExp = computeGeneralTransit(new Date(utcFor("2030-01-03", "10:05")));
      ok((await momentAttr()) === utcFor("2030-01-03", "10:05") && JSON.stringify(bRows) === JSON.stringify(bExp.activations.map((a) => `${a.body}:${a.gate}.${a.line}`)),
        `${d.name}: R2 ters sıralı yanıtlar (A geç geldi) → ekranda yalnız B anı ve B aktivasyonları`);
      // R3: başarısız eski istek yeni başarılı sonucu silemez
      delays["2030-01-04 10:00"] = 2500;
      failing.add("2030-01-04 10:00");
      await page.locator("[data-hd-transit-date]").fill("2030-01-04");
      await page.locator("[data-hd-transit-time]").fill("10:00");
      await page.locator("[data-hd-transit-submit]").click();
      await sleep(300);
      await page.locator("[data-hd-transit-time]").fill("10:10");
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction((iso) => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === iso, utcFor("2030-01-04", "10:10"), { timeout: 15_000 });
      await sleep(3200);
      ok((await momentAttr()) === utcFor("2030-01-04", "10:10") && (await page.locator("[data-hd-transit-error]").count()) === 0 && (await page.locator("[data-hd-transit-activation]").count()) === 13,
        `${d.name}: R3 başarısız eski istek (500) yeni başarılı sonucu silmez, hata göstermez`);
      // R4: hata sonrası aynı anı yeniden hesaplama
      failing.delete("2030-01-04 10:00");
      delays["2030-01-04 10:00"] = 0;
      await page.locator("[data-hd-transit-time]").fill("10:00");
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction((iso) => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === iso, utcFor("2030-01-04", "10:00"), { timeout: 15_000 });
      ok(lateDone >= 3, `${d.name}: R4 aynı an yeniden hesaplandı; geciktirilen ${lateDone} eski yanıt sunucudan döndü ama ekranı değiştirmedi`);
      await page.unroute("**/api/hd/transit?*");
      // Girdi değişince önceki sonuç gösterilmez
      await page.locator("[data-hd-transit-time]").fill("12:00");
      ok((await page.locator("[data-hd-transit-moment]").count()) === 0 && (await page.locator("[data-hd-transit-activations]").count()) === 0, `${d.name}: tarih/saat değişince önceki sonuç ekrandan kalkar (yeni seçimle karışmaz)`);
      // Gelecek tarih + gün değişimi
      await page.locator("[data-hd-transit-date]").fill("2031-02-15");
      await page.locator("[data-hd-transit-time]").fill("00:10");
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction(() => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === "2031-02-14T21:10:00.000Z", null, { timeout: 15_000 });
      ok(true, `${d.name}: gelecek tarih 15.02.2031 00:10 (Türkiye) → 14.02.2031 21:10Z (gün değişimi)`);
      // Yaz saati boşluğu → hata; önceki başarılı sonuç yeni sorgu ekranında gösterilmez
      await page.locator("[data-hd-transit-date]").fill("2011-03-28");
      await page.locator("[data-hd-transit-time]").fill("03:30");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-transit-error]").waitFor({ timeout: 15_000 });
      ok((await page.locator("[data-hd-transit-error]").innerText()).includes("yaz saati") && (await page.locator("[data-hd-transit-moment]").count()) === 0 && (await page.locator("[data-hd-transit-activations]").count()) === 0, `${d.name}: başarısız sorgu → açık hata; önceki sonuç GÖSTERİLMEZ`);
      // Şimdi
      await page.locator("[data-hd-transit-now]").click();
      await page.waitForFunction(() => Math.abs(Date.parse(document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") ?? "0") - Date.now()) < 180_000, null, { timeout: 15_000 });
      ok(true, `${d.name}: "Şimdi" düğmesi anı günceller`);
      ok(!(await overflowX()), `${d.name}: sayfada yatay taşma yok`);
      await page.screenshot({ path: path.join(OUT, `${d.name}-transit.png`), fullPage: true });

      // R5: istek sürerken görünüm kapanır (sekme değişimi) → geç yanıt işlenmez, sayfa hatası yok (sonda denetlenir)
      await page.route("**/api/hd/transit?*", async (route) => {
        await sleep(2500);
        try { await route.continue(); } catch { /* iptal edildi (beklenen) */ }
      });
      await page.locator("[data-hd-transit-date]").fill("2030-02-01");
      await page.locator("[data-hd-transit-time]").fill("10:00");
      await page.locator("[data-hd-transit-submit]").click();

      // ── Kişisel Transit ──
      await page.locator("[data-hd-transit-tab='personal']").click();
      await page.waitForURL(/gorunum=kisisel/, { timeout: 15_000 });
      await page.locator("[data-hd-transit-view='personal']").waitFor({ timeout: 15_000 });
      ok((await page.locator("h1").innerText()).includes("Kişisel Transit Analizi"), `${d.name}: Kişisel Transit sekmesi (başlık)`);
      await sleep(3000);
      await page.unroute("**/api/hd/transit?*");
      ok((await page.locator("[data-hd-transit-view='general']").count()) === 0 && (await page.locator("[data-hd-transit-moment]").count()) === 0, `${d.name}: R5 genel transit isteği sürerken görünüm kapandı → geç yanıt işlenmedi`);
      await page.waitForFunction(() => (document.querySelector("[data-hd-ptransit-client]") as HTMLSelectElement | null)?.options.length === 4, null, { timeout: 30_000 });
      const opts = await page.locator("[data-hd-ptransit-client] option").evaluateAll((els) => els.map((e) => ({ v: (e as HTMLOptionElement).value, dis: (e as HTMLOptionElement).disabled, t: e.textContent })));
      ok(opts.find((o) => o.v === CL[0])?.dis === false && opts.find((o) => o.v === CL[2])?.dis === false && opts.find((o) => o.v === CL[1])?.dis === true && (await page.locator("[data-hd-transit-submit]").isDisabled()), `${d.name}: geçerli analizli danışan seçilebilir; manuel analizli seçilemez; danışan seçilmeden hesap düğmesi pasif`, opts);
      await page.locator("[data-hd-ptransit-client]").selectOption(CL[0]);
      await page.locator("[data-hd-transit-date]").fill("2026-10-19");
      await page.locator("[data-hd-transit-time]").fill("09:00");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-error]").waitFor({ timeout: 15_000 });
      const errTxt = await page.locator("[data-hd-ptransit-error]").innerText();
      ok(errTxt.includes("yapılandırılmamış") && !/roxy|kredi|kota/i.test(errTxt), `${d.name}: sunucuda hesaplama anahtarı yok → açık hata; sağlayıcı / kota adı yok`, errTxt);
      // Başarılı yol: yanıt GERÇEK servisten (süreç içinde, sahte sağlayıcıyla) üretilir.
      let served = 0;
      let hdCalls = 0;
      const pDelay: Record<string, number> = {};
      const pUncertainTimes = new Set<string>();
      await page.route("**/api/hd/transit/personal", async (route) => {
        served++;
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const wait = pDelay[`${body.client_id}|${body.date}|${body.time}`] ?? 0;
        if (wait) await sleep(wait);
        // N-01: bu saatte doğrulanmış referans = S08-1b'nin GERÇEK kayıtlı hassas konumu (kalıcı belirsizlik, roxy-partial)
        const sensitive = pUncertainTimes.has(String(body.time));
        const r = await computePersonalTransit({ db: svc, tenantId: TA, userId: UA.id!, isDemo: false }, body, {
          resolveTransit: (utc) =>
            sensitive
              ? resolveGeneralTransit(new Date(SENSITIVE[0].utc), { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async () => ({ ok: true, raw: { planets: SENSITIVE[0].planets } }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: UA.id!, tenantId: TA })
              : resolveGeneralTransit(utc, { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async (_c, pb) => ({ ok: true, raw: fakePlanetsResponse(`${pb.date}T${pb.time}Z`) }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: UA.id!, tenantId: TA }),
          config: { apiKey: "k", baseUrl: "https://example.invalid" },
          callTransit: async (_c, b) => { hdCalls++; return { ok: true, raw: fakeTransitResponse(b.birthData as unknown as Moment, b.date, b.time) }; },
          rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
        });
        try {
          await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
        } catch { /* tarayıcı isteği iptal etti (beklenen) */ }
      });
      await page.locator("[data-hd-transit-time]").fill("09:30");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-moment]").waitFor({ timeout: 30_000 });
      const pLocal = computeGeneralTransit(new Date("2026-10-19T06:30:00Z"));
      const natalG = [...new Set(engineChart(PEOPLE[0]).activations.map((a: { gate: number }) => a.gate))].sort((x, y) => x - y);
      const st = overlaySceneState(natalG, pLocal.activeGates);
      const pRows = await page.locator("[data-hd-ptransit-activation]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-ptransit-activation")));
      ok((await page.locator("[data-hd-ptransit-moment]").getAttribute("data-hd-ptransit-moment")) === "2026-10-19T06:30:00.000Z" && JSON.stringify(pRows) === JSON.stringify(pLocal.activations.map((a) => `${a.body}:${a.gate}.${a.line}`)), `${d.name}: kişisel transit 19.10.2026 09:30 → 06:30Z; 13 transit aktivasyonu`);
      ok((await page.locator("[data-hd-ptransit-natal-gates]").innerText()) === natalG.join(", "), `${d.name}: natal kapılar ayrı listede (kayıtlı analizden)`);
      const pDef = (await page.locator("[data-hd-transit-graph='personal']").getAttribute("data-hd-transit-defined")) ?? "";
      const expDef = Object.values(st.channels).filter((c) => c.state === "defined").map((c) => c.id).sort().join(",");
      const pg = await page.evaluate(() => { const s = document.querySelector("svg[data-hd-cbg]")!; return { a: s.querySelectorAll("[data-hd-cbg-gate$=':A']").length, b: s.querySelectorAll("[data-hd-cbg-gate$=':B']").length, both: s.querySelectorAll("[data-hd-cbg-gate$=':both']").length, w: s.getBoundingClientRect().right }; });
      const nS = new Set(natalG);
      const tS = new Set(pLocal.activeGates);
      ok(pDef === expDef && pg.a === natalG.filter((g) => !tS.has(g)).length && pg.b === pLocal.activeGates.filter((g) => !nS.has(g)).length && pg.both === natalG.filter((g) => tS.has(g)).length, `${d.name}: natal (mavi ${pg.a}) / transit (turuncu ${pg.b}) / ortak (${pg.both}) kapılar ve tanımlı kanallar grafikte doğru`, { pDef, expDef, pg });
      const perso = await page.locator("[data-hd-ptransit-channel]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-ptransit-channel")));
      ok(perso.every((x) => /^(personal|educational):/.test(x!)) && (await page.locator("[data-hd-ptransit-natal-channels]").innerText()).length > 0, `${d.name}: kişisel / iki kapısı transit kanallar ayrı bölümlerde (${perso.length}); natal kanallar ayrı`);
      ok(pg.w <= d.w + 1 && !(await overflowX()), `${d.name}: kişisel transit grafiği ekrana sığar, yatay taşma yok`);
      await page.evaluate(() => document.querySelector("svg[data-hd-cbg]")!.scrollIntoView({ block: "center" }));
      const pfit = await page.evaluate(() => {
        const r = document.querySelector("svg[data-hd-cbg]")!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, h: r.height, w: r.width, vh: window.innerHeight };
      });
      ok(pfit.h <= pfit.vh && pfit.top >= -1 && pfit.bottom <= pfit.vh + 1 && Math.abs(pfit.w / pfit.h - 602 / 752) < 0.01, `${d.name}: kişisel transit BodyGraph tek ekranda tamamen görünür (${Math.round(pfit.w)}×${Math.round(pfit.h)} ≤ ${pfit.vh})`, pfit);
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForTimeout(300);
      ok(served === 1, `${d.name}: aynı danışan + aynı an tekrar istenince sunucuya yeni istek gitmez (oturum önbelleği)`, served);
      await page.locator("[data-hd-transit-time]").fill("10:15");
      ok((await page.locator("[data-hd-ptransit-moment]").count()) === 0 && (await page.locator("[data-hd-ptransit-activations]").count()) === 0, `${d.name}: kişisel transitte saat değişince önceki sonuç kalkar`);
      await page.locator("[data-hd-transit-time]").fill("09:30");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-moment]").waitFor({ timeout: 15_000 });
      await page.screenshot({ path: path.join(OUT, `${d.name}-personal-transit.png`), fullPage: true });

      // ── P1-02 kişisel: danışan / tarih / saat değişimi, ters sıra, oturum önbelleği izolasyonu
      const caption = () => page.locator("[data-hd-ptransit-moment]").innerText({ timeout: 2_000 }).catch(() => "");
      const sel = page.locator("[data-hd-ptransit-client]");
      // PR1: Danışan A sorgusu sürerken danışan B seçilir → A yanıtı gösterilmez
      pDelay[`${CL[0]}|2026-10-19|11:00`] = 2500;
      await page.locator("[data-hd-transit-time]").fill("11:00");
      await page.locator("[data-hd-transit-submit]").click();
      await sleep(300);
      await sel.selectOption(CL[2]);
      await sleep(3200);
      ok((await page.locator("[data-hd-ptransit-moment]").count()) === 0 && (await page.locator("[data-hd-ptransit-activations]").count()) === 0 && (await page.locator("[data-hd-ptransit-error]").count()) === 0 && (await page.locator("[data-hd-transit-submit]").isEnabled()),
        `${d.name}: PR1 danışan A sorgusu sürerken B seçildi → A'nın sonucu B seçiliyken GÖSTERİLMEZ, düğme kilitli kalmaz`);
      // PR2: B aynı an → B sonucu (A'nın adı / natal kapıları yok)
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-moment]").waitFor({ timeout: 15_000 });
      const natalB = [...new Set(engineChart(PEOPLE[2]).activations.map((a: { gate: number }) => a.gate))].sort((x, y) => x - y);
      const capB = await caption();
      ok(capB.includes(CL_NAMES[2]) && !capB.includes(CL_NAMES[0]) && (await page.locator("[data-hd-ptransit-natal-gates]").innerText()) === natalB.join(", "), `${d.name}: PR2 B danışanı → yalnız B'nin adı ve natal kapıları`, capB);
      // PR3: oturum önbelleği danışana bağlı — A'nın 09:30 sonucu B için kullanılmaz
      const servedBefore = served;
      await page.locator("[data-hd-transit-time]").fill("09:30");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-moment]").waitFor({ timeout: 15_000 });
      const capB2 = await caption();
      ok(served === servedBefore + 1 && capB2.includes(CL_NAMES[2]) && !capB2.includes(CL_NAMES[0]) && (await page.locator("[data-hd-ptransit-natal-gates]").innerText()) === natalB.join(", "), `${d.name}: PR3 aynı an, farklı danışan → önbellekten A sonucu DÖNMEZ; yeni hesap B'ye ait`, { served, servedBefore, capB2 });
      // PR4: ters sıra — A (yavaş) sürerken B'ye geçilip B (hızlı) hesaplanır
      await sel.selectOption(CL[0]);
      pDelay[`${CL[0]}|2026-10-19|12:00`] = 2500;
      await page.locator("[data-hd-transit-time]").fill("12:00");
      await page.locator("[data-hd-transit-submit]").click();
      await sleep(300);
      await sel.selectOption(CL[2]);
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-moment]").waitFor({ timeout: 15_000 });
      await sleep(3200);
      const capB3 = await caption();
      ok(capB3.includes(CL_NAMES[2]) && !capB3.includes(CL_NAMES[0]) && (await page.locator("[data-hd-ptransit-error]").count()) === 0 && (await page.locator("[data-hd-ptransit-natal-gates]").innerText()) === natalB.join(", "),
        `${d.name}: PR4 ters sıralı yanıtlar → A'nın geç yanıtı B ekranına YAZILMAZ`, capB3);
      // PR5: tarih değişimi sürerken
      pDelay[`${CL[2]}|2026-10-25|12:00`] = 2500;
      await page.locator("[data-hd-transit-date]").fill("2026-10-25");
      await page.locator("[data-hd-transit-submit]").click();
      await sleep(300);
      await page.locator("[data-hd-transit-date]").fill("2026-10-26");
      await sleep(3200);
      ok((await page.locator("[data-hd-ptransit-moment]").count()) === 0 && (await page.locator("[data-hd-ptransit-error]").count()) === 0, `${d.name}: PR5 tarih sorgusu sürerken tarih değişti → eski tarih sonucu gösterilmez`);
      // N-01: kalıcı astronomik belirsizlik → dürüst mesaj, yeniden deneme önerilmez, ücretli HD çağrısı yok
      pUncertainTimes.add("13:13");
      const hdBefore = hdCalls;
      await page.locator("[data-hd-transit-time]").fill("13:13");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-error]").waitFor({ timeout: 15_000 });
      const n01 = page.locator("[data-hd-ptransit-error]");
      const n01Txt = await n01.innerText();
      ok((await n01.getAttribute("data-hd-ptransit-error-code")) === "TRANSIT_REFERENCE_UNCERTAIN" && n01Txt.includes("kesin kişisel transit üretilemez") && n01Txt.includes("Yeniden denemek sonucu değiştirmez") && n01Txt.includes(PLANET_LABEL_TR.Moon) && !/birkaç dakika sonra/i.test(n01Txt) && !/roxy|kredi|kota/i.test(n01Txt) && hdCalls === hdBefore && (await page.locator("[data-hd-ptransit-moment]").count()) === 0,
        `${d.name}: N-01 kalıcı belirsizlik → 422 TRANSIT_REFERENCE_UNCERTAIN, dürüst mesaj (gezegen adı), "birkaç dakika sonra" önerisi YOK, ücretli HD çağrısı YOK`, n01Txt);
      ok(!(await overflowX()), `${d.name}: kişisel transit uyarılarında yatay taşma yok`);
      await page.unroute("**/api/hd/transit/personal");
      ok(roxyDirect === 0, `${d.name}: tarayıcıdan Roxy isteği YOK`);
      await ctx.close();
    }
    // ── Dünya geneli saat dilimi: New York tarayıcısı (1366×768) ───────────────
    section("dünya geneli saat dilimi (New York tarayıcısı)");
    {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: "tr-TR", timezoneId: "America/New_York" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson), UA.token!]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`NY: ${e.message}`));
      let roxyDirect = 0;
      page.on("request", (r) => { if (/roxyapi\.com/.test(r.url())) roxyDirect++; });
      const zoneNow = () => page.locator("[data-hd-transit-zone='general'] [data-hd-transit-zone-current]").getAttribute("data-hd-transit-zone-current");
      await page.goto(`${APP}/human-design/transit`);
      await page.locator("[data-hd-transit-activations]").waitFor({ timeout: 60_000 });
      const cap = await page.locator("[data-hd-transit-moment]").innerText();
      ok((await zoneNow()) === "America/New_York" && (await page.locator("[data-hd-transit-zone-source]").getAttribute("data-hd-transit-zone-source")) === "detected" && (await page.locator("[data-hd-transit-zone-reset]").isVisible()) && cap.includes("America/New_York") && Math.abs(Date.parse((await page.locator("[data-hd-transit-moment]").getAttribute("data-hd-transit-moment")) ?? "0") - Date.now()) < 3 * 60_000,
        "NY: tarayıcı saat dilimi algılandı, açıkça gösterildi, değiştirilebilir; şimdi = New York'taki gerçek an", cap);
      // Aynı UTC anı: New York 02:00 (EDT) = 06:00Z → motorla birebir
      await page.locator("[data-hd-transit-date]").fill("2026-10-21");
      await page.locator("[data-hd-transit-time]").fill("02:00");
      ok((await page.locator("[data-hd-transit-utc-preview='general']").getAttribute("data-hd-transit-utc")) === "2026-10-21T06:00:00.000Z", "NY: UTC karşılığı önizlemesi 02:00 EDT → 06:00Z");
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction(() => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === "2026-10-21T06:00:00.000Z", null, { timeout: 15_000 });
      const nyRows = await page.locator("[data-hd-transit-activation]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-transit-activation")));
      ok(JSON.stringify(nyRows) === JSON.stringify(computeGeneralTransit(new Date("2026-10-21T06:00:00Z")).activations.map((a) => `${a.body}:${a.gate}.${a.line}`)), "NY 02:00 → Türkiye 09:00 ile AYNI 13 aktivasyon (şehir kapıyı değiştirmez)");
      // Elle saat dilimi
      await page.locator("[data-hd-transit-zone='general'] [data-hd-transit-zone-toggle]").click();
      await page.locator("[data-hd-transit-zone='general'] [data-hd-transit-zone-select]").selectOption("Asia/Tokyo");
      ok((await zoneNow()) === "Asia/Tokyo" && (await page.locator("[data-hd-transit-moment]").count()) === 0 && (await page.locator("[data-hd-transit-utc-preview='general']").getAttribute("data-hd-transit-utc")) === "2026-10-20T17:00:00.000Z",
        "NY: elle Asia/Tokyo → önceki sonuç kalkar; aynı yerel 02:00 artık 17:00Z (önizleme)");
      // Şehir arama (yerel dünya veri seti — Roxy kredisi harcanmaz): Türkçe "Londra"
      const city = page.locator("#hd-transit-city-general");
      await city.fill("Londra");
      const londonOpt = page.locator("[data-hd-transit-zone='general'] [role=option]", { hasText: "London, England" });
      await londonOpt.first().waitFor({ timeout: 15_000 });
      ok((await londonOpt.first().innerText()).includes("Europe/London"), "NY: 'Londra' araması → London, England, United Kingdom + IANA saat dilimi görünür");
      await londonOpt.first().click();
      ok((await zoneNow()) === "Europe/London" && (await page.locator("[data-hd-transit-zone-source]").first().getAttribute("data-hd-transit-zone-source")) === "city" && (await page.locator("[data-hd-transit-zone='general'] [data-hd-transit-zone-current]").innerText()).includes("London"), "NY: şehir seçildi → Europe/London, şehir adı gösteriliyor");
      // Aynı adlı şehirler ayırt edilir
      await city.fill("Springfield");
      const spr = page.locator("[data-hd-transit-zone='general'] [role=option]", { hasText: "Springfield" });
      await spr.first().waitFor({ timeout: 15_000 });
      const sprLabels = await spr.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
      ok(sprLabels.length >= 3 && new Set(sprLabels).size === sprLabels.length && sprLabels.some((l) => l.includes("Missouri")) && sprLabels.some((l) => l.includes("Massachusetts")), `NY: aynı adlı şehirler bölge + ülke + saat dilimiyle ayrı (${sprLabels.length})`, sprLabels);
      // Konum servisi kullanılamıyor (bu test sunucusunda anahtar yok) → açık mesaj; elle seçim çalışır; bölge sessizce değişmez
      await city.fill("Zzqxw Köyü");
      await page.locator("[data-hd-transit-zone='general'] button", { hasText: "İlçe / şehir ara" }).click();
      await page.locator("[data-hd-transit-zone='general'] [data-hd-location-panel] p").first().waitFor({ timeout: 15_000 });
      const svcMsg = await page.locator("[data-hd-transit-zone='general'] [data-hd-location-panel] p").first().innerText();
      ok(/kullanılamıyor|ulaşılamıyor|yapılamadı/.test(svcMsg) && (await zoneNow()) === "Europe/London" && roxyDirect === 0, "NY: konum servisi hatası → anlaşılır mesaj; seçili bölge SESSİZCE değişmez; tarayıcıdan sağlayıcıya istek yok", svcMsg);
      // İki kez yaşanan saat (Londra 25.10.2026 01:30) → açık seçim
      await page.locator("[data-hd-transit-date]").fill("2026-10-25");
      await page.locator("[data-hd-transit-time]").fill("01:30");
      await page.locator("[data-hd-transit-ambiguous]").waitFor({ timeout: 5_000 });
      ok((await page.locator("[data-hd-transit-offset]").count()) === 2, "Londra 01:30 iki kez yaşandı → iki seçenek (İlk kez UTC+01:00 / İkinci kez UTC+00:00)");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-transit-error]").waitFor({ timeout: 15_000 });
      ok((await page.locator("[data-hd-transit-error]").innerText()).includes("iki kez") && (await page.locator("[data-hd-transit-moment]").count()) === 0, "seçim yapılmadan hesap → açık hata; sessiz seçim YOK");
      await page.locator("[data-hd-transit-offset='3600']").click();
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction(() => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === "2026-10-25T00:30:00.000Z", null, { timeout: 15_000 });
      ok(true, "'İlk kez' (UTC+01:00) seçildi → 00:30Z hesaplandı");
      // Hiç yaşanmamış saat
      await page.locator("[data-hd-transit-date]").fill("2026-03-29");
      ok((await page.locator("[data-hd-transit-utc-preview='general']").getAttribute("data-hd-transit-utc-error")) === "LOCAL_TIME_GAP" && (await page.locator("[data-hd-transit-utc-preview='general']").innerText()).includes("Europe/London"), "Londra 29.03.2026 01:30 hiç yaşanmadı → açık uyarı (bölge adıyla)");
      await page.screenshot({ path: path.join(OUT, "NY-dunya-saat-dilimi.png"), fullPage: true });
      // Kişisel transit: saat dilimi sekmeler arasında korunur; Londra 07:00 = 06:00Z
      await page.locator("[data-hd-transit-date]").fill("2026-10-21");
      await page.locator("[data-hd-transit-time]").fill("07:00");
      await page.route("**/api/hd/transit/personal", async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const r = await computePersonalTransit({ db: svc, tenantId: TA, userId: UA.id!, isDemo: false }, body, {
          resolveTransit: (utc) => resolveGeneralTransit(utc, { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async (_c, pb) => ({ ok: true, raw: fakePlanetsResponse(`${pb.date}T${pb.time}Z`) }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: UA.id!, tenantId: TA }),
          config: { apiKey: "k", baseUrl: "https://example.invalid" },
          callTransit: async (_c, b) => ({ ok: true, raw: fakeTransitResponse(b.birthData as unknown as Moment, b.date, b.time) }),
          rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
        });
        try { await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) }); } catch { /* iptal */ }
      });
      await page.locator("[data-hd-transit-tab='personal']").click();
      await page.locator("[data-hd-transit-view='personal']").waitFor({ timeout: 15_000 });
      ok((await page.locator("[data-hd-transit-zone='personal'] [data-hd-transit-zone-current]").getAttribute("data-hd-transit-zone-current")) === "Europe/London", "seçilen saat dilimi Kişisel Transit sekmesinde korunur");
      await page.waitForFunction(() => (document.querySelector("[data-hd-ptransit-client]") as HTMLSelectElement | null)?.options.length === 4, null, { timeout: 30_000 });
      await page.locator("[data-hd-ptransit-client]").selectOption(CL[0]);
      await page.locator("[data-hd-transit-date]").fill("2026-10-21");
      await page.locator("[data-hd-transit-time]").fill("07:00");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-moment]").waitFor({ timeout: 30_000 });
      const pcap = await page.locator("[data-hd-ptransit-moment]").innerText();
      const pRowsNy = await page.locator("[data-hd-ptransit-activation]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-ptransit-activation")));
      ok((await page.locator("[data-hd-ptransit-moment]").getAttribute("data-hd-ptransit-moment")) === "2026-10-21T06:00:00.000Z" && pcap.includes("Europe/London") && pcap.includes(CL_NAMES[0]) && JSON.stringify(pRowsNy) === JSON.stringify(computeGeneralTransit(new Date("2026-10-21T06:00:00Z")).activations.map((a) => `${a.body}:${a.gate}.${a.line}`)),
        "Kişisel Transit Londra 07:00 → 06:00Z; başlıkta saat dilimi; transit aktivasyonları Türkiye 09:00 ile aynı", pcap);
      // Saat dilimi değişince kişisel sonuç kalkar
      await page.locator("[data-hd-transit-zone='personal'] [data-hd-transit-zone-reset]").click();
      ok((await page.locator("[data-hd-ptransit-moment]").count()) === 0 && (await page.locator("[data-hd-transit-zone='personal'] [data-hd-transit-zone-current]").getAttribute("data-hd-transit-zone-current")) === "Europe/Istanbul", "'Türkiye saatine dön' → Europe/Istanbul; önceki (Londra) kişisel sonuç kalkar");
      await page.unroute("**/api/hd/transit/personal");
      await ctx.close();
    }
    // ── Saat dilimi algılanamayan tarayıcı → Türkiye + açık durum ──
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => {
        localStorage.setItem("yasam_user", uj as string);
        localStorage.setItem("yasam_session_token", tok as string);
        const orig = Intl.DateTimeFormat.prototype.resolvedOptions;
        Intl.DateTimeFormat.prototype.resolvedOptions = function () { return { ...orig.call(this), timeZone: "Mars/Olympus" }; };
      }, [JSON.stringify(userJson), UA.token!]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`undetected: ${e.message}`));
      await page.goto(`${APP}/human-design/transit`);
      await page.locator("[data-hd-transit-activations]").waitFor({ timeout: 60_000 });
      ok((await page.locator("[data-hd-transit-zone-current]").getAttribute("data-hd-transit-zone-current")) === "Europe/Istanbul" && (await page.locator("[data-hd-transit-zone-source]").getAttribute("data-hd-transit-zone-source")) === "undetected" && (await page.locator("[data-hd-transit-zone-source]").innerText()).includes("algılanamadı"),
        "tarayıcı geçersiz saat dilimi bildirdi → kabul edilmedi; Türkiye saati + 'algılanamadı' durumu açıkça yazılı");
      await ctx.close();
    }
    // ── Human Design ana sayfa: dört giriş kartı ──
    for (const v of [{ n: "1536x639", w: 1536, h: 639 }, { n: "768x1024", w: 768, h: 1024, ua: IPAD }, { n: "390x844", w: 390, h: 844, ua: IPHONE }]) {
      section(`HD ana sayfa ${v.n}`);
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, isMobile: !!v.ua, hasTouch: !!v.ua, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(v.ua ? { userAgent: v.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson), UA.token!]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`hub ${v.n}: ${e.message}`));
      await page.goto(`${APP}/human-design`);
      const hrefs = ["/human-design/danisanlar", "/human-design/bilgi-bankasi", "/human-design/iliski-grup", "/human-design/transit"];
      await page.locator(`a[href="/human-design/transit"]`).waitFor({ timeout: 60_000 });
      const vis = await Promise.all(hrefs.map((h) => page.locator(`a[href="${h}"]`).first().isVisible()));
      const card = page.locator(`a[href="/human-design/transit"]`);
      const ctext = await card.innerText();
      const img = await card.locator("img").getAttribute("src");
      ok(vis.every(Boolean) && ctext.includes("Günün ve Kişisel Transitleri") && ctext.includes("Seçtiğiniz tarihin gezegensel etkilerini inceleyin") && img === "/premium/human-design/transit-gokyuzu.webp", `${v.n}: dört kart görünür (Hesaplama, Bilgi Bankası, İlişki ve Grup, Transitler); transit kartı başlık + açıklama + görsel`);
      ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${v.n}: ana sayfada yatay taşma yok`);
      await page.screenshot({ path: path.join(OUT, `hub-${v.n}.png`), fullPage: true });
      await card.click();
      await page.waitForURL(/\/human-design\/transit$/, { timeout: 30_000 });
      await page.locator("[data-hd-transit-view='general']").waitFor({ timeout: 30_000 });
      ok(true, `${v.n}: transit kartı → /human-design/transit açıldı`);
      await page.goBack();
      await page.locator(`a[href="/human-design/iliski-grup"]`).click();
      await page.waitForURL(/\/human-design\/iliski-grup$/, { timeout: 30_000 });
      ok(true, `${v.n}: mevcut İlişki ve Grup kartı çalışıyor`);
      await ctx.close();
    }
    ok(pageErrors.length === 0, "sayfa hatası (JS) yok", pageErrors);
    ok(externalCalls === 0, "test sürecinden dış ağ çağrısı yok (ücretli çağrı 0)");
  } finally {
    if (browser) await browser.close();
    if (app) {
      try {
        if (process.platform === "win32" && app.pid) spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { shell: true });
        else app.kill("SIGTERM");
      } catch { /* yok */ }
    }
    await env.stop();
    globalThis.fetch = realFetch;
  }
  console.log(`\nHD TRANSİT TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail > 0) {
    console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
