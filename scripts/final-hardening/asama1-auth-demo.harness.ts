/**
 * SATIŞ ÖNCESİ AŞAMA 1 — AUTH-02 / AUTH-03 / AUTH-04 / AUTH-06 / AUTH-09 harness'i (tsx; DB/ağ YOK).
 *
 * Gerçek route handler'ları, global `fetch` üzerine kurulan SAHTE bir PostgREST ile koşar
 * (URL: http://fake-supabase.local). Supabase'e/prod'a istek GİTMEZ.
 *
 *   A2) Demo hesabı destek mesajı yazamaz (403 DEMO_READONLY, satır yok); normal uzman saatte 10, 11. → 429.
 *   A3) Kayıt: var olan e-posta ile yeni kayıtla AYNI 200 {ok:true} (409 / "zaten kayıtlı" yok).
 *   A4) Demo "Oturumlarım": yalnız isteği yapan oturum döner; başka oturumu kapatma 403.
 *       Normal uzman bütün kendi oturumlarını görür (regresyon).
 *   A6) Demo yazma ucu (örnek: aromaterapi oils POST) 403 DEMO_READONLY + demo:true (sahte 200 yok).
 *   A9) Giriş: IP başına 60/15 dk (başarılı dahil) → 61. istek 429 ve bcrypt RPC'si ÇAĞRILMAZ;
 *       demo hesabıyla IP başına 10 başarılı oturum → 11. 429, yeni oturum satırı yazılmaz;
 *       8 KB User-Agent DB'ye ≤512 karakter yazılır.
 *
 * Çalıştır: npx tsx scripts/final-hardening/asama1-auth-demo.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake-supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.RATE_LIMIT_SECRET = "harness-rate-limit-secret";
delete process.env.SESSION_EXPIRY_ENFORCE;

import { POST as sessionPOST } from "@/app/api/auth/session/route";
import { GET as supportGET, POST as supportPOST } from "@/app/api/settings/support/route";
import { POST as registerPOST } from "@/app/api/register/route";
import { GET as meSessionsGET } from "@/app/api/me/sessions/route";
import { DELETE as meSessionDELETE } from "@/app/api/me/sessions/[id]/route";
import { USER_AGENT_MAX_LENGTH } from "@/lib/auth/sessionSecurity";

// "server-only" yalnız bu süreçte boş modüle yönlendirilir (Next dışı çalıştırma).
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
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 300)); }
}

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { users: [], user_sessions: [], security_events: [], support_messages: [] };
const rpcCalls: string[] = [];
const rate = new Map<string, number[]>();
const nowMs = Date.now();

const T = "10000000-0000-0000-0000-0000000000a1";
const U = {
  expert: "00000000-0000-0000-0000-0000000000e1",
  demo: "00000000-0000-0000-0000-0000000000d1",
};
function user(id: string, email: string, pw: string, extra: Row): Row {
  return {
    id, email, name: email.split("@")[0], full_name: null, role: "expert", status: "active",
    tenant_id: T, active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { aromaterapi: true }, is_demo_account: false, admin_level: null, membership_status: "active",
    subscription_status: null, trial_started_at: null, trial_ends_at: null, membership_started_at: null,
    membership_ends_at: null, security_exempt: false, allowed_active_sessions: -1, allowed_locations: 1,
    security_mode: "normal", license_type: "single", allowed_desktop_sessions: -1, allowed_mobile_sessions: -1,
    allowed_tablet_sessions: -1, allowed_unknown_sessions: -1,
    __pw: pw, ...extra,
  };
}
tables.users.push(
  user(U.expert, "uzman@test.com", "dogru-parola-1", {}),
  user(U.demo, "demo@test.com", "demo-parola-1", { is_demo_account: true, tenant_id: "10000000-0000-0000-0000-0000000000d1" }),
);

function fakeLogin(args: Row): unknown {
  const email = String(args.p_email ?? "").trim().toLowerCase();
  const u = tables.users.find((r) => String(r.email).toLowerCase() === email && r.__pw === args.p_password);
  if (!u) return { status: "invalid" };
  const { id, email: em, name, role, status, tenant_id, active, approval_status } = u;
  return { status: "ok", user: { id, email: em, name, role, status, tenant_id, active, approval_status } };
}
function fakeRate(args: Row): unknown {
  const b = String(args.p_bucket);
  const lim = Number(args.p_limit);
  const win = Number(args.p_window_seconds) * 1000;
  const hits = (rate.get(b) ?? []).filter((t) => t > nowMs - win);
  if (hits.length >= lim) { rate.set(b, hits); return { allowed: false, retry_after: 60 }; }
  hits.push(nowMs);
  rate.set(b, hits);
  return { allowed: true, retry_after: 0 };
}
function fakeCreateSessionV2(args: Row): unknown {
  const role = String(tables.users.find((u) => u.id === args.p_user_id)?.role ?? "");
  tables.user_sessions.push({
    id: `5e55${String(tables.user_sessions.length + 1).padStart(4, "0")}-0000-4000-8000-000000000000`,
    user_id: args.p_user_id, session_token: args.p_session_token, ip_address: args.p_ip, country: "TR", city: "İzmir",
    user_agent: args.p_user_agent, platform: args.p_platform, is_active: true, session_state: "active",
    created_at: new Date(nowMs).toISOString(), last_seen_at: new Date(nowMs).toISOString(),
    expires_at: args.p_expires_at ?? null, ended_at: null, client_channel: args.p_client_channel ?? "desktop_web", session_role: role,
  });
  return { inserted: true, state: "active", session_id: tables.user_sessions.at(-1)!.id, exception_used: false };
}
function fakeTouch(args: Row): unknown {
  const s = tables.user_sessions.find((r) => r.session_token === args.p_token && r.is_active === true && r.ended_at == null);
  return s ? String(s.user_id) : null;
}
const provisioned = new Set<string>(["uzman@test.com"]);
function fakeProvision(args: Row): unknown {
  const p = (args.p_payload ?? {}) as Row;
  const email = String(p.email ?? p.p_email ?? "").toLowerCase();
  if (provisioned.has(email)) return { outcome: "already_exists", user_id: U.expert, request_id: "r" };
  provisioned.add(email);
  return { ok: true, outcome: "provisioned", user_id: "00000000-0000-0000-0000-0000000000f1", tenant_id: "10000000-0000-0000-0000-0000000000f1", request_id: "r" };
}

function parseFilters(url: URL): ((r: Row) => boolean)[] {
  const out: ((r: Row) => boolean)[] = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const dot = v.indexOf(".");
    const op = v.slice(0, dot);
    const val = v.slice(dot + 1);
    const cmp = (x: unknown) => (x === null || x === undefined ? "null" : String(x));
    if (op === "eq" || op === "is") out.push((r) => cmp(r[k]) === val);
    else if (op === "gte") out.push((r) => r[k] != null && String(r[k]) >= val);
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
  const accept = new Headers(init?.headers).get("accept") ?? "";
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    rpcCalls.push(name);
    if (name === "auth_login_guarded") return jsonRes(fakeLogin(body));
    if (name === "auth_rate_limit_hit") return jsonRes(fakeRate(body));
    if (name === "create_session_v2") return jsonRes(fakeCreateSessionV2(body));
    if (name === "touch_active_session") return jsonRes(fakeTouch(body));
    if (name === "hash_password") return jsonRes("$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfake");
    if (name === "provision_expert") return jsonRes(fakeProvision(body));
    if (name === "revoke_own_session") return jsonRes({ ok: true, user_id: U.demo, was_current: false });
    return jsonRes({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
  }
  const rows = tables[path] ?? (tables[path] = []);
  const filters = parseFilters(url);
  const match = (r: Row) => filters.every((f) => f(r));
  const single = accept.includes("vnd.pgrst.object");
  if (method === "GET" || method === "HEAD") {
    const hit = rows.filter(match).map(strip);
    const lim = Number(url.searchParams.get("limit") ?? "0");
    const out = lim > 0 ? hit.slice(0, lim) : hit;
    return single ? jsonRes(out[0] ?? null, out[0] ? 200 : 406) : jsonRes(out);
  }
  if (method === "POST") {
    const items = (Array.isArray(body) ? body : [body]).map((it: Row) => ({ id: `row-${rows.length + 1}`, ...it }));
    rows.push(...items);
    return single ? jsonRes(items[0], 201) : jsonRes(items, 201);
  }
  if (method === "PATCH") {
    const hit = rows.filter(match);
    for (const r of hit) Object.assign(r, body);
    return jsonRes(hit.map(strip));
  }
  return jsonRes({ message: "unsupported" }, 400);
}) as typeof fetch;

function loginReq(email: string, password: string, ip: string, ua = "Mozilla/5.0 (Windows NT 10.0)") {
  return new NextRequest("http://localhost/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip, "x-forwarded-for": ip, "user-agent": ua },
    body: JSON.stringify({ email, password }),
  });
}
async function login(email: string, password: string, ip: string, ua?: string) {
  const res = await sessionPOST(loginReq(email, password, ip, ua));
  return { res, json: (await res.json()) as Row };
}
function authed(url: string, userId: string, token: string, method = "GET", body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "x-user-id": userId, "x-session-token": token, "content-type": "application/json", origin: "http://localhost" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function run() {
  // ── A9 + oturum tohumları ────────────────────────────────────────────────
  console.log("\n── A9) Giriş hız sınırı + UA kırpma ──");
  const longUa = "X".repeat(8192);
  const e1 = await login("uzman@test.com", "dogru-parola-1", "198.51.100.10", longUa);
  ok(e1.res.status === 200 && typeof e1.json.sessionToken === "string", "uzman girişi 200", e1.json);
  const eSess = tables.user_sessions.find((s) => s.session_token === e1.json.sessionToken);
  ok(!!eSess && String(eSess.user_agent).length === USER_AGENT_MAX_LENGTH, `8 KB UA → DB'de ${USER_AGENT_MAX_LENGTH} karakter`, String(eSess?.user_agent ?? "").length);
  const e2 = await login("uzman@test.com", "dogru-parola-1", "198.51.100.11");
  const expertTokens = [String(e1.json.sessionToken), String(e2.json.sessionToken)];

  const demoTokens: string[] = [];
  for (let i = 0; i < 10; i++) {
    const d = await login("demo@test.com", "demo-parola-1", "203.0.113.50");
    if (d.res.status === 200) demoTokens.push(String(d.json.sessionToken));
  }
  ok(demoTokens.length === 10, "demo: aynı IP'den 10 başarılı oturum", demoTokens.length);
  const demoRowsBefore = tables.user_sessions.filter((s) => s.user_id === U.demo).length;
  const d11 = await login("demo@test.com", "demo-parola-1", "203.0.113.50");
  ok(d11.res.status === 429 && d11.json.code === "RATE_LIMITED" && !!d11.res.headers.get("retry-after"), "demo: 11. başarılı giriş → 429 RATE_LIMITED + Retry-After", d11.json);
  ok(tables.user_sessions.filter((s) => s.user_id === U.demo).length === demoRowsBefore, "demo: 429'da yeni oturum satırı yazılmadı");
  const dOther = await login("demo@test.com", "demo-parola-1", "203.0.113.51");
  ok(dOther.res.status === 200, "demo: başka IP'den ziyaretçi etkilenmez");
  demoTokens.push(String(dOther.json.sessionToken));

  for (let i = 0; i < 60; i++) await login("yok@test.com", "yanlis", "192.0.2.200");
  const callsBefore = rpcCalls.filter((n) => n === "auth_login_guarded").length;
  const ip61 = await login("uzman@test.com", "dogru-parola-1", "192.0.2.200");
  ok(ip61.res.status === 429 && ip61.json.code === "RATE_LIMITED", "aynı IP'den 61. giriş isteği → 429", ip61.json);
  ok(rpcCalls.filter((n) => n === "auth_login_guarded").length === callsBefore, "429'da bcrypt RPC'si (auth_login_guarded) çağrılmadı");
  const other = await login("uzman@test.com", "dogru-parola-1", "192.0.2.201");
  ok(other.res.status === 200, "başka IP'den normal giriş etkilenmez");
  expertTokens.push(String(other.json.sessionToken));

  // ── A4 Oturumlarım ──────────────────────────────────────────────────────
  console.log("\n── A4) Demo Oturumlarım izolasyonu ──");
  const myDemoToken = demoTokens[0];
  const g = await meSessionsGET(authed("http://localhost/api/me/sessions", U.demo, myDemoToken));
  const gj = (await g.json()) as { ok?: boolean; sessions?: Row[] };
  const demoOpen = tables.user_sessions.filter((s) => s.user_id === U.demo && s.ended_at == null).length;
  ok(demoOpen >= 11, `ön koşul: demo hesabında ${demoOpen} açık ziyaretçi oturumu var`);
  ok(g.status === 200 && gj.sessions?.length === 1 && gj.sessions[0].current === true, "demo GET → yalnız kendi (current) oturumu", gj);
  const leaked = JSON.stringify(gj).includes("203.0.113.51");
  ok(!leaked, "demo GET başka ziyaretçinin IP/konum bilgisini içermez");
  const otherDemo = tables.user_sessions.find((s) => s.session_token === demoTokens[1]);
  const del = await meSessionDELETE(authed(`http://localhost/api/me/sessions/${otherDemo?.id}`, U.demo, myDemoToken, "DELETE"), { params: Promise.resolve({ id: String(otherDemo?.id) }) });
  const dj = (await del.json()) as Row;
  ok(del.status === 403 && dj.code === "DEMO_READONLY" && dj.demo === true, "demo DELETE başka oturum → 403 DEMO_READONLY", dj);
  ok(!rpcCalls.includes("revoke_own_session"), "demo DELETE'te revoke RPC çağrılmadı");
  const ge = await meSessionsGET(authed("http://localhost/api/me/sessions", U.expert, expertTokens[0]));
  const gej = (await ge.json()) as { sessions?: Row[] };
  ok(ge.status === 200 && (gej.sessions?.length ?? 0) === 3, "normal uzman GET → kendi 3 oturumu (regresyon yok)", gej.sessions?.length);

  // ── A2 Destek ───────────────────────────────────────────────────────────
  console.log("\n── A2) Destek mesajı ──");
  const msg = { subject: "Konu", message: "Mesaj", priority: "urgent" };
  const ds = await supportPOST(authed("http://localhost/api/settings/support", U.demo, myDemoToken, "POST", msg));
  const dsj = (await ds.json()) as Row;
  ok(ds.status === 403 && dsj.code === "DEMO_READONLY", "demo POST /settings/support → 403 DEMO_READONLY", dsj);
  ok(tables.support_messages.length === 0, "demo destek satırı YAZILMADI");
  const dg = await supportGET(authed("http://localhost/api/settings/support", U.demo, myDemoToken));
  ok(dg.status === 200, "demo GET destek listesi çalışır (okuma serbest)");
  let okCount = 0;
  for (let i = 0; i < 10; i++) {
    const r = await supportPOST(authed("http://localhost/api/settings/support", U.expert, expertTokens[0], "POST", msg));
    if (r.status === 200) okCount++;
  }
  ok(okCount === 10, "uzman 10 destek mesajı → 200", okCount);
  const r11 = await supportPOST(authed("http://localhost/api/settings/support", U.expert, expertTokens[0], "POST", msg));
  const r11j = (await r11.json()) as Row;
  ok(r11.status === 429 && r11j.code === "RATE_LIMITED" && tables.support_messages.length === 10, "uzman 11. mesaj → 429, satır yazılmadı", r11j);

  // ── A3 Kayıt ────────────────────────────────────────────────────────────
  console.log("\n── A3) Kayıt yanıtı hesap varlığını sızdırmaz ──");
  const reg = (email: string, ip: string) => registerPOST(new NextRequest("http://localhost/api/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ fullName: "Test Kişi", email, password: "Guclu-Parola-2026!" }),
  }));
  const rNew = await reg("yeni@test.com", "198.51.100.90");
  const rNewBody = await rNew.text();
  const rOld = await reg("uzman@test.com", "198.51.100.91");
  const rOldBody = await rOld.text();
  ok(rNew.status === 200 && rNewBody === JSON.stringify({ ok: true }), "yeni e-posta → 200 {ok:true}", rNewBody);
  ok(rOld.status === rNew.status && rOldBody === rNewBody, "kayıtlı e-posta → yeni kayıtla AYNI durum ve gövde", { s: rOld.status, b: rOldBody });
  ok(!/zaten kayıtlı|already_exists/i.test(rOldBody), "yanıtta 'zaten kayıtlı' / already_exists yok");

  // ── A6 Demo yazma sözleşmesi ────────────────────────────────────────────
  console.log("\n── A6) Demo yazma ucu sahte başarı dönmez ──");
  const { POST: oilsPOST } = await import("@/app/api/aromaterapi/oils/route");
  const op = await oilsPOST(authed("http://localhost/api/aromaterapi/oils", U.demo, myDemoToken, "POST", { name: "Demo Yağı" }));
  const opj = (await op.json()) as Row;
  ok(op.status === 403 && opj.ok === false && opj.demo === true && opj.code === "DEMO_READONLY", "demo POST aromaterapi/oils → 403 DEMO_READONLY + demo:true", { s: op.status, opj });
  ok(!(tables.aromatherapy_oils ?? []).length, "demo yağ satırı YAZILMADI");

  // ── M) Deneme bitişi kaydı (AUTH-05) ─────────────────────────────────────
  console.log("\n── M) Deneme bitişi kaydı ──");
  const mem = await import("@/lib/auth/membership");
  const { hasMembershipAccessForRow } = await import("@/lib/auth/membershipAccessCore");
  const now = new Date("2026-10-20T09:00:00.000Z");
  const pl = mem.buildApprovalMembershipPayload(now);
  ok(pl.trial_started_at === now.toISOString() && pl.trial_ends_at === "2026-10-23T09:00:00.000Z" && pl.package_type === "premium",
    "onay payload'ı: trial_started_at=şimdi, trial_ends_at=+3 gün, paket premium", pl);
  ok(mem.buildPremiumMembershipPayload().trial_ends_at === null, "eski buildPremiumMembershipPayload değişmedi");
  const expiredRow = { role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", trial_ends_at: "2020-01-01T00:00:00Z", membership_status: "active" };
  ok(hasMembershipAccessForRow(expiredRow) === true, "deneme tarihi geçmiş aktif uzmanın ERİŞİMİ KESİLMEZ (owner kararı)");
  ok(mem.parseMembershipFromRow(expiredRow).isTrialExpired === false, "premium satırda isTrialExpired=false (rozet/erişim mantığı değişmez)");
  ok(mem.isTrialReviewDue("2020-01-01T00:00:00Z") === true && mem.isTrialReviewDue("2999-01-01T00:00:00Z") === false && mem.isTrialReviewDue(null) === false,
    "isTrialReviewDue yalnız geçmiş tarihte true");

  console.log(`\nasama1-auth-demo harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
