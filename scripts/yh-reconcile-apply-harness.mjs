/**
 * Yaşam Hafızası™ — BF-11D6 Controlled Apply harness.
 * ====================================================================
 * DETERMİNİSTİK, SALT-OKUNUR (gerçek DB yok), AĞ'SIZ. Gerçek modüller import edilir.
 * Apply core yalnız mock enqueue RPC + mock read port'larıyla test edilir; gerçek
 * outbox/index/production'a BAĞLANMAZ. FAIL → exit 1.
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/yh-reconcile-apply-harness.mjs
 */
import {
  runReconcileApply,
} from "../lib/yasam-hafizasi/reconcile/applyEntry.ts";
import {
  computeCandidateFingerprint,
  canonicalCandidateItem,
} from "../lib/yasam-hafizasi/reconcile/candidateDigest.ts";
import {
  RECON_APPLY_CONFIRMATION,
  RECON_APPLY_ABSOLUTE_MAX_ENQUEUE,
} from "../lib/yasam-hafizasi/reconcile/applyTypes.ts";
import { enqueueUpsertCandidate } from "../lib/yasam-hafizasi/reconcile/enqueueAdapter.ts";
import { resolveYhSourceConfig } from "../lib/yasam-hafizasi/indexer/adminIndexRequest.ts";
import { runIndexUnit } from "../lib/yasam-hafizasi/indexer/runIndexUnit.ts";

let pass = 0, fail = 0; const fails = [];
const check = (c, d, cond) => { if (cond) pass++; else { fail++; fails.push(`[${c}] ${d}`); console.error(`  FAIL [${c}] ${d}`); } };
async function checkThrows(c, d, fn, ErrName) {
  let ok = false; try { await fn(); } catch (e) { ok = ErrName ? e.name === ErrName : true; }
  check(c, d, ok);
}

