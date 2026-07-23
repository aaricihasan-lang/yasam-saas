// Yaşam Hafızası™ — S2.10 supabaseIndexAdapters fake-Supabase harness (DB'siz).
//
// Gerçek adapter export'larını + indexSourcePage'i import eder; chainable FAKE
// query builder ile query shape / chunk / fail-fast / demo düşürme doğrular.
// Gerçek DB / network / service-role env YOK.
// Çalıştırma:  npx tsx scripts/yh-supabase-index-adapters-harness.ts

import { ADMIN_LIBRARY_TENANT_ID } from "../lib/tenancy/syntheticTenants";
import { YH_DEMO_TENANT_ID, YH_TABLES } from "../lib/yasam-hafizasi/config";
import type { BuiltIndexUnit } from "../lib/yasam-hafizasi/indexer/buildCandidate";
import { indexSourcePage } from "../lib/yasam-hafizasi/indexer/indexSourcePage";
import { parentTenantMapKey } from "../lib/yasam-hafizasi/indexer/parentTenantLookup";
import type { SourceConfig } from "../lib/yasam-hafizasi/indexer/sources";
import {
  createSupabaseIndexWriter,
  createSupabaseParentTenantReader,
  createSupabaseSourceReader,
  sourceSelectColumns,
  type DbQueryResult,
  type DbSelectBuilder,
  type DbTableBuilder,
  type IndexDbClient,
} from "../lib/yasam-hafizasi/indexer/supabaseIndexAdapters";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const PID = "33333333-3333-3333-3333-333333333333";
const PARENT_T = "55555555-5555-5555-5555-555555555555";

type DbRow = Record<string, unknown>;
interface Call {
  method: string;
  args: unknown[];
}
interface FromRec {
  table: string;
  chain: Call[];
}

function makeFake(opts: {
  select?: (table: string, chain: Call[]) => DbQueryResult;
  upsert?: (idx: number, rows: DbRow[], onConflict: string) => { error: { message: string } | null };
}): { db: IndexDbClient; froms: FromRec[]; upserts: { rows: DbRow[]; onConflict: string }[] } {
  const froms: FromRec[] = [];
  const upserts: { rows: DbRow[]; onConflict: string }[] = [];
  let upsertIdx = 0;
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
          const res: DbQueryResult = opts.select ? opts.select(table, rec.chain) : { data: [], error: null };
          return Promise.resolve(res).then(onF, onR);
        },
      };
      return {
        select(cols) { rec.chain.push({ method: "select", args: [cols] }); return sb; },
        upsert(rows, o) {
          rec.chain.push({ method: "upsert", args: [rows.length, o] });
          const idx = upsertIdx;
          upsertIdx += 1;
          upserts.push({ rows: rows.map((r) => ({ ...r })), onConflict: o.onConflict });
          const res = opts.upsert ? opts.upsert(idx, rows as DbRow[], o.onConflict) : { error: null };
          return Promise.resolve(res);
        },
      };
    },
  };
  return { db, froms, upserts };
}

const colCfg: SourceConfig = {
  sourceKey: "test:col", sourceFamily: "kisisel_arsiv", tableName: "test_col", primaryKey: "id",
  unit: "record", tenant: { mode: "column", column: "tenant_id" }, titleColumns: ["title"],
  searchTextColumns: ["content"], snippetColumns: ["content"], topicTagsColumns: ["tags"],
  relationColumns: [], updatedAtColumn: null, activeColumn: "is_active",
  classification: "safe-non-pii", // BF-0: indexSourcePage guard'ından geçmek için (zorunlu alan)
  enabled: true,
};

