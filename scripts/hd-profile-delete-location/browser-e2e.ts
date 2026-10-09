/**
 * HD son iki düzeltme — GERÇEK TARAYICI testi (yerel `next start`; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npm run hd:profile-delete-location:browser [-- --out <klasör>]
 *
 * Kapsam (375 px · 390 px · masaüstü): doğum yeri seçicide Türkçe yabancı şehir ("londr", "Londra",
 * "Münih") → doğru şehir ilk sırada, yazarken Roxy araması YOK; profil silme: iki ayrı Evet onayı,
 * her iki aşamada Vazgeç → sıfır silme, kesin sayılar, başarı sonrası profil listesi + Kayıtlı
 * analizler listesi sayfa yenilemeden güncellenir; aynı isimli danışan korunur.
 * Next sunucusuna Roxy anahtarı VERİLMEZ (tohum analizleri bu süreçte sahte Roxy ile oluşturulur).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { BODYGRAPH, TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-profile-delete-location-browser");
const PORT = 3988;
const APP = `http://127.0.0.1:${PORT}`;
const SHIM_PORT = 54523;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
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
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DEVICES: Device[] = [
  { name: "375px", viewport: { width: 375, height: 812 }, mobile: true, ua: IPHONE_UA },
  { name: "390px", viewport: { width: 390, height: 844 }, mobile: true, ua: IPHONE_UA },
  { name: "masaüstü", viewport: { width: 1366, height: 900 }, mobile: false },
];
type Watch = { hdLocation: number; roxyCompute: number; external: string[]; errors: string[] };

async function newPage(browser: Browser, user: Json, token: string, d: Device): Promise<{ ctx: BrowserContext; page: Page; w: Watch }> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul",
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), token]);
  const page = await ctx.newPage();
  const w: Watch = { hdLocation: 0, roxyCompute: 0, external: [], errors: [] };
  page.on("request", (r) => {
    const u = r.url();
    if (/\/api\/hd\/location\/search/.test(u)) w.hdLocation++;
    if (/\/api\/hd\/charts\/roxy/.test(u)) w.roxyCompute++;
    if (!/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u)) w.external.push(u);
  });
  page.on("pageerror", (e) => w.errors.push(`${d.name}: ${e.message}`));
  return { ctx, page, w };
}
const noHScroll = (page: Page, width: number) => page.evaluate((wd) => document.documentElement.scrollWidth <= wd + 1, width);

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54432, dirName: "hd-profile-delete-location-browser-pgdata", httpPort: SHIM_PORT });
  const su = env.su;
  const count = async (sql: string, p: unknown[] = []) => Number((await su.query(sql, p)).rows[0].n);
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const allErrors: string[] = [];
  const allExternal: string[] = [];
  try {
    const U: Auth = await mkUser(su, "PDBR", TA, { human_design: true, clients: true, hd_system_reading: true });
    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      professional: await import("../../app/api/hd/reports/professional/route"),
    };
    const seedProfile = async (ad: string, soyad: string, dogum: string) => {
      const c = await callRoute(routes.journey.POST, "POST", U, { action: "create_new", ad, soyad, dogum, birth_time: "10:30", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID() });
      const hd = String(c.json.hd_client_id);
      const ch = await callRoute(routes.roxy.POST, "POST", U, { client_id: hd, location_id: "client" });
      const w = await callRoute(routes.professional.POST, "POST", U, { chartId: String(ch.json.id), requestId: randomUUID(), commentary: "expert", bodygraphPng: BODYGRAPH });
      return { hd, journey: String(c.json.journey_client_id), chart: String(ch.json.id), report: String(w.json.id), ok: c.status === 200 && ch.json.ok === true && w.json.ok === true };
    };
    const victims: Record<string, Awaited<ReturnType<typeof seedProfile>>> = {};
    for (const [i, d] of DEVICES.entries()) victims[d.name] = await seedProfile("Silinecek", `Kişi${i + 1}`, `199${i}-06-06`);
    const keeper = await seedProfile("Silinecek", "Kişi1", "1980-01-01"); // AYNI isim (375px kurbanıyla)
    ok(Object.values(victims).every((v) => v.ok) && keeper.ok, "tohum: 3 silinecek profil + aynı isimli korunacak profil (her biri analiz + Word)");
    roxy.restore();
    const seedRoxy = roxy.state.calls;

    const user: Json = {
      id: U.id, tenant_id: TA, full_name: "ZZ_HDFLOW_PDBR", email: "zz.hdflow.pdbr@example.test", role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false,
      module_permissions: { human_design: true, clients: true, hd_system_reading: true },
    };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    for (const d of DEVICES) {
      const v = victims[d.name];
      const { ctx, page, w } = await newPage(browser, user, U.token!, d);

      section(`Doğum yeri — Türkçe yabancı şehir — ${d.name}`);
      await page.goto(`${APP}/human-design/danisanlar/${keeper.hd}`);
      const input = page.getByRole("combobox").first();
      await input.waitFor({ timeout: 90_000 });
      for (const [q, want] of [["londr", "London"], ["Londra", "London"], ["Münih", "Munich"], ["Viyana", "Vienna"]] as const) {
        await input.fill("");
        await input.fill(q);
        const first = page.locator('[data-hd-location-panel] [role="option"]').first();
        await first.waitFor({ timeout: 20_000 });
        await page.waitForTimeout(450);
        const txt = (await first.textContent()) ?? "";
        ok(txt.includes(want) && !/Londrina/.test(txt), `${d.name}: "${q}" → ilk öneri ${want}`, txt);
      }
      await input.fill("londrina");
      await page.locator('[data-hd-location-panel] [role="option"]').first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(450);
      ok(((await page.locator('[data-hd-location-panel] [role="option"]').first().textContent()) ?? "").includes("Londrina"), `${d.name}: "londrina" → Londrina (Londra'ya kaymaz)`);
      const panel = await page.locator("[data-hd-location-panel]").boundingBox();
      ok(!!panel && panel.x >= 0 && panel.x + panel.width <= d.viewport.width + 0.5 && (await noHScroll(page, d.viewport.width)), `${d.name}: öneri paneli ekrana sığıyor, yatay kaydırma yok`, panel);
      await page.screenshot({ path: path.join(OUT, `location-${d.name}.png`) });
      ok(w.hdLocation === 0 && w.roxyCompute === 0, `${d.name}: yazarken Roxy konum araması / hesaplama YOK`, w);

      section(`Profil silme — ${d.name}`);
      await page.goto(`${APP}/human-design/danisanlar`);
      const history = page.locator("[data-hd-analysis-history]");
      await history.locator(`[data-hd-history-item$=":${v.chart}"]`).waitFor({ timeout: 90_000 });
      await page.locator("[data-hd-profiles] summary").click();
      // Aynı isimli iki profil var (375px kurbanı ile korunacak profil) → satır KİMLİKLE bulunur:
      // "Aç" bağlantısı profil kimliğini taşır.
      const target = page.locator("[data-hd-profiles] tr").filter({ has: page.locator(`a[href="/human-design/danisanlar/${v.hd}"]`) });
      await target.first().waitFor({ timeout: 30_000 });
      ok((await target.count()) === 1, `${d.name}: silinecek profil satırı (kimlikle) bulundu`);
      const snap = async () => [await count(`select count(*) n from public.human_design_clients`), await count(`select count(*) n from public.human_design_charts`), await count(`select count(*) n from public.human_design_reports`)].join("/");
      const s0 = await snap();

      // 1. aşamada Vazgeç
      await target.getByRole("button", { name: "Sil" }).click();
      const dlg = page.getByRole("alertdialog");
      await dlg.waitFor({ timeout: 20_000 });
      const msg1 = (await dlg.textContent()) ?? "";
      ok(msg1.includes("Bu Human Design profiliyle birlikte ona bağlı tüm Human Design analizleri ve Word raporları kalıcı olarak silinecektir. Bu işlem geri alınamaz.") && msg1.includes("1 Human Design analizi ve 1 Word raporu"),
        `${d.name}: 1. onay — owner metni + kesin sayılar`, msg1.slice(0, 300));
      ok(msg1.includes("Danışan Yolculuğu'ndaki danışan kaydı ve diğer modüllerin verileri silinmez"), `${d.name}: 1. onay — DY korunur bilgisi`);
      const box = await dlg.boundingBox();
      ok(!!box && box.x >= 0 && box.x + box.width <= d.viewport.width + 0.5 && box.y + box.height <= d.viewport.height + 0.5, `${d.name}: onay penceresi ekrana sığıyor`, box);
      await page.screenshot({ path: path.join(OUT, `delete-confirm1-${d.name}.png`) });
      await dlg.getByRole("button", { name: "Vazgeç" }).click();
      await dlg.waitFor({ state: "hidden" });
      ok((await snap()) === s0, `${d.name}: 1. aşamada Vazgeç → hiçbir şey silinmedi`);

      // 2. aşamada Vazgeç
      await target.getByRole("button", { name: "Sil" }).click();
      await dlg.getByRole("button", { name: "Evet, devam et" }).click();
      await dlg.getByText("Son onay").waitFor({ timeout: 20_000 });
      await page.screenshot({ path: path.join(OUT, `delete-confirm2-${d.name}.png`) });
      await dlg.getByRole("button", { name: "Vazgeç" }).click();
      await dlg.waitFor({ state: "hidden" });
      ok((await snap()) === s0, `${d.name}: 2. aşamada Vazgeç → hiçbir şey silinmedi`);

      // İki Evet → silme
      await target.getByRole("button", { name: "Sil" }).click();
      await dlg.getByRole("button", { name: "Evet, devam et" }).click();
      await dlg.getByRole("button", { name: "Evet, kalıcı olarak sil" }).click();
      await page.getByText(/Profil silindi: 1 analiz ve 1 Word raporu kaldırıldı/).waitFor({ timeout: 30_000 });
      ok(true, `${d.name}: başarı mesajı yalnız işlem tamamlanınca`);
      await page.locator(`a[href="/human-design/danisanlar/${v.hd}"]`).waitFor({ state: "detached", timeout: 20_000 });
      await history.locator(`[data-hd-history-item$=":${v.chart}"]`).waitFor({ state: "detached", timeout: 20_000 });
      ok(true, `${d.name}: profil listesi + Kayıtlı analizler listesi sayfa yenilemeden güncellendi`);
      ok((await count(`select count(*) n from public.human_design_clients where id=$1`, [v.hd])) === 0
        && (await count(`select count(*) n from public.human_design_charts where id=$1`, [v.chart])) === 0
        && (await count(`select count(*) n from public.human_design_reports where id=$1`, [v.report])) === 0, `${d.name}: DB'de profil + analiz + Word silindi`);
      ok((await count(`select count(*) n from public.clients where id=$1`, [v.journey])) === 1, `${d.name}: merkezî danışan (DY) korundu`);
      ok((await count(`select count(*) n from public.human_design_clients where id=$1`, [keeper.hd])) === 1 && (await count(`select count(*) n from public.human_design_reports where id=$1`, [keeper.report])) === 1
        && (await history.locator(`[data-hd-history-item$=":${keeper.chart}"]`).count()) === 1, `${d.name}: aynı isimli profil + analizi + Word'ü korundu ve listede`);
      ok(await noHScroll(page, d.viewport.width), `${d.name}: profil yönetimi açıkken yatay kaydırma yok`);
      await page.screenshot({ path: path.join(OUT, `after-delete-${d.name}.png`), fullPage: true });
      allErrors.push(...w.errors);
      allExternal.push(...w.external);
      ok(w.roxyCompute === 0, `${d.name}: Roxy hesaplama isteği 0`);
      await ctx.close();
    }

    section("Genel");
    ok(roxy.state.calls === seedRoxy, "tarayıcı testinde Roxy çağrısı 0 (sunucuda anahtar da yok)");
    ok(allExternal.length === 0 && roxy.state.external.length === 0, "harici ağ isteği yok", allExternal.slice(0, 5));
    ok(allErrors.length === 0, "sayfa JS hatası yok", allErrors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD son iki düzeltme TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
