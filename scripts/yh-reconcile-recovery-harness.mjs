/**
 * Yaşam Hafızası™ — BF-11D Recovery Health Observability harness.
 * ====================================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, AĞ'SIZ. Yeni recovery motoru YOKTUR:
 * `computeRecoveryHealth` YALNIZ gözlemler; failure-recovery sözleşmesi BF-11A
 * `outboxState` GERÇEK fonksiyonlarıyla parite gösterir (kopya YOK).
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/yh-reconcile-recovery-harness.mjs
 */
import { computeRecoveryHealth } from "../lib/yasam-hafizasi/reconcile/reconcileEntry.ts";
import {
  decideFail,
  decideComplete,
  decideLeaseRecovery,
  computeBackoffSeconds,
  isValidTransition,
  DEFAULT_MAX_ATTEMPTS,
} from "../lib/yasam-hafizasi/outbox/outboxState.ts";

let pass = 0;
let fail = 0;
const fails = [];
function check(cat, desc, cond) {
  if (cond) pass += 1;
  else {
    fail += 1;
    fails.push(`[${cat}] ${desc}`);
    console.error(`  FAIL  [${cat}] ${desc}`);
  }
}

const NOW = Date.parse("2026-07-29T12:00:00Z");
const LEASE = 300;
const row = (over) => ({ status: "pending", attempts: 0, availableAtMs: null, lockedAtMs: null, hasError: false, ...over });

// ═══ A. computeRecoveryHealth aggregate ═══════════════════════════════════════
{
  const rows = [
    row({ status: "pending", availableAtMs: NOW - 1000 }), // ready
    row({ status: "pending", availableAtMs: NOW + 60000 }), // future
    row({ status: "processing", lockedAtMs: NOW - 400000, attempts: 2 }), // expired (400s > 300s)
    row({ status: "processing", lockedAtMs: NOW - 100000, attempts: 1 }), // active
    row({ status: "succeeded", attempts: 1 }),
    row({ status: "dead", attempts: 8, hasError: true }),
  ];
  const h = computeRecoveryHealth(rows, NOW, LEASE);
  check("A", "total=6", h.total === 6);
  check("A", "pending=2 (ready=1, future=1)", h.pending === 2 && h.pendingReady === 1 && h.pendingFuture === 1);
  check("A", "processing=2, expired=1", h.processing === 2 && h.processingExpired === 1);
  check("A", "succeeded=1, dead=1", h.succeeded === 1 && h.dead === 1);
  check("A", "maxAttempts=8", h.maxAttempts === 8);
  check("A", "withError=1", h.withError === 1);
  check("A", "boş liste → tümü 0", (() => { const z = computeRecoveryHealth([], NOW, LEASE); return z.total === 0 && z.processingExpired === 0; })());
  check("A", "pending availableAt null → ready sayılır", (() => { const z = computeRecoveryHealth([row({ status: "pending", availableAtMs: null })], NOW, LEASE); return z.pendingReady === 1 && z.pendingFuture === 0; })());
  check("A", "bilinmeyen status yok sayılır (fail-safe)", (() => { const z = computeRecoveryHealth([row({ status: "weird" })], NOW, LEASE); return z.total === 1 && z.pending === 0 && z.processing === 0; })());
}

// ═══ B. BF-11A outboxState PARİTESİ (gerçek fonksiyonlar) ══════════════════════
{
  // expired lease → recoverable
  check("B", "expired lease → recover", decideLeaseRecovery({ status: "processing", lockedAtMs: NOW - 400000, nowMs: NOW, leaseSeconds: LEASE }) === "recover");
  // active lease → untouched
  check("B", "active lease → keep", decideLeaseRecovery({ status: "processing", lockedAtMs: NOW - 100000, nowMs: NOW, leaseSeconds: LEASE }) === "keep");
  check("B", "non-processing → keep", decideLeaseRecovery({ status: "pending", lockedAtMs: null, nowMs: NOW, leaseSeconds: LEASE }) === "keep");

  // computeRecoveryHealth.expired ile decideLeaseRecovery paritesi (aynı eşik).
  const expiredRow = { status: "processing", attempts: 1, availableAtMs: null, lockedAtMs: NOW - 400000, hasError: false };
  const activeRow = { status: "processing", attempts: 1, availableAtMs: null, lockedAtMs: NOW - 100000, hasError: false };
  const hExp = computeRecoveryHealth([expiredRow], NOW, LEASE);
  const hAct = computeRecoveryHealth([activeRow], NOW, LEASE);
  check("B", "health.expired ⟺ decideLeaseRecovery=recover (parite)", hExp.processingExpired === 1 && decideLeaseRecovery({ status: "processing", lockedAtMs: NOW - 400000, nowMs: NOW, leaseSeconds: LEASE }) === "recover");
  check("B", "health.active ⟺ decideLeaseRecovery=keep (parite)", hAct.processingExpired === 0 && decideLeaseRecovery({ status: "processing", lockedAtMs: NOW - 100000, nowMs: NOW, leaseSeconds: LEASE }) === "keep");

  // retry backoff
  const f1 = decideFail({ attempts: 1, claimedVersion: 1, currentVersion: 1, maxAttempts: 8 });
  check("B", "retry_scheduled + backoff", f1.disposition === "retry_scheduled" && f1.delaySeconds === computeBackoffSeconds(1, 30, 3600));
  // max attempts → dead
  const f2 = decideFail({ attempts: DEFAULT_MAX_ATTEMPTS, claimedVersion: 1, currentVersion: 1, maxAttempts: DEFAULT_MAX_ATTEMPTS });
  check("B", "max attempts → dead", f2.disposition === "dead" && f2.delaySeconds === null);
  // stale claimed version (fail) → requeued
  const f3 = decideFail({ attempts: 1, claimedVersion: 1, currentVersion: 2, maxAttempts: 8 });
  check("B", "stale event version (fail) → requeued_newer_event", f3.disposition === "requeued_newer_event");
  // complete stale/newer
  check("B", "complete claimed<current → requeued_newer_event", decideComplete(1, 2) === "requeued_newer_event");
  check("B", "complete claimed==current → succeeded", decideComplete(2, 2) === "succeeded");

  // transition sözleşmesi (no double processing garantisi: pending→processing tek yol)
  check("B", "pending→processing izinli", isValidTransition("pending", "processing") === true);
  check("B", "pending→pending yasak (çift claim yok)", isValidTransition("pending", "pending") === false);
  check("B", "processing→succeeded|pending|dead izinli", isValidTransition("processing", "succeeded") && isValidTransition("processing", "pending") && isValidTransition("processing", "dead"));
  check("B", "succeeded→processing yasak", isValidTransition("succeeded", "processing") === false);
}

console.log("");
if (fail > 0) {
  console.error(`yh-reconcile-recovery-harness: ${pass}/${pass + fail} PASS — ${fail} FAIL`);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`yh-reconcile-recovery-harness: ${pass}/${pass} PASS`);
