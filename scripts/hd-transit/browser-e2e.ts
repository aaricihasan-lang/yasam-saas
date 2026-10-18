/**
 * HD TRANSİT — GERÇEK TARAYICI + ROUTE testi (Playwright; yerel `next start` + izole Postgres). Roxy ÇAĞRISI YOK.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Ekranlar: 1920, 1366, 390, 360, 320 (+ Android UA 360). Çalıştır: npx tsx scripts/hd-transit/browser-e2e.ts [--out <klasör>]
 * Ortam: HD_TR_PG_PORT (varsayılan 54471), HD_TR_PG_DIR, HD_E2E_ONLY=390,1920 (yalnız seçilen ekranlar).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
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
import { fakeTransitResponse } from "./fakeRoxyTransit";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-transit-browser");
mkdirSync(OUT, { recursive: true });
const PORT = 3998;
const APP = `http://127.0.0.1:${PORT}`;
const TA = "0f0f0f0f-0000-4000-8000-00000000000a";
const CL = ["eeeeeeee-2222-4000-8000-0000000c0001", "eeeeeeee-2222-4000-8000-0000000c0002"];
const CH = ["eeeeeeee-2222-4000-8000-0000000d0001", "eeeeeeee-2222-4000-8000-0000000d0002"];
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
const DEVICES = [
  { name: "1920", w: 1920, h: 1080 },
  { name: "1366", w: 1366, h: 768 },
  { name: "390", w: 390, h: 844, ua: IPHONE },
  { name: "360", w: 360, h: 760, ua: IPHONE },
  { name: "320", w: 320, h: 640, ua: IPHONE },
  { name: "360-android", w: 360, h: 760, ua: ANDROID },
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
    // Kişisel transit tohumu: 1 geçerli otomatik analiz + 1 manuel (seçilemez)
    for (let i = 0; i < 2; i++) {
      const m = PEOPLE[i];
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [CL[i], TA, ["Ayşe Yılmaz", "Manuel Kişi"][i], m.date, m.time.slice(0, 5)]);
      await su.query(
        `insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [CH[i], TA, CL[i], "x", i === 0 ? "computed" : "manual", i === 0 ? "roxyapi" : null, JSON.stringify({ date: m.date, time: m.time, timezone: m.timezone, latitude: m.latitude, longitude: m.longitude, nodeType: "true", lang: "tr" }), `ih-${i}`, JSON.stringify(engineChart(m))],
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
      await page.locator("svg[data-hd-cbg]").screenshot({ path: path.join(OUT, `${d.name}-transit-bodygraph.png`) });
      // Kanal ayrıntısı: dokunma / fare / klavye
      const target = exp.channels[0]?.id ?? exp.halfChannels[0].id;
      const hit = page.locator(`[data-hd-cbg-hit='${target}']`);
      await hit.focus();
      await page.keyboard.press("Enter");
      ok((await page.locator("[data-hd-transit-info]").getAttribute("data-hd-transit-info")) === target && (await page.locator("[data-hd-transit-info]").innerText()).includes("kapı"), `${d.name}: kanal seçimi → kapı / gezegen ayrıntısı (${target})`);
      // Gelecek tarih + gün değişimi
      await page.locator("[data-hd-transit-date]").fill("2031-02-15");
      await page.locator("[data-hd-transit-time]").fill("00:10");
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForFunction(() => document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") === "2031-02-14T21:10:00.000Z", null, { timeout: 15_000 });
      ok(true, `${d.name}: gelecek tarih 15.02.2031 00:10 (Türkiye) → 14.02.2031 21:10Z (gün değişimi)`);
      // Yaz saati boşluğu → hata, eski sonuç korunur
      await page.locator("[data-hd-transit-date]").fill("2011-03-28");
      await page.locator("[data-hd-transit-time]").fill("03:30");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-transit-error]").waitFor({ timeout: 15_000 });
      ok((await page.locator("[data-hd-transit-error]").innerText()).includes("yaz saati") && (await page.locator("[data-hd-transit-moment]").getAttribute("data-hd-transit-moment")) === "2031-02-14T21:10:00.000Z", `${d.name}: yaz saati boşluğu → açık hata; önceki sonuç ekranda kalır`);
      // Şimdi
      await page.locator("[data-hd-transit-now]").click();
      await page.waitForFunction(() => Math.abs(Date.parse(document.querySelector("[data-hd-transit-moment]")?.getAttribute("data-hd-transit-moment") ?? "0") - Date.now()) < 180_000, null, { timeout: 15_000 });
      ok(true, `${d.name}: "Şimdi" düğmesi anı günceller`);
      ok(!(await overflowX()), `${d.name}: sayfada yatay taşma yok`);
      await page.screenshot({ path: path.join(OUT, `${d.name}-transit.png`), fullPage: true });

      // ── Kişisel Transit ──
      await page.locator("[data-hd-transit-tab='personal']").click();
      await page.waitForURL(/gorunum=kisisel/, { timeout: 15_000 });
      await page.locator("[data-hd-transit-view='personal']").waitFor({ timeout: 15_000 });
      ok((await page.locator("h1").innerText()).includes("Kişisel Transit Analizi"), `${d.name}: Kişisel Transit sekmesi (başlık)`);
      await page.waitForFunction(() => (document.querySelector("[data-hd-ptransit-client]") as HTMLSelectElement | null)?.options.length === 3, null, { timeout: 30_000 });
      const opts = await page.locator("[data-hd-ptransit-client] option").evaluateAll((els) => els.map((e) => ({ v: (e as HTMLOptionElement).value, dis: (e as HTMLOptionElement).disabled, t: e.textContent })));
      ok(opts.find((o) => o.v === CL[0])?.dis === false && opts.find((o) => o.v === CL[1])?.dis === true && (await page.locator("[data-hd-transit-submit]").isDisabled()), `${d.name}: geçerli analizli danışan seçilebilir; manuel analizli seçilemez; danışan seçilmeden hesap düğmesi pasif`, opts);
      await page.locator("[data-hd-ptransit-client]").selectOption(CL[0]);
      await page.locator("[data-hd-transit-date]").fill("2026-10-19");
      await page.locator("[data-hd-transit-time]").fill("09:00");
      await page.locator("[data-hd-transit-submit]").click();
      await page.locator("[data-hd-ptransit-error]").waitFor({ timeout: 15_000 });
      const errTxt = await page.locator("[data-hd-ptransit-error]").innerText();
      ok(errTxt.includes("yapılandırılmamış") && !/roxy|kredi|kota/i.test(errTxt), `${d.name}: sunucuda hesaplama anahtarı yok → açık hata; sağlayıcı / kota adı yok`, errTxt);
      // Başarılı yol: yanıt GERÇEK servisten (süreç içinde, sahte sağlayıcıyla) üretilir.
      let served = 0;
      await page.route("**/api/hd/transit/personal", async (route) => {
        served++;
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const r = await computePersonalTransit({ db: svc, tenantId: TA, userId: UA.id!, isDemo: false }, body, {
          config: { apiKey: "k", baseUrl: "https://example.invalid" },
          callTransit: async (_c, b) => ({ ok: true, raw: fakeTransitResponse(b.birthData as unknown as Moment, b.date, b.time) }),
          rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
        });
        await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
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
      await page.locator("[data-hd-transit-submit]").click();
      await page.waitForTimeout(300);
      ok(served === 1, `${d.name}: aynı danışan + aynı an tekrar istenince sunucuya yeni istek gitmez (oturum önbelleği)`, served);
      await page.screenshot({ path: path.join(OUT, `${d.name}-personal-transit.png`), fullPage: true });
      await page.unroute("**/api/hd/transit/personal");
      ok(roxyDirect === 0, `${d.name}: tarayıcıdan Roxy isteği YOK`);
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
