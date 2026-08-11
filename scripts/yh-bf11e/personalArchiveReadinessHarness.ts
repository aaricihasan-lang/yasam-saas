/**
 * BF-11E — KİŞİSEL ARŞİV CONTROLLED SOURCE HAZIRLIK HARNESS (PASS/BLOCKED).
 *
 * personalArchiveReadiness değerlendirmesinin bütünlüğünü + dispozisyon BLOCKED iken
 * CANLI koddaki fail-closed invaryantları doğrular. Amaç: Kişisel Arşiv'in güvenli/anlamlı
 * biçimde aktivasyona-hazır OLUP OLMADIĞINI exact kod ile kanıtlamak ve sessiz PII
 * regresyonunu (source-classification flip → kör backfill) imkânsız kılmak. Production/DB YOK.
 *   npm run yh:bf11e:archive:harness
 */
import {
  PERSONAL_ARCHIVE_READINESS,
  PERSONAL_ARCHIVE_SOURCE_KEY,
  validatePersonalArchiveReadiness,
} from "@/lib/yasam-hafizasi/activation/personalArchiveReadiness";
import { YH_INDEX_SOURCES } from "@/lib/yasam-hafizasi/indexer/sources";
import { evaluateSourceGuard } from "@/lib/yasam-hafizasi/indexer/sourceGuard";
import { supportsTenantScopedPage } from "@/lib/yasam-hafizasi/indexer/tenantScopeGate";
import { isArchiveRowIndexable } from "@/lib/yasam-hafizasi/archive/archiveClassificationRequest";
import { activationEntryOf, assessCohort } from "@/lib/yasam-hafizasi/activation/activationMatrix";
import { YH_DEFERRED_SOURCE_CLOSURE } from "@/lib/yasam-hafizasi/deferredSourceClosure";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const cfg = YH_INDEX_SOURCES.find((s) => s.sourceKey === PERSONAL_ARCHIVE_SOURCE_KEY);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

// ═══ A) DEĞERLENDİRME BÜTÜNLÜĞÜ ═══════════════════════════════════════════════
{
  let ok = true, detail = "";
  try { validatePersonalArchiveReadiness(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("A-readiness-validate-passes", ok, detail);
  add("A-disposition-blocked", PERSONAL_ARCHIVE_READINESS.disposition === "BLOCKED");
  add("A-product-fit-pass-in-principle", PERSONAL_ARCHIVE_READINESS.productFit === "PASS_IN_PRINCIPLE");
  add("A-four-preconditions", PERSONAL_ARCHIVE_READINESS.preconditions.length === 4);
  add("A-all-preconditions-open", PERSONAL_ARCHIVE_READINESS.preconditions.every((p) => p.satisfied === false));
}

// ═══ B) CANLI KOD FAIL-CLOSED KİLİTLERİ (sessiz PII regresyon savunması) ═══════
{
  add("B-registry-entry-exists", cfg !== undefined);
  add("B-classification-unclassified", cfg?.classification === "unclassified",
    `bulunan: ${cfg?.classification ?? "YOK"}`);
  add("B-enabled-true", cfg?.enabled === true);
  add("B-source-guard-rejects", cfg !== undefined && evaluateSourceGuard(cfg).indexable === false);
  add("B-no-blind-tenant-backfill", cfg !== undefined && supportsTenantScopedPage(cfg) === false);
}

// ═══ C) AKTİVASYON MATRİSİ + CLOSURE DİSPOZİSYONU ═════════════════════════════
{
  const entry = activationEntryOf(PERSONAL_ARCHIVE_SOURCE_KEY);
  add("C-matrix-entry-exists", entry !== undefined);
  add("C-cohort-1-blocked", entry !== undefined && assessCohort(entry).cohort === "COHORT_1_BLOCKED");
  add("C-row-gate-hash", entry?.rowGate === "row-classification-hash");
  add("C-backfill-blocked-pii", entry?.backfillEligibility === "blocked-pii");
  const closure = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "kisisel_arsiv_classification");
  add("C-closure-existing-fail-closed", closure?.result === "EXISTING_FAIL_CLOSED");
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

// ═══ E) NEGATİF KİLİT: flip simülasyonu backfill kapısını açar (kanıt) ════════
// validate()'in NEDEN bir güvenlik kilidi olduğunu KANITLAR: source-classification'ı
// 'safe-non-pii'ye çevirmek supportsTenantScopedPage'i true yapardı (kör PII backfill).
// Gerçek registry MUTATE EDİLMEZ; yalnız yerel kopya üzerinde gösterilir.
{
  if (cfg !== undefined) {
    const flipped = { ...cfg, classification: "safe-non-pii" as const };
    add("E-flip-would-open-backfill", supportsTenantScopedPage(flipped) === true,
      "flip → supportsTenantScopedPage true (kilidin koruduğu tam regresyon)");
    // Gerçek registry değişmedi.
    add("E-real-registry-unchanged", cfg.classification === "unclassified");
  } else {
    add("E-flip-would-open-backfill", false, "registry entry yok");
    add("E-real-registry-unchanged", false, "registry entry yok");
  }
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-11E PERSONAL ARCHIVE READINESS HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(`DISPOSITION: ${PERSONAL_ARCHIVE_READINESS.disposition} (product-fit ${PERSONAL_ARCHIVE_READINESS.productFit})\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: FAIL\n" : "RESULT: PASS (invariants locked; activation remains BLOCKED by design)\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
