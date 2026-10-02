/**
 * P1-4 — Beslenme + Yaşam Hafızası ÜYELİK kapısı harness'i (tsx; DB/ağ YOK).
 *
 * Gerçek guard'lar (lib/beslenme/clientPlanGuard.ts requireBeslenmePlanAccess,
 * lib/beslenme/ownerGuard.ts resolveBeslenmeCapabilities + requireBeslenmeFoodRead) ve bir YH
 * route'u (GET /api/yasam-hafizasi/config), global `fetch` üzerine kurulu SAHTE PostgREST
 * (bellek içi tablolar + touch_active_session RPC) ile koşar. Supabase'e/prod'a istek GİTMEZ.
 *
 * Matris:
 *   - premium beslenme uzmanı → bound/unbound plan 200 (module)
 *   - clients-only premium uzman → bound plan 200 (client) / unbound 404
 *   - trial / pro → 403 MEMBERSHIP_INACTIVE (plan lookup ÇALIŞMAZ)
 *   - pending / rejected / pasif → 403
 *   - admin (paket yok) → 200 (üyelik muaf)
 *   - demo (premium) → okuma 200, mutation denyDemoMutation 403
 *   - YH config: trial 403 MEMBERSHIP_INACTIVE, premium/admin 200
 *   - Statik: 8 YH route + 3 Beslenme kapısı hasMembershipAccessForRow içerir.
 *
 * Çalıştır: npx tsx scripts/final-hardening/beslenme-membership.harness.ts
 */
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake-supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

// ─── "server-only" stub (Next dışı tsx çalıştırması; hday.harness.ts deseni) ─────────────────
const STUBS: Record<string, string> = {
  "server-only": join(__dirname, "hday-stubs", "empty.cjs"),
};
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  M._resolveFilename = function (request: string, ...rest: unknown[]) {
    if (STUBS[request]) return STUBS[request];
    return orig.call(this, request, ...rest);
  };
}
const req = createRequire(__filename);
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.error(`  FAIL ${name}`);
  }
}
function section(t: string) {
  console.log(`\n── ${t} ──`);
}

// ─── Sahte PostgREST (bellek içi) ────────────────────────────────────────────
type Row = Record<string, unknown>;
const T1 = "10000000-0000-4000-8000-000000000001";
const TA = "10000000-0000-4000-8000-0000000000aa";
const TD = "10000000-0000-4000-8000-0000000000dd";
const C1 = "20000000-0000-4000-8000-000000000001";
const P_BOUND = "30000000-0000-4000-8000-000000000001";
const P_UNBOUND = "30000000-0000-4000-8000-000000000002";
const P_ADMIN = "30000000-0000-4000-8000-0000000000aa";
const P_DEMO = "30000000-0000-4000-8000-0000000000dd";
const F_BOUND = "40000000-0000-4000-8000-000000000001";
const F_UNBOUND = "40000000-0000-4000-8000-000000000002";

const U = {
  premium: "00000000-0000-4000-8000-000000000001",
  clientsOnly: "00000000-0000-4000-8000-000000000002",
  trial: "00000000-0000-4000-8000-000000000003",
  pro: "00000000-0000-4000-8000-000000000004",
  pending: "00000000-0000-4000-8000-000000000005",
  rejected: "00000000-0000-4000-8000-000000000006",
  inactive: "00000000-0000-4000-8000-000000000007",
  admin: "00000000-0000-4000-8000-000000000008",
  demo: "00000000-0000-4000-8000-000000000009",
  trialClients: "00000000-0000-4000-8000-00000000000a",
};

function user(id: string, extra: Row): Row {
  return {
    id, email: `${id.slice(-2)}@test.local`, name: "Uzman", full_name: null, role: "expert", status: "active",
    tenant_id: T1, active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: {}, is_demo_account: false, admin_level: null, membership_status: "active",
    subscription_status: null, trial_started_at: null, trial_ends_at: null, membership_started_at: null,
    membership_ends_at: null, ...extra,
  };
}

