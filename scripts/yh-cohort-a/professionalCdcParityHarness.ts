/**
 * YAŞAM HAFIZASI™ — COHORT A: PROFESYONEL EVENT-DRIVEN CDC PARITY HARNESS (PASS/BLOCKED).
 * =========================================================================
 *
 * Migration 20261004000000, 16 professional kaynağa (14 mevcut graduate + 2 yeni Biyoenerji:
 * bioenergy_sessions, bioenergy_energy_bodies) aktivasyon-kapılı CDC trigger bağlar
 * (INSERT→upsert / UPDATE→refresh / DELETE→deindex). Bu harness, TypeScript registry + aktivasyon
 * matrisi + saf indexer fonksiyonlarının bu sözleşmeyle TUTARLI olduğunu SAF (DB/network YOK,
 * satırlar düz nesne) + DETERMİNİSTİK (Date.now/random YOK) doğrular.
 *
 * GERÇEK fonksiyonlar kullanılır (kopya/taklit YOK): runIndexUnit / buildIndexUnit türevi
 * contentHash / evaluateRowEligibility / resolveProcessingActive / evaluateProcessingGate /
 * processOutboxEvent (delete→deindex).
 *
 *   npm run yh:cohort-a:harness
 */
import {
  YH_ACTIVATION_MATRIX,
  activationEntryOf,
  resolveProcessingActive,
  assessCohort,
  sourceKeysByClass,
  type ActivationMatrixEntry,
} from "@/lib/yasam-hafizasi/activation/activationMatrix";
import {
  ACTIVATION_CLASS_POLICY,
  evaluateProcessingGate,
  type SourceActivationRuntime,
} from "@/lib/yasam-hafizasi/activation/activationState";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { runIndexUnit, type RunIndexUnitResult } from "@/lib/yasam-hafizasi/indexer/runIndexUnit";
import { processOutboxEvent, type EventProcessorDeps } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import type { ClaimedOutboxEvent } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import type { IndexSourcePageResult } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import type { DeindexResult } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

// ── Deterministik sabitler (geçerli UUID; Date.now/random YOK) ────────────────
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const SID = "44444444-4444-4444-4444-444444444444";
const EV_ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "MIGREN_FIXTURE_TOKEN";
const HEX64 = /^[0-9a-f]{64}$/;

const cfg = (key: string): SourceConfig => {
  const c = YH_INDEX_SOURCES.find((s) => s.sourceKey === key);
  if (!c) throw new Error(`registry kaynağı yok: ${key}`);
  return c as SourceConfig;
};
const entryOf = (k: string): ActivationMatrixEntry | undefined => activationEntryOf(k);
const isUnit = (r: RunIndexUnitResult): r is Extract<RunIndexUnitResult, { status: "unit" }> => r.status === "unit";
const runtimeOn: SourceActivationRuntime = { isActive: true, backfillAllowed: false };

// 16 Cohort-A professional kaynak (14 graduate + 2 yeni) → tablo eşlemesi.
const COHORT_A_TABLE: Record<string, string> = {
  "refleksoloji:protocols": "reflexology_protocols",
  "sifa_rehberi:guides": "healing_guides",
  "sifa_rehberi:guide-sections": "healing_guide_sections",
  "biyoenerji:subconscious-causes": "bioenergy_subconscious_causes",
  "biyoenerji:symbols": "bioenergy_symbols",
  "biyoenerji:chakras": "bioenergy_chakras",
  "biyoenerji:imaginations": "bioenergy_imaginations",
  "biyoenerji:sessions": "bioenergy_sessions",
  "biyoenerji:energy-bodies": "bioenergy_energy_bodies",
  "dogaltas:minerals": "minerals",
  "dogaltas:knowledge": "stone_knowledge_articles",
  "dogaltas:combinations": "combinations",
  "aromaterapi:oils": "aromatherapy_oils",
  "aromaterapi:reference-sheets": "aromatherapy_reference_sheets",
  "aromaterapi:reference-rows": "aromatherapy_reference_rows",
  "aromaterapi:blends": "aromatherapy_blends",
};
const COHORT_A_KEYS = Object.keys(COHORT_A_TABLE);
const NEW_KEYS = ["biyoenerji:sessions", "biyoenerji:energy-bodies"];

