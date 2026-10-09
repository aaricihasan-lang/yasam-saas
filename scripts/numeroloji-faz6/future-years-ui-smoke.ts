/**
 * NUMEROLOJİ — "Gelecek Yılları Göster" ARAYÜZ SMOKE (gerçek tarayıcı; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul: uygulama sahte env ile build edilmiş olmalı:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
 *   SUPABASE_SERVICE_ROLE_KEY=dummy npx next build
 * Sonra: npx tsx scripts/numeroloji-faz6/future-years-ui-smoke.ts [--out <klasör>]
 *
 * `next start` :3988'de açılır. Tarayıcıda localhost DIŞI tüm istekler iptal edilir; /api/** ağ
 * düzeyinde mock'lanır (entitlements → futureYears true/false). Analiz istemcide hesaplanır.
 * Masaüstü (1366) + mobil (390) × yetki KAPALI/AÇIK: Sonuç Özeti, Numerolojik Analiz, Sayısal
 * Hesaplama, Görsel Rapor; yatay taşma yok; localStorage'daki izin haritası yetki AÇMAZ.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "numeroloji-future-years-ui");
const APP = "http://127.0.0.1:3988";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${String(extra).slice(0, 300)}` : ""}`); }
}

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

const FULL_NOTE_HEAD = "Bu bölümde, kaynak yöntemindeki tüm dönemler";
const CUT_NOTE_HEAD = "Bu bölümde, içinde bulunduğumuz yıla kadar başlamış dönemler";

async function run(browser: Browser, opts: { futureYears: boolean; mobile: boolean; localPermTamper?: boolean }) {
  const tag = `${opts.mobile ? "mobil" : "masaustu"}-${opts.futureYears ? "acik" : "kapali"}${opts.localPermTamper ? "-tamper" : ""}`;
  console.log(`\n[${tag}]`);
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    isMobile: opts.mobile, hasTouch: opts.mobile, locale: "tr-TR",
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const perms: Record<string, boolean> = { numerology: true };
  // Tamper: istemci localStorage'da alt-yetkiyi true yapar — sunucu false derse AÇILMAMALI.
  if (opts.localPermTamper) perms.numerology_future_years = true;
  const user = {
    id: "00000000-0000-4000-8000-0000000000aa", tenant_id: "00000000-0000-4000-8000-0000000000bb",
    full_name: "ZZ_NUM_FUTURE", email: "zz.num.future@example.test", role: "expert", active: true,
    approval_status: "approved", package_type: "premium", plan: "premium", membership_status: "active",
    module_permissions: perms, is_demo_account: false,
  };
  await ctx.addInitScript(([u]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", "zz-dummy-token");
  }, [JSON.stringify(user)]);
  let entitlementCalls = 0;
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1" || url.port !== "3988") return route.abort();
    if (url.pathname === "/api/numeroloji/entitlements") {
      entitlementCalls++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, futureYears: opts.futureYears }) });
    }
    if (url.pathname.startsWith("/api/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, items: [], records: [], data: [] }) });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(`${APP}/numeroloji/analiz`);
  await page.getByPlaceholder("Örn. Hasan Ali").waitFor({ timeout: 60_000 });
  await page.getByPlaceholder("Örn. Hasan Ali").fill("Hasan Ali");
  await page.getByPlaceholder("Örn. YILMAZ").fill("ARICI YILMAZ DEMİR");
  await page.getByPlaceholder("GG/AA/YYYY").fill("14/02/1987");
  await page.getByRole("button", { name: "HESAPLA" }).click();
  await page.getByText("Sonuç Özeti").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200); // entitlements yanıtı + yeniden render
  ok(entitlementCalls >= 1, `${tag}: yetki sunucudan sorgulandı (/api/numeroloji/entitlements)`, entitlementCalls);

  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const bodyText = () => page.evaluate(() => document.body.innerText);

  // Sonuç Özeti
  await page.screenshot({ path: path.join(OUT, `${tag}-ozet.png`), fullPage: true });
  ok(await noHScroll(), `${tag}: Sonuç Özeti yatay taşma yok`);

  // Numerolojik Analiz (düz metin) — Değişim 2038 yalnız AÇIK'ta
  await page.getByRole("button", { name: "Numerolojik Analiz" }).first().click().catch(async () => {
    await page.getByText("Numerolojik Analiz", { exact: true }).first().click();
  });
  await page.waitForTimeout(600);
  let t = await bodyText();
  const has2038 = /2038/.test(t);
  ok(opts.futureYears ? has2038 : !has2038, `${tag}: Numerolojik Analiz Değişim 2038 ${opts.futureYears ? "GÖRÜNÜR" : "GİZLİ"}`);
  ok(t.includes(opts.futureYears ? FULL_NOTE_HEAD : CUT_NOTE_HEAD), `${tag}: doğru bilgi notu`);
  ok(!t.includes(opts.futureYears ? CUT_NOTE_HEAD : FULL_NOTE_HEAD), `${tag}: yanlış not yok`);
  ok(/2026/.test(t), `${tag}: güncel yılı kapsayan dönem (2026) görünür`);
  await page.screenshot({ path: path.join(OUT, `${tag}-analiz.png`), fullPage: true });
  ok(await noHScroll(), `${tag}: Numerolojik Analiz yatay taşma yok`);

  // Sayısal Hesaplama (detaylı)
  await page.getByRole("button", { name: "Sayısal Hesaplama" }).first().click().catch(async () => {
    await page.getByText("Sayısal Hesaplama", { exact: true }).first().click();
  });
  await page.waitForTimeout(600);
  t = await bodyText();
  ok(opts.futureYears ? /2038/.test(t) : !/2038/.test(t), `${tag}: Sayısal Hesaplama 2038 ${opts.futureYears ? "görünür" : "gizli"}`);
  ok(await noHScroll(), `${tag}: Sayısal Hesaplama yatay taşma yok`);

  // Görsel Rapor
  await page.getByRole("button", { name: "Görsel Rapor" }).first().click().catch(async () => {
    await page.getByText("Görsel Rapor", { exact: true }).first().click();
  });
  await page.waitForTimeout(1200);
  t = await bodyText();
  ok(t.includes(opts.futureYears ? FULL_NOTE_HEAD : CUT_NOTE_HEAD), `${tag}: Görsel Rapor notu yetkiyle tutarlı`);
  ok(opts.futureYears ? /2038/.test(t) : !/2038/.test(t), `${tag}: Görsel Rapor Değişim 2038 ${opts.futureYears ? "görünür" : "gizli"}`);
  await page.screenshot({ path: path.join(OUT, `${tag}-gorsel.png`), fullPage: true });
  ok(await noHScroll(), `${tag}: Görsel Rapor yatay taşma yok`);

  ok(pageErrors.length === 0, `${tag}: sayfa JS hatası yok`, pageErrors.join(" | "));
  await ctx.close();
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", "3988", "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();
    for (const mobile of [false, true]) {
      await run(browser, { futureYears: false, mobile });
      await run(browser, { futureYears: true, mobile });
    }
    await run(browser, { futureYears: false, mobile: false, localPermTamper: true });
  } finally {
    await browser?.close().catch(() => {});
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
  }
  console.log(`\nfuture-years UI smoke: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
