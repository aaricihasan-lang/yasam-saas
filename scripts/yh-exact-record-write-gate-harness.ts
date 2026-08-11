// Yaşam Hafızası™ — BF-2B: EXACT-RECORD write gate SERVER harness (saf/fake-DB; AĞ/DB YOK).
//
// GERÇEK import ile doğrular:
//   - validateAdminIndexRequest exact sözleşmesi (UUID, mutual presence, cursor/limit çakışması)
//   - indexSourcePage exact branch (PK eşitliği, eligible=1, demo/sentetik/mismatch fail-closed)
//   - handleAdminIndexRequest exact write interception (exact-not-eligible → writer çağrılmaz)
// Fixture UUID'ler kullanılır; GERÇEK production UUID'si (Esra vb.) GÖMÜLMEZ.
// Çalıştırma:  npx tsx scripts/yh-exact-record-write-gate-harness.ts

import { ADMIN_LIBRARY_TENANT_ID } from "../lib/tenancy/syntheticTenants";
import { YH_DEMO_TENANT_ID } from "../lib/yasam-hafizasi/config";
import {
  handleAdminIndexRequest,
  resolveYhSourceConfig,
  validateAdminIndexRequest,
  type AdminIndexHandlerDeps,
  type ValidatedAdminIndexRequest,
} from "../lib/yasam-hafizasi/indexer/adminIndexRequest";
import { indexSourcePage } from "../lib/yasam-hafizasi/indexer/indexSourcePage";
import type {
  DbQueryResult,
  DbSelectBuilder,
  DbTableBuilder,
  IndexDbClient,
} from "../lib/yasam-hafizasi/indexer/supabaseIndexAdapters";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}

// ── Fixture UUID'ler (GERÇEK production değeri DEĞİL) ──────────────────────────
const SOURCE_KEY = "biyoenerji:symbols";
const SOURCE_TABLE = "bioenergy_symbols";
const EXACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REAL_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_TENANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const symbolsCfg = resolveYhSourceConfig(SOURCE_KEY);
check(symbolsCfg !== null, "fixture: biyoenerji:symbols config çözülmeli");
check(symbolsCfg?.tableName === SOURCE_TABLE, "fixture: symbols tableName = bioenergy_symbols");
check(symbolsCfg?.tenant.mode === "column", "fixture: symbols column mode");

type DbRow = Record<string, unknown>;
interface Call { method: string; args: unknown[]; }
interface FromRec { table: string; chain: Call[]; }

