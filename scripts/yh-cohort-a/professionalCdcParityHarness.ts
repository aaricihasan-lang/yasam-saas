/**
 * YAŞAM HAFIZASI™ — COHORT A: PROFESYONEL EVENT-DRIVEN CDC PARITY HARNESS (PASS/BLOCKED).
 * =========================================================================
 *
 * Migration 20261004000000, worker v1 (eventProcessor) tarafından İŞLENEBİLİR 11 professional kaynağa
 * (unit=record + column tenant + non-shared; 2'si yeni Biyoenerji: bioenergy_sessions,
 * bioenergy_energy_bodies) aktivasyon-kapılı CDC trigger bağlar (INSERT→upsert / UPDATE→refresh /
 * DELETE→deindex).
 *
 * PRE-MERGE REVIEW DÜZELTMESİ (BAĞLAYICI): worker v1 KAPI 5/6/7 yalnız column|join + non-shared +
 * record|row kaynağı kabul eder. 5 kaynak İŞLENEMEZ → Cohort A'dan ÇIKARILDI (DEFERRED_SHARED_WORKER_V2;
 * trigger BAĞLANMAZ):
 *   - dogaltas:knowledge, aromaterapi:oils/reference-sheets/reference-rows (allowSharedNull=true → Kapı 6)
 *   - sifa_rehberi:guide-sections (unit=section → Kapı 7)
 *
 * ZORUNLU KAPSAM (eventProcessor tenant-model invariant): "Cohort-A CDC READY" iddia edilen HER kaynak
 * GERÇEK processOutboxEvent kapılarından geçmelidir (permanent reject DEĞİL); DEFERRED 5 kaynak GERÇEK
 * processOutboxEvent tarafından permanent reddedilmelidir (exact kod). Bu SAF (DB/network YOK, satırlar
 * düz nesne) + DETERMİNİSTİK (Date.now/random YOK) doğrulanır; statik isim listesi DEĞİL — real registry
 * config semantics + real eventProcessor ile çapraz kontrol.
 *
 *   npm run yh:cohort-a:harness
 */
import {
  YH_ACTIVATION_MATRIX,
  activationEntryOf,
  resolveProcessingActive,
  assessCohort,
  sourceKeysByClass,
  sourceKeysByCohort,
  type ActivationMatrixEntry,
} from "@/lib/yasam-hafizasi/activation/activationMatrix";
import {
  ACTIVATION_CLASS_POLICY,
  evaluateProcessingGate,
  type SourceActivationRuntime,
} from "@/lib/yasam-hafizasi/activation/activationState";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { runIndexUnit, type RunIndexUnitResult } from "@/lib/yasam-hafizasi/indexer/runIndexUnit";
import { processOutboxEvent, type EventProcessorDeps, type ProcessDirective } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
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

// worker v1 (eventProcessor) Kapı 5/6/7 SAF aynası (registry config semantics; statik isim değil).
const workerV1Ok = (key: string): boolean => {
  const c = cfg(key);
  const t = c.tenant;
  const tenantOk = (t.mode === "column" || t.mode === "join") && (t as { allowSharedNull?: boolean }).allowSharedNull !== true;
  return tenantOk && (c.unit === "record" || c.unit === "row");
};

// ── Worker-v1-supported 11 Cohort-A kaynak → tablo eşlemesi (record + column) ──
const COHORT_A_READY_TABLE: Record<string, string> = {
  "refleksoloji:protocols": "reflexology_protocols",
  "sifa_rehberi:guides": "healing_guides",
  "biyoenerji:subconscious-causes": "bioenergy_subconscious_causes",
  "biyoenerji:symbols": "bioenergy_symbols",
  "biyoenerji:chakras": "bioenergy_chakras",
  "biyoenerji:imaginations": "bioenergy_imaginations",
  "biyoenerji:sessions": "bioenergy_sessions",
  "biyoenerji:energy-bodies": "bioenergy_energy_bodies",
  "dogaltas:minerals": "minerals",
  "dogaltas:combinations": "combinations",
  "aromaterapi:blends": "aromatherapy_blends",
};
const READY_KEYS = Object.keys(COHORT_A_READY_TABLE);
const NEW_KEYS = ["biyoenerji:sessions", "biyoenerji:energy-bodies"];

