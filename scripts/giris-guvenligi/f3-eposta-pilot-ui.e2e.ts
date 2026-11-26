/**
 * GİRİŞ GÜVENLİĞİ F3 — E-POSTA DOĞRULAMA PİLOTU TARAYICI uçtan uca (gerçek Google Chrome + gerçek Microsoft Edge; 320 / 390 / 1280 px).
 * GERÇEK: Next.js production build (`next start`), gerçek route'lar, gerçek PostgreSQL (en güncel F2 zinciri), HttpOnly çerez kipi.
 * Production'a SIFIR temas; sentetik hesaplar; e-posta SENTETİK (yerel dosya; koşu sonunda silinir).
 * AUTH_EMAIL_SELF_SERVICE_ROLES TANIMSIZ (= yalnız Owner) + pilot ayarı: TEK uzman (U.and1) + adres özeti.
 *
 * Doğrulanan: pilot uzman Ayarlar › Giriş Yöntemlerim'de kayıtlı adresini klavyeyle doğrular (yanlış kod uyarısı → doğru kod → rozet);
 * adres değişikliği formu KAPALI; pilot dışı uzmanda doğrulama ve adres değişikliği KAPALI, doğrudan istek 403; pilot oturumuyla başka
 * kimlik reddedilir; kodlu iletiler YALNIZ pilotun kayıtlı adresine; MFA zorunluluğu açılmaz; taşma yok; tam adres / pepper DOM'da yok;
 * Owner e-posta durumu ekranı pilotu "açık" gösterir.
 *
 * Sonuç: 0 = PASS · 1 = FAIL · 3 = NOT TESTED (altyapı; gerçek Edge ikilisi yok).
 * Ön koşul: f3-eposta-kapsam-ui.e2e.ts ile aynı build (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54462 …  npx next build --webpack).
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-eposta-pilot-ui.e2e.ts <kanıt-klasörü>
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

const PORT = Number(process.env.F3_PILOT_UI_PORT ?? 3972);
const SUPA_PROXY_PORT = Number(process.env.F3_PILOT_UI_SUPA_PORT ?? 54462);
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? "";
const REQUIRE_EDGE = process.env.F3_UI_REQUIRE_EDGE === "1";
const WIDTHS = [320, 390, 1280];
const PEPPER = "f3-pilot-ui-pepper-0123456789abcdefghijklm";
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
  const SINK = path.join(OUT, "sentetik-eposta.jsonl");
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium } = req2("playwright") as typeof import("playwright");
  type Page = import("playwright").Page;
  type Browser = import("playwright").Browser;
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const { pilotEmailHash } = await import("@/lib/auth/emailVerifyPilot");
  const PILOT = U.and1, PILOT_ADDR = EMAIL.and1, OTHER = U.exp, OTHER_ADDR = EMAIL.exp;
  const db = await startF2cDb({ withF2n: true });
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  // Production şemasıyla aynı: 4a arşiv + üye pasifleştirme kolonları (yalnız fikstür).
  await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL, ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz NULL`);
  await q(`UPDATE public.users SET email_verified_at = NULL, mfa_required = false WHERE id = ANY($1::uuid[])`, [[PILOT, OTHER]]);
  const proxy = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()); });
  const env: Record<string, string | undefined> = {
    ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret", SESSION_COOKIE_MODE: "primary", SESSION_COOKIE_ALLOWED_ORIGINS: BASE,
    RATE_LIMIT_SECRET: "f3-pilot-ui-rate", LOGIN_IP_PEPPER: "f3-pilot-ui-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: SINK, AUTH_OTP_PEPPER: PEPPER, NEXT_TELEMETRY_DISABLED: "1",
    AUTH_EMAIL_VERIFY_PILOT_USER_ID: PILOT, AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: pilotEmailHash(PILOT_ADDR),
  };
  delete env.AUTH_EMAIL_SELF_SERVICE_ROLES;
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "localhost"],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore", detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  const mails = () => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to?: string; subject?: string }); } catch { return []; } };
  const waitCode = async (to: string, after: number) => {
    for (let i = 0; i < 60; i++) {
      const m = mails().slice(after).reverse().find((x) => x.to === to);
      const c = /^([0-9]{6}) — /.exec(m?.subject ?? "")?.[1];
      if (c) return c;
      await sleep(500);
    }
    return "";
  };
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
    const openSettings = async (page: Page) => {
      await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
      const card = page.getByTestId("email-method-card");
      await card.waitFor({ timeout: 30000 });
      await page.waitForFunction(() => {
        const c = document.querySelector('[data-testid="email-method-card"]') as HTMLElement | null;
        return !!c && /Doğrulandı|Doğrulanmadı/.test(c.innerText);
      }, null, { timeout: 30000 });
      return card;
    };
    const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

    const profiles: { name: string; channel: string }[] = [{ name: "Chrome", channel: "chrome" }];
    try {
      const e = await chromium.launch({ channel: "msedge", headless: true });
      const ua = await (await e.newPage()).evaluate(() => navigator.userAgent);
      await e.close();
      if (/Edg\//.test(ua)) profiles.push({ name: "Edge", channel: "msedge" }); else notTested.push("Edge (ikili Edge değil)");
    } catch { notTested.push("Edge (ikili yok)"); }

    let verifiedOnce = false;
    for (const prof of profiles) {
      const browser = await chromium.launch({ channel: prof.channel, headless: true });
      browsers.push(browser);
      console.log(`\n══ ${prof.name} ${browser.version()} ══`);
      for (const w of WIDTHS) {
        const tag = `${prof.name} ${w}px`;
        const slug = tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

        // ── Pilot uzman ──
        {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, PILOT_ADDR);
          ok(l.status === 200 && l.loggedIn, `${tag}: pilot uzman parola girişi (MFA istenmedi)`, l);
          const card = await openSettings(page);
          if (!verifiedOnce) {
            const send = page.getByTestId("email-verify-send");
            ok(await send.isVisible() && await send.isEnabled() && (await page.getByTestId("email-verify-unavailable").count()) === 0, `${tag}: pilotta "Doğrulama kodu gönder" görünür ve etkin`);
            const before = mails().length;
            await send.focus();
            await page.keyboard.press("Enter");
            const code = await waitCode(PILOT_ADDR, before);
            ok(/^[0-9]{6}$/.test(code), `${tag}: klavyeyle gönderildi; kod YALNIZ pilotun sentetik kutusuna geldi`);
            const input = page.getByTestId("email-verify-code");
            await input.waitFor({ timeout: 15000 });
            await input.fill(code === "000000" ? "111111" : "000000");
            await page.getByTestId("email-verify-confirm").click();
            const alert = page.locator('[role="alert"]', { hasText: /Kod hatalı/ });
            ok(await alert.first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false), `${tag}: yanlış kod hatası görünür (role=alert)`);
            await input.fill(code);
            await page.getByTestId("email-verify-confirm").click();
            await page.getByTestId("email-verified-badge").waitFor({ timeout: 20000 });
            const u = (await q(`SELECT email_verified_at, mfa_required FROM public.users WHERE id = $1`, [PILOT])).rows[0];
            ok(u.email_verified_at !== null && u.mfa_required === false, `${tag}: pilot adresi arayüzden doğrulandı (rozet + DB); MFA zorunluluğu AÇILMADI`, u);
            await card.screenshot({ path: path.join(OUT, `${slug}-pilot-dogrulandi.png`) });
            verifiedOnce = true;
          } else {
            ok((await page.getByTestId("email-verified-badge").count()) === 1, `${tag}: pilot adresi doğrulanmış görünüyor (rozet)`);
          }
          const change = page.getByTestId("email-change-card");
          await change.locator("summary").click();
          await page.getByTestId("email-change-unavailable").waitFor({ timeout: 15000 });
          ok((await page.getByTestId("email-change-new").count()) === 0 && (await page.getByTestId("email-change-start").count()) === 0, `${tag}: pilotta adres değişikliği formu YOK (pilot açmaz)`);
          const html = await page.content();
          ok(await noOverflow(page) && !(await card.innerText()).includes(PILOT_ADDR) && !html.includes(PEPPER), `${tag}: taşma yok; tam adres kartta yok; pepper DOM'da yok`);
          const imp = await page.evaluate(async (uid) => {
            const res = await fetch("/api/me/email-verification", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": uid }, body: JSON.stringify({ action: "send" }) });
            return res.status;
          }, OTHER);
          ok(imp === 401 || imp === 403, `${tag}: pilot oturumuyla başka uzman kimliği → reddedildi`, imp);
          await change.screenshot({ path: path.join(OUT, `${slug}-pilot-adres-degisikligi-kapali.png`) });
          await ctx.close();
        }

        // ── Pilot dışı uzman ──
        {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, OTHER_ADDR);
          ok(l.status === 200 && l.loggedIn, `${tag}: pilot dışı uzman parola girişi (davranış değişmedi)`, l);
          const before = mails().length;
          const card = await openSettings(page);
          await page.getByTestId("email-verify-unavailable").waitFor({ timeout: 15000 });
          ok((await page.getByTestId("email-verify-send").count()) === 0, `${tag}: pilot dışı uzmanda "kod gönder" YOK, "kullanılamıyor" notu var`);
          const r = await page.evaluate(async (uid) => {
            const res = await fetch("/api/me/email-verification", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": uid }, body: JSON.stringify({ action: "send", userId: "00000000-0000-0000-0000-00000000e0b2" }) });
            return { status: res.status, body: await res.json().catch(() => ({})) as { code?: string } };
          }, OTHER);
          ok(r.status === 403 && r.body.code === "METHOD_NOT_IN_SCOPE" && mails().length === before, `${tag}: doğrudan istek (gövdede pilot kimliği) → 403; ileti GİTMEDİ`, r);
          ok(await noOverflow(page), `${tag}: pilot dışı uzman ekranında taşma yok`);
          await card.screenshot({ path: path.join(OUT, `${slug}-pilot-disi-uzman.png`) });
          await ctx.close();
        }

        // ── Owner e-posta durumu ──
        if (w !== 320) {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, EMAIL.owner);
          ok(l.status === 200 && l.loggedIn, `${tag}: Owner girişi`, l);
          await page.goto(`${BASE}/admin/eposta-durumu`, { waitUntil: "domcontentloaded" });
          const p = page.getByTestId("email-verify-pilot");
          await p.waitFor({ timeout: 30000 });
          const t = await p.innerText();
          const html = await page.content();
          ok(/açık — yalnız kayıtlı adres doğrulaması/.test(t) && !html.includes(PILOT) && !html.includes(PILOT_ADDR) && await noOverflow(page),
            `${tag}: Owner durumu pilotu gösterir ("${t.trim()}"); kimlik / adres DOM'da yok`);
          const sc = await page.getByTestId("email-self-service-scope").innerText();
          ok(/yalnız Owner/.test(sc), `${tag}: genel kapsam hâlâ yalnız Owner`);
          await page.screenshot({ path: path.join(OUT, `${slug}-owner-eposta-durumu.png`), fullPage: true });
          await ctx.close();
        }
      }
    }
    const kodlu = mails().filter((m) => /^[0-9]{6} — /.test(m.subject ?? ""));
    ok(kodlu.length >= 1 && kodlu.every((m) => m.to === PILOT_ADDR) && !mails().some((m) => m.to === OTHER_ADDR),
      "bütün koşu boyunca kodlu iletiler YALNIZ pilotun kayıtlı adresine; pilot dışı uzmana HİÇ ileti yok", [...new Set(mails().map((m) => m.to))]);
    const o = (await q(`SELECT email_verified_at FROM public.users WHERE id = $1`, [OTHER])).rows[0];
    ok(o.email_verified_at === null, "pilot dışı uzmanın doğrulama durumu DEĞİŞMEDİ");
  } finally {
    const nt = notTested.length ? ` · NOT TESTED: ${notTested.join(", ")}` : "";
    console.log(`\nf3-eposta-pilot-ui: ${pass} PASS, ${fail} FAIL${nt}`);
    if (failures.length) console.log("FAIL:\n - " + failures.join("\n - "));
    for (const b of browsers) await b.close().catch(() => {});
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    else try { process.kill(-(app.pid ?? 0), "SIGTERM"); } catch { /* yok */ }
    proxy.close();
    try { fs.rmSync(SINK, { force: true }); } catch { /* kanıta kod içeren dosya bırakılmaz */ }
    await db.close();
  }
  if (fail) process.exit(1);
  if (REQUIRE_EDGE && notTested.length) { console.log("NOT TESTED (altyapı) — gerçek FAIL değil"); process.exit(3); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); console.log(`\nf3-eposta-pilot-ui: ${pass} PASS, ${fail + 1} FAIL`); process.exit(1); });
