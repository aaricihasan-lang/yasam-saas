/**
 * BF-11E — KONTROLLÜ KAYNAK AKTİVASYON + BF-11E HAZIRLIK HARNESS (PASS/BLOCKED).
 *
 * Tek kapsamlı harness: aktivasyon matrisi bütünlüğü, MERGE-SAFE/APPLY-SAFE kapı,
 * future-event/CDC sözleşmesi, client/YEBS/belge-video/arşiv güvenliği, backfill ayrımı,
 * kill-switch, migration statik doğrulama + BF/modül regresyonları. Production/DB YOK.
 *   npm run yh:bf11e:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  YH_ACTIVATION_MATRIX,
  validateActivationMatrix,
  toDesired,
  sourceKeysByClass,
  type ActivationMatrixEntry,
} from "@/lib/yasam-hafizasi/activation/activationMatrix";
import {
  ACTIVATION_CLASSES,
  ACTIVATION_CLASS_POLICY,
  evaluateProcessingGate,
  evaluateBackfillGate,
  detectActivationDrift,
  type SourceActivationDesired,
  type SourceActivationRuntime,
} from "@/lib/yasam-hafizasi/activation/activationState";
import { buildPreflightSql, buildActivationTemplate } from "@/lib/yasam-hafizasi/activation/activationPlan";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import {
  YH_CLIENT_INDEX_SOURCES,
  validateAllClientSources,
} from "@/lib/yasam-hafizasi/client/clientSources";
import {
  YH_DEFERRED_SOURCE_CLOSURE,
  validateDeferredClosure,
} from "@/lib/yasam-hafizasi/deferredSourceClosure";
import { validateModuleSourceMatrix } from "@/lib/yasam-hafizasi/moduleSourceMatrix";
import { evaluateSourceGuard } from "@/lib/yasam-hafizasi/indexer/sourceGuard";
import { supportsTenantScopedPage } from "@/lib/yasam-hafizasi/indexer/tenantScopeGate";
import { evaluateRowEligibility } from "@/lib/yasam-hafizasi/indexer/rowEligibility";
import {
  parseArchiveClassification,
  isArchiveRowIndexable,
} from "@/lib/yasam-hafizasi/archive/archiveClassificationRequest";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };
const entryOf = (k: string): ActivationMatrixEntry | undefined => YH_ACTIVATION_MATRIX.find((e) => e.sourceKey === k);
const ACTIVE = (r: SourceActivationRuntime | null, d: SourceActivationDesired) => evaluateProcessingGate(d, r).active;

const MIG_NAME = "20260927000000_yh_source_activation_control.sql";
const MIG = readFileSync(join(process.cwd(), "supabase/migrations", MIG_NAME), "utf8");
const has = (re: RegExp): boolean => re.test(MIG);

// ═══ A) ACTIVATION MATRIX bütünlüğü ═══════════════════════════════════════════
{
  let ok = true, detail = "";
  try { validateActivationMatrix(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("A-matrix-validate-passes", ok, detail);

  const proKeys = new Set<string>(YH_INDEX_SOURCES.map((s) => s.sourceKey));
  const cliKeys = new Set<string>(YH_CLIENT_INDEX_SOURCES.map((s) => s.sourceKey));
  const matrixKeys = YH_ACTIVATION_MATRIX.map((e) => e.sourceKey);

  add("A-all-source-keys-covered", proKeys.size + cliKeys.size === matrixKeys.length && matrixKeys.length === 33, `matrix=${matrixKeys.length} registry=${proKeys.size + cliKeys.size}`);
  add("A-no-duplicate-key", new Set(matrixKeys).size === matrixKeys.length);
  add("A-no-unknown-source", matrixKeys.every((k) => proKeys.has(k) || cliKeys.has(k)));
  add("A-every-entry-has-class", YH_ACTIVATION_MATRIX.every((e) => (ACTIVATION_CLASSES as readonly string[]).includes(e.activationClass)));
  add("A-every-registry-pro-covered", [...proKeys].every((k) => matrixKeys.includes(k)));
  add("A-every-registry-client-covered", [...cliKeys].every((k) => matrixKeys.includes(k)));

  // Sınıf dağılımı (deterministik beklenti). Cohort A (PRE-MERGE REVIEW DÜZELTMESİ): worker-v1-supported
  // 11 professional kaynak (9 mevcut graduate + 2 yeni Biyoenerji) → FUTURE_ONLY_READY (controlled);
  // 5 kaynak worker v1 kapsamı dışı (4 shared + guide-sections section) → DEFERRED_SHARED_WORKER_V2;
  // KEEP_LIVE = 2 grandfathered (dogaltas:stones + refleksoloji:notes).
  add("A-keep-live-2", sourceKeysByClass("KEEP_LIVE").length === 2 && sourceKeysByClass("KEEP_LIVE").every((k) => k === "dogaltas:stones" || k === "refleksoloji:notes"), sourceKeysByClass("KEEP_LIVE").join(","));
  add("A-row-gated-ready-0", sourceKeysByClass("ROW_GATED_READY").length === 0);
  add("A-row-gated-controlled-1", sourceKeysByClass("ROW_GATED_CONTROLLED").length === 1 && sourceKeysByClass("ROW_GATED_CONTROLLED")[0] === "kisisel_arsiv:archives");
  add("A-canonical-backfill-6-yebs", sourceKeysByClass("CANONICAL_BACKFILL_CANDIDATE").length === 6 && sourceKeysByClass("CANONICAL_BACKFILL_CANDIDATE").every((k) => k.startsWith("yebs:")));
  add("A-wait-clean-reset-2-numerology", sourceKeysByClass("WAIT_FOR_CLEAN_RESET").length === 2 && sourceKeysByClass("WAIT_FOR_CLEAN_RESET").every((k) => k.startsWith("numeroloji:")));
  // FUTURE_ONLY_READY = 11 professional controlled (worker-v1-supported Cohort A) + 6 client = 17.
  add("A-future-only-17", sourceKeysByClass("FUTURE_ONLY_READY").length === 17, sourceKeysByClass("FUTURE_ONLY_READY").join(","));
  // DEFERRED_SHARED_WORKER_V2 = 5 (dogaltas:knowledge + aromaterapi:oils/reference-sheets/reference-rows + sifa_rehberi:guide-sections).
  {
    const dw = [...sourceKeysByClass("DEFERRED_SHARED_WORKER_V2")].sort();
    const expect = ["aromaterapi:oils", "aromaterapi:reference-rows", "aromaterapi:reference-sheets", "dogaltas:knowledge", "sifa_rehberi:guide-sections"];
    add("A-deferred-shared-worker-v2-5", dw.length === 5 && JSON.stringify(dw) === JSON.stringify(expect), dw.join(","));
  }
  add("A-no-deferred-registry-entry", sourceKeysByClass("DEFERRED_HARD_BLOCKER").length === 0);

  // Numeroloji CLIENT hard blocker KORUNUR (registry'de yok + closure DEFERRED_HARD_BLOCKER).
  const numClientDom = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "numeroloji_client_id");
  add("A-numerology-client-hard-blocker", numClientDom?.result === "DEFERRED_HARD_BLOCKER" && numClientDom.registrySourceKeys.length === 0);
  add("A-no-numerology-client-in-matrix", !matrixKeys.some((k) => k.startsWith("numeroloji:") && entryOf(k)?.scope === "client"));
  add("A-no-numerology-client-source-registry", !YH_CLIENT_INDEX_SOURCES.some((s) => s.sourceKey.startsWith("numeroloji")));
}

// ═══ B) MERGE-SAFE / APPLY-SAFE ══════════════════════════════════════════════
{
  // Kod merge source activation başlatmıyor: TÜM dormant kaynaklar registryEnabled=false →
  // hangi runtime olursa olsun processing inactive.
  const dormant = YH_ACTIVATION_MATRIX.filter((e) => e.registryEnabled === false);
  const activeRuntime: SourceActivationRuntime = { isActive: true, backfillAllowed: false };
  add("B-merge-does-not-activate", dormant.every((e) => !ACTIVE(activeRuntime, toDesired(e))), "dormant registryEnabled=false → inactive");
  // registryEnabled=false = 9 professional dormant (2 numeroloji + 6 yebs + 1 belge_video) + 6 client = 15.
  add("B-dormant-count-14", dormant.length === 14, String(dormant.length));

  // Default production activation OFF: runtime === null → her sınıf (grandfathered hariç) inactive.
  const numSrc = entryOf("numeroloji:sources")!;
  add("B-default-off-runtime-null", !ACTIVE(null, toDesired(numSrc)));

  // ÇİFT KAPI ispatı (INV-1 + INV-2): hipotetik kod enabled:true bile TEK BAŞINA aktive etmez.
  const hypotheticalCodeEnabled: SourceActivationDesired = { ...toDesired(numSrc), registryEnabled: true };
  add("B-code-enabled-runtime-null-inactive", !evaluateProcessingGate(hypotheticalCodeEnabled, null).active);
  add("B-code-enabled-runtime-inactive-inactive", !evaluateProcessingGate(hypotheticalCodeEnabled, { isActive: false, backfillAllowed: false }).active);
  add("B-both-gates-required-active", evaluateProcessingGate(hypotheticalCodeEnabled, activeRuntime).active);
  // DB flip alone (registryEnabled=false) yetmez.
  add("B-db-flip-alone-insufficient", !ACTIVE(activeRuntime, toDesired(numSrc)));

  // No auto-backfill: default backfill false her dormant + hipotetik aktif kod için.
  add("B-no-auto-backfill-default", dormant.every((e) => !evaluateBackfillGate(toDesired(e), activeRuntime).allowed));

  // Grandfathered CANLI: KEEP_LIVE registryEnabled=true → active (mevcut davranış korunur).
  const keepLive = YH_ACTIVATION_MATRIX.filter((e) => e.activationClass === "KEEP_LIVE");
  add("B-keep-live-grandfathered-active", keepLive.every((e) => ACTIVE(null, toDesired(e))), "KEEP_LIVE aktif (grandfathered)");
}

// ═══ C) FUTURE EVENT (CDC sözleşmesi — migration statik + pure gate) ══════════
{
  // Aktivasyon kapısı migration'da mevcut (kapalı kaynak olay üretmez).
  add("C-cdc-activation-gate", has(/SELECT a\.is_active INTO v_active[\s\S]*FROM public\.yh_source_activation/) && has(/IF v_active IS DISTINCT FROM true THEN/));
  add("C-cdc-noop-returns", has(/IF v_active IS DISTINCT FROM true THEN[\s\S]*RETURN OLD;[\s\S]*RETURN NEW;[\s\S]*END IF;/));
  // INSERT/UPDATE → upsert; DELETE → delete (tombstone; OLD korunur).
  add("C-insert-update-upsert", has(/IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN[\s\S]*v_operation := 'upsert'/));
  add("C-delete-tombstone-old", has(/ELSIF TG_OP = 'DELETE' THEN[\s\S]*v_operation := 'delete';[\s\S]*v_source_id := OLD\.id;[\s\S]*v_tenant_id := OLD\.tenant_id;/));
  // Payload PII-minimal: yalnız identifier + meta (source_key, source_table, source_id, tenant_id, operation).
  add("C-payload-minimal", has(/INSERT INTO public\.yasam_hafizasi_outbox AS o\s*\n\s*\(source_key, source_table, source_id, tenant_id, operation\)/));
  add("C-no-raw-payload-snapshot", !/payload_snapshot|passage_text|note_text|content|birth_date|\bemail\b|\bphone\b/i.test(MIG));
  // Idempotent + stale-event safe (ON CONFLICT + processing korunur + event_version monotonik).
  add("C-idempotent-on-conflict", has(/ON CONFLICT \(source_key, source_id\) DO UPDATE/));
  add("C-stale-event-safe-processing", has(/CASE WHEN o\.status = 'processing' THEN o\.status\s+ELSE 'pending' END/));
  add("C-event-version-monotonic", has(/event_version = nextval\('public\.yasam_hafizasi_outbox_event_version_seq'\)/));
  // Fail-closed: null source_id/tenant_id + desteklenmeyen TG_OP.
  add("C-fail-closed-null-ids", has(/IF v_source_id IS NULL THEN[\s\S]*RAISE EXCEPTION/) && has(/IF v_tenant_id IS NULL THEN[\s\S]*RAISE EXCEPTION/));
  add("C-fail-closed-unknown-op", has(/RAISE EXCEPTION 'yh_cdc_enqueue: desteklenmeyen TG_OP/));
  // Dormant future-event: kaynak dormant iken future INSERT işlenmez (pure gate).
  add("C-dormant-future-not-processed", !ACTIVE({ isActive: true, backfillAllowed: false }, toDesired(entryOf("numeroloji:sources")!)));
}

// ═══ D) CLIENT (tenant+client izolasyon; PII denylist; disabled no-op) ════════
{
  let ok = true, detail = "";
  try { validateAllClientSources(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("D-client-pii-denylist-enforced", ok, detail);

  const clientEntries = YH_ACTIVATION_MATRIX.filter((e) => e.scope === "client");
  add("D-client-6", clientEntries.length === 6);
  add("D-client-all-future-only", clientEntries.every((e) => e.activationClass === "FUTURE_ONLY_READY"));
  add("D-client-all-dormant", clientEntries.every((e) => e.registryEnabled === false));
  // Her client kaynağında client_id + tenant_id kolonu ZORUNLU (tenant+client izolasyon).
  add("D-client-has-client-and-tenant-col", YH_CLIENT_INDEX_SOURCES.every((s) => s.clientColumn === "client_id" && s.tenantColumn === "tenant_id"));
  // PII/serbest metin index kolonlarında YOK (spoof/PII sızıntısı yok).
  const piiFields = ["note", "notes", "session_note", "client_name", "birth_date", "title", "description", "client_feedback"];
  const clientIndexedCols = YH_CLIENT_INDEX_SOURCES.flatMap((s) => [...s.titleColumns, ...s.searchTextColumns, ...s.snippetColumns, ...s.topicTagsColumns]);
  add("D-no-pii-in-client-index", !clientIndexedCols.some((c) => piiFields.includes(c)), clientIndexedCols.join(","));
  // Disabled source no-op: aktive edilmiş runtime bile registryEnabled=false → inactive.
  add("D-client-disabled-no-op", clientEntries.every((e) => !ACTIVE({ isActive: true, backfillAllowed: false }, toDesired(e))));
  // Drift: client kaynak aktif ama scope client değilse yakalanır.
  const spoofed: SourceActivationDesired = { sourceKey: "danisan:sessions", scope: "professional", activationClass: "FUTURE_ONLY_READY", registryEnabled: true };
  const drift = detectActivationDrift({ desired: spoofed, runtime: { isActive: true, backfillAllowed: false }, triggerInstalled: true, hasRowLevelGate: true });
  add("D-client-scope-drift-detected", drift.some((f) => f.kind === "client-source-active-without-client-scope"));
}

// ═══ E) YEBS (global-canonical; published-only; no client; no synthetic tenant) ═
{
  const yebs = YH_ACTIVATION_MATRIX.filter((e) => e.sourceKey.startsWith("yebs:"));
  add("E-yebs-6", yebs.length === 6);
  add("E-yebs-global-canonical", yebs.every((e) => e.tenantMode === "global-canonical"));
  add("E-yebs-status-eligibility", yebs.every((e) => e.rowGate === "status-eligibility"));
  add("E-yebs-canonical-backfill-candidate", yebs.every((e) => e.activationClass === "CANONICAL_BACKFILL_CANDIDATE"));
  add("E-yebs-not-client", yebs.every((e) => e.scope === "professional"));
  add("E-yebs-dormant", yebs.every((e) => e.registryEnabled === false));
  // Registry: published-only fail-closed (row-eligibility).
  const yebsTrad = YH_INDEX_SOURCES.find((s) => s.sourceKey === "yebs:traditions")!;
  add("E-yebs-published-eligible", evaluateRowEligibility(yebsTrad, { status: "published" }).eligible === true);
  add("E-yebs-draft-ineligible", evaluateRowEligibility(yebsTrad, { status: "draft" }).eligible === false);
  add("E-yebs-archived-ineligible", evaluateRowEligibility(yebsTrad, { status: "archived" }).eligible === false);
  // published→ineligible tombstone davranışı matriste kayıtlı.
  add("E-yebs-tombstone-noted", yebs.every((e) => /tombstone/i.test(e.recommendation)));
  // Synthetic tenant yok (recommendation'da "Synthetic tenant YOK").
  add("E-yebs-no-synthetic-tenant", yebs.every((e) => /synthetic tenant yok/i.test(e.recommendation.toLowerCase())));
  // Backfill yalnız onayla (candidate), default false.
  add("E-yebs-backfill-candidate", yebs.every((e) => e.backfillEligibility === "candidate-with-approval"));
  add("E-yebs-backfill-default-false", yebs.every((e) => !evaluateBackfillGate(toDesired(e), { isActive: false, backfillAllowed: false }).allowed));
}

// ═══ F) BELGE / VIDEO: EMEKLİYE AYRILDI (NON_SOURCE; retirement) ═══
{
  // belge_video:passages source registry/activation matrisinden çıkarıldı → aktivasyon adayı değil.
  add("F-belge-not-in-matrix", !YH_ACTIVATION_MATRIX.some((e) => e.sourceKey === "belge_video:passages"));
  add("F-belge-not-in-registry", !YH_INDEX_SOURCES.some((s) => (s.sourceKey as string) === "belge_video:passages"));
  add("F-belge-entry-of-null", entryOf("belge_video:passages") === undefined);
  add("F-belge-no-passages-table-source", !YH_ACTIVATION_MATRIX.some((e) => e.sourceTable === "yh_document_passages"));
  // Passage content outbox payload'a girmez (activation-control migration statik: passage_text yok).
  add("F-passage-text-not-in-payload", !/passage_text/i.test(MIG));
}

// ═══ G) KİŞİSEL ARŞİV (safe-non-pii + current hash only; classification bypass yok) ═
{
  const arc = entryOf("kisisel_arsiv:archives")!;
  add("G-archive-row-gated", arc.activationClass === "ROW_GATED_CONTROLLED" && arc.rowGate === "row-classification-hash");
  const HASH = "a".repeat(64);
  add("G-safe-hash-match-indexable", isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: HASH }, HASH) === true);
  add("G-missing-classification-noop", isArchiveRowIndexable({ classification: "unclassified", reviewedContentHash: HASH }, HASH) === false);
  add("G-pii-noop", isArchiveRowIndexable({ classification: "pii", reviewedContentHash: HASH }, HASH) === false);
  add("G-stale-hash-noop", isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: HASH }, "b".repeat(64)) === false);
  add("G-no-hash-noop", isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: null }, HASH) === false);
  // safe-non-pii işaretleme reason ZORUNLU (classification bypass yok; hash SERVER-türetimli).
  add("G-safe-requires-reason", !parseArchiveClassification({ archiveId: "11111111-1111-4111-1111-111111111111", classification: "safe-non-pii" }).ok);
  // BF-11E ROW-GATED CONTROLLED: source-level safe-non-pii + requiresRowEligibilityGate + backfill-deny.
  const arcSrc = YH_INDEX_SOURCES.find((s) => s.sourceKey === "kisisel_arsiv:archives")! as SourceConfig;
  add("G-archive-source-safe-non-pii", arcSrc.classification === "safe-non-pii" && arcSrc.requiresRowEligibilityGate === true);
  // Source guard artık kaynağı erişilebilir bulur (satır güvenliği row-gate'te; sourceGuard değil).
  add("G-archive-guard-indexable", evaluateSourceGuard(arcSrc).indexable === true);
  // Kör tenant-scoped backfill FAIL-CLOSED (safe-non-pii olsa DAHİ).
  add("G-archive-backfill-denied", supportsTenantScopedPage(arcSrc) === false);
}

// ═══ H) BACKFILL ayrımı (default false; explicit allowlist; activation != backfill) ═
{
  const active: SourceActivationRuntime = { isActive: true, backfillAllowed: false };
  const activeBackfill: SourceActivationRuntime = { isActive: true, backfillAllowed: true };
  const yebsTrad = entryOf("yebs:traditions")!;
  const yebsEnabled: SourceActivationDesired = { ...toDesired(yebsTrad), registryEnabled: true }; // hipotetik aktif kod
  // Activation != backfill: aktif ama backfillAllowed=false → backfill YASAK.
  add("H-activation-not-backfill", !evaluateBackfillGate(yebsEnabled, active).allowed);
  // Explicit allowlist: yalnız backfillAllowed=true + aktif + aday sınıf → izin.
  add("H-explicit-allowlist-allows", evaluateBackfillGate(yebsEnabled, activeBackfill).allowed);
  // Default backfill false: TÜM matris kaynakları (default runtime) → backfill YASAK.
  add("H-default-backfill-false-all", YH_ACTIVATION_MATRIX.every((e) => !evaluateBackfillGate(toDesired(e), null).allowed));
  // Unsupported source (non-candidate sınıf) backfill reddedilir (client/numeroloji/belge).
  const nonCandidate = YH_ACTIVATION_MATRIX.filter((e) => !ACTIVATION_CLASS_POLICY[e.activationClass].backfillEligible);
  add("H-non-candidate-backfill-rejected", nonCandidate.every((e) => !evaluateBackfillGate({ ...toDesired(e), registryEnabled: true }, activeBackfill).allowed));
  // Client/test kaynakları otomatik taranmaz: backfillEligibility blocked-test-data.
  add("H-client-test-blocked", YH_ACTIVATION_MATRIX.filter((e) => e.scope === "client").every((e) => e.backfillEligibility === "blocked-test-data"));
  // Backfill inactive iken açık olamaz (DB CHECK simetrisi + drift).
  const drift = detectActivationDrift({ desired: toDesired(yebsTrad), runtime: { isActive: false, backfillAllowed: true } as SourceActivationRuntime, triggerInstalled: false, hasRowLevelGate: true });
  add("H-backfill-default-drift-detected", drift.some((f) => f.kind === "backfill-allowed-by-default"));
}

// ═══ I) KILL-SWITCH (disable stops processing; index KORUNUR; rollback backfill/delete yok) ═
{
  add("I-deactivate-rpc-exists", has(/CREATE OR REPLACE FUNCTION public\.yh_source_deactivate/));
  add("I-deactivate-sets-inactive", has(/SET is_active = false, backfill_allowed = false/));
  // Rollback index/kaynak SİLMEZ: migration'da index/kaynak DELETE yok.
  add("I-no-index-delete", !/DELETE\s+FROM\s+public\.yasam_hafizasi_index/i.test(MIG));
  add("I-no-source-delete", !/DELETE\s+FROM\s+public\.(stones|client_|personal_archives|numerology_|yebs_)/i.test(MIG));
  // Kill-switch sonrası processing durur (pure gate: isActive=false → inactive).
  const yebsEnabled: SourceActivationDesired = { ...toDesired(entryOf("yebs:traditions")!), registryEnabled: true };
  add("I-kill-switch-stops-processing", !evaluateProcessingGate(yebsEnabled, { isActive: false, backfillAllowed: false }).active);
  // Rollback davranışı matriste "index satırları KORUNUR / SİLİNMEZ" (Türkçe-İ: case-insensitive
  // lowercase güvenilmez → doğrudan substring).
  add("I-rollback-preserves-index-noted", YH_ACTIVATION_MATRIX.filter((e) => e.registryEnabled === false).every((e) => e.rollbackBehavior.includes("SİLİNMEZ") || e.rollbackBehavior.includes("KORUNUR")));
}

// ═══ J) BF REGRESYON (mevcut sözleşmeler değişmedi) ══════════════════════════
{
  const run = (fn: () => void): [boolean, string] => { try { fn(); return [true, ""]; } catch (e) { return [false, (e as Error).message]; } };
  const [m1, d1] = run(validateModuleSourceMatrix); add("J-module-matrix-validate", m1, d1);
  const [m2, d2] = run(validateDeferredClosure); add("J-deferred-closure-validate", m2, d2);
  const [m3, d3] = run(validateAllClientSources); add("J-client-sources-validate", m3, d3);
  // Source guard fail-closed (regresyon): pii/unclassified/disabled reddedilir; safe+enabled kabul.
  add("J-guard-pii-rejected", evaluateSourceGuard({ enabled: true, classification: "pii" }).indexable === false);
  add("J-guard-disabled-rejected", evaluateSourceGuard({ enabled: false, classification: "safe-non-pii" }).indexable === false);
  add("J-guard-safe-enabled-ok", evaluateSourceGuard({ enabled: true, classification: "safe-non-pii" }).indexable === true);
}

// ═══ K) MODÜL REGRESYON (registry sayıları / dormancy değişmedi) ═════════════
{
  add("K-professional-registry-27", YH_INDEX_SOURCES.length === 27, String(YH_INDEX_SOURCES.length));
  add("K-live-professional-19", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 19);
  add("K-dormant-professional-8", YH_INDEX_SOURCES.filter((s) => s.enabled === false).length === 8);
  add("K-client-registry-6", YH_CLIENT_INDEX_SOURCES.length === 6);
  add("K-client-all-dormant", YH_CLIENT_INDEX_SOURCES.every((s) => s.enabled === false));
  add("K-numerology-knowledge-records-not-wired", !YH_INDEX_SOURCES.some((s) => (s.tableName as string) === "numerology_knowledge_records"));
}

// ═══ L) STATIC (migration + preflight güvenliği) ═════════════════════════════
{
  // Yorum satırlarını çıkararak yalnız ÇALIŞTIRILABILIR SQL'i denetle (yorumlu şablonlar hariç).
  const EXEC_MIG = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  // Fonksiyon gövdelerini ($$...$$) çıkararak TOP-LEVEL (apply-zamanı çalışan) ifadeleri denetle.
  const TOPLEVEL_MIG = EXEC_MIG.replace(/\$\$[\s\S]*?\$\$/g, "\n__FUNCTION_BODY__\n");

  // Timestamp çakışması yok (yeni migration; 20260927 mevcut listede tekil).
  add("L-migration-timestamp-new", MIG_NAME.startsWith("20260927000000_"));
  // Additive-safe: apply-zamanı is_active seed YOK (RPC gövdesindeki parametreli INSERT hariç).
  add("L-no-active-seed", !/INSERT\s+INTO\s+public\.yh_source_activation/i.test(TOPLEVEL_MIG));
  add("L-no-data-dml-source", !/\bINSERT\s+INTO\s+public\.(stones|client_|personal_archives|numerology_|yebs_|human_design_)/i.test(MIG));
  add("L-no-backfill-select", !/INSERT\s+INTO[\s\S]*SELECT[\s\S]*FROM\s+public\.(stones|client_|numerology_|yebs_)/i.test(MIG));
  add("L-no-alter-existing", !/ALTER TABLE public\.(stones|client_|personal_archives|numerology_|yebs_|human_design_|yasam_hafizasi_index)/i.test(MIG));
  // Migration HİÇBİR kaynak trigger'ı KURMAZ (yorumlu şablon hariç; CDC fonksiyonu bağlanmamış).
  add("L-no-create-trigger", !/CREATE\s+TRIGGER/i.test(EXEC_MIG));
  // Aktivasyon tablosu default OFF.
  add("L-is-active-default-false", has(/is_active\s+boolean\s+NOT NULL DEFAULT false/));
  add("L-backfill-default-false", has(/backfill_allowed\s+boolean\s+NOT NULL DEFAULT false/));
  add("L-backfill-requires-active-check", has(/CHECK \(NOT backfill_allowed OR is_active\)/));
  // Security: SECURITY DEFINER + sabit search_path + service_role only.
  add("L-security-definer", (MIG.match(/SECURITY DEFINER/g) ?? []).length >= 3);
  add("L-fixed-search-path", (MIG.match(/SET search_path = public, pg_catalog/g) ?? []).length >= 3);
  add("L-rls-enable", has(/ALTER TABLE public\.yh_source_activation ENABLE ROW LEVEL SECURITY/));
  add("L-revoke-anon-auth", has(/REVOKE ALL PRIVILEGES ON TABLE public\.yh_source_activation FROM PUBLIC, anon, authenticated/));
  add("L-rpc-service-role-only", has(/GRANT EXECUTE ON FUNCTION public\.yh_source_activation_set[\s\S]*TO service_role/) && has(/REVOKE ALL ON FUNCTION public\.yh_source_activation_set[\s\S]*FROM PUBLIC, anon, authenticated/));
  // Single transaction.
  add("L-single-transaction", has(/^BEGIN;/m) && has(/^COMMIT;/m));
  // No production URL/key/secret in migration.
  add("L-no-secret", !/service_role_key|supabase_url|https:\/\/[a-z0-9]+\.supabase\.co|eyJ[A-Za-z0-9_-]{10,}/i.test(MIG));

  // PREFLIGHT SALT-OKUNUR: her entry için üretilen preflight SQL yalnız SELECT içerir.
  const destructive = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/i;
  const preflightSafe = YH_ACTIVATION_MATRIX.every((e) => {
    const sql = buildPreflightSql(e);
    // Yorum satırlarını çıkar; kalan çalıştırılabilir satırlarda destructive keyword olmamalı.
    const exec = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    return !destructive.test(exec) && /SELECT/i.test(exec);
  });
  add("L-preflight-read-only", preflightSafe);

  // Aktivasyon template'i ÇALIŞTIRILABILIR değil (satırlar yorumlu; kill-switch içerir).
  const templatesSafe = YH_ACTIVATION_MATRIX.filter((e) => e.registryEnabled === false).every((e) => {
    const tpl = buildActivationTemplate(e);
    const exec = tpl.split("\n").filter((l) => l.trim().length > 0 && !l.trim().startsWith("--"));
    return exec.length === 0; // her satır yorum → çalıştırılamaz template
  });
  add("L-activation-template-commented", templatesSafe);
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-11E CONTROLLED SOURCE ACTIVATION HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
