/**
 * HD — TEK ANALİZ LİSTESİ + MÜKERRER UYARILARI: GERÇEK TARAYICI TESTİ.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-single-list-dup/browser-e2e.ts [-- --out <klasör>]
 *
 * Next sunucusuna Roxy anahtarı VERİLMEZ → tarayıcı akışında ücretli çağrı imkânsız (onaylı yeniden
 * hesaplama 503 AUTO_CALC_NOT_CONFIGURED ile mükerrer kapısını GEÇTİĞİNİ kanıtlar). Veri sentetik.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-single-list-browser");
const PORT = 3989;
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
const DEVICES: Device[] = [
  { name: "masaüstü 1366", viewport: { width: 1366, height: 900 }, mobile: false },
  { name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" },
];

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54422, dirName: "hd-single-list-browser-pgdata", httpPort: 54523 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  const external: string[] = [];
  let roxyReq = 0;
  try {
    const U: Auth = await mkUser(su, "SLBR", TA, { human_design: true, clients: true, hd_system_reading: true });
    const journeyRoute = await import("../../app/api/hd/clients/journey/route");
    const roxyRoute = await import("../../app/api/hd/charts/roxy/route");
    const mk = (over: Json = {}) => callRoute(journeyRoute.POST, "POST", U, { action: "create_new", ad: "Hasan", soyad: "Arıcı", dogum: "1990-05-01", birth_time: "10:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(), ...over });
    const a = await mk();
    const PA = String(a.json.hd_client_id);
    const ca = await callRoute(roxyRoute.POST, "POST", U, { client_id: PA, location_id: "client" });
    const chartA = String(ca.json.id);
    const dupb = await mk();
    const b = await mk({ acknowledged_duplicate_keys: ((dupb.json.candidates ?? []) as Json[]).map((c) => c.key) });
    const PB = String(b.json.hd_client_id);
    await mk({ ad: "Analizsiz", soyad: "Kişi", dogum: "1999-09-09" });
    await su.query(`
      with p as (
        insert into public.human_design_clients(id, tenant_id, name, birth_date) select gen_random_uuid(), $1, 'ZZ Sayfa Kişi ' || lpad(g::text, 2, '0'), date '1970-01-01' + g from generate_series(1, 25) g returning id, name, birth_date
      ) insert into public.human_design_charts(tenant_id, client_id, client_name, birth_date, source, type_code, profile_code, created_at)
        select $1, p.id, p.name, p.birth_date, 'manual', 'generator', '1/3', now() - interval '30 days' from p`, [TA]);
    ok(ca.json.ok === true && !!PB && roxy.state.calls === 1, "tohum: Hasan Arıcı (1 analiz) + aynı bilgilerle 2. profil + analizsiz kişi + 25 sayfa kişisi");
    roxy.restore();

    const user: Json = {
      id: U.id, tenant_id: TA, full_name: "ZZ_SLBR", email: "zz.slbr@example.test", role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false,
      module_permissions: { human_design: true, clients: true, hd_system_reading: true },
    };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    const newPage = async (d: Device): Promise<Page> => {
      const ctx = await browser!.newContext({ viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(user), U.token!]);
      const page = await ctx.newPage();
      page.on("request", (r) => {
        const u = r.url();
        if (/roxyapi\.com/.test(u)) roxyReq++;
        if (!/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u)) external.push(u);
      });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
      return page;
    };
    const hdCount = async () => Number((await su.query(`select count(*)::int n from public.human_design_clients where tenant_id=$1`, [TA])).rows[0].n);

    for (const d of DEVICES) {
      section(`Ana sayfa — ${d.name}`);
      const page = await newPage(d);
      await page.goto(`${APP}/human-design/danisanlar`);
      const groups = page.locator("[data-hd-analysis-groups]");
      await groups.locator("[data-hd-group]").first().waitFor({ timeout: 90_000 });
      ok(await page.getByRole("heading", { name: "Human Design Analizlerim" }).isVisible(), `${d.name}: başlık 'Human Design Analizlerim'`);
      ok((await page.locator("[data-hd-analysis-history], [data-hd-profiles], [data-hd-journey-picker]").count()) === 0, `${d.name}: UX-01 eski üç liste yok (tek liste)`);
      ok((await page.getByRole("button", { name: /Word|Rapor/ }).count()) === 0 && (await page.getByRole("link", { name: /Word/ }).count()) === 0, `${d.name}: UX-08 ana sayfada Word / rapor butonu yok`);
      ok((await groups.locator("[data-hd-group]").count()) === 20 && (await groups.locator("[data-hd-analysis-more]").isVisible()), `${d.name}: ilk sayfa 20 satır + 'Daha fazla göster'`);
      const total = Number(await groups.locator("[data-hd-analysis-total]").getAttribute("data-hd-analysis-total"));
      const dbTotal = Number((await su.query(`select count(distinct client_id)::int n from public.human_design_charts where tenant_id=$1`, [TA])).rows[0].n);
      await groups.locator("[data-hd-analysis-more]").click();
      await page.waitForFunction(() => document.querySelectorAll("[data-hd-group]").length > 20, null, { timeout: 15_000 });
      ok(total === dbTotal && (await groups.locator("[data-hd-group]").count()) === total && (await groups.locator("[data-hd-analysis-more]").count()) === 0, `${d.name}: 'Daha fazla göster' tüm analizli danışanları getirir (${dbTotal} = DB'deki analizli profil sayısı)`, { total, dbTotal });
      ok((await groups.getByText("Analizsiz Kişi").count()) === 0, `${d.name}: UX-02 analizsiz profil listede yok`);
      await page.locator("[data-hd-analysis-search]").fill("ARICI hasan");
      await page.waitForFunction(() => document.querySelectorAll("[data-hd-group]").length === 1, null, { timeout: 15_000 });
      const row = groups.locator("[data-hd-group]").first();
      ok((await row.innerText()).includes("Hasan Arıcı") && (await row.locator("[data-hd-group-linked]").innerText()).includes("Danışan Yolculuğu'na bağlı"), `${d.name}: arama (ad+soyad, büyük harf) + yeşil bağlantı yazısı`);
      ok(await page.evaluate((w) => document.documentElement.scrollWidth <= w + 1, d.viewport.width), `${d.name}: yatay taşma yok`);
      await page.screenshot({ path: path.join(OUT, `liste-${d.name}.png`), fullPage: true });
      await row.locator(`[data-hd-group-open="${PA}"]`).click();
      await page.waitForURL(new RegExp(`/human-design/danisanlar/${PA}`), { timeout: 30_000 });
      const hist = page.locator("[data-hd-analysis-history]");
      await hist.locator(`[data-hd-history-item$=":${chartA}"]`).waitFor({ timeout: 60_000 });
      // Word yalnız ANDROID'de gizlidir (mevcut kural); iPhone tarayıcısı ve masaüstünde görünür.
      ok(await hist.locator(`[data-hd-history-word="${chartA}"]`).getByText("Danışan Raporunu Hazırla").isVisible(), `${d.name}: UX-09 detayda 'Danışan Raporunu Hazırla' (doğru analiz satırında)`);
      ok((await hist.locator(`[data-hd-history-word="${chartA}"]`).count()) === 1 && (await hist.locator("[data-hd-history-word]").count()) === 1, `${d.name}: rapor eylemi analiz kimliğine bağlı (UX-10)`);
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator("[data-hd-profiles-link]").click();
      await page.waitForURL(/\/human-design\/danisanlar\/profiller/, { timeout: 30_000 });
      await page.getByText("Analizsiz Kişi").first().waitFor({ timeout: 60_000 });
      ok(true, `${d.name}: analizsiz profil 'Tüm Human Design profilleri' ekranında erişilebilir`);
      await page.context().close();
    }

    section("Yeni danışan — mükerrer uyarısı (masaüstü)");
    {
      const page = await newPage(DEVICES[0]!);
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator("[data-hd-new-analysis]").click();
      await page.getByRole("tab", { name: "Yeni Danışan" }).click();
      const fill = async () => {
        await page.locator("#hd-new-ad").fill("HASAN ");
        await page.locator("#hd-new-soyad").fill("  ARICI");
        await page.locator("#hd-new-dogum").fill("1990-05-01");
        await page.locator("#hd-new-saat").fill("10:00");
        await page.locator("#hd-new-client-birth-place").fill("Selçuklu");
        await page.getByRole("option", { name: /Selçuklu/ }).first().click();
      };
      await fill();
      const n0 = await hdCount();
      await page.locator("[data-hd-new-client-save]").click();
      const dlg = page.locator('[data-hd-duplicate-dialog="client"]');
      await dlg.waitFor({ timeout: 30_000 });
      const cands = await dlg.locator("[data-hd-duplicate-candidate]").count();
      ok(cands === 2 && (await dlg.getByText("Tüm doğum bilgileri aynı").count()) === 2 && (await dlg.getByText("Danışan Yolculuğu'na bağlı").count()) === 2, "DUP-01 birebir aynı bilgiler → uyarı, iki aday, alanlar ve bağlantı görünür", cands);
      ok(await page.evaluate(() => document.activeElement?.hasAttribute("data-hd-duplicate-open") ?? false), "varsayılan odak güvenli eylemde ('Mevcut Danışanı Aç')");
      await page.screenshot({ path: path.join(OUT, "mukerrer-uyari.png") });
      await dlg.locator("[data-hd-duplicate-cancel]").click();
      await dlg.waitFor({ state: "detached" });
      ok((await hdCount()) === n0, "DUP-09 'Vazgeç' hiçbir kayıt oluşturmaz");
      await page.locator("[data-hd-new-client-save]").click();
      await dlg.waitFor();
      await dlg.locator(`[data-hd-duplicate-open="hd:${PA}"]`).click();
      await page.waitForURL(new RegExp(`/human-design/danisanlar/${PA}`), { timeout: 30_000 });
      ok((await hdCount()) === n0, "DUP-07 'Mevcut Danışanı Aç' doğru kaydı açar, yeni kayıt yok");
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator("[data-hd-new-analysis]").click();
      await page.getByRole("tab", { name: "Yeni Danışan" }).click();
      await fill();
      await page.locator("[data-hd-new-client-save]").click();
      await dlg.waitFor();
      await dlg.locator("[data-hd-duplicate-proceed]").click();
      await page.waitForURL(/\/human-design\/danisanlar\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      ok((await hdCount()) === n0 + 1 && !page.url().includes(PA) && !page.url().includes(PB), "DUP-08 'Farklı Kişi, Yine de Devam Et' bilinçli onayla yeni kayıt oluşturur");
      await page.context().close();
    }

    section("Roxy öncesi uyarı (aynı bilgili ikinci profil)");
    for (const d of DEVICES) {
      const page = await newPage(d);
      const roxyPosts: Json[] = [];
      page.on("response", async (r) => {
        if (/\/api\/hd\/charts\/roxy$/.test(r.url()) && r.request().method() === "POST") roxyPosts.push({ status: r.status(), body: (await r.json().catch(() => ({}))) as Json, req: JSON.parse(r.request().postData() ?? "{}") });
      });
      await page.goto(`${APP}/human-design/danisanlar/${PB}`);
      const calcBtn = page.getByRole("button", { name: "Human Design Haritasını Hesapla" });
      await calcBtn.waitFor({ timeout: 90_000 });
      await calcBtn.click();
      const dlg = page.locator('[data-hd-duplicate-dialog="chart"]');
      await dlg.waitFor({ timeout: 30_000 });
      ok(roxyPosts[0]?.status === 409 && (roxyPosts[0]?.body as Json).code === "POSSIBLE_DUPLICATE_CHART", `${d.name}: DUP-11 Roxy öncesi sunucu uyarısı (409, ücretli çağrı yok)`, roxyPosts[0]);
      ok((await dlg.innerText()).includes("Roxy API hakkınızı") && (await dlg.locator("[data-hd-duplicate-proceed]").innerText()).includes("Farklı Kişi, Yeni Hesaplama Yap"), `${d.name}: uyarı metni + seçenekler`);
      ok(await page.evaluate((w) => document.documentElement.scrollWidth <= w + 1, d.viewport.width), `${d.name}: uyarı penceresi taşmıyor`);
      await page.screenshot({ path: path.join(OUT, `roxy-uyari-${d.name}.png`) });
      await dlg.locator("[data-hd-duplicate-cancel]").click();
      await dlg.waitFor({ state: "detached" });
      ok(roxyPosts.length === 1, `${d.name}: 'Vazgeç' yeni istek göndermez`);
      await calcBtn.click();
      await dlg.waitFor();
      await dlg.locator(`[data-hd-duplicate-open="chart:${chartA}"]`).click();
      const modal = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
      await modal.locator("#hd-computed-detay-title").getByText("Hasan Arıcı").waitFor({ timeout: 60_000 });
      await modal.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 60_000 });
      const pbCharts = Number((await su.query(`select count(*)::int n from public.human_design_charts where client_id=$1`, [PB])).rows[0].n);
      ok((await modal.innerText()).includes("Hasan Arıcı") && pbCharts === 0, `${d.name}: 'Mevcut Analizi Aç' mevcut analizi açar; bu profile bağlanmaz (DUP-12)`);
      ok(await modal.locator("[data-hd-word-download]").getByText(/Danışan Raporunu (İndir|Hazırla)/).isVisible(), `${d.name}: analiz detayında 'Danışan Raporu' eylemi`);
      await modal.getByRole("button", { name: "Kapat" }).click();
      await calcBtn.click();
      await dlg.waitFor();
      await dlg.locator("[data-hd-duplicate-proceed]").click();
      await page.waitForFunction(() => !document.querySelector('[data-hd-duplicate-dialog="chart"]'), null, { timeout: 30_000 });
      await page.waitForTimeout(500);
      const last = roxyPosts[roxyPosts.length - 1]!;
      ok(Array.isArray((last.req as Json).acknowledged_duplicate_keys) && last.status === 503 && (last.body as Json).code === "AUTO_CALC_NOT_CONFIGURED", `${d.name}: 'Farklı Kişi' onayı mükerrer kapısını geçer (bu test sunucusunda Roxy anahtarı yok → 503, gerçek çağrı imkânsız)`, last);
      await page.context().close();
    }

    section("Genel");
    ok(roxyReq === 0, "tarayıcıdan Roxy'ye doğrudan istek yok");
    ok(external.length === 0, "harici ağ isteği yok", external.slice(0, 5));
    ok(errors.length === 0, "sayfa JS hatası yok", errors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD TEK LİSTE + MÜKERRER TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) { for (const f of fails) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
