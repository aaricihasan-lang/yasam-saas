/**
 * BF-11E — CONTROLLED ACTIVATION COHORT-1 HARNESS (PASS/BLOCKED).
 *
 * Runtime activation gate wiring + kohort dizilimi + eventProcessor gate davranışı +
 * KEEP_LIVE uyumluluğu + defer kararları + regresyon. Production/DB YOK.
 *   npm run yh:bf11e:cohort1:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  YH_ACTIVATION_MATRIX,
  validateActivationMatrix,
  resolveProcessingActive,
  assessCohort,
  sourceKeysByCohort,
  activationEntryOf,
} from "@/lib/yasam-hafizasi/activation/activationMatrix";
import {
  evaluateProcessingGate,
  type SourceActivationDesired,
} from "@/lib/yasam-hafizasi/activation/activationState";
import { processOutboxEvent, type EventProcessorDeps } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import type { ClaimedOutboxEvent } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import type { IndexSourcePageResult } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import type { DeindexResult } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { YH_INDEX_SOURCES } from "@/lib/yasam-hafizasi/indexer/sources";
import { YH_CLIENT_INDEX_SOURCES } from "@/lib/yasam-hafizasi/client/clientSources";
import { YH_DEFERRED_SOURCE_CLOSURE, validateDeferredClosure } from "@/lib/yasam-hafizasi/deferredSourceClosure";
import { validateModuleSourceMatrix } from "@/lib/yasam-hafizasi/moduleSourceMatrix";
import { validateAllClientSources } from "@/lib/yasam-hafizasi/client/clientSources";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const U1 = "11111111-1111-4111-1111-111111111111";
const U2 = "22222222-2222-4222-2222-222222222222";

// Değişen dosyaların statik doğrulaması (server-only modül tsx'te import edilemez).
const readSrc = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");
const GATE_SRC = readSrc("lib/yasam-hafizasi/activation/activationRuntimeGate.ts");
const WORKER_SRC = readSrc("lib/inngest/functions/yhOutboxWorker.ts");
const EP_SRC = readSrc("lib/yasam-hafizasi/outbox/eventProcessor.ts");

async function run(): Promise<void> {
// ═══ A) PURE RUNTIME GATE (resolveProcessingActive; matris + evaluateProcessingGate) ═══
{
  // KEEP_LIVE grandfathered: registryEnabled=true, DB'ye bakmaz → runtime ne olursa aktif.
  add("A-keep-live-active-null", resolveProcessingActive("dogaltas:stones", null) === true);
  add("A-keep-live-active-ignores-runtime", resolveProcessingActive("dogaltas:stones", { isActive: false, backfillAllowed: false }) === true);
  // CONTROLLED dormant (registryEnabled=false): DB is_active=true olsa DAHI inactive.
  add("A-controlled-dormant-inactive-db-true", resolveProcessingActive("numeroloji:sources", { isActive: true, backfillAllowed: false }) === false);
  add("A-controlled-dormant-inactive-null", resolveProcessingActive("numeroloji:sources", null) === false);
  // Bilinmeyen key (belge_video:passages ARTIK source değil → retired) → fail-closed false.
  add("A-unknown-key-false", resolveProcessingActive("nope:x", { isActive: true, backfillAllowed: false }) === false);
  add("A-retired-belge-false", resolveProcessingActive("belge_video:passages", { isActive: true, backfillAllowed: false }) === false);

  // ÇİFT KAPI ispatı: hipotetik kod enabled:true bir CONTROLLED kaynak TEK BAŞINA aktive olmaz.
  const hyp: SourceActivationDesired = { sourceKey: "danisan:sessions", scope: "client", activationClass: "FUTURE_ONLY_READY", registryEnabled: true };
  add("A-code-enabled-runtime-null-inactive", evaluateProcessingGate(hyp, null).active === false);
  add("A-code-enabled-runtime-false-inactive", evaluateProcessingGate(hyp, { isActive: false, backfillAllowed: false }).active === false);
  add("A-both-gates-active", evaluateProcessingGate(hyp, { isActive: true, backfillAllowed: false }).active === true);
}

// ═══ B) EVENT PROCESSOR GATE (worker index-write chokepoint) ═══
{
  const stones = YH_INDEX_SOURCES.find((s) => s.sourceKey === "dogaltas:stones")!;
  const baseDeps = (over: Partial<EventProcessorDeps>): EventProcessorDeps => ({
    resolveConfig: (k) => (k === "dogaltas:stones" ? stones : null),
    runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult),
    deindex: async () => ({ status: "no-op" } as DeindexResult),
    ...over,
  });
  const ev: ClaimedOutboxEvent = {
    id: U1, sourceKey: "dogaltas:stones", sourceTable: "stones", sourceId: U2, tenantId: U1,
    operation: "upsert", attempts: 1, eventVersion: 1,
  } as ClaimedOutboxEvent;

  // Gate injected + inactive → complete no-op (index YAZILMAZ; deindex YAPILMAZ).
  let deindexCalled: boolean = false;
  const dInactive = await processOutboxEvent(ev, baseDeps({
    isSourceProcessingActive: async () => false,
    deindex: async () => { deindexCalled = true; return { status: "no-op" } as DeindexResult; },
    runExactUpsert: async () => { throw new Error("must-not-write"); },
  }));
  add("B-inactive-complete-noop", dInactive.action === "complete" && (dInactive as { note?: string }).note === "inactive-source-noop");
  add("B-inactive-no-deindex", !deindexCalled, "kill-switch: index korunur");

  // Gate injected + active → normal upsert akışı (write çağrılır).
  let upsertCalled: boolean = false;
  const dActive = await processOutboxEvent(ev, baseDeps({
    isSourceProcessingActive: async () => true,
    runExactUpsert: async () => { upsertCalled = true; return { exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult; },
  }));
  add("B-active-proceeds-upsert", dActive.action === "complete" && upsertCalled);

  // Gate injected + throw → transient (fail-closed; sessiz aktif YOK).
  const dErr = await processOutboxEvent(ev, baseDeps({
    isSourceProcessingActive: async () => { throw new Error("db-down"); },
    runExactUpsert: async () => { throw new Error("must-not-write"); },
  }));
  add("B-gate-error-transient", dErr.action === "fail" && (dErr as { retryClass?: string }).retryClass === "transient" && (dErr as { code?: string }).code === "activation-check-error");

  // Gate NOT injected (harness/geriye-uyum) → atlanır, mevcut davranış (upsert).
  let upsert2: boolean = false;
  const dNoGate = await processOutboxEvent(ev, baseDeps({
    runExactUpsert: async () => { upsert2 = true; return { exactStatus: "ok", write: { errors: [] } } as unknown as IndexSourcePageResult; },
  }));
  add("B-no-gate-backward-compat", dNoGate.action === "complete" && upsert2);
}

// ═══ C) STATIC WIRING (server-only gate + worker + eventProcessor) ═══
{
  add("C-gate-server-only", /^import "server-only";/m.test(GATE_SRC));
  add("C-gate-reads-activation-table", /from\("yh_source_activation"\)|ACTIVATION_TABLE\s*=\s*"yh_source_activation"/.test(GATE_SRC));
  add("C-gate-uses-evaluate-via-resolve", /resolveProcessingActive/.test(GATE_SRC));
  // Worker DAİMA gate'i enjekte eder.
  add("C-worker-imports-gate", /import \{ isSourceProcessingActive \} from "@\/lib\/yasam-hafizasi\/activation\/activationRuntimeGate"/.test(WORKER_SRC));
  add("C-worker-wires-gate", /isSourceProcessingActive:\s*\(sourceKey\)\s*=>\s*isSourceProcessingActive\(sourceKey, serverDb\)/.test(WORKER_SRC));
  // eventProcessor gate mevcut + fail-closed.
  add("C-ep-gate-present", /isSourceProcessingActive !== undefined/.test(EP_SRC));
  add("C-ep-gate-inactive-noop", /inactive-source-noop/.test(EP_SRC));
  add("C-ep-gate-error-transient", /activation-check-error/.test(EP_SRC));
  // Gate sadece isIndexableSource(Kapı 4)'ten SONRA (safe-non-pii+enabled kapısı korunur).
  add("C-ep-gate-after-indexable", EP_SRC.indexOf("source-not-indexable") < EP_SRC.indexOf("isSourceProcessingActive !== undefined"));
}

// ═══ D) COHORT DIZILIMI ═══
{
  let ok = true, detail = ""; try { validateActivationMatrix(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("D-matrix-validate", ok, detail);
  // Her kaynak bir kohort dispozisyonu alır (fail-closed default yok).
  add("D-every-entry-cohort", YH_ACTIVATION_MATRIX.every((e) => assessCohort(e).cohort.length > 0));
  // KEEP_LIVE 2 (grandfathered: dogaltas:stones + refleksoloji:notes). Cohort A (PRE-MERGE REVIEW
  // DÜZELTMESİ): worker-v1-supported 11 professional → FUTURE_ONLY_READY → COHORT_1_READY (archive dahil);
  // 5 worker-v1 kapsamı dışı kaynak → DEFERRED_SHARED_WORKER_V2 kohortu (aktivasyona hazır DEĞİL).
  add("D-keep-live-2", sourceKeysByCohort("KEEP_LIVE").length === 2 && sourceKeysByCohort("KEEP_LIVE").every((k) => k === "dogaltas:stones" || k === "refleksoloji:notes"), sourceKeysByCohort("KEEP_LIVE").join(","));
  add("D-archive-cohort1-ready", sourceKeysByCohort("COHORT_1_READY").includes("kisisel_arsiv:archives"));
  // COHORT_1_BLOCKED artık BOŞ (archive graduate; belge retired → source değil).
  add("D-cohort1-blocked-empty", sourceKeysByCohort("COHORT_1_BLOCKED").length === 0);
  add("D-belge-retired-not-cohort1", !sourceKeysByCohort("COHORT_1_BLOCKED").includes("belge_video:passages"));
  // COHORT_1_READY = kisisel_arsiv:archives (ROW_GATED_CONTROLLED) + 11 worker-v1-supported Cohort-A
  // professional FUTURE_ONLY_READY = 12; kod önkoşulları çözüldü → readyGap BOŞ.
  const cohort1Ready = YH_ACTIVATION_MATRIX.filter((e) => assessCohort(e).cohort === "COHORT_1_READY");
  add("D-cohort1-ready-12-no-gap", cohort1Ready.length === 12 && cohort1Ready.every((e) => assessCohort(e).readyGap.length === 0), cohort1Ready.map((e) => e.sourceKey).join(","));
  add("D-cohort1-ready-includes-archive", cohort1Ready.some((e) => e.sourceKey === "kisisel_arsiv:archives"));
  // DEFERRED_SHARED_WORKER_V2 kohortu = 5 (worker v1 işleyemez; readyGap DOLU → aktivasyona hazır DEĞİL).
  const deferredV2 = sourceKeysByCohort("DEFERRED_SHARED_WORKER_V2");
  add("D-deferred-worker-v2-cohort-5", deferredV2.length === 5 && deferredV2.every((k) => assessCohort(YH_ACTIVATION_MATRIX.find((e) => e.sourceKey === k)!).readyGap.length > 0), deferredV2.join(","));
  add("D-deferred-not-cohort1-ready", deferredV2.every((k) => !sourceKeysByCohort("COHORT_1_READY").includes(k)));
  // YEBS(6) + client(6) → COHORT_2.
  add("D-yebs-cohort2", sourceKeysByCohort("COHORT_2").filter((k) => k.startsWith("yebs:")).length === 6);
  add("D-client-cohort2", sourceKeysByCohort("COHORT_2").filter((k) => k.startsWith("danisan:")).length === 6);
  // Numeroloji professional → WAIT_FOR_CLEAN_RESET.
  add("D-numerology-wait-reset", sourceKeysByCohort("WAIT_FOR_CLEAN_RESET").length === 2 && sourceKeysByCohort("WAIT_FOR_CLEAN_RESET").every((k) => k.startsWith("numeroloji:")));
}

// ═══ E) KEEP_LIVE COMPATIBILITY (Cohort A: 19 canlı registry kaynak) ═══
{
  // Cohort A: 2 yeni Biyoenerji professional kaynağı enabled:true → live 17→19.
  add("E-live-count-19", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 19);
  // dormant professional 8 (2 numeroloji + 6 yebs) DEĞİŞMEDİ; client 6 dormant.
  add("E-dormant-professional-8", YH_INDEX_SOURCES.filter((s) => s.enabled === false).length === 8);
  add("E-client-all-dormant", YH_CLIENT_INDEX_SOURCES.every((s) => s.enabled === false));
  // KEEP_LIVE kaynaklar runtime gate'te DB gerektirmez (grandfathered → null runtime aktif).
  const keepLive = YH_ACTIVATION_MATRIX.filter((e) => e.activationClass === "KEEP_LIVE");
  add("E-keep-live-no-db-needed", keepLive.every((e) => resolveProcessingActive(e.sourceKey, null) === true));
}

// ═══ F) NUMEROLOGY CLIENT DEFERRED_HARD_BLOCKER (kesin korunur) ═══
{
  const dom = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "numeroloji_client_id");
  add("F-numerology-client-hard-blocker", dom?.result === "DEFERRED_HARD_BLOCKER" && dom.registrySourceKeys.length === 0);
  add("F-no-numerology-client-source", !YH_CLIENT_INDEX_SOURCES.some((s) => s.sourceKey.startsWith("numeroloji")));
  add("F-no-numerology-client-in-matrix", !YH_ACTIVATION_MATRIX.some((e) => e.scope === "client" && e.sourceKey.startsWith("numeroloji")));
}

// ═══ G) SECURITY / NO-BACKFILL ═══
{
  // Gate ham PII/source text OKUMAZ (yalnız is_active/backfill_allowed).
  add("G-gate-minimal-select", /select\("is_active, backfill_allowed"\)/.test(GATE_SRC));
  add("G-gate-no-source-text", !/passage_text|note_text|birth_date|client_name/i.test(GATE_SRC));
  // Bu turda historical backfill / reconcile-all / source DML YOK (kod-only gate).
  add("G-no-backfill-in-gate", !/backfill|reconcile-all|INSERT INTO|full.?scan/i.test(GATE_SRC.replace(/backfill_allowed|backfillAllowed/g, "")));
}

// ═══ H) REGRESSION VALIDATORS ═══
{
  const run = (fn: () => void): [boolean, string] => { try { fn(); return [true, ""]; } catch (e) { return [false, (e as Error).message]; } };
  const [m1, d1] = run(validateActivationMatrix); add("H-activation-matrix-validate", m1, d1);
  const [m2, d2] = run(validateModuleSourceMatrix); add("H-module-matrix-validate", m2, d2);
  const [m3, d3] = run(validateDeferredClosure); add("H-deferred-closure-validate", m3, d3);
  const [m4, d4] = run(validateAllClientSources); add("H-client-sources-validate", m4, d4);
  // activationEntryOf tutarlı.
  add("H-entry-of-consistent", activationEntryOf("dogaltas:stones")?.activationClass === "KEEP_LIVE" && activationEntryOf("nope") === undefined);
}
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-11E COHORT-1 HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

run().then(main);
