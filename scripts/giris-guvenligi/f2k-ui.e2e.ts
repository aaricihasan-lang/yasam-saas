/**
 * GİRİŞ GÜVENLİĞİ F2-K / F2-L — TARAYICI uçtan uca: 6 haneli YAZILAN QR kodu, paralel sekmeler, süresi dolmuş / yeniden
 * kullanılan istek, MFA tamamlanmadan oturum yok, Owner'ın yönetici yetkisi vermesi (işleme özel doğrulama penceresi),
 * başka hedefe ait / yeniden kullanılan kanıt, MFA'sız yeni yöneticinin kısıtlanması, süresi geçmiş cihaz talebi ve
 * 320 / 375 / 390 / 768 px + masaüstü taşma denetimi.
 *
 * GERÇEK: Next.js production build (`next start`), gerçek route'lar, gerçek PostgreSQL (embedded) + F2 migration zinciri
 * (F2_TEST_DB_WITH_F2K=1 → 001100 dahil), gerçek ECDSA P-256 imzaları. "Telefon" = Node'daki P-256 anahtarı (Android
 * Keystore / biyometri DEĞİL — SENTETİK). Yönetici oluşturmanın bu test DB'sinde olmayan yan fonksiyonları sade
 * karşılıklardır (testDb.installAdminStandIns); yetki kararı gerçek migration'dan gelir. Production'a SIFIR temas.
 *
 * Negatif kontrol: F2L_NEGATIF=1 (001100 YOK; F2_TEST_DB_WITH_F2K verilmeden) ile çalıştırıldığında F2-K kuralları olmadığı için FAIL vermelidir.
 *
 * Ön koşul: f2c-ui.e2e.ts başlığındaki sahte env ile `next build --webpack`.
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2k-ui.e2e.ts <yeni-boş-kanıt-klasörü>
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { startF2cDb, newPhone, signWith, U, EMAIL, pw, installAdminStandIns, type Phone } from "./testDb";
import { displayCodeForSpki, qrDecideMessage, qrFetchMessage } from "@/lib/auth/deviceSignature";

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
const WIDTHS = [{ w: 320, h: 640 }, { w: 375, h: 812 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1280, h: 860 }];

async function api(p: string, body?: unknown): Promise<{ status: number; json: J }> {
  const res = await fetch(`${BASE}${p}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}
const parseQr = (url: string) => /#c=([0-9a-f-]{36})&n=([A-Za-z0-9_-]{32})$/.exec(url);
/** Telefon (SENTETİK): QR'ı imzalı okur → sunucunun telefona gösterdiği alanlar. */
async function phoneFetch(p: Phone, qrUrl: string) {
  const m = parseQr(qrUrl);
  if (!m) return { status: 0, json: { error: "qr parse" } as J };
  const ts = nowTs();
  return api("/api/auth/mfa/qr/fetch", { challengeId: m[1], qrNonce: m[2], deviceId: p.deviceId, ts, signature: signWith(p, qrFetchMessage(m[1], m[2], p.deviceId!, ts)) });
}
/** Telefon (SENTETİK): kullanıcının telefona YAZDIĞI kodla imzalı karar. */
async function phoneDecide(p: Phone, qrUrl: string, typed: string, decision: "approve" | "deny" = "approve") {
  const m = parseQr(qrUrl);
  if (!m) return { status: 0, json: { error: "qr parse" } as J };
  const code = decision === "approve" ? typed : "";
  const ts = nowTs();
  return api("/api/auth/mfa/qr/decide", { challengeId: m[1], qrNonce: m[2], deviceId: p.deviceId, decision, matchCode: code, ts,
    signature: signWith(p, qrDecideMessage(m[1], m[2], p.deviceId!, decision, code, ts)) });
}
const wrongCode = (c: string) => c.slice(0, -1) + String((Number(c.slice(-1)) + 1) % 10);

