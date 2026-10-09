/**
 * Ücret kaydı ÖDEME DURUMU (WT7) — saf yardımcılar (API + UI + Word + liste rozeti ortak).
 *
 *   "paid"   → Ödendi
 *   "unpaid" → Ödenmedi
 *   null     → Belirtilmemiş (WT7 öncesi eski kayıt; TAHMİN YAPILMAZ, rozet üretmez)
 */

export type PaymentStatus = "paid" | "unpaid";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["paid", "unpaid"] as const;

export function isPaymentStatus(v: unknown): v is PaymentStatus {
  return v === "paid" || v === "unpaid";
}

/** DB değerini güvenli okur; tanınmayan/boş → null (Belirtilmemiş). */
export function readPaymentStatus(v: unknown): PaymentStatus | null {
  return isPaymentStatus(v) ? v : null;
}

/** Word/metin etiketi (TR). */
export function paymentStatusLabelTR(v: unknown): string {
  const s = readPaymentStatus(v);
  return s === "paid" ? "Ödendi" : s === "unpaid" ? "Ödenmedi" : "Belirtilmemiş";
}

type ChargeLike = { payment_status?: unknown; amount?: unknown };

/** Yalnız açıkça "unpaid" olan kayıtlar sayılır; null/eski kayıtlar ASLA sayılmaz. */
export function summarizeUnpaid(charges: readonly ChargeLike[]): { count: number; total: number } {
  let count = 0;
  let total = 0;
  for (const c of charges) {
    if (readPaymentStatus(c.payment_status) !== "unpaid") continue;
    count++;
    const n = typeof c.amount === "number" ? c.amount : Number(c.amount);
    if (Number.isFinite(n)) total += n;
  }
  return { count, total: Math.round(total * 100) / 100 };
}
