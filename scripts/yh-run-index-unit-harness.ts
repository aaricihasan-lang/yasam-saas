// Yaşam Hafızası™ — S2.08 runIndexUnit + makeParentTenantLookup izole harness (saf, DB'siz).
//
// runIndexUnit({config,row,parentLookup}) → RunIndexUnitResult orkestrasyonunu ve
// makeParentTenantLookup(map) saf adapter'ını doğrular. GERÇEK fonksiyonlar import
// edilir (kopya/taklit YOK). Kontrollü minimal fixture config'ler kullanılır.
// DB / IO / env / network YOK. Saf → deterministik.
// Çalıştırma:  npx tsx scripts/yh-run-index-unit-harness.ts

import {
  makeParentTenantLookup,
  parentTenantMapKey,
  type ParentTenantMap,
} from "../lib/yasam-hafizasi/indexer/parentTenantLookup";
import {
  runIndexUnit,
  summarizeRunResults,
  type RunIndexUnitResult,
} from "../lib/yasam-hafizasi/indexer/runIndexUnit";
import type { SourceConfig } from "../lib/yasam-hafizasi/indexer/sources";
import type {
  ParentTenantLookup,
  ParentTenantLookupInput,
} from "../lib/yasam-hafizasi/indexer/tenantResolve";

const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  if (!cond) errors.push(msg);
}
function j(v: unknown): string {
  return JSON.stringify(v);
}

// ── Sabitler (geçerli UUID'ler) ──────────────────────────────────────────────
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const PID = "22222222-2222-2222-2222-222222222222";
const PARENT_TENANT = "33333333-3333-3333-3333-333333333333";
const SID = "44444444-4444-4444-4444-444444444444";
const PID2 = "55555555-5555-5555-5555-555555555555";
const OTHER_TENANT = "66666666-6666-6666-6666-666666666666";
const HEX64 = /^[0-9a-f]{64}$/;