// ── DEFERRED_SHARED_WORKER_V2 5 kaynak → worker v1 permanent reject kodu ──────
const DEFERRED_REJECT: Record<string, string> = {
  "dogaltas:knowledge": "shared-source-unsupported",
  "aromaterapi:oils": "shared-source-unsupported",
  "aromaterapi:reference-sheets": "shared-source-unsupported",
  "aromaterapi:reference-rows": "shared-source-unsupported",
  "sifa_rehberi:guide-sections": "non-record-unit-unsupported",
};
const DEFERRED_KEYS = Object.keys(DEFERRED_REJECT);

// eventProcessor deps: kaynak resolve + upsert 'ok' + deindex 'ok' + aktivasyon aktif.
const evDeps = (key: string): EventProcessorDeps => ({
  resolveConfig: (k) => (k === key ? cfg(key) : null),
  runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
  deindex: async () => ({ status: "ok" } as unknown as DeindexResult),
  isSourceProcessingActive: async () => true,
});
const outboxEvent = (key: string, op: "upsert" | "delete"): ClaimedOutboxEvent => ({
  id: EV_ID, sourceKey: key, sourceTable: cfg(key).tableName, sourceId: SID, tenantId: TENANT_A,
  operation: op, attempts: 1, eventVersion: 1,
} as ClaimedOutboxEvent);
const isPermanent = (d: ProcessDirective, code: string): boolean =>
  d.action === "fail" && (d as { retryClass?: string }).retryClass === "permanent" && (d as { code?: string }).code === code;

