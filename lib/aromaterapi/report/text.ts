/**
 * Aromaterapi Word — ÇIKTI DİLİ metin katmanı (I18N-F1-R5 RAPOR-CD, P19).
 *
 * Bütün sistem metinleri (bölüm/alan başlıkları, kapak, istatistik etiketleri, enum etiketleri, dosya adı sistem
 * parçaları) `messages/{tr,en}/reports.aromatherapy.json` kataloğundan gelir. TR değerleri eski sabitlerle BİREBİR
 * (golden: scripts/i18n/golden/reports-cd-tr.golden.json).
 *
 * Dil bağlamı: route `resolveReportLocale` → builders `ctx.output` → `withAromaOutput(output, fn)`. Render fonksiyonları
 * imzalarını değiştirmeden `aromaText()` ile o isteğin metin katmanını okur (AsyncLocalStorage: istekler arası
 * karışma yok; bağlam yoksa kaynak dil tr → bugünkü çıktı birebir; mevcut doğrudan render harness'ları etkilenmez).
 *
 * KURALLAR: DB değeri / enum kodu / hesap (damla, seyreltme, toplam) DEĞİŞMEZ — yalnız görünen etiket.
 * Kayıt/katalog içeriği (yağ adı, açıklamalar, kaynak künyesi, pasaj metni, terim tanımı) ÇEVRİLMEZ.
 * Bilinmeyen enum kodu: ham kod silinmez, dilin büyük harf kuralıyla okunur hâle getirilir (değer korunur).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { reportLocaleFor, type ReportLocale } from "@/lib/i18n/reportLocale";
import type { ServerTranslator } from "@/lib/i18n/serverMessages";

export type AromaText = {
  output: ReportLocale;
  /** reports.aromatherapy çevirmeni. */
  t: ServerTranslator;
  /** Kanonik kod → etiket (sözlük adı: ör. "ROUTE_CODE"). Bulunamazsa null. */
  enumOf: (dict: string, code: string) => string | null;
  /** Bilinmeyen kodu okunur hâle getirir (değer kaybolmaz). */
  humanize: (code: string) => string;
};

const store = new AsyncLocalStorage<AromaText>();
const cache = new Map<string, AromaText>();

export function aromaTextFor(output?: ReportLocale | null): AromaText {
  const o = output ?? reportLocaleFor("tr");
  const hit = cache.get(o.locale);
  if (hit) return hit;
  const t = o.t("reports.aromatherapy");
  const upperTag = o.isSource ? "tr" : o.intlTag;
  const x: AromaText = {
    output: o,
    t,
    enumOf: (dict, code) => {
      const key = `enums.${dict}.${code}`;
      return /^[A-Za-z0-9_]+$/.test(code) && t.has(key) ? t(key) : null;
    },
    humanize: (code) => {
      const v = (code ?? "").trim();
      if (!v) return "";
      return v
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toLocaleUpperCase(upperTag) + w.slice(1))
        .join(" ");
    },
  };
  cache.set(o.locale, x);
  return x;
}

/** Geçerli isteğin metin katmanı (bağlam yoksa kaynak dil tr). */
export function aromaText(): AromaText {
  return store.getStore() ?? aromaTextFor(null);
}

/** `fn` içindeki bütün render/belge çağrıları verilen çıktı dilini kullanır. */
export function withAromaOutput<T>(output: ReportLocale | null | undefined, fn: () => Promise<T>): Promise<T> {
  return store.run(aromaTextFor(output), fn);
}