// ── Fixture config'ler (kontrollü; gerçek SourceConfig şekli) ─────────────────
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
const colSharedCfg: SourceConfig = {
  ...colCfg,
  sourceKey: "test:col-shared",
  tenant: { mode: "column", column: "tenant_id", allowSharedNull: true },
};
const sectionColCfg: SourceConfig = {
  ...colCfg,
  sourceKey: "test:section-col",
  unit: "section",
};
const joinCfg: SourceConfig = {
  sourceKey: "test:join",
  classification: "safe-non-pii", // BF-0 zorunlu alan (test config)
  sourceFamily: "aromaterapi",
  tableName: "test_join",
  primaryKey: "id",
  unit: "row",
  tenant: {
    mode: "join",
    fkColumn: "parent_id",
    parentTable: "test_parent",
    parentTenantColumn: "tenant_id",
  },
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

// Hazır parent → tenant map'i (S2.09'da DB'den dolar; burada elle).
const parentMap: ParentTenantMap = new Map<string, string | null>([
  [parentTenantMapKey("test_parent", PID), PARENT_TENANT],
  [parentTenantMapKey("test_parent", PID2), OTHER_TENANT],
]);
const sharedParentMap: ParentTenantMap = new Map<string, string | null>([
  [parentTenantMapKey("test_parent", PID), null],
]);
const lookup = makeParentTenantLookup(parentMap);
const sharedLookup = makeParentTenantLookup(sharedParentMap);
const emptyLookup = makeParentTenantLookup(new Map());

// Sonuç dar-tipleme yardımcıları.
function isUnit(r: RunIndexUnitResult): r is Extract<RunIndexUnitResult, { status: "unit" }> {
  return r.status === "unit";
}
function skipInfo(r: RunIndexUnitResult): string {
  return r.status === "skipped" ? `${r.skip.stage}:${r.skip.reason}` : "(unit)";
}

// ═══ GRUP A — runIndexUnit orkestrasyon (16) ═════════════════════════════════

// 1) column tenant başarı → unit
{
  const r = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: TENANT_A, content: "abc" } });
  check(isUnit(r) && r.unit.tenantId === TENANT_A, `A1 column başarı beklenir → ${skipInfo(r)}`);
}
// 2) column null + allowSharedNull true → unit (shared)
{
  const r = runIndexUnit({ config: colSharedCfg, row: { id: SID, tenant_id: null, content: "abc" } });
  check(isUnit(r) && r.unit.tenantId === null, `A2 column shared unit beklenir → ${skipInfo(r)}`);
}
// 3) column null + allowSharedNull false → skip tenant:shared-not-allowed
{
  const r = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: null, content: "abc" } });
  check(skipInfo(r) === "tenant:shared-not-allowed", `A3 → ${skipInfo(r)}`);
}
// 4) column missing tenant → skip tenant:missing-tenant
{
  const r = runIndexUnit({ config: colCfg, row: { id: SID, content: "abc" } });
  check(skipInfo(r) === "tenant:missing-tenant", `A4 → ${skipInfo(r)}`);
}
// 5) column invalid tenant → skip tenant:invalid-tenant
{
  const r = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: "not-a-uuid", content: "abc" } });
  check(skipInfo(r) === "tenant:invalid-tenant", `A5 → ${skipInfo(r)}`);
}
// 6) join tenant başarı (map ile) → unit
{
  const r = runIndexUnit({ config: joinCfg, row: { id: SID, parent_id: PID, content: "abc" }, parentLookup: lookup });
  check(isUnit(r) && r.unit.tenantId === PARENT_TENANT, `A6 join başarı beklenir → ${skipInfo(r)}`);
}
// 7) join parent bulunamadı → skip tenant:parent-not-found
{
  const r = runIndexUnit({ config: joinCfg, row: { id: SID, parent_id: PID, content: "abc" }, parentLookup: emptyLookup });
  check(skipInfo(r) === "tenant:parent-not-found", `A7 → ${skipInfo(r)}`);
}
// 8) join parentLookup yok → skip tenant:missing-parent-lookup
{
  const r = runIndexUnit({ config: joinCfg, row: { id: SID, parent_id: PID, content: "abc" } });
  check(skipInfo(r) === "tenant:missing-parent-lookup", `A8 → ${skipInfo(r)}`);
}
// 9) join missing fk → skip tenant:missing-fk
{
  const r = runIndexUnit({ config: joinCfg, row: { id: SID, content: "abc" }, parentLookup: lookup });
  check(skipInfo(r) === "tenant:missing-fk", `A9 → ${skipInfo(r)}`);
}
// 10) join invalid fk → skip tenant:invalid-fk
{
  const r = runIndexUnit({ config: joinCfg, row: { id: SID, parent_id: "bad", content: "abc" }, parentLookup: lookup });
  check(skipInfo(r) === "tenant:invalid-fk", `A10 → ${skipInfo(r)}`);
}
// 11) join parent null + allowSharedNull true → unit (shared)
{
  const r = runIndexUnit({ config: joinSharedCfg, row: { id: SID, parent_id: PID, content: "abc" }, parentLookup: sharedLookup });
  check(isUnit(r) && r.unit.tenantId === null, `A11 join shared unit beklenir → ${skipInfo(r)}`);
}
// 12) join parent null + allowSharedNull false → skip tenant:shared-not-allowed
{
  const r = runIndexUnit({ config: joinCfg, row: { id: SID, parent_id: PID, content: "abc" }, parentLookup: sharedLookup });
  check(skipInfo(r) === "tenant:shared-not-allowed", `A12 → ${skipInfo(r)}`);
}
// 13) geçerli tenant + sourceId yok → skip build:build-null
{
  const r = runIndexUnit({ config: colCfg, row: { tenant_id: TENANT_A, content: "abc" } });
  check(skipInfo(r) === "build:build-null", `A13 → ${skipInfo(r)}`);
}
// 14) section + column tenant → group_key yok → skip build:build-null
{
  const r = runIndexUnit({ config: sectionColCfg, row: { id: SID, tenant_id: TENANT_A, content: "abc" } });
  check(skipInfo(r) === "build:build-null", `A14 → ${skipInfo(r)}`);
}
// 15) sıfır-kanıt (extracted boş) → skip build:build-null
{
  const r = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: TENANT_A } });
  check(skipInfo(r) === "build:build-null", `A15 → ${skipInfo(r)}`);
}
// 16) tam geçerli uçtan uca → unit + alanlar + contentHash 64-hex
{
  const r = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: TENANT_A, title: "Başlık", content: "abc" } });
  check(isUnit(r), `A16 unit beklenir → ${skipInfo(r)}`);
  if (isUnit(r)) {
    check(r.unit.sourceId === SID, `A16 sourceId → ${r.unit.sourceId}`);
    check(r.unit.groupKey === `test:col:${SID}`, `A16 groupKey → ${r.unit.groupKey}`);
    check(r.unit.title === "Başlık", `A16 title → ${j(r.unit.title)}`);
    check(HEX64.test(r.unit.contentHash), `A16 contentHash 64-hex → ${r.unit.contentHash}`);
  }
}

