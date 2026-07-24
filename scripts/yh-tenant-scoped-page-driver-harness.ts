// Yaşam Hafızası™ — BF-4B: tenant-scoped page driver harness (saf; AĞ YOK; minimal FS).
//
// GERÇEK import ile doğrular: parseArgs (default dry-run / write çift-onay), validateStateForRun
// (driver/version/mode/source/tenant mismatch; dry-run vs write ayrı state), computeNextState
// (advance / written=0 advance / partial no-advance / echo-mismatch / same-cursor guard / final),
// runScopedPaging (state-absent init; completed→ağ 0; timeout/503/parse/echo → state DEĞİŞMEZ;
// intermediate advance) ve createFsStateStore atomik (temp+rename) yazımı (os.tmpdir).
// Çalıştırma:  npx tsx scripts/yh-tenant-scoped-page-driver-harness.ts

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DRIVER_NAME,
  STATE_VERSION,
  computeNextState,
  createFsStateStore,
  initState,
  parseArgs,
  runScopedPaging,
  validateStateForRun,
  type DriverState,
  type RequestResult,
  type RunParams,
  type SafeLogger,
  type StateStore,
} from "./yh-tenant-scoped-page-driver";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

// ── Fixture UUID (GERÇEK production değeri DEĞİL) ─────────────────────────────
const TENANT = "11111111-1111-1111-1111-111111111111";
const SOURCE = "biyoenerji:symbols";

function dryParams(over: Partial<RunParams> = {}): RunParams {
  return { mode: "dry-run", sourceKey: SOURCE, scopedTenantId: TENANT, statePath: "/tmp/x.json", confirmWrite: false, ...over };
}
function writeParams(): RunParams {
  return { mode: "write", sourceKey: SOURCE, scopedTenantId: TENANT, statePath: "/tmp/x.json", confirmWrite: true };
}

const silentLogger: SafeLogger = { info: () => {}, page: () => {}, stop: () => {}, done: () => {} };

function memStore(initial: unknown | null): { store: StateStore; writes: DriverState[] } {
  let current = initial;
  const writes: DriverState[] = [];
  const store: StateStore = {
    read: async () => current,
    write: async (s) => {
      writes.push(s);
      current = s;
    },
  };
  return { store, writes };
}

function seqPost(results: RequestResult[]): { post: (a: string | null) => Promise<RequestResult>; calls: (string | null)[] } {
  const calls: (string | null)[] = [];
  let i = 0;
  return {
    post: async (a) => {
      calls.push(a);
      return results[i++] ?? { ok: false, code: "exhausted" };
    },
    calls,
  };
}

function okResp(text: string): RequestResult {
  return { ok: true, status: 200, text };
}
function dryBody(nextCursor: string | null, hasMore: boolean, p: RunParams): string {
  return JSON.stringify({
    ok: true,
    mode: p.mode,
    sourceKey: p.sourceKey,
    scopedTenantId: p.scopedTenantId,
    page: { nextCursor, hasMore },
    write: null,
  });
}
function writeBody(nextCursor: string | null, hasMore: boolean, p: RunParams, writeOver: Record<string, unknown>): string {
  return JSON.stringify({
    ok: true,
    mode: "write",
    sourceKey: p.sourceKey,
    scopedTenantId: p.scopedTenantId,
    page: { nextCursor, hasMore },
    write: { completed: true, failed: 0, errors: [], written: 1, ...writeOver },
  });
}

