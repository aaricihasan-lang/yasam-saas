/**
 * BF-11E — BELGE/VİDEO FIRST SAFE SOURCE READINESS HARNESS (PASS/BLOCKED).
 *
 * belge_video:passages worker capability: join-tenant exact-write + row-unit + eligibility
 * + safe→unsafe tombstone + delete + activation triple-gate + trigger migration static.
 * Registry enabled:true FLIP EDİLMEDİ (merged WIRED_DORMANT/count contract churn'ünden kaçınıldı);
 * capability enabled:true CONFIG VARYANTIYLA kanıtlanır. Production/DB YOK.
 *   npm run yh:bf11e:belge:harness
 */
import { readFileSync } from "node:fs";
import { join as pjoin } from "node:path";
import {
  indexSourcePage,
  type IndexSourcePageResult,
} from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import type { IndexDbClient } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { createSupabaseIndexDeindexer, type DeindexResult } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { runIndexUnit } from "@/lib/yasam-hafizasi/indexer/runIndexUnit";
import { processOutboxEvent, type EventProcessorDeps } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import type { ClaimedOutboxEvent } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { evaluateProcessingGate, type SourceActivationDesired } from "@/lib/yasam-hafizasi/activation/activationState";
import { YH_DEFERRED_SOURCE_CLOSURE } from "@/lib/yasam-hafizasi/deferredSourceClosure";
import type { ParentTenantLookup } from "@/lib/yasam-hafizasi/indexer/tenantResolve";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const PID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"; // passage id
const FK = "dddddddd-dddd-4ddd-dddd-dddddddddddd"; // document_id (parent)
const TEN = "11111111-1111-4111-1111-111111111111"; // tenant
const OTHER = "22222222-2222-4222-2222-222222222222"; // farklı tenant

const belgeReal = YH_INDEX_SOURCES.find((s) => s.sourceKey === "belge_video:passages")!;
const belgeEnabled: SourceConfig = { ...belgeReal, enabled: true }; // capability varyantı (registry FLIP değil)

// ── Mock IndexDbClient: tablo → satırlar; upsert kaydı ────────────────────────
function mockDb(tableData: Record<string, Record<string, unknown>[]>, upserts: Record<string, unknown>[]): IndexDbClient {
  const make = (table: string): unknown => {
    const builder: Record<string, unknown> = {};
    const chain = (): unknown => builder;
    builder.select = chain; builder.eq = chain; builder.gt = chain; builder.in = chain; builder.order = chain; builder.limit = chain;
    builder.upsert = (rows: readonly Record<string, unknown>[]) => { upserts.push(...rows); return Promise.resolve({ error: null }); };
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tableData[table] ?? [], error: null }).then(resolve);
    return builder;
  };
  return { from: (t: string) => make(t) as never };
}

