/**
 * HTTPONLY H6b harness — web oturum token'ı JS'ten tamamen çıkar (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/httponly-h6b.harness.ts
 *
 * Kapsam:
 *   - login istemcisi: `sessionCookie: true` (token'sız) başarı; ikisi de yoksa fail-closed
 *   - saveSessionToken: web+cookie → YAZMAZ; header (kill-switch) / Android → yazar
 *   - legacy token temizliği SIRASI: (bootstrap) → cookie doğrulama (valid:true) → sil;
 *     bootstrap/doğrulama başarısızsa token KALIR
 *   - Android: token korunur, temizlik/bootstrap YOK
 *   - logout: token yokken de cookie oturumu kapatılır; legacy token + demo kaydı temizlenir
 *   - statik: login gövdesi web+cookie'de token içermez; URL token yok
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

const UID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129 Safari/537.36";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-X; wv) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36";
const ROW = { id: UID, email: "a@test.invalid", name: "A", role: "expert", status: "active", active: true, approval_status: "approved", tenant_id: "t1" };

const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
g.sessionStorage = g.localStorage;
g.window = globalThis;
let ua = WEB_UA;
let transportAttr: string | null = "cookie";
Object.defineProperty(globalThis, "navigator", { configurable: true, get: () => ({ userAgent: ua }) });
g.document = { documentElement: { getAttribute: (n: string) => (n === "data-session-transport" ? transportAttr : null) } };
type Call = { url: string; method: string; headers: Record<string, string>; tokenStoredAtCall: boolean };
let calls: Call[] = [];
let respond: (url: string, method: string) => Response | Promise<Response> = () => new Response("{}", { status: 200 });
g.fetch = async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
  calls.push({ url: String(url), method: init?.method ?? "GET", headers: { ...(init?.headers ?? {}) }, tokenStoredAtCall: store.has("yasam_session_token") });
  return respond(String(url), init?.method ?? "GET");
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });

function reset(opts: { token?: boolean; android?: boolean; transport?: string | null; ready?: boolean } = {}) {
  store.clear();
  calls = [];
  ua = opts.android ? ANDROID_UA : WEB_UA;
  transportAttr = opts.transport === undefined ? "cookie" : opts.transport;
  store.set("yasam_user", JSON.stringify({ ...ROW, membership_status: "active" }));
  if (opts.token) store.set("yasam_session_token", TOKEN);
  respond = () => json({});
}

async function main() {
  const yu = await import("../../lib/auth/yasamUser");
  const lu = await import("../../lib/auth/loginUser");
  const fp = (tok: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  };

  // ── 1) login istemcisi ─────────────────────────────────────────────────────────────────
  const loginWith = (body: unknown, status = 200) =>
    lu.loginWithCredentials("a@test.invalid", "Passw0rd!x", (async () => json(body, status)) as unknown as typeof fetch);
  await t("login: { sessionCookie: true, user } → başarı, sessionToken null (JS token görmez)", async () => {
    reset();
    const r = await loginWith({ sessionCookie: true, user: [ROW] });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.sessionToken, null);
  });
  await t("login: { sessionToken, user } (Android/kill-switch) → başarı, token döner", async () => {
    reset({ android: true });
    const r = await loginWith({ sessionToken: TOKEN, user: [ROW] });
    assert.equal(r.ok && r.sessionToken, TOKEN);
  });
  await t("login: ne token ne sessionCookie → fail-closed", async () => {
    reset();
    const r = await loginWith({ user: [ROW] });
    assert.equal(r.ok, false);
  });

  // ── 2) saveSessionToken ────────────────────────────────────────────────────────────────
  await t("saveSessionToken WEB+cookie → localStorage'a YAZILMAZ", () => {
    reset();
    yu.saveSessionToken(TOKEN);
    assert.equal(store.get("yasam_session_token"), undefined);
  });
  await t("saveSessionToken KILL-SWITCH (header) → yazar (H5/H6a yolu)", () => {
    reset({ transport: "header" });
    yu.saveSessionToken(TOKEN);
    assert.equal(store.get("yasam_session_token"), TOKEN);
  });
  await t("saveSessionToken ANDROID (cookie işareti olsa bile) → yazar", () => {
    reset({ android: true, transport: "cookie" });
    yu.saveSessionToken(TOKEN);
    assert.equal(store.get("yasam_session_token"), TOKEN);
    assert.equal(yu.readSessionToken(), TOKEN);
    assert.deepEqual(yu.sessionTokenHeader(), { "x-session-token": TOKEN });
  });

  // ── 3) legacy token temizliği: sıra ve güvenlik ─────────────────────────────────────────
  await t("cookie VAR + token VAR (işaretli): cookie doğrulanır (valid) → SONRA token silinir; bootstrap YOK", async () => {
    reset({ token: true });
    store.set("yasam_cookie_session_fp", fp(TOKEN));
    respond = (u) => (u === "/api/auth/session" ? json({ valid: true }) : json({}));
    await yu.ensureWebCookieSession();
    assert.ok(!calls.some((c) => c.url === "/api/auth/session/cookie"));
    const check = calls.find((c) => c.url === "/api/auth/session");
    assert.ok(check && !("x-session-token" in check.headers), "doğrulama başlıksız (cookie)");
    assert.equal(check!.tokenStoredAtCall, true, "doğrulama ANINDA token hâlâ durmalı");
    assert.equal(store.get("yasam_session_token"), undefined, "doğrulama sonrası silindi");
  });
  await t("cookie YOK + token VAR: bootstrap(200) → doğrulama(valid) → sil (SIRA)", async () => {
    reset({ token: true });
    respond = (u) => (u === "/api/auth/session" ? json({ valid: true }) : json({ ok: true }));
    await yu.ensureWebCookieSession();
    const order = calls.map((c) => c.url);
    assert.deepEqual(order, ["/api/auth/session/cookie", "/api/auth/session"]);
    assert.equal(calls[0].headers["x-session-token"], TOKEN);
    assert.ok(calls.every((c) => c.tokenStoredAtCall), "token silinmeden önce iki adım da tamamlandı");
    assert.equal(store.get("yasam_session_token"), undefined);
  });
  await t("bootstrap BAŞARISIZ (401) → token SİLİNMEZ, doğrulama yapılmaz", async () => {
    reset({ token: true });
    respond = (u) => (u.includes("/session/cookie") ? json({}, 401) : json({ valid: true }));
    await yu.ensureWebCookieSession();
    assert.equal(store.get("yasam_session_token"), TOKEN);
    assert.ok(!calls.some((c) => c.url === "/api/auth/session"));
  });
  await t("doğrulama valid:false / 503 / ağ hatası → token SİLİNMEZ (toplu logout yok)", async () => {
    for (const r of [() => json({ valid: false, reason: "revoked" }), () => json({ valid: null }, 503), () => Promise.reject(new Error("net"))]) {
      reset({ token: true });
      store.set("yasam_cookie_session_fp", fp(TOKEN));
      respond = (u) => (u === "/api/auth/session" ? (r() as Response) : json({}));
      await yu.ensureWebCookieSession();
      assert.equal(store.get("yasam_session_token"), TOKEN);
    }
  });
  await t("cookie VAR + token YOK → temizlik no-op (istek yok)", async () => {
    reset();
    await yu.ensureWebCookieSession();
    assert.equal(calls.length, 0);
  });
  await t("ANDROID token VAR → temizlik/bootstrap YOK, token korunur", async () => {
    reset({ android: true, token: true });
    await yu.ensureWebCookieSession();
    assert.equal(calls.length, 0);
    assert.equal(store.get("yasam_session_token"), TOKEN);
  });
  await t("KILL-SWITCH (header) token VAR → temizlik YOK (rollback yolu korunur)", async () => {
    reset({ transport: "header", token: true });
    await yu.ensureWebCookieSession();
    assert.equal(calls.length, 0);
    assert.equal(store.get("yasam_session_token"), TOKEN);
  });

  // ── 4) logout ──────────────────────────────────────────────────────────────────────────
  await t("WEB logout token YOK: cookie oturumu DELETE (x-user-id, başlık yok); yasam_user + demo kaydı temizlenir", () => {
    reset();
    store.set("yasam_demo_intro_ack", "x");
    yu.clearYasamUser();
    const del = calls.find((c) => c.url === "/api/auth/session" && c.method === "DELETE");
    assert.equal(del?.headers["x-user-id"], UID);
    assert.ok(!("x-session-token" in (del?.headers ?? {})));
    assert.equal(store.get("yasam_user"), undefined);
    assert.equal(store.get("yasam_demo_intro_ack"), undefined);
  });
  await t("WEB logout legacy token VAR: token da temizlenir", () => {
    reset({ token: true });
    yu.clearYasamUser();
    assert.equal(store.get("yasam_session_token"), undefined);
  });
  await t("ANDROID logout: token başlığıyla DELETE (değişmedi)", () => {
    reset({ android: true, token: true });
    yu.clearYasamUser();
    assert.equal(calls.find((c) => c.url === "/api/auth/session" && c.method === "DELETE")?.headers["x-session-token"], TOKEN);
  });

  // ── 5) statik ──────────────────────────────────────────────────────────────────────────
  await t("login route: web+cookie'de gövde { sessionCookie: true } — token YOK; Android/header'da token", () => {
    const r = read("app/api/auth/session/route.ts");
    assert.ok(/\.\.\.\(webCookieOnly \? \{ sessionCookie: true \} : \{ sessionToken \}\)/.test(r));
    assert.ok(/const webCookieOnly = webCookieSession && readWebSessionTransport\(\) === "cookie";/.test(r));
    assert.ok(/result\.channel !== "android_app" &&\s*!isAndroidAppRequest\(req\.headers\)/.test(r));
  });
  await t("URL/query token geri gelmedi (session GET başlık/cookie)", () => {
    assert.ok(!/searchParams\.get\("token"\)/.test(read("app/api/auth/session/route.ts")));
  });
  await t("completeLogin token yoksa saveSessionToken çağırmaz", () => {
    assert.ok(/if \(sessionToken\) saveSessionToken\(sessionToken\);/.test(read("app/page.tsx")));
  });
  await t("Android oturum politikası değişmedi (no-expiry satırı)", () => {
    assert.ok(read("lib/auth/sessionSecurity.ts").includes('p_expires_at: clientChannel === "android_app" ? null : computeSessionExpiresAt(lr?.role),'));
  });

  console.log(`httponly-h6b harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
