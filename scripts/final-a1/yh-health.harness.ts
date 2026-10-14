/**
 * Final-A1 #12 — Yaşam Hafızası kart durumu: "Hazırlanıyor" YALNIZ gerçekten bekleyen aktarım varken.
 * Route (GET /api/yasam-hafizasi/health) sahte DB ile gerçekten çağrılır + saf durum türetici.
 * DB/ağ YOK. Çalıştır: npx tsx scripts/final-a1/yh-health.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stubs: Record<string, string> = {
    "@/lib/auth/userGuard": path.join(process.cwd(), "scripts/final-a1/stubs/yh-userGuard.cjs"),
    "@/lib/yasam-hafizasi/flags": path.join(process.cwd(), "scripts/final-a1/stubs/yh-flags.cjs"),
    "server-only": path.join(process.cwd(), "scripts/final-hardening/hday-stubs/empty.cjs"),
  };
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (stubs[req]) return stubs[req];
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`); }
}

type Q = { table: string; filters: [string, string, unknown][] };
/** Sahte supabase-js: yalnız head-count zinciri (from→select→eq/in→await). */
function fakeDb(answer: (q: Q) => { count: number | null; error: unknown }, log: Q[]) {
  return {
    from(table: string) {
      const q: Q = { table, filters: [] };
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => { q.filters.push(["eq", c, v]); return chain; },
        in: (c: string, v: unknown) => { q.filters.push(["in", c, v]); return chain; },
        then: (res: (v: unknown) => unknown) => { log.push(q); return Promise.resolve(answer(q)).then(res); },
      };
      return chain;
    },
  };
}

const TENANT = "aaaaaaaa-0000-4000-8000-0000000000a1";
const PROFILE = { role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  module_permissions: { yasam_hafizasi: true } };

async function health(indexCount: number | null, pending: number | null, opts: { indexError?: boolean; pendingError?: boolean } = {}) {
  const log: Q[] = [];
  (globalThis as Record<string, unknown>).__yhFake = {
    tenantId: TENANT,
    profile: PROFILE,
    db: fakeDb((q) => {
      if (q.table === "yasam_hafizasi_index") return opts.indexError ? { count: null, error: { message: "x" } } : { count: indexCount, error: null };
      if (q.table === "yasam_hafizasi_outbox") return opts.pendingError ? { count: null, error: { message: "x" } } : { count: pending, error: null };
      throw new Error(`beklenmeyen tablo ${q.table}`);
    }, log),
  };
  const route = await import("../../app/api/yasam-hafizasi/health/route");
  const res = await route.GET(new NextRequest("http://localhost/api/yasam-hafizasi/health"));
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, log };
}

async function main() {
  const { deriveYhCardStatus, deriveYhWorkspaceState, YH_EMPTY_READY_TEXT } = await import("../../lib/yasam-hafizasi/ui/healthStatus");

  console.log("[1] processing — indeks boş + bekleyen aktarım");
  {
    const h = await health(0, 3);
    const outboxQ = h.log.find((q) => q.table === "yasam_hafizasi_outbox");
    ok(h.status === 200 && h.json.tenantRows === 0 && h.json.tenantPending === 3, "route: tenantRows=0, tenantPending=3", h.json);
    ok(JSON.stringify(outboxQ?.filters) === JSON.stringify([["eq", "tenant_id", TENANT], ["in", "status", ["pending", "processing"]]]),
      "outbox sayımı YALNIZ bu tenant + pending/processing", outboxQ);
    const c = deriveYhCardStatus(h.json as never);
    ok(c.kind === "preparing" && c.text === "Hazırlanıyor", "kart: Hazırlanıyor", c);
    ok(deriveYhWorkspaceState(h.json as never) === "index-empty", "çalışma alanı: index-empty (hazırlanıyor)");
  }

  console.log("[2] ready + data");
  {
    const h = await health(12, 99);
    ok(h.status === 200 && h.json.tenantRows === 12 && !("tenantPending" in h.json), "route: 12 kayıt, outbox SORGULANMAZ", h.json);
    ok(!h.log.some((q) => q.table === "yasam_hafizasi_outbox"), "kayıt varken ek outbox sorgusu yok");
    const c = deriveYhCardStatus(h.json as never);
    ok(c.kind === "ready" && c.text === "12 kayıt hazır", "kart: 12 kayıt hazır", c);
    ok(deriveYhWorkspaceState(h.json as never) === "ready", "çalışma alanı: ready");
  }

  console.log("[3] ready + zero data (yeni/boş uzman)");
  {
    const h = await health(0, 0);
    ok(h.status === 200 && h.json.tenantRows === 0 && h.json.tenantPending === 0, "route: 0 kayıt, 0 bekleyen", h.json);
    const c = deriveYhCardStatus(h.json as never);
    ok(c.kind === "empty" && c.text === YH_EMPTY_READY_TEXT && (c.text as string) !== "Hazırlanıyor", `kart: "${YH_EMPTY_READY_TEXT}" (Hazırlanıyor DEĞİL)`, c);
    ok(deriveYhWorkspaceState(h.json as never) === "index-ready-empty", "çalışma alanı: index-ready-empty");
    // Bekleyen sayısı okunamadıysa da işlem İDDİA EDİLMEZ.
    const hErr = await health(0, null, { pendingError: true });
    ok(hErr.status === 200 && !("tenantPending" in hErr.json), "outbox okunamadı → alan yok", hErr.json);
    ok(deriveYhCardStatus(hErr.json as never).kind === "empty", "bekleyen bilinmiyor → boş-hazır (Hazırlanıyor DEĞİL)");
  }

  console.log("[4] error");
  {
    const h = await health(null, null, { indexError: true });
    ok(h.status === 200 && h.json.accessible === false, "route: indeks okunamadı → accessible:false", h.json);
    ok(!h.log.some((q) => q.table === "yasam_hafizasi_outbox"), "indeks hatasında outbox sorgusu yok");
    const c = deriveYhCardStatus(h.json as never);
    ok(c.kind === "unavailable" && c.text === "—", "kart: — (hazır/hazırlanıyor iddiası yok)", c);
    ok(deriveYhCardStatus(null).kind === "unavailable" && deriveYhCardStatus({ ok: false } as never).kind === "unavailable", "ağ/403 → unavailable");
    ok(deriveYhCardStatus(undefined).kind === "loading", "yanıt bekleniyor → loading");
  }

  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
  process.exit(fail === 0 ? 0 : 1);
}
void main();
