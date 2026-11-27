/**
 * ANDROID EMÜLATÖR KABULÜ — gerçek Android 2.0.0 DEBUG APK'sı + emülatörün GERÇEK Android System WebView'ı + android-kabul-ortami.ts.
 * Sonuçlar EMULATOR PASS / FAIL / NOT TESTED'dir; FİZİKSEL CİHAZ KABULÜ DEĞİLDİR. Play 1.9.1 ikilisini TEST ETMEZ.
 *
 * Ön koşul: emülatör `-dns-server 127.0.0.1` ile açık (ortam: KABUL_DNS=1 KABUL_DNS_BIND=127.0.0.1 KABUL_DNS_IP=10.0.2.2),
 *           debug APK kurulu (test CA'sı yalnız yasamsistemi.com için) veya APK yolu verilmiş.
 * WebView sürücüsü: debug uygulamada açık olan uzaktan hata ayıklama soketi → adb forward → HAM CDP (WebSocket).
 *   (Playwright connectOverCDP eski WebView'larda — ör. API 29 imajındaki 74 — çalışmaz; ham CDP her sürümde çalışır.)
 * Çalıştır: ADB=<adb.exe> [APK=<apk>] KABUL_CTRL=http://127.0.0.1:4999 KABUL_SINK=<sentetik-eposta.jsonl> [REBOOT=1]
 *           npx tsx scripts/giris-guvenligi/android-emulator-kabul.e2e.ts <etiket> <kanıt-dizini>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

/** En küçük CDP istemcisi (Node 24 yerleşik WebSocket). */
class Cdp {
  private id = 0;
  private pending = new Map<number, (v: { result?: unknown; error?: { message: string } }) => void>();
  readonly events: { method: string; params: Record<string, unknown> }[] = [];
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data)) as { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string } };
      if (m.id !== undefined) { this.pending.get(m.id)?.(m); this.pending.delete(m.id); }
      else if (m.method) this.events.push({ method: m.method, params: m.params ?? {} });
    });
  }
  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((res, rej) => { ws.addEventListener("open", () => res()); ws.addEventListener("error", () => rej(new Error("CDP bağlantısı kurulamadı"))); });
    return new Cdp(ws);
  }
  send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP zaman aşımı: ${method}`)); }, timeoutMs);
      this.pending.set(id, (m) => { clearTimeout(t); if (m.error) rej(new Error(`${method}: ${m.error.message}`)); else res(m.result as T); });
    });
  }
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send<{ result: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`değerlendirme hatası: ${JSON.stringify(r.exceptionDetails).slice(0, 200)}`);
    return r.result.value as T;
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const sdk = adb("shell", "getprop", "ro.build.version.sdk");
  const rel = adb("shell", "getprop", "ro.build.version.release");
  const wv = (() => { try { return adb("shell", "dumpsys", "webviewupdate").split("\n").find((l) => /Current WebView package/.test(l))?.trim() ?? "?"; } catch { return "?"; } })();
  console.log(`\n═══ ${LABEL}: Android ${rel} (API ${sdk}) · ${wv} ═══`);
  if (process.env.APK) adb("install", "-r", process.env.APK);
  // Yalıtım: önceki koşudan kalan WebView çerez / depolama durumu temizlenir (yalnız bu emülatördeki debug uygulama).
  adb("shell", "pm", "clear", PKG);
  const pk = adb("shell", "dumpsys", "package", PKG);
  console.log(`  uygulama: ${pk.split("\n").find((l) => /versionName=/.test(l))?.trim()} · debuggable=${/DEBUGGABLE/.test(pk)}`);

  let cdp: Cdp | null = null;
  const waitReady = async (c: Cdp) => { for (let i = 0; i < 30; i++) { try { if ((await c.eval<string>("document.readyState")) !== "loading") return; } catch { /* gezinme */ } await sleep(500); } };
  const launchApp = async (cold = true): Promise<Cdp> => {
    if (cdp) { cdp.close(); cdp = null; }
    if (cold) adb("shell", "am", "force-stop", PKG);
    adb("shell", "am", "start", "-W", "-n", `${PKG}/.SplashActivity`); // başlatıcı (dışa açık) etkinlik
    let sock = "";
    for (let i = 0; i < 60 && !sock; i++) {
      await sleep(1000);
      const pid = (() => { try { return adb("shell", "pidof", PKG); } catch { return ""; } })();
      sock = adb("shell", "cat", "/proc/net/unix").split("\n").map((l) => /@(webview_devtools_remote_\d+)/.exec(l)?.[1] ?? "").find((n) => n && (!pid || n.endsWith(`_${pid}`))) ?? "";
    }
    if (!sock) throw new Error("WebView hata ayıklama soketi bulunamadı");
    try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch { /* yok */ }
    adb("forward", `tcp:${CDP_PORT}`, `localabstract:${sock}`);
    let target: { webSocketDebuggerUrl: string; url: string } | undefined;
    for (let i = 0; i < 40 && !target; i++) {
      try { target = ((await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()) as { type: string; url: string; webSocketDebuggerUrl: string }[]).find((t) => t.type === "page" && t.url.startsWith(WWW)); } catch { /* */ }
      if (!target) await sleep(1000);
    }
    if (!target) throw new Error("uygulama sayfası bulunamadı");
    const c = await Cdp.open(target.webSocketDebuggerUrl);
    await c.send("Runtime.enable"); await c.send("Network.enable"); await c.send("Page.enable");
    cdp = c;
    await waitReady(c);
    return c;
  };
  const logged = async (c: Cdp, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (await c.eval<boolean>(`!!Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Çıkış Yap' || b.textContent.trim() === 'Çıkış Yap')`)) return true; } catch { /* */ }
      await sleep(700);
    }
    return false;
  };
  const clickText = (c: Cdp, re: string) => c.eval<boolean>(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => new RegExp(${JSON.stringify(re)}).test((x.getAttribute('aria-label') || '') + ' ' + x.textContent.trim())); if (b) { b.click(); return true; } return false; })()`);
  const fill = (c: Cdp, sel: string, val: string) => c.eval<boolean>(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(val)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const waitSel = async (c: Cdp, sel: string, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await c.eval<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`).catch(() => false)) return true; await sleep(500); } return false; };
  const login = async (c: Cdp, email: string, password: string) => {
    if (!(await c.eval<boolean>(`!!document.querySelector('#login-email')`))) await clickText(c, "^\\s*Giriş Yap\\s*$");
    await waitSel(c, "#login-email");
    await fill(c, "#login-email", email); await fill(c, "#login-password", password);
    await clickText(c, "Uzman Paneline Gir");
  };
  const logout = async (c: Cdp) => {
    await clickText(c, "^Çıkış Yap");
    await sleep(800);
    await c.eval(`(() => { const d = document.querySelector('[role=dialog]'); const bs = Array.from((d || document).querySelectorAll('button')).filter(b => b.textContent.trim() === 'Çıkış Yap'); const b = bs[bs.length - 1]; if (b) b.click(); return true; })()`);
    await sleep(2500);
  };
  const reload = async (c: Cdp) => { await c.send("Page.reload", {}); await sleep(1500); await waitReady(c); };
  const ls = (c: Cdp) => c.eval<string | null>(`localStorage.getItem('yasam_session_token')`);
  type Ck = { name: string; value: string; httpOnly: boolean; secure: boolean; sameSite?: string; expires: number };
  const sid = async (c: Cdp) => ((await c.send<{ cookies: Ck[] }>("Network.getCookies", { urls: [WWW] })).cookies).find((x) => x.name === "__Host-yasam_sid");
  const responses = (c: Cdp, from: number) => c.events.slice(from).filter((e) => e.method === "Network.responseReceived")
    .map((e) => { const r = e.params.response as { url: string; status: number }; return { s: r.status, p: (() => { try { return new URL(r.url).pathname; } catch { return r.url; } })() }; });

  try {
    await ctrl("/iptal?kanal=android_app", "POST");
    await ctrl("/kip?android=header&killswitch=off", "POST");
    let c = await launchApp();

    const env = await c.eval<{ h: string | null; u: string }>(`fetch('/', { cache: 'no-store' }).then(r => ({ h: r.headers.get('x-kabul-ortami'), u: location.href }))`);
    rec("0 · uygulama izole test ortamına bağlı (x-kabul-ortami), production'a DEĞİL", env.h === "izole-test", env.u);
    if (env.h !== "izole-test") throw new Error("izole ortam doğrulanamadı — test DURDURULDU");

    rec("1 · uygulama açılıyor (WebView sayfası yüklendi)", env.u.startsWith(WWW));
    await login(c, "free@test.local", "parola-free");
    const inHeader = await logged(c);
    const attrs = await c.eval<{ t: string | null; a: boolean }>(`({ t: document.documentElement.getAttribute('data-session-transport'), a: document.documentElement.hasAttribute('data-android-token') })`);
    let s = (await sessions()).find((x) => x.email === "free@test.local" && x.is_active);
    rec("2–3 · header kipinde normal giriş", inHeader && attrs.a && typeof (await ls(c)) === "string", JSON.stringify(attrs));
    rec("14 · WebView resmî uygulama kanalında sınıflandı (gerçek X-Requested-With + `; wv)`)", s?.client_channel === "android_app", `kanal=${s?.client_channel}`);

    // 6–7) Bayrak açılır — gerçek sıra: kullanıcı uygulamayı kullanmış ve arka plana almış (onPause → WebView depoları diske),
    // uygulama kapalıyken bayrak açılır, sonra soğuk açılış. (Girişten hemen sonraki force-stop localStorage yazımını kaybettirir.)
    await sleep(10_000);
    adb("shell", "input", "keyevent", "KEYCODE_HOME");
    await sleep(4000);
    adb("shell", "am", "force-stop", PKG);
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    c = await launchApp(false);
    const mark = 0;
    const stay = await logged(c);
    let left: string | null = "x";
    for (let i = 0; i < 30 && left !== null; i++) { await sleep(500); left = await ls(c); }
    await sleep(4000);
    const ck = await sid(c);
    rec("6 · eski oturum çıkış yaptırmadan HttpOnly çereze taşındı", stay && left === null && !!ck && ck.httpOnly && ck.secure, ck ? `sameSite=${ck.sameSite ?? "?"}` : "çerez yok");
    const b1 = responses(c, mark).filter((e) => e.s === 401);
    rec("7 · ilk açılışta B-1 (geçiş kaynaklı 401) YOK", b1.length === 0, b1.map((e) => e.p).join(",") || "0");
    const js = await c.eval<{ doc: string; ls: string }>(`({ doc: document.cookie, ls: JSON.stringify(localStorage) })`);
    rec("13 · JS oturum anahtarını okuyamıyor (document.cookie / localStorage)", !!ck && !js.doc.includes(ck.value) && !js.ls.includes(ck.value));

    // 8) Uygulama kapatılıp açılır — son uygulamalardan kaydırma = önce arka plan (onPause: CookieManager.flush), sonra süreç sonu
    await sleep(5000);
    adb("shell", "input", "keyevent", "KEYCODE_HOME");
    await sleep(4000);
    c = await launchApp(true);
    rec("8 · uygulama kapatılıp açıldı → oturum sürüyor", await logged(c));

    // 10) Ağ kesintisi
    adb("shell", "svc", "wifi", "disable"); adb("shell", "svc", "data", "disable");
    await reload(c).catch(() => {});
    await sleep(15_000);
    adb("shell", "svc", "wifi", "enable"); adb("shell", "svc", "data", "enable");
    await sleep(10_000);
    await c.send("Page.navigate", { url: WWW }).catch(() => {}); await sleep(3000); await waitReady(c);
    s = (await sessions()).find((x) => x.email === "free@test.local" && x.client_channel === "android_app" && x.is_active);
    rec("10 · ağ kesintisi oturumu sonlandırmadı", (await logged(c)) && !!s);

    // 15) Native indirme (DownloadManager) HttpOnly çerezi taşıyor mu? — sentetik uç, Word üretimi DEĞİL
    try { adb("shell", "rm", "-f", "/sdcard/Download/kabul-indirme-testi.docx"); } catch { /* */ }
    await c.eval(`(() => { location.href = '/_kabul/indir'; return true; })()`).catch(() => {});
    let got = "";
    for (let i = 0; i < 40 && !got; i++) { await sleep(1000); try { const l = adb("shell", "ls", "/sdcard/Download/"); if (/kabul-indirme-testi/.test(l)) got = l; } catch { /* */ } }
    // DownloadManager SİSTEM sürecinde çalışır; uygulamanın debug ağ yapılandırmasındaki test CA'sına güvenmez → izole
    // ortamda TLS kurulamaz (ortam sınırı). Production sertifikasıyla fiziksel cihazda doğrulanmalı.
    rec("15a · native DownloadManager (adres indirmesi) HttpOnly çerezi taşıyor mu", got ? true : null, got ? "dosya indi" : "ortam sınırı: sistem DownloadManager test CA'sına güvenmez (TLS) — fiziksel cihazda gerçek sertifikayla");
    c = await launchApp(true);
    // 15c) GERÇEK Word/PDF indirmelerinin yolu: kimlikli fetch (çerez) → Blob → <a download> → uygulamanın blob kancası →
    //      JS köprüsü → MediaStore Downloads. İçerik sentetik (profil yanıtı); mekanizma birebir aynı.
    await logged(c);
    try { adb("shell", "rm", "-f", "/sdcard/Download/kabul-blob-testi.docx"); } catch { /* */ }
    const blobRes = await c.eval<{ s: number; hdr: boolean }>(`(async () => {
      const u = JSON.parse(localStorage.getItem('yasam_user') || '{}').id || '';
      const r = await fetch('/api/auth/profile', { headers: { 'x-user-id': u } });
      const b = new Blob([await r.text()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'kabul-blob-testi.docx'; document.body.appendChild(a); a.click();
      return { s: r.status, hdr: false };
    })()`);
    let blobGot = false;
    for (let i = 0; i < 20 && !blobGot; i++) { await sleep(1000); try { blobGot = /kabul-blob-testi/.test(adb("shell", "ls", "/sdcard/Download/")); } catch { /* */ } }
    rec("15c · gerçek indirme yolu: kimlikli fetch (HttpOnly çerez) → blob → köprü → Downloads", blobRes.s === 200 && blobGot, `fetch ${blobRes.s}, dosya ${blobGot ? "kaydedildi" : "yok"}`);
    rec("15b · uygulamanın gerçek Word/PDF içerik üretimi", null, "sentetik DB'de modül verisi yok");

    // 11) Çıkış
    await logged(c);
    await logout(c);
    s = (await sessions()).find((x) => x.email === "free@test.local" && x.client_channel === "android_app" && x.is_active);
    rec("11 · çıkış sunucu oturumunu kapattı, çerez silindi", !s && !(await sid(c)));

    // 4) E-posta kodu MFA + 12) iptal
    if (SINK) {
      const before = (() => { try { return fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).length; } catch { return 0; } })();
      await login(c, "f2a-exp@test.local", "parola-f2a-exp");
      await waitSel(c, "[data-testid=mfa-email-panel]");
      const noSidBefore = !(await sid(c));
      await c.eval(`(() => { const b = document.querySelector('[data-testid=mfa-email-send]'); if (b) b.click(); return true; })()`);
      let code = "";
      for (let i = 0; i < 60 && !code; i++) { await sleep(500); try { const l = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean).slice(before); code = /\b([0-9]{6})\b/.exec((JSON.parse(l[l.length - 1] ?? "{}") as { subject?: string; text?: string }).text ?? "")?.[1] ?? ""; } catch { /* */ } }
      await waitSel(c, "[data-testid=mfa-email-code]");
      await fill(c, "[data-testid=mfa-email-code]", code);
      await c.eval(`(() => { const b = document.querySelector('[data-testid=mfa-email-verify]'); if (b) b.click(); return true; })()`);
      const inn = await logged(c);
      const ck2 = await sid(c);
      rec("4 · e-posta kodu MFA: tamamlanmadan çerez yok, sonra HttpOnly çerez + panel", noSidBefore && inn && !!ck2 && ck2.httpOnly && (await ls(c)) === null);
      await ctrl("/iptal?kanal=android_app", "POST");
      await reload(c);
      let out = false; const t0 = Date.now();
      while (!out && Date.now() - t0 < 70_000) { await sleep(1000); out = await c.eval<boolean>(`!!document.querySelector('#login-email') || !Array.from(document.querySelectorAll('button')).some(b => b.getAttribute('aria-label') === 'Çıkış Yap')`).catch(() => false); }
      const prof = await c.eval<number>(`fetch('/api/auth/profile', { headers: { 'x-user-id': '00000000-0000-0000-0000-00000000e0f2' } }).then(r => r.status)`);
      rec("12 · iptal edilen oturum: korumalı uç 401, giriş ekranı", out && prof === 401, `${Math.round((Date.now() - t0) / 1000)} sn`);
    } else {
      rec("4 · e-posta kodu MFA", null, "KABUL_SINK verilmedi");
      rec("12 · iptal", null, "KABUL_SINK verilmedi");
    }
    rec("5 · QR onayı (ikinci cihaz + cihaz kaydı)", null, "emülatörde ikinci cihaz / kayıt akışı otomatikleştirilmedi");

    // 9) Emülatör yeniden başlatma
    if (process.env.REBOOT === "1") {
      if (!(await logged(c, 3000))) { await login(c, "free@test.local", "parola-free"); await logged(c); }
      await sleep(10_000);
      adb("shell", "input", "keyevent", "KEYCODE_HOME");
      await sleep(4000);
      if (cdp) { (cdp as Cdp).close(); cdp = null; }
      adb("reboot");
      await sleep(10_000);
      adb("wait-for-device");
      for (let i = 0; i < 180; i++) { await sleep(2000); try { if (adb("shell", "getprop", "sys.boot_completed") === "1") break; } catch { /* */ } }
      await sleep(8000);
      c = await launchApp(true);
      rec("9 · emülatör yeniden başlatıldı → oturum sürüyor", await logged(c));
    } else {
      rec("9 · cihaz yeniden başlatma", null, "REBOOT=1 verilmedi");
    }
  } catch (e) {
    console.error(e);
    rec("koşu", false, String(e).slice(0, 200));
  } finally {
    if (cdp) (cdp as Cdp).close();
    try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch { /* */ }
  }
  fs.writeFileSync(path.join(OUT, `emulator-${LABEL}.json`), JSON.stringify({ android: rel, api: sdk, webview: wv, sonuclar: results }, null, 2));
  const fails = results.filter((r) => r.sonuc === "FAIL").length;
  console.log(`\nandroid-emulator-kabul ${LABEL}: ${results.filter((r) => r.sonuc === "EMULATOR PASS").length} EMULATOR PASS, ${fails} FAIL, ${results.filter((r) => r.sonuc === "NOT TESTED").length} NOT TESTED`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
