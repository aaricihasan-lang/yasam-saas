/**
 * GİRİŞ GÜVENLİĞİ F2-K (A3) — oturum anahtarının JavaScript'e açılması: hangi istemci TOKEN (yanıt gövdesi →
 * localStorage) alır, hangisi HttpOnly + Secure + SameSite=Strict __Host- çerezi alır? Gerçek route'lar + gerçek
 * PostgreSQL. Production'a SIFIR temas. (Fiziksel Android WebView / iPhone DEĞİL — istek düzeyi emülasyon.)
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2k-token.harness.ts
 *   F2K_A3_WITHOUT_FIX=1 → eski kural (tek başına `; wv)` / ipucu token yolu): uygulama içi tarayıcı token alır (FAIL beklenir).
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
type J = Record<string, unknown>;
const UA = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  inApp: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0 Mobile Safari/537.36 Instagram 300.0",
  appWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0 Mobile Safari/537.36 YasamOturumBagla/1",
};
const APP = { "user-agent": UA.appWebView, "x-requested-with": "com.yasamsistemi.app" };

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2k: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2k-a3", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: "https://www.yasamsistemi.com",
      RATE_LIMIT_SECRET: "f2k-a3-rate", LOGIN_IP_PEPPER: "f2k-a3-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    });
    // Negatif kontrol: A3 öncesi kural test sürecine yüklenir (bkz. a3Mutation.ts); yüklenemezse süreç durur.
    const { installA3MutationIfRequested, assertA3MutationActive } = await import("./a3Mutation");
    if (installA3MutationIfRequested()) await assertA3MutationActive();
    const sessionRoute = await import("@/app/api/auth/session/route");
    const bindBegin = await import("@/app/api/auth/session/device-bind/begin/route");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 40;
    const call = async (h: (r: NextRequest) => Promise<Response>, url: string, method: "GET" | "POST" | "DELETE", body: unknown, headers: Record<string, string>) => {
      const res = await h(new NextRequest(`https://www.yasamsistemi.com${url}`, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "sec-fetch-site": "same-origin",
          origin: "https://www.yasamsistemi.com", ...headers },
        ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}) }));
      const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      return { status: res.status, json: (await res.clone().json().catch(() => ({}))) as J, set };
    };
    const sidCookie = (set: string[]) => set.find((c) => c.startsWith("__Host-yasam_sid="));
    const login = (headers: Record<string, string>) =>
      call(sessionRoute.POST, "/api/auth/session", "POST", { email: EMAIL.free, password: pw(EMAIL.free) }, headers);
    // Uzman hesabı (MFA'sız) — taşıma kuralı rol / MFA'dan bağımsız; bütün istemcilerde aynı hesap.
    await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1`, [U.free]);

    const expectCookie = async (label: string, headers: Record<string, string>) => {
      const r = await login(headers);
      const c = sidCookie(r.set) ?? "";
      ok(r.status === 200 && !("sessionToken" in r.json) && /HttpOnly/i.test(c) && /Secure/i.test(c) && /SameSite=Strict/i.test(c),
        `${label}: HttpOnly çerez; yanıt gövdesinde oturum anahtarı YOK (JavaScript okuyamaz)`, { status: r.status, body: Object.keys(r.json), c: c.slice(0, 80) });
      await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND is_active`, [U.free]);
      return r;
    };
    await expectCookie("Chrome (masaüstü)", { "user-agent": UA.chrome });
    await expectCookie("Edge (masaüstü)", { "user-agent": UA.edge });
    await expectCookie("Android Chrome", { "user-agent": UA.androidChrome });
    await expectCookie("Uygulama içi tarayıcı (Instagram WebView, yalnız `; wv)`)", { "user-agent": UA.inApp });
    await expectCookie("Sahte istemci ipucu (Chrome + x-yasam-client: android)", { "user-agent": UA.chrome, "x-yasam-client": "android" });
    await expectCookie("Sahte paket başlığı (Chrome UA + X-Requested-With)", { "user-agent": UA.chrome, "x-requested-with": "com.yasamsistemi.app" });
    await expectCookie("Başka paket (WebView + com.instagram.android)", { "user-agent": UA.inApp, "x-requested-with": "com.instagram.android" });

    // Resmî uygulama — VARSAYILAN (geriye uyumlu): token yolu korunur (1.9.x / 2.0.0 kırılmaz).
    const app = await login(APP);
    ok(app.status === 200 && typeof app.json.sessionToken === "string" && !sidCookie(app.set),
      "resmî uygulama (varsayılan 'header'): mevcut davranış korunur (geriye uyum)", { status: app.status, keys: Object.keys(app.json) });
    const tok = String(app.json.sessionToken ?? "");
    const g1 = await call(sessionRoute.GET, "/api/auth/session", "GET", null, { ...APP, "x-session-token": tok });
    ok(g1.json.valid === true, "resmî uygulama oturumu geçerli");
    const out = await call(sessionRoute.DELETE, "/api/auth/session", "DELETE", null, { ...APP, "x-session-token": tok });
    const g2 = await call(sessionRoute.GET, "/api/auth/session", "GET", null, { ...APP, "x-session-token": tok });
    ok(out.status < 300 && g2.json.valid !== true, "çıkış sonrası anahtar GEÇERSİZ", { out: out.status, g2: g2.json });

    // Resmî uygulama — opt-in ÇEREZ taşıması: anahtar JavaScript'e hiç verilmez; kanal android_app kalır.
    process.env.ANDROID_APP_SESSION_TRANSPORT = "cookie";
    const appC = await login(APP);
    const c = sidCookie(appC.set) ?? "";
    ok(appC.status === 200 && !("sessionToken" in appC.json) && /HttpOnly/i.test(c),
      "resmî uygulama (opt-in 'cookie'): HttpOnly çerez, gövdede anahtar YOK", { status: appC.status, keys: Object.keys(appC.json) });
    const cookieVal = c.split(";")[0].split("=").slice(1).join("=");
    const ch = (await q(`SELECT client_channel FROM public.user_sessions WHERE session_token = $1`, [cookieVal])).rows[0]?.client_channel;
    ok(ch === "android_app", "çerez kipinde oturum kanalı android_app (F2-J sınırları ve cihaz kanıtı aynen)", { ch });
    const g3 = await call(sessionRoute.GET, "/api/auth/session", "GET", null, { ...APP, cookie: `__Host-yasam_sid=${cookieVal}` });
    ok(g3.json.valid === true, "çerez kipinde oturum çerezle doğrulanır");
    const bb = await call(bindBegin.POST, "/api/auth/session/device-bind/begin", "POST", {}, { ...APP, cookie: `__Host-yasam_sid=${cookieVal}`, "x-user-id": U.free });
    ok(bb.status === 200 && bb.json.required === false, "çerez kipinde cihaz kanıtı başlatma ucu çerezle çalışır (uzman: gerekmez)", bb);
    // Çapraz site DEĞİŞTİRİCİ istek: çerez + yabancı kaynak → reddedilir (CSRF katmanı; ayrıca SameSite=Strict).
    const x = await call(bindBegin.POST, "/api/auth/session/device-bind/begin", "POST", {},
      { ...APP, cookie: `__Host-yasam_sid=${cookieVal}`, "x-user-id": U.free, "sec-fetch-site": "cross-site", origin: "https://evil.example" });
    ok(x.status === 401, "çerez kipinde çapraz site değiştirici istek oturumu KULLANAMAZ", x);
    const x2 = await call(bindBegin.POST, "/api/auth/session/device-bind/begin", "POST", {}, { ...APP, cookie: `__Host-yasam_sid=${cookieVal}` });
    ok(x2.status === 401, "çerez kipinde özel başlıksız (CSRF) değiştirici istek oturumu KULLANAMAZ", x2);
    delete process.env.ANDROID_APP_SESSION_TRANSPORT;
  } finally {
    await db.close();
  }
  console.log(`\nf2k-token: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
