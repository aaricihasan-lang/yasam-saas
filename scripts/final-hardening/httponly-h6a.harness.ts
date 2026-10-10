/**
 * HTTPONLY H6a harness — web x-session-token başlığını kaldırma + kill-switch (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/httponly-h6a.harness.ts
 *
 * Kapsam:
 *   - readWebSessionTransport env matrisi (yalnız primary + kill-switch kapalı → "cookie")
 *   - WEB + cookie taşıması: readSessionToken null (başlık YOK), localStorage token KORUNUR,
 *     hasSessionCredential true, checkSessionStatus başlıksız
 *   - KILL-SWITCH: taşıma "header" → aynı tarayıcıda token + başlık hemen geri gelir (H5 davranışı)
 *   - ANDROID: cookie işareti olsa bile token + x-session-token aynen
 *   - bir kerelik cookie geçişi (yalnız bir kez; login sonrası gereksiz), logout yolları
 *   - statik: layout işareti, H6b YOK (token saklanır/login gövdesi değişmez)
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
type Call = { url: string; method: string; headers: Record<string, string> };
let calls: Call[] = [];
let respond: (url: string) => Response = () => new Response(JSON.stringify({ valid: true }), { status: 200 });
g.fetch = async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
  calls.push({ url: String(url), method: init?.method ?? "GET", headers: { ...(init?.headers ?? {}) } });
  return respond(String(url));
};

function reset(opts: { token?: boolean; user?: boolean; android?: boolean; transport?: string | null } = {}) {
  store.clear();
  calls = [];
  ua = opts.android ? ANDROID_UA : WEB_UA;
  transportAttr = opts.transport === undefined ? "cookie" : opts.transport;
  if (opts.user !== false) store.set("yasam_user", JSON.stringify({ id: UID, role: "expert", active: true, approval_status: "approved" }));
  if (opts.token !== false) store.set("yasam_session_token", TOKEN);
  respond = () => new Response(JSON.stringify({ valid: true }), { status: 200 });
}

async function main() {
  const sc = await import("../../lib/auth/sessionCookie");
  const yu = await import("../../lib/auth/yasamUser");
  const se = await import("../../lib/auth/sessionExpiry");

  // ── 1) sunucu taşıma kararı + kill-switch ───────────────────────────────────────────────
  await t("readWebSessionTransport: off/canary/shadow → header; primary → cookie", () => {
    for (const m of [undefined, "off", "canary", "shadow", "garbage"]) assert.equal(sc.readWebSessionTransport({ SESSION_COOKIE_MODE: m }), "header", String(m));
    assert.equal(sc.readWebSessionTransport({ SESSION_COOKIE_MODE: "primary" }), "cookie");
  });
  await t("KILL-SWITCH: primary + SESSION_COOKIE_WEB_HEADER=on → header (mod primary kalır)", () => {
    assert.equal(sc.readWebSessionTransport({ SESSION_COOKIE_MODE: "primary", SESSION_COOKIE_WEB_HEADER: "on" }), "header");
    assert.equal(sc.readWebSessionTransport({ SESSION_COOKIE_MODE: "primary", SESSION_COOKIE_WEB_HEADER: " ON " }), "header");
    assert.equal(sc.readWebSessionTransport({ SESSION_COOKIE_MODE: "primary", SESSION_COOKIE_WEB_HEADER: "off" }), "cookie");
  });

  // ── 2) WEB + cookie taşıması ────────────────────────────────────────────────────────────
  await t("WEB cookie: readSessionToken null, saklı token KORUNUR, başlık YOK, kimlik bilgisi VAR", () => {
    reset();
    assert.equal(yu.webUsesCookieTransport(), true);
    assert.equal(yu.readSessionToken(), null);
    assert.equal(yu.readStoredSessionToken(), TOKEN);
    assert.equal(store.get("yasam_session_token"), TOKEN);
    assert.deepEqual(yu.sessionTokenHeader(), {});
    assert.equal(yu.hasSessionCredential(), true);
    assert.equal(yu.hasWebSession(), true);
  });
  await t("WEB cookie: checkSessionStatus başlıksız (cookie ile)", async () => {
    reset();
    store.set("yasam_cookie_session_fp", "x"); // geçiş tetiklenmesin diye farklı → aşağıda ayrıca
    await se.checkSessionStatus();
    // H6b: legacy-token temizliği önce kendi (başlıksız) doğrulamasını yapabilir → TÜM session GET'ler başlıksız.
    const sessionGet = calls.filter((c) => c.url === "/api/auth/session");
    assert.ok(sessionGet.length >= 1);
    assert.ok(sessionGet.every((c) => !("x-session-token" in c.headers)));
  });

  // ── 3) KILL-SWITCH geri dönüşü (aynı tarayıcı) ──────────────────────────────────────────
  await t("KILL-SWITCH: taşıma header → token + x-session-token HEMEN geri (localStorage'da durduğu için)", async () => {
    reset({ transport: "header" });
    assert.equal(yu.webUsesCookieTransport(), false);
    assert.equal(yu.readSessionToken(), TOKEN);
    assert.deepEqual(yu.sessionTokenHeader(), { "x-session-token": TOKEN });
    await se.checkSessionStatus();
    assert.equal(calls.find((c) => c.url === "/api/auth/session")?.headers["x-session-token"], TOKEN);
  });
  await t("işaret yoksa (SSR dışı) güvenli varsayılan header", () => {
    reset({ transport: null });
    assert.equal(yu.readSessionToken(), TOKEN);
  });

  // ── 4) ANDROID ──────────────────────────────────────────────────────────────────────────
  await t("ANDROID: cookie işareti olsa bile token + x-session-token aynen; cookie geçişi YOK", async () => {
    reset({ android: true, transport: "cookie" });
    assert.equal(yu.webUsesCookieTransport(), false);
    assert.equal(yu.readSessionToken(), TOKEN);
    assert.deepEqual(yu.sessionTokenHeader(), { "x-session-token": TOKEN });
    await yu.ensureWebCookieSession();
    await se.checkSessionStatus();
    assert.ok(!calls.some((c) => c.url === "/api/auth/session/cookie"));
    assert.equal(calls.find((c) => c.url === "/api/auth/session")?.headers["x-session-token"], TOKEN);
  });
  await t("ANDROID tokensuz: kimlik bilgisi YOK (cookie yolu yok)", () => {
    reset({ android: true, token: false });
    assert.equal(yu.hasSessionCredential(), false);
  });
  await t("ANDROID logout: token başlığıyla DELETE (bugünkü gibi)", () => {
    reset({ android: true });
    yu.clearYasamUser();
    assert.equal(calls.find((c) => c.url === "/api/auth/session" && c.method === "DELETE")?.headers["x-session-token"], TOKEN);
  });

  // ── 5) bir kerelik cookie geçişi ────────────────────────────────────────────────────────
  await t("geçiş: cookie doğrulanmamış saklı token → TEK bootstrap; ikinci çağrı istek YOK", async () => {
    reset();
    await yu.ensureWebCookieSession();
    await yu.ensureWebCookieSession();
    const boots = calls.filter((c) => c.url === "/api/auth/session/cookie");
    assert.equal(boots.length, 1);
    assert.equal(boots[0].headers["x-session-token"], TOKEN);
  });
  await t("geçiş başarısızsa işaret YAZILMAZ (sonra tekrar denenir)", async () => {
    reset();
    respond = (u) => (u.includes("/session/cookie") ? new Response("{}", { status: 401 }) : new Response("{}", { status: 200 }));
    await yu.ensureWebCookieSession();
    assert.equal(store.get("yasam_cookie_session_fp"), undefined);
  });
  await t("login (saveSessionToken, cookie taşıması) → geçiş GEREKSİZ (istek yok)", async () => {
    reset({ token: false });
    yu.saveSessionToken(TOKEN);
    await yu.ensureWebCookieSession();
    assert.ok(!calls.some((c) => c.url === "/api/auth/session/cookie"));
  });
  await t("header taşımasında geçiş no-op", async () => {
    reset({ transport: "header" });
    await yu.ensureWebCookieSession();
    assert.equal(calls.length, 0);
  });

  // ── 6) logout ───────────────────────────────────────────────────────────────────────────
  await t("WEB cookie logout (cookie doğrulanmış): x-user-id, token başlığı YOK; token silinir", () => {
    reset({ token: false });
    yu.saveSessionToken(TOKEN);
    calls = [];
    yu.clearYasamUser();
    const del = calls.find((c) => c.url === "/api/auth/session" && c.method === "DELETE");
    assert.equal(del?.headers["x-user-id"], UID);
    assert.ok(!("x-session-token" in (del?.headers ?? {})));
    assert.equal(store.get("yasam_session_token"), undefined);
    assert.equal(store.get("yasam_cookie_session_fp"), undefined);
  });
  await t("WEB cookie logout (cookie doğrulanmamış): saklı token da gönderilir (token oturumu kapanır)", () => {
    reset();
    yu.clearYasamUser();
    const del = calls.find((c) => c.url === "/api/auth/session" && c.method === "DELETE");
    assert.equal(del?.headers["x-session-token"], TOKEN);
    assert.equal(del?.headers["x-user-id"], UID);
  });

  // ── 6b) TAZE LOGIN (H6a FIX): boş localStorage + gerçek completeLogin sırası ─────────────
  const PROFILE = { id: UID, email: "a@test.invalid", name: "A", role: "expert", status: "active", active: true, approval_status: "approved", tenant_id: "t1", membership_status: "active", subscription_status: "active", package_type: "premium", module_permissions: { numerology: true } };
  const loginRow = { id: UID, email: "a@test.invalid", name: "A", role: "expert", status: "active", active: true, approval_status: "approved", tenant_id: "t1" };
  async function freshLogin(opts: { android?: boolean; transport?: string }) {
    reset({ token: false, user: false, android: opts.android, transport: opts.transport ?? "cookie" });
    respond = (u) => (u.startsWith("/api/auth/profile") ? new Response(JSON.stringify({ profile: PROFILE }), { status: 200 }) : new Response("{}", { status: 200 }));
    // app/page.tsx completeLogin: parseLoginUserRecord → saveSessionToken → syncYasamUserFromDb(force)
    const logged = yu.parseLoginUserRecord(loginRow)!;
    assert.equal(store.get("yasam_user"), undefined, "başlangıçta yasam_user YOK");
    yu.saveSessionToken(TOKEN);
    const fresh = await yu.syncYasamUserFromDb(logged, { force: true });
    return { fresh, profileCalls: calls.filter((c) => c.url.startsWith("/api/auth/profile")) };
  }
  await t("TAZE LOGIN (cookie, boş localStorage): /api/auth/profile ÇAĞRILIR, başlıksız; yasam_user SONRA yazılır", async () => {
    const { fresh, profileCalls } = await freshLogin({});
    assert.equal(profileCalls.length, 1, "profil isteği atlanmamalı (regresyon)");
    assert.ok(!("x-session-token" in profileCalls[0].headers));
    assert.equal(profileCalls[0].headers["x-user-id"], UID);
    assert.equal(fresh?.membership_status, "active");
    assert.ok(JSON.parse(store.get("yasam_user") ?? "{}").id === UID, "yasam_user yazıldı");
    assert.equal(yu.canLoginYasamUser(fresh!).allowed, true, "'aktif değil' DEĞİL");
    assert.ok(!calls.some((c) => c.url === "/api/auth/session/cookie"), "login sonrası bootstrap gereksiz");
  });
  await t("TAZE LOGIN (KILL-SWITCH header): profil token başlığıyla (H5 yolu)", async () => {
    const { fresh, profileCalls } = await freshLogin({ transport: "header" });
    assert.equal(profileCalls.length, 1);
    assert.equal(profileCalls[0].headers["x-session-token"], TOKEN);
    assert.equal(yu.canLoginYasamUser(fresh!).allowed, true);
  });
  await t("TAZE LOGIN (ANDROID): profil token başlığıyla; cookie yolu YOK", async () => {
    const { fresh, profileCalls } = await freshLogin({ android: true });
    assert.equal(profileCalls.length, 1);
    assert.equal(profileCalls[0].headers["x-session-token"], TOKEN);
    assert.equal(yu.canLoginYasamUser(fresh!).allowed, true);
    assert.ok(!calls.some((c) => c.url === "/api/auth/session/cookie"));
  });
  await t("Android tokensuz + id verilse bile kimlik bilgisi YOK (cookie yolu Android'de yok)", () => {
    reset({ android: true, token: false, user: false });
    assert.equal(yu.hasSessionCredential(null, UID), false);
  });
  await t("web id'siz + profil kaydı yok → kimlik bilgisi YOK (karar sunucuya bırakılmaz)", () => {
    reset({ token: false, user: false });
    assert.equal(yu.hasSessionCredential(null), false);
    assert.equal(yu.hasSessionCredential(null, UID), true);
  });

  // ── 7) statik ───────────────────────────────────────────────────────────────────────────
  await t("layout: <html data-session-transport> SSR; Android isteği her zaman header", () => {
    const l = read("app/layout.tsx");
    assert.ok(/isAndroidAppRequest\(requestHeaders\) \? "header" : readWebSessionTransport\(\)/.test(l));
    assert.ok(/\[SESSION_TRANSPORT_HTML_ATTR\]: sessionTransport/.test(l));
  });
  await t("H6b sözleşmesi: saveSessionToken web+cookie'de yazmaz (diğerlerinde yazar); login gövdesi taşımaya göre", () => {
    const y = read("lib/auth/yasamUser.ts");
    assert.ok(/if \(webUsesCookieTransport\(\)\) return;\r?\n\s+localStorage\.setItem\(SESSION_TOKEN_KEY, token\);/.test(y));
    assert.ok(/\{ sessionCookie: true \} : \{ sessionToken \}/.test(read("app/api/auth/session/route.ts")));
    assert.ok(/saveSessionToken\(sessionToken\)/.test(read("app/page.tsx")));
  });
  await t("istemci cookie modülünü import etmez (taşıma bayrağı ayrı saf modülde)", () => {
    for (const f of ["lib/auth/yasamUser.ts", "lib/auth/sessionExpiry.ts"]) assert.ok(!/lib\/auth\/sessionCookie/.test(read(f)), f);
    assert.ok(!/import/.test(read("lib/auth/sessionTransportFlag.ts")));
  });
  await t("Android oturum politikası değişmedi (no-expiry satırı)", () => {
    assert.ok(read("lib/auth/sessionSecurity.ts").includes('p_expires_at: clientChannel === "android_app" ? null : computeSessionExpiresAt(lr?.role),'));
  });

  console.log(`httponly-h6a harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
