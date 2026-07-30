/**
 * Yaşam Hafızası™ — BF-11D Reconciliation Dry-Run harness.
 * ====================================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, AĞ'SIZ. Gerçek modüller import edilir
 * (kopya/taklit YOK). Herhangi bir FAIL → exit 1. Son satır: `X/X PASS`.
 *
 * Kapsam: source→index + index→source classifier · iki-yönlü orchestrator ·
 * cursor/caps · zero-write (yapısal + çağrı sayacı) · census fixture · exact-record
 * parite · admin route + Inngest statik sözleşme.
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/yh-reconcile-harness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decideSourceToIndex,
  decideIndexToSource,
  isPilotStoneConfig,
} from "../lib/yasam-hafizasi/reconcile/classifyRecord.ts";
import {
  runSourceToIndexPass,
  runIndexToSourcePass,
  combinedPrecedence,
} from "../lib/yasam-hafizasi/reconcile/reconcileSource.ts";
import {
  runReconcileDryRun,
  createReconcilePorts,
  ReconUnsupportedSourceError,
} from "../lib/yasam-hafizasi/reconcile/reconcileEntry.ts";
import { RECON_DEFAULT_CAPS } from "../lib/yasam-hafizasi/reconcile/types.ts";
import { resolveYhSourceConfig } from "../lib/yasam-hafizasi/indexer/adminIndexRequest.ts";
import { runIndexUnit } from "../lib/yasam-hafizasi/indexer/runIndexUnit.ts";
import { indexSourcePage } from "../lib/yasam-hafizasi/indexer/indexSourcePage.ts";
import { YH_DEMO_TENANT_ID } from "../lib/yasam-hafizasi/config.ts";
import { ADMIN_LIBRARY_TENANT_ID } from "../lib/tenancy/syntheticTenants.ts";

// ─── Test altyapısı ──────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const fails = [];
function check(cat, desc, cond) {
  if (cond) pass += 1;
  else {
    fail += 1;
    fails.push(`[${cat}] ${desc}`);
    console.error(`  FAIL  [${cat}] ${desc}`);
  }
}
async function checkThrows(cat, desc, fn, ErrType) {
  let ok = false;
  try {
    await fn();
  } catch (e) {
    ok = ErrType ? e instanceof ErrType : true;
  }
  check(cat, desc, ok);
}

// ─── Sabitler / fixture'lar ───────────────────────────────────────────────────
const STONES = resolveYhSourceConfig("dogaltas:stones");
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
let n = 0;
const uid = () => {
  n += 1;
  const h = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
};

/** Kanıtlı stone satırı (build başarılı). */
function stoneRow(tenant, id, title = "Test Taşı") {
  return { id, tenant_id: tenant, stone_name: title, short_description: "kanit metni" };
}
/** Sıfır-kanıt stone satırı (build-null → skipped). */
function stoneRowNoEvidence(tenant, id) {
  return { id, tenant_id: tenant };
}
/** Bir satırın beklenen content_hash'i (gerçek çekirdekten). */
function hashOf(row) {
  const r = runIndexUnit({ config: STONES, row });
  return r.status === "unit" ? r.unit.contentHash : null;
}
/** Canonical index görünümü. */
function ixRow(tenant, sourceId, contentHash, over = {}) {
  return {
    id: uid(),
    tenantId: tenant,
    sourceTable: "stones",
    sourceId,
    unitType: "record",
    sectionRef: null,
    groupKey: `dogaltas:stones:${sourceId}`,
    contentHash,
    sourceUpdatedAt: null,
    ...over,
  };
}