// ═══ GRUP B — makeParentTenantLookup (6) ═════════════════════════════════════

// 17) bulunan tenant → {found:true, tenantId}
{
  const res = lookup({ parentTable: "test_parent", parentId: PID, parentTenantColumn: "tenant_id" });
  check(res.found === true && res.tenantId === PARENT_TENANT, `B17 → ${j(res)}`);
}
// 18) bulunan shared (null) → {found:true, tenantId:null}
{
  const res = sharedLookup({ parentTable: "test_parent", parentId: PID, parentTenantColumn: "tenant_id" });
  check(res.found === true && res.tenantId === null, `B18 → ${j(res)}`);
}
// 19) bulunamayan → {found:false}
{
  const res = emptyLookup({ parentTable: "test_parent", parentId: PID, parentTenantColumn: "tenant_id" });
  check(res.found === false, `B19 → ${j(res)}`);
}
// 20) cache: aynı parent map'ten deterministik tek-kaynak (tekrarlı çağrı aynı sonuç, tek giriş)
{
  const single: ParentTenantMap = new Map([[parentTenantMapKey("test_parent", PID), PARENT_TENANT]]);
  const l = makeParentTenantLookup(single);
  const inp: ParentTenantLookupInput = { parentTable: "test_parent", parentId: PID, parentTenantColumn: "tenant_id" };
  const a = l(inp), b = l(inp), c = l(inp);
  check(
    a.found && b.found && c.found && a.tenantId === PARENT_TENANT && j(a) === j(b) && j(b) === j(c) && single.size === 1,
    `B20 tek-kaynak tekrarlı çözümleme → ${j([a, b, c])} size=${single.size}`,
  );
}
// 21) farklı parent id → ayrı sonuç (biri bulunur, biri bulunmaz)
{
  const found = lookup({ parentTable: "test_parent", parentId: PID, parentTenantColumn: "tenant_id" });
  const missing = lookup({ parentTable: "test_parent", parentId: "99999999-9999-9999-9999-999999999999", parentTenantColumn: "tenant_id" });
  check(found.found === true && missing.found === false, `B21 → ${j([found, missing])}`);
}
// 22) eksik key'de exception yok
{
  let threw = false;
  try {
    emptyLookup({ parentTable: "x", parentId: "y", parentTenantColumn: "z" });
  } catch {
    threw = true;
  }
  check(!threw, "B22 eksik key throw etmemeli");
}

// ═══ GRUP C — değişmezler (4) ═════════════════════════════════════════════════