async function run(): Promise<void> {
// ═══ A) REGISTRY MATRIX (11 worker-v1-supported ready kaynak) ═════════════════
{
  add("A-cohort-a-ready-11-keys", READY_KEYS.length === 11, String(READY_KEYS.length));
  add("A-deferred-5-keys", DEFERRED_KEYS.length === 5, String(DEFERRED_KEYS.length));
  add("A-all-ready-in-registry", READY_KEYS.every((k) => YH_INDEX_SOURCES.some((s) => s.sourceKey === k)));
  add("A-tablenames-match", READY_KEYS.every((k) => cfg(k).tableName === COHORT_A_READY_TABLE[k]),
    READY_KEYS.filter((k) => cfg(k).tableName !== COHORT_A_READY_TABLE[k]).join(","));
  // Ready kaynaklar unit=record + column tenant + non-shared → worker v1 KAPI 5/6/7 PASS.
  add("A-ready-all-record-column", READY_KEYS.every((k) => cfg(k).unit === "record" && cfg(k).tenant.mode === "column"));
  add("A-ready-all-workerv1-ok", READY_KEYS.every((k) => workerV1Ok(k)), READY_KEYS.filter((k) => !workerV1Ok(k)).join(","));
  // 2 yeni kaynak registry + matris'te kayıtlı, enabled, column-tenant record.
  add("A-new-sources-registered", NEW_KEYS.every((k) => {
    const c = cfg(k); const e = entryOf(k);
    return c.enabled === true && c.unit === "record" && c.tenant.mode === "column" && e !== undefined;
  }));
  add("A-new-sessions-table", cfg("biyoenerji:sessions").tableName === "bioenergy_sessions");
  add("A-new-energy-bodies-table", cfg("biyoenerji:energy-bodies").tableName === "bioenergy_energy_bodies");
  // Matris tenantMode registry tenant.mode ile hizalı.
  add("A-matrix-tenantmode-aligned", READY_KEYS.every((k) => entryOf(k)?.tenantMode === cfg(k).tenant.mode));
  // Matris FUTURE_ONLY_READY professional kümesi TAM olarak 11 ready ile eşleşir (drift yok).
  const futurePro = sourceKeysByClass("FUTURE_ONLY_READY").filter((k) => entryOf(k)?.scope === "professional").sort();
  add("A-matrix-future-pro-equals-ready", JSON.stringify(futurePro) === JSON.stringify([...READY_KEYS].sort()), futurePro.join(","));
}

// ═══ A2) DEFERRED_SHARED_WORKER_V2 (5 kaynak; worker v1 kapsamı dışı) ═════════
{
  add("A2-deferred-class", DEFERRED_KEYS.every((k) => entryOf(k)?.activationClass === "DEFERRED_SHARED_WORKER_V2"),
    DEFERRED_KEYS.filter((k) => entryOf(k)?.activationClass !== "DEFERRED_SHARED_WORKER_V2").join(","));
  // Matris DEFERRED kümesi TAM olarak beklenen 5 ile eşleşir.
  add("A2-matrix-deferred-equals-5", JSON.stringify(sourceKeysByClass("DEFERRED_SHARED_WORKER_V2").sort()) === JSON.stringify([...DEFERRED_KEYS].sort()),
    sourceKeysByClass("DEFERRED_SHARED_WORKER_V2").join(","));
  // Registry enabled:true KORUNUR (arama semantiği bozulmaz).
  add("A2-deferred-registry-enabled", DEFERRED_KEYS.every((k) => cfg(k).enabled === true));
  // worker v1 GERÇEKTEN işleyemez (config semantics).
  add("A2-deferred-not-workerv1", DEFERRED_KEYS.every((k) => workerV1Ok(k) === false), DEFERRED_KEYS.filter((k) => workerV1Ok(k)).join(","));
  // triggerFeasibleNow=false + futureEventEligible=false + backfill blocked.
  add("A2-deferred-trigger-infeasible", DEFERRED_KEYS.every((k) => entryOf(k)?.triggerFeasibleNow === false));
  add("A2-deferred-future-ineligible", DEFERRED_KEYS.every((k) => entryOf(k)?.futureEventEligible === false));
  add("A2-deferred-backfill-blocked", DEFERRED_KEYS.every((k) => entryOf(k)?.backfillEligibility === "blocked-worker-unsupported"));
  // Kohort dispozisyonu DEFERRED_SHARED_WORKER_V2 + readyGap DOLU (aktivasyona hazır DEĞİL).
  add("A2-deferred-cohort", DEFERRED_KEYS.every((k) => { const e = entryOf(k)!; return assessCohort(e).cohort === "DEFERRED_SHARED_WORKER_V2" && assessCohort(e).readyGap.length > 0; }));
  // DEFERRED kaynak "aktivasyona hazır" (COHORT_1_READY) DEĞİL.
  add("A2-deferred-not-cohort1-ready", DEFERRED_KEYS.every((k) => assessCohort(entryOf(k)!).cohort !== "COHORT_1_READY"));
}

// ═══ B) ACTIVATION GRADUATION (FUTURE_ONLY_READY; OFF without activation; ON with) ═
{
  add("B-all-future-only-ready", READY_KEYS.every((k) => entryOf(k)?.activationClass === "FUTURE_ONLY_READY"));
  add("B-requires-runtime-activation", READY_KEYS.every((k) => {
    const e = entryOf(k);
    return e !== undefined && ACTIVATION_CLASS_POLICY[e.activationClass].requiresRuntimeActivation === true;
  }));
  // OFF: aktivasyon satırı YOK (runtime null) → processing inactive.
  add("B-off-without-activation-row", READY_KEYS.every((k) => resolveProcessingActive(k, null) === false));
  // OFF: aktivasyon satırı VAR ama is_active=false → inactive.
  add("B-off-runtime-inactive", READY_KEYS.every((k) => resolveProcessingActive(k, { isActive: false, backfillAllowed: false }) === false));
  // ON: is_active=true → active.
  add("B-on-with-runtime-active", READY_KEYS.every((k) => resolveProcessingActive(k, runtimeOn) === true), READY_KEYS.filter((k) => resolveProcessingActive(k, runtimeOn) !== true).join(","));
  // Çift kapı: matris entry → evaluateProcessingGate ile de aynı (null OFF, active ON).
  add("B-double-gate-pure", READY_KEYS.every((k) => {
    const e = entryOf(k)!;
    const d = { sourceKey: e.sourceKey, scope: e.scope, activationClass: e.activationClass, registryEnabled: e.registryEnabled };
    return evaluateProcessingGate(d, null).active === false && evaluateProcessingGate(d, runtimeOn).active === true;
  }));
  // KEEP_LIVE grandfathered: dogaltas:stones runtime null iken bile aktif (davranış korunur).
  add("B-stones-keep-live-active-null", resolveProcessingActive("dogaltas:stones", null) === true);
  // Cohort-A ready kohort dispozisyonu: COHORT_1_READY (kod-ready; readyGap boş).
  add("B-cohort-1-ready", READY_KEYS.every((k) => { const e = entryOf(k)!; return assessCohort(e).cohort === "COHORT_1_READY" && assessCohort(e).readyGap.length === 0; }));
}

// ═══ B2) EVENTPROCESSOR COVERAGE (ZORUNLU) — GERÇEK worker kapı sözleşmesi ════
// READY 11: real processOutboxEvent upsert+delete → complete (permanent reject DEĞİL).
// DEFERRED 5: real processOutboxEvent → permanent reject (exact kod). Statik liste değil.
{
  const readyResults = await Promise.all(READY_KEYS.map(async (k) => {
    const up = await processOutboxEvent(outboxEvent(k, "upsert"), evDeps(k));
    const del = await processOutboxEvent(outboxEvent(k, "delete"), evDeps(k));
    return { k, up, del };
  }));
  add("B2-ready-upsert-accepted", readyResults.every((r) => r.up.action === "complete"),
    readyResults.filter((r) => r.up.action !== "complete").map((r) => `${r.k}:${JSON.stringify(r.up)}`).join(" | "));
  add("B2-ready-upsert-not-permanent", readyResults.every((r) => r.up.action !== "fail"),
    readyResults.filter((r) => r.up.action === "fail").map((r) => `${r.k}:${(r.up as { code?: string }).code}`).join(","));
  add("B2-ready-delete-accepted", readyResults.every((r) => r.del.action === "complete"),
    readyResults.filter((r) => r.del.action !== "complete").map((r) => `${r.k}:${JSON.stringify(r.del)}`).join(" | "));
  // Hiçbir ready kaynak tenant-model/unit permanent koduna düşmez.
  const forbidden = new Set(["tenant-model-unsupported", "shared-source-unsupported", "non-record-unit-unsupported"]);
  add("B2-ready-no-tenant-unit-reject", readyResults.every((r) => !forbidden.has(String((r.up as { code?: string }).code))));

  const deferredResults = await Promise.all(DEFERRED_KEYS.map(async (k) => {
    const up = await processOutboxEvent(outboxEvent(k, "upsert"), evDeps(k));
    const del = await processOutboxEvent(outboxEvent(k, "delete"), evDeps(k));
    return { k, up, del };
  }));
  add("B2-deferred-upsert-permanent-reject", deferredResults.every((r) => isPermanent(r.up, DEFERRED_REJECT[r.k])),
    deferredResults.filter((r) => !isPermanent(r.up, DEFERRED_REJECT[r.k])).map((r) => `${r.k}:${JSON.stringify(r.up)}`).join(" | "));
  add("B2-deferred-delete-permanent-reject", deferredResults.every((r) => isPermanent(r.del, DEFERRED_REJECT[r.k])),
    deferredResults.filter((r) => !isPermanent(r.del, DEFERRED_REJECT[r.k])).map((r) => `${r.k}:${JSON.stringify(r.del)}`).join(" | "));
  // NEGATIF: DEFERRED kaynaklardan HİÇBİRİ worker-v1 ready kümesinde OLMAMALI.
  add("B2-deferred-absent-from-ready", DEFERRED_KEYS.every((k) => !READY_KEYS.includes(k)));
  // ÇAPRAZ: config-semantics workerV1Ok ↔ gerçek processOutboxEvent kabulü BİREBİR.
  add("B2-workerv1ok-matches-processor",
    [...READY_KEYS, ...DEFERRED_KEYS].every((k) => {
      const accepted = readyResults.find((r) => r.k === k)?.up.action === "complete"
        || deferredResults.find((r) => r.k === k)?.up.action === "complete";
      return workerV1Ok(k) === accepted;
    }));
}

// ═══ C) SOURCE COUNT ARİTMETİĞİ (exact) ══════════════════════════════════════
{
  add("C-professional-registry-27", YH_INDEX_SOURCES.length === 27, String(YH_INDEX_SOURCES.length));
  add("C-live-professional-19", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 19, String(YH_INDEX_SOURCES.filter((s) => s.enabled === true).length));
  add("C-dormant-professional-8", YH_INDEX_SOURCES.filter((s) => s.enabled === false).length === 8);
  add("C-keep-live-1-professional-stones", sourceKeysByClass("KEEP_LIVE").filter((k) => k === "dogaltas:stones").length === 1);
  // KEEP_LIVE class = 2 (stones + refleksoloji:notes pii no-op); professional-live-catalog = 1 (stones).
  add("C-keep-live-class-2", sourceKeysByClass("KEEP_LIVE").length === 2, sourceKeysByClass("KEEP_LIVE").join(","));
  // FUTURE_ONLY_READY professional = 11 (worker-v1-supported Cohort A).
  add("C-future-only-controlled-11-pro", sourceKeysByClass("FUTURE_ONLY_READY").filter((k) => entryOf(k)?.scope === "professional").length === 11, String(sourceKeysByClass("FUTURE_ONLY_READY").filter((k) => entryOf(k)?.scope === "professional").length));
  // FUTURE_ONLY_READY total = 11 professional + 6 client = 17.
  add("C-future-only-total-17", sourceKeysByClass("FUTURE_ONLY_READY").length === 17, String(sourceKeysByClass("FUTURE_ONLY_READY").length));
  add("C-deferred-worker-v2-5", sourceKeysByClass("DEFERRED_SHARED_WORKER_V2").length === 5, sourceKeysByClass("DEFERRED_SHARED_WORKER_V2").join(","));
  add("C-row-gated-1-archive", sourceKeysByClass("ROW_GATED_CONTROLLED").length === 1 && sourceKeysByClass("ROW_GATED_CONTROLLED")[0] === "kisisel_arsiv:archives");
  add("C-matrix-total-33", YH_ACTIVATION_MATRIX.length === 33, String(YH_ACTIVATION_MATRIX.length));
  // Kohort dispozisyonu: COHORT_1_READY = 11 ready + 1 archive = 12; DEFERRED cohort = 5.
  add("C-cohort1-ready-12", sourceKeysByCohort("COHORT_1_READY").length === 12, sourceKeysByCohort("COHORT_1_READY").join(","));
  add("C-deferred-cohort-5", sourceKeysByCohort("DEFERRED_SHARED_WORKER_V2").length === 5);
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

// ═══ F) DELETE / DEFENSIVE DEINDEX semantiği (Solar Pleksus çakra I/U/D) ══════
{
  const chakras = cfg("biyoenerji:chakras");
  const delDeps = (d: DeindexResult, op: "delete" | "upsert" = "delete", exact?: string): EventProcessorDeps => ({
    resolveConfig: (k) => (k === "biyoenerji:chakras" ? chakras : null),
    runExactUpsert: async () => {
      if (op === "delete") throw new Error("delete akışında write ÇAĞRILMAMALI");
      return { exactStatus: exact ?? "not-found", write: null } as unknown as IndexSourcePageResult;
    },
    deindex: async () => d,
    isSourceProcessingActive: async () => true,
  });
  const ev = (operation: "delete" | "upsert"): ClaimedOutboxEvent => ({
    id: EV_ID, sourceKey: "biyoenerji:chakras", sourceTable: "bioenergy_chakras", sourceId: SID, tenantId: TENANT_A,
    operation, attempts: 1, eventVersion: 1,
  } as ClaimedOutboxEvent);

  const dOk = await processOutboxEvent(ev("delete"), delDeps({ status: "ok" } as DeindexResult));
  add("F-delete-ok-complete", dOk.action === "complete" && (dOk as { note?: string }).note === "delete-one");
  const dNone = await processOutboxEvent(ev("delete"), delDeps({ status: "no-op" } as DeindexResult));
  add("F-delete-noop-complete", dNone.action === "complete" && (dNone as { note?: string }).note === "delete-none");
  // UPSERT not-found → DEFENSIVE DEINDEX + complete (index tutarlı bırakılır → stale/ghost yok).
  const dDefensive = await processOutboxEvent(ev("upsert"), delDeps({ status: "no-op" } as DeindexResult, "upsert", "not-found"));
  add("F-upsert-notfound-defensive-deindex", dDefensive.action === "complete" && String((dDefensive as { note?: string }).note).startsWith("defensive-deindex:"));
}

// ═══ G) SOFT-INACTIVE / activeColumn taşınır (aromaterapi:blends ready korunur) ═
{
  add("G-blends-active-column", cfg("aromaterapi:blends").activeColumn === "is_active");
  // DEFERRED kaynaklar mevcut config'ten activeColumn taşımaya devam eder (arama semantiği bozulmaz).
  add("G-oils-active-column", cfg("aromaterapi:oils").activeColumn === "is_active");
  add("G-reference-sheets-active-column", cfg("aromaterapi:reference-sheets").activeColumn === "is_active");
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

// ═══ K) CROSS-MODULE FIXTURE (aynı token 5 ready modülde; distinct provenance) ═
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

// ═══ L) PRESERVE (stones/archive/notes/belge/deferred registry değişmedi) ═════
{
  add("L-stones-keep-live", entryOf("dogaltas:stones")?.activationClass === "KEEP_LIVE");
  add("L-stones-registry-enabled", cfg("dogaltas:stones").enabled === true);
  const arc = cfg("kisisel_arsiv:archives");
  add("L-archive-row-gated-controlled", entryOf("kisisel_arsiv:archives")?.activationClass === "ROW_GATED_CONTROLLED" && arc.requiresRowEligibilityGate === true);
  add("L-notes-pii", cfg("refleksoloji:notes").classification === "pii");
  add("L-belge-not-in-registry", !YH_INDEX_SOURCES.some((s) => (s.sourceKey as string) === "belge_video:passages"));
  add("L-belge-not-in-matrix", !YH_ACTIVATION_MATRIX.some((e) => e.sourceKey.startsWith("belge_video")));
  // DEFERRED kaynaklar registry'de KORUNUR (silinmedi; arama semantiği bozulmadı).
  add("L-deferred-registry-preserved", DEFERRED_KEYS.every((k) => YH_INDEX_SOURCES.some((s) => s.sourceKey === k && s.enabled === true)));
  add("L-deferred-in-matrix", DEFERRED_KEYS.every((k) => YH_ACTIVATION_MATRIX.some((e) => e.sourceKey === k)));
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