// ═══ A. classifier: source → index ════════════════════════════════════════════
{
  const sid = uid();
  const row = stoneRow(T1, sid);
  const h = hashOf(row);

  check("A", "healthy: eligible + same-tenant index + eş hash", (() => {
    const r = decideSourceToIndex(STONES, row, ixRow(T1, sid, h));
    return r.classification === "healthy" && r.reason === "hash_match" && r.futureAction === "none";
  })());

  check("A", "missing_index: eligible + index yok → upsert", (() => {
    const r = decideSourceToIndex(STONES, row, null);
    return r.classification === "missing_index" && r.futureAction === "upsert";
  })());

  check("A", "stale_index: farklı hash → upsert", (() => {
    const r = decideSourceToIndex(STONES, row, ixRow(T1, sid, "deadbeef"));
    return r.classification === "stale_index" && r.reason === "hash_mismatch" && r.futureAction === "upsert";
  })());

  check("A", "same hash + newer source_updated_at → healthy (hash OTORİTE)", (() => {
    const r = decideSourceToIndex(STONES, row, ixRow(T1, sid, h, { sourceUpdatedAt: "2999-01-01T00:00:00Z" }));
    return r.classification === "healthy";
  })());

  check("A", "changed hash + eski/boş updated_at → stale (hash OTORİTE)", (() => {
    const r = decideSourceToIndex(STONES, row, ixRow(T1, sid, "deadbeef", { sourceUpdatedAt: "1999-01-01T00:00:00Z" }));
    return r.classification === "stale_index";
  })());

  check("A", "demo + index yok → intentionally_excluded(demo)", (() => {
    const r = decideSourceToIndex(STONES, stoneRow(YH_DEMO_TENANT_ID, uid()), null);
    return r.classification === "intentionally_excluded" && r.reason === "demo" && r.futureAction === "none";
  })());

  check("A", "synthetic + index yok → intentionally_excluded(synthetic)", (() => {
    const r = decideSourceToIndex(STONES, stoneRow(ADMIN_LIBRARY_TENANT_ID, uid()), null);
    return r.classification === "intentionally_excluded" && r.reason === "synthetic";
  })());

  check("A", "shared/null tenant → intentionally_excluded(shared_not_allowed)", (() => {
    const r = decideSourceToIndex(STONES, { id: uid(), tenant_id: null, stone_name: "x", short_description: "y" }, null);
    return r.classification === "intentionally_excluded" && r.reason === "shared_not_allowed";
  })());

  // PII / unclassified / disabled (crafted config; pilot key korunur).
  const piiCfg = { ...STONES, classification: "pii" };
  const unclCfg = { ...STONES, classification: "unclassified" };
  const disCfg = { ...STONES, enabled: false };
  check("A", "pii config → intentionally_excluded(pii)", (() => {
    const r = decideSourceToIndex(piiCfg, stoneRow(T1, uid()), null);
    return r.classification === "intentionally_excluded" && r.reason === "pii";
  })());
  check("A", "unclassified config → intentionally_excluded(unclassified)", (() => {
    const r = decideSourceToIndex(unclCfg, stoneRow(T1, uid()), null);
    return r.classification === "intentionally_excluded" && r.reason === "unclassified";
  })());
  check("A", "disabled config → intentionally_excluded(source_disabled)", (() => {
    const r = decideSourceToIndex(disCfg, stoneRow(T1, uid()), null);
    return r.classification === "intentionally_excluded" && r.reason === "source_disabled";
  })());

  check("A", "skipped_build: sıfır-kanıt + index yok", (() => {
    const r = decideSourceToIndex(STONES, stoneRowNoEvidence(T1, uid()), null);
    return r.classification === "skipped_build" && r.reason === "build_null" && r.futureAction === "none";
  })());

  check("A", "deindex_required: demo + kendi-tenant index var → delete", (() => {
    const s = uid();
    const r = decideSourceToIndex(STONES, stoneRow(YH_DEMO_TENANT_ID, s), ixRow(YH_DEMO_TENANT_ID, s, "x"));
    return r.classification === "deindex_required" && r.reason === "demo" && r.futureAction === "delete";
  })());

  check("A", "deindex_required: skipped(sıfır-kanıt) + kendi-tenant index var → delete", (() => {
    const s = uid();
    const r = decideSourceToIndex(STONES, stoneRowNoEvidence(T1, s), ixRow(T1, s, "x"));
    return r.classification === "deindex_required" && r.reason === "build_null" && r.futureAction === "delete";
  })());

  check("A", "farklı-tenant index → Pass A missing (disjoint; tenant_mismatch Pass B'de)", (() => {
    const s = uid();
    const r = decideSourceToIndex(STONES, stoneRow(T1, s), ixRow(T2, s, "x"));
    return r.classification === "missing_index";
  })());

  check("A", "unsupported_source: pilot dışı config", (() => {
    const minerals = resolveYhSourceConfig("dogaltas:minerals");
    const r = decideSourceToIndex(minerals, { id: uid(), tenant_id: T1, name: "m" }, null);
    return r.classification === "unsupported_source" && r.reason === "not_pilot_source";
  })());

  check("A", "source_read_error: geçersiz tenant", (() => {
    const r = decideSourceToIndex(STONES, { id: uid(), tenant_id: "not-a-uuid", stone_name: "x", short_description: "y" }, null);
    return r.classification === "source_read_error" && r.reason === "tenant_unresolved";
  })());
}

