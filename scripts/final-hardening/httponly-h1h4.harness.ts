/**
 * HTTPONLY WEB SESSION H1–H4 harness (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/httponly-h1h4.harness.ts
 *
 * Kapsam:
 *   - SESSION_COOKIE_MODE ayrıştırma (eksik/geçersiz/cookie_only → off) + allowlist
 *   - pickSessionCredential matrisi (off / canary / shadow / primary × header / cookie / ikisi /
 *     Android) — off modda cookie TAMAMEN yok sayılır
 *   - resolveSessionUserId politikası + doğrulama çağrı sayısı (off: tam 1 çağrı, aynı token)
 *   - CSRF: yalnız cookie-auth + durum değiştiren metot; Origin / Sec-Fetch-Site / özel başlık
 *   - cookie bayrakları, Max-Age hesabı, Android dışlama
 *   - statik: guard'lar çözücüden geçer; allowlist NEXT_PUBLIC değil; istemci dosyaları cookie
 *     modülünü import etmez; telemetri token loglamaz
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WEB_SESSION_COOKIE,
  cookieMaxAgeFromExpiresAt,
  getSessionCookieConfig,
  isAndroidAppRequest,
  isSessionCookieEligible,
  readSessionCookieMode,
  setWebSessionCookie,
  clearWebSessionCookie,
} from "../../lib/auth/sessionCookie";
import { pickSessionCredential, resolveSessionUserId } from "../../lib/auth/sessionTransport";
import { allowedSessionOrigins, checkCookieAuthCsrf, checkSameOriginRequest } from "../../lib/security/csrf";

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

const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const TA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const TA2 = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";
const TB = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129 Safari/537.36";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-X; wv) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36";
const ORIGIN = "https://www.yasamsistemi.com";

function req(opts: { method?: string; header?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  const h = new Headers({ "user-agent": WEB_UA, ...(opts.headers ?? {}) });
  if (opts.header) h.set("x-session-token", opts.header);
  if (opts.cookie) h.set("cookie", `${WEB_SESSION_COOKIE}=${opts.cookie}`);
  return new NextRequest("https://www.yasamsistemi.com/api/x", { method: opts.method ?? "GET", headers: h });
}
const cfg = (mode: string, allow = A) => getSessionCookieConfig({ SESSION_COOKIE_MODE: mode, SESSION_COOKIE_CANARY_USER_IDS: allow });
const SESSIONS: Record<string, string | null> = { [TA]: A, [TA2]: A, [TB]: B };
function validator() {
  const calls: string[] = [];
  const fn = async (_db: SupabaseClient, token: string) => {
    calls.push(token);
    return SESSIONS[token] ?? null;
  };
  return { fn, calls };
}
const DB = {} as SupabaseClient;
async function resolve(mode: string, r: NextRequest) {
  const pick = pickSessionCredential(r, cfg(mode), { SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN });
  const v = validator();
  if (pick.kind !== "credential") return { pick, res: null, calls: v.calls };
  const res = await resolveSessionUserId(DB, pick, v.fn);
  return { pick, res, calls: v.calls };
}

async function main() {
  // ── 1) Bayrak ──────────────────────────────────────────────────────────────
  await t("mode: eksik/geçersiz/cookie_only → off", () => {
    for (const v of [undefined, "", "ON", "true", "cookie_only", "primary ", "Primary"]) {
      const m = readSessionCookieMode({ SESSION_COOKIE_MODE: v });
      assert.equal(m, v === "primary " || v === "Primary" ? "primary" : "off", String(v));
    }
    for (const v of ["off", "canary", "shadow", "primary"]) assert.equal(readSessionCookieMode({ SESSION_COOKIE_MODE: v }), v);
  });
  await t("allowlist: yalnız UUID; uygunluk moda göre", () => {
    const c = getSessionCookieConfig({ SESSION_COOKIE_MODE: "canary", SESSION_COOKIE_CANARY_USER_IDS: ` ${A.toUpperCase()} ,junk,` });
    assert.deepEqual([...c.canaryUserIds], [A]);
    assert.equal(isSessionCookieEligible(c, A), true);
    assert.equal(isSessionCookieEligible(c, B), false);
    assert.equal(isSessionCookieEligible(cfg("off"), A), false);
    assert.equal(isSessionCookieEligible(cfg("shadow"), B), true);
    assert.equal(isSessionCookieEligible(cfg("primary"), B), true);
  });

  // ── 2) OFF parity ──────────────────────────────────────────────────────────
  await t("off: yalnız header; cookie tamamen yok sayılır; tek doğrulama çağrısı", async () => {
    for (const r of [req({ header: TA }), req({ header: TA, cookie: TB }), req({ header: TA, cookie: TA2 })]) {
      const { res, calls } = await resolve("off", r);
      assert.deepEqual(calls, [TA]);
      assert.deepEqual(res, { status: "ok", userId: A, token: TA, source: "header" });
    }
    assert.equal((await resolve("off", req({ cookie: TA }))).pick.kind, "none");
    assert.equal((await resolve("off", req({}))).pick.kind, "none");
    const bad = await resolve("off", req({ header: "ffffffff-0000-4000-8000-ffffffffffff" }));
    assert.deepEqual(bad.res, { status: "invalid" });
  });
  await t("off: header trim davranışı korunur", async () => {
    const { calls } = await resolve("off", req({ headers: { "x-session-token": `  ${TA}  ` } }));
    assert.deepEqual(calls, [TA]);
  });

  // ── 3) canary / shadow (header birincil) ───────────────────────────────────
  for (const mode of ["canary", "shadow"]) {
    await t(`${mode}: cookie tek başına auth DEĞİL`, async () => {
      assert.equal((await resolve(mode, req({ cookie: TA }))).pick.kind, "none");
    });
    await t(`${mode}: header=cookie → 1 çağrı`, async () => {
      const { res, calls } = await resolve(mode, req({ header: TA, cookie: TA }));
      assert.deepEqual(calls, [TA]);
      assert.equal(res?.status, "ok");
    });
    await t(`${mode}: farklı kullanıcı → conflict`, async () => {
      const { res, calls } = await resolve(mode, req({ header: TA, cookie: TB }));
      assert.equal(calls.length, 2);
      assert.deepEqual(res, { status: "conflict" });
    });
    await t(`${mode}: aynı kullanıcı başka oturum / geçersiz cookie → header ile ok`, async () => {
      assert.deepEqual((await resolve(mode, req({ header: TA, cookie: TA2 }))).res, { status: "ok", userId: A, token: TA, source: "header" });
      assert.deepEqual((await resolve(mode, req({ header: TA, cookie: "dead0000-0000-4000-8000-00000000dead" }))).res, { status: "ok", userId: A, token: TA, source: "header" });
    });
    await t(`${mode}: geçersiz header + geçerli cookie → invalid (cookie fallback YOK)`, async () => {
      assert.deepEqual((await resolve(mode, req({ header: "dead0000-0000-4000-8000-00000000dead", cookie: TA }))).res, { status: "invalid" });
    });
  }

  // ── 4) primary ─────────────────────────────────────────────────────────────
  await t("primary: yalnız cookie (GET) → cookie kaynağı, 1 çağrı", async () => {
    const { res, calls } = await resolve("primary", req({ cookie: TA }));
    assert.deepEqual(calls, [TA]);
    assert.deepEqual(res, { status: "ok", userId: A, token: TA, source: "cookie" });
  });
  await t("primary: cookie yoksa header fallback", async () => {
    assert.deepEqual((await resolve("primary", req({ header: TA }))).res, { status: "ok", userId: A, token: TA, source: "header" });
  });
  await t("primary: header=cookie → header kaynağı (CSRF gerekmez), 1 çağrı", async () => {
    const { pick, calls } = await resolve("primary", req({ method: "POST", header: TA, cookie: TA }));
    assert.equal(pick.kind === "credential" && pick.source, "header");
    assert.equal(calls.length, 1);
  });
  await t("primary: farklı kullanıcı → conflict; biri geçersiz → invalid; aynı kullanıcı → ok", async () => {
    assert.deepEqual((await resolve("primary", req({ header: TA, cookie: TB }))).res, { status: "conflict" });
    assert.deepEqual((await resolve("primary", req({ header: TA, cookie: "dead0000-0000-4000-8000-00000000dead" }))).res, { status: "invalid" });
    assert.deepEqual((await resolve("primary", req({ header: "dead0000-0000-4000-8000-00000000dead", cookie: TA }))).res, { status: "invalid" });
    assert.equal((await resolve("primary", req({ header: TA, cookie: TA2 }))).res?.status, "ok");
  });
  await t("primary: cookie-only durum değiştiren metot → CSRF", async () => {
    const ok = (await resolve("primary", req({ method: "POST", cookie: TA, headers: { "x-user-id": A, origin: ORIGIN } }))).pick.kind;
    assert.equal(ok, "credential");
    for (const headers of [
      { "x-user-id": A, origin: "https://evil.example" },
      { "x-user-id": A, "sec-fetch-site": "cross-site" },
      { "x-user-id": A },
      { origin: ORIGIN },
    ] as Record<string, string>[]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        assert.equal((await resolve("primary", req({ method, cookie: TA, headers }))).pick.kind, "csrf_denied", `${method} ${JSON.stringify(headers)}`);
      }
    }
    assert.equal((await resolve("primary", req({ method: "POST", cookie: TA, headers: { "x-user-id": A, "sec-fetch-site": "same-origin" } }))).pick.kind, "credential");
  });

  // ── 5) Android ─────────────────────────────────────────────────────────────
  await t("android: her modda cookie yok sayılır (header yolu)", async () => {
    const androidHeaders = [
      { "user-agent": ANDROID_UA, "x-requested-with": "com.yasamsistemi.app" },
      { "user-agent": ANDROID_UA },
      { "user-agent": WEB_UA, "x-yasam-client": "android" },
    ];
    for (const mode of ["canary", "shadow", "primary"]) {
      for (const headers of androidHeaders) {
        assert.equal((await resolve(mode, req({ cookie: TA, headers }))).pick.kind, "none", mode);
        const { res, calls } = await resolve(mode, req({ header: TA, cookie: TB, headers }));
        assert.deepEqual(calls, [TA]);
        assert.equal(res?.status, "ok");
      }
    }
    assert.equal(isAndroidAppRequest(new Headers({ "user-agent": WEB_UA })), false);
  });

  // ── 6) CSRF birimleri ──────────────────────────────────────────────────────
  await t("csrf: güvenli metot serbest; izinli origin listesi Host'tan türetilmez", () => {
    assert.deepEqual(checkCookieAuthCsrf("GET", new Headers()), { ok: true });
    assert.deepEqual([...allowedSessionOrigins({})], [ORIGIN]);
    assert.deepEqual([...allowedSessionOrigins({ SESSION_COOKIE_ALLOWED_ORIGINS: "http://localhost:3100/, junk" })], ["http://localhost:3100"]);
    const prev = allowedSessionOrigins({ VERCEL_ENV: "preview", VERCEL_URL: "x-abc.vercel.app" });
    assert.ok(prev.has("https://x-abc.vercel.app") && prev.has(ORIGIN));
    assert.equal(allowedSessionOrigins({ VERCEL_ENV: "production", VERCEL_URL: "x-abc.vercel.app" }).has("https://x-abc.vercel.app"), false);
    assert.equal(checkSameOriginRequest(new Headers({ origin: "null" }), {}).ok, false);
    assert.equal(checkSameOriginRequest(new Headers({ origin: "https://www.yasamsistemi.com.evil.example" }), {}).ok, false);
    assert.equal(checkSameOriginRequest(new Headers({ "sec-fetch-site": "same-site" }), {}).ok, false);
  });

  // ── 7) Cookie ──────────────────────────────────────────────────────────────
  await t("cookie: HttpOnly Secure SameSite=Strict Path=/ Domain yok; temizleme Max-Age=0", () => {
    const res = NextResponse.json({});
    setWebSessionCookie(res, TA, 3600);
    const sc = res.headers.get("set-cookie") ?? "";
    assert.match(sc, /^__Host-yasam_sid=aaaaaaaa-1111/);
    for (const re of [/HttpOnly/i, /Secure/i, /SameSite=strict/i, /Path=\//, /Max-Age=3600/]) assert.match(sc, re);
    assert.doesNotMatch(sc, /Domain=/i);
    const res2 = NextResponse.json({});
    clearWebSessionCookie(res2);
    assert.match(res2.headers.get("set-cookie") ?? "", /__Host-yasam_sid=;.*Max-Age=0/i);
  });
  await t("cookie Max-Age: expires_at'ten; null/geçmiş → null; 30 gün tavan", () => {
    const now = Date.parse("2026-10-09T00:00:00Z");
    assert.equal(cookieMaxAgeFromExpiresAt("2026-10-09T01:00:00Z", now), 3600);
    assert.equal(cookieMaxAgeFromExpiresAt(null, now), null);
    assert.equal(cookieMaxAgeFromExpiresAt("2026-10-08T00:00:00Z", now), null);
    assert.equal(cookieMaxAgeFromExpiresAt("2027-10-09T00:00:00Z", now), 30 * 86400);
    assert.equal(cookieMaxAgeFromExpiresAt("garbage", now), null);
  });
  await t("cookie değeri biçim dışıysa yok sayılır", async () => {
    assert.equal((await resolve("primary", req({ cookie: "x" }))).pick.kind, "none");
  });

  // ── 8) Statik ──────────────────────────────────────────────────────────────
  await t("guard'lar token'ı çözücüden alır (doğrudan header okuma yok)", () => {
    for (const f of ["lib/auth/userGuard.ts", "lib/auth/adminGuard.ts", "lib/auth/sessionModel.ts"]) {
      const s = read(f);
      assert.ok(/pickSessionCredential\(req\)/.test(s) && /resolveSessionUserId\(db, credential\)/.test(s), f);
      assert.ok(!/headers\.get\(\s*"x-session-token"/.test(s), f);
      assert.ok(!/getActiveSessionUserId\(/.test(s), f);
    }
  });
  await t("allowlist/mode NEXT_PUBLIC değil; istemci cookie modülünü import etmez", () => {
    const all = ["lib/auth/sessionCookie.ts", "lib/auth/sessionTransport.ts", "lib/security/csrf.ts"].map(read).join("\n");
    assert.ok(!/NEXT_PUBLIC_SESSION|NEXT_PUBLIC_.*CANARY/.test(all));
    const walk = (d: string): string[] =>
      fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "node_modules" ? [] : walk(`${d}/${e.name}`)) : /\.(tsx?|mjs)$/.test(e.name) ? [`${d}/${e.name}`] : [],
      );
    const clients = ["app", "components", "hooks", "lib"].flatMap(walk).filter((f) => /^\s*["']use client["']/.test(read(f)));
    for (const f of clients) assert.ok(!/sessionCookie|sessionTransport|security\/csrf/.test(read(f)), f);
  });
  await t("telemetri yalnız olay türü + mod (token/cookie/id loglanmaz)", () => {
    const s = read("lib/auth/sessionTransport.ts");
    const logs = s.match(/console\.\w+\([^;]*\);/g) ?? [];
    assert.deepEqual(logs, ['console.warn(JSON.stringify({ evt: "session_transport", kind, mode }));']);
  });
  await t("login/bootstrap: Android'e cookie set edilmez; bootstrap token'ı gövdeye koymaz", () => {
    const login = read("app/api/auth/session/route.ts");
    assert.ok(/result\.channel !== "android_app"/.test(login) && /!isAndroidAppRequest\(req\.headers\)/.test(login));
    const boot = read("app/api/auth/session/cookie/route.ts");
    assert.ok(/client_channel === "android_app"/.test(boot) && /isAndroidAppRequest\(req\.headers\)/.test(boot));
    assert.ok(/cfg\.mode === "off"\) return json\(\{ error: "Bulunamadı\." \}, 404\)/.test(boot));
    assert.ok(!/json\(\{[^}]*token/.test(boot), "token gövdede");
  });
  await t("Android oturum politikası dosyalarına dokunulmadı (sessionSecurity.ts kanal/süre satırları)", () => {
    const s = read("lib/auth/sessionSecurity.ts");
    assert.ok(s.includes('p_expires_at: clientChannel === "android_app" ? null : computeSessionExpiresAt(lr?.role),'));
  });

  console.log(`httponly-h1h4 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
