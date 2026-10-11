/**
 * HTTPONLY H5 harness — web token bağımlılığı kaldırma (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/httponly-h5.harness.ts
 *
 * Kapsam:
 *   - merkezi Android kararı (isAndroidWebViewClient ↔ isAndroidAppUserAgent; sunucu dışlamasıyla tutarlı)
 *   - hasSessionCredential / hasWebSession / sessionTokenHeader (web: token VAR / YOK; Android: yalnız token)
 *   - checkSessionStatus + confirmSessionInvalid: web token yokken cookie ile sorar, Android'de sormaz
 *   - clearYasamUser: web token yokken cookie-logout (x-user-id, token başlığı YOK); Android'de yok
 *   - sunucu (DB'ye inmeden): session GET primary/web cookie dalı, `?token=` kaldırıldı;
 *     admin-session + pending DELETE Origin kontrolü (off/Android'de bugünkü davranış)
 *   - statik: H5 kapsamı (token hâlâ kaydediliyor/gönderiliyor; H6 değişikliği YOK)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

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
const ANDROID_WV_UA = "Mozilla/5.0 (Linux; Android 14; SM-X; wv) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36";
const ANDROID_NATIVE_UA = "Mozilla/5.0 (Linux; Android 14) Chrome/129 Mobile YasamSistemiAndroid/2.1";
const ANDROID_CHROME_UA = "Mozilla/5.0 (Linux; Android 14; SM-X) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36";
const ORIGIN = "https://www.yasamsistemi.com";

// ── tarayıcı ortamı simülasyonu (localStorage + navigator + fetch) ──────────────────────────
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
g.sessionStorage = g.localStorage;
g.window = globalThis;
let currentUa = WEB_UA;
Object.defineProperty(globalThis, "navigator", { configurable: true, get: () => ({ userAgent: currentUa }) });
type Call = { url: string; method: string; headers: Record<string, string> };
let calls: Call[] = [];
let nextResponse: () => Response = () => new Response(JSON.stringify({ valid: true }), { status: 200 });
g.fetch = async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
  calls.push({ url: String(url), method: init?.method ?? "GET", headers: { ...(init?.headers ?? {}) } });
  return nextResponse();
};

function setSession(opts: { user?: boolean; token?: boolean; ua?: string }) {
  store.clear();
  calls = [];
  currentUa = opts.ua ?? WEB_UA;
  if (opts.user !== false) store.set("yasam_user", JSON.stringify({ id: UID, role: "expert", active: true, approval_status: "approved", email: "x@test.invalid" }));
  if (opts.token) store.set("yasam_session_token", TOKEN);
}

async function main() {
  const yu = await import("../../lib/auth/yasamUser");
  const se = await import("../../lib/auth/sessionExpiry");
  const { isAndroidAppUserAgent } = await import("../../lib/platform/outputSupport");
  const { isAndroidAppRequest } = await import("../../lib/auth/sessionCookie");

  // ── 1) merkezi Android kararı ────────────────────────────────────────────────────────────
  await t("isAndroidWebViewClient: web=false, `; wv)`=true, YasamSistemiAndroid/=true, Android Chrome=false", () => {
    for (const [ua, exp] of [[WEB_UA, false], [ANDROID_WV_UA, true], [ANDROID_NATIVE_UA, true], [ANDROID_CHROME_UA, false]] as const) {
      currentUa = ua;
      assert.equal(yu.isAndroidWebViewClient(), exp, ua);
      assert.equal(isAndroidAppUserAgent(ua), exp);
    }
  });
  await t("tutarlılık: sunucunun cookie VERMEDİĞİ her `; wv)` istemci, istemcide de Android (token yolu)", () => {
    for (const ua of [ANDROID_WV_UA, "Mozilla/5.0 (Linux; Android 13; Pixel; wv) AppleWebKit Instagram"]) {
      assert.equal(isAndroidAppRequest(new Headers({ "user-agent": ua })), true);
      assert.equal(isAndroidAppUserAgent(ua), true);
    }
  });

  // ── 2) oturum kimlik bilgisi ─────────────────────────────────────────────────────────────
  await t("hasSessionCredential: web+token=true, web+profil+tokensuz=true (cookie), web+profilsiz=false", () => {
    setSession({ token: true });
    assert.equal(yu.hasSessionCredential(), true);
    setSession({ token: false });
    assert.equal(yu.hasSessionCredential(), true);
    assert.equal(yu.hasWebSession(), true);
    setSession({ user: false, token: false });
    assert.equal(yu.hasSessionCredential(), false);
    assert.equal(yu.hasWebSession(), false);
  });
  await t("ANDROID: hasSessionCredential yalnız token ile (tokensuz=false; cookie YOK)", () => {
    setSession({ token: true, ua: ANDROID_WV_UA });
    assert.equal(yu.hasSessionCredential(), true);
    setSession({ token: false, ua: ANDROID_WV_UA });
    assert.equal(yu.hasSessionCredential(), false);
    assert.equal(yu.hasWebSession(), false);
  });
  await t("sessionTokenHeader: token yoksa başlık HİÇ yok (\"null\" metni üretilmez)", () => {
    assert.deepEqual(yu.sessionTokenHeader(null), {});
    assert.deepEqual(yu.sessionTokenHeader(""), {});
    assert.deepEqual(yu.sessionTokenHeader(TOKEN), { "x-session-token": TOKEN });
  });
  await t("H5 sözleşmesi: readSessionToken web'de token'ı DÖNDÜRMEYE devam eder (H6 değil)", () => {
    setSession({ token: true });
    assert.equal(yu.readSessionToken(), TOKEN);
  });

  // ── 3) checkSessionStatus / confirmSessionInvalid ────────────────────────────────────────
  await t("checkSessionStatus web+token: token başlıkta (bugünkü yol)", async () => {
    setSession({ token: true });
    nextResponse = () => new Response(JSON.stringify({ valid: true }), { status: 200 });
    assert.equal((await se.checkSessionStatus())?.valid, true);
    assert.equal(calls[0].headers["x-session-token"], TOKEN);
  });
  await t("checkSessionStatus web TOKENSUZ: cookie ile sorar (token başlığı/URL yok)", async () => {
    setSession({ token: false });
    nextResponse = () => new Response(JSON.stringify({ valid: false, reason: "expired" }), { status: 200 });
    const s = await se.checkSessionStatus();
    assert.equal(s?.valid, false);
    assert.equal(s?.reason, "expired");
    assert.equal(calls.length, 1);
    assert.ok(!("x-session-token" in calls[0].headers));
    assert.ok(!calls[0].url.includes("token="));
  });
  await t("checkSessionStatus ANDROID tokensuz: istek YOK, karar YOK (null)", async () => {
    setSession({ token: false, ua: ANDROID_WV_UA });
    assert.equal(await se.checkSessionStatus(), null);
    assert.equal(calls.length, 0);
  });
  await t("checkSessionStatus web tokensuz + sunucu 400 (cookie modu primary değil): karar YOK", async () => {
    setSession({ token: false });
    nextResponse = () => new Response(JSON.stringify({ valid: false }), { status: 400 });
    assert.equal(await se.checkSessionStatus(), null);
  });
  await t("confirmSessionInvalid web tokensuz: iki kesin 'geçersiz' → sonuç; Android tokensuz → null", async () => {
    setSession({ token: false });
    const seen: Array<string | null> = [];
    const r = await se.confirmSessionInvalid(1, async (tk) => { seen.push(tk); return { valid: false, reason: "revoked" }; }, () => null);
    assert.equal(r?.reason, "revoked");
    assert.deepEqual(seen, [null, null]);
    setSession({ token: false, ua: ANDROID_WV_UA });
    assert.equal(await se.confirmSessionInvalid(1, async () => ({ valid: false, reason: "revoked" }), () => null), null);
  });
  await t("bootstrap ipucu yalnız token varken (tokensuz cookie yolunda bootstrap çağrılmaz)", async () => {
    setSession({ token: false });
    nextResponse = () => new Response(JSON.stringify({ valid: true, cookie: "bootstrap" }), { status: 200 });
    await se.checkSessionStatus();
    assert.ok(!calls.some((c) => c.url.includes("/api/auth/session/cookie")));
  });

  // ── 4) logout ────────────────────────────────────────────────────────────────────────────
  await t("clearYasamUser web+token: DELETE token başlığıyla (bugünkü yol)", () => {
    setSession({ token: true });
    yu.clearYasamUser();
    const del = calls.find((c) => c.url === "/api/auth/session" && c.method === "DELETE");
    assert.equal(del?.headers["x-session-token"], TOKEN);
    assert.equal(store.get("yasam_session_token"), undefined);
  });
  await t("clearYasamUser web TOKENSUZ: cookie-logout DELETE (x-user-id, token başlığı YOK)", () => {
    setSession({ token: false });
    yu.clearYasamUser();
    const del = calls.find((c) => c.url === "/api/auth/session" && c.method === "DELETE");
    assert.ok(del, "DELETE yok");
    assert.equal(del?.headers["x-user-id"], UID);
    assert.ok(!("x-session-token" in (del?.headers ?? {})));
    assert.equal(store.get("yasam_user"), undefined);
  });
  await t("clearYasamUser ANDROID tokensuz: session DELETE YOK (cookie yolu Android'de yok)", () => {
    setSession({ token: false, ua: ANDROID_WV_UA });
    yu.clearYasamUser();
    assert.ok(!calls.some((c) => c.url === "/api/auth/session" && c.method === "DELETE"));
  });
  await t("clearYasamUser ANDROID+token: token DELETE aynen", () => {
    setSession({ token: true, ua: ANDROID_WV_UA });
    yu.clearYasamUser();
    assert.equal(calls.find((c) => c.url === "/api/auth/session")?.headers["x-session-token"], TOKEN);
  });

  // ── 5) sunucu dalları (DB'ye inmeden) ────────────────────────────────────────────────────
  const env = process.env as Record<string, string | undefined>;
  const setMode = (m: string | undefined) => {
    if (m === undefined) delete env.SESSION_COOKIE_MODE;
    else env.SESSION_COOKIE_MODE = m;
    env.SESSION_COOKIE_ALLOWED_ORIGINS = ORIGIN;
  };
  const mk = (url: string, method: string, headers: Record<string, string> = {}) =>
    new NextRequest(`https://www.yasamsistemi.com${url}`, { method, headers: { "user-agent": WEB_UA, ...headers } });
  const sessionRoute = await import("../../app/api/auth/session/route");
  const adminRoute = await import("../../app/api/auth/admin-session/route");
  const pendingRoute = await import("../../app/api/auth/session/pending/route");

  await t("session GET primary + web + header/cookie YOK → 200 {valid:false} (oturum yok)", async () => {
    setMode("primary");
    const r = await sessionRoute.GET(mk("/api/auth/session", "GET"));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { valid: false, reason: "revoked" });
  });
  await t("session GET off / shadow + tokensuz → 400 (bugünkü yanıt birebir)", async () => {
    for (const m of [undefined, "off", "shadow", "canary"]) {
      setMode(m);
      const r = await sessionRoute.GET(mk("/api/auth/session", "GET", { cookie: `__Host-yasam_sid=${TOKEN}` }));
      assert.equal(r.status, 400, String(m));
    }
  });
  await t("session GET primary + ANDROID + tokensuz → 400 (Android cookie okumaz)", async () => {
    setMode("primary");
    const r = await sessionRoute.GET(mk("/api/auth/session", "GET", { "user-agent": ANDROID_WV_UA, cookie: `__Host-yasam_sid=${TOKEN}` }));
    assert.equal(r.status, 400);
  });
  await t("session GET `?token=` KALDIRILDI (URL'deki token yok sayılır)", async () => {
    setMode("off");
    const r = await sessionRoute.GET(mk(`/api/auth/session?token=${TOKEN}`, "GET"));
    assert.equal(r.status, 400);
    assert.ok(!/searchParams\.get\("token"\)/.test(read("app/api/auth/session/route.ts")));
  });
  await t("admin-session POST/DELETE: mod≠off + yanlış Origin → 403; cross-site → 403", async () => {
    for (const m of ["canary", "shadow", "primary"]) {
      setMode(m);
      assert.equal((await adminRoute.POST(mk("/api/auth/admin-session", "POST", { origin: "https://evil.example", "x-session-token": TOKEN }))).status, 403, m);
      assert.equal((await adminRoute.DELETE(mk("/api/auth/admin-session", "DELETE", { origin: "https://evil.example" }))).status, 403, m);
      assert.equal((await adminRoute.DELETE(mk("/api/auth/admin-session", "DELETE", { "sec-fetch-site": "cross-site" }))).status, 403, m);
    }
  });
  await t("admin-session: same-origin DELETE → 200 (cookie temizler); off modda Origin kontrolü YOK", async () => {
    setMode("primary");
    assert.equal((await adminRoute.DELETE(mk("/api/auth/admin-session", "DELETE", { origin: ORIGIN }))).status, 200);
    setMode("off");
    assert.equal((await adminRoute.DELETE(mk("/api/auth/admin-session", "DELETE", { origin: "https://evil.example" }))).status, 200);
    assert.equal((await adminRoute.POST(mk("/api/auth/admin-session", "POST", { origin: "https://evil.example" }))).status, 401);
  });
  await t("admin-session ANDROID: Origin kontrolü uygulanmaz (bugünkü davranış)", async () => {
    setMode("primary");
    const r = await adminRoute.DELETE(mk("/api/auth/admin-session", "DELETE", { "user-agent": ANDROID_WV_UA, origin: "https://evil.example" }));
    assert.equal(r.status, 200);
  });
  await t("admin-session POST primary + web + same-origin + header/cookie yok → 401 (kimlik yok)", async () => {
    setMode("primary");
    assert.equal((await adminRoute.POST(mk("/api/auth/admin-session", "POST", { origin: ORIGIN }))).status, 401);
  });
  await t("pending DELETE: mod≠off + yanlış Origin → 403; same-origin/off → 200", async () => {
    setMode("primary");
    assert.equal((await pendingRoute.DELETE(mk("/api/auth/session/pending", "DELETE", { origin: "https://evil.example" }))).status, 403);
    assert.equal((await pendingRoute.DELETE(mk("/api/auth/session/pending", "DELETE", { origin: ORIGIN }))).status, 200);
    setMode("off");
    assert.equal((await pendingRoute.DELETE(mk("/api/auth/session/pending", "DELETE", { origin: "https://evil.example" }))).status, 200);
  });

  // ── 6) statik: H5 kapsamı / H6 sınırı ────────────────────────────────────────────────────
  await t("login gövdesi Android/header taşımasında token döndürür (H6b: web+cookie'de sessionCookie); completeLogin varsa kaydeder", () => {
    assert.ok(/\{ sessionCookie: true \} : \{ sessionToken \}/.test(read("app/api/auth/session/route.ts")));
    assert.ok(/saveSessionToken\(sessionToken\)/.test(read("app/page.tsx")));
  });
  await t("pending onay: web cookie sunucuda (mod≠off, Android hariç, süreli); token gövdede YOK", () => {
    const p = read("app/api/auth/session/pending/route.ts");
    assert.ok(/cookieCfg\.mode !== "off" && !isAndroidAppRequest\(req\.headers\)/.test(p));
    assert.ok(/client_channel !== "android_app"/.test(p) && /maxAge !== null/.test(p));
    assert.ok(!/json\(\s*\{\s*state,\s*user: u,[^}]*token/.test(p));
  });
  await t("token-yok kapıları merkezi helper'da: bilinen kapılarda ham `!token` kalmadı", () => {
    const gates: Array<[string, RegExp]> = [
      ["app/page.tsx", /if \(!hasSessionCredential\(\)\) \{\r?\n\s+\/\/ Oturum kimlik bilgisi yok/],
      ["lib/auth/yasamUser.ts", /if \(!hasSessionCredential\(token(, user\.id)?\)\) return user;/],
      ["lib/auth/sessionExpiry.ts", /if \(!hasSessionCredential\(token\)\) return null;/],
      ["components/notifications/notificationStore.ts", /return hasWebSession\(\);/],
      ["app/human-design/danisanlar/components/HdChartImageUpload.tsx", /return hasWebSession\(\);/],
      ["components/settings/MySessionsPanel.tsx", /if \(!hasSessionCredential\(token\)\) return;/],
      ["lib/dogaltas/dogaltasApi.ts", /if \(!userId \|\| !hasSessionCredential\(token\)\) return null;/],
      ["lib/refleksoloji/reflexStore.ts", /if \(!uid \|\| !hasSessionCredential\(token\)\) return null;/],
    ];
    for (const [f, re] of gates) assert.ok(re.test(read(f)), f);
  });
  await t("istemci başlıklarında null/boş token sızmaz: `\"x-session-token\": token` (koşulsuz) kalmadı", () => {
    const files = [
      "lib/dogaltas/dogaltasApi.ts", "lib/dogaltas/clientCombinationsApi.ts", "lib/dogaltas/combinationsApi.ts",
      "lib/dogaltas/conditionSearchApi.ts", "lib/location/userLocationPref.ts", "lib/refleksoloji/reflexStore.ts",
      "lib/stones/stoneWarningService.ts", "lib/aromaterapi/blendData.ts", "lib/usage/usageBeaconClient.ts",
      "components/auth/AdminSessionApprovalBanner.tsx", "components/settings/MySessionsPanel.tsx",
      "app/dogaltas/components/SaveCombinationModal.tsx", "app/urun-stok/canli-stok/page.tsx",
    ];
    for (const f of files) assert.ok(!/"x-session-token":\s*(token|sessionToken)\b/.test(read(f)), f);
  });
  await t("Android oturum politikası değişmedi (no-expiry satırı)", () => {
    assert.ok(read("lib/auth/sessionSecurity.ts").includes('p_expires_at: clientChannel === "android_app" ? null : computeSessionExpiresAt(lr?.role),'));
  });

  console.log(`httponly-h5 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
