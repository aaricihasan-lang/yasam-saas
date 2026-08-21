const META: Record<string, { label: string; color: string; className: string }> = {
  bekliyor:   { label: "Bekliyor",     color: "#d97706", className: "border-amber-200 bg-amber-100 text-amber-800"      },
  devam:      { label: "Devam Ediyor", color: "#2563eb", className: "border-blue-200 bg-blue-100 text-blue-800"         },
  tamamlandi: { label: "Tamamlandı",   color: "#16a34a", className: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  iptal:      { label: "İptal",        color: "#ef4444", className: "border-red-200 bg-red-100 text-red-700"             },
  gecikti:    { label: "Gecikti",      color: "#dc2626", className: "border-red-200 bg-red-100 text-red-700"             },
};

/** Ödev durumunun Türkçe etiketi. Bilinmeyen → ham değer ya da "Bilinmiyor". */
export function odevDurumLabel(status: string | null | undefined): string {
  return META[status ?? ""]?.label ?? (status || "Bilinmiyor");
}

/** Ödev durumunun inline stil rengi (#hex). */
export function odevDurumColor(status: string | null | undefined): string {
  return META[status ?? ""]?.color ?? "#64748b";
}

/** Ödev durumunun Tailwind badge sınıfları. */
export function odevDurumClass(status: string | null | undefined): string {
  return META[status ?? ""]?.className ?? "border-slate-200 bg-slate-100 text-slate-500";
}

// ─── Canonical ödev durum modeli + toplama (FAZ 2 F3) ─────────────────────────
// Tek doğruluk kaynağı: overview (YolculukTab), detay (HomeworkTab) ve liste
// uyarıları (homeworks-alerts) aynı tanımları kullanır. Saf/istemci-güvenli.
//
//   ACTIVE    = devam        → "Devam Eden" (yalnız devam; iptal/gecikti/bekliyor DEĞİL)
//   COMPLETED = tamamlandi
//   LATE      = gecikti       → açık gecikmiş statü
//   CANCELLED = iptal         → tamamlanma paydasından ÇIKAR
//   PENDING   = bekliyor      → başlamamış; paydada KALIR, "Devam Eden" DEĞİL
export const HOMEWORK_STATUS = {
  ACTIVE: "devam",
  COMPLETED: "tamamlandi",
  LATE: "gecikti",
  CANCELLED: "iptal",
  PENDING: "bekliyor",
} as const;

type HomeworkStatusRow = { status?: string | null; end_date?: string | null };

/**
 * Canonical "geciken" predikatı — TEK model (liste/detay/overview aynı sonucu verir):
 *   açık `gecikti` statüsü  VEYA  (`devam` && end_date ≤ Istanbul bugünü).
 * `iptal`/`tamamlandi`/`bekliyor` gecikmiş sayılmaz.
 * @param istanbulTodayStr "YYYY-MM-DD" (Istanbul takvim günü)
 */
export function isHomeworkOverdue(
  hw: HomeworkStatusRow,
  istanbulTodayStr: string,
): boolean {
  const s = hw?.status ?? "";
  if (s === HOMEWORK_STATUS.LATE) return true;
  if (s === HOMEWORK_STATUS.ACTIVE) {
    const end = (hw?.end_date ?? "").trim();
    return end.length > 0 && end <= istanbulTodayStr;
  }
  return false;
}

export type HomeworkAggregate = {
  total: number;
  active: number; // devam
  completed: number; // tamamlandi
  late: number; // gecikti (açık statü)
  cancelled: number; // iptal
  pending: number; // bekliyor
  eligibleTotal: number; // total − iptal
  completionPercent: number; // round(completed / eligibleTotal * 100), payda 0 → 0
  overdue: number; // canonical: isHomeworkOverdue (gecikti VEYA devam+geçmiş)
};

/**
 * Ödev listesini canonical sayımlara indirger. Tamamlanma yüzdesi paydasından
 * yalnız `iptal` çıkarılır (`bekliyor`/`gecikti`/`devam` paydada kalır).
 */
export function aggregateHomeworks(
  rows: HomeworkStatusRow[] | null | undefined,
  istanbulTodayStr: string,
): HomeworkAggregate {
  let active = 0, completed = 0, late = 0, cancelled = 0, pending = 0, overdue = 0;
  const list = rows ?? [];
  for (const r of list) {
    switch (r?.status) {
      case HOMEWORK_STATUS.ACTIVE: active++; break;
      case HOMEWORK_STATUS.COMPLETED: completed++; break;
      case HOMEWORK_STATUS.LATE: late++; break;
      case HOMEWORK_STATUS.CANCELLED: cancelled++; break;
      case HOMEWORK_STATUS.PENDING: pending++; break;
      default: break; // bilinmeyen/null → yalnız total'a girer
    }
    if (isHomeworkOverdue(r, istanbulTodayStr)) overdue++;
  }
  const total = list.length;
  const eligibleTotal = total - cancelled;
  const completionPercent =
    eligibleTotal > 0 ? Math.round((completed / eligibleTotal) * 100) : 0;
  return { total, active, completed, late, cancelled, pending, eligibleTotal, completionPercent, overdue };
}
