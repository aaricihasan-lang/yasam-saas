/**
 * Beslenme Plan Word — ÇIKTI DİLİ metin katmanı (I18N-F1-R5 RAPOR-CD, P16).
 *
 * Kurucu (planDocxBuilder / planDocxLayout) bütün SİSTEM metinlerini, sayı ve tarih biçimini buradan alır.
 * - `output` verilmezse kaynak dil (tr) → bugünkü Word bayt-bayt aynı (golden: scripts/i18n/golden/reports-cd-tr.golden.json).
 * - HESAP dilden bağımsızdır: enerji/makro toplamları, kapsama (eksik enerji), ortalama ve hedef farkı burada HESAPLANMAZ;
 *   yalnız yuvarlanmış değerin gösterimi (ayraçlar) dile göre değişir. Değer TR = EN.
 * - Kullanıcı / snapshot içeriği (plan adı, notlar, öğün adı, besin adı, porsiyon etiketi) ÇEVRİLMEZ.
 */
import { reportLocaleFor, type ReportLocale } from "@/lib/i18n/reportLocale";
import type { ServerTranslator } from "@/lib/i18n/serverMessages";

export type NutritionText = {
  output: ReportLocale;
  t: ServerTranslator;
  /** Yuvarlanmış sayı (yalnız gösterim; ham değer korunur). */
  num: (n: number) => string;
  kcal: (n: number) => string;
  gram: (n: number) => string;
  /** ISO takvim günü → uzun tarih (tr "3 Mart 2026" · en "3 March 2026"); geçersizse ham dize. */
  longDate: (iso: string) => string;
  status: (code: string) => string;
  /** Porsiyon miktarı ondalık biçimi için Intl etiketi (portionDisplay). */
  intlTag: string;
};

export function nutritionText(output?: ReportLocale | null): NutritionText {
  const o = output ?? reportLocaleFor("tr");
  const t = o.t("reports.nutrition");
  const num = (n: number): string => (Number.isFinite(n) ? Math.round(n).toLocaleString(o.intlTag) : "0");
  return {
    output: o,
    t,
    num,
    kcal: (n) => `${num(n)} kcal`,
    gram: (n) => `${num(n)} g`,
    longDate: (iso) => {
      const d = new Date(iso + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(o.intlTag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    },
    status: (code) => (t.has(`status.${code}`) ? t(`status.${code}`) : code),
    intlTag: o.intlTag,
  };
}
