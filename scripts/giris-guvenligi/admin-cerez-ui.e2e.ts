/**
 * GİRİŞ GÜVENLİĞİ — admin sayfasına doğrudan URL ile geliş (HttpOnly sonrası "ana sayfaya düşme" düzeltmesi): GERÇEK TARAYICI
 * (gerçek Google Chrome + gerçek Microsoft Edge; 320 / 375 / 390 / 768 / 1280 px). Next.js production build, gerçek route'lar,
 * gerçek PostgreSQL (en güncel F2 zinciri), HttpOnly çerez birincil kip. Production'a SIFIR temas; sentetik hesaplar.
 *
 * Doğrulanan:
 *   · admin kabuk çerezi (yasam_admin_session) yokken (süresi doldu / silindi) doğrudan /admin/eposta-durumu → proxy "/?yonetim=…"
 *     → ana sayfa çerezi SUNUCUDA geçerli oturumla yeniden kurar → aynı admin sayfası açılır; çerez HttpOnly + SameSite=Strict + Path=/;
 *   · BAŞKA SİTEDEN bağlantı (SameSite=Strict ilk istekte çerez göndermez) → yine doğru admin sayfasına ulaşılır (Strict gevşemedi);
 *   · oturumsuz kullanıcı, uzman, sunucuda iptal edilmiş Owner oturumu → admin sayfası AÇILMAZ (ana sayfada kalır);
 *   · kötü niyetli ?yonetim= (//evil, https://…) → başka adrese gidilmez;
 *   · çıkış sonrası doğrudan URL → admin sayfası açılmaz.
 * Sonuç: 0 = PASS · 1 = FAIL · 3 = NOT TESTED (gerçek Edge yok). Asgari PASS (ADMIN_UI_MIN_PASS).
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54470 … npx next build --webpack
 * Çalıştır: npx tsx scripts/giris-guvenligi/admin-cerez-ui.e2e.ts <kanıt-klasörü>
 */