/** Fake IndexDbClient: kaynak tablo exactRows döndürür; index tablo prefetch=boş; upsert kaydedilir. */
function makeFake(exactRows: DbRow[]): {
  db: IndexDbClient;
  froms: FromRec[];
  upserts: { rows: DbRow[]; onConflict: string }[];
} {
  const froms: FromRec[] = [];
  const upserts: { rows: DbRow[]; onConflict: string }[] = [];
  const db: IndexDbClient = {
    from(table: string): DbTableBuilder {
      const rec: FromRec = { table, chain: [] };
      froms.push(rec);
      const sb: DbSelectBuilder = {
        eq(c, v) { rec.chain.push({ method: "eq", args: [c, v] }); return sb; },
        gt(c, v) { rec.chain.push({ method: "gt", args: [c, v] }); return sb; },
        in(c, v) { rec.chain.push({ method: "in", args: [c, [...v]] }); return sb; },
        order(c, o) { rec.chain.push({ method: "order", args: [c, o] }); return sb; },
        limit(n) { rec.chain.push({ method: "limit", args: [n] }); return sb; },
        then<TR1 = DbQueryResult, TR2 = never>(
          onF?: ((v: DbQueryResult) => TR1 | PromiseLike<TR1>) | null,
          onR?: ((r: unknown) => TR2 | PromiseLike<TR2>) | null,
        ): PromiseLike<TR1 | TR2> {
          const data: DbRow[] = table === SOURCE_TABLE ? exactRows : []; // index prefetch → boş
          return Promise.resolve<DbQueryResult>({ data, error: null }).then(onF, onR);
        },
      };
      return {
        select(cols) { rec.chain.push({ method: "select", args: [cols] }); return sb; },
        upsert(rows, o) {
          upserts.push({ rows: rows.map((r) => ({ ...r })), onConflict: o.onConflict });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { db, froms, upserts };
}

function row(id: string, tenantId: string | null): DbRow {
  return { id, tenant_id: tenantId, title: "Sembol Başlık", symbol: "☉", meaning: "anlam metni" };
}

async function main(): Promise<void> {
  // ══════════════════════════════════════════════════════════════════════════
  // BÖLÜM 1 — validateAdminIndexRequest exact sözleşmesi
  // ══════════════════════════════════════════════════════════════════════════
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT });
    check(v.ok === true, "V1: exact geçerli → ok");
    if (v.ok) {
      check(v.value.exactSourceId === EXACT_ID, "V1: exactSourceId taşınır");
      check(v.value.expectedTenantId === REAL_TENANT, "V1: expectedTenantId taşınır");
      check(v.value.limit === 1, "V1: exact limit=1'e kilitlenir");
      check(v.value.afterId === null, "V1: exact afterId null");
    }
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "dry-run", exactSourceId: EXACT_ID });
    check(!v.ok && v.code === "exact-fields-incomplete", "V2: yalnız exactSourceId → exact-fields-incomplete");
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "dry-run", expectedTenantId: REAL_TENANT });
    check(!v.ok && v.code === "exact-fields-incomplete", "V3: yalnız expectedTenantId → exact-fields-incomplete");
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "dry-run", exactSourceId: "not-a-uuid", expectedTenantId: REAL_TENANT });
    check(!v.ok && v.code === "invalid-exact-source-id", "V4: bozuk exactSourceId → invalid-exact-source-id");
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "dry-run", exactSourceId: EXACT_ID, expectedTenantId: "bad" });
    check(!v.ok && v.code === "invalid-expected-tenant-id", "V5: bozuk expectedTenantId → invalid-expected-tenant-id");
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "dry-run", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, afterId: OTHER_ID });
    check(!v.ok && v.code === "exact-cursor-conflict", "V6: exact + afterId → exact-cursor-conflict");
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "dry-run", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, limit: 50 });
    check(!v.ok && v.code === "exact-limit-conflict", "V7: exact + limit≠1 → exact-limit-conflict");
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, limit: 1 });
    check(v.ok === true, "V8: exact + limit=1 → ok");
  }
  {
    // Broad mod hâlâ çalışır (exact alanları yok → exactSourceId null).
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "dry-run" });
    check(v.ok === true, "V9: broad mod ok");
    if (v.ok) check(v.value.exactSourceId === null && v.value.expectedTenantId === null, "V9: broad exact alanları null");
  }
  {
    const v = validateAdminIndexRequest({ sourceKey: SOURCE_KEY, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, junk: 1 });
    check(!v.ok && v.code === "unexpected-field", "V10: fazladan alan → unexpected-field");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BÖLÜM 2 — indexSourcePage exact branch (fake DB)
  // ══════════════════════════════════════════════════════════════════════════
  const cfg = symbolsCfg!;

  // 2.1 exact dry-run OK: eşleşen tek kayıt.
  {
    const { db, froms, upserts } = makeFake([row(EXACT_ID, REAL_TENANT)]);
    const r = await indexSourcePage({ config: cfg, mode: "dry-run", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactMode === true, "P1: exactMode true");
    check(r.exactStatus === "ok", "P1: exactStatus ok");
    check(r.fetched === 1 && r.eligibleUnits === 1, "P1: fetched=1 eligible=1");
    check(r.summary.units === 1 && r.summary.skipped === 0, "P1: produced=1 skipped=0");
    check(r.excludedDemo === 0 && r.excludedSynthetic === 0, "P1: dışlama yok");
    check(r.write === null, "P1: dry-run write null");
    check(upserts.length === 0, "P1: dry-run upsert yok");
    // Reader PK eşitliği kullandı, pagination YOK.
    const srcFrom = froms.find((f) => f.table === SOURCE_TABLE);
    const eqCall = srcFrom?.chain.find((c) => c.method === "eq" && c.args[0] === "id");
    check(!!eqCall && eqCall.args[1] === EXACT_ID, "P1: reader .eq(id, exactSourceId)");
    check(!srcFrom?.chain.some((c) => c.method === "gt"), "P1: reader .gt (cursor) YOK");
    check(!srcFrom?.chain.some((c) => c.method === "order"), "P1: reader .order (pagination) YOK");
  }

  // 2.2 exact WRITE OK: writer tek unit alır, planned toplam 1.
  {
    const { db, upserts } = makeFake([row(EXACT_ID, REAL_TENANT)]);
    const r = await indexSourcePage({ config: cfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactStatus === "ok", "P2: write exactStatus ok");
    check(r.write !== null, "P2: write non-null");
    check(r.write?.plannedInsert === 1, "P2: plannedInsert=1");
    const planned = (r.write?.plannedInsert ?? 0) + (r.write?.plannedUpdate ?? 0) + (r.write?.unchanged ?? 0);
    check(planned === 1, "P2: planned toplam=1");
    check(r.write?.failed === 0 && (r.write?.errors.length ?? -1) === 0, "P2: failed=0 errors boş");
    check(upserts.length === 1, "P2: tam 1 upsert");
    check(upserts[0]?.rows.length === 1, "P2: upsert tek satır");
    check(upserts[0]?.onConflict === "source_table,source_id,section_ref", "P2: conflict key doğru");
  }

  // 2.3 not-found: 0 satır → writer çağrılmaz (write modunda bile).
  {
    const { db, upserts } = makeFake([]);
    const r = await indexSourcePage({ config: cfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactStatus === "not-found", "P3: not-found");
    check(r.eligibleUnits === 0 && r.write === null, "P3: eligible=0 write null");
    check(upserts.length === 0, "P3: upsert yok");
  }

  // 2.4 multiple-rows: >1 satır → sözleşme ihlali, writer yok.
  {
    const { db, upserts } = makeFake([row(EXACT_ID, REAL_TENANT), row(EXACT_ID, REAL_TENANT)]);
    const r = await indexSourcePage({ config: cfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactStatus === "multiple-rows", "P4: multiple-rows");
    check(upserts.length === 0, "P4: upsert yok");
  }

  // 2.5 tenant-mismatch: satır başka tenant → writer yok.
  {
    const { db, upserts } = makeFake([row(EXACT_ID, OTHER_TENANT)]);
    const r = await indexSourcePage({ config: cfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactStatus === "tenant-mismatch", "P5: tenant-mismatch");
    check(r.eligibleUnits === 0 && r.write === null, "P5: eligible=0 write null");
    check(upserts.length === 0, "P5: upsert yok");
  }

  // 2.6 source-id-mismatch: reader beklenmedik id döndürürse → writer yok.
  {
    const { db, upserts } = makeFake([row(OTHER_ID, REAL_TENANT)]);
    const r = await indexSourcePage({ config: cfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactStatus === "source-id-mismatch", "P6: source-id-mismatch");
    check(upserts.length === 0, "P6: upsert yok");
  }

  // 2.7 excluded-demo: demo tenant → writer yok.
  {
    const { db, upserts } = makeFake([row(EXACT_ID, YH_DEMO_TENANT_ID)]);
    const r = await indexSourcePage({ config: cfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: YH_DEMO_TENANT_ID, db });
    check(r.exactStatus === "excluded-demo", "P7: excluded-demo");
    check(r.excludedDemo === 1 && r.write === null, "P7: excludedDemo=1 write null");
    check(upserts.length === 0, "P7: upsert yok");
  }

  // 2.8 excluded-synthetic: sentetik (ADMIN_LIBRARY) tenant → writer yok.
  {
    const { db, upserts } = makeFake([row(EXACT_ID, ADMIN_LIBRARY_TENANT_ID)]);
    const r = await indexSourcePage({ config: cfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: ADMIN_LIBRARY_TENANT_ID, db });
    check(r.exactStatus === "excluded-synthetic", "P8: excluded-synthetic");
    check(r.excludedSynthetic === 1 && r.write === null, "P8: excludedSynthetic=1 write null");
    check(upserts.length === 0, "P8: upsert yok");
  }

  // 2.9 tenant-model-unsupported: shared (allowSharedNull) kaynak → okuma bile yapılmaz.
  {
    const sharedCfg = { ...cfg, tenant: { mode: "column" as const, column: "tenant_id", allowSharedNull: true } };
    const { db, froms, upserts } = makeFake([row(EXACT_ID, REAL_TENANT)]);
    const r = await indexSourcePage({ config: sharedCfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactStatus === "tenant-model-unsupported", "P9: shared kaynak → tenant-model-unsupported");
    check(froms.length === 0, "P9: kaynak okunmadı (reader çağrılmadı)");
    check(upserts.length === 0, "P9: upsert yok");
  }

  // 2.10 join kaynak (BF-11E Belge/Video): ARTIK DESTEKLENİR (tenant parent üzerinden resolve).
  //   Bu satırda FK (guide_id) yok → resolveTenant fail-closed → skipped-build (write yok).
  //   (Global-canonical/shared hâlâ tenant-model-unsupported; bkz P9.)
  {
    const joinCfg = { ...cfg, tenant: { mode: "join" as const, fkColumn: "guide_id", parentTable: "p", parentTenantColumn: "tenant_id" } };
    const { db, upserts } = makeFake([row(EXACT_ID, REAL_TENANT)]);
    const r = await indexSourcePage({ config: joinCfg, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT, db });
    check(r.exactStatus === "skipped-build", "P10: join kaynak FK yok → skipped-build (fail-closed; artık desteklenir)");
    check(upserts.length === 0, "P10: upsert yok");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BÖLÜM 3 — handleAdminIndexRequest exact interception
  // ══════════════════════════════════════════════════════════════════════════
  const nonDemoDeps = (rows: DbRow[]): AdminIndexHandlerDeps => ({
    adminId: "99999999-9999-4999-8999-999999999999",
    checkAdminDemoStatus: async () => ({ ok: true, isDemo: false }),
    runIndexSourcePage: (v: ValidatedAdminIndexRequest) =>
      indexSourcePage({
        config: v.config, afterId: v.afterId, limit: v.limit, mode: v.mode,
        exactSourceId: v.exactSourceId, expectedTenantId: v.expectedTenantId,
        db: makeFake(rows).db,
      }),
  });

  // 3.1 exact dry-run OK → 200, page.exactMode + exactStatus ok.
  {
    const { status, body } = await handleAdminIndexRequest(
      { sourceKey: SOURCE_KEY, mode: "dry-run", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT },
      nonDemoDeps([row(EXACT_ID, REAL_TENANT)]),
    );
    check(status === 200 && body.ok === true, "H1: exact dry-run 200 ok");
    check(body.ok === true && body.page.exactMode === true && body.page.exactStatus === "ok", "H1: page exact ok");
    check(body.ok === true && body.write === null, "H1: dry-run write null");
  }

  // 3.2 exact write OK → 200 write success.
  {
    const { status, body } = await handleAdminIndexRequest(
      { sourceKey: SOURCE_KEY, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT },
      nonDemoDeps([row(EXACT_ID, REAL_TENANT)]),
    );
    check(status === 200 && body.ok === true, "H2: exact write 200 ok");
    check(body.ok === true && body.mode === "write" && body.write !== null, "H2: write summary var");
  }

  // 3.3 exact write not-found → 409 exact-not-eligible (writer çağrılmadı).
  {
    const { status, body } = await handleAdminIndexRequest(
      { sourceKey: SOURCE_KEY, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT },
      nonDemoDeps([]),
    );
    check(status === 409, "H3: not-found write → 409");
    check(body.ok === false && "error" in body && body.error.code === "exact-not-eligible", "H3: exact-not-eligible");
  }

  // 3.4 exact write tenant-mismatch → 409 exact-not-eligible.
  {
    const { status, body } = await handleAdminIndexRequest(
      { sourceKey: SOURCE_KEY, mode: "write", exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT },
      nonDemoDeps([row(EXACT_ID, OTHER_TENANT)]),
    );
    check(status === 409, "H4: tenant-mismatch write → 409");
    check(body.ok === false && "error" in body && body.error.code === "exact-not-eligible", "H4: exact-not-eligible");
  }

  // ── Sonuç ──
  if (errors.length === 0) {
    console.log(`✅ yh-exact-record-write-gate-harness PASS (${total}/${total})`);
  } else {
    console.error(`❌ yh-exact-record-write-gate-harness FAIL (${total - errors.length}/${total})`);
    for (const e of errors) console.error("   - " + e);
    process.exitCode = 1;
  }
}

void main();
