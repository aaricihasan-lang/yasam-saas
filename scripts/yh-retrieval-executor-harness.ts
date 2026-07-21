// Yaşam Hafızası™ — S2.19A Retrieval Executor + Supabase Adapter izole harness (MOCK DB; canlı DB YOK).
//
// executeRetrieval + mapRowToCandidate + buildVisibilityCandidate + createSupabaseRetrievalRpcPort +
// createSupabaseStoneExclusionPort PUBLIC sözleşmesini GERÇEK import ile doğrular. Gerçek Supabase
// çağrılmaz; RPC/stone port'ları ve dar DB client MOCK'lanır. Çalıştırma:
//   npx tsx scripts/yh-retrieval-executor-harness.ts

import {
  executeRetrieval,
  mapRowToCandidate,
  buildVisibilityCandidate,
  type RetrievalRpcPort,
  type RetrievalRpcParams,
  type RetrievalRpcResult,
} from "../lib/yasam-hafizasi/search/retrievalExecutor";
import {
  createSupabaseRetrievalRpcPort,
  createSupabaseStoneExclusionPort,
  type RetrievalDbClient,
  type RetrievalDbResult,
  type RetrievalRpcResponse,
} from "../lib/yasam-hafizasi/search/supabaseRetrievalAdapter";
import { buildRetrievalQuery } from "../lib/yasam-hafizasi/search/retrievalQuery";
import { buildTsQueryPlan } from "../lib/yasam-hafizasi/search/tsQueryPlan";
import type { Concept } from "../lib/yasam-hafizasi/search/types";
import type { StoneExclusionPort, VisibilityContext } from "../lib/yasam-hafizasi/search/visibilityScope";
import { YH_CANDIDATE_LIMIT, YH_TSV_WEIGHTS, YH_DEMO_TENANT_ID } from "../lib/yasam-hafizasi/config";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
const VIS = (sessionTenantId: string, allowShared: boolean): VisibilityContext => ({
  sessionTenantId,
  allowShared,
});
const C = (term: string): Concept => ({ term, origin: "query" });

/** kind='query' descriptor (tsquery='cakra:*', weights=YH_TSV_WEIGHTS, limit=150). */
function queryDescriptor(sessionTenantId = "tenant-A", allowShared = true) {
  return buildRetrievalQuery(buildTsQueryPlan([C("cakra")]), VIS(sessionTenantId, allowShared));
}
function noopDescriptor() {
  return buildRetrievalQuery(buildTsQueryPlan([]), VIS("tenant-A", true));
}

type Row = Record<string, unknown>;
function makeRow(over: Partial<Record<string, unknown>> = {}): Row {
  return {
    id: "row-1",
    tenant_id: "tenant-A",
    source_module: "sifa_rehberi",
    source_table: "healing_guides",
    source_id: "src-1",
    unit_type: "record",
    section_ref: null,
    group_key: null,
    title: "Çakra Dengesi",
    snippet: "paragraf",
    evidence_fields: [{ origin: "title", kind: "title", text: "Çakra", sectionRef: "s1" }],
    topic_tags: ["cakra", "denge"],
    expert_relations: [{ kind: "related", targetLabel: "Kök Çakra" }],
    is_client_pii: false,
    source_updated_at: "2026-07-01T00:00:00.000Z",
    rank: 0.5,
    ...over,
  };
}

/** Sabit rows/hata döndüren mock RPC portu; params + çağrı sayısını kaydeder. */
function mockRpc(result: RetrievalRpcResult): RetrievalRpcPort & {
  calls: RetrievalRpcParams[];
} {
  const calls: RetrievalRpcParams[] = [];
  const port = ((params: RetrievalRpcParams) => {
    calls.push(params);
    return Promise.resolve(result);
  }) as RetrievalRpcPort & { calls: RetrievalRpcParams[] };
  port.calls = calls;
  return port;
}