async function run(): Promise<void> {
// ═══ A) REGISTRY MATRIX (16 kaynak; tableName/tenant; 2 yeni kayıtlı) ═════════
{
  add("A-cohort-a-16-keys", COHORT_A_KEYS.length === 16);
  add("A-all-in-registry", COHORT_A_KEYS.every((k) => YH_INDEX_SOURCES.some((s) => s.sourceKey === k)));
  add("A-tablenames-match", COHORT_A_KEYS.every((k) => cfg(k).tableName === COHORT_A_TABLE[k]),
    COHORT_A_KEYS.filter((k) => cfg(k).tableName !== COHORT_A_TABLE[k]).join(","));
  add("A-tenant-mode-column-or-join", COHORT_A_KEYS.every((k) => cfg(k).tenant.mode === "column" || cfg(k).tenant.mode === "join"));
  // 2 yeni kaynak registry + matris'te kayıtlı, enabled, column-tenant record.
  add("A-new-sources-registered", NEW_KEYS.every((k) => {
    const c = cfg(k); const e = entryOf(k);
    return c.enabled === true && c.unit === "record" && c.tenant.mode === "column" && e !== undefined;
  }));
  add("A-new-sessions-table", cfg("biyoenerji:sessions").tableName === "bioenergy_sessions");
  add("A-new-energy-bodies-table", cfg("biyoenerji:energy-bodies").tableName === "bioenergy_energy_bodies");
  // Matris tenantMode registry tenant.mode ile hizalı.
  add("A-matrix-tenantmode-aligned", COHORT_A_KEYS.every((k) => entryOf(k)?.tenantMode === cfg(k).tenant.mode));
}

// ═══ B) ACTIVATION GRADUATION (FUTURE_ONLY_READY; OFF without activation; ON with) ═
{
  add("B-all-future-only-ready", COHORT_A_KEYS.every((k) => entryOf(k)?.activationClass === "FUTURE_ONLY_READY"));
  add("B-requires-runtime-activation", COHORT_A_KEYS.every((k) => {
    const e = entryOf(k);
    return e !== undefined && ACTIVATION_CLASS_POLICY[e.activationClass].requiresRuntimeActivation === true;
  }));
  // OFF: aktivasyon satırı YOK (runtime null) → processing inactive.
  add("B-off-without-activation-row", COHORT_A_KEYS.every((k) => resolveProcessingActive(k, null) === false));
  // OFF: aktivasyon satırı VAR ama is_active=false → inactive.
  add("B-off-runtime-inactive", COHORT_A_KEYS.every((k) => resolveProcessingActive(k, { isActive: false, backfillAllowed: false }) === false));
  // ON: is_active=true → active.
  add("B-on-with-runtime-active", COHORT_A_KEYS.every((k) => resolveProcessingActive(k, runtimeOn) === true), COHORT_A_KEYS.filter((k) => resolveProcessingActive(k, runtimeOn) !== true).join(","));
  // Çift kapı: matris entry → evaluateProcessingGate ile de aynı (null OFF, active ON).
  add("B-double-gate-pure", COHORT_A_KEYS.every((k) => {
    const e = entryOf(k)!;
    const d = { sourceKey: e.sourceKey, scope: e.scope, activationClass: e.activationClass, registryEnabled: e.registryEnabled };
    return evaluateProcessingGate(d, null).active === false && evaluateProcessingGate(d, runtimeOn).active === true;
  }));
  // KEEP_LIVE grandfathered: dogaltas:stones runtime null iken bile aktif (davranış korunur).
  add("B-stones-keep-live-active-null", resolveProcessingActive("dogaltas:stones", null) === true);
  // Cohort-A kohort dispozisyonu: COHORT_1_READY (kod-ready; readyGap boş).
  add("B-cohort-1-ready", COHORT_A_KEYS.every((k) => { const e = entryOf(k)!; return assessCohort(e).cohort === "COHORT_1_READY" && assessCohort(e).readyGap.length === 0; }));
}

// ═══ C) SOURCE COUNT ARİTMETİĞİ (exact) ══════════════════════════════════════
{
  add("C-professional-registry-27", YH_INDEX_SOURCES.length === 27, String(YH_INDEX_SOURCES.length));
  add("C-live-professional-19", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 19, String(YH_INDEX_SOURCES.filter((s) => s.enabled === true).length));
  add("C-dormant-professional-8", YH_INDEX_SOURCES.filter((s) => s.enabled === false).length === 8);
  add("C-keep-live-1-professional-stones", sourceKeysByClass("KEEP_LIVE").filter((k) => k === "dogaltas:stones").length === 1);
  // KEEP_LIVE class = 2 (stones + refleksoloji:notes pii no-op); professional-live-catalog = 1 (stones).
  add("C-keep-live-class-2", sourceKeysByClass("KEEP_LIVE").length === 2, sourceKeysByClass("KEEP_LIVE").join(","));
  add("C-future-only-controlled-16-pro", sourceKeysByClass("FUTURE_ONLY_READY").filter((k) => entryOf(k)?.scope === "professional").length === 16, String(sourceKeysByClass("FUTURE_ONLY_READY").filter((k) => entryOf(k)?.scope === "professional").length));
  add("C-future-only-total-22", sourceKeysByClass("FUTURE_ONLY_READY").length === 22);
  add("C-row-gated-1-archive", sourceKeysByClass("ROW_GATED_CONTROLLED").length === 1 && sourceKeysByClass("ROW_GATED_CONTROLLED")[0] === "kisisel_arsiv:archives");
  add("C-matrix-total-33", YH_ACTIVATION_MATRIX.length === 33, String(YH_ACTIVATION_MATRIX.length));
}

// ═══ D) INSERT (runIndexUnit → unit; title/searchText/tenant/source_id) ═══════
{
  const r = runIndexUnit({ config: cfg("biyoenerji:chakras"), row: { id: SID, tenant_id: TENANT_A, name: "Kök Çakra", causes: `${TOKEN} enerji blokajı` } });
  add("D-insert-unit", isUnit(r));
  if (isUnit(r)) {
    add("D-insert-title", r.unit.title === "Kök Çakra");
    add("D-insert-tenant", r.unit.tenantId === TENANT_A);
    add("D-insert-source-id", r.unit.sourceId === SID);
    add("D-insert-source-table", r.unit.sourceTable === "bioenergy_chakras");
    add("D-insert-searchtext-carried", r.unit.evidenceFields.some((f) => f.text.includes(TOKEN)));
    add("D-insert-hash-64hex", HEX64.test(r.unit.contentHash));
  }
}

// ═══ E) UPDATE (aynı source_id, değişen body → farklı contentHash; tek unit) ══
{
  const base = { id: SID, tenant_id: TENANT_A, name: "Kök Çakra", causes: "ilk içerik" };
  const edited = { id: SID, tenant_id: TENANT_A, name: "Kök Çakra", causes: "GÜNCELLENMİŞ içerik" };
  const r1 = runIndexUnit({ config: cfg("biyoenerji:chakras"), row: base });
  const r2 = runIndexUnit({ config: cfg("biyoenerji:chakras"), row: edited });
  add("E-update-both-units", isUnit(r1) && isUnit(r2));
  if (isUnit(r1) && isUnit(r2)) {
    add("E-update-same-identity", r1.unit.sourceId === r2.unit.sourceId && r1.unit.groupKey === r2.unit.groupKey);
    add("E-update-hash-changed", r1.unit.contentHash !== r2.unit.contentHash);
    add("E-update-single-unit", r2.status === "unit"); // bir çağrı en fazla bir birim (S2.07)
  }
}

// ═══ F) DELETE semantiği (eventProcessor delete → deindex mapping) ═══════════
{
  const chakras = cfg("biyoenerji:chakras");
  const delDeps = (d: DeindexResult, op: "delete" | "upsert" = "delete", exact?: string): EventProcessorDeps => ({
    resolveConfig: (k) => (k === "biyoenerji:chakras" ? chakras : null),
    runExactUpsert: async () => {
      if (op === "delete") throw new Error("delete akışında write ÇAĞRILMAMALI");
      return { exactStatus: exact ?? "not-found", write: null } as unknown as IndexSourcePageResult;
    },
    deindex: async () => d,
  });
  const ev = (operation: "delete" | "upsert"): ClaimedOutboxEvent => ({
    id: EV_ID, sourceKey: "biyoenerji:chakras", sourceTable: "bioenergy_chakras", sourceId: SID, tenantId: TENANT_A,
    operation, attempts: 1, eventVersion: 1,
  } as ClaimedOutboxEvent);

  const dOk = await processOutboxEvent(ev("delete"), delDeps({ status: "ok" } as DeindexResult));
  add("F-delete-ok-complete", dOk.action === "complete" && (dOk as { note?: string }).note === "delete-one");
  const dNone = await processOutboxEvent(ev("delete"), delDeps({ status: "no-op" } as DeindexResult));
  add("F-delete-noop-complete", dNone.action === "complete" && (dNone as { note?: string }).note === "delete-none");
  // UPSERT not-found → DEFENSIVE DEINDEX + complete (index tutarlı bırakılır).
  const dDefensive = await processOutboxEvent(ev("upsert"), delDeps({ status: "no-op" } as DeindexResult, "upsert", "not-found"));
  add("F-upsert-notfound-defensive-deindex", dDefensive.action === "complete" && String((dDefensive as { note?: string }).note).startsWith("defensive-deindex:"));
}

// ═══ G) SOFT-INACTIVE / activeColumn taşınır (4 aromaterapi kaynağı korunur) ══
{
  // Bu 4 kaynak mevcut config'ten activeColumn taşır (soft-delete runtime kapısı; saf builder'da no-op).
  add("G-oils-active-column", cfg("aromaterapi:oils").activeColumn === "is_active");
  add("G-reference-sheets-active-column", cfg("aromaterapi:reference-sheets").activeColumn === "is_active");
  add("G-blends-active-column", cfg("aromaterapi:blends").activeColumn === "is_active");
  add("G-knowledge-active-column", cfg("dogaltas:knowledge").activeColumn === "is_active");
  // Yeni Biyoenerji kaynakları activeColumn null (declarative — soft-delete kolonu yok).
  add("G-new-sources-no-active-column", NEW_KEYS.every((k) => cfg(k).activeColumn === null));
}

// ═══ H) YENİ KAYNAKLAR (runIndexUnit → NON-empty title; energy-bodies=source_uid) ═
{
  const rS = runIndexUnit({ config: cfg("biyoenerji:sessions"), row: { id: SID, tenant_id: TENANT_A, title: "Teknik A", content: "Uygulama içeriği" } });
  add("H-sessions-unit", isUnit(rS));
  if (isUnit(rS)) {
    add("H-sessions-title-nonempty", typeof rS.unit.title === "string" && rS.unit.title.trim().length > 0 && rS.unit.title === "Teknik A");
    add("H-sessions-tenant", rS.unit.tenantId === TENANT_A);
  }
  const rE = runIndexUnit({ config: cfg("biyoenerji:energy-bodies"), row: { id: SID, tenant_id: TENANT_A, source_uid: "EB-01", genel_tanim: "Eterik beden açıklaması" } });
  add("H-energy-bodies-unit", isUnit(rE));
  if (isUnit(rE)) {
    // Title source_uid'den türetilir (NON-empty; "Untitled" gibi uydurma fallback YOK).
    add("H-energy-bodies-title-source-uid", typeof rE.unit.title === "string" && rE.unit.title.trim().length > 0 && rE.unit.title === "EB-01");
    add("H-energy-bodies-title-origin", rE.unit.titleSource === "source_uid");
    add("H-energy-bodies-tenant", rE.unit.tenantId === TENANT_A);
    add("H-energy-bodies-source-table", rE.unit.sourceTable === "bioenergy_energy_bodies");
  }
}

// ═══ I) TENANT İZOLASYONU (unit.tenantId === satır tenant; yeni kaynaklar taşır) ═
{
  const rA = runIndexUnit({ config: cfg("biyoenerji:sessions"), row: { id: SID, tenant_id: TENANT_A, title: "T", content: "abc" } });
  const rB = runIndexUnit({ config: cfg("biyoenerji:energy-bodies"), row: { id: SID, tenant_id: TENANT_B, source_uid: "EB-02", genel_tanim: "içerik" } });
  add("I-sessions-tenant-a", isUnit(rA) && rA.unit.tenantId === TENANT_A);
  add("I-energy-bodies-tenant-b", isUnit(rB) && rB.unit.tenantId === TENANT_B);
  add("I-no-tenant-leak", isUnit(rA) && isUnit(rB) && rA.unit.tenantId !== rB.unit.tenantId);
}

// ═══ J) contentHash / no-duplicate (aynı satır → aynı hash; değişen → farklı) ══
{
  const row = { id: SID, tenant_id: TENANT_A, name: "Magnezyum", aciklama: "sabit içerik" };
  const a = runIndexUnit({ config: cfg("dogaltas:minerals"), row });
  const b = runIndexUnit({ config: cfg("dogaltas:minerals"), row: { ...row } });
  const c = runIndexUnit({ config: cfg("dogaltas:minerals"), row: { ...row, aciklama: "değişti" } });
  add("J-identical-row-identical-hash", isUnit(a) && isUnit(b) && a.unit.contentHash === b.unit.contentHash);
  add("J-changed-row-different-hash", isUnit(a) && isUnit(c) && a.unit.contentHash !== c.unit.contentHash);
}

// ═══ K) CROSS-MODULE FIXTURE (aynı token 5 modülde; distinct provenance) ══════
{
  const fixtures: { key: string; row: Record<string, unknown> }[] = [
    { key: "biyoenerji:chakras", row: { id: SID, tenant_id: TENANT_A, name: "Çakra", causes: `${TOKEN} sebep` } },
    { key: "refleksoloji:protocols", row: { id: SID, tenant_id: TENANT_A, title: "Protokol", target_problem: `${TOKEN} hedef` } },
    { key: "dogaltas:minerals", row: { id: SID, tenant_id: TENANT_A, name: "Mineral", aciklama: `${TOKEN} açıklama` } },
    { key: "sifa_rehberi:guides", row: { id: SID, tenant_id: TENANT_A, name: "Rehber", general_summary: `${TOKEN} özet` } },
    { key: "aromaterapi:blends", row: { id: SID, tenant_id: TENANT_A, name: "Blend", notes: `${TOKEN} not` } },
  ];
  const units = fixtures.map((f) => ({ key: f.key, res: runIndexUnit({ config: cfg(f.key), row: f.row }) }));
  add("K-all-5-units", units.every((u) => isUnit(u.res)), units.filter((u) => !isUnit(u.res)).map((u) => u.key).join(","));
  add("K-all-carry-token", units.every((u) => isUnit(u.res) && u.res.unit.evidenceFields.some((f) => f.text.includes(TOKEN))));
  // Distinct provenance: source_table + groupKey prefix (source_key) benzersiz.
  const tables = new Set(units.filter((u) => isUnit(u.res)).map((u) => (u.res as Extract<RunIndexUnitResult, { status: "unit" }>).unit.sourceTable));
  add("K-distinct-source-tables", tables.size === 5, [...tables].join(","));
  add("K-groupkey-carries-source-key", units.every((u) => isUnit(u.res) && u.res.unit.groupKey.startsWith(`${u.key}:`)));
}

// ═══ L) PRESERVE (stones/archive/notes/belge değişmedi) ══════════════════════
{
  add("L-stones-keep-live", entryOf("dogaltas:stones")?.activationClass === "KEEP_LIVE");
  add("L-stones-registry-enabled", cfg("dogaltas:stones").enabled === true);
  const arc = cfg("kisisel_arsiv:archives");
  add("L-archive-row-gated-controlled", entryOf("kisisel_arsiv:archives")?.activationClass === "ROW_GATED_CONTROLLED" && arc.requiresRowEligibilityGate === true);
  add("L-notes-pii", cfg("refleksoloji:notes").classification === "pii");
  add("L-belge-not-in-registry", !YH_INDEX_SOURCES.some((s) => (s.sourceKey as string) === "belge_video:passages"));
  add("L-belge-not-in-matrix", !YH_ACTIVATION_MATRIX.some((e) => e.sourceKey.startsWith("belge_video")));
}
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nYH COHORT-A PROFESSIONAL CDC PARITY HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

run().then(main);
