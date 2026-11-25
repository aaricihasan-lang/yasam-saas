/**
 * Danışan Yolculuğu Word raporu — sistem metinleri: çıktı dili sözleşmesinin modül katmanı (I18N RAPOR-AB).
 *
 * Tüm sistem metinleri `messages/<dil>/reports.clients.json` katalogundan gelir (TR değerleri eski kurucu
 * sabitlerinin birebir kopyası — golden: scripts/i18n/golden/reports-ab-tr.golden.json). Kullanıcı içeriği
 * (danışan adı, notlar, seans/ödev/taş/ücret metinleri, burç ve kan grubu serbest metinleri) bu katmandan GEÇMEZ.
 *
 * HESAP SINIRI: seans ayıklama, tarih aralığı filtresi, ödenmemiş toplamı, analiz değerleri dilden bağımsızdır;
 * burada yalnız kanonik kodların (randevu/ödev durumu, ücret türü, ödeme durumu, mizaç, analiz türü, çakra/gezegen
 * satırı) GÖRÜNEN adı seçilir. Para birimi TRY sabit; yalnız sayı biçimi ve sembol konumu dile göre.
 */
import { sourceReportLocale, type ReportLocale } from "@/lib/i18n/reportLocale";
import { formatDateLoose, formatDateOnly, formatInstantDate, formatInstantDateTime } from "@/lib/time/reportTime";
import { readPaymentStatus } from "@/lib/danisan/chargePayment";
import { tidyUserText } from "@/lib/clients/wordReportText";

export type DyText = ReturnType<typeof buildDyText>;

const memo = new WeakMap<ReportLocale, DyText>();
/** Kanonik mizaç kodları (lib/clients/wordReportText MIZAC_LABELS ile aynı küme). */
const TEMPERAMENT_CODES = new Set(["safra", "sovdavi", "dem", "balgam"]);

function buildDyText(rl: ReportLocale) {
  const t = rl.t("reports.clients");
  // TR'de `locale` verilmez → reportTime varsayılanı (tr-TR) → bayt-bayt aynı.
  const loc = rl.isSource ? {} : { locale: rl.intlTag };
  const opt = (key: string) => (t.has(key) ? t(key) : null);
  return {
    rl,
    t,
    common: rl.common,
    /** Çoğullu sayım metni: `{count}` (sayı, çoğul seçimi) + `{shown}` (gruplamasız gösterim → TR birebir). */
    count: (key: string, n: number, extra?: Record<string, string | number>) => t(key, { count: n, shown: String(n), ...extra }),
    /** Görüntü metni büyük harf (TR: tr-TR kuralı → eski `toLocaleUpperCase("tr-TR")` ile aynı). */
    upper: (text: string) => rl.upper(text),
    /** DATE / TEXT takvim alanları — kaydırmasız; boş → "". */
    dateTR: (date: string | null | undefined) => formatDateLoose(date, { fallback: "", ...loc }),
    /** timestamptz → Europe/Istanbul tarih + saat; boş → "". */
    dateTimeTR: (value: string | null | undefined) => formatInstantDateTime(value ?? null, { fallback: "", ...loc }),
    /** Anlık tarih (kombinasyon kaydı). */
    instantDate: (value: string | null | undefined) => formatInstantDate(value, { fallback: "", ...loc }),
    /** Takvim günü uzun biçim ("27 Eylül 2026" / "27 September 2026"). */
    dateLong: (ymd: string, fallback: string) => formatDateOnly(ymd, { style: "long", fallback, ...loc }),
    /** Karışık alan (fallback ham değer). */
    loose: (value: string, fallback: string) => formatDateLoose(value, { fallback, ...loc }),
    instantDateTime: (value: string) => formatInstantDateTime(value, loc),
    /** C4: kuruş varsa daima 2 hane; TRY sabit ("1.500,50 ₺" / "₺1,500.50"). */
    money: (amount: number) => {
      const digits = Number.isInteger(amount) ? 0 : 2;
      return t("money", { amount: rl.number(amount, { minimumFractionDigits: digits, maximumFractionDigits: digits }) });
    },
    /** FA-44 ile uyumlu randevu durumu (kanonik anahtar → etiket). */
    aptStatus: (key: "completed" | "cancelled" | "noResult" | "upcoming") => t(`appointments.status.${key}`),
    chargeCategory: (cat?: string | null) => opt(`charges.category.${cat ?? ""}`) ?? t("charges.category.other"),
    paymentStatus: (v: unknown) => {
      const s = readPaymentStatus(v);
      return t(`charges.payment.${s === "paid" ? "paid" : s === "unpaid" ? "unpaid" : "unknown"}`);
    },
    /** Ödev durumu (lib/odevStatus ile aynı kodlar); bilinmeyen → ham değer ya da "Bilinmiyor". */
    homeworkStatus: (status: string | null | undefined) => opt(`homework.statusLabel.${status ?? ""}`) ?? (status || t("homework.statusUnknown")),
    /** Analiz türü (lib/clients/analysisLabels ile aynı kodlar); bilinmeyen → "Analiz". */
    analysisType: (type: string | null | undefined) => (type === "chakra" || type === "planet" ? t(`analysis.type.${type}`) : t("analysis.type.default")),
    /** Mizaç kodu → etiket (lib/clients/wordReportText.mizacLabel ile aynı kural); serbest metin aynen; boş → fallback. */
    temperament: (value: string | null | undefined, fallback = "") => {
      const v = tidyUserText(value);
      if (!v) return fallback;
      const code = v.toLocaleLowerCase("tr-TR");
      return TEMPERAMENT_CODES.has(code) ? t(`temperament.${code}`) : v;
    },
  };
}

/** Danışan rapor metinleri; `rl` verilmezse kaynak dil (tr) = bugünkü çıktı. */
export function dyText(rl?: ReportLocale | null): DyText {
  const locale = rl ?? sourceReportLocale();
  let hit = memo.get(locale);
  if (!hit) {
    hit = buildDyText(locale);
    memo.set(locale, hit);
  }
  return hit;
}
