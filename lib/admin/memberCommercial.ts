/**
 * ÜYE YÖNETİMİ — TİCARİ TAKİP (AŞAMA 2 · §4.1 · M4) — SAF yardımcılar.
 *
 * Kapsam: uzman bazlı anlaşılan ücret + ödeme dönemi, yenileme (sonraki ödeme) tarihi
 * durumu ve ödeme kaydı doğrulaması. YENİ BILLING SİSTEMİ DEĞİLDİR: otomatik kilit/pasif,
 * e-posta/SMS/cron, fatura/kart/banka YOKTUR — yalnız admin'in elle tuttuğu kayıt.
 *
 * Hem API route (sunucu doğrulaması) hem UI (rozet / "Ödeme alındı" yardımcısı) hem de
 * harness bu dosyayı kullanır; DB/ağ erişimi YOK.
 */

export const BILLING_PERIODS = ["monthly", "quarterly", "semiannual", "yearly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "Aylık",
  quarterly: "3 Aylık",
  semiannual: "6 Aylık",
  yearly: "Yıllık",
};

const BILLING_PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === "string" && (BILLING_PERIODS as readonly string[]).includes(value);
}

/** Ödeme durumu allowlist'i ('unknown' = Belirtilmemiş → DB'de NULL). */
export const PAYMENT_STATUS_VALUES = ["paid", "pending", "overdue", "exempt", "unknown"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];

export const PAYMENT_NOTE_MAX = 1000;
/** Tutar üst sınırı (numeric(12,2) içinde, anlamlı büyüklük). */
export const PAYMENT_AMOUNT_MAX = 99_999_999.99;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Takvimde gerçekten var olan YYYY-MM-DD mi? (2026-02-30 → false) */
export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Europe/Istanbul takvim günü (YYYY-MM-DD) — sunucu/istemci saat diliminden bağımsız. */
export function istanbulTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** İki YYYY-MM-DD arasındaki gün farkı (to - from). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86_400_000);
}

/**
 * Tarihe ödeme dönemi kadar ay ekler; ay sonu taşması kırpılır
 * (31 Ocak + 1 ay → 28/29 Şubat). Geçersiz girişte boş string.
 */
export function addBillingPeriod(isoDate: string, period: BillingPeriod): string {
  if (!isValidIsoDate(isoDate)) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = m - 1 + BILLING_PERIOD_MONTHS[period];
  const ny = y + Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Yenileme yaklaşıyor eşiği (gün) — liste filtresi `due30` ile aynı. */
export const RENEWAL_DUE_WINDOW_DAYS = 30;

export type RenewalState =
  | { kind: "none" }
  | { kind: "overdue"; days: number }
  | { kind: "due"; days: number }
  | { kind: "later"; days: number };

/**
 * Sonraki ödeme (yenileme) tarihinin bugüne göre durumu. Yalnız BİLGİLENDİRME amaçlıdır —
 * hiçbir erişim kararı bu sonuca bağlanmaz (otomatik kilit/pasif YOK).
 *   overdue: tarih bugünden önce (days = kaç gün geçti)
 *   due    : bugün..bugün+30 (days = kaç gün kaldı; 0 = bugün)
 *   later  : 30 günden sonra
 *   none   : tarih yok / geçersiz
 */
export function renewalState(nextPaymentDate: string | null | undefined, todayIso: string): RenewalState {
  const raw = String(nextPaymentDate ?? "").trim().slice(0, 10);
  if (!raw || !isValidIsoDate(raw) || !isValidIsoDate(todayIso)) return { kind: "none" };
  const diff = daysBetweenIso(todayIso, raw);
  if (diff < 0) return { kind: "overdue", days: -diff };
  if (diff <= RENEWAL_DUE_WINDOW_DAYS) return { kind: "due", days: diff };
  return { kind: "later", days: diff };
}

/** Rozet metni: "Yenileme geçti" / "Bugün yenileniyor" / "X gün kaldı" (yoksa null). */
export function renewalBadgeLabel(state: RenewalState): string | null {
  if (state.kind === "overdue") return state.days === 1 ? "Yenileme geçti (1 gün)" : `Yenileme geçti (${state.days} gün)`;
  if (state.kind === "due") return state.days === 0 ? "Bugün yenileniyor" : `${state.days} gün kaldı`;
  return null;
}

// ── Ödeme kaydı doğrulaması (sunucu) ─────────────────────────────────────────────

/** DB'ye yazılacak doğrulanmış ödeme alanları (users kolon adlarıyla). */
export type ValidatedPayment = {
  payment_status: Exclude<PaymentStatusValue, "unknown"> | null;
  last_payment_date: string | null;
  next_payment_date: string | null;
  paid_amount: number | null;
  payment_note: string | null;
  agreed_fee: number | null;
  billing_period: BillingPeriod | null;
};

export const PAYMENT_FIELDS = [
  "payment_status",
  "last_payment_date",
  "next_payment_date",
  "paid_amount",
  "payment_note",
  "agreed_fee",
  "billing_period",
] as const satisfies readonly (keyof ValidatedPayment)[];
export type PaymentField = (typeof PAYMENT_FIELDS)[number];

export type PaymentValidation = { ok: true; value: ValidatedPayment } | { ok: false; error: string };

const DRAFT_KEYS = new Set([
  "status",
  "lastPaymentDate",
  "nextPaymentDate",
  "paidAmount",
  "note",
  "agreedFee",
  "billingPeriod",
]);

function parseOptionalDate(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (v === "") return null;
  return isValidIsoDate(v) ? v : undefined;
}

function parseOptionalAmount(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null) return null;
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const v = raw.trim().replace(",", ".");
    if (v === "") return null;
    if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined;
    n = Number(v);
  } else {
    return undefined;
  }
  if (!Number.isFinite(n) || n < 0 || n > PAYMENT_AMOUNT_MAX) return undefined;
  // En fazla 2 ondalık (kayan nokta toleransıyla).
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return undefined;
  return Math.round(n * 100) / 100;
}