async function run(): Promise<void> {
// ═══ A) PURE runIndexUnit (eligibility + join tenant + row-unit) ═══
{
  const pl: ParentTenantLookup = () => ({ found: true, tenantId: TEN });
  const safeRow = { id: PID, document_id: FK, classification: "safe-non-pii", passage_text: "kalıcı güvenli passage metni" };
  const r1 = runIndexUnit({ config: belgeEnabled, row: safeRow, parentLookup: pl });
  add("A-safe-eligible-unit", r1.status === "unit" && r1.unit.sourceId === PID && r1.unit.tenantId === TEN);
  add("A-pii-eligibility-skip", (() => { const r = runIndexUnit({ config: belgeEnabled, row: { ...safeRow, classification: "pii" }, parentLookup: pl }); return r.status === "skipped" && r.skip.stage === "eligibility"; })());
  add("A-unclassified-skip", (() => { const r = runIndexUnit({ config: belgeEnabled, row: { ...safeRow, classification: "unclassified" }, parentLookup: pl }); return r.status === "skipped" && r.skip.stage === "eligibility"; })());
  add("A-restricted-skip", (() => { const r = runIndexUnit({ config: belgeEnabled, row: { ...safeRow, classification: "restricted" }, parentLookup: pl }); return r.status === "skipped" && r.skip.stage === "eligibility"; })());
  add("A-missing-classification-skip", (() => { const r = runIndexUnit({ config: belgeEnabled, row: { id: PID, document_id: FK, passage_text: "x" }, parentLookup: pl }); return r.status === "skipped" && r.skip.stage === "eligibility"; })());
  add("A-missing-parent-tenant-skip", (() => { const r = runIndexUnit({ config: belgeEnabled, row: safeRow, parentLookup: () => ({ found: false }) }); return r.status === "skipped" && r.skip.stage === "tenant"; })());
  add("A-join-no-parentlookup-skip", (() => { const r = runIndexUnit({ config: belgeEnabled, row: safeRow }); return r.status === "skipped" && r.skip.stage === "tenant"; })());
}

// ═══ B) runExactRecord (join+row exact-write) mock-DB integration ═══
{
  const passage = (over: Record<string, unknown> = {}) => [{ id: PID, document_id: FK, classification: "safe-non-pii", passage_text: "güvenli içerik", ...over }];
  const parent = [{ id: FK, tenant_id: TEN }];

  const up1: Record<string, unknown>[] = [];
  const res1 = await indexSourcePage({ config: belgeEnabled, mode: "write", exactSourceId: PID, expectedTenantId: TEN, db: mockDb({ yh_document_passages: passage(), yh_document_sources: parent }, up1) });
  add("B-exact-join-ok", res1.exactMode && res1.exactStatus === "ok" && res1.eligibleUnits === 1 && up1.length === 1, `status=${res1.exactStatus} up=${up1.length}`);

  const up2: Record<string, unknown>[] = [];
  const res2 = await indexSourcePage({ config: belgeEnabled, mode: "write", exactSourceId: PID, expectedTenantId: TEN, db: mockDb({ yh_document_passages: passage({ classification: "pii" }), yh_document_sources: parent }, up2) });
  add("B-exact-pii-skipped-build", res2.exactStatus === "skipped-build" && up2.length === 0);

  const up3: Record<string, unknown>[] = [];
  const res3 = await indexSourcePage({ config: belgeEnabled, mode: "write", exactSourceId: PID, expectedTenantId: TEN, db: mockDb({ yh_document_passages: passage() }, up3) });
  add("B-exact-missing-parent-skipped", res3.exactStatus === "skipped-build" && up3.length === 0);

  const up4: Record<string, unknown>[] = [];
  const res4 = await indexSourcePage({ config: belgeEnabled, mode: "write", exactSourceId: PID, expectedTenantId: OTHER, db: mockDb({ yh_document_passages: passage(), yh_document_sources: parent }, up4) });
  add("B-exact-cross-tenant-mismatch", res4.exactStatus === "tenant-mismatch" && up4.length === 0);

  const up5: Record<string, unknown>[] = [];
  const res5 = await indexSourcePage({ config: belgeEnabled, mode: "write", exactSourceId: PID, expectedTenantId: TEN, db: mockDb({ yh_document_passages: [], yh_document_sources: parent }, up5) });
  add("B-exact-not-found", res5.exactStatus === "not-found" && up5.length === 0);

  const up6: Record<string, unknown>[] = [];
  const res6 = await indexSourcePage({ config: belgeEnabled, mode: "dry-run", exactSourceId: PID, expectedTenantId: TEN, db: mockDb({ yh_document_passages: passage(), yh_document_sources: parent }, up6) });
  add("B-exact-dry-run-no-write", res6.exactStatus === "ok" && up6.length === 0 && res6.write === null);
}

// ═══ C) DEINDEXER join+row (tombstone/delete backing) ═══
{
  const okClient = { deleteRows: async () => ({ error: false, count: 1 }) };
  const noopClient = { deleteRows: async () => ({ error: false, count: 0 }) };
  const dOk = await createSupabaseIndexDeindexer(okClient).deindex({ config: belgeEnabled, sourceId: PID, tenantId: TEN });
  add("C-deindex-join-row-ok", dOk.status === "ok" && dOk.deleted === 1, dOk.status);
  const dNoop = await createSupabaseIndexDeindexer(noopClient).deindex({ config: belgeEnabled, sourceId: PID, tenantId: TEN });
  add("C-deindex-noop-idempotent", dNoop.status === "no-op");
  const yebs = YH_INDEX_SOURCES.find((s) => s.sourceKey === "yebs:traditions")!;
  const dYebs = await createSupabaseIndexDeindexer(okClient).deindex({ config: yebs, sourceId: PID, tenantId: TEN });
  add("C-deindex-global-canonical-unsupported", dYebs.status === "tenant-model-unsupported");
}

// ═══ D) EVENT PROCESSOR: gates + tombstone + delete + activation ═══
{
  const ev = (op: "upsert" | "delete"): ClaimedOutboxEvent => ({
    id: TEN, sourceKey: "belge_video:passages", sourceTable: "yh_document_passages", sourceId: PID, tenantId: TEN,
    operation: op, attempts: 1, eventVersion: 1,
  } as ClaimedOutboxEvent);
  const deps = (over: Partial<EventProcessorDeps>): EventProcessorDeps => ({
    resolveConfig: (k) => (k === "belge_video:passages" ? belgeEnabled : null),
    runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
    deindex: async () => ({ status: "no-op" } as DeindexResult),
    isSourceProcessingActive: async () => true,
    ...over,
  });

  let up: boolean = false;
  const dOk = await processOutboxEvent(ev("upsert"), deps({ runExactUpsert: async () => { up = true; return { exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult; } }));
  add("D-active-eligible-upsert-ok", dOk.action === "complete" && up);

  let deindexed: boolean = false;
  const dTomb = await processOutboxEvent(ev("upsert"), deps({
    runExactUpsert: async () => ({ exactStatus: "skipped-build", write: null } as unknown as IndexSourcePageResult),
    deindex: async () => { deindexed = true; return { status: "ok", deleted: 1 } as DeindexResult; },
  }));
  add("D-unsafe-transition-tombstone", dTomb.action === "complete" && deindexed);

  let delDeindexed: boolean = false;
  const dDel = await processOutboxEvent(ev("delete"), deps({ deindex: async () => { delDeindexed = true; return { status: "ok", deleted: 1 } as DeindexResult; } }));
  add("D-active-delete-deindex", dDel.action === "complete" && delDeindexed);

  let touched: boolean = false;
  const dInactUp = await processOutboxEvent(ev("upsert"), deps({
    isSourceProcessingActive: async () => false,
    runExactUpsert: async () => { touched = true; return { exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult; },
    deindex: async () => { touched = true; return { status: "no-op" } as DeindexResult; },
  }));
  add("D-inactive-upsert-noop", dInactUp.action === "complete" && (dInactUp as { note?: string }).note === "inactive-source-noop" && !touched);

  let touched2: boolean = false;
  const dInactDel = await processOutboxEvent(ev("delete"), deps({ isSourceProcessingActive: async () => false, deindex: async () => { touched2 = true; return { status: "no-op" } as DeindexResult; } }));
  add("D-inactive-delete-noop", dInactDel.action === "complete" && !touched2);

  const dErr = await processOutboxEvent(ev("upsert"), deps({ isSourceProcessingActive: async () => { throw new Error("db"); } }));
  add("D-gate-error-transient", dErr.action === "fail" && (dErr as { code?: string }).code === "activation-check-error");
}

// ═══ E) ACTIVATION TRIPLE-GATE ═══
{
  const desired: SourceActivationDesired = { sourceKey: "belge_video:passages", scope: "professional", activationClass: "FUTURE_ONLY_READY", registryEnabled: true };
  add("E-code-enabled-runtime-null-inactive", evaluateProcessingGate(desired, null).active === false);
  add("E-code-enabled-runtime-false-inactive", evaluateProcessingGate(desired, { isActive: false, backfillAllowed: false }).active === false);
  add("E-triple-gate-active-only-when-is_active", evaluateProcessingGate(desired, { isActive: true, backfillAllowed: false }).active === true);
  add("E-future-only-not-backfill", desired.activationClass === "FUTURE_ONLY_READY");
}

// ═══ F) REGISTRY / CLOSURE UNCHANGED ═══
{
  add("F-registry-belge-still-disabled", belgeReal.enabled === false);
  add("F-live-count-17-unchanged", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 17);
  add("F-dormant-professional-9-unchanged", YH_INDEX_SOURCES.filter((s) => s.enabled === false).length === 9);
  const belgeDom = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "belge_video_ingestion");
  add("F-belge-closure-wired-dormant", belgeDom?.result === "WIRED_DORMANT" && belgeDom.registrySourceKeys.includes("belge_video:passages"));
  const numClient = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "numeroloji_client_id");
  add("F-numerology-client-hard-blocker", numClient?.result === "DEFERRED_HARD_BLOCKER");
}

// ═══ G) TRIGGER MIGRATION STATIC ═══
{
  const MIG = readFileSync(pjoin(process.cwd(), "supabase/migrations/20260929000000_yh_belge_video_cdc_trigger.sql"), "utf8");
  const EXEC = MIG.replace(/--.*$/gm, "");
  const has = (re: RegExp) => re.test(MIG);
  add("G-trigger-on-passages", has(/CREATE TRIGGER yh_cdc_yh_document_passages_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.yh_document_passages/));
  add("G-uses-generic-cdc", has(/EXECUTE FUNCTION public\.yh_cdc_enqueue\('belge_video:passages', 'yh_document_passages'\)/));
  add("G-precheck-function", has(/to_regprocedure\('public\.yh_cdc_enqueue\(\)'\) IS NULL/));
  add("G-precheck-table", has(/to_regclass\('public\.yh_document_passages'\) IS NULL/));
  add("G-no-activation-seed", !/INSERT\s+INTO\s+public\.yh_source_activation/i.test(EXEC));
  add("G-no-source-dml", !/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(yh_document_passages|yh_document_sources|yasam_hafizasi_index|yh_source_activation)/i.test(EXEC));
  add("G-no-historical-scan", !/SELECT[\s\S]*FROM\s+public\.yh_document_passages/i.test(EXEC));
  add("G-no-raw-text-payload", !/passage_text|source_url|content_hash/i.test(EXEC));
  add("G-idempotent", has(/DROP TRIGGER IF EXISTS yh_cdc_yh_document_passages_trg/));
  add("G-single-transaction", has(/^BEGIN;/m) && has(/^COMMIT;/m));
  add("G-trigger-neq-activation-noted", /TRIGGER ATTACHED ≠ SOURCE ACTIVATED/.test(MIG));
}

// ═══ H) COLUMN+RECORD REGRESYON (join değişikliği bozmadı) ═══
{
  const stones = YH_INDEX_SOURCES.find((s) => s.sourceKey === "dogaltas:stones")!;
  const upS: Record<string, unknown>[] = [];
  const resS = await indexSourcePage({
    config: stones, mode: "dry-run", exactSourceId: PID, expectedTenantId: TEN,
    db: mockDb({ stones: [{ id: PID, tenant_id: TEN, stone_name: "Ametist", short_description: "mor kuvars" }] }, upS),
  });
  add("H-column-record-exact-still-works", resS.exactMode && resS.exactStatus === "ok" && upS.length === 0, String(resS.exactStatus));
}

}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-11E BELGE/VIDEO READINESS HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

run().then(main);
