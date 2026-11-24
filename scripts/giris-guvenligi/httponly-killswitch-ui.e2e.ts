/**
 * HTTPONLY — GERİ DÖNÜŞ (KILL-SWITCH) GERÇEK UYGULAMA TESTİ: `SESSION_COOKIE_WEB_HEADER=on` iken, eski token'ı OLMAYAN
 * (yalnız HttpOnly çerezle giriş yapmış) web kullanıcısı ne yaşar? Gerçek Next.js production build (`next start`),
 * gerçek istemci JS'i (giriş formu, oturum taşıması, çıkış onayı), gerçek HTTPS (vekil), gerçek PostgreSQL (embedded).
 * Chromium / Firefox / WebKit — aynı tarayıcı profili sunucu yeniden başlatmaları boyunca korunur.
 * Production'a SIFIR temas; sentetik kullanıcılar.
 *
 * Aşamalar: P1 primary (çerez taşıması) → P2 kill-switch AÇIK (header taşıması) → P3 kill-switch KAPALI (çerez).
 *
 * Ön koşul: f2c-ui.e2e.ts başlığındaki sahte env ile `next build --webpack`; HTTPONLY_TLS_DIR (cert.pem/key.pem).
 * Çalıştır (build'in kökünde): npx tsx scripts/giris-guvenligi/httponly-killswitch-ui.e2e.ts
 */
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import type { BrowserContext, Page } from "playwright";
import { startF2cDb, U, EMAIL, pw } from "./testDb";

