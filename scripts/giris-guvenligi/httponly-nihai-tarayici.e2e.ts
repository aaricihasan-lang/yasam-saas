/**
 * HTTPONLY NİHAİ — GERÇEK TARAYICI (Chromium / Firefox / WebKit) + GERÇEK HTTPS + gerçek route'lar + gerçek PostgreSQL.
 * Production'a SIFIR temas. Next sunucusu yerine ince bir HTTPS köprüsü route handler'larını doğrudan çalıştırır
 * (tarayıcının çerez saklama / gönderme / SameSite / HttpOnly davranışı GERÇEKTİR; Next yönlendirme katmanı DEĞİLDİR).
 *
 * Çalıştır: HTTPONLY_TLS_DIR=<cert.pem+key.pem> PLAYWRIGHT_REQUIRE=<playwright paketi olan package.json> \
 *           npx tsx scripts/giris-guvenligi/httponly-nihai-tarayici.e2e.ts
 * Uygulama kökeni https://localhost:<port>; saldırgan kökeni https://127.0.0.1:<port2> (farklı site).
 * Kipler (saldırı öncesi / sonrası):
 *   F2K_A3_WITHOUT_FIX=1                 → A3 öncesi (main) kural: tek başına istemci ipucu token yolu açar (FAIL beklenir).
 *   (varsayılan)                         → F2-K iki sinyal + Android "header" taşıması: Firefox/WebKit taklidi AÇIK kalır.
 *   ANDROID_APP_SESSION_TRANSPORT=cookie → token yolu yok: hiçbir tarayıcı taklitle anahtar / bağlama sırrı OKUYAMAZ.
 */
import Module, { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
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
let notTested = 0;
/** Ortam sınırı: bu motor/işletim sistemi kombinasyonunda davranış ölçülemez (PASS SAYILMAZ). */
function envLimit(label: string, extra?: unknown): void {
  notTested++; console.log(`  NOT TESTED (ortam sınırı) ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 200)}` : ""}`);
}
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
function gap(reproduced: boolean, label: string, extra?: unknown): void {
  if (reproduced) { open++; console.log(`  AÇIK ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 200)}` : ""}`); }
  else { pass++; console.log(`  PASS (kapalı) ${label}`); }
}

const APP_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0 Mobile Safari/537.36";
const PORT = 4643;
const EVIL_PORT = 4644;
const ORIGIN = `https://localhost:${PORT}`;
const EVIL = `https://127.0.0.1:${EVIL_PORT}`;

type Seen = { path: string; method: string; sid: boolean; origin: string | null; sfs: string | null; status?: number };