// ═══ B. classifier: index → source ════════════════════════════════════════════
{
  const sid = uid();
  check("B", "orphan_index: kaynak yok → delete", (() => {
    const r = decideIndexToSource(ixRow(T1, sid, "h"), { present: false, tenantId: null }, 1);
    return r && r.classification === "orphan_index" && r.reason === "no_source_row" && r.futureAction === "delete";
  })());
  check("B", "tenant_mismatch: kaynak var farklı tenant", (() => {
    const r = decideIndexToSource(ixRow(T1, sid, "h"), { present: true, tenantId: T2 }, 1);
    return r && r.classification === "tenant_mismatch" && r.reason === "tenant_divergence";
  })());
  check("B", "covered(null): kaynak var aynı tenant → source pass sahiplenir", (() => {
    const r = decideIndexToSource(ixRow(T1, sid, "h"), { present: true, tenantId: T1 }, 1);
    return r === null;
  })());
  check("B", "invariant: unit_type≠record", (() => {
    const r = decideIndexToSource(ixRow(T1, sid, "h", { unitType: "section" }), { present: true, tenantId: T1 }, 1);
    return r && r.classification === "index_invariant_violation" && r.reason === "unit_type_invalid";
  })());
  check("B", "invariant: section_ref dolu", (() => {
    const r = decideIndexToSource(ixRow(T1, sid, "h", { sectionRef: "s1" }), { present: true, tenantId: T1 }, 1);
    return r && r.classification === "index_invariant_violation" && r.reason === "section_ref_present";
  })());
  check("B", "invariant: yanlış source_table", (() => {
    const r = decideIndexToSource(ixRow(T1, sid, "h", { sourceTable: "minerals" }), { present: true, tenantId: T1 }, 1);
    return r && r.classification === "index_invariant_violation" && r.reason === "source_table_invalid";
  })());
  check("B", "duplicate_index: >1 canonical", (() => {
    const r = decideIndexToSource(ixRow(T1, sid, "h"), { present: true, tenantId: T1 }, 2);
    return r && r.classification === "duplicate_index" && r.reason === "duplicate_key";
  })());
}

// ═══ C. orchestrator: cursor / caps ═══════════════════════════════════════════
function makeSourcePort(rows) {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    limitsSeen: [],
    async readSourcePage({ afterId, limit }) {
      this.limitsSeen.push(limit);
      const page = sorted.filter((r) => afterId === null || r.id > afterId).slice(0, limit);
      return { rows: page };
    },
  };
}
function makeIndexLookupPort(map) {
  return {
    async lookupCanonicalIndex(ids) {
      const m = new Map();
      for (const id of ids) if (map.has(id)) m.set(id, map.get(id));
      return m;
    },
  };
}
function makeIndexScanPort(rows) {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    async readIndexPage({ afterId, limit }) {
      return { rows: sorted.filter((r) => afterId === null || r.id > afterId).slice(0, limit) };
    },
  };
}
function makeSourceExistsPort(map) {
  return {
    async lookupSourceTenants(ids) {
      const m = new Map();
      for (const id of ids) if (map.has(id)) m.set(id, map.get(id));
      return m;
    },
  };
}

