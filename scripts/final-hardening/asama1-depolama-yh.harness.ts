/**
 * SATIŞ ÖNCESİ AŞAMA 1 (TAM) — AUTH-02..09 + DIJ-03/BUG-020 + YH-01/YH-03 harness'i (tsx; DB/ağ YOK).
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
 *   K) Kişisel Arşiv: yürütülebilir tür 415, boyut beyanı zorunlu, gerçek boyut finalize, kota.
 *   W) YH webhook: aday uzunluk/IP/başarısız doğrulama kapıları, kapalı worker için olay yok.
 *   D) YH drain döngüsü.  (Auth bölümleri asama1-auth-demo ile aynıdır.)
 *
 * Çalıştır: npx tsx scripts/final-hardening/asama1-depolama-yh.harness.ts
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
const tables: Record<string, Row[]> = { users: [], user_sessions: [], security_events: [], support_messages: [], personal_archives: [], personal_archive_files: [] };
// Sahte Storage (yalnız personal-archive) + kota RPC'si.
const storageObjects = new Map<string, { size: number; mimetype: string }>();
const storageRemoved: string[] = [];
const storageSigned: string[] = [];
// Kota RPC'lerinin JS aynası (migration 20271106000200 ile aynı kurallar; SQL davranışı pg testlerinde).
let rpcMode: "ok" | "missing" | "error" = "ok";
let extraStoredBytes = 0; // bu tenant için depoda zaten var sayılan bayt (kota sınır testleri)
const reservations = new Map<string, { tenant: string; bytes: number }>();
function storedBytes(tenant: string): number {
  let n = tenant === T ? extraStoredBytes : 0;
  for (const [k, v] of storageObjects) if (k.startsWith(`${tenant}/`) && Number.isFinite(v.size)) n += v.size;
  return n;
}
function reservedBytes(tenant: string, exceptPath?: string): { bytes: number; count: number } {
  let bytes = 0, count = 0;
  for (const [k, v] of reservations) if (v.tenant === tenant && k !== exceptPath && !storageObjects.has(k)) { bytes += v.bytes; count++; }
  return { bytes, count };
}
function fakeReserve(a: Row): unknown {
  const tenant = String(a.p_tenant_id), path = String(a.p_path), bytes = Number(a.p_bytes), quota = Number(a.p_quota);
  if (!path.startsWith(`${tenant}/`) || !(bytes > 0)) return { ok: false, reason: "invalid" };
  const r = reservedBytes(tenant);
  if (r.count >= Number(a.p_max_pending)) return { ok: false, reason: "pending_limit" };
  if (storedBytes(tenant) + r.bytes + bytes > quota) return { ok: false, reason: "quota" };
  if (reservations.has(path)) return { ok: false, reason: "duplicate_path" };
  reservations.set(path, { tenant, bytes });
  return { ok: true };
}
function fakeCommit(a: Row): unknown {
  const tenant = String(a.p_tenant_id), path = String(a.p_path);
  if (!path.startsWith(`${tenant}/`)) return { ok: false, reason: "invalid" };
  const o = storageObjects.get(path);
  reservations.delete(path);
  if (!o) return { ok: false, reason: "missing" };
  if (!Number.isFinite(o.size)) return { ok: false, reason: "size_unknown" };
  if (o.size > Number(a.p_max_file)) return { ok: false, reason: "too_large", size: o.size, mimetype: o.mimetype };
  if (storedBytes(tenant) + reservedBytes(tenant).bytes > Number(a.p_quota)) return { ok: false, reason: "quota", size: o.size, mimetype: o.mimetype };
  return { ok: true, size: o.size, mimetype: o.mimetype };
}
let webhookSecretRpcCalls = 0;
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
    module_permissions: { aromaterapi: true, personal_archive: true }, is_demo_account: false, admin_level: null, membership_status: "active",
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
  if (url.pathname.startsWith("/storage/v1/")) {
    const sp = decodeURIComponent(url.pathname.slice("/storage/v1/".length));
    let m: RegExpMatchArray | null;
    if ((m = sp.match(/^object\/upload\/sign\/personal-archive\/(.+)$/)) && method === "POST") {
      storageSigned.push(m[1]);
      return jsonRes({ url: `/object/upload/sign/personal-archive/${m[1]}?token=fake-token` });
    }
    if (sp === "object/list/personal-archive" && method === "POST") {
      const prefix = String(body?.prefix ?? "");
      const search = String(body?.search ?? "");
      const out = [...storageObjects.entries()]
        .filter(([k]) => k.startsWith(prefix ? `${prefix}/` : "") && k.slice(prefix.length + 1).includes(search))
        .map(([k, v]) => ({ name: k.slice(prefix.length + 1), id: k, metadata: { size: v.size, mimetype: v.mimetype } }));
      return jsonRes(out);
    }
    if ((m = sp.match(/^object\/personal-archive\/(.+)$/)) && method === "HEAD") {
      return new Response(null, { status: storageObjects.has(m[1]) ? 200 : 400 });
    }
    if ((m = sp.match(/^object\/info\/personal-archive\/(.+)$/))) {
      const o = storageObjects.get(m[1]);
      return o ? jsonRes({ name: m[1], size: o.size, content_type: o.mimetype }) : jsonRes({ message: "not found" }, 400);
    }
    if (sp === "object/personal-archive" && method === "DELETE") {
      for (const k of (body?.prefixes ?? []) as string[]) { storageObjects.delete(k); storageRemoved.push(k); }
      return jsonRes([]);
    }
    return jsonRes({ message: `unsupported storage ${method} ${sp}` }, 400);
  }
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
    if (name === "personal_archive_reserve_upload" || name === "personal_archive_commit_upload") {
      if (rpcMode === "missing") return jsonRes({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
      if (rpcMode === "error") return jsonRes({ code: "57014", message: "canceling statement due to statement timeout" }, 500);
      return jsonRes(name === "personal_archive_reserve_upload" ? fakeReserve(body) : fakeCommit(body));
    }
    if (name === "yh_outbox_webhook_secret_matches") {
      webhookSecretRpcCalls++;
      return jsonRes(body?.p_candidate === "dogru-webhook-secret-0123456789");
    }
    return jsonRes({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
  }
  if (path === "personal_archive_upload_reservations" && method === "DELETE") {
    const pth = (url.searchParams.get("path") ?? "").replace(/^eq\./, "");
    reservations.delete(pth);
    return new Response(null, { status: 204 });
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

  // ── K) Kişisel Arşiv (DIJ-03 + BUG-020; owner: 2 GB / 50 MB, fail-closed) ──
  console.log("\n── K) Kişisel Arşiv yükleme politikası ──");
  const ARC = "a0000000-0000-4000-8000-0000000000a1";
  tables.personal_archives.push({ id: ARC, tenant_id: T, title: "Arşiv" });
  tables.personal_archives.push({ id: "b0000000-0000-4000-8000-0000000000b1", tenant_id: "10000000-0000-0000-0000-0000000000d1", title: "Demo arşiv" });
  const { POST: upPOST } = await import("@/app/api/kisisel-arsiv/files/upload/route");
  const { POST: finPOST } = await import("@/app/api/kisisel-arsiv/files/finalize/route");
  const { POST: legacyPOST } = await import("@/app/api/kisisel-arsiv/files/route");
  const { POST: cleanPOST } = await import("@/app/api/kisisel-arsiv/files/cleanup/route");
  const { PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES: QUOTA } = await import("@/lib/kisisel-arsiv/uploadPolicy");
  ok(QUOTA === 2147483648, "kota sabiti 2 GB = 2 147 483 648 bayt (GB/GiB tutarlı)", QUOTA);
  const tok = expertTokens[0];
  const call = async (fn: (r: NextRequest) => Promise<Response>, url: string, b: Row, user = U.expert, token = tok) => {
    const r = await fn(authed(url, user, token, "POST", b));
    return { status: r.status, json: (await r.json()) as Row };
  };
  const up = (b: Row) => call(upPOST, "http://localhost/api/kisisel-arsiv/files/upload", b);
  const fin = (pathRel: string, declared: Row) => call(finPOST, "http://localhost/api/kisisel-arsiv/files/finalize", { archiveId: ARC, path: pathRel, ...declared });
  const MB = 1024 * 1024;

  // Tür / beyan kapıları (rezervasyondan ÖNCE)
  const signedBefore = storageSigned.length;
  let u = await up({ archiveId: ARC, fileName: "kurulum.exe", fileSize: 1000, fileType: "application/x-msdownload" });
  ok(u.status === 415 && storageSigned.length === signedBefore && reservations.size === 0, "BUG-020: .exe → 415, rezervasyon/imzalı URL yok", u);
  u = await up({ archiveId: ARC, fileName: "rapor.pdf.EXE", fileSize: 1000 });
  ok(u.status === 415, "çift uzantı / büyük harf .EXE → 415", u);
  u = await up({ archiveId: ARC, fileName: "sayfa.html", fileSize: 1000, fileType: "text/html" });
  ok(u.status === 415, "html → 415", u);
  u = await up({ archiveId: ARC, fileName: "masum.pdf", fileSize: 1000, fileType: "application/x-msdownload" });
  ok(u.status === 415, "zararsız uzantı + yürütülebilir MIME → 415", u);
  u = await up({ archiveId: ARC, fileName: "rapor.pdf", fileType: "application/pdf" });
  ok(u.status === 400, "DIJ-03: boyut beyanı yok → 400", u);
  u = await up({ archiveId: ARC, fileName: "rapor.pdf", fileSize: -5 });
  ok(u.status === 400, "DIJ-03: negatif boyut beyanı → 400", u);
  u = await up({ archiveId: ARC, fileName: "buyuk.mp4", fileSize: 50 * MB + 1, fileType: "video/mp4" });
  ok(u.status === 413, "DIJ-03: 50 MB + 1 bayt beyan → 413", u);

  // Kota (gerçek depo + rezervasyon) — 2 GB altı / sınırı / üstü
  extraStoredBytes = QUOTA - 50 * MB;
  u = await up({ archiveId: ARC, fileName: "tam.pdf", fileSize: 50 * MB, fileType: "application/pdf" });
  ok(u.status === 200 && typeof u.json.token === "string", "2 GB sınırına tam oturan yükleme (≤ kota) kabul", u);
  u = await up({ archiveId: ARC, fileName: "fazla.pdf", fileSize: 1, fileType: "application/pdf" });
  ok(u.status === 413 && u.json.code === "QUOTA_EXCEEDED", "2 GB + 1 bayt (bekleyen rezervasyon dahil) → 413 QUOTA_EXCEEDED", u);
  reservations.clear();
  extraStoredBytes = 0;
  for (const [name, type] of [["rapor.pdf", "application/pdf"], ["foto.HEIC", "image/heic"], ["notlar.txt", "text/plain"], ["arsiv.zip", "application/zip"], ["dosya", ""]] as const) {
    u = await up({ archiveId: ARC, fileName: name, fileSize: 1000, fileType: type });
    ok(u.status === 200 && typeof u.json.token === "string", `2 GB altı, izinli tür kabul: ${name}`, u);
  }
  ok(reservations.size === 5, "her hazırlık bir rezervasyon yazdı", reservations.size);
  u = await up({ archiveId: ARC, fileName: "altinci.pdf", fileSize: 1000, fileType: "application/pdf" });
  ok(u.status === 429 && u.json.code === "TOO_MANY_PENDING", "6. bekleyen yükleme → 429 (eşzamanlı hazırlık sınırı)", u);
  reservations.clear();

  // FAIL-CLOSED: RPC yok / hata
  rpcMode = "missing";
  const signedB = storageSigned.length;
  u = await up({ archiveId: ARC, fileName: "rapor2.pdf", fileSize: 1000, fileType: "application/pdf" });
  ok(u.status === 503 && u.json.code === "QUOTA_UNAVAILABLE" && storageSigned.length === signedB, "RPC YOK (migration öncesi) → 503, imzalı URL ÜRETİLMEZ (fail-closed)", u);
  rpcMode = "error";
  u = await up({ archiveId: ARC, fileName: "rapor2.pdf", fileSize: 1000, fileType: "application/pdf" });
  ok(u.status === 503 && u.json.code === "QUOTA_UNAVAILABLE", "RPC HATASI → 503 (fail-closed)", u);
  rpcMode = "ok";

  // Finalize: gerçek boyut, yalan beyan, eksik metadata, RPC hatası
  const P = (n: string) => `${T}/${ARC}/${n}`;
  const filesBefore = tables.personal_archive_files.length;
  storageObjects.set(P("11111111-1111-4111-8111-111111111111_buyuk.pdf"), { size: 60 * MB, mimetype: "application/pdf" });
  let f = await fin(P("11111111-1111-4111-8111-111111111111_buyuk.pdf"), { fileName: "buyuk.pdf", fileSize: 1000 });
  ok(f.status === 413 && storageRemoved.includes(P("11111111-1111-4111-8111-111111111111_buyuk.pdf")) && tables.personal_archive_files.length === filesBefore,
    "hatalı beyan: 1 KB beyan, depoda 60 MB → 413, nesne silindi, kayıt yok", f);
  storageObjects.set(P("22222222-2222-4222-8222-222222222222_masum.pdf"), { size: 5000, mimetype: "application/x-msdownload" });
  f = await fin(P("22222222-2222-4222-8222-222222222222_masum.pdf"), { fileName: "masum.pdf", fileType: "application/pdf" });
  ok(f.status === 415 && storageRemoved.includes(P("22222222-2222-4222-8222-222222222222_masum.pdf")), "depodaki gerçek tür yürütülebilir → 415, nesne silindi", f);
  storageObjects.set(P("33333333-3333-4333-8333-333333333333_rapor.pdf"), { size: 4321, mimetype: "application/pdf" });
  f = await fin(P("33333333-3333-4333-8333-333333333333_rapor.pdf"), { fileName: "rapor.pdf", fileSize: 1 });
  const saved = tables.personal_archive_files.at(-1);
  ok(f.status === 200 && saved?.file_size === 4321, "finalize: kayda depodaki GERÇEK boyut yazılır (beyan 1 → 4321)", { f, saved });
  storageObjects.set(P("44444444-4444-4444-8444-444444444444_nometa.pdf"), { size: Number.NaN, mimetype: "application/pdf" });
  f = await fin(P("44444444-4444-4444-8444-444444444444_nometa.pdf"), { fileName: "nometa.pdf", fileSize: 10 });
  ok(f.status === 503 && storageRemoved.includes(P("44444444-4444-4444-8444-444444444444_nometa.pdf")), "Storage metadata boyutu yok → 503, nesne silindi (fail-closed)", f);
  extraStoredBytes = QUOTA;
  storageObjects.set(P("55555555-5555-4555-8555-555555555555_q.pdf"), { size: 1000, mimetype: "application/pdf" });
  f = await fin(P("55555555-5555-4555-8555-555555555555_q.pdf"), { fileName: "q.pdf" });
  ok(f.status === 413 && f.json.code === "QUOTA_EXCEEDED" && storageRemoved.includes(P("55555555-5555-4555-8555-555555555555_q.pdf")), "finalize'da gerçek toplam > 2 GB → 413, nesne silindi", f);
  extraStoredBytes = 0;
  rpcMode = "error";
  storageObjects.set(P("66666666-6666-4666-8666-666666666666_e.pdf"), { size: 1000, mimetype: "application/pdf" });
  f = await fin(P("66666666-6666-4666-8666-666666666666_e.pdf"), { fileName: "e.pdf" });
  ok(f.status === 503 && storageRemoved.includes(P("66666666-6666-4666-8666-666666666666_e.pdf")) && tables.personal_archive_files.length === filesBefore + 1,
    "finalize RPC hatası → 503, kayıt yok, nesne silindi (fail-closed)", f);
  rpcMode = "ok";

  // İptal/başarısız yükleme: cleanup rezervasyonu bırakır
  u = await up({ archiveId: ARC, fileName: "iptal.pdf", fileSize: 1000, fileType: "application/pdf" });
  const cancelPath = String(u.json.path ?? "");
  ok(u.status === 200 && reservations.has(cancelPath), "hazırlık rezervasyonu açık", u);
  const cl = await call(cleanPOST, "http://localhost/api/kisisel-arsiv/files/cleanup", { archiveId: ARC, path: cancelPath });
  ok(cl.status === 200 && !reservations.has(cancelPath), "yükleme iptali/başarısızlığı (cleanup) → rezervasyon bırakıldı", cl);

  // Başka tenant'ın baytları sayılmaz
  storageObjects.set(`10000000-0000-0000-0000-0000000000d1/x/huge.bin`, { size: QUOTA, mimetype: "application/octet-stream" });
  u = await up({ archiveId: ARC, fileName: "rapor3.pdf", fileSize: 1000, fileType: "application/pdf" });
  ok(u.status === 200, "başka tenant'ın 2 GB'ı bu tenant'ın kotasına SAYILMAZ", u);
  reservations.clear();

  // Demo kullanıcısı
  const dm = await call(upPOST, "http://localhost/api/kisisel-arsiv/files/upload", { archiveId: "b0000000-0000-4000-8000-0000000000b1", fileName: "a.pdf", fileSize: 10 }, U.demo, myDemoToken);
  ok(dm.status === 403 && dm.json.code === "DEMO_READONLY" && reservations.size === 0, "demo yükleme → 403 DEMO_READONLY, rezervasyon yok", dm);

  // Eski JSON hattı
  const lg = await legacyPOST(authed("http://localhost/api/kisisel-arsiv/files", U.expert, tok, "POST",
    { archiveId: ARC, files: [{ file_name: "x.exe", file_path: `${T}/${ARC}/x_x.exe`, file_size: 1 }] }));
  ok(lg.status === 415, "geriye dönük JSON hattı: .exe → 415", lg.status);
  rpcMode = "missing";
  storageObjects.set(P("77777777-7777-4777-8777-777777777777_l.pdf"), { size: 1000, mimetype: "application/pdf" });
  const lg2 = await legacyPOST(authed("http://localhost/api/kisisel-arsiv/files", U.expert, tok, "POST",
    { archiveId: ARC, files: [{ file_name: "l.pdf", file_path: P("77777777-7777-4777-8777-777777777777_l.pdf"), file_size: 1 }] }));
  ok(lg2.status === 503, "geriye dönük JSON hattı: RPC yoksa 503 (fail-closed)", lg2.status);
  rpcMode = "ok";

  // ── W) YH webhook (YH-03 + YH-01) ───────────────────────────────────────
  console.log("\n── W) YH outbox webhook kapıları ──");
  delete process.env.YH_OUTBOX_WORKER_ENABLED;
  const { POST: whPOST } = await import("@/app/api/internal/yh/outbox-webhook/route");
  const wh = (secret: string, ip: string, payload: unknown = { type: "INSERT", schema: "public", table: "yasam_hafizasi_outbox", record: { id: "x", event_version: 1 } }) =>
    whPOST(new NextRequest("http://localhost/api/internal/yh/outbox-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-yh-webhook-secret": secret, "x-forwarded-for": ip },
      body: JSON.stringify(payload),
    }));
  let before = webhookSecretRpcCalls;
  let w = await wh("kisa", "198.18.0.1");
  ok(w.status === 401 && webhookSecretRpcCalls === before, "YH-03: çok kısa aday secret → 401, Vault RPC'si çağrılmaz");
  w = await wh("x".repeat(600), "198.18.0.1");
  ok(w.status === 401 && webhookSecretRpcCalls === before, "YH-03: aşırı uzun aday → 401, RPC yok");
  for (let i = 0; i < 20; i++) await wh(`yanlis-secret-degeri-${String(i).padStart(4, "0")}`, "198.18.0.2");
  before = webhookSecretRpcCalls;
  w = await wh("yanlis-secret-degeri-9999", "198.18.0.2");
  ok(w.status === 429 && webhookSecretRpcCalls === before, "YH-03: aynı IP'den 20 başarısız doğrulama → 21.'de 429, RPC yok");
  w = await wh("dogru-webhook-secret-0123456789", "198.18.0.3");
  const wj = (await w.json()) as Row;
  ok(w.status === 200 && wj.noop === true && wj.reason === "worker-disabled", "YH-01: worker kapalıyken olay gönderilmez (noop worker-disabled)", wj);
  w = await wh("dogru-webhook-secret-0123456789", "198.18.0.4", { type: "INSERT", schema: "public", table: "bilinmeyen", record: {} });
  ok(w.status >= 400 && w.status < 500, "bilinmeyen tablo yine 4xx (fail-closed korunur)", w.status);

  // ── D) YH drain döngüsü (YH-01) ───────────────────────────────────────────
  console.log("\n── D) YH outbox run içi drain ──");
  const { drainOutboxBatches } = await import("@/lib/yasam-hafizasi/outbox/drainLoop");
  let pending = 25;
  const once = async () => { const c = Math.min(10, pending); pending -= c; return { claimed: c, swept: 0, completed: c, outcomes: { indexed: c } as Record<string, number> }; };
  const d1 = await drainOutboxBatches(once, { claimBatch: 10 });
  ok(d1.rounds === 3 && d1.total.claimed === 25 && d1.total.completed === 25 && d1.total.outcomes.indexed === 25 && d1.stoppedBy === "drained" && pending === 0,
    "25 bekleyen → tek run'da 3 tur (10+10+5), toplamlar doğru", d1);
  pending = 500;
  const d2 = await drainOutboxBatches(once, { claimBatch: 10, maxBatches: 10 });
  ok(d2.rounds === 10 && d2.stoppedBy === "max-batches" && pending === 400, "tur sınırı (10) aşılmaz", d2);
  let clock = 0;
  pending = 500;
  const d3 = await drainOutboxBatches(async () => { clock += 20_000; return once(); }, { claimBatch: 10, budgetMs: 45_000, now: () => clock });
  ok(d3.stoppedBy === "budget" && d3.rounds === 3, "süre bütçesi (45 sn) aşılınca durur", d3);
  pending = 0;
  const d4 = await drainOutboxBatches(once, { claimBatch: 10 });
  ok(d4.rounds === 1 && d4.total.claimed === 0, "boş kuyruk → tek tur, ek claim yok", d4);

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

  console.log(`\nasama1-depolama-yh harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
