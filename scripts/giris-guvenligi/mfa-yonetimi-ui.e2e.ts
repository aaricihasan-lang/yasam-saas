/**
 * Owner İki Aşamalı Giriş Yönetimi — TARAYICI uçtan uca (gerçek Google Chrome + gerçek Microsoft Edge; 320 / 375 / 390 / 1280 px).
 * GERÇEK: Next.js production build (`next start`), gerçek route'lar, gerçek PostgreSQL (bütün F2 zinciri), HttpOnly çerez
 * birincil kip. Production'a SIFIR temas; sentetik hesaplar; e-posta SENTETİK (yerel dosya; gerçek Gmail YOK).
 *
 * Doğrulanan: yatay taşma yok, bölüm ekran içinde, düğmeler ≥ 44 px, gizli değer yok; Owner'a özel görünüm (Owner olmayan
 * yöneticiye bölüm çizilmez); açma formu (gerekçe + onay olmadan gönder kapalı) ve açma; MFA'sız Owner'da kaldırma reddi;
 * Owner'ın kendi zorunluluğunu açması (yeniden giriş) → e-posta koduyla taze oturum → kaldırmada işlem onayı diyaloğu (ekran
 * içinde) → e-posta kodu → kaldırma tamamlanır. Edge'de ikinci üye için aç / kaldır.
 *
 * Sonuç: 0 = hepsi PASS · 1 = gerçek FAIL · 3 = NOT TESTED (altyapı; ör. gerçek Edge ikilisi yok). Asgari PASS sayısı
 * (MFA_UI_MIN_PASS) altında kalan koşu FAIL'dir (boş / eksik paket PASS VEREMEZ).
 *
 * Ön koşul (sahte değerler; portlar başka oturumların 54398 / 3987'siyle ÇAKIŞMASIN diye ayrı):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54458 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/giris-guvenligi/mfa-yonetimi-ui.e2e.ts <kanıt-klasörü>
 *   (MFA_UI_PORT=3967, MFA_UI_SUPA_PORT=54458 — build'e gömülü adresle AYNI; MFA_UI_REQUIRE_EDGE=1 → Edge yoksa NOT TESTED)
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
const MIN_PASS = Number(process.env.MFA_UI_MIN_PASS ?? 0);
const REQUIRE_EDGE = process.env.MFA_UI_REQUIRE_EDGE === "1";
const WIDTHS = [320, 375, 390, 1280];
let pass = 0;
let fail = 0;
const notTested: string[] = [];
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * YALNIZ bu test: en küçük F2 test şeması (session-model fikstürü) Üye Detayı ekranının okuduğu üyelik / ödeme alanlarını
 * içermez → ekran "Kullanıcı bulunamadı" der (CI'da ölçüldü, 18.11). Production şemasındaki karşılıkları boş değerle eklenir
 * (tipler repo migration'larından; temel şemadan gelenler tarih / tutar / metin). Güvenlik kuralına DOKUNMAZ; veri eklemez.
 */
