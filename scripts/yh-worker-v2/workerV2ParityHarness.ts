/**
 * YAŞAM HAFIZASI™ — WORKER V2: SHARED + SECTION + PARENT-DERIVED PARITY HARNESS (PASS/BLOCKED).
 * =========================================================================
 *
 * 5 deferred professional kaynağın Worker-v2 capability ile GERÇEK event-driven parity kazandığını
 * SAF (DB/network YOK; satırlar düz nesne) + DETERMİNİSTİK (Date.now/random YOK) doğrular:
 *   A dogaltas:knowledge  B aromaterapi:oils  C aromaterapi:reference-sheets
 *   D aromaterapi:reference-rows (parent-derived)  E sifa_rehberi:guide-sections (unit=section)
 *
 * GERÇEK processOutboxEvent yolu kullanılır (isolation-only YETERSİZ; §11). Kapsam:
 *   - tenant upsert / shared upsert / section event / update-refresh / delete / defensiveDeindex
 *   - unsupported (YEBS global-canonical, capability'siz allowSharedNull, capability'siz non-record) FAIL-CLOSED
 *   - capability model + activation reclassification + migration static contract
 *
 *   npm run yh:worker-v2:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  processOutboxEvent,
  type EventProcessorDeps,
  type ProcessDirective,
} from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import { YH_INDEX_SOURCES, hasWorkerCapability, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import type { ClaimedOutboxEvent } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import type { IndexSourcePageResult } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import type { DeindexResult } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import {
  YH_ACTIVATION_MATRIX,
  activationEntryOf,
  resolveProcessingActive,
  assessCohort,
  sourceKeysByClass,
} from "@/lib/yasam-hafizasi/activation/activationMatrix";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const SID = "44444444-4444-4444-4444-444444444444";
const EV = "33333333-3333-4333-8333-333333333333";

const cfg = (key: string): SourceConfig => {
  const c = YH_INDEX_SOURCES.find((s) => s.sourceKey === key);
  if (!c) throw new Error(`registry kaynağı yok: ${key}`);
  return c as SourceConfig;
};

// ── 5 Worker-v2 kaynak → tablo + beklenen davranış ────────────────────────────
const FIVE: Record<string, string> = {
  "dogaltas:knowledge": "stone_knowledge_articles",
  "aromaterapi:oils": "aromatherapy_oils",
  "aromaterapi:reference-sheets": "aromatherapy_reference_sheets",
  "aromaterapi:reference-rows": "aromatherapy_reference_rows",
  "sifa_rehberi:guide-sections": "healing_guide_sections",
};
const FIVE_KEYS = Object.keys(FIVE);
const SHARED_CAPABLE = ["dogaltas:knowledge", "aromaterapi:oils", "aromaterapi:reference-sheets", "aromaterapi:reference-rows"];
const PARENT_DERIVED = ["aromaterapi:reference-rows", "sifa_rehberi:guide-sections"];

// eventProcessor deps: upsert 'ok' + deindex 'ok' + aktivasyon aktif; runExactUpsert exactStatus/write döner.
const deps = (
  key: string,
  over?: Partial<{ exactStatus: string; deindex: DeindexResult }>,
): EventProcessorDeps => ({
  resolveConfig: (k) => (k === key ? cfg(key) : null),
  runExactUpsert: async () =>
    ({ exactStatus: over?.exactStatus ?? "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
  deindex: async () => over?.deindex ?? ({ status: "ok" } as DeindexResult),
  isSourceProcessingActive: async () => true,
});
const ev = (key: string, op: "upsert" | "delete", tenantId: string | null, table?: string): ClaimedOutboxEvent => ({
  id: EV, sourceKey: key, sourceTable: table ?? cfg(key).tableName, sourceId: SID, tenantId,
  operation: op, attempts: 1, eventVersion: 1,
} as ClaimedOutboxEvent);
const SYN = "synthetic_table";
const isComplete = (d: ProcessDirective): boolean => d.action === "complete";
const isPermanent = (d: ProcessDirective, code: string): boolean =>
  d.action === "fail" && (d as { retryClass?: string }).retryClass === "permanent" && (d as { code?: string }).code === code;

// Synthetic config (registry DIŞI) — capability'siz unsupported fail-closed testleri için.
const fakeConfig = (over: Partial<SourceConfig>): SourceConfig =>
  ({
    classification: "safe-non-pii", sourceKey: "synthetic:test", sourceFamily: "dogaltas",
    tableName: "synthetic_table", primaryKey: "id", unit: "record",
    tenant: { mode: "column", column: "tenant_id" }, titleColumns: ["t"], searchTextColumns: ["t"],
    snippetColumns: [], topicTagsColumns: [], relationColumns: [], updatedAtColumn: null,
    activeColumn: null, enabled: true, ...over,
  } as SourceConfig);

async function run(): Promise<void> {
// ═══ A) CAPABILITY MODEL (registry) ═══════════════════════════════════════════
{
  add("A-five-in-registry", FIVE_KEYS.every((k) => cfg(k).tableName === FIVE[k]));
  add("A-shared-capable-4", SHARED_CAPABLE.every((k) => hasWorkerCapability(cfg(k), "shared-optional-professional")));
  add("A-section-capable-guide-sections", hasWorkerCapability(cfg("sifa_rehberi:guide-sections"), "section-unit"));
  add("A-parent-derived-2", PARENT_DERIVED.every((k) => hasWorkerCapability(cfg(k), "parent-derived-scope")));
  // guide-sections SHARED DEĞİL (allowSharedNull yok) — yalnız section + parent-derived.
  add("A-guide-sections-not-shared", !hasWorkerCapability(cfg("sifa_rehberi:guide-sections"), "shared-optional-professional"));
  // Capability yalnız bu 5 kaynakta (başka kaynağa sızmadı).
  const withCap = (YH_INDEX_SOURCES as readonly SourceConfig[]).filter((s) => Array.isArray(s.workerCapabilities) && s.workerCapabilities.length > 0).map((s) => s.sourceKey).sort();
  add("A-capability-only-on-5", JSON.stringify(withCap) === JSON.stringify([...FIVE_KEYS].sort()), withCap.join(","));
}

// ═══ B) REAL processOutboxEvent — SUPPORTED (0 permanent reject) ══════════════
{
  // Tenant upsert + delete (hepsi): tenant-scoped olay kabul.
  const tenantResults = await Promise.all(FIVE_KEYS.map(async (k) => {
    const up = await processOutboxEvent(ev(k, "upsert", TENANT_A), deps(k));
    const del = await processOutboxEvent(ev(k, "delete", TENANT_A), deps(k));
    return { k, up, del };
  }));
  add("B-tenant-upsert-accepted", tenantResults.every((r) => isComplete(r.up)),
    tenantResults.filter((r) => !isComplete(r.up)).map((r) => `${r.k}:${JSON.stringify(r.up)}`).join(" | "));
  add("B-tenant-delete-accepted", tenantResults.every((r) => isComplete(r.del)),
    tenantResults.filter((r) => !isComplete(r.del)).map((r) => `${r.k}:${JSON.stringify(r.del)}`).join(" | "));

  // SHARED upsert + delete (yalnız shared-capable 4): tenant NULL olay kabul.
  const sharedResults = await Promise.all(SHARED_CAPABLE.map(async (k) => {
    const up = await processOutboxEvent(ev(k, "upsert", null), deps(k));
    const del = await processOutboxEvent(ev(k, "delete", null), deps(k));
    return { k, up, del };
  }));
  add("B-shared-upsert-accepted", sharedResults.every((r) => isComplete(r.up)),
    sharedResults.filter((r) => !isComplete(r.up)).map((r) => `${r.k}:${JSON.stringify(r.up)}`).join(" | "));
  add("B-shared-delete-accepted", sharedResults.every((r) => isComplete(r.del)),
    sharedResults.filter((r) => !isComplete(r.del)).map((r) => `${r.k}:${JSON.stringify(r.del)}`).join(" | "));

  // SECTION event (guide-sections): unit=section tenant olay kabul.
  const secUp = await processOutboxEvent(ev("sifa_rehberi:guide-sections", "upsert", TENANT_A), deps("sifa_rehberi:guide-sections"));
  add("B-section-event-accepted", isComplete(secUp), JSON.stringify(secUp));

  // defensiveDeindex: upsert exactStatus not-found → complete defensive-deindex.
  const defensive = await processOutboxEvent(ev("dogaltas:knowledge", "upsert", TENANT_A),
    deps("dogaltas:knowledge", { exactStatus: "not-found", deindex: { status: "no-op" } as DeindexResult }));
  add("B-defensive-deindex", defensive.action === "complete" && String((defensive as { note?: string }).note).startsWith("defensive-deindex:"), JSON.stringify(defensive));

  // NEGATİF: guide-sections SHARED (tenant null) olay → shared-source-unsupported (section shared DEĞİL).
  const guideShared = await processOutboxEvent(ev("sifa_rehberi:guide-sections", "upsert", null), deps("sifa_rehberi:guide-sections"));
  add("B-guide-sections-shared-rejected", isPermanent(guideShared, "shared-source-unsupported"), JSON.stringify(guideShared));

  // Hiçbir supported olay tenant-model/unit/shared permanent koduna düşmez.
  const forbidden = new Set(["tenant-model-unsupported", "shared-source-unsupported", "non-record-unit-unsupported", "invalid-event-contract"]);
  const allSupported = [...tenantResults.map((r) => r.up), ...tenantResults.map((r) => r.del), ...sharedResults.map((r) => r.up), ...sharedResults.map((r) => r.del), secUp];
  add("B-no-permanent-reject-supported", allSupported.every((d) => d.action !== "fail" || !forbidden.has(String((d as { code?: string }).code))));
}

// ═══ C) UNSUPPORTED FAIL-CLOSED (capability gate genişletmesi KONTROLLÜ) ══════
{
  // C1: YEBS global-canonical hâlâ tenant-model-unsupported (worker-v2 kapsamında DEĞİL).
  const yebs = fakeConfig({ sourceKey: "yebs:traditions", tenant: { mode: "global-canonical" } as SourceConfig["tenant"] });
  const yebsRes = await processOutboxEvent(ev("yebs:traditions", "upsert", TENANT_A, SYN), {
    resolveConfig: () => yebs, runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
    deindex: async () => ({ status: "ok" } as DeindexResult), isSourceProcessingActive: async () => true,
  });
  add("C1-yebs-global-canonical-rejected", isPermanent(yebsRes, "tenant-model-unsupported"), JSON.stringify(yebsRes));

  // C2: capability'siz allowSharedNull kaynak → shared-source-unsupported (global gevşetme YOK).
  const noCapShared = fakeConfig({ tenant: { mode: "column", column: "tenant_id", allowSharedNull: true } });
  const noCapSharedRes = await processOutboxEvent(ev("synthetic:test", "upsert", null, SYN), {
    resolveConfig: () => noCapShared, runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
    deindex: async () => ({ status: "ok" } as DeindexResult), isSourceProcessingActive: async () => true,
  });
  add("C2-no-capability-shared-rejected", isPermanent(noCapSharedRes, "shared-source-unsupported"), JSON.stringify(noCapSharedRes));

  // C2b: capability'siz allowSharedNull + tenant (non-null) olay bile → shared-source-unsupported (gate 6).
  const noCapSharedTenant = await processOutboxEvent(ev("synthetic:test", "upsert", TENANT_A, SYN), {
    resolveConfig: () => noCapShared, runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
    deindex: async () => ({ status: "ok" } as DeindexResult), isSourceProcessingActive: async () => true,
  });
  add("C2b-no-capability-shared-tenant-rejected", isPermanent(noCapSharedTenant, "shared-source-unsupported"), JSON.stringify(noCapSharedTenant));

  // C3: capability'siz non-record (section) kaynak → non-record-unit-unsupported.
  const noCapSection = fakeConfig({ unit: "section" });
  const noCapSectionRes = await processOutboxEvent(ev("synthetic:test", "upsert", TENANT_A, SYN), {
    resolveConfig: () => noCapSection, runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
    deindex: async () => ({ status: "ok" } as DeindexResult), isSourceProcessingActive: async () => true,
  });
  add("C3-no-capability-section-rejected", isPermanent(noCapSectionRes, "non-record-unit-unsupported"), JSON.stringify(noCapSectionRes));

  // C4: capability'siz column kaynakta tenant NULL hâlâ FAIL-CLOSED (shared-source-unsupported).
  const plainColumn = fakeConfig({});
  const plainNull = await processOutboxEvent(ev("synthetic:test", "upsert", null, SYN), {
    resolveConfig: () => plainColumn, runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
    deindex: async () => ({ status: "ok" } as DeindexResult), isSourceProcessingActive: async () => true,
  });
  add("C4-plain-column-null-tenant-rejected", isPermanent(plainNull, "shared-source-unsupported"), JSON.stringify(plainNull));
}

// ═══ D) ACTIVATION RECLASSIFICATION (5 → READY; OFF without activation) ═══════
{
  add("D-five-future-only-ready", FIVE_KEYS.every((k) => activationEntryOf(k)?.activationClass === "FUTURE_ONLY_READY"),
    FIVE_KEYS.filter((k) => activationEntryOf(k)?.activationClass !== "FUTURE_ONLY_READY").join(","));
  add("D-five-cohort1-ready", FIVE_KEYS.every((k) => assessCohort(activationEntryOf(k)!).cohort === "COHORT_1_READY"));
  // OFF: aktivasyon satırı yok → inactive (double gate).
  add("D-five-off-without-activation", FIVE_KEYS.every((k) => resolveProcessingActive(k, null) === false));
  add("D-five-on-with-activation", FIVE_KEYS.every((k) => resolveProcessingActive(k, { isActive: true, backfillAllowed: false }) === true));
  // DEFERRED_SHARED_WORKER_V2 artık BOŞ (5 kaynak READY'ye taşındı).
  add("D-deferred-worker-v2-empty", sourceKeysByClass("DEFERRED_SHARED_WORKER_V2").length === 0, sourceKeysByClass("DEFERRED_SHARED_WORKER_V2").join(","));
  // Matris total DEĞİŞMEDİ (reclassification; entry sayısı sabit).
  add("D-matrix-total-33", YH_ACTIVATION_MATRIX.length === 33, String(YH_ACTIVATION_MATRIX.length));
}

// ═══ E) MIGRATION STATIC CONTRACT (20261210000000) ════════════════════════════
{
  const MIG = readFileSync(join(process.cwd(), "supabase/migrations", "20261210000000_yh_worker_v2_shared_section_sources.sql"), "utf8");
  const has = (re: RegExp) => re.test(MIG);
  const EXEC = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  add("E-outbox-tenant-nullable", has(/ALTER COLUMN tenant_id DROP NOT NULL/));
  add("E-tenant-scope-column", has(/ADD COLUMN IF NOT EXISTS tenant_scope text NOT NULL DEFAULT 'tenant'/));
  add("E-scope-check", has(/CHECK \(tenant_scope IN \('tenant','shared'\)\)/));
  add("E-shared-null-check", has(/CHECK \(\(tenant_scope = 'shared'\) = \(tenant_id IS NULL\)\)/));
  add("E-put-helper", has(/CREATE OR REPLACE FUNCTION public\.yh_outbox_put_v2/));
  // 5 child/source enqueue trigger + 4 parent-capture trigger (2 del + 2 upd).
  add("E-child-triggers-5", (EXEC.match(/CREATE TRIGGER yh_cdc_\w+_v2_trg/g) ?? []).length === 5, String((EXEC.match(/CREATE TRIGGER yh_cdc_\w+_v2_trg/g) ?? []).length));
  add("E-parent-capture-4", (EXEC.match(/CREATE TRIGGER yh_capture_\w+_trg/g) ?? []).length === 4, String((EXEC.match(/CREATE TRIGGER yh_capture_\w+_trg/g) ?? []).length));
  add("E-before-delete-capture", (EXEC.match(/BEFORE DELETE ON public\.(aromatherapy_reference_sheets|healing_guides)/g) ?? []).length === 2);
  add("E-security-definer", (MIG.match(/SECURITY DEFINER/g) ?? []).length >= 5);
  add("E-fixed-search-path", (MIG.match(/SET search_path = public, pg_catalog/g) ?? []).length >= 5);
  add("E-revoke-anon-auth", (MIG.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated/g) ?? []).length >= 5);
  // APPLY-SAFE: no activation seed / no is_active flip / no data DML / no historical enqueue.
  add("E-no-activation-seed", !/INSERT\s+INTO\s+public\.yh_source_activation/i.test(EXEC));
  add("E-no-is-active-flip", !/is_active\s*=\s*true/i.test(EXEC));
  add("E-no-backfill-flip", !/backfill_allowed\s*=\s*true/i.test(EXEC));
  add("E-no-source-data-dml", !/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(stone_knowledge_articles|aromatherapy_|healing_)/i.test(EXEC));
  add("E-single-transaction", has(/^BEGIN;/m) && has(/^COMMIT;/m));
  // Parent-capture bounded (per-parent child scan; historical/global scan YOK).
  add("E-bounded-fanout", has(/WHERE r\.sheet_id = /) && has(/WHERE s\.guide_id = /));
}

// ═══ F) PRESERVE (Cohort A 11 + stones + archive real acceptance korunur) ════
{
  const cohortA11 = ["refleksoloji:protocols", "sifa_rehberi:guides", "biyoenerji:subconscious-causes",
    "biyoenerji:symbols", "biyoenerji:chakras", "biyoenerji:imaginations", "biyoenerji:sessions",
    "biyoenerji:energy-bodies", "dogaltas:minerals", "dogaltas:combinations", "aromaterapi:blends"];
  const c11 = await Promise.all(cohortA11.map(async (k) => ({ k, up: await processOutboxEvent(ev(k, "upsert", TENANT_A), deps(k)) })));
  add("F-cohort-a-11-still-accepted", c11.every((r) => isComplete(r.up)),
    c11.filter((r) => !isComplete(r.up)).map((r) => `${r.k}:${JSON.stringify(r.up)}`).join(" | "));
  add("F-cohort-a-11-future-only-ready", cohortA11.every((k) => activationEntryOf(k)?.activationClass === "FUTURE_ONLY_READY"));
  add("F-stones-keep-live", activationEntryOf("dogaltas:stones")?.activationClass === "KEEP_LIVE");
  add("F-archive-row-gated", activationEntryOf("kisisel_arsiv:archives")?.activationClass === "ROW_GATED_CONTROLLED");
  add("F-notes-pii", cfg("refleksoloji:notes").classification === "pii");
}
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nYH WORKER-V2 PARITY HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

run().then(main);
