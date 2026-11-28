/**
 * ⚠️ TARİHÎ (CI'da ÇALIŞMAZ): 28.11 Owner kararıyla uzmanlara kurtarma kodu seçeneği GÖSTERİLMEZ (yalnız Owner);
 * bu dosyanın "uzman Ayarlar'dan kod oluşturur" bölümü artık geçerli değildir. Güncel kapsam: f4-kurtarma-ui.e2e.ts
 * (uzmanda kart yok, Owner'da var) + owner-erisim-sifirlama.harness.ts (Owner destekli giriş erişimi sıfırlama).
 *
 * GİRİŞ GÜVENLİĞİ F2-E — TARAYICI uçtan uca + görsel kabul: hesap kurtarma ekranları.
 * Tarayıcılar: Chrome, Edge (masaüstü), WebKit iPhone emülasyonu (Safari motoru; HTTPS vekil), Chromium
 * Android emülasyonu + 320 / 375 / 390 px mobil görünümler. GERÇEK CİHAZ / GERÇEK SAFARI / GERÇEK GMAIL
 * DEĞİLDİR — sentetik sağlayıcı (kod yerel dosyadan okunur). Production'a SIFIR temas; sentetik kullanıcılar.
 *
 * Akış: e-posta koduyla giriş → Ayarlar › Giriş Yöntemlerim › kurtarma kodları oluştur (parola) → kodlar bir
 * kez gösterilir → her tarayıcıda parola + kurtarma koduyla giriş (yanlış kod uyarısı dahil) → kurtarma
 * oturumu uyarısı → Owner › Hesap kurtarma (talep aç) → kullanıcı ekranında açık talep uyarısı + iptal.
 *
 * Ön koşul: yerel sahte env ile build (bkz. f2c-ui.e2e.ts başlığı). WebKit için F2D_TLS_DIR (cert.pem/key.pem).
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2e-ui.e2e.ts <yeni-boş-kanıt-klasörü>
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

function sinkLines(): { to: string; subject: string; text: string; html: string }[] {
  try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
async function waitCode(to: string, after: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const mails = sinkLines().slice(after).filter((m) => m.to === to);
    const code = /\b([0-9]{6})\b/.exec(mails[mails.length - 1]?.text ?? "")?.[1];
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
async function noOverflow(page: Page, label: string, width: number) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= width, `${label}: yatay taşma yok (scrollWidth ${sw} ≤ ${width})`);
}

async function main() {
  const db = await startF2cDb({ withF2e: true });
  const q = (sql: string, args: unknown[] = []) => db.admin.query(sql, args);
  const resetLimits = async (userId: string) => {
    await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending', 'verified')`, [userId]);
    await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours' WHERE user_id = $1`, [userId]);
    await q(`DELETE FROM public.auth_recovery_attempts WHERE user_id = $1`, [userId]);
  };
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
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret",
    SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: `${BASE},${TLS_BASE}`,
    RATE_LIMIT_SECRET: "f2e-ui-rate-secret",
    LOGIN_IP_PEPPER: "f2e-ui-pepper",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    AUTH_MFA_METHODS: "qr_device,email_otp",
    AUTH_MFA_METHOD_SCOPE: "all",
    AUTH_MFA_EMAIL_ROLES: "expert,admin",
    EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1",
    EMAIL_SYNTHETIC_SINK: SINK,
    AUTH_OTP_PEPPER: "f2e-ui-pepper-0123456789abcdefghijklmnopqrstu",
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

    // Kurulum (yerel test DB): VE / VE2 / Owner e-postası doğrulanmış + MFA zorunlu.
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id IN ($1, $2, $3)`, [VE.id, VE2.id, U.owner]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id IN ('${VE.id}', '${VE2.id}', '${U.owner}'); SELECT set_config('yasam.mfa_policy','off',false);`);

    const emailLogin = async (page: Page, user: { id: string; email: string }, base = BASE) => {
      await resetLimits(user.id);
      const l = await startLogin(page, user.email, base);
      await page.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
      const before = sinkLines().length;
      await page.getByTestId("mfa-email-send").click();
      const code = await waitCode(user.email, before);
      await page.getByTestId("mfa-email-code").fill(code);
      await page.getByTestId("mfa-email-verify").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 25000 });
      await sleep(1500);
      return l;
    };

    console.log("\n── Chrome: Ayarlar › kurtarma kodları oluştur ──");
    let codes: string[] = [];
    {
      const ctx = await chrome.newContext({ viewport: { width: 1280, height: 900 }, locale: "tr-TR", acceptDownloads: true });
      const page = await ctx.newPage();
      const l = await emailLogin(page, VE);
      ok(l.code === "MFA_REQUIRED" && JSON.stringify(l.methods) === '["email_otp"]', "kod oluşturulmadan önce yalnız e-posta yöntemi", l.methods);
      await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
      const card = page.getByTestId("recovery-codes-card");
      await card.waitFor({ timeout: 20000 });
      await page.getByTestId("recovery-codes-count").waitFor({ timeout: 15000 });
      ok((await page.getByTestId("recovery-codes-count").innerText()).includes("Kod yok"), "başlangıçta kod yok");
      await card.screenshot({ path: path.join(OUT, "1-kurtarma-kodlari-yok.png") });
      await page.getByTestId("recovery-gen-password").fill("yanlis-parola");
      await page.getByTestId("recovery-generate").click();
      await page.getByTestId("recovery-error").waitFor({ timeout: 10000 });
      ok(/Parola hatalı/.test(await page.getByTestId("recovery-error").innerText()), "yanlış parola uyarısı");
      await page.getByTestId("recovery-gen-password").fill(pw(VE.email));
      await page.getByTestId("recovery-generate").click();
      await page.getByTestId("recovery-codes-shown").waitFor({ timeout: 15000 });
      const items = await page.getByTestId("recovery-code-item").allInnerTexts();
      codes = items.map((t) => /([A-Z2-7]{4}(?:-[A-Z2-7]{4}){6})/.exec(t)?.[1] ?? "").filter(Boolean);
      ok(codes.length === 10 && new Set(codes).size === 10, `10 kod bir kez gösterildi (${codes.length})`);
      await page.screenshot({ path: path.join(OUT, "2-kurtarma-kodlari-gosterildi.png"), fullPage: true });
      const dl = page.waitForEvent("download", { timeout: 10000 });
      await page.getByTestId("recovery-codes-download").click();
      const file = await dl;
      const saved = path.join(OUT, "indirilen-kodlar-ornek.txt");
      await file.saveAs(saved);
      const txt = fs.readFileSync(saved, "utf8");
      ok(codes.every((c) => txt.includes(c)), "metin dosyası yerel olarak indirildi (sunucuya gitmez)");
      fs.writeFileSync(saved, "(test kanıtı: içerik doğrulandı, kodlar kanıt klasöründe saklanmaz)\n");
      ok(await page.getByTestId("recovery-codes-close").isDisabled(), "'kaydettim' işaretlenmeden kapatılamaz");
      await page.getByTestId("recovery-codes-saved").check();
      await page.getByTestId("recovery-codes-close").click();
      await page.getByTestId("recovery-notice").waitFor({ timeout: 5000 });
      ok(await page.getByTestId("recovery-codes-shown").count() === 0, "kodlar gizlendi");
      ok((await page.content()).indexOf(codes[0]) === -1, "sayfada kod kalmadı");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByTestId("recovery-codes-count").waitFor({ timeout: 15000 });
      ok((await page.getByTestId("recovery-codes-count").innerText()).includes("10 kullanılmamış"), "yenilemede kodlar GÖRÜNMEZ; yalnız sayı");
      ok(!sinkLines().some((m) => codes.some((c) => (m.text + m.html + m.subject).includes(c))), "hiçbir e-postada kod yok");
      await ctx.close();
    }

    // Tarayıcı / görünüm matrisi: parola + kurtarma koduyla giriş.
    const mobile = (w: number, h: number): BrowserContextOptions => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: devices["Pixel 7"].userAgent, locale: "tr-TR" });
    const runs: { label: string; launch: () => Promise<Browser>; opts: BrowserContextOptions; base?: string }[] = [
      { label: "Chrome-masaustu", launch: async () => chrome, opts: { viewport: { width: 1280, height: 860 }, locale: "tr-TR" } },
      { label: "Edge-masaustu", launch: () => chromium.launch({ channel: "msedge", headless: true }), opts: { viewport: { width: 1280, height: 860 }, locale: "tr-TR" } },
      { label: "iPhone-Safari-WebKit-390", launch: () => webkit.launch({ headless: true }), base: TLS_DIR ? TLS_BASE : BASE,
        opts: { ...devices["iPhone 14"], locale: "tr-TR", ...(TLS_DIR ? { ignoreHTTPSErrors: true } : {}) } },
      { label: "Android-Chrome-emul", launch: async () => chrome, opts: { ...devices["Pixel 7"], locale: "tr-TR" } },
      { label: "Mobil-320", launch: async () => chrome, opts: mobile(320, 640) },
      { label: "Mobil-375", launch: async () => chrome, opts: mobile(375, 740) },
    ];
    let used = 0;
    for (const r of runs) {
      console.log(`\n── ${r.label}: parola + kurtarma kodu ile giriş ──`);
      await resetLimits(VE.id);
      const rb = await r.launch();
      if (rb !== chrome) browsers.push(rb);
      const ctx = await rb.newContext(r.opts);
      const page = await ctx.newPage();
      const l = await startLogin(page, VE.email, r.base ?? BASE);
      ok(l.code === "MFA_REQUIRED" && (l.methods as string[]).includes("recovery_code"), `${r.label}: kurtarma kodu yöntemi sunuldu`, l.methods);
      await page.getByTestId("mfa-use-recovery").waitFor({ timeout: 15000 });
      const w = r.opts.viewport?.width ?? 1280;
      await noOverflow(page, `${r.label} (yöntem ekranı)`, w);
      await page.screenshot({ path: path.join(OUT, `${r.label}-1-yontemler.png`) });
      await page.getByTestId("mfa-use-recovery").click();
      await page.getByTestId("mfa-recovery-panel").waitFor({ timeout: 5000 });
      const attrs = await page.getByTestId("mfa-recovery-code").evaluate((el) => ({
        ac: el.getAttribute("autocomplete"), cap: el.getAttribute("autocapitalize"), sc: el.getAttribute("spellcheck"),
      }));
      ok(attrs.ac === "off" && attrs.cap === "characters" && attrs.sc === "false", `${r.label}: kod alanı (otomatik doldurma kapalı, büyük harf)`, attrs);
      ok(await page.getByTestId("mfa-recovery-verify").isDisabled(), `${r.label}: 28 karakter olmadan gönderilemez`);
      if (r.label === "Chrome-masaustu" || r.label === "Mobil-320") {
        await page.getByTestId("mfa-recovery-code").fill("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA");
        await page.getByTestId("mfa-recovery-verify").click();
        await page.getByTestId("mfa-recovery-error").waitFor({ timeout: 10000 });
        const err = await page.getByTestId("mfa-recovery-error").innerText();
        ok(/geçersiz veya daha önce kullanılmış/.test(err) && /Kalan deneme: 4/.test(err), `${r.label}: yanlış kod uyarısı`, err);
        await page.screenshot({ path: path.join(OUT, `${r.label}-2-yanlis-kod.png`) });
      }
      const code = codes[used++];
      await page.getByTestId("mfa-recovery-code").fill(r.label.startsWith("Mobil") ? code.toLowerCase().replace(/-/g, " ") : code);
      await noOverflow(page, `${r.label} (kod ekranı)`, w);
      await page.screenshot({ path: path.join(OUT, `${r.label}-3-kod-girildi.png`) });
      const before = (await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND mfa_method = 'recovery_code'`, [VE.id])).rows[0].n;
      await page.getByTestId("mfa-recovery-verify").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 25000 });
      await sleep(1500);
      const after = (await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND mfa_method = 'recovery_code'`, [VE.id])).rows[0].n;
      ok(after === before + 1, `${r.label}: oturum açıldı (mfa_method=recovery_code; ${before} → ${after})`);
      if (r.label === "Android-Chrome-emul" || r.label.startsWith("Mobil") || r.label.startsWith("iPhone")) {
        await page.goto(`${r.base ?? BASE}/settings`, { waitUntil: "domcontentloaded" });
        await page.getByTestId("recovery-session-banner").waitFor({ timeout: 20000 });
        ok(true, `${r.label}: Ayarlar'da 'kurtarma koduyla açıldı' uyarısı`);
        await noOverflow(page, `${r.label} (Ayarlar)`, w);
        await page.getByTestId("account-recovery-section").screenshot({ path: path.join(OUT, `${r.label}-4-ayarlar-kurtarma.png`) });
        await page.getByTestId("email-change-card").locator("summary").click();
        await page.getByTestId("phone-change-card").locator("summary").click();
        await noOverflow(page, `${r.label} (Ayarlar açık bölümler)`, w);
        await page.getByTestId("account-recovery-section").screenshot({ path: path.join(OUT, `${r.label}-5-ayarlar-bolumler.png`) });
      }
      await ctx.close();
      if (rb !== chrome) await rb.close();
    }
    ok((await q(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'used'`, [VE.id])).rows[0].n === used, `kullanılan kod sayısı ${used}`);

    console.log("\n── Owner › Hesap kurtarma (talep aç) + kullanıcı ekranında açık talep ──");
    {
      const ctx = await chrome.newContext({ viewport: { width: 1280, height: 900 }, locale: "tr-TR" });
      const page = await ctx.newPage();
      await emailLogin(page, { id: U.owner, email: EMAIL.owner });
      await page.goto(`${BASE}/admin/hesap-kurtarma`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("recovery-admin-page").waitFor({ timeout: 20000 });
      await page.getByTestId("recovery-admin-empty").waitFor({ timeout: 15000 });
      await page.getByTestId("recovery-admin-email").fill(VE2.email);
      await page.getByTestId("recovery-admin-method").selectOption("telefon");
      await page.getByTestId("recovery-admin-note").fill("Kayıtlı numarasından arandı; doğum tarihi ve son randevu teyit edildi.");
      await page.getByTestId("recovery-admin-open").click();
      await page.getByTestId("recovery-admin-msg").waitFor({ timeout: 15000 });
      await page.getByTestId("recovery-case-row").first().waitFor({ timeout: 15000 });
      ok((await page.getByTestId("recovery-case-state").first().innerText()) === "Bekliyor", "talep 'Bekliyor'");
      ok(await page.getByTestId("recovery-case-execute-open").first().isDisabled(), "72 saat dolmadan 'yürüt' kapalı");
      await page.screenshot({ path: path.join(OUT, "Owner-1-hesap-kurtarma.png"), fullPage: true });
      await page.setViewportSize({ width: 375, height: 800 });
      await noOverflow(page, "Owner hesap kurtarma (375)", 375);
      await page.screenshot({ path: path.join(OUT, "Owner-2-hesap-kurtarma-375.png"), fullPage: true });
      await ctx.close();
      ok(sinkLines().some((m) => m.to === VE2.email && /kurtarma talebi açıldı/i.test(m.subject)), "kullanıcıya bildirim gitti");

      const uctx = await chrome.newContext({ ...devices["Pixel 7"], locale: "tr-TR" });
      const up = await uctx.newPage();
      await emailLogin(up, VE2);
      await up.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
      await up.getByTestId("recovery-case-banner").waitFor({ timeout: 20000 });
      ok(true, "kullanıcı ekranında açık talep uyarısı");
      await up.getByTestId("recovery-case-banner").screenshot({ path: path.join(OUT, "Kullanici-acik-talep.png") });
      await up.getByTestId("recovery-case-cancel").click();
      await up.getByTestId("recovery-notice").waitFor({ timeout: 10000 });
      const st = (await q(`SELECT state FROM public.auth_recovery_cases WHERE user_id = $1 ORDER BY opened_at DESC LIMIT 1`, [VE2.id])).rows[0].state;
      ok(st === "cancelled", "kullanıcı talebi iptal etti");
      await uctx.close();
    }
    const trial = Number((await q(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [VE.id])).rows[0].n);
    ok(trial === 1, `7 günlük deneme kaydı tek (${trial})`);
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
  console.log(`\nf2e ui e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