// 23) row/config mutation yok
{
  const row = { id: SID, tenant_id: TENANT_A, title: "T", content: "abc", tags: ["a", "b"] };
  const rowSnap = JSON.parse(JSON.stringify(row));
  const cfgSnap = JSON.parse(JSON.stringify(colCfg));
  runIndexUnit({ config: colCfg, row });
  check(j(row) === j(rowSnap), "C23 row mutate edilmemeli");
  check(j(colCfg) === j(cfgSnap), "C23 config mutate edilmemeli");
}
// 24) bozuk/garbage row → exception yok, yapılandırılmış sonuç
{
  let threw = false;
  let r: RunIndexUnitResult | null = null;
  try {
    r = runIndexUnit({ config: colCfg, row: { id: 123 as unknown as string, tenant_id: {} as unknown, content: [] as unknown } });
  } catch {
    threw = true;
  }
  check(!threw && r !== null && (r.status === "unit" || r.status === "skipped"), "C24 garbage row throw etmemeli, sonuç dönmeli");
}
// 25) tenant sızıntısı yok: her parent KENDİ tenant'ını alır (PID→PARENT_TENANT, PID2→OTHER_TENANT)
{
  const rA = runIndexUnit({ config: joinCfg, row: { id: SID, parent_id: PID, content: "abc" }, parentLookup: lookup });
  const rB = runIndexUnit({ config: joinCfg, row: { id: SID, parent_id: PID2, content: "abc" }, parentLookup: lookup });
  const tA: string | null = isUnit(rA) ? rA.unit.tenantId : null;
  const tB: string | null = isUnit(rB) ? rB.unit.tenantId : null;
  check(tA === PARENT_TENANT && tB === OTHER_TENANT, `C25 tenant sızıntısı → A=${tA} B=${tB}`);
}
// 26) extracted topicTags sırası korunur
{
  const r = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: TENANT_A, tags: ["beta", "alfa", "gama"] } });
  check(isUnit(r) && j(r.unit.topicTags) === j(["beta", "alfa", "gama"]), `C26 sıra → ${isUnit(r) ? j(r.unit.topicTags) : skipInfo(r)}`);
}

// ═══ GRUP D — özet + hata izolasyonu (2) ═════════════════════════════════════

// 27) summarizeRunResults doğru sayar
{
  const results: RunIndexUnitResult[] = [
    runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: TENANT_A, content: "abc" } }), // unit
    runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: "bad", content: "abc" } }), // tenant:invalid-tenant
    runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: TENANT_A } }), // build:build-null
  ];
  const s = summarizeRunResults(results);
  check(
    s.units === 1 && s.skipped === 2 && s.byReason["tenant:invalid-tenant"] === 1 && s.byReason["build:build-null"] === 1,
    `D27 özet → ${j(s)}`,
  );
}
// 28) hata izolasyonu: bir kaydın skip'i sonrakini durdurmaz (bağımsız sonuçlar)
{
  const bad = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: "bad", content: "abc" } });
  const good = runIndexUnit({ config: colCfg, row: { id: SID, tenant_id: TENANT_A, content: "abc" } });
  check(bad.status === "skipped" && good.status === "unit", `D28 izolasyon → bad=${skipInfo(bad)} good=${good.status}`);
}

// ── Sonuç ─────────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error("S2.08 runIndexUnit harness — BAŞARISIZ:");
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("S2.08 runIndexUnit + makeParentTenantLookup harness — saf/DB'siz.");
console.log("");
console.log("CHECK: 28 senaryo OK (Grup A orkestrasyon 16 + B lookup 6 + C değişmez 4 + D özet/izolasyon 2).");
console.log("- tenant fail-closed: kesin TenantResolveFailureReason skip'e taşınır");
console.log("- build null: opak build-null (buildCandidate iç sözleşmesi yeniden türetilmez)");
console.log("- join: parent map cache; parent-not-found/missing-fk/invalid-fk/missing-parent-lookup ayrımı");
console.log("- shared-null yalnız allowSharedNull=true (column+join)");
console.log("- makeParentTenantLookup: found/shared/not-found; eksik key throw yok; tenant sızıntısı yok");
console.log("- mutation YOK; garbage row exception YOK; extracted sıra korunur; özet doğru sayar");
