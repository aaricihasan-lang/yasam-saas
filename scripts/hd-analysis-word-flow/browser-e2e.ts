/**
 * HD satış öncesi — KAYITLI ANALİZ · WORD İNDİR · DANIŞAN YOLCULUĞU: GERÇEK TARAYICI TESTİ.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npm run hd:analysis-flow:browser [-- --out <klasör>]
 *
 * Veri: analizler bu süreçte GERÇEK route handler'larıyla + sahte Roxy (fixture) ile önceden
 * oluşturulur. Next sunucusuna Roxy anahtarı HİÇ verilmez → tarayıcı akışında Roxy çağrısı
 * yapılamaz (yapılmaya çalışılsa 503 olurdu; ayrıca istekler izlenir).
 * Genişlikler: 375 px · 390 px (iPhone UA) · masaüstü 1366 px · Android 390 px (Word gizli kuralı).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { BODYGRAPH, TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "./env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-analysis-flow-browser");
const PORT = 3987;
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
const ANDROID: Device = {
  name: "Android 390px", viewport: { width: 390, height: 844 }, mobile: true,
  ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

type Watch = { roxy: string[]; create: string[]; external: string[]; errors: string[] };

async function newPage(browser: Browser, user: Json, token: string, d: Device): Promise<{ ctx: BrowserContext; page: Page; w: Watch }> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true,
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), token]);
  const page = await ctx.newPage();
  const w: Watch = { roxy: [], create: [], external: [], errors: [] };
  page.on("request", (r) => {
    const u = r.url();
    if (/\/api\/hd\/charts\/roxy/.test(u)) w.roxy.push(`${r.method()} ${u}`);
    if (/\/api\/hd\/reports\/professional$/.test(u) && r.method() === "POST") w.create.push(u);
    if (!/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u)) w.external.push(u);
  });
  page.on("pageerror", (e) => w.errors.push(`${d.name}: ${e.message}`));
  return { ctx, page, w };
}

async function noHScroll(page: Page, width: number) {
  return page.evaluate((wd) => document.documentElement.scrollWidth <= wd + 1, width);
}

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54417, dirName: "hd-analysis-flow-browser-pgdata", httpPort: SHIM_PORT });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const allErrors: string[] = [];
  const allExternal: string[] = [];
  let browserRoxy = 0;
  try {
    // ── Tohum: GERÇEK route handler'ları + sahte Roxy (yalnız bu süreçte) ──
    const U: Auth = await mkUser(su, "BA", TA, { human_design: true, clients: true, hd_system_reading: true });
    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      professional: await import("../../app/api/hd/reports/professional/route"),
    };
    const created = await callRoute(routes.journey.POST, "POST", U, {
      action: "create_new", ad: "Elif", soyad: "Şahin", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(),
    });
    const hd = String(created.json.hd_client_id);
    const journey = String(created.json.journey_client_id);
    const cReady = await callRoute(routes.roxy.POST, "POST", U, { client_id: hd, location_id: "client" });
    await su.query(`update public.human_design_clients set birth_time='07:15' where id=$1`, [hd]);
    const cNew = await callRoute(routes.roxy.POST, "POST", U, { client_id: hd, location_id: "client" });
    const chartReady = String(cReady.json.id);
    const chartNew = String(cNew.json.id);
    const w0 = await callRoute(routes.professional.POST, "POST", U, { chartId: chartReady, requestId: randomUUID(), commentary: "both", bodygraphPng: BODYGRAPH });
    const repReady = String(w0.json.id);
    ok(created.status === 200 && cReady.json.ok === true && cNew.json.ok === true && w0.json.ok === true && roxy.state.calls === 2,
      "tohum: danışan + 2 kayıtlı analiz + 1 hazır Word (sahte Roxy 2 çağrı)", { c: created.json, a: cReady.json, b: cNew.json, w: w0.json });
    roxy.restore();
    const seedRoxyCalls = roxy.state.calls;
    const legacyBefore = JSON.stringify((await su.query(`select * from public.human_design_reports where report_kind='legacy' or schema_version='hd-report-1' order by id`)).rows);

    const user: Json = {
      id: U.id, tenant_id: TA, full_name: "ZZ_HDFLOW_BA", email: "zz.hdflow.ba@example.test", role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false,
      module_permissions: { human_design: true, clients: true, hd_system_reading: true },
    };

    // Next sunucusu: shim'e işaret eder, Roxy anahtarı YOK.
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    for (const d of DEVICES) {
      section(`Kayıtlı analizler + Word İndir — ${d.name}`);
      // Her cihazda "ilk Word" akışı yeniden denensin: hazır olmayan analizin raporu (yalnız test DB) silinir.
      await su.query(`delete from public.human_design_reports where chart_id=$1`, [chartNew]);
      const { ctx, page, w } = await newPage(browser, user, U.token!, d);
      await page.goto(`${APP}/human-design/danisanlar/${hd}`);
      const list = page.locator("[data-hd-analysis-history]");
      await list.getByText("Kayıtlı Human Design Analizleri").waitFor({ timeout: 90_000 });
      await list.locator(`[data-hd-history-item="computed:${chartReady}"], [data-hd-history-item$=":${chartReady}"]`).first().waitFor({ timeout: 30_000 });
      const itemReady = list.locator(`[data-hd-history-item$=":${chartReady}"]`);
      const itemNew = list.locator(`[data-hd-history-item$=":${chartNew}"]`);
      ok((await itemReady.count()) === 1 && (await itemNew.count()) === 1, `${d.name}: iki kayıtlı analiz listede`);
      ok((await itemReady.textContent())!.includes("20.07.2018 19:00") && (await itemNew.textContent())!.includes("20.07.2018 07:15"),
        `${d.name}: aynı tarihli analizler doğum saatiyle ayırt edilir`);
      ok(await itemReady.getByText("Word hazır").isVisible(), `${d.name}: hazır Word rozeti doğru analizde`);
      ok((await itemNew.getByText("Word hazır").count()) === 0, `${d.name}: Word'ü olmayan analizde rozet yok`);
      ok(await noHScroll(page, d.viewport.width), `${d.name}: liste yatay kaydırma yapmıyor`);
      const btnBox = await itemReady.locator(`[data-hd-history-word="${chartReady}"]`).boundingBox();
      ok(!!btnBox && btnBox.x >= 0 && btnBox.x + btnBox.width <= d.viewport.width + 0.5 && btnBox.height >= 36, `${d.name}: Word İndir düğmesi ekranda ve dokunulabilir`, btnBox);
      await page.screenshot({ path: path.join(OUT, `list-${d.name}.png`), fullPage: true });

      // 1) Hazır rapor → aynı rapor iner, oluşturma/Roxy yok.
      const dlP = page.waitForEvent("download");
      await itemReady.locator(`[data-hd-history-word="${chartReady}"]`).click();
      const dl = await dlP;
      const buf = readFileSync((await dl.path())!);
      const zip = await JSZip.loadAsync(buf);
      const text = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");
      ok(/\.docx$/.test(dl.suggestedFilename()) && text.includes("Elif Şahin") && Object.keys(zip.files).some((f) => f.startsWith("word/media/")),
        `${d.name}: hazır Word indi (DOCX, danışan adı, BodyGraph görseli)`, dl.suggestedFilename());
      await itemReady.getByText(/yeni hesaplama yapılmadı/).waitFor();
      ok(w.create.length === 0, `${d.name}: hazır raporda yeni oluşturma isteği YOK`, w.create);

      // 2) Hazır raporu olmayan analiz → modal açılır, akış bir kez başlar, rapor oluşturulur ve iner.
      await itemNew.locator(`[data-hd-history-word="${chartNew}"]`).click();
      const choose = page.getByRole("dialog", { name: "Word raporuna hangi yorumlar aktarılsın?" });
      await choose.waitFor({ timeout: 60_000 });
      ok(await choose.getByRole("radio", { name: /Her ikisi/ }).isChecked(), `${d.name}: yorum seçimi açıldı (varsayılan Her ikisi)`);
      const cb = await choose.boundingBox();
      ok(!!cb && cb.x >= 0 && cb.x + cb.width <= d.viewport.width + 0.5 && cb.y + cb.height <= d.viewport.height + 0.5, `${d.name}: seçim penceresi ekrana sığıyor`, cb);
      await page.screenshot({ path: path.join(OUT, `choose-${d.name}.png`) });
      const dl2P = page.waitForEvent("download", { timeout: 90_000 });
      await choose.getByRole("button", { name: "Raporu oluştur" }).click();
      const dl2 = await dl2P;
      const z2 = await JSZip.loadAsync(readFileSync((await dl2.path())!));
      const t2 = (await z2.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");
      ok(w.create.length === 1 && /Sistem Yorumu/i.test(t2) && Object.keys(z2.files).some((f) => f.startsWith("word/media/")),
        `${d.name}: yeni Word bir kez oluşturuldu ve indi (Sistem Yorumu + tarayıcıda yakalanan BodyGraph)`, w.create);
      const repRows = (await su.query(`select id, tenant_id, schema_version from public.human_design_reports where chart_id=$1`, [chartNew])).rows;
      ok(repRows.length === 1 && repRows[0].tenant_id === TA, `${d.name}: DB'de tek rapor satırı, doğru tenant`, repRows);
      ok(await noHScroll(page, d.viewport.width), `${d.name}: analiz penceresi açıkken yatay kaydırma yok`);
      await page.screenshot({ path: path.join(OUT, `modal-${d.name}.png`) });

      // 3) Pencere kapanınca liste "Word hazır" gösterir; ikinci tıklama aynı raporu indirir.
      await page.getByRole("button", { name: "Kapat" }).first().click();
      await itemNew.getByText("Word hazır").waitFor({ timeout: 20_000 });
      ok(true, `${d.name}: kapatınca yeni rapor listede 'Word hazır'`);
      const dl3P = page.waitForEvent("download");
      await itemNew.locator(`[data-hd-history-word="${chartNew}"]`).click();
      await dl3P;
      ok(w.create.length === 1, `${d.name}: tekrar Word İndir → yeni kopya oluşmadı`, w.create);

      ok(w.roxy.length === 0, `${d.name}: tarayıcı akışında Roxy uç noktasına istek YOK`, w.roxy);
      browserRoxy += w.roxy.length;
      allErrors.push(...w.errors);
      allExternal.push(...w.external);
      await ctx.close();
    }

    section("Android — Word düğmesi gizli kuralı");
    {
      const { ctx, page, w } = await newPage(browser, user, U.token!, ANDROID);
      await page.goto(`${APP}/human-design/danisanlar/${hd}`);
      const list = page.locator("[data-hd-analysis-history]");
      await list.locator(`[data-hd-history-item$=":${chartReady}"]`).waitFor({ timeout: 60_000 });
      ok((await list.locator("[data-hd-history-word]").count()) === 0, "Android: listede Word İndir yok");
      ok(await list.getByRole("button", { name: "Analizi Aç" }).first().isVisible(), "Android: Analizi Aç görünür");
      ok(await noHScroll(page, ANDROID.viewport.width), "Android: yatay kaydırma yok");
      allErrors.push(...w.errors);
      allExternal.push(...w.external);
      browserRoxy += w.roxy.length;
      await ctx.close();
    }

    section("Danışan Yolculuğu → Analizi Aç (aynı kayıt)");
    for (const d of [DEVICES[0], DEVICES[2]]) {
      const { ctx, page, w } = await newPage(browser, user, U.token!, d);
      await page.goto(`${APP}/dashboard/clients/${journey}?tab=humandesign`);
      const tab = page.locator("[data-hd-journey-tab]");
      await tab.waitFor({ timeout: 90_000 });
      ok((await tab.locator(`[data-hd-journey-analysis="${chartReady}"]`).count()) === 1 && (await tab.locator(`[data-hd-journey-analysis="${chartNew}"]`).count()) === 1,
        `${d.name}: DY sekmesi iki kayıtlı analizi gösterir`);
      await tab.locator(`[data-hd-journey-analysis="${chartReady}"]`).getByRole("link", { name: /Analizi Aç/ }).click();
      await page.waitForURL(new RegExp(`/human-design/danisanlar/${hd}\\?chart=${chartReady}`), { timeout: 60_000 });
      const chartModal = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
      const opened = await chartModal.getByRole("button", { name: "Word İndir", exact: true }).waitFor({ timeout: 60_000 }).then(() => true, () => false);
      const sub = opened ? (await chartModal.locator("p").first().textContent()) ?? "" : "";
      ok(opened && sub.includes("19:00") && !sub.includes("07:15"), `${d.name}: DY'den ?chart= ile AYNI analiz penceresi açıldı (Word İndir hazır)`);
      ok(await noHScroll(page, d.viewport.width), `${d.name}: DY→HD sayfası yatay kaydırma yok`);
      await page.screenshot({ path: path.join(OUT, `journey-open-${d.name}.png`) });
      allErrors.push(...w.errors);
      allExternal.push(...w.external);
      browserRoxy += w.roxy.length;
      await ctx.close();
    }

    section("Genel");
    ok(browserRoxy === 0 && roxy.state.calls === seedRoxyCalls, "tarayıcı testinde Roxy çağrısı 0 (sunucuda anahtar da yok)", { browserRoxy });
    ok(roxy.state.external.length === 0 && allExternal.length === 0, "harici ağ isteği yok", [...roxy.state.external, ...allExternal].slice(0, 5));
    ok(allErrors.length === 0, "sayfa JS hatası yok", allErrors.slice(0, 5));
    const legacyAfter = JSON.stringify((await su.query(`select * from public.human_design_reports where report_kind='legacy' or schema_version='hd-report-1' order by id`)).rows);
    ok(legacyAfter === legacyBefore, "eski raporlar birebir korundu");
    ok((await su.query(`select 1 from public.human_design_reports where id=$1`, [repReady])).rowCount === 1, "hazır rapor korunuyor");
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD analiz→Word TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
