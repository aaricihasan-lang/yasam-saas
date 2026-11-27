/**
 * GİRİŞ GÜVENLİĞİ F2-I — TARAYICI dayanıklılık testi: e-posta koduyla girişte kullanıcı davranışları.
 * Tarayıcılar: Chrome + Edge (masaüstü), WebKit iPhone emülasyonu (Safari motoru; HTTPS vekil), Chromium Android
 * emülasyonu ve 320 px. GERÇEK CİHAZ / GERÇEK SAFARI / GERÇEK GMAIL DEĞİLDİR — sentetik e-posta sağlayıcısı.
 * Production'a SIFIR temas; sentetik kullanıcılar.
 *
 * Her tarayıcıda: (1) kod, e-postanın düz metin satırından kopyalanır gibi BOŞLUKLARLA yapıştırılır; (2) süresi dolmuş
 * kod uyarısı; (3) doğrulama ekranında sayfa yenileme → oturum açılmaz, yeniden giriş çalışır; (4) geri tuşu → oturum
 * açılmaz; (5) ağ kesilince doğrulama → uyarı + oturum yok, ağ gelince aynı kodla giriş; (6) uyarı metinleri yatay taşma
 * yapmaz.
 *
 * Ön koşul: f2c-ui.e2e.ts başlığındaki sahte env ile `next build --webpack`. WebKit için F2D_TLS_DIR (cert.pem/key.pem).
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2i-mobil-ui.e2e.ts <yeni-boş-kanıt-klasörü>
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, devices, webkit, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { startF2cDb, pw } from "./testDb";

const OUT = process.argv[2];
if (!OUT) { console.log("kanıt klasörü gerekli"); process.exit(2); }
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.log("kanıt klasörü boş olmalı (üzerine yazılmaz)"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const SINK = path.join(OUT, "sentetik-eposta.jsonl");
const PORT = 3988;
const BASE = `http://localhost:${PORT}`;
const TLS_PORT = 3989;
const TLS_BASE = `https://localhost:${TLS_PORT}`;
const TLS_DIR = process.env.F2D_TLS_DIR ?? "";
const SUPA_PROXY_PORT = 54398;
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => {
  if (c) pass++; else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 300)}`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };

function sinkCount(): number {
  try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).length; } catch { return 0; }
}
async function waitCode(to: string, after: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    let lines: string[] = [];
    try { lines = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean); } catch { /* henüz yok */ }
    const mails = lines.slice(after).map((l) => JSON.parse(l) as { to: string; subject: string; text?: string }).filter((m) => m.to === to);
    const code = /\b([0-9]{6})\b/.exec(mails[mails.length - 1]?.text ?? "")?.[1];
    if (code) return code;
    await sleep(250);
  }
  return "";
}
async function startLogin(page: Page, email: string, base: string): Promise<void> {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(pw(email));
  await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
  await page.getByTestId("mfa-email-panel").waitFor({ timeout: 20000 });
}

