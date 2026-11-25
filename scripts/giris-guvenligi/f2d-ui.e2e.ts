/**
 * GİRİŞ GÜVENLİĞİ F2-D — TARAYICI uçtan uca + görsel kabul: e-posta kodu ile giriş.
 * Tarayıcılar: Chrome, Edge (masaüstü), WebKit iPhone emülasyonu (Safari motoru), Chromium Android
 * emülasyonu. GERÇEK CİHAZ / GERÇEK SAFARI / GERÇEK GMAIL DEĞİLDİR — sentetik sağlayıcı (kod yerel
 * dosyadan okunur). Production'a SIFIR temas; sentetik kullanıcılar.
 *
 * Ön koşul: yerel sahte env ile build (bkz. f2c-ui.e2e.ts başlığı).
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2d-ui.e2e.ts <yeni-boş-kanıt-klasörü>
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, devices, webkit, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { startF2cDb, EMAIL, U, pw } from "./testDb";

const OUT = process.argv[2];
if (!OUT) { console.log("kanıt klasörü gerekli"); process.exit(2); }
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.log("kanıt klasörü boş olmalı (üzerine yazılmaz)"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const SINK = path.join(OUT, "sentetik-eposta.jsonl");

const PORT = 3988;
const BASE = `http://localhost:${PORT}`;
// WebKit (Safari motoru) http üzerinde Secure / __Host- çerezlerini saklamaz → gerçek siteye uygun olarak
// HTTPS üzerinden sınanır: yerel öz-imzalı TEST sertifikası (F2D_TLS_DIR/cert.pem + key.pem) ile ters vekil.
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
type J = Record<string, unknown>;
const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };
const VE2 = { id: "00000000-0000-0000-0000-00000000e0d2", email: "f2d-ve2@test.local" };

function sinkCount(): number {
  try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).length; } catch { return 0; }
}
async function waitCode(to: string, after: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    let lines: string[] = [];
    try { lines = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean); } catch { /* henüz yok */ }
    const mails = lines.slice(after).map((l) => JSON.parse(l) as { to: string; subject: string }).filter((m) => m.to === to);
    const code = /^([0-9]{6}) — /.exec(mails[mails.length - 1]?.subject ?? "")?.[1];
    if (code) return code;
    await sleep(250);
  }
  return "";
}

async function startLogin(page: Page, email: string, base = BASE): Promise<J> {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const resp = page.waitForResponse((r) => r.url().endsWith("/api/auth/session") && r.request().method() === "POST", { timeout: 30000 });
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(pw(email));
  await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
  return (await (await resp).json()) as J;
}

