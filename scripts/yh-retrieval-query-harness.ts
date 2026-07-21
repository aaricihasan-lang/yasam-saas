// Yaşam Hafızası™ — S2.18 Retrieval Query Descriptor izole harness (saf; DB/ağ/env YOK).
//
// buildRetrievalQuery(plan, visibility) → RetrievalQueryDescriptor PUBLIC sözleşmesini GERÇEK
// import ile doğrular. Girdi: S2.17 TsQueryPlan + S2.13 VisibilityContext. DB/Supabase/RPC YOK.
// Çalıştırma:  npx tsx scripts/yh-retrieval-query-harness.ts

import {
  buildRetrievalQuery,
  type RetrievalQueryDescriptor,
} from "../lib/yasam-hafizasi/search/retrievalQuery";
import { buildTsQueryPlan, type TsQueryPlan } from "../lib/yasam-hafizasi/search/tsQueryPlan";
import type { Concept, ConceptOrigin } from "../lib/yasam-hafizasi/search/types";
import type { VisibilityContext } from "../lib/yasam-hafizasi/search/visibilityScope";
import { YH_CANDIDATE_LIMIT, YH_TSV_WEIGHTS } from "../lib/yasam-hafizasi/config";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

const C = (term: string, origin: ConceptOrigin = "query"): Concept => ({ term, origin });
const VIS = (sessionTenantId: string, allowShared: boolean): VisibilityContext => ({
  sessionTenantId,
  allowShared,
});

/** İç içe TÜM anahtarları toplar (yasaklı-alan taraması için). */
function collectKeys(value: unknown, acc: string[]): void {
  if (value === null || typeof value !== "object") return;
  for (const k of Object.keys(value as Record<string, unknown>)) {
    acc.push(k.toLowerCase());
    collectKeys((value as Record<string, unknown>)[k], acc);
  }
}

const validVis = VIS("tenant-A", true);

// ─── 1. Boş plan → noop/empty-tsquery ────────────────────────────────────────
{
  const d = buildRetrievalQuery(buildTsQueryPlan([]), validVis);
  check("1 boş plan → noop", d.kind === "noop");
  check("1b reason empty-tsquery", d.kind === "noop" && d.reason === "empty-tsquery");
}

// ─── 2. Whitespace / geçersiz tsquery → fail-closed empty-tsquery ─────────────
{
  const wsPlan = {
    config: "simple",
    column: "search_tsv",
    clauses: [],
    tsquery: "   ",
    isEmpty: false,
  } as unknown as TsQueryPlan;
  const d = buildRetrievalQuery(wsPlan, validVis);
  check("2 whitespace tsquery → noop/empty-tsquery", d.kind === "noop" && d.reason === "empty-tsquery");

  const nullPlan = buildRetrievalQuery(null as unknown as TsQueryPlan, validVis);
  check("2b null plan → noop/empty-tsquery", nullPlan.kind === "noop" && nullPlan.reason === "empty-tsquery");

  const nonStr = { tsquery: 123, isEmpty: false } as unknown as TsQueryPlan;
  const dNon = buildRetrievalQuery(nonStr, validVis);
  check("2c non-string tsquery → noop/empty-tsquery", dNon.kind === "noop" && dNon.reason === "empty-tsquery");

  const isEmptyTrue = { tsquery: "isik:*", isEmpty: true } as unknown as TsQueryPlan;
  const dEmpty = buildRetrievalQuery(isEmptyTrue, validVis);
  check("2d isEmpty=true → noop/empty-tsquery", dEmpty.kind === "noop" && dEmpty.reason === "empty-tsquery");
}

// ─── 3. Geçersiz visibility → noop/invalid-visibility-context ─────────────────
{
  const good = buildTsQueryPlan([C("isik")]);
  const emptyTenant = buildRetrievalQuery(good, VIS("", true));
  check("3 boş tenant → noop/invalid-visibility-context", emptyTenant.kind === "noop" && emptyTenant.reason === "invalid-visibility-context");

  const wsTenant = buildRetrievalQuery(good, VIS("   ", false));
  check("3b whitespace tenant → invalid-visibility-context", wsTenant.kind === "noop" && wsTenant.reason === "invalid-visibility-context");

  const nonStrTenant = buildRetrievalQuery(good, { sessionTenantId: 5, allowShared: true } as unknown as VisibilityContext);
  check("3c non-string tenant → invalid-visibility-context", nonStrTenant.kind === "noop" && nonStrTenant.reason === "invalid-visibility-context");

  const nullVis = buildRetrievalQuery(good, null as unknown as VisibilityContext);
  check("3d null visibility → invalid-visibility-context", nullVis.kind === "noop" && nullVis.reason === "invalid-visibility-context");

  const badShared = buildRetrievalQuery(good, { sessionTenantId: "t1", allowShared: "yes" } as unknown as VisibilityContext);
  check("3e allowShared non-boolean → invalid-visibility-context", badShared.kind === "noop" && badShared.reason === "invalid-visibility-context");
}

