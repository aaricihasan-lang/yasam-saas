/**
 * ÜYE PASİFLEŞTİRME F3 — sunucu / API erişim güvenliği harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (… → 4a → 4b → 20280126000000) + test-only PostgREST şimi +
 * GERÇEK Next route handler'ları (app/api altındaki TÜM route.ts dosyaları dinamik yüklenir). Production'a / ağa SIFIR
 * temas: global fetch yalnız 127.0.0.1 şimine izin verir (Roxy / Turnstile / e-posta çağrısı yapılamaz, yapılırsa FAIL).
 *
 *   U  saf çekirdek: açık liste birebir (yol + yöntem) · üyelik seviyesi (pasif → none; admin / aktif / deneme aynen)
 *   W  TAM TARAMA (kapalı-başlangıç kanıtı): her route × her HTTP yöntemi pasif uzmanın MEVCUT oturumuyla çağrılır →
 *      açık liste ve kullanıcı-kapısı-dışı sınıflar (admin / giriş-oturum / herkese açık) DIŞINDA kalan HER uç 403
 *      ACCOUNT_RESTRICTED döner. Yeni eklenen her uç otomatik olarak bu taramaya girer.
 *   E  açık liste işlevsel: profil (kısıt bilgisi + seviye none) · deneme durumu · destek (yalnız kendi mesajları) ·
 *      parola değişikliği kapıdan geçer
 *   S  mevcut oturum: kısıt sonradan konunca AYNI token'la sonraki istek 403; kısıt kalkınca yeniden giriş GEREKMEDEN açılır
 *   A  aktif uzman: tam taramada hiçbir uç ACCOUNT_RESTRICTED dönmez; (baseline modu) main koduyla durum kodları birebir
 *   G  giriş: pasif uzman giriş yapabilir (oturum oluşur); arşivdeki ve girişi kapalı uzman giremez (403 INACTIVE)
 *   T  tenant izolasyonu: başka uzmanın kimliğiyle / token'ıyla istek reddedilir; destek mesajları kullanıcıya özel
 *   D  silme yok: tarama sonrası kullanıcı / danışan / oturum / audit satırları korunur
 *
 * Çalıştır:            npx tsx scripts/uye-pasif-f3/uye-pasif-f3.harness.ts
 * Baseline (main kodu): cd <main-worktree> && PSF3_MODE=baseline PSF3_OUT=<json> npx tsx <bu dosya>
 */
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb, type TestDb } from "../uye-yonetimi-faz2/testDb";

const ROOT = process.cwd();
const REAL_EXIT = process.exit;

// "server-only" yalnız bu süreçte boş modüle yönlendirilir (Next dışı çalıştırma; scripts/anamnez deseni).
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const MODE = process.env.PSF3_MODE === "baseline" ? "baseline" : "new";
const OUT = process.env.PSF3_OUT ?? "";

// ── Ağ yalıtımı: yalnız yerel şim ───────────────────────────────────────────
const realFetch = globalThis.fetch;
let shimUrl = "http://127.0.0.1:1";
const blockedNet: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (u.startsWith(shimUrl)) return realFetch(input, init);
  blockedNet.push(u.slice(0, 120));
  throw new Error(`AG ENGELLENDI (harness): ${u.slice(0, 80)}`);
}) as typeof fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = shimUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.RATE_LIMIT_SECRET = "psf3-rate-limit-secret";
// PSF3_FLAGS=1 → bayrak arkasındaki modüller (kapalıyken kimlikten ÖNCE 404) açılır; sağlayıcı (Roxy) çağrı bayrakları KAPALI kalır.
const FLAGS = process.env.PSF3_FLAGS === "1";
if (FLAGS) Object.assign(process.env, {
  ASTROLOGY_MODULE_ENABLED: "true", SIFA_REHBERI_V2_ENABLED: "1", STONE_LIBRARY_ENABLED: "true",
  HD_EDUCATION_CATALOG_ENABLED: "true", HD_PRIVATE_EDUCATION_ENABLED: "true", NUMEROLOGY_CLASSIC_ENABLED: "true",
  EXPERT_WORKSPACE_DESIGN_ENABLED: "true", EXPERT_WORKSPACE_ROLLOUT_ALL: "true", USAGE360_ENABLED: "true",
});
for (const k of Object.keys(process.env)) if (/ROXY|ANTHROPIC|OPENAI|RESEND|SMTP|GMAIL/i.test(k)) delete process.env[k];

let pass = 0;
let fail = 0;
const failures: string[] = [];
const notes: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); return; }
  fail++;
  failures.push(label);
  console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 900)}`}`);
}

const readMigAt = (dir: string, f: string) => readFileSync(path.join(dir, "supabase/migrations", f), "utf8");
const MIG_F2 = "20280126000000_member_access_restriction.sql";
const F2_DIR = path.resolve(HERE, "..", "..");
const PRE = [
  "20271009100000_admin_purge_archived_expert.sql",
  "20271230000000_astrology_technique_grants.sql",
  "20280101000000_trial7_self_trial.sql",
  "20280101000100_trial7_claims_retention.sql",
  "20280101000200_trial7_admin_trial_approval.sql",
  "20280101000300_admin_legacy_package_repair.sql",
  "20280101000400_admin_owner_notifications.sql",
  "20280101000500_admin_list_members_v2.sql",
  "20280101000600_admin_member_archive_state.sql",
  "20280101000690_user_payment_history_payment_date_optional_4b.sql",
  "20280101000700_admin_payment_atomic_4b.sql",
  "20280101000710_admin_trial_convert_passive_guard_4b.sql",
];
const AUTH_MIGS = [
  "20270129000000_auth_login_throttle.sql",
  "20271001000000_auth_password_session_hardening.sql",
  "20271120001000_auth_login_lockout_dos_hardening.sql",
];