async function main() {
  const db = await startF2cDb({ withF2d: true });
  const q = (sql: string, args: unknown[] = []) => db.admin.query(sql, args);
  const resetLimits = async (userId: string) => {
    await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending', 'verified')`, [userId]);
    await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours' WHERE user_id = $1`, [userId]);
  };
  const proxy = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()); });
  // HTTPS ters vekil (yalnız TLS_DIR verilmişse): https://localhost:3989 → http://127.0.0.1:3988, başlıklar korunur.
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
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret",
    SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: `${BASE},${TLS_BASE}`,
    RATE_LIMIT_SECRET: "f2d-ui-rate-secret",
    LOGIN_IP_PEPPER: "f2d-ui-pepper",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    AUTH_MFA_METHODS: "qr_device,email_otp",
    AUTH_MFA_METHOD_SCOPE: "all",
    AUTH_MFA_EMAIL_ROLES: "expert",
    EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1",
    EMAIL_SYNTHETIC_SINK: SINK,
    AUTH_OTP_PEPPER: "f2d-ui-pepper-0123456789abcdefghijklmnopqrstu",
    NEXT_TELEMETRY_DISABLED: "1",
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

    console.log("\n── Ayarlar → Giriş Yöntemlerim: e-posta doğrulama (Chrome) ──");
    {
      const ctx = await chrome.newContext({ viewport: { width: 1280, height: 900 }, locale: "tr-TR" });
      const page = await ctx.newPage();
      const l = await startLogin(page, VE.email);
      ok(l.ok !== false && !l.code, "VE (MFA zorunlu değil) parola ile giriş", l);
      await page.waitForURL((u) => !u.pathname.endsWith("/") || u.pathname.length > 1, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
      const panel = page.getByTestId("login-methods-panel");
      await panel.waitFor({ timeout: 20000 });
      await page.getByTestId("email-verify-send").waitFor({ timeout: 15000 });
      await panel.screenshot({ path: path.join(OUT, "1-ayarlar-giris-yontemleri-dogrulanmadi.png") });
      const before = sinkCount();
      await page.getByTestId("email-verify-send").click();
      const code = await waitCode(VE.email, before);
      ok(/^[0-9]{6}$/.test(code), "doğrulama kodu e-postayla (sentetik) geldi");
      await page.getByTestId("email-verify-code").fill(code);
      await panel.screenshot({ path: path.join(OUT, "2-ayarlar-kod-girildi.png") });
      await page.getByTestId("email-verify-confirm").click();
      await page.getByTestId("email-verified-badge").waitFor({ timeout: 15000 });
      ok(true, "Ayarlar: 'Doğrulandı' rozeti");
      await panel.screenshot({ path: path.join(OUT, "3-ayarlar-dogrulandi.png") });
      const v = (await q(`SELECT email_verified_at IS NOT NULL AS v FROM public.users WHERE id = $1`, [VE.id])).rows[0].v;
      ok(v === true, "DB: email_verified_at");
      await ctx.close();
    }

    // Owner: VE zorunlu; VE2'ye aktif cihaz + doğrulanmış e-posta (iki yöntem) — SQL kurulum (yerel test).
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${VE.id}'; SELECT set_config('yasam.mfa_policy','off',false);`);
    await q(`SELECT set_config('yasam.mfa_finalize','on',false);
      INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method)
      VALUES ('${U.owner}', 'f2d-ui-owner-mfa', true, 'desktop_web', 'admin', now() + interval '1 day', 'qr_device');
      SELECT set_config('yasam.mfa_finalize','off',false);`);
    const enr = (await q(`SELECT public.auth_device_enroll_begin($1, repeat('A', 120), encode(sha256('f2d-ui-k'::bytea), 'hex'), 'ABCD-EFGH', 'Pixel 8', 34, '2.0.0', 'iph', NULL) AS r`, [VE2.id])).rows[0].r;
    // F2-G (000700) sonrası Owner cihaz onayı işleme özel kanıt ister: Owner'ın telefonu (yerel test) QR ile onaylar.
    const oDev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, repeat('O', 120), encode(sha256('f2d-ui-owner-phone'::bytea), 'hex'), 'OWNR-PHON', 'active', now()) RETURNING id`, [U.owner])).rows[0].id;
    const su = (await q(`SELECT public.auth_owner_step_up_begin('f2d-ui-owner-mfa', 'device_approve', $1) AS r`, [enr.device_id])).rows[0].r;
    if (su?.ok === true) await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4)`, [su.challenge_id, su.qr_nonce, oDev, su.match_code]);
    await q(`SELECT public.auth_device_owner_decide('f2d-ui-owner-mfa', $1, 'approve', true, 'telefon', NULL)`, [enr.device_id]);
    await q(`SELECT public.auth_device_activate($1, (SELECT activation_nonce FROM public.auth_trusted_devices WHERE id = $1))`, [enr.device_id]);
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [VE2.id]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${VE2.id}'; SELECT set_config('yasam.mfa_policy','off',false);`);
    ok((await q(`SELECT count(*)::int n FROM public.auth_trusted_devices WHERE user_id = $1 AND state = 'active'`, [VE2.id])).rows[0].n === 1, "kurulum: VE2 aktif cihaz + doğrulanmış e-posta");

    // Bellek: Edge / WebKit yalnız kendi aşamasında açık, aşama bitince kapanır (aynı anda tek ek tarayıcı).
    const runs: { label: string; launch: () => Promise<Browser>; opts: BrowserContextOptions; base?: string }[] = [
      { label: "Chrome-masaustu", launch: async () => chrome, opts: { viewport: { width: 1280, height: 860 }, locale: "tr-TR" } },
      { label: "Edge-masaustu", launch: () => chromium.launch({ channel: "msedge", headless: true }), opts: { viewport: { width: 1280, height: 860 }, locale: "tr-TR" } },
      { label: "iPhone-Safari-WebKit", launch: () => webkit.launch({ headless: true }), base: TLS_DIR ? TLS_BASE : BASE,
        opts: { ...devices["iPhone 14"], locale: "tr-TR", ...(TLS_DIR ? { ignoreHTTPSErrors: true } : {}) } },
      { label: "Android-Chrome-emul", launch: async () => chrome, opts: { ...devices["Pixel 7"], locale: "tr-TR" } },
    ];

    for (const r of runs) {
      console.log(`\n── ${r.label}: e-posta kodu ile giriş (yalnız e-posta yöntemi) ──`);
      await resetLimits(VE.id);
      const rb = await r.launch();
      if (rb !== chrome) browsers.push(rb);
      const sessBefore = (await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND mfa_method = 'email_otp'`, [VE.id])).rows[0].n;
      const ctx = await rb.newContext(r.opts);
      const page = await ctx.newPage();
      const l = await startLogin(page, VE.email, r.base ?? BASE);
      const cookieNames = (await ctx.cookies()).map((c) => c.name);
      ok(cookieNames.includes("__Host-yasam_mfa"), `${r.label}: tarayıcı bağlama çerezini (__Host-yasam_mfa) sakladı`, cookieNames);
      ok(l.code === "MFA_REQUIRED" && JSON.stringify(l.methods) === '["email_otp"]', `${r.label}: parola → MFA_REQUIRED (yalnız e-posta)`, l);
      await page.getByTestId("mfa-email-panel").waitFor({ timeout: 15000 });
      ok(await page.getByTestId("mfa-method-qr").count() === 0, `${r.label}: tek yöntem → sekme yok`);
      const vw = r.opts.viewport?.width ?? 1280;
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      ok(scrollW <= vw, `${r.label}: yatay taşma yok (scrollWidth ${scrollW} ≤ ${vw})`);
      await page.screenshot({ path: path.join(OUT, `${r.label}-1-eposta-yontemi.png`) });
      const before = sinkCount();
      await page.getByTestId("mfa-email-send").click();
      const code = await waitCode(VE.email, before);
      ok(/^[0-9]{6}$/.test(code), `${r.label}: kod geldi`);
      await page.getByTestId("mfa-email-code").waitFor({ timeout: 10000 });
      const attrs = await page.getByTestId("mfa-email-code").evaluate((el) => ({
        im: el.getAttribute("inputmode"), ac: el.getAttribute("autocomplete"), focused: document.activeElement === el,
      }));
      ok(attrs.im === "numeric" && attrs.ac === "one-time-code", `${r.label}: sayısal klavye + one-time-code (otomatik doldurma)`, attrs);
      const wrong = code === "000000" ? "111111" : "000000";
      await page.getByTestId("mfa-email-code").fill(wrong);
      await page.getByTestId("mfa-email-verify").click();
      await page.getByTestId("mfa-email-error").waitFor({ timeout: 10000 });
      const errText = await page.getByTestId("mfa-email-error").innerText();
      ok(/Kod hatalı/.test(errText) && /Kalan deneme: 4/.test(errText), `${r.label}: yanlış kod uyarısı`, errText);
      await page.screenshot({ path: path.join(OUT, `${r.label}-2-yanlis-kod.png`) });
      await page.getByTestId("mfa-email-code").fill(code);
      await page.screenshot({ path: path.join(OUT, `${r.label}-3-kod-girildi.png`) });
      await page.getByTestId("mfa-email-verify").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 25000 });
      await sleep(1500);
      const sess = (await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND mfa_method = 'email_otp'`, [VE.id])).rows[0].n;
      ok(sess === sessBefore + 1, `${r.label}: bu tarayıcıda yeni oturum açıldı (mfa_method=email_otp; ${sessBefore} → ${sess})`);
      await page.screenshot({ path: path.join(OUT, `${r.label}-4-giris-sonrasi.png`) });
      await ctx.close();
      if (rb !== chrome) await rb.close();
    }

    for (const r of [runs[0], runs[3]]) {
      console.log(`\n── ${r.label}: iki yöntemli hesap (QR + e-posta) — seçim ve geçiş ──`);
      await resetLimits(VE2.id);
      const ctx = await chrome.newContext(r.opts);
      const page = await ctx.newPage();
      const l = await startLogin(page, VE2.email);
      ok(l.code === "MFA_REQUIRED" && (l.methods as string[]).includes("qr_device") && (l.methods as string[]).includes("email_otp"), `${r.label}: iki yöntem sunuldu`, l.methods);
      await page.getByTestId("mfa-method-email").waitFor({ timeout: 15000 });
      const phone = r.label.startsWith("Android");
      const emailSel = await page.getByTestId("mfa-method-email").getAttribute("aria-selected");
      ok(phone ? emailSel === "true" : emailSel === "false", `${r.label}: varsayılan ${phone ? "e-posta (telefonda QR okutulamaz)" : "QR (masaüstü)"}`);
      await page.screenshot({ path: path.join(OUT, `${r.label}-5-iki-yontem-varsayilan.png`) });
      await page.getByTestId("mfa-method-qr").click();
      await page.getByTestId("mfa-match-code").waitFor({ timeout: 5000 });
      if (phone) ok(await page.getByTestId("mfa-open-app").count() === 1, `${r.label}: "Bu telefonda uygulamayla onayla" bağlantısı`);
      await page.screenshot({ path: path.join(OUT, `${r.label}-6-qr-sekmesi.png`) });
      await page.getByTestId("mfa-method-email").click();
      const before = sinkCount();
      await page.getByTestId("mfa-email-send").click();
      const code = await waitCode(VE2.email, before);
      await page.getByTestId("mfa-email-code").fill(code);
      await page.getByTestId("mfa-email-verify").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 25000 });
      ok(true, `${r.label}: QR'den e-postaya geçip giriş tamamlandı`);
      await ctx.close();
    }

    console.log("\n── Owner: e-posta gönderim durumu ekranı ──");
    {
      const ctx = await chrome.newContext({ viewport: { width: 1280, height: 900 }, locale: "tr-TR" });
      const page = await ctx.newPage();
      await startLogin(page, EMAIL.owner);
      await sleep(2500);
      await page.goto(`${BASE}/admin/eposta-durumu`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("email-configured").waitFor({ timeout: 20000 });
      ok((await page.getByTestId("email-configured").innerText()).includes("Hazır"), "Owner: yapılandırma 'Hazır'");
      const before = sinkCount();
      await page.getByTestId("email-test-send").click();
      await sleep(1500);
      const lines = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).slice(before).map((x) => JSON.parse(x) as { to: string; category: string });
      ok(lines.some((m) => m.to === EMAIL.owner && m.category === "owner_test"), "Owner test iletisi kendi adresine");
      const html = await page.content();
      ok(!html.includes("f2d-ve@test.local") && !html.includes(env.AUTH_OTP_PEPPER!), "durum ekranında kullanıcı adresi / pepper YOK");
      await page.screenshot({ path: path.join(OUT, "7-owner-eposta-durumu.png"), fullPage: true });
      await ctx.close();
    }
    const trial = Number((await q(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [VE.id])).rows[0].n);
    ok(trial === 1, `deneme kaydı tek (${trial})`);
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
  console.log(`\nf2d ui e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
