/**
 * FAZ1 FINAL HARDENING — PAKET AUTH harness'i (tsx; DB/ağ YOK).
 *
 * Gerçek route handler'ları ve guard'lar, global `fetch` üzerine kurulan SAHTE bir PostgREST
 * (bellek içi tablolar + RPC simülasyonu) ile koşar. Supabase'e/prod'a istek GİTMEZ
 * (URL: http://fake-supabase.local).
 *
 * Kapsam:
 *   A) Tek login yolu (POST /api/auth/session): throttle eşikleri (auth_login_guarded
 *      semantiğinin JS simülasyonu — gerçek SQL davranışı pg-migration-check assert'inde),
 *      kilitliyken doğru parola 429, var olmayan e-posta ile aynı 401 gövdesi, başarıda sıfırlama,
 *      sunucu gating (inactive/pending → 403, token üretilmez).
 *   B) Touch GERÇEKTEN await edilir (tembel thenable builder ile `void` regresyonu yakalanır),
 *      RPC yolu + enforce kapalı/açık davranışı.
 *   C) Logout: DELETE /api/auth/session → 200 (idempotent) → aynı token 401.
 *   D) Üyelik: inactive (premium değil) → 403 MEMBERSHIP_INACTIVE; admin muaf; profil açık.
 *   E) AI admin-only: expert 403 / admin OK / pdf-to-word (belge_ceviri) expert OK.
 *   F) Belge history: yalnız query param → 401.
 *   G) Video: PATCH videoTempPath yok sayılır; yabancı prefix reddedilir.
 *   H) Statik: tarayıcı login_user çağırmaz; clearYasamUser token'ı silmeden önce DELETE gönderir.
 *
 * Çalıştır: npx tsx scripts/final-hardening/auth.harness.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake-supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
delete process.env.SESSION_EXPIRY_ENFORCE;

import {
  POST as sessionPOST,
  GET as sessionGET,
  DELETE as sessionDELETE,
} from "@/app/api/auth/session/route";
import { GET as profileGET } from "@/app/api/auth/profile/route";
import { GET as historyGET } from "@/app/api/belge-ceviri/history/route";
import { requireModuleAccess, verifyUserRequest } from "@/lib/auth/userGuard";
import { requireDigitalContentUser } from "@/lib/auth/requireUser";
import {
  getActiveSessionUserId,
  touchActiveSession,
  resolveSessionExpiryPolicy,
  isSessionExpiryEnforced,
  effectiveAllowedLocations,
  computeSessionExpiresAt,
  extractClientIp,
} from "@/lib/auth/sessionSecurity";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { validateNewPassword } from "@/lib/admin/accountSessionControls";
import { hashLoginIp, parseGuardedLoginResponse } from "@/lib/auth/loginThrottle";
import { isMissingRpcError } from "@/lib/auth/credentialLogin";
import { pickClientJobPatchFields, isVideoTempPathOwned } from "@/lib/video-ceviri/videoTempPath";
import type { SupabaseClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

// ─── Sahte PostgREST (bellek içi) ────────────────────────────────────────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  users: [],
  user_sessions: [],
  security_events: [],
  video_transcription_jobs: [],
};
const throttle = new Map<string, { scope: string; fail: number; start: number; lockedUntil: number | null }>();
const rpcCalls: { name: string; args: Row }[] = [];
let nowMs = Date.now();

const U = {
  expert: "00000000-0000-0000-0000-000000000001",
  pro: "00000000-0000-0000-0000-000000000002",
  admin: "00000000-0000-0000-0000-000000000003",
  pending: "00000000-0000-0000-0000-000000000004",
  inactive: "00000000-0000-0000-0000-000000000005",
};
const T = "10000000-0000-0000-0000-000000000001";

function user(id: string, email: string, pw: string, extra: Row): Row {
  return {
    id, email, name: email.split("@")[0], full_name: null, role: "expert", status: "active",
    tenant_id: T, active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: {}, is_demo_account: false, admin_level: null, membership_status: "active",
    subscription_status: null, trial_started_at: null, trial_ends_at: null, membership_started_at: null,
    membership_ends_at: null, security_exempt: false, allowed_active_sessions: -1, allowed_locations: 1,
    security_mode: "normal", license_type: "single", allowed_desktop_sessions: -1, allowed_mobile_sessions: -1,
    allowed_tablet_sessions: -1, allowed_unknown_sessions: -1,
    __pw: pw, ...extra,
  };
}
tables.users.push(
  user(U.expert, "uzman@test.com", "dogru-parola-1", { module_permissions: { clients: true, belge_ceviri: true, video_ceviri: true, ders_notu: true } }),
  user(U.pro, "pro@test.com", "pro-parola-12", { package_type: "pro", plan: "pro", module_permissions: { clients: true } }),
  user(U.admin, "admin@test.com", "admin-parola-1", { role: "admin", package_type: null, plan: null }),
  user(U.pending, "pending@test.com", "pending-parola", { approval_status: "pending" }),
  user(U.inactive, "pasif@test.com", "pasif-parola-1", { active: false }),
);

const sha = (s: string) => hashLoginIp(s, "k"); // yalnız deterministik anahtar için

/** auth_login_guarded SQL semantiğinin JS aynası (eşikler migration 20270129000000 ile aynı). */
function fakeAuthLoginGuarded(args: Row): unknown {
  const email = String(args.p_email ?? "").trim().toLowerCase();
  const pw = String(args.p_password ?? "");
  const ip = String(args.p_ip_hash ?? "").trim();
  if (!email || !pw) return { status: "invalid" };
  const eKey = "e:" + sha(email);
  const iKey = ip ? "i:" + ip : null;
  const eiKey = ip ? "ei:" + sha(email) + ":" + ip : null;
  const keys = [eKey, iKey, eiKey].filter(Boolean) as string[];
  const locked = keys.map((k) => throttle.get(k)?.lockedUntil ?? 0).reduce((a, b) => Math.max(a, b), 0);
  if (locked > nowMs) return { status: "locked", retry_after: Math.max(1, Math.ceil((locked - nowMs) / 1000)) };
  const u = tables.users.find((r) => String(r.email).trim().toLowerCase() === email && r.__pw === pw);
  if (u) {
    throttle.delete(eKey);
    if (eiKey) throttle.delete(eiKey);
    const { id, email: em, name, role, status, tenant_id, active, approval_status } = u;
    return { status: "ok", user: { id, email: em, name, role, status, tenant_id, active, approval_status } };
  }
  const bump = (key: string, scope: string) => {
    const win = scope === "email_ip" ? 60 * 60_000 : 15 * 60_000;
    const cur = throttle.get(key) ?? { scope, fail: 0, start: nowMs, lockedUntil: null };
    if (cur.start < nowMs - win) { cur.fail = 0; cur.start = nowMs; }
    cur.fail += 1;
    let lock: number | null = null;
    if (scope === "email_ip") lock = cur.fail >= 20 ? 3600_000 : cur.fail >= 10 ? 900_000 : cur.fail >= 5 ? 60_000 : null;
    else if (scope === "email") lock = cur.fail >= 30 ? 900_000 : null;
    else lock = cur.fail >= 50 ? 900_000 : null;
    cur.lockedUntil = lock ? nowMs + lock : null;
    throttle.set(key, cur);
  };
  bump(eKey, "email");
  if (eiKey && iKey) { bump(eiKey, "email_ip"); bump(iKey, "ip"); }
  return { status: "invalid" };
}