async function main() {
  const db = await startF2cDb({ withF2d: true });
  const q = (sql: string, args: unknown[] = []) => db.admin.query(sql, args);
  const sessions = async () => Number((await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND mfa_method = 'email_otp'`, [VE.id])).rows[0].n);
  const resetLimits = async () => {
    await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending', 'verified')`, [VE.id]);
    await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours' WHERE user_id = $1`, [VE.id]);
  };
  await q(`UPDATE public.users SET email_verified_at = now() - interval '1 day' WHERE id = $1`, [VE.id]);
  await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${VE.id}'; SELECT set_config('yasam.mfa_policy','off',false);`);
  const proxy = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()); });
  let tlsProxy: https.Server | null = null;
  if (TLS_DIR) {
    tlsProxy = https.createServer({ cert: fs.readFileSync(path.join(TLS_DIR, "cert.pem")), key: fs.readFileSync(path.join(TLS_DIR, "key.pem")) }, (req, res) => {
      const up = http.request({ host: "127.0.0.1", port: PORT, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } },
        (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
      up.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(up);
    });
    await new Promise<void>((resolve, reject) => { tlsProxy!.once("error", reject); tlsProxy!.listen(TLS_PORT, () => resolve()); });
  }
  const env: Record<string, string | undefined> = {
    ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret", SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: `${BASE},${TLS_BASE}`, RATE_LIMIT_SECRET: "f2i-ui-rate-secret", LOGIN_IP_PEPPER: "f2i-ui-pepper",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true", AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all",
    AUTH_MFA_EMAIL_ROLES: "expert", EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: SINK,
    AUTH_OTP_PEPPER: "f2i-ui-pepper-0123456789abcdefghijklmnopqrstu", NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.VERCEL_ENV;
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore",
      // F2-L: Linux'ta kendi süreç grubu → kapanışta npx'in altındaki next-server da sonlanır (portta eski sunucu kalmaz).
      detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  try {
    for (let i = 0; i < 90; i++) { try { const r = await fetch(`${BASE}/m/onay`); if (r.ok) break; } catch { /* bekle */ } await sleep(1000); }
    const chrome = await chromium.launch({ channel: "chrome", headless: true });
    browsers.push(chrome);
    const runs: { label: string; launch: () => Promise<Browser>; opts: BrowserContextOptions; base?: string }[] = [
      { label: "Chrome-masaustu", launch: async () => chrome, opts: { viewport: { width: 1280, height: 860 }, locale: "tr-TR" } },
      { label: "Edge-masaustu", launch: () => chromium.launch({ channel: "msedge", headless: true }), opts: { viewport: { width: 1280, height: 860 }, locale: "tr-TR" } },
      { label: "iPhone-Safari-WebKit", launch: () => webkit.launch({ headless: true }), base: TLS_DIR ? TLS_BASE : BASE,
        opts: { ...devices["iPhone 14"], locale: "tr-TR", ...(TLS_DIR ? { ignoreHTTPSErrors: true } : {}) } },
      { label: "Android-Chrome-emul", launch: async () => chrome, opts: { ...devices["Pixel 7"], locale: "tr-TR" } },
      { label: "Mobil-320", launch: async () => chrome, opts: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, locale: "tr-TR" } },
    ];
    for (const r of runs) {
      const base = r.base ?? BASE;
      const rb = await r.launch();
      if (rb !== chrome) browsers.push(rb);
      const vw = r.opts.viewport?.width ?? 1280;
      console.log(`\n── ${r.label} ──`);

      // (1) Boşluklu yapıştırma: düz metin e-postadaki satır "    123456" biçimindedir.
      await resetLimits();
      {
        const ctx = await rb.newContext(r.opts);
        const page = await ctx.newPage();
        await startLogin(page, VE.email, base);
        const before = sinkCount();
        await page.getByTestId("mfa-email-send").click();
        const code = await waitCode(VE.email, before);
        const input = page.getByTestId("mfa-email-code");
        await input.waitFor({ timeout: 10000 });
        await input.click();
        await page.keyboard.insertText(`    ${code.slice(0, 3)} ${code.slice(3)} `);
        const val = await input.inputValue();
        // F2-L: kod hiç gelmezse ("" === "") sahte PASS olmasın — 6 haneli kod ŞART.
        ok(/^[0-9]{6}$/.test(code) && val === code, `${r.label}: boşluklu yapıştırma → alan "${val}" (beklenen 6 hane)`, { val, code });
        await page.getByTestId("mfa-email-verify").click();
        await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-email-panel"]'), undefined, { timeout: 20000 }).catch(() => {});
        await sleep(1000);
        ok((await q(`SELECT count(*)::int n FROM public.auth_mfa_challenges WHERE user_id = $1 AND state = 'consumed' AND created_at > now() - interval '2 minutes'`, [VE.id])).rows[0].n >= 1,
          `${r.label}: yapıştırılan kodla giriş tamamlandı`);
        await page.screenshot({ path: path.join(OUT, `${r.label}-1-yapistirma.png`) });
        await ctx.close();
      }

      // (2) Süresi dolmuş kod + (6) uyarı yatay taşma yapmaz.
      await resetLimits();
      {
        const ctx = await rb.newContext(r.opts);
        const page = await ctx.newPage();
        await startLogin(page, VE.email, base);
        const before = sinkCount();
        await page.getByTestId("mfa-email-send").click();
        const code = await waitCode(VE.email, before);
        await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '10 minutes', expires_at = expires_at - interval '10 minutes' WHERE user_id = $1 AND state IN ('pending', 'active')`, [VE.id]);
        const s0 = await sessions();
        await page.getByTestId("mfa-email-code").fill(code);
        await page.getByTestId("mfa-email-verify").click();
        await page.getByTestId("mfa-email-error").waitFor({ timeout: 10000 });
        const t = await page.getByTestId("mfa-email-error").innerText();
        ok(/süresi doldu/i.test(t), `${r.label}: süresi dolmuş kod uyarısı`, t);
        ok(await sessions() === s0, `${r.label}: süresi dolmuş kodla oturum AÇILMADI`);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        ok(sw <= vw, `${r.label}: uyarı ile yatay taşma yok (${sw} ≤ ${vw})`);
        await page.screenshot({ path: path.join(OUT, `${r.label}-2-suresi-dolmus.png`) });
        await ctx.close();
      }

      // (3) Sayfa yenileme ve (4) geri tuşu: oturum açılmaz; yeniden giriş çalışır.
      await resetLimits();
      {
        const ctx = await rb.newContext(r.opts);
        const page = await ctx.newPage();
        await startLogin(page, VE.email, base);
        const s0 = await sessions();
        await page.reload({ waitUntil: "domcontentloaded" });
        await sleep(1500);
        const err = await page.locator("text=Application error").count();
        ok(err === 0 && await sessions() === s0, `${r.label}: doğrulama ekranında yenileme → hata yok, oturum açılmadı`);
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        await sleep(1000);
        ok(await sessions() === s0, `${r.label}: geri tuşu → oturum açılmadı`);
        await resetLimits();
        await startLogin(page, VE.email, base);
        ok(true, `${r.label}: yenileme / geri sonrası yeniden giriş ekranı çalışıyor`);
        await ctx.close();
      }

      // (5) Ağ kesilmesi: uyarı + oturum yok; ağ gelince aynı kodla giriş.
      await resetLimits();
      {
        const ctx = await rb.newContext(r.opts);
        const page = await ctx.newPage();
        await startLogin(page, VE.email, base);
        const before = sinkCount();
        await page.getByTestId("mfa-email-send").click();
        const code = await waitCode(VE.email, before);
        const s0 = await sessions();
        await page.getByTestId("mfa-email-code").fill(code);
        await ctx.setOffline(true);
        await page.getByTestId("mfa-email-verify").click();
        await sleep(2500);
        const visible = await page.getByTestId("mfa-email-error").isVisible().catch(() => false);
        const errText = visible ? await page.getByTestId("mfa-email-error").innerText() : "";
        ok(visible && errText.length > 0, `${r.label}: ağ yokken uyarı gösterildi`, errText);
        ok(await sessions() === s0, `${r.label}: ağ yokken oturum açılmadı`);
        await page.screenshot({ path: path.join(OUT, `${r.label}-3-ag-yok.png`) });
        await ctx.setOffline(false);
        await page.getByTestId("mfa-email-verify").click();
        await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-email-panel"]'), undefined, { timeout: 20000 }).catch(() => {});
        await sleep(1500);
        ok(await sessions() === s0 + 1, `${r.label}: ağ gelince aynı kodla giriş tamamlandı`);
        await ctx.close();
      }
    }
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
    if (app.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else { try { process.kill(-app.pid, "SIGKILL"); } catch { app.kill("SIGKILL"); } }
    }
    proxy.close();
    tlsProxy?.close();
    await db.close();
  }
  console.log(`\nf2i mobil ui e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