/** Mock stone portu: excluded değeri döndürür veya throw eder; çağrıları kaydeder. */
function mockStone(
  behavior: { excluded: boolean } | { throws: true } | { nonBoolean: true },
): StoneExclusionPort & { calls: Array<{ sessionTenantId: string; stoneSourceId: string }> } {
  const calls: Array<{ sessionTenantId: string; stoneSourceId: string }> = [];
  const port = ((input: { sessionTenantId: string; stoneSourceId: string }) => {
    calls.push({ ...input });
    if ("throws" in behavior) return Promise.reject(new Error("gizli-stone-detay"));
    if ("nonBoolean" in behavior) return Promise.resolve("evet" as unknown as boolean);
    return Promise.resolve(behavior.excluded);
  }) as StoneExclusionPort & {
    calls: Array<{ sessionTenantId: string; stoneSourceId: string }>;
  };
  port.calls = calls;
  return port;
}

const okStone = () => mockStone({ excluded: false });

async function main(): Promise<void> {
// ═══ EXECUTOR TESTLERİ ═══════════════════════════════════════════════════════

// 1. noop → DB çağrısı sıfır
{
  const rpc = mockRpc({ ok: true, rows: [] });
  const res = await executeRetrieval(noopDescriptor(), rpc, okStone());
  check("1 noop → kind='noop'", res.kind === "noop");
  check("2 noop → RPC çağrılmaz (0 çağrı)", rpc.calls.length === 0);
}

// 3-7. query → RPC parametreleri doğru
{
  const rpc = mockRpc({ ok: true, rows: [] });
  await executeRetrieval(queryDescriptor("tenant-A", true), rpc, okStone());
  check("3 query → RPC 1 kez çağrılır", rpc.calls.length === 1);
  const p = rpc.calls[0];
  check("4 doğru tsquery parametresi", p?.tsquery === "cakra:*");
  check("5 doğru session tenant", p?.sessionTenantId === "tenant-A");
  check("6 doğru allowShared", p?.allowShared === true);
  check(
    "7 weights sırası [A,B,C,D]",
    !!p &&
      p.weights.length === 4 &&
      p.weights[0] === YH_TSV_WEIGHTS.A &&
      p.weights[1] === YH_TSV_WEIGHTS.B &&
      p.weights[2] === YH_TSV_WEIGHTS.C &&
      p.weights[3] === YH_TSV_WEIGHTS.D,
  );
  check("8 limit descriptor'dan (YH_CANDIDATE_LIMIT)", p?.limit === YH_CANDIDATE_LIMIT);
}

// 9-10. RPC hata → fail-closed + ham mesaj yok
{
  const rpc = mockRpc({ ok: false, code: "retrieval-execution-failed" });
  const res = await executeRetrieval(queryDescriptor(), rpc, okStone());
  check("9 RPC hata → kind='error'", res.kind === "error");
  check(
    "10 error kodu sabit (ham mesaj yok)",
    res.kind === "error" && res.code === "retrieval-execution-failed",
  );
  const keys: string[] = [];
  (function collect(v: unknown): void {
    if (v === null || typeof v !== "object") return;
    for (const k of Object.keys(v as Record<string, unknown>)) {
      keys.push(k.toLowerCase());
      collect((v as Record<string, unknown>)[k]);
    }
  })(res);
  check("11 sonuçta 'message'/ham alan yok", !keys.includes("message") && !keys.includes("stack"));
}

// 12. bozuk kritik satır düşürülür (id yok)
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ id: null }), makeRow({ id: "row-2" })] });
  const res = await executeRetrieval(queryDescriptor(), rpc, okStone());
  check(
    "12 bozuk kritik satır düşer (yalnız geçerli kalır)",
    res.kind === "results" && res.candidates.length === 1 && res.candidates[0]?.id === "row-2",
  );
}

// 13. cross-tenant satır düşürülür
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ tenant_id: "tenant-B" })] });
  const res = await executeRetrieval(queryDescriptor("tenant-A", true), rpc, okStone());
  check("13 cross-tenant düşer", res.kind === "results" && res.candidates.length === 0);
}

// 14-15. shared ± allowShared
{
  const rpcF = mockRpc({ ok: true, rows: [makeRow({ tenant_id: null })] });
  const resF = await executeRetrieval(queryDescriptor("tenant-A", false), rpcF, okStone());
  check("14 shared + allowShared=false düşer", resF.kind === "results" && resF.candidates.length === 0);

  const rpcT = mockRpc({ ok: true, rows: [makeRow({ tenant_id: null })] });
  const resT = await executeRetrieval(queryDescriptor("tenant-A", true), rpcT, okStone());
  check("15 shared + allowShared=true kalır", resT.kind === "results" && resT.candidates.length === 1);
}