// ─── 4. Geçerli tek kelime planı → query ─────────────────────────────────────
{
  const d = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), validVis);
  check("4 tek kelime → query", d.kind === "query");
}

// ─── 5. Geçerli phrase planı → query ─────────────────────────────────────────
{
  const d = buildRetrievalQuery(buildTsQueryPlan([C("anne sutu")]), validVis);
  check("5 phrase → query", d.kind === "query");
}

// ─── 6–13. Query descriptor içerik doğrulukları ──────────────────────────────
{
  const plan = buildTsQueryPlan([C("isik"), C("anne sutu")]);
  const d = buildRetrievalQuery(plan, VIS("tenant-A", true));
  if (d.kind !== "query") {
    check("6 query üretildi", false);
  } else {
    check("6 tsquery birebir korunuyor", d.tsquery === plan.tsquery);
    check("7 config = simple", d.config === "simple");
    check("8 column = search_tsv", d.column === "search_tsv");
    check("9 ranking requiresWeightedTsRank", d.ranking.requiresWeightedTsRank === true);
    check("9b ranking weightsSource", d.ranking.weightsSource === "YH_TSV_WEIGHTS");
    check("12 direction = desc", d.ranking.direction === "desc");
    check("10 weights.A config ile birebir", d.ranking.weights.A === YH_TSV_WEIGHTS.A);
    check("10b weights.B config ile birebir", d.ranking.weights.B === YH_TSV_WEIGHTS.B);
    check("10c weights.C config ile birebir", d.ranking.weights.C === YH_TSV_WEIGHTS.C);
    check("10d weights.D config ile birebir", d.ranking.weights.D === YH_TSV_WEIGHTS.D);
    check("11 limit.value = YH_CANDIDATE_LIMIT", d.limit.value === YH_CANDIDATE_LIMIT);
    check("11b limit.source = YH_CANDIDATE_LIMIT", d.limit.source === "YH_CANDIDATE_LIMIT");
    check("13 visibility.sessionTenantId taşındı", d.visibility.sessionTenantId === "tenant-A");
    check("13b visibility.allowShared=true taşındı", d.visibility.allowShared === true);
  }

  // allowShared=false ayrı taşınıyor mu
  const dFalse = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), VIS("tenant-B", false));
  check("13c allowShared=false taşındı", dFalse.kind === "query" && dFalse.visibility.allowShared === false);
  check("13d sessionTenantId trim kanonik (' t ' → 't')", (() => {
    const dd = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), VIS("  tenant-C  ", true));
    return dd.kind === "query" && dd.visibility.sessionTenantId === "tenant-C";
  })());
}

// ─── 14. Input plan mutasyona uğramıyor ──────────────────────────────────────
{
  const mutablePlan = {
    config: "simple",
    column: "search_tsv",
    clauses: [],
    tsquery: "isik:*",
    isEmpty: false,
  } as unknown as TsQueryPlan;
  const before = JSON.stringify(mutablePlan);
  buildRetrievalQuery(mutablePlan, validVis);
  check("14 input plan mutasyonsuz", JSON.stringify(mutablePlan) === before);
}

// ─── 15. Visibility input mutasyona uğramıyor + referans sızmıyor ────────────
{
  const mutableVis: VisibilityContext = { sessionTenantId: "tenant-A", allowShared: true };
  const before = JSON.stringify(mutableVis);
  const d = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), mutableVis);
  check("15 visibility input mutasyonsuz", JSON.stringify(mutableVis) === before);
  check("15b taşınan visibility taze kopya (ref sızmaz)", d.kind === "query" && d.visibility !== mutableVis);
}

// ─── 16. Config referansı mutasyona açık biçimde sızmıyor ────────────────────
{
  const d = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), validVis);
  if (d.kind === "query") {
    check("16 weights !== YH_TSV_WEIGHTS referansı", (d.ranking.weights as unknown) !== (YH_TSV_WEIGHTS as unknown));
    check("16b weights frozen", Object.isFrozen(d.ranking.weights));
  } else {
    check("16 query üretildi", false);
  }
  // config sabiti değişmedi
  check("16c YH_TSV_WEIGHTS.A hâlâ 1.0", YH_TSV_WEIGHTS.A === 1.0);
}

