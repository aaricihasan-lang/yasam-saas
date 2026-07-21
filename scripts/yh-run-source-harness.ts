// Yaşam Hafızası™ — S2.09 runSource izole harness (saf, fake-port; DB'siz).
//
// runSource({config, reader, parentReader?, afterId?, limit?}) → RunSourceResult
// orkestrasyonunu enjekte edilmiş FAKE port'larla doğrular. GERÇEK runSource import
// edilir (kopya/taklit YOK). Gerçek DB / Supabase / IO / env / network YOK.
// Çalıştırma:  npx tsx scripts/yh-run-source-harness.ts

import {
  parentTenantMapKey,
  type ParentTenantMap,
} from "../lib/yasam-hafizasi/indexer/parentTenantLookup";
import {
  runSource,
  type ParentTenantReader,
  type SourceReader,
} from "../lib/yasam-hafizasi/indexer/runSource";
import type { SourceConfig } from "../lib/yasam-hafizasi/indexer/sources";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

// ── Sabitler (geçerli UUID'ler) ──────────────────────────────────────────────
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const PID = "33333333-3333-3333-3333-333333333333";
const PID2 = "44444444-4444-4444-4444-444444444444";
const PARENT_T = "55555555-5555-5555-5555-555555555555";
const SID1 = "66666666-6666-6666-6666-666666666666";
const SID2 = "77777777-7777-7777-7777-777777777777";
const SID3 = "88888888-8888-8888-8888-888888888888";

// ── Fixture config'ler ───────────────────────────────────────────────────────
const colCfg: SourceConfig = {
  sourceKey: "test:col",
  classification: "safe-non-pii", // BF-0 zorunlu alan (test config)
  sourceFamily: "kisisel_arsiv",
  tableName: "test_col",
  primaryKey: "id",
  unit: "record",
  tenant: { mode: "column", column: "tenant_id" },
  titleColumns: ["title"],
  searchTextColumns: ["content"],
  snippetColumns: ["content"],
  topicTagsColumns: ["tags"],
  relationColumns: [],
  updatedAtColumn: null,
  activeColumn: null,
  enabled: true,
};
const joinCfg: SourceConfig = {
  sourceKey: "test:join",
  classification: "safe-non-pii", // BF-0 zorunlu alan (test config)
  sourceFamily: "aromaterapi",
  tableName: "test_join",
  primaryKey: "id",
  unit: "row",
  tenant: { mode: "join", fkColumn: "parent_id", parentTable: "test_parent", parentTenantColumn: "tenant_id" },
  titleColumns: ["title"],
  searchTextColumns: ["content"],
  snippetColumns: ["content"],
  topicTagsColumns: ["tags"],
  relationColumns: [],
  updatedAtColumn: null,
  activeColumn: null,
  enabled: true,
};
const joinSharedCfg: SourceConfig = {
  ...joinCfg,
  sourceKey: "test:join-shared",
  tenant: {
    mode: "join",
    fkColumn: "parent_id",
    parentTable: "test_parent",
    parentTenantColumn: "tenant_id",
    allowSharedNull: true,
  },
};

// ── Fake port yardımcıları ───────────────────────────────────────────────────
type Row = Record<string, unknown>;

function fixedReader(rows: Row[]): { reader: SourceReader; calls: { afterId: string | null; limit: number }[] } {
  const calls: { afterId: string | null; limit: number }[] = [];
  const reader: SourceReader = {
    readPage: async ({ afterId, limit }) => {
      calls.push({ afterId, limit });
      return { rows };
    },
  };
  return { reader, calls };
}
function rejectingReader(): SourceReader {
  return { readPage: async () => { throw new Error("reader-io-fail"); } };
}
function parentMapOf(dict: Record<string, string | null>): ParentTenantMap {
  const m = new Map<string, string | null>();
  for (const pid of Object.keys(dict)) m.set(parentTenantMapKey("test_parent", pid), dict[pid]);
  return m;
}
function fixedParentReader(dict: Record<string, string | null>): {
  reader: ParentTenantReader;
  calls: { parentIds: readonly string[] }[];
} {
  const calls: { parentIds: readonly string[] }[] = [];
  const reader: ParentTenantReader = {
    readParentTenants: async ({ parentIds }) => {
      calls.push({ parentIds });
      const m = new Map<string, string | null>();
      for (const pid of parentIds) {
        if (Object.prototype.hasOwnProperty.call(dict, pid)) {
          m.set(parentTenantMapKey("test_parent", pid), dict[pid]);
        }
      }
      return m;
    },
  };
  return { reader, calls };
}
function rejectingParentReader(): ParentTenantReader {
  return { readParentTenants: async () => { throw new Error("parent-io-fail"); } };
}