{
  // 5 eligible real satır; ilk 3'ü indexli (healthy), 2'si missing.
  const rows = [];
  const idxMap = new Map();
  for (let i = 0; i < 5; i += 1) {
    const s = uid();
    const r = stoneRow(T1, s, `Tas ${i}`);
    rows.push(r);
    if (i < 3) idxMap.set(s, ixRow(T1, s, hashOf(r)));
  }
  const caps = { ...RECON_DEFAULT_CAPS, pageSize: 2 };
  const p = await runSourceToIndexPass(STONES, { source: makeSourcePort(rows), indexLookup: makeIndexLookupPort(idxMap) }, caps);
  check("C", "scannedRows tüm satırları kapsar", p.scannedRows === 5);
  check("C", "healthy=3 missing=2", p.byClassification.healthy === 3 && p.byClassification.missing_index === 2);
  check("C", "sayfalama tamamlandı → hasMore false, nextCursor null", p.hasMore === false && p.nextCursor === null);

  // Hard max page size: pageSize 1000 → 500'e clamp.
  const sp = makeSourcePort(rows);
  await runSourceToIndexPass(STONES, { source: sp, indexLookup: makeIndexLookupPort(idxMap) }, { ...RECON_DEFAULT_CAPS, pageSize: 1000 });
  check("C", "pageSize>maxPageSize → 500'e clamp", sp.limitsSeen.every((l) => l === 500));

  // maxPages cap: 5 satır, pageSize 2, maxPages 1 → 2 satır, stoppedByCap.
  const pc = await runSourceToIndexPass(STONES, { source: makeSourcePort(rows), indexLookup: makeIndexLookupPort(idxMap) }, { ...RECON_DEFAULT_CAPS, pageSize: 2, maxPages: 1 });
  check("C", "maxPages cap → stoppedByCap + hasMore", pc.stoppedByCap === true && pc.hasMore === true && pc.scannedRows === 2);
  check("C", "cap durdu → nextCursor dolu (resume)", typeof pc.nextCursor === "string");

  // maxReportedCandidates: sample bounded, sayaç tam.
  const pr = await runSourceToIndexPass(STONES, { source: makeSourcePort(rows), indexLookup: makeIndexLookupPort(idxMap) }, { ...RECON_DEFAULT_CAPS, pageSize: 10, maxReportedCandidates: 2 });
  check("C", "sample maxReportedCandidates ile sınırlı ama sayaç tam", pr.sample.length <= 2 && (pr.byClassification.healthy + pr.byClassification.missing_index) === 5);

  // maxScannedRows abort: 5 satır, maxScannedRows 3, pageSize 2 → durur.
  const pa = await runSourceToIndexPass(STONES, { source: makeSourcePort(rows), indexLookup: makeIndexLookupPort(idxMap) }, { ...RECON_DEFAULT_CAPS, pageSize: 2, maxScannedRows: 3 });
  check("C", "maxScannedRows abort → stoppedByCap", pa.stoppedByCap === true && pa.scannedRows <= 4);

  // Resume correctness: cursor'dan devam kalan 3'ü kapsar.
  const p2 = await runSourceToIndexPass(STONES, { source: makeSourcePort(rows), indexLookup: makeIndexLookupPort(idxMap) }, { ...RECON_DEFAULT_CAPS, pageSize: 2, maxPages: 1 }, pc.nextCursor);
  check("C", "resume: kalan satırlar cursor'dan işlenir", p2.scannedRows >= 1);

  // Idempotency: aynı girdi iki kez → aynı sonuç.
  const run = () => runSourceToIndexPass(STONES, { source: makeSourcePort(rows), indexLookup: makeIndexLookupPort(idxMap) }, { ...RECON_DEFAULT_CAPS, pageSize: 2 });
  const r1 = await run();
  const r2 = await run();
  check("C", "idempotent tekrar taramada aynı byClassification", JSON.stringify(r1.byClassification) === JSON.stringify(r2.byClassification));
}

// ═══ D. index→source pass (orphan + covered) ══════════════════════════════════
{
  const sPresent = uid();
  const sOrphan = uid();
  const idxRows = [ixRow(T1, sPresent, "h"), ixRow(T1, sOrphan, "h")];
  const srcMap = new Map([[sPresent, T1]]); // sOrphan kaynakta yok
  const p = await runIndexToSourcePass({ index: makeIndexScanPort(idxRows), sourceExists: makeSourceExistsPort(srcMap) }, RECON_DEFAULT_CAPS);
  check("D", "index→source: orphan=1", p.byClassification.orphan_index === 1);
  check("D", "index→source: covered=1 (aynı tenant kaynak)", p.covered === 1);
  check("D", "index→source: scannedRows=2", p.scannedRows === 2);
}

