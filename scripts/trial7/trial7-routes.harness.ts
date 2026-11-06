/**
 * TRIAL7 — 7 günlük deneme üyeliği UÇ + ÇEKİRDEK harness'ı (tsx; gerçek DB / ağ / Roxy / Cloudflare YOK).
 *
 * Gerçek route handler'ları ve kapılar, global `fetch` üzerine kurulan SAHTE PostgREST + sahte Cloudflare
 * Siteverify + sahte Roxy ile koşar (DB tarafı kuralları trial7-db.harness.mjs gerçek PostgreSQL'de ayrıca
 * doğrular). Bölümler:
 *   R  kayıt: bayrak kapalı → bugünkü yönetici onaylı akış BİREBİR; açık → Turnstile Siteverify ZORUNLU
 *      (eksik / başarısız / erişilemez / farklı action), hız sınırı korunur, risk → inceleme, Dijital İçerik kapalı
 *   L  giriş: ilk başarılı girişte pencere başlatılır; Premium girişinde deneme verisi dönmez
 *   G  kapı: aktif deneme tam erişim; süresi dolmuş → GET + dışa aktarma açık, yazma/hesaplama 403;
 *      inceleme → 403; Dijital İçerik ailesi (hub, Kişisel Arşiv, Belge Çeviri, Video, Ders Notu, YH, gelecekteki
 *      anahtar) her fazda 403; Premium / özel / demo / eski deneme hesapları önceki kuralla AYNI
 *   W  yalnız-oturum uçları: geri yükleme / workspace yazma / belge çeviri geçmişi deneme kısıtı
 *   X  Roxy kredi sayacı GERÇEK HD istemcisiyle: her HTTP isteği 1 kredi, önbellek 0, 429/5xx iade, limit → 429
 *      + istek ATILMAZ, Premium ölçülmez, bağlamsız çağrı düz fetch
 *   S  /api/trial/status + /api/trial/pro-request (tekil talep, WhatsApp = Mağaza numarası)
 *   A  admin uçları: yetkisiz → ret, limit doğrulaması (modül ≤ ortak), Pro'ya geçişte modül seçimi zorunlu,
 *      deneme üyesine Dijital İçerik açılamaz, deneme üyesine HD sınırsız izni verilemez
 *   C  istemci: menü / hub / rota kapısı Dijital İçerik'i deneme uzmanına göstermez; süresi dolmuşta modül
 *      sayfaları görüntülenebilir; geri sayım metinleri; kanonik e-posta; risk; SQL ↔ TS allowlist eşliği
 *
 * Çalıştır: npx tsx scripts/trial7/trial7-routes.harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake-supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.RATE_LIMIT_SECRET = "harness-rate-limit-secret";
delete process.env.TRIAL_SELF_SIGNUP_ENABLED;
delete process.env.TRIAL_TURNSTILE_SECRET_KEY;
delete process.env.TRIAL_TURNSTILE_SITE_KEY;
// Kampanya Merkezi'nin anahtarları (ayrı widget) — kayıt sistemi bunları KULLANMAMALI.
process.env.TURNSTILE_SECRET_KEY = "kampanya-secret";
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "kampanya-site";
delete process.env.SESSION_EXPIRY_ENFORCE;

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
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  }
}

type Row = Record<string, unknown>;
const HOUR = 3_600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const TEN = {
  trial: "10000000-0000-0000-0000-0000000000a1",
  prem: "10000000-0000-0000-0000-0000000000b1",
};
const U = {
  admin: "00000000-0000-0000-0000-0000000000ad",
  premium: "00000000-0000-0000-0000-0000000000b1",
  ozel: "00000000-0000-0000-0000-0000000000c1",
  demo: "00000000-0000-0000-0000-0000000000d1",
  legacy: "00000000-0000-0000-0000-0000000000e1",
  active: "00000000-0000-0000-0000-0000000000f1",
  expired: "00000000-0000-0000-0000-0000000000f2",
  review: "00000000-0000-0000-0000-0000000000f3",
  suspended: "00000000-0000-0000-0000-0000000000f4",
  notStarted: "00000000-0000-0000-0000-0000000000f5",
};
const TRIAL_PERMS = {
  clients: true, appointments: true, numerology: true, stones: true, stok: true, sifa_rehberi: true, reflexology: true,
  energy_body: true, aromatherapy: true, cosmic_calendar: true, human_design: true, cupping: true, beslenme: true,
  astrology: true, digital_content: false, personal_archive: false, belge_ceviri: false, video_ceviri: false,
  ders_notu: false, yasam_hafizasi: false,
};
const FULL_PERMS = { ...TRIAL_PERMS, digital_content: true, personal_archive: true, belge_ceviri: true, yasam_hafizasi: true };

function baseUser(id: string, email: string, extra: Row): Row {
  return {
    id, email, name: email.split("@")[0], full_name: email.split("@")[0], role: "expert", status: "active",
    tenant_id: TEN.prem, active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: FULL_PERMS, is_demo_account: false, admin_level: null, membership_status: "active",
    subscription_status: "active", trial_started_at: null, trial_ends_at: null, membership_started_at: null,
    membership_ends_at: null, trial_kind: null, trial_status: null, security_exempt: false, allowed_active_sessions: -1,
    allowed_locations: 1, security_mode: "normal", license_type: "single", allowed_desktop_sessions: -1,
    allowed_mobile_sessions: -1, allowed_tablet_sessions: -1, allowed_unknown_sessions: -1, __pw: "parola-123456",
    ...extra,
  };
}
const trialUser = (id: string, email: string, status: string, startMs: number | null, extra: Row = {}) =>
  baseUser(id, email, {
    tenant_id: TEN.trial, package_type: "trial", plan: "trial", subscription_status: "trial", membership_status: "trial",
    module_permissions: TRIAL_PERMS, trial_kind: "self_7d", trial_status: status,
    trial_started_at: startMs === null ? null : iso(startMs), trial_ends_at: startMs === null ? null : iso(startMs + 168 * HOUR),
    ...extra,
  });

const tables: Record<string, Row[]> = {
  users: [
    baseUser(U.admin, "admin@test.com", { role: "admin", module_permissions: null, package_type: null, plan: null }),
    // Mevcut Premium (ödeme kaydı yok; eski onay penceresi geçmişte) — DEĞİŞMEMELİ.
    baseUser(U.premium, "premium@test.com", { trial_started_at: iso(now - 40 * 24 * HOUR), trial_ends_at: iso(now - 33 * 24 * HOUR) }),
    baseUser(U.ozel, "ozel@test.com", {}),
    baseUser(U.demo, "demo@test.com", { is_demo_account: true }),
    // Eski deneme hesabı (paket trial, trial_kind YOK) — bugünkü gibi erişimsiz kalmalı (otomatik dönüşüm YOK).
    baseUser(U.legacy, "legacy@test.com", { package_type: "trial", plan: "trial", subscription_status: "trial", trial_ends_at: iso(now - 24 * HOUR) }),
    trialUser(U.active, "aktif@test.com", "active", now - 2 * HOUR),
    trialUser(U.expired, "biten@test.com", "active", now - 169 * HOUR),
    trialUser(U.review, "inceleme@test.com", "review", null),
    trialUser(U.suspended, "durdurulan@test.com", "suspended", now - 10 * HOUR),
    trialUser(U.notStarted, "yeni@test.com", "not_started", null),
  ],
  user_sessions: [],
  pro_upgrade_requests: [],
  store_settings: [{ id: true, whatsapp_number: "905551112233", whatsapp_enabled: true }],
};
const rpcCalls: { name: string; body: Row }[] = [];
const rate = new Map<string, number>();
const ledger: { id: number; user: string; module: string; state: string }[] = [];
const limits = new Map<string, { daily: number; mods: Row }>();
let turnstile: { mode: "ok" | "fail" | "down" | "action"; calls: number } = { mode: "ok", calls: 0 };
let roxy: { status: number; calls: number } = { status: 200, calls: 0 };

const userById = (id: unknown) => tables.users.find((u) => u.id === id);
function phaseOf(u: Row): string {
  if (!u.trial_kind) return "none";
  if (u.trial_status === "converted" || u.package_type === "premium") return "converted";
  if (u.trial_status === "active") return Date.parse(String(u.trial_ends_at)) > Date.now() ? "active" : "expired";
  return String(u.trial_status);
}

function rpc(name: string, b: Row): unknown {
  switch (name) {
    case "auth_login_guarded": {
      const u = tables.users.find((r) => r.email === String(b.p_email).trim().toLowerCase() && r.__pw === b.p_password);
      if (!u) return { status: "invalid" };
      const { id, email, name: nm, role, status, tenant_id, active, approval_status } = u;
      return { status: "ok", user: { id, email, name: nm, role, status, tenant_id, active, approval_status } };
    }
    case "auth_rate_limit_hit": {
      const n = (rate.get(String(b.p_bucket)) ?? 0) + 1;
      rate.set(String(b.p_bucket), n);
      return n > Number(b.p_limit) ? { allowed: false, retry_after: 60 } : { allowed: true, retry_after: 0 };
    }
    case "create_session_v2":
      tables.user_sessions.push({ id: `s${tables.user_sessions.length}`, user_id: b.p_user_id, session_token: b.p_session_token, is_active: true, session_state: "active" });
      return { inserted: true, state: "active", session_id: "s", exception_used: false };
    case "touch_active_session": {
      const s = tables.user_sessions.find((r) => r.session_token === b.p_token && r.is_active === true);
      return s ? String(s.user_id) : null;
    }
    case "hash_password":
      return "$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfake";
    case "provision_expert":
      return { ok: true, outcome: "provisioned", user_id: "00000000-0000-0000-0000-00000000aaaa", tenant_id: TEN.trial, request_id: "r" };
    case "trial_recent_signups_for_ip":
      return 0;
    case "trial_register_expert": {
      const p = b.p_payload as Row;
      return { ok: true, outcome: "provisioned", user_id: "00000000-0000-0000-0000-00000000bbbb", tenant_id: TEN.trial, trial_status: p.review ? "review" : "not_started" };
    }
    case "trial_activate_on_login": {
      const u = userById(b.p_user_id);
      if (!u) return { ok: false };
      let activated = false;
      if (u.trial_kind && u.trial_status === "not_started" && !u.trial_started_at) {
        u.trial_status = "active";
        u.trial_started_at = iso(Date.now());
        u.trial_ends_at = iso(Date.now() + 168 * HOUR);
        activated = true;
      }
      return { ok: true, activated, trial_kind: u.trial_kind, trial_status: u.trial_status, phase: phaseOf(u), trial_started_at: u.trial_started_at, trial_ends_at: u.trial_ends_at, server_now: iso(Date.now()) };
    }
    case "trial_credit_reserve": {
      const u = userById(b.p_user_id)!;
      const ph = phaseOf(u);
      if (ph === "none" || ph === "converted") return { ok: true, metered: false };
      if (ph !== "active") return { ok: false, reason: `trial_${ph}` };
      const lim = limits.get(String(u.id)) ?? { daily: 50, mods: {} };
      const used = ledger.filter((l) => l.user === u.id && l.state !== "refunded");
      if (used.length >= lim.daily) return { ok: false, reason: "daily_limit" };
      const ml = lim.mods[String(b.p_module)];
      if (typeof ml === "number" && used.filter((l) => l.module === b.p_module).length >= ml) return { ok: false, reason: "module_limit" };
      ledger.push({ id: ledger.length + 1, user: String(u.id), module: String(b.p_module), state: "reserved" });
      return { ok: true, metered: true, reservation_id: ledger.length, remaining: lim.daily - used.length - 1 };
    }
    case "trial_credit_settle": {
      const l = ledger.find((x) => x.id === b.p_reservation_id && x.state === "reserved");
      if (!l) return false;
      l.state = b.p_charged ? "charged" : "refunded";
      return true;
    }
    case "trial_credit_usage": {
      const used = ledger.filter((l) => l.user === b.p_user_id && l.state !== "refunded");
      return { day: "2026-11-06", daily_limit: 50, module_limits: {}, used_total: used.length, used_by_module: {} };
    }
    case "trial_pro_request_create": {
      const u = userById(b.p_user_id);
      if (!u?.trial_kind) return { ok: false, reason: "not_trial" };
      const open = tables.pro_upgrade_requests.find((r) => r.user_id === u.id && r.status === "open");
      if (open) return { ok: true, created: false, request_id: open.id, created_at: open.created_at };
      const row = { id: `pr${tables.pro_upgrade_requests.length + 1}`, user_id: u.id, status: "open", created_at: iso(Date.now()) };
      tables.pro_upgrade_requests.push(row);
      return { ok: true, created: true, request_id: row.id, created_at: row.created_at };
    }
    case "admin_trial_set_limits":
    case "admin_trial_list":
    case "admin_trial_convert_to_pro":
      return { ok: true, rows: [], counts: {}, total: 0 };
    default:
      return { __missing: true };
  }
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
  }
  return out;
}
const strip = (r: Row) => {
  const { __pw, ...rest } = r;
  void __pw;
  return rest;
};
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ROXY_BASE = "https://roxy.fake.test";
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.host === "challenges.cloudflare.com") {
    turnstile.calls++;
    const form = new URLSearchParams(String(init?.body ?? ""));
    if (form.get("secret") !== "trial-ts-secret") return jsonRes({ success: false }, 200);
    if (turnstile.mode === "down") throw new Error("ağ yok");
    if (turnstile.mode === "fail") return jsonRes({ success: false, "error-codes": ["invalid-input-response"] });
    return jsonRes({ success: true, action: turnstile.mode === "action" ? "login" : "register", hostname: "yasam.test" });
  }
  if (url.origin === ROXY_BASE) {
    roxy.calls++;
    return jsonRes({ ok: true }, roxy.status);
  }
  if (url.host !== "fake-supabase.local") throw new Error(`Beklenmeyen ağ isteği: ${url.href}`);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const accept = new Headers(init?.headers).get("accept") ?? "";
  const p = url.pathname.replace(/^\/rest\/v1\//, "");
  if (p.startsWith("rpc/")) {
    const name = p.slice(4);
    rpcCalls.push({ name, body: body ?? {} });
    const r = rpc(name, body ?? {});
    if (r && typeof r === "object" && (r as Row).__missing) return jsonRes({ code: "PGRST202", message: `missing ${name}` }, 404);
    return jsonRes(r);
  }
  const rows = tables[p] ?? (tables[p] = []);
  const filters = parseFilters(url);
  const match = (r: Row) => filters.every((f) => f(r));
  const single = accept.includes("vnd.pgrst.object");
  if (method === "GET" || method === "HEAD") {
    const hit = rows.filter(match).map(strip);
    return single ? jsonRes(hit[0] ?? null, hit[0] ? 200 : 406) : jsonRes(hit);
  }
  if (method === "PATCH") {
    const hit = rows.filter(match);
    for (const r of hit) Object.assign(r, body);
    return jsonRes(hit.map(strip));
  }
  if (method === "POST") {
    rows.push(...(Array.isArray(body) ? body : [body]));
    return jsonRes(body, 201);
  }
  return jsonRes({ message: "unsupported" }, 400);
}) as typeof fetch;

function sessionFor(userId: string): string {
  const token = `tok-${userId.slice(-4)}-${tables.user_sessions.length}-x`.padEnd(36, "0");
  tables.user_sessions.push({ id: `s${tables.user_sessions.length}`, user_id: userId, session_token: token, is_active: true, session_state: "active" });
  return token;
}
function req(url: string, userId: string, method = "GET", body?: unknown, admin = false) {
  const token = sessionFor(userId);
  const headers: Record<string, string> = { "x-session-token": token, "content-type": "application/json", origin: "http://localhost", "user-agent": "Mozilla/5.0 harness" };
  headers[admin ? "x-admin-id" : "x-user-id"] = userId;
  return new NextRequest(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const calledRpc = (name: string) => rpcCalls.filter((c) => c.name === name);

async function run() {
  const { POST: registerPOST, GET: registerGET } = await import("@/app/api/register/route");
  const { POST: sessionPOST } = await import("@/app/api/auth/session/route");
  const { requireModuleAccess } = await import("@/lib/auth/userGuard");
  const { GET: statusGET } = await import("@/app/api/trial/status/route");
  const { POST: proPOST } = await import("@/app/api/trial/pro-request/route");
  const { GET: belgeHistoryGET } = await import("@/app/api/belge-ceviri/history/route");
  const { POST: restorePOST } = await import("@/app/api/settings/restore/route");
  const { GET: adminTrialsGET } = await import("@/app/api/admin/trials/route");
  const { PATCH: adminTrialPATCH } = await import("@/app/api/admin/trials/[id]/route");
  const { POST: adminConvertPOST } = await import("@/app/api/admin/trials/[id]/convert/route");
  const { withTrialRoxyMeter, trialMeteredFetch } = await import("@/lib/trial/roxyMeter");
  const { callRoxyBodygraph } = await import("@/lib/human-design/providers/roxy/client");

  // ── R: kayıt ────────────────────────────────────────────────────────────────
  console.log("— R: kayıt");
  const regBody = (email: string, extra: Row = {}) => ({ fullName: "Deneme Uzman", email, password: "guclu-parola-2026", ...extra });
  const regReq = (b: Row, ip = "203.0.113.10") =>
    new NextRequest("http://localhost/api/register", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 harness" }, body: JSON.stringify(b) });
  let res: Response = await registerPOST(regReq(regBody("eski-akis@test.com")));
  ok(res.status === 200 && calledRpc("provision_expert").length === 1 && calledRpc("trial_register_expert").length === 0,
    "R1 bayrak kapalı → bugünkü yönetici onaylı akış (provision_expert), deneme kaydı YOK");
  ok(((await (await registerGET()).json()) as Row).selfTrial === false, "R2 yapılandırma: otomatik deneme kapalı");
  process.env.TRIAL_SELF_SIGNUP_ENABLED = "1";
  ok(((await (await registerGET()).json()) as Row).selfTrial === false, "R3 bayrak açık + yalnız Kampanya Turnstile anahtarları → KAPALI (kayıt kendi TRIAL_TURNSTILE_* anahtarını ister)");
  process.env.TRIAL_TURNSTILE_SECRET_KEY = "trial-ts-secret";
  process.env.TRIAL_TURNSTILE_SITE_KEY = "ts-site";
  const cfg = (await (await registerGET()).json()) as Row;
  ok(cfg.selfTrial === true && cfg.turnstileSiteKey === "ts-site", "R4 bayrak + anahtarlar → açık, yalnız herkese açık site anahtarı döner", cfg);
  const hashBefore = calledRpc("hash_password").length;
  res = await registerPOST(regReq(regBody("tokensiz@test.com")));
  ok(res.status === 400 && ((await res.json()) as Row).code === "captcha_failed" && calledRpc("hash_password").length === hashBefore,
    "R5 Turnstile belirteci yok → 400, parola işlenmedi, hesap yok");
  turnstile = { mode: "fail", calls: 0 };
  res = await registerPOST(regReq(regBody("sahte@test.com", { turnstileToken: "x".repeat(40) })));
  ok(res.status === 400 && turnstile.calls === 1 && calledRpc("trial_register_expert").length === 0, "R6 Siteverify başarısız → kayıt yok (sunucu doğrulaması zorunlu)");
  turnstile = { mode: "action", calls: 0 };
  res = await registerPOST(regReq(regBody("baska-sayfa@test.com", { turnstileToken: "x".repeat(40) })));
  ok(res.status === 400, "R7 başka action'a ait belirteç → red");
  turnstile = { mode: "down", calls: 0 };
  res = await registerPOST(regReq(regBody("erisilemez@test.com", { turnstileToken: "x".repeat(40) })));
  ok(res.status === 503 && calledRpc("trial_register_expert").length === 0, "R8 Cloudflare erişilemez → 503, kayıt yok (fail-closed)");
  turnstile = { mode: "ok", calls: 0 };
  res = await registerPOST(regReq(regBody("yeni.uzman@test.com", { turnstileToken: "x".repeat(40) })));
  const rj = (await res.json()) as Row;
  const tr = calledRpc("trial_register_expert").at(-1)?.body.p_payload as Row;
  ok(res.status === 200 && rj.mode === "trial" && !!tr, "R9 geçerli Turnstile → deneme kaydı", rj);
  const perms = (tr?.module_permissions ?? {}) as Row;
  ok(perms.digital_content === false && perms.belge_ceviri === false && perms.personal_archive === false && perms.video_ceviri === false &&
     perms.ders_notu === false && perms.yasam_hafizasi === false && perms.astrology === true && perms.human_design === true,
    "R10 kayıt modülleri: Premium seti + Atlas; Dijital İçerik ailesi + YH KAPALI", perms);
  ok(typeof tr?.claim_hash === "string" && !String(tr.claim_hash).includes("@") && typeof tr?.ip_bucket === "string" && !String(tr.ip_bucket).includes("203.0"),
    "R11 tek hak + IP yalnız HMAC kovası (ham e-posta/IP gönderilmez)");
  res = await registerPOST(regReq(regBody("kullan@mailinator.com", { turnstileToken: "x".repeat(40) })));
  ok((calledRpc("trial_register_expert").at(-1)?.body.p_payload as Row).review === true, "R12 tek kullanımlık e-posta → otomatik inceleme");
  let limited = 0;
  for (let i = 0; i < 12; i++) {
    const r = await registerPOST(regReq(regBody(`seri${i}@test.com`, { turnstileToken: "x".repeat(40) }), "198.51.100.77"));
    if (r.status === 429) limited++;
  }
  ok(limited >= 2, "R13 mevcut kayıt hız sınırı (IP başına 15 dk'da 10) korunuyor", limited);

  // ── L: giriş ────────────────────────────────────────────────────────────────
  console.log("— L: giriş");
  const loginReq = (email: string) =>
    new NextRequest("http://localhost/api/auth/session", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.5", "user-agent": "Mozilla/5.0 harness" }, body: JSON.stringify({ email, password: "parola-123456" }) });
  res = await sessionPOST(loginReq("yeni@test.com"));
  const lj = (await res.json()) as Row;
  const ns = userById(U.notStarted)!;
  ok(res.status === 200 && (lj.trial as Row)?.phase === "active" && ns.trial_status === "active", "L1 ilk başarılı giriş 7 günlük pencereyi başlattı", lj.trial);
  ok(Date.parse(String(ns.trial_ends_at)) - Date.parse(String(ns.trial_started_at)) === 168 * HOUR, "L2 pencere tam 168 saat");
  const endsFirst = ns.trial_ends_at;
  await sessionPOST(loginReq("yeni@test.com"));
  ok(userById(U.notStarted)!.trial_ends_at === endsFirst, "L3 tekrar giriş süreyi sıfırlamadı");
  res = await sessionPOST(loginReq("premium@test.com"));
  ok(res.status === 200 && ((await res.json()) as Row).trial === undefined, "L4 Premium girişi: deneme verisi YOK");
  res = await sessionPOST(loginReq("biten@test.com"));
  ok(res.status === 200, "L5 süresi dolmuş deneme uzmanı GİRİŞ YAPABİLİR (hesap pasif değil)");

  // ── G: modül kapısı ─────────────────────────────────────────────────────────
  console.log("— G: sunucu kapısı");
  const gate = async (userId: string, url: string, method: string, key: Parameters<typeof requireModuleAccess>[1]) => {
    const g = await requireModuleAccess(req(url, userId, method, method === "GET" ? undefined : {}), key);
    if (g.ok) return { status: 200, code: null as string | null };
    return { status: g.response.status, code: ((await g.response.json()) as Row).code as string | null };
  };
  const A = "http://localhost/api";
  let g = await gate(U.active, `${A}/dogaltas/stones`, "POST", "stones");
  ok(g.status === 200, "G1 aktif deneme: yazma açık", g);
  g = await gate(U.active, `${A}/astroloji/engine/run`, "POST", "astrology");
  ok(g.status === 200, "G2 aktif deneme: Gökyüzü Atlası açık", g);
  for (const key of ["digital_content", "personal_archive", "belge_ceviri", "belge_ceviri_ai", "video_ceviri", "ders_notu"] as const) {
    g = await gate(U.active, `${A}/x`, "GET", key);
    ok(g.status === 403 && g.code === "MODULE_DENIED", `G3 aktif deneme: ${key} → 403 (Dijital İçerik ailesi)`, g);
  }
  // Allowlist dışı her anahtar (ileride eklenecek alt modül) — saf çekirdek kararı:
  const { resolveModuleAccess } = await import("@/lib/auth/moduleAccessCore");
  ok(resolveModuleAccess("expert", { ...TRIAL_PERMS, dijital_yeni_alt_modul: true }, "dijital_yeni_alt_modul", { isTrial: true }) === false &&
     resolveModuleAccess("expert", { ...TRIAL_PERMS, yasam_hafizasi: true }, "yasam_hafizasi", { isTrial: true }) === false,
    "G4 ileride eklenecek alt modül + YH bayrak açık olsa bile denemede KAPALI (fail-closed)");
  g = await gate(U.expired, `${A}/dogaltas/stones`, "GET", "stones");
  ok(g.status === 200, "G5 süresi dolmuş: kayıtları GÖRÜNTÜLEME açık", g);
  g = await gate(U.expired, `${A}/dogaltas/stones`, "POST", "stones");
  ok(g.status === 403 && g.code === "TRIAL_EXPIRED", "G6 süresi dolmuş: yeni kayıt 403 TRIAL_EXPIRED", g);
  g = await gate(U.expired, `${A}/clients/abc`, "PATCH", "clients");
  ok(g.status === 403 && g.code === "TRIAL_EXPIRED", "G7 süresi dolmuş: düzenleme 403", g);
  g = await gate(U.expired, `${A}/clients/abc`, "DELETE", "clients");
  ok(g.status === 403 && g.code === "TRIAL_EXPIRED", "G8 süresi dolmuş: silme 403", g);
  g = await gate(U.expired, `${A}/dogaltas/word-report`, "POST", "stones");
  ok(g.status === 200, "G9 süresi dolmuş: Word dışa aktarma AÇIK", g);
  g = await gate(U.expired, `${A}/clients/abc/word-report`, "POST", "clients");
  ok(g.status === 200, "G10 süresi dolmuş: danışan raporu dışa aktarma AÇIK", g);
  g = await gate(U.expired, `${A}/hd/compute`, "POST", "human_design");
  ok(g.status === 403, "G11 süresi dolmuş: yeni hesaplama 403", g);
  g = await gate(U.expired, `${A}/clients/abc/stone-photos/prepare`, "POST", "clients");
  ok(g.status === 403, "G12 süresi dolmuş: dosya yükleme 403", g);
  g = await gate(U.expired, `${A}/x`, "GET", "digital_content");
  ok(g.status === 403, "G13 süresi dolmuş: Dijital İçerik yine kapalı");
  g = await gate(U.suspended, `${A}/dogaltas/stones`, "GET", "stones");
  const gs = await gate(U.suspended, `${A}/dogaltas/stones`, "POST", "stones");
  ok(g.status === 200 && gs.status === 403 && gs.code === "TRIAL_SUSPENDED", "G14 durdurulan deneme: görüntüleme açık, yazma 403");
  g = await gate(U.review, `${A}/dogaltas/stones`, "GET", "stones");
  ok(g.status === 403 && g.code === "TRIAL_REVIEW", "G15 inceleme: modüller kapalı (GET dahil)", g);
  g = await gate(U.premium, `${A}/dogaltas/stones`, "POST", "stones");
  ok(g.status === 200, "G16 Premium (eski deneme tarihi geçmiş, ödeme kaydı yok): yazma AÇIK — tarih kilitlemez", g);
  g = await gate(U.premium, `${A}/x`, "GET", "digital_content");
  ok(g.status === 200, "G17 Premium: Dijital İçerik erişimi DEĞİŞMEDİ");
  g = await gate(U.ozel, `${A}/x`, "GET", "belge_ceviri");
  ok(g.status === 200, "G18 özel yetkili hesap: Belge Çeviri DEĞİŞMEDİ");
  g = await gate(U.demo, `${A}/x`, "GET", "digital_content");
  const gd = await gate(U.demo, `${A}/dogaltas/stones`, "GET", "stones");
  ok(g.status === 403 && gd.status === 200, "G19 demo: mevcut davranış (Dijital İçerik kapalı, diğerleri açık)");
  g = await gate(U.legacy, `${A}/dogaltas/stones`, "GET", "stones");
  ok(g.status === 403 && g.code === "MEMBERSHIP_INACTIVE", "G20 eski deneme hesabı: bugünkü gibi MEMBERSHIP_INACTIVE (otomatik dönüşüm YOK)", g);

  // ── W: yalnız-oturum uçları ──────────────────────────────────────────────────
  console.log("— W: yalnız oturum kapılı uçlar");
  res = await belgeHistoryGET(req(`${A}/belge-ceviri/history`, U.active));
  ok(res.status === 403, "W1 deneme uzmanı Belge Çeviri geçmişi (doğrudan API) → 403");
  res = await restorePOST(req(`${A}/settings/restore`, U.expired, "POST", { mode: "plan" }));
  ok(res.status === 403 && ((await res.json()) as Row).code === "TRIAL_EXPIRED", "W2 süresi dolmuş: yedek geri yükleme (yazma) → 403");
  res = await restorePOST(req(`${A}/settings/restore`, U.premium, "POST", {}));
  ok(res.status !== 403, "W3 Premium geri yükleme kapısı değişmedi", res.status);

  // ── X: Roxy kredi sayacı (GERÇEK HD istemcisi) ──────────────────────────────
  console.log("— X: Roxy kredi sayacı");
  const cache = new Set<string>();
  const handler = withTrialRoxyMeter("human_design", "harness/hd", async (r: NextRequest) => {
    const guard = await requireModuleAccess(r, "human_design");
    if (!guard.ok) return guard.response;
    const key = new URL(r.url).searchParams.get("k") ?? "x";
    if (cache.has(key)) return jsonRes({ ok: true, cached: true });
    const out = await callRoxyBodygraph({ apiKey: "k", baseUrl: ROXY_BASE }, { date: "1990-01-01", time: "12:00", latitude: 41, longitude: 29, timezone: "Europe/Istanbul" } as never);
    if (!out.ok) return jsonRes({ ok: false, error: "Sağlayıcı hatası" }, 502);
    cache.add(key);
    return jsonRes({ ok: true, cached: false });
  });
  const hd = (userId: string, k: string) => handler(req(`${A}/hd/charts/roxy?k=${k}`, userId, "POST", {}));
  roxy = { status: 200, calls: 0 };
  res = await hd(U.active, "a");
  ok(res.status === 200 && roxy.calls === 1 && ledger.filter((l) => l.user === U.active && l.state === "charged").length === 1, "X1 gerçek Roxy isteği = 1 kredi (charged)");
  res = await hd(U.active, "a");
  ok(((await res.json()) as Row).cached === true && roxy.calls === 1 && ledger.filter((l) => l.user === U.active).length === 1, "X2 önbellek isabeti kredi DÜŞMEDİ");
  roxy.status = 503;
  res = await hd(U.active, "b");
  ok(res.status === 502 && ledger.filter((l) => l.user === U.active && l.state === "refunded").length === 1, "X3 sağlayıcı 503 → kredi iade");
  roxy.status = 200;
  limits.set(U.active, { daily: 2, mods: {} });
  res = await hd(U.active, "c");
  ok(res.status === 200, "X4 2. kredi kullanıldı");
  const before = roxy.calls;
  res = await hd(U.active, "d");
  const xj = (await res.json()) as Row;
  ok(res.status === 429 && xj.code === "TRIAL_CREDIT_LIMIT" && roxy.calls === before, "X5 limit doldu → 429 anlaşılır mesaj, Roxy isteği ATILMADI", xj);
  res = await hd(U.active, "a");
  ok(res.status === 200, "X6 limit dolu iken kayıtlı (önbellek) sonuç görüntülenebilir");
  limits.set(U.active, { daily: 10, mods: { human_design: 2 } });
  res = await hd(U.active, "e");
  ok(res.status === 429 && ((await res.json()) as Row).error === "Bu modül için bugünkü Roxy hesaplama sınırına ulaştınız. Krediniz Türkiye saatiyle 00.00'da yenilenir.", "X7 modül limiti mesajı");
  const premBefore = calledRpc("trial_credit_reserve").length;
  roxy.calls = 0;
  res = await hd(U.premium, "z");
  ok(res.status === 200 && roxy.calls === 1 && calledRpc("trial_credit_reserve").length === premBefore, "X8 Premium: kredi sayacı devrede DEĞİL");
  res = await hd(U.expired, "y");
  ok(res.status === 403, "X9 süresi dolmuş deneme: yeni Roxy hesaplaması 403");
  roxy.calls = 0;
  const raw = await trialMeteredFetch(`${ROXY_BASE}/plain`, { method: "GET" });
  ok(raw.status === 200 && roxy.calls === 1, "X10 bağlam dışı çağrı düz fetch (admin/kampanya/araçlar etkilenmez)");

  // ── S: durum + Pro talebi ────────────────────────────────────────────────────
  console.log("— S: durum + Pro talebi");
  res = await statusGET(req(`${A}/trial/status`, U.active));
  const sj = ((await res.json()) as Row).trial as Row;
  ok(sj?.phase === "active" && typeof sj.endsAt === "string" && typeof sj.serverNow === "string" && (sj.credits as Row)?.dailyLimit === 50,
    "S1 durum: faz + sunucu bitiş zamanı + kredi", sj);
  ok(String(sj.whatsappUrl).startsWith("https://wa.me/905551112233"), "S2 WhatsApp bağlantısı Mağaza numarasından", sj.whatsappUrl);
  res = await statusGET(req(`${A}/trial/status`, U.premium));
  ok(((await res.json()) as Row).trial === null, "S3 Premium: deneme durumu yok");
  res = await proPOST(req(`${A}/trial/pro-request`, U.expired, "POST", { note: "Ödeme yaptım" }));
  const p1 = (await res.json()) as Row;
  res = await proPOST(req(`${A}/trial/pro-request`, U.expired, "POST", {}));
  const p2 = (await res.json()) as Row;
  ok(p1.created === true && p2.created === false && tables.pro_upgrade_requests.filter((r) => r.user_id === U.expired).length === 1,
    "S4 süresi dolmuşken Pro talebi açık; mükerrer talep yok");
  res = await proPOST(req(`${A}/trial/pro-request`, U.premium, "POST", {}));
  ok(res.status === 403, "S5 Premium üye deneme Pro talebi oluşturamaz");

  // ── A: admin uçları ──────────────────────────────────────────────────────────
  console.log("— A: admin uçları");
  res = await adminTrialsGET(req(`${A}/admin/trials`, U.premium, "GET", undefined, true));
  ok(res.status === 401 || res.status === 403, "A1 admin olmayan liste → ret", res.status);
  res = await adminTrialsGET(req(`${A}/admin/trials?status=active`, U.admin, "GET", undefined, true));
  ok(res.status === 200, "A2 admin liste", res.status);
  const ctx = { params: Promise.resolve({ id: U.active }) };
  res = await adminTrialPATCH(req(`${A}/admin/trials/${U.active}`, U.admin, "PATCH", { action: "limits", dailyLimit: 20, moduleLimits: { astrology: 25 } }, true), ctx);
  ok(res.status === 400, "A3 modül limiti ortak günlük limiti aşamaz");
  res = await adminTrialPATCH(req(`${A}/admin/trials/${U.active}`, U.admin, "PATCH", { action: "limits", dailyLimit: 20, moduleLimits: { digital_content: 5 } }, true), ctx);
  ok(res.status === 400, "A4 kredi modülü yalnız Atlas / HD / Numeroloji");
  res = await adminTrialPATCH(req(`${A}/admin/trials/${U.active}`, U.admin, "PATCH", { action: "extend", hours: 24 }, true), ctx);
  ok(res.status === 400, "A5 süre uzatma işlemi YOK (geçersiz işlem)");
  res = await adminConvertPOST(req(`${A}/admin/trials/${U.active}/convert`, U.admin, "POST", { modules: [] }, true), ctx);
  ok(res.status === 400 && calledRpc("admin_trial_convert_to_pro").length === 0, "A6 Pro'ya geçişte modül seçimi zorunlu");
  const { PATCH: adminUserPATCH } = await import("@/app/api/admin/users/[id]/route");
  res = await adminUserPATCH(req(`${A}/admin/users/${U.active}`, U.admin, "PATCH", { action: "modules", changes: { belge_ceviri: true } }, true), ctx);
  const mj = (await res.json()) as Row;
  ok(res.status === 400 && mj.code === "TRIAL_MODULE_FORBIDDEN", "A7 deneme üyesine Dijital İçerik alt modülü açılamaz (kişiye özel izin aşamaz)", mj);
  const { POST: grantPOST } = await import("@/app/api/admin/hd/unlimited-grant/route");
  void grantPOST;

  // ── C: istemci + saf çekirdek ────────────────────────────────────────────────
  console.log("— C: istemci + çekirdek");
  const { mapUserRowToYasamUser } = (await import("@/lib/auth/yasamUser")) as unknown as { mapUserRowToYasamUser?: (r: Row) => unknown };
  void mapUserRowToYasamUser;
  const { hasModulePermission, hasAnyModulePermissionFlag } = await import("@/lib/auth/modulePermissions");
  const { isHubVisible, DIGITAL_CONTENT_HUB_CHILDREN } = (await import("@/lib/auth/hubVisibility")) as unknown as {
    isHubVisible: (u: unknown, c: unknown) => boolean; DIGITAL_CONTENT_HUB_CHILDREN: unknown;
  };
  const { evaluateRouteModuleGuard } = await import("@/lib/auth/routeModuleAccess");
  const { hasExpertMembershipAccess } = await import("@/lib/auth/membership");
  const cu = (id: string) => strip(userById(id)!) as never;
  ok(!hasModulePermission(cu(U.active), "digital_content") && !hasModulePermission(cu(U.active), "belge_ceviri") &&
     !hasAnyModulePermissionFlag(cu(U.active), ["personal_archive", "kisisel_arsiv", "video_ceviri", "ders_notu"]),
    "C1 menü/ana panel: Dijital İçerik ailesi deneme uzmanına GÖRÜNMEZ");
  ok(!isHubVisible(cu(U.active), DIGITAL_CONTENT_HUB_CHILDREN) && isHubVisible(cu(U.premium), DIGITAL_CONTENT_HUB_CHILDREN),
    "C2 Dijital İçerik hub kartı: deneme gizli, Premium görünür");
  const routes = ["/belge-ceviri", "/dashboard/kisisel-arsiv", "/video-ceviri", "/ders-notu"];
  const decisions = routes.map((r) => evaluateRouteModuleGuard(r, cu(U.active)));
  ok(decisions.every((d) => d !== "allow"), "C3 doğrudan URL: Dijital İçerik rotaları deneme uzmanına kapalı", decisions);
  ok(evaluateRouteModuleGuard("/human-design", cu(U.active)) === "allow" && evaluateRouteModuleGuard("/astroloji", cu(U.active)) === "allow",
    "C4 deneme paketi rotaları açık (HD, Atlas)");
  ok(hasExpertMembershipAccess(cu(U.expired)) === true && evaluateRouteModuleGuard("/dogaltas", cu(U.expired)) === "allow",
    "C5 süresi dolmuş: modül sayfaları görüntülenebilir (yazma sunucuda kapalı)");
  ok(evaluateRouteModuleGuard("/dogaltas", cu(U.review)) === "deny_membership", "C6 inceleme: modül sayfaları kapalı");
  ok(hasExpertMembershipAccess(cu(U.legacy)) === false && hasExpertMembershipAccess(cu(U.premium)) === true, "C7 eski deneme / Premium istemci kararı değişmedi");

  const core = await import("@/lib/trial/trialCore");
  const t = core.trialCountdownTitle;
  ok(t(168 * HOUR) === "Ücretsiz Denemenize 7 Gün Kaldı" && t(144 * HOUR + 1) === "Ücretsiz Denemenize 7 Gün Kaldı" &&
     t(144 * HOUR) === "Ücretsiz Denemenize 6 Gün Kaldı" && t(48 * HOUR + 1) === "Ücretsiz Denemenize 3 Gün Kaldı" &&
     t(24 * HOUR + 1) === "Ücretsiz Denemenize 2 Gün Kaldı" && t(24 * HOUR) === "Bugün Ücretsiz Denemenizin Son Günü" &&
     t(1) === "Bugün Ücretsiz Denemenizin Son Günü", "C8 geri sayım metinleri (7…2 gün, son 24 saat)");
  ok(core.canonicalTrialEmail(" A.Y.S.E+promo@GoogleMail.com ") === "ayse@gmail.com" && core.canonicalTrialEmail("ali+x@firma.com.tr") === "ali@firma.com.tr" &&
     core.canonicalTrialEmail("a.li@firma.com") === "a.li@firma.com", "C9 kanonik e-posta (gmail nokta/+etiket; diğerlerinde yalnız +etiket)");
  const { assessTrialRisk } = await import("@/lib/trial/trialServer");
  ok(assessTrialRisk({ email: "x@yopmail.com", recentSignupsFromIp: 0, userAgent: "Mozilla/5.0 x" }).review === true &&
     assessTrialRisk({ email: "ali@firma.com", recentSignupsFromIp: 3, userAgent: "Mozilla/5.0 x" }).review === true &&
     assessTrialRisk({ email: "ali@firma.com", recentSignupsFromIp: 1, userAgent: "Mozilla/5.0 x" }).review === false,
    "C10 risk: tek kullanımlık e-posta / aynı IP'den çoklu kayıt → inceleme; ortak IP'de 2. kayıt ENGELLENMEZ");
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280101000000_trial7_self_trial.sql"), "utf8");
  const arr = /trial_allowed_module_keys\(\)[\s\S]*?ARRAY\[([\s\S]*?)\]::text\[\]/.exec(sql)?.[1] ?? "";
  const sqlKeys = [...arr.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(sqlKeys) === JSON.stringify([...core.TRIAL_ALLOWED_MODULE_KEYS].sort()), "C11 SQL ↔ TS deneme modül allowlist'i AYNI", sqlKeys);
  const roxyRoutes = ["app/api/hd/charts/roxy/route.ts", "app/api/hd/relations/route.ts", "app/api/hd/charts/variables/route.ts",
    "app/api/hd/transit/personal/route.ts", "app/api/hd/transit/route.ts", "app/api/hd/location/search/route.ts",
    "app/api/hd/education/private/fictional/route.ts", "app/api/numeroloji-klasik/hesapla/route.ts",
    "app/api/astroloji/engine/run/route.ts", "app/api/astroloji/efemeris/route.ts"];
  const unwrapped = roxyRoutes.filter((f) => !/export const (POST|GET) = withTrialRoxyMeter\(/.test(fs.readFileSync(path.join(process.cwd(), f), "utf8")));
  ok(unwrapped.length === 0, "C12 Roxy çağırabilen 10 uzman ucunun tamamı kredi sayacıyla sarılı", unwrapped);
  const clientFiles = ["lib/astrology/providers/roxy/client.ts", "lib/human-design/providers/roxy/client.ts", "lib/human-design/providers/roxy/relationClient.ts",
    "lib/human-design/providers/roxy/location.ts", "lib/human-design/transit/roxyPlanetsClient.ts", "lib/human-design/transit/roxyTransitClient.ts",
    "lib/human-design/variables/roxyVariablesClient.ts", "lib/numeroloji-klasik/server/providerClient.ts"];
  const plain = clientFiles.filter((f) => /fetchImpl \?\? \(\(u, i\) => fetch\(u, i\)\)/.test(fs.readFileSync(path.join(process.cwd(), f), "utf8")));
  ok(plain.length === 0, "C13 8 Roxy istemcisinin varsayılan fetch'i sayaçlı", plain);
  const allTexts = ["messages/tr/home.json", "messages/en/home.json", "app/_campaign/VisitorCampaignView.tsx", "app/ucretsiz-analiz/_ziyaretci/VisitorApp.tsx",
    "components/landing/FreeTrialInvite.tsx", "app/page.tsx", "components/admin/members/MemberBadges.tsx"]
    .map((f) => fs.readFileSync(path.join(process.cwd(), f), "utf8")).join("\n");
  ok(!/3 gün|3 günlük|3 Gün|3-day|3-Day|3 Days|3 days/.test(allTexts), "C14 ana sayfa / kampanya / kayıt metinlerinde '3 gün' kalmadı");
}

run()
  .catch((e) => {
    fail++;
    console.error("HARNESS HATASI:", e instanceof Error ? e.stack : e);
  })
  .finally(() => {
    console.log(`\ntrial7 routes harness: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
  });
