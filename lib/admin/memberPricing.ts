/**
 * ÜYE YÖNETİMİ — TİCARİ 360 · FİYAT DÖNEMLERİ (SAF; API route + UI + harness).
 *
 * Bir uzmana özel, tarihe bağlı ücret anlaşmaları: "ilk 5 ay 200 TL, sonra aylık 600 TL",
 * "Yıllık peşin — 12 ay kullanım / 10 aylık ücret" gibi. Ödeme gateway'i DEĞİLDİR: kart/banka/
 * fatura/cron tahsilat/otomatik kilit YOK. Kayıt yalnız admin'in elle tuttuğu ticari bilgidir.
 *
 * - Aralıklar [startsOn, endsOn] DAHİL; endsOn boş = açık uçlu ("→").
 * - Aynı uzmanın aralıkları çakışamaz — asıl kural DB tetikleyicisinde (kilit altında, UY004);
 *   buradaki `findOverlap` yalnız erken/anlaşılır UI uyarısıdır.
 * - Hiç fiyat dönemi olmayan (eski) üyede users.agreed_fee + billing_period AYNEN geçerlidir
 *   (`resolveCommercialTerms` → source "legacy").
 */
import {
  BILLING_PERIOD_LABELS,
  daysBetweenIso,
  isBillingPeriod,
  isValidIsoDate,
  PAYMENT_AMOUNT_MAX,
  type BillingPeriod,
} from "@/lib/admin/memberCommercial";

export const PRICING_LABEL_MAX = 80;
export const PRICING_NOTE_MAX = 500;

export type PricingPhase = {
  id: string;
  startsOn: string;
  endsOn: string | null;
  amount: number;
  billingPeriod: BillingPeriod;
  label: string | null;
  termsNote: string | null;
  updatedAt: string | null;
};

/** Kısa dönem eki: "200 TL / Ay". */
export const BILLING_PERIOD_SHORT: Record<BillingPeriod, string> = {
  monthly: "Ay",
  quarterly: "3 Ay",
  semiannual: "6 Ay",
  yearly: "Yıl",
};

const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

/** RPC satırı (snake_case) → PricingPhase. Geçersiz satır → null (UI'da gösterilmez). */
export function mapPricingPhaseRow(raw: unknown): PricingPhase | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const startsOn = String(r.starts_on ?? "").slice(0, 10);
  const endsRaw = r.ends_on == null ? null : String(r.ends_on).slice(0, 10);
  const amount = Number(r.amount);
  if (!r.id || !isValidIsoDate(startsOn) || (endsRaw && !isValidIsoDate(endsRaw))) return null;
  if (!Number.isFinite(amount) || !isBillingPeriod(r.billing_period)) return null;
  return {
    id: String(r.id),
    startsOn,
    endsOn: endsRaw,
    amount: Math.round(amount * 100) / 100,
    billingPeriod: r.billing_period,
    label: str(r.label)?.trim() || null,
    termsNote: str(r.terms_note)?.trim() || null,
    updatedAt: str(r.updated_at),
  };
}

export function sortPhases(phases: readonly PricingPhase[]): PricingPhase[] {
  return [...phases].sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : a.id < b.id ? -1 : 1));
}

/** [s1,e1] ∩ [s2,e2] ≠ ∅ (e = null → sonsuz). */
export function rangesOverlap(s1: string, e1: string | null, s2: string, e2: string | null): boolean {
  return s1 <= (e2 ?? "9999-12-31") && s2 <= (e1 ?? "9999-12-31");
}

/** Taslakla çakışan ilk dönem (düzenlenen dönem hariç). */
export function findOverlap(
  phases: readonly PricingPhase[],
  draft: { startsOn: string; endsOn: string | null },
  excludeId?: string | null,
): PricingPhase | null {
  return phases.find((p) => p.id !== excludeId && rangesOverlap(p.startsOn, p.endsOn, draft.startsOn, draft.endsOn)) ?? null;
}

/** Tarihi kapsayan dönem (yoksa null). */
export function phaseOn(phases: readonly PricingPhase[], isoDate: string): PricingPhase | null {
  if (!isValidIsoDate(isoDate)) return null;
  return phases.find((p) => p.startsOn <= isoDate && (p.endsOn === null || isoDate <= p.endsOn)) ?? null;
}

export type CommercialTerms = {
  /** phase = bugünü kapsayan fiyat dönemi · legacy = users.agreed_fee/billing_period · none = bilgi yok */
  source: "phase" | "legacy" | "none";
  amount: number | null;
  billingPeriod: BillingPeriod | null;
  phase: PricingPhase | null;
};

/**
 * Bugünkü ticari koşul + sonraki dönem.
 * Fiyat dönemi yoksa VEYA bugünü kapsayan dönem yoksa eski agreed_fee/billing_period fallback'i
 * kullanılır (geriye uyumluluk: eski üyelerde davranış değişmez).
 */
export function resolveCommercialTerms(
  phases: readonly PricingPhase[],
  legacy: { agreedFee: number | null; billingPeriod: BillingPeriod | null },
  todayIso: string,
): { current: CommercialTerms; next: PricingPhase | null } {
  const sorted = sortPhases(phases);
  const cur = phaseOn(sorted, todayIso);
  const next = sorted.find((p) => p.startsOn > todayIso) ?? null;
  if (cur) {
    return { current: { source: "phase", amount: cur.amount, billingPeriod: cur.billingPeriod, phase: cur }, next };
  }
  if (legacy.agreedFee != null || legacy.billingPeriod != null) {
    return { current: { source: "legacy", amount: legacy.agreedFee, billingPeriod: legacy.billingPeriod, phase: null }, next };
  }
  return { current: { source: "none", amount: null, billingPeriod: null, phase: null }, next };
}

