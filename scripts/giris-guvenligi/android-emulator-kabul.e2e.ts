/**
 * ANDROID EMÜLATÖR KABULÜ — gerçek Android 2.0.0 DEBUG APK'sı + gerçek Android System WebView + android-kabul-ortami.ts.
 * Sonuçlar EMULATOR PASS / FAIL / NOT TESTED'dir; FİZİKSEL CİHAZ KABULÜ DEĞİLDİR. Play 1.9.1 ikilisini TEST ETMEZ.
 *
 * Ön koşul: emülatör `-dns-server 127.0.0.1` ile açık (kabul ortamı KABUL_DNS=1 KABUL_DNS_BIND=127.0.0.1 KABUL_DNS_IP=10.0.2.2),
 *           debug APK (test CA'sı yalnız yasamsistemi.com için) kurulu veya APK yolu verilmiş.
 * WebView: debug (debuggable) uygulamada uzaktan hata ayıklama açıktır → adb forward + CDP (Playwright connectOverCDP).
 * Çalıştır: ADB=<adb.exe> APK=<app-debug.apk> KABUL_CTRL=http://127.0.0.1:4999 KABUL_SINK=<sentetik-eposta.jsonl>
 *           PLAYWRIGHT_REQUIRE=<pkg> npx tsx scripts/giris-guvenligi/android-emulator-kabul.e2e.ts <etiket> <kanıt-dizini>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Browser, Page } from "playwright";

const ADB = process.env.ADB ?? "adb";
const CTRL = process.env.KABUL_CTRL ?? "http://127.0.0.1:3999";
const SINK = process.env.KABUL_SINK ?? "";
const PKG = "com.yasamsistemi.app";
const WWW = "https://www.yasamsistemi.com";
const CDP_PORT = Number(process.env.CDP_PORT ?? 9333);
const LABEL = process.argv[2] ?? "emulator";
const OUT = process.argv[3] ?? ".";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: { madde: string; sonuc: "EMULATOR PASS" | "FAIL" | "NOT TESTED"; not?: string }[] = [];
const rec = (madde: string, ok: boolean | null, not?: string) => {
  const sonuc = ok === null ? "NOT TESTED" : ok ? "EMULATOR PASS" : "FAIL";
  results.push({ madde, sonuc, ...(not ? { not } : {}) });
  console.log(`  ${sonuc.padEnd(13)} ${madde}${not ? ` — ${not}` : ""}`);
};
const adb = (...a: string[]) => execFileSync(ADB, a, { encoding: "utf8", timeout: 120_000 }).trim();
const ctrl = async (p: string, method = "GET") => (await fetch(`${CTRL}${p}`, { method })).json() as Promise<unknown>;
type Sess = { email: string; client_channel: string; is_active: boolean; expires_at: string | null; mfa_method: string | null };
const sessions = async () => (await ctrl("/oturumlar")) as Sess[];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium } = req2("playwright") as typeof import("playwright");
  const sdk = adb("shell", "getprop", "ro.build.version.sdk");
  const rel = adb("shell", "getprop", "ro.build.version.release");
  const wv = (() => { try { return adb("shell", "dumpsys", "webviewupdate").split("\n").find((l) => /Current WebView package/.test(l))?.trim() ?? "?"; } catch { return "?"; } })();
  console.log(`\n═══ ${LABEL}: Android ${rel} (API ${sdk}) · ${wv} ═══`);
  if (process.env.APK) adb("install", "-r", process.env.APK);
  const ver = adb("shell", "dumpsys", "package", PKG).split("\n").find((l) => /versionName=/.test(l))?.trim();
  const dbg = /DEBUGGABLE/.test(adb("shell", "dumpsys", "package", PKG));
  console.log(`  uygulama: ${ver} · debuggable=${dbg}`);

  let browser: Browser | null = null;
  const launchApp = async (cold = true): Promise<Page> => {
    if (browser) { try { await browser.close(); } catch { /* */ } browser = null; }
    if (cold) adb("shell", "am", "force-stop", PKG);
    adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
    let sock = "";
    for (let i = 0; i < 60 && !sock; i++) {
      await sleep(1000);
      const pid = (() => { try { return adb("shell", "pidof", PKG); } catch { return ""; } })();
      const unix = adb("shell", "cat", "/proc/net/unix");
      sock = unix.split("\n").map((l) => /@(webview_devtools_remote_\d+)/.exec(l)?.[1] ?? "").find((n) => n && (!pid || n.endsWith(`_${pid}`))) ?? "";
    }
    if (!sock) throw new Error("WebView hata ayıklama soketi bulunamadı");
    try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch { /* yok */ }
    adb("forward", `tcp:${CDP_PORT}`, `localabstract:${sock}`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    let page: Page | undefined;
    for (let i = 0; i < 30 && !page; i++) { page = browser.contexts()[0]?.pages().find((p) => p.url().startsWith(WWW)); if (!page) await sleep(1000); }
    if (!page) throw new Error("uygulama sayfası bulunamadı");
    await page.waitForLoadState("domcontentloaded");
    return page;
  };
  const logged = (p: Page, ms = 25000) => p.getByRole("button", { name: "Çıkış Yap", exact: true }).first().waitFor({ timeout: ms }).then(() => true).catch(() => false);
  const login = async (p: Page, email: string, password: string) => {
    if (!(await p.locator("#login-email").isVisible().catch(() => false))) await p.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
    await p.locator("#login-email").fill(email);
    await p.locator("#login-password").fill(password);
    await p.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
  };
  const logout = async (p: Page) => {
    await p.getByRole("button", { name: "Çıkış Yap", exact: true }).first().click();
    const d = p.getByRole("dialog");
    await ((await d.count()) ? d.getByRole("button", { name: "Çıkış Yap" }) : p.getByRole("button", { name: "Çıkış Yap" }).last()).click();
    await sleep(2000);
  };
  const ls = (p: Page) => p.evaluate(() => localStorage.getItem("yasam_session_token"));
  type Ck = { name: string; value: string; httpOnly: boolean; secure: boolean; sameSite?: string };
  const sid = async (p: Page): Promise<Ck | undefined> => {
    try {
      const c = (await p.context().cookies(WWW)).find((x) => x.name === "__Host-yasam_sid");
      if (c) return c;
    } catch { /* WebView DevTools Storage.getCookies desteklemeyebilir → sayfa düzeyi CDP */ }
    const cdp = await p.context().newCDPSession(p);
    try {
      const r = (await cdp.send("Network.getCookies", { urls: [WWW] })) as { cookies: Ck[] };
      return r.cookies.find((x) => x.name === "__Host-yasam_sid");
    } finally { await cdp.detach().catch(() => {}); }
  };

  try {
    await ctrl("/iptal?kanal=android_app", "POST");
    await ctrl("/kip?android=header&killswitch=off", "POST");
    let page = await launchApp();

    // 0) Production'a değil izole ortama bağlı mı?
    const env = await page.evaluate(async () => { const r = await fetch("/", { cache: "no-store" }); return { h: r.headers.get("x-kabul-ortami"), u: location.href }; });
    rec("0 · uygulama izole test ortamına bağlı (x-kabul-ortami), production'a DEĞİL", env.h === "izole-test", `${env.u}`);
    if (env.h !== "izole-test") throw new Error("izole ortam doğrulanamadı — test DURDURULDU");

    // 1–3) Açılış, giriş ekranı, header kipinde giriş (bugünkü canlı davranış)
    rec("1 · uygulama açılıyor (WebView sayfası yüklendi)", page.url().startsWith(WWW));
    await login(page, "free@test.local", "parola-free");
    const inHeader = await logged(page);
    const attrs = await page.evaluate(() => ({ t: document.documentElement.getAttribute("data-session-transport"), a: document.documentElement.hasAttribute("data-android-token") }));
    let s = (await sessions()).find((x) => x.email === "free@test.local" && x.is_active);
    rec("2–3 · header kipinde normal giriş", inHeader && attrs.a && typeof (await ls(page)) === "string", JSON.stringify(attrs));
    rec("14 · WebView resmî uygulama kanalında sınıflandı (X-Requested-With + `; wv)`)", s?.client_channel === "android_app", `kanal=${s?.client_channel}`);

    // 6–7) Bayrak açılır: mevcut oturum çereze, B-1 (ilk açılışta geçiş kaynaklı 401 yok)
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    const ev: { s: number; p: string }[] = [];
    page.on("response", (r) => { if (/\/api\//.test(r.url())) ev.push({ s: r.status(), p: new URL(r.url()).pathname }); });
    await page.reload({ waitUntil: "domcontentloaded" });
    const stay = await logged(page);
    let left: string | null = "x";
    for (let i = 0; i < 30 && left !== null; i++) { await sleep(500); left = await ls(page); }
    await sleep(4000);
    const c = await sid(page);
    rec("6 · eski oturum çıkış yaptırmadan HttpOnly çereze taşındı", stay && left === null && !!c && c.httpOnly && c.secure, c ? `sameSite=${c.sameSite}` : "çerez yok");
    const b1 = ev.filter((e) => e.s === 401);
    rec("7 · ilk açılışta B-1 (geçiş kaynaklı 401) YOK", b1.length === 0, b1.map((e) => e.p).join(",") || "0");
    const js = await page.evaluate(() => ({ doc: document.cookie, ls: JSON.stringify(localStorage) }));
    rec("13 · JS oturum anahtarını okuyamıyor (document.cookie / localStorage)", !!c && !js.doc.includes(c.value) && !js.ls.includes(c.value));

    // 8) Uygulama kapatılıp açılır (force-stop → soğuk başlatma)
    await sleep(31_000); // WebView çerez deposunun periyodik diske yazımı (~30 sn) — onPause flush'ı force-stop'ta çalışmaz
    page = await launchApp(true);
    rec("8 · uygulama kapatılıp açıldı → oturum sürüyor", await logged(page));

    // 10) Ağ kesintisi: oturum yanlışlıkla sonlanmamalı
    adb("shell", "svc", "wifi", "disable"); adb("shell", "svc", "data", "disable");
    await page.reload().catch(() => {});
    await sleep(15_000);
    adb("shell", "svc", "wifi", "enable"); adb("shell", "svc", "data", "enable");
    await sleep(8000);
    await page.goto(WWW, { waitUntil: "domcontentloaded" }).catch(() => {});
    s = (await sessions()).find((x) => x.email === "free@test.local" && x.client_channel === "android_app" && x.is_active);
    rec("10 · ağ kesintisi oturumu sonlandırmadı", (await logged(page)) && !!s);

    // 15) Native indirme (DownloadManager) HttpOnly çerezi taşıyor mu? (sentetik uç — Word üretimi DEĞİL)
    try { adb("shell", "rm", "-f", "/sdcard/Download/kabul-indirme-testi.docx"); } catch { /* */ }
    await page.evaluate(() => { location.href = "/_kabul/indir"; }).catch(() => {});
    let got = "";
    for (let i = 0; i < 30 && !got; i++) { await sleep(1000); try { got = adb("shell", "ls", "/sdcard/Download/"); } catch { /* */ } if (!/kabul-indirme-testi/.test(got)) got = ""; }
    rec("15a · native DownloadManager indirmesi HttpOnly çerezle yetkilendi (sentetik uç)", !!got, got ? "dosya indi" : "dosya yok (ortam konsolundaki [indir] satırına bakın)");
    rec("15b · uygulamanın gerçek Word/PDF üretimi", null, "sentetik DB'de modül verisi yok");
    await page.goto(WWW, { waitUntil: "domcontentloaded" }).catch(() => {});

    // 11) Çıkış sunucu oturumunu kapatır
    await logged(page);
    await logout(page);
    s = (await sessions()).find((x) => x.email === "free@test.local" && x.client_channel === "android_app" && x.is_active);
    rec("11 · çıkış sunucu oturumunu kapattı, çerez silindi", !s && !(await sid(page)));

    // 4) E-posta kodu ile MFA (çerez kipinde)
    if (SINK) {
      const before = (() => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).length; } catch { return 0; } })();
      await login(page, "f2a-exp@test.local", "parola-f2a-exp");
      await page.getByTestId("mfa-email-panel").waitFor({ timeout: 20000 }).catch(() => {});
      const noSidBefore = !(await sid(page));
      await page.getByTestId("mfa-email-send").click().catch(() => {});
      let code = "";
      for (let i = 0; i < 60 && !code; i++) { await sleep(500); try { const l = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).slice(before); code = /^([0-9]{6}) — /.exec((JSON.parse(l[l.length - 1] ?? "{}") as { subject?: string }).subject ?? "")?.[1] ?? ""; } catch { /* */ } }
      await page.getByTestId("mfa-email-code").fill(code);
      await page.getByTestId("mfa-email-verify").click();
      const inn = await logged(page);
      const c2 = await sid(page);
      rec("4 · e-posta kodu MFA: tamamlanmadan çerez yok, sonra HttpOnly çerez + panel", noSidBefore && inn && !!c2 && c2.httpOnly && (await ls(page)) === null);
      // 12) İptal edilen çerez tekrar kullanılamaz
      await ctrl("/iptal?kanal=android_app", "POST");
      await page.reload({ waitUntil: "domcontentloaded" });
      let out = false; const t0 = Date.now();
      while (!out && Date.now() - t0 < 70_000) { await sleep(1000); out = await page.locator("#login-email").isVisible().catch(() => false) || !(await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().isVisible().catch(() => false)); }
      const prof = await page.evaluate(async () => (await fetch("/api/auth/profile")).status);
      rec("12 · iptal edilen oturum: korumalı uç 401, giriş ekranı", out && prof === 401, `${Math.round((Date.now() - t0) / 1000)} sn`);
    } else {
      rec("4 · e-posta kodu MFA", null, "KABUL_SINK verilmedi");
      rec("12 · iptal", null, "KABUL_SINK verilmedi");
    }
    rec("5 · QR onayı (ikinci cihaz + cihaz kaydı)", null, "emülatörde ikinci cihaz/kayıt akışı otomatikleştirilmedi");

    // 9) Emülatör yeniden başlatma (oturum sürmeli)
    if (process.env.REBOOT === "1") {
      await login(page, "free@test.local", "parola-free");
      await logged(page);
      await sleep(31_000);
      if (browser) { try { await (browser as Browser).close(); } catch { /* */ } browser = null; }
      adb("reboot");
      adb("wait-for-device");
      for (let i = 0; i < 180; i++) { await sleep(2000); try { if (adb("shell", "getprop", "sys.boot_completed") === "1") break; } catch { /* */ } }
      await sleep(5000);
      page = await launchApp(true);
      rec("9 · emülatör yeniden başlatıldı → oturum sürüyor", await logged(page));
    } else {
      rec("9 · cihaz yeniden başlatma", null, "REBOOT=1 verilmedi");
    }
  } catch (e) {
    console.error(e);
    rec("koşu", false, String(e).slice(0, 200));
  } finally {
    if (browser) { try { await (browser as Browser).close(); } catch { /* */ } }
    try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch { /* */ }
  }
  fs.writeFileSync(path.join(OUT, `emulator-${LABEL}.json`), JSON.stringify({ android: rel, api: sdk, webview: wv, uygulama: ver, sonuclar: results }, null, 2));
  const fails = results.filter((r) => r.sonuc === "FAIL").length;
  console.log(`\nandroid-emulator-kabul ${LABEL}: ${results.filter((r) => r.sonuc === "EMULATOR PASS").length} EMULATOR PASS, ${fails} FAIL, ${results.filter((r) => r.sonuc === "NOT TESTED").length} NOT TESTED`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
