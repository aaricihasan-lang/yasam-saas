/**
 * I18N-F1 — DİL ALTYAPISI TARAYICI E2E (gerçek Chromium; PRODUCTION'A SIFIR TEMAS; sentetik veri).
 *
 * Ön koşul: uygulama yerel test ortamına işaret edecek şekilde build edilmiş olmalı:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54373 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy-anon \
 *   SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_PUBLIC_I18N_LOCALE_SWITCHING=<on|off> npx next build
 * Sonra: npx tsx scripts/i18n/ui-e2e.ts --mode <on|off> [--out <ekran-görüntüsü-klasörü>]
 *
 * Ortam: scripts/anamnez/testEnv (embedded-postgres + PostgREST şimi) + bu fazın user_locale_prefs migration'ı.
 * mode=off → production davranışı (yayın kapısı kapalı); mode=on → izole test ortamı (kapı açık).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, seedAnamnez, startAnamnezTestEnv, type Seed } from "../anamnez/testEnv";

const MODE = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "on";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), `i18n-ui-e2e-${MODE}`);
const APP_PORT = 3993;
const APP = `http://127.0.0.1:${APP_PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)}` : ""}`); }
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type U = { id: string; token: string };
function userRecord(seed: Seed, u: U, label: string, demo = false) {
  return {
    id: u.id, tenant_id: seed.TA, full_name: `ZZ_I18N_${label}`, email: `zz.i18n.${label.toLowerCase()}@example.test`, role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true },
    is_demo_account: demo,
  };
}
/** Tarayıcı oturumu: localStorage'a kullanıcı + oturum belirteci (uygulamanın giriş sonrası durumu). */
async function loginAs(ctx: BrowserContext, user: object, token: string) {
  await ctx.addInitScript(([u, tok]) => {
    if (!sessionStorage.getItem("__i18n_e2e_login_applied")) {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", tok as string);
      sessionStorage.setItem("__i18n_e2e_login_applied", "1");
    }
  }, [JSON.stringify(user), token]);
}
// Not: ctx.cookies(APP) http:// URL'i için Secure çerezleri FİLTRELER (production build'de çerez Secure); tüm çerezler okunur.
async function cookieLocale(ctx: BrowserContext): Promise<string | undefined> {
  return (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value;
}
async function htmlLang(page: Page) { return page.evaluate(() => document.documentElement.lang); }
async function waitLang(page: Page, lang: string, ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if ((await htmlLang(page).catch(() => "")) === lang) return true; await page.waitForTimeout(400); }
  return false;
}
async function dbLocale(env: Awaited<ReturnType<typeof startAnamnezTestEnv>>, userId: string): Promise<string | null> {
  const r = await env.su.query("select preferred_locale from public.user_locale_prefs where user_id = $1", [userId]);
  return r.rows[0]?.preferred_locale ?? null;
}
async function apiPut(page: Page, user: { id: string }, token: string | null, body: string) {
  return page.evaluate(async ([uid, tok, b]) => {
    const h: Record<string, string> = { "content-type": "application/json", "x-user-id": uid as string };
    if (tok) h["x-session-token"] = tok as string;
    const r = await fetch("/api/me/locale", { method: "PUT", headers: h, body: b as string });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [user.id, token, body] as const);
}
async function noHorizontalScroll(page: Page) { return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }

async function main() {
  const migration = readFileSync(path.join(process.cwd(), "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8");
  // Build'e gömülü NEXT_PUBLIC_SUPABASE_URL portu (varsayılan 54373; giriş güvenliği build'iyle ortak koşu için 54398).
  const SUPA_PORT = Number(process.env.I18N_E2E_SUPA_PORT ?? 54373);
  const env = await startAnamnezTestEnv({ port: 54473, dirName: "i18n-ui-e2e-pgdata", httpPort: SUPA_PORT, extraSql: [migration] });
  const seed = await seedAnamnez(env.su);
  // Not: seedAnamnez tenant TA'ya bir demo kullanıcısı koyar → TA "demo tenant" sayılır (isDemoTenantId) ve orada tercih
  // bilinçli olarak SAKLANMAZ. Kalıcılık senaryoları bu yüzden demo olmayan TB tenant'ındaki iki uzmanla koşar.
  const { randomUUID } = await import("node:crypto");
  const b2id = randomUUID();
  const b2tok = `zz-i18n-tok-b2-${b2id.slice(0, 8)}`;
  await env.su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,'ZZ_I18N_B2','zz.i18n.b2@example.test','expert',true,'approved',$2,'premium','premium',$3,false)`,
    [b2id, JSON.stringify({ clients: true }), seed.TB],
  );
  await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [b2id, b2tok]);
  const A = seed.users.B, A2 = { id: b2id, token: b2tok }, B = { id: b2id, token: b2tok }, DEMO = seed.users.DEMO;
  const recA = { ...userRecord(seed, A, "B1"), tenant_id: seed.TB };
  const recA2 = { ...userRecord(seed, A2, "B2"), tenant_id: seed.TB };
  const recB = recA2;
  const recDemo = userRecord(seed, DEMO, "DEMO", true);
  const CLIENT = seed.clients.b1;
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();
    const newCtx = (vp = { width: 1366, height: 900 }, mobile = false) => browser!.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: "en-GB" });
    const track = (p: Page) => {
      p.on("pageerror", (e) => pageErrors.push(e.message));
      p.on("response", async (r) => {
        if (r.url().includes("/api/me/locale")) console.log(`    [api ${r.status()}] ${r.request().method()} /api/me/locale ${(await r.text().catch(() => "")).slice(0, 200)}`);
      });
    };

    if (MODE === "off") {
      console.log("\n[KAPI KAPALI — production davranışı]");
      const ctx = await newCtx();
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: APP }]);
      const page = await ctx.newPage(); track(page);
      await page.goto(`${APP}/`);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      ok(await htmlLang(page) === "tr", "eski NEXT_LOCALE=en çerezi yok sayılır → <html lang=tr> (karışık dil yok)", await htmlLang(page));
      await shot(page, "off-01-landing-cookie-en");
      await loginAs(ctx, recA, A.token);
      await page.goto(`${APP}/`);
      await page.waitForTimeout(4000);
      ok(await htmlLang(page) === "tr", "giriş sonrası panel tr");
      ok((await page.getByRole("button", { name: /Dil seç|Select language/ }).count()) === 0 && (await page.getByLabel(/^Dil:|^Language:/).count()) === 0, "dil seçici panelde GÖRÜNMEZ");
      await shot(page, "off-02-panel-no-selector");
      const put = await apiPut(page, A, A.token, JSON.stringify({ locale: "en" }));
      ok(put.status === 403 && put.body?.code === "LOCALE_SWITCHING_DISABLED", "kapı kapalıyken hesap tercihi yazılamaz (403)", put);
      ok(await dbLocale(env, A.id) === null, "veritabanına satır yazılmadı");
      await page.goto(`${APP}/dashboard/clients/${CLIENT}`);
      await page.getByRole("button", { name: "Danışanı Sil" }).waitFor({ timeout: 60_000 });
      ok(await htmlLang(page) === "tr", "danışan detayı tr (çerez en olmasına rağmen)");
      await ctx.close();
    } else {
      console.log("\n[1] A: dil seçimi → hesap + çerez (masaüstü)");
      const ctxA = await newCtx();
      await loginAs(ctxA, recA, A.token);
      const pA = await ctxA.newPage(); track(pA);
      await pA.goto(`${APP}/`);
      const sel = pA.getByRole("button", { name: "Dil seç" });
      await sel.waitFor({ timeout: 60_000 });
      ok(await htmlLang(pA) === "tr", "başlangıç tr");
      await shot(pA, "on-01-panel-tr");
      await sel.click();
      await pA.getByRole("option", { name: "English" }).click();
      ok(await waitLang(pA, "en"), "English seçildi → <html lang=en>");
      await pA.getByRole("button", { name: "Select language" }).waitFor({ timeout: 20_000 });
      ok(await cookieLocale(ctxA) === "en", "çerez NEXT_LOCALE=en");
      const cookie = (await ctxA.cookies()).find((c) => c.name === "NEXT_LOCALE");
      ok(cookie?.httpOnly === true && cookie?.sameSite === "Lax", "çerez HttpOnly + SameSite=Lax", cookie);
      let saved: string | null = null;
      for (let i = 0; i < 20 && saved !== "en"; i++) { saved = await dbLocale(env, A.id); if (saved !== "en") await pA.waitForTimeout(300); }
      ok(saved === "en", "hesap tercihi veritabanına kaydedildi (A → en)", saved);
      await shot(pA, "on-02-panel-en");

      console.log("\n[2] A: yeni tarayıcı / cihaz (çerez yok) → hesap tercihi uygulanır");
      const ctxA2 = await newCtx();
      await loginAs(ctxA2, recA, A.token);
      const pA2 = await ctxA2.newPage(); track(pA2);
      await pA2.goto(`${APP}/`);
      ok(await waitLang(pA2, "en", 30_000), "yeni cihazda hesap tercihi (en) uygulandı");
      ok(await cookieLocale(ctxA2) === "en", "yeni cihazın çerezi hesapla eşitlendi");
      await ctxA2.close();

      console.log("\n[3] Ortak bilgisayar: A çıkış yapmadan B giriş yapar (çerez en kalmış)");
      const pShared = await ctxA.newPage(); track(pShared);
      await pShared.goto(`${APP}/`);
      await pShared.evaluate(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(recB), B.token]);
      await pShared.goto(`${APP}/`);
      ok(await waitLang(pShared, "tr", 30_000), "B'nin tercihi yok → tr (A'nın dili B'ye taşınmadı)");
      ok(await cookieLocale(ctxA) === "tr", "çerez B için tr'ye çekildi");
      ok(await dbLocale(env, B.id) === null && await dbLocale(env, A.id) === "en", "veritabanı izolasyonu: B satırı yok, A hâlâ en");

      console.log("\n[4] Çıkış ve yeniden giriş (A)");
      await pShared.evaluate(() => { localStorage.removeItem("yasam_user"); localStorage.removeItem("yasam_session_token"); });
      await pShared.evaluate(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(recA), A.token]);
      await pShared.goto(`${APP}/`);
      ok(await waitLang(pShared, "en", 30_000), "A yeniden giriş → en (hesap tercihi)");

      console.log("\n[5] Yetkisiz / geçersiz dil girdisi");
      for (const [body, code] of [[JSON.stringify({ locale: "fr" }), "INVALID_LOCALE"], [JSON.stringify({ locale: "../../etc" }), "INVALID_LOCALE"], ["{bozuk", "INVALID_BODY"], [JSON.stringify({ locale: "x".repeat(400) }), "BODY_TOO_LARGE"]] as const) {
        const r = await apiPut(pShared, A, A.token, body);
        ok(r.body?.code === code && r.status >= 400, `geçersiz girdi reddedildi (${code})`, r);
      }
      const unauth = await apiPut(pShared, A, null, JSON.stringify({ locale: "en" }));
      ok(unauth.status === 401, "oturumsuz yazma → 401", unauth);
      const forged = await apiPut(pShared, B, A.token, JSON.stringify({ locale: "en" }));
      ok(forged.status === 401 || forged.status === 403, "başka kullanıcının kimliğiyle yazma reddedilir", forged);
      ok(await dbLocale(env, B.id) === null, "B'nin tercihi değişmedi");
      ok(await dbLocale(env, A.id) === "en", "A'nın tercihi geçersiz girdilerden etkilenmedi");

      console.log("\n[6] Demo hesap (ortak) tercihi saklanmaz");
      const ctxD = await newCtx();
      await loginAs(ctxD, recDemo, DEMO.token);
      const pD = await ctxD.newPage(); track(pD);
      await pD.goto(`${APP}/`);
      await pD.waitForTimeout(2000);
      const dPut = await apiPut(pD, DEMO, DEMO.token, JSON.stringify({ locale: "en" }));
      ok(dPut.status === 200 && dPut.body?.persisted === false, "demo: persisted=false", dPut);
      ok(await dbLocale(env, DEMO.id) === null, "demo için veritabanı satırı yok");
      await ctxD.close();

      console.log("\n[7] Silme onayı İngilizce (F0 bulgu 4) ve Türkçe regresyon");
      await pShared.goto(`${APP}/dashboard/clients/${CLIENT}`);
      await pShared.getByRole("button", { name: "Delete Client" }).waitFor({ timeout: 60_000 });
      await pShared.getByRole("button", { name: "Delete Client" }).click();
      const dlgEn = pShared.getByRole("alertdialog");
      await dlgEn.waitFor({ timeout: 20_000 });
      await pShared.waitForTimeout(800);
      const textEn = (await dlgEn.innerText()).replace(/\s+/g, " ");
      ok(textEn.includes("This action cannot be undone.") && !/geri alınamaz/i.test(textEn), "EN onayında Türkçe 'geri alınamaz' satırı YOK", textEn);
      await shot(pShared, "on-03-delete-confirm-en");
      await dlgEn.getByRole("button", { name: "Cancel" }).click();
      ok(await env.su.query("select 1 from public.clients where id=$1", [CLIENT]).then((r) => r.rowCount === 1), "iptal → danışan silinmedi");

      const ctxTr = await newCtx();
      await loginAs(ctxTr, recA2, A2.token);
      const pTr = await ctxTr.newPage(); track(pTr);
      await pTr.goto(`${APP}/dashboard/clients/${CLIENT}`);
      await pTr.getByRole("button", { name: "Danışanı Sil" }).waitFor({ timeout: 60_000 });
      ok(await htmlLang(pTr) === "tr", "A2 (tercihi yok) → tr");
      await pTr.getByRole("button", { name: "Danışanı Sil" }).click();
      const dlgTr = pTr.getByRole("alertdialog");
      await dlgTr.waitFor({ timeout: 20_000 });
      await pTr.waitForTimeout(800);
      const textTr = (await dlgTr.innerText()).replace(/\s+/g, " ");
      ok(textTr.includes("Bu işlem geri alınamaz.") && !/cannot be undone/i.test(textTr), "TR onay metni değişmedi (regresyon yok)", textTr);
      await shot(pTr, "on-04-delete-confirm-tr");
      await dlgTr.getByRole("button", { name: "Vazgeç" }).click();
      await ctxTr.close();

      console.log("\n[8] Mobil 360×780 (EN) ve 390×844 (TR)");
      for (const [w, h, rec, tok, lang] of [[360, 780, recA, A.token, "en"], [390, 844, recA2, A2.token, "tr"]] as const) {
        const ctxM = await newCtx({ width: w, height: h }, true);
        await loginAs(ctxM, rec, tok);
        const pM = await ctxM.newPage(); track(pM);
        await pM.goto(`${APP}/`);
        ok(await waitLang(pM, lang, 30_000), `mobil ${w}px: dil ${lang}`);
        await pM.waitForTimeout(1500);
        ok(await noHorizontalScroll(pM), `mobil ${w}px ana panel: yatay taşma yok`);
        await shot(pM, `on-05-mobile-${w}-${lang}-home`);
        await pM.goto(`${APP}/dashboard/clients/${CLIENT}`);
        await pM.waitForTimeout(3000);
        ok(await noHorizontalScroll(pM), `mobil ${w}px danışan detayı: yatay taşma yok`);
        await shot(pM, `on-06-mobile-${w}-${lang}-client`);
        await ctxM.close();
      }
      await ctxA.close();
    }
    const relevantErrors = pageErrors.filter((e) => !/Failed to fetch|NetworkError|Load failed|AbortError/i.test(e));
    ok(relevantErrors.length === 0, "sayfa hatası (pageerror) yok", relevantErrors.slice(0, 5));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) {
      try { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGKILL"); } catch { /* yok */ }
    }
    await env.stop().catch(() => undefined);
  }
  console.log(`\nEkran görüntüleri: ${OUT}`);
  console.log(`=== i18n tarayıcı E2E (${MODE}): ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