// 16. client PII düşürülür
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ is_client_pii: true })] });
  const res = await executeRetrieval(queryDescriptor(), rpc, okStone());
  check("16 client PII düşer", res.kind === "results" && res.candidates.length === 0);
}

// 17. demo tenant düşürülür
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ tenant_id: YH_DEMO_TENANT_ID })] });
  const res = await executeRetrieval(queryDescriptor(YH_DEMO_TENANT_ID, true), rpc, okStone());
  check("17 demo tenant düşer", res.kind === "results" && res.candidates.length === 0);
}

// 18. stone excluded dogaltas düşürülür
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ source_module: "dogaltas" })] });
  const stone = mockStone({ excluded: true });
  const res = await executeRetrieval(queryDescriptor(), rpc, stone);
  check("18 stone excluded dogaltas düşer", res.kind === "results" && res.candidates.length === 0);
  check("19 stone port dogaltas için çağrılır", stone.calls.length === 1 && stone.calls[0]?.stoneSourceId === "src-1");
}

// 20. stone port hatası → fail-closed
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ source_module: "dogaltas" })] });
  const res = await executeRetrieval(queryDescriptor(), rpc, mockStone({ throws: true }));
  check("20 stone port throw → satır düşer (fail-closed)", res.kind === "results" && res.candidates.length === 0);

  const rpc2 = mockRpc({ ok: true, rows: [makeRow({ source_module: "dogaltas" })] });
  const res2 = await executeRetrieval(queryDescriptor(), rpc2, mockStone({ nonBoolean: true }));
  check("21 stone port non-boolean → satır düşer", res2.kind === "results" && res2.candidates.length === 0);
}

// 22. normal dogaltas kalır
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ source_module: "dogaltas" })] });
  const res = await executeRetrieval(queryDescriptor(), rpc, mockStone({ excluded: false }));
  check("22 excluded olmayan dogaltas kalır", res.kind === "results" && res.candidates.length === 1);
}

// 23. diğer modülde stone port gereksiz çağrılmaz
{
  const rpc = mockRpc({ ok: true, rows: [makeRow({ source_module: "sifa_rehberi" })] });
  const stone = mockStone({ excluded: true });
  await executeRetrieval(queryDescriptor(), rpc, stone);
  check("23 dogaltas-dışı modülde stone port çağrılmaz", stone.calls.length === 0);
}

// 24-27. mapping (evidence/topic/relation/tsRank)
{
  const rpc = mockRpc({ ok: true, rows: [makeRow()] });
  const res = await executeRetrieval(queryDescriptor(), rpc, okStone());
  const cand = res.kind === "results" ? res.candidates[0] : undefined;
  check("24 evidenceFields mapping", !!cand && cand.evidenceFields.length === 1 && cand.evidenceFields[0]?.text === "Çakra");
  check("25 topicTags mapping", !!cand && cand.topicTags.length === 2 && cand.topicTags[0] === "cakra");
  check("26 expertRelations mapping", !!cand && cand.expertRelations.length === 1 && cand.expertRelations[0]?.targetLabel === "Kök Çakra");
  check("27 tsRank mapping (rank→tsRank)", !!cand && cand.tsRank === 0.5);
}

// 28. koleksiyon bozuk → güvenli boş (satır düşmez)
{
  const rpc = mockRpc({
    ok: true,
    rows: [makeRow({ evidence_fields: "bozuk", topic_tags: 5, expert_relations: null, rank: "NaN" })],
  });
  const res = await executeRetrieval(queryDescriptor(), rpc, okStone());
  const cand = res.kind === "results" ? res.candidates[0] : undefined;
  check(
    "28 bozuk koleksiyon → boş; satır düşmez; rank→0",
    !!cand && cand.evidenceFields.length === 0 && cand.topicTags.length === 0 &&
      cand.expertRelations.length === 0 && cand.tsRank === 0,
  );
}

// 29. sıra korunur (RPC sırası; TS yeniden sıralamaz)
{
  const rpc = mockRpc({
    ok: true,
    rows: [makeRow({ id: "a", rank: 0.9 }), makeRow({ id: "b", rank: 0.5 }), makeRow({ id: "c", rank: 0.1 })],
  });
  const res = await executeRetrieval(queryDescriptor(), rpc, okStone());
  check(
    "29 satır sırası korunur (yeniden sıralama yok)",
    res.kind === "results" &&
      res.candidates.map((c) => c.id).join(",") === "a,b,c",
  );
}

