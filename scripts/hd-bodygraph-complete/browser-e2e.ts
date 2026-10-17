/**
 * HD BODYGRAPH 1. API TAMAMLAMA — GERÇEK TARAYICI (Chromium): ana harita + Sistem Yorumu yeni alanları,
 * yetkili / yetkisiz uzman, masaüstü (lg şerit, geniş) + 390 / 360 / 320 px, Roxy isteği 0.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Next sunucusuna Roxy anahtarı VERİLMEZ. Tohum hesabı bu süreçte sahte Roxy ile yapılır (sayılır).
 * Çalıştır: npx tsx scripts/hd-bodygraph-complete/browser-e2e.ts [-- --out <klasör>]
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-bodygraph-complete-browser");
const PORT = 3995;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DEVICES: Device[] = [
  { name: "geniş 1920", viewport: { width: 1920, height: 1080 }, mobile: false },
  { name: "masaüstü 1366", viewport: { width: 1366, height: 900 }, mobile: false },
  { name: "lg 1100", viewport: { width: 1100, height: 820 }, mobile: false },
  { name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true, ua: IPHONE },
  { name: "mobil 360", viewport: { width: 360, height: 760 }, mobile: true, ua: IPHONE },
  { name: "mobil 320", viewport: { width: 320, height: 640 }, mobile: true, ua: IPHONE },
];

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54432, dirName: "hd-bodygraph-complete-browser-pgdata", httpPort: 54523 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  let roxyReq = 0;
  try {
    const PA = { human_design: true, clients: true, hd_system_reading: true };
    const PN = { human_design: true, clients: true };
    const UA: Auth = await mkUser(su, "BGBA", TA, PA);
    const UN: Auth = await mkUser(su, "BGBN", TA, PN);
    const jr = await import("../../app/api/hd/clients/journey/route");
    const rr = await import("../../app/api/hd/charts/roxy/route");
    const mk = async (u: Auth, ad: string) => {
      const c = await callRoute(jr.POST, "POST", u, { action: "create_new", ad, soyad: "Tamlık", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID() });
      const hd = String(c.json.hd_client_id);
      await callRoute(rr.POST, "POST", u, { client_id: hd, location_id: "client" });
      return hd;
    };
    const HA = await mk(UA, "Yetkili");
    const HN = await mk(UN, "Yetkisiz");
    ok(!!HA && !!HN && roxy.state.calls === 2, "tohum: iki uzman, birer kayıtlı Roxy analizi (sahte Roxy, 2 çağrı)");
    roxy.restore();

    const userJson = (u: Auth, perms: Json, name: string): Json => ({
      id: u.id, tenant_id: TA, full_name: name, email: `${name.toLowerCase()}@example.test`, role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: perms,
    });
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    const newPage = async (d: Device, u: Auth, perms: Json, name: string): Promise<Page> => {
      const ctx = await browser!.newContext({ viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson(u, perms, name)), u.token!]);
      const page = await ctx.newPage();
      page.on("request", (r) => { if (/\/api\/hd\/charts\/roxy|roxyapi\.com/.test(r.url())) roxyReq++; });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
      return page;
    };
    const modalOf = (p: Page) => p.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
    const scrollerFits = (p: Page) =>
      p.evaluate(() => {
        const sc = document.querySelector('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto') as HTMLElement | null;
        return !!sc && sc.scrollWidth <= sc.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
      });

    for (const d of DEVICES) {
      section(`Yetkili uzman — ${d.name}`);
      const page = await newPage(d, UA, PA, "ZZ_BGBA");
      await page.goto(`${APP}/human-design/danisanlar`);
      const r0 = roxyReq;
      await page.locator(`[data-hd-group-open="${HA}"]`).click();
      const m = modalOf(page);
      await m.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 90_000 });
      for (const f of ["strategy", "signature", "notSelf"]) {
        const el = m.locator(`[data-hd-info-field="${f}"]`);
        const box = await el.boundingBox();
        ok((await el.count()) === 1 && !!box && box.x >= 0 && box.x + box.width <= d.viewport.width + 0.5 && box.width > 20, `${d.name}: bilgi bloğunda '${f}' görünür ve ekrana sığıyor`, box);
      }
      ok((await m.locator('[data-hd-info-field="strategy"]').innerText()).includes("Yanıt vermek için beklemek"), `${d.name}: Strateji değeri (uygulama sözlüğü)`);
      ok((await m.locator("[data-hd-center-motor]").count()) === 4 && (await m.locator("[data-hd-center-awareness]").count()) === 3, `${d.name}: Merkezler listesinde 4 motor + 3 farkındalık işareti`);
      ok(await scrollerFits(page), `${d.name}: harita görünümü yatay taşmıyor`);
      await page.screenshot({ path: path.join(OUT, `harita-${d.name}.png`) });
      await m.getByRole("tab", { name: "Sistem Yorumu" }).click();
      const panel = m.locator("[data-hd-system-reading]");
      await panel.waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.querySelectorAll('[role="dialog"] [data-hd-system-reading] details').forEach((x) => ((x as HTMLDetailsElement).open = true)));
      ok(await panel.locator("[data-hd-sr-language-note]").isVisible(), `${d.name}: kaynak dili notu görünür`);
      ok(await panel.locator("[data-hd-sr-sides]").isVisible() && (await panel.locator('[data-hd-sr-line="design-utc"]').count()) === 1, `${d.name}: Personality/Design tarafları + Design anı`);
      ok((await panel.locator('[data-hd-sr-tag="motor"]').count()) === 4 && (await panel.locator('[data-hd-sr-tag="awareness"]').count()) === 3, `${d.name}: merkez motor/farkındalık etiketleri`);
      ok((await panel.locator('[data-hd-sr-line="center-gates"]').count()) === 9, `${d.name}: 9 merkezde aktif kapı satırı`);
      ok((await panel.locator('[data-hd-sr-line="channel-centers"]').count()) >= 1, `${d.name}: kanal bağladığı merkezler`);
      ok((await panel.locator('[data-hd-sr-line="iching"]').count()) === 26, `${d.name}: 26 aktivasyonda I Ching heksagramı`);
      const prof = (await panel.locator(`[data-hd-sr-general="profile"]`).textContent()) ?? "";
      const cross = (await panel.locator(`[data-hd-sr-general="cross"]`).textContent()) ?? "";
      ok(/2\. çizgi/.test(prof) && /4\. çizgi/.test(prof) && /Personality Güneş/.test(cross) && /\(RAX\)/.test(cross), `${d.name}: profil çizgileri + haç kapıları/açı kodu`);
      ok(await scrollerFits(page), `${d.name}: Sistem Yorumu tamamen açıkken yatay taşma yok`);
      const titleCut = await page.evaluate(() => [...document.querySelectorAll('[data-hd-system-reading] summary span, [data-hd-system-reading] p')].some((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2 && getComputedStyle(e).overflow !== "visible"));
      ok(!titleCut, `${d.name}: kesilen başlık / açıklama yok`);
      ok(roxyReq === r0, `${d.name}: harita + Sistem Yorumu açma: Roxy isteği 0`);
      await page.screenshot({ path: path.join(OUT, `sistem-yorumu-${d.name}.png`), fullPage: false });
      await page.context().close();
    }

    section("Yetkisiz uzman (hd_system_reading kapalı) — masaüstü + 390");
    for (const d of [DEVICES[1], DEVICES[3]]) {
      const page = await newPage(d, UN, PN, "ZZ_BGBN");
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator(`[data-hd-group-open="${HN}"]`).click();
      const m = modalOf(page);
      await m.locator("#hd-computed-detay-title").waitFor({ timeout: 90_000 });
      await m.locator('[data-hd-info-field="signature"]').waitFor({ timeout: 60_000 });
      ok((await m.getByRole("tab", { name: "Sistem Yorumu" }).count()) === 0, `${d.name}: Sistem Yorumu sekmesi YOK (politika korunur)`);
      ok((await m.locator('[data-hd-info-field="strategy"]').count()) === 1 && (await m.locator("[data-hd-center-motor]").count()) === 4, `${d.name}: temel kimlik (Strateji/İmza/Kendilik dışı) + motor işaretleri yetkisiz uzmanda da görünür`);
      const body = await m.innerText();
      ok(!body.includes("enveloping") && !body.includes("storyteller") && !body.includes("heksagram"), `${d.name}: yetki gerektiren uzun açıklamalar görünmez`);
      await page.context().close();
    }

    section("Genel");
    ok(roxyReq === 0, "tarayıcıdan Roxy isteği 0", roxyReq);
    ok(errors.length === 0, "sayfa JS hatası yok", errors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD BODYGRAPH TAMLIK TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) { for (const f of fails) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