import Module, { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const PORT = Number(process.env.ADMIN_UI_PORT ?? 3979);
const SUPA_PROXY_PORT = Number(process.env.ADMIN_UI_SUPA_PORT ?? 54470);
const OTHER_SITE_PORT = Number(process.env.ADMIN_UI_OTHER_PORT ?? 3980);
const BASE = `http://localhost:${PORT}`;
const TARGET = "/admin/eposta-durumu";
const OUT = process.argv[2] ?? "";
const MIN_PASS = Number(process.env.ADMIN_UI_MIN_PASS ?? 0);
const REQUIRE_EDGE = process.env.ADMIN_UI_REQUIRE_EDGE === "1";
const WIDTHS = [320, 375, 390, 768, 1280];
let pass = 0;
let fail = 0;
const notTested: string[] = [];
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!OUT) throw new Error("kanıt klasörü verin");
  fs.mkdirSync(OUT, { recursive: true });
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium } = req2("playwright") as typeof import("playwright");
  type Page = import("playwright").Page;
  type Browser = import("playwright").Browser;
  type Ctx = import("playwright").BrowserContext;
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const proxy = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()); });
  // "Başka site": 127.0.0.1 (localhost'tan FARKLI site) üzerinde yalnız bağlantı içeren sayfa.
  const other = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><a id="git" href="${BASE}${TARGET}">E-posta durumu</a>`);
  });
  await new Promise<void>((resolve) => other.listen(OTHER_SITE_PORT, "127.0.0.1", () => resolve()));
  const env: Record<string, string | undefined> = {
    ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret", SESSION_COOKIE_MODE: "primary", SESSION_COOKIE_ALLOWED_ORIGINS: BASE,
    RATE_LIMIT_SECRET: "admin-ui-rate-secret", LOGIN_IP_PEPPER: "admin-ui-ip-pepper", REQUIRE_DB_SUPER_ADMIN_MARKER: "true", NEXT_TELEMETRY_DISABLED: "1",
  };
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "localhost"],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore", detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  try {
    for (let i = 0; i < 150; i++) { try { const r = await fetch(`${BASE}/`); if (r.status < 500) break; } catch { /* bekle */ } await sleep(1000); }
    const login = async (page: Page, email: string) => {
      await q(`DELETE FROM public.auth_rate_limit_events WHERE bucket LIKE 'login%'`).catch(() => {});
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      const resp = page.waitForResponse((r) => r.url().endsWith("/api/auth/session") && r.request().method() === "POST", { timeout: 30000 });
      await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill(pw(email));
      await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
      const r = await resp;
      const loggedIn = await page.waitForFunction(() => !!localStorage.getItem("yasam_user"), null, { timeout: 25000 }).then(() => true).catch(() => false);
      return { status: r.status(), loggedIn };
    };
    const adminCookie = async (ctx: Ctx) => (await ctx.cookies(BASE)).find((c) => c.name === "yasam_admin_session");
    const dropAdminCookie = async (ctx: Ctx) => { await ctx.clearCookies({ name: "yasam_admin_session" }); };
    const reachedTarget = async (page: Page) => page.getByTestId("email-status-page").waitFor({ timeout: 30000 }).then(() => new URL(page.url()).pathname === TARGET, () => false);
    const staysHome = async (page: Page) => {
      await sleep(4000);
      const u = new URL(page.url());
      return u.origin === BASE && u.pathname === "/" && (await page.getByTestId("email-status-page").count()) === 0;
    };

    const profiles: { name: string; channel: string }[] = [{ name: "Chrome", channel: "chrome" }];
    try {
      const e = await chromium.launch({ channel: "msedge", headless: true });
      const ua = await (await e.newPage()).evaluate(() => navigator.userAgent);
      await e.close();
      if (/Edg\//.test(ua)) profiles.push({ name: "Edge", channel: "msedge" }); else notTested.push("Edge (ikili Edge değil)");
    } catch { notTested.push("Edge (ikili yok)"); }

    for (const prof of profiles) {
      const browser = await chromium.launch({ channel: prof.channel, headless: true });
      browsers.push(browser);
      console.log(`\n══ ${prof.name} ${browser.version()} ══`);
      for (const w of WIDTHS) {
        const tag = `${prof.name} ${w}px`;
        const slug = tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
        const page = await ctx.newPage();
        const l = await login(page, EMAIL.owner);
        ok(l.status === 200 && l.loggedIn, `${tag}: Owner girişi`, l);
        await page.waitForURL((u) => u.pathname.startsWith("/admin"), { timeout: 30000 }).catch(() => {});
        ok(!!(await adminCookie(ctx)), `${tag}: girişte admin kabuk çerezi kuruldu`);
        // 1) Çerez süresi dolmuş gibi: sil → doğrudan URL
        await dropAdminCookie(ctx);
        await page.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded" });
        ok(await reachedTarget(page), `${tag}: admin çerezi yokken doğrudan ${TARGET} → aynı sayfaya DÖNÜLDÜ (ana sayfada kalınmadı)`, page.url());
        const c = await adminCookie(ctx);
        ok(!!c && c.httpOnly && c.sameSite === "Strict" && c.path === "/", `${tag}: çerez yeniden kuruldu; HttpOnly + SameSite=Strict + Path=/`, c && { h: c.httpOnly, s: c.sameSite, p: c.path });
        const sw = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
        ok(sw, `${tag}: hedef sayfada yatay taşma yok`);
        await page.screenshot({ path: path.join(OUT, `${slug}-dogrudan-url.png`) });
        if (w === 375 || w === 1280) {
          // 2) Başka siteden bağlantı (Strict: ilk istekte çerez yok)
          await page.goto(`http://127.0.0.1:${OTHER_SITE_PORT}/`, { waitUntil: "domcontentloaded" });
          await page.locator("#git").click();
          ok(await reachedTarget(page), `${tag}: BAŞKA SİTEDEN bağlantı → doğru admin sayfası (Strict korunarak)`, page.url());
          // 3) Kötü niyetli geri dönüş parametresi
          for (const bad of ["//evil.example/admin", "https://evil.example/admin", "/admin/%2e%2e/settings"]) {
            await page.goto(`${BASE}/?yonetim=${encodeURIComponent(bad)}`, { waitUntil: "domcontentloaded" });
            await sleep(3500);
            const u = new URL(page.url());
            ok(u.origin === BASE && !u.pathname.startsWith("/admin") && !/evil/.test(u.host), `${tag}: ?yonetim=${bad} → başka adrese / admin'e GİDİLMEDİ`, page.url());
          }
          // 4) Sunucuda iptal edilmiş oturum: admin sayfası açılmaz
          await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND is_active`, [U.owner]);
          await dropAdminCookie(ctx);
          await page.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded" });
          ok(await staysHome(page), `${tag}: oturum sunucuda iptal → admin sayfası AÇILMADI`, page.url());
        }
        await ctx.close();
        if (w === 375 || w === 1280) {
          // 5) Oturumsuz ziyaretçi
          const c2 = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const p2 = await c2.newPage();
          await p2.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded" });
          ok(await staysHome(p2), `${tag}: oturumsuz ziyaretçi → admin sayfası AÇILMADI`, p2.url());
          // 6) Uzman
          const le = await login(p2, EMAIL.exp);
          ok(le.loggedIn, `${tag}: uzman girişi`, le);
          await p2.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded" });
          ok(await staysHome(p2), `${tag}: uzman → admin sayfası AÇILMADI`, p2.url());
          await c2.close();
          // 7) Çıkış sonrası
          const c3 = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const p3 = await c3.newPage();
          await login(p3, EMAIL.owner);
          await p3.evaluate(async () => { await fetch("/api/auth/session", { method: "DELETE" }); await fetch("/api/auth/admin-session", { method: "DELETE" }); localStorage.clear(); });
          await p3.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded" });
          ok(await staysHome(p3) && !(await adminCookie(c3)), `${tag}: çıkış sonrası doğrudan URL → admin AÇILMADI, admin çerezi yok`, p3.url());
          await c3.close();
        }
      }
    }
  } finally {
    const nt = notTested.length ? ` · NOT TESTED: ${notTested.join(", ")}` : "";
    console.log(`\nadmin-cerez-ui: ${pass} PASS, ${fail} FAIL${nt}`);
    if (failures.length) console.log("FAIL:\n - " + failures.join("\n - "));
    for (const b of browsers) await b.close().catch(() => {});
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    else try { process.kill(-(app.pid ?? 0), "SIGTERM"); } catch { /* yok */ }
    proxy.close();
    other.close();
    await db.close();
  }
  if (fail) process.exit(1);
  if (MIN_PASS && pass < MIN_PASS) { console.log(`FAIL: asgari PASS ${MIN_PASS}, gözlenen ${pass}`); process.exit(1); }
  if (REQUIRE_EDGE && notTested.length) { console.log("NOT TESTED (altyapı) — gerçek FAIL değil"); process.exit(3); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); console.log(`\nadmin-cerez-ui: ${pass} PASS, ${fail + 1} FAIL`); process.exit(1); });
