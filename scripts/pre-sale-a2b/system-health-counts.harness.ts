/**
 * AŞAMA 2B — GET /api/admin/system-health/counts (appointments allowlist) harness.
 *
 * Çalıştır: npx tsx scripts/pre-sale-a2b/system-health-counts.harness.ts
 *
 * Süreç içi sahte PostgREST; gerçek route handler. Doğrulananlar:
 *   - admin değilse / oturum yoksa → reddedilir (veri yok)
 *   - ?metric=appointments allowlist'te → { total, tenants:{tenant:count}, nullTenantRows }
 *   - tablo adı istekten ALINMAZ: bilinmeyen metric (ör. users, appointments;drop) → 400, tabloya sorgu yok
 *   - yanıtta satır içeriği/PII yok (yalnız tenant_id sayımları)
 */
import http from "node:http";
import Module from "node:module";
import path from "node:path";
import type { AddressInfo } from "node:net";

// "server-only" yalnız bu süreçte boş modüle yönlendirilir (Next dışı çalıştırma; mevcut harness deseni).
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const ADMIN = "aaaaaaaa-0000-4000-8000-0000000000ad";
const EXPERT = "eeeeeeee-0000-4000-8000-0000000000e1";
const TOKENS: Record<string, string> = { "tok-admin-123456789": ADMIN, "tok-expert-123456789": EXPERT };
const USERS: Record<string, Record<string, unknown>> = {
  [ADMIN]: { id: ADMIN, role: "admin", active: true, tenant_id: "tttttttt-0000-4000-8000-0000000000a1", email: "zz-a@example.invalid" },
  [EXPERT]: { id: EXPERT, role: "expert", active: true, tenant_id: "tttttttt-0000-4000-8000-0000000000e1", email: "zz-e@example.invalid" },
};
const APPTS = [
  { tenant_id: "tenant-1", title: "PII_SHOULD_NOT_LEAK" },
  { tenant_id: "tenant-1", title: "x" },
  { tenant_id: "tenant-2", title: "y" },
  { tenant_id: null, title: "z" },
];
const tableHits: string[] = [];

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (s: number, b: unknown, h: Record<string, string> = {}) => { res.writeHead(s, { "content-type": "application/json", ...h }); res.end(b === undefined ? "" : JSON.stringify(b)); };
    if (url.pathname === "/rest/v1/rpc/touch_active_session") {
      const a = JSON.parse(raw || "{}") as { p_token?: string };
      return send(200, TOKENS[String(a.p_token)] ?? null);
    }
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (!m) return send(404, { message: "fake" });
    const table = m[1];
    if (table === "users") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      const row = USERS[id];
      const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return row ? send(200, row) : send(406, { code: "PGRST116" });
      return send(200, row ? [row] : []);
    }
    tableHits.push(table);
    if (table !== "appointments") return send(200, []);
    const select = url.searchParams.get("select") ?? "";
    const rows = APPTS.map((r) => (select.includes("title") || select === "*" ? r : { tenant_id: r.tenant_id }));
    if (req.method === "HEAD") { res.writeHead(200, { "content-range": `*/${rows.length}` }); return res.end(); }
    const total = rows.length;
    return send(200, rows, { "content-range": `0-${Math.max(total - 1, 0)}/${total}` });
  });
});

let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.error(`  ❌ ${n} ${d}`); } };

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-publishable";
  const { NextRequest } = await import("next/server");
  const { GET } = await import("../../app/api/admin/system-health/counts/route");
  const call = async (q: string, headers: Record<string, string>) => {
    const res = await GET(new NextRequest(`http://localhost/api/admin/system-health/counts${q}`, { headers }));
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const adminH = { "x-admin-id": ADMIN, "x-session-token": "tok-admin-123456789" };

  console.log("AŞAMA 2B — system-health/counts");
  ok("oturumsuz → reddedildi", (await call("?metric=appointments", {})).status >= 400);
  const ex = await call("?metric=appointments", { "x-admin-id": EXPERT, "x-session-token": "tok-expert-123456789" });
  ok("uzman (admin değil) → reddedildi, veri yok", ex.status >= 400 && ex.body.tenants === undefined, String(ex.status));

  tableHits.length = 0;
  const a = await call("?metric=appointments", adminH);
  ok("admin + appointments → 200", a.status === 200, JSON.stringify(a.body));
  ok("yalnız agrege: total=4, tenant-1=2, tenant-2=1, null=1", a.body.total === 4 && (a.body.tenants as Record<string, number>)?.["tenant-1"] === 2 && (a.body.tenants as Record<string, number>)?.["tenant-2"] === 1 && a.body.nullTenantRows === 1, JSON.stringify(a.body));
  ok("satır içeriği/PII yanıtta yok", !JSON.stringify(a.body).includes("PII_SHOULD_NOT_LEAK"));
  ok("yalnız appointments tablosu sorgulandı", tableHits.length > 0 && tableHits.every((t) => t === "appointments"), tableHits.join(","));

  for (const bad of ["users", "user_sessions", "appointments;drop", "APPOINTMENTS"]) {
    tableHits.length = 0;
    const r = await call(`?metric=${encodeURIComponent(bad)}`, adminH);
    ok(`bilinmeyen metric '${bad}' → 400, tabloya sorgu yok`, r.status === 400 && tableHits.length === 0, `${r.status} ${tableHits.join(",")}`);
  }
  for (const m of ["clients", "personal_archives", "stones"]) {
    ok(`mevcut allowlist korunuyor: ${m} → 200`, (await call(`?metric=${m}`, adminH)).status === 200);
  }

  await new Promise<void>((r) => server.close(() => r()));
  console.log(`\nAŞAMA 2B system-health/counts: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); server.close(); process.exit(1); });