// 30. deterministik (aynı girdi → aynı çıktı)
{
  const rows = [makeRow({ id: "x" }), makeRow({ id: "y" })];
  const r1 = await executeRetrieval(queryDescriptor(), mockRpc({ ok: true, rows }), okStone());
  const r2 = await executeRetrieval(queryDescriptor(), mockRpc({ ok: true, rows }), okStone());
  check("30 deterministik sonuç", JSON.stringify(r1) === JSON.stringify(r2));
}

// 31. RPC params SQL/interpolation taşımaz (yalnız typed alanlar)
{
  const rpc = mockRpc({ ok: true, rows: [] });
  await executeRetrieval(queryDescriptor(), rpc, okStone());
  const p = rpc.calls[0]!;
  const paramKeys = Object.keys(p).sort().join(",");
  check("31 RPC params yalnız typed alanlar", paramKeys === "allowShared,limit,sessionTenantId,tsquery,weights");
  const blob = JSON.stringify(p).toLowerCase();
  check("32 RPC params'ta SQL/WHERE/SELECT yok", !blob.includes("select ") && !blob.includes(" where ") && !blob.includes("--"));
}

// 33. descriptor + config değişmedi (executor mutasyonsuz)
{
  const d = queryDescriptor("tenant-A", true);
  const snapshot = JSON.stringify(d);
  await executeRetrieval(d, mockRpc({ ok: true, rows: [makeRow()] }), okStone());
  check("33 descriptor mutasyonsuz", JSON.stringify(d) === snapshot);
  check(
    "34 config sabitleri değişmedi",
    YH_CANDIDATE_LIMIT === 150 && YH_TSV_WEIGHTS.A === 1.0 && YH_TSV_WEIGHTS.D === 0.15,
  );
}

// 35-36. mapRowToCandidate / buildVisibilityCandidate saf birim
{
  check("35 mapRowToCandidate bozuk satır → null", mapRowToCandidate({ id: "" }) === null);
  const vc = buildVisibilityCandidate(makeRow({ tenant_id: YH_DEMO_TENANT_ID }));
  check("36 buildVisibilityCandidate demo türetir", vc !== null && vc.isDemoTenant === true && vc.isDemoSource === false);
}

// ═══ ADAPTER TESTLERİ (mock RetrievalDbClient) ════════════════════════════════

/** Zincirleme select builder + rpc kaydı yapan mock DB client. */
function mockDb(cfg: {
  rpcResponse?: RetrievalRpcResponse;
  selectResponse?: RetrievalDbResult;
}): RetrievalDbClient & {
  rpcCalls: Array<{ fn: string; params: Record<string, unknown> }>;
  selectFilters: Array<[string, unknown]>;
  fromTables: string[];
  selectCols: string[];
  limits: number[];
} {
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const selectFilters: Array<[string, unknown]> = [];
  const fromTables: string[] = [];
  const selectCols: string[] = [];
  const limits: number[] = [];
  const selectResponse = cfg.selectResponse ?? { data: [], error: null };
  const rpcResponse = cfg.rpcResponse ?? { data: [], error: null };

  const builder: RetrievalDbResult & {
    eq: (c: string, v: unknown) => typeof builder;
    limit: (n: number) => typeof builder;
    then: PromiseLike<RetrievalDbResult>["then"];
  } = {
    data: selectResponse.data,
    error: selectResponse.error,
    eq(c: string, v: unknown) {
      selectFilters.push([c, v]);
      return builder;
    },
    limit(n: number) {
      limits.push(n);
      return builder;
    },
    then(onf, onr) {
      return Promise.resolve(selectResponse).then(onf, onr);
    },
  };

  const client = {
    from(table: string) {
      fromTables.push(table);
      return {
        select: (cols: string) => {
          selectCols.push(cols);
          return builder;
        },
      };
    },
    rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params });
      return Promise.resolve(rpcResponse);
    },
  } as unknown as RetrievalDbClient & {
    rpcCalls: typeof rpcCalls;
    selectFilters: typeof selectFilters;
    fromTables: typeof fromTables;
    selectCols: typeof selectCols;
    limits: typeof limits;
  };
  client.rpcCalls = rpcCalls;
  client.selectFilters = selectFilters;
  client.fromTables = fromTables;
  client.selectCols = selectCols;
  client.limits = limits;
  return client;
}