const OWNER = "00000000-0000-4000-8000-00000000f3a1";
const P = "00000000-0000-4000-8000-00000000f3b1"; // pasif yapılacak uzman (premium)
const A = "00000000-0000-4000-8000-00000000f3b2"; // aktif uzman (karşılaştırma)
const PT = "00000000-0000-4000-8000-00000000f3b3"; // pasif + süresi dolmuş deneme
const R = "00000000-0000-4000-8000-00000000f3b4"; // arşivlenecek uzman
const L = "00000000-0000-4000-8000-00000000f3b5"; // eski "giriş kapalı"
const TOK = { P: "zz-psf3-p-token-0001", A: "zz-psf3-a-token-0001", PT: "zz-psf3-pt-token-0001", R: "zz-psf3-r-token-0001", OWNER: "zz-psf3-owner-0001" };
const FIXED_ID = "00000000-0000-4000-8000-00000000c0de";
const PASSWORD = "Zz-Psf3-Parola!";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Kullanıcı oturum kapısını (verifyUserRequest) KULLANMAYAN sınıflar — kısıt bunlara uygulanmaz (beklenen). */
function nonUserGateClass(route: string): string | null {
  if (route.startsWith("/api/admin/") || route === "/api/auth/admin-session") return "admin";
  if (route === "/api/auth/session" || route.startsWith("/api/auth/session/") || route.startsWith("/api/auth/mfa/")) return "giris-oturum";
  if (route === "/api/me/sessions" || route.startsWith("/api/me/sessions/")) return "kendi-oturumlari";
  // Owner onayı (F3-R1): MFA / cihaz / hesap kurtarma / e-posta doğrulama — giriş güvenliği (verifySelfSessionRequest).
  if (route.startsWith("/api/me/") || route.startsWith("/api/devices/")) return "hesap-guvenligi";
  const PUBLIC = [
    "/api/register", "/api/location/search", "/api/security/csp-report", "/api/contact/support-request",
    "/api/cosmic/audit", "/api/inngest", "/api/internal/yh/outbox-webhook",
  ];
  if (PUBLIC.includes(route) || route.startsWith("/api/kampanya/")) return "herkese-acik";
  return null;
}

function listRoutes(): { file: string; route: string; params: Record<string, string | string[]> }[] {
  const base = path.join(ROOT, "app", "api");
  const out: { file: string; route: string; params: Record<string, string | string[]> }[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n === "route.ts") {
        const rel = path.relative(base, dir).split(path.sep);
        const params: Record<string, string | string[]> = {};
        const segs: string[] = [];
        for (const s of rel) {
          if (s.startsWith("(") && s.endsWith(")")) continue;
          let m = /^\[\[\.\.\.(.+)\]\]$/.exec(s);
          if (m) { params[m[1]] = ["x"]; segs.push("x"); continue; }
          m = /^\[\.\.\.(.+)\]$/.exec(s);
          if (m) { params[m[1]] = ["x"]; segs.push("x"); continue; }
          m = /^\[(.+)\]$/.exec(s);
          if (m) { params[m[1]] = FIXED_ID; segs.push(FIXED_ID); continue; }
          segs.push(s);
        }
        out.push({ file: p, route: `/api/${rel.join("/")}`, params });
      }
    }
  };
  walk(base);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address();
      const p = typeof a === "object" && a ? a.port : 0;
      srv.close(() => (p ? resolve(p) : reject(new Error("boş port alınamadı"))));
    });
  });
}

function urlFor(r: { route: string; params: Record<string, string | string[]> }): string {
  let u = r.route;
  for (const [k, v] of Object.entries(r.params)) {
    u = u.replace(`[[...${k}]]`, "x").replace(`[...${k}]`, "x").replace(`[${k}]`, String(v));
  }
  return `http://localhost${u}`;
}

async function call(h: Handler, method: string, url: string, params: Record<string, string | string[]>, user: string, token: string,
  body: unknown = {}): Promise<{ status: number; code: string; json: Record<string, unknown> | null; ms: number }> {
  const headers: Record<string, string> = { "x-user-id": user, "x-session-token": token };
  if (method !== "GET" && method !== "DELETE") headers["content-type"] = "application/json";
  const req = new NextRequest(url, { method, headers, body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body) });
  const t0 = Date.now();
  const res = await Promise.race([
    h(req, { params: Promise.resolve(params) }),
    new Promise<Response>((_, rej) => setTimeout(() => rej(new Error("ZAMAN ASIMI")), 20_000)),
  ]);
  let json: Record<string, unknown> | null = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) { try { json = (await res.json()) as Record<string, unknown>; } catch { json = null; } }
  else { try { await res.arrayBuffer(); } catch { /* akış */ } }
  return { status: res.status, code: String(json?.code ?? ""), json, ms: Date.now() - t0 };
}

