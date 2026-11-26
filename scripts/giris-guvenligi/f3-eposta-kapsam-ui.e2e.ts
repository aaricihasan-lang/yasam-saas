/**
 * GİRİŞ GÜVENLİĞİ F3 — kullanıcı e-postası kapsamı TARAYICI uçtan uca (gerçek Google Chrome + gerçek Microsoft Edge;
 * 320 / 375 / 390 / 768 / 1280 px). GERÇEK: Next.js production build (`next start`), gerçek route'lar, gerçek PostgreSQL
 * (en güncel F2 zinciri), HttpOnly çerez birincil kip. Production'a SIFIR temas; sentetik hesaplar; e-posta SENTETİK (yerel dosya).
 * AUTH_EMAIL_SELF_SERVICE_ROLES TANIMSIZ (= varsayılan yalnız Owner; sabahki ilk aşama ayarı).
 *
 * Doğrulanan: Ayarlar › Giriş Yöntemlerim — Owner'da e-posta doğrulama (klavyeyle gönder → sentetik koddan doğrula → "Doğrulandı")
 * ve adres değişikliği formu açık; uzmanda ikisi de KAPALI (bilgi notu, form / gönder düğmesi yok, uzmana ileti gitmez);
 * yatay taşma yok, kart ekran içinde, düğmeler görünür ve etkin, kod alanı etiketli, tam e-posta adresi / pepper DOM'da yok;
 * Owner e-posta durumu ekranı kapsamı "yalnız Owner (varsayılan)" gösterir.
 *
 * Sonuç: 0 = hepsi PASS · 1 = gerçek FAIL · 3 = NOT TESTED (altyapı; gerçek Edge ikilisi yok). Asgari PASS (F3_UI_MIN_PASS)
 * altında kalan koşu FAIL'dir.
 *
 * Ön koşul (sahte değerler; diğer testlerin portlarıyla çakışmaz):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54462 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-eposta-kapsam-ui.e2e.ts <kanıt-klasörü>
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

const PORT = Number(process.env.F3_UI_PORT ?? 3971);
const SUPA_PROXY_PORT = Number(process.env.F3_UI_SUPA_PORT ?? 54462);
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? "";
const MIN_PASS = Number(process.env.F3_UI_MIN_PASS ?? 0);
const REQUIRE_EDGE = process.env.F3_UI_REQUIRE_EDGE === "1";
const WIDTHS = [320, 375, 390, 768, 1280];
const PEPPER = "f3-ui-pepper-0123456789abcdefghijklmnopqrs";
let pass = 0;
let fail = 0;
const notTested: string[] = [];
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    RATE_LIMIT_SECRET: "f3-ui-rate-secret", LOGIN_IP_PEPPER: "f3-ui-ip-pepper", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: SINK, AUTH_OTP_PEPPER: PEPPER, NEXT_TELEMETRY_DISABLED: "1",
    // F3: Owner test iletisinin kayıtlı test hesabı alıcısı (sentetik uzman).
    EMAIL_OWNER_TEST_RECIPIENT: EMAIL.exp,
    // F3 pilot: tek uzman hesabı (sentetik "free") için adres doğrulaması; diğer uzman (exp) kapalı kalır.
    AUTH_EMAIL_VERIFY_PILOT_USER_ID: U.free,
  };
  delete env.AUTH_EMAIL_SELF_SERVICE_ROLES;
  const app: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "localhost"],
    { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore", detached: process.platform !== "win32" });
  const browsers: Browser[] = [];
  const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
  const mails = () => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to?: string; subject?: string }); } catch { return []; } };
  const waitCode = async (to: string, after: number) => {
    for (let i = 0; i < 60; i++) {
      const m = mails().slice(after).reverse().find((x) => x.to === to);
      const c = /^([0-9]{6}) — /.exec(m?.subject ?? "")?.[1];
      if (c) return c;
      await sleep(500);
    }
    return "";
  };
  try {
    for (let i = 0; i < 150; i++) { try { const r = await fetch(`${BASE}/`); if (r.status < 500) break; } catch { /* bekle */ } await sleep(1000); }
    await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = ANY($1::uuid[])`, [[U.owner, U.exp, U.free]]);

    /** Arayüzden parola girişi (bu testte MFA zorunluluğu yok). Ardışık girişler arasında zaman geçişi taklidi YALNIZ sentetik DB'de. */
    const login = async (page: Page, email: string) => {
      await q(`DELETE FROM public.auth_rate_limit_events WHERE bucket LIKE 'login%'`).catch(() => {});
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
    const openSettings = async (page: Page) => {
      await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
      const card = page.getByTestId("email-method-card");
      await card.waitFor({ timeout: 30000 });
      // Kart sunucu yanıtıyla dolana kadar (doğrulama rozeti veya kullanılamaz notu veya gönder düğmesi).
      await page.waitForFunction(() => {
        const c = document.querySelector('[data-testid="email-method-card"]') as HTMLElement | null;
        return !!c && /Doğrulandı|Doğrulanmadı/.test(c.innerText);
      }, null, { timeout: 30000 });
      return card;
    };
    const layout = async (page: Page, tag: string, w: number, ownEmail: string) => {
      const m = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="email-method-card"]') as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        const btns = Array.from(el?.querySelectorAll("button") ?? []).map((b) => (b as HTMLElement).getBoundingClientRect()).filter((b) => b.width > 0);
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: r?.left ?? -1, right: r?.right ?? 99999,
          btnH: btns.map((b) => Math.round(b.height)), btnOut: btns.filter((b) => b.left < -1 || b.right > window.innerWidth + 1).length, text: el?.innerText ?? "" };
      });
      const html = await page.content();
      ok(m.sw <= m.cw + 1, `${tag}: yatay taşma yok (sayfa ${m.sw} ≤ ${m.cw})`, m);
      ok(m.left >= 0 && m.right <= w + 1 && m.btnOut === 0, `${tag}: e-posta kartı ve düğmeleri ekran içinde`, { left: m.left, right: m.right, btnOut: m.btnOut });
      ok(m.btnH.every((h) => h >= 32), `${tag}: kart düğmeleri dokunulabilir yükseklikte (${m.btnH.join(",") || "düğme yok"} px)`, m.btnH);
      ok(!m.text.includes(ownEmail) && !html.includes(PEPPER) && !html.includes("zz-test-service-role"), `${tag}: tam e-posta adresi kartta YOK; pepper / servis anahtarı DOM'da YOK`);
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

        // ── Owner ──
        {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, EMAIL.owner);
          ok(l.status === 200 && l.loggedIn, `${tag}: Owner parola girişi`, l);
          const card = await openSettings(page);
          const verified = (await page.getByTestId("email-verified-badge").count()) === 1;
          if (!verified) {
            const send = page.getByTestId("email-verify-send");
            ok(await send.isVisible() && await send.isEnabled() && (await page.getByTestId("email-verify-unavailable").count()) === 0, `${tag}: Owner'da "Doğrulama kodu gönder" görünür ve etkin`);
            const before = mails().length;
            await send.focus();
            await page.keyboard.press("Enter");
            const code = await waitCode(EMAIL.owner, before);
            ok(/^[0-9]{6}$/.test(code), `${tag}: klavyeyle (Enter) gönderildi; kod yalnız Owner'ın sentetik kutusuna geldi`);
            const input = page.getByTestId("email-verify-code");
            await input.waitFor({ timeout: 15000 });
            ok((await input.getAttribute("aria-label")) === "Doğrulama kodu" && (await input.getAttribute("autocomplete")) === "one-time-code", `${tag}: kod alanı etiketli (aria-label, one-time-code)`);
            await input.fill(code === "000000" ? "111111" : "000000");
            await page.getByTestId("email-verify-confirm").click();
            // Next.js sayfa geçiş duyurucusu da role="alert" taşır (boş) → hata öğesi metniyle seçilir.
            const alert = page.locator('[role="alert"]', { hasText: /Kod hatalı/ });
            const shown = await alert.first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
            ok(shown && await alert.first().isVisible(), `${tag}: yanlış kod hatası görünür (role=alert)`,
              await page.locator('[role="alert"]').allInnerTexts().catch(() => []));
            await card.screenshot({ path: path.join(OUT, `${slug}-owner-yanlis-kod.png`) });
            await input.fill(code);
            await page.getByTestId("email-verify-confirm").click();
            await page.getByTestId("email-verified-badge").waitFor({ timeout: 20000 });
            const v = (await q(`SELECT email_verified_at FROM public.users WHERE id = $1`, [U.owner])).rows[0].email_verified_at;
            ok(v !== null, `${tag}: Owner e-postası arayüzden doğrulandı (rozet + DB)`);
          } else {
            ok(true, `${tag}: Owner e-postası doğrulanmış görünüyor (rozet)`);
          }
          await layout(page, `${tag} Owner`, w, EMAIL.owner);
          await card.screenshot({ path: path.join(OUT, `${slug}-owner-eposta.png`) });
          const change = page.getByTestId("email-change-card");
          await change.locator("summary").click();
          await page.getByTestId("email-change-new").waitFor({ timeout: 15000 });
          ok((await page.getByTestId("email-change-unavailable").count()) === 0 && await page.getByTestId("email-change-new").isVisible(), `${tag}: Owner'da adres değişikliği formu açık`);
          const sw = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
          ok(sw, `${tag}: adres değişikliği kartı açıkken taşma yok`);
          await change.screenshot({ path: path.join(OUT, `${slug}-owner-adres-degisikligi.png`) });

          if (w === 390 || w === 1280) {
            await page.goto(`${BASE}/admin/eposta-durumu`, { waitUntil: "domcontentloaded" });
            const sc = page.getByTestId("email-self-service-scope");
            await sc.waitFor({ timeout: 30000 });
            const t = await sc.innerText();
            const st = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
            ok(/yalnız Owner/.test(t) && /varsayılan/.test(t) && st, `${tag}: Owner e-posta durumu kapsamı gösterir ("${t.trim()}"), taşma yok`);
            ok(!(await page.content()).includes(PEPPER), `${tag}: durum ekranında pepper YOK`);
            // Kayıtlı test hesabı: maskeli alıcı, onay kutusu işaretlenmeden düğme KAPALI, ileti yalnız test hesabına (kodsuz).
            const box = page.getByTestId("email-test-account");
            await box.waitFor({ timeout: 15000 });
            const masked = await page.getByTestId("email-test-account-masked").innerText();
            const sendBtn = page.getByTestId("email-test-account-send");
            ok(masked.includes("*") && !masked.includes(EMAIL.exp) && !(await page.content()).includes(EMAIL.exp) && await sendBtn.isDisabled(),
              `${tag}: test hesabı alıcısı maskeli ("${masked}"), tam adres DOM'da yok, onaysız düğme kapalı`);
            await page.getByTestId("email-test-account-confirm").check();
            ok(await sendBtn.isEnabled(), `${tag}: onay kutusu işaretlenince düğme açılır`);
            const beforeT = mails().length;
            await sendBtn.click();
            await page.getByText(/kayıtlı test hesabının adresine gönderildi/).waitFor({ timeout: 20000 });
            const got = mails().slice(beforeT);
            ok(got.length === 1 && got[0].to === EMAIL.exp && !/^[0-9]{6} — /.test(got[0].subject ?? ""), `${tag}: tek kodsuz ileti yalnız kayıtlı test hesabına gitti`, got.map((x) => x.to));
            await box.screenshot({ path: path.join(OUT, `${slug}-owner-test-hesabi.png`) });
            await page.screenshot({ path: path.join(OUT, `${slug}-owner-eposta-durumu.png`), fullPage: true });
          }
          await ctx.close();
        }

        // ── Pilot uzman (yalnız adres doğrulaması) ──
        {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, EMAIL.free);
          ok(l.status === 200 && l.loggedIn, `${tag}: pilot uzman parola girişi`, l);
          const card = await openSettings(page);
          if ((await page.getByTestId("email-verified-badge").count()) === 0) {
            const send = page.getByTestId("email-verify-send");
            ok(await send.isVisible() && await send.isEnabled(), `${tag}: pilotta "Doğrulama kodu gönder" açık`);
            const before = mails().length;
            await send.click();
            const code = await waitCode(EMAIL.free, before);
            ok(/^[0-9]{6}$/.test(code) && mails().slice(before).every((m) => m.to === EMAIL.free), `${tag}: kod yalnız pilotun kayıtlı adresine`);
            await page.getByTestId("email-verify-code").fill(code);
            await page.getByTestId("email-verify-confirm").click();
            await page.getByTestId("email-verified-badge").waitFor({ timeout: 20000 });
            const v = (await q(`SELECT email_verified_at, mfa_required FROM public.users WHERE id = $1`, [U.free])).rows[0];
            ok(v.email_verified_at !== null && v.mfa_required === false, `${tag}: pilot adresi doğrulandı; MFA zorunluluğu açılmadı`);
          } else {
            ok(true, `${tag}: pilot adresi doğrulanmış görünüyor (rozet)`);
          }
          const change = page.getByTestId("email-change-card");
          await change.locator("summary").click();
          await page.getByTestId("email-change-unavailable").waitFor({ timeout: 15000 });
          ok((await page.getByTestId("email-change-new").count()) === 0, `${tag}: pilotta adres DEĞİŞTİRME formu yok (pilot yalnız doğrulama)`);
          await layout(page, `${tag} pilot`, w, EMAIL.free);
          await card.screenshot({ path: path.join(OUT, `${slug}-pilot-eposta.png`) });
          await ctx.close();
        }

        // ── Uzman (kapsam dışı) ──
        {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "tr-TR" });
          const page = await ctx.newPage();
          const l = await login(page, EMAIL.exp);
          ok(l.status === 200 && l.loggedIn, `${tag}: uzman parola girişi (davranış değişmedi)`, l);
          const before = mails().length;
          const card = await openSettings(page);
          await page.getByTestId("email-verify-unavailable").waitFor({ timeout: 15000 });
          ok((await page.getByTestId("email-verify-send").count()) === 0, `${tag}: uzmanda "kod gönder" düğmesi YOK, "kullanılamıyor" notu var`);
          const change = page.getByTestId("email-change-card");
          await change.locator("summary").click();
          await page.getByTestId("email-change-unavailable").waitFor({ timeout: 15000 });
          ok((await page.getByTestId("email-change-new").count()) === 0 && (await page.getByTestId("email-change-start").count()) === 0, `${tag}: uzmanda adres değişikliği formu YOK, bilgi notu var`);
          await layout(page, `${tag} uzman`, w, EMAIL.exp);
          // Sunucu denetimi tarayıcıdan da: uzman oturumuyla doğrudan istek → 403, ileti yok.
          const r = await page.evaluate(async (uid) => {
            const res = await fetch("/api/me/email-verification", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": uid }, body: JSON.stringify({ action: "send" }) });
            return { status: res.status, body: await res.json().catch(() => ({})) as { code?: string } };
          }, U.exp);
          ok(r.status === 403 && r.body.code === "METHOD_NOT_IN_SCOPE" && mails().length === before, `${tag}: arayüz atlanıp doğrudan istek → 403; uzmana ileti GİTMEDİ`, r);
          const owner = await page.evaluate(async (uid) => {
            const res = await fetch("/api/me/email-verification", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": uid }, body: JSON.stringify({ action: "send" }) });
            return res.status;
          }, U.owner);
          ok((owner === 401 || owner === 403) && mails().length === before, `${tag}: uzman oturumuyla Owner kimliği → reddedildi`, owner);
          await card.screenshot({ path: path.join(OUT, `${slug}-uzman-eposta.png`) });
          await change.screenshot({ path: path.join(OUT, `${slug}-uzman-adres-degisikligi.png`) });
          await ctx.close();
        }
      }
    }
    // Uzmana giden tek tür: Owner'ın gönderdiği KODSUZ test iletisi (kayıtlı test hesabı). Uzmanın kendi e-posta işlemleri kapalı.
    ok(mails().every((m) => m.to === EMAIL.owner || m.to === EMAIL.free || (m.to === EMAIL.exp && !/^[0-9]{6} — /.test(m.subject ?? ""))),
      "kodlu iletiler YALNIZ Owner'a ve pilota; kapsam dışı uzmana yalnız Owner'ın kodsuz test iletisi", [...new Set(mails().map((m) => m.to))]);
  } finally {
    const nt = notTested.length ? ` · NOT TESTED: ${notTested.join(", ")}` : "";
    console.log(`\nf3-eposta-kapsam-ui: ${pass} PASS, ${fail} FAIL${nt}`);
    if (failures.length) console.log("FAIL:\n - " + failures.join("\n - "));
    for (const b of browsers) await b.close().catch(() => {});
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    else try { process.kill(-(app.pid ?? 0), "SIGTERM"); } catch { /* yok */ }
    proxy.close();
    try { fs.rmSync(SINK, { force: true }); } catch { /* kanıta kod içeren dosya bırakılmaz */ }
    await db.close();
  }
  if (fail) process.exit(1);
  if (MIN_PASS && pass < MIN_PASS) { console.log(`FAIL: asgari PASS ${MIN_PASS}, gözlenen ${pass} (eksik / atlanan test)`); process.exit(1); }
  if (REQUIRE_EDGE && notTested.length) { console.log("NOT TESTED (altyapı) — gerçek FAIL değil"); process.exit(3); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); console.log(`\nf3-eposta-kapsam-ui: ${pass} PASS, ${fail + 1} FAIL`); process.exit(1); });