async function main(): Promise<void> {
  // ═══ GRUP A — column-mode (4) ══════════════════════════════════════════════
  {
    const { reader } = fixedReader([{ id: SID1, tenant_id: TENANT_A, content: "a" }]);
    const r = await runSource({ config: colCfg, reader });
    check(r.fetched === 1 && r.units.length === 1 && r.units[0].tenantId === TENANT_A, `A1 ${J(r.summary)}`);
  }
  {
    const { reader } = fixedReader([
      { id: SID1, tenant_id: TENANT_A, content: "a" },
      { id: SID2, tenant_id: TENANT_A, content: "b" },
    ]);
    const r = await runSource({ config: colCfg, reader });
    check(r.units.length === 2 && r.units[0].sourceId === SID1 && r.units[1].sourceId === SID2, `A2 sıra`);
  }
  {
    const { reader } = fixedReader([
      { id: SID1, tenant_id: "bad", content: "a" },
      { id: SID2, tenant_id: TENANT_A, content: "b" },
    ]);
    const r = await runSource({ config: colCfg, reader });
    check(
      r.units.length === 1 && r.summary.units === 1 && r.summary.skipped === 1 && r.summary.byReason["tenant:invalid-tenant"] === 1,
      `A3 ${J(r.summary)}`,
    );
  }
  {
    const { reader } = fixedReader([{ id: SID1, tenant_id: TENANT_A, content: "a" }]);
    const pr = fixedParentReader({});
    const r = await runSource({ config: colCfg, reader, parentReader: pr.reader });
    check(pr.calls.length === 0 && r.units.length === 1, `A4 column parentReader çağrıldı=${pr.calls.length}`);
  }

  // ═══ GRUP B — join-mode (8) ════════════════════════════════════════════════
  {
    const { reader } = fixedReader([{ id: SID1, parent_id: PID, content: "a" }]);
    const pr = fixedParentReader({ [PID]: PARENT_T });
    const r = await runSource({ config: joinCfg, reader, parentReader: pr.reader });
    check(r.units.length === 1 && r.units[0].tenantId === PARENT_T, `B1 ${J(r.units.map((u) => u.tenantId))}`);
  }
  {
    const { reader } = fixedReader([
      { id: SID1, parent_id: PID, content: "a" },
      { id: SID2, parent_id: PID, content: "b" },
    ]);
    const pr = fixedParentReader({ [PID]: PARENT_T });
    const r = await runSource({ config: joinCfg, reader, parentReader: pr.reader });
    check(r.parentStats.requested === 1 && pr.calls[0].parentIds.length === 1 && r.units.length === 2, `B2 dedup requested=${r.parentStats.requested}`);
  }
  {
    const { reader } = fixedReader([
      { id: SID1, parent_id: PID, content: "a" },
      { id: SID2, parent_id: PID2, content: "b" },
    ]);
    const pr = fixedParentReader({ [PID]: PARENT_T, [PID2]: TENANT_B });
    await runSource({ config: joinCfg, reader, parentReader: pr.reader });
    check(pr.calls.length === 1, `B3 parentReader tek çağrı=${pr.calls.length}`);
  }
  {
    const { reader } = fixedReader([{ id: SID1, parent_id: PID, content: "a" }]);
    const pr = fixedParentReader({});
    const r = await runSource({ config: joinCfg, reader, parentReader: pr.reader });
    check(
      r.units.length === 0 && r.summary.byReason["tenant:parent-not-found"] === 1 && r.parentStats.requested === 1 && r.parentStats.found === 0 && r.parentStats.missing === 1,
      `B4 ${J(r.parentStats)} ${J(r.summary)}`,
    );
  }
  {
    const { reader } = fixedReader([{ id: SID1, parent_id: PID, content: "a" }]);
    const pr = fixedParentReader({ [PID]: null });
    const r = await runSource({ config: joinSharedCfg, reader, parentReader: pr.reader });
    check(r.units.length === 1 && r.units[0].tenantId === null && r.parentStats.found === 1, `B5 shared ${J(r.units.map((u) => u.tenantId))}`);
  }
  {
    const { reader } = fixedReader([
      { id: SID1, parent_id: PID, content: "a" },
      { id: SID2, parent_id: PID2, content: "b" },
    ]);
    const pr = fixedParentReader({ [PID]: PARENT_T, [PID2]: TENANT_B });
    const r = await runSource({ config: joinCfg, reader, parentReader: pr.reader });
    const t1 = r.units.find((u) => u.sourceId === SID1)?.tenantId ?? null;
    const t2 = r.units.find((u) => u.sourceId === SID2)?.tenantId ?? null;
    check(t1 === PARENT_T && t2 === TENANT_B, `B6 sızıntı t1=${t1} t2=${t2}`);
  }
  {
    const { reader } = fixedReader([{ id: SID1, content: "a" }]); // parent_id yok
    const pr = fixedParentReader({ [PID]: PARENT_T });
    const r = await runSource({ config: joinCfg, reader, parentReader: pr.reader });
    check(pr.calls.length === 0 && r.parentStats.requested === 0 && r.summary.byReason["tenant:missing-fk"] === 1, `B7 boş-FK calls=${pr.calls.length}`);
  }
  {
    const { reader } = fixedReader([]);
    const pr = fixedParentReader({});
    const r = await runSource({ config: joinCfg, reader, parentReader: pr.reader });
    check(pr.calls.length === 0 && r.fetched === 0 && r.units.length === 0 && r.hasMore === false && r.nextCursor === null, `B8 boş-sayfa`);
  }

  // ═══ GRUP C — pagination (13) ══════════════════════════════════════════════
  {
    const { reader, calls } = fixedReader([{ id: SID1, tenant_id: TENANT_A, content: "a" }]);
    await runSource({ config: colCfg, reader });
    check(calls[0].limit === 200, `C1 default limit=${calls[0].limit}`);
  }
  {
    const { reader, calls } = fixedReader([]);
    await runSource({ config: colCfg, reader, limit: 999 });
    check(calls[0].limit === 500, `C2 cap limit=${calls[0].limit}`);
  }
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 3.5]) {
    const { reader, calls } = fixedReader([]);
    await runSource({ config: colCfg, reader, limit: bad });
    check(calls[0].limit === 200, `C3 geçersiz limit ${bad} → ${calls[0].limit}`);
  }
  {
    const { reader } = fixedReader([{ id: SID1, tenant_id: TENANT_A, content: "a" }]);
    const r = await runSource({ config: colCfg, reader, limit: 200 });
    check(r.hasMore === false && r.nextCursor === null, `C4 final page`);
  }
  {
    const { reader } = fixedReader([
      { id: SID1, tenant_id: TENANT_A, content: "a" },
      { id: SID2, tenant_id: TENANT_A, content: "b" },
    ]);
    const r = await runSource({ config: colCfg, reader, limit: 2 });
    check(r.hasMore === true && r.nextCursor === SID2, `C5 full page cursor=${r.nextCursor}`);
  }
  {
    const { reader, calls } = fixedReader([]);
    await runSource({ config: colCfg, reader, afterId: SID1, limit: 10 });
    check(calls[0].afterId === SID1, `C6 afterId=${calls[0].afterId}`);
  }
  {
    const rows1: Row[] = [{ id: SID1, tenant_id: TENANT_A, content: "a", tags: ["x"] }, { id: SID2, tenant_id: "bad", content: "b" }];
    const rows2: Row[] = [{ id: SID1, tenant_id: TENANT_A, content: "a", tags: ["x"] }, { id: SID2, tenant_id: "bad", content: "b" }];
    const a = await runSource({ config: colCfg, reader: fixedReader(rows1).reader, limit: 2 });
    const b = await runSource({ config: colCfg, reader: fixedReader(rows2).reader, limit: 2 });
    check(J(a) === J(b), `C7 deterministik`);
  }
  {
    const { reader } = fixedReader([
      { id: SID1, tenant_id: TENANT_A, content: "a" },
      { id: 123, tenant_id: TENANT_A, content: "b" }, // son satır geçersiz id
    ]);
    const r = await runSource({ config: colCfg, reader, limit: 2 });
    check(r.hasMore === true && r.nextCursor === SID1, `C8 fallback cursor=${r.nextCursor}`);
  }
  {
    const { reader } = fixedReader([{ id: 999, tenant_id: TENANT_A, content: "a" }]); // dolu sayfa, geçerli id yok
    const r = await runSource({ config: colCfg, reader, limit: 1 });
    check(r.hasMore === false && r.nextCursor === null, `C9 cursor üretilemez → güvenli dur`);
  }

  // ═══ GRUP D — hata izolasyonu (6) ══════════════════════════════════════════
  {
    const { reader } = fixedReader([
      { id: SID1, tenant_id: "bad", content: "a" },
      { id: SID2, tenant_id: TENANT_A, content: "b" },
    ]);
    const r = await runSource({ config: colCfg, reader });
    check(r.summary.skipped === 1 && r.units.length === 1 && r.failed === 0, `D1 skip batch'i durdurmaz`);
  }
  {
    const throwing: Row = { id: SID1, content: "a" };
    Object.defineProperty(throwing, "tenant_id", { enumerable: true, get() { throw new Error("boom"); } });
    const { reader } = fixedReader([throwing, { id: SID2, tenant_id: TENANT_A, content: "b" }]);
    const r = await runSource({ config: colCfg, reader });
    check(r.failed === 1 && r.units.length === 1 && r.units[0].sourceId === SID2, `D2 exception→failed, sonraki işlenir (failed=${r.failed})`);
  }
  {
    let threw = false;
    try { await runSource({ config: colCfg, reader: rejectingReader() }); } catch { threw = true; }
    check(threw, `D3 source reader reject propagate`);
  }
  {
    let threw = false;
    const { reader } = fixedReader([{ id: SID1, parent_id: PID, content: "a" }]);
    try { await runSource({ config: joinCfg, reader, parentReader: rejectingParentReader() }); } catch { threw = true; }
    check(threw, `D4 parent reader reject propagate`);
  }
  {
    let threw = false;
    const { reader } = fixedReader([{ id: SID1, parent_id: PID, content: "a" }]);
    try { await runSource({ config: joinCfg, reader }); } catch { threw = true; }
    check(threw, `D5 join zorunlu parentReader eksik → açık hata`);
  }
  {
    const { reader } = fixedReader([{ id: SID1, tenant_id: TENANT_A, content: "gizli" }]);
    const r = await runSource({ config: colCfg, reader });
    const keys = Object.keys(r).sort().join(",");
    check(keys === "failed,fetched,hasMore,nextCursor,parentStats,sourceKey,summary,units", `D6 sonuç şekli (ham row sızıntısı yok) keys=${keys}`);
  }

  // ═══ GRUP E — sonuç + istatistik (7) ═══════════════════════════════════════
  {
    const { reader } = fixedReader([
      { id: SID1, parent_id: PID, content: "a" },  // unit
      { id: SID2, parent_id: PID2, content: "b" }, // missing parent → skip
      { id: SID3, parent_id: PID, content: "c" },  // unit (PID dup)
    ]);
    const pr = fixedParentReader({ [PID]: PARENT_T }); // PID2 yok
    const r = await runSource({ config: joinCfg, reader, parentReader: pr.reader, limit: 3 });
    check(r.sourceKey === "test:join", `E sourceKey=${r.sourceKey}`);
    check(r.fetched === 3, `E fetched=${r.fetched}`);
    check(r.units.length === 2, `E units=${r.units.length}`);
    check(r.summary.units === 2 && r.summary.skipped === 1, `E summary ${J(r.summary)}`);
    check(r.failed === 0, `E failed=${r.failed}`);
    check(r.hasMore === true && r.nextCursor === SID3, `E cursor=${r.nextCursor}`);
    check(r.parentStats.requested === 2 && r.parentStats.found === 1 && r.parentStats.missing === 1, `E parentStats ${J(r.parentStats)}`);
  }

  // ═══ GRUP F — değişmezlik (4) ══════════════════════════════════════════════
  {
    const row1: Row = { id: SID1, tenant_id: TENANT_A, content: "a", tags: ["x", "y"] };
    const rows: Row[] = [row1];
    const rowSnap = J(row1);
    const rowsSnap = J(rows);
    const cfgSnap = J(colCfg);
    await runSource({ config: colCfg, reader: fixedReader(rows).reader, limit: 5 });
    check(J(row1) === rowSnap, `F1 row mutation yok`);
    check(J(colCfg) === cfgSnap, `F2 config mutation yok`);
    check(J(rows) === rowsSnap, `F4 input array mutation yok`);
  }
  {
    const map = parentMapOf({ [PID]: PARENT_T });
    const mapSnap = J([...map.entries()]);
    const pr: ParentTenantReader = { readParentTenants: async () => map };
    const { reader } = fixedReader([{ id: SID1, parent_id: PID, content: "a" }]);
    await runSource({ config: joinCfg, reader, parentReader: pr });
    check(J([...map.entries()]) === mapSnap, `F3 parent map mutation yok`);
  }

  // ── Sonuç ───────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error("S2.09 runSource harness — BAŞARISIZ:");
    for (const e of errors) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log("S2.09 runSource harness — saf/fake-port; DB'siz.");
  console.log("");
  console.log(`CHECK: ${total} kontrol OK (A column 4 + B join 8 + C pagination 13 + D hata 6 + E sonuç 7 + F değişmez 4).`);
  console.log("- keyset cursor: rows<limit→son sayfa; rows==limit→hasMore+son geçerli id; geçersiz id fallback/güvenli dur");
  console.log("- limit normalizasyon: default 200, cap 500, geçersiz→200 (throw yok)");
  console.log("- join parent preload: distinct FK, sayfa-başı tek çağrı, boş FK→çağrı yok, eksik parent→skip");
  console.log("- hata izolasyonu: satır exception→failed++, sonraki işlenir; reader/parentReader reject→propagate; join zorunlu parentReader eksik→açık hata");
  console.log("- S2.08 runIndexUnit/summarizeRunResults reuse; mutation YOK; ham row/içerik sonuca konmaz");
}

main().catch((e) => {
  console.error("S2.09 harness — beklenmeyen üst-seviye hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