async function main() {
  const tlsDir = process.env.HTTPONLY_TLS_DIR ?? "";
  const tls = { cert: fs.readFileSync(path.join(tlsDir, "cert.pem")), key: fs.readFileSync(path.join(tlsDir, "key.pem")) };
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium, firefox, webkit } = req2("playwright") as typeof import("playwright");

  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const { installA3MutationIfRequested, assertA3MutationActive } = await import("./a3Mutation");
  if (installA3MutationIfRequested()) await assertA3MutationActive();
  const cookieTransport = process.env.ANDROID_APP_SESSION_TRANSPORT === "cookie";
  console.log(`KİP: ${process.env.F2K_A3_WITHOUT_FIX === "1" ? "NEGATİF (A3 öncesi)" : "F2-K"} · Android taşıması: ${cookieTransport ? "cookie" : "header"}`);
  /** Taklitle sır okunabiliyor mu: çerez kipinde KESİN kapalı olmalı (FAIL); header kipinde bilinen açık (AÇIK). */
  const spoofCheck = (readable: boolean, label: string, extra?: unknown) =>
    cookieTransport ? ok(!readable, label.replace("OKUYABİLİYOR", "OKUYAMIYOR"), extra) : gap(readable, label, extra);
  const db = await startF2cDb({ withF2k: true });
  const { admin } = db;
  const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "httponly-tarayici", SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "httponly-tarayici-rate", LOGIN_IP_PEPPER: "httponly-tarayici-ip",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
  });
  const sessionRoute = await import("@/app/api/auth/session/route");
  const completeRoute = await import("@/app/api/auth/mfa/complete/route");
  const profileRoute = await import("@/app/api/auth/profile/route");
  const bootRoute = await import("@/app/api/auth/session/cookie/route");
  const { verifyUserRequest } = await import("@/lib/auth/userGuard");
  await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.exp}'; SELECT set_config('yasam.mfa_policy','off',false);`);

  let seen: Seen[] = [];
  let ipSeq = 1;
  const routes: Record<string, (r: NextRequest) => Promise<Response>> = {
    "POST /api/auth/session": sessionRoute.POST, "GET /api/auth/session": sessionRoute.GET, "DELETE /api/auth/session": sessionRoute.DELETE,
    "POST /api/auth/mfa/complete": completeRoute.POST, "GET /api/auth/profile": profileRoute.GET, "POST /api/auth/session/cookie": bootRoute.POST,
    "POST /guard": async (r) => {
      const g = await verifyUserRequest(r);
      return g.ok ? Response.json({ ok: true }) : g.response;
    },
  };
  const page = (title: string, body = "") => `<!doctype html><meta charset="utf-8"><title>${title}</title><body>${body}</body>`;
  const appServer = https.createServer(tls, async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const url = new URL(req.url ?? "/", ORIGIN);
    const key = `${req.method} ${url.pathname}`;
    const cookie = String(req.headers.cookie ?? "");
    const rec: Seen = { path: url.pathname, method: String(req.method), sid: /__Host-yasam_sid=/.test(cookie), origin: (req.headers.origin as string) ?? null, sfs: (req.headers["sec-fetch-site"] as string) ?? null };
    seen.push(rec);
    res.on("finish", () => { rec.status = res.statusCode; });
    if (url.pathname === "/" || url.pathname === "/sekme") { res.setHeader("content-type", "text/html"); res.end(page("uygulama")); return; }
    const h = routes[key];
    if (!h) { res.statusCode = 404; res.end(); return; }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(", "));
    headers.set("x-real-ip", `198.18.0.${ipSeq++ % 250}`);
    const body = chunks.length && req.method !== "GET" && req.method !== "DELETE" ? Buffer.concat(chunks) : undefined;
    try {
      const out = await h(new NextRequest(url, { method: req.method, headers, body }));
      res.statusCode = out.status;
      out.headers.forEach((v, k) => { if (k !== "set-cookie") res.setHeader(k, v); });
      const sc = (out.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      if (sc.length) res.setHeader("set-cookie", sc);
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) {
      res.statusCode = 500; res.end(String(e));
    }
  });
  const evilServer = https.createServer(tls, (req, res) => {
    res.setHeader("content-type", "text/html");
    // Saldırgan sayfası: çerezli çapraz site istekleri (form POST, no-cors fetch, üst düzey gezinme)
    res.end(page("saldirgan", `
      <form id="f" method="POST" action="${ORIGIN}/guard" enctype="text/plain"><input name='{"a":"' value='1"}'></form>
      <script>
        fetch("${ORIGIN}/guard", { method: "POST", mode: "no-cors", credentials: "include", body: "x" }).catch(() => {});
        fetch("${ORIGIN}/api/auth/session", { method: "DELETE", mode: "no-cors", credentials: "include" }).catch(() => {});
      </script>`));
  });
  await new Promise<void>((r) => appServer.listen(PORT, r));
  await new Promise<void>((r) => evilServer.listen(EVIL_PORT, r));

  const endAll = (uid: string) => q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND is_active`, [uid]);
  try {
    const engines = [["Chromium", chromium, undefined], ["Edge", chromium, "msedge"], ["Firefox", firefox, undefined], ["WebKit", webkit, undefined]] as const;
    for (const [name, bt, channel] of engines) {
      console.log(`\n── ${name} ──`);
      await endAll(U.free); await endAll(U.exp);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `httponly-${name}-`));
      const launch = () => bt.launchPersistentContext(dir, { ignoreHTTPSErrors: true, ...(channel ? { channel } : {}) });
      let ctx = await launch();
      let p = ctx.pages()[0] ?? await ctx.newPage();
      await p.goto(`${ORIGIN}/`);
      ok(await p.evaluate(() => window.isSecureContext), `${name}: güvenli bağlam (HTTPS)`);

      // 1) Giriş — yanıt gövdesi + JS görünürlüğü
      const login = await p.evaluate(async ([email, password]) => {
        const r = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
        const j = await r.json();
        return { status: r.status, keys: Object.keys(j), docCookie: document.cookie, ls: JSON.stringify(localStorage), ss: JSON.stringify(sessionStorage) };
      }, [EMAIL.free, pw(EMAIL.free)]);
      const jar = await ctx.cookies(ORIGIN);
      const sid = jar.find((c) => c.name === "__Host-yasam_sid");
      ok(login.status === 200 && !login.keys.includes("sessionToken"), `${name}: giriş 200, gövdede anahtar YOK`, login.keys);
      // Playwright WebKit'in Windows portu SameSite özniteliğini UYGULAMAZ (çerez kavanozunda "None"); gerçek Safari farklı katman.
      const noSameSite = name === "WebKit" && process.platform === "win32";
      ok(!!sid && sid.httpOnly && sid.secure && (noSameSite || sid.sameSite === "Strict") && sid.path === "/" && sid.domain.replace(/^\./, "") === "localhost",
        `${name}: tarayıcı çerezi saklamış — HttpOnly, Secure, ${noSameSite ? "" : "SameSite=Strict, "}Path=/, ana makineye bağlı`, sid && { ...sid, value: "<gizli>" });
      if (noSameSite) envLimit(`${name}: SameSite=Strict saklama (Windows WebKit portu SameSite desteklemiyor; gerçek Safari kanıtı gerekli)`, { sameSite: sid?.sameSite });
      ok(!!sid && sid.expires > Date.now() / 1000 + 29 * 86400, `${name}: kalıcı çerez (tarayıcı yeniden açılınca korunur; ~30 gün)`);
      ok(!/yasam_sid/.test(login.docCookie) && !(sid && login.docCookie.includes(sid.value)), `${name}: document.cookie oturum çerezini GÖSTERMİYOR`, login.docCookie);
      ok(!(sid && (login.ls.includes(sid.value) || login.ss.includes(sid.value))), `${name}: localStorage / sessionStorage'da anahtar YOK`);

      // 2) Korumalı uç, yeni sekme
      const prof = (pg: typeof p, uid: string) => pg.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: { "x-user-id": u } })).status, uid);
      ok(await prof(p, U.free) === 200, `${name}: korumalı uç çerezle 200`);
      await p.reload();
      ok(await prof(p, U.free) === 200, `${name}: sayfa yenileme sonrası 200`);
      const tab = await ctx.newPage();
      await tab.goto(`${ORIGIN}/sekme`);
      ok(await prof(tab, U.free) === 200, `${name}: yeni sekme 200`);
      await tab.close();

      // 3) Tarayıcının kapatılıp yeniden açılması
      await ctx.close();
      ctx = await launch();
      p = ctx.pages()[0] ?? await ctx.newPage();
      await p.goto(`${ORIGIN}/`);
      ok(await prof(p, U.free) === 200, `${name}: tarayıcı yeniden açıldı → oturum sürüyor (çerez kalıcı)`);

      // 4) Çapraz site: SameSite=Strict + CSRF katmanı
      seen = [];
      const evil = await ctx.newPage();
      await evil.goto(`${EVIL}/`);
      await evil.waitForTimeout(800);
      await evil.evaluate(() => (document.getElementById("f") as HTMLFormElement).submit());
      await evil.waitForLoadState("load").catch(() => {});
      await evil.waitForTimeout(800);
      const nav = await ctx.newPage();
      await nav.goto(`${EVIL}/`);
      await nav.evaluate((o) => { location.href = `${o}/api/auth/session`; }, ORIGIN);
      await nav.waitForTimeout(800);
      const xs = seen.filter((s) => s.path === "/guard" || (s.path === "/api/auth/session" && s.origin !== ORIGIN));
      ok(xs.length >= 2, `${name}: saldırgan sayfası uygulamaya çapraz site istekleri gönderdi (${xs.length})`, seen);
      const xw = xs.filter((s) => s.method !== "GET");
      const xnav = xs.find((s) => s.method === "GET" && s.path === "/api/auth/session");
      if (noSameSite) {
        envLimit(`${name}: çapraz sitede çerez gönderilmemesi (SameSite) — motor çerezi GÖNDERDİ`, xs.map((s) => ({ m: s.method, p: s.path, sid: s.sid, st: s.status })));
      } else {
        ok(xw.every((s) => !s.sid), `${name}: çapraz site POST/DELETE isteklerinde oturum çerezi GÖNDERİLMEDİ (SameSite=Strict)`, xs);
        ok(!!xnav && !xnav.sid, `${name}: çapraz site üst düzey gezinmede çerez GÖNDERİLMEDİ (Strict)`, xnav);
      }
      // Derinlemesine savunma: çerez taşınsa bile sunucu CSRF katmanı (Origin + özel başlık) değiştirici isteği reddeder.
      ok(xw.some((s) => s.path === "/guard") && xw.filter((s) => s.path === "/guard").every((s) => s.status === 401 || s.status === 403),
        `${name}: çapraz site değiştirici istek sunucu CSRF katmanında REDDEDİLDİ (çerez taşınmış olsa da)`, xw.map((s) => ({ p: s.path, sid: s.sid, st: s.status })));
      await evil.close(); await nav.close();
      ok(await prof(p, U.free) === 200, `${name}: çapraz site DELETE oturumu kapatmadı`);

      // 5) Aynı köken, CSRF katmanı (özel başlık zorunlu)
      const g1 = await p.evaluate(async (u) => (await fetch("/guard", { method: "POST", headers: { "x-user-id": u }, body: "{}" })).status, U.free);
      const g2 = await p.evaluate(async () => (await fetch("/guard", { method: "POST", body: "{}" })).status);
      ok(g1 === 200 && g2 !== 200, `${name}: aynı köken POST — özel başlıkla ${g1}, başlıksız ${g2}`);

      // 6) Kanal taklidi (sayfa JS'i) — önce tek başına istemci ipucu (her motorda kapalı olmalı), sonra tam taklit
      await endAll(U.free);
      const spoofLogin = (email: string, headers: Record<string, string>) => p.evaluate(async ([em, pass, h]) => {
        const r = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json", ...(h as Record<string, string>) },
          body: JSON.stringify({ email: em, password: pass }) });
        const j = await r.json();
        return { status: r.status, keys: Object.keys(j), tokenReadable: typeof j.sessionToken === "string" && j.sessionToken.length > 0,
          bindingReadable: typeof j.mfaBinding === "string" && j.mfaBinding.length > 0, binding: typeof j.mfaBinding === "string" ? j.mfaBinding : "", challengeId: String(j.challengeId ?? "") };
      }, [email, pw(email), headers] as const);
      // Ek varyantlar: yanlış paket adı, çelişen işaretler (yalnız UA soneki / yalnız ipucu), eksik X-Requested-With
      for (const [vLabel, vh] of [
        ["yanlış paket adı (UA taklidi + com.yasamsistemi.app.fake)", { "User-Agent": APP_UA, "X-Requested-With": "com.yasamsistemi.app.fake" }],
        ["eksik X-Requested-With (yalnız WebView UA taklidi)", { "User-Agent": APP_UA }],
        ["çelişen işaretler (masaüstü UA + Android ipucu + paket)", { "x-yasam-client": "android", "X-Requested-With": "com.yasamsistemi.app", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0" }],
        ["yalnız uygulama UA soneki (YasamSistemiAndroid/) + ipucu, Android değil", { "User-Agent": "Mozilla/5.0 (Windows NT 10.0) YasamSistemiAndroid/2.0.0", "x-yasam-client": "android" }],
      ] as const) {
        const r = await spoofLogin(EMAIL.free, vh as Record<string, string>);
        const uaChanged = name !== "Chromium" && name !== "Edge";
        // UA'yı değiştiremeyen motorda (Chromium/Edge) hiçbir varyant anahtar alamaz; Firefox/WebKit'te iki-sinyal tam taklidi
        // olmayan varyantlar da alamaz (son varyant: sonek + ipucu = resmî (B) kanal → header kipinde AÇIK sayılır).
        const fullB = vLabel.startsWith("yalnız uygulama UA soneki") && uaChanged;
        if (fullB) spoofCheck(r.tokenReadable, `${name}: ${vLabel} ile oturum anahtarını OKUYABİLİYOR`, r);
        else ok(!r.tokenReadable, `${name}: ${vLabel} → anahtar OKUNAMIYOR`, r);
        await endAll(U.free);
      }
      const hint = await spoofLogin(EMAIL.free, { "x-yasam-client": "android", "X-Requested-With": "com.yasamsistemi.app" });
      ok(!hint.tokenReadable, `${name}: sayfa JS'i istemci ipucu + X-Requested-With (UA değişmeden) ile anahtar OKUYAMIYOR`, hint);
      await endAll(U.free);
      const FULL = { "User-Agent": APP_UA, "X-Requested-With": "com.yasamsistemi.app", "x-yasam-client": "android" };
      const spoof = await spoofLogin(EMAIL.free, FULL);
      spoofCheck(spoof.tokenReadable, `${name}: sayfa JS'i UA + X-Requested-With taklidiyle oturum anahtarını OKUYABİLİYOR`, spoof);
      await endAll(U.free);
      // MFA'lı hesapta aynı taklit: bilet bağlama sırrı ve onay sonrası anahtar
      await endAll(U.exp);
      const ms = await spoofLogin(EMAIL.exp, FULL);
      spoofCheck(ms.bindingReadable, `${name}: taklitle MFA bilet bağlama sırrını OKUYABİLİYOR`, { s: ms.status, k: ms.keys });
      if (ms.challengeId) {
        await q(`SELECT public.auth_mfa_mark_verified($1, 'qr_device')`, [ms.challengeId]);
        const mDone = await p.evaluate(async ([ch, ua, bind]) => {
          const h: Record<string, string> = { "content-type": "application/json", "User-Agent": ua, "X-Requested-With": "com.yasamsistemi.app" };
          if (bind) h["x-yasam-mfa-binding"] = bind;
          const r = await fetch("/api/auth/mfa/complete", { method: "POST", headers: h, body: JSON.stringify({ challengeId: ch }) });
          const j = await r.json();
          return { status: r.status, keys: Object.keys(j), tokenReadable: typeof j.sessionToken === "string" && j.sessionToken.length > 0 };
        }, [ms.challengeId, APP_UA, ms.binding] as const);
        spoofCheck(mDone.tokenReadable, `${name}: kullanıcı onayından sonra taklit tam oturum anahtarını OKUYABİLİYOR`, mDone);
      }
      await endAll(U.exp);
      await ctx.clearCookies();

      // 7) MFA — ikinci adım bitmeden oturum çerezi yok
      await ctx.clearCookies();
      const m1 = await p.evaluate(async ([email, password]) => {
        const r = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
        return { status: r.status, j: await r.json() };
      }, [EMAIL.exp, pw(EMAIL.exp)]);
      const jar2 = await ctx.cookies(ORIGIN);
      ok(m1.status === 202 && !jar2.some((c) => c.name === "__Host-yasam_sid"), `${name}: MFA bekleyen girişte oturum çerezi YOK`, { s: m1.status, jar: jar2.map((c) => c.name) });
      const mc = jar2.find((c) => c.name === "__Host-yasam_mfa");
      ok(!!mc && mc.httpOnly && mc.secure && (noSameSite || mc.sameSite === "Strict"), `${name}: bekleyen bilet bağlaması HttpOnly/Secure${noSameSite ? "" : "/Strict"} çerezde`);
      ok(await prof(p, U.exp) === 401, `${name}: MFA tamamlanmadan korumalı uç 401`);
      const early = await p.evaluate(async (ch) => (await fetch("/api/auth/mfa/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId: ch }) })).status, String(m1.j.challengeId));
      ok(early === 401 && !(await ctx.cookies(ORIGIN)).some((c) => c.name === "__Host-yasam_sid"), `${name}: doğrulanmamış bilet tamamlanamaz (401), çerez YOK`);
      await q(`SELECT public.auth_mfa_mark_verified($1, 'email_otp')`, [String(m1.j.challengeId)]);
      const done = await p.evaluate(async (ch) => {
        const r = await fetch("/api/auth/mfa/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId: ch }) });
        return { status: r.status, keys: Object.keys(await r.json()), doc: document.cookie };
      }, String(m1.j.challengeId));
      const jar3 = await ctx.cookies(ORIGIN);
      ok(done.status === 200 && !done.keys.includes("sessionToken") && jar3.some((c) => c.name === "__Host-yasam_sid" && c.httpOnly) && !jar3.some((c) => c.name === "__Host-yasam_mfa"),
        `${name}: MFA sonrası HttpOnly oturum çerezi; bilet çerezi silindi; gövdede anahtar YOK`, { s: done.status, k: done.keys, jar: jar3.map((c) => c.name) });
      ok(await prof(p, U.exp) === 200, `${name}: MFA'lı oturumla korumalı uç 200`);

      // 8) Çıkış
      const out = await p.evaluate(async (u) => (await fetch("/api/auth/session", { method: "DELETE", headers: { "x-user-id": u } })).status, U.exp);
      const jar4 = await ctx.cookies(ORIGIN);
      ok(out === 200 && !jar4.some((c) => c.name === "__Host-yasam_sid"), `${name}: çıkış → tarayıcı çerezi sildi`);
      ok(await prof(p, U.exp) === 401, `${name}: çıkış sonrası korumalı uç 401`);
      await ctx.close();
    }
    // ── Android WebView EMÜLASYONU (Chromium + resmî uygulama UA + X-Requested-With). Fiziksel cihaz DEĞİLDİR. ──
    console.log(`\n── Android WebView emülasyonu (Chromium) ──`);
    {
      await endAll(U.free);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "httponly-androidwv-"));
      const savedTransport = process.env.ANDROID_APP_SESSION_TRANSPORT;
      delete process.env.ANDROID_APP_SESSION_TRANSPORT; // önce bugünkü (header) kipte giriş: mevcut kurulu uygulama
      const ctx = await chromium.launchPersistentContext(dir, { ignoreHTTPSErrors: true, userAgent: APP_UA, extraHTTPHeaders: { "X-Requested-With": "com.yasamsistemi.app" } });
      const p = ctx.pages()[0] ?? await ctx.newPage();
      await p.goto(`${ORIGIN}/`);
      const l = await p.evaluate(async ([email, password]) => {
        const r = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
        const j = await r.json();
        if (typeof j.sessionToken === "string") localStorage.setItem("yasam_session_token", j.sessionToken); // istemcinin header kipi davranışı
        return { status: r.status, keys: Object.keys(j) };
      }, [EMAIL.free, pw(EMAIL.free)]);
      ok(l.status === 200 && l.keys.includes("sessionToken") && !(await ctx.cookies(ORIGIN)).some((c) => c.name === "__Host-yasam_sid"),
        "header kipi (bugünkü uygulama): token gövdede, çerez YOK — geriye uyum", l);
      const hdr = await p.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: { "x-user-id": u, "x-session-token": localStorage.getItem("yasam_session_token") ?? "" } })).status, U.free);
      ok(hdr === 200, "header kipi: başlık tokenıyla korumalı uç 200");
      // Owner bayrağı açar (cookie). İstemci artık çerez kipinde: başlık göndermez → önce eski token çereze taşınır.
      process.env.ANDROID_APP_SESSION_TRANSPORT = "cookie";
      const before = await p.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: { "x-user-id": u } })).status, U.free);
      ok(before === 401, "bayrak açıldı, yükseltme öncesi başlıksız istek 401 (yükseltme ŞART)", before);
      const up = await p.evaluate(async () => {
        const raw = localStorage.getItem("yasam_session_token") ?? "";
        const boot = await fetch("/api/auth/session/cookie", { method: "POST", cache: "no-store", headers: { "x-session-token": raw } });
        const check = await fetch("/api/auth/session", { cache: "no-store" });
        const j = await check.json();
        if (boot.ok && j.valid === true) localStorage.removeItem("yasam_session_token"); // ensureWebCookieSession sırası
        return { boot: boot.status, valid: j.valid, left: localStorage.getItem("yasam_session_token"), doc: document.cookie };
      });
      const jar = await ctx.cookies(ORIGIN);
      ok(up.boot === 200 && up.valid === true && up.left === null && jar.some((c) => c.name === "__Host-yasam_sid" && c.httpOnly) && !/yasam_sid/.test(up.doc),
        "mevcut uygulama oturumu çereze taşındı; token localStorage'dan silindi; JS çerezi göremiyor", up);
      ok(await p.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: { "x-user-id": u } })).status, U.free) === 200, "yükseltme sonrası çerezle korumalı uç 200 (çıkışa düşmedi)");
      await p.reload();
      ok(await p.evaluate(async (u) => (await fetch("/api/auth/profile", { headers: { "x-user-id": u } })).status, U.free) === 200, "yenileme sonrası 200");
      const out = await p.evaluate(async (u) => (await fetch("/api/auth/session", { method: "DELETE", headers: { "x-user-id": u } })).status, U.free);
      ok(out === 200 && !(await ctx.cookies(ORIGIN)).some((c) => c.name === "__Host-yasam_sid"), "çerez kipinde çıkış: çerez silindi");
      const l2 = await p.evaluate(async ([email, password]) => {
        const r = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
        return { status: r.status, keys: Object.keys(await r.json()), doc: document.cookie };
      }, [EMAIL.free, pw(EMAIL.free)]);
      ok(l2.status === 200 && !l2.keys.includes("sessionToken") && (await ctx.cookies(ORIGIN)).some((c) => c.name === "__Host-yasam_sid" && c.httpOnly) && !/yasam_sid/.test(l2.doc),
        "çerez kipinde yeniden giriş: HttpOnly çerez, gövdede anahtar YOK", l2);
      await ctx.close();
      if (savedTransport === undefined) delete process.env.ANDROID_APP_SESSION_TRANSPORT; else process.env.ANDROID_APP_SESSION_TRANSPORT = savedTransport;
      await endAll(U.free);
    }
  } finally {
    appServer.close(); evilServer.close();
    await db.close();
  }
  console.log(`\nhttponly-nihai-tarayici: ${pass} PASS, ${fail} FAIL, ${open} AÇIK (bilinen boşluk yeniden üretildi), ${notTested} NOT TESTED (ortam sınırı)`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
