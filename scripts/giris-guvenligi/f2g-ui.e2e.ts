/**
 * GİRİŞ GÜVENLİĞİ F2-G — TARAYICI uçtan uca: Owner cihaz onayında işleme özel yeniden doğrulama penceresi.
 * Chrome + Edge masaüstü + 375 px mobil emülasyon. GERÇEK CİHAZ / GERÇEK GMAIL DEĞİLDİR (sentetik e-posta dosyası).
 * Production'a SIFIR temas. Ön koşul: yerel sahte env ile build (bkz. f2c-ui.e2e.ts başlığı).
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2g-ui.e2e.ts <yeni-boş-kanıt-klasörü>
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { startF2cDb, EMAIL, U, pw } from "./testDb";

const OUT = process.argv[2];
if (!OUT) { console.log("kanıt klasörü gerekli"); process.exit(2); }
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.log("kanıt klasörü boş olmalı"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const SINK = path.join(OUT, "sentetik-eposta.jsonl");
const PORT = 3988;
const BASE = `http://localhost:${PORT}`;
const SUPA_PROXY_PORT = 54398;
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 300)}`}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lines = () => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string; text: string }); } catch { return []; } };
async function waitCode(to: string, after: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const m = lines().slice(after).filter((x) => x.to === to);
    const c = /\b([0-9]{6})\b/.exec(m[m.length - 1]?.text ?? "")?.[1];
    if (c) return c;
    await sleep(250);
  }
  return "";
}

async function main() {
  const db = await startF2cDb({ withF2g: true });
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  const proxy = http.createServer((req, res) => {
    const up = http.request(new URL(req.url ?? "/", db.shimUrl), { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve) => proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()));
  const env: Record<string, string | undefined> = {
    ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret", SESSION_COOKIE_MODE: "primary", SESSION_COOKIE_ALLOWED_ORIGINS: BASE,
    RATE_LIMIT_SECRET: "f2g-ui-rate", LOGIN_IP_PEPPER: "f2g-ui-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
    EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: SINK, AUTH_OTP_PEPPER: "f2g-ui-pepper-0123456789abcdefghijklmnopqrstu", NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.VERCEL_ENV;
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore",
      // F2-L: Linux'ta kendi süreç grubu → kapanışta npx'in altındaki next-server da sonlanır (portta eski sunucu kalmaz).
      detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  try {
    for (let i = 0; i < 90; i++) { try { if ((await fetch(`${BASE}/m/onay`)).ok) break; } catch { /* bekle */ } await sleep(1000); }
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [U.owner]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.owner}'; SELECT set_config('yasam.mfa_policy','off',false);`);

    const ownerLogin = async (page: Page) => {
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [U.owner]);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours' WHERE user_id = $1`, [U.owner]);
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
      await page.locator("#login-email").fill(EMAIL.owner);
      await page.locator("#login-password").fill(pw(EMAIL.owner));
      await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
      await page.getByTestId("mfa-email-send").waitFor({ timeout: 20000 });
      const before = lines().length;
      await page.getByTestId("mfa-email-send").click();
      await page.getByTestId("mfa-email-code").fill(await waitCode(EMAIL.owner, before));
      await page.getByTestId("mfa-email-verify").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 25000 });
      await sleep(2000);
    };

    const runs: { label: string; launch: () => Promise<Browser>; opts: BrowserContextOptions }[] = [
      { label: "Chrome", launch: () => chromium.launch({ channel: "chrome", headless: true }), opts: { viewport: { width: 1280, height: 900 }, locale: "tr-TR" } },
      { label: "Edge", launch: () => chromium.launch({ channel: "msedge", headless: true }), opts: { viewport: { width: 1280, height: 900 }, locale: "tr-TR" } },
      { label: "Mobil-375", launch: () => chromium.launch({ channel: "chrome", headless: true }),
        opts: { viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "tr-TR" } },
    ];
    let i = 0;
    for (const r of runs) {
      console.log(`\n── ${r.label}: cihaz onayı → ek doğrulama penceresi → e-posta kodu → onay ──`);
      const dev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state)
        VALUES ($1, repeat('U',120), encode(sha256($2::bytea),'hex'), 'UIUI-PHON', 'Pixel UI', 'pending_owner') RETURNING id`,
        [["00000000-0000-0000-0000-00000000e0b2", "00000000-0000-0000-0000-00000000e0d1", "00000000-0000-0000-0000-00000000e0d2"][i], `ui-${i}`])).rows[0].id as string;
      i++;
      const b = await r.launch();
      browsers.push(b);
      const ctx = await b.newContext(r.opts);
      const page = await ctx.newPage();
      await ownerLogin(page);
      await page.goto(`${BASE}/admin/cihaz-onaylari`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("device-code").first().waitFor({ timeout: 20000 });
      await page.getByRole("radio").first().check().catch(async () => { await page.locator("select").first().selectOption("telefon"); });
      await page.getByRole("checkbox").first().check();
      await page.getByRole("button", { name: /Onayla/ }).first().click();
      await page.getByTestId("step-up-dialog").waitFor({ timeout: 15000 });
      ok(true, `${r.label}: onay ek doğrulama penceresini açtı (çerez tek başına yetmedi)`);
      const w = r.opts.viewport?.width ?? 1280;
      ok(await page.evaluate(() => document.documentElement.scrollWidth) <= w, `${r.label}: yatay taşma yok`);
      await page.screenshot({ path: path.join(OUT, `${r.label}-1-ek-dogrulama.png`) });
      ok((await q(`SELECT state FROM public.auth_trusted_devices WHERE id = $1`, [dev])).rows[0].state === "pending_owner", `${r.label}: cihaz henüz onaylanmadı`);
      const before = lines().length;
      await page.getByTestId("step-up-email-send").click();
      const code = await waitCode(EMAIL.owner, before);
      ok(/kritik bir işlemi onaylama/.test(lines().slice(before).find((m) => m.to === EMAIL.owner)?.text ?? ""), `${r.label}: e-posta 'kritik işlem onayı' metni`);
      await page.getByTestId("step-up-email-code").fill(code);
      await page.screenshot({ path: path.join(OUT, `${r.label}-2-kod-girildi.png`) });
      await page.getByTestId("step-up-email-verify").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="step-up-dialog"]'), undefined, { timeout: 20000 });
      for (let t = 0; t < 30; t++) {
        if ((await q(`SELECT state FROM public.auth_trusted_devices WHERE id = $1`, [dev])).rows[0].state === "owner_approved") break;
        await sleep(500);
      }
      ok((await q(`SELECT state FROM public.auth_trusted_devices WHERE id = $1`, [dev])).rows[0].state === "owner_approved", `${r.label}: kanıtla onay tamamlandı`);
      await page.screenshot({ path: path.join(OUT, `${r.label}-3-onaylandi.png`) });
      await ctx.close();
      await b.close();
    }
    const used = Number((await q(`SELECT count(*)::int n FROM public.auth_mfa_challenges WHERE purpose = 'step_up' AND state = 'consumed'`)).rows[0].n);
    ok(used === 3, `her onay kendi kanıtını bir kez tüketti (${used})`);
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
    if (app.pid) { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else { try { process.kill(-app.pid, "SIGKILL"); } catch { app.kill("SIGKILL"); } } }
    proxy.close();
    await db.close();
  }
  console.log(`\nf2g ui e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
