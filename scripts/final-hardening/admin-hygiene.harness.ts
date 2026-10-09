/**
 * AŞAMA 2 §2.2 — Admin / platform ayrıcalıklı erişim hijyeni (AA-1..AA-6) harness'i.
 * tsx; DB/ağ YOK. Statik kaynak kontrolleri + saf handler/sayım davranışı.
 *
 *   AA-1  admin YH index-page + reconcile: requireMainAdmin + writeAdminAudit (çalıştırmadan ÖNCE,
 *         mevcut CHECK'teki "main_admin_critical_action"), exact-mode generic sonuç.
 *   AA-2  sistem-sağlığı + toplu-veri: tarayıcı publishable client YOK; sunucu route'ları
 *         verifyAdminRequest (+ toplu-veri: resolveAdminOwnTenant) ile.
 *   AA-3  word-report alt sorguları tenant filtresi.
 *   AA-4  numeroloji tenant-metrics → {tenant_id: count}.
 *   AA-5  admin support/tenants ham error.message YOK.
 *   AA-6  7 rapor route'u kendi service_role client'ını KURMAZ (guard.db).
 *
 * Çalıştır: npx tsx scripts/final-hardening/admin-hygiene.harness.ts
 */
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

import {
  handleAdminIndexRequest,
  toSafeExactStatus,
  type AdminIndexHandlerDeps,
} from "../../lib/yasam-hafizasi/indexer/adminIndexRequest";
import type { IndexSourcePageResult, ExactWriteStatus } from "../../lib/yasam-hafizasi/indexer/indexSourcePage";
import { ADMIN_AUDIT_ACTIONS, assertAuditFieldSafe } from "../../lib/admin/adminAudit";

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

