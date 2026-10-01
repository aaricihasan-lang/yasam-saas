/**
 * ÜYE YÖNETİMİ FAZ 1 — ROUTE ENTEGRASYON HARNESS (gerçek route handler + gerçek PostgreSQL).
 *
 * - Ephemeral yerel PostgreSQL (embedded-postgres, 127.0.0.1) — production'a SIFIR temas.
 * - Şema: sentetik users/user_sessions/user_payment_history/yasam_hafizasi_flags + repo
 *   migration'ları (admin_audit_log, yh_grade, Aşama 1 RPC'leri, FAZ 1 20270128, FAZ 2
 *   20270130 admin_list_users, AŞAMA 2 M4 20271001000300 — M4 iki kez: idempotent).
 * - AŞAMA 2 kapsamı: [K] P1-7 hesap devralma kapanışı (şifre / e-posta / lisans-güvenlik /
 *   tekil oturum / viewer.isMainAdmin) · [L] M4 ödeme route sertleştirme · [M] yenileme
 *   filtresi + sıralama + sayaçlar (admin_list_users p_due/p_sort, /api/admin/metrics).
 * - Gerçek Next route handler'ları (app/api/admin/users/…) supabase-js service-role client ile,
 *   test-only PostgREST shim üzerinden (scripts/uye-yonetimi-faz1/pgrestShim.ts) çalışır.
 * - Tüm kullanıcılar sentetik: ZZ_MEMBER_PHASE1_* (gerçek üye verisi YOK).
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-faz1/route-integration.harness.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "./pgrestShim";

process.env.LC_ALL = "C";
process.env.LANG = "C";
// PostgREST `date` kolonlarını "YYYY-MM-DD" metni olarak döner; shim (node-pg) da aynısını yapsın.
pg.types.setTypeParser(1082, (v: string) => v);

const DATA_DIR = path.join(os.tmpdir(), "uye-yonetimi-faz1-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* temiz başlangıç */ }
const PORT = 54341;
const PW = "testpw";
const ROOT = process.cwd();
const readMig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

const USERS_DDL = `
create table public.users (
  id uuid primary key,
  full_name text, name text, email text, password_hash text, role text,
  active boolean default false,
  approval_status text default 'pending',
  approved_at timestamptz,
  module_permissions jsonb default '{}'::jsonb,
  package_type text, membership_status text, subscription_status text,
  trial_started_at timestamptz, trial_ends_at timestamptz,
  membership_started_at timestamptz, membership_ends_at timestamptz,
  plan text, admin_level text, tenant_id uuid, status text,
  created_at timestamptz default now(),
  is_super_admin boolean not null default false,
  is_demo_account boolean not null default false,
  payment_status text, last_payment_date date, next_payment_date date, paid_amount numeric, payment_note text,
  license_type text default 'single', allowed_active_sessions int default -1, allowed_locations int default 1,
  security_mode text default 'normal', security_exempt boolean default false, license_note text,
  allowed_desktop_sessions int default -1, allowed_mobile_sessions int default -1,
  allowed_tablet_sessions int default -1, allowed_unknown_sessions int default -1,
  constraint chk_users_session_limits_range check (
    allowed_active_sessions between -1 and 10000 and allowed_desktop_sessions between -1 and 10000 and
    allowed_mobile_sessions between -1 and 10000 and allowed_tablet_sessions between -1 and 10000 and
    allowed_unknown_sessions between -1 and 10000)
);
create unique index users_email_normalized_uidx on public.users (lower(btrim(email)));
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  session_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz, end_reason text,
  platform text default 'desktop', city text, country text, ip_address text, user_agent text
);
create table public.user_payment_history (
  id uuid primary key default gen_random_uuid(), user_id uuid, payment_status text,
  payment_date date, next_payment_date date, paid_amount numeric, payment_note text,
  created_at timestamptz default now()
);
create table public.yasam_hafizasi_flags (
  tenant_id uuid primary key, yh_enabled boolean default false, yh_hizli boolean default false, yh_shared boolean default false
);
create table public.security_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  event_type text not null, severity text not null, created_at timestamptz not null default now()
);
-- Test-stub: bcrypt yerine deterministik (yalnız test).
create function public.hash_password(p_plain text) returns text language sql immutable as $$ select 'zz-test-hash:' || md5(p_plain) $$;
create function public.verify_admin_login(p_email text, p_password text) returns boolean
  language sql security definer set search_path = public as
  $$ select p_password = 'zz-owner-pass' and exists (select 1 from public.users where lower(email) = lower(p_email) and role = 'admin') $$;
revoke all on function public.verify_admin_login(text, text) from public;
`;

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000000a2";
const TOK = { owner: "zz-tok-owner-0001", admin2: "zz-tok-admin2-0001" };

type Client = pg.Client;