function fakeTouch(args: Row): unknown {
  const s = tables.user_sessions.find((r) => r.session_token === args.p_token && r.is_active === true);
  if (!s) return null;
  const role = String(tables.users.find((u) => u.id === s.user_id)?.role ?? "");
  if (args.p_enforce === true) {
    const isAdmin = role === "admin";
    const exp = s.expires_at ? Date.parse(String(s.expires_at)) : null;
    const created = Date.parse(String(s.created_at));
    const absAdmin = Number(args.p_admin_absolute_seconds ?? 0) * 1000;
    if ((exp !== null && exp <= nowMs) || (isAdmin && absAdmin > 0 && created <= nowMs - absAdmin)) {
      Object.assign(s, { is_active: false, end_reason: "expired_absolute" });
      return null;
    }
    const idle = Number((isAdmin ? args.p_admin_idle_seconds : args.p_idle_seconds) ?? 0) * 1000;
    if (idle > 0 && Date.parse(String(s.last_seen_at)) <= nowMs - idle) {
      Object.assign(s, { is_active: false, end_reason: "expired_idle" });
      return null;
    }
  }
  if (Date.parse(String(s.last_seen_at)) < nowMs - Number(args.p_touch_after_seconds ?? 0) * 1000) {
    s.last_seen_at = new Date(nowMs).toISOString();
  }
  return String(s.user_id);
}