// ─── Modül-kapsamlı read-only mock DB + dry-run yardımcıları ─────────────────
function makeMockDb(tables) {
  let writeCalls = 0;
  const runQuery = (st) => {
    let rows = (tables[st.table] ?? []).map((r) => ({ ...r }));
    for (const [op, c, v] of st.filters) {
      if (op === "eq") rows = rows.filter((r) => r[c] === v);
      else if (op === "gt") rows = rows.filter((r) => r[c] !== undefined && r[c] !== null && r[c] > v);
      else if (op === "in") rows = rows.filter((r) => v.includes(r[c]));
    }
    if (st.order) rows.sort((a, b) => {
      const av = a[st.order.c], bv = b[st.order.c];
      const d = av < bv ? -1 : av > bv ? 1 : 0;
      return st.order.asc ? d : -d;
    });
    if (typeof st.limit === "number") rows = rows.slice(0, st.limit);
    return { data: rows, error: null };
  };
  const client = {
    _writeCalls: () => writeCalls,
    from(table) {
      const st = { table, filters: [], order: null, limit: null };
      const b = {
        select(cols) { st.cols = cols; return b; },
        eq(c, v) { st.filters.push(["eq", c, v]); return b; },
        gt(c, v) { st.filters.push(["gt", c, v]); return b; },
        in(c, v) { st.filters.push(["in", c, v]); return b; },
        order(c, o) { st.order = { c, asc: o.ascending }; return b; },
        limit(nn) { st.limit = nn; return b; },
        upsert() { writeCalls += 1; throw new Error("WRITE-ATTEMPTED"); },
        delete() { writeCalls += 1; throw new Error("WRITE-ATTEMPTED"); },
        then(resolve) { resolve(runQuery(st)); },
      };
      return b;
    },
  };
  return client;
}

{
  // Gerçek adapter'lar + entry mock db üzerinde: healthy + orphan senaryosu.
  const s1 = uid(); // eligible + index (healthy)
  const s2 = uid(); // eligible, index yok (missing)
  const sOrphan = uid();
  const row1 = stoneRow(T1, s1);
  const row2 = stoneRow(T1, s2);
  const stones = [row1, row2];
  const index = [
    { id: uid(), tenant_id: T1, source_table: "stones", source_id: s1, unit_type: "record", section_ref: null, group_key: `dogaltas:stones:${s1}`, content_hash: hashOf(row1), source_updated_at: null },
    { id: uid(), tenant_id: T1, source_table: "stones", source_id: sOrphan, unit_type: "record", section_ref: null, group_key: "g", content_hash: "h", source_updated_at: null },
  ];
  const outbox = [{ status: "succeeded", attempts: 1, available_at: "2026-01-01T00:00:00Z", locked_at: null, last_error: null }];
  const db = makeMockDb({ stones, yasam_hafizasi_index: index, yasam_hafizasi_outbox: outbox });
  const ports = createReconcilePorts(db, STONES);

  const result = await runReconcileDryRun({
    config: STONES,
    source: ports.source,
    index: ports.index,
    indexLookup: ports.indexLookup,
    sourceExists: ports.sourceExists,
    outboxHealth: ports.outboxHealth,
    nowMs: Date.parse("2026-07-29T00:00:00Z"),
    leaseSeconds: 300,
  });

  check("E", "dry-run write çağrısı = 0", db._writeCalls() === 0);
  check("E", "healthy=1 missing=1 (source pass)", result.sourceToIndex.byClassification.healthy === 1 && result.sourceToIndex.byClassification.missing_index === 1);
  check("E", "orphan=1 (index pass)", result.indexToSource.byClassification.orphan_index === 1);
  check("E", "recovery health okundu (succeeded=1)", result.recovery && result.recovery.succeeded === 1 && result.recovery.total === 1);
  check("E", "combined disjoint toplam", result.combined.healthy === 1 && result.combined.missing_index === 1 && result.combined.orphan_index === 1);

  // İki kez çalıştır → aynı çıktı + hâlâ zero-write.
  const db2 = makeMockDb({ stones, yasam_hafizasi_index: index, yasam_hafizasi_outbox: outbox });
  const ports2 = createReconcilePorts(db2, STONES);
  const rerun = await runReconcileDryRun({ config: STONES, source: ports2.source, index: ports2.index, indexLookup: ports2.indexLookup, sourceExists: ports2.sourceExists, outboxHealth: ports2.outboxHealth, nowMs: Date.parse("2026-07-29T00:00:00Z"), leaseSeconds: 300 });
  check("E", "idempotent: iki dry-run aynı combined", JSON.stringify(rerun.combined) === JSON.stringify(result.combined));
  check("E", "tekrar çalıştırmada da write=0", db2._writeCalls() === 0);

  // Pilot dışı config → fail-closed.
  await checkThrows("E", "pilot dışı config → ReconUnsupportedSourceError", async () => {
    const minerals = resolveYhSourceConfig("dogaltas:minerals");
    await runReconcileDryRun({ config: minerals, source: ports.source, index: ports.index, indexLookup: ports.indexLookup, sourceExists: ports.sourceExists, nowMs: 0, leaseSeconds: 300 });
  }, ReconUnsupportedSourceError);
}

