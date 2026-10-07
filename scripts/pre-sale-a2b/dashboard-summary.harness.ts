/**
 * AŞAMA 2B — GET /api/dashboard/summary harness (gerçek route handler; DB/prod YOK).
 *
 * Çalıştır: npx tsx scripts/pre-sale-a2b/dashboard-summary.harness.ts
 *
 * Süreç içi sahte PostgREST (127.0.0.1, rastgele port) → route'un service-role client'ı ona bağlanır.
 * Doğrulananlar:
 *   - token/oturum yok veya geçersiz → 401; token başka kullanıcıya ait → 403 (binding)
 *   - üyeliği biten uzman → 403
 *   - modül izni olmayan sayaç → null, recent → [] (tabloya SORGU ATILMAZ)
 *   - izinli sayaç/recent her sorguda tenant_id=eq.<oturum tenant'ı> (istemciden tenant ALINMAZ)
 *   - admin → tüm sayaçlar; tek tablo hatası → yalnız o alan null (diğerleri döner)
 *   - yanıt no-store; ham satır yerine yalnız {label, created_at}
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

type Row = Record<string, unknown>;
const TENANT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const TENANT_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const USERS: Record<string, Row> = {
  "u-expert": {
    id: "u-expert", email: "zz-e@example.invalid", role: "expert", active: true, approval_status: "approved",
    package_type: "premium", tenant_id: TENANT_A, is_demo_account: false,
    module_permissions: { stones: true, sifa_rehberi: false, personal_archive: true },
  },
  "u-expired": {
    id: "u-expired", email: "zz-x@example.invalid", role: "expert", active: true, approval_status: "approved",
    package_type: "free", tenant_id: TENANT_A, is_demo_account: false,
    module_permissions: { stones: true },
  },
  "u-admin": {
    id: "u-admin", email: "zz-a@example.invalid", role: "admin", active: true, approval_status: "approved",
    package_type: "premium", tenant_id: TENANT_B, is_demo_account: false, module_permissions: {},
  },
};
const TOKENS: Record<string, string> = { "tok-expert": "u-expert", "tok-expired": "u-expired", "tok-admin": "u-admin" };
const COUNTS: Record<string, number> = { stones: 7, dogaltas_inventory: 4, healing_guides: 3, personal_archives: 2 };
let failTable: string | null = null;
const tableQueries: Array<{ table: string; query: string }> = [];

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (url.pathname === "/rest/v1/rpc/touch_active_session") {
      const a = JSON.parse(raw || "{}") as { p_token?: string };
      return send(200, TOKENS[String(a.p_token)] ?? null);
    }
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (!m) return send(404, { message: "fake: not implemented" });
    const table = m[1];
    if (table === "users") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      const row = USERS[id];
      const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return row ? send(200, row) : send(406, { code: "PGRST116", message: "0 rows" });
      return send(200, row ? [row] : []);
    }
    tableQueries.push({ table, query: url.search });
    if (table === failTable) return send(500, { code: "XX000", message: "fake failure" });
    if (req.method === "HEAD") {
      res.writeHead(200, { "content-range": `*/${COUNTS[table] ?? 0}` });
      return res.end();
    }
    const col = table === "stones" ? "stone_name" : "title";
    return send(200, [
      { [col]: `${table} kayıt 1`, created_at: "2026-10-07T10:00:00Z", secret_col: "MUST_NOT_LEAK" },
    ]);
  });
});

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.error(`  ❌ ${name}`); }
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-publishable";

  const { NextRequest } = await import("next/server");
  const { GET } = await import("../../app/api/dashboard/summary/route");
  const call = async (headers: Record<string, string>) => {
    const res = await GET(new NextRequest("http://localhost/api/dashboard/summary?tenant_id=" + TENANT_B, { headers }));
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body, cache: res.headers.get("cache-control") };
  };

  console.log("AŞAMA 2B — dashboard/summary");
  ok("token yok → 401", (await call({ "x-user-id": "u-expert" })).status === 401);
  ok("başkasının token'ı (binding) → 403", (await call({ "x-user-id": "u-expert", "x-session-token": "tok-admin" })).status === 403);
  ok("bilinmeyen token → 401", (await call({ "x-user-id": "u-expert", "x-session-token": "tok-nope" })).status === 401);
  ok("üyeliği aktif olmayan uzman → 403", (await call({ "x-user-id": "u-expired", "x-session-token": "tok-expired" })).status === 403);

  tableQueries.length = 0;
  const e = await call({ "x-user-id": "u-expert", "x-session-token": "tok-expert" });
  const counts = e.body.counts as Record<string, number | null>;
  const recent = e.body.recent as Record<string, Array<Record<string, unknown>>>;
  ok("uzman → 200 + no-store", e.status === 200 && e.cache === "no-store");
  ok("izinli: stones=7, stok=4 (gate stones), arşiv=2", counts.stones === 7 && counts.stok === 4 && counts.digital_content === 2);
  ok("izinsiz Şifa Rehberi → null", counts.sifa_rehberi === null);
  ok("izinsiz tabloya sorgu ATILMADI (healing_guides)", !tableQueries.some((q) => q.table === "healing_guides"));
  ok(
    "her tablo sorgusu oturum tenant'ı ile (query'deki tenant_id=B yok sayıldı)",
    tableQueries.length > 0 && tableQueries.every((q) => q.query.includes(`tenant_id=eq.${TENANT_A}`) && !q.query.includes(TENANT_B)),
  );
  ok("recent: yalnız {label, created_at}; ham kolon sızmaz", JSON.stringify(recent).includes("stones kayıt 1") && !JSON.stringify(e.body).includes("MUST_NOT_LEAK"));
  ok("recent stones + personal_archives dolu", (recent.stones?.length ?? 0) === 1 && (recent.personal_archives?.length ?? 0) === 1);

  tableQueries.length = 0;
  const a = await call({ "x-user-id": "u-admin", "x-session-token": "tok-admin" });
  const ac = a.body.counts as Record<string, number | null>;
  ok("admin → tüm sayaçlar (Şifa dahil)", a.status === 200 && ac.sifa_rehberi === 3 && ac.stones === 7);
  ok("admin sorguları kendi tenant'ı (B)", tableQueries.every((q) => q.query.includes(`tenant_id=eq.${TENANT_B}`)));

  failTable = "dogaltas_inventory";
  const f = await call({ "x-user-id": "u-admin", "x-session-token": "tok-admin" });
  const fc = f.body.counts as Record<string, number | null>;
  ok("tek tablo hatası → yalnız o alan null, yanıt 200", f.status === 200 && fc.stok === null && fc.stones === 7);
  ok("hata ham mesajı yanıta sızmaz", !JSON.stringify(f.body).includes("fake failure"));
  failTable = null;

  server.close();
  console.log(`\nAŞAMA 2B dashboard/summary: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