async function main(): Promise<void> {
  const epg = new EmbeddedPostgres({
    databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"],
  });
  await epg.initialise();
  await epg.start();
  const su: Client = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
  await su.connect();
  const pool = new pg.Pool({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres", max: 24 });
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;

  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
                    grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(USERS_DDL);
    await su.query(readMig("20260903000000_admin_audit_log.sql"));
    // Oturum süresi RPC'si (touch_active_session) — süre zorlaması varsayılan AÇIK (P1-3) olduğundan
    // admin/uzman guard'ları bu RPC'yi kullanır (fail-closed).
    await su.query(readMig("20270129000200_user_sessions_expiry_touch.sql"));
    await su.query(readMig("20261221000000_yh_grade_expert_premium_rpc.sql"));
    await su.query(readMig("20270107000000_admin_membership_atomic_rpcs.sql"));
    await su.query(readMig("20270129235900_admin_member_phase1_hardening.sql"));
    await su.query(readMig("20270130000000_admin_member_phase2.sql"));
    // AŞAMA 2 · M4 — iki kez uygulanır (idempotent olmalı).
    await su.query(readMig("20271001000300_admin_member_commercial.sql"));
    await su.query(readMig("20271001000300_admin_member_commercial.sql"));
    await su.query(`grant select, insert, update on public.users, public.user_sessions, public.user_payment_history, public.yasam_hafizasi_flags to service_role;
                    grant select on public.security_events to service_role;
                    grant execute on function public.verify_admin_login(text, text), public.hash_password(text) to service_role;`);

    const T_OWNER = randomUUID();
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id)
       values ($1,'ZZ_MEMBER_PHASE1_OWNER','zz.member.phase1.owner@example.test','admin',true,'approved',true,$3),
              ($2,'ZZ_MEMBER_PHASE1_ADMIN2','zz.member.phase1.admin2@example.test','admin',true,'approved',false,$3)`,
      [OWNER, ADMIN2, T_OWNER],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2]);

    shim = await startPgrestShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    console.log(`embedded-postgres + PostgREST shim hazır (${shim.url}).\n`);

    const userRoute = await import("../../app/api/admin/users/[id]/route");
    const statusRoute = await import("../../app/api/admin/users/[id]/status/route");
    const packageRoute = await import("../../app/api/admin/users/[id]/package/route");
    const deleteRoute = await import("../../app/api/admin/users/[id]/delete/route");
    const sessionsRoute = await import("../../app/api/admin/users/[id]/active-sessions/route");
    const passwordRoute = await import("../../app/api/admin/users/[id]/password/route");
    const singleSessionRoute = await import("../../app/api/admin/users/[id]/sessions/[sessionId]/route");
    const paymentRoute = await import("../../app/api/admin/users/[id]/payment/route");
    const paymentHistoryRoute = await import("../../app/api/admin/users/[id]/payment-history/route");
    const listRoute = await import("../../app/api/admin/users/route");
    const metricsRoute = await import("../../app/api/admin/metrics/route");
    const { verifyUserRequest } = await import("../../lib/auth/userGuard");
    const { mapDbUser, paymentSnapshotToEditDraft } = await import("../../lib/admin/userManagement");
    const { istanbulTodayIso, addBillingPeriod, renewalState } = await import("../../lib/admin/memberCommercial");
    const { resolveModuleAccess } = await import("../../lib/auth/moduleAccessCore");
    const { hasExpertMembershipAccess } = await import("../../lib/auth/membership");
    const { parseLoginUserRecord } = await import("../../lib/auth/yasamUser");

    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    type Auth = { adminId?: string; token?: string };
    const asOwner: Auth = { adminId: OWNER, token: TOK.owner };
    const asAdmin2: Auth = { adminId: ADMIN2, token: TOK.admin2 };

    async function call(
      handler: Handler, method: string, id: string, auth: Auth,
      body?: unknown, opts?: { rawBody?: string; contentType?: string },
    ): Promise<{ status: number; json: Record<string, unknown> }> {
      const headers: Record<string, string> = {};
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      const hasBody = body !== undefined || opts?.rawBody !== undefined;
      if (hasBody) headers["content-type"] = opts?.contentType ?? "application/json";
      const req = new NextRequest(`http://localhost/api/admin/users/${id}`, {
        method, headers, body: hasBody ? (opts?.rawBody ?? JSON.stringify(body)) : undefined,
      });
      const res = await handler(req, { params: Promise.resolve({ id }) });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
      return { status: res.status, json };
    }

    async function makeUser(o: {
      label: string; role?: string; approval?: string; active?: boolean;
      perms?: Record<string, unknown>; pkg?: string | null; plan?: string | null;
      limits?: Partial<Record<"total" | "desktop" | "mobile" | "tablet" | "unknown", number>>;
      exempt?: boolean;
    }): Promise<string> {
      const id = randomUUID();
      const l = o.limits ?? {};
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions,
            package_type, plan, tenant_id, allowed_active_sessions, allowed_desktop_sessions,
            allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions, security_exempt)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, `ZZ_MEMBER_PHASE1_${o.label}`, `zz.member.phase1.${o.label.toLowerCase()}.${id.slice(0, 8)}@example.test`,
          o.role ?? "expert", o.active ?? false, o.approval ?? "pending", JSON.stringify(o.perms ?? {}),
          o.pkg ?? null, o.plan ?? null, randomUUID(), l.total ?? -1, l.desktop ?? -1, l.mobile ?? -1,
          l.tablet ?? -1, l.unknown ?? -1, o.exempt === true],
      );
      return id;
    }
    const row = async (id: string) => (await su.query(`select * from public.users where id=$1`, [id])).rows[0];
    const audits = async (id: string) =>
      (await su.query(`select action, old_value, new_value, context from public.admin_audit_log where target_user_id=$1 order by created_at, id`, [id])).rows;
    const newSession = async (userId: string) => {
      const token = `zz-tok-${randomUUID()}`;
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [userId, token]);
      return token;
    };
    const userGuardStatus = async (userId: string, token: string) => {
      const r = await verifyUserRequest(new NextRequest("http://localhost/api/x", { headers: { "x-user-id": userId, "x-session-token": token } }));
      return r.ok ? 200 : r.response.status;
    };

    // ── A. AUTH REGRESSION ────────────────────────────────────────────────────
    console.log("[A] Admin yetkilendirme regresyonu (6 uç × 4 negatif + pozitif)");
    const E_AUTH = await makeUser({ label: "AUTH_EXPERT", approval: "approved", active: true, pkg: "premium", plan: "premium" });
    const expertTok = await newSession(E_AUTH);
    const targets: [string, Handler, string, unknown][] = [
      ["GET user", userRoute.GET as Handler, "GET", undefined],
      ["PATCH user", userRoute.PATCH as Handler, "PATCH", { action: "modules", changes: { numerology: true } }],
      ["POST status", statusRoute.POST as Handler, "POST", { action: "reject" }],
      ["POST package", packageRoute.POST as unknown as Handler, "POST", { packagePlan: "premium" }],
      ["POST delete", deleteRoute.POST as Handler, "POST", { adminPassword: "zz-owner-pass" }],
      ["GET active-sessions", sessionsRoute.GET as Handler, "GET", undefined],
    ];
    const negatives: [string, Auth][] = [
      ["tokensız", { adminId: OWNER }],
      ["uzman token", { adminId: E_AUTH, token: expertTok }],
      ["uzman token + admin ID spoof", { adminId: OWNER, token: expertTok }],
      ["geçersiz token", { adminId: OWNER, token: "zz-bogus-token" }],
    ];
    let authMatrixOk = 0, authMatrixTotal = 0;
    for (const [name, h, method, body] of targets) {
      for (const [neg, auth] of negatives) {
        const r = await call(h, method, E_AUTH, auth, body);
        authMatrixTotal++;
        if (r.status === 401 || r.status === 403) authMatrixOk++;
        else console.error(`     ${name} / ${neg} → ${r.status}`);
      }
    }
    ok(authMatrixOk === authMatrixTotal, `negatif matris ${authMatrixOk}/${authMatrixTotal} → 401/403`);
    const r0 = await row(E_AUTH);
    ok(r0.active === true && r0.approval_status === "approved" && JSON.stringify(r0.module_permissions) === "{}",
      "negatif isteklerden sonra hedef satır DEĞİŞMEDİ");
    const posGet = await call(userRoute.GET as Handler, "GET", E_AUTH, asOwner);
    ok(posGet.status === 200, "doğru admin token → GET 200");
    const noHash = !JSON.stringify(posGet.json).match(/password|session_token/i);
    ok(noHash, "GET yanıtında parola/token alanı yok");

    // ── J. INPUT VALIDATION (MEM-011) ──────────────────────────────────────────
    console.log("\n[J] Girdi doğrulama");
    ok((await call(userRoute.PATCH as Handler, "PATCH", "not-a-uuid", asOwner, { action: "edit" })).status === 400, "geçersiz UUID → 400 (PATCH)");
    ok((await call(statusRoute.POST as Handler, "POST", "123", asOwner, { action: "reject" })).status === 400, "geçersiz UUID → 400 (status)");
    ok((await call(userRoute.GET as Handler, "GET", "abc", asOwner)).status === 400, "geçersiz UUID → 400 (GET)");
    ok((await call(userRoute.PATCH as Handler, "PATCH", E_AUTH, asOwner, undefined, { rawBody: "{bozuk" })).status === 400, "bozuk JSON → 400 (PATCH)");
    ok((await call(statusRoute.POST as Handler, "POST", E_AUTH, asOwner, undefined, { rawBody: "{\"action\":" })).status === 400, "bozuk JSON → 400 (status)");
    ok((await call(userRoute.PATCH as Handler, "PATCH", E_AUTH, asOwner, undefined, { rawBody: "{}", contentType: "text/plain" })).status === 400, "yanlış content-type → 400");
    ok((await call(userRoute.PATCH as Handler, "PATCH", E_AUTH, asOwner, { action: "hack" })).status === 400, "bilinmeyen action → 400");
    ok((await call(statusRoute.POST as Handler, "POST", E_AUTH, asOwner, { action: "promote" })).status === 400, "bilinmeyen status action → 400");
    ok((await call(userRoute.PATCH as Handler, "PATCH", E_AUTH, asOwner, undefined, { rawBody: JSON.stringify({ action: "edit", fullName: "x".repeat(9000) }) })).status === 413, "aşırı büyük gövde → 413");

    // ── B. APPROVAL + MODÜL SEÇİMİ (MEM-004) ──────────────────────────────────
    console.log("\n[B] Onay + modül seçimi");
    const P1 = await makeUser({ label: "PENDING_A", perms: { dogaltas: true, some_capability_x: true }, pkg: "trial", plan: "trial" });
    const sessP1 = await newSession(P1);
    const bad1 = await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "approve" });
    ok(bad1.status === 400, "modules alanı yok → 400");
    ok((await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "approve", modules: [], expectedApproval: "pending" })).status === 400, "boş modül listesi → 400");
    ok((await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "approve", modules: ["is_admin"], expectedApproval: "pending" })).status === 400, "bilinmeyen modül → 400");
    ok((await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "approve", modules: ["yasam_hafizasi"], expectedApproval: "pending" })).status === 400, "yasam_hafizasi seçilemez → 400");
    ok((await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "approve", modules: ["digital_content"], expectedApproval: "pending" })).status === 400, "yalnız hub kartı (gerçek modül yok) → 400");
    ok((await row(P1)).approval_status === "pending" && (await audits(P1)).length === 0, "modülsüz denemeler hiçbir şey yazmadı (pending, 0 audit)");
    const appr = await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "approve", modules: ["numerology", "human_design", "cosmic_calendar"], expectedApproval: "pending" });
    ok(appr.status === 200 && appr.json.moduleCount === 3, "seçili 3 modül → 200 + moduleCount=3");
    const p1 = await row(P1);
    ok(p1.approval_status === "approved" && p1.active === true, "approved + active");
    ok(p1.package_type === "premium" && p1.plan === "premium", "Premium (package_type + plan)");
    const p1m = p1.module_permissions as Record<string, unknown>;
    ok(p1m.numerology === true && p1m.human_design === true && p1m.cosmic_calendar === true, "seçilen modüller açık (HD + Kozmik dahil)");
    ok(["clients", "stones", "cupping", "beslenme", "reflexology"].every((k) => p1m[k] === false), "seçilmeyen modüller KAPALI (false)");
    ok(!("dogaltas" in p1m), "eski TR alias (dogaltas=true) kaldırıldı → Doğaltaş gizlice açık kalmaz");
    ok(resolveModuleAccess("expert", p1m, "stones") === false && resolveModuleAccess("expert", p1m, "human_design") === true, "server kapısı: stones YOK, human_design VAR");
    ok(p1m.some_capability_x === true, "UI dışı yetenek bayrağı KORUNDU");
    ok(p1.approved_at !== null && p1.membership_started_at !== null, "approved_at + membership_started_at yazıldı");
    const a1 = await audits(P1);
    const apprAudit = a1.find((a) => a.action === "user_approved");
    ok(!!apprAudit && apprAudit.context.module_count === 3 && Array.isArray(apprAudit.context.modules), "user_approved audit: modül listesi + sayısı");
    ok(apprAudit?.context.revoked_session_count === 1, "onay öncesi kalan oturum iptal edildi (audit context)");
    ok((await userGuardStatus(P1, sessP1)) === 401, "pending döneminden kalan token onaydan sonra GEÇERSİZ");
    const firstStart = p1.membership_started_at, firstApprovedAt = p1.approved_at;
    const re = await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "approve", modules: ["clients"], expectedApproval: "pending" });
    ok(re.status === 409, "onaylı uzmanı yeniden onaylama → 409");
    const p1b = await row(P1);
    ok(String(p1b.membership_started_at) === String(firstStart) && String(p1b.approved_at) === String(firstApprovedAt), "re-approve membership_started_at/approved_at'i YAZMADI");
    ok((await audits(P1)).filter((a) => a.action === "user_approved").length === 1, "re-approve ek audit YAZMADI");
    ok((p1b.module_permissions as Record<string, unknown>).clients === false, "re-approve modülleri değiştirmedi");
    const mapped = mapDbUser(p1b);
    ok(mapped.membershipDisplay.packageLabel === "Premium" && mapped.membershipDisplay.statusLabel === "Aktif", "gösterge: Paket=Premium, Hesap=Aktif");

    // ── C. REJECT (MEM-003) ──────────────────────────────────────────────────
    console.log("\n[C] Ret");
    const R1 = await makeUser({ label: "PENDING_REJ" });
    const rej = await call(statusRoute.POST as Handler, "POST", R1, asOwner, { action: "reject" });
    const r1 = await row(R1);
    ok(rej.status === 200 && r1.approval_status === "rejected" && r1.active === false, "pending → reject → rejected + pasif");
    ok((await audits(R1)).some((a) => a.action === "user_rejected"), "user_rejected audit");
    ok((await call(statusRoute.POST as Handler, "POST", R1, asOwner, { action: "reject" })).status === 409, "zaten reddedilmiş → tekrar reddet 409");
    const rejApproved = await call(statusRoute.POST as Handler, "POST", P1, asOwner, { action: "reject" });
    const p1c = await row(P1);
    ok(rejApproved.status === 409 && p1c.approval_status === "approved" && p1c.active === true, "ONAYLI uzmanı reddetme → 409, durum DEĞİŞMEDİ");
    ok((await audits(P1)).every((a) => a.action !== "user_rejected"), "onaylı üyeye ret audit'i yazılmadı");
    ok((await call(statusRoute.POST as Handler, "POST", R1, asOwner, { action: "toggle_active", currentActive: false })).status === 409, "reddedilmiş uzmanı 'Aktif Yap' → 409 (önce onay)");
    ok((await call(statusRoute.POST as Handler, "POST", R1, asOwner, { action: "approve", modules: ["clients"] })).status === 400, "approve: expectedApproval yok → 400");
    const staleAppr = await call(statusRoute.POST as Handler, "POST", R1, asOwner, { action: "approve", modules: ["clients"], expectedApproval: "pending" });
    ok(staleAppr.status === 409 && (await row(R1)).approval_status === "rejected", "bayat ekran: az önce reddedilen uzmana 'pending' sanılarak Onayla → 409, yeniden onay YOK");
    ok((await row(R1)).active === false, "reddedilmiş uzman pasif kaldı");

    // ── D. SESSION REVOKE (MEM-006) ──────────────────────────────────────────
    console.log("\n[D] Oturum iptali — ret/arşiv sonrası eski token canlanmaz");
    const S1 = await makeUser({ label: "SESS_REJECT", active: true }); // aktif ama onay bekleyen (admin oluşturmuş)
    const t1 = await newSession(S1);
    const { getActiveSessionUserId } = await import("../../lib/auth/sessionSecurity");
    const { getServerDb } = await import("../../lib/supabase-server");
    const sdb = getServerDb();
    ok((await getActiveSessionUserId(sdb, t1)) === S1, "login: token aktif");
    await call(statusRoute.POST as Handler, "POST", S1, asOwner, { action: "reject" });
    ok((await getActiveSessionUserId(sdb, t1)) === null, "reject → eski token GEÇERSİZ");
    ok((await audits(S1)).find((a) => a.action === "user_rejected")?.context?.revoked_session_count === 1, "reject audit: 1 oturum iptal");
    const reap = await call(statusRoute.POST as Handler, "POST", S1, asOwner, { action: "approve", modules: ["clients"], expectedApproval: "rejected" });
    ok(reap.status === 200, "reddedilmiş → Yeniden Onayla (modül seçimli) 200");
    ok((await getActiveSessionUserId(sdb, t1)) === null && (await userGuardStatus(S1, t1)) === 401, "yeniden onay → ESKİ token hâlâ GEÇERSİZ");
    const t1b = await newSession(S1);
    ok((await userGuardStatus(S1, t1b)) === 200, "yeni login (yeni token) → erişim VAR");
    ok((await audits(S1)).find((a) => a.action === "user_approved")?.context?.reapproval === true, "audit: reapproval=true");

    const S2 = await makeUser({ label: "SESS_ARCHIVE", approval: "approved", active: true, pkg: "premium", plan: "premium", perms: { clients: true } });
    const t2 = await newSession(S2);
    ok((await userGuardStatus(S2, t2)) === 200, "arşiv öncesi token geçerli");
    const wrongPw = await call(deleteRoute.POST as Handler, "POST", S2, asOwner, { adminPassword: "yanlis" });
    ok(wrongPw.status === 403 && (await row(S2)).active === true, "yanlış admin şifresi → 403, arşiv YOK");
    const nonMain = await call(deleteRoute.POST as Handler, "POST", S2, asAdmin2, { adminPassword: "zz-owner-pass" });
    ok(nonMain.status === 403, "ana yönetici olmayan admin arşivleyemez → 403");
    const arch = await call(deleteRoute.POST as Handler, "POST", S2, asOwner, { adminPassword: "zz-owner-pass" });
    ok(arch.status === 200 && arch.json.revokedSessionCount === 1 && (await row(S2)).active === false, "arşiv → pasif + 1 oturum iptal");
    ok((await userGuardStatus(S2, t2)) === 401, "arşiv → eski token GEÇERSİZ");
    const react = await call(statusRoute.POST as Handler, "POST", S2, asOwner, { action: "toggle_active", currentActive: false });
    ok(react.status === 200 && (await row(S2)).active === true, "arşivden yeniden aktifleştirme 200");
    ok((await userGuardStatus(S2, t2)) === 401, "yeniden aktivasyon → ESKİ token hâlâ GEÇERSİZ");
    const t2b = await newSession(S2);
    ok((await userGuardStatus(S2, t2b)) === 200, "yeni login → erişim VAR");
    // Legacy: eski arşiv yolu oturumu iptal etmemişti → reaktivasyonda kalıntı token da öldürülür.
    const S3 = await makeUser({ label: "SESS_LEGACY", approval: "approved", active: false, pkg: "premium", plan: "premium" });
    const t3 = await newSession(S3); // pasif hesapta kalmış legacy aktif oturum satırı
    await call(statusRoute.POST as Handler, "POST", S3, asOwner, { action: "toggle_active", currentActive: false });
    ok((await userGuardStatus(S3, t3)) === 401, "legacy kalıntı oturum reaktivasyonda iptal edildi (canlanmadı)");
    const deact = await call(statusRoute.POST as Handler, "POST", S2, asOwner, { action: "toggle_active", currentActive: true });
    ok(deact.status === 200 && deact.json.revokedSessionCount === 1 && (await userGuardStatus(S2, t2b)) === 401, "pasife alma → oturum aynı tx'te iptal");
    const stale = await call(statusRoute.POST as Handler, "POST", S2, asOwner, { action: "toggle_active", currentActive: true });
    ok(stale.status === 409, "bayat currentActive → 409 (yanlış yönde değişiklik yok)");

    // ── E. LICENSE (MEM-001) ──────────────────────────────────────────────────
    console.log("\n[E] Lisans / cihaz limiti");
    const L1 = await makeUser({ label: "LIC_UNLIMITED", approval: "approved", active: true, pkg: "premium", plan: "premium" });
    const lic = (id: string, extra: Record<string, unknown> = {}) => ({
      action: "license", licenseType: "single", securityMode: "normal", allowedLocations: 1,
      allowedActiveSessions: -1, allowedDesktopSessions: -1, allowedMobileSessions: -1,
      allowedTabletSessions: -1, allowedUnknownSessions: -1, securityExempt: false, licenseNote: "", ...extra,
    });
    const loaded = mapDbUser((await call(userRoute.GET as Handler, "GET", L1, asOwner)).json.user as Record<string, unknown>).licenseSettings;
    ok(loaded.allowedActiveSessions === -1 && loaded.allowedDesktopSessions === -1 && loaded.allowedUnknownSessions === -1, "UI yükleme: -1 → -1 (0/1'e dönüşmez)");
    const noop = await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, { action: "license", ...loaded });
    const l1 = await row(L1);
    ok(noop.status === 200 && noop.json.changed === false, "değişiklik yapmadan Kaydet → changed:false");
    ok([l1.allowed_active_sessions, l1.allowed_desktop_sessions, l1.allowed_mobile_sessions, l1.allowed_tablet_sessions, l1.allowed_unknown_sessions].every((v: number) => v === -1), "no-op kayıt sonrası DB -1 KORUNDU");
    ok((await audits(L1)).length === 0, "no-op kayıt audit ÜRETMEDİ");
    const L2 = await makeUser({ label: "LIC_ZERO", approval: "approved", active: true, limits: { total: 3, desktop: 2, mobile: 0, tablet: 0, unknown: 1 } });
    const loaded2 = mapDbUser((await call(userRoute.GET as Handler, "GET", L2, asOwner)).json.user as Record<string, unknown>).licenseSettings;
    const noop2 = await call(userRoute.PATCH as Handler, "PATCH", L2, asOwner, { action: "license", ...loaded2 });
    const l2 = await row(L2);
    ok(noop2.json.changed === false && l2.allowed_mobile_sessions === 0 && l2.allowed_tablet_sessions === 0 && l2.allowed_desktop_sessions === 2 && l2.allowed_active_sessions === 3 && l2.allowed_unknown_sessions === 1, "0 → 0 ve pozitif limitler aynen korundu");
    const setPos = await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, lic(L1, { allowedDesktopSessions: 2 }));
    ok(setPos.status === 200 && (await row(L1)).allowed_desktop_sessions === 2 && (await row(L1)).allowed_mobile_sessions === -1, "tek alan değişimi yalnız o alanı yazar (-1'ler korunur)");
    ok((await audits(L1)).some((a) => a.action === "total_session_limit_changed"), "limit değişimi audit");
    for (const [label, extra] of [
      ["string sayı", { allowedDesktopSessions: "5" }],
      ["-2", { allowedMobileSessions: -2 }],
      ["101 (anlamsız büyük)", { allowedActiveSessions: 101 }],
      ["ondalık", { allowedTabletSessions: 1.5 }],
      ["null", { allowedUnknownSessions: null }],
      ["bilinmeyen lisans türü", { licenseType: "enterprise" }],
      ["bilinmeyen güvenlik modu", { securityMode: "paranoid" }],
      ["lokasyon 0", { allowedLocations: 0 }],
      ["exempt string", { securityExempt: "true" }],
      ["not >500", { licenseNote: "n".repeat(501) }],
    ] as [string, Record<string, unknown>][]) {
      ok((await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, lic(L1, extra))).status === 400, `lisans doğrulama: ${label} → 400`);
    }
    const allZero = lic(L1, { allowedDesktopSessions: 0, allowedMobileSessions: 0, allowedTabletSessions: 0, allowedUnknownSessions: 0 });
    const lock1 = await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, allZero);
    ok(lock1.status === 409 && lock1.json.requiresLockoutConfirmation === true && (await row(L1)).allowed_mobile_sessions === -1, "tüm cihazlar 0 → 409 kilitlenme onayı, DB değişmedi");
    const lock2 = await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, { ...allZero, confirmLockout: true });
    ok(lock2.status === 200 && (await row(L1)).allowed_mobile_sessions === 0, "açık onayla kilitleyici ayar uygulanır");
    ok((await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, lic(L1, { allowedActiveSessions: 0 }))).status === 409, "toplam=0 → kilitlenme onayı (409)");
    const exempt = await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, { ...allZero, securityExempt: true });
    ok(exempt.status === 200, "güvenlik istisnası açıkken 0 limitler kilitlemez (onay gerekmez)");
    ok((await audits(L1)).some((a) => a.action === "security_exempt_changed" && a.old_value.security_exempt === false && a.new_value.security_exempt === true), "security_exempt_changed audit (önce/sonra)");
    const meta = await call(userRoute.PATCH as Handler, "PATCH", L1, asOwner, { ...allZero, securityExempt: true, licenseType: "family", licenseNote: "gizli not içeriği" });
    const metaAudit = (await audits(L1)).find((a) => a.action === "license_settings_changed" && a.new_value.license_type === "family");
    ok(meta.status === 200 && !!metaAudit && metaAudit.new_value.license_type === "family" && metaAudit.context.note_changed === true, "license_settings_changed audit");
    ok(!JSON.stringify(await audits(L1)).includes("gizli not içeriği"), "audit'e not İÇERİĞİ yazılmadı");
    ok((await call(userRoute.PATCH as Handler, "PATCH", OWNER, asOwner, lic(OWNER))).status === 403, "admin kendi limitlerini değiştiremez → 403");
    const sess = await call(sessionsRoute.GET as Handler, "GET", L2, asOwner);
    const L3 = await makeUser({ label: "LIC_NULLS", approval: "approved", active: true });
    await su.query(`update public.users set allowed_active_sessions = -1 where id=$1`, [L3]);
    const sess3 = await call(sessionsRoute.GET as Handler, "GET", L3, asOwner);
    const { isLimitExceeded } = await import("../../lib/admin/licenseLimits");
    const lim3 = (sess3.json.summary as { limits: Record<string, number>; totalFresh: number });
    ok(sess.status === 200 && lim3.limits.allowedActiveSessions === -1, "active-sessions: -1 limit KAYIPSIZ döner");
    ok(isLimitExceeded(lim3.totalFresh, lim3.limits.allowedActiveSessions) === false, "0 aktif oturum / -1 limit → 'Limit Aşıldı' DEĞİL");

    // ── F. EDIT (MEM-002) ────────────────────────────────────────────────────
    console.log("\n[F] Profil düzenleme — active DEĞİŞTİREMEZ");
    const F1 = await makeUser({ label: "EDIT", approval: "approved", active: true });
    const editActive = await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, { action: "edit", fullName: "ZZ_MEMBER_PHASE1_EDIT", email: (await row(F1)).email, role: "expert", active: false });
    ok(editActive.status === 400 && (await row(F1)).active === true, "edit gövdesinde active → 400, hesap AKTİF kaldı");
    // Senaryo: form açıldı (pasif snapshot) → başka işlemle aktif yapıldı → eski formda Kaydet
    await su.query(`update public.users set active=false where id=$1`, [F1]);
    const staleForm = { action: "edit", fullName: "ZZ_MEMBER_PHASE1_EDIT_RENAMED", email: (await row(F1)).email, role: "expert" };
    await call(statusRoute.POST as Handler, "POST", F1, asOwner, { action: "toggle_active", currentActive: false });
    const edit2 = await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, staleForm);
    const f1 = await row(F1);
    ok(edit2.status === 200 && f1.active === true && f1.full_name === "ZZ_MEMBER_PHASE1_EDIT_RENAMED", "bayat form kaydı ad değiştirdi ama AKTİFLİĞİ EZMEDİ");
    const profAudit = (await audits(F1)).find((a) => a.action === "user_profile_updated");
    ok(!!profAudit && JSON.stringify(profAudit.context.fields) === JSON.stringify(["name"]), "user_profile_updated audit (yalnız alan adı)");
    ok(!JSON.stringify(profAudit).includes("RENAMED"), "audit'e isim DEĞERİ yazılmadı");
    ok((await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, staleForm)).json.changed === false, "değişiklik yoksa changed:false");
    ok((await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, { ...staleForm, email: "gecersiz@" })).status === 400, "geçersiz e-posta → 400");
    ok((await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, { ...staleForm, fullName: "a".repeat(121) })).status === 400, "aşırı uzun isim → 400");
    ok((await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, { ...staleForm, role: "superadmin" })).status === 400, "bilinmeyen rol → 400");
    ok((await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, { ...staleForm, email: (await row(P1)).email.toUpperCase() })).status === 409, "çakışan e-posta → 409 (ham DB hatası sızmaz)");
    ok((await call(userRoute.PATCH as Handler, "PATCH", F1, asAdmin2, { ...staleForm, role: "admin" })).status === 403, "normal admin rol yükseltemez → 403");
    ok((await call(userRoute.PATCH as Handler, "PATCH", ADMIN2, asAdmin2, { action: "edit", fullName: "x", email: "zz.member.phase1.admin2@example.test", role: "admin" })).status === 403, "normal admin başka/kendi admin kaydını düzenleyemez (admin-hedef) → 403");
    const promote = await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, { ...staleForm, role: "admin" });
    ok(promote.status === 200 && (await audits(F1)).some((a) => a.action === "role_changed" && a.new_value.role === "admin"), "ana yönetici rol değiştirir + role_changed audit");
    await call(userRoute.PATCH as Handler, "PATCH", F1, asOwner, { ...staleForm, role: "expert" });

    // ── G. MODULES (MEM-005/007/008) ─────────────────────────────────────────
    console.log("\n[G] Modül izinleri — whitelist + eşzamanlılık");
    const G1 = await makeUser({ label: "MODULES", approval: "approved", active: true, pkg: "premium", plan: "premium", perms: { yasam_hafizasi: true, kupa: true } });
    const m1 = await call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: { human_design: true } });
    ok(m1.status === 200 && (await row(G1)).module_permissions.human_design === true, "human_design açıldı (admin yönetebilir)");
    const m2 = await call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: { cosmic_calendar: true } });
    ok(m2.status === 200 && (await row(G1)).module_permissions.cosmic_calendar === true, "cosmic_calendar açıldı (Kozmik/hacamat kapısı)");
    await call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: { human_design: false } });
    ok((await row(G1)).module_permissions.human_design === false, "human_design geri alınabildi (kalıcı true kalmıyor)");
    await call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: { cupping: false } });
    const g1 = await row(G1);
    ok(!("kupa" in g1.module_permissions) && resolveModuleAccess("expert", g1.module_permissions, "cupping") === false, "cupping kapatınca alias 'kupa' da kalktı (gizli erişim yok)");
    ok(g1.module_permissions.yasam_hafizasi === true, "modül değişikliği yasam_hafizasi'ni KORUDU");
    for (const [label, payload] of [
      ["is_admin", { is_admin: true }],
      ["yasam_hafizasi", { yasam_hafizasi: false }],
      ["TR alias", { dogaltas: true }],
      ["string değer", { numerology: "true" }],
      ["null değer", { numerology: null }],
      ["boş", {}],
    ] as [string, Record<string, unknown>][]) {
      ok((await call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: payload })).status === 400, `modül whitelist: ${label} → 400`);
    }
    ok((await call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", modulePermissions: { numerology: true } })).status === 400, "eski tam-harita payload → 400");
    ok(!("is_admin" in (await row(G1)).module_permissions), "is_admin çöp anahtarı saklanmadı");
    const before = (await audits(G1)).length;
    const [c1, c2] = await Promise.all([
      call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: { numerology: true } }),
      call(userRoute.PATCH as Handler, "PATCH", G1, asAdmin2, { action: "modules", changes: { stones: true } }),
    ]);
    const g2 = await row(G1);
    ok(c1.status === 200 && c2.status === 200 && g2.module_permissions.numerology === true && g2.module_permissions.stones === true, "paralel iki farklı toggle → İKİSİ de korundu (lost-update yok)");
    const burstKeys = ["clients", "appointments", "stok", "sifa_rehberi", "reflexology", "energy_body", "aromatherapy", "beslenme"];
    const burst = await Promise.all(burstKeys.map((k) => call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: { [k]: true } })));
    const g3 = await row(G1);
    ok(burst.every((r) => r.status === 200) && burstKeys.every((k) => g3.module_permissions[k] === true), `8 paralel toggle → 8/8 korundu`);
    const enabledAudits = (await audits(G1)).slice(before).filter((a) => a.action === "module_enabled");
    ok(enabledAudits.length === 10 && enabledAudits.every((a) => a.context.count === 1), "her gerçek değişiklik için 1 module_enabled audit (10) — final state ile tutarlı");
    const idem = await call(userRoute.PATCH as Handler, "PATCH", G1, asOwner, { action: "modules", changes: { numerology: true } });
    ok(idem.status === 200 && (await audits(G1)).length === before + 10, "zaten açık modülü tekrar açmak audit ÜRETMEZ (gerçek fark yok)");
    ok((await call(userRoute.PATCH as Handler, "PATCH", ADMIN2, asOwner, { action: "modules", changes: { numerology: true } })).status === 409, "admin hedefte modül yönetimi → 409");
    ok((await call(userRoute.PATCH as Handler, "PATCH", OWNER, asAdmin2, { action: "modules", changes: { numerology: true } })).status === 403, "normal admin, admin hedef → 403");

    // ── H. PREMIUM-ONLY MODEL (MEM-009/014) ──────────────────────────────────
    console.log("\n[H] Premium-only model");
    const H1 = await makeUser({ label: "LEGACY_TRIAL", approval: "approved", active: true, pkg: "trial", plan: "trial", perms: { numerology: true } });
    const hTok = await newSession(H1);
    const hRow = await row(H1);
    const clientSide = hasExpertMembershipAccess(parseLoginUserRecord(hRow as Record<string, unknown>)!);
    // main (FAZ1 FINAL HARDENING): sunucu modül kapısı active + approved + premium ister (tek kaynak).
    const { requireModuleAccess } = await import("../../lib/auth/userGuard");
    const hMod = await requireModuleAccess(new NextRequest("http://localhost/api/x", { headers: { "x-user-id": H1, "x-session-token": hTok } }), "numerology");
    ok(clientSide === false && !hMod.ok && hMod.response.status === 403 && (await userGuardStatus(H1, hTok)) === 200, "legacy trial paketli onaylı uzman: UI ve server modül kapısı AYNI karar (modül YOK, oturum geçerli)");
    ok(mapDbUser(hRow).membershipDisplay.packageLabel === "Paket eksik (eski kayıt)", "legacy trial kolonu 'Premium' diye gösterilmez (gerçek durum; Deneme yok)");
    const pendRow = await row(await makeUser({ label: "PENDING_DISPLAY", pkg: "trial", plan: "trial" }));
    ok(mapDbUser(pendRow).membershipDisplay.packageLabel === "Onay bekliyor" && hasExpertMembershipAccess(parseLoginUserRecord(pendRow as Record<string, unknown>)!) === false, "pending: 'Onay bekliyor' + erişim yok");
    const inactiveRow = await row(await makeUser({ label: "INACTIVE_DISPLAY", approval: "approved", active: false, pkg: "premium", plan: "premium" }));
    ok(mapDbUser(inactiveRow).membershipDisplay.statusLabel === "Pasif", "pasif üyede 'Hesap: Pasif' (Aktif çelişkisi yok)");
    const beforePkg = JSON.stringify(await row(H1));
    for (const plan of ["foo", "premium", "trial", "pro"]) {
      const r = await call(packageRoute.POST as unknown as Handler, "POST", H1, asOwner, { packagePlan: plan });
      ok(r.status === 410, `package uç noktası packagePlan="${plan}" → 410 (200 DEĞİL)`);
    }
    ok(JSON.stringify(await row(H1)) === beforePkg, "package çağrıları hiçbir alanı değiştirmedi");
    ok((await call(packageRoute.POST as unknown as Handler, "POST", OWNER, asAdmin2, { packagePlan: "trial" })).status === 410 && (await row(OWNER)).package_type === null, "normal admin başka admin paketini değiştiremez");

    // ── J. DİJİTAL İÇERİK HUB — SUNUCU KAPISI (UI gizleme yetkinin YERİNE GEÇMEZ) ──
    console.log("\n[J] Dijital İçerik alt modülleri — sunucu kapısı + admin toggle");
    const modStatus = async (userId: string, tok: string, key: Parameters<typeof requireModuleAccess>[1]) => {
      const r = await requireModuleAccess(new NextRequest("http://localhost/api/x", { headers: { "x-user-id": userId, "x-session-token": tok } }), key);
      return r.ok ? 200 : r.response.status;
    };
    const J1 = await makeUser({ label: "DC_ARCHIVE_ONLY", approval: "approved", active: true, pkg: "premium", plan: "premium",
      perms: { personal_archive: true, belge_ceviri: false, video_ceviri: true, ders_notu: true } });
    const jTok = await newSession(J1);
    ok(await modStatus(J1, jTok, "personal_archive") === 200, "yalnız Kişisel Arşiv: personal_archive → 200");
    ok(await modStatus(J1, jTok, "digital_content") === 200, "yalnız Kişisel Arşiv: hub (digital_content) → 200");
    ok(await modStatus(J1, jTok, "belge_ceviri") === 403, "kapalı Belge Çeviri → 403 (direct API)");
    ok(await modStatus(J1, jTok, "video_ceviri") === 403 && await modStatus(J1, jTok, "ders_notu") === 403,
      "video_ceviri/ders_notu bayrağı true olsa da uzmana 403 (admin-only)");
    ok(await modStatus(J1, jTok, "belge_ceviri_ai") === 403, "belge AI uçları (belge_ceviri_ai) uzmana 403");
    const jOn = await call(userRoute.PATCH as Handler, "PATCH", J1, asOwner, { action: "modules", changes: { belge_ceviri: true } });
    ok(jOn.status === 200 && await modStatus(J1, jTok, "belge_ceviri") === 200, "Belge Çeviri açıldı → aynı oturumda 200");
    const jOff = await call(userRoute.PATCH as Handler, "PATCH", J1, asOwner, { action: "modules", changes: { belge_ceviri: false } });
    ok(jOff.status === 200 && await modStatus(J1, jTok, "belge_ceviri") === 403, "Belge Çeviri kapatıldı → hemen 403");
    for (const k of ["video_ceviri", "ders_notu"]) {
      const r = await call(userRoute.PATCH as Handler, "PATCH", J1, asOwner, { action: "modules", changes: { [k]: true } });
      ok(r.status === 400, `admin-only ${k} uzmana toggle ile verilemez → 400`);
    }
    await call(userRoute.PATCH as Handler, "PATCH", J1, asOwner, { action: "modules", changes: { personal_archive: false } });
    ok(await modStatus(J1, jTok, "digital_content") === 403 && await modStatus(J1, jTok, "personal_archive") === 403,
      "hiç uzman alt modülü yok → hub (digital_content) 403");
    const JA = await makeUser({ label: "DC_ADMIN", role: "admin", approval: "approved", active: true, pkg: "premium", plan: "premium" });
    const jaTok = await newSession(JA);
    ok(await modStatus(JA, jaTok, "video_ceviri") === 200 && await modStatus(JA, jaTok, "ders_notu") === 200,
      "admin: video_ceviri + ders_notu erişimi korunur");

    // ── K. AŞAMA 2 · P1-7 — HESAP DEVRALMA KAPANIŞI ───────────────────────────
    console.log("\n[K] P1-7 — şifre / e-posta / lisans-güvenlik / tekil oturum yalnız ana yönetici");
    type SessHandler = (req: NextRequest, ctx: { params: Promise<{ id: string; sessionId: string }> }) => Promise<Response>;
    async function callSession(id: string, sessionId: string, auth: Auth): Promise<{ status: number; json: Record<string, unknown> }> {
      const headers: Record<string, string> = {};
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      const req = new NextRequest(`http://localhost/api/admin/users/${id}/sessions/${sessionId}`, { method: "PATCH", headers });
      const res = await (singleSessionRoute.PATCH as SessHandler)(req, { params: Promise.resolve({ id, sessionId }) });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : {} };
    }
    const sessionActive = async (sid: string) =>
      (await su.query(`select is_active from public.user_sessions where id=$1`, [sid])).rows[0]?.is_active === true;
    const sessionIdFor = async (token: string) =>
      String((await su.query(`select id from public.user_sessions where session_token=$1`, [token])).rows[0].id);

    // viewer.isMainAdmin — sunucu kararı (istemci admin_level'ına güvenilmez).
    const K1 = await makeUser({ label: "P17_TARGET", approval: "approved", active: true, pkg: "premium", plan: "premium" });
    await su.query(`update public.users set password_hash='zz-orig-hash', admin_level='owner' where id=$1`, [K1]);
    await su.query(`update public.users set admin_level='owner' where id=$1`, [ADMIN2]); // canlı varsayılanı simüle
    const gOwner = await call(userRoute.GET as Handler, "GET", K1, asOwner);
    const gAdmin2 = await call(userRoute.GET as Handler, "GET", K1, asAdmin2);
    ok((gOwner.json.viewer as { isMainAdmin?: boolean })?.isMainAdmin === true, "GET viewer.isMainAdmin: ana yönetici → true");
    ok((gAdmin2.json.viewer as { isMainAdmin?: boolean })?.isMainAdmin === false, "GET viewer.isMainAdmin: normal admin (admin_level='owner' olsa da) → false");
    ok("agreed_fee" in (gOwner.json.user as Record<string, unknown>) && "billing_period" in (gOwner.json.user as Record<string, unknown>), "GET user: agreed_fee + billing_period alanları döner (USERS_SAFE_SELECT)");

    // Şifre sıfırlama
    const kTok = await newSession(K1);
    const pw = { newPassword: "YeniSifre12345" };
    const pwA2 = await call(passwordRoute.POST as Handler, "POST", K1, asAdmin2, pw);
    ok(pwA2.status === 403 && (await row(K1)).password_hash === "zz-orig-hash", "normal admin → uzman şifre sıfırlama 403, hash DEĞİŞMEDİ");
    ok((await userGuardStatus(K1, kTok)) === 200, "reddedilen sıfırlama oturumu kapatmadı");
    ok((await audits(K1)).every((a) => a.action !== "password_changed_by_admin"), "reddedilen sıfırlama audit yazmadı");
    ok((await call(passwordRoute.POST as Handler, "POST", "not-a-uuid", asOwner, pw)).status === 400, "şifre route: bozuk UUID → 400");
    const pwOwner = await call(passwordRoute.POST as Handler, "POST", K1, asOwner, pw);
    const k1AfterPw = await row(K1);
    ok(pwOwner.status === 200 && k1AfterPw.password_hash !== "zz-orig-hash" && String(k1AfterPw.password_hash).startsWith("zz-test-hash:"), "ana yönetici → şifre sıfırlama 200, hash değişti");
    ok((await userGuardStatus(K1, kTok)) === 401, "şifre sıfırlama sonrası eski oturum GEÇERSİZ");
    const pwAudit = (await audits(K1)).find((a) => a.action === "password_changed_by_admin");
    ok(!!pwAudit && pwAudit.context.revoked_session_count === 1, "password_changed_by_admin audit (1 oturum kapandı)");
    ok(!JSON.stringify(pwAudit).includes("YeniSifre12345"), "audit'e parola yazılmadı");
    ok((await call(passwordRoute.POST as Handler, "POST", OWNER, asAdmin2, pw)).status === 403, "normal admin → ana yönetici şifresi 403");

    // E-posta / isim
    const k1Email = String((await row(K1)).email);
    const editBase = { action: "edit", fullName: "ZZ_MEMBER_PHASE1_P17_TARGET", email: k1Email, role: "expert" };
    const emA2 = await call(userRoute.PATCH as Handler, "PATCH", K1, asAdmin2, { ...editBase, email: "zz.p17.hijack@example.test" });
    ok(emA2.status === 403 && (await row(K1)).email === k1Email, "normal admin → e-posta değişimi 403, e-posta DEĞİŞMEDİ");
    const emMix = await call(userRoute.PATCH as Handler, "PATCH", K1, asAdmin2, { ...editBase, fullName: "ZZ_MEMBER_PHASE1_P17_MIX", email: "zz.p17.mix@example.test" });
    ok(emMix.status === 403 && (await row(K1)).full_name === "ZZ_MEMBER_PHASE1_P17_TARGET", "normal admin → isim+e-posta birlikte 403, isim de YAZILMADI");
    const nameA2 = await call(userRoute.PATCH as Handler, "PATCH", K1, asAdmin2, { ...editBase, fullName: "ZZ_MEMBER_PHASE1_P17_RENAMED" });
    ok(nameA2.status === 200 && (await row(K1)).full_name === "ZZ_MEMBER_PHASE1_P17_RENAMED", "normal admin → yalnız isim değişimi 200");
    ok((await audits(K1)).some((a) => a.action === "user_profile_updated" && JSON.stringify(a.context.fields) === JSON.stringify(["name"])), "isim değişimi audit (fields=[name])");
    const emOwner = await call(userRoute.PATCH as Handler, "PATCH", K1, asOwner, { ...editBase, fullName: "ZZ_MEMBER_PHASE1_P17_RENAMED", email: "zz.p17.newmail@example.test" });
    ok(emOwner.status === 200 && (await row(K1)).email === "zz.p17.newmail@example.test", "ana yönetici → e-posta değişimi 200");
    ok((await audits(K1)).some((a) => a.action === "user_profile_updated" && JSON.stringify(a.context.fields) === JSON.stringify(["email"])), "e-posta değişimi audit (fields=[email], değer yok)");
    ok(!JSON.stringify(await audits(K1)).includes("zz.p17.newmail"), "audit'e e-posta DEĞERİ yazılmadı");

    // Lisans / güvenlik politikası
    const licBase = { action: "license", licenseType: "single", securityMode: "normal", allowedLocations: 1,
      allowedActiveSessions: -1, allowedDesktopSessions: -1, allowedMobileSessions: -1,
      allowedTabletSessions: -1, allowedUnknownSessions: -1, securityExempt: false, licenseNote: "" };
    const k1Before = JSON.stringify(await row(K1));
    for (const [label, extra] of [
      ["güvenlik istisnası", { securityExempt: true }],
      ["güvenlik modu", { securityMode: "strict" }],
      ["izinli lokasyon", { allowedLocations: 3 }],
      ["toplam oturum", { allowedActiveSessions: 2 }],
      ["mobil limit", { allowedMobileSessions: 1 }],
      ["lisans türü", { licenseType: "family" }],
      ["lisans notu", { licenseNote: "not" }],
      ["no-op (değişiklik yok)", {}],
    ] as [string, Record<string, unknown>][]) {
      ok((await call(userRoute.PATCH as Handler, "PATCH", K1, asAdmin2, { ...licBase, ...extra })).status === 403, `normal admin → lisans/güvenlik (${label}) 403`);
    }
    ok(JSON.stringify(await row(K1)) === k1Before, "403'ler sonrası hedef satır DEĞİŞMEDİ");
    const licOwner = await call(userRoute.PATCH as Handler, "PATCH", K1, asOwner, { ...licBase, securityExempt: true, securityMode: "strict" });
    ok(licOwner.status === 200 && (await row(K1)).security_exempt === true && (await row(K1)).security_mode === "strict", "ana yönetici → lisans/güvenlik 200");
    ok((await audits(K1)).some((a) => a.action === "security_exempt_changed"), "ana yönetici lisans değişimi audit'lendi");
    ok((await call(userRoute.GET as Handler, "GET", K1, asAdmin2)).status === 200, "normal admin lisans değerlerini GET ile görür (200)");

    // Tekil oturum sonlandırma
    const kTok2 = await newSession(K1);
    const kSid = await sessionIdFor(kTok2);
    const ownerSid = await sessionIdFor(TOK.owner);
    const sOwnerByA2 = await callSession(OWNER, ownerSid, asAdmin2);
    ok(sOwnerByA2.status === 403 && await sessionActive(ownerSid), "normal admin → ana yönetici oturumu sonlandırma 403 (oturum açık)");
    const KA = await makeUser({ label: "P17_ADMIN3", role: "admin", approval: "approved", active: true });
    const kaTok = await newSession(KA);
    const kaSid = await sessionIdFor(kaTok);
    ok((await callSession(KA, kaSid, asAdmin2)).status === 403 && await sessionActive(kaSid), "normal admin → başka admin oturumu 403");
    ok((await callSession(ADMIN2, await sessionIdFor(TOK.admin2), asAdmin2)).status === 403, "kendi oturumunu bu ekrandan kapatma 403");
    ok((await callSession(K1, "not-a-uuid", asAdmin2)).status === 400, "bozuk oturum UUID → 400");
    ok((await callSession("123", kSid, asAdmin2)).status === 400, "bozuk kullanıcı UUID → 400");
    ok((await callSession(E_AUTH, kSid, asAdmin2)).status === 404 && await sessionActive(kSid), "başka kullanıcının oturumu → 404 (kapanmadı)");
    const sExpert = await callSession(K1, kSid, asAdmin2);
    ok(sExpert.status === 200 && sExpert.json.ok === true && !(await sessionActive(kSid)), "normal admin → uzman oturumu sonlandırma 200");
    ok((await userGuardStatus(K1, kTok2)) === 401, "sonlandırılan oturum token'ı GEÇERSİZ");
    const ssAudit = (await audits(K1)).filter((a) => a.action === "single_session_terminated");
    ok(ssAudit.length === 1 && ssAudit[0].context.revoked_session_count === 1, "single_session_terminated audit (1 kayıt)");
    ok(!JSON.stringify(ssAudit).includes(kTok2), "audit'e token yazılmadı");
    const sAgain = await callSession(K1, kSid, asAdmin2);
    ok(sAgain.status === 409 && (await audits(K1)).filter((a) => a.action === "single_session_terminated").length === 1, "zaten kapalı oturum → 409, ek audit yok");
    ok(!/error\.message|duplicate|violates|relation/i.test(JSON.stringify(sAgain.json)), "oturum route: ham DB hatası sızmaz");
    ok((await callSession(KA, kaSid, asOwner)).status === 200, "ana yönetici → normal admin oturumu 200");

    // ── L. AŞAMA 2 · M4 — ÖDEME ROUTE SERTLEŞTİRME ───────────────────────────
    console.log("\n[L] Ödeme kaydı — doğrulama + geçmiş + audit");
    async function pay(id: string, auth: Auth, draft: unknown, extra?: Record<string, unknown>) {
      return call(paymentRoute.POST as Handler, "POST", id, auth, { draft, ...(extra ?? {}) });
    }
    const today = istanbulTodayIso();
    const L1p = await makeUser({ label: "PAY", approval: "approved", active: true, pkg: "premium", plan: "premium" });
    const okDraft = { status: "paid", lastPaymentDate: today, nextPaymentDate: addBillingPeriod(today, "monthly"),
      paidAmount: "1500", note: "Havale ref 42", agreedFee: "1500", billingPeriod: "monthly" };
    const histCount = async (id: string) => (await su.query(`select count(*)::int n from public.user_payment_history where user_id=$1`, [id])).rows[0].n as number;
    for (const [label, d, code] of [
      ["geçersiz durum", { ...okDraft, status: "hacked" }, 400],
      ["negatif tutar", { ...okDraft, paidAmount: "-1" }, 400],
      ["negatif ücret", { ...okDraft, agreedFee: -5 }, 400],
      ["3 ondalık", { ...okDraft, agreedFee: "10.555" }, 400],
      ["aşırı büyük tutar", { ...okDraft, paidAmount: "1000000000" }, 400],
      ["geçersiz tarih (30 Şubat)", { ...okDraft, lastPaymentDate: "2026-02-30" }, 400],
      ["tarih biçimi", { ...okDraft, nextPaymentDate: "01.10.2026" }, 400],
      ["geçersiz dönem", { ...okDraft, billingPeriod: "weekly" }, 400],
      ["not > 1000", { ...okDraft, note: "n".repeat(1001) }, 400],
      ["bilinmeyen alan", { ...okDraft, is_admin: true }, 400],
      ["draft yok", undefined, 400],
    ] as [string, unknown, number][]) {
      ok((await pay(L1p, asAdmin2, d)).status === code, `ödeme doğrulama: ${label} → ${code}`);
    }
    ok((await call(paymentRoute.POST as Handler, "POST", L1p, asAdmin2, { draft: okDraft, extra: 1 })).status === 400, "ödeme: gövdede beklenmeyen üst alan → 400");
    ok((await call(paymentRoute.POST as Handler, "POST", "abc", asAdmin2, { draft: okDraft })).status === 400, "ödeme: bozuk UUID → 400");
    ok((await call(paymentRoute.POST as Handler, "POST", L1p, asAdmin2, undefined, { rawBody: JSON.stringify({ draft: { ...okDraft, note: "x".repeat(9000) } }) })).status === 413, "ödeme: aşırı büyük gövde → 413");
    ok((await pay(OWNER, asAdmin2, okDraft)).status === 403, "normal admin → admin hedef ödeme 403");
    ok((await histCount(L1p)) === 0 && (await row(L1p)).payment_status === null, "reddedilen istekler hiçbir şey yazmadı");
    const pay1 = await pay(L1p, asAdmin2, okDraft);
    const l1row = await row(L1p);
    ok(pay1.status === 200 && pay1.json.changed === true, "geçerli ödeme kaydı (normal admin, uzman hedef) → 200");
    ok(l1row.payment_status === "paid" && Number(l1row.agreed_fee) === 1500 && l1row.billing_period === "monthly" && l1row.last_payment_date === today, "users: durum + ücret + dönem + tarih yazıldı");
    const h1 = (await su.query(`select * from public.user_payment_history where user_id=$1 order by created_at desc`, [L1p])).rows;
    ok(h1.length === 1 && Number(h1[0].agreed_fee) === 1500 && h1[0].billing_period === "monthly" && h1[0].actor_admin_id === ADMIN2, "geçmiş: agreed_fee + billing_period + actor_admin_id");
    const payAudit = (await audits(L1p)).filter((a) => a.action === "payment_status_changed");
    ok(payAudit.length === 1 && Array.isArray(payAudit[0].context.fields) && payAudit[0].context.fields.includes("agreed_fee") && payAudit[0].context.fields.includes("payment_status"), "payment_status_changed audit (değişen alan adları)");
    ok(!/1500|Havale|monthly/.test(JSON.stringify(payAudit)), "audit'e tutar/not/dönem DEĞERİ yazılmadı");
    const payNoop = await pay(L1p, asAdmin2, okDraft);
    ok(payNoop.status === 200 && payNoop.json.changed === false && (await histCount(L1p)) === 1 && (await audits(L1p)).filter((a) => a.action === "payment_status_changed").length === 1, "değişiklik yok → changed:false, geçmiş/audit YOK");
    const hGet = await call(paymentHistoryRoute.GET as Handler, "GET", L1p, asAdmin2);
    ok(hGet.status === 200 && Array.isArray(hGet.json.history) && (hGet.json.history as unknown[]).length === 1, "payment-history GET 200");
    ok((await call(paymentHistoryRoute.GET as Handler, "GET", "zz", asAdmin2)).status === 400, "payment-history: bozuk UUID → 400");
    // Belirtilmemiş: literal 'undefined' (canlıda 7 kayıt) → "Belirtilmemiş" gösterilir, yeniden YAZILMAZ.
    const U1 = await makeUser({ label: "PAY_UNDEF", approval: "approved", active: true });
    await su.query(`update public.users set payment_status='undefined' where id=$1`, [U1]);
    const uMapped = mapDbUser((await call(userRoute.GET as Handler, "GET", U1, asOwner)).json.user as Record<string, unknown>);
    ok(uMapped.payment.status === "unknown" && uMapped.payment.statusLabel === "Belirtilmemiş", "literal 'undefined' → 'Belirtilmemiş'");
    const uDraft = paymentSnapshotToEditDraft(uMapped.payment);
    ok(uDraft.status === "unknown", "düzenleme taslağı 'unknown'ı KORUR (sessizce 'pending' olmaz)");
    const uSave = await pay(U1, asOwner, { ...uDraft, note: "yalnız not" });
    ok(uSave.status === 200 && (await row(U1)).payment_status === "undefined" && (await row(U1)).payment_note === "yalnız not", "yalnız not değişti → legacy durum değeri yeniden YAZILMADI");
    const uUnknown = await pay(L1p, asOwner, { ...okDraft, status: "unknown" });
    ok(uUnknown.status === 200 && (await row(L1p)).payment_status === null, "'Belirtilmemiş' bilinçli seçilirse NULL yazılır");
    // Geçmiş yazılamazsa: kullanıcı satırı geri alınır + HATA (ok+warning DEĞİL).
    const beforeFail = await row(L1p);
    await su.query(`revoke insert on public.user_payment_history from service_role`);
    const failSave = await pay(L1p, asOwner, { ...okDraft, agreedFee: "2500" });
    await su.query(`grant insert on public.user_payment_history to service_role`);
    const afterFail = await row(L1p);
    ok(failSave.status === 500 && failSave.json.ok === false && !("warning" in failSave.json), "geçmiş insert hatası → 500 (ok+warning değil)");
    ok(Number(afterFail.agreed_fee) === Number(beforeFail.agreed_fee) && afterFail.payment_status === beforeFail.payment_status, "geçmiş hatası → kullanıcı satırı ESKİ değerlerine geri alındı");
    ok(!/permission|denied|relation|42501/i.test(JSON.stringify(failSave.json)), "ödeme route: ham DB hatası sızmaz");

    // ── M. AŞAMA 2 · M4 — YENİLEME FİLTRESİ / SIRALAMA / SAYAÇLAR ────────────
    console.log("\n[M] admin_list_users p_due / p_sort + metrics");
    const plusDays = (n: number) => {
      const [y, m, d] = today.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + n));
      return dt.toISOString().slice(0, 10);
    };
    const dueUser = async (label: string, next: string | null, o: { approval?: string; active?: boolean; status?: string } = {}) => {
      const id = await makeUser({ label: `DUE_${label}`, approval: o.approval ?? "approved", active: o.active ?? true, pkg: "premium", plan: "premium" });
      await su.query(`update public.users set next_payment_date=$2, payment_status=$3 where id=$1`, [id, next, o.status ?? "pending"]);
      return id;
    };
    const D_OVER = await dueUser("OVERDUE", plusDays(-5));
    const D_TODAY = await dueUser("TODAY", today);
    const D_10 = await dueUser("IN10", plusDays(10));
    const D_30 = await dueUser("IN30", plusDays(30));
    const D_60 = await dueUser("IN60", plusDays(60));
    const D_NONE = await dueUser("NODATE", null);
    const D_EXEMPT = await dueUser("EXEMPT", plusDays(-3), { status: "exempt" });
    const D_PASSIVE = await dueUser("PASSIVE", plusDays(-3), { active: false });
    const D_PENDING = await dueUser("PENDING", plusDays(-3), { approval: "pending" });
    async function list(qs: string, auth: Auth = asAdmin2) {
      const headers: Record<string, string> = {};
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      const res = await (listRoute.GET as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://localhost/api/admin/users?${qs}`, { headers }));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
    }
    const ids = (r: { json: Record<string, unknown> }) => ((r.json.users ?? []) as { id: string }[]).map((u) => u.id);
    const Q = "q=ZZ_MEMBER_PHASE1_DUE&pageSize=50";
    const lOver = await list(`${Q}&due=overdue`);
    ok(lOver.status === 200 && JSON.stringify(ids(lOver)) === JSON.stringify([D_OVER]), "due=overdue → yalnız onaylı+aktif+muaf olmayan gecikmiş (muaf/pasif/bekleyen HARİÇ)");
    const l30 = await list(`${Q}&due=due30&sort=next_payment_asc`);
    ok(JSON.stringify(ids(l30)) === JSON.stringify([D_TODAY, D_10, D_30]), "due=due30 → bugün..+30 (sınırlar dahil), +60 HARİÇ, tarihe göre artan");
    const lNone = await list(`${Q}&due=no_date`);
    ok(JSON.stringify(ids(lNone)) === JSON.stringify([D_NONE]), "due=no_date → yalnız tarihsiz onaylı+aktif uzman");
    const lAsc = await list(`${Q}&sort=next_payment_asc`);
    const ascDates = ((lAsc.json.users ?? []) as { next_payment_date: string | null }[]).map((u) => u.next_payment_date);
    const nonNullAsc = ascDates.filter((d): d is string => d !== null);
    // 8 = 9 fixture − onaylı+pasif (Arşiv görünümünde; "members" görünümü hariç tutar).
    ok(ascDates.length === 8 && ascDates[ascDates.length - 1] === null && nonNullAsc.every((d, i) => i === 0 || nonNullAsc[i - 1] <= d), "sort=next_payment_asc → artan, NULLS LAST");
    const lDesc = await list(`${Q}&sort=next_payment_desc`);
    const descDates = ((lDesc.json.users ?? []) as { next_payment_date: string | null }[]).map((u) => u.next_payment_date);
    const nonNullDesc = descDates.filter((d): d is string => d !== null);
    ok(descDates[descDates.length - 1] === null && nonNullDesc.every((d, i) => i === 0 || nonNullDesc[i - 1] >= d) && ids(lDesc)[0] === D_60, "sort=next_payment_desc → azalan, NULLS LAST");
    const lAsc2 = await list(`${Q}&sort=next_payment_asc`);
    ok(JSON.stringify(ids(lAsc2)) === JSON.stringify(ids(lAsc)), "eşit tarihlerde sıra deterministik (id tiebreaker)");
    const lPage1 = await list(`q=ZZ_MEMBER_PHASE1_DUE&pageSize=10&sort=next_payment_asc`);
    ok(JSON.stringify(ids(lPage1)) === JSON.stringify(ids(lAsc)), "sayfalama aynı sıralamayı kullanır");
    ok((await list(`${Q}&due=bogus`)).status === 400 && (await list(`${Q}&sort=random`)).status === 400, "bilinmeyen due/sort → 400");
    const counts = lOver.json.counts as Record<string, number>;
    const sqlOver = (await su.query(`select count(*)::int n from public.users where role='expert' and approval_status='approved' and active
        and coalesce(lower(payment_status),'') <> 'exempt' and next_payment_date < (now() at time zone 'Europe/Istanbul')::date`)).rows[0].n;
    const sqlDue30 = (await su.query(`select count(*)::int n from public.users where role='expert' and approval_status='approved' and active
        and coalesce(lower(payment_status),'') <> 'exempt' and next_payment_date between (now() at time zone 'Europe/Istanbul')::date and (now() at time zone 'Europe/Istanbul')::date + 30`)).rows[0].n;
    ok(counts.renewal_overdue === sqlOver && sqlOver >= 1, `sayaç renewal_overdue = ${counts.renewal_overdue} (bağımsız SQL ile aynı)`);
    ok(counts.renewal_due30 === sqlDue30 && sqlDue30 >= 3, `sayaç renewal_due30 = ${counts.renewal_due30} (bağımsız SQL ile aynı)`);
    ok(renewalState(plusDays(-5), today).kind === "overdue" && renewalState(plusDays(30), today).kind === "due" && renewalState(plusDays(31), today).kind === "later", "UI rozet sınırları SQL filtresiyle aynı (30 gün dahil)");
    const mRes = await (metricsRoute.GET as (r: NextRequest) => Promise<Response>)(new NextRequest("http://localhost/api/admin/metrics", { headers: { "x-admin-id": ADMIN2, "x-session-token": TOK.admin2 } }));
    const mJson = await mRes.json() as Record<string, unknown>;
    ok(mRes.status === 200 && mJson.renewalOverdue === sqlOver && mJson.renewalDue30 === sqlDue30, "metrics: renewalOverdue / renewalDue30 sayaçları");
    ok(!/email|full_name|ZZ_MEMBER/.test(JSON.stringify(mJson)), "metrics: yalnız agrega sayı (PII yok)");
    const legacyCall = (await su.query(`select public.admin_list_users(p_q => '', p_role_match => null, p_view => 'members', p_approval => 'all',
        p_active => 'all', p_role => 'all', p_payment => 'all', p_limit => 5, p_offset => 0) r`)).rows[0].r;
    ok(typeof legacyCall.total === "number", "eski 9 adlı argümanla çağrı (geriye uyumlu varsayılanlar) çalışır");
    const fnAcl = (await su.query(`select
        has_function_privilege('anon','public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text)','EXECUTE') a,
        has_function_privilege('authenticated','public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text)','EXECUTE') b,
        has_function_privilege('service_role','public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text)','EXECUTE') c,
        (select count(*)::int from pg_proc where proname='admin_list_users') n,
        has_column_privilege('anon','public.users','agreed_fee','SELECT') ca`)).rows[0];
    ok(!fnAcl.a && !fnAcl.b && fnAcl.c && fnAcl.n === 1 && !fnAcl.ca, "ACL: yalnız service_role EXECUTE, tek imza, anon kolon erişimi yok");
    let chkOk = false;
    try { await su.query(`update public.users set agreed_fee=-1 where id=$1`, [D_OVER]); } catch { chkOk = true; }
    let chkPeriod = false;
    try { await su.query(`update public.users set billing_period='weekly' where id=$1`, [D_OVER]); } catch { chkPeriod = true; }
    ok(chkOk && chkPeriod, "DB CHECK: negatif ücret ve bilinmeyen dönem reddedilir");
    void D_EXEMPT; void D_PASSIVE; void D_PENDING;


    // ── I. AUDIT GÜVENLİĞİ ────────────────────────────────────────────────────
    console.log("\n[I] Audit");
    // Yalnız payload kolonları (action adı "password_changed_by_admin" meşru olarak "password" içerir).
    const allAudit = JSON.stringify((await su.query(`select old_value, new_value, result, context, reason from public.admin_audit_log`)).rows);
    ok(!/zz-tok-|zz-owner-pass|session_token|password/i.test(allAudit), "hiçbir audit satırında token/parola yok");
    const actions = new Set((await su.query(`select distinct action from public.admin_audit_log`)).rows.map((r) => r.action));
    for (const a of ["user_approved", "user_rejected", "user_archived", "user_activated", "user_deactivated", "module_enabled", "module_disabled", "total_session_limit_changed", "license_settings_changed", "security_exempt_changed", "user_profile_updated", "role_changed", "password_changed_by_admin", "single_session_terminated", "payment_status_changed"]) {
      ok(actions.has(a), `audit action üretildi: ${a}`);
    }
    ok(shim.stats.errors >= 0, `shim istek sayısı: ${shim.stats.requests}`);
  } finally {
    if (shim) await shim.close();
    await pool.end().catch(() => undefined);
    await su.end().catch(() => undefined);
    await epg.stop().catch((e: Error) => console.log("(teardown uyarısı)", e.message));
  }

  console.log(`\n──────────\nROUTE ENTEGRASYON: PASS ${pass} · FAIL ${fail}`);
  if (fail > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("BEKLENMEYEN:", e); process.exit(1); });
