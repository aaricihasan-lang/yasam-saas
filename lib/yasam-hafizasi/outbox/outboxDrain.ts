/**
 * Yaşam Hafızası™ — Outbox DRAIN orkestratörü (SAF; IO yok).
 *
 * Tek invocation'da SINIRSIZ işleme YOK: batch batch ilerler; süre bütçesi veya olay tavanı
 * dolunca DURUR ve kalan iş için `hasMore` döndürür (çağıran tekrar çağırır → kaldığı yerden devam).
 * Claim SKIP LOCKED + lease olduğundan Inngest worker ile eşzamanlı çalışması güvenlidir; aynı olay
 * iki kez claim EDİLEMEZ, yarıda kesilen olayı lease sweep kurtarır. Aynı batch'in tekrar
 * çalıştırılması zarar vermez (olay durum makinesi + index upsert kimliği idempotent).
 */

import type { OutboxBatchSummary, YhOutboxOutcome } from "./eventProcessor";

// ─── Drain (süre bütçeli, kaldığı yerden devam eden) ──────────────────────────
export interface OutboxDrainOptions {
  /** Batch başına claim (1–50). */
  readonly claimBatch: number;
  /** Bu çağrıda işlenecek en fazla olay. */
  readonly maxEvents: number;
  /** Bu çağrının süre bütçesi (ms); dolunca yeni batch başlatılmaz. */
  readonly timeBudgetMs: number;
}

export interface OutboxDrainResult {
  readonly batches: number;
  readonly claimed: number;
  readonly completed: number;
  readonly requeued: number;
  readonly failedPermanent: number;
  readonly failedTransient: number;
  readonly transportErrors: number;
  readonly outcomes: Readonly<Partial<Record<YhOutboxOutcome, number>>>;
  /** Son batch dolu döndüyse veya bütçe bittiyse true → çağıran tekrar çağırmalı. */
  readonly hasMore: boolean;
  readonly stoppedBy: "empty" | "time-budget" | "max-events";
}

/** SAF orkestratör (batch fonksiyonu enjekte) — harness ile DB'siz test edilir. */
export async function runOutboxDrain(
  runBatch: (claimBatch: number) => Promise<OutboxBatchSummary>,
  opts: OutboxDrainOptions,
  now: () => number = Date.now,
): Promise<OutboxDrainResult> {
  const claimBatch = Math.min(Math.max(Math.trunc(opts.claimBatch) || 1, 1), 50);
  const maxEvents = Math.max(Math.trunc(opts.maxEvents) || 0, 0);
  const started = now();
  const totals = {
    batches: 0, claimed: 0, completed: 0, requeued: 0,
    failedPermanent: 0, failedTransient: 0, transportErrors: 0,
  };
  const outcomes: Partial<Record<YhOutboxOutcome, number>> = {};
  let stoppedBy: OutboxDrainResult["stoppedBy"] = "empty";

  for (;;) {
    if (totals.claimed >= maxEvents) { stoppedBy = "max-events"; break; }
    if (now() - started >= opts.timeBudgetMs) { stoppedBy = "time-budget"; break; }
    const b = await runBatch(Math.min(claimBatch, Math.max(maxEvents - totals.claimed, 1)));
    totals.batches += 1;
    totals.claimed += b.claimed;
    totals.completed += b.completed;
    totals.requeued += b.requeued;
    totals.failedPermanent += b.failedPermanent;
    totals.failedTransient += b.failedTransient;
    totals.transportErrors += b.transportErrors;
    for (const [k, v] of Object.entries(b.outcomes)) {
      const key = k as YhOutboxOutcome;
      outcomes[key] = (outcomes[key] ?? 0) + (v ?? 0);
    }
    if (b.claimed === 0) { stoppedBy = "empty"; break; }
  }
  return { ...totals, outcomes, hasMore: stoppedBy !== "empty", stoppedBy };
}
