/**
 * HTTPONLY NİHAİ GEÇİŞ DENETİMİ — gerçek route'lar + merkezi guard + gerçek PostgreSQL (F2-A…F2-K zinciri).
 * Production'a SIFIR temas. Fiziksel Android WebView / gerçek Safari DEĞİL — istek düzeyi emülasyon.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/httponly-nihai.harness.ts
 *
 * Sonuç sınıfları:
 *   PASS / FAIL  → beklenen güvenlik davranışı gerçekleşti / gerçekleşmedi (FAIL çıkış kodunu 1 yapar).
 *   AÇIK         → bilinen, henüz kapatılmamış güvenlik boşluğu YENİDEN ÜRETİLDİ (PASS SAYILMAZ; raporda ayrı).
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
let open = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
/** Bilinen açık: `reproduced` true ise boşluk yeniden üretildi (AÇIK); false ise kapanmış (PASS). */
function gap(reproduced: boolean, label: string, extra?: unknown): void {
  if (reproduced) { open++; console.log(`  AÇIK ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 200)}` : ""}`); }
  else { pass++; console.log(`  PASS (kapalı) ${label}`); }
}
function section(t: string): void { console.log(`\n${t}`); }

type J = Record<string, unknown>;
const ORIGIN = "https://www.yasamsistemi.com";
const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  appWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0 Mobile Safari/537.36",
};
const APP = { "user-agent": UA.appWebView, "x-requested-with": "com.yasamsistemi.app" };
/**
 * Firefox 151 / WebKit 26.5 sayfa JavaScript'i fetch/XHR ile User-Agent'ı DEĞİŞTİREBİLİR (Playwright ile ölçüldü;
 * Chromium değiştiremez). X-Requested-With her tarayıcıda serbest özel başlıktır. Dolayısıyla XSS altındaki bir
 * Firefox/Safari sayfası aşağıdaki başlık kümesini ÜRETEBİLİR — sunucu resmî uygulamadan ayırt edemez.
 */
const FORGED_FROM_FIREFOX_JS = { "user-agent": UA.appWebView, "x-requested-with": "com.yasamsistemi.app" };

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  // Negatif kontrol (F2K_A3_WITHOUT_FIX=1): A3 öncesi kural yüklenir; G/J bölümlerinin FAIL vermesi beklenir.
  const { installA3MutationIfRequested, assertA3MutationActive } = await import("./a3Mutation");
  if (installA3MutationIfRequested()) await assertA3MutationActive();
  const db = await startF2cDb({ withF2k: true });
  const { admin } = db;
  const baseEnv = {
    NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "httponly-nihai", SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN,
    RATE_LIMIT_SECRET: "httponly-nihai-rate", LOGIN_IP_PEPPER: "httponly-nihai-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
  };
  const resetEnv = () => {
    for (const k of ["SESSION_COOKIE_MODE", "SESSION_COOKIE_WEB_HEADER", "SESSION_COOKIE_CANARY_USER_IDS", "ANDROID_APP_SESSION_TRANSPORT", "SESSION_EXPIRY_ENFORCE"]) delete process.env[k];
    Object.assign(process.env, baseEnv);
  };
  try {
    resetEnv();
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const profileRoute = await import("@/app/api/auth/profile/route");
    const bootRoute = await import("@/app/api/auth/session/cookie/route");
    const { verifyUserRequest } = await import("@/lib/auth/userGuard");
    const { readWebSessionTransport, WEB_SESSION_COOKIE_MAX_AGE_CAP } = await import("@/lib/auth/sessionCookie");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 10;
    const mkReq = (url: string, method: string, body: unknown, headers: Record<string, string>, base: Record<string, string> = { "sec-fetch-site": "same-origin", origin: ORIGIN }) =>
      new NextRequest(`${ORIGIN}${url}`, {
        method,
        headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ip++ % 250}`, ...base, ...headers },
        ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
      });
    const call = async (h: (r: NextRequest) => Promise<Response>, url: string, method: string, body: unknown, headers: Record<string, string>, base?: Record<string, string>) => {
      const res = await h(mkReq(url, method, body, headers, base));
      const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      const text = await res.clone().text();
      let json: J = {};
      try { json = JSON.parse(text) as J; } catch { /* gövde JSON değil */ }
      return { status: res.status, json, set, text };
    };
    const getCookie = (set: string[], name: string) => set.find((c) => c.startsWith(`${name}=`)) ?? "";
    const cookieValue = (c: string) => c.split(";")[0].split("=").slice(1).join("=");
    const login = (email: string, headers: Record<string, string>) =>
      call(sessionRoute.POST, "/api/auth/session", "POST", { email, password: pw(email) }, headers);
    const profile = (userId: string, headers: Record<string, string>, base?: Record<string, string>) =>
      call(profileRoute.GET, "/api/auth/profile", "GET", null, { "x-user-id": userId, ...headers }, base);
    /** Merkezi guard'a durum değiştiren (POST) istek — çerez CSRF katmanı burada. */
    const guardPost = async (headers: Record<string, string>, base?: Record<string, string>) => {
      const g = await verifyUserRequest(mkReq("/api/settings/location", "POST", {}, headers, base));
      return g.ok ? 200 : g.response.status;
    };
    const endAll = (uid: string) =>
      q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND is_active`, [uid]);
    const sessRow = async (tok: string) => (await q(`SELECT is_active, ended_at, end_reason, client_channel, mfa_method FROM public.user_sessions WHERE session_token = $1`, [tok])).rows[0] as J | undefined;
    const leaks = (r: { text: string }, tok: string) => tok !== "" && r.text.includes(tok);

    for (const uid of [U.free, U.exp, U.owner, U.and1]) await endAll(uid);

    // ─────────────────────────────────────────────────────────────────────────────
    section("A) Web girişi: çerez öznitelikleri + anahtar JavaScript'e verilmez (Chrome / Firefox / Safari / Android Chrome)");
    let sidA = "";
    for (const [name, ua] of [["Chrome", UA.chromeWin], ["Safari", UA.safariMac], ["Android Chrome", UA.androidChrome], ["Firefox", UA.firefoxWin]] as const) {
      const r = await login(EMAIL.free, { "user-agent": ua });
      const c = getCookie(r.set, "__Host-yasam_sid");
      const v = cookieValue(c);
      const maxAge = Number(/Max-Age=(\d+)/i.exec(c)?.[1] ?? "-1");
      ok(r.status === 200 && r.json.sessionCookie === true && !("sessionToken" in r.json), `${name}: 200, gövdede sessionToken YOK`, { s: r.status, k: Object.keys(r.json) });
      ok(/;\s*HttpOnly/i.test(c) && /;\s*Secure/i.test(c) && /;\s*SameSite=Strict/i.test(c) && /;\s*Path=\/(;|$)/i.test(c) && !/;\s*Domain=/i.test(c),
        `${name}: __Host-yasam_sid HttpOnly + Secure + SameSite=Strict + Path=/ + Domain YOK`, c.replace(v, "<anahtar>"));
      ok(maxAge > 0 && maxAge <= WEB_SESSION_COOKIE_MAX_AGE_CAP, `${name}: Max-Age (0, 30 gün] — ${maxAge} sn`);
      ok(!leaks(r, v), `${name}: yanıt gövdesi oturum anahtarını HİÇBİR alanda içermiyor`);
      const row = await sessRow(v);
      ok(row?.is_active === true && row?.client_channel !== "android_app", `${name}: oturum web kanalında (${String(row?.client_channel)})`);
      sidA = v;
      if (name !== "Firefox") await endAll(U.free);
    }
    // sidA = Firefox oturumu (aktif)

    // ─────────────────────────────────────────────────────────────────────────────
    section("B) Oturum yaşam döngüsü (yalnız HttpOnly çerez)");
    const ck = (v: string) => ({ cookie: `__Host-yasam_sid=${v}`, "user-agent": UA.firefoxWin });
    {
      const p1 = await profile(U.free, ck(sidA));
      ok(p1.status === 200, "çerezle korumalı uç (profil) 200 — sayfa yenileme / yeni sekme aynı çerezi gönderir", p1.status);
      const p2 = await profile(U.free, ck(sidA));
      ok(p2.status === 200, "ikinci istek (yenileme) 200; oturum kaymıyor");
      const pOther = await profile(U.exp, ck(sidA));
      ok(pOther.status === 401 || pOther.status === 403, "A'nın çerezi + başka kullanıcının x-user-id'si → RED (kimlik bağlama)", pOther.status);
      const noCookie = await profile(U.free, { "user-agent": UA.firefoxWin });
      ok(noCookie.status === 401, "çerez yok → 401", noCookie.status);
      for (const [lbl, bad] of [["biçim dışı", "<script>x</script>"], ["kısa", "abc"], ["rastgele UUID (sahte)", "11111111-2222-4333-8444-555555555555"]] as const) {
        const r = await profile(U.free, { cookie: `__Host-yasam_sid=${encodeURIComponent(bad)}`, "user-agent": UA.firefoxWin });
        ok(r.status === 401, `bozuk/sahte çerez (${lbl}) → 401, 5xx YOK`, r.status);
      }
      // Pasif hesap
      await q(`UPDATE public.users SET active = false WHERE id = $1`, [U.free]);
      const pIn = await profile(U.free, ck(sidA));
      ok(pIn.status === 401 || pIn.status === 403, "hesap askıya alındı (active=false) → aynı çerez RED", pIn.status);
      await q(`UPDATE public.users SET active = true WHERE id = $1`, [U.free]);
      // Süre dolması (mutlak)
      await q(`UPDATE public.user_sessions SET expires_at = now() - interval '1 second' WHERE session_token = $1`, [sidA]);
      const pExp = await profile(U.free, ck(sidA));
      ok(pExp.status === 401, "mutlak süre doldu (expires_at geçmiş) → 401", pExp.status);
      const gExp = await call(sessionRoute.GET, "/api/auth/session", "GET", null, ck(sidA));
      ok(gExp.json.valid === false, "süresi dolan oturum GET /api/auth/session → valid:false", gExp.json);
    }
    {
      // Boşta kalma (idle) — uzman 7 gün
      const r = await login(EMAIL.free, { "user-agent": UA.firefoxWin });
      const v = cookieValue(getCookie(r.set, "__Host-yasam_sid"));
      await q(`UPDATE public.user_sessions SET last_seen_at = now() - interval '8 days' WHERE session_token = $1`, [v]);
      const p = await profile(U.free, ck(v));
      ok(p.status === 401, "boşta kalma sınırı (uzman 7 gün) aşıldı → 401", p.status);
    }
    {
      // Çıkış: çerezle DELETE (CSRF katmanından geçen) → oturum biter + çerez silinir; eski çerez artık geçersiz.
      const r = await login(EMAIL.free, { "user-agent": UA.firefoxWin });
      const v = cookieValue(getCookie(r.set, "__Host-yasam_sid"));
      const xs = await call(sessionRoute.DELETE, "/api/auth/session", "DELETE", null, { ...ck(v) }, { "sec-fetch-site": "cross-site", origin: "https://evil.example" });
      const afterXs = await sessRow(v);
      ok(afterXs?.is_active === true, "çapraz site DELETE (Origin evil, özel başlık yok) oturumu KAPATAMAZ (logout-CSRF yok)", { s: xs.status, row: afterXs });
      const out = await call(sessionRoute.DELETE, "/api/auth/session", "DELETE", null, { ...ck(v), "x-user-id": U.free });
      const clear = getCookie(out.set, "__Host-yasam_sid");
      ok(out.status === 200 && /Max-Age=0/i.test(clear), "çıkış 200 + Set-Cookie Max-Age=0 (çerez silinir)", { s: out.status, clear: clear.slice(0, 80) });
      const row = await sessRow(v);
      ok(row?.is_active === false && row?.ended_at != null, "çıkış sonrası DB'de oturum kapalı", row);
      const replay = await profile(U.free, ck(v));
      ok(replay.status === 401, "çıkıştan sonra AYNI çerez tekrar oynatılırsa 401 (sunucu tarafı iptal)", replay.status);
    }
    {
      // Başka cihazdan iptal (oturum satırının kapatılması — admin/kullanıcı 'diğer oturumları kapat' ile aynı DB etkisi)
      const r = await login(EMAIL.free, { "user-agent": UA.firefoxWin });
      const v = cookieValue(getCookie(r.set, "__Host-yasam_sid"));
      await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'revoked_by_user' WHERE session_token = $1`, [v]);
      const p = await profile(U.free, ck(v));
      ok(p.status === 401, "başka cihazdan iptal edilen oturumun çerezi → 401", p.status);
      const g = await call(sessionRoute.GET, "/api/auth/session", "GET", null, ck(v));
      ok(g.json.valid === false, "iptal edilen oturum GET → valid:false (istemci giriş ekranına döner)", g.json);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("C) Başlık (eski token) × çerez çakışması ve iki kullanıcının karışmaması");
    {
      await endAll(U.free); await endAll(U.and1);
      const a = await login(EMAIL.free, { "user-agent": UA.chromeWin });
      const va = cookieValue(getCookie(a.set, "__Host-yasam_sid"));
      // İkinci kullanıcı (MFA'sız) — B; kendi tarayıcısında
      const b = await login(EMAIL.and1, { "user-agent": UA.chromeWin });
      const vb = cookieValue(getCookie(b.set, "__Host-yasam_sid"));
      ok(b.status === 200 && vb !== "" && vb !== va, "ikinci kullanıcı kendi çerezini aldı", { s: b.status, code: b.json.code });
      const mix = await profile(U.free, { cookie: `__Host-yasam_sid=${va}`, "x-session-token": vb, "user-agent": UA.chromeWin });
      ok(mix.status === 401, "A çerezi + B başlığı (iki farklı kullanıcı) → 401 (identity_conflict, fail-closed)", mix.status);
      const mix2 = await profile(U.and1, { cookie: `__Host-yasam_sid=${va}`, "x-session-token": vb, "user-agent": UA.chromeWin });
      ok(mix2.status === 401, "aynı karışım B kimliğiyle de 401 (hangi kimliğin seçildiği belirsiz kalmıyor)", mix2.status);
      // A'nın eski (iptal edilmiş) başlık tokenı + geçerli A çerezi → primary'de iki kimlik bilgisi de geçerli OLMALI
      const old = await login(EMAIL.free, { "user-agent": UA.chromeWin });
      const vOld = cookieValue(getCookie(old.set, "__Host-yasam_sid"));
      await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE session_token = $1`, [vOld]);
      const stale = await profile(U.free, { cookie: `__Host-yasam_sid=${va}`, "x-session-token": vOld, "user-agent": UA.chromeWin });
      ok(stale.status === 401, "geçerli çerez + iptal edilmiş eski başlık tokenı → 401 (iptal edilen bilgi diğeriyle BYPASS EDİLEMEZ)", stale.status);
      const staleC = await profile(U.free, { cookie: `__Host-yasam_sid=${vOld}`, "x-session-token": va, "user-agent": UA.chromeWin });
      ok(staleC.status === 401, "iptal edilmiş çerez + geçerli başlık → 401", staleC.status);
      const same = await profile(U.free, { cookie: `__Host-yasam_sid=${va}`, "x-session-token": va, "user-agent": UA.chromeWin });
      ok(same.status === 200, "aynı değer çerez + başlık → 200 (geçiş penceresi uyumu)", same.status);
      await endAll(U.and1);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("D) CSRF — yalnız çerezle kimliklenen DURUM DEĞİŞTİREN istek (merkezi guard)");
    {
      await endAll(U.free);
      const r = await login(EMAIL.free, { "user-agent": UA.chromeWin });
      const v = cookieValue(getCookie(r.set, "__Host-yasam_sid"));
      const c = { cookie: `__Host-yasam_sid=${v}`, "user-agent": UA.chromeWin };
      ok(await guardPost({ ...c, "x-user-id": U.free }) === 200, "aynı köken + Origin www + özel başlık → guard geçer");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }) === 403, "Origin evil.example → 403");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { origin: "https://yasamsistemi.com", "sec-fetch-site": "same-site" }) === 403, "Origin apex (www olmayan) → 403 (izinli liste yalnız www)");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { origin: "http://www.yasamsistemi.com", "sec-fetch-site": "cross-site" }) === 403, "Origin http:// (HTTPS değil) → 403");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { origin: "null", "sec-fetch-site": "cross-site" }) === 403, "Origin null (sandbox/iframe) → 403");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { origin: "https://www.yasamsistemi.com.evil.example", "sec-fetch-site": "cross-site" }) === 403, "Origin önek benzeri alan adı → 403");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { "sec-fetch-site": "cross-site" }) === 403, "Origin yok + Sec-Fetch-Site cross-site → 403");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { "sec-fetch-site": "same-site" }) === 403, "Origin yok + Sec-Fetch-Site same-site → 403");
      ok(await guardPost({ ...c, "x-user-id": U.free }, {}) === 403, "Origin yok + Sec-Fetch-Site yok → 403 (eksik başlık kör kabul edilmez)");
      ok(await guardPost({ ...c, "x-user-id": U.free }, { "sec-fetch-site": "same-origin" }) === 200, "Origin yok + Sec-Fetch-Site same-origin → geçer");
      ok(await guardPost({ ...c }, {}) === 401 || await guardPost({ ...c }, {}) === 403, "özel başlık (x-user-id) yok → RED (form gönderimi taklit edilemez)");
      // Güvenli metot: çapraz siteden GET guard'a çerezle ulaşırsa (SameSite=Strict tarayıcıda zaten göndermez) veri değişmez.
      const g = await profile(U.free, c, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
      ok(g.status === 200 || g.status === 401, `çapraz site GET (tarayıcı SameSite=Strict ile çerezi zaten göndermez; sunucu GET'te durum değiştirmez) → ${g.status}`);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("E) MFA tamamlanmadan tam oturum YOK (MFA zorunlu uzman, web)");
    {
      await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.exp}'; SELECT set_config('yasam.mfa_policy','off',false);`);
      await endAll(U.exp);
      const r = await login(EMAIL.exp, { "user-agent": UA.firefoxWin });
      const mfaC = getCookie(r.set, "__Host-yasam_mfa");
      const ch = String(r.json.challengeId ?? "");
      ok(r.status === 202 && r.json.code === "MFA_REQUIRED", "doğru parola → 202 MFA_REQUIRED", { s: r.status, code: r.json.code });
      ok(getCookie(r.set, "__Host-yasam_sid") === "" && !("sessionToken" in r.json) && !("sessionCookie" in r.json) && !("user" in r.json),
        "parola adımında oturum çerezi / anahtar / kullanıcı satırı YOK");
      ok(/HttpOnly/i.test(mfaC) && /Secure/i.test(mfaC) && /SameSite=Strict/i.test(mfaC) && !("mfaBinding" in r.json), "bekleyen bilet bağlaması yalnız HttpOnly __Host-yasam_mfa çerezinde (gövdede yok)");
      ok(Number((await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.exp])).rows[0].n) === 0, "DB'de aktif oturum satırı YOK");
      const binding = cookieValue(mfaC);
      const asSid = await profile(U.exp, { cookie: `__Host-yasam_sid=${binding}`, "user-agent": UA.firefoxWin });
      ok(asSid.status === 401, "bekleyen bilet bağlaması oturum çerezi olarak kullanılamaz → 401", asSid.status);
      const asHdr = await profile(U.exp, { "x-session-token": ch, "user-agent": UA.firefoxWin });
      ok(asHdr.status === 401, "challengeId oturum anahtarı olarak kullanılamaz → 401", asHdr.status);
      const asBoth = await profile(U.exp, { cookie: `__Host-yasam_mfa=${binding}`, "user-agent": UA.firefoxWin });
      ok(asBoth.status === 401, "yalnız bekleyen bilet çereziyle korumalı uç → 401", asBoth.status);
      const early = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { cookie: `__Host-yasam_mfa=${binding}`, "user-agent": UA.firefoxWin });
      ok(early.status === 401 && getCookie(early.set, "__Host-yasam_sid") === "", "ikinci adım doğrulanmadan tamamlama → 401, çerez YOK", { s: early.status, code: early.json.code });
      // İkinci faktör doğrulandı (test süper kullanıcısı; uygulama kodu bunu yapamaz — f2b-routes'ta kanıtlı)
      await q(`SELECT public.auth_mfa_mark_verified($1, 'email_otp')`, [ch]);
      const other = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { "user-agent": UA.firefoxWin });
      ok(other.status === 401 && getCookie(other.set, "__Host-yasam_sid") === "", "bilet bağlaması olmayan BAŞKA tarayıcı challengeId ile tamamlayamaz → 401", other.status);
      const wrongBind = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { cookie: `__Host-yasam_mfa=${"A".repeat(43)}`, "user-agent": UA.firefoxWin });
      ok(wrongBind.status === 401, "yanlış bağlama çereziyle tamamlama → 401", wrongBind.status);
      const xs = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { cookie: `__Host-yasam_mfa=${binding}`, "user-agent": UA.firefoxWin }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
      ok(xs.status === 403, "çapraz site tamamlama (login-CSRF) → 403", xs.status);
      const done = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { cookie: `__Host-yasam_mfa=${binding}`, "user-agent": UA.firefoxWin });
      const sid = cookieValue(getCookie(done.set, "__Host-yasam_sid"));
      ok(done.status === 200 && done.json.sessionCookie === true && !("sessionToken" in done.json) && sid !== "" && !leaks(done, sid),
        "MFA sonrası 200 + HttpOnly oturum çerezi; gövdede anahtar YOK", { s: done.status, k: Object.keys(done.json) });
      ok(/Max-Age=0/i.test(getCookie(done.set, "__Host-yasam_mfa")), "tamamlamada bekleyen bilet çerezi silindi");
      ok((await sessRow(sid))?.mfa_method === "email_otp", "oturum satırı MFA kanıtı taşıyor (mfa_method)");
      ok((await profile(U.exp, { cookie: `__Host-yasam_sid=${sid}`, "user-agent": UA.firefoxWin })).status === 200, "MFA'lı çerezle korumalı uç 200");
      const replay = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { cookie: `__Host-yasam_mfa=${binding}`, "user-agent": UA.firefoxWin });
      ok(replay.status === 401 && getCookie(replay.set, "__Host-yasam_sid") === "", "aynı bilet ikinci kez → 401 (tek kullanım), ikinci oturum YOK", { s: replay.status, code: replay.json.code });
      // Süresi dolmuş doğrulanmış bilet tam yetkiye YÜKSELMEZ
      const r2 = await login(EMAIL.exp, { "user-agent": UA.firefoxWin });
      const ch2 = String(r2.json.challengeId ?? "");
      const b2 = cookieValue(getCookie(r2.set, "__Host-yasam_mfa"));
      await q(`SELECT public.auth_mfa_mark_verified($1, 'email_otp')`, [ch2]);
      await q(`UPDATE public.auth_mfa_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE id = $1`, [ch2]);
      const late = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch2 }, { cookie: `__Host-yasam_mfa=${b2}`, "user-agent": UA.firefoxWin });
      ok(late.status === 401 && getCookie(late.set, "__Host-yasam_sid") === "", "süresi dolmuş (doğrulanmış olsa da) bilet → 401, oturum YOK", { s: late.status, code: late.json.code });
      // Kanal: web'de açılan bilet, resmî uygulama başlıklarıyla tamamlanamaz (bağlama kanalı)
      const r3 = await login(EMAIL.exp, { "user-agent": UA.firefoxWin });
      const ch3 = String(r3.json.challengeId ?? "");
      await q(`SELECT public.auth_mfa_mark_verified($1, 'email_otp')`, [ch3]);
      const cross = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch3 }, { ...APP, "x-yasam-mfa-binding": cookieValue(getCookie(r3.set, "__Host-yasam_mfa")) });
      ok(cross.status === 401 && !("sessionToken" in cross.json), "web bileti uygulama kanalından tamamlanıp gövdede anahtar ALINAMAZ", { s: cross.status, code: cross.json.code });
      // MFA zorunlu kullanıcıya MFA'sız oturum DB düzeyinde de açılamaz
      let dbBlocked = false;
      try {
        await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active) VALUES ($1, gen_random_uuid()::text, true)`, [U.exp]);
      } catch { dbBlocked = true; }
      ok(dbBlocked, "MFA zorunlu kullanıcıya MFA kanıtsız user_sessions satırı DB tarafından REDDEDİLİR");
      await endAll(U.exp);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("F) Android (resmî uygulama, varsayılan 'header' taşıması) — geriye uyum");
    {
      await endAll(U.free);
      const a = await login(EMAIL.free, APP);
      const tok = String(a.json.sessionToken ?? "");
      ok(a.status === 200 && tok !== "" && getCookie(a.set, "__Host-yasam_sid") === "", "resmî uygulama girişi: token gövdede (1.9.x/2.0.0 sözleşmesi), çerez YOK");
      ok((await profile(U.free, { ...APP, "x-session-token": tok })).status === 200, "uygulama başlık tokenıyla korumalı uç 200");
      ok((await profile(U.free, { ...APP, cookie: `__Host-yasam_sid=${tok}` })).status === 401, "uygulama isteğinde çerez YOK SAYILIR (yalnız başlık)");
      ok((await sessRow(tok))?.client_channel === "android_app", "oturum kanalı android_app");
      await endAll(U.free);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("G) Kanal taklidi — sahte başlıklarla web istemcisine anahtar döndürülebilir mi?");
    {
      await endAll(U.free);
      for (const [lbl, h] of [
        ["Chrome + x-yasam-client: android", { "user-agent": UA.chromeWin, "x-yasam-client": "android" }],
        ["Chrome + X-Requested-With: com.yasamsistemi.app", { "user-agent": UA.chromeWin, "x-requested-with": "com.yasamsistemi.app" }],
        ["Firefox + x-yasam-client + X-Requested-With (UA değiştirilmeden)", { "user-agent": UA.firefoxWin, "x-yasam-client": "android", "x-requested-with": "com.yasamsistemi.app" }],
        ["Safari + x-yasam-client + X-Requested-With (UA değiştirilmeden)", { "user-agent": UA.safariMac, "x-yasam-client": "android", "x-requested-with": "com.yasamsistemi.app" }],
      ] as const) {
        const r = await login(EMAIL.free, h);
        ok(r.status === 200 && !("sessionToken" in r.json) && getCookie(r.set, "__Host-yasam_sid") !== "", `${lbl} → HttpOnly çerez, gövdede anahtar YOK`, { k: Object.keys(r.json) });
        await endAll(U.free);
      }
      // Firefox / WebKit sayfa JS'i UA'yı da değiştirebiliyor (ölçüldü) → iki sinyalin ikisi de sahte üretilebilir.
      const f = await login(EMAIL.free, FORGED_FROM_FIREFOX_JS);
      gap(typeof f.json.sessionToken === "string", "Firefox/WebKit JS'inin üretebildiği (UA `; wv)` + X-Requested-With) giriş isteği gövdede oturum anahtarı ALIR", { k: Object.keys(f.json) });
      await endAll(U.free);
      // MFA'lı ele geçirme: XSS, kullanıcının kendi parola+MFA akışına bu başlıkları ekler.
      await endAll(U.exp);
      const m = await login(EMAIL.exp, FORGED_FROM_FIREFOX_JS);
      const ch = String(m.json.challengeId ?? "");
      const bind = String(m.json.mfaBinding ?? "");
      gap(bind !== "", "aynı sahte kanal MFA bilet bağlamasını gövdede (JS'e açık) alır", { k: Object.keys(m.json) });
      if (ch && bind) {
        await q(`SELECT public.auth_mfa_mark_verified($1, 'qr_device')`, [ch]);
        const d = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { ...FORGED_FROM_FIREFOX_JS, "x-yasam-mfa-binding": bind });
        gap(typeof d.json.sessionToken === "string", "kullanıcı ikinci adımı onaylayınca sahte kanal tam oturum anahtarını gövdede ALIR (taşınabilir, 30 gün)", { s: d.status, k: Object.keys(d.json) });
      }
      await endAll(U.exp);
      // Kapatma yolu (F2-K'da kodlu, opt-in): resmî uygulama da çerez taşımasına geçerse taklit anahtar kazandırmaz.
      process.env.ANDROID_APP_SESSION_TRANSPORT = "cookie";
      const fc = await login(EMAIL.free, FORGED_FROM_FIREFOX_JS);
      ok(fc.status === 200 && !("sessionToken" in fc.json) && /HttpOnly/i.test(getCookie(fc.set, "__Host-yasam_sid")),
        "ANDROID_APP_SESSION_TRANSPORT=cookie iken aynı sahte istek yalnız HttpOnly çerez alır (boşluk kapanır)", { k: Object.keys(fc.json) });
      delete process.env.ANDROID_APP_SESSION_TRANSPORT;
      await endAll(U.free);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("H) Modlar ve geri dönüş anahtarları (off / canary / shadow / primary / kill-switch)");
    {
      const modeLogin = async () => {
        await endAll(U.free);
        const r = await login(EMAIL.free, { "user-agent": UA.chromeWin });
        const c = getCookie(r.set, "__Host-yasam_sid");
        return { r, c, v: cookieValue(c), tok: String(r.json.sessionToken ?? "") };
      };
      process.env.SESSION_COOKIE_MODE = "off";
      let m = await modeLogin();
      ok(m.c === "" && m.tok !== "", "off: çerez YOK, token gövdede (H1 öncesi davranış)");
      ok((await profile(U.free, { cookie: `__Host-yasam_sid=${m.tok}`, "user-agent": UA.chromeWin })).status === 401, "off: çerez kimlik kaynağı DEĞİL");
      ok(readWebSessionTransport() === "header", "off: istemci taşıması header");

      process.env.SESSION_COOKIE_MODE = "canary";
      process.env.SESSION_COOKIE_CANARY_USER_IDS = U.owner;
      m = await modeLogin();
      ok(m.c === "" && m.tok !== "", "canary (kullanıcı listede değil): çerez YOK");
      process.env.SESSION_COOKIE_CANARY_USER_IDS = U.free;
      m = await modeLogin();
      ok(m.c !== "" && m.tok !== "", "canary (listede): çerez + token (gözlem; header birincil)");
      ok((await profile(U.free, { cookie: `__Host-yasam_sid=${m.v}`, "user-agent": UA.chromeWin })).status === 401, "canary: yalnız çerez → 401 (çerez kimlik kaynağı DEĞİL)");
      delete process.env.SESSION_COOKIE_CANARY_USER_IDS;

      process.env.SESSION_COOKIE_MODE = "shadow";
      m = await modeLogin();
      ok(m.c !== "" && m.tok !== "", "shadow: herkese çerez + token");
      ok((await profile(U.free, { cookie: `__Host-yasam_sid=${m.v}`, "user-agent": UA.chromeWin })).status === 401, "shadow: yalnız çerez → 401");
      ok((await profile(U.free, { "x-session-token": m.tok, cookie: `__Host-yasam_sid=${m.v}`, "user-agent": UA.chromeWin })).status === 200, "shadow: header + çerez → 200");
      ok(readWebSessionTransport() === "header", "shadow: istemci taşıması header");

      process.env.SESSION_COOKIE_MODE = "primary";
      process.env.SESSION_COOKIE_WEB_HEADER = "on";
      m = await modeLogin();
      ok(m.c !== "" && m.tok !== "", "primary + kill-switch: çerez + token gövdede (H5 davranışı)");
      ok(readWebSessionTransport() === "header", "primary + kill-switch: istemci taşıması header");
      ok((await profile(U.free, { cookie: `__Host-yasam_sid=${m.v}`, "user-agent": UA.chromeWin })).status === 200, "primary + kill-switch: çerez hâlâ geçerli (kill-switch kullanıcıyı çıkarmaz)");
      delete process.env.SESSION_COOKIE_WEB_HEADER;
      ok(readWebSessionTransport() === "cookie", "primary (kill-switch kapalı): istemci taşıması cookie");
      // primary'ye kill-switch'ten geri dönüş: kill-switch döneminde alınan token+çerez aynı oturum → çalışır
      ok((await profile(U.free, { cookie: `__Host-yasam_sid=${m.v}`, "user-agent": UA.chromeWin })).status === 200, "kill-switch kapatılınca aynı çerez çalışmaya devam eder");

      // Yanlış yapılandırma → güvenli varsayılan
      for (const bad of ["PRIMARY ", "cookie_only", "on", ""]) {
        process.env.SESSION_COOKIE_MODE = bad;
        const { readSessionCookieMode } = await import("@/lib/auth/sessionCookie");
        const got = readSessionCookieMode();
        ok(bad.trim().toLowerCase() === "primary" ? got === "primary" : got === "off", `SESSION_COOKIE_MODE="${bad}" → ${got}`);
      }
      // Kritik geri dönüş tuzağı: primary'den off'a inmek çerez-only web kullanıcılarını çıkışa düşürür.
      process.env.SESSION_COOKIE_MODE = "primary";
      m = await modeLogin();
      process.env.SESSION_COOKIE_MODE = "off";
      const afterOff = await profile(U.free, { cookie: `__Host-yasam_sid=${m.v}`, "user-agent": UA.chromeWin });
      ok(afterOff.status === 401, "BİLGİ: primary→off geri dönüşünde çerez-only web oturumu 401 olur (toplu çıkış) — geri dönüş YALNIZ kill-switch ile yapılmalı", afterOff.status);
      resetEnv();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("J) ANDROID_APP_SESSION_TRANSPORT=cookie — taklit edilen kanal hiçbir sır ALAMAZ; resmî uygulama uyumu");
    {
      process.env.ANDROID_APP_SESSION_TRANSPORT = "cookie";
      await endAll(U.free); await endAll(U.exp);
      // 1) Firefox/WebKit JS'inin üretebildiği tam taklit (UA + X-Requested-With + istemci ipucu)
      const FULL = { ...FORGED_FROM_FIREFOX_JS, "x-yasam-client": "android" };
      const f = await login(EMAIL.free, FULL);
      const fv = cookieValue(getCookie(f.set, "__Host-yasam_sid"));
      ok(f.status === 200 && !("sessionToken" in f.json) && /HttpOnly/i.test(getCookie(f.set, "__Host-yasam_sid")) && !leaks(f, fv),
        "tam taklit girişi: gövdede anahtar YOK, yalnız HttpOnly çerez", { k: Object.keys(f.json) });
      await endAll(U.free);
      // 2) MFA: bilet bağlama sırrı gövdede DÖNMEZ; tamamlama gövdede anahtar vermez
      const m = await login(EMAIL.exp, FULL);
      const mc = getCookie(m.set, "__Host-yasam_mfa");
      ok(m.status === 202 && !("mfaBinding" in m.json) && /HttpOnly/i.test(mc), "tam taklit MFA girişi: bağlama sırrı gövdede YOK, yalnız HttpOnly çerezde", { k: Object.keys(m.json) });
      const ch = String(m.json.challengeId ?? "");
      await q(`SELECT public.auth_mfa_mark_verified($1, 'qr_device')`, [ch]);
      const hdrOnly = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { ...FULL, "x-yasam-mfa-binding": "A".repeat(43) });
      ok(hdrOnly.status === 401 && !("sessionToken" in hdrOnly.json), "başlıkla verilen bağlama (x-yasam-mfa-binding) çerez kipinde KABUL EDİLMEZ", { s: hdrOnly.status });
      const d = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { ...FULL, cookie: `__Host-yasam_mfa=${cookieValue(mc)}` });
      const dv = cookieValue(getCookie(d.set, "__Host-yasam_sid"));
      ok(d.status === 200 && !("sessionToken" in d.json) && dv !== "" && !leaks(d, dv), "tam taklit MFA tamamlama: gövdede anahtar YOK, HttpOnly çerez", { s: d.status, k: Object.keys(d.json) });
      await endAll(U.exp);
      // 3) Resmî uygulama (emülasyon): çerezle tam çalışır
      const a = await login(EMAIL.free, APP);
      const av = cookieValue(getCookie(a.set, "__Host-yasam_sid"));
      ok(a.status === 200 && !("sessionToken" in a.json) && av !== "", "resmî uygulama girişi: HttpOnly çerez (WebView CookieManager), gövdede anahtar YOK");
      ok((await sessRow(av))?.client_channel === "android_app", "kanal android_app korunur (oturum politikası / F2-J sınırları aynı)");
      ok((await profile(U.free, { ...APP, cookie: `__Host-yasam_sid=${av}` })).status === 200, "resmî uygulama çerezle korumalı uç 200");
      const out = await call(sessionRoute.DELETE, "/api/auth/session", "DELETE", null, { ...APP, cookie: `__Host-yasam_sid=${av}`, "x-user-id": U.free });
      ok(out.status === 200 && (await sessRow(av))?.is_active === false, "resmî uygulama çerezle çıkış: oturum kapandı");
      // 4) Geçiş: bayrak AÇILMADAN önce açılmış (token'lı) android_app oturumu çereze yükseltilir (habersiz çıkış yok)
      delete process.env.ANDROID_APP_SESSION_TRANSPORT;
      const legacy = await login(EMAIL.free, APP);
      const lt = String(legacy.json.sessionToken ?? "");
      ok(lt !== "", "hazırlık: header kipinde açılmış android_app oturumu (token WebView localStorage'da)");
      const bootHeaderMode = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { ...APP, "x-session-token": lt });
      ok(bootHeaderMode.status === 403 && getCookie(bootHeaderMode.set, "__Host-yasam_sid") === "", "header kipinde android_app oturumu çereze ÇEVRİLMEZ (bugünkü davranış)", bootHeaderMode.status);
      process.env.ANDROID_APP_SESSION_TRANSPORT = "cookie";
      const noBoot = await profile(U.free, { ...APP });
      ok(noBoot.status === 401, "bayrak açılınca başlıksız eski uygulama isteği yükseltme olmadan 401 (istemci artık çerez kipinde)", noBoot.status);
      const boot = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { ...APP, "x-session-token": lt });
      const bc = getCookie(boot.set, "__Host-yasam_sid");
      ok(boot.status === 200 && cookieValue(bc) === lt && /HttpOnly/i.test(bc) && !leaks(boot, lt), "çerez kipinde mevcut android_app oturumu AYNI oturumla HttpOnly çereze taşındı (gövdede anahtar yok)", { s: boot.status });
      ok((await profile(U.free, { ...APP, cookie: `__Host-yasam_sid=${lt}` })).status === 200, "yükseltilen oturum çerezle 200 (kullanıcı çıkışa düşmedi)");
      const xsBoot = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { ...APP, "x-session-token": lt }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
      ok(xsBoot.status === 403, "çapraz site yükseltme isteği → 403", xsBoot.status);
      const fake = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { ...APP, "x-session-token": "11111111-2222-4333-8444-555555555555" });
      ok(fake.status === 401 && getCookie(fake.set, "__Host-yasam_sid") === "", "geçersiz token ile yükseltme → 401, çerez YOK", fake.status);
      // 5) F2-A öncesi SÜRESİZ android_app oturumu: çerez en çok 30 gün; geçerlilik DB'de
      // F2-A öncesi oturum taklidi: DB koruması (user_sessions_policy_guard) expires_at değişimini reddeder → YALNIZ
      // sentetik test DB'sinde, tek güncelleme için tetikleyiciler atlanır.
      await q(`SET session_replication_role = replica; UPDATE public.user_sessions SET expires_at = NULL WHERE session_token = '${lt}'; SET session_replication_role = origin;`);
      const boot2 = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { ...APP, "x-session-token": lt });
      const ma = Number(/Max-Age=(\d+)/i.exec(getCookie(boot2.set, "__Host-yasam_sid"))?.[1] ?? "-1");
      ok(boot2.status === 200 && ma === WEB_SESSION_COOKIE_MAX_AGE_CAP, `süresiz android_app oturumu çereze taşındı (Max-Age = 30 gün tavanı: ${ma})`, { s: boot2.status });
      await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'revoked_by_user' WHERE session_token = $1`, [lt]);
      ok((await profile(U.free, { ...APP, cookie: `__Host-yasam_sid=${lt}` })).status === 401, "yükseltilmiş oturum iptal edilince çerez 401 (sunucu tarafı)");
      // 6) Web (android olmayan) oturumu: davranış değişmedi
      const w = await login(EMAIL.free, { "user-agent": UA.chromeWin });
      ok(w.status === 200 && !("sessionToken" in w.json), "web girişi çerez kipinden etkilenmedi");
      await endAll(U.free);
      delete process.env.ANDROID_APP_SESSION_TRANSPORT;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("K) Eski token → çerez taşıması: başka kullanıcının çerez oturumu EZİLMEZ");
    {
      await endAll(U.free); await endAll(U.and1);
      // A: kill-switch döneminde (header) açılmış token — tarayıcıda localStorage'da kalmış
      process.env.SESSION_COOKIE_WEB_HEADER = "on";
      const a = await login(EMAIL.free, { "user-agent": UA.chromeWin });
      const tokA = String(a.json.sessionToken ?? "");
      delete process.env.SESSION_COOKIE_WEB_HEADER;
      ok(tokA !== "", "hazırlık: A'nın eski header token'ı");
      // B aynı tarayıcıda çerezle giriş yapmış
      const b = await login(EMAIL.and1, { "user-agent": UA.chromeWin });
      const cB = cookieValue(getCookie(b.set, "__Host-yasam_sid"));
      ok(cB !== "" && cB !== tokA, "hazırlık: B'nin geçerli çerez oturumu");
      const boot = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { "user-agent": UA.chromeWin, "x-session-token": tokA, cookie: `__Host-yasam_sid=${cB}` });
      ok(boot.status === 409 && getCookie(boot.set, "__Host-yasam_sid") === "", "A'nın token'ıyla taşıma B'nin çerezini EZMEZ (409, Set-Cookie yok)", { s: boot.status });
      ok((await profile(U.and1, { cookie: `__Host-yasam_sid=${cB}`, "user-agent": UA.chromeWin })).status === 200, "B'nin oturumu sürüyor");
      // Aynı kullanıcının başka oturumu (ör. eski sekme) → taşıma serbest (kimlik değişmez)
      const a2 = await login(EMAIL.free, { "user-agent": UA.chromeWin });
      const cA2 = cookieValue(getCookie(a2.set, "__Host-yasam_sid"));
      const same = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { "user-agent": UA.chromeWin, "x-session-token": tokA, cookie: `__Host-yasam_sid=${cA2}` });
      ok(same.status === 200, "aynı kullanıcının başka oturumu: taşıma izinli (kimlik değişmez)", same.status);
      // Mevcut çerez geçersizse (iptal) → taşıma serbest (çerez yok sayılır)
      await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE session_token = $1`, [cB]);
      const stale = await call(bootRoute.POST, "/api/auth/session/cookie", "POST", {}, { "user-agent": UA.chromeWin, "x-session-token": tokA, cookie: `__Host-yasam_sid=${cB}` });
      ok(stale.status === 200, "mevcut çerez iptal edilmişse taşıma çalışır", stale.status);
      await endAll(U.free); await endAll(U.and1);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    section("I) Admin sınırları (web)");
    {
      await endAll(U.owner);
      const a = await login(EMAIL.owner, { "user-agent": UA.chromeWin });
      const ac = getCookie(a.set, "__Host-yasam_sid");
      if (a.status === 202 && a.json.code === "MFA_REQUIRED") {
        ok(ac === "", "admin (MFA zorunlu) parola adımında çerez YOK");
      } else {
        const maxAge = Number(/Max-Age=(\d+)/i.exec(ac)?.[1] ?? "-1");
        ok(a.status === 200 && maxAge > 0 && maxAge <= 24 * 3600, `admin web çerezi Max-Age ≤ 24 saat (${maxAge})`, { s: a.status, code: a.json.code });
        // Owner acil kararı (2026-10-04, sessionSecurity.ts): admin ikinci web onayı DEVRE DIŞI → doğrudan aktif oturum.
        const second = await login(EMAIL.owner, { "user-agent": UA.firefoxWin });
        const sc = getCookie(second.set, "__Host-yasam_sid");
        ok(second.status === 200 && /HttpOnly/i.test(sc) && !("sessionToken" in second.json) && !("pendingToken" in second.json),
          "admin ikinci web girişi (Owner 10-04 kararı: onay yok) → HttpOnly çerez; gövdede sessionToken/pendingToken YOK", { s: second.status, k: Object.keys(second.json) });
        const va = cookieValue(ac), vb = cookieValue(sc);
        ok((await profile(U.owner, { cookie: `__Host-yasam_sid=${va}`, "user-agent": UA.chromeWin })).status === 200
          && (await profile(U.owner, { cookie: `__Host-yasam_sid=${vb}`, "user-agent": UA.firefoxWin })).status === 200, "iki admin web oturumu bağımsız geçerli");
        await q(`UPDATE public.user_sessions SET last_seen_at = now() - interval '3 hours' WHERE session_token = $1`, [va]);
        ok((await profile(U.owner, { cookie: `__Host-yasam_sid=${va}`, "user-agent": UA.chromeWin })).status === 401, "admin boşta kalma sınırı (2 saat) aşıldı → 401");
      }
      await endAll(U.owner);
    }
  } finally {
    await db.close();
  }
  console.log(`\nhttponly-nihai: ${pass} PASS, ${fail} FAIL, ${open} AÇIK (bilinen boşluk yeniden üretildi)`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
