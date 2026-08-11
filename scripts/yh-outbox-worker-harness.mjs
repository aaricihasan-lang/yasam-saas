/**
 * Yaşam Hafızası™ — BF-11B Worker Core + Deindex + RPC Client harness.
 * ====================================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, AĞ'SIZ. Gerçek Supabase / Inngest cloud /
 * production'a BAĞLANMAZ. GERÇEK modüller import edilir (kopya/taklit YOK):
 *   - lib/yasam-hafizasi/outbox/outboxRpcClient.ts  (claim/complete/fail/sweep)
 *   - lib/yasam-hafizasi/outbox/eventProcessor.ts   (processOutboxEvent + runOutboxBatch)
 *   - lib/yasam-hafizasi/indexer/supabaseIndexAdapters.ts (createSupabaseIndexDeindexer)
 *   - lib/yasam-hafizasi/indexer/adminIndexRequest.ts (resolveYhSourceConfig — gerçek registry)
 *
 * server-only transport (yhOutboxWorker.ts) IMPORT EDİLMEZ; yalnız METİN olarak
 * statik doğrulanır (E kategorisi).
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/yh-outbox-worker-harness.mjs
 * Herhangi bir FAIL → exit 1. Son satır: `yh-outbox-worker-harness: X/X PASS`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  claimEvents,
  completeEvent,
  failEvent,
  sweepExpired,
  OutboxRpcError,
  OutboxRpcInvariantError,
} from "../lib/yasam-hafizasi/outbox/outboxRpcClient.ts";
import {
  processOutboxEvent,
  runOutboxBatch,
} from "../lib/yasam-hafizasi/outbox/eventProcessor.ts";
import { createSupabaseIndexDeindexer } from "../lib/yasam-hafizasi/indexer/supabaseIndexAdapters.ts";
import { resolveYhSourceConfig } from "../lib/yasam-hafizasi/indexer/adminIndexRequest.ts";

// ─── Test altyapısı ──────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const fails = [];
const cats = {};
function check(cat, desc, cond) {
  cats[cat] = (cats[cat] ?? 0) + 1;
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    fails.push(`[${cat}] ${desc}`);
    console.error(`  FAIL  [${cat}] ${desc}`);
  }
}
async function checkThrows(cat, desc, fn, ErrType) {
  let threw = false;
  let matched = false;
  try {
    await fn();
  } catch (e) {
    threw = true;
    matched = ErrType ? e instanceof ErrType : true;
  }
  check(cat, desc, threw && matched);
}

// ─── Sabitler / fixture'lar ───────────────────────────────────────────────────
const T1 = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222222";
const ID1 = "33333333-3333-4333-8333-333333333333";

const STONES = resolveYhSourceConfig("dogaltas:stones"); // column, record, safe, non-shared
const KNOWLEDGE = resolveYhSourceConfig("dogaltas:knowledge"); // allowSharedNull: true
const GUIDE_SECTIONS = resolveYhSourceConfig("sifa_rehberi:guide-sections"); // join + section
const NOTES = resolveYhSourceConfig("refleksoloji:notes"); // pii
const ARCHIVES = resolveYhSourceConfig("kisisel_arsiv:archives"); // BF-11E ROW-GATED CONTROLLED (safe-non-pii + row-gate)

function claimRow(over = {}) {
  return {
    id: ID1,
    source_key: "dogaltas:stones",
    source_table: "stones",
    source_id: S1,
    tenant_id: T1,
    operation: "upsert",
    attempts: 1,
    event_version: 1,
    ...over,
  };
}
function sweepRow(over = {}) {
  return { id: ID1, source_key: "dogaltas:stones", source_id: S1, tenant_id: T1, attempts: 1, event_version: 1, ...over };
}
function ev(over = {}) {
  return {
    id: ID1,
    sourceKey: "dogaltas:stones",
    sourceTable: "stones",
    sourceId: S1,
    tenantId: T1,
    operation: "upsert",
    attempts: 1,
    eventVersion: 1,
    ...over,
  };
}
// Fabricated IndexSourcePageResult (exact mode).
function exactResult(exactStatus, write = null) {
  return {
    sourceKey: "dogaltas:stones",
    mode: "write",
    fetched: 1,
    eligibleUnits: exactStatus === "ok" ? 1 : 0,
    excludedDemo: 0,
    excludedSynthetic: 0,
    summary: { units: 0, skipped: 0, byReason: {} },
    nextCursor: null,
    hasMore: false,
    parentStats: { requested: 0, found: 0, missing: 0 },
    write,
    exactMode: true,
    exactStatus,
  };
}

// Mock RPC DB (yalnız rpc).
function rpcDb(handlers) {
  return { rpc: (fn, args) => handlers[fn](args) };
}
const okData = (data) => Promise.resolve({ data, error: null });
const errData = () => Promise.resolve({ data: null, error: { message: "raw-should-not-leak" } });

// Mock IndexDeleteClient (BF-11B-FIX1: tek-metotlu deleteRows). spy son query'yi yakalar.
function deleteClient(outcome, spy) {
  return {
    deleteRows(query) {
      if (spy) spy.push(query);
      return Promise.resolve(outcome);
    },
  };
}

async function main() {
  // ═══════════════ A — RPC CLIENT ═══════════════
  {
    const db = rpcDb({ yh_outbox_claim: () => okData([claimRow()]) });
    const rows = await claimEvents(db, "w", 10);
    check("A", "1 claim success shape (mapped fields)", rows.length === 1 && rows[0].id === ID1 && rows[0].sourceKey === "dogaltas:stones" && rows[0].operation === "upsert" && rows[0].eventVersion === 1);
  }
  {
    const db = rpcDb({ yh_outbox_claim: () => okData(null) });
    const rows = await claimEvents(db, "w", 10);
    check("A", "2 empty claim → []", Array.isArray(rows) && rows.length === 0);
  }
  await checkThrows("A", "3 malformed claim row (missing id) → invariant", () => claimEvents(rpcDb({ yh_outbox_claim: () => okData([claimRow({ id: "not-uuid" })]) }), "w", 10), OutboxRpcInvariantError);
  await checkThrows("A", "4 invalid operation → invariant", () => claimEvents(rpcDb({ yh_outbox_claim: () => okData([claimRow({ operation: "frob" })]) }), "w", 10), OutboxRpcInvariantError);
  await checkThrows("A", "5 claim RPC error → OutboxRpcError (raw hidden)", () => claimEvents(rpcDb({ yh_outbox_claim: () => errData() }), "w", 10), OutboxRpcError);
  {
    const r = await completeEvent(rpcDb({ yh_outbox_complete: () => okData("succeeded") }), ID1, "w", 1);
    check("A", "6 complete succeeded", r === "succeeded");
  }
  {
    const r = await completeEvent(rpcDb({ yh_outbox_complete: () => okData("requeued_newer_event") }), ID1, "w", 1);
    check("A", "7 complete requeued_newer_event", r === "requeued_newer_event");
  }
  await checkThrows("A", "8 invalid complete result → invariant", () => completeEvent(rpcDb({ yh_outbox_complete: () => okData("weird") }), ID1, "w", 1), OutboxRpcInvariantError);
  {
    const r = await failEvent(rpcDb({ yh_outbox_fail: () => okData("retry_scheduled") }), ID1, "w", 1, "e", 8, 30, 3600);
    check("A", "9 fail retry_scheduled", r === "retry_scheduled");
  }
  {
    const r = await failEvent(rpcDb({ yh_outbox_fail: () => okData("dead") }), ID1, "w", 1, "e", 1, 30, 3600);
    check("A", "10 fail dead", r === "dead");
  }
  {
    const r = await failEvent(rpcDb({ yh_outbox_fail: () => okData("requeued_newer_event") }), ID1, "w", 1, "e", 8, 30, 3600);
    check("A", "11 fail requeued_newer_event", r === "requeued_newer_event");
  }
  await checkThrows("A", "12 invalid fail result → invariant", () => failEvent(rpcDb({ yh_outbox_fail: () => okData("nope") }), ID1, "w", 1, "e", 8, 30, 3600), OutboxRpcInvariantError);
  {
    const rows = await sweepExpired(rpcDb({ yh_outbox_sweep_expired: () => okData([sweepRow()]) }), 300, 10);
    check("A", "13 sweep success shape", rows.length === 1 && rows[0].id === ID1);
  }
  await checkThrows("A", "14 sweep RPC error → OutboxRpcError", () => sweepExpired(rpcDb({ yh_outbox_sweep_expired: () => errData() }), 300, 10), OutboxRpcError);
  {
    // fail RPC error surfaces as OutboxRpcError too (extra assertion).
    await checkThrows("A", "14b fail RPC error → OutboxRpcError", () => failEvent(rpcDb({ yh_outbox_fail: () => errData() }), ID1, "w", 1, "e", 8, 30, 3600), OutboxRpcError);
    // rpc transport throw → OutboxRpcError.
    await checkThrows("A", "14c rpc transport throw → OutboxRpcError", () => claimEvents({ rpc: () => { throw new Error("boom"); } }, "w", 10), OutboxRpcError);
  }

  // ═══════════════ B — EVENT PROCESSOR (UPSERT + gates) ═══════════════
  const upsertDeps = (over = {}) => ({
    resolveConfig: resolveYhSourceConfig,
    runExactUpsert: async () => exactResult("ok"),
    deindex: async () => ({ status: "no-op", deleted: 0 }),
    ...over,
  });
  {
    const d = await processOutboxEvent(ev(), upsertDeps());
    check("B", "15 known safe record source → complete", d.action === "complete" && d.note === "upsert-ok");
  }
  {
    const d = await processOutboxEvent(ev({ sourceTable: "wrong_table" }), upsertDeps());
    check("B", "16 source_table mismatch → permanent", d.action === "fail" && d.retryClass === "permanent" && d.code === "source-table-mismatch");
  }
  {
    const d = await processOutboxEvent(ev({ sourceKey: "no:such" }), upsertDeps());
    check("B", "17 unknown source_key → permanent", d.action === "fail" && d.code === "unknown-source");
  }
  {
    const d = await processOutboxEvent(ev({ sourceKey: "refleksoloji:notes", sourceTable: NOTES.tableName }), upsertDeps());
    check("B", "18 PII source → permanent (source-not-indexable)", d.action === "fail" && d.retryClass === "permanent" && d.code === "source-not-indexable");
  }
  {
    // BF-11E: archive artık safe-non-pii (source guard geçer). Row-gate ineligible (safe→unsafe/stale/
    // missing) → runExactRecord "row-ineligible" → defensiveDeindex → complete (stale tombstone).
    let deindexCalled = false;
    const d = await processOutboxEvent(
      ev({ sourceKey: "kisisel_arsiv:archives", sourceTable: ARCHIVES.tableName }),
      upsertDeps({ runExactUpsert: async () => exactResult("row-ineligible"), deindex: async () => { deindexCalled = true; return { status: "ok", deleted: 1 }; } }),
    );
    check("B", "19 archive row-ineligible → defensive deindex → complete (tombstone)", d.action === "complete" && deindexCalled && d.note.includes("defensive-deindex:row-ineligible"));
  }
  {
    const d = await processOutboxEvent(ev({ sourceKey: "sifa_rehberi:guide-sections", sourceTable: GUIDE_SECTIONS.tableName }), upsertDeps());
    // BF-11E: join tenant ARTIK desteklenir; guide-sections unit "section" olduğu için Kapı 7 reddeder.
    check("B", "20 join+section unit → permanent (non-record-unit-unsupported)", d.action === "fail" && d.code === "non-record-unit-unsupported");
  }
  {
    const d = await processOutboxEvent(ev({ sourceKey: "dogaltas:knowledge", sourceTable: KNOWLEDGE.tableName }), upsertDeps());
    check("B", "21 shared (allowSharedNull) source → permanent", d.action === "fail" && d.code === "shared-source-unsupported");
  }
  {
    // column+non-shared+safe but non-record unit → clone STONES with unit override.
    const cfg = { ...STONES, sourceKey: "dogaltas:stones", unit: "section" };
    const d = await processOutboxEvent(ev(), { ...upsertDeps(), resolveConfig: () => cfg });
    check("B", "22 non-record unit → permanent (non-record-unit-unsupported)", d.action === "fail" && d.code === "non-record-unit-unsupported");
  }
  {
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("ok") }));
    check("B", "23 exact ok → complete", d.action === "complete");
  }
  {
    // unchanged/hash-preserved: writer returns ok with no errors & 0 written.
    const write = { attempted: 0, written: 0, plannedInsert: 0, plannedUpdate: 0, unchanged: 1, failed: 0, chunksAttempted: 0, chunksSucceeded: 0, conflictKey: "source_table,source_id,section_ref", errors: [] };
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("ok", write) }));
    check("B", "24 unchanged/hash-preserved → complete", d.action === "complete");
  }
  {
    let deindexCalled = false;
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("not-found"), deindex: async () => { deindexCalled = true; return { status: "no-op", deleted: 0 }; } }));
    check("B", "25 not-found → defensive deindex → complete", d.action === "complete" && deindexCalled && d.note.includes("defensive-deindex:not-found"));
  }
  {
    let deindexCalled = false;
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("skipped-build"), deindex: async () => { deindexCalled = true; return { status: "ok", deleted: 1 }; } }));
    check("B", "26 skipped-build → defensive deindex → complete", d.action === "complete" && deindexCalled);
  }
  {
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("excluded-demo"), deindex: async () => ({ status: "no-op", deleted: 0 }) }));
    check("B", "27 demo exclusion → defensive deindex → complete", d.action === "complete" && d.note.includes("excluded-demo"));
  }
  {
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("excluded-synthetic"), deindex: async () => ({ status: "no-op", deleted: 0 }) }));
    check("B", "28 synthetic exclusion → defensive deindex → complete", d.action === "complete" && d.note.includes("excluded-synthetic"));
  }
  {
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("tenant-mismatch") }));
    check("B", "29 tenant mismatch → permanent", d.action === "fail" && d.retryClass === "permanent" && d.code === "tenant-mismatch");
  }
  {
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("source-id-mismatch") }));
    check("B", "30 source-id mismatch → permanent", d.action === "fail" && d.code === "source-id-mismatch");
  }
  {
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("multiple-rows") }));
    check("B", "31 multiple rows → permanent", d.action === "fail" && d.retryClass === "permanent" && d.code === "multiple-rows");
  }
  {
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => { throw new Error("source-read-failed"); } }));
    check("B", "32 transient source read error → transient", d.action === "fail" && d.retryClass === "transient" && d.code === "index-io-error");
  }
  {
    const write = { attempted: 1, written: 0, plannedInsert: 1, plannedUpdate: 0, unchanged: 0, failed: 1, chunksAttempted: 1, chunksSucceeded: 0, conflictKey: "source_table,source_id,section_ref", errors: [{ chunkIndex: 0, code: "upsert-failed" }] };
    const d = await processOutboxEvent(ev(), upsertDeps({ runExactUpsert: async () => exactResult("ok", write) }));
    check("B", "33 transient index write error → transient", d.action === "fail" && d.retryClass === "transient" && d.code === "index-write-error");
  }

  // ═══════════════ C — DELETE / DEINDEX ═══════════════
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: 1 }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "34 exact delete one row → ok", r.status === "ok" && r.deleted === 1);
  }
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: 0 }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "35 delete zero row → no-op", r.status === "no-op" && r.deleted === 0);
  }
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: 2 }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "36 delete multiple rows → multi-row-anomaly", r.status === "multi-row-anomaly" && r.deleted === 2);
  }
  {
    const spy = [];
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: 1 }, spy));
    await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    const q = spy[0];
    const hasFilter = (col, val) => q.filters.some(([c, v]) => c === col && v === val);
    check("C", "37 tenant filter present", hasFilter("tenant_id", T1));
    check("C", "38 source_table filter from registry (config.tableName)", hasFilter("source_table", STONES.tableName) && STONES.tableName === "stones");
    check("C", "39 source_id filter present", hasFilter("source_id", S1));
    check("C", "39b count:'exact' on index table", q.table === "yasam_hafizasi_index" && q.count === "exact");
  }
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: true, count: null }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "40 DB delete error → delete-failed", r.status === "delete-failed" && r.deleted === 0);
  }
  {
    // FIX1: non-record/join config → tenant-model-unsupported WITHOUT touching db.
    let touched = false;
    const d = createSupabaseIndexDeindexer({ deleteRows: () => { touched = true; throw new Error("should not touch"); } });
    const r = await d.deindex({ config: GUIDE_SECTIONS, sourceId: S1, tenantId: T1 });
    check("C", "40b unsupported model → tenant-model-unsupported (no DB touch)", r.status === "tenant-model-unsupported" && !touched);
  }
  // ── FIX1: null/undefined/invalid count → FAIL-CLOSED delete-failed ──
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: null }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "40c count===null → delete-failed (fail-closed)", r.status === "delete-failed" && r.deleted === 0);
  }
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: undefined }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "40d count===undefined → delete-failed", r.status === "delete-failed" && r.deleted === 0);
  }
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: -1 }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "40e negative count → delete-failed", r.status === "delete-failed" && r.deleted === 0);
  }
  {
    const d = createSupabaseIndexDeindexer(deleteClient({ error: false, count: 1.5 }));
    const r = await d.deindex({ config: STONES, sourceId: S1, tenantId: T1 });
    check("C", "40f non-integer count → delete-failed", r.status === "delete-failed" && r.deleted === 0);
  }
  {
    // FIX1: null count → deindexer delete-failed → PROCESSOR transient directive (delete event).
    const deps = { resolveConfig: resolveYhSourceConfig, runExactUpsert: async () => exactResult("ok"),
      deindex: (input) => createSupabaseIndexDeindexer(deleteClient({ error: false, count: null })).deindex(input) };
    const dir = await processOutboxEvent(ev({ operation: "delete" }), deps);
    check("C", "40g null count → processor transient directive", dir.action === "fail" && dir.retryClass === "transient" && dir.code === "deindex-db-error");
  }

  // ═══════════════ D — WORKER ORCHESTRATION (runOutboxBatch) ═══════════════
  const batchDeps = (over = {}) => ({
    resolveConfig: resolveYhSourceConfig,
    runExactUpsert: async () => exactResult("ok"),
    deindex: async () => ({ status: "no-op", deleted: 0 }),
    worker: "yh-outbox@run-XYZ",
    claimBatch: 10,
    leaseSeconds: 300,
    permanentMaxAttempts: 1,
    transientMaxAttempts: 8,
    baseDelaySeconds: 30,
    maxDelaySeconds: 3600,
    sweep: async () => [],
    claim: async () => [],
    complete: async () => "succeeded",
    fail: async () => "retry_scheduled",
    ...over,
  });
  {
    // 41 flag disabled → zero DB calls. Enable gate lives in worker (server-only);
    // here we simulate by asserting: when disabled, worker returns before runOutboxBatch.
    // We assert the gate function contract by static text (E60) + that runOutboxBatch
    // is only reachable after the gate. Direct proof: gate helper is pure string compare.
    // (Simulated) — assert an all-mock run with claim=[] does NO complete/fail.
    let dbCalls = 0;
    const deps = batchDeps({ sweep: async () => { dbCalls += 1; return []; }, claim: async () => { dbCalls += 1; return []; } });
    const s = await runOutboxBatch(deps);
    check("D", "41 (gate-analog) empty pipeline does no complete/fail", s.completed === 0 && s.failedPermanent === 0 && s.failedTransient === 0 && dbCalls === 2);
  }
  {
    const order = [];
    const deps = batchDeps({ sweep: async () => { order.push("sweep"); return [{}]; }, claim: async () => { order.push("claim"); return []; } });
    const s = await runOutboxBatch(deps);
    check("D", "42 sweep before claim", order[0] === "sweep" && order[1] === "claim" && s.swept === 1);
  }
  {
    const deps = batchDeps({ claim: async () => [] });
    const s = await runOutboxBatch(deps);
    check("D", "43 empty claim → early no-op (no processing)", s.claimed === 0 && s.completed === 0);
  }
  {
    const seen = [];
    const deps = batchDeps({
      claim: async () => [ev({ id: "a" }), ev({ id: "b" }), ev({ id: "c" })],
      complete: async (id) => { seen.push(id); return "succeeded"; },
    });
    const s = await runOutboxBatch(deps);
    check("D", "44 batch processed serially in order", seen.join(",") === "a,b,c" && s.completed === 3);
  }
  {
    let capturedMax = null;
    const deps = batchDeps({
      claim: async () => [ev()],
      runExactUpsert: async () => exactResult("tenant-mismatch"), // permanent
      fail: async (_id, _w, _v, _c, maxA) => { capturedMax = maxA; return "dead"; },
    });
    const s = await runOutboxBatch(deps);
    check("D", "45 permanent directive → fail(maxAttempts=1)", capturedMax === 1 && s.failedPermanent === 1);
  }
  {
    let capturedMax = null;
    const deps = batchDeps({
      claim: async () => [ev()],
      runExactUpsert: async () => { throw new Error("x"); }, // transient
      fail: async (_id, _w, _v, _c, maxA) => { capturedMax = maxA; return "retry_scheduled"; },
    });
    const s = await runOutboxBatch(deps);
    check("D", "46 transient directive → fail(maxAttempts=8)", capturedMax === 8 && s.failedTransient === 1);
  }
  {
    const deps = batchDeps({ claim: async () => [ev()], complete: async () => "succeeded" });
    const s = await runOutboxBatch(deps);
    check("D", "47 complete succeeded counted", s.completed === 1 && s.requeued === 0);
  }
  {
    const deps = batchDeps({ claim: async () => [ev()], complete: async () => "requeued_newer_event" });
    const s = await runOutboxBatch(deps);
    check("D", "48 complete requeued_newer_event counted separately", s.requeued === 1 && s.completed === 0);
  }
  {
    const deps = batchDeps({ claim: async () => [ev()], runExactUpsert: async () => { throw new Error("x"); }, fail: async () => "retry_scheduled" });
    const s = await runOutboxBatch(deps);
    check("D", "49 fail retry_scheduled counted", s.failedTransient === 1);
  }
  {
    const deps = batchDeps({ claim: async () => [ev()], runExactUpsert: async () => exactResult("tenant-mismatch"), fail: async () => "dead" });
    const s = await runOutboxBatch(deps);
    check("D", "50 fail dead counted (permanent)", s.failedPermanent === 1);
  }
  {
    const deps = batchDeps({ claim: async () => [ev()], runExactUpsert: async () => exactResult("tenant-mismatch"), fail: async () => "requeued_newer_event" });
    const s = await runOutboxBatch(deps);
    check("D", "51 fail requeued_newer_event counted as requeued", s.requeued === 1 && s.failedPermanent === 0);
  }
  {
    const seen = [];
    const deps = batchDeps({
      claim: async () => [ev({ id: "a" }), ev({ id: "b" })],
      complete: async (id) => { seen.push(id); if (id === "a") throw new Error("transport"); return "succeeded"; },
    });
    const s = await runOutboxBatch(deps);
    check("D", "52 one event error does not block next", seen.join(",") === "a,b" && s.transportErrors === 1 && s.completed === 1);
  }
  {
    const deps = batchDeps({ claim: async () => [ev()], complete: async () => { throw new Error("rpc-transport"); } });
    const s = await runOutboxBatch(deps);
    check("D", "53 complete/fail transport error handled safely", s.transportErrors === 1 && s.completed === 0);
  }
  {
    let capturedWorker = null;
    const deps = batchDeps({ worker: "yh-outbox@run-ABC", claim: async (w) => { capturedWorker = w; return []; } });
    await runOutboxBatch(deps);
    check("D", "54 worker identity includes runId", capturedWorker === "yh-outbox@run-ABC" && capturedWorker.startsWith("yh-outbox@"));
  }

  // ── FIX1: BEKLENMEYEN PROCESSOR EXCEPTION → GÜVENLİ TRANSIENT FAIL RPC ──
  const throwingProcessorDeps = (over = {}) =>
    batchDeps({ claim: async () => [ev()], resolveConfig: () => { throw new Error("boom-secret-raw"); }, ...over });
  {
    const failCalls = [];
    const deps = throwingProcessorDeps({ fail: async (id, w, v, code, maxA, base, max) => { failCalls.push({ code, maxA, base, max }); return "retry_scheduled"; } });
    const s = await runOutboxBatch(deps);
    check("D", "55 processor throw → failEvent çağrılır", failCalls.length === 1);
    check("D", "56 processor throw fail maxAttempts=8", failCalls[0].maxA === 8);
    check("D", "57 processor throw fail base=30", failCalls[0].base === 30);
    check("D", "58 processor throw fail max=3600", failCalls[0].max === 3600);
    check("D", "59 processor throw güvenli code taşınır", failCalls[0].code === "unexpected-processor-error");
    check("D", "60 ham exception mesajı taşınmaz", !String(failCalls[0].code).includes("boom-secret"));
    check("D", "61 processor throw fail retry_scheduled → failedTransient", s.failedTransient === 1);
  }
  {
    const deps = throwingProcessorDeps({ fail: async () => "dead" });
    const s = await runOutboxBatch(deps);
    check("D", "62 processor throw fail dead sayılır (transient bucket)", s.failedTransient === 1 && s.failedPermanent === 0);
  }
  {
    const deps = throwingProcessorDeps({ fail: async () => "requeued_newer_event" });
    const s = await runOutboxBatch(deps);
    check("D", "63 processor throw fail requeued sayılır", s.requeued === 1 && s.failedTransient === 0);
  }
  {
    let calls = 0;
    const deps = batchDeps({
      claim: async () => [ev({ id: "a" }), ev({ id: "b" })],
      resolveConfig: (k) => { calls += 1; if (calls === 1) throw new Error("boom"); return resolveYhSourceConfig(k); },
      runExactUpsert: async () => exactResult("ok"),
      fail: async () => "retry_scheduled",
      complete: async () => "succeeded",
    });
    const s = await runOutboxBatch(deps);
    check("D", "64 processor throw sonraki eventi engellemez", s.failedTransient === 1 && s.completed === 1);
  }
  // ── FIX1: RPC TRANSPORT HATASI AYRIMI (yalnız complete/fail transport → sweep) ──
  {
    let failAttempts = 0;
    const deps = throwingProcessorDeps({ fail: async () => { failAttempts += 1; throw new Error("fail-rpc-transport"); } });
    const s = await runOutboxBatch(deps);
    check("D", "65 processor throw + failEvent transport hatası → transportError, tek fail denemesi", s.transportErrors === 1 && failAttempts === 1 && s.failedTransient === 0);
  }
  {
    // event a → fail yolu (fail RPC transport hatası); event b → complete yolu (devam kanıtı).
    const A_ID = S1;
    const B_ID = "44444444-4444-4444-8444-444444444444";
    let bCompleted = false;
    const deps = batchDeps({
      claim: async () => [ev({ id: "a", sourceId: A_ID }), ev({ id: "b", sourceId: B_ID })],
      runExactUpsert: async ({ exactSourceId }) => exactResult(exactSourceId === A_ID ? "tenant-mismatch" : "ok"),
      fail: async () => { throw new Error("fail-rpc-transport"); }, // yalnız event a fail'e ulaşır
      complete: async (id) => { if (id === "b") bCompleted = true; return "succeeded"; },
    });
    const s = await runOutboxBatch(deps);
    check("D", "66 fail directive + fail RPC transport hatası → transportError (sweep), sonraki devam", s.transportErrors === 1 && bCompleted === true && s.completed === 1);
  }
  {
    const deps = batchDeps({ claim: async () => [ev()], complete: async () => { throw new Error("complete-rpc-transport"); } });
    const s = await runOutboxBatch(deps);
    check("D", "67 complete directive + complete RPC transport hatası → transportError (sweep)", s.transportErrors === 1 && s.completed === 0);
  }

  // ═══════════════ E — STATİK KAPSAM (metin; server-only import YOK) ═══════════════
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = join(here, "..");
  const read = (p) => readFileSync(join(repo, p), "utf8");
  const workerSrc = read("lib/inngest/functions/yhOutboxWorker.ts");
  const routeSrc = read("app/api/inngest/route.ts");
  const processorSrc = read("lib/yasam-hafizasi/outbox/eventProcessor.ts");
  const rpcSrc = read("lib/yasam-hafizasi/outbox/outboxRpcClient.ts");
  const adapterSrc = read("lib/yasam-hafizasi/indexer/supabaseIndexAdapters.ts");
  const migrationSrc = read("supabase/migrations/20260815000000_yasam_hafizasi_outbox.sql");
  const sourcesSrc = read("lib/yasam-hafizasi/indexer/sources.ts");
  const pkgSrc = read("package.json");
  const newFiles = workerSrc + "\n" + processorSrc + "\n" + rpcSrc;

  check("E", "55 cron every minute", /YH_OUTBOX_CRON\s*=\s*"\*\s\*\s\*\s\*\s\*"/.test(workerSrc) && /triggers:\s*\[\{\s*cron:\s*YH_OUTBOX_CRON\s*\}\]/.test(workerSrc));
  check("E", "56 retries 0", /YH_OUTBOX_RETRIES\s*=\s*0\b/.test(workerSrc) && /retries:\s*YH_OUTBOX_RETRIES/.test(workerSrc));
  check("E", "57 concurrency 1", /YH_OUTBOX_CONCURRENCY\s*=\s*1\b/.test(workerSrc) && /concurrency:\s*YH_OUTBOX_CONCURRENCY/.test(workerSrc));
  check("E", "58 claim batch 10", /YH_OUTBOX_CLAIM_BATCH\s*=\s*10\b/.test(workerSrc));
  check("E", "59 lease 300", /YH_OUTBOX_LEASE_SECONDS\s*=\s*300\b/.test(workerSrc));
  check("E", "60 environment flag exact true gate", /YH_OUTBOX_ENABLE_FLAG\s*=\s*"YH_OUTBOX_WORKER_ENABLED"/.test(workerSrc) && /process\.env\[YH_OUTBOX_ENABLE_FLAG\]\s*===\s*"true"/.test(workerSrc));
  check("E", "60b worker transport is server-only", /^import\s+"server-only";/m.test(workerSrc));
  check("E", "61 route registers yhOutboxWorkerFunction", /import\s*\{\s*yhOutboxWorkerFunction\s*\}/.test(routeSrc) && /functions:\s*\[[^\]]*yhOutboxWorkerFunction[^\]]*\]/.test(routeSrc));
  check("E", "62 pdfTranslateFunction preserved in route", /import\s*\{\s*pdfTranslateFunction\s*\}/.test(routeSrc) && /functions:\s*\[[^\]]*pdfTranslateFunction[^\]]*\]/.test(routeSrc));
  check("E", "63 no CREATE TRIGGER in new/edited code", !/CREATE\s+TRIGGER/i.test(newFiles) && !/CREATE\s+TRIGGER/i.test(adapterSrc));
  check("E", "64 outbox migration invariants intact (4 RPCs, unique, no trigger)", /yh_outbox_claim/.test(migrationSrc) && /yh_outbox_complete/.test(migrationSrc) && /yh_outbox_fail/.test(migrationSrc) && /yh_outbox_sweep_expired/.test(migrationSrc) && /UNIQUE\s*\(source_key,\s*source_id\)/.test(migrationSrc) && !/CREATE\s+TRIGGER/i.test(migrationSrc));
  check("E", "65 source registry (sources.ts) unchanged marker + reader/writer preserved", /YH_INDEX_SOURCES/.test(sourcesSrc) && /createSupabaseSourceReader/.test(adapterSrc) && /createSupabaseIndexWriter/.test(adapterSrc));
  check("E", "66 no new package deps introduced (only existing: inngest/@supabase/node builtins)", /"inngest":\s*"\^4\.5\.0"/.test(pkgSrc) && !/\brequire\(|from\s+"axios"|from\s+"node-fetch"/.test(newFiles));
  check("E", "67 no direct production/network in new files (no fetch/http/createClient)", !/\bfetch\(|https?:\/\/|createClient\(/.test(newFiles));
  check("E", "68 no BF-11C scope (no trigger/enqueue/ALTER source table in new files)", !/enqueue|ALTER\s+TABLE|CREATE\s+TRIGGER/i.test(newFiles));

  // ── FIX1: TYPE SAFETY STATIC (BF-11B kodu; pre-existing writer cast HARİÇ) ──
  // deindex region = benim eklediğim deindexer (createSupabaseIndexDeindexer→EOF);
  // pre-existing writer cast'i (satır ~295) KAPSAMAZ.
  const deindexRegion = adapterSrc.slice(adapterSrc.indexOf("export function createSupabaseIndexDeindexer"));
  check("E", "69 BF-11B kodunda 'as unknown as' yok", !/as\s+unknown\s+as/.test(newFiles) && !/as\s+unknown\s+as/.test(deindexRegion));
  check("E", "70 BF-11B kodunda explicit any yok", !/\bas\s+any\b/.test(newFiles) && !/:\s*any\b/.test(newFiles) && !/\bas\s+any\b/.test(deindexRegion) && !/:\s*any\b/.test(deindexRegion));
  check("E", "71 BF-11B kodunda ts-ignore/ts-expect-error yok", !/@ts-ignore|@ts-expect-error/.test(newFiles) && !/@ts-ignore|@ts-expect-error/.test(deindexRegion));
  check("E", "72 worker facade cast-free + cast başka izinli dosyaya taşınmadı", !/as\s+unknown\s+as|\bas\s+any\b|:\s*any\b|@ts-ignore|@ts-expect-error/.test(workerSrc) && !/as\s+unknown\s+as|\bas\s+any\b/.test(deindexRegion));

  // ─── Özet ──────────────────────────────────────────────────────────────────
  const total = pass + fail;
  console.log("");
  console.log("── Kategori dağılımı ──");
  for (const c of Object.keys(cats).sort()) console.log(`  ${c}: ${cats[c]} assertion`);
  console.log("");
  if (fail > 0) {
    console.error(`yh-outbox-worker-harness: ${pass}/${total} PASS  (${fail} FAIL)`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`yh-outbox-worker-harness: ${pass}/${total} PASS`);
}

main().catch((e) => {
  console.error("harness fatal:", e && e.message ? e.message : e);
  process.exit(1);
});
