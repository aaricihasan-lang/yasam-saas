/**
 * Owner İki Aşamalı Giriş Yönetimi — TARAYICI uçtan uca (gerçek Chrome + gerçek Edge varsa; 320 / 375 / 390 / 1280 px).
 * GERÇEK: Next.js production build (`next start`), gerçek route'lar, gerçek PostgreSQL (bütün F2 zinciri), HttpOnly çerez
 * birincil kip. Production'a SIFIR temas; sentetik hesaplar; e-posta SENTETİK.
 *
 * Ön koşul (sahte değerler; portlar başka oturumların 54398 / 3987'siyle ÇAKIŞMASIN diye ayrı):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54458 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: PLAYWRIGHT_REQUIRE=<playwright paketi> npx tsx scripts/giris-guvenligi/mfa-yonetimi-ui.e2e.ts <kanıt-klasörü>
 *   (MFA_UI_PORT=3967, MFA_UI_SUPA_PORT=54458 — build'e gömülü adresle AYNI olmalı)
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

const PORT = Number(process.env.MFA_UI_PORT ?? 3967);
const SUPA_PROXY_PORT = Number(process.env.MFA_UI_SUPA_PORT ?? 54458);
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? "";
let pass = 0;
let fail = 0;
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
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2d: true, withF2e: true, withF2g: true, withF2h: true, withF2i: true, withF2j: true, withF2k: true });
  const FREE = U.free;
  const ADM2 = "admin2@test.local";
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
    RATE_LIMIT_SECRET: "mfa-ui-rate-secret", LOGIN_IP_PEPPER: "mfa-ui-pepper", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,owner",
    EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: path.join(OUT, "sentetik-eposta.jsonl"),
    AUTH_OTP_PEPPER: "mfa-ui-pepper-0123456789abcdefghijklmnop", NEXT_TELEMETRY_DISABLED: "1",
  };
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "localhost"],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore", detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  const required = async (id: string) => ((await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [id])).rows[0] as { mfa_required: boolean }).mfa_required;
  try {
    for (let i = 0; i < 120; i++) { try { const r = await fetch(`${BASE}/`); if (r.status < 500) break; } catch { /* bekle */ } await sleep(1000); }
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id IN ($1, $2)`, [FREE, U.owner]);

    const login = async (page: Page, email: string) => {
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      const resp = page.waitForResponse((r) => r.url().endsWith("/api/auth/session") && r.request().method() === "POST", { timeout: 30000 });
      await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill(pw(email));
      await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
      const r = await resp;
      await page.waitForFunction(() => !!localStorage.getItem("yasam_user"), null, { timeout: 20000 }).catch(() => {});
      return r.status();
    };
    const openMember = async (page: Page) => {
      await page.goto(`${BASE}/admin/users/${FREE}#hesap`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Hesap durumu ve erişim özeti" }).waitFor({ timeout: 30000 });
    };

    const profiles: { name: string; channel?: string }[] = [{ name: "Chrome", channel: "chrome" }];
    try { const e = await chromium.launch({ channel: "msedge", headless: true }); await e.close(); profiles.push({ name: "Edge", channel: "msedge" }); } catch { console.log("  NOT TESTED Edge (ikili yok)"); }

    for (const prof of profiles) {
      const browser = await chromium.launch({ channel: prof.channel, headless: true });
      browsers.push(browser);
      console.log(`\n══ ${prof.name} ${browser.version()} ══`);
      for (const w of [320, 375, 390, 1280]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, locale: "tr-TR" });
        const page = await ctx.newPage();
        ok((await login(page, EMAIL.owner)) === 200, `${prof.name} ${w}px: Owner girişi`);
        await openMember(page);
        const panel = page.locator("[data-mfa-panel]");
        await panel.waitFor({ timeout: 20000 });
        await page.locator("[data-mfa-ready]").waitFor({ timeout: 20000 });
        const m = await page.evaluate(() => {
          const el = document.querySelector("[data-mfa-panel]") as HTMLElement | null;
          const r = el?.getBoundingClientRect();
          const btns = Array.from(el?.querySelectorAll("button") ?? []).map((b) => (b as HTMLElement).getBoundingClientRect()).filter((b) => b.width > 0);
          return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: r?.left ?? -1, right: r?.right ?? 99999,
            minBtnH: btns.length ? Math.min(...btns.map((b) => b.height)) : 0, text: el?.innerText ?? "" };
        });
        ok(m.sw <= m.cw + 1, `${prof.name} ${w}px: yatay taşma yok (sayfa ${m.sw} ≤ ${m.cw})`, m);
        ok(m.left >= 0 && m.right <= w + 1, `${prof.name} ${w}px: bölüm ekran içinde`, { left: m.left, right: m.right });
        ok(m.minBtnH >= 43, `${prof.name} ${w}px: düğmeler dokunulabilir (≥ 44 px)`, m.minBtnH);
        ok(!m.text.includes("@") && /İki Aşamalı Giriş Yönetimi/.test(m.text) && /Hazır/.test(m.text), `${prof.name} ${w}px: içerik doğru, e-posta adresi / kod gösterilmiyor`);
        await panel.screenshot({ path: path.join(OUT, `${prof.name.toLowerCase()}-${w}-durum.png`) });

        if (prof.name === "Chrome" && w === 375) {
          await page.locator("[data-mfa-action=enable]").click();
          const submit = page.locator("[data-mfa-submit]");
          ok(await submit.isDisabled(), "Chrome 375px: gerekçe + onay olmadan gönder düğmesi KAPALI");
          await page.locator("[data-mfa-reason]").fill("Owner kararı: hesap güvenliği");
          ok(await submit.isDisabled(), "Chrome 375px: onay kutusu işaretlenmeden KAPALI");
          await page.locator("[data-mfa-confirm]").check();
          await panel.screenshot({ path: path.join(OUT, `chrome-375-onay-formu.png`) });
          await submit.click();
          await page.locator("[data-mfa-message=ok]").waitFor({ timeout: 20000 });
          ok(await required(FREE), "Chrome 375px: arayüzden AÇILDI (DB: zorunlu)");
          ok((await page.locator("[data-mfa-required=on]").count()) === 1, "Chrome 375px: ekran sunucu sonucunu gösterir (Açık)");
          await page.locator("[data-mfa-action=disable]").click();
          await page.locator("[data-mfa-reason]").fill("Üye telefonunu kaybetti");
          await page.locator("[data-mfa-confirm]").check();
          await page.locator("[data-mfa-submit]").click();
          await page.locator("[data-mfa-message=error]").waitFor({ timeout: 20000 });
          const err = await page.locator("[data-mfa-message=error]").innerText();
          ok(/ikinci doğrulamayla yeniden giriş/.test(err) && (await required(FREE)), "Chrome 375px: MFA'sız Owner oturumuyla kaldırma REDDEDİLİR, sebep gösterilir", err);
          await panel.screenshot({ path: path.join(OUT, `chrome-375-kaldirma-reddi.png`) });
        }
        await ctx.close();
      }
      if (prof.name === "Chrome") {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: "tr-TR" });
        const page = await ctx.newPage();
        ok((await login(page, ADM2)) === 200, "Chrome 390px: Owner olmayan yönetici girişi");
        await openMember(page);
        await sleep(3000);
        ok((await page.locator("[data-mfa-panel]").count()) === 0, "Owner olmayan yöneticiye bölüm HİÇ çizilmez");
        await page.screenshot({ path: path.join(OUT, `chrome-390-yonetici2.png`), fullPage: false });
        await ctx.close();
      }
    }
  } finally {
    console.log(`\nmfa-yonetimi-ui: ${pass} PASS, ${fail} FAIL`);
    if (failures.length) console.log("FAIL:\n - " + failures.join("\n - "));
    for (const b of browsers) await b.close().catch(() => {});
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    else try { process.kill(-(app.pid ?? 0), "SIGTERM"); } catch { /* yok */ }
    proxy.close();
    await db.close();
  }
  process.exit(fail ? 1 : 0);
}
void main().catch((e) => { console.error(e); console.log(`\nmfa-yonetimi-ui: ${pass} PASS, ${fail + 1} FAIL`); process.exit(1); });