const tables: Record<string, Row[]> = {
  users: [
    user(U.premium, { module_permissions: { beslenme: true, yasam_hafizasi: true } }),
    user(U.clientsOnly, { module_permissions: { clients: true } }),
    user(U.trial, { package_type: "trial", plan: "trial", module_permissions: { beslenme: true, yasam_hafizasi: true } }),
    user(U.trialClients, { package_type: "trial", plan: "trial", module_permissions: { clients: true } }),
    user(U.pro, { package_type: "pro", plan: "pro", module_permissions: { beslenme: true } }),
    user(U.pending, { approval_status: "pending", module_permissions: { beslenme: true } }),
    user(U.rejected, { approval_status: "rejected", module_permissions: { beslenme: true } }),
    user(U.inactive, { active: false, module_permissions: { beslenme: true } }),
    user(U.admin, { role: "admin", tenant_id: TA, package_type: null, plan: null }),
    user(U.demo, { tenant_id: TD, is_demo_account: true, module_permissions: { beslenme: true } }),
  ],
  nutrition_plans: [
    { id: P_BOUND, tenant_id: T1, plan_family_id: F_BOUND, status: "draft" },
    { id: P_UNBOUND, tenant_id: T1, plan_family_id: F_UNBOUND, status: "draft" },
    { id: P_ADMIN, tenant_id: TA, plan_family_id: "40000000-0000-4000-8000-0000000000aa", status: "draft" },
    { id: P_DEMO, tenant_id: TD, plan_family_id: "40000000-0000-4000-8000-0000000000dd", status: "draft" },
  ],
  nutrition_plan_clients: [{ tenant_id: T1, plan_family_id: F_BOUND, client_id: C1 }],
  clients: [{ id: C1, tenant_id: T1, ad: "Test", soyad: "Danışan" }],
};
const sessions = new Map<string, string>(); // token → userId
for (const id of Object.values(U)) sessions.set(`tok-${id}`, id);

const reads: string[] = [];

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
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.host !== "fake-supabase.local") throw new Error(`Beklenmeyen ağ isteği: ${url.href}`);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    if (name === "touch_active_session") return jsonRes(sessions.get(String(body?.p_token ?? "")) ?? null);
    return jsonRes({ code: "PGRST202", message: "not found" }, 404);
  }
  if (method !== "GET" && method !== "HEAD") return jsonRes({ message: "read-only fake" }, 400);
  reads.push(path);
  const rows = tables[path] ?? [];
  const filters = parseFilters(url);
  return jsonRes(rows.filter((r) => filters.every((f) => f(r))));
}) as typeof fetch;

// ─── Gerçek modüller (stub kancasından SONRA yüklenir) ────────────────────────
const { NextRequest } = req("next/server") as typeof import("next/server");
const planGuard = req("../../lib/beslenme/clientPlanGuard.ts") as typeof import("../../lib/beslenme/clientPlanGuard");
const ownerGuard = req("../../lib/beslenme/ownerGuard.ts") as typeof import("../../lib/beslenme/ownerGuard");
const planFormat = req("../../app/beslenme/planlar/_components/planFormat.ts") as typeof import("../../app/beslenme/planlar/_components/planFormat");
const yhConfig = req("../../app/api/yasam-hafizasi/config/route.ts") as { GET: (r: unknown) => Promise<Response> };

function authed(userId: string, url = "http://localhost/api/beslenme/x") {
  return new NextRequest(url, { headers: { "x-user-id": userId, "x-session-token": `tok-${userId}` } });
}
async function codeOf(res: Response): Promise<string | undefined> {
  const j = (await res.clone().json().catch(() => ({}))) as { code?: string };
  return j.code;
}

