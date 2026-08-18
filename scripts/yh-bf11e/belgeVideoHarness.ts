/**
 * BF-11E — BELGE/VİDEO SOURCE RETIREMENT HARNESS (PASS/BLOCKED).
 *
 * ÜRÜN KARARI: Dijital İçerik Merkezi belge/video/ders-notu işleme alanı Yaşam Hafızası SOURCE
 * DEĞİLDİR (transient workspace). belge_video:passages source registry/activation/matrix'ten
 * ÇIKARILDI. PR#128 join+row REUSABLE indexer/worker yeteneği KORUNUR (generic). Production/DB YOK.
 *   npm run yh:bf11e:belge:harness
 */
import { readFileSync } from "node:fs";
import { join as pjoin } from "node:path";
import {
  indexSourcePage,
  type IndexSourcePageResult,
} from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import type { IndexDbClient } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { createSupabaseIndexDeindexer } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { runIndexUnit } from "@/lib/yasam-hafizasi/indexer/runIndexUnit";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { YH_SOURCE_MODULES } from "@/lib/yasam-hafizasi/config";
import {
  YH_ACTIVATION_MATRIX,
  validateActivationMatrix,
  sourceKeysByCohort,
  activationEntryOf,
} from "@/lib/yasam-hafizasi/activation/activationMatrix";
import { YH_MODULE_SOURCE_MATRIX, validateModuleSourceMatrix } from "@/lib/yasam-hafizasi/moduleSourceMatrix";
import {
  YH_DEFERRED_SOURCE_CLOSURE,
  validateDeferredClosure,
  wiredDormantRegistryKeys,
  expectedFoundationTables,
} from "@/lib/yasam-hafizasi/deferredSourceClosure";
import type { ParentTenantLookup } from "@/lib/yasam-hafizasi/indexer/tenantResolve";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const PID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const FK = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const TEN = "11111111-1111-4111-1111-111111111111";

function mockDb(tableData: Record<string, Record<string, unknown>[]>, upserts: Record<string, unknown>[]): IndexDbClient {
  const make = (table: string): unknown => {
    const b: Record<string, unknown> = {};
    const chain = (): unknown => b;
    b.select = chain; b.eq = chain; b.gt = chain; b.in = chain; b.order = chain; b.limit = chain;
    b.upsert = (rows: readonly Record<string, unknown>[]) => { upserts.push(...rows); return Promise.resolve({ error: null }); };
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tableData[table] ?? [], error: null }).then(resolve);
    return b;
  };
  return { from: (t: string) => make(t) as never };
}

// GENERIC join+row source (belge_video DEĞİL) — PR#128 reusable capability'yi kanıtlamak için.
const synthJoinRow: SourceConfig = {
  sourceKey: "synthetic:rows", classification: "safe-non-pii", sourceFamily: "dogaltas",
  tableName: "synthetic_rows", primaryKey: "id", unit: "row",
  tenant: { mode: "join", fkColumn: "parent_id", parentTable: "synthetic_parents", parentTenantColumn: "tenant_id" },
  titleColumns: [], searchTextColumns: ["body"], snippetColumns: ["body"], topicTagsColumns: [], relationColumns: [],
  updatedAtColumn: null, activeColumn: null, enabled: true,
};

