/**
 * I18N-F1-R1 — DİL TERCİHİ × GİRİŞ GÜVENLİĞİ (e-posta OTP / QR paneli / çıkış) GERÇEK UYGULAMA AKIŞI.
 *
 * GERÇEK: Next.js production build (`next start`, yayın kapısı AÇIK build), gerçek route'lar, gerçek PostgreSQL (embedded)
 * + repo migration'ları (giriş güvenliği F2 zinciri, scripts/giris-guvenligi/testDb) + bu fazın user_locale_prefs
 * migration'ı. E-posta = sentetik sağlayıcı (yerel dosyaya yazar). Production'a SIFIR temas; sentetik kullanıcılar.
 *
 * Ön koşul (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret NEXT_PUBLIC_I18N_LOCALE_SWITCHING=on npx next build
 * Çalıştır: npx tsx scripts/i18n/ui-e2e-mfa.ts <yeni-boş-kanıt-klasörü>
 *
 * Senaryolar:
 *   M1 Oturumsuz giriş ekranı EN (çerez) → MFA paneli EN → OTP e-postası EN → giriş → hesapta tercih yok → TR'ye eşitlenir
 *   M2 Ayarlar › Dil → English → hesaba kaydedilir (DB)
 *   M3 Gerçek "Çıkış Yap" (onaylı) → sunucu DELETE dil çerezini SİLER → giriş ekranı TR
 *   M4 Yeniden e-posta OTP girişi (TR ekran, TR e-posta) → hesap tercihi EN uygulanır
 *   M5 Aynı tarayıcıda ikinci uzman (tercihi yok) → TR; birinci uzmanın tercihi korunur
 *   M6 Migration uygulanmamış ortam (tablo yok) → API "unavailable/not_migrated", PUT persisted=false, Ayarlar cihaz-yalnız notu,
 *      senkron çereze dokunmaz, sayfa hatası yok
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { startF2cDb, pw } from "../giris-guvenligi/testDb";

const OUT = process.argv[2];
if (!OUT) { console.log("kanıt klasörü gerekli"); process.exit(2); }
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.log("kanıt klasörü boş olmalı"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const SINK = path.join(OUT, "sentetik-eposta.jsonl");
const PORT = 3994;
const BASE = `http://localhost:${PORT}`;
const SUPA_PROXY_PORT = 54398;

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => {
  if (c) pass++; else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 400)}`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };
const VE2 = { id: "00000000-0000-0000-0000-00000000e0d2", email: "f2d-ve2@test.local" };

function sinkLines(): { to: string; subject: string; text: string; html: string }[] {
  try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
async function waitMail(to: string, after: number) {
  for (let i = 0; i < 60; i++) {
    const mails = sinkLines().slice(after).filter((m) => m.to === to);
    const last = mails[mails.length - 1];
    const code = /^([0-9]{6}) — /.exec(last?.subject ?? "")?.[1];
    if (code) return { code, mail: last };
    await sleep(250);
  }
  return { code: "", mail: null };
}
const lang = (page: Page) => page.evaluate(() => document.documentElement.lang);
async function waitLang(page: Page, l: string, ms = 30000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if ((await lang(page).catch(() => "")) === l) return true; await sleep(400); }
  return false;
}
const localeCookie = async (ctx: BrowserContext) => (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value;
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
// Marka adı ("Yaşam Sistemi") bilinçli olarak çevrilmez → dil denetiminde dışarıda bırakılır (hem EN hem TR yönünde).
const noBrand = (s: string) => s.replace(/Yaşam Sistemi|YAŞAM SİSTEMİ/g, "");

async function main() {
  const db = await startF2cDb({ withF2e: true });
  const q = (sql: string, args: unknown[] = []) => db.admin.query(sql, args);
  await q(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8"));
  const resetLimits = async (userId: string) => {
    await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending', 'verified')`, [userId]);
    await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours' WHERE user_id = $1`, [userId]);
  };
  const dbLocale = async (id: string) => (await q("select preferred_locale from public.user_locale_prefs where user_id = $1", [id])).rows[0]?.preferred_locale ?? null;
  const proxy = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()); });

  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret",
    SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: BASE,
    RATE_LIMIT_SECRET: "i18n-mfa-rate-secret",
    LOGIN_IP_PEPPER: "i18n-mfa-pepper",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    AUTH_MFA_METHODS: "qr_device,email_otp",
    AUTH_MFA_METHOD_SCOPE: "all",
    AUTH_MFA_EMAIL_ROLES: "expert,admin",
    EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1",
    EMAIL_SYNTHETIC_SINK: SINK,
    AUTH_OTP_PEPPER: "i18n-mfa-pepper-0123456789abcdefghijklmnopqrstu",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.VERCEL_ENV;
  const app: ChildProcess = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
    { cwd: process.cwd(), env: env as NodeJS.ProcessEnv, stdio: "ignore" });
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    for (let i = 0; i < 120; i++) { try { const r = await fetch(`${BASE}/m/onay`); if (r.ok) break; } catch { /* bekle */ } await sleep(1000); }
    browser = await chromium.launch();
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id IN ($1, $2)`, [VE.id, VE2.id]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id IN ('${VE.id}', '${VE2.id}'); SELECT set_config('yasam.mfa_policy','off',false);`);

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "en-GB" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));

    /** Gerçek giriş: giriş düğmesi → e-posta + parola → MFA paneli → e-posta kodu → doğrula. */
    const emailOtpLogin = async (p: Page, user: { id: string; email: string }, expectLang: "tr" | "en") => {
      await resetLimits(user.id);
      await p.goto(BASE, { waitUntil: "domcontentloaded" });
      await p.getByRole("button", { name: expectLang === "en" ? "Sign In" : "Giriş Yap", exact: true }).first().click();
      await p.locator("#login-email").fill(user.email);
      await p.locator("#login-password").fill(pw(user.email));
      await p.getByRole("button", { name: expectLang === "en" ? /Enter Practitioner Panel/ : /Uzman Paneline Gir/ }).click();
      const panel = p.getByTestId("mfa-qr-panel");
      await panel.waitFor({ timeout: 20000 });
      const panelText = (await panel.innerText()).replace(/\s+/g, " ");
      const before = sinkLines().length;
      await p.getByTestId("mfa-email-send").click();
      const { code, mail } = await waitMail(user.email, before);
      await p.getByTestId("mfa-email-code").fill(code);
      await p.getByTestId("mfa-email-verify").click();
      await p.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 25000 });
      await sleep(1500);
      return { panelText, mail, code };
    };

    console.log("\n[M1] Giriş ekranı EN → MFA paneli EN → OTP e-postası EN");
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]);
    await page.goto(BASE);
    ok(await waitLang(page, "en", 15000), "oturumsuz giriş ekranı EN (çerez)");
    const m1 = await emailOtpLogin(page, VE, "en");
    ok(!TR_CHARS.test(m1.panelText) && m1.panelText.length > 20, "MFA paneli İngilizce (Türkçe karakter yok)", m1.panelText.slice(0, 200));
    await page.screenshot({ path: path.join(OUT, "m1-panel-en.png") }).catch(() => undefined);
    ok(!!m1.mail && !TR_CHARS.test(noBrand(`${m1.mail.subject} ${m1.mail.text}`)) && /lang="en"/.test(m1.mail.html), "OTP e-postası İngilizce (konu + gövde, marka hariç; html lang=en)", m1.mail?.subject);
    ok(!!m1.mail && m1.mail.subject.startsWith(`${m1.code} — `), "e-posta kod biçimi değişmedi (güvenlik sözleşmesi)", m1.mail?.subject);
    ok(await waitLang(page, "tr", 30000), "giriş sonrası: hesapta tercih yok → TR'ye eşitlendi (öncelik kuralı)");

    console.log("\n[M2] Ayarlar › Dil → English (hesaba kayıt)");
    await page.goto(`${BASE}/settings`);
    await page.getByRole("button", { name: "Dil" }).first().click();
    await page.getByTestId("language-preference").waitFor({ timeout: 15000 });
    await page.getByRole("radio", { name: "English" }).click();
    ok(await waitLang(page, "en", 20000), "Ayarlar'dan English → arayüz EN");
    let saved: string | null = null;
    for (let i = 0; i < 20 && saved !== "en"; i++) { saved = await dbLocale(VE.id); if (saved !== "en") await sleep(300); }
    ok(saved === "en", "hesap tercihi veritabanında en", saved);
    ok(await page.getByText("Your language preference has been saved to your account.").isVisible().catch(() => false), "Ayarlar: 'hesabınıza kaydedildi' bildirimi (EN)");
    await page.screenshot({ path: path.join(OUT, "m2-settings-language-en.png") }).catch(() => undefined);

    console.log("\n[M3] Gerçek çıkış → dil çerezi silinir");
    await page.goto(BASE);
    await waitLang(page, "en", 15000);
    const del = page.waitForResponse((r) => r.url().endsWith("/api/auth/session") && r.request().method() === "DELETE", { timeout: 20000 });
    await page.getByRole("button", { name: "Sign Out" }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Sign Out" }).click();
    const delRes = await del;
    ok(delRes.status() === 200, "sunucu çıkışı 200 (güvenlik davranışı aynı)");
    await sleep(800);
    ok(await localeCookie(ctx) === undefined, "çıkış sonrası NEXT_LOCALE çerezi silindi", await localeCookie(ctx));
    await page.goto(BASE);
    ok(await waitLang(page, "tr", 15000), "çıkış sonrası giriş ekranı TR (önceki uzmanın dili kalmadı)");

    console.log("\n[M4] Yeniden giriş (TR ekran + TR e-posta) → hesap tercihi EN uygulanır");
    const m4 = await emailOtpLogin(page, VE, "tr");
    ok(TR_CHARS.test(m4.panelText), "MFA paneli TR (regresyon yok)");
    ok(!!m4.mail && TR_CHARS.test(noBrand(`${m4.mail.subject} ${m4.mail.text}`)), "OTP e-postası TR (ekran dili; marka dışı metin Türkçe)", m4.mail?.subject);
    ok(await waitLang(page, "en", 30000), "giriş sonrası hesap tercihi (en) uygulandı");
    ok(await localeCookie(ctx) === "en", "çerez hesapla eşitlendi");

    console.log("\n[M5] Aynı tarayıcıda ikinci uzman (çıkış yapmadan) → TR");
    await page.evaluate(() => { localStorage.clear(); });
    await ctx.clearCookies({ name: "__Host-yasam_sid" }).catch(() => undefined);
    const m5 = await emailOtpLogin(page, VE2, "en");
    ok(m5.code.length === 6, "ikinci uzman e-posta koduyla giriş yaptı");
    ok(await waitLang(page, "tr", 30000), "ikinci uzmanın tercihi yok → TR (birinci uzmanın dili taşınmadı)");
    ok(await dbLocale(VE2.id) === null && await dbLocale(VE.id) === "en", "veritabanı izolasyonu: VE2 satırı yok, VE en");

    console.log("\n[M6] Migration uygulanmamış ortam (tablo yok)");
    await q("DROP TABLE public.user_locale_prefs");
    await page.goto(`${BASE}/settings`);
    await page.getByRole("button", { name: "Dil" }).first().click();
    await page.getByTestId("language-preference").waitFor({ timeout: 15000 });
    await sleep(1500);
    ok(await page.getByText("Dil tercihi şu anda hesabınıza kaydedilemiyor; seçiminiz yalnız bu cihazda geçerli olur.").isVisible().catch(() => false), "Ayarlar: 'yalnız bu cihazda' notu (tablo yok)");
    const api = await page.evaluate(async () => {
      const u = JSON.parse(localStorage.getItem("yasam_user") ?? "{}") as { id?: string };
      const g = await fetch("/api/me/locale", { headers: { "x-user-id": u.id ?? "" } });
      const pt = await fetch("/api/me/locale", { method: "PUT", headers: { "x-user-id": u.id ?? "", "content-type": "application/json" }, body: JSON.stringify({ locale: "en" }) });
      return { get: await g.json(), put: await pt.json(), putStatus: pt.status };
    });
    ok(api.get?.preference?.status === "unavailable" && api.get?.preference?.reason === "not_migrated", "GET → unavailable / not_migrated", api.get);
    ok(api.putStatus === 200 && api.put?.persisted === false && api.put?.reason === "not_migrated", "PUT → 200, persisted=false (kayıt yok, hata yok)", api.put);
    await page.getByRole("radio", { name: "English" }).click();
    ok(await waitLang(page, "en", 20000), "tablo yokken dil bu cihazda yine değişir");
    ok(await page.getByText("The language has been changed for this device; it could not be saved to your account.").isVisible().catch(() => false), "Ayarlar: 'yalnız bu cihaz' bildirimi (EN)");
    await page.screenshot({ path: path.join(OUT, "m6-no-migration.png") }).catch(() => undefined);

    const relevant = pageErrors.filter((e) => !/Failed to fetch|NetworkError|AbortError|Load failed/i.test(e));
    ok(relevant.length === 0, "sayfa hatası (pageerror) yok", relevant.slice(0, 5));
  } finally {
    await browser?.close().catch(() => undefined);
    try { if (process.platform === "win32" && app.pid) spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGKILL"); } catch { /* yok */ }
    proxy.close();
    await db.close().catch(() => undefined);
  }
  console.log(`\nKanıt: ${OUT}`);
  console.log(`=== i18n × giriş güvenliği E2E: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