/** "1.500 TL" (tr-TR; kuruş varsa 2 hane). */
export function formatTl(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const hasCents = Math.abs(amount * 100 - Math.round(amount) * 100) > 0.5;
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })} TL`;
}

/** "200 TL / Ay" — dönem yoksa yalnız tutar. */
export function formatPrice(amount: number | null | undefined, period: BillingPeriod | null | undefined): string {
  if (amount == null) return period ? `— / ${BILLING_PERIOD_SHORT[period]}` : "—";
  return period ? `${formatTl(amount)} / ${BILLING_PERIOD_SHORT[period]}` : formatTl(amount);
}

/** "01.10.2026" */
export function formatIsoDateTr(iso: string | null | undefined): string {
  if (!iso || !isValidIsoDate(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** "01.10.2026 – 28.02.2027" veya "01.03.2027 →" */
export function formatPhaseRange(p: Pick<PricingPhase, "startsOn" | "endsOn">): string {
  return p.endsOn ? `${formatIsoDateTr(p.startsOn)} – ${formatIsoDateTr(p.endsOn)}` : `${formatIsoDateTr(p.startsOn)} →`;
}

/** Bugüne göre dönem durumu (bilgilendirme). */
export function phaseTiming(p: PricingPhase, todayIso: string): { kind: "past" | "current" | "future"; days: number } {
  if (p.startsOn > todayIso) return { kind: "future", days: daysBetweenIso(todayIso, p.startsOn) };
  if (p.endsOn !== null && p.endsOn < todayIso) return { kind: "past", days: daysBetweenIso(p.endsOn, todayIso) };
  return { kind: "current", days: p.endsOn ? daysBetweenIso(todayIso, p.endsOn) : -1 };
}

export function phaseTimingLabel(p: PricingPhase, todayIso: string): string {
  const t = phaseTiming(p, todayIso);
  if (t.kind === "future") return t.days === 0 ? "Bugün başlıyor" : `${t.days} gün sonra başlıyor`;
  if (t.kind === "past") return "Sona erdi";
  if (t.days < 0) return "Geçerli · açık uçlu";
  return t.days === 0 ? "Geçerli · bugün bitiyor" : `Geçerli · ${t.days} gün kaldı`;
}

// ── Sunucu doğrulaması ────────────────────────────────────────────────────────────

export type PricingPhaseDraft = {
  startsOn: string;
  endsOn: string | null;
  amount: number;
  billingPeriod: BillingPeriod;
  label: string | null;
  termsNote: string | null;
};

export type PricingDraftValidation = { ok: true; value: PricingPhaseDraft } | { ok: false; error: string };

const DRAFT_KEYS = new Set(["startsOn", "endsOn", "amount", "billingPeriod", "label", "termsNote"]);

function parseAmount(raw: unknown): number | undefined {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const v = raw.trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined;
    n = Number(v);
  } else return undefined;
  if (!Number.isFinite(n) || n < 0 || n > PAYMENT_AMOUNT_MAX) return undefined;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return undefined;
  return Math.round(n * 100) / 100;
}

function parseText(raw: unknown, max: number): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length > max || CONTROL_RE.test(t)) return undefined;
  return t || null;
}

/** Fiyat dönemi taslağını SIKI doğrular (bilinmeyen alan / tarih / tutar / dönem / uzunluk → 400). */
export function validatePricingPhaseDraft(raw: unknown): PricingDraftValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Fiyat dönemi bilgisi eksik." };
  const d = raw as Record<string, unknown>;
  for (const k of Object.keys(d)) if (!DRAFT_KEYS.has(k)) return { ok: false, error: "Beklenmeyen alan." };

  const startsOn = typeof d.startsOn === "string" ? d.startsOn.trim() : "";
  if (!isValidIsoDate(startsOn)) return { ok: false, error: "Başlangıç tarihi YYYY-AA-GG biçiminde olmalı." };
  let endsOn: string | null = null;
  if (d.endsOn !== undefined && d.endsOn !== null && d.endsOn !== "") {
    if (typeof d.endsOn !== "string" || !isValidIsoDate(d.endsOn.trim())) {
      return { ok: false, error: "Bitiş tarihi YYYY-AA-GG biçiminde olmalı (açık uçlu dönem için boş bırakın)." };
    }
    endsOn = d.endsOn.trim();
    if (endsOn < startsOn) return { ok: false, error: "Bitiş tarihi başlangıçtan önce olamaz." };
  }
  const amount = parseAmount(d.amount);
  if (amount === undefined) return { ok: false, error: "Tutar 0 veya pozitif bir sayı olmalı (en fazla 2 ondalık)." };
  if (!isBillingPeriod(d.billingPeriod)) return { ok: false, error: "Geçersiz ödeme dönemi." };
  const label = parseText(d.label, PRICING_LABEL_MAX);
  if (label === undefined) return { ok: false, error: `Etiket en fazla ${PRICING_LABEL_MAX} karakter olabilir.` };
  const termsNote = parseText(d.termsNote, PRICING_NOTE_MAX);
  if (termsNote === undefined) return { ok: false, error: `Koşul notu en fazla ${PRICING_NOTE_MAX} karakter olabilir.` };
  return { ok: true, value: { startsOn, endsOn, amount, billingPeriod: d.billingPeriod, label, termsNote } };
}

export function billingPeriodLabel(p: BillingPeriod | null | undefined): string {
  return p ? BILLING_PERIOD_LABELS[p] : "Belirtilmemiş";
}