// ─── 17. Determinizm: aynı girdi → eşit çıktı ────────────────────────────────
{
  const plan = buildTsQueryPlan([C("isik"), C("anne sutu")]);
  const a = buildRetrievalQuery(plan, VIS("tenant-A", true));
  const b = buildRetrievalQuery(plan, VIS("tenant-A", true));
  check("17 deterministik eşit çıktı", JSON.stringify(a) === JSON.stringify(b));
  const n1 = buildRetrievalQuery(buildTsQueryPlan([]), validVis);
  const n2 = buildRetrievalQuery(buildTsQueryPlan([]), validVis);
  check("17b noop deterministik", JSON.stringify(n1) === JSON.stringify(n2));
}

// ─── 18. noop descriptor yürütülebilir query alanı TAŞIMIYOR ─────────────────
{
  const d: RetrievalQueryDescriptor = buildRetrievalQuery(buildTsQueryPlan([]), validVis);
  check("18 noop anahtarları = kind,reason", Object.keys(d).sort().join(",") === "kind,reason");
  const asRec = d as unknown as Record<string, unknown>;
  check("18b noop tsquery/config/column YOK", !("tsquery" in asRec) && !("config" in asRec) && !("column" in asRec));
  check("18c noop ranking/limit/visibility YOK", !("ranking" in asRec) && !("limit" in asRec) && !("visibility" in asRec));
}

// ─── 19. Query descriptor SQL/WHERE/RPC/Supabase alanı TAŞIMIYOR ─────────────
{
  const d = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), validVis);
  const keys: string[] = [];
  collectKeys(d, keys);
  const forbidden = ["sql", "where", "rpc", "supabase", "select", "from", "rawquery"];
  const hit = keys.find((k) => forbidden.some((f) => k.includes(f)));
  check("19 yasaklı alan yok (sql/where/rpc/supabase/select/from)", hit === undefined);
}

// ─── 20. Descriptor yalnız beklenen allowlist anahtarlarını içeriyor ─────────
{
  const q = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), validVis);
  check(
    "20 query yüzey anahtarları = kind,column,config,limit,ranking,tsquery,visibility",
    Object.keys(q).sort().join(",") === "column,config,kind,limit,ranking,tsquery,visibility",
  );
  if (q.kind === "query") {
    check("20b ranking anahtarları", Object.keys(q.ranking).sort().join(",") === "direction,requiresWeightedTsRank,weights,weightsSource");
    check("20c weights anahtarları", Object.keys(q.ranking.weights).sort().join(",") === "A,B,C,D");
    check("20d limit anahtarları", Object.keys(q.limit).sort().join(",") === "source,value");
    check("20e visibility anahtarları", Object.keys(q.visibility).sort().join(",") === "allowShared,sessionTenantId");
  }
}

// ─── 21. Immutability: her katman frozen ─────────────────────────────────────
{
  const d = buildRetrievalQuery(buildTsQueryPlan([C("isik")]), validVis);
  check("21 descriptor frozen", Object.isFrozen(d));
  if (d.kind === "query") {
    check("21b ranking frozen", Object.isFrozen(d.ranking));
    check("21c limit frozen", Object.isFrozen(d.limit));
    check("21d visibility frozen", Object.isFrozen(d.visibility));
    check("21e weights frozen", Object.isFrozen(d.ranking.weights));
  }
  const n = buildRetrievalQuery(buildTsQueryPlan([]), validVis);
  check("21f noop frozen", Object.isFrozen(n));
}

// ─── Özet ────────────────────────────────────────────────────────────────────
console.log("");
console.log("S2.18 buildRetrievalQuery harness — saf; DB/Supabase/RPC/SQL YOK.");
console.log("");
console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
console.log("- fail-closed union: kind='noop' (empty-tsquery | invalid-visibility-context) | kind='query'");
console.log("- S2.17 tsquery birebir korunur; config='simple'; column='search_tsv'");
console.log("- ranking intent taşınır (weighted ts_rank + YH_TSV_WEIGHTS kopyası + desc); ts_rank HESAPLANMAZ");
console.log("- limit = YH_CANDIDATE_LIMIT; visibility S2.13 context'i TAŞINIR (yeniden hesaplanmaz)");
console.log("- config referansı sızmaz (taze frozen kopya); descriptor + iç nesneler frozen; deterministik");
console.log("- string SQL/WHERE/RPC/Supabase alanı YOK; yalnız allowlist anahtarları");

if (failed > 0) {
  console.error(`\n✗ ${failed} kontrol BAŞARISIZ.`);
  process.exit(1);
}