function unit(sourceId: string, hash: string): BuiltIndexUnit {
  return {
    tenantId: TENANT_A, sourceModule: "kisisel_arsiv", sourceTable: "test_col", sourceId,
    unitType: "record", sectionRef: null, groupKey: "test:col:" + sourceId, title: "T", titleSource: "title",
    snippet: "S", snippetOrigin: "content", topicTags: [], expertRelations: [], evidenceFields: [{ origin: "content", kind: "paragraph", text: "e" }],
    sourceUpdatedAt: null, contentHash: hash,
  };
}
function unitWithTenant(sourceId: string, hash: string, tenantId: string | null): BuiltIndexUnit {
  return { ...unit(sourceId, hash), tenantId };
}
function manyUnits(n: number, hash: string): BuiltIndexUnit[] {
  const out: BuiltIndexUnit[] = [];
  for (let i = 0; i < n; i += 1) out.push(unit(`id-${i}`, hash));
  return out;
}
function findFrom(froms: FromRec[], table: string): FromRec | undefined {
  return froms.find((f) => f.table === table);
}
function chainHas(chain: Call[], method: string): Call | undefined {
  return chain.find((c) => c.method === method);
}

async function main(): Promise<void> {
  const HASH = "1".repeat(64);

  // ═══ A — SourceReader (9) ══════════════════════════════════════════════════
  {
    const fake = makeFake({ select: () => ({ data: [{ id: "x", tenant_id: TENANT_A }], error: null }) });
    await createSupabaseSourceReader(fake.db).readPage({ config: colCfg, afterId: null, limit: 200 });
    const rec = fake.froms[0];
    check(rec.table === "test_col", `A1 table=${rec.table}`);
    const sel = chainHas(rec.chain, "select");
    check(sel?.args[0] === sourceSelectColumns(colCfg).join(",") && sel?.args[0] !== "*", `A2 minimal select=${J(sel?.args[0])}`);
    check(!!chainHas(rec.chain, "eq"), `A3 active filter eq var`);
    const eq = chainHas(rec.chain, "eq");
    check(eq?.args[0] === "is_active" && eq?.args[1] === true, `A3b eq(is_active,true)`);
    check(!chainHas(rec.chain, "gt"), `A5 afterId null → gt yok`);
    const ord = chainHas(rec.chain, "order");
    check(ord?.args[0] === "id" && J(ord?.args[1]) === J({ ascending: true }), `A6 order(id asc)`);
    check(chainHas(rec.chain, "limit")?.args[0] === 200, `A7 limit(200)`);
  }
  {
    const fake = makeFake({ select: () => ({ data: [], error: null }) });
    await createSupabaseSourceReader(fake.db).readPage({ config: colCfg, afterId: "cursor-1", limit: 50 });
    const gt = chainHas(fake.froms[0].chain, "gt");
    check(gt?.args[0] === "id" && gt?.args[1] === "cursor-1", `A4 cursor gt(id,cursor)`);
  }
  {
    const orig = { id: "x", tenant_id: TENANT_A };
    const fake = makeFake({ select: () => ({ data: [orig], error: null }) });
    const page = await createSupabaseSourceReader(fake.db).readPage({ config: colCfg, afterId: null, limit: 10 });
    check(page.rows[0] !== orig && J(page.rows[0]) === J(orig), `A8 shallow clone (yeni referans)`);
  }
  {
    const fake = makeFake({ select: () => ({ data: null, error: { message: "SECRET DB DETAIL" } }) });
    let msg = "";
    try { await createSupabaseSourceReader(fake.db).readPage({ config: colCfg, afterId: null, limit: 10 }); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    check(msg === "source-read-failed" && !msg.includes("SECRET"), `A9 DB error→sabit kod, ham mesaj sızmaz (${msg})`);
  }

  // ═══ B — ParentReader (8) ══════════════════════════════════════════════════
  {
    const ids = Array.from({ length: 200 }, (_, i) => `p-${i}`);
    const fake = makeFake({ select: () => ({ data: [], error: null }) });
    await createSupabaseParentTenantReader(fake.db).readParentTenants({ parentTable: "test_parent", parentTenantColumn: "tenant_id", parentIds: ids });
    check(fake.froms.length === 1, `B1 200 id → 1 query (${fake.froms.length})`);
  }
  {
    const ids = Array.from({ length: 201 }, (_, i) => `p-${i}`);
    const fake = makeFake({ select: () => ({ data: [], error: null }) });
    await createSupabaseParentTenantReader(fake.db).readParentTenants({ parentTable: "test_parent", parentTenantColumn: "tenant_id", parentIds: ids });
    check(fake.froms.length === 2, `B2 201 id → 2 query (${fake.froms.length})`);
  }
  {
    const fake = makeFake({ select: () => ({ data: [{ id: PID, tenant_id: PARENT_T }], error: null }) });
    const map = await createSupabaseParentTenantReader(fake.db).readParentTenants({ parentTable: "test_parent", parentTenantColumn: "tenant_id", parentIds: [PID] });
    const rec = fake.froms[0];
    check(chainHas(rec.chain, "select")?.args[0] === "id,tenant_id", `B3 select id+tenant`);
    const inn = chainHas(rec.chain, "in");
    check(inn?.args[0] === "id" && J(inn?.args[1]) === J([PID]), `B4 in(id,chunk)`);
    check(map.get(parentTenantMapKey("test_parent", PID)) === PARENT_T, `B5 map key reuse + değer`);
  }
  {
    const fake = makeFake({ select: () => ({ data: [{ id: PID, tenant_id: null }], error: null }) });
    const map = await createSupabaseParentTenantReader(fake.db).readParentTenants({ parentTable: "test_parent", parentTenantColumn: "tenant_id", parentIds: [PID] });
    check(map.get(parentTenantMapKey("test_parent", PID)) === null && map.has(parentTenantMapKey("test_parent", PID)), `B6 null tenant → null (shared)`);
  }
  {
    const fake = makeFake({ select: () => ({ data: [], error: null }) }); // parent yok
    const map = await createSupabaseParentTenantReader(fake.db).readParentTenants({ parentTable: "test_parent", parentTenantColumn: "tenant_id", parentIds: [PID] });
    check(!map.has(parentTenantMapKey("test_parent", PID)), `B7 missing parent → map dışı`);
  }
  {
    const fake = makeFake({ select: () => ({ data: null, error: { message: "PARENT SECRET" } }) });
    let msg = "";
    try { await createSupabaseParentTenantReader(fake.db).readParentTenants({ parentTable: "test_parent", parentTenantColumn: "tenant_id", parentIds: [PID] }); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    check(msg === "parent-read-failed" && !msg.includes("SECRET"), `B8 chunk error → fatal, ham mesaj sızmaz (${msg})`);
  }

  // ═══ C — Writer (12) ═══════════════════════════════════════════════════════
  const selPrefetchEmpty = (table: string): DbQueryResult => (table === YH_TABLES.index ? { data: [], error: null } : { data: [], error: null });
  {
    const fake = makeFake({ select: selPrefetchEmpty });
    await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: [unit("s1", HASH)] });
    const pf = findFrom(fake.froms, YH_TABLES.index);
    check(pf?.table === YH_TABLES.index, `C1 prefetch from index`);
    check(chainHas(pf!.chain, "select")?.args[0] === "source_id,section_ref,content_hash", `C2 minimal prefetch select`);
    check(chainHas(pf!.chain, "eq")?.args[0] === "source_table" && chainHas(pf!.chain, "in")?.args[0] === "source_id", `C2b prefetch source_table eq + source_id in`);
  }
  {
    const fake = makeFake({ select: selPrefetchEmpty });
    await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: [unit("s1", HASH)] });
    check(fake.upserts.length === 1 && fake.upserts[0].onConflict === "source_table,source_id,section_ref", `C3 onConflict key`);
  }
  {
    // unchanged-only → upsert yok
    const u = unit("s1", HASH);
    const fake = makeFake({ select: (t) => (t === YH_TABLES.index ? { data: [{ source_id: "s1", section_ref: null, content_hash: HASH }], error: null } : { data: [], error: null }) });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: [u] });
    check(fake.upserts.length === 0 && r.unchanged === 1 && r.written === 0, `C4 unchanged-only → upsert yok`);
  }
  {
    const fake = makeFake({ select: selPrefetchEmpty });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: manyUnits(200, HASH) });
    check(fake.upserts.length === 1 && fake.upserts[0].rows.length === 200 && r.written === 200, `C5 200 satır → 1 upsert`);
  }
  {
    const fake = makeFake({ select: selPrefetchEmpty });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: manyUnits(201, HASH) });
    check(fake.upserts.length === 2 && r.written === 201 && r.chunksSucceeded === 2, `C6 201 satır → 2 upsert`);
  }
  {
    // fail-fast: ilk chunk hatası → ikinci çağrılmaz
    const fake = makeFake({ select: selPrefetchEmpty, upsert: (idx) => (idx === 0 ? { error: { message: "UPSERT SECRET" } } : { error: null }) });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: manyUnits(201, HASH) });
    check(fake.upserts.length === 1 && r.written === 0 && r.failed === 200 && r.errors.length === 1 && r.errors[0].chunkIndex === 0 && r.errors[0].code === "upsert-failed", `C7 fail-fast ilk chunk (${J(r.errors)})`);
  }
  {
    // fail-fast: ikinci chunk hatası → ilk success korunur
    const fake = makeFake({ select: selPrefetchEmpty, upsert: (idx) => (idx === 1 ? { error: { message: "x" } } : { error: null }) });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: manyUnits(201, HASH) });
    check(fake.upserts.length === 2 && r.written === 200 && r.failed === 1 && r.chunksSucceeded === 1 && r.errors[0].chunkIndex === 1, `C8 fail-fast ikinci chunk, ilk korunur (written=${r.written} failed=${r.failed})`);
  }
  {
    const fake = makeFake({ select: (t) => (t === YH_TABLES.index ? { data: [{ source_id: "s1", section_ref: null, content_hash: "9".repeat(64) }], error: null } : { data: [], error: null }) });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: [unit("s1", HASH), unit("s2", HASH)] });
    check(r.plannedUpdate === 1 && r.plannedInsert === 1, `C9 plannedInsert/plannedUpdate isimleri (${J([r.plannedInsert, r.plannedUpdate])})`);
  }
  {
    const fake = makeFake({ select: selPrefetchEmpty });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: [unit("s1", HASH)] });
    check(r.written === 1 && r.failed === 0 && r.attempted === 1, `C10 written/failed/attempted semantiği`);
  }
  {
    // prefetch error → prefetch-failed, ham mesaj sızmaz, upsert yok
    const fake = makeFake({ select: (t) => (t === YH_TABLES.index ? { data: null, error: { message: "PREFETCH SECRET" } } : { data: [], error: null }) });
    const r = await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units: [unit("s1", HASH)] });
    check(r.errors.length === 1 && r.errors[0].code === "prefetch-failed" && fake.upserts.length === 0 && J(r).indexOf("SECRET") === -1, `C11 prefetch-failed (${J(r.errors)})`);
  }
  {
    const units = [unit("s1", HASH)];
    const snap = J(units);
    const fake = makeFake({ select: selPrefetchEmpty });
    await createSupabaseIndexWriter(fake.db).write({ config: colCfg, units });
    check(J(units) === snap, `C12 input mutation yok`);
  }

  // ═══ D — Orkestrasyon (indexSourcePage) (6) ════════════════════════════════
  const orchSelect = (table: string): DbQueryResult => {
    if (table === "test_col") {
      return { data: [
        { id: "r1", tenant_id: TENANT_A, content: "abc", is_active: true },
        { id: "r2", tenant_id: YH_DEMO_TENANT_ID, content: "demo", is_active: true }, // demo → düşmeli
      ], error: null };
    }
    return { data: [], error: null }; // index prefetch → empty
  };
  {
    const fake = makeFake({ select: orchSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "dry-run", db: fake.db });
    check(fake.upserts.length === 0 && r.write === null, `D1 dry-run writer çağrılmaz`);
  }
  {
    const fake = makeFake({ select: orchSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "write", db: fake.db });
    check(r.write !== null && fake.upserts.length === 1, `D2 write writer çağrılır`);
  }
  {
    const fake = makeFake({ select: orchSelect });
    await indexSourcePage({ config: colCfg, mode: "write", db: fake.db });
    // demo unit writer'a ulaşmamalı → upsert edilen satır yalnız r1 (1 satır)
    check(fake.upserts[0].rows.length === 1 && fake.upserts[0].rows[0].source_id === "r1", `D3 demo unit writer'a ulaşmaz`);
  }
  {
    const fake = makeFake({ select: orchSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "write", db: fake.db });
    check(r.excludedDemo === 1 && r.eligibleUnits === 1 && r.fetched === 2, `D4 excludedDemo=${r.excludedDemo} eligible=${r.eligibleUnits}`);
  }
  {
    const fake = makeFake({ select: orchSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "dry-run", db: fake.db });
    const keys = Object.keys(r).sort().join(",");
    // BF-2B: exactMode/exactStatus güvenli skaler alanları eklendi (ham içerik değil);
    // "units" (ham) sızmama garantisi KORUNUR.
    check(keys.indexOf("units") === -1 && keys === "eligibleUnits,exactMode,exactStatus,excludedDemo,excludedSynthetic,fetched,hasMore,mode,nextCursor,parentStats,sourceKey,summary,write", `D5 ham units yok (${keys})`);
  }
  {
    // db injection çalışır: fake kullanıldı (gerçek getServerDb çağrılmadı → env gerekmez)
    const fake = makeFake({ select: orchSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "write", db: fake.db });
    check(r.sourceKey === "test:col" && fake.froms.length > 0, `D6 db injection çalışır`);
  }

  // ═══ E — BF-1B-FIX Global Sentetik Tenant Guard (11) ═══════════════════════
  // real + demo + sentetik karışık sayfa (sınıflandırma: demo → excludedDemo,
  // sentetik → excludedSynthetic, kalan → eligible; bir unit tek sayaçta).
  const mixedSelect = (table: string): DbQueryResult => {
    if (table === "test_col") {
      return { data: [
        { id: "r1", tenant_id: TENANT_A, content: "abc", is_active: true },
        { id: "r2", tenant_id: YH_DEMO_TENANT_ID, content: "demo", is_active: true },
        { id: "r3", tenant_id: ADMIN_LIBRARY_TENANT_ID, content: "tpl", is_active: true },
        { id: "r4", tenant_id: null, content: "shr", is_active: true }, // colCfg allowSharedNull yok → skip (sözleşme değişmez)
      ], error: null };
    }
    return { data: [], error: null };
  };
  const allSyntheticSelect = (table: string): DbQueryResult => {
    if (table === "test_col") {
      return { data: [
        { id: "s1", tenant_id: ADMIN_LIBRARY_TENANT_ID, content: "t1", is_active: true },
        { id: "s2", tenant_id: ADMIN_LIBRARY_TENANT_ID, content: "t2", is_active: true },
      ], error: null };
    }
    return { data: [], error: null };
  };
  {
    const fake = makeFake({ select: mixedSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "dry-run", db: fake.db });
    check(r.excludedSynthetic === 1, `E1 sentetik → excludedSynthetic=1 (${r.excludedSynthetic})`);
    check(r.excludedDemo === 1, `E2 demo sayacı sentetikten ayrı (${r.excludedDemo})`);
    check(r.eligibleUnits === 1, `E3 mixed page → yalnız gerçek tenant eligible (${r.eligibleUnits})`);
    check(r.fetched === 4 && r.summary.skipped === 1, `E4 NULL/shared sözleşme değişmedi (skip; fetched=${r.fetched})`);
  }
  {
    const fake = makeFake({ select: allSyntheticSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "dry-run", db: fake.db });
    check(r.eligibleUnits === 0 && r.excludedSynthetic === 2 && r.excludedDemo === 0 && r.write === null,
      `E5 tümü sentetik → eligible=0, kontrollü başarı (${r.eligibleUnits}/${r.excludedSynthetic})`);
  }
  {
    const fake = makeFake({ select: allSyntheticSelect });
    const r = await indexSourcePage({ config: colCfg, mode: "write", db: fake.db });
    // eligible=0 → writer boş-units yolu; upsert YOK, hata YOK.
    check(fake.upserts.length === 0 && r.write !== null && r.write.attempted === 0,
      `E6 write modunda sentetik writer'a ULAŞMAZ (upsert=${fake.upserts.length})`);
  }
  {
    const fake = makeFake({ select: mixedSelect });
    await indexSourcePage({ config: colCfg, mode: "write", db: fake.db });
    const rows = fake.upserts.flatMap((u) => u.rows);
    check(rows.length === 1 && rows[0].source_id === "r1" && rows[0].tenant_id === TENANT_A,
      `E7 mixed write → yalnız gerçek tenant yazılır (${rows.length})`);
  }
  {
    // Savunma derinliği: writer'a DOĞRUDAN sentetik unit verilirse fail-fast.
    const fake = makeFake({ select: selPrefetchEmpty });
    let code = "";
    try {
      await createSupabaseIndexWriter(fake.db).write({
        config: colCfg,
        units: [unit("w1", HASH), unitWithTenant("w2", HASH, ADMIN_LIBRARY_TENANT_ID)],
      });
    } catch (e) {
      code = e instanceof Error ? e.message : "?";
    }
    check(code === "synthetic-tenant-unit", `E8 writer guard fail-fast (${code})`);
    check(fake.upserts.length === 0, `E9 guard sonrası hiçbir upsert denenmez`);
  }
  {
    // Gerçek tenant + NULL/shared unit writer davranışı DEĞİŞMEZ (guard dokunmaz).
    const fake = makeFake({ select: selPrefetchEmpty });
    const r = await createSupabaseIndexWriter(fake.db).write({
      config: colCfg,
      units: [unit("w3", HASH), unitWithTenant("w4", HASH, null)],
    });
    check(r.written === 2 && r.failed === 0, `E10 gerçek+shared writer davranışı değişmedi (${r.written})`);
    check(fake.upserts.flatMap((u) => u.rows).length === 2, `E11 iki satır upsert edildi`);
  }

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error("S2.10 supabaseIndexAdapters harness — BAŞARISIZ:");
    for (const e of errors) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log("S2.10 supabaseIndexAdapters harness — fake-Supabase; DB'siz.");
  console.log("");
  console.log(`CHECK: ${total} kontrol OK (A reader 9 + B parent 8 + C writer 12 + D orkestrasyon 6 + E sentetik guard 11).`);
  console.log("- reader: doğru table, minimal select, active .eq, cursor .gt (yoksa yok), order/limit, shallow clone, error→sabit kod");
  console.log("- parent: 200 chunk, id+tenant select, .in, map key reuse, null/missing, chunk error fatal");
  console.log("- writer: prefetch(source_table+source_id), onConflict, unchanged→upsert yok, chunk 200, FAIL-FAST, prefetch/upsert error sabit kod, mutation yok");
  console.log("- orkestrasyon: dry-run writer yok, write writer var, demo writer'a ulaşmaz, excludedDemo, ham units sızmaz, db injection");
  console.log("- BF-1B-FIX sentetik guard: excludedSynthetic demo'dan ayrı, mixed/all-synthetic sayfalar, sentetik writer'a ulaşmaz, writer fail-fast synthetic-tenant-unit, gerçek/shared davranış değişmedi");
}

main().catch((e) => {
  console.error("S2.10 adapters harness — beklenmeyen üst-seviye hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