async function main(): Promise<void> {
  // ══ A — parseArgs ═══════════════════════════════════════════════════════════
  {
    const r = parseArgs(["--source", SOURCE, "--tenant", TENANT, "--state", "/p"]);
    check(r.ok && r.params.mode === "dry-run", "A default dry-run");
  }
  {
    const r = parseArgs(["--source", SOURCE, "--tenant", TENANT, "--state", "/p", "--mode", "write"]);
    check(!r.ok && r.code === "write-needs-confirm", "A write --confirm-write eksik → red");
  }
  {
    const r = parseArgs(["--source", SOURCE, "--tenant", TENANT, "--state", "/p", "--mode", "write", "--confirm-write"]);
    check(r.ok && r.params.mode === "write" && r.params.confirmWrite === true, "A write + confirm → ok");
  }
  check(!parseArgs(["--tenant", TENANT, "--state", "/p"]).ok, "A missing source → red");
  check(!parseArgs(["--source", SOURCE, "--state", "/p"]).ok, "A missing tenant → red");
  {
    const r = parseArgs(["--source", SOURCE, "--tenant", "not-uuid", "--state", "/p"]);
    check(!r.ok && r.code === "invalid-tenant", "A invalid tenant → red");
  }
  {
    const r = parseArgs(["--source", SOURCE, "--tenant", TENANT]);
    check(!r.ok && r.code === "missing-state", "A missing state → red");
  }
  {
    const r = parseArgs(["--source", SOURCE, "--tenant", TENANT, "--state", "/p", "--mode", "bogus"]);
    check(!r.ok && r.code === "invalid-mode", "A invalid mode → red");
  }
  {
    const r = parseArgs(["--source", SOURCE, "--tenant", TENANT, "--state", "/p", "--zzz"]);
    check(!r.ok && r.code === "unknown-arg", "A unknown arg → red");
  }
  {
    const r = parseArgs(["--source", SOURCE, "--source", SOURCE, "--tenant", TENANT, "--state", "/p"]);
    check(!r.ok && r.code === "duplicate-arg", "A duplicate arg → red");
  }
  {
    const r = parseArgs(["--source", "--tenant"]); // --source değeri --tenant gibi görünür
    check(!r.ok && r.code === "missing-value", "A missing value → red");
  }

  // ══ B — validateStateForRun ═════════════════════════════════════════════════
  const p = dryParams();
  const goodState: DriverState = { driver: DRIVER_NAME, version: STATE_VERSION, mode: "dry-run", sourceKey: SOURCE, scopedTenantId: TENANT, nextCursor: null, completed: false };
  check(validateStateForRun(goodState, p).ok, "B geçerli state");
  check(!validateStateForRun({ ...goodState, driver: "other" }, p).ok, "B driver mismatch");
  {
    const r = validateStateForRun({ ...goodState, version: 1 }, p);
    check(!r.ok && r.reason === "version-mismatch", "B unknown/old version → red");
  }
  {
    const r = validateStateForRun({ ...goodState, mode: "write" }, p);
    check(!r.ok && r.reason === "mode-mismatch", "B mode mismatch (dry-run vs write ayrı state)");
  }
  {
    const r = validateStateForRun({ ...goodState, sourceKey: "x:y" }, p);
    check(!r.ok && r.reason === "source-mismatch", "B source mismatch");
  }
  {
    const r = validateStateForRun({ ...goodState, scopedTenantId: "22222222-2222-2222-2222-222222222222" }, p);
    check(!r.ok && r.reason === "tenant-mismatch", "B tenant mismatch");
  }
  check(!validateStateForRun({ ...goodState, completed: "yes" }, p).ok, "B bozuk shape → red");
  // dry-run state write run'a KULLANILAMAZ.
  check(!validateStateForRun(goodState, writeParams()).ok, "B dry-run state → write run red");

  // ══ C — computeNextState ════════════════════════════════════════════════════
  const prev0 = initState(p);
  {
    const r = computeNextState(prev0, JSON.parse(dryBody("c1", true, p)), p);
    check(r.ok && r.nextState.nextCursor === "c1" && r.nextState.completed === false, "C hasMore → advance cursor, completed false");
  }
  {
    const r = computeNextState(prev0, JSON.parse(dryBody(null, false, p)), p);
    check(r.ok && r.nextState.completed === true && r.nextState.nextCursor === null, "C final page → completed true");
  }
  {
    // same-cursor infinite-loop guard.
    const prev: DriverState = { ...prev0, nextCursor: "c1" };
    const r = computeNextState(prev, JSON.parse(dryBody("c1", true, p)), p);
    check(!r.ok && r.reason === "cursor-repeat", "C same-cursor → cursor-repeat");
  }
  {
    const r = computeNextState(prev0, JSON.parse(dryBody("", true, p)), p);
    check(!r.ok && r.reason === "hasmore-empty-cursor", "C hasMore + boş cursor → red");
  }
  {
    // dry-run response write !== null → red.
    const bad = JSON.parse(dryBody("c1", true, p));
    bad.write = { completed: true };
    const r = computeNextState(prev0, bad, p);
    check(!r.ok && r.reason === "dryrun-write-not-null", "C dry-run write !== null → red");
  }
  {
    // echo mismatch (source).
    const bad = JSON.parse(dryBody("c1", true, p));
    bad.sourceKey = "x:y";
    const r = computeNextState(prev0, bad, p);
    check(!r.ok && r.reason === "source-mismatch", "C echo source mismatch → red");
  }
  {
    // not ok.
    const r = computeNextState(prev0, { ok: false, mode: "dry-run", sourceKey: SOURCE, scopedTenantId: TENANT, page: { nextCursor: null, hasMore: false }, write: null }, p);
    check(!r.ok && r.reason === "not-ok", "C ok:false → red");
  }
  // write: written=0 + unchanged advances; failed/partial no advance.
  const wp = writeParams();
  {
    const r = computeNextState(initState(wp), JSON.parse(writeBody("c1", true, wp, { written: 0, unchanged: 3 })), wp);
    check(r.ok && r.nextState.nextCursor === "c1", "C write written=0/unchanged → advance");
  }
  {
    const r = computeNextState(initState(wp), JSON.parse(writeBody("c1", true, wp, { completed: false, failed: 2, errors: [{ chunkIndex: 0, code: "upsert-failed" }] })), wp);
    check(!r.ok && r.reason === "write-not-clean", "C write partial/failed>0 → no advance");
  }
  {
    const r = computeNextState(initState(wp), JSON.parse(writeBody("c1", true, wp, { completed: true, failed: 1, errors: [] })), wp);
    check(!r.ok && r.reason === "write-not-clean", "C write failed>0 (errors boş olsa da) → no advance");
  }

  // ══ D — runScopedPaging orkestrasyonu ═══════════════════════════════════════
  // D1: state-absent init → tek completed sayfa.
  {
    const ms = memStore(null);
    const sp = seqPost([okResp(dryBody(null, false, p))]);
    const res = await runScopedPaging({ params: p, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.completed && res.pagesProcessed === 1, "D1 state-absent init → completed");
    check(ms.writes.length === 1 && ms.writes[0].completed === true, "D1 tek atomik yazım");
  }
  // D2: intermediate advance (2 sayfa).
  {
    const ms = memStore(null);
    const sp = seqPost([okResp(dryBody("c1", true, p)), okResp(dryBody(null, false, p))]);
    const res = await runScopedPaging({ params: p, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.completed && res.pagesProcessed === 2, "D2 intermediate → 2 sayfa completed");
    check(ms.writes[0].nextCursor === "c1" && ms.writes[0].completed === false, "D2 ara sayfa cursor ilerler");
    check(ms.writes[1].completed === true, "D2 son sayfa completed");
    check(sp.calls[0] === null && sp.calls[1] === "c1", "D2 afterId cursor'dan gelir");
  }
  // D3: completed state → hiç ağ çağrısı yok.
  {
    const completedState: DriverState = { ...goodState, completed: true };
    const ms = memStore(completedState);
    const sp = seqPost([okResp(dryBody(null, false, p))]);
    const res = await runScopedPaging({ params: p, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.completed && sp.calls.length === 0, "D3 completed → ağ çağrısı 0");
    check(ms.writes.length === 0, "D3 completed → yazım yok");
  }
  // D4: timeout → state DEĞİŞMEZ.
  {
    const ms = memStore(null);
    const sp = seqPost([{ ok: false, code: "timeout" }]);
    const res = await runScopedPaging({ params: p, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.stopped && res.stopCode === "timeout" && ms.writes.length === 0, "D4 timeout → state unchanged");
  }
  // D5: 503 → state DEĞİŞMEZ.
  {
    const ms = memStore(null);
    const sp = seqPost([{ ok: true, status: 503, text: "" }]);
    const res = await runScopedPaging({ params: p, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.stopped && res.stopCode === "http-503" && ms.writes.length === 0, "D5 503 → state unchanged");
  }
  // D6: parse hatası → state DEĞİŞMEZ.
  {
    const ms = memStore(null);
    const sp = seqPost([okResp("{not-json")]);
    const res = await runScopedPaging({ params: p, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.stopped && res.stopCode === "bad-json" && ms.writes.length === 0, "D6 parse → state unchanged");
  }
  // D7: echo mismatch → state DEĞİŞMEZ.
  {
    const ms = memStore(null);
    const bad = JSON.parse(dryBody(null, false, p));
    bad.scopedTenantId = "22222222-2222-2222-2222-222222222222";
    const sp = seqPost([okResp(JSON.stringify(bad))]);
    const res = await runScopedPaging({ params: p, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.stopped && res.stopCode === "tenant-mismatch" && ms.writes.length === 0, "D7 echo mismatch → state unchanged");
  }
  // D8: state mismatch (dry-run state, write run) → ağ öncesi fail-closed.
  {
    const ms = memStore(goodState); // dry-run state
    const sp = seqPost([okResp(writeBody(null, false, wp, {}))]);
    const res = await runScopedPaging({ params: wp, postPage: sp.post, store: ms.store, logger: silentLogger });
    check(res.stopped && res.stopCode === "mode-mismatch" && sp.calls.length === 0, "D8 dry-run state → write run fail-closed (ağ 0)");
  }

  // ══ E — createFsStateStore atomik (gerçek FS; os.tmpdir) ════════════════════
  {
    const dir = path.join(os.tmpdir(), "yh-tenant-scoped-harness");
    const file = path.join(dir, `state-${process.pid}-${Date.now()}.json`);
    const store = createFsStateStore(file);
    check((await store.read()) === null, "E dosya yok → null");
    const st: DriverState = { ...goodState, nextCursor: "cX" };
    await store.write(st);
    const back = await store.read();
    check(back !== null && J(back) === J(st), `E yazım+okuma round-trip (${J(back)})`);
    // .tmp artığı kalmamalı (rename tamamlandı).
    let tmpExists = true;
    try {
      await fs.access(`${file}.tmp`);
    } catch {
      tmpExists = false;
    }
    check(!tmpExists, "E .tmp artığı yok (atomik rename)");
    // Temizlik (best-effort).
    try {
      await fs.rm(file, { force: true });
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }

  // ── Sonuç ──
  if (errors.length === 0) {
    console.log("✅ yh-tenant-scoped-page-driver-harness PASS");
    console.log(`CHECK: ${total} kontrol OK, 0 FAIL.`);
  } else {
    console.error("❌ yh-tenant-scoped-page-driver-harness FAIL");
    for (const e of errors) console.error("   - " + e);
    console.log(`CHECK: ${total - errors.length} kontrol OK, ${errors.length} FAIL.`);
    process.exitCode = 1;
  }
}

void main();
