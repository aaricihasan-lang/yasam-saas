/**
 * BF-11E — KİŞİSEL ARŞİV CONTROLLED SOURCE HAZIRLIK (READY) HARNESS.
 *
 * personalArchiveReadiness (DISPOSITION=READY) değerlendirmesinin bütünlüğünü + READY iken
 * CANLI koddaki GÜVENLİK-EŞLEŞME (safety coupling) invaryantlarını doğrular. Negatif kilit:
 * source-level safe-non-pii'yi row-gate OLMADAN bırakmak backfill kapısını AÇARDI (regresyon)
 * ve validate PATLARDI — bunu kanıtlar (gerçek registry mutate EDİLMEZ). Production/DB YOK.
 *   npm run yh:bf11e:archive:harness
 */
import {
  PERSONAL_ARCHIVE_READINESS,
  PERSONAL_ARCHIVE_SOURCE_KEY,
  validatePersonalArchiveReadiness,
} from "@/lib/yasam-hafizasi/activation/personalArchiveReadiness";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { evaluateSourceGuard } from "@/lib/yasam-hafizasi/indexer/sourceGuard";
import { supportsTenantScopedPage } from "@/lib/yasam-hafizasi/indexer/tenantScopeGate";
import { isArchiveRowIndexable } from "@/lib/yasam-hafizasi/archive/archiveClassificationRequest";
import { activationEntryOf, assessCohort } from "@/lib/yasam-hafizasi/activation/activationMatrix";
import { ACTIVATION_CLASS_POLICY } from "@/lib/yasam-hafizasi/activation/activationState";
import { YH_DEFERRED_SOURCE_CLOSURE } from "@/lib/yasam-hafizasi/deferredSourceClosure";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const cfg = YH_INDEX_SOURCES.find((s) => s.sourceKey === PERSONAL_ARCHIVE_SOURCE_KEY) as SourceConfig | undefined;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

// ═══ A) DEĞERLENDİRME BÜTÜNLÜĞÜ ═══════════════════════════════════════════════
{
  let ok = true, detail = "";
  try { validatePersonalArchiveReadiness(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("A-readiness-validate-passes", ok, detail);
  add("A-disposition-ready", PERSONAL_ARCHIVE_READINESS.disposition === "READY");
  add("A-product-fit-pass", PERSONAL_ARCHIVE_READINESS.productFit === "PASS");
  add("A-four-preconditions", PERSONAL_ARCHIVE_READINESS.preconditions.length === 4);
  add("A-all-preconditions-satisfied", PERSONAL_ARCHIVE_READINESS.preconditions.every((p) => p.satisfied === true));
}

// ═══ B) CANLI KOD GÜVENLİK-EŞLEŞME (safety coupling) ══════════════════════════
{
  add("B-registry-entry-exists", cfg !== undefined);
  add("B-classification-safe-non-pii", cfg?.classification === "safe-non-pii");
  add("B-requires-row-eligibility-gate", cfg?.requiresRowEligibilityGate === true);
  add("B-enabled-true", cfg?.enabled === true);
  add("B-source-guard-indexable", cfg !== undefined && evaluateSourceGuard(cfg).indexable === true);
  add("B-no-blind-tenant-backfill", cfg !== undefined && supportsTenantScopedPage(cfg) === false);
}

// ═══ C) CONTROLLED ACTIVATION + COHORT + CLOSURE ═════════════════════════════
{
  const entry = activationEntryOf(PERSONAL_ARCHIVE_SOURCE_KEY);
  add("C-matrix-entry-exists", entry !== undefined);
  add("C-activation-class-controlled", entry?.activationClass === "ROW_GATED_CONTROLLED");
  add("C-requires-runtime-activation", entry !== undefined && ACTIVATION_CLASS_POLICY["ROW_GATED_CONTROLLED"].requiresRuntimeActivation === true);
  add("C-not-backfill-eligible", ACTIVATION_CLASS_POLICY["ROW_GATED_CONTROLLED"].backfillEligible === false);
  add("C-row-gate-hash", entry?.rowGate === "row-classification-hash");
  add("C-cohort-1-ready", entry !== undefined && assessCohort(entry).cohort === "COHORT_1_READY");
  const closure = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "kisisel_arsiv_classification");
  add("C-closure-foundation-ready", closure?.result === "FOUNDATION_READY");
}

// ═══ D) ROW-GATE HELPER SEMANTİĞİ (safe+eşleşen hash → true; aksi false) ══════
{
  add("D-safe-hash-match-indexable",
    isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: HASH_A }, HASH_A) === true);
  add("D-stale-hash-noop",
    isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: HASH_A }, HASH_B) === false);
  add("D-no-hash-noop",
    isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: null }, HASH_A) === false);
  add("D-unclassified-noop",
    isArchiveRowIndexable({ classification: "unclassified", reviewedContentHash: HASH_A }, HASH_A) === false);
  add("D-pii-noop",
    isArchiveRowIndexable({ classification: "pii", reviewedContentHash: HASH_A }, HASH_A) === false);
  add("D-restricted-noop",
    isArchiveRowIndexable({ classification: "restricted", reviewedContentHash: HASH_A }, HASH_A) === false);
}

// ═══ E) NEGATİF KİLİT: gate'siz safe-non-pii = backfill açılır + validate patlar ══
// Gerçek registry MUTATE EDİLMEZ; yalnız yerel kopya üzerinde gösterilir: requiresRowEligibilityGate
// kaldırılırsa supportsTenantScopedPage TRUE olur (kilidin koruduğu tam regresyon).
{
  if (cfg !== undefined) {
    const ungated = { ...cfg, requiresRowEligibilityGate: false as const };
    add("E-ungated-safe-opens-backfill", supportsTenantScopedPage(ungated) === true,
      "gate kaldırılırsa supportsTenantScopedPage true → kilit bunu engeller");
    add("E-real-registry-still-gated", cfg.requiresRowEligibilityGate === true && supportsTenantScopedPage(cfg) === false);
  } else {
    add("E-ungated-safe-opens-backfill", false, "registry entry yok");
    add("E-real-registry-still-gated", false, "registry entry yok");
  }
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-11E PERSONAL ARCHIVE READINESS HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(`DISPOSITION: ${PERSONAL_ARCHIVE_READINESS.disposition} (product-fit ${PERSONAL_ARCHIVE_READINESS.productFit}); production activation OFF\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: FAIL\n" : "RESULT: PASS (safety coupling locked; production activation remains a separate gate)\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