/**
 * Ödeme taslağını (UI PaymentEditDraft biçimi) SIKI doğrular. Bilinmeyen alan, yanlış tip,
 * geçersiz tarih, negatif/aşırı tutar, bilinmeyen durum/dönem veya uzun not → hata (400).
 */
export function validatePaymentDraft(raw: unknown): PaymentValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Ödeme bilgisi eksik." };
  }
  const d = raw as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    if (!DRAFT_KEYS.has(k)) return { ok: false, error: "Beklenmeyen alan." };
  }

  const status = d.status;
  if (typeof status !== "string" || !(PAYMENT_STATUS_VALUES as readonly string[]).includes(status)) {
    return { ok: false, error: "Geçersiz ödeme durumu." };
  }

  const last = parseOptionalDate(d.lastPaymentDate);
  if (last === undefined) return { ok: false, error: "Son ödeme tarihi YYYY-AA-GG biçiminde olmalı." };
  const next = parseOptionalDate(d.nextPaymentDate);
  if (next === undefined) return { ok: false, error: "Sonraki ödeme tarihi YYYY-AA-GG biçiminde olmalı." };

  const paid = parseOptionalAmount(d.paidAmount);
  if (paid === undefined) return { ok: false, error: "Ödenen tutar 0 veya pozitif bir sayı olmalı (en fazla 2 ondalık)." };
  const fee = parseOptionalAmount(d.agreedFee);
  if (fee === undefined) return { ok: false, error: "Anlaşılan ücret 0 veya pozitif bir sayı olmalı (en fazla 2 ondalık)." };

  let period: BillingPeriod | null = null;
  if (d.billingPeriod !== undefined && d.billingPeriod !== null && d.billingPeriod !== "") {
    if (!isBillingPeriod(d.billingPeriod)) return { ok: false, error: "Geçersiz ödeme dönemi." };
    period = d.billingPeriod;
  }

  let note: string | null = null;
  if (d.note !== undefined && d.note !== null) {
    if (typeof d.note !== "string") return { ok: false, error: "Geçersiz ödeme notu." };
    const t = d.note.trim();
    if (t.length > PAYMENT_NOTE_MAX) return { ok: false, error: `Ödeme notu en fazla ${PAYMENT_NOTE_MAX} karakter olabilir.` };
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return { ok: false, error: "Geçersiz ödeme notu." };
    note = t || null;
  }

  return {
    ok: true,
    value: {
      payment_status: status === "unknown" ? null : (status as Exclude<PaymentStatusValue, "unknown">),
      last_payment_date: last,
      next_payment_date: next,
      paid_amount: paid,
      payment_note: note,
      agreed_fee: fee,
      billing_period: period,
    },
  };
}

/** DB satırındaki tarihi YYYY-MM-DD'ye normalize eder (date/timestamp/string). */
function normalizeRowDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && s.length <= 10) return s.slice(0, 10);
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return s;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function normalizeRowAmount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Mevcut satırın ödeme durumunu allowlist'e göre yorumlar (literal 'undefined' vb. → null). */
function normalizeRowStatus(raw: unknown): ValidatedPayment["payment_status"] {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "paid" || s === "pending" || s === "overdue" || s === "exempt" ? s : null;
}

/** Mevcut DB satırını karşılaştırılabilir (ValidatedPayment) biçime getirir. */
export function paymentFieldsFromRow(row: Record<string, unknown>): ValidatedPayment {
  const note = row.payment_note == null ? null : String(row.payment_note).trim() || null;
  return {
    payment_status: normalizeRowStatus(row.payment_status),
    last_payment_date: normalizeRowDate(row.last_payment_date),
    next_payment_date: normalizeRowDate(row.next_payment_date),
    paid_amount: normalizeRowAmount(row.paid_amount),
    payment_note: note,
    agreed_fee: normalizeRowAmount(row.agreed_fee),
    billing_period: isBillingPeriod(row.billing_period) ? row.billing_period : null,
  };
}

/** Gerçekten değişen alan adları (no-op kayıt DB'ye dokunmaz, audit üretmez). */
export function diffPaymentFields(before: ValidatedPayment, next: ValidatedPayment): PaymentField[] {
  return PAYMENT_FIELDS.filter((f) => before[f] !== next[f]);
}