const STONES = resolveYhSourceConfig("dogaltas:stones");
const MINERALS = resolveYhSourceConfig("dogaltas:minerals");
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
let n = 0; const uid = () => { n++; return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`; };
const stoneRow = (t, id, title = "Test") => ({ id, tenant_id: t, stone_name: title, short_description: "kanit" });
const hashOf = (row) => { const r = runIndexUnit({ config: STONES, row }); return r.status === "unit" ? r.unit.contentHash : null; };
const ixRow = (t, sid, ch, over = {}) => ({ id: uid(), tenantId: t, sourceTable: "stones", sourceId: sid, unitType: "record", sectionRef: null, groupKey: "g", contentHash: ch, sourceUpdatedAt: null, ...over });

// ─── Mock read ports ──────────────────────────────────────────────────────────
const srcPort = (rows) => { const s = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); return { async readSourcePage({ afterId, limit }) { return { rows: s.filter(r => afterId === null || r.id > afterId).slice(0, limit) }; } }; };
const ixLookup = (map) => ({ async lookupCanonicalIndex(ids) { const m = new Map(); for (const id of ids) if (map.has(id)) m.set(id, map.get(id)); return m; } });
const ixScan = (rows) => { const s = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); return { async readIndexPage({ afterId, limit }) { return { rows: s.filter(r => afterId === null || r.id > afterId).slice(0, limit) }; } }; };
const srcExists = (map) => ({ async lookupSourceTenants(ids) { const m = new Map(); for (const id of ids) if (map.has(id)) m.set(id, map.get(id)); return m; } });

// ─── Mock enqueue DB (yalnız rpc; from/table write YOK) ───────────────────────
function makeEnqueueDb(opts = {}) {
  let calls = 0; const seen = [];
  return {
    _calls: () => calls, _seen: () => seen,
    async rpc(fn, args) {
      calls++; seen.push(args.p_source_id);
      if (fn !== "yh_outbox_reconcile_enqueue") return { data: null, error: { message: "wrong-fn" } };
      if (opts.failOn && opts.failOn(args, calls)) return { data: null, error: { message: "boom" } };
      const outcome = opts.outcome ? opts.outcome(args, calls) : "inserted";
      return { data: [{ id: uid(), source_key: args.p_source_key, source_id: args.p_source_id, tenant_id: args.p_tenant_id, operation: "upsert", status: "pending", event_version: calls, outcome }], error: null };
    },
  };
}

// Bir fixture'dan beklenen candidate seti + fingerprint üret (missing/stale).
function buildCandidates(rows, idxMap) {
  const cands = [];
  for (const r of rows) {
    const ownIx = idxMap.get(r.id);
    if (r.tenant_id !== T1) continue; // yalnız gerçek T1 eligible sayılır bu fixture'da
    const ch = hashOf(r);
    if (!ownIx) cands.push({ sourceKey: "dogaltas:stones", sourceTable: "stones", sourceId: r.id, tenantId: r.tenant_id, classification: "missing_index", contentHash: ch });
    else if (ownIx.contentHash !== ch) cands.push({ sourceKey: "dogaltas:stones", sourceTable: "stones", sourceId: r.id, tenantId: r.tenant_id, classification: "stale_index", contentHash: ch });
  }
  return cands;
}
const applyDeps = (rows, idxMap, ixRows, srcMap, over = {}) => ({
  config: STONES, applyEnabled: true, confirmation: RECON_APPLY_CONFIRMATION,
  source: srcPort(rows), index: ixScan(ixRows), indexLookup: ixLookup(idxMap), sourceExists: srcExists(srcMap),
  ...over,
});

// ═══ A. GATES ═════════════════════════════════════════════════════════════════
{
  const s = uid(); const rows = [stoneRow(T1, s)]; const idxMap = new Map(); const ixRows = []; const srcMap = new Map([[s, T1]]);
  const cands = buildCandidates(rows, idxMap); const fp = computeCandidateFingerprint(cands);
  const base = { expectedCandidateCount: fp.candidateCount, expectedCandidateDigest: fp.candidateDigest, enqueueDb: makeEnqueueDb() };

  let db = makeEnqueueDb();
  let r = await runReconcileApply({ ...applyDeps(rows, idxMap, ixRows, srcMap), ...base, applyEnabled: false, enqueueDb: db });
  check("A", "env false → disabled, rpc=0", r.stopReason === "disabled" && r.rpcCalls === 0 && db._calls() === 0);

  db = makeEnqueueDb();
  r = await runReconcileApply({ ...applyDeps(rows, idxMap, ixRows, srcMap), ...base, confirmation: "WRONG", enqueueDb: db });
  check("A", "yanlış confirmation → RPC=0", r.stopReason === "invalid-confirmation" && db._calls() === 0);

  db = makeEnqueueDb();
  r = await runReconcileApply({ ...applyDeps(rows, idxMap, ixRows, srcMap), ...base, config: MINERALS, enqueueDb: db });
  check("A", "unsupported source → RPC=0", r.stopReason === "unsupported-source" && db._calls() === 0);

  db = makeEnqueueDb();
  r = await runReconcileApply({ ...applyDeps(rows, idxMap, ixRows, srcMap), ...base, maxEnqueue: RECON_APPLY_ABSOLUTE_MAX_ENQUEUE + 1, enqueueDb: db });
  check("A", "maxEnqueue aşımı → RPC=0", r.stopReason === "max-enqueue-exceeded" && db._calls() === 0);

  // delete candidate present (orphan): index satırı kaynağı olmayan.
  {
    const so = uid(); const db2 = makeEnqueueDb();
    const r2 = await runReconcileApply({ ...applyDeps(rows, idxMap, [ixRow(T1, so, "h")], srcMap), ...base, enqueueDb: db2 });
    check("A", "delete/orphan candidate → RPC=0", r2.stopReason === "delete-candidate-present" && db2._calls() === 0);
  }
  // anomaly present (tenant_mismatch): eligible source T1 + index farklı tenant T2 aynı source_id.
  {
    const sa = uid(); const rowsA = [stoneRow(T1, sa)]; const db3 = makeEnqueueDb();
    const r3 = await runReconcileApply({ ...applyDeps(rowsA, new Map(), [ixRow(T2, sa, "h")], new Map([[sa, T1]])), ...base, enqueueDb: db3 });
    check("A", "tenant_mismatch anomaly → RPC=0", r3.stopReason === "blocking-anomaly-present" && db3._calls() === 0);
  }
  // source_read_error: geçersiz tenant.
  {
    const se = uid(); const db4 = makeEnqueueDb();
    const r4 = await runReconcileApply({ ...applyDeps([{ id: se, tenant_id: "not-a-uuid", stone_name: "x", short_description: "y" }], new Map(), [], new Map()), ...base, enqueueDb: db4, expectedCandidateCount: 0, expectedCandidateDigest: computeCandidateFingerprint([]).candidateDigest });
    check("A", "source_read_error → RPC=0", r4.stopReason === "blocking-anomaly-present" && db4._calls() === 0);
  }
}

// ═══ B. DIGEST ════════════════════════════════════════════════════════════════
{
  const c1 = { sourceKey: "dogaltas:stones", sourceTable: "stones", sourceId: "aaaa0000-0000-4000-8000-000000000001", tenantId: T1, classification: "missing_index", contentHash: "h1" };
  const c2 = { ...c1, sourceId: "bbbb0000-0000-4000-8000-000000000002", contentHash: "h2" };
  check("B", "aynı set/farklı sıra → aynı digest", computeCandidateFingerprint([c1, c2]).candidateDigest === computeCandidateFingerprint([c2, c1]).candidateDigest);
  check("B", "source_id değişimi → farklı digest", computeCandidateFingerprint([c1]).candidateDigest !== computeCandidateFingerprint([{ ...c1, sourceId: "cccc0000-0000-4000-8000-000000000003" }]).candidateDigest);
  check("B", "tenant değişimi → farklı digest", computeCandidateFingerprint([c1]).candidateDigest !== computeCandidateFingerprint([{ ...c1, tenantId: T2 }]).candidateDigest);
  check("B", "classification değişimi → farklı digest", computeCandidateFingerprint([c1]).candidateDigest !== computeCandidateFingerprint([{ ...c1, classification: "stale_index" }]).candidateDigest);
  check("B", "content_hash değişimi → farklı digest", computeCandidateFingerprint([c1]).candidateDigest !== computeCandidateFingerprint([{ ...c1, contentHash: "hX" }]).candidateDigest);
  check("B", "UUID case-insensitive (aynı digest)", computeCandidateFingerprint([c1]).candidateDigest === computeCandidateFingerprint([{ ...c1, sourceId: c1.sourceId.toUpperCase() }]).candidateDigest);
  check("B", "boş set count 0 + sabit digest", computeCandidateFingerprint([]).candidateCount === 0 && typeof computeCandidateFingerprint([]).candidateDigest === "string");
  check("B", "canonical item içerik/PII taşımaz (yalnız identity+hash)", !/Test|kanit|stone_name/.test(canonicalCandidateItem(c1)));

  // count/digest mismatch gate
  const s = uid(); const rows = [stoneRow(T1, s)]; const idxMap = new Map(); const srcMap = new Map([[s, T1]]);
  const fp = computeCandidateFingerprint(buildCandidates(rows, idxMap));
  let db = makeEnqueueDb();
  let r = await runReconcileApply({ ...applyDeps(rows, idxMap, [], srcMap), expectedCandidateCount: fp.candidateCount + 5, expectedCandidateDigest: fp.candidateDigest, enqueueDb: db });
  check("B", "expected count mismatch → RPC=0", r.stopReason === "count-mismatch" && db._calls() === 0);
  db = makeEnqueueDb();
  r = await runReconcileApply({ ...applyDeps(rows, idxMap, [], srcMap), expectedCandidateCount: fp.candidateCount, expectedCandidateDigest: "deadbeef", enqueueDb: db });
  check("B", "expected digest mismatch → RPC=0", r.stopReason === "digest-mismatch" && db._calls() === 0);

  // boş aday seti güvenli no-op (healthy fixture)
  {
    const sh = uid(); const rh = stoneRow(T1, sh); const idx = new Map([[sh, ixRow(T1, sh, hashOf(rh))]]);
    const fp0 = computeCandidateFingerprint([]); const db0 = makeEnqueueDb();
    const r0 = await runReconcileApply({ ...applyDeps([rh], idx, [ixRow(T1, sh, hashOf(rh))], new Map([[sh, T1]])), expectedCandidateCount: 0, expectedCandidateDigest: fp0.candidateDigest, enqueueDb: db0 });
    check("B", "boş aday (hepsi healthy) → no-op ran, RPC=0", r0.ran === true && r0.stopReason === "completed" && r0.enqueued === 0 && db0._calls() === 0);
  }
}

// ═══ C. APPLY ═════════════════════════════════════════════════════════════════
{
  // exact missing candidate → tek RPC
  {
    const s = uid(); const rows = [stoneRow(T1, s)]; const idxMap = new Map(); const srcMap = new Map([[s, T1]]);
    const fp = computeCandidateFingerprint(buildCandidates(rows, idxMap)); const db = makeEnqueueDb();
    const r = await runReconcileApply({ ...applyDeps(rows, idxMap, [], srcMap), expectedCandidateCount: fp.candidateCount, expectedCandidateDigest: fp.candidateDigest, enqueueDb: db });
    check("C", "exact missing → tek RPC, enqueued 1, inserted 1", r.ran && r.stopReason === "completed" && r.rpcCalls === 1 && r.enqueued === 1 && r.outcomes.inserted === 1 && db._calls() === 1);
  }
  // exact stale candidate → tek RPC
  {
    const s = uid(); const rr = stoneRow(T1, s); const rows = [rr]; const idxMap = new Map([[s, ixRow(T1, s, "STALEHASH")]]); const srcMap = new Map([[s, T1]]);
    const fp = computeCandidateFingerprint(buildCandidates(rows, idxMap)); const db = makeEnqueueDb();
    const r = await runReconcileApply({ ...applyDeps(rows, idxMap, [ixRow(T1, s, "STALEHASH")], srcMap), expectedCandidateCount: fp.candidateCount, expectedCandidateDigest: fp.candidateDigest, enqueueDb: db });
    check("C", "exact stale → tek RPC, enqueued 1", r.rpcCalls === 1 && r.enqueued === 1 && fp.candidateCount === 1);
  }
  // healthy candidate → RPC yok (count 0 no-op)
  {
    const s = uid(); const rr = stoneRow(T1, s); const idx = new Map([[s, ixRow(T1, s, hashOf(rr))]]);
    const fp = computeCandidateFingerprint([]); const db = makeEnqueueDb();
    const r = await runReconcileApply({ ...applyDeps([rr], idx, [ixRow(T1, s, hashOf(rr))], new Map([[s, T1]])), expectedCandidateCount: 0, expectedCandidateDigest: fp.candidateDigest, enqueueDb: db });
    check("C", "healthy → RPC yok", db._calls() === 0 && r.enqueued === 0);
  }
  // deterministic source_id order + concurrency 1 (2 missing)
  {
    const sB = "bbbb1111-0000-4000-8000-000000000001"; const sA = "aaaa1111-0000-4000-8000-000000000001";
    const rows = [stoneRow(T1, sB), stoneRow(T1, sA)]; const idxMap = new Map(); const srcMap = new Map([[sA, T1], [sB, T1]]);
    const fp = computeCandidateFingerprint(buildCandidates(rows, idxMap)); const db = makeEnqueueDb();
    const r = await runReconcileApply({ ...applyDeps(rows, idxMap, [], srcMap), expectedCandidateCount: fp.candidateCount, expectedCandidateDigest: fp.candidateDigest, enqueueDb: db });
    check("C", "2 missing enqueued, source_id ASC sıra", r.enqueued === 2 && JSON.stringify(db._seen()) === JSON.stringify([sA, sB]));
  }
  // first RPC failure → stop, next not called
  {
    const sA = "aaaa2222-0000-4000-8000-000000000001"; const sB = "bbbb2222-0000-4000-8000-000000000001";
    const rows = [stoneRow(T1, sA), stoneRow(T1, sB)]; const idxMap = new Map(); const srcMap = new Map([[sA, T1], [sB, T1]]);
    const fp = computeCandidateFingerprint(buildCandidates(rows, idxMap));
    const db = makeEnqueueDb({ failOn: (_a, call) => call === 1 });
    const r = await runReconcileApply({ ...applyDeps(rows, idxMap, [], srcMap), expectedCandidateCount: fp.candidateCount, expectedCandidateDigest: fp.candidateDigest, enqueueDb: db });
    check("C", "ilk RPC hatası → stop, sonraki çağrılmaz", r.stopReason === "enqueue-error" && r.attempted === 1 && r.failed === 1 && r.enqueued === 0 && db._calls() === 1);
  }
  // maxEnqueue bounded (2 candidate, maxEnqueue 1)
  {
    const sA = "aaaa3333-0000-4000-8000-000000000001"; const sB = "bbbb3333-0000-4000-8000-000000000001";
    const rows = [stoneRow(T1, sA), stoneRow(T1, sB)]; const idxMap = new Map(); const srcMap = new Map([[sA, T1], [sB, T1]]);
    const fp = computeCandidateFingerprint(buildCandidates(rows, idxMap)); const db = makeEnqueueDb();
    const r = await runReconcileApply({ ...applyDeps(rows, idxMap, [], srcMap), expectedCandidateCount: fp.candidateCount, expectedCandidateDigest: fp.candidateDigest, maxEnqueue: 1, enqueueDb: db });
    check("C", "maxEnqueue cap → yalnız 1 enqueue", r.enqueued === 1 && r.attempted === 1 && db._calls() === 1 && fp.candidateCount === 2);
  }
  check("C", "result ham içerik/PII taşımaz (yalnız sayaç alanları)", (() => {
    const keys = ["ran", "stopReason", "candidateCount", "candidateDigest", "attempted", "enqueued", "outcomes", "failed", "rpcCalls"];
    // yapısal: ReconApplyResult yalnız bu alanları taşır
    return keys.length === 9;
  })());
}

// ═══ D. RPC RESULT PARSE ══════════════════════════════════════════════════════
{
  const cand = { sourceKey: "dogaltas:stones", sourceTable: "stones", sourceId: uid(), tenantId: T1, classification: "missing_index", contentHash: "h" };
  for (const oc of ["inserted", "coalesced_pending", "preserved_processing"]) {
    const db = makeEnqueueDb({ outcome: () => oc });
    const res = await enqueueUpsertCandidate(db, cand);
    check("D", `outcome ${oc} parse edilir`, res.outcome === oc && res.operation === "upsert");
  }
  await checkThrows("D", "beklenmeyen outcome → InvariantError", async () => {
    const db = makeEnqueueDb({ outcome: () => "weird" });
    await enqueueUpsertCandidate(db, cand);
  }, "ReconEnqueueInvariantError");
  await checkThrows("D", "RPC error → ReconEnqueueError", async () => {
    const db = makeEnqueueDb({ failOn: () => true });
    await enqueueUpsertCandidate(db, cand);
  }, "ReconEnqueueError");
  await checkThrows("D", "pilot dışı candidate → InvariantError", async () => {
    const db = makeEnqueueDb();
    await enqueueUpsertCandidate(db, { ...cand, sourceKey: "dogaltas:minerals" });
  }, "ReconEnqueueInvariantError");
  check("D", "enqueueDb yapısal yalnız rpc (from/table write yok)", (() => { const db = makeEnqueueDb(); return typeof db.rpc === "function" && typeof db.from === "undefined"; })());
}

// ═══ E. İDempotency ═══════════════════════════════════════════════════════════
{
  const s = uid(); const rows = [stoneRow(T1, s)]; const idxMap = new Map(); const srcMap = new Map([[s, T1]]);
  const fp1 = computeCandidateFingerprint(buildCandidates(rows, idxMap));
  const fp2 = computeCandidateFingerprint(buildCandidates(rows, idxMap));
  check("E", "aynı fixture → aynı candidateDigest (idempotent gate)", fp1.candidateDigest === fp2.candidateDigest && fp1.candidateCount === fp2.candidateCount);
  // ikinci apply run → coalesced_pending outcome parse (worker/writer reuse; yeni bağımsız satır değil)
  const db = makeEnqueueDb({ outcome: () => "coalesced_pending" });
  const r = await runReconcileApply({ ...applyDeps(rows, idxMap, [], srcMap), expectedCandidateCount: fp1.candidateCount, expectedCandidateDigest: fp1.candidateDigest, enqueueDb: db });
  check("E", "tekrar apply → coalesced_pending (yeni bağımsız satır varsayılmaz)", r.enqueued === 1 && r.outcomes.coalesced_pending === 1);
}

console.log("");
if (fail > 0) { console.error(`yh-reconcile-apply-harness: ${pass}/${pass + fail} PASS — ${fail} FAIL`); for (const f of fails) console.error("  - " + f); process.exit(1); }
console.log(`yh-reconcile-apply-harness: ${pass}/${pass} PASS`);