async function run() {
  section("Plan erişimi (requireBeslenmePlanAccess)");
  {
    let r = await planGuard.requireBeslenmePlanAccess(authed(U.premium), P_BOUND);
    ok(r.ok && r.authority === "module" && r.boundClientId === C1, "premium beslenme uzmanı → bound plan 200 (module)");
    r = await planGuard.requireBeslenmePlanAccess(authed(U.premium), P_UNBOUND);
    ok(r.ok && r.authority === "module" && r.boundClientId === null, "premium beslenme uzmanı → unbound plan 200 (module)");
    r = await planGuard.requireBeslenmePlanAccess(authed(U.premium), P_ADMIN);
    ok(!r.ok && r.response.status === 404, "premium uzman → başka tenant planı 404");

    r = await planGuard.requireBeslenmePlanAccess(authed(U.clientsOnly), P_BOUND);
    ok(r.ok && r.authority === "client" && r.boundClientId === C1, "clients-only premium → bound plan 200 (client)");
    r = await planGuard.requireBeslenmePlanAccess(authed(U.clientsOnly), P_UNBOUND);
    ok(!r.ok && r.response.status === 404 && (await codeOf(r.response)) === "PLAN_NOT_FOUND", "clients-only premium → unbound plan 404");

    for (const [label, id] of [["trial", U.trial], ["pro", U.pro], ["trial clients-only", U.trialClients]] as const) {
      reads.length = 0;
      r = await planGuard.requireBeslenmePlanAccess(authed(id), P_BOUND);
      ok(!r.ok && r.response.status === 403 && (await codeOf(r.response)) === "MEMBERSHIP_INACTIVE", `${label} → 403 MEMBERSHIP_INACTIVE`);
      ok(!reads.includes("nutrition_plans") && !reads.includes("nutrition_plan_clients"),
        `${label} → plan lookup ÇALIŞMADI (varlık sinyali yok)`);
      ok(!r.ok && r.response.headers.get("cache-control") === "no-store", `${label} → no-store`);
    }
    for (const [label, id] of [["pending", U.pending], ["rejected", U.rejected], ["pasif", U.inactive]] as const) {
      r = await planGuard.requireBeslenmePlanAccess(authed(id), P_BOUND);
      ok(!r.ok && r.response.status === 403, `${label} → 403`);
    }
    r = await planGuard.requireBeslenmePlanAccess(authed(U.admin), P_ADMIN);
    ok(r.ok && r.authority === "module", "admin (paket yok) → kendi tenant planı 200 (üyelik muaf)");
    r = await planGuard.requireBeslenmePlanAccess(authed(U.admin), P_BOUND);
    ok(!r.ok && r.response.status === 404, "admin → uzman tenant planı 404 (admin-widening yok)");

    r = await planGuard.requireBeslenmePlanAccess(authed(U.demo), P_DEMO);
    ok(r.ok && r.is_demo_account === true, "demo (premium) → okuma 200");
    ok(r.ok && ownerGuard.denyDemoMutation(r)?.status === 403, "demo → mutation denyDemoMutation 403");
    const anon = await planGuard.requireBeslenmePlanAccess(new NextRequest("http://localhost/x"), P_BOUND);
    ok(!anon.ok && anon.response.status === 401, "kimliksiz → 401");
  }

  section("Capability (resolveBeslenmeCapabilities) + Food READ (requireBeslenmeFoodRead)");
  {
    let c = await ownerGuard.resolveBeslenmeCapabilities(authed(U.premium));
    ok(c.ok && c.hasBeslenme === true, "premium → capabilities 200");
    c = await ownerGuard.resolveBeslenmeCapabilities(authed(U.clientsOnly));
    ok(c.ok && c.hasBeslenme === false && c.hasClients === true, "clients-only premium → capabilities 200 (clients)");
    c = await ownerGuard.resolveBeslenmeCapabilities(authed(U.admin));
    ok(c.ok && c.hasBeslenme === true, "admin → capabilities 200");
    c = await ownerGuard.resolveBeslenmeCapabilities(authed(U.demo));
    ok(c.ok, "demo → capabilities 200");
    for (const [label, id] of [["trial", U.trial], ["pro", U.pro]] as const) {
      c = await ownerGuard.resolveBeslenmeCapabilities(authed(id));
      ok(!c.ok && c.response.status === 403 && (await codeOf(c.response)) === "MEMBERSHIP_INACTIVE", `${label} → capabilities 403 MEMBERSHIP_INACTIVE`);
      const f = await ownerGuard.requireBeslenmeFoodRead(authed(id));
      ok(!f.ok && f.response.status === 403 && (await codeOf(f.response)) === "MEMBERSHIP_INACTIVE", `${label} → food read 403 MEMBERSHIP_INACTIVE`);
    }
    for (const [label, id] of [["pending", U.pending], ["rejected", U.rejected], ["pasif", U.inactive]] as const) {
      const f = await ownerGuard.requireBeslenmeFoodRead(authed(id));
      ok(!f.ok && f.response.status === 403, `${label} → food read 403`);
    }
    let f = await ownerGuard.requireBeslenmeFoodRead(authed(U.premium));
    ok(f.ok, "premium → food read 200");
    f = await ownerGuard.requireBeslenmeFoodRead(authed(U.clientsOnly));
    ok(f.ok, "clients-only premium → food read 200");
    f = await ownerGuard.requireBeslenmeFoodRead(authed(U.admin));
    ok(f.ok, "admin → food read 200");
    f = await ownerGuard.requireBeslenmeFoodRead(authed(U.demo));
    ok(f.ok, "demo → food read 200");
  }

  section("UI hata eşlemesi (planFormat.friendlyPlanError)");
  {
    const msg = planFormat.friendlyPlanError("MEMBERSHIP_INACTIVE", 403);
    ok(/Üyeliğiniz aktif değil/.test(msg), "MEMBERSHIP_INACTIVE → üyelik mesajı (genel 'yetkiniz yok' değil)");
  }

  section("Yaşam Hafızası (GET /api/yasam-hafizasi/config)");
  {
    let res = await yhConfig.GET(authed(U.trial, "http://localhost/api/yasam-hafizasi/config"));
    ok(res.status === 403 && (await codeOf(res)) === "MEMBERSHIP_INACTIVE", "trial (YH izinli) → 403 MEMBERSHIP_INACTIVE");
    res = await yhConfig.GET(authed(U.premium, "http://localhost/api/yasam-hafizasi/config"));
    ok(res.status === 200, "premium (YH izinli) → 200");
    res = await yhConfig.GET(authed(U.admin, "http://localhost/api/yasam-hafizasi/config"));
    ok(res.status === 200, "admin → 200");
    res = await yhConfig.GET(authed(U.clientsOnly, "http://localhost/api/yasam-hafizasi/config"));
    ok(res.status === 403 && (await codeOf(res)) === "YH_MODULE_FORBIDDEN", "premium ama YH izni yok → 403 YH_MODULE_FORBIDDEN (mevcut kapı korunur)");
  }

  section("Statik: üyelik kapısı yüzeyleri");
  {
    const YH_ROUTES = [
      "app/api/yasam-hafizasi/health/route.ts",
      "app/api/yasam-hafizasi/config/route.ts",
      "app/api/yasam-hafizasi/search/route.ts",
      "app/api/yasam-hafizasi/client-search/route.ts",
      "app/api/yasam-hafizasi/archive-classification/route.ts",
      "app/api/yasam-hafizasi/documents/promote/route.ts",
      "app/api/clients/[id]/yasam-hafizasi/search/route.ts",
      "app/api/clients/[id]/yasam-hafizasi/snapshots/route.ts",
    ];
    for (const p of YH_ROUTES) {
      const s = read(p);
      const gate = s.indexOf("hasMembershipAccessForRow(guard.profile ?? {})");
      const modGate = s.indexOf('hasModulePermissionForProfile(profile, "yasam_hafizasi")');
      ok(gate > -1 && /membershipInactiveResponse\(\)/.test(s) && modGate > gate, `${p}: üyelik kapısı modül kapısından ÖNCE`);
    }
    const pg = read("lib/beslenme/clientPlanGuard.ts");
    ok(/verifyUserRequest\(/.test(pg) && pg.indexOf("hasMembershipAccessForRow(") < pg.indexOf('from("nutrition_plans")'),
      "plan guard: verifyUserRequest korunur + üyelik plan lookup'tan önce");
    const og = read("lib/beslenme/ownerGuard.ts");
    ok((og.match(/hasMembershipAccessForRow\(guard\.profile \?\? \{\}\)/g) ?? []).length === 2, "ownerGuard: capabilities + food read üyelik kapısı (2)");
    const ug = read("lib/auth/userGuard.ts");
    ok(/export function membershipInactiveResponse\(\)/.test(ug) && /response: membershipInactiveResponse\(\)/.test(ug),
      "userGuard: membershipInactiveResponse export + requireModuleAccess aynı yanıtı kullanır");
  }

  console.log(`\nbeslenme-membership: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) {
    for (const f of fails) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
