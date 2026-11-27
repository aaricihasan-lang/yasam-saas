/**
 * GİRİŞ GÜVENLİĞİ F4 — kurtarma kodu kurulumu (MFA öncesi) + Owner ekranında kurtarma kodu şartı: GERÇEK TARAYICI
 * (gerçek Google Chrome + gerçek Microsoft Edge; 320 / 375 / 390 / 768 / 1280 px). GERÇEK: Next.js production build, gerçek
 * route'lar, gerçek PostgreSQL (en güncel F2 zinciri + TASLAK migration 20280129100100), HttpOnly çerez birincil kip.
 * Production'a SIFIR temas; sentetik hesaplar; e-posta SENTETİK (yerel dosya; kanıta konmaz).
 *
 * Doğrulanan: pilot (test listesinde, e-postası doğrulanmış, zorunluluk kapalı) Ayarlar'da "önce kurtarma" formunu görür;
 * parola → kayıtlı adrese kod → kod → 10 kurtarma kodu bir kez gösterilir, "kaydettim" onayı olmadan gizlenmez; listede olmayan
 * uzmanda kurulum formu YOK; Owner Üye Detayı'nda kodsuz üyede "Zorunluluğu aç" KAPALI + açıklama, kodlu pilotta AÇIK;
 * yatay taşma yok, düğmeler ekran içinde, kod alanı etiketli, DOM'da pepper / tam adres yok.
 *
 * Sonuç: 0 = PASS · 1 = FAIL · 3 = NOT TESTED (gerçek Edge yok). Asgari PASS (F4_UI_MIN_PASS).
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54466 … npx next build --webpack
 * Çalıştır: npx tsx scripts/giris-guvenligi/f4-kurtarma-ui.e2e.ts <kanıt-klasörü>
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

const PORT = Number(process.env.F4_UI_PORT ?? 3975);
const SUPA_PROXY_PORT = Number(process.env.F4_UI_SUPA_PORT ?? 54466);
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? "";
const MIN_PASS = Number(process.env.F4_UI_MIN_PASS ?? 0);
const REQUIRE_EDGE = process.env.F4_UI_REQUIRE_EDGE === "1";
const WIDTHS = [320, 375, 390, 768, 1280];
const PEPPER = "f4-ui-pepper-0123456789abcdefghijklmnopqrs";
let pass = 0;
let fail = 0;
const notTested: string[] = [];
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Üye Detayı ekranının okuduğu, en küçük F2 test şemasında olmayan kolonlar (mfa-yonetimi-ui ile aynı; veri eklemez). */
const UYE_DETAY_SEMA = `
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approved_at timestamptz, ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS payment_status text, ADD COLUMN IF NOT EXISTS last_payment_date date, ADD COLUMN IF NOT EXISTS next_payment_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2), ADD COLUMN IF NOT EXISTS payment_note text, ADD COLUMN IF NOT EXISTS agreed_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS billing_period text, ADD COLUMN IF NOT EXISTS license_note text, ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz;
CREATE TABLE IF NOT EXISTS public.user_payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2), payment_date date, note text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.user_payment_history TO service_role;`;

