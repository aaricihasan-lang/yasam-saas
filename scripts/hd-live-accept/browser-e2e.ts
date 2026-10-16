/**
 * HD CANLI KABUL DÜZELTMELERİ (owner talimatı 2026-10-17) — GERÇEK TARAYICI (Chromium).
 *   A — Yeni Danışan: liste gizli → "Danışanı Oluştur ve Analiz Et" → profesyonel harita DOĞRUDAN (tek eylem)
 *   B — Hesap hatası: sahte başarı yok, bilgiler korunur, "Analizi Tekrar Dene" yalnız hesabı ister
 *   C — Küçük premium işlem çubuğu (masaüstü, 390, 360, 320) + TEK "Sil" (iki onay; çift tık tek istek)
 *   D — Analizsiz danışanda silme kontrolü yok; ilk analiz tarihi her zaman görünür; Türkçe alfabetik liste
 *   E — Danışan Yolculuğu kaydında "Human Design Başlat" → "Oluştur ve Analiz Et" → harita doğrudan
 *
 * Next sunucusuna Roxy anahtarı VERİLMEZ. Hesap isteği (POST /api/hd/charts/roxy) Playwright ile BU test
 * sürecindeki GERÇEK route handler'a yönlendirilir (aynı veritabanı, sahte Roxy — çağrılar SAYILIR, gerçek
 * ağ/anahtar YOK). Tüm veri SENTETİK.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-live-accept/browser-e2e.ts [-- --out <klasör>]
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, TB, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-live-accept-browser");
const PORT = 3994;
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
const M390: Device = { name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true, ua: IPHONE };
const M360: Device = { name: "mobil 360", viewport: { width: 360, height: 760 }, mobile: true, ua: IPHONE };
// Android: HD Word indirme uygulamada kasıtlı kapalı (HD-10 kuralı) → çubukta yalnız Sil + Kapat.
const M320: Device = { name: "mobil 320 Android", viewport: { width: 320, height: 640 }, mobile: true, ua: ANDROID };
const COLL = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54432, dirName: "hd-live-accept-browser-pgdata", httpPort: 54523 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  const external: string[] = [];
  const n = async (sql: string, args: unknown[] = []) => Number((await su.query(sql, args)).rows[0].n);
  try {
    const PERMS = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "LABA", TA, PERMS);
    const UB: Auth = await mkUser(su, "LABB", TB, PERMS);
    const jr = await import("../../app/api/hd/clients/journey/route");
    const rr = await import("../../app/api/hd/charts/roxy/route");
    const mk = (u: Auth, o: Json = {}) => callRoute(jr.POST, "POST", u, { action: "create_new", ad: "Zeynep", soyad: "Ak", dogum: "1988-08-08", birth_time: "08:30", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(), ...o });
    const z = await mk(UA);
    const Z = String(z.json.hd_client_id);
    const ZJ = String(z.json.journey_client_id);
    await callRoute(rr.POST, "POST", UA, { client_id: Z, location_id: "client" });
    const a = await mk(UA, { ad: "Ali", soyad: "Can", dogum: "1979-02-02" });
    const ALI = String(a.json.hd_client_id);
    await callRoute(rr.POST, "POST", UA, { client_id: ALI, location_id: "client" });
    const c = await mk(UA, { ad: "Çağrı", soyad: "Er", dogum: "1983-03-03" });
    const CAG = String(c.json.hd_client_id); // analizsiz eski profil
    const OMER = randomUUID();
    await su.query(`insert into public.clients(id, tenant_id, ad, soyad, dogum) values ($1,$2,'Ömer','Bal','1977-07-07')`, [OMER, TA]);
    const ub = await mk(UB, { ad: "Başka", soyad: "Uzman", dogum: "1991-01-01" });
    await callRoute(rr.POST, "POST", UB, { client_id: String(ub.json.hd_client_id), location_id: "client" });
    ok(!!Z && !!ALI && !!CAG, "tohum: Zeynep Ak + Ali Can (analizli), Çağrı Er (analizsiz), Ömer Bal (yalnız Danışan Yolculuğu), başka uzman");
    const seedCalls = roxy.state.calls;

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

    // Sayaçlar: UI'nin gönderdiği hesap / oluşturma / silme istekleri.
    const counts = { compute: 0, create: 0, del: 0 };
    const newPage = async (d: Device): Promise<Page> => {
      const ctx = await browser!.newContext({ viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson(UA, TA, "ZZ_LABA")), UA.token!]);
      // Hesap isteği → bu süreçteki GERÇEK route (sahte Roxy). Sunucu kilit/idempotency mantığı aynen çalışır.
      await ctx.route(`${APP}/api/hd/charts/roxy`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        counts.compute++;
        const r = await callRoute(rr.POST, "POST", UA, route.request().postDataJSON());
        await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.json) });
      });
      const page = await ctx.newPage();
      page.on("request", (r) => {
        const u = r.url();
        if (/\/api\/hd\/clients\/journey/.test(u) && r.method() === "POST") counts.create++;
        if (/\/api\/hd\/clients\?/.test(u) && r.method() === "DELETE") counts.del++;
        if (/roxyapi\.com/.test(u)) external.push(u);
        if (!/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u)) external.push(u);
      });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
      return page;
    };
    const modalOf = (page: Page) => page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
    const noHScroll = (page: Page, w: number) => page.evaluate((wd) => document.documentElement.scrollWidth <= wd + 1, w);
    const pickPlace = async (page: Page, sel: string) => {
      await page.locator(sel).fill("Selçuklu");
      await page.getByRole("option", { name: /Selçuklu/ }).first().click();
    };
    const toolbarCheck = async (page: Page, d: Device) => {
      const m = modalOf(page);
      const actions = m.locator("[data-hd-actions] > button, [data-hd-actions] [data-hd-word-download]");
      const boxes = [] as Array<{ h: number; r: number; x: number }>;
      for (let i = 0; i < (await actions.count()); i++) {
        const b = await actions.nth(i).boundingBox();
        if (b) boxes.push({ h: Math.round(b.height), r: Math.round(b.x + b.width), x: Math.round(b.x) });
      }
      const android = d.ua === ANDROID;
      ok(boxes.length === (android ? 2 : 3) && boxes.every((b) => b.h <= 34), `${d.name}: işlem çubuğu küçük — ${android ? "Sil, Kapat" : "rapor, Sil, Kapat"} ≤ 34 px yükseklik`, boxes);
      ok(boxes.every((b) => b.x >= 0 && b.r <= d.viewport.width + 0.5) && (await noHScroll(page, d.viewport.width)), `${d.name}: düğmeler ekrana sığıyor, üst üste binme / yatay taşma yok`, boxes);
      if (!android) {
        const word = m.locator("[data-hd-word-download]");
        const style = await word.evaluate((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundImage, fs: parseFloat(cs.fontSize), tt: cs.textTransform }; });
        ok(style.bg === "none" && style.fs <= 12.5 && style.tt !== "uppercase", `${d.name}: rapor düğmesi nötr (gradyan yok), küçük yazı, büyük harf değil`, style);
        ok((await m.getByText(/^Raporu (Hazırla|İndir)$/).count()) === 1, `${d.name}: kısa etiket ('Raporu Hazırla' / 'Raporu İndir')`);
      }
      const tb = await m.locator("[data-hd-toolbar]").boundingBox();
      ok(!!tb && tb.height <= (d.mobile ? 190 : 110), `${d.name}: işlem çubuğu haritayı gereksiz aşağı itmiyor (yükseklik ${Math.round(tb?.height ?? 0)} px)`);
    };

    // ══ A — Yeni Danışan → tek eylemle analiz ══════════════════════════════════
    for (const [i, d] of [DESKTOP, M390].entries()) {
      section(`A — Yeni Danışan → Oluştur ve Analiz Et — ${d.name}`);
      const page = await newPage(d);
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator(`[data-hd-group="hd:${Z}"]`).waitFor({ timeout: 90_000 });
      const names = await page.locator("[data-hd-group] p.text-\\[15px\\]").allInnerTexts();
      ok(names.length >= 3 && names.every((nm, k) => k === 0 || COLL.compare(names[k - 1]!, nm) <= 0), `${d.name}: liste Türkçe alfabetik`, names);
      ok((await page.locator("[data-hd-first-analysis-toggle]").count()) === 0 && (await page.locator(`[data-hd-group="hd:${Z}"] [data-hd-group-first]`).count()) === 1, `${d.name}: ilk analiz tarihi her zaman görünür, göster/gizle kutusu yok`);
      await page.locator("[data-hd-new-analysis]").click();
      await page.locator("#hd-new-ad").waitFor();
      ok((await page.locator("[data-hd-analysis-groups]").count()) === 0 && (await page.locator('input[type="search"]').count()) === 0, `${d.name}: Yeni Danışan açılınca ana liste ve arama GİZLİ`);
      const body = await page.locator("body").innerText();
      ok(!/Zeynep Ak|Ali Can|Çağrı Er/.test(body), `${d.name}: form altında danışan isimleri yok`);
      ok(await noHScroll(page, d.viewport.width), `${d.name}: form ekrana sığıyor`);
      const backColor = await page.locator("[data-hd-new-analysis]").evaluate((el) => getComputedStyle(el).color);
      const rgb = (backColor.match(/\d+/g) ?? []).slice(0, 3).map(Number);
      ok((await page.locator("[data-hd-new-analysis]").innerText()).includes("Listeye Dön") && rgb.length === 3 && rgb.every((v) => v < 90), `${d.name}: '← Listeye Dön' yazısı hemen okunur (koyu renk, geçiş animasyonu yok)`, backColor);
      await page.screenshot({ path: path.join(OUT, `A-yeni-danisan-${d.name}.png`), fullPage: true });
      const soyad = i === 0 ? "Masaüstü" : "Mobil";
      await page.locator("#hd-new-ad").fill("Selin");
      await page.locator("#hd-new-soyad").fill(soyad);
      await page.locator("#hd-new-dogum").fill(`1${i}061993`.slice(0, 8));
      await page.locator("#hd-new-saat").fill("1120");
      await pickPlace(page, "#hd-new-client-birth-place");
      const save = page.locator("[data-hd-new-client-save]");
      ok((await save.innerText()).trim() === "Danışanı Oluştur ve Analiz Et", `${d.name}: düğme 'Danışanı Oluştur ve Analiz Et'`);
      const c0 = { ...counts };
      const r0 = roxy.state.calls;
      const hd0 = await n(`select count(*)::int n from public.human_design_clients where tenant_id=$1`, [TA]);
      await save.dblclick();
      const m = modalOf(page);
      await m.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 90_000 });
      ok((await m.locator("#hd-computed-detay-title").innerText()).includes(`Selin ${soyad}`), `${d.name}: profesyonel BodyGraph doğrudan açıldı (doğru danışan)`);
      ok(new URL(page.url()).pathname === "/human-design/danisanlar", `${d.name}: ara sayfa / boş analiz sayfası yok`);
      ok((await m.getByRole("button", { name: /Hesapla/ }).count()) === 0 && (await page.getByRole("button", { name: /Haritasını Hesapla|Haritayı Hesapla/ }).count()) === 0, `${d.name}: ikinci 'Haritayı Hesapla' düğmesi yok`);
      ok(counts.create - c0.create === 1 && counts.compute - c0.compute === 1 && roxy.state.calls - r0 === 1, `${d.name}: çift tıklama → 1 oluşturma + 1 hesap isteği + 1 Roxy çağrısı`, { create: counts.create - c0.create, compute: counts.compute - c0.compute, roxy: roxy.state.calls - r0 });
      const newHd = (await su.query(`select id from public.human_design_clients where tenant_id=$1 and name=$2`, [TA, `Selin ${soyad}`])).rows;
      ok((await n(`select count(*)::int n from public.human_design_clients where tenant_id=$1`, [TA])) === hd0 + 1 && newHd.length === 1 && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [newHd[0]!.id])) === 1, `${d.name}: tek danışan + tek analiz kaydı`);
      await toolbarCheck(page, d);
      await page.screenshot({ path: path.join(OUT, `A-harita-${d.name}.png`) });
      await m.getByRole("button", { name: "Kapat" }).click();
      await page.locator(`[data-hd-group="hd:${newHd[0]!.id}"]`).waitFor({ timeout: 30_000 });
      ok((await page.locator("[data-hd-analysis-groups]").count()) === 1, `${d.name}: harita kapanınca aynı tek liste geri gelir; yeni danışan listede`);
      await page.context().close();
    }

    // ══ B — Hesap hatası + güvenli yeniden deneme ══════════════════════════════
    section("B — Hesap hatası → bilgiler korunur → 'Analizi Tekrar Dene' (mobil 390)");
    {
      const page = await newPage(M390);
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator("[data-hd-new-analysis]").click();
      await page.locator("#hd-new-ad").fill("Hata");
      await page.locator("#hd-new-soyad").fill("Deneme");
      await page.locator("#hd-new-dogum").fill("05051985");
      await page.locator("#hd-new-saat").fill("0505");
      await pickPlace(page, "#hd-new-client-birth-place");
      roxy.state.fail = "network";
      await page.locator("[data-hd-new-client-save]").click();
      await page.locator("[data-hd-new-compute-error]").waitFor({ timeout: 90_000 });
      roxy.state.fail = "none";
      const hdId = (await su.query(`select id from public.human_design_clients where tenant_id=$1 and name='Hata Deneme'`, [TA])).rows[0]?.id as string;
      ok((await modalOf(page).count()) === 0 && !!hdId && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [hdId])) === 0, "hata → sahte başarı yok (harita açılmadı, analiz kaydı yok), danışan kaydı korundu");
      ok((await page.locator("#hd-new-ad").inputValue()) === "Hata" && (await page.locator("#hd-new-saat").inputValue()) === "05:05" && (await page.locator("#hd-new-ad").isDisabled()), "girilen bilgiler kaybolmadı (alanlar kilitli, değerler duruyor)");
      ok((await page.locator("[data-hd-new-client-save]").innerText()).trim() === "Analizi Tekrar Dene", "güvenli yeniden deneme düğmesi");
      await page.screenshot({ path: path.join(OUT, "B-hata.png"), fullPage: true });
      const c0 = counts.create;
      await page.locator("[data-hd-new-client-save]").click();
      await modalOf(page).locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 150_000 });
      ok(counts.create === c0 && (await n(`select count(*)::int n from public.human_design_clients where tenant_id=$1 and name='Hata Deneme'`, [TA])) === 1 && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [hdId])) === 1,
        "yeniden deneme YALNIZ hesabı istedi (danışan tekrar oluşturulmadı) → tek analiz, harita açıldı");
      await page.context().close();
    }

    // ══ C — İşlem çubuğu (360/320) + TEK Sil ═══════════════════════════════════
    for (const d of [M360, M320]) {
      section(`C — Kayıtlı harita + işlem çubuğu — ${d.name}`);
      const page = await newPage(d);
      await page.goto(`${APP}/human-design/danisanlar`);
      const r0 = roxy.state.calls;
      const cmp0 = counts.compute;
      await page.locator(`[data-hd-group-open="${ALI}"]`).click();
      await modalOf(page).locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 90_000 });
      ok(roxy.state.calls === r0 && counts.compute === cmp0, `${d.name}: Detayı Aç → kayıtlı harita, Roxy/hesap isteği 0`);
      await toolbarCheck(page, d);
      await page.screenshot({ path: path.join(OUT, `C-arac-cubugu-${d.name}.png`) });
      await page.context().close();
    }
    section("C — TEK 'Sil': iki onay, çift tık tek istek (mobil 360)");
    {
      const page = await newPage(M360);
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator(`[data-hd-group-open="${Z}"]`).click();
      const m = modalOf(page);
      await m.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 90_000 });
      ok((await m.locator("[data-hd-delete-open]").count()) === 1 && (await m.getByRole("button", { name: /Analizi Sil|Tamamen Sil/ }).count()) === 0, "yalnız bir 'Sil' seçeneği");
      await m.locator("[data-hd-delete-open]").click();
      const dlg = page.locator("[data-hd-full-delete]");
      await dlg.locator("[data-hd-full-delete-counts]").waitFor({ timeout: 30_000 });
      const t1 = await dlg.innerText();
      ok(t1.includes("Bu danışana ait bütün Human Design analizleri, haritaları ve raporları kalıcı olarak silinecek.") && t1.includes("Zeynep Ak") && /1 Human Design analizi/.test(t1), "1. onay: owner metni + doğru danışan + kesin kapsam", t1.slice(0, 300));
      ok((await dlg.getByRole("button", { name: "Vazgeç" }).count()) === 1 && (await dlg.getByRole("button", { name: "Devam Et" }).count()) === 1, "1. onay düğmeleri: Vazgeç / Devam Et");
      await dlg.getByRole("button", { name: "Devam Et" }).click();
      ok((await n(`select count(*)::int n from public.human_design_clients where id=$1`, [Z])) === 1, "ilk onay veri silmez");
      const t2 = await dlg.innerText();
      ok(t2.includes("Zeynep Ak için tüm Human Design kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?") && (await dlg.getByRole("button", { name: "Evet, Sil" }).count()) === 1 && (await dlg.locator("input").count()) === 0,
        "2. onay: owner metni, Vazgeç / Evet, Sil; ad / 'SİL' yazdırma yok");
      const box = await dlg.boundingBox();
      ok(!!box && box.x >= 0 && box.x + box.width <= M360.viewport.width + 0.5, "onay penceresi 360 px'e sığıyor", box);
      await page.screenshot({ path: path.join(OUT, "C-sil-son-onay-360.png") });
      const d0 = counts.del;
      await dlg.getByRole("button", { name: "Evet, Sil" }).dblclick();
      await page.locator("[data-hd-list-notice]").filter({ hasText: "kayıtları silindi" }).waitFor({ timeout: 30_000 });
      ok(counts.del - d0 === 1, "çift tıklama → tek silme isteği", counts.del - d0);
      ok((await n(`select count(*)::int n from public.human_design_clients where id=$1`, [Z])) === 0 && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [Z])) === 0, "Zeynep Ak'ın tüm HD kayıtları silindi");
      ok((await n(`select count(*)::int n from public.clients where id=$1`, [ZJ])) === 1 && (await n(`select count(*)::int n from public.human_design_clients where id=$1`, [ALI])) === 1, "Danışan Yolculuğu ana kaydı ve başka danışan korundu");
      await page.context().close();
    }

    // ══ D — Analizsiz danışanda silme yok ═════════════════════════════════════
    section("D — Analizsiz danışan: silme kontrolü yok");
    {
      const page = await newPage(DESKTOP);
      await page.goto(`${APP}/human-design/danisanlar`);
      const row = page.locator(`[data-hd-group="hd:${CAG}"]`);
      await row.waitFor({ timeout: 60_000 });
      ok((await row.locator('[data-hd-group-status="empty"]').count()) === 1 && (await row.locator("[data-hd-group-first]").count()) === 0 && (await row.getByRole("button", { name: /Sil/ }).count()) === 0, "listede analizsiz satır: uydurma tarih yok, Sil yok");
      await page.goto(`${APP}/human-design/danisanlar/${CAG}`);
      await page.locator("[data-hd-autocalc]").waitFor({ timeout: 60_000 });
      ok((await page.locator("[data-hd-danger-zone], [data-hd-full-delete-open], [data-hd-delete-open]").count()) === 0 && (await page.getByRole("button", { name: /Sil$|Tamamen Sil/ }).count()) === 0, "analizi olmayan danışan sayfasında büyük tehlikeli silme paneli / Sil düğmesi yok");
      await page.screenshot({ path: path.join(OUT, "D-analizsiz.png"), fullPage: true });
      await page.context().close();
    }

    // ══ E — Danışan Yolculuğu kaydı: Human Design Başlat → tek eylem ═══════════
    section("E — 'Human Design Başlat' → Oluştur ve Analiz Et (masaüstü)");
    {
      const page = await newPage(DESKTOP);
      await page.goto(`${APP}/human-design/danisanlar`);
      await page.locator("[data-hd-analysis-search]").fill("ömer bal");
      await page.locator(`[data-hd-group-start="${OMER}"]`).click();
      const start = page.locator(`[data-hd-profile-start="${OMER}"]`);
      await start.waitFor();
      await start.locator("[data-hd-time-input]").fill("0707");
      await pickPlace(page, `#hd-start-yer-${OMER}`);
      const r0 = roxy.state.calls;
      await start.locator("[data-hd-profile-start-save]").click();
      const m = modalOf(page);
      await m.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 90_000 });
      ok((await m.locator("#hd-computed-detay-title").innerText()).includes("Ömer Bal") && roxy.state.calls - r0 === 1 && new URL(page.url()).pathname === "/human-design/danisanlar",
        "profil + analiz tek eylemle; profesyonel harita doğrudan açıldı (ara sayfa yok, 1 Roxy)");
      await page.context().close();
    }

    section("Genel");
    ok(roxy.state.calls - seedCalls === 5, "toplam Roxy çağrısı = bilinçli hesap eylemi sayısı (2 yeni danışan + 1 hatalı + 1 yeniden deneme + 1 başlat)", roxy.state.calls - seedCalls);
    ok(external.length === 0 && roxy.state.external.length === 0, "harici ağ isteği yok", external.slice(0, 5));
    ok(errors.length === 0, "sayfa JS hatası yok", errors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    roxy.restore();
    await env.stop();
  }
  console.log(`\nHD CANLI KABUL TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) { for (const f of fails) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