function fakeCreateSession(args: Row): unknown {
  tables.user_sessions.push({
    id: `s-${tables.user_sessions.length + 1}`, user_id: args.p_user_id, session_token: args.p_session_token,
    ip_address: args.p_ip, country: args.p_country, city: args.p_city, user_agent: args.p_user_agent,
    platform: args.p_platform, is_active: true, created_at: new Date(nowMs).toISOString(),
    last_seen_at: new Date(nowMs).toISOString(), expires_at: null, client_channel: null,
  });
  return { inserted: true };
}

const missingRpc = new Set<string>();

function parseFilters(url: URL): ((r: Row) => boolean)[] {
  const out: ((r: Row) => boolean)[] = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const dot = v.indexOf(".");
    const op = v.slice(0, dot);
    const val = v.slice(dot + 1);
    const cmp = (x: unknown) => (x === null || x === undefined ? "null" : String(x));
    if (op === "eq") out.push((r) => cmp(r[k]) === val);
    else if (op === "neq") out.push((r) => cmp(r[k]) !== val);
    else if (op === "is") out.push((r) => cmp(r[k]) === val);
    else if (op === "in") {
      const set = new Set(val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")));
      out.push((r) => set.has(cmp(r[k])));
    }
  }
  return out;
}

const strip = (r: Row) => { const { __pw, ...rest } = r; void __pw; return rest; };
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.host !== "fake-supabase.local") throw new Error(`Beklenmeyen ağ isteği: ${url.href}`);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const prefer = new Headers(init?.headers).get("prefer") ?? "";
  const path = url.pathname.replace(/^\/rest\/v1\//, "");

  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    rpcCalls.push({ name, args: body ?? {} });
    if (missingRpc.has(name)) {
      return jsonRes({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
    }
    if (name === "auth_login_guarded") return jsonRes(fakeAuthLoginGuarded(body));
    if (name === "touch_active_session") return jsonRes(fakeTouch(body));
    if (name === "create_session_within_limits") return jsonRes(fakeCreateSession(body));
    if (name === "login_user") {
      const r = fakeAuthLoginGuarded({ ...body, p_ip_hash: "" }) as Row;
      return jsonRes(r.status === "ok" ? [r.user] : []);
    }
    return jsonRes({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
  }

  const rows = tables[path] ?? (tables[path] = []);
  const filters = parseFilters(url);
  const match = (r: Row) => filters.every((f) => f(r));
  if (method === "GET" || method === "HEAD") return jsonRes(rows.filter(match).map(strip));
  if (method === "POST") {
    const items = Array.isArray(body) ? body : [body];
    for (const it of items) rows.push({ id: `row-${rows.length + 1}`, ...it });
    return prefer.includes("return=representation") ? jsonRes(items, 201) : new Response(null, { status: 201 });
  }
  if (method === "PATCH") {
    const hit = rows.filter(match);
    for (const r of hit) Object.assign(r, body);
    return prefer.includes("return=representation") ? jsonRes(hit.map(strip)) : new Response(null, { status: 204 });
  }
  if (method === "DELETE") {
    tables[path] = rows.filter((r) => !match(r));
    return new Response(null, { status: 204 });
  }
  return jsonRes({ message: "unsupported" }, 400);
}) as typeof fetch;

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
const IP = "203.0.113.7";
function loginReq(email: string, password: string, ip = IP) {
  return new NextRequest("http://localhost/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip, "user-agent": "Mozilla/5.0 (Windows NT 10.0)" },
    body: JSON.stringify({ email, password }),
  });
}
function authed(url: string, userId: string, token: string, method = "GET") {
  return new NextRequest(url, { method, headers: { "x-user-id": userId, "x-session-token": token } });
}
async function login(email: string, password: string, ip = IP) {
  const res = await sessionPOST(loginReq(email, password, ip));
  const json = (await res.json()) as Record<string, unknown>;
  return { res, json };
}

async function run() {
  console.log("\n── A) Tek login yolu + throttle ──");
  {
    const { res, json } = await login(" Uzman@Test.com ", "  dogru-parola-1  ");
    const u = json.user as Row | undefined;
    ok(res.status === 200 && typeof json.sessionToken === "string" && u?.id === U.expert, "doğru giriş → 200 + token + gating satırı (e-posta lower/trim, şifre trim paritesi)");
    ok(u != null && !("password_hash" in u) && !("__pw" in u) && u.approval_status === "approved" && u.tenant_id === T, "gating satırı login_user alanları; hash YOK");
    const sess = tables.user_sessions.find((s) => s.session_token === json.sessionToken);
    ok(!!sess && typeof sess.expires_at === "string" && Date.parse(String(sess.expires_at)) > nowMs + 29 * 86400_000, "yeni uzman oturumu expires_at ≈ +30 gün yazıldı (R1)");
    ok(!!sess && sess.client_channel != null, "yeni oturum client_channel yazıldı");
    ok(res.headers.get("cache-control") === "no-store", "login yanıtı no-store");
  }
  {
    const wrong = await login("uzman@test.com", "yanlis-1", "198.51.100.1");
    const ghost = await login("hic-yok@test.com", "yanlis-1", "198.51.100.1");
    ok(wrong.res.status === 401 && ghost.res.status === 401, "yanlış şifre ve var olmayan e-posta → 401");
    ok(JSON.stringify(wrong.json) === JSON.stringify(ghost.json), "var olmayan e-posta ile AYNI gövde (hesap varlığı sızmaz)");
  }
  {
    const ip = "198.51.100.50";
    let last: Awaited<ReturnType<typeof login>> | null = null;
    for (let i = 0; i < 4; i++) last = await login("uzman@test.com", "yanlis", ip);
    ok(last!.res.status === 401, "4 hata → henüz kilit yok (401)");
    await login("uzman@test.com", "yanlis", ip); // 5. hata → 1 dk
    const lockedOk = await login("uzman@test.com", "dogru-parola-1", ip);
    ok(lockedOk.res.status === 429, "5 hata sonrası DOĞRU parola da reddedilir (429)");
    const ra = Number(lockedOk.res.headers.get("retry-after"));
    ok(ra >= 1 && ra <= 60 && lockedOk.json.code === "LOCKED", "429 + Retry-After ≤ 60 sn + code LOCKED");
    ok(!tables.user_sessions.some((s) => s.user_id === U.expert && s.ip_address === ip), "kilitliyken oturum/token ÜRETİLMEDİ");
    // farklı IP: e-posta scope eşiği (30) aşılmadı → giriş OK ve e-posta sayacı sıfırlanır
    const other = await login("uzman@test.com", "dogru-parola-1", "198.51.100.51");
    ok(other.res.status === 200, "farklı IP'den doğru giriş OK");
    ok(!throttle.has("e:" + sha("uzman@test.com")), "başarı e-posta sayacını SIFIRLAR");
    ok(throttle.get("ei:" + sha("uzman@test.com") + ":" + hashLoginIp(ip))?.lockedUntil != null, "başarı başka IP'nin e-posta+IP kilidini KALDIRMAZ");
    // 10 → 15 dk
    for (let i = 6; i <= 10; i++) {
      const k = throttle.get("ei:" + sha("uzman@test.com") + ":" + hashLoginIp(ip));
      if (k) k.lockedUntil = null;
      await login("uzman@test.com", "yanlis", ip);
    }
    const l10 = await login("uzman@test.com", "dogru-parola-1", ip);
    const ra10 = Number(l10.res.headers.get("retry-after"));
    ok(l10.res.status === 429 && ra10 > 60 && ra10 <= 900, "10 hata → 15 dk kilit");
    // Kilit bitince (zaman ilerler) doğru giriş OK + sayaçlar sıfırlanır
    nowMs += 16 * 60_000;
    const after = await login("uzman@test.com", "dogru-parola-1", ip);
    ok(after.res.status === 200, "kilit süresi dolunca doğru giriş OK");
    ok(!throttle.has("ei:" + sha("uzman@test.com") + ":" + hashLoginIp(ip)), "başarı e-posta+IP sayacını SIFIRLAR");
  }
  {
    // var olmayan e-posta da kilitlenir (davranış eşit)
    for (let i = 0; i < 5; i++) await login("hayalet@test.com", "x", "198.51.100.77");
    const g = await login("hayalet@test.com", "x", "198.51.100.77");
    ok(g.res.status === 429, "var olmayan e-posta da aynı eşikte kilitlenir (sızıntı yok)");
  }
  {
    const pend = await login("pending@test.com", "pending-parola");
    ok(pend.res.status === 403 && pend.json.code === "PENDING" && !pend.json.sessionToken, "onay bekleyen uzman → 403 PENDING, token YOK");
    const inact = await login("pasif@test.com", "pasif-parola-1");
    ok(inact.res.status === 403 && inact.json.code === "INACTIVE" && !inact.json.sessionToken, "pasif hesap → 403 INACTIVE, token YOK");
    ok(!tables.user_sessions.some((s) => s.user_id === U.pending || s.user_id === U.inactive), "gating reddinde oturum satırı oluşmadı");
  }
  {
    missingRpc.add("auth_login_guarded");
    const legacy = await login("pro@test.com", "pro-parola-12");
    ok(legacy.res.status === 200, "geçiş: auth_login_guarded yoksa login_user (service_role) yedeği çalışır");
    missingRpc.delete("auth_login_guarded");
    ok(isMissingRpcError({ code: "PGRST202", message: "" }, "x") && !isMissingRpcError({ code: "42501", message: "permission denied" }, "x"), "isMissingRpcError yalnız 'fonksiyon yok' için true");
    ok(parseGuardedLoginResponse({ status: "weird" }).status === "error" && parseGuardedLoginResponse(null).status === "error", "bilinmeyen RPC yanıtı → error (fail-closed)");
  }
  ok(extractClientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2, 3.3.3.3" })) === "1.1.1.1", "IP: x-real-ip öncelikli");
  ok(extractClientIp(new Headers({ "x-vercel-forwarded-for": "4.4.4.4, 5.5.5.5", "x-forwarded-for": "2.2.2.2" })) === "4.4.4.4", "IP: x-vercel-forwarded-for ilk değer");
  ok(extractClientIp(new Headers({ "x-forwarded-for": " 2.2.2.2 , 3.3.3.3" })) === "2.2.2.2", "IP: x-forwarded-for ilk değer");
  ok(hashLoginIp("1.1.1.1", "p") !== "1.1.1.1" && hashLoginIp("1.1.1.1", "p") !== hashLoginIp("1.1.1.1", "q"), "IP pepper'lı SHA-256 (ham IP gitmez)");
  ok(validateNewPassword("123456789").ok === false && validateNewPassword("1234567890").ok === true, "yeni parola min 10 (admin sıfırlama)");

  console.log("\n── B) Touch await + enforce kapısı ──");
  {
    // Tembel thenable builder: istek YALNIZ then() çağrılınca "gönderilir".
    const executed: string[] = [];
    function lazyDb(lastSeen: string): SupabaseClient {
      return {
        rpc: () => ({ then: (res: (v: unknown) => void) => res({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) }),
        from: (table: string) => {
          let op = "select";
          const b: Record<string, unknown> = {
            select: () => b,
            update: () => { op = "update"; return b; },
            eq: () => b,
            maybeSingle: () => ({ then: (res: (v: unknown) => void) => { executed.push(`${table}:select`); res({ data: { user_id: "u-lazy", last_seen_at: lastSeen }, error: null }); } }),
            then: (res: (v: unknown) => void) => { executed.push(`${table}:${op}`); res({ data: null, error: null }); },
          };
          return b;
        },
      } as unknown as SupabaseClient;
    }
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const uid = await getActiveSessionUserId(lazyDb(old), "tok");
    ok(uid === "u-lazy", "yedek yol: aktif token → userId");
    ok(executed.includes("user_sessions:update"), "yedek yol: last_seen_at UPDATE GERÇEKTEN çalıştı (await; `void` regresyonu yok)");
    executed.length = 0;
    await getActiveSessionUserId(lazyDb(new Date().toISOString()), "tok");
    ok(!executed.includes("user_sessions:update"), "throttle: taze last_seen_at → UPDATE yok");
    // enforce açıkken RPC hatası → fail-closed (yedek yola düşmez)
    const enforced = resolveSessionExpiryPolicy({ SESSION_EXPIRY_ENFORCE: "1" });
    ok(enforced.enforce === true && resolveSessionExpiryPolicy({}).enforce === false, "SESSION_EXPIRY_ENFORCE varsayılan KAPALI; '1' → açık");
    ok(isSessionExpiryEnforced({ SESSION_EXPIRY_ENFORCE: "true" }) && !isSessionExpiryEnforced({ SESSION_EXPIRY_ENFORCE: "0" }), "enforce: 'true' açık, '0' kapalı");
    ok((await touchActiveSession(lazyDb(old), "tok", enforced)) === null, "enforce AÇIK + RPC hatası → null (fail-closed)");
  }
  {
    // RPC yolu (sahte PostgREST) — R1: süresi geçmiş + idle oturum SONLANMAZ; R2: sonlanır.
    const tok = "tok-r1r2";
    tables.user_sessions.push({ id: "s-r", user_id: U.expert, session_token: tok, is_active: true,
      created_at: new Date(nowMs - 40 * 86400_000).toISOString(), last_seen_at: new Date(nowMs - 8 * 86400_000).toISOString(),
      expires_at: new Date(nowMs - 86400_000).toISOString() });
    rpcCalls.length = 0;
    const r1 = await touchActiveSession((await import("@/lib/supabase-server")).getServerDb(), tok);
    const call = rpcCalls.find((c) => c.name === "touch_active_session");
    ok(r1 === U.expert && call?.args.p_enforce === false && call?.args.p_touch_after_seconds === 90, "R1 (varsayılan): p_enforce=false, touch 90 sn; oturum SONLANMAZ");
    ok(Date.parse(String(tables.user_sessions.find((s) => s.session_token === tok)?.last_seen_at)) === nowMs, "R1: last_seen_at güncellendi");
    process.env.SESSION_EXPIRY_ENFORCE = "1";
    const r2 = await touchActiveSession((await import("@/lib/supabase-server")).getServerDb(), tok);
    const s = tables.user_sessions.find((x) => x.session_token === tok);
    ok(r2 === null && s?.is_active === false && s?.end_reason === "expired_absolute", "R2 (enforce=1): süresi dolmuş oturum sonlanır (expired_absolute)");
    delete process.env.SESSION_EXPIRY_ENFORCE;
  }
  ok(effectiveAllowedLocations(1) === 2 && effectiveAllowedLocations(null) === 2 && effectiveAllowedLocations(0) === 2 && effectiveAllowedLocations(3) === 3 && effectiveAllowedLocations(999) === 999, "konum limiti tabanı 2; 3/999 korunur");
  ok(Date.parse(computeSessionExpiresAt("admin", 0)) === 86400_000 && Date.parse(computeSessionExpiresAt("expert", 0)) === 30 * 86400_000, "expires_at: admin +24s, uzman +30g");

  console.log("\n── C) Logout ──");
  {
    const { json } = await login("uzman@test.com", "dogru-parola-1", "192.0.2.10");
    const tok = String(json.sessionToken);
    const before = await profileGET(authed("http://localhost/api/auth/profile", U.expert, tok));
    ok(before.status === 200, "logout öncesi token geçerli (profil 200)");
    const g = await sessionGET(new NextRequest("http://localhost/api/auth/session", { headers: { "x-session-token": tok } }));
    ok(((await g.json()) as Row).valid === true, "GET /api/auth/session başlıkla token doğrular");
    const del = await sessionDELETE(new NextRequest("http://localhost/api/auth/session", { method: "DELETE", headers: { "x-session-token": tok } }));
    ok(del.status === 200, "DELETE /api/auth/session → 200");
    const s = tables.user_sessions.find((x) => x.session_token === tok);
    ok(s?.is_active === false && s?.end_reason === "user_logout", "yalnız o token pasiflendi (end_reason user_logout)");
    ok(tables.user_sessions.some((x) => x.user_id === U.expert && x.is_active === true && x.session_token !== tok), "diğer cihaz oturumları KORUNDU");
    const after = await profileGET(authed("http://localhost/api/auth/profile", U.expert, tok));
    ok(after.status === 401, "logout sonrası eski token → 401");
    const again = await sessionDELETE(new NextRequest("http://localhost/api/auth/session", { method: "DELETE", headers: { "x-session-token": tok } }));
    const none = await sessionDELETE(new NextRequest("http://localhost/api/auth/session", { method: "DELETE" }));
    ok(again.status === 200 && none.status === 200, "logout idempotent; token yok → yine 200");
  }

  console.log("\n── D) Üyelik kapısı ──");
  const tokFor = async (email: string, pw: string, ip: string) => String((await login(email, pw, ip)).json.sessionToken);
  const proTok = await tokFor("pro@test.com", "pro-parola-12", "192.0.2.20");
  const expTok = await tokFor("uzman@test.com", "dogru-parola-1", "192.0.2.21");
  const admTok = await tokFor("admin@test.com", "admin-parola-1", "192.0.2.22");
  {
    const g = await requireModuleAccess(authed("http://localhost/x", U.pro, proTok), "clients");
    const body = g.ok ? null : ((await g.response.json()) as Row);
    ok(!g.ok && g.response.status === 403 && body?.code === "MEMBERSHIP_INACTIVE", "premium olmayan uzman (izin açık olsa da) → 403 MEMBERSHIP_INACTIVE");
    const prof = await profileGET(authed("http://localhost/api/auth/profile", U.pro, proTok));
    ok(prof.status === 200, "üyeliği aktif olmayan uzman: profil (verifyUserRequest) AÇIK");
    const v = await verifyUserRequest(authed("http://localhost/api/settings/export", U.pro, proTok));
    ok(v.ok === true, "üyeliği aktif olmayan uzman: ayarlar/yedek/export (verifyUserRequest) AÇIK");
    const e = await requireModuleAccess(authed("http://localhost/x", U.expert, expTok), "clients");
    ok(e.ok === true, "premium + izinli uzman → modül OK");
    const d = await requireModuleAccess(authed("http://localhost/x", U.expert, expTok), "stones");
    const dBody = d.ok ? null : ((await d.response.json()) as Row);
    ok(!d.ok && dBody?.code === "MODULE_DENIED", "izinsiz modül → 403 MODULE_DENIED");
    tables.users.find((u) => u.id === U.admin)!.package_type = "trial";
    const a = await requireModuleAccess(authed("http://localhost/x", U.admin, admTok), "clients");
    ok(a.ok === true, "admin üyelik kapısından MUAF (paket trial olsa da)");
    ok(hasMembershipAccessForRow({ role: "expert", active: true, approval_status: "approved", package_type: "Premium" }) === true, "saf kural: premium (büyük/küçük harf) → true");
    ok(hasMembershipAccessForRow({ role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_ends_at: "2020-01-01" }) === true, "saf kural: tarih alanları erişimi kapatmaz (owner kararı)");
    const pd = await requireDigitalContentUser(authed("http://localhost/x", U.pro, proTok), "belge_ceviri");
    ok(!pd.ok && pd.response.status === 403, "requireDigitalContentUser da üyelik kapısını uygular");
  }

  console.log("\n── E) AI admin-only ──");
  {
    const v = await requireModuleAccess(authed("http://localhost/x", U.expert, expTok), "video_ceviri");
    ok(!v.ok && v.response.status === 403, "video_ceviri: izinli premium uzman → 403");
    const dn = await requireDigitalContentUser(authed("http://localhost/x", U.expert, expTok), "ders_notu");
    ok(!dn.ok && dn.response.status === 403, "ders_notu: uzman → 403");
    const ai = await requireDigitalContentUser(authed("http://localhost/x", U.expert, expTok), "belge_ceviri_ai");
    ok(!ai.ok && ai.response.status === 403, "belge_ceviri_ai (OCR/PDF→Türkçe): uzman → 403");
    const pdf = await requireDigitalContentUser(authed("http://localhost/x", U.expert, expTok), "belge_ceviri");
    ok(pdf.ok === true, "pdf-to-word (belge_ceviri): uzman OK");
    const adm = await requireDigitalContentUser(authed("http://localhost/x", U.admin, admTok), "belge_ceviri_ai");
    const admV = await requireModuleAccess(authed("http://localhost/x", U.admin, admTok), "video_ceviri");
    ok(adm.ok === true && admV.ok === true, "admin: AI uçları OK");
    ok(resolveModuleAccess("expert", { video_ceviri: true, ders_notu: true }, "digital_content") === false, "hub: yalnız AI bayrakları uzmana hub açmaz");
  }

  console.log("\n── F) Belge history ──");
  {
    const r = await historyGET(new NextRequest(`http://localhost/api/belge-ceviri/history?userId=${U.expert}&tenantId=${T}`));
    ok(r.status === 401, "history: yalnız query userId/tenantId → 401");
  }

  console.log("\n── G) Video temp ──");
  {
    const f = pickClientJobPatchFields({ status: "failed", errorMessage: "x", videoTempPath: "evil/x", video_temp_path: "evil/y" });
    ok(!("videoTempPath" in f) && !("video_temp_path" in f), "PATCH: videoTempPath / video_temp_path YOK SAYILIR");
    ok(isVideoTempPathOwned(`${T}/job-1/a.mp4`, T, "job-1") === true, "kendi prefix → kabul");
    ok(isVideoTempPathOwned(`20000000-0000-0000-0000-000000000009/job-1/a.mp4`, T, "job-1") === false, "yabancı tenant prefix → red (route 403)");
    ok(isVideoTempPathOwned(`${T}/job-1/../x.mp4`, T, "job-1") === false && isVideoTempPathOwned(`${T}\\job-1\\a.mp4`, T, "job-1") === false && isVideoTempPathOwned(`${T}//job-1/a.mp4`, T, "job-1") === false, "'..' / '\\' / '//' → red");
  }

  console.log("\n── H) Statik sözleşmeler ──");
  {
    const loginSrc = read("lib/auth/loginUser.ts");
    ok(!/\.rpc\(\s*["']login_user/.test(loginSrc) && !/@\/lib\/supabase["']/.test(loginSrc), "tarayıcı login_user RPC'sini ÇAĞIRMAZ (anon client yok)");
    const page = read("app/page.tsx");
    ok(!/supabase\.rpc\(\s*["']login_user/.test(page), "ana sayfa login_user çağırmaz");
    const hl = page.slice(page.indexOf("const handleLogin = async"), page.indexOf("const logout = () =>"));
    ok(!/catch\s*\{\s*\/\/ Ağ\/500 hatası giriş akışını durdurmamalı/.test(hl) && /if \(!attempt\.ok\)/.test(hl), "session hatası = giriş BAŞARISIZ (yutulmaz)");
    const yu = read("lib/auth/yasamUser.ts");
    const clr = yu.slice(yu.indexOf("export function clearYasamUser"));
    const iDel = clr.indexOf('method: "DELETE"');
    const iTok = clr.indexOf("readSessionToken()");
    const iClear = clr.indexOf("clearSessionToken();");
    ok(iTok > 0 && iDel > iTok && iClear > iDel && /keepalive:\s*true/.test(clr), "clearYasamUser: token SİLİNMEDEN önce okunur + DELETE keepalive");
    const guard = read("hooks/useSessionGuard.ts");
    ok(!/\?token=/.test(guard) && /x-session-token/.test(guard), "session guard token'ı URL'de değil başlıkta gönderir");
    const sec = read("lib/auth/sessionSecurity.ts");
    ok(!/void db\s*\n?\s*\.from\("user_sessions"\)/.test(sec) && !/void db\.from/.test(sec), "sessionSecurity: `void db...` tembel update KALMADI");
    const mig0 = read("supabase/migrations/20270129000000_auth_login_throttle.sql");
    ok(/REVOKE ALL ON FUNCTION public\.auth_login_guarded\(text, text, text\) FROM PUBLIC, anon, authenticated/.test(mig0) && /PRODUCTION'A UYGULANMADI/.test(mig0), "0000: RPC service_role-only + başlık");
    const mig1 = read("supabase/migrations/20270129000100_auth_grants_password_hash_only.sql");
    const mig1Code = mig1.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    ok(!/SET\s+password\s*=/.test(mig1Code) && !/password\s*=\s*NULL/i.test(mig1Code), "0100: düz metin password NULL'LANMAZ");
    ok(!/btrim\(u\.password\)/.test(mig1Code), "0100: login_user düz metin dalı YOK");
    const reg = read("app/api/register/route.ts");
    const cp = read("app/api/settings/change-password/route.ts");
    ok(/NEW_PASSWORD_MIN_LENGTH/.test(reg) && /NEW_PASSWORD_MIN_LENGTH/.test(cp), "register + change-password: min 10");
    ok(/verifyLoginCredentialsGuarded/.test(cp) && !/rpc\("login_user"/.test(cp), "change-password: mevcut parola doğrulaması throttle'dan geçer");
  }

  console.log(`\nauth harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("HARNESS HATASI:", e);
  process.exit(1);
});
