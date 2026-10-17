/**
 * HD SATIŞ ÖNCESİ NİHAİ KAPANIŞ — GERÇEK TARAYICI (Chromium): tek liste, Detayı Aç, TEK "Sil" (iki onay —
 * 2026-10-17), ilk analiz tarihi her zaman görünür, mobil elle tarih/saat, 320 px.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-final-close/browser-e2e.ts [-- --out <klasör>]
 * Next sunucusuna Roxy anahtarı VERİLMEZ → tarayıcıda ücretli çağrı imkânsız; istekler ayrıca sayılır.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, TB, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-final-close-browser");
const PORT = 3991;
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
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const DESKTOP: Device = { name: "masaüstü 1366", viewport: { width: 1366, height: 900 }, mobile: false };
const MOBILE: Device = { name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true, ua: IPHONE };
const NARROW: Device = { name: "mobil 320", viewport: { width: 320, height: 640 }, mobile: true, ua: ANDROID };

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54432, dirName: "hd-final-close-browser-pgdata", httpPort: 54523 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  let roxyReq = 0;
  try {
    const PERMS = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "FCBA", TA, PERMS);
    const UB: Auth = await mkUser(su, "FCBB", TB, PERMS);
    const jr = await import("../../app/api/hd/clients/journey/route");
    const rr = await import("../../app/api/hd/charts/roxy/route");
    const mk = (u: Auth, o: Json = {}) => callRoute(jr.POST, "POST", u, { action: "create_new", ad: "Aylin", soyad: "Kara", dogum: "1988-08-08", birth_time: "08:30", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(), ...o });
    const c = await mk(UA);
    const P = String(c.json.hd_client_id);
    const J = String(c.json.journey_client_id);
    const a1 = await callRoute(rr.POST, "POST", UA, { client_id: P, location_id: "client" });
    await su.query(`update public.human_design_clients set birth_time='09:45' where id=$1`, [P]);
    const a2 = await callRoute(rr.POST, "POST", UA, { client_id: P, location_id: "client" });
    const A1 = String(a1.json.id);
    const A2 = String(a2.json.id);
    const second = await mk(UA, { ad: "Deniz", soyad: "Ak", dogum: "1990-01-01" });
    const D = String(second.json.hd_client_id);
    await callRoute(rr.POST, "POST", UA, { client_id: D, location_id: "client" });
    const ub = await mk(UB, { ad: "Başka", soyad: "Uzman", dogum: "1991-01-01" });
    await callRoute(rr.POST, "POST", UB, { client_id: String(ub.json.hd_client_id), location_id: "client" });
    ok(!!A1 && !!A2 && A1 !== A2, "tohum: Aylin Kara (2 analiz) + Deniz Ak (1 analiz) + başka uzmanın danışanı");
    roxy.restore();

    const userJson = (u: Auth, t: string, name: string): Json => ({
      id: u.id, tenant_id: t, full_name: name, email: `${name.toLowerCase()}@example.test`, role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: PERMS,
    });
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    const newPage = async (d: Device, u: Auth = UA, t = TA, name = "ZZ_FCBA"): Promise<Page> => {
      const ctx = await browser!.newContext({ viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson(u, t, name)), u.token!]);
      const page = await ctx.newPage();
      page.on("request", (r) => { if (/\/api\/hd\/charts\/roxy|roxyapi\.com/.test(r.url())) roxyReq++; });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
      return page;
    };
    const groupRow = (page: Page, hd: string) => page.locator(`[data-hd-group="hd:${hd}"]`);

    for (const d of [DESKTOP, MOBILE, NARROW]) {
      section(`Tek liste — ${d.name}`);
      const page = await newPage(d);
      await page.goto(`${APP}/human-design/danisanlar`);
      await groupRow(page, P).waitFor({ timeout: 90_000 });
      ok((await page.locator("[data-hd-analysis-groups]").count()) === 1 && (await page.locator("[data-hd-journey-picker], [data-hd-profiles], [data-hd-analysis-history]").count()) === 0, `${d.name}: A01/A02 tek ana danışan listesi (seçici / profil tablosu / ikinci liste yok)`);
      ok((await page.locator('input[type="search"]').count()) === 1, `${d.name}: tek danışan arama alanı`);
      await page.locator("[data-hd-new-analysis]").click();
      await page.locator("#hd-new-ad").waitFor();
      ok((await page.locator("[data-hd-workspace-client] ul, [data-hd-workspace-client] [role=listbox]").count()) === 0, `${d.name}: A03 'Yeni Danışan' alanında tekrar eden danışan listesi yok`);
      await page.locator("#hd-new-dogum").fill("10041992");
      await page.locator("#hd-new-saat").fill("1430");
      ok((await page.locator("#hd-new-dogum").inputValue()) === "10.04.1992" && (await page.locator("#hd-new-saat").inputValue()) === "14:30", `${d.name}: MOB-01/02 doğum tarihi ve saati ELLE yazılır (10.04.1992 · 14:30)`);
      await page.locator("#hd-new-saat").fill("2560");
      ok(await page.getByText("Saati SS:DD biçiminde girin").isVisible(), `${d.name}: geçersiz saat (25:60) açık uyarı`);
      await page.locator("[data-hd-new-analysis]").click();
      await groupRow(page, P).waitFor({ timeout: 60_000 }); // form kapanınca tek liste yeniden yüklenir
      ok(await page.evaluate((w) => document.documentElement.scrollWidth <= w + 1, d.viewport.width), `${d.name}: yatay taşma yok`);
      const firstTxt = await groupRow(page, P).locator("[data-hd-group-first]").count();
      ok(firstTxt === 1, `${d.name}: D01 ilk analiz tarihi görünür`);
      await page.screenshot({ path: path.join(OUT, `liste-${d.name}.png`), fullPage: true });
      await page.context().close();
    }

    section("Detayı Aç — kayıtlı harita doğrudan (masaüstü)");
    {
      const page = await newPage(DESKTOP);
      await page.goto(`${APP}/human-design/danisanlar`);
      const roxyBefore = roxyReq;
      const urlBefore = page.url();
      await groupRow(page, P).locator(`[data-hd-group-open="${P}"]`).click();
      const modal = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
      await modal.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 60_000 });
      ok(page.url() === urlBefore, "C01/C02 Detayı Aç: ara sayfa / profil ekranı yok — kayıtlı profesyonel harita doğrudan açıldı");
      ok((await modal.locator("p").filter({ hasText: "09:45" }).count()) >= 1, "C06 en güncel analiz (09:45) açıldı");
      ok((await modal.getByRole("button", { name: /Hesapla|Yeni Analiz Yap/ }).count()) === 0, "C03 pencerede 'Yeni Analiz Yap' / hesapla düğmesi yok");
      const sw = modal.locator("[data-hd-analysis-switch]");
      ok((await sw.locator("option").count()) === 2, "danışanın iki analizi aynı pencereden seçilebilir");
      await sw.selectOption(A1);
      await modal.locator("p").filter({ hasText: "08:30" }).first().waitFor({ timeout: 30_000 });
      ok(true, "C06 seçilen eski analiz (08:30) birebir açıldı");
      ok(roxyReq === roxyBefore, "C04 kayıtlı analizleri açmak / aralarında geçmek Roxy isteği üretmez");
      await page.reload();
      await groupRow(page, P).waitFor({ timeout: 60_000 });
      ok(roxyReq === roxyBefore, "C05 sayfa yenileme Roxy isteği üretmez");
      // 2026-10-17 owner kararı: pencerede TEK "Sil" — "Analizi Sil" / "Tamamen Sil" ayrımı YOK.
      await groupRow(page, P).locator(`[data-hd-group-open="${P}"]`).click();
      await modal.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 60_000 });
      ok((await modal.locator("[data-hd-delete-open]").count()) === 1 && (await modal.getByRole("button", { name: /Analizi Sil|Tamamen Sil/ }).count()) === 0, "pencerede yalnız TEK 'Sil' (analiz/profil seçimi yok)");
      await page.context().close();
    }

    section("TEK 'Sil' — iki onay + geri tuşu (mobil Android)");
    {
      const page = await newPage({ ...MOBILE, ua: ANDROID, name: "Android 390" });
      await page.goto(`${APP}/human-design/danisanlar`);
      await groupRow(page, P).locator(`[data-hd-group-open="${P}"]`).click();
      const modal = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
      await modal.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 60_000 });
      await modal.locator("[data-hd-delete-open]").click();
      const dlg = page.locator("[data-hd-full-delete]");
      await dlg.waitFor();
      await dlg.locator("[data-hd-full-delete-counts]").waitFor();
      ok((await dlg.getAttribute("data-hd-full-delete")) === "1" && (await dlg.innerText()).includes("Danışan Yolculuğu'ndaki ana kayıt korunacaktır") && /2 Human Design analizi/.test(await dlg.innerText()), "1. onay: kapsam (2 analiz) + Danışan Yolculuğu korunur");
      await page.goBack();
      await page.waitForTimeout(400);
      ok((await dlg.count()) === 0 && (await modal.count()) === 1 && (await page.evaluate(() => location.pathname)) === "/human-design/danisanlar", "B13 Android geri hareketi onayı ATLAMAZ: yalnız pencere kapanır, silme yok, sayfa aynı");
      ok((await su.query(`select 1 from public.human_design_clients where id=$1`, [P])).rowCount === 1, "geri hareketi sonrası hiçbir şey silinmedi");
      await modal.locator("[data-hd-delete-open]").click();
      await dlg.locator("[data-hd-full-delete-counts]").waitFor();
      await dlg.locator("[data-hd-full-delete-next]").click();
      ok((await dlg.getAttribute("data-hd-full-delete")) === "2" && (await dlg.innerText()).includes("Aylin Kara için tüm Human Design kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?"), "son onay: danışan adı + geri alınamaz");
      ok((await dlg.locator("input").count()) === 0 && (await su.query(`select 1 from public.human_design_clients where id=$1`, [P])).rowCount === 1, "ad yazdırma yok; 1. onay veri silmedi");
      await page.goBack();
      await page.waitForTimeout(400);
      ok((await dlg.count()) === 0 && (await su.query(`select 1 from public.human_design_clients where id=$1`, [P])).rowCount === 1, "son onayda Android geri → vazgeç, silme yok");
      await modal.locator("[data-hd-delete-open]").click();
      await dlg.locator("[data-hd-full-delete-counts]").waitFor();
      await dlg.locator("[data-hd-full-delete-next]").click();
      await page.screenshot({ path: path.join(OUT, "sil-son-onay.png") });
      await dlg.locator("[data-hd-full-delete-confirm]").click();
      await page.locator("[data-hd-list-notice]").filter({ hasText: "kayıtları silindi" }).waitFor({ timeout: 30_000 });
      ok((await su.query(`select 1 from public.human_design_clients where id=$1`, [P])).rowCount === 0 && (await su.query(`select 1 from public.human_design_charts where client_id=$1`, [P])).rowCount === 0, "B03 HD kaydı tamamen silindi");
      ok((await su.query(`select 1 from public.clients where id=$1`, [J])).rowCount === 1, "B06 Danışan Yolculuğu kaydı korundu");
      ok((await su.query(`select 1 from public.human_design_clients where id=$1`, [D])).rowCount === 1, "başka danışan korundu");
      await page.locator("[data-hd-analysis-search]").fill("aylin kara");
      await page.locator(`[data-hd-group="journey:${J}"]`).waitFor({ timeout: 30_000 });
      ok((await page.locator(`[data-hd-group="journey:${J}"]`).getByRole("button", { name: "Human Design Başlat" }).count()) === 1, "silme sonrası kişi yalnız Danışan Yolculuğu kaydı olarak aranır ('Human Design Başlat')");
      await page.locator(`[data-hd-group-start="${J}"]`).click();
      const start = page.locator(`[data-hd-profile-start="${J}"]`);
      await start.waitFor();
      ok((await start.locator("[data-hd-time-input]").inputValue()) === "", "B09 yeniden başlatmada eski HD doğum saati geri gelmez (alan boş)");
      await page.context().close();
    }

    section("İlk analiz tarihi — her zaman görünür (göster/gizle yok)");
    {
      const page = await newPage(DESKTOP);
      await page.goto(`${APP}/human-design/danisanlar`);
      await groupRow(page, D).waitFor({ timeout: 60_000 });
      ok((await groupRow(page, D).locator("[data-hd-group-first]").count()) === 1 && (await groupRow(page, D).locator("[data-hd-group-last]").count()) === 1 && (await groupRow(page, D).locator("[data-hd-group-count]").count()) === 1, "ilk analiz + son analiz + analiz sayısı görünür");
      ok((await page.locator("[data-hd-first-analysis-toggle]").count()) === 0 && (await page.getByText("İlk analiz tarihini göster").count()) === 0, "'İlk analiz tarihini göster' kutusu yok");
      await page.context().close();
    }

    section("Genel");
    ok(roxyReq === 0, "tarayıcı testinde Roxy isteği 0", roxyReq);
    ok(errors.length === 0, "sayfa JS hatası yok", errors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD NİHAİ KAPANIŞ TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) { for (const f of fails) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