// ═══ F. CENSUS REGRESSION FIXTURE (1447/291/1156/500) ═════════════════════════
{
  const rows = [];
  const idxMap = new Map();
  // 291 sentetik (kanıtlı) → intentionally_excluded
  for (let i = 0; i < 291; i += 1) rows.push(stoneRow(ADMIN_LIBRARY_TENANT_ID, uid()));
  // 500 gerçek + indexli (healthy)
  for (let i = 0; i < 500; i += 1) {
    const s = uid(); const r = stoneRow(T1, s); rows.push(r); idxMap.set(s, ixRow(T1, s, hashOf(r)));
  }
  // 300 gerçek + kanıtlı + indexsiz (missing)
  for (let i = 0; i < 300; i += 1) rows.push(stoneRow(T1, uid()));
  // 356 gerçek + sıfır-kanıt (skipped_build)
  for (let i = 0; i < 356; i += 1) rows.push(stoneRowNoEvidence(T1, uid()));

  const p = await runSourceToIndexPass(STONES, { source: makeSourcePort(rows), indexLookup: makeIndexLookupPort(idxMap) }, { ...RECON_DEFAULT_CAPS, pageSize: 500 });
  const c = p.byClassification;
  check("F", "toplam source taranan = 1447", p.scannedRows === 1447);
  check("F", "sentetik → intentionally_excluded = 291", c.intentionally_excluded === 291);
  check("F", "healthy = 500", c.healthy === 500);
  check("F", "missing_index = 300", c.missing_index === 300);
  check("F", "skipped_build = 356", c.skipped_build === 356);
  check("F", "KANIT: 1156-500=656 OTOMATİK missing DEĞİL (missing=300 < 656)", (c.missing_index ?? 0) === 300 && (c.missing_index ?? 0) < 656);
  check("F", "sınıf toplamı = 1447 (kayıp yok)", (c.intentionally_excluded + c.healthy + c.missing_index + c.skipped_build) === 1447);
}

// ═══ G. EXACT-RECORD PARİTESİ (indexSourcePage dry-run vs classifier) ═════════
async function exactStatus(row) {
  const db = makeMockDb({ stones: [row] });
  const res = await indexSourcePage({ config: STONES, mode: "dry-run", exactSourceId: row.id, expectedTenantId: row.tenant_id, db });
  return res.exactStatus;
}
{
  // Real + kanıtlı: exact "ok" ⟺ classifier eligible (missing/healthy/stale).
  const rr = stoneRow(T1, uid());
  check("G", "real+kanıtlı: exact=ok ⟺ classifier eligible(missing)", (await exactStatus(rr)) === "ok" && decideSourceToIndex(STONES, rr, null).classification === "missing_index");

  // Demo + kanıtlı: exact excluded-demo ; classifier intentionally_excluded(demo).
  const dd = stoneRow(YH_DEMO_TENANT_ID, uid());
  check("G", "demo+kanıtlı: exact=excluded-demo & classifier excluded(demo)", (await exactStatus(dd)) === "excluded-demo" && decideSourceToIndex(STONES, dd, null).reason === "demo");

  // Synthetic + kanıtlı.
  const ss = stoneRow(ADMIN_LIBRARY_TENANT_ID, uid());
  check("G", "synthetic+kanıtlı: exact=excluded-synthetic & classifier excluded(synthetic)", (await exactStatus(ss)) === "excluded-synthetic" && decideSourceToIndex(STONES, ss, null).reason === "synthetic");

  // Real + sıfır-kanıt: HER İKİSİ skipped (parite tam).
  const zz = stoneRowNoEvidence(T1, uid());
  check("G", "real+sıfır-kanıt: exact=skipped-build & classifier skipped_build (parite)", (await exactStatus(zz)) === "skipped-build" && decideSourceToIndex(STONES, zz, null).classification === "skipped_build");

  // BİLİNÇLİ SAPMA: demo + sıfır-kanıt → exact skipped-build (build-önce) vs classifier
  // intentionally_excluded(demo) (demo-önce). İkisi de "index beklenmez"; farkı belgelenmiştir.
  const dz = stoneRowNoEvidence(YH_DEMO_TENANT_ID, uid());
  check("G", "bilinçli sapma: demo+sıfır-kanıt (exact skipped vs classifier excluded-demo)", (await exactStatus(dz)) === "skipped-build" && decideSourceToIndex(STONES, dz, null).classification === "intentionally_excluded");
}