const UYE_DETAY_SEMA = `
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS last_payment_date date,
  ADD COLUMN IF NOT EXISTS next_payment_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_note text,
  ADD COLUMN IF NOT EXISTS agreed_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS billing_period text,
  ADD COLUMN IF NOT EXISTS license_note text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
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
  type Locator = import("playwright").Locator;
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const { ADMIN_SESSION_COOKIE } = await import("../../lib/auth/adminShellSession");
  const db = await startF2cDb({ withF2d: true, withF2e: true, withF2g: true, withF2h: true, withF2i: true, withF2j: true, withF2k: true });
  await db.admin.query(UYE_DETAY_SEMA);
  const FREE = U.free;
  const AND1 = U.and1;
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
    EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: SINK,
    AUTH_OTP_PEPPER: "mfa-ui-pepper-0123456789abcdefghijklmnop", NEXT_TELEMETRY_DISABLED: "1",
  };
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "localhost"],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore", detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  const required = async (id: string) => ((await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [id])).rows[0] as { mfa_required: boolean }).mfa_required;
  const sinkCount = () => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).length; } catch { return 0; } };
  /** Yalnız `after` satırından SONRA bu adrese düşen son kod (eski kod yeniden kullanılmaz). */
  const waitCode = async (to: string, after: number) => {
    for (let i = 0; i < 60; i++) {
      let lines: string[] = [];
      try { lines = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean); } catch { /* yok */ }
      const m = lines.slice(after).map((l) => JSON.parse(l) as { to?: string; subject?: string }).reverse().find((x) => x.to === to);
      const c = /^([0-9]{6}) — /.exec(m?.subject ?? "")?.[1];
      if (c) return c;
      await sleep(500);
    }
    return "";
  };
  const fits = async (page: Page, loc: Locator, w: number) => {
    const b = await loc.boundingBox();
    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    return { inView: !!b && b.x >= -1 && b.x + b.width <= w + 1, noOverflow: sw.sw <= sw.cw + 1, b, sw };
  };
  try {
    for (let i = 0; i < 150; i++) { try { const r = await fetch(`${BASE}/`); if (r.status < 500) break; } catch { /* bekle */ } await sleep(1000); }
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id IN ($1, $2, $3)`, [FREE, AND1, U.owner]);

    /** Ardışık test girişleri arasında ZAMAN GEÇMESİNİ taklit eder (YALNIZ sentetik DB): yeniden gönderim beklemesi + saatlik 6 kod sınırı
     *  (CI 18.11: 7. kodda ürün kuralı doğru biçimde rate_limited verdi). Ürün kuralı DEĞİŞMEZ. */
    const ageOtps = async (email: string) => {
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes'
                WHERE user_id = (SELECT id FROM public.users WHERE email = $1)`, [email]);
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE purpose IS DISTINCT FROM 'step_up' AND state IN ('pending','verified')
                AND user_id = (SELECT id FROM public.users WHERE email = $1)`, [email]);
    };
    /**
     * Arayüzden giriş; MFA istenirse e-posta koduyla (sentetik kutu) tamamlar.
     * Yönetici girişi (`admin: true`, varsayılan) uygulamada İKİ adımda biter: `localStorage.yasam_user` yazılır, ARDINDAN
     * `POST /api/auth/admin-session` yönetici kabuğu çerezini verir ve `router.push("/admin")` çalışır (app/page.tsx completeLogin).
     * Yalnız localStorage'ı beklemek, çerez yazılmadan `/admin/*`'a gitmeye yol açıyordu (proxy.ts → `/`; 25.11 kök neden analizi).
     * Bu yüzden yönetici girişinde admin-session yanıtı (2xx), `/admin` yönlendirmesi ve çerezin gerçekten bağlamda olması
     * BEKLENİR ve doğrulanır (sabit bekleme yok; beklenti gevşemez, sıkılaşır). Çerez DEĞERİ okunmaz / yazdırılmaz.
     * Yönetici olmayan girişte (`admin: false`) admin-session yanıtı ve çerez BEKLENMEZ.
     */
    const login = async (page: Page, email: string, opts: { admin?: boolean } = {}) => {
      const admin = opts.admin ?? true;
      await ageOtps(email);
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      const resp = page.waitForResponse((r) => r.url().endsWith("/api/auth/session") && r.request().method() === "POST", { timeout: 30000 });
      // Tıklamadan ÖNCE kaydedilir (MFA'lı girişte yanıt kod doğrulamasından sonra gelir; süre kod bekleme payını kapsar).
      const adminRespP = admin
        ? page.waitForResponse((r) => r.url().endsWith("/api/auth/admin-session") && r.request().method() === "POST", { timeout: 90000 }).catch(() => null)
        : Promise.resolve(null);
      await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill(pw(email));
      await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
      const r = await resp;
      let mfa = false;
      if (r.status() === 202) {
        mfa = true;
        const before = sinkCount();
        await page.getByRole("button", { name: /Kodu e-postama gönder/ }).click();
        const code = await waitCode(email, before);
        await page.locator('input[autocomplete="one-time-code"]').first().fill(code);
        await page.getByRole("button", { name: /Doğrula ve giriş yap/ }).click();
      }
      const loggedIn = await page.waitForFunction(() => !!localStorage.getItem("yasam_user"), null, { timeout: 25000 }).then(() => true).catch(() => false);
      let adminSession: number | null = null;
      let adminRedirect = false;
      let adminCookie = false;
      const adminResp = await adminRespP;
      if (adminResp) {
        adminSession = adminResp.status();
        if (adminResp.ok()) {
          adminRedirect = await page.waitForURL((u) => /^\/admin(\/|$)/.test(u.pathname), { timeout: 20000 }).then(() => true).catch(() => false);
          adminCookie = (await page.context().cookies(BASE)).some((c) => c.name === ADMIN_SESSION_COOKIE && c.value.length > 0);
        }
      }
      // Yönetici girişi: admin-session 2xx + /admin yönlendirmesi + çerez bağlamda → ancak o zaman "giriş tamam".
      const adminOk = !admin || (adminSession !== null && adminSession >= 200 && adminSession < 300 && adminRedirect && adminCookie);
      return { status: r.status(), mfa, loggedIn: loggedIn && adminOk, adminSession, adminRedirect, adminCookie };
    };
    const openMember = async (page: Page, id: string) => {
      await page.goto(`${BASE}/admin/users/${id}#hesap`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Hesap durumu ve erişim özeti" }).waitFor({ timeout: 30000 });
    };
    const renderCheck = async (page: Page, tag: string, w: number) => {
      const panel = page.locator("[data-mfa-panel]");
      await panel.waitFor({ timeout: 20000 });
      await page.locator("[data-mfa-ready]").waitFor({ timeout: 20000 });
      const m = await page.evaluate(() => {
        const el = document.querySelector("[data-mfa-panel]") as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        const btns = Array.from(el?.querySelectorAll("button") ?? []).map((b) => (b as HTMLElement).getBoundingClientRect()).filter((b) => b.width > 0);
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: r?.left ?? -1, right: r?.right ?? 99999,
          minBtnH: btns.length ? Math.min(...btns.map((b) => b.height)) : 0, btnCount: btns.length, text: el?.innerText ?? "" };
      });
      ok(m.sw <= m.cw + 1, `${tag}: yatay taşma yok (sayfa ${m.sw} ≤ ${m.cw})`, m);
      ok(m.left >= 0 && m.right <= w + 1, `${tag}: bölüm ekran içinde`, { left: m.left, right: m.right });
      ok(m.btnCount >= 1 && m.minBtnH >= 43, `${tag}: düğmeler kullanılabilir (≥ 44 px)`, { n: m.btnCount, h: m.minBtnH });
      ok(!m.text.includes("@") && /İki Aşamalı Giriş Yönetimi/.test(m.text) && /Etkinleştirmeye hazır mı/.test(m.text), `${tag}: içerik doğru, e-posta adresi / kod gösterilmiyor`);
      await panel.screenshot({ path: path.join(OUT, `${tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-durum.png`) });
      return panel;
    };
    /** Kaldırma: işlem onayı diyaloğu → e-posta kodu → doğrulama → sunucu sonucu. */
    const disableWithStepUp = async (page: Page, panel: Locator, tag: string, target: string, w: number) => {
      await page.locator("[data-mfa-action=disable]").click();
      const form = page.locator("[data-mfa-form=disable]");
      ok(/korumasını azaltır/.test(await form.innerText()), `${tag}: kaldırma onay ekranı uyarıyı gösterir`);
      await page.locator("[data-mfa-reason]").fill("Üye telefonunu kaybetti, kurtarma");
      await page.locator("[data-mfa-confirm]").check();
      await page.locator("[data-mfa-submit]").click();
      const dlg = page.getByTestId("step-up-dialog");
      await dlg.waitFor({ timeout: 20000 });
      const f = await fits(page, dlg, w);
      ok(f.inView && f.noOverflow, `${tag}: işlem onayı diyaloğu ekran içinde, taşma yok`, f);
      await page.getByTestId("step-up-email").waitFor({ timeout: 20000 });
      await page.screenshot({ path: path.join(OUT, `${tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-islem-onayi.png`) });
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes'
                WHERE user_id = $1 AND purpose IS DISTINCT FROM 'step_up'`, [U.owner]).catch(() => {});
      const before = sinkCount();
      await page.getByTestId("step-up-email-send").click();
      const code = await waitCode(EMAIL.owner, before);
      ok(/^[0-9]{6}$/.test(code), `${tag}: onay kodu YALNIZ Owner'ın (sentetik) kutusuna geldi`);
      ok(await required(target), `${tag}: kod doğrulanmadan zorunluluk DEĞİŞMEDİ`);
      await page.getByTestId("step-up-email-code").fill(code);
      await page.getByTestId("step-up-email-verify").click();
      await page.locator("[data-mfa-message=ok]").waitFor({ timeout: 30000 });
      ok(!(await required(target)) && (await page.locator("[data-mfa-required=off]").count()) === 1, `${tag}: kanıtla KALDIRILDI (DB + ekran)`);
      await panel.screenshot({ path: path.join(OUT, `${tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-kaldirildi.png`) });
    };
    const enableViaUi = async (page: Page, panel: Locator, tag: string, target: string, reason: string) => {
      await page.locator("[data-mfa-action=enable]").click();
      const submit = page.locator("[data-mfa-submit]");
      ok(await submit.isDisabled(), `${tag}: gerekçe + onay olmadan gönder düğmesi KAPALI`);
      await page.locator("[data-mfa-reason]").fill(reason);
      ok(await submit.isDisabled(), `${tag}: onay kutusu işaretlenmeden KAPALI`);
      await page.locator("[data-mfa-confirm]").check();
      await panel.screenshot({ path: path.join(OUT, `${tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-acma-onay-formu.png`) });
      await submit.click();
      await page.locator("[data-mfa-message=ok]").waitFor({ timeout: 20000 });
      ok(await required(target), `${tag}: arayüzden AÇILDI (DB: zorunlu)`);
    };

    // ── Tarayıcılar (gerçek markalı ikililer) ──
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
        const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, locale: "tr-TR" });
        const page = await ctx.newPage();
        const l = await login(page, EMAIL.owner);
        ok(l.loggedIn, `${tag}: Owner girişi${l.mfa ? " (e-posta kodu)" : ""}`, l);
        await openMember(page, FREE);
        const panel = await renderCheck(page, tag, w);

        if (prof.name === "Chrome" && w === 375) {
          // 1) MFA'sız Owner: üyeyi aç; kaldırma denemesi taze MFA gerekçesiyle reddedilir.
          await enableViaUi(page, panel, tag, FREE, "Owner kararı: hesap güvenliği");
          ok((await page.locator("[data-mfa-required=on]").count()) === 1, `${tag}: ekran sunucu sonucunu gösterir (Açık)`);
          await page.locator("[data-mfa-action=disable]").click();
          await page.locator("[data-mfa-reason]").fill("deneme");
          await page.locator("[data-mfa-confirm]").check();
          await page.locator("[data-mfa-submit]").click();
          await page.locator("[data-mfa-message=error]").waitFor({ timeout: 20000 });
          const err = await page.locator("[data-mfa-message=error]").innerText();
          ok(/ikinci doğrulamayla yeniden giriş/.test(err) && (await required(FREE)), `${tag}: MFA'sız Owner oturumuyla kaldırma REDDEDİLİR, sebep gösterilir`, err);
          await panel.screenshot({ path: path.join(OUT, `chrome-375-kaldirma-reddi.png`) });
          // 2) Owner kendi zorunluluğunu açar → MFA'sız oturum kapanır (yeniden giriş mesajı).
          await openMember(page, U.owner);
          const own = page.locator("[data-mfa-panel]");
          await page.locator("[data-mfa-ready=yes]").waitFor({ timeout: 20000 });
          // Owner kilitlenme koruması (23.11): kit yokken düğme kapalı + sebep; kit ve normal kod ayrı kartlarda.
          await page.locator("[data-recovery=owner-kit][data-owner-kit='0']").waitFor({ timeout: 20000 });
          ok(await page.locator("[data-mfa-action=enable]").isDisabled() && (await page.locator("[data-mfa-owner-blocked]").count()) === 1
            && (await page.locator("[data-recovery=codes]").count()) === 1,
            `${tag}: kit yokken Owner'ın kendi "Zorunluluğu aç" düğmesi KAPALI, sebep gösterilir; kit ve kurtarma kodu ayrı kartlarda`);
          await own.screenshot({ path: path.join(OUT, `chrome-375-owner-kit-yok.png`) });
          await q(`SELECT count(*) FROM public.auth_owner_offline_kit_issue()`);   // SQL konsolu (sentetik DB); kodlar okunmaz
          // Aynı adrese (yalnız #hesap) goto sayfayı YENİLEMEZ → panel durumu yeniden okumaz; gerçek yenileme şart.
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.getByRole("heading", { name: "Hesap durumu ve erişim özeti" }).waitFor({ timeout: 30000 });
          await page.locator("[data-recovery=owner-kit][data-owner-kit='5']").waitFor({ timeout: 20000 });
          ok(await page.locator("[data-mfa-action=enable]").isEnabled(), `${tag}: kit oluşunca (5 kod) düğme açılır`);
          await page.locator("[data-mfa-action=enable]").click();
          ok(/oturumlarınız \(bu oturum dahil\) hemen kapanır/.test(await page.locator("[data-mfa-form=enable]").innerText()), `${tag}: Owner'ın kendi açma formu oturum kapanışını önceden söyler`);
          await page.locator("[data-mfa-reason]").fill("Owner MFA etkinleştirme");
          await page.locator("[data-mfa-confirm]").check();
          await page.locator("[data-mfa-submit]").click();
          await page.locator("[data-mfa-message=ok]").waitFor({ timeout: 20000 });
          ok(/yeniden giriş yapın/.test(await page.locator("[data-mfa-message=ok]").innerText()) && (await required(U.owner)), `${tag}: Owner kendi zorunluluğunu açtı, yeniden giriş istendi`);
          await own.screenshot({ path: path.join(OUT, `chrome-375-owner-kendi-acma.png`) });
          await ctx.close();
          // 3) Owner e-posta koduyla taze oturum → kaldırma: işlem onayı diyaloğu + e-posta kodu.
          const ctx2 = await browser.newContext({ viewport: { width: 375, height: 860 }, locale: "tr-TR" });
          const p2 = await ctx2.newPage();
          const l2 = await login(p2, EMAIL.owner);
          ok(l2.status === 202 && l2.mfa && l2.loggedIn, `${tag}: Owner artık yalnız ikinci doğrulamayla girer (parola tek başına yetmez)`, l2);
          await openMember(p2, FREE);
          const panel2 = p2.locator("[data-mfa-panel]");
          await p2.locator("[data-mfa-required=on]").waitFor({ timeout: 20000 });
          await disableWithStepUp(p2, panel2, tag, FREE, 375);
          await ctx2.close();
          continue;
        }
        if (prof.name === "Edge" && w === 390) {
          // Edge: ikinci üye için aç → kaldır (Owner artık MFA'lı).
          await openMember(page, AND1);
          const p3 = page.locator("[data-mfa-panel]");
          await page.locator("[data-mfa-ready=yes]").waitFor({ timeout: 20000 });
          await enableViaUi(page, p3, tag, AND1, "Owner kararı: Edge kabul");
          await disableWithStepUp(page, p3, tag, AND1, 390);
        }
        await ctx.close();
      }
      // Owner'a özel görünüm: Owner olmayan yönetici
      const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: "tr-TR" });
      const page = await ctx.newPage();
      const l = await login(page, ADM2);
      ok(l.loggedIn, `${prof.name} 390px: Owner olmayan yönetici girişi`, l);
      await openMember(page, FREE);
      await sleep(3000);
      ok((await page.locator("[data-mfa-panel]").count()) === 0, `${prof.name} 390px: Owner olmayan yöneticiye bölüm HİÇ çizilmez`);
      await page.screenshot({ path: path.join(OUT, `${prof.name.toLowerCase()}-390-yonetici2.png`) });
      await ctx.close();
    }
  } finally {
    const nt = notTested.length ? ` · NOT TESTED: ${notTested.join(", ")}` : "";
    console.log(`\nmfa-yonetimi-ui: ${pass} PASS, ${fail} FAIL${nt}`);
    if (failures.length) console.log("FAIL:\n - " + failures.join("\n - "));
    for (const b of browsers) await b.close().catch(() => {});
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    else try { process.kill(-(app.pid ?? 0), "SIGTERM"); } catch { /* yok */ }
    proxy.close();
    await db.close();
  }
  if (fail) process.exit(1);
  if (MIN_PASS && pass < MIN_PASS) { console.log(`FAIL: asgari PASS ${MIN_PASS}, gözlenen ${pass} (eksik / atlanan test)`); process.exit(1); }
  if (REQUIRE_EDGE && notTested.length) { console.log("NOT TESTED (altyapı) — gerçek FAIL değil"); process.exit(3); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); console.log(`\nmfa-yonetimi-ui: ${pass} PASS, ${fail + 1} FAIL`); process.exit(1); });
