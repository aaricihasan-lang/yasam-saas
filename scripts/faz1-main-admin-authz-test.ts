/**
 * Faz 1/P1 harness — ana-yönetici işareti + yetki sınırları + workspace + pending.
 *
 * Çalıştırma:  npx tsx scripts/faz1-main-admin-authz-test.ts
 *
 * Kapsam (gerçek DB'ye YAZMAZ — mock SupabaseClient):
 *   1) Migration sözleşmesi (is_super_admin kolon + backfill + tek-super-admin index).
 *   2) resolveIsSuperAdmin: kolon var(true/false) / kolon yok → e-posta fallback.
 *   3) requireMainAdmin: super→ok, değil→403.
 *   4) requireMainAdminForAdminTarget: admin-hedef+non-super→403, expert-hedef→ok.
 *   5) guardAdminLockout: super-admin/owner hedef → 403; expert → serbest.
 *   6) recordWorkspaceView: audit ok→ok; yasaklı context → fail-closed 500 + insert 0.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveIsSuperAdmin,
  requireMainAdmin,
  requireMainAdminForAdminTarget,
  requireSuperAdminWorkspaceAccess,
  isSuperAdminWorkspaceViewEnabled,
  guardAdminLockout,
  OWNER_FALLBACK_EMAIL,
  type AdminTargetRow,
} from "../lib/admin/adminGuards";
import { recordWorkspaceView } from "../lib/admin/workspaceAudit";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  if (cond) passed++;
  else { failed++; fails.push(name); console.log("  ✗ FAIL:", name); }
}

type Resp = { data?: unknown; error?: { message: string } | null; count?: number };

/** Esnek mock: (table, selectCols, filters) → Resp. insert yakalanır. */
function mockDb(
  resolver: (table: string, select: string, filters: Record<string, unknown>) => Resp,
  insertState?: { calls: number; lastPayload?: Record<string, unknown>; result?: Resp },
): SupabaseClient {
  const make = (table: string) => {
    let select = "";
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      select(cols: string) { select = cols; return builder; },
      eq(col: string, val: unknown) { filters[col] = val; return builder; },
      async maybeSingle() { return resolver(table, select, filters); },
      // thenable → `await db.from().select().eq().eq()` (countActiveAdmins) çalışır
      then(resolve: (r: Resp) => unknown) { return resolve(resolver(table, select, filters)); },
      insert(payload: Record<string, unknown>) {
        if (insertState) { insertState.calls++; insertState.lastPayload = payload; }
        return {
          select() { return { async maybeSingle() { return insertState?.result ?? { data: { id: "11111111-1111-1111-1111-111111111111" }, error: null }; } }; },
        };
      },
    };
    return builder;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

const SUPER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NORMAL_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function run(): Promise<void> {
// ── 1) MIGRATION SÖZLEŞMESİ ──────────────────────────────────────────────────
const sql = readFileSync("supabase/migrations/20260913000000_users_is_super_admin.sql", "utf8");
ok(/add column if not exists is_super_admin boolean not null default false/i.test(sql), "migration: is_super_admin NOT NULL DEFAULT false");
ok(/update public\.users[\s\S]*set is_super_admin = true[\s\S]*admin@yasamsistemi\.com/i.test(sql), "migration: backfill admin@yasamsistemi.com");
ok(/create unique index if not exists uq_users_single_super_admin[\s\S]*where is_super_admin = true/i.test(sql), "migration: tek-super-admin partial unique index");

// ── 2) resolveIsSuperAdmin ──────────────────────────────────────────────────
// (a) kolon var + true
{
  const db = mockDb((t, s) => t === "users" && s.includes("is_super_admin") ? { data: { is_super_admin: true } } : { data: null });
  ok((await resolveIsSuperAdmin(db, SUPER_ID)) === true, "resolveIsSuperAdmin: kolon var+true → true");
}
// (b) kolon var + false
{
  const db = mockDb((t, s) => t === "users" && s.includes("is_super_admin") ? { data: { is_super_admin: false } } : { data: null });
  ok((await resolveIsSuperAdmin(db, NORMAL_ID)) === false, "resolveIsSuperAdmin: kolon var+false → false");
}
// (c) kolon YOK (error) → e-posta fallback (admin@yasamsistemi.com → true)
{
  const db = mockDb((t, s) => {
    if (t === "users" && s.includes("is_super_admin")) return { error: { message: "column users.is_super_admin does not exist" } };
    if (t === "users" && s.includes("email")) return { data: { email: OWNER_FALLBACK_EMAIL, role: "admin" } };
    return { data: null };
  });
  ok((await resolveIsSuperAdmin(db, SUPER_ID)) === true, "resolveIsSuperAdmin: kolon yok + owner e-posta → true (fallback)");
}
// (d) kolon YOK + farklı e-posta → false
{
  const db = mockDb((t, s) => {
    if (t === "users" && s.includes("is_super_admin")) return { error: { message: "column does not exist" } };
    if (t === "users" && s.includes("email")) return { data: { email: "baska@x.com", role: "admin" } };
    return { data: null };
  });
  ok((await resolveIsSuperAdmin(db, NORMAL_ID)) === false, "resolveIsSuperAdmin: kolon yok + başka e-posta → false");
}

// ── 3) requireMainAdmin ─────────────────────────────────────────────────────
{
  const superDb = mockDb((t, s) => t === "users" && s.includes("is_super_admin") ? { data: { is_super_admin: true } } : { data: null });
  const r = await requireMainAdmin(superDb, SUPER_ID);
  ok(r.ok === true, "requireMainAdmin: super → ok");
}
{
  const normalDb = mockDb((t, s) => t === "users" && s.includes("is_super_admin") ? { data: { is_super_admin: false } } : { data: null });
  const r = await requireMainAdmin(normalDb, NORMAL_ID);
  ok(r.ok === false && r.status === 403, "requireMainAdmin: normal admin → 403");
}

// ── 4) requireMainAdminForAdminTarget ───────────────────────────────────────
// hedef admin + actor non-super → 403
{
  const db = mockDb((t, s) => {
    if (t === "users" && s === "role") return { data: { role: "admin" } };       // hedef admin
    if (t === "users" && s.includes("is_super_admin")) return { data: { is_super_admin: false } }; // actor non-super
    return { data: null };
  });
  const r = await requireMainAdminForAdminTarget(db, NORMAL_ID, SUPER_ID);
  ok(r.ok === false && r.status === 403, "adminTarget: admin hedef + normal actor → 403");
}
// hedef expert → serbest (super gerekmez)
{
  const db = mockDb((t, s) => (t === "users" && s === "role") ? { data: { role: "expert" } } : { data: null });
  const r = await requireMainAdminForAdminTarget(db, NORMAL_ID, "cccccccc-cccc-cccc-cccc-cccccccccccc");
  ok(r.ok === true, "adminTarget: expert hedef → serbest");
}

// ── 5) guardAdminLockout ────────────────────────────────────────────────────
const noDb = mockDb(() => ({ data: null }));
// super-admin hedef → 403
{
  const target: AdminTargetRow = { role: "admin", email: "x@x.com", active: true, is_super_admin: true };
  const r = await guardAdminLockout(noDb, target, { willBeActive: false });
  ok(r.ok === false && r.status === 403, "guardAdminLockout: super-admin hedef pasifleştirme → 403");
}
// owner e-posta hedef → 403
{
  const target: AdminTargetRow = { role: "admin", email: OWNER_FALLBACK_EMAIL, active: true };
  const r = await guardAdminLockout(noDb, target, { isDelete: true });
  ok(r.ok === false && r.status === 403, "guardAdminLockout: owner e-posta hedef silme → 403");
}
// expert hedef → serbest
{
  const target: AdminTargetRow = { role: "expert", email: "e@x.com", active: true };
  const r = await guardAdminLockout(noDb, target, { willBeActive: false });
  ok(r.ok === true, "guardAdminLockout: expert hedef → serbest");
}
// normal admin + son aktif admin (count=1) → 409
{
  const db = mockDb((t) => t === "users" ? { count: 1 } : { data: null });
  const target: AdminTargetRow = { role: "admin", email: "n@x.com", active: true, is_super_admin: false };
  const r = await guardAdminLockout(db, target, { willBeActive: false });
  ok(r.ok === false && r.status === 409, "guardAdminLockout: son aktif admin → 409");
}

// ── 6) recordWorkspaceView ──────────────────────────────────────────────────
// audit ok → ok, insert çağrıldı
{
  const ins: { calls: number; lastPayload?: Record<string, unknown> } = { calls: 0 };
  const db = mockDb(() => ({ data: null }), ins);
  const r = await recordWorkspaceView(db, SUPER_ID, "dddddddd-dddd-dddd-dddd-dddddddddddd", "client_analyses", { client_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" });
  ok(r.ok === true, "recordWorkspaceView: güvenli → ok");
  ok(ins.calls === 1, "recordWorkspaceView: audit insert 1");
  ok(ins.lastPayload?.action === "workspace_viewed", "recordWorkspaceView: action=workspace_viewed");
  ok(ins.lastPayload?.actor_admin_id === SUPER_ID, "recordWorkspaceView: actor doğru");
}
// yasaklı context (PII) → writeAdminAudit reddeder → fail-closed 500 + insert 0
{
  const ins = { calls: 0 };
  const db = mockDb(() => ({ data: null }), ins);
  const r = await recordWorkspaceView(db, SUPER_ID, null, "x", { email: "danisan@x.com" });
  ok(r.ok === false && r.status === 500, "recordWorkspaceView: yasaklı PII → fail-closed 500");
  ok(ins.calls === 0, "recordWorkspaceView: yasaklı PII → insert 0");
}

// ── 7) WORKSPACE FEATURE FLAG (fail-closed) ─────────────────────────────────
const superDbFlag = mockDb((t, s) => t === "users" && s.includes("is_super_admin") ? { data: { is_super_admin: true } } : { data: null });
const normalDbFlag = mockDb((t, s) => t === "users" && s.includes("is_super_admin") ? { data: { is_super_admin: false } } : { data: null });
const ENV = "ALLOW_SUPER_ADMIN_WORKSPACE_VIEW";
function setEnv(v: string | undefined): void { if (v === undefined) delete process.env[ENV]; else process.env[ENV] = v; }

// yalnız tam "true" + super → ok
setEnv("true");
ok(isSuperAdminWorkspaceViewEnabled() === true, "flag: env=true → enabled");
ok((await requireSuperAdminWorkspaceAccess(superDbFlag, SUPER_ID)).ok === true, "workspace: super + env=true → ok");
{ const r = await requireSuperAdminWorkspaceAccess(normalDbFlag, NORMAL_ID); ok(r.ok === false && r.status === 403, "workspace: normal admin + env=true → 403"); }

// eksik / boş / false / TRUE / 1 / yes → super olsa bile 403
for (const bad of [undefined, "", "false", "TRUE", "1", "yes", "True", " true "]) {
  setEnv(bad);
  ok(isSuperAdminWorkspaceViewEnabled() === false, `flag: env=${JSON.stringify(bad)} → disabled`);
  const r = await requireSuperAdminWorkspaceAccess(superDbFlag, SUPER_ID);
  ok(r.ok === false && r.status === 403, `workspace: super + env=${JSON.stringify(bad)} → 403 (fail-closed)`);
}
setEnv(undefined); // temizle

// env kontrolü MERKEZİ: helper'da var, 8 route'ta kopyalanmamış
const guardsSrc = readFileSync("lib/admin/adminGuards.ts", "utf8");
ok(guardsSrc.includes("ALLOW_SUPER_ADMIN_WORKSPACE_VIEW"), "flag: merkezi helper env'i okur");
const wsRoutes = [
  "app/api/admin/users/[id]/workspace/clients/route.ts",
  "app/api/admin/users/[id]/workspace/clients/[clientId]/route.ts",
  "app/api/admin/users/[id]/workspace/clients/[clientId]/analyses/route.ts",
  "app/api/admin/users/[id]/workspace/clients/[clientId]/notes/route.ts",
  "app/api/admin/users/[id]/workspace/clients/[clientId]/homeworks/route.ts",
  "app/api/admin/users/[id]/workspace/appointments/route.ts",
  "app/api/admin/numeroloji/records/route.ts",
  "app/api/admin/kisisel-arsiv/signed-url/route.ts",
];
for (const rf of wsRoutes) {
  const src = readFileSync(rf, "utf8");
  ok(!src.includes("ALLOW_SUPER_ADMIN_WORKSPACE_VIEW"), `flag: route env kopyası yok — ${rf.split("/").slice(-2).join("/")}`);
  ok(src.includes("requireSuperAdminWorkspaceAccess"), `flag: route merkezi gate'i kullanır — ${rf.split("/").slice(-2).join("/")}`);
}

// ── SONUÇ ───────────────────────────────────────────────────────────────────
console.log("");
console.log(`faz1-main-admin-authz harness: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) { console.log("Başarısızlar:", fails.join(" | ")); process.exit(1); }
console.log("✅ Tüm P1 guard + migration + audit testleri geçti.");
}

void run();
