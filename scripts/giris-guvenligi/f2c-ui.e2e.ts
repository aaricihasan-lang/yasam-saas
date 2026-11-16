/**
 * GİRİŞ GÜVENLİĞİ F2-C — TARAYICI uçtan uca + görsel kabul ekran görüntüleri (Chrome + Edge).
 *
 * GERÇEK: Next.js production build (`next start`), gerçek route'lar, gerçek PostgreSQL (embedded) +
 * repo migration'ları, gerçek ECDSA P-256 imzaları. "Telefon" = Node'daki P-256 anahtarı (Android
 * Keystore yerine; aynı protokol). Production'a SIFIR temas; sentetik kullanıcılar.
 *
 * Ön koşul: yerel sahte env ile build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2c-ui.e2e.ts <yeni-boş-kanıt-klasörü>
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";
import { startF2cDb, newPhone, signWith, U, EMAIL, pw, type Phone } from "./testDb";
import { activateMessage, displayCodeForSpki, enrollMessage, qrDecideMessage, qrFetchMessage } from "@/lib/auth/deviceSignature";

const OUT = process.argv[2];
if (!OUT) { console.log("kanıt klasörü gerekli"); process.exit(2); }
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.log("kanıt klasörü boş olmalı (üzerine yazılmaz)"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const PORT = 3987;
const BASE = `http://localhost:${PORT}`;
const SUPA_PROXY_PORT = 54398; // build'e gömülü NEXT_PUBLIC_SUPABASE_URL
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => {
  if (c) pass++; else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 300)}`}`);
};
const nowTs = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type J = Record<string, unknown>;

async function api(p: string, body?: unknown): Promise<{ status: number; json: J }> {
  const res = await fetch(`${BASE}${p}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
async function enroll(p: Phone, email: string, bootstrapCode?: string) {
  const ts = nowTs();
  const code = displayCodeForSpki(Buffer.from(p.spki, "base64"));
  const r = await api("/api/devices/enroll", { email, password: pw(email), publicKey: p.spki, model: "Pixel 8", androidApi: 34, appVersion: "2.0.0-f2c", ts,
    signature: signWith(p, enrollMessage(email, code, ts)), ...(bootstrapCode ? { bootstrapCode } : {}) });
  p.deviceId = String(r.json.deviceId ?? "");
  return r;
}
async function activate(p: Phone) {
  const st = await api(`/api/devices/status?deviceId=${p.deviceId}`);
  const nonce = String(st.json.activationNonce ?? "");
  const ts = nowTs();
  return api("/api/devices/activate", { deviceId: p.deviceId, nonce, ts, signature: signWith(p, activateMessage(p.deviceId!, nonce, ts)) });
}
async function phoneDecide(p: Phone, qrUrl: string, choose: (opts: string[]) => string, decision: "approve" | "deny" = "approve") {
  const m = /#c=([0-9a-f-]{36})&n=([A-Za-z0-9_-]{32})$/.exec(qrUrl);
  if (!m) return { status: 0, json: { error: "qr parse" } as J };
  const [c, n] = [m[1], m[2]];
  let ts = nowTs();
  const f = await api("/api/auth/mfa/qr/fetch", { challengeId: c, qrNonce: n, deviceId: p.deviceId, ts, signature: signWith(p, qrFetchMessage(c, n, p.deviceId!, ts)) });
  const code = decision === "approve" ? choose((f.json.options ?? []) as string[]) : "";
  ts = nowTs();
  return api("/api/auth/mfa/qr/decide", { challengeId: c, qrNonce: n, deviceId: p.deviceId, decision, matchCode: code, ts,
    signature: signWith(p, qrDecideMessage(c, n, p.deviceId!, decision, code, ts)) });
}

/** Giriş modalını açar, parola girer; /api/auth/session yanıtını (QR URL + kod) yakalar. */
async function startLogin(page: Page, email: string): Promise<J> {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const resp = page.waitForResponse((r) => r.url().endsWith("/api/auth/session") && r.request().method() === "POST", { timeout: 30000 });
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(pw(email));
  await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
  return (await (await resp).json()) as J;
}

