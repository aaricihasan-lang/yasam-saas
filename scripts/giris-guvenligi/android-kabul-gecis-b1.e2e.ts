/**
 * HTTPONLY ANDROID GEÇİŞİ — B-1 KABUL TESTİ (EMÜLASYON: Chromium + resmî uygulama UA + X-Requested-With; fiziksel cihaz DEĞİL).
 * Gerçek uygulama (next start) + gerçek istemci JS'i + android-kabul-ortami.ts (127.0.0.1:3999 kontrol ucu).
 *
 * Başarı ölçütü: header → cookie geçişinden sonra GEÇİŞ KAYNAKLI 401 = 0 (tekrarlı + eşzamanlı sekmeler).
 * Gerçek 401 gizlenmemeli (iptal edilmiş oturum → 401 + giriş ekranı), ağ / sunucu hatasında uygulama kilitlenmemeli,
 * Android header kipi ve normal web çerez kullanıcısı değişmemeli.
 * Çalıştır: PLAYWRIGHT_REQUIRE=<playwright paketi> TEKRAR=10 npx tsx scripts/giris-guvenligi/android-kabul-gecis-b1.e2e.ts <kanıt-dizini>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { BrowserContext, Page } from "playwright";

const CTRL = process.env.KABUL_CTRL ?? "http://127.0.0.1:3999";
const APEX = "https://yasamsistemi.com";
const WWW = "https://www.yasamsistemi.com";
const APP_UA = "Mozilla/5.0 (Linux; Android 10; Pixel 3 Build/QQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";
const WEB_UA = "Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ctrl = async (p: string, method = "GET") => (await fetch(`${CTRL}${p}`, { method })).json();
let pass = 0; let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 260)}` : ""}`); };

type Ev = { t: number; s: number; p: string; hdr: boolean };

async function main() {
  const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
  const N = Number(process.env.TEKRAR ?? 10);
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium } = req2("playwright") as typeof import("playwright");
  const launch = (app: boolean, dir?: string) => chromium.launchPersistentContext(dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "b1-")), {
    ignoreHTTPSErrors: true, userAgent: app ? APP_UA : WEB_UA, locale: "tr-TR", viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true,
    ...(app ? { extraHTTPHeaders: { "X-Requested-With": "com.yasamsistemi.app" } } : {}),
    args: ["--host-resolver-rules=MAP www.yasamsistemi.com 127.0.0.1, MAP yasamsistemi.com 127.0.0.1"],
  });
  const logged = (p: Page, ms = 25000) => p.getByRole("button", { name: "Çıkış Yap", exact: true }).first().waitFor({ timeout: ms }).then(() => true).catch(() => false);
  const login = async (p: Page) => {
    await p.goto(APEX, { waitUntil: "domcontentloaded" });
    await p.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
    await p.locator("#login-email").fill("free@test.local");
    await p.locator("#login-password").fill("parola-free");
    await p.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
    return logged(p);
  };
  const record = (ctx: BrowserContext, t0: () => number) => {
    const ev: Ev[] = [];
    ctx.on("response", (r) => { if (/\/api\//.test(r.url())) ev.push({ t: Date.now() - t0(), s: r.status(), p: new URL(r.url()).pathname, hdr: !!r.request().headers()["x-session-token"] }); });
    return ev;
  };
  /**
   * Hazırlık (gerçek Android sırası): header kipinde giriş → uygulama KAPANIR → bayrak açılır (cookie) → uygulama AYNI
   * profille yeniden açılır (sayfa henüz yüklenmeden; senaryo kendi yüklemesini yapar). Açık sayfa bırakılırsa arka plan
   * oturum denetimi sunucunun "bootstrap" ipucuyla taşımayı yenilemesiz yapar (H2 tasarımı) — o yol ayrıca ölçülür.
   */
  const prepareLegacy = async () => {
    await ctrl("/iptal?kanal=android_app", "POST");
    await ctrl("/kip?android=header&killswitch=off", "POST");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b1-"));
    const c0 = await launch(true, dir);
    const p0 = c0.pages()[0] ?? await c0.newPage();
    const okLogin = await login(p0);
    const tok = await p0.evaluate(() => localStorage.getItem("yasam_session_token"));
    await sleep(1500);
    await c0.close();
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    const ctx = await launch(true, dir);
    const page = ctx.pages()[0] ?? await ctx.newPage();
    return { ctx, page, okLogin, tok };
  };
  /** Senaryonun ilk yüklemesi (uygulamanın açılış adresi). */
  const openApp = (p: Page) => p.goto(APEX, { waitUntil: "domcontentloaded" });
  const uid = (p: Page) => p.evaluate(() => { try { return (JSON.parse(localStorage.getItem("yasam_user") ?? "{}") as { id?: string }).id ?? ""; } catch { return ""; } });
  const rows: unknown[] = [];

  console.log(`\n── (a) İlk açılış, ${N} tekrar ──`);
  for (let n = 1; n <= N; n++) {
    const { ctx, page, okLogin, tok } = await prepareLegacy();
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await openApp(page);
    const stillIn = await logged(page);
    await sleep(6000);
    const u401 = ev.filter((e) => e.s === 401);
    const left = await page.evaluate(() => localStorage.getItem("yasam_session_token"));
    const sid = (await ctx.cookies(WWW)).some((c) => c.name === "__Host-yasam_sid" && c.httpOnly);
    const firstPanel = ev.find((e) => e.p !== "/api/auth/session/cookie" && e.p !== "/api/auth/session");
    const boot = ev.find((e) => e.p === "/api/auth/session/cookie");
    rows.push({ senaryo: "a", n, okLogin, tokenVardi: !!tok, oturumAcik: stillIn, ilk401: u401.length, tokenSilindi: left === null, cerez: sid, bootMs: boot?.t, ilkPanelMs: firstPanel?.t });
    ok(okLogin && !!tok && stillIn && u401.length === 0 && left === null && sid,
      `(a${n}) geçiş: oturum açık, geçiş kaynaklı 401 = ${u401.length}, token silindi, HttpOnly çerez (bootstrap ${boot?.t} ms, ilk panel yanıtı ${firstPanel?.t} ms)`, u401.map((e) => `${e.t}ms ${e.p}`));
    if (n === 1) await page.screenshot({ path: path.join(OUT, "b1-a1-ilk-acilis.png") });
    await ctx.close();
  }

  console.log("\n── (b) Eşzamanlı 3 sekme (aynı WebView profili) ──");
  {
    const { ctx, page } = await prepareLegacy();
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    const p2 = await ctx.newPage(); const p3 = await ctx.newPage();
    await Promise.all([openApp(page), p2.goto(WWW, { waitUntil: "domcontentloaded" }), p3.goto(`${WWW}/`, { waitUntil: "domcontentloaded" })]);
    const all = await Promise.all([logged(page), logged(p2), logged(p3)]);
    await sleep(6000);
    const u401 = ev.filter((e) => e.s === 401);
    const boots = ev.filter((e) => e.p === "/api/auth/session/cookie");
    rows.push({ senaryo: "b", oturumAcik: all, ilk401: u401.length, bootstrapSayisi: boots.length });
    ok(all.every(Boolean) && u401.length === 0, `(b) 3 sekme aynı anda: hepsi oturumlu, geçiş kaynaklı 401 = ${u401.length} (bootstrap isteği ${boots.length})`, u401.map((e) => `${e.t}ms ${e.p}`));
    await ctx.close();
  }

  for (const [label, mode] of [["(c) Ağ kesintisi (bootstrap isteği düşer)", "abort"], ["(d) Geçici sunucu hatası (bootstrap 503)", "503"]] as const) {
    console.log(`\n── ${label} ──`);
    const { ctx, page } = await prepareLegacy();
    await ctx.route("**/api/auth/session/cookie", (r) => (mode === "abort" ? r.abort("internetdisconnected") : r.fulfill({ status: 503, body: "{}" })));
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await openApp(page);
    await sleep(7000);
    const firstPanel = ev.find((e) => e.p !== "/api/auth/session/cookie" && e.p !== "/api/auth/session");
    const tokenKept = await page.evaluate(() => localStorage.getItem("yasam_session_token"));
    ok(!!firstPanel && firstPanel.t <= 4000 + 1500, `${label}: kapı sınırlı süre sonra açıldı, uygulama kilitlenmedi (ilk panel yanıtı ${firstPanel?.t} ms ≤ ~4 sn)`);
    ok(typeof tokenKept === "string", `${label}: eski token KORUNDU (sessiz çıkış yok; sonraki açılışta yeniden denenir)`);
    await ctx.unroute("**/api/auth/session/cookie");
    ev.length = 0; t0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    const stillIn = await logged(page);
    await sleep(6000);
    const u401 = ev.filter((e) => e.s === 401);
    const left = await page.evaluate(() => localStorage.getItem("yasam_session_token"));
    rows.push({ senaryo: mode, kapiMs: firstPanel?.t, tokenKorundu: !!tokenKept, toparlanma401: u401.length, tokenSilindi: left === null, oturumAcik: stillIn });
    ok(stillIn && u401.length === 0 && left === null, `${label}: ağ/sunucu düzelince sonraki açılış geçişi tamamladı (401 = ${u401.length})`, u401.map((e) => e.p));
    await ctx.close();
  }

  console.log("\n── (e) Geçersiz (iptal edilmiş) oturum: 401 GİZLENMEZ ──");
  {
    const { ctx, page } = await prepareLegacy();
    await ctrl("/iptal?kanal=android_app", "POST");
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await openApp(page);
    let out = false; const s0 = Date.now();
    while (!out && Date.now() - s0 < 70_000) { await sleep(1000); out = await page.locator("#login-email").isVisible().catch(() => false) || !(await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().isVisible().catch(() => false)); }
    const sid = (await ctx.cookies(WWW)).some((c) => c.name === "__Host-yasam_sid");
    const boot = ev.find((e) => e.p === "/api/auth/session/cookie");
    rows.push({ senaryo: "e", bootstrap: boot?.s, cerez: sid, girisEkrani: out, sn: Math.round((Date.now() - s0) / 1000) });
    ok(boot?.s === 401 && !sid, `(e) iptal edilmiş oturum çereze ÇEVRİLMEDİ (bootstrap ${boot?.s}), çerez YOK`);
    ok(out, `(e) kullanıcı giriş ekranına döndü (${Math.round((Date.now() - s0) / 1000)} sn) — 401 gizlenmedi`);
    await ctx.close();
  }

  console.log("\n── (h) Çerez tarayıcı tarafından REDDEDİLİRSE (Set-Cookie düşer): yanlış başarı yok ──");
  {
    const { ctx, page } = await prepareLegacy();
    await ctx.route("**/api/auth/session/cookie", async (r) => {
      const resp = await r.fetch();
      const headers = { ...resp.headers() }; delete headers["set-cookie"];
      await r.fulfill({ status: resp.status(), headers, body: await resp.body() });
    });
    await openApp(page);
    let out = false; const s0 = Date.now();
    while (!out && Date.now() - s0 < 70_000) { await sleep(1000); out = await page.locator("#login-email").isVisible().catch(() => false) || !(await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().isVisible().catch(() => false)); }
    const who = await uid(page);
    const prof = await page.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: u ? { "x-user-id": u } : {} })).status, who || "00000000-0000-0000-0000-00000000e001");
    const sid = (await ctx.cookies(WWW)).some((c) => c.name === "__Host-yasam_sid");
    rows.push({ senaryo: "h", girisEkrani: out, sn: Math.round((Date.now() - s0) / 1000), profil: prof, cerez: sid });
    ok(!sid && prof === 401, "(h) çerez saklanamadı → korumalı uç 401 (yetki gevşemedi)", { prof, sid });
    ok(out, `(h) kullanıcı yanlış 'oturum açık' durumunda kalmadı → giriş ekranı (${Math.round((Date.now() - s0) / 1000)} sn)`);
    await ctx.close();
  }

  for (const [label, delay] of [["(i) Yavaş ağ: taşıma 2 sn", 2000], ["(j) Çok yavaş ağ: taşıma 6 sn (> 4 sn tavan)", 6000]] as const) {
    console.log(`\n── ${label} ──`);
    const { ctx, page } = await prepareLegacy();
    await ctx.route("**/api/auth/session/cookie", async (r) => { await sleep(delay); await r.continue(); });
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await openApp(page);
    const stillIn = await logged(page);
    await sleep(delay + 6000);
    const u401 = ev.filter((e) => e.s === 401 && e.p !== "/api/auth/session/cookie");
    const firstPanel = ev.find((e) => !e.p.startsWith("/api/auth/session"));
    const left = await page.evaluate(() => localStorage.getItem("yasam_session_token"));
    const sid = (await ctx.cookies(WWW)).some((c) => c.name === "__Host-yasam_sid");
    const stillIn2 = await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().isVisible().catch(() => false);
    await ctx.unroute("**/api/auth/session/cookie");
    ev.length = 0; t0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    const after = await logged(page);
    await sleep(5000);
    const after401 = ev.filter((e) => e.s === 401).length;
    rows.push({ senaryo: delay === 2000 ? "i" : "j", gecikme: delay, ilkPanelMs: firstPanel?.t, gecis401: u401.length, cerez: sid, tokenSilindi: left === null, oturumAcik: stillIn && stillIn2, sonrakiYukleme401: after401 });
    if (delay < 4000) {
      ok(stillIn && u401.length === 0 && sid && left === null, `${label}: istekler bekledi, geçiş kaynaklı 401 = ${u401.length} (ilk panel ${firstPanel?.t} ms)`, u401.map((e) => e.p));
    } else {
      ok((firstPanel?.t ?? 1e9) < 4000 + 1500, `${label}: kapı ~4 sn'de açıldı, uygulama kilitlenmedi (ilk panel ${firstPanel?.t} ms)`);
      console.log(`  bilgi (beklenen sınır): tavan aşıldığında bu açılışta ${u401.length} gerçek 401 (oturum çerezi henüz yok) — gizlenmedi`);
      ok(stillIn2 && sid && left === null, `${label}: taşıma geç de olsa tamamlandı, kullanıcı çıkışa DÜŞMEDİ`, { stillIn2, sid, left: left === null });
    }
    ok(after && after401 === 0, `${label}: sonraki açılış 401 = ${after401}`);
    await ctx.close();
  }

  console.log("\n── (k) 5 eşzamanlı sekme × 3 tur ──");
  for (let round = 1; round <= 3; round++) {
    const { ctx, page } = await prepareLegacy();
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    const pages = [page, ...(await Promise.all([1, 2, 3, 4].map(() => ctx.newPage())))];
    await Promise.all(pages.map((p, i) => (i === 0 ? openApp(p) : p.goto(WWW, { waitUntil: "domcontentloaded" }))));
    const all = await Promise.all(pages.map((p) => logged(p)));
    await sleep(6000);
    const u401 = ev.filter((e) => e.s === 401);
    rows.push({ senaryo: "k", tur: round, oturumAcik: all, ilk401: u401.length });
    ok(all.every(Boolean) && u401.length === 0, `(k${round}) 5 sekme: hepsi oturumlu, geçiş kaynaklı 401 = ${u401.length}`, u401.map((e) => `${e.t}ms ${e.p}`));
    await ctx.close();
  }

  console.log("\n── (l) Taşımadan sonra tarayıcı / WebView yeniden açılır ──");
  {
    await ctrl("/iptal?kanal=android_app", "POST");
    await ctrl("/kip?android=header&killswitch=off", "POST");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b1-restart-"));
    const mk = () => chromium.launchPersistentContext(dir, { ignoreHTTPSErrors: true, userAgent: APP_UA, extraHTTPHeaders: { "X-Requested-With": "com.yasamsistemi.app" }, locale: "tr-TR",
      viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, args: ["--host-resolver-rules=MAP www.yasamsistemi.com 127.0.0.1, MAP yasamsistemi.com 127.0.0.1"] });
    let ctx = await mk(); let page = ctx.pages()[0] ?? await ctx.newPage();
    await login(page);
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    await page.reload({ waitUntil: "domcontentloaded" });
    await logged(page); await sleep(4000);
    await ctx.close();
    ctx = await mk(); page = ctx.pages()[0] ?? await ctx.newPage();
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await page.goto(APEX, { waitUntil: "domcontentloaded" });
    const inn = await logged(page);
    await sleep(4000);
    ok(inn && ev.every((e) => e.s !== 401) && (await page.evaluate(() => localStorage.getItem("yasam_session_token"))) === null,
      "(l) yeniden açılışta oturum sürüyor (kalıcı HttpOnly çerez), 401 yok, JS'te token yok");
    await ctx.close();
  }

  console.log("\n── (m) Taşıma BEKLERKEN anında çıkış ──");
  {
    const { ctx, page } = await prepareLegacy();
    await ctx.route("**/api/auth/session/cookie", async (r) => { await sleep(1500); await r.continue(); });
    await openApp(page);
    await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().waitFor({ timeout: 25000 }).catch(() => {});
    await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().click();
    const d = page.getByRole("dialog");
    await ((await d.count()) ? d.getByRole("button", { name: "Çıkış Yap" }) : page.getByRole("button", { name: "Çıkış Yap" }).last()).click();
    await sleep(5000);
    const sessions = (await ctrl("/oturumlar")) as { email: string; client_channel: string; is_active: boolean }[];
    const active = sessions.filter((x) => x.email === "free@test.local" && x.client_channel === "android_app" && x.is_active).length;
    const prof = await page.evaluate(async () => (await fetch("/api/auth/profile")).status);
    rows.push({ senaryo: "m", aktifAndroidOturum: active, profil: prof });
    ok(active === 0 && prof === 401 && (await page.evaluate(() => localStorage.getItem("yasam_session_token"))) === null,
      "(m) bekleme sırasında çıkış: sunucu oturumu kapandı, korumalı uç 401, JS'te token yok", { active, prof });
    await ctx.close();
  }

  console.log("\n── (n) Uygulama AÇIKKEN bayrak açılır: arka plan denetimi yenilemesiz taşır (H2 ipucu yolu) ──");
  {
    await ctrl("/iptal?kanal=android_app", "POST");
    await ctrl("/kip?android=header&killswitch=off", "POST");
    const ctx = await launch(true); const page = ctx.pages()[0] ?? await ctx.newPage();
    await login(page);
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    let sid = false;
    for (let i = 0; i < 90 && !sid; i++) { await sleep(1000); sid = (await ctx.cookies(WWW)).some((c) => c.name === "__Host-yasam_sid" && c.httpOnly); }
    const u401a = ev.filter((e) => e.s === 401).length;
    ev.length = 0;
    await page.reload({ waitUntil: "domcontentloaded" });
    const inn = await logged(page);
    let left: string | null = "x";
    for (let i = 0; i < 20 && left !== null; i++) { await sleep(500); left = await page.evaluate(() => localStorage.getItem("yasam_session_token")); }
    await sleep(4000);
    const u401b = ev.filter((e) => e.s === 401).length;
    rows.push({ senaryo: "n", cerezYazildi: sid, sn: Math.round((Date.now() - t0) / 1000), oncesi401: u401a, sonrasi401: u401b, tokenSilindi: left === null });
    ok(sid && u401a === 0 && inn && left === null && u401b === 0, `(n) açık uygulamada arka plan taşıma: çerez yazıldı (${Math.round((Date.now() - t0) / 1000)} sn), 401 yok (${u401a}/${u401b}), yenilemede token silindi`);
    await ctx.close();
  }

  console.log("\n── (f) Android HEADER kipi değişmedi (bayrak kapalı) ──");
  {
    await ctrl("/iptal?kanal=android_app", "POST");
    await ctrl("/kip?android=header&killswitch=off", "POST");
    const ctx = await launch(true); const page = ctx.pages()[0] ?? await ctx.newPage();
    await login(page);
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    const stillIn = await logged(page);
    await sleep(5000);
    const panel = ev.filter((e) => /\/api\/(clients|dashboard|trial|auth\/profile)/.test(e.p));
    const attr = await page.evaluate(() => ({ t: document.documentElement.getAttribute("data-session-transport"), a: document.documentElement.hasAttribute("data-android-token") }));
    ok(stillIn && attr.t === "header" && attr.a && panel.length > 0 && panel.every((e) => e.hdr) && ev.every((e) => e.s !== 401) && !ev.some((e) => e.p === "/api/auth/session/cookie"),
      "(f) header kipi: token başlığıyla istek, 401 yok, bootstrap yok, çerez yolu devreye girmedi", { attr, n: panel.length });
    await ctx.close();
  }

  console.log("\n── (g) Normal web çerez kullanıcısı (Android değil) — gecikme / 401 yok ──");
  {
    const ctx = await launch(false); const page = ctx.pages()[0] ?? await ctx.newPage();
    await login(page);
    let t0 = 0; const ev = record(ctx, () => t0); t0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    const stillIn = await logged(page);
    await sleep(5000);
    const firstPanel = ev.find((e) => e.p !== "/api/auth/session");
    ok(stillIn && ev.every((e) => e.s !== 401) && !ev.some((e) => e.p === "/api/auth/session/cookie") && (await page.evaluate(() => localStorage.getItem("yasam_session_token"))) === null,
      `(g) web çerez oturumu: 401 yok, bootstrap yok, token yok (ilk panel yanıtı ${firstPanel?.t} ms)`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, "b1-olcum.json"), JSON.stringify(rows, null, 2));
  console.log(`\nandroid-kabul-gecis-b1: ${pass} PASS, ${fail} FAIL (EMÜLASYON — fiziksel cihaz kabulü DEĞİLDİR)`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