const PUBLISHABLE_IMPORT = /from\s+["']@\/lib\/supabase["']/;

async function run() {
  section("AA-1 · admin YH index-page / reconcile");
  {
    const idx = read("app/api/admin/yasam-hafizasi/index-page/route.ts");
    ok(/requireMainAdmin\(db, adminId\)/.test(idx), "index-page: requireMainAdmin");
    ok(/writeAdminAudit\(db,/.test(idx) && /action: "main_admin_critical_action"/.test(idx) && /operation: "yh_index_admin_run"/.test(idx),
      "index-page: writeAdminAudit (main_admin_critical_action + operation)");
    ok(/scoped_tenant_id:/.test(idx) && /expected_tenant_id:/.test(idx) && /exact_source_id:/.test(idx),
      "index-page: audit metadata tenant/kaynak id'leri içerir");
    ok(idx.indexOf("requireMainAdmin(") < idx.indexOf("writeAdminAudit(") &&
       idx.indexOf("writeAdminAudit(") < idx.indexOf("handleAdminIndexRequest(raw, deps)"),
      "index-page: sıra = ana-admin → audit → indeks (audit fail-closed önce)");
    ok(/audit-unavailable/.test(idx), "index-page: audit yazılamazsa 503 audit-unavailable (fail-closed)");
    const rec = read("app/api/admin/yasam-hafizasi/reconcile/route.ts");
    ok(/requireMainAdmin\(guard\.db, guard\.adminId\)/.test(rec), "reconcile: requireMainAdmin");
    ok(/writeAdminAudit\(guard\.db,/.test(rec) && /operation: "yh_reconcile_admin_run"/.test(rec) &&
       rec.indexOf("writeAdminAudit(") < rec.indexOf("runReconcileDryRun("),
      "reconcile: dry-run öncesi writeAdminAudit");
    ok((ADMIN_AUDIT_ACTIONS as readonly string[]).includes("main_admin_critical_action"),
      "audit action mevcut CHECK allowlist'inde (migration gerekmez)");
    let ctxSafe = true;
    try {
      assertAuditFieldSafe({
        operation: "yh_index_admin_run", source_key: "x", mode: "dry-run", limit: 1, cursor_present: false,
        scoped_tenant_id: null, expected_tenant_id: null, exact_source_id: null, page_size: 1,
      }, "context");
    } catch {
      ctxSafe = false;
    }
    ok(ctxSafe, "audit context anahtarları yasaklı-anahtar taramasından geçer");

    // Exact-mode generic sonuç (davranış).
    const EXACT = "11111111-1111-4111-8111-111111111111";
    const TENANT = "22222222-2222-4222-8222-222222222222";
    const mkResult = (status: ExactWriteStatus, fetched: number, excludedDemo = 0): IndexSourcePageResult =>
      ({
        sourceKey: "biyoenerji:symbols", mode: "dry-run", fetched, eligibleUnits: status === "ok" ? 1 : 0,
        excludedDemo, excludedSynthetic: 0, summary: { units: status === "ok" ? 1 : 0, skipped: 0, byReason: {} },
        nextCursor: null, hasMore: false, parentStats: { requested: 0, found: 0, missing: 0 },
        write: null, exactMode: true, exactStatus: status,
      }) as unknown as IndexSourcePageResult;
    const deps = (res: IndexSourcePageResult): AdminIndexHandlerDeps => ({
      adminId: "33333333-3333-4333-8333-333333333333",
      checkAdminDemoStatus: async () => ({ ok: true, isDemo: false }),
      runIndexSourcePage: async () => res,
    });
    const body = { sourceKey: "biyoenerji:symbols", mode: "dry-run", exactSourceId: EXACT, expectedTenantId: TENANT };
    const bodies: string[] = [];
    for (const [st, fetched, demo] of [
      ["not-found", 0, 0], ["tenant-mismatch", 1, 0], ["excluded-demo", 1, 1], ["multiple-rows", 2, 0], ["row-ineligible", 1, 0],
    ] as const) {
      const out = await handleAdminIndexRequest(body, deps(mkResult(st, fetched, demo)));
      const b = out.body as { ok: boolean; page?: { exactStatus: unknown; fetched: number; excludedDemo: number } };
      ok(out.status === 200 && b.ok === true && b.page?.exactStatus === "not-eligible" && b.page.fetched === 0 && b.page.excludedDemo === 0,
        `exact dry-run ${st} → generic not-eligible + sıfır sayaç`);
      bodies.push(JSON.stringify(out.body));
    }
    ok(new Set(bodies).size === 1, "exact dry-run: tüm uygun-değil durumları BİREBİR aynı yanıt (var/yok sinyali yok)");
    const okOut = await handleAdminIndexRequest(body, deps(mkResult("ok", 1)));
    ok((okOut.body as { page?: { exactStatus: unknown } }).page?.exactStatus === "ok", "exact dry-run ok → 'ok'");
    ok(toSafeExactStatus(null) === null && toSafeExactStatus("tenant-mismatch") === "not-eligible", "toSafeExactStatus saf eşleme");
  }

  section("AA-2 · sistem-sağlığı + toplu-veri tarayıcı client'ı yok");
  {
    const files = [
      "app/admin/sistem-sagligi/detail-shared.tsx",
      "app/admin/sistem-sagligi/arsiv/page.tsx",
      "app/admin/sistem-sagligi/danisanlar/page.tsx",
      "app/admin/sistem-sagligi/dogaltas/page.tsx",
      "app/admin/sistem-sagligi/hatalar/page.tsx",
      "app/admin/sistem-sagligi/yedekler/page.tsx",
      "app/admin/sistem-sagligi/numeroloji/page.tsx",
      "app/admin/sistem-sagligi/page.tsx",
      "app/admin/toplu-veri/page.tsx",
    ];
    for (const f of files) {
      const s = read(f);
      ok(!PUBLISHABLE_IMPORT.test(s) && !/\bsupabase\s*\.\s*from\(/.test(s), `${f}: publishable client importu / supabase.from YOK`);
    }
    const ds = read("app/admin/sistem-sagligi/detail-shared.tsx");
    ok(/\/api\/admin\/system-health\/counts\?metric=/.test(ds) && /\/api\/admin\/system-health\/counts\?probe=/.test(ds),
      "detail-shared: sayım/yoklama sunucu route'undan");
    const counts = read("app/api/admin/system-health/counts/route.ts");
    ok(/verifyAdminRequest\(req\)/.test(counts), "system-health/counts: verifyAdminRequest");
    ok(/METRIC_TABLES = \{/.test(counts) && /clients: "clients"/.test(counts) && /personal_archives: "personal_archives"/.test(counts) && /stones: "stones"/.test(counts),
      "system-health/counts: sabit tablo allowlist'i");
    ok(!/error\.message/.test(counts) && !/\.select\("\*"\)(?![^\n]*head: true)/.test(counts), "system-health/counts: ham hata/satır içeriği yok");
    const lib = read("app/api/admin/system-health/_lib/tenantCounts.ts");
    ok(/\.select\("tenant_id"\)/.test(lib) && /head: true/.test(lib) && !/error\.message/.test(lib), "tenantCounts: yalnız tenant_id + head count");
    const tv = read("app/admin/toplu-veri/page.tsx");
    ok(/insertTopluVeriViaApi\("minerals"/.test(tv) && /insertTopluVeriViaApi\(\s*"stones"/.test(tv), "toplu-veri: minerals/stones sunucu import route'una gider");
    for (const r of ["minerals", "stones"]) {
      const s = read(`app/api/admin/toplu-veri/${r}/route.ts`);
      ok(/verifyAdminRequest\(req\)/.test(s) && /resolveAdminOwnTenant\(db, guard\.adminId\)/.test(s) && /foreignTenantResponse\(\)/.test(s),
        `toplu-veri/${r}: verifyAdminRequest + resolveAdminOwnTenant + yabancı tenant 403`);
      ok(/tenant_id: ownTenant/.test(s) && !/error\.message/.test(s), `toplu-veri/${r}: tenant sunucudan + ham hata yok`);
    }
    const st = read("app/api/admin/toplu-veri/stones/route.ts");
    ok(/validateStoneImagesField\(/.test(st) && /validateStoneStructuredFields\(/.test(st) && /validateMineralAssignments\(/.test(st),
      "toplu-veri/stones: /api/dogaltas/stones ile aynı alan/görsel (SSRF) kapıları");

    // tenantCounts davranışı (sahte db).
    const { loadTenantCountSummary } = createRequire(__filename)("../../app/api/admin/system-health/_lib/tenantCounts.ts") as
      typeof import("../../app/api/admin/system-health/_lib/tenantCounts");
    const rows = [{ tenant_id: "a" }, { tenant_id: "a" }, { tenant_id: "b" }, { tenant_id: null }, { tenant_id: " " }];
    const fakeDb = {
      from() {
        return {
          select(_c: string, o?: { head?: boolean }) {
            if (o?.head) return Promise.resolve({ count: rows.length, error: null });
            return { range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }) };
          },
        };
      },
    };
    const sum = await loadTenantCountSummary(fakeDb as never, "clients");
    ok(sum.ok && sum.summary.total === 5 && sum.summary.tenants.a === 2 && sum.summary.tenants.b === 1 && sum.summary.nullTenantRows === 2,
      "tenantCounts: {tenant_id: count} + nullTenantRows (satır listesi yok)");
    const errDb = { from: () => ({ select: () => Promise.resolve({ count: null, error: { message: "secret db detail" } }) }) };
    const errSum = await loadTenantCountSummary(errDb as never, "clients");
    ok(!errSum.ok && !JSON.stringify(errSum).includes("secret"), "tenantCounts: hata → generic (ham mesaj taşınmaz)");
  }

  section("AA-3 · word-report tenant filtresi");
  {
    const single = read("app/api/clients/[id]/word-report/route.ts");
    const noteQs = single.match(/from\("client_notes"\)[^\n]*/g) ?? [];
    ok(noteQs.length >= 2 && noteQs.every((q) => /\.eq\("tenant_id", tenantId\)/.test(q)), "clients/[id]/word-report: client_notes sorguları tenant filtreli");
    // WT7: toplu rapor tekli raporun tam veri kümesini ortak toplu okuyucudan alır (clientReportData).
    const bulk = read("app/api/clients/word-report-bulk/route.ts");
    const bulkData = read("app/api/clients/[id]/word-report/clientReportData.ts");
    ok(/loadClientDatasetsBulk\(db, tenantId,/.test(bulk) && /\.eq\("tenant_id", tenantId\)\.in\("client_id", chunk\)/.test(bulkData) && /"client_notes"/.test(bulkData), "word-report-bulk: client_notes (+ tüm alt tablolar) tenant filtreli");
    ok(/from\("clients"\)\s*\.select\("\*"\)\s*\.eq\("tenant_id", tenantId\)/.test(bulk), "word-report-bulk: clients tenant filtreli");
    const aj = read("app/api/ajanda/word-report/route.ts");
    ok(/from\("clients"\)\.select\("id, ad, soyad"\)\.eq\("tenant_id", tenantId\)/.test(aj), "ajanda/word-report: clients ad çözümü tenant filtreli");
  }

  section("AA-4 · numeroloji tenant-metrics agrege");
  {
    const r = read("app/api/admin/numeroloji/tenant-metrics/route.ts");
    ok(/tenants: result\.summary\.tenants/.test(r) && !/\bids\b/.test(r), "tenant-metrics: {tenant_id: count}; satır başına ids YOK");
    ok(/loadTenantCountSummary\(guard\.db, "numerology_records"\)/.test(r), "tenant-metrics: kanonik numerology_records");
    const ui = read("app/admin/sistem-sagligi/numeroloji/page.tsx");
    ok(/tenantCountsFromMap\(json\.tenants\)/.test(ui) && !/json\.ids/.test(ui), "sistem-sağlığı numeroloji UI agrege biçimi tüketir");
    const tk = read("app/admin/tenant-kontrol/page.tsx");
    ok(/json\.tenants/.test(tk) && /nullTenantRows/.test(tk), "tenant-kontrol UI agrege biçimi tüketir");
  }

  section("AA-5 · admin support/tenants generic hata");
  {
    for (const f of ["app/api/admin/support/route.ts", "app/api/admin/tenants/route.ts"]) {
      ok(!/error\.message/.test(read(f)), `${f}: ham error.message yok`);
    }
  }

  section("AA-6 · rapor route'ları guard.db");
  {
    const REPORTS = [
      "app/api/biyoenerji/chakra-report/route.ts",
      "app/api/biyoenerji/energy-body-report/route.ts",
      "app/api/biyoenerji/imagination-report/route.ts",
      "app/api/biyoenerji/session-report/route.ts",
      "app/api/biyoenerji/subconscious-report/route.ts",
      "app/api/biyoenerji/symbol-report/route.ts",
      "app/api/refleksoloji/protocol-report/route.ts",
    ];
    for (const f of REPORTS) {
      const s = read(f);
      ok(!/createClient\s*\(/.test(s) && !/SUPABASE_SERVICE_ROLE_KEY/.test(s) && /const \{ db \} = guard;/.test(s), `${f}: guard.db (kendi service_role client'ı yok)`);
    }
  }

  console.log(`\nadmin-hygiene: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) {
    for (const f of fails) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