const PORT = 3991;
const TLS_PORT = 3992;
const BASE = `https://localhost:${TLS_PORT}`;
const SUPA_PROXY_PORT = Number(process.env.KABUL_SUPA_PORT ?? 54398); // build'e gömülü NEXT_PUBLIC_SUPABASE_URL ile AYNI
const TLS_DIR = process.env.HTTPONLY_TLS_DIR ?? "";
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => {
  if (c) pass++; else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 300)}`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Hit = { url: string; status: number; hdrToken: boolean };

async function main() {
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium, firefox, webkit } = req2("playwright") as typeof import("playwright");
  const db = await startF2cDb({ withF2k: true });
  const q = (sql: string, args: unknown[] = []) => db.admin.query(sql, args);
  const proxy = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()); });
  const tlsProxy = https.createServer({ cert: fs.readFileSync(path.join(TLS_DIR, "cert.pem")), key: fs.readFileSync(path.join(TLS_DIR, "key.pem")) }, (req, res) => {
    const up = http.request({ host: "127.0.0.1", port: PORT, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } },
      (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve) => tlsProxy.listen(TLS_PORT, () => resolve()));

  let app: ChildProcess | null = null;
  const stopApp = async () => {
    if (!app) return;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    else app.kill("SIGTERM");
    app = null;
    for (let i = 0; i < 30; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); } catch { return; } await sleep(500); }
  };
  const startApp = async (killSwitch: boolean) => {
    await stopApp();
    const env: Record<string, string | undefined> = {
      ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
      SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: BASE, RATE_LIMIT_SECRET: "killswitch-ui-rate", LOGIN_IP_PEPPER: "killswitch-ui-pepper",
      REQUIRE_DB_SUPER_ADMIN_MARKER: "true", NEXT_TELEMETRY_DISABLED: "1",
      ...(killSwitch ? { SESSION_COOKIE_WEB_HEADER: "on" } : {}),
    };
    if (!killSwitch) delete env.SESSION_COOKIE_WEB_HEADER;
    delete env.VERCEL_ENV;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)],
      { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore" });
    for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.status < 500) return; } catch { /* bekle */ } await sleep(1000); }
    throw new Error("next start açılmadı");
  };

  const activeSessions = async () => Number((await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.free])).rows[0].n);
  const transportAttr = (p: Page) => p.evaluate(() => document.documentElement.getAttribute("data-session-transport"));
  const lsToken = (p: Page) => p.evaluate(() => localStorage.getItem("yasam_session_token"));
  const sid = async (c: BrowserContext) => (await c.cookies(BASE)).find((x) => x.name === "__Host-yasam_sid");
  const loggedIn = async (p: Page) => p.getByRole("button", { name: "Çıkış Yap", exact: true }).first().isVisible({ timeout: 15000 }).catch(() => false);
  const waitLoggedIn = async (p: Page) => p.getByRole("button", { name: "Çıkış Yap", exact: true }).first().waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
  /** Oturum hatası: 401, 5xx ve /api/auth/* 403 (modül/paket yetkisi 403'leri oturumla ilgili DEĞİL → ayrı bilgi). */
  const sessionFailures = (hits: Hit[]) => hits.filter((h) => /\/api\//.test(h.url) && (h.status === 401 || h.status >= 500 || (h.status === 403 && /\/api\/auth\//.test(h.url))));
  const moduleForbidden = (hits: Hit[]) => [...new Set(hits.filter((h) => /\/api\//.test(h.url) && h.status === 403 && !/\/api\/auth\//.test(h.url)).map((h) => new URL(h.url).pathname))];
  const uiLogin = async (p: Page) => {
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    await p.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
    await p.locator("#login-email").fill(EMAIL.free);
    await p.locator("#login-password").fill(pw(EMAIL.free));
    await p.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
    return waitLoggedIn(p);
  };
  const uiLogout = async (p: Page) => {
    await p.getByRole("button", { name: "Çıkış Yap", exact: true }).first().click();
    const dlg = p.getByRole("dialog");
    const confirmBtn = (await dlg.count()) ? dlg.getByRole("button", { name: "Çıkış Yap" }) : p.getByRole("button", { name: "Çıkış Yap" }).last();
    await confirmBtn.click();
    await sleep(1500);
  };
  const settle = () => sleep(2500);

  try {
    for (const [name, bt] of [["Chromium", chromium], ["Firefox", firefox], ["WebKit", webkit]] as const) {
      await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND is_active`, [U.free]);
      const ctx = await bt.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), `ks-${name}-`)), { ignoreHTTPSErrors: true, locale: "tr-TR", viewport: { width: 1280, height: 860 } });
      const page = ctx.pages()[0] ?? await ctx.newPage();
      const hits: Hit[] = [];
      ctx.on("response", (r) => { const rq = r.request(); hits.push({ url: r.url(), status: r.status(), hdrToken: !!rq.headers()["x-session-token"] }); });

      // ── P1 ──
      console.log(`\n═══ ${name} · P1 — primary, çerez taşıması (kill-switch KAPALI) ═══`);
      await startApp(false);
      ok(await uiLogin(page), `${name} P1: giriş formu → panel açıldı`);
      await settle();
      ok(await transportAttr(page) === "cookie", `${name} P1: data-session-transport=cookie`);
      ok(await lsToken(page) === null, `${name} P1: localStorage'da oturum anahtarı YOK (eski token'ı olmayan kullanıcı)`);
      const c = await sid(ctx);
      ok(!!c && c.httpOnly && c.secure, `${name} P1: HttpOnly + Secure __Host-yasam_sid`);
      ok(hits.filter((h) => /\/api\//.test(h.url)).every((h) => !h.hdrToken), `${name} P1: hiçbir API isteğinde x-session-token başlığı YOK`);
      ok(sessionFailures(hits).length === 0, `${name} P1: oturum hatası (401 / 5xx / auth 403) yok`, sessionFailures(hits).slice(0, 5));
      console.log(`  bilgi: modül yetkisi 403 (oturumdan bağımsız, sentetik paket): ${JSON.stringify(moduleForbidden(hits))}`);

      // ── P2 ──
      console.log(`\n═══ ${name} · P2 — kill-switch AÇIK (SESSION_COOKIE_WEB_HEADER=on, mod primary) ═══`);
      await startApp(true);
      hits.length = 0;
      await page.reload({ waitUntil: "domcontentloaded" });
      ok(await waitLoggedIn(page), `${name} P2: sayfa yenileme → oturum AÇIK kaldı (çıkışa düşmedi)`);
      await settle();
      ok(await transportAttr(page) === "header", `${name} P2: data-session-transport=header`);
      ok(await lsToken(page) === null, `${name} P2: localStorage hâlâ boş (token üretilmedi)`);
      const st = await page.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: { "x-user-id": u } })).status, U.free);
      ok(st === 200, `${name} P2: API erişimi (yalnız çerez, başlıksız) 200`, st);
      const tab = await ctx.newPage();
      await tab.goto(BASE, { waitUntil: "domcontentloaded" });
      ok(await waitLoggedIn(tab), `${name} P2: yeni sekme oturumlu`);
      await tab.close();
      ok(sessionFailures(hits).length === 0, `${name} P2: oturum hatası yok`, sessionFailures(hits).slice(0, 5));
      const before = await activeSessions();
      await uiLogout(page);
      ok(!(await sid(ctx)), `${name} P2: UI çıkışı → çerez silindi`);
      ok(await activeSessions() === before - 1, `${name} P2: UI çıkışı → sunucu oturumu kapandı`, { before, after: await activeSessions() });
      await page.reload({ waitUntil: "domcontentloaded" });
      ok(!(await loggedIn(page)), `${name} P2: çıkış sonrası yenileme → giriş ekranı`);
      hits.length = 0;
      ok(await uiLogin(page), `${name} P2: yeniden giriş → panel`);
      await settle();
      const tok = await lsToken(page);
      ok(typeof tok === "string" && tok.length > 0, `${name} P2: kill-switch'te yeniden giriş token'ı localStorage'a yazar (H5 davranışı; geri dönüşün bilinen bedeli)`);
      ok(!!(await sid(ctx)), `${name} P2: çerez de yazıldı`);
      ok(hits.some((h) => /\/api\/auth\/profile/.test(h.url) && h.hdrToken), `${name} P2: API istekleri x-session-token başlığıyla`);
      await page.reload({ waitUntil: "domcontentloaded" });
      ok(await waitLoggedIn(page), `${name} P2: yeniden giriş sonrası yenileme oturumlu`);
      await settle();
      ok(sessionFailures(hits).length === 0, `${name} P2: yeniden girişte oturum hatası yok`, sessionFailures(hits).slice(0, 5));

      // ── P3 ──
      console.log(`\n═══ ${name} · P3 — kill-switch KAPALI (primary'ye dönüş) ═══`);
      await startApp(false);
      hits.length = 0;
      await page.reload({ waitUntil: "domcontentloaded" });
      ok(await waitLoggedIn(page), `${name} P3: yenileme → oturum AÇIK (çıkışa düşmedi)`);
      ok(await transportAttr(page) === "cookie", `${name} P3: data-session-transport=cookie`);
      let left: string | null = "x";
      for (let i = 0; i < 20 && left !== null; i++) { await sleep(500); left = await lsToken(page); }
      ok(left === null, `${name} P3: P2'de yazılan token, çerez oturumu doğrulanınca localStorage'dan SİLİNDİ`);
      const st3 = await page.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: { "x-user-id": u } })).status, U.free);
      ok(st3 === 200, `${name} P3: API erişimi (yalnız çerez) 200`);
      hits.length = 0;
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitLoggedIn(page);
      await settle();
      ok(hits.filter((h) => /\/api\/auth\/profile/.test(h.url)).length > 0 && hits.filter((h) => /\/api\//.test(h.url)).every((h) => !h.hdrToken), `${name} P3: API isteklerinde başlık YOK`);
      ok(sessionFailures(hits).length === 0, `${name} P3: oturum hatası yok`, sessionFailures(hits).slice(0, 5));
      const b3 = await activeSessions();
      await uiLogout(page);
      ok(!(await sid(ctx)) && await lsToken(page) === null, `${name} P3: çıkış → çerez ve localStorage temiz`);
      ok(await activeSessions() === b3 - 1, `${name} P3: çıkış → sunucu oturumu kapandı`);
      await ctx.close();
    }
  } finally {
    await stopApp();
    proxy.close(); tlsProxy.close();
    await db.close();
  }
  console.log(`\nhttponly-killswitch-ui: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
