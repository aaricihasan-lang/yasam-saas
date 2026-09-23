// ============================================================
// Aromaterapi FAZ 2 — Rapor TOPLU (batch) okuyucu testleri (DB-free).
//   npx tsx --tsconfig scripts/tsconfig.aromaterapi-tests.json \
//     scripts/aromaterapi-report-batch.test.ts
//
// Task 1 (ARO-010 N+1 batch): batch↔single PARİTE, .from() sorgu-sayısı azaltımı,
//   tenant izolasyonu, girdi-sırası korunumu.
// Task 4 (ARO-002): report-read katmanı (resourceReads) çapraz-tenant satır sızdırmaz;
//   her alt-sorgu tenant-filtrelidir.
//
// Mock Supabase (scripts/_shims/aromaMockSupabase.ts) gerçek okuyucu zincirini taklit
// eder. Gerçek servis fonksiyonları (getX / getXByIds) DEĞİŞTİRİLMEDEN çağrılır.
// Assertion'lar zayıflatılmaz. FAIL → process.exit(1).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeMockDb, type MockDb } from "./_shims/aromaMockSupabase";
import * as F from "./_shims/aromaFixtures";
import {
  getKnowledgeRecord,
  getKnowledgeRecordsByIds,
} from "@/lib/aromaterapi/service/claimReads";
import {
  getSource,
  getSourcesByIds,
  getPassage,
  getPassagesBySourceIds,
} from "@/lib/aromaterapi/service/sourceReads";
import {
  getMethodSeries,
  getMethodSeriesByIds,
  getMethodRevision,
  getMethodRevisionsByIds,
} from "@/lib/aromaterapi/service/methodReads";
import {
  getPlantTaxon,
  getPlantTaxaByIds,
  getPreparation,
  getPreparationsByIds,
} from "@/lib/aromaterapi/service/catalogReads";
import {
  fetchKnowledgeDetails,
  fetchSourceExports,
  fetchMethodExports,
  fetchTaxaDetails,
  fetchPreparationDetails,
} from "@/lib/aromaterapi/report/resourceReads";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(n: string, c: boolean, d?: string) {
  if (c) {
    pass++;
    console.log(`  PASS  ${n}`);
  } else {
    fail++;
    failures.push(n);
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`);
  }
}

// Sıra-bağımsız derin eşitlik (JSON anahtar-sırası farklarına dayanıklı).
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
  }
  return false;
}

const db = makeMockDb(F.buildTables()) as MockDb;
const sdb = db as unknown as SupabaseClient;

function tenantFilterOk(expected: string): { all: boolean; crossLeak: boolean; total: number } {
  let all = true;
  let crossLeak = false;
  for (const q of db.__queries) {
    if (!q.tenantFilter) all = false;
    if (q.tenantValue !== expected) crossLeak = true;
  }
  return { all, crossLeak, total: db.__queries.length };
}

async function main() {
  console.log("Aromaterapi FAZ 2 — Rapor TOPLU okuyucu testleri\n");

  // ==========================================================
  console.log("[1a] PARİTE — batch getXByIds ≡ [getX(id1), getX(id2)]");
  // ==========================================================

  // claims
  const claimBatch = await getKnowledgeRecordsByIds(sdb, F.T1, [F.c1, F.c2]);
  const claimSingle = [
    await getKnowledgeRecord(sdb, F.T1, F.c1),
    await getKnowledgeRecord(sdb, F.T1, F.c2),
  ];
  check("claims: batch ≡ single (assembled detail + children + relations)", deepEqual(claimBatch, claimSingle));
  check(
    "claims: rich record c1 has routes(2)+pop(1)+sources(1)+passages(1)+relations(1)",
    claimBatch[0].routes.length === 2 &&
      claimBatch[0].populations.length === 1 &&
      claimBatch[0].sources.length === 1 &&
      claimBatch[0].passages.length === 1 &&
      claimBatch[0].relations.length === 1,
    JSON.stringify({
      r: claimBatch[0].routes.length,
      p: claimBatch[0].populations.length,
      s: claimBatch[0].sources.length,
      pa: claimBatch[0].passages.length,
      rel: claimBatch[0].relations.length,
    }),
  );
  check(
    "claims: child ordering preserved (routes oral<topical, source_title joined)",
    claimBatch[0].routes[0].route_code === "oral" &&
      claimBatch[0].routes[1].route_code === "topical" &&
      claimBatch[0].sources[0].source_title === "Kaynak A",
  );

  // sources
  const srcBatch = await getSourcesByIds(sdb, F.T1, [F.srcA, F.srcB]);
  const srcSingle = [await getSource(sdb, F.T1, F.srcA), await getSource(sdb, F.T1, F.srcB)];
  check("sources: batch ≡ single (detail + passage_count + knowledge_record_count)", deepEqual(srcBatch, srcSingle));
  check(
    "sources: counts assembled (srcA passages=2, knowledge_records=1)",
    srcBatch[0].passage_count === 2 && srcBatch[0].knowledge_record_count === 1,
    JSON.stringify({ pc: srcBatch[0].passage_count, kr: srcBatch[0].knowledge_record_count }),
  );

  // passages (batch is getPassagesBySourceIds → Map; compare per-passage to getPassage)
  const passMap = await getPassagesBySourceIds(sdb, F.T1, [F.srcA, F.srcB]);
  const passA = passMap.get(F.srcA) ?? [];
  const passASingle = [
    await getPassage(sdb, F.T1, F.passA1),
    await getPassage(sdb, F.T1, F.passA2),
  ];
  check("passages: batch(srcA) ≡ [getPassage(passA1), getPassage(passA2)] (sort_key order)", deepEqual(passA, passASingle));
  check(
    "passages: passA1 layers (translations=3, explanations=1, interpretations=1)",
    passA[0].translations.length === 3 &&
      passA[0].editorial_explanations.length === 1 &&
      passA[0].editorial_interpretations.length === 1,
    JSON.stringify({
      t: passA[0].translations.length,
      ee: passA[0].editorial_explanations.length,
      ei: passA[0].editorial_interpretations.length,
    }),
  );
  check(
    "passages: latest editorial note wins (explanation rev2 text)",
    passA[0].editorial_explanations[0].note_text === "Açıklama rev2" &&
      passA[0].editorial_explanations[0].revision === 2,
  );

  // method series
  const msBatch = await getMethodSeriesByIds(sdb, F.T1, [F.ms1, F.ms2]);
  const msSingle = [
    await getMethodSeries(sdb, F.T1, F.ms1),
    await getMethodSeries(sdb, F.T1, F.ms2),
  ];
  check("methods: series batch ≡ single (summary + revisions history)", deepEqual(msBatch, msSingle));
  check(
    "methods: ms1 latest=2, verified=2, revision_count=2, source_title joined",
    msBatch[0].latest_revision === 2 &&
      msBatch[0].verified_revision === 2 &&
      msBatch[0].revision_count === 2 &&
      msBatch[0].source_title === "Kaynak A",
  );

  // method revisions
  const revMap = await getMethodRevisionsByIds(sdb, F.T1, [F.rev1b, F.rev2a]);
  const rev1bSingle = await getMethodRevision(sdb, F.T1, F.ms1, F.rev1b);
  const rev2aSingle = await getMethodRevision(sdb, F.T1, F.ms2, F.rev2a);
  check("methods: revision batch ≡ single (rev1b)", deepEqual(revMap.get(F.rev1b), rev1bSingle));
  check("methods: revision batch ≡ single (rev2a)", deepEqual(revMap.get(F.rev2a), rev2aSingle));
  check(
    "methods: revision steps normalized+sorted (order 1 then 2)",
    (revMap.get(F.rev1b)?.steps ?? [])[0]?.order === 1 && (revMap.get(F.rev1b)?.steps ?? [])[1]?.order === 2,
  );

  // plant taxa (single returns {taxon,preparations}; report uses .taxon only)
  const taxaBatch = await getPlantTaxaByIds(sdb, F.T1, [F.taxaA, F.taxaB]);
  const taxaSingle = [
    (await getPlantTaxon(sdb, F.T1, F.taxaA))?.taxon,
    (await getPlantTaxon(sdb, F.T1, F.taxaB))?.taxon,
  ];
  check("plant_taxa: getPlantTaxaByIds ≡ [getPlantTaxon().taxon ...]", deepEqual(taxaBatch, taxaSingle));

  // preparations
  const prepBatch = await getPreparationsByIds(sdb, F.T1, [F.prepA, F.prepB]);
  const prepSingle = [await getPreparation(sdb, F.T1, F.prepA), await getPreparation(sdb, F.T1, F.prepB)];
  check("preparations: batch ≡ single (prep + taxon + knowledge_record_count)", deepEqual(prepBatch, prepSingle));
  check(
    "preparations: prepA knowledge_record_count=3 (c1,c3,c4), taxon joined",
    prepBatch[0].knowledge_record_count === 3 && prepBatch[0].taxon_canonical_name === "Lavandula angustifolia",
    JSON.stringify({ kr: prepBatch[0].knowledge_record_count }),
  );

  // ==========================================================
  console.log("\n[1b] SORGU-SAYISI — batch .from() << single, N ile ~sabit");
  // ==========================================================
  db.__reset();
  for (const cid of [F.c1, F.c2, F.c3, F.c4, F.c5]) await getKnowledgeRecord(sdb, F.T1, cid);
  const singleN5 = db.__fromCount;

  db.__reset();
  await getKnowledgeRecordsByIds(sdb, F.T1, [F.c1, F.c2, F.c3, F.c4, F.c5]);
  const batchN5 = db.__fromCount;

  db.__reset();
  await getKnowledgeRecordsByIds(sdb, F.T1, [F.c1]);
  const batchN1 = db.__fromCount;

  console.log(`      claims .from() → single(N=5)=${singleN5}, batch(N=5)=${batchN5}, batch(N=1)=${batchN1}`);
  check("query-count: batch(N=5) < single(N=5)", batchN5 < singleN5, `${batchN5} vs ${singleN5}`);
  check("query-count: batch stays ~constant (N=1 == N=5, single-chunk)", batchN1 === batchN5, `${batchN1} vs ${batchN5}`);
  check("query-count: single grows with N (≈10×N)", singleN5 >= batchN5 * 3, `single=${singleN5}`);

  // preparations reduction
  db.__reset();
  await getPreparation(sdb, F.T1, F.prepA);
  await getPreparation(sdb, F.T1, F.prepB);
  const prepSingleFrom = db.__fromCount;
  db.__reset();
  await getPreparationsByIds(sdb, F.T1, [F.prepA, F.prepB]);
  const prepBatchFrom = db.__fromCount;
  check("query-count: preparations batch < single", prepBatchFrom < prepSingleFrom, `${prepBatchFrom} vs ${prepSingleFrom}`);

  // ==========================================================
  console.log("\n[1c] TENANT İZOLASYONU — T1 çağrısı T2 verisi döndürmez; her sorgu tenant-filtreli");
  // ==========================================================
  db.__reset();
  const xClaims = await getKnowledgeRecordsByIds(sdb, F.T1, [F.cX]);
  const xSrc = await getSourcesByIds(sdb, F.T1, [F.srcX]);
  const xTaxa = await getPlantTaxaByIds(sdb, F.T1, [F.taxaX]);
  const xPrep = await getPreparationsByIds(sdb, F.T1, [F.prepX]);
  const xMs = await getMethodSeriesByIds(sdb, F.T1, [F.msX]);
  const xRev = await getMethodRevisionsByIds(sdb, F.T1, [F.revX]);
  const xPass = await getPassagesBySourceIds(sdb, F.T1, [F.srcX]);
  check("isolation: getKnowledgeRecordsByIds(T1,[T2 id]) = []", xClaims.length === 0);
  check("isolation: getSourcesByIds(T1,[T2 id]) = []", xSrc.length === 0);
  check("isolation: getPlantTaxaByIds(T1,[T2 id]) = []", xTaxa.length === 0);
  check("isolation: getPreparationsByIds(T1,[T2 id]) = []", xPrep.length === 0);
  check("isolation: getMethodSeriesByIds(T1,[T2 id]) = []", xMs.length === 0);
  check("isolation: getMethodRevisionsByIds(T1,[T2 id]) empty map", xRev.size === 0);
  check("isolation: getPassagesBySourceIds(T1,[T2 id]) empty map", xPass.size === 0);
  const iso = tenantFilterOk(F.T1);
  check(`isolation: every executed query tenant-filtered (${iso.total} queries)`, iso.all, "some query missing tenant_id filter");
  check("isolation: no query carried a non-T1 tenant value", !iso.crossLeak);

  // cross-tenant even when a valid T1 id is mixed with T2 id → only T1 returned
  db.__reset();
  const mixed = await getKnowledgeRecordsByIds(sdb, F.T1, [F.cX, F.c1]);
  check("isolation: mixed [T2,T1] ids → only T1 record returned", mixed.length === 1 && mixed[0].id === F.c1);

  // ==========================================================
  console.log("\n[1d] SIRA KORUNUMU — çıktı girdi id sırasında; eksik id atlanır");
  // ==========================================================
  const ordered = await getKnowledgeRecordsByIds(sdb, F.T1, [F.c2, F.c1, "00000000-0000-4000-8000-0000deadbeef"]);
  check(
    "order: input [c2,c1,missing] → output [c2,c1] (missing skipped)",
    ordered.length === 2 && ordered[0].id === F.c2 && ordered[1].id === F.c1,
  );
  const orderedSrc = await getSourcesByIds(sdb, F.T1, [F.srcB, F.srcA]);
  check("order: sources [srcB,srcA] preserved", orderedSrc.length === 2 && orderedSrc[0].id === F.srcB && orderedSrc[1].id === F.srcA);
  const orderedTaxa = await getPlantTaxaByIds(sdb, F.T1, [F.taxaB, F.taxaA]);
  check("order: taxa [taxaB,taxaA] preserved", orderedTaxa.length === 2 && orderedTaxa[0].id === F.taxaB && orderedTaxa[1].id === F.taxaA);

  // ==========================================================
  console.log("\n[Task 4 / ARO-002] Report-read katmanı — çapraz-tenant sızıntı yok, tüm sorgular tenant-filtreli");
  // ==========================================================

  // selected: T1 tenant, T2 ids → boş, sızıntı yok
  db.__reset();
  const kSel = await fetchKnowledgeDetails(sdb, F.T1, { mode: "selected", ids: [F.cX] });
  check("report: fetchKnowledgeDetails(T1, selected T2 id) → no rows, no error", kSel.items.length === 0 && kSel.error === null);
  const sSel = await fetchSourceExports(sdb, F.T1, { mode: "selected", ids: [F.srcX] });
  check("report: fetchSourceExports(T1, selected T2 id) → no rows", sSel.items.length === 0 && sSel.sources.length === 0);
  const mSel = await fetchMethodExports(sdb, F.T1, { mode: "selected", ids: [F.msX] });
  check("report: fetchMethodExports(T1, selected T2 id) → no rows", mSel.items.length === 0 && mSel.error === null);
  const tSel = await fetchTaxaDetails(sdb, F.T1, { mode: "selected", ids: [F.taxaX] });
  check("report: fetchTaxaDetails(T1, selected T2 id) → no rows", tSel.items.length === 0);
  const pSel = await fetchPreparationDetails(sdb, F.T1, { mode: "selected", ids: [F.prepX] });
  check("report: fetchPreparationDetails(T1, selected T2 id) → no rows", pSel.items.length === 0);
  const selIso = tenantFilterOk(F.T1);
  check(`report(selected): every query tenant-filtered (${selIso.total})`, selIso.all);
  check("report(selected): no non-T1 tenant value in any query", !selIso.crossLeak);

  // mode all: yalnız T1 satırları; cX asla
  db.__reset();
  const kAll = await fetchKnowledgeDetails(sdb, F.T1, { mode: "all" });
  check("report: fetchKnowledgeDetails(T1, all) → 5 T1 records", kAll.items.length === 5, `count=${kAll.items.length}`);
  check("report: fetchKnowledgeDetails(T1, all) excludes T2 claim cX", !kAll.items.some((r) => r.id === F.cX));
  const sAll = await fetchSourceExports(sdb, F.T1, { mode: "all" });
  check("report: fetchSourceExports(T1, all) → 2 T1 sources, no T2", sAll.sources.length === 2 && !sAll.sources.some((s) => s.id === F.srcX));
  const mAll = await fetchMethodExports(sdb, F.T1, { mode: "all" });
  check("report: fetchMethodExports(T1, all) → 2 T1 series, no T2", mAll.items.length === 2 && !mAll.items.some((i) => i.series.id === F.msX));
  const allIso = tenantFilterOk(F.T1);
  check(`report(all): every query tenant-filtered (${allIso.total})`, allIso.all);
  check("report(all): no non-T1 tenant value in any query", !allIso.crossLeak);

  // ==========================================================
  console.log(`\n──────────── ARO REPORT BATCH TEST: ${pass} PASS / ${fail} FAIL ────────────`);
  if (fail > 0) {
    console.log("FAILURES:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  console.log("OVERALL = PASS");
}

main().catch((e) => {
  console.error("UNCAUGHT", e);
  process.exit(1);
});
