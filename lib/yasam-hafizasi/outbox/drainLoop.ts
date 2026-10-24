/**
 * Yaşam Hafızası™ — outbox RUN İÇİ DRAIN döngüsü (YH-01 / LIM-06, satış öncesi AŞAMA 1).
 *
 * Sorun: her worker run'ı tek bir `sweep + claim(10)` turu yapıyordu; 200 satırlık bir yazım
 * dalgası 200 olay → 200 run demekti ve bir run yalnız 10 satır işleyebildiği için kuyruk
 * ancak çok sayıda run ile boşalıyordu. Bu yardımcı aynı batch fonksiyonunu, son tur TAM batch
 * aldığı sürece (kuyrukta iş kalmış olabilir) sınırlı sayıda tekrar çağırır; ardından gelen
 * olay run'ları kuyruğu boş bulup hızla `empty` döner.
 *
 * İŞLEME SEMANTİĞİ DEĞİŞMEZ: tek tur = mevcut `runOutboxBatch`/`runClientOutboxBatch`
 * (sweep → claim → seri işle → complete/fail). Her tur yeniden claim ettiği için lease süresi
 * her batch için ayrı başlar. Saf modül (DB/IO yok) → harness ile doğrudan test edilir.
 */

export const YH_OUTBOX_MAX_BATCHES_PER_RUN = 10;
export const YH_OUTBOX_RUN_BUDGET_MS = 45_000;

type NumericSummary = { readonly claimed: number };

export interface DrainResult<S extends NumericSummary> {
  /** Turların toplamı (sayısal alanlar toplanır, `outcomes` birleştirilir). */
  readonly total: S;
  readonly rounds: number;
  readonly stoppedBy: "drained" | "max-batches" | "budget";
}

function mergeSummary<S extends NumericSummary>(a: S, b: S): S {
  const out: Record<string, unknown> = { ...(a as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b as unknown as Record<string, unknown>)) {
    const prev = out[k];
    if (typeof v === "number" && typeof prev === "number") out[k] = prev + v;
    else if (k === "outcomes" && v && typeof v === "object") {
      const merged: Record<string, number> = { ...((prev as Record<string, number> | undefined) ?? {}) };
      for (const [ok, ov] of Object.entries(v as Record<string, number>)) merged[ok] = (merged[ok] ?? 0) + ov;
      out[k] = merged;
    } else if (prev === undefined) out[k] = v;
  }
  return out as unknown as S;
}

export async function drainOutboxBatches<S extends NumericSummary>(
  runOnce: () => Promise<S>,
  opts: {
    readonly claimBatch: number;
    readonly maxBatches?: number;
    readonly budgetMs?: number;
    readonly now?: () => number;
  },
): Promise<DrainResult<S>> {
  const maxBatches = Math.max(1, opts.maxBatches ?? YH_OUTBOX_MAX_BATCHES_PER_RUN);
  const budgetMs = opts.budgetMs ?? YH_OUTBOX_RUN_BUDGET_MS;
  const now = opts.now ?? Date.now;
  const started = now();

  let total = await runOnce();
  let last = total;
  let rounds = 1;
  for (;;) {
    if (last.claimed < opts.claimBatch) return { total, rounds, stoppedBy: "drained" };
    if (rounds >= maxBatches) return { total, rounds, stoppedBy: "max-batches" };
    if (now() - started >= budgetMs) return { total, rounds, stoppedBy: "budget" };
    last = await runOnce();
    total = mergeSummary(total, last);
    rounds += 1;
  }
}