async function main(): Promise<void> {
  const port = await freePort();
  const db: TestDb = await startTestDb(port, `uye-pasif-f3-${port}`);
  const { su, pool } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  const quiet = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  try {
    for (const f of PRE) await su.query(readMigAt(ROOT, f));
    await su.query(readMigAt(F2_DIR, MIG_F2));
    let loginReady = true;
    try {
      // Supabase düzeni: pgcrypto `extensions` şemasında (giriş RPC'leri extensions.crypt kullanır).
      await su.query(`create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;
        alter table public.users add column if not exists password text;`);
      for (const f of AUTH_MIGS) await su.query(readMigAt(ROOT, f));
      await su.query(readMigAt(ROOT, "20271003200000_session_model_v2.sql"));
    } catch (e) {
      await su.query("rollback").catch(() => undefined);
      loginReady = false;
      notes.push(`G: giriş RPC zinciri sentetik şemada kurulamadı → giriş testi NOT TESTED (${String((e as Error).message).slice(0, 140)})`);
    }
    await su.query(`alter table public.clients add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()`);
    shim = await startPgrestShim(pool);
    shimUrl = shim.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;

    // ── Sentetik hesaplar ────────────────────────────────────────────────────
    const tenants: Record<string, string> = {};
    const mods = { clients: true, numerology: true, stones: true, human_design: true, astrology: true, appointments: true, reflexology: true,
      aromatherapy: true, energy_body: true, cupping: true, beslenme: true, sifa_rehberi: true, stok: true, cosmic_calendar: true,
      digital_content: true, personal_archive: true, belge_ceviri: true, video_ceviri: true, ders_notu: true, yasam_hafizasi: true };
    const ph = loginReady ? `public.hash_password('${PASSWORD}')` : "null";
    const mkUser = async (id: string, role: string, o: { active?: boolean; trial?: "expired"; key: string }) => {
      const t = randomUUID();
      tenants[id] = t;
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZPSF3',$2,'active')`, [t, `zzpsf3-${o.key}`]);
      const tr = o.trial === "expired";
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, trial_kind, trial_status,
           trial_started_at, trial_ends_at, module_permissions, tenant_id, is_super_admin, admin_level, password_hash, created_at)
         values ($1,$2,$3,$4,$5,'approved', now() - interval '20 days', $6,$6,$7,$8,$9,$10,$11,$12,$13,$14, ${ph}, now() - interval '60 days')`,
        [id, `ZZ_PSF3 ${o.key}`, `zz.psf3.${o.key}@example.test`, role, o.active !== false, tr ? "trial" : "premium",
          tr ? "self_7d" : null, tr ? "active" : null, tr ? new Date(Date.now() - 9 * 86_400_000) : null, tr ? new Date(Date.now() - 2 * 86_400_000) : null,
          JSON.stringify(role === "admin" ? {} : (tr ? { clients: true, numerology: true } : mods)), t, role === "admin", role === "admin" ? "owner" : null],
      );
      await su.query(`insert into public.clients(id, tenant_id, full_name) values ($1,$2,$3)`, [randomUUID(), t, `ZZ Danışan ${o.key}`]);
    };
    await mkUser(OWNER, "admin", { key: "owner" });
    await mkUser(P, "expert", { key: "p" });
    await mkUser(A, "expert", { key: "a" });
    await mkUser(PT, "expert", { key: "pt", trial: "expired" });
    await mkUser(R, "expert", { key: "r" });
    await mkUser(L, "expert", { key: "l", active: false });
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)`,
      [P, TOK.P, A, TOK.A, PT, TOK.PT, R, TOK.R, OWNER, TOK.OWNER]);
    await su.query(`insert into public.support_messages(user_id, tenant_id, subject, message) values ($1,$2,'ZZ A konu','ZZ A mesaj')`, [A, tenants[A]])
      .catch((e) => notes.push(`destek tohum: ${(e as Error).message}`));

    // Mevcut oturum AÇIKKEN pasif yap (S kanıtı: aynı token sonraki istekte reddedilir).
    await su.query(`select public.admin_set_member_access_restriction($1,$2,true,false)`, [P, OWNER]);
    await su.query(`select public.admin_set_member_access_restriction($1,$2,true,false)`, [PT, OWNER]);
    await su.query(`select public.admin_archive_user($1,$2)`, [R, OWNER]);

    const snap = async () => (await su.query(`select (select count(*)::int from public.users) u, (select count(*)::int from public.clients) c,
        (select count(*)::int from public.user_sessions) s, (select count(*)::int from public.admin_audit_log) a,
        (select count(*)::int from public.tenants) t`)).rows[0];
    const s0 = await snap();

    // ── U) Saf çekirdek ──────────────────────────────────────────────────────
    if (MODE === "new") {
      console.log("\n[U] Saf çekirdek");
      const ar = await import(pathToFileURL(path.join(ROOT, "lib/auth/accessRestriction.ts")).href);
      const core = await import(pathToFileURL(path.join(ROOT, "lib/auth/membershipAccessCore.ts")).href);
      const ex = ar.isAccessRestrictionExemptRequest as (m: string, p: string) => boolean;
      ok(ex("GET", "/api/auth/profile") && ex("get", "/api/auth/profile") && ex("POST", "/api/settings/change-password")
        && ex("GET", "/api/settings/support") && ex("POST", "/api/settings/support") && ex("GET", "/api/trial/status"),
        "açık liste: profil GET · deneme durumu GET · parola POST · destek GET/POST");
      ok(!ex("POST", "/api/auth/profile") && !ex("GET", "/api/settings/change-password") && !ex("DELETE", "/api/settings/support")
        && !ex("GET", "/api/auth/profile/") && !ex("GET", "/API/auth/profile") && !ex("GET", "/api/settings/support/x")
        && !ex("GET", "/api/settings/export") && !ex("POST", "/api/trial/pro-request") && !ex("GET", "/api/auth/profilex") && !ex("GET", "")
        && !ex("GET", "constructor") && !ex("GET", "__proto__"), "açık liste birebir: yöntem / sonda eğik çizgi / büyük harf / alt yol / önek / prototip anahtarı GEÇMEZ");
      const lvl = core.resolveMembershipAccessLevel as (r: Record<string, unknown>) => string;
      const base = { role: "expert", active: true, approval_status: "approved", package_type: "premium" };
      const now = Date.now();
      const trialAct = { ...base, package_type: "trial", trial_kind: "self_7d", trial_status: "active", trial_ends_at: new Date(now + 86_400_000).toISOString() };
      const trialExp = { ...trialAct, trial_ends_at: new Date(now - 86_400_000).toISOString() };
      const R0 = "2028-01-25T00:00:00Z";
      ok(lvl(base) === "full" && lvl({ ...base, access_restricted_at: null }) === "full" && lvl(trialAct) === "full" && lvl(trialExp) === "read_only"
        && lvl({ ...base, active: false }) === "none" && lvl({ role: "admin", active: true }) === "full",
        "kısıtsız satırlarda seviye DEĞİŞMEDİ (premium full · deneme aktif full · deneme bitti read_only · pasif none · admin full)");
      ok(lvl({ ...base, access_restricted_at: R0 }) === "none" && lvl({ ...trialAct, access_restricted_at: R0 }) === "none"
        && lvl({ ...trialExp, access_restricted_at: R0 }) === "none", "kısıtlı: premium / aktif deneme / süresi dolmuş deneme → none (salt-okunur hak da kapanır)");
    }

    // ── W) Tam tarama ────────────────────────────────────────────────────────
    const routes = listRoutes();
    const exemptSet = MODE === "new"
      ? (await import(pathToFileURL(path.join(ROOT, "lib/auth/accessRestriction.ts")).href)).ACCESS_RESTRICTION_EXEMPT as Record<string, string[]>
      : {};
    const results: Record<string, { p?: string; a?: string }> = {};
    const importFail: string[] = [];
    const leak: unknown[] = [];
    const exemptSeen: string[] = [];
    const sameDenyList: string[] = [];
    const sessionEndedBy = new Set<string>();
    const uniform404List: string[] = [];
    const nonGateDataLeak: string[] = [];
    let calls = 0;
    console.log(`\n[W] Tam tarama: ${routes.length} route dosyası (${MODE})`);
    console.log = console.error = console.warn = console.info = () => undefined;
    process.exit = ((c?: number) => { throw new Error(`process.exit(${c}) cagrildi`); }) as typeof process.exit;
    const progress = process.env.PSF3_PROGRESS ?? "";
    for (const r of routes) {
      if (progress) writeFileSync(progress, `${r.route}\n`, { flag: "a" });
      let mod: Record<string, unknown>;
      try { mod = await import(pathToFileURL(r.file).href); } catch (e) { importFail.push(`${r.route}: ${String((e as Error).message).slice(0, 100)}`); continue; }
      for (const m of METHODS) {
        const h = mod[m] as Handler | undefined;
        if (typeof h !== "function") continue;
        const key = `${m} ${r.route}`;
        const url = urlFor(r);
        results[key] = {};
        for (const who of ["p", "a"] as const) {
          calls++;
          let out: string;
          try {
            const res = await call(h, m, url, r.params, who === "p" ? P : A, who === "p" ? TOK.P : TOK.A);
            out = `${res.status}${res.code ? `:${res.code}` : ""}`;
            // Kullanıcı kapısı dışı sınıflar (giriş / oturum / hesap güvenliği / yönetici / herkese açık) pasif uzmana
            // danışan, analiz ya da imzalı dosya bağlantısı DÖNDÜREMEZ.
            if (who === "p" && nonUserGateClass(r.route)) {
              const b = JSON.stringify(res.json ?? {});
              if (b.includes("ZZ Danışan") || /"(clients|analyses)":\s*\[|"(signedUrl|signed_url|downloadUrl)"|\/storage\/v1\/object\/sign/.test(b)) nonGateDataLeak.push(key);
            }
          } catch (e) { out = `EXC:${String((e as Error).message).slice(0, 40)}`; }
          results[key][who] = out;
          // Çıkış / oturum sonlandırma uçları test oturumunu GERÇEKTEN kapatır (oturum modeli v2 yeniden açmayı reddeder)
          // → sonraki çağrılar için YENİ sentetik oturum açılır; kapatan uç kaydedilir. Kısıt / kullanıcı satırı değişmez.
          for (const k of ["P", "A"] as const) {
            const alive = (await su.query(`select is_active from public.user_sessions where session_token=$1`, [TOK[k]])).rows[0]?.is_active;
            if (alive !== true) {
              const t = `zz-psf3-${k.toLowerCase()}-${randomUUID().slice(0, 12)}`;
              await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [k === "P" ? P : A, t]);
              TOK[k] = t;
              sessionEndedBy.add(`${key} (${k})`);
            }
          }
        }
        const cls = nonUserGateClass(r.route);
        const isExempt = (exemptSet[r.route] ?? []).includes(m);
        if (isExempt) exemptSeen.push(key);
        // Pasif uzman, AKTİF uzmanla aynı ret yanıtını alıyorsa (yalnız yönetici ucu / kapalı bayrak / yöntem yok)
        // aktif uzmandan fazla erişimi yoktur → sızıntı değil; ayrıca sayılır ve raporlanır.
        // 204 (gövdesiz no-op; ör. telemetri bayrağı kapalı) ve kimlikten ÖNCE gövde doğrulaması (400; aktif uzmanla
        // birebir aynı yanıt) da veri taşımaz.
        const sameDeny = results[key].p === results[key].a && /^(400|401|403|404|405|204$)/.test(results[key].p ?? "");
        // Astroloji kapısı (requireAstrologyAccess) HER ret nedenini — kısıt dahil — kasıtlı tek tip 404'e çevirir
        // (modül varlığı gizlenir). Nedensellik [S2]'de ayrıca kanıtlanır (kısıt kalkınca aynı uç açılır).
        const uniform404 = results[key].p === "404" && r.route.startsWith("/api/astroloji/");
        if (MODE === "new" && !cls && !isExempt && results[key].p !== "403:ACCOUNT_RESTRICTED") {
          if (sameDeny) sameDenyList.push(`${key}=${results[key].p}`);
          else if (uniform404) uniform404List.push(key);
          else leak.push({ key, p: results[key].p, a: results[key].a });
        }
      }
    }
    Object.assign(console, quiet);
    process.exit = REAL_EXIT;
    notes.push(`W: test oturumunu kapatan uçlar (yeni sentetik oturum açıldı): ${[...sessionEndedBy].join(", ") || "yok"}`);
    const total = Object.keys(results).length;
    const restricted = Object.values(results).filter((v) => v.p === "403:ACCOUNT_RESTRICTED").length;
    const byClass: Record<string, number> = {};
    for (const k of Object.keys(results)) { const c = nonUserGateClass(k.split(" ")[1]) ?? "kullanici"; byClass[c] = (byClass[c] ?? 0) + 1; }
    console.log(`  · ${routes.length} dosya · ${total} yöntem · ${calls} çağrı · sınıflar ${JSON.stringify(byClass)} · ACCOUNT_RESTRICTED=${restricted}`);
    ok(importFail.length === 0, "tüm route modülleri yüklendi (tarama dışı kalan uç yok)", importFail);
    ok(blockedNet.length === 0, "tarama sırasında DIŞ AĞ çağrısı denenmedi (Roxy / e-posta / Turnstile yok)", blockedNet.slice(0, 10));
    ok(nonGateDataLeak.length === 0, "kullanıcı kapısı dışı uçlar (giriş / oturum / hesap güvenliği / yönetici / herkese açık): pasif uzmana danışan, analiz veya dosya bağlantısı YOK", nonGateDataLeak);
    const activeRestricted = Object.entries(results).filter(([, v]) => v.a === "403:ACCOUNT_RESTRICTED").map(([k]) => k);
    ok(activeRestricted.length === 0, "aktif uzman: HİÇBİR uçta ACCOUNT_RESTRICTED yok", activeRestricted.slice(0, 10));

    if (MODE === "new") {
      ok(leak.length === 0, `kapalı-başlangıç: kullanıcı uçlarının TAMAMI (açık liste hariç) pasif uzmana 403 ACCOUNT_RESTRICTED (${restricted} yöntem)`, leak.slice(0, 25));
      const expectedExempt = Object.entries(exemptSet).flatMap(([p, ms]) => ms.map((m) => `${m} ${p}`)).sort();
      ok(JSON.stringify([...exemptSeen].sort()) === JSON.stringify(expectedExempt), "açık listedeki her uç gerçekten mevcut ve taramada görüldü", { exemptSeen, expectedExempt });
      const exemptPass = expectedExempt.filter((k) => results[k]?.p === "403:ACCOUNT_RESTRICTED");
      ok(exemptPass.length === 0, "açık liste uçları pasif uzmana kapalı DEĞİL", exemptPass);
      notes.push(`W: astroloji tek tip 404 ile reddedilen (aktif uzman işleme giriyor): ${uniform404List.length} yöntem`);
      if (uniform404List.length) {
        const astro = (await import(pathToFileURL(path.join(ROOT, "app/api/astroloji/access/route.ts")).href)) as Record<string, Handler>;
        const u = "http://localhost/api/astroloji/access";
        const x1 = await call(astro.GET, "GET", u, {}, P, TOK.P);
        await su.query(`select public.admin_set_member_access_restriction($1,$2,false,true)`, [P, OWNER]);
        const x2 = await call(astro.GET, "GET", u, {}, P, TOK.P);
        await su.query(`select public.admin_set_member_access_restriction($1,$2,true,false)`, [P, OWNER]);
        const x3 = await call(astro.GET, "GET", u, {}, P, TOK.P);
        ok(x1.status === 404 && x2.status === 200 && x3.status === 404,
          "[S2] astroloji 404'ü KISIT kaynaklı: aynı uç kısıt kalkınca 200, geri konunca yine 404", { x1: x1.status, x2: x2.status, x3: x3.status });
      }
      if (FLAGS) {
        const bc = (await import(pathToFileURL(path.join(ROOT, "app/api/usage/beacon/route.ts")).href)) as Record<string, Handler>;
        const u = "http://localhost/api/usage/beacon";
        const bp = await call(bc.POST, "POST", u, {}, P, TOK.P, { kind: "ping" });
        const ba = await call(bc.POST, "POST", u, {}, A, TOK.A, { kind: "ping" });
        ok(bp.status === 403 && bp.code === "ACCOUNT_RESTRICTED" && ba.status === 204,
          "[S2] kullanım telemetrisi (geçerli gövde): pasif uzman 403 ACCOUNT_RESTRICTED, aktif uzman 204", { bp: bp.status, ba: ba.status });
      }
      notes.push(`W: aktif uzmanla AYNI ret (ek erişim yok): ${sameDenyList.length} yöntem — ${[...new Set(sameDenyList.map((x) => `${x.split(" ")[1].split("/").slice(0, 4).join("/")}=${x.split("=")[1]}`))].join(", ")}`);
      const nonGateRestricted = Object.entries(results).filter(([k, v]) => nonUserGateClass(k.split(" ")[1]) && v.p === "403:ACCOUNT_RESTRICTED").map(([k]) => k);
      notes.push(`W: kullanıcı-kapısı-dışı sınıflardan ACCOUNT_RESTRICTED dönen: ${nonGateRestricted.length} (beklenen 0 değil ise kapı oralara da uygulanıyor demektir: ${nonGateRestricted.slice(0, 5).join(", ")})`);
      const nonGate = Object.entries(results).filter(([k]) => nonUserGateClass(k.split(" ")[1]))
        .filter(([, v]) => /^2/.test(v.p ?? "")).map(([k, v]) => `${k}=${v.p}`);
      notes.push(`W: kullanıcı kapısı dışı sınıflarda pasif kimliğiyle 2xx: ${nonGate.length ? nonGate.join(" | ") : "yok"}`);
    }
    if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
    if (process.env.PSF3_COMPARE && existsSync(process.env.PSF3_COMPARE)) {
      const other = JSON.parse(readFileSync(process.env.PSF3_COMPARE, "utf8")) as Record<string, { p?: string; a?: string }>;
      const diff = Object.keys({ ...other, ...results }).filter((k) => other[k]?.a !== results[k]?.a).map((k) => `${k}: main=${other[k]?.a} yeni=${results[k]?.a}`);
      ok(diff.length === 0, `aktif uzman: ${Object.keys(results).length} yöntemin TAMAMINDA durum kodu main (baseline) ile BİREBİR`, diff.slice(0, 20));
      const pBefore = Object.entries(other).filter(([k, v]) => !nonUserGateClass(k.split(" ")[1]) && /^2/.test(v.p ?? "")).length;
      notes.push(`A: main kodunda (F3 öncesi) pasif işaretli uzman ${pBefore} kullanıcı ucunda 2xx alıyordu → F3 bunları kapatır`);
    }

    // ── S/E/T) Mevcut oturum, açık liste işlevleri, izolasyon ───────────────
    if (MODE === "new") {
      const imp = async (rel: string) => (await import(pathToFileURL(path.join(ROOT, "app/api", rel, "route.ts")).href)) as Record<string, Handler>;
      const clientsMod = await imp("clients");
      const profileMod = await imp("auth/profile");
      const supportMod = await imp("settings/support");
      const statusMod = await imp("trial/status");
      const pwMod = await imp("settings/change-password");
      const exportMod = await imp("settings/export");
      const core = await import(pathToFileURL(path.join(ROOT, "lib/auth/membershipAccessCore.ts")).href);

      console.log("\n[S] Mevcut oturum");
      const c1 = await call(clientsMod.GET, "GET", "http://localhost/api/clients", {}, P, TOK.P);
      const tokAlive = (await su.query(`select is_active from public.user_sessions where session_token=$1`, [TOK.P])).rows[0].is_active;
      ok(c1.status === 403 && c1.code === "ACCOUNT_RESTRICTED" && tokAlive === true, "kısıt oturum AÇIKKEN konuldu: aynı token ile danışan listesi 403; oturum kapatılmadı", { c1: c1.status, tokAlive });
      await su.query(`select public.admin_set_member_access_restriction($1,$2,false,true)`, [P, OWNER]);
      const c2 = await call(clientsMod.GET, "GET", "http://localhost/api/clients", {}, P, TOK.P);
      ok(c2.status !== 403, "kısıt kaldırıldı: AYNI token ile yeniden giriş gerekmeden erişim döndü", { c2: `${c2.status}:${c2.code}` });
      await su.query(`select public.admin_set_member_access_restriction($1,$2,true,false)`, [P, OWNER]);
      const c3 = await call(exportMod.GET ?? exportMod.POST, exportMod.GET ? "GET" : "POST", "http://localhost/api/settings/export", {}, P, TOK.P);
      ok(c3.status === 403 && c3.code === "ACCOUNT_RESTRICTED", "yeniden pasif: dışa aktarma aynı oturumda anında 403", { c3: c3.status });

      console.log("\n[E] Açık liste işlevleri");
      const pr = await call(profileMod.GET, "GET", "http://localhost/api/auth/profile", {}, P, TOK.P);
      const prof = (pr.json?.profile ?? {}) as Record<string, unknown>;
      ok(pr.status === 200 && typeof prof.access_restricted_at === "string" && core.resolveMembershipAccessLevel(prof) === "none"
        && !("password_hash" in prof), "profil: 200; kısıt bilgisi var; üyelik seviyesi none; parola özeti yok", { st: pr.status, keys: Object.keys(prof).length });
      const prA = await call(profileMod.GET, "GET", "http://localhost/api/auth/profile", {}, A, TOK.A);
      const profA = (prA.json?.profile ?? {}) as Record<string, unknown>;
      ok(prA.status === 200 && profA.access_restricted_at === null && core.resolveMembershipAccessLevel(profA) === "full", "aktif uzman profili: kısıt null, seviye full");
      const ts = await call(statusMod.GET, "GET", "http://localhost/api/trial/status", {}, PT, TOK.PT);
      ok(ts.status === 200, "deneme durumu (pasif deneme uzmanı): 200", { st: ts.status, code: ts.code });
      const sp = await call(supportMod.POST, "POST", "http://localhost/api/settings/support", {}, P, TOK.P, { subject: "ZZ P konu", message: "ZZ P mesaj" });
      const sg = await call(supportMod.GET, "GET", "http://localhost/api/settings/support", {}, P, TOK.P);
      const msgs = (sg.json?.messages ?? []) as { subject?: string }[];
      ok(/^2/.test(String(sp.status)) && sg.status === 200 && msgs.length === 1 && msgs[0].subject === "ZZ P konu",
        "destek: pasif uzman mesaj gönderir ve YALNIZ kendi mesajını görür (A'nın mesajı yok)", { sp: sp.status, sg: sg.status, n: msgs.length });
      const pw = await call(pwMod.POST, "POST", "http://localhost/api/settings/change-password", {}, P, TOK.P, { oldPassword: PASSWORD, newPassword: "Zz-Yeni-Parola-42" });
      if (loginReady) {
        ok(pw.status === 200, "parola değişikliği: pasif uzman kendi parolasını değiştirir (200; yeni parolayla giriş [G]'de doğrulanır)", { pw: `${pw.status}:${pw.code}`, err: pw.json?.error });
      } else {
        ok(pw.code !== "ACCOUNT_RESTRICTED", "parola değişikliği kapıdan geçer (giriş RPC'si yok → yalnız kapı kanıtı)", { pw: pw.status });
      }

      console.log("\n[E2] Onaylı güvenlik istisnaları (oturum yönetimi, çıkış) — danışan / modül verisi YOK");
      const meMod = await imp("me/sessions");
      const meIdMod = await imp("me/sessions/[id]");
      const sessMod = await imp("auth/session");
      const t2 = "zz-psf3-p-ikinci-0001";
      const t3 = "zz-psf3-p-ucuncu-0001";
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($1,$3)`, [P, t2, t3]);
      const ms = await call(meMod.GET, "GET", "http://localhost/api/me/sessions", {}, P, TOK.P);
      const sessList = (ms.json?.sessions ?? []) as Record<string, unknown>[];
      const msBody = JSON.stringify(ms.json ?? {});
      ok(ms.status === 200 && sessList.length >= 3 && !msBody.includes("ZZ Danışan") && !msBody.includes(t2)
        && sessList.every((s) => !("module_permissions" in s) && !("tenant_id" in s)),
        "kendi oturumlarını görüntüler (200); yanıtta danışan verisi, ham token veya üyelik alanı YOK", { st: ms.status, n: sessList.length });
      const sid = (await su.query(`select id from public.user_sessions where session_token=$1`, [t2])).rows[0].id as string;
      const md = await call(meIdMod.DELETE, "DELETE", `http://localhost/api/me/sessions/${sid}`, { id: sid }, P, TOK.P);
      const t2Active = (await su.query(`select is_active from public.user_sessions where session_token=$1`, [t2])).rows[0].is_active;
      ok(md.status === 200 && t2Active === false, "kendi diğer oturumunu sonlandırır (200; oturum kapandı)", { md: md.status, t2Active });
      const other = (await su.query(`select id from public.user_sessions where session_token=$1`, [TOK.A])).rows[0].id as string;
      const mdOther = await call(meIdMod.DELETE, "DELETE", `http://localhost/api/me/sessions/${other}`, { id: other }, P, TOK.P);
      const aAlive = (await su.query(`select is_active from public.user_sessions where session_token=$1`, [TOK.A])).rows[0].is_active;
      ok(mdOther.status >= 400 && aAlive === true, "başka uzmanın oturumunu sonlandıramaz (tenant / kullanıcı izolasyonu)", { st: mdOther.status, aAlive });
      const chk = await call(sessMod.GET, "GET", "http://localhost/api/auth/session", {}, P, TOK.P);
      ok(chk.status === 200 && chk.json?.valid === true, "oturum kontrolü (GET /api/auth/session): geçerli", { st: chk.status, v: chk.json?.valid });
      const out = await call(sessMod.DELETE, "DELETE", "http://localhost/api/auth/session", {}, P, t3);
      const t3Active = (await su.query(`select is_active from public.user_sessions where session_token=$1`, [t3])).rows[0].is_active;
      const afterOut = await call(clientsMod.GET, "GET", "http://localhost/api/clients", {}, P, t3);
      ok(out.status === 200 && t3Active === false && afterOut.status === 401, "güvenli çıkış: oturum kapanır, aynı token ile sonraki istek 401", { out: out.status, t3Active, after: afterOut.status });
      const exemptBodies = [pr, ts, sg].map((x) => JSON.stringify(x.json ?? {})).join("|");
      // Veri = danışan adı, danışan/analiz DİZİSİ ya da imzalı bağlantı. (module_permissions içindeki "clients":true izin
      // bayrağıdır, veri değildir.)
      ok(!exemptBodies.includes("ZZ Danışan") && !/"(clients|analyses)":\s*\[|"(signedUrl|signed_url|downloadUrl)"|\/storage\/v1\/object\/sign/.test(exemptBodies),
        "açık liste yanıtlarında (profil / deneme durumu / destek) danışan, analiz veya dosya bağlantısı YOK");

      console.log("\n[T] Tenant izolasyonu");
      const spoof = await call(clientsMod.GET, "GET", "http://localhost/api/clients", {}, A, TOK.P);
      const spoof2 = await call(supportMod.GET, "GET", "http://localhost/api/settings/support", {}, A, TOK.P);
      ok(spoof.status === 403 && spoof2.status === 403, "pasif uzmanın token'ı + aktif uzmanın kimliği → 403 (token bağlama; kısıt atlatılamaz)", { spoof: spoof.status, spoof2: spoof2.status });
      const ca = await call(clientsMod.GET, "GET", "http://localhost/api/clients", {}, A, TOK.A);
      const body = JSON.stringify(ca.json ?? {});
      ok(ca.status === 200 && body.includes("ZZ Danışan a") && !body.includes("ZZ Danışan p") && !body.includes("ZZ Danışan pt"),
        "aktif uzman danışan listesi: yalnız kendi tenant'ı (pasif uzmanın danışanları görünmez)", { st: ca.status });

      console.log("\n[G] Giriş");
      if (loginReady) {
        const sessionMod = await imp("auth/session");
        const login = async (email: string) => {
          const req = new NextRequest("http://localhost/api/auth/session", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 200)}.1` },
            body: JSON.stringify({ email, password: email.includes(".p@") ? "Zz-Yeni-Parola-42" : PASSWORD }) });
          const res = await (sessionMod.POST as unknown as (r: NextRequest) => Promise<Response>)(req);
          return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
        };
        const lp = await login("zz.psf3.p@example.test");
        ok(lp.status === 200 && typeof lp.json.sessionToken === "string", "pasif uzman giriş yapabilir (oturum oluştu)", { st: lp.status, code: lp.json.code });
        const lr = await login("zz.psf3.r@example.test");
        const ll = await login("zz.psf3.l@example.test");
        ok(lr.status === 403 && lr.json.code === "INACTIVE" && ll.status === 403 && ll.json.code === "INACTIVE",
          "arşivdeki ve girişi kapalı uzman giriş YAPAMAZ (403 INACTIVE)", { lr: lr.status, ll: ll.status });
        if (lp.status === 200) {
          const fresh = String(lp.json.sessionToken);
          const nf = await call(clientsMod.GET, "GET", "http://localhost/api/clients", {}, P, fresh);
          ok(nf.status === 403 && nf.code === "ACCOUNT_RESTRICTED", "pasif uzmanın YENİ oturumu da modüllerde 403", { nf: nf.status });
        }
      }
      const rOld = await call(clientsMod.GET, "GET", "http://localhost/api/clients", {}, R, TOK.R);
      ok(rOld.status === 401 || rOld.status === 403, "arşivlenmiş uzmanın eski oturumu reddedilir", { rOld: rOld.status });
    }

    // ── D) Silme yok ─────────────────────────────────────────────────────────
    const s1 = await snap();
    ok(s1.u === s0.u && s1.c >= s0.c && s1.t === s0.t, "kullanıcı / danışan / tenant satırı silinmedi", { s0, s1 });
    const archived = (await su.query(`select active, archived_at is not null arch from public.users where id=$1`, [R])).rows[0];
    ok(archived.active === false && archived.arch === true, "arşivdeki uzman arşivde ve pasif kaldı");
  } finally {
    Object.assign(console, quiet);
    process.exit = REAL_EXIT;
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nNOTLAR:\n${notes.map((n) => `  - ${n}`).join("\n") || "  (yok)"}`);
  console.log(`\nSONUÇ (${MODE}${FLAGS ? "+bayraklar" : ""}): ${pass} PASS / ${fail} FAIL`);
  if (fail) console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.log = console.error;
  console.error(e);
  process.exit(1);
});