/** Giriş modalını açar, parola girer; /api/auth/session yanıtını yakalar. */
async function startLogin(page: Page, email: string, password = pw(email)): Promise<{ status: number; json: J }> {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const resp = page.waitForResponse((r) => r.url().endsWith("/api/auth/session") && r.request().method() === "POST", { timeout: 30000 });
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
  const r = await resp;
  return { status: r.status(), json: (await r.json().catch(() => ({}))) as J };
}
async function sessionValid(ctx: BrowserContext): Promise<boolean> {
  const r = await ctx.request.get(`${BASE}/api/auth/session`);
  return ((await r.json().catch(() => ({}))) as J).valid === true;
}
async function noOverflow(page: Page, w: number): Promise<boolean> {
  return (await page.evaluate(() => document.documentElement.scrollWidth)) <= w;
}
async function diag(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `TANI-${name}.png`), fullPage: true }).catch(() => {});
  console.log(`  TANI ${name}: url=${page.url()} metin=${(await page.locator("body").innerText().catch(() => "")).slice(0, 300).replace(/\s+/g, " ")}`);
}

async function main() {
  // F2L_NEGATIF=1 → 001100 (F2-K) UYGULANMAZ: testler F2-K kurallarını yakalıyorsa FAIL vermelidir.
  const db = await startF2cDb(process.env.F2L_NEGATIF === "1" ? { withF2j: true } : { withF2k: true });
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  const hasF2k = (await q(`SELECT to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL AS x`)).rows[0].x as boolean;
  console.log(`  bilgi: zincirde F2-K (001100) ${hasF2k ? "VAR" : "YOK — negatif kontrol koşusu"}`);
  await installAdminStandIns(db.admin);
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
    RATE_LIMIT_SECRET: "f2k-ui-rate-secret",
    LOGIN_IP_PEPPER: "f2k-ui-pepper",
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

    console.log("\n── Kurulum: Owner + uzman telefonları (SENTETİK P-256), MFA zorunlu ──");
    const mkPhone = async (userId: string) => {
      const p = newPhone();
      const code = displayCodeForSpki(Buffer.from(p.spki, "base64"));
      p.deviceId = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
        VALUES ($1, $2, encode(sha256(convert_to($2::text,'UTF8')),'hex'), $3, 'active', now()) RETURNING id`, [userId, p.spki, code])).rows[0].id as string;
      return p;
    };
    const ownerPhone = await mkPhone(U.owner);
    const expPhone = await mkPhone(U.exp);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id IN ('${U.owner}','${U.exp}'); SELECT set_config('yasam.mfa_policy','off',false);`);
    const tenant = (await q(`SELECT tenant_id FROM public.users WHERE id = $1`, [U.owner])).rows[0].tenant_id as string;
    const mkExpert = async (tag: string) => {
      const id = randomUUID();
      const email = `f2l-${tag}-${id.slice(0, 6)}@test.local`;
      await q(`INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, password_hash)
               VALUES ($1, $2, 'expert', $3, true, 'approved', extensions.crypt($4, extensions.gen_salt('bf', 4)))`, [id, email, tenant, pw(email)]);
      return { id, email };
    };
    const role = async (id: string) => (await q(`SELECT role, mfa_required FROM public.users WHERE id = $1`, [id])).rows[0] as { role: string; mfa_required: boolean } | undefined;

    for (const [label, channel] of [["Chrome", "chrome"], ["Edge", "msedge"]] as const) {
      const browser = await chromium.launch({ channel, headless: true });
      browsers.push(browser);
      console.log(`\n══ ${label} (${browser.version()}) ══`);

      // ── 1) Yanlış parola ─────────────────────────────────────────────────────────────────────────────────────
      {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "tr-TR" });
        const page = await ctx.newPage();
        const r = await startLogin(page, EMAIL.exp, "yanlis-parola-123");
        await sleep(800);
        ok(r.status === 401 && (await page.getByTestId("mfa-qr-panel").count()) === 0 && !(await sessionValid(ctx)),
          `${label}: yanlış parola → 401, QR paneli yok, oturum yok`, r);
        await ctx.close();
      }

      // ── 2) 6 haneli kod + MFA tamamlanmadan oturum yok + onay ─────────────────────────────────────────────────
      {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "tr-TR" });
        const page = await ctx.newPage();
        const l = await startLogin(page, EMAIL.exp);
        const qr = (l.json.qr ?? {}) as J;
        await page.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
        const shown = (await page.getByTestId("mfa-match-code").innerText()).trim();
        ok(/^[0-9]{6}$/.test(shown) && shown === qr.matchCode, `${label}: ekranda 6 haneli kod = sunucu kodu (${shown})`);
        ok((await page.getByText("Telefona yazacağınız kod").count()) > 0, `${label}: kodun telefona YAZILACAĞI açıkça söyleniyor`);
        ok(!(await sessionValid(ctx)), `${label}: MFA tamamlanmadan oturum YOK (korumalı API valid=false)`);
        const second = await ctx.newPage();
        await second.goto(`${BASE}/admin/cihaz-onaylari`, { waitUntil: "domcontentloaded" });
        await sleep(2500);
        ok((await second.getByRole("heading", { name: "Cihaz eşleştirme onayları" }).count()) === 0, `${label}: MFA bitmeden ikinci sekmede korumalı sayfa açılmaz`);
        await second.close();
        const f = await phoneFetch(expPhone, String(qr.url));
        ok(f.json.matchMode === "typed6" && Array.isArray(f.json.options) && (f.json.options as unknown[]).length === 0 && f.json.purpose === "login",
          `${label}: telefon 'yazma' kipini ve GİRİŞ amacını alır; kod telefona gönderilmez`, f.json);
        const d = await phoneDecide(expPhone, String(qr.url), shown);
        ok(d.json.result === "approved", `${label}: telefona doğru kod yazıldı → onay`, d.json);
        await page.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 20000 }).catch(() => {});
        await sleep(1500);
        ok(await sessionValid(ctx), `${label}: onaydan sonra oturum açıldı`);
        const again = await phoneDecide(expPhone, String(qr.url), shown);
        ok(again.status === 404, `${label}: aynı istek ikinci kez onaylanamaz`, again);
        await page.screenshot({ path: path.join(OUT, `${label}-1-giris-sonrasi.png`) });
        await ctx.close();
      }

      // ── 3) Paralel sekmeler: yanlış kod → bütün açık istekler kapanır; yeniden deneme çalışır ─────────────────────
      {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "tr-TR" });
        const a = await ctx.newPage();
        const b = await ctx.newPage();
        const la = await startLogin(a, EMAIL.exp);
        const lb = await startLogin(b, EMAIL.exp);
        await a.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
        await b.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
        const qa = (la.json.qr ?? {}) as J;
        const d = await phoneDecide(expPhone, String(qa.url), wrongCode(String(qa.matchCode)));
        ok(d.json.result === "denied", `${label}: yanlış kod → reddedildi`, d.json);
        let both = false;
        try {
          await a.getByTestId("mfa-final").waitFor({ timeout: 15000 });
          await b.getByTestId("mfa-final").waitFor({ timeout: 15000 });
          both = true;
        } catch { await diag(b, `${label}-paralel`); }
        ok(both, `${label}: yanlış kod İKİ sekmedeki isteği de kapattı (paralel oltalama tek denemeye iner)`);
        const st = (await q(`SELECT count(*)::int n FROM public.auth_mfa_challenges WHERE id IN ($1,$2) AND state = 'denied'`, [la.json.challengeId, lb.json.challengeId])).rows[0].n;
        ok(st === 2, `${label}: DB'de iki istek de reddedildi (${st})`);
        ok(!(await sessionValid(ctx)), `${label}: paralel sekmelerde oturum açılmadı`);
        await b.screenshot({ path: path.join(OUT, `${label}-2-paralel-reddedildi.png`) });
        const lr = await startLogin(a, EMAIL.exp);
        await a.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
        const qr = (lr.json.qr ?? {}) as J;
        const dr = await phoneDecide(expPhone, String(qr.url), String(qr.matchCode));
        await a.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 20000 }).catch(() => {});
        await sleep(1500);
        ok(dr.json.result === "approved" && (await sessionValid(ctx)), `${label}: reddedilmeden sonra yeniden deneme çalışır`, dr.json);
        await ctx.close();
      }

      // ── 4) Süresi dolmuş istek ───────────────────────────────────────────────────────────────────────────────
      {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "tr-TR", isMobile: true });
        const page = await ctx.newPage();
        const l = await startLogin(page, EMAIL.exp);
        await page.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
        await q(`UPDATE public.auth_mfa_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE id = $1`, [l.json.challengeId]);
        const qr = (l.json.qr ?? {}) as J;
        const d = await phoneDecide(expPhone, String(qr.url), String(qr.matchCode));
        ok(d.json.result !== "approved", `${label}: süresi dolmuş istek telefondan onaylanamaz`, d);
        let shown = false;
        try { await page.getByTestId("mfa-final").waitFor({ timeout: 20000 }); shown = true; } catch { await diag(page, `${label}-suresi-dolmus`); }
        ok(shown && !(await sessionValid(ctx)), `${label}: tarayıcı süre dolumunu gösterir, oturum yok`);
        await page.screenshot({ path: path.join(OUT, `${label}-3-suresi-dolmus-375.png`) });
        await ctx.close();
      }

      // ── 5) Owner: QR girişi → yönetici yetkisi verme (işleme özel doğrulama) ─────────────────────────────────────
      const owner = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "tr-TR" });
      const op = await owner.newPage();
      const ol = await startLogin(op, EMAIL.owner);
      await op.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
      const oqr = (ol.json.qr ?? {}) as J;
      ok((await phoneDecide(ownerPhone, String(oqr.url), String(oqr.matchCode))).json.result === "approved", `${label}: Owner QR girişi onaylandı`);
      await op.waitForFunction(() => !document.querySelector('[data-testid="mfa-qr-panel"]'), undefined, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      ok(await sessionValid(owner), `${label}: Owner oturumu açık (taze MFA)`);

      /** Step-up penceresinin /api/admin/step-up begin yanıtını yakalar. */
      const captureStepUp = () => op.waitForResponse((r) => r.url().endsWith("/api/admin/step-up") && r.request().method() === "POST"
        && (r.request().postData() ?? "").includes('"begin"'), { timeout: 20000 });

      // 5a) Klasik ekrandan yönetici oluşturma: Vazgeç → oluşmaz; telefon onayı → oluşur.
      const newAdminEmail = `f2l-yonetici-${label.toLowerCase()}-${randomUUID().slice(0, 6)}@test.local`;
      await op.goto(`${BASE}/admin/users/klasik`, { waitUntil: "domcontentloaded" });
      let formReady = false;
      try {
        await op.getByRole("button", { name: /Yeni Uzman/ }).first().click({ timeout: 20000 });
        await op.locator("#create-name").fill(`F2L Yönetici ${label}`);
        await op.locator("#create-email").fill(newAdminEmail);
        await op.locator("#create-password").fill(pw(newAdminEmail));
        await op.locator("#create-role").selectOption("admin");
        formReady = true;
      } catch { await diag(op, `${label}-klasik-form`); }
      ok(formReady, `${label}: Owner klasik ekranda yönetici oluşturma formunu doldurdu`);
      if (formReady) {
        let begin = captureStepUp();
        await op.getByRole("button", { name: "Yöneticiyi Oluştur" }).click();
        let dialog = false;
        try { await op.getByTestId("step-up-dialog").waitFor({ timeout: 20000 }); dialog = true; } catch { await diag(op, `${label}-stepup-yok`); }
        ok(dialog, `${label}: yönetici oluşturma işleme özel doğrulama penceresini açtı (doğrudan oluşturma YOK)`);
        ok(Number((await q(`SELECT count(*)::int n FROM public.users WHERE lower(email) = $1`, [newAdminEmail])).rows[0].n) === 0, `${label}: doğrulama öncesi kullanıcı oluşmadı`);
        if (dialog) {
          ok((await op.getByTestId("step-up-dialog").innerText()).toLowerCase().includes("yönetici yetkisi"), `${label}: pencere işlemi adıyla gösterir (yönetici yetkisi verme)`);
          for (const vp of WIDTHS) {
            await op.setViewportSize({ width: vp.w, height: vp.h });
            await sleep(250);
            const box = await op.getByTestId("step-up-dialog").boundingBox();
            ok(!!box && box.width <= vp.w && await noOverflow(op, vp.w), `${label}: doğrulama penceresi ${vp.w} px'e sığar`);
            await op.screenshot({ path: path.join(OUT, `${label}-4-stepup-${vp.w}.png`) });
          }
          await op.setViewportSize({ width: 1280, height: 860 });
          await begin.catch(() => null);
          await op.getByTestId("step-up-cancel").click();
          await sleep(1000);
          ok(Number((await q(`SELECT count(*)::int n FROM public.users WHERE lower(email) = $1`, [newAdminEmail])).rows[0].n) === 0, `${label}: Vazgeç → yönetici OLUŞMADI`);
          begin = captureStepUp();
          await op.getByRole("button", { name: "Yöneticiyi Oluştur" }).click();
          const b = await begin;
          const bj = (await b.json().catch(() => ({}))) as J;
          const sq = (bj.qr ?? {}) as J;
          if (!sq.url) console.log(`  TANI ${label}-stepup-yanit: ${b.status()} ${JSON.stringify(bj).slice(0, 300)}`);
          const pf = await phoneFetch(ownerPhone, String(sq.url));
          ok(pf.json.purpose === "step_up" && pf.json.action === "admin_grant", `${label}: telefon bunu GİRİŞ değil "yönetici yetkisi verme" kritik işlemi olarak görür`, pf.json);
          const wrong = await phoneDecide(ownerPhone, String(sq.url), wrongCode(String(sq.matchCode)));
          ok(wrong.json.result === "denied", `${label}: kritik işlemde yanlış kod → reddedildi`, wrong.json);
          await sleep(2500);
          ok(Number((await q(`SELECT count(*)::int n FROM public.users WHERE lower(email) = $1`, [newAdminEmail])).rows[0].n) === 0, `${label}: yanlış kodla yönetici OLUŞMADI`);
          await op.getByTestId("step-up-cancel").click().catch(() => {});
          await sleep(500);
          begin = captureStepUp();
          await op.getByRole("button", { name: "Yöneticiyi Oluştur" }).click();
          const b2r = await begin;
          const b2 = (await b2r.json().catch(() => ({}))) as J;
          const sq2 = (b2.qr ?? {}) as J;
          if (!sq2.url) console.log(`  TANI ${label}-stepup-yanit-2: ${b2r.status()} ${JSON.stringify(b2).slice(0, 300)}`);
          const okd = await phoneDecide(ownerPhone, String(sq2.url), String(sq2.matchCode));
          ok(okd.json.result === "approved", `${label}: Owner telefonu doğru kodla onayladı`, okd.json);
          let created: { id: string; role: string; mfa_required: boolean } | undefined;
          for (let i = 0; i < 20 && !created; i++) {
            await sleep(750);
            created = (await q(`SELECT id, role, mfa_required FROM public.users WHERE lower(email) = $1`, [newAdminEmail])).rows[0];
          }
          ok(created?.role === "admin" && created.mfa_required === true, `${label}: doğrulama sonrası yönetici oluştu ve MFA ZORUNLU`, created);
          await op.screenshot({ path: path.join(OUT, `${label}-5-yonetici-olustu.png`), fullPage: true });

          // 5b) MFA kurulumu (cihaz) olmayan yeni yönetici oturum açamaz.
          if (created) {
            const nctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "tr-TR" });
            const np = await nctx.newPage();
            const nl = await startLogin(np, newAdminEmail);
            await sleep(1500);
            ok(nl.json.code !== undefined && nl.json.sessionToken === undefined && nl.json.sessionCookie === undefined && !(await sessionValid(nctx)),
              `${label}: MFA kurulumu olmayan yeni yönetici oturum AÇAMAZ (${String(nl.json.code)})`, nl.json);
            await np.screenshot({ path: path.join(OUT, `${label}-6-yeni-yonetici-kisitli.png`) });
            await nctx.close();
          }
        }
      }

      // 5c) Uzmanı yöneticiye yükseltme (detay ekranı) + başka hedefe ait kanıt + yeniden kullanılan kanıt.
      if (label === "Chrome") {
        const target = await mkExpert("hedef");
        const other = await mkExpert("baska");
        const ownerTok = (await q(`SELECT session_token FROM public.user_sessions WHERE user_id = $1 AND is_active AND mfa_method IS NOT NULL
                                   ORDER BY created_at DESC LIMIT 1`, [U.owner])).rows[0]?.session_token as string | undefined;
        // Başka hedefe (other) ait ONAYLI kanıt hazırla — target için geçmemeli.
        if (hasF2k && ownerTok) {
          const su = (await q(`SELECT public.auth_owner_step_up_begin($1, 'admin_grant', $2) AS r`, [ownerTok, other.id])).rows[0].r as J;
          const dd = (await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4) AS r`, [su.challenge_id, su.qr_nonce, ownerPhone.deviceId, su.match_code])).rows[0].r as J;
          ok(su.ok === true && dd.result === "approved", `${label}: (ön koşul) BAŞKA hedefe ait kanıt Owner telefonuyla onaylandı`, { su, dd });
        } else if (hasF2k) ok(false, `${label}: (ön koşul) Owner oturum anahtarı bulunamadı`);
        // Tarayıcının GERÇEK Owner oturumu (HttpOnly çerez + uygulamanın kendi yönetici başlıkları) ile gerçek route'lar.
        // Not: kullanıcı detay ekranı bu minimal test DB'sinde "Kayıt bulunamadı" gösterir → oradaki düğme akışı NOT TESTED.
        const inPage = (url: string, method: string, body: unknown) => op.evaluate(async ([u, m, b]) => {
          const user = JSON.parse(localStorage.getItem("yasam_user") ?? "{}") as { id?: string };
          const tok = localStorage.getItem("yasam_session_token");
          const r = await fetch(u as string, { method: m as string, credentials: "same-origin",
            headers: { "content-type": "application/json", "x-admin-id": user.id ?? "", ...(tok ? { "x-session-token": tok } : {}) }, body: JSON.stringify(b) });
          return { status: r.status, json: await r.json().catch(() => ({})) };
        }, [url, method, body] as const);
        const promoteApi = () => inPage(`${BASE}/api/admin/users/${target.id}`, "PATCH", { action: "edit", fullName: "F2L Hedef", email: target.email, role: "admin" });
        const p1 = await promoteApi();
        ok(p1.status === 403 && (p1.json as J).code === "STEP_UP_REQUIRED" && (await role(target.id))?.role === "expert",
          `${label}: başka hedefe ait ONAYLI kanıt bu kullanıcı için GEÇMEZ (STEP_UP_REQUIRED, rol değişmez)`, p1);
        const sb = await inPage(`${BASE}/api/admin/step-up`, "POST", { op: "begin", action: "admin_grant", targetId: target.id });
        const sbq = ((sb.json as J).qr ?? {}) as J;
        if (!sbq.url) console.log(`  TANI ${label}-api-stepup: ${sb.status} ${JSON.stringify(sb.json).slice(0, 300)}`);
        const d = await phoneDecide(ownerPhone, String(sbq.url), String(sbq.matchCode));
        ok(d.json.result === "approved", `${label}: bu hedef için telefon onayı`, d.json);
        const p2 = await promoteApi();
        const r2 = await role(target.id);
        ok(p2.status === 200 && r2?.role === "admin" && r2.mfa_required === true, `${label}: kanıtla uzman yöneticiye yükseltildi, MFA zorunlu`, { p2, r2 });
        ok(Number((await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [target.id])).rows[0].n) === 0, `${label}: yükseltilen kullanıcının açık oturumu yok`);
        await q(`UPDATE public.users SET role = 'expert' WHERE id = $1`, [target.id]);
        const p3 = await promoteApi();
        ok(p3.status === 403 && (p3.json as J).code === "STEP_UP_REQUIRED" && (await role(target.id))?.role === "expert",
          `${label}: KULLANILMIŞ kanıt yeniden kullanılamaz (STEP_UP_REQUIRED)`, p3);

        // 5d) Süresi geçmiş cihaz talebi Owner listesinde görünmez; taze olan görünür.
        const fresh = await mkExpert("taze");
        const old = await mkExpert("eski");
        const pend = async (uid: string, minutes: number) => {
          const p = newPhone();
          const code = displayCodeForSpki(Buffer.from(p.spki, "base64"));
          await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, created_at)
                   VALUES ($1, $2, encode(sha256(convert_to($2::text,'UTF8')),'hex'), $3, 'pending_owner', now() - make_interval(mins => $4))`, [uid, p.spki, code, minutes]);
          return code;
        };
        const freshCode = await pend(fresh.id, 1);
        const oldCode = await pend(old.id, 16);
        await op.goto(`${BASE}/admin/cihaz-onaylari`, { waitUntil: "domcontentloaded" });
        try { await op.getByRole("heading", { name: "Cihaz eşleştirme onayları" }).waitFor({ timeout: 20000 }); } catch { await diag(op, `${label}-cihaz`); }
        await op.getByTestId("device-request").first().waitFor({ timeout: 15000 }).catch(() => {});
        const listText = (await op.locator("body").innerText()).replace(/\s+/g, " ");
        ok(listText.includes(freshCode) && !listText.includes(oldCode), `${label}: Owner listesi taze talebi gösterir, 15 dk'yı geçeni GÖSTERMEZ`, { freshCode, oldCode });
        await op.screenshot({ path: path.join(OUT, `${label}-8-cihaz-talepleri.png`), fullPage: true });
      }
      await owner.close();
    }

    // ── 6) Giriş QR paneli: 320 / 375 / 390 / 768 / masaüstü taşma ─────────────────────────────────────────────
    const chrome = browsers[0];
    for (const vp of WIDTHS) {
      const ctx = await chrome.newContext({ viewport: { width: vp.w, height: vp.h }, locale: "tr-TR", isMobile: vp.w < 500 });
      const page = await ctx.newPage();
      await startLogin(page, EMAIL.exp);
      await page.getByTestId("mfa-qr-panel").waitFor({ timeout: 15000 });
      const box = await page.getByTestId("mfa-qr-panel").boundingBox();
      const codeBox = await page.getByTestId("mfa-match-code").boundingBox();
      ok(!!box && box.width <= vp.w && !!codeBox && codeBox.x >= 0 && codeBox.x + codeBox.width <= vp.w && await noOverflow(page, vp.w),
        `Chrome: QR paneli ve 6 haneli kod ${vp.w} px'e sığar`);
      await page.screenshot({ path: path.join(OUT, `Chrome-9-qr-${vp.w}.png`) });
      await ctx.close();
    }
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
    if (app.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    proxy.close();
    await db.close();
  }
  console.log(`\nf2k ui e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