// ═══ H. STATİK SÖZLEŞME: admin route + Inngest function ═══════════════════════
{
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel) => readFileSync(join(here, "..", rel), "utf8");
  const routeSrc = read("app/api/admin/yasam-hafizasi/reconcile/route.ts");
  const inngestFn = read("lib/inngest/functions/yhReconcile.ts");
  const inngestRoute = read("app/api/inngest/route.ts");

  check("H", "admin route: verifyAdminRequest kullanır", routeSrc.includes("verifyAdminRequest"));
  check("H", "admin route: no-store cache kapalı", routeSrc.includes("no-store"));
  check("H", "admin route: yalnız pilot source_key", routeSrc.includes("RECON_PILOT_SOURCE_KEY"));
  check("H", "admin route: write/enqueue çağrı YOK (kod)", !/createSupabaseIndexWriter|createSupabaseIndexDeindexer|\.upsert\(|\.delete\(|\.rpc\(|yh_outbox_reconcile_enqueue/.test(routeSrc));
  check("H", "inngest fn: default disabled gate", inngestFn.includes("isReconcileEnabled") && inngestFn.includes('status: "disabled"'));
  check("H", "inngest fn: cron off-minute (her dakika değil)", inngestFn.includes('"17 4 * * *"') && !inngestFn.includes('"* * * * *"'));
  check("H", "inngest fn: apply/enqueue/write çağrı YOK (kod)", !/createSupabaseIndexWriter|createSupabaseIndexDeindexer|\.upsert\(|\.delete\(|\.rpc\(|yh_outbox_claim|yh_outbox_reconcile_enqueue/.test(inngestFn));
  check("H", "inngest route: yhReconcileFunction kayıtlı", inngestRoute.includes("yhReconcileFunction"));
  check("H", "reconcile core: write adapter import YOK", (() => {
    const core = read("lib/yasam-hafizasi/reconcile/reconcileSource.ts") + read("lib/yasam-hafizasi/reconcile/reconcileEntry.ts") + read("lib/yasam-hafizasi/reconcile/indexScanAdapter.ts");
    return !/createSupabaseIndexWriter|createSupabaseIndexDeindexer|\.upsert\(|\.delete\(/.test(core);
  })());
  check("H", "isPilotStoneConfig doğru allowlist", isPilotStoneConfig(STONES) === true && isPilotStoneConfig(resolveYhSourceConfig("dogaltas:minerals")) === false);
}

// ═══ I. COMBINED ANOMALY-AWARE INVARIANT (§3: anomaly actionable'ı bastırır) ══
function dbIx(tenant, sourceId, over = {}) {
  return {
    id: uid(), tenant_id: tenant, source_table: "stones", source_id: sourceId,
    unit_type: "record", section_ref: null, group_key: `dogaltas:stones:${sourceId}`,
    content_hash: "h", source_updated_at: null, ...over,
  };
}
async function runDry(stones, index) {
  const db = makeMockDb({ stones, yasam_hafizasi_index: index, yasam_hafizasi_outbox: [] });
  const ports = createReconcilePorts(db, STONES);
  const res = await runReconcileDryRun({
    config: STONES, source: ports.source, index: ports.index, indexLookup: ports.indexLookup,
    sourceExists: ports.sourceExists, outboxHealth: ports.outboxHealth,
    nowMs: Date.parse("2026-07-29T00:00:00Z"), leaseSeconds: 300,
  });
  return { res, writes: db._writeCalls() };
}
const noActionable = (c) => !c.missing_index && !c.stale_index && !c.orphan_index && !c.deindex_required;
const sampleHasAction = (res) => res.combinedSample.some((x) => x.futureAction === "upsert" || x.futureAction === "delete");

{
  // Senaryo 1: source tenant A + yalnız index tenant B → tenant_mismatch, actionable YOK.
  {
    const s = uid();
    const { res, writes } = await runDry([stoneRow(T1, s)], [dbIx(T2, s)]);
    check("I", "S1 tenant_mismatch=1 & actionable YOK & write=0", res.combined.tenant_mismatch === 1 && noActionable(res.combined) && !sampleHasAction(res) && writes === 0);
  }
  // Senaryo 2: source A + doğru index A + yanlış-tenant index B (aynı source_id) → duplicate.
  {
    const s = uid(); const r = stoneRow(T1, s);
    const { res } = await runDry([r], [dbIx(T1, s, { content_hash: hashOf(r) }), dbIx(T2, s)]);
    check("I", "S2 duplicate_index=1 & actionable/healthy YOK", res.combined.duplicate_index === 1 && noActionable(res.combined) && !res.combined.healthy && !sampleHasAction(res));
  }
  // Senaryo 3: source mevcut + yalnız yanlış section_ref/unit_type index → invariant.
  {
    const s = uid();
    const { res } = await runDry([stoneRow(T1, s)], [dbIx(T1, s, { section_ref: "sr1" })]);
    check("I", "S3a invariant(section_ref)=1 & missing YOK", res.combined.index_invariant_violation === 1 && noActionable(res.combined) && !sampleHasAction(res));
    const s2 = uid();
    const r2 = await runDry([stoneRow(T1, s2)], [dbIx(T1, s2, { unit_type: "section" })]);
    check("I", "S3b invariant(unit_type)=1 & missing YOK", r2.res.combined.index_invariant_violation === 1 && noActionable(r2.res.combined));
  }
  // Senaryo 4: duplicate/çelişkili şekil → duplicate_index, upsert/delete YOK (orphan bastırılır).
  {
    const s = uid();
    const { res } = await runDry([], [dbIx(T1, s), dbIx(T1, s)]); // kaynak yok + 2 canonical
    check("I", "S4 duplicate_index=1 & orphan bastırıldı", res.combined.duplicate_index === 1 && !res.combined.orphan_index && !sampleHasAction(res));
  }
  // Senaryo 5: eligible + index yok + anomaly yok → yalnız missing_index/upsert.
  {
    const s = uid();
    const { res } = await runDry([stoneRow(T1, s)], []);
    check("I", "S5 yalnız missing_index & futureAction upsert", res.combined.missing_index === 1 && !res.combined.tenant_mismatch && res.combinedSample.some((x) => x.classification === "missing_index" && x.futureAction === "upsert"));
  }
  // Senaryo 6: kaynak yok + geçerli aynı-tenant index → yalnız orphan_index/delete.
  {
    const s = uid();
    const { res } = await runDry([], [dbIx(T1, s)]);
    check("I", "S6 yalnız orphan_index & futureAction delete", res.combined.orphan_index === 1 && !res.combined.duplicate_index && res.combinedSample.some((x) => x.classification === "orphan_index" && x.futureAction === "delete"));
  }
  // Senaryo 7: excluded/skipped source + geçerli kendi-tenant index → deindex_required/delete.
  {
    const s = uid();
    const { res } = await runDry([stoneRow(YH_DEMO_TENANT_ID, s)], [dbIx(YH_DEMO_TENANT_ID, s)]);
    check("I", "S7 deindex_required=1 & anomaly YOK & futureAction delete", res.combined.deindex_required === 1 && !res.combined.tenant_mismatch && !res.combined.duplicate_index && res.combinedSample.some((x) => x.classification === "deindex_required" && x.futureAction === "delete"));
  }
  // Senaryo 8: aynı birleşik sonuç iki kez → deterministik/idempotent.
  {
    const s = uid();
    const a = await runDry([stoneRow(T1, s)], [dbIx(T2, s)]);
    const b = await runDry([stoneRow(T1, s)], [dbIx(T2, s)]);
    check("I", "S8 combined idempotent (deterministik)", JSON.stringify(a.res.combined) === JSON.stringify(b.res.combined) && a.writes === 0 && b.writes === 0);
  }
  // Precedence birim testi: duplicate>invariant>tenant_mismatch>normal.
  check("I", "precedence sırası doğru", combinedPrecedence("duplicate_index") < combinedPrecedence("index_invariant_violation") && combinedPrecedence("index_invariant_violation") < combinedPrecedence("tenant_mismatch") && combinedPrecedence("tenant_mismatch") < combinedPrecedence("missing_index"));
}

// ─── Sonuç ────────────────────────────────────────────────────────────────────
console.log("");
if (fail > 0) {
  console.error(`yh-reconcile-harness: ${pass}/${pass + fail} PASS — ${fail} FAIL`);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`yh-reconcile-harness: ${pass}/${pass} PASS`);
