/**
 * ANDROID KABUL ORTAMI — DUMAN TESTİ (EMÜLASYON: Chromium + resmî uygulama UA + X-Requested-With). FİZİKSEL CİHAZ DEĞİLDİR.
 * Amaç: android-kabul-ortami.ts'in fiziksel cihaz / emülatör kabulüne hazır olduğunu, gerçek uygulama arayüzü ve gerçek
 * istemci JS'iyle uçtan uca göstermek. Ortamın ÇALIŞIR durumda olması gerekir (kontrol ucu 127.0.0.1:3999).
 * Çalıştır: PLAYWRIGHT_REQUIRE=<playwright paketi> npx tsx scripts/giris-guvenligi/android-kabul-duman.e2e.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { BrowserContext, Page } from "playwright";

const CTRL = process.env.KABUL_CTRL ?? "http://127.0.0.1:3999";
const APEX = "https://yasamsistemi.com"; // uygulamanın açılış adresi (MainActivity.baseUrl)
const WWW = "https://www.yasamsistemi.com";
const UA = "Mozilla/5.0 (Linux; Android 10; Pixel 3 Build/QQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";
let pass = 0; let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 300)}`}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ctrl = async (p: string, method = "GET") => (await fetch(`${CTRL}${p}`, { method })).json() as Promise<unknown>;

async function main() {
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium } = req2("playwright") as typeof import("playwright");
  const st = await ctrl("/durum") as { hesaplar: { uzman: string; uzmanMfa: string } };
  const SINK = process.env.KABUL_SINK ?? "";
  const ctx: BrowserContext = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "android-kabul-")), {
    ignoreHTTPSErrors: true, userAgent: UA, extraHTTPHeaders: { "X-Requested-With": "com.yasamsistemi.app" }, locale: "tr-TR",
    viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true,
    args: ["--host-resolver-rules=MAP www.yasamsistemi.com 127.0.0.1, MAP yasamsistemi.com 127.0.0.1"],
  });
  const page: Page = ctx.pages()[0] ?? await ctx.newPage();
  const fails: string[] = [];
  ctx.on("response", (r) => { if (/\/api\//.test(r.url()) && (r.status() === 401 || r.status() >= 500)) fails.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const sid = async () => (await ctx.cookies(WWW)).find((c) => c.name === "__Host-yasam_sid");
  const ls = () => page.evaluate(() => localStorage.getItem("yasam_session_token"));
  const attrs = () => page.evaluate(() => ({ t: document.documentElement.getAttribute("data-session-transport"), a: document.documentElement.hasAttribute("data-android-token"), doc: document.cookie }));
  const logged = () => page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
  const login = async (email: string, password: string) => {
    await page.goto(APEX, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
  };
  const logout = async () => {
    await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().click();
    const d = page.getByRole("dialog");
    await ((await d.count()) ? d.getByRole("button", { name: "Çıkış Yap" }) : page.getByRole("button", { name: "Çıkış Yap" }).last()).click();
    await sleep(1500);
  };
  try {
    console.log("\n── 1) Bugünkü kip (header) — mevcut uygulama davranışı ──");
    await ctrl("/kip?android=header&killswitch=off", "POST");
    await login(st.hesaplar.uzman, "parola-free");
    ok(await logged(), "apex açılış → www → giriş → panel");
    ok(page.url().startsWith(WWW), "apex → www yönlendirmesi izlendi", page.url());
    let a = await attrs();
    ok(a.t === "header" && a.a, "SSR: header taşıması + data-android-token (resmî uygulama)", a);
    ok(typeof (await ls()) === "string" && !(await sid()), "token WebView localStorage'da, çerez YOK (bugünkü durum)");

    console.log("\n── 2) Owner bayrağı açar: ANDROID_APP_SESSION_TRANSPORT=cookie (çıkış yaptırmadan geçiş) ──");
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    fails.length = 0;
    await page.reload({ waitUntil: "domcontentloaded" });
    ok(await logged(), "yenileme → oturum AÇIK (çıkışa düşmedi)");
    let left: string | null = "x";
    for (let i = 0; i < 30 && left !== null; i++) { await sleep(500); left = await ls(); }
    a = await attrs();
    const c = await sid();
    ok(left === null, "eski localStorage token'ı çerez doğrulandıktan sonra SİLİNDİ");
    ok(!!c && c.httpOnly && c.secure && c.sameSite === "Strict", "HttpOnly + Secure + SameSite=Strict çerez", c && { ...c, value: "<gizli>" });
    ok(a.t === "cookie" && !a.a && !/yasam_sid/.test(a.doc), "SSR: cookie taşıması, data-android-token YOK, JS çerezi göremiyor", a);
    await page.reload({ waitUntil: "domcontentloaded" });
    ok(await logged(), "ikinci yenileme oturumlu");
    ok(fails.length === 0, "geçiş boyunca 401/5xx yok", fails);

    console.log("\n── 3) Çıkış ve yeniden giriş (cookie kipinde) ──");
    await logout();
    ok(!(await sid()) && (await ls()) === null, "çıkış → çerez ve localStorage temiz");
    await login(st.hesaplar.uzman, "parola-free");
    ok(await logged(), "yeniden giriş → panel");
    ok(!!(await sid()) && (await ls()) === null, "yeniden giriş: yalnız HttpOnly çerez, JS'te anahtar YOK");

    console.log("\n── 4) Başka cihazdan iptal ──");
    await ctrl("/iptal?kanal=android_app", "POST");
    await page.reload({ waitUntil: "domcontentloaded" });
    // Ürün tasarımı (useSessionGuard): ilk denetim 5 sn, iki kesin "geçersiz" yanıtla çıkış; en geç ~60 sn.
    const t0 = Date.now();
    let out = false;
    while (!out && Date.now() - t0 < 70_000) {
      await sleep(1000);
      out = await page.locator("#login-email").isVisible().catch(() => false)
        || !(await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().isVisible().catch(() => false));
    }
    ok(out, `iptal edilen cihaz giriş ekranına düştü (${Math.round((Date.now() - t0) / 1000)} sn; tasarım ≤ 60 sn)`);
    const pr = await page.evaluate(async () => (await fetch("/api/auth/profile")).status);
    ok(pr === 401, "iptal sonrası korumalı uç 401 (veri sızmaz)", pr);

    console.log("\n── 5) Eski SÜRESİZ Android oturumu (F2-A öncesi) ──");
    await ctx.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await ctrl("/kip?android=header&killswitch=off", "POST");
    await login(st.hesaplar.uzman, "parola-free");
    ok(await logged() && typeof (await ls()) === "string", "header kipinde giriş (token localStorage'da)");
    const es = await ctrl("/eski-suresiz", "POST");
    console.log(`  bilgi: ${JSON.stringify(es)}`);
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    await page.reload({ waitUntil: "domcontentloaded" });
    ok(await logged(), "süresiz oturum: geçişte çıkışa düşmedi");
    left = "x";
    for (let i = 0; i < 30 && left !== null; i++) { await sleep(500); left = await ls(); }
    const c2 = await sid();
    const days = c2 ? Math.round((c2.expires - Date.now() / 1000) / 86400) : -1;
    ok(left === null && !!c2 && days >= 29 && days <= 30, `süresiz oturum çereze taşındı; çerez ömrü ≈ ${days} gün (tavan 30)`);

    console.log("\n── 6) E-posta doğrulama kodu ile MFA (cookie kipinde) ──");
    await logout();
    if (SINK) {
      const before = (() => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).length; } catch { return 0; } })();
      await login(st.hesaplar.uzmanMfa, "parola-f2a-exp");
      await page.getByTestId("mfa-email-panel").waitFor({ timeout: 20000 }).catch(() => {});
      ok(!(await sid()), "MFA bekleyen girişte oturum çerezi YOK");
      await page.getByTestId("mfa-email-send").click().catch(() => {});
      let code = "";
      for (let i = 0; i < 60 && !code; i++) {
        await sleep(500);
        try { const l = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).slice(before); code = /\b([0-9]{6})\b/.exec((JSON.parse(l[l.length - 1] ?? "{}") as { subject?: string; text?: string }).text ?? "")?.[1] ?? ""; } catch { /* */ }
      }
      ok(code.length === 6, "sentetik e-posta kodu üretildi");
      await page.getByTestId("mfa-email-code").fill(code);
      await page.getByTestId("mfa-email-verify").click();
      ok(await logged(), "kod doğrulandı → panel");
      ok(!!(await sid()) && (await ls()) === null, "MFA sonrası yalnız HttpOnly çerez, JS'te anahtar YOK");
    } else {
      console.log("  NOT TESTED: KABUL_SINK verilmedi");
    }
  } finally {
    await ctx.close();
  }
  console.log(`\nandroid-kabul-duman: ${pass} PASS, ${fail} FAIL (EMÜLASYON — fiziksel cihaz kabulü DEĞİLDİR)`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
