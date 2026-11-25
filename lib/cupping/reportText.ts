/**
 * KUPA & HACAMAT — rapor (Word) sistem metinleri: çıktı dili sözleşmesinin modül katmanı (I18N, Ajan C2 pilotu).
 *
 * Tüm sistem metinleri `messages/<dil>/reports.cupping.json` katalogundan gelir (TR değerleri eski üretici
 * sabitlerinin birebir kopyası — golden: scripts/i18n/golden/reports-tr.golden.json). Kullanıcı içeriği
 * (protokol/plan adı, notlar, şablon metinleri, kaynak adları) bu katmandan GEÇMEZ.
 *
 * HESAP SINIRI: Hicrî dönüşüm (lib/cupping/hijri) ve haftagünü hesabı dilden bağımsız kalır; burada yalnız
 * hesaplanmış SAYISAL değerlerin (ay no 1–12, ISO haftagünü 1–7) görünen adı seçilir.
 */
import type { CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import type { HijriDate } from "@/lib/cupping/hijri";
import { sourceReportLocale, type ReportLocale } from "@/lib/i18n/reportLocale";

export type CuppingReportText = ReturnType<typeof cuppingReportText>;

const memo = new WeakMap<ReportLocale, ReturnType<typeof build>>();

function build(rl: ReportLocale) {
  const t = rl.t("reports.cupping");
  const s = (key: string, values?: Record<string, string | number>) => t(key, values);
  return {
    rl,
    t: s,
    usageNote: s("usageNote"),
    page: rl.common.page,
    preparedByCaps: rl.upper(rl.common.preparedBy),
    /** Gregoryen ay adı (1–12). */
    month: (m: number) => s(`calendar.months.${m}`),
    weekdayLong: (iso: number) => s(`calendar.weekdays.${iso}.long`),
    weekdayShort: (iso: number) => s(`calendar.weekdays.${iso}.short`),
    /** "5 Ocak 2026" / "5 January 2026" — kanonik YYYY-MM-DD bileşenlerinden (saat dilimi yok). */
    dayDate: (day: number, month: number, year: number) =>
      s("calendar.dayDate", { day: String(day), month: s(`calendar.months.${month}`), year: String(year) }),
    /** Hicrî gösterim: hesaplanmış gün/ay no/yıl + dilin ay adı ("24 Ramazan 1420" / "24 Ramadan 1420"). */
    hijri: (h: HijriDate) => `${h.day} ${s(`calendar.hijriMonths.${h.month}`)} ${h.year}`,
    colorName: (key: CuppingDayColorKey | null) => (key ? s(`calendar.colors.${key}`) : s("calendar.noColor")),
  };
}

/** Kupa rapor metinleri; `rl` verilmezse kaynak dil (tr) = bugünkü çıktı. */
export function cuppingReportText(rl?: ReportLocale | null) {
  const locale = rl ?? sourceReportLocale();
  let hit = memo.get(locale);
  if (!hit) {
    hit = build(locale);
    memo.set(locale, hit);
  }
  return hit;
}

/** Protokol güvenlik kaydı ek bilgisi: önem · kontrendikasyon sınıfı (kodlar kanonik; yalnız etiket dile göre). */
export function protocolSafetyExtra(severity: unknown, contraClass: unknown, rl?: ReportLocale | null): string | null {
  const x = cuppingReportText(rl);
  const sev = typeof severity === "string" && ["info", "warning", "contraindication"].includes(severity) ? x.t(`protocol.severity.${severity}`) : null;
  // KUP-02: "none" / boş → rapora yazılmaz.
  const contra = typeof contraClass === "string" && ["absolute", "relative"].includes(contraClass) ? x.t(`protocol.contraClass.${contraClass}`) : null;
  return [sev, contra].filter(Boolean).join(" · ") || null;
}

const SOURCE_TYPES = ["historical_primary", "historical_secondary", "book_monograph", "academic_article", "systematic_review", "clinical_study", "official_guidance", "expert_educational"];

/** Kaynak türü etiketi (kanonik kod → dilin etiketi); bilinmeyen kod → null (eski davranış). */
export function protocolSourceTypeLabel(sourceType: unknown, rl?: ReportLocale | null): string | null {
  return typeof sourceType === "string" && SOURCE_TYPES.includes(sourceType) ? cuppingReportText(rl).t(`protocol.sourceType.${sourceType}`) : null;
}