async function main() {
  if (!OUT) throw new Error("kanıt klasörü verin");
  fs.mkdirSync(OUT, { recursive: true });
  const SINK = path.join(OUT, "sentetik-eposta.jsonl");
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium } = req2("playwright") as typeof import("playwright");
  type Page = import("playwright").Page;
  type Browser = import("playwright").Browser;
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  await db.admin.query(UYE_DETAY_SEMA);
  await db.admin.query(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280129100100_auth_mfa_pilot_safety_f4.sql"), "utf8"));
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
    RATE_LIMIT_SECRET: "f4-ui-rate-secret", LOGIN_IP_PEPPER: "f4-ui-ip-pepper", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: SINK, AUTH_OTP_PEPPER: PEPPER, NEXT_TELEMETRY_DISABLED: "1",
    AUTH_MFA_METHODS: "email_otp", AUTH_MFA_METHOD_SCOPE: "test_accounts",
  };
  for (const k of ["AUTH_EMAIL_SELF_SERVICE_ROLES", "AUTH_MFA_EMAIL_ROLES", "AUTH_EMAIL_VERIFY_PILOT_USER_ID"]) delete env[k];
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "localhost"],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore", detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  const mails = () => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to?: string; text?: string }); } catch { return []; } };
  const waitCode = async (to: string, after: number) => {
    for (let i = 0; i < 60; i++) {
      const m = mails().slice(after).reverse().find((x) => x.to === to);
      const c = /\b([0-9]{6})\b/.exec(m?.text ?? "")?.[1];
      if (c) return c;
      await sleep(500);
    }
    return "";
  };
  try {
    for (let i = 0; i < 150; i++) { try { const r = await fetch(`${BASE}/`); if (r.status < 500) break; } catch { /* bekle */ } await sleep(1000); }
    const P = U.exp, PE = EMAIL.exp, O = U.free;
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = ANY($1::uuid[])`, [[P, O]]);
    await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'F4 UI', $2, now(), now() + interval '14 days')`, [P, U.owner]);
    const resetAttempts = async () => {
      await q(`DELETE FROM public.auth_rate_limit_events WHERE bucket LIKE 'login%'`).catch(() => {});
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes'`).catch(() => {});
      await q(`DELETE FROM public.auth_recovery_events WHERE event = 'codes_generated'`).catch(() => {});   // 24 sa'te 3 sınırı: yalnız sentetik DB
    };
    const login = async (page: Page, email: string) => {
      await resetAttempts();
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
    const layout = async (page: Page, sel: string, tag: string, w: number, ownEmail: string) => {
      const m = await page.evaluate((s) => {
        const el = document.querySelector(s) as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        const btns = Array.from(el?.querySelectorAll("button") ?? []).map((b) => (b as HTMLElement).getBoundingClientRect()).filter((b) => b.width > 0);
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: r?.left ?? -1, right: r?.right ?? 99999,
          btnOut: btns.filter((b) => b.left < -1 || b.right > window.innerWidth + 1).length, text: el?.innerText ?? "" };
      }, sel);
      const html = await page.content();
      ok(m.sw <= m.cw + 1 && m.left >= 0 && m.right <= w + 1 && m.btnOut === 0, `${tag}: taşma yok, bölüm ve düğmeler ekran içinde`, m);
      ok(!m.text.includes(ownEmail) && !html.includes(PEPPER), `${tag}: tam adres bölümde yok; pepper DOM'da yok`);
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
        // ── Pilot: MFA öncesi kurulum ──
        {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, PE);
          ok(l.status === 200 && l.loggedIn, `${tag}: pilot parola girişi`, l);
          await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
          const form = page.getByTestId("recovery-setup-form");
          await form.waitFor({ timeout: 30000 });
          ok(await form.isVisible() && /ÖNCE kurtarma kodlarınızı oluşturun/.test(await form.innerText()), `${tag}: pilotta "önce kurtarma" kurulum formu görünür`);
          await layout(page, '[data-testid="recovery-codes-card"]', `${tag} pilot`, w, PE);
          if ((prof.name === "Chrome" && w === 375) || (prof.name === "Edge" && w === 390)) {
            const send = page.getByTestId("recovery-setup-send");
            ok(await send.isDisabled(), `${tag}: parola girilmeden "kod gönder" KAPALI`);
            await page.getByTestId("recovery-setup-password").fill(pw(PE));
            const before = mails().length;
            await send.click();
            const code = await waitCode(PE, before);
            ok(/^[0-9]{6}$/.test(code) && mails().slice(before).every((m) => m.to === PE), `${tag}: kod yalnız pilotun kayıtlı adresine`);
            const input = page.getByTestId("recovery-setup-code");
            await input.waitFor({ timeout: 15000 });
            ok((await input.getAttribute("aria-label")) === "Doğrulama kodu" && (await input.getAttribute("autocomplete")) === "one-time-code", `${tag}: kod alanı etiketli`);
            await input.fill(code === "000000" ? "111111" : "000000");
            await page.getByTestId("recovery-setup-generate").click();
            const err = page.getByTestId("recovery-error");
            await err.waitFor({ timeout: 15000 });
            ok(/Kod hatalı/.test(await err.innerText()), `${tag}: yanlış kod uyarısı görünür`);
            await input.fill(code);
            await page.getByTestId("recovery-setup-generate").click();
            const shown = page.getByTestId("recovery-codes-shown");
            await shown.waitFor({ timeout: 20000 });
            const items = await page.getByTestId("recovery-code-item").count();
            const close = page.getByTestId("recovery-codes-close");
            ok(items === 10 && await close.isDisabled(), `${tag}: 10 kurtarma kodu gösterildi; "kaydettim" onayı olmadan gizlenemez`, items);
            // Kodların gösterildiği an ekran görüntüsüne ALINMAZ (sentetik de olsa kod içeren görsel kanıta konmaz).
            await page.getByTestId("recovery-codes-saved").check();
            await close.click();
            await page.getByTestId("recovery-notice").waitFor({ timeout: 10000 });
            const n = Number((await q(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'active'`, [P])).rows[0].n);
            ok(n === 10 && (await page.getByTestId("recovery-codes-shown").count()) === 0, `${tag}: kodlar gizlendi; DB'de 10 aktif özet`, n);
          }
          await page.getByTestId("recovery-codes-card").screenshot({ path: path.join(OUT, `${slug}-pilot-kurtarma-karti.png`) });
          await ctx.close();
        }
        // ── Listede olmayan uzman: kurulum formu YOK ──
        if (w === 375 || w === 1280) {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, EMAIL.free);
          ok(l.loggedIn, `${tag}: listede olmayan uzman girişi`, l);
          await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
          await page.getByTestId("recovery-codes-card").waitFor({ timeout: 30000 });
          await sleep(1500);
          ok((await page.getByTestId("recovery-setup-form").count()) === 0, `${tag}: listede olmayan uzmanda MFA öncesi kurulum formu YOK`);
          await ctx.close();
        }
        // ── Owner: kurtarma kodu şartı ──
        if (w === 390 || w === 1280) {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, EMAIL.owner);
          ok(l.loggedIn, `${tag}: Owner girişi`, l);
          // Kodsuz üye: listeye geçici alınır (yöntem hazır, kurtarma yok)
          await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'F4 UI kodsuz', $2, now(), now() + interval '1 day') ON CONFLICT DO NOTHING`, [O, U.owner]).catch(() => {});
          await page.goto(`${BASE}/admin/users/${O}#hesap`, { waitUntil: "domcontentloaded" });
          await page.getByRole("heading", { name: "Hesap durumu ve erişim özeti" }).waitFor({ timeout: 30000 });
          await page.locator("[data-mfa-ready=yes]").waitFor({ timeout: 20000 });
          ok(await page.locator("[data-mfa-action=enable]").isDisabled() && (await page.locator("[data-mfa-recovery-blocked]").count()) === 1,
            `${tag}: kodsuz üyede "Zorunluluğu aç" KAPALI, açıklama görünür`);
          await page.locator("[data-mfa-panel]").screenshot({ path: path.join(OUT, `${slug}-owner-kodsuz-uye.png`) });
          await page.goto(`${BASE}/admin/users/${P}#hesap`, { waitUntil: "domcontentloaded" });
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.getByRole("heading", { name: "Hesap durumu ve erişim özeti" }).waitFor({ timeout: 30000 });
          await page.locator("[data-mfa-ready=yes]").waitFor({ timeout: 20000 });
          const hasCodes = Number((await q(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'active'`, [P])).rows[0].n) > 0;
          ok(!hasCodes || (await page.locator("[data-mfa-action=enable]").isEnabled() && (await page.locator("[data-mfa-recovery-blocked]").count()) === 0),
            `${tag}: kodlu pilotta "Zorunluluğu aç" AÇIK (tıklanmaz; gerçek zorunluluk Owner kararı)`, { hasCodes });
          await layout(page, "[data-mfa-panel]", `${tag} Owner paneli`, w, PE);
          await q(`DELETE FROM public.auth_mfa_test_accounts WHERE user_id = $1`, [O]);   // geçici kayıt geri alınır (sentetik)
          await ctx.close();
        }
      }
    }
    ok(mails().every((m) => m.to === EMAIL.exp), "bütün koşu boyunca iletiler YALNIZ pilotun kayıtlı adresine", [...new Set(mails().map((m) => m.to))]);
  } finally {
    const nt = notTested.length ? ` · NOT TESTED: ${notTested.join(", ")}` : "";
    console.log(`\nf4-kurtarma-ui: ${pass} PASS, ${fail} FAIL${nt}`);
    if (failures.length) console.log("FAIL:\n - " + failures.join("\n - "));
    for (const b of browsers) await b.close().catch(() => {});
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    else try { process.kill(-(app.pid ?? 0), "SIGTERM"); } catch { /* yok */ }
    proxy.close();
    try { fs.rmSync(SINK, { force: true }); } catch { /* kanıta kod içeren dosya bırakılmaz */ }
    await db.close();
  }
  if (fail) process.exit(1);
  if (MIN_PASS && pass < MIN_PASS) { console.log(`FAIL: asgari PASS ${MIN_PASS}, gözlenen ${pass}`); process.exit(1); }
  if (REQUIRE_EDGE && notTested.length) { console.log("NOT TESTED (altyapı) — gerçek FAIL değil"); process.exit(3); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); console.log(`\nf4-kurtarma-ui: ${pass} PASS, ${fail + 1} FAIL`); process.exit(1); });