async function main() {
  const db = await startF2cDb();
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
    RATE_LIMIT_SECRET: "f2c-ui-rate-secret",
    LOGIN_IP_PEPPER: "f2c-ui-pepper",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    AUTH_MFA_METHODS: "qr_device",
    AUTH_MFA_METHOD_SCOPE: "all",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "localhost"],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore" });
  const browsers: Browser[] = [];
  try {
    for (let i = 0; i < 90; i++) { try { const r = await fetch(`${BASE}/m/onay`); if (r.ok) break; } catch { /* bekle */ } await sleep(1000); }

    console.log("\n── Kurulum: Owner ilk cihazı (SQL bootstrap) + uzman eşleştirme istekleri ──");
    const ownerPhone = newPhone();
    const boot = String((await db.admin.query(`SELECT public.auth_owner_bootstrap_issue() AS c`)).rows[0].c);
    ok((await enroll(ownerPhone, EMAIL.owner, boot)).json.state === "owner_approved", "Owner bootstrap eşleştirmesi");
    ok((await activate(ownerPhone)).json.state === "active", "Owner telefonu imzayla aktif");
    await db.admin.query(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required=true WHERE id=$1; SELECT set_config('yasam.mfa_policy','off',false);`.replace("$1", `'${U.owner}'`));
    const expPhone = newPhone();
    const andPhone = newPhone();
    ok((await enroll(expPhone, EMAIL.exp)).json.state === "pending_owner", "uzman eşleştirme isteği (Owner Zili)");
    ok((await enroll(andPhone, EMAIL.and1)).json.state === "pending_owner", "ikinci uzman eşleştirme isteği");

    for (const [label, channel] of [["Chrome", "chrome"], ["Edge", "msedge"]] as const) {
      const browser = await chromium.launch({ channel, headless: true });
      browsers.push(browser);

      console.log(`\n── ${label}: Owner QR girişi → cihaz onay ekranı ──`);
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "tr-TR" });
      const page = await ctx.newPage();
      const netLog: string[] = [];
      page.on("response", (r) => { if (/\/api\/auth\/(admin-session|mfa\/complete)/.test(r.url())) netLog.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
      const ownerLogin = await startLogin(page, EMAIL.owner);
      const qr = (ownerLogin.qr ?? {}) as J;
      await page.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
      ok(ownerLogin.code === "MFA_REQUIRED" && typeof qr.url === "string", `${label}: parola → QR paneli (oturum yok)`);
      ok((await page.getByTestId("mfa-match-code").innerText()).trim() === qr.matchCode, `${label}: ekrandaki eşleştirme kodu = sunucu kodu`);
      await page.screenshot({ path: path.join(OUT, `${label}-1-qr-giris-masaustu.png`) });
      const ownerDecide = await phoneDecide(ownerPhone, String(qr.url), () => String(qr.matchCode));
      ok(ownerDecide.json.result === "approved", `${label}: Owner telefonu onayladı`);
      await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 20000 });
      ok(true, `${label}: tarayıcı onayı yakaladı, QR paneli kapandı (giriş tamamlandı)`);
      await page.waitForTimeout(1500);
      const cookieNames = (await ctx.cookies()).map((c) => c.name);
      await page.goto(`${BASE}/admin/cihaz-onaylari`, { waitUntil: "domcontentloaded" });
      try {
        await page.getByRole("heading", { name: "Cihaz eşleştirme onayları" }).waitFor({ timeout: 20000 });
      } catch (e) {
        await page.screenshot({ path: path.join(OUT, `${label}-TANI-admin.png`), fullPage: true });
        console.log("TANI url:", page.url(), "çerezler:", cookieNames.join(","), "ağ:", netLog.join(" | "));
        console.log("TANI metin:", (await page.locator("body").innerText()).slice(0, 400));
        throw e;
      }
      const reqs = page.getByTestId("device-request");
      await reqs.first().waitFor({ timeout: 15000 }).catch(() => {});
      const n = await reqs.count();
      ok(n >= 1, `${label}: Owner bekleyen eşleştirme isteklerini görür (${n})`);
      await page.screenshot({ path: path.join(OUT, `${label}-2-owner-cihaz-onaylari.png`), fullPage: true });
      if (label === "Chrome") {
        const expCode = displayCodeForSpki(Buffer.from(expPhone.spki, "base64"));
        const card = reqs.filter({ hasText: expCode });
        const approveBtn = card.getByRole("button", { name: "Onayla" });
        ok(await approveBtn.isDisabled(), "Chrome: doğrulama işaretlenmeden Onayla düğmesi kapalı");
        await card.getByLabel("Kayıtlı numarasından aradım").check();
        await card.getByRole("checkbox").check();
        await page.screenshot({ path: path.join(OUT, `${label}-3-owner-onay-oncesi.png`), fullPage: true });
        // F2-G (000700) sonrası: Owner onayı işleme özel kanıt ister. Zincirde 000700 varsa Owner'ın telefonu (test anahtarı;
        // "telefon" adımı = DB'deki QR kararı) BU tarayıcı oturumu için kanıtı önceden onaylar → Onayla doğrudan sonuçlanır.
        const hasStepUp = (await db.admin.query(`SELECT to_regprocedure('public.auth_owner_step_up_begin(text,text,uuid)') IS NOT NULL AS x`)).rows[0].x;
        if (hasStepUp) {
          const tok = (await db.admin.query(`SELECT session_token FROM public.user_sessions WHERE user_id = $1 AND is_active AND mfa_method IS NOT NULL
                                             ORDER BY created_at DESC LIMIT 1`, [U.owner])).rows[0]?.session_token;
          const su = (await db.admin.query(`SELECT public.auth_owner_step_up_begin($1, 'device_approve', $2) AS r`, [tok, expPhone.deviceId])).rows[0].r;
          await db.admin.query(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4)`, [su.challenge_id, su.qr_nonce, ownerPhone.deviceId, su.match_code]);
          ok(su?.ok === true, "Chrome: (000700+) Owner telefonu kritik işlem onayını verdi");
        }
        await approveBtn.click();
        await card.getByRole("status").waitFor({ timeout: 10000 }).catch(() => {});
        const st = (await db.admin.query(`SELECT state FROM public.auth_trusted_devices WHERE id = $1`, [expPhone.deviceId])).rows[0]?.state;
        ok(st === "owner_approved", `Chrome: Owner onayı → owner_approved (${st})`);
        ok(Number((await db.admin.query(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [U.exp])).rows[0].n) === 0, "Chrome: Owner onayı uzman oturumu AÇMADI");
        ok((await activate(expPhone)).json.state === "active", "uzman telefonu imzayla aktif");
        await db.admin.query(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required=true WHERE id='${U.exp}'; SELECT set_config('yasam.mfa_policy','off',false);`);
      }
      await ctx.close();

      console.log(`\n── ${label}: uzman QR girişi (masaüstü + 375 px) ──`);
      for (const vp of [{ w: 1280, h: 860, tag: "masaustu" }, { w: 375, h: 812, tag: "375" }, { w: 320, h: 640, tag: "320" }]) {
        const c2 = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: "tr-TR", isMobile: vp.w < 500 });
        const p2 = await c2.newPage();
        const l = await startLogin(p2, EMAIL.exp);
        const q = (l.qr ?? {}) as J;
        await p2.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
        const box = await p2.getByTestId("mfa-qr-panel").boundingBox();
        const scrollW = await p2.evaluate(() => document.documentElement.scrollWidth);
        ok(!!box && box.width <= vp.w && scrollW <= vp.w, `${label} ${vp.tag}: QR paneli ekrana sığar, yatay taşma yok (scrollWidth ${scrollW})`);
        await p2.screenshot({ path: path.join(OUT, `${label}-4-uzman-qr-${vp.tag}.png`) });
        if (vp.tag === "375") {
          const d = await phoneDecide(expPhone, String(q.url), (o) => o.find((x) => x !== q.matchCode)!);
          ok(d.json.result === "denied", `${label} 375: telefonda yanlış sayı → reddedildi`);
          await p2.getByTestId("mfa-final").waitFor({ timeout: 15000 });
          await p2.screenshot({ path: path.join(OUT, `${label}-5-uzman-reddedildi-375.png`) });
        } else {
          const d = await phoneDecide(expPhone, String(q.url), () => String(q.matchCode));
          ok(d.json.result === "approved", `${label} ${vp.tag}: telefon onayladı`);
          await p2.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 20000 });
          ok(true, `${label} ${vp.tag}: giriş tamamlandı`);
          await sleep(1500);
          await p2.screenshot({ path: path.join(OUT, `${label}-6-uzman-giris-sonrasi-${vp.tag}.png`) });
        }
        await c2.close();
      }
    }
    const trial = Number((await db.admin.query(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [U.exp])).rows[0].n);
    ok(trial === 1, `deneme yalnız ilk başarılı MFA'lı oturumda başladı (kayıt ${trial})`);
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
    if (app.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    proxy.close();
    await db.close();
  }
  console.log(`\nf2c ui e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