async function run(): Promise<void> {
// ═══ A) belge_video:passages ARTIK SOURCE DEĞİL (registry/matrix/plan'dan çıkarıldı) ═══
{
  add("A-not-in-index-sources", !YH_INDEX_SOURCES.some((s) => (s.sourceKey as string) === "belge_video:passages"));
  add("A-no-belge-family-source", !YH_INDEX_SOURCES.some((s) => (s.sourceFamily as string) === "belge_video"));
  add("A-family-modules-exclude-belge", !(YH_SOURCE_MODULES as readonly string[]).includes("belge_video"));
  add("A-not-in-activation-matrix", !YH_ACTIVATION_MATRIX.some((e) => e.sourceKey === "belge_video:passages"));
  add("A-activation-entry-of-null", activationEntryOf("belge_video:passages") === undefined);
  add("A-no-belge-table-in-matrix", !YH_ACTIVATION_MATRIX.some((e) => e.sourceTable === "yh_document_passages"));
}

// ═══ B) MODEL TUTARLILIĞI (NOT_MEMORY_SOURCE + NOT_APPLICABLE) ═══
{
  let ok = true, detail = "";
  try { validateActivationMatrix(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("B-activation-matrix-validate", ok, detail);
  try { validateModuleSourceMatrix(); } catch (e) { add("B-module-matrix-validate", false, (e as Error).message); }
  if (!checks.some((c) => c.name === "B-module-matrix-validate")) add("B-module-matrix-validate", true);
  try { validateDeferredClosure(); } catch (e) { add("B-closure-validate", false, (e as Error).message); }
  if (!checks.some((c) => c.name === "B-closure-validate")) add("B-closure-validate", true);

  const belgeMod = YH_MODULE_SOURCE_MATRIX.find((m) => m.moduleKey === "belge_video");
  add("B-module-not-memory-source", belgeMod?.classification === "NOT_MEMORY_SOURCE" && belgeMod.professionalSourceKeys.length === 0 && belgeMod.clientSourceKeys.length === 0);
  const belgeDom = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "belge_video_ingestion");
  add("B-closure-not-applicable", belgeDom?.result === "NOT_APPLICABLE" && belgeDom.registrySourceKeys.length === 0);
  add("B-closure-product-decision-documented", /PRODUCT_DECISION_NON_SOURCE|transient/i.test(belgeDom?.productDecision ?? ""));
  // wiredDormant artık yalnız YEBS (6); belge çıktı.
  add("B-wired-dormant-only-yebs-6", wiredDormantRegistryKeys().length === 6 && wiredDormantRegistryKeys().every((k) => k.startsWith("yebs:")));
  // Foundation tabloları closure'da CLEANUP-CANDIDATE olarak kayıtlı kalır (DROP yok).
  add("B-foundation-tables-recorded", expectedFoundationTables().includes("yh_document_sources") && expectedFoundationTables().includes("yh_document_passages"));
}

// ═══ C) SOURCE INVENTORY COUNTS (belge çıktıktan sonra) ═══
{
  add("C-professional-registry-27", YH_INDEX_SOURCES.length === 27, String(YH_INDEX_SOURCES.length));
  add("C-live-professional-19", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 19);
  add("C-dormant-professional-8", YH_INDEX_SOURCES.filter((s) => s.enabled === false).length === 8, String(YH_INDEX_SOURCES.filter((s) => s.enabled === false).length));
  add("C-activation-matrix-33", YH_ACTIVATION_MATRIX.length === 33, String(YH_ACTIVATION_MATRIX.length));
  add("C-family-modules-8", (YH_SOURCE_MODULES as readonly string[]).length === 8, String((YH_SOURCE_MODULES as readonly string[]).length));
}

// ═══ D) NO QUERY/SEARCH/FILTER/RECONCILE/CDC SOURCE PATH ═══
{
  // Activation matrisinde belge yok → activation/preflight/backfill/reconcile source path yok.
  add("D-no-cohort-belge", !sourceKeysByCohort("COHORT_1_BLOCKED").includes("belge_video:passages") && !sourceKeysByCohort("COHORT_2").includes("belge_video:passages"));
  add("D-no-passages-source-key-anywhere", !YH_ACTIVATION_MATRIX.some((e) => e.sourceKey.startsWith("belge_video")));
  // enabled:true belge = 0 (registry'de yok).
  add("D-belge-enabled-true-zero", YH_INDEX_SOURCES.filter((s) => s.sourceKey.startsWith("belge_video") && s.enabled === true).length === 0);
}

// ═══ E) PR#128 REUSABLE CAPABILITY KORUNDU (generic join+row; revert YOK) ═══
{
  const pl: ParentTenantLookup = () => ({ found: true, tenantId: TEN });
  const row = { id: PID, parent_id: FK, body: "generic join+row içerik" };
  const r = runIndexUnit({ config: synthJoinRow, row, parentLookup: pl });
  add("E-runindexunit-join-row-unit", r.status === "unit" && r.unit.sourceId === PID && r.unit.tenantId === TEN);
  // exact-write join yolu (mock DB) hâlâ çalışır.
  const up: Record<string, unknown>[] = [];
  const res = await indexSourcePage({
    config: synthJoinRow, mode: "write", exactSourceId: PID, expectedTenantId: TEN,
    db: mockDb({ synthetic_rows: [row], synthetic_parents: [{ id: FK, tenant_id: TEN }] }, up),
  }) as IndexSourcePageResult;
  add("E-exact-join-row-write-ok", res.exactStatus === "ok" && up.length === 1, `status=${res.exactStatus}`);
  // deindexer join+row hâlâ desteklenir (revert edilmedi).
  const d = await createSupabaseIndexDeindexer({ deleteRows: async () => ({ error: false, count: 1 }) }).deindex({ config: synthJoinRow, sourceId: PID, tenantId: TEN });
  add("E-deindex-join-row-ok", d.status === "ok");
}

// ═══ F) RETIREMENT MIGRATION STATIC ═══
{
  const MIG = readFileSync(pjoin(process.cwd(), "supabase/migrations/20260930000000_yh_belge_video_cdc_retirement.sql"), "utf8");
  const EXEC = MIG.replace(/--.*$/gm, "");
  const has = (re: RegExp) => re.test(MIG);
  add("F-drops-trigger", has(/DROP TRIGGER IF EXISTS yh_cdc_yh_document_passages_trg ON public\.yh_document_passages/));
  add("F-no-activation-seed", !/INSERT\s+INTO\s+public\.yh_source_activation/i.test(EXEC));
  add("F-no-is-active-true", !/is_active\s*=\s*true/i.test(EXEC));
  add("F-no-backfill", !/backfill/i.test(EXEC));
  add("F-no-source-index-dml", !/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(yh_document_passages|yh_document_sources|yasam_hafizasi_index|yh_source_activation)/i.test(EXEC));
  add("F-no-historical-scan", !/SELECT[\s\S]*FROM\s+public\.yh_document_passages/i.test(EXEC));
  add("F-no-drop-table", !/DROP\s+TABLE|TRUNCATE/i.test(EXEC));
  add("F-preserves-cdc-function", !/DROP\s+FUNCTION[\s\S]*yh_cdc_enqueue/i.test(EXEC));
  add("F-single-transaction", has(/^BEGIN;/m) && has(/^COMMIT;/m));
  add("F-original-trigger-migration-preserved", (() => { try { readFileSync(pjoin(process.cwd(), "supabase/migrations/20260929000000_yh_belge_video_cdc_trigger.sql"), "utf8"); return true; } catch { return false; } })());
}

// ═══ G) KEEP_LIVE / PERSONAL ARCHIVE / OTHER SOURCES UNCHANGED ═══
{
  add("G-live-professional-19", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 19);
  // Personal Archive BF-11E ROW-GATED CONTROLLED'a graduate (safe-non-pii + requiresRowEligibilityGate).
  const arc = YH_INDEX_SOURCES.find((s) => s.sourceKey === "kisisel_arsiv:archives") as SourceConfig | undefined;
  add("G-personal-archive-row-gated", arc?.classification === "safe-non-pii" && arc?.requiresRowEligibilityGate === true && arc?.enabled === true);
  add("G-archive-cohort-controlled", activationEntryOf("kisisel_arsiv:archives")?.activationClass === "ROW_GATED_CONTROLLED");
  // YEBS/client/Numerology durumları.
  add("G-yebs-6-dormant", YH_INDEX_SOURCES.filter((s) => s.sourceKey.startsWith("yebs:")).length === 6 && YH_INDEX_SOURCES.filter((s) => s.sourceKey.startsWith("yebs:")).every((s) => s.enabled === false));
  add("G-numerology-2-dormant", YH_INDEX_SOURCES.filter((s) => s.sourceKey.startsWith("numeroloji:")).length === 2);
  const numClient = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "numeroloji_client_id");
  add("G-numerology-client-hard-blocker", numClient?.result === "DEFERRED_HARD_BLOCKER");
}

}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-11E BELGE/VIDEO RETIREMENT HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

run().then(main);
