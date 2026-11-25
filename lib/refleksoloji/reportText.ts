/**
 * Refleksoloji atlas + protokol Word — ÇIKTI DİLİ metin katmanı (I18N-F1-R5 RAPOR-E, P21).
 *
 * Sistem metinleri `messages/{tr,en}/reports.reflexology.json`'dan; TR değerleri eski sabitlerle BİREBİR (golden kilitli).
 * Dil bağlamı: route `resolveReportLocale` → `withReflexOutput(output, fn)`; `reflexologyWord.ts` iç yardımcıları
 * imzalarını değiştirmeden `reflexText()` ile okur (AsyncLocalStorage — async kurucularda da bağlam korunur;
 * bağlam yoksa kaynak dil tr → bugünkü çıktı).
 *
 * İÇERİK / ANAHTAR KURALI: organ adları uzmanın atlas/protokol kaydıdır ve atlas EŞLEŞME ANAHTARIDIR → çevrilmez,
 * aynen basılır. Görünüm grubu kodları (taban/yan_ic/…) kanoniktir; yalnız görüntü etiketi çıktı dilinde.
 * Harita PNG'si (atlasImage.ts) metinsizdir → dil bağımsız.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { reportLocaleFor, type ReportLocale } from "@/lib/i18n/reportLocale";
import type { ServerTranslator } from "@/lib/i18n/serverMessages";
import type { ReportCommonStrings } from "@/lib/i18n/reportCommon";
import { ATLAS_GROUP_LABEL, type AtlasBackgroundGroup } from "./atlasRegionsCore";

export type ReflexText = {
  output: ReportLocale;
  t: ServerTranslator;
  /** Ortak motorlar (imza bloğu) için — yalnız kaynak dil dışında (TR'de motor varsayılanı; çıktı birebir). */
  common: ReportCommonStrings | undefined;
  /** Görünüm grubu görüntü etiketi (TR: ATLAS_GROUP_LABEL birebir). */
  group: (g: AtlasBackgroundGroup) => string;
  /** Uzun tarih (Europe/Istanbul). TR: eski `toLocaleDateString("tr-TR", 2-digit/long/numeric)` birebir. */
  dateLong: (value: string | number | Date) => string;
};

const TR_TZ = "Europe/Istanbul";
const store = new AsyncLocalStorage<ReflexText>();
const cache = new Map<string, ReflexText>();

export function reflexTextFor(output?: ReportLocale | null): ReflexText {
  const o = output ?? reportLocaleFor("tr");
  const hit = cache.get(o.locale);
  if (hit) return hit;
  const t = o.t("reports.reflexology");
  const x: ReflexText = {
    output: o,
    t,
    common: o.isSource ? undefined : o.common,
    group: (g) => (o.isSource ? ATLAS_GROUP_LABEL[g] : t(`group.${g}`)),
    // Refleksoloji raporları gün 2 haneli uzun tarih kullanır ("06 Ekim 2026"); EN aynı düzen ("06 October 2026", en-GB).
    dateLong: (value) => {
      try {
        return new Date(value).toLocaleDateString(o.isSource ? "tr-TR" : o.intlTag, { day: "2-digit", month: "long", year: "numeric", timeZone: TR_TZ });
      } catch {
        return String(value);
      }
    },
  };
  cache.set(o.locale, x);
  return x;
}

/** Geçerli kurucu çağrısının metin katmanı (bağlam yoksa tr). */
export function reflexText(): ReflexText {
  return store.getStore() ?? reflexTextFor(null);
}

/** `fn` (senkron ya da async) içindeki bütün yardımcılar verilen çıktı dilini kullanır. */
export function withReflexOutput<T>(output: ReportLocale | null | undefined, fn: () => T): T {
  return store.run(reflexTextFor(output), fn);
}

/** Dosya adı sistem kısmı: `<önek>-<kip>-<gün>.docx` (kip slug'ı kullanıcı başlığıysa aynen). */
export function reflexFileName(kind: "atlas" | "protocol", modeSlug: string, dateSlug: string, output?: ReportLocale | null): string {
  return `${reflexTextFor(output).t(`file.${kind}`)}-${modeSlug}-${dateSlug}.docx`;
}