const rpcParams: RetrievalRpcParams = {
  tsquery: "cakra:*",
  sessionTenantId: "tenant-A",
  allowShared: true,
  weights: [1.0, 0.6, 0.35, 0.15],
  limit: 150,
};

// 37-40. RPC portu adapter
{
  const db = mockDb({ rpcResponse: { data: [makeRow()], error: null } });
  const port = createSupabaseRetrievalRpcPort(db);
  const r = await port(rpcParams);
  check("37 RPC adı 'yh_search_candidates'", db.rpcCalls[0]?.fn === "yh_search_candidates");
  const pp = db.rpcCalls[0]?.params ?? {};
  check(
    "38 RPC p_* parametre adları doğru",
    Object.keys(pp).sort().join(",") === "p_allow_shared,p_limit,p_session_tenant,p_tsquery,p_weights",
  );
  check("39 p_weights [A,B,C,D] iletilir", JSON.stringify(pp.p_weights) === JSON.stringify([1.0, 0.6, 0.35, 0.15]));
  check("40 başarı → ok:true + rows", r.ok === true && r.rows.length === 1);
}

// 41-42. RPC hata → fail-closed + ham mesaj yok
{
  const db = mockDb({ rpcResponse: { data: null, error: { message: "gizli-db-detay-42501" } } });
  const port = createSupabaseRetrievalRpcPort(db);
  const r = await port(rpcParams);
  check("41 RPC hata → ok:false + sabit kod", r.ok === false && (r.ok === false && r.code === "retrieval-execution-failed"));
  check("42 ham DB mesajı sonuçta yok", !JSON.stringify(r).includes("gizli-db-detay"));
}

// 43-46. stone portu adapter
{
  const dbHit = mockDb({ selectResponse: { data: [{ stone_id: "src-1" }], error: null } });
  const portHit = createSupabaseStoneExclusionPort(dbHit);
  const excluded = await portHit({ sessionTenantId: "tenant-A", stoneSourceId: "src-1" });
  check("43 stone tablosu 'stone_exclusions'", dbHit.fromTables[0] === "stone_exclusions");
  check(
    "44 stone filtreleri tenant_id + stone_id",
    JSON.stringify(dbHit.selectFilters) === JSON.stringify([["tenant_id", "tenant-A"], ["stone_id", "src-1"]]),
  );
  check("45a stone select 'stone_id' + limit 1", dbHit.selectCols[0] === "stone_id" && dbHit.limits[0] === 1);
  check("45 kayıt varsa excluded=true", excluded === true);

  const dbEmpty = mockDb({ selectResponse: { data: [], error: null } });
  const empty = await createSupabaseStoneExclusionPort(dbEmpty)({ sessionTenantId: "t", stoneSourceId: "s" });
  check("46 kayıt yoksa excluded=false", empty === false);
}

// 47. stone portu DB hata → throw (generic; evaluateVisibility fail-closed)
{
  const dbErr = mockDb({ selectResponse: { data: null, error: { message: "gizli-42501" } } });
  const port = createSupabaseStoneExclusionPort(dbErr);
  let threw = false;
  let leaked = false;
  try {
    await port({ sessionTenantId: "t", stoneSourceId: "s" });
  } catch (e) {
    threw = true;
    leaked = String(e).includes("gizli-42501");
  }
  check("47 stone DB hata → throw", threw);
  check("48 stone throw ham mesaj sızdırmaz", !leaked);
}

console.log("");
console.log("S2.19A retrieval executor + adapter harness — MOCK DB; canlı DB/RPC/Supabase YOK.");
console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
console.log("- noop → DB çağrısı yok; query → doğru RPC adı/param (tsquery/tenant/allowShared/[A,B,C,D]/limit)");
console.log("- RPC/stone hata → fail-closed; ham DB mesajı sızmaz; bozuk kritik satır düşer, koleksiyon boşalır");
console.log("- cross-tenant/shared(±)/PII/demo/stone dışlama; dogaltas-dışı stone çağrılmaz; sıra korunur; deterministik");
if (failed > 0) process.exitCode = 1;
}

void main();
