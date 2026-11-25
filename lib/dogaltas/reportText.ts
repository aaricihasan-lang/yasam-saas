/**
 * Doğaltaş / Mineral / Kombinasyon / Taş Bilgi Kütüphanesi Word — ÇIKTI DİLİ metin katmanı (I18N-F1-R5 RAPOR-CD, P12–P15).
 *
 * Sistem metinleri `messages/{tr,en}/reports.stones.json`'dan; TR değerleri eski sabitlerle BİREBİR (golden kilitli).
 * Dil bağlamı: route `resolveReportLocale` → kurucu `output` parametresi → `withStonesOutput(output, fn)`. İç yardımcılar
 * imzalarını değiştirmeden `stonesText()` ile okur (AsyncLocalStorage; bağlam yoksa kaynak dil tr → bugünkü çıktı).
 *
 * İÇERİK KURALI: taş/mineral/kombinasyon/makale içeriği (ad, açıklama, etki listeleri, kategori, kaynak adı, uzman notu)
 * DB kaydıdır ve ÇEVRİLMEZ — DB'de yalnız Türkçe tutulur (sistem kütüphanesinden aktarılan standart içerik dahil).
 * Uzmanın taş adı aynen kalır; standart ad → EN katalog kimliği eşlemesi (DOGALTAS-EN-AD-SOZLUGU, B1) mod-b'de
 * `lib/dogaltas/stoneNames.ts` (expertStandardStoneDisplayName) ile hazır ama bayrağı KAPALI / Owner kararı bekliyor.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { reportLocaleFor, type ReportLocale } from "@/lib/i18n/reportLocale";
import type { ServerTranslator } from "@/lib/i18n/serverMessages";
import type { ReportCommonStrings } from "@/lib/i18n/reportCommon";

export type StonesText = {
  output: ReportLocale;
  t: ServerTranslator;
  /** Ortak motorlar için `common` — yalnız kaynak dil dışında (TR'de motor varsayılanı; çıktı birebir). */
  common: ReportCommonStrings | undefined;
  /** "Oluşturulma Tarihi" değeri (uzun tarih, çıktı dilinde). */
  generatedLabel: () => string;
  /** Anlık zaman → tarih (çıktı dilinde; varsayılan sayısal). */
  date: (value: string | number | Date | null | undefined, opts?: { fallback?: string; style?: "numeric" | "long" }) => string;
  /** Belge `w:lang` değeri (tr → "tr-TR" birebir; en → "en-GB"). */
  documentLang: string;
};

const store = new AsyncLocalStorage<StonesText>();
const cache = new Map<string, StonesText>();

export function stonesTextFor(output?: ReportLocale | null): StonesText {
  const o = output ?? reportLocaleFor("tr");
  const hit = cache.get(o.locale);
  if (hit) return hit;
  const x: StonesText = {
    output: o,
    t: o.t("reports.stones"),
    common: o.isSource ? undefined : o.common,
    generatedLabel: () => o.date(new Date(), { style: "long" }),
    date: (value, opts) => o.date(value, { fallback: opts?.fallback, style: opts?.style }),
    documentLang: o.documentLang,
  };
  cache.set(o.locale, x);
  return x;
}

/** Geçerli kurucu çağrısının metin katmanı (bağlam yoksa tr). */
export function stonesText(): StonesText {
  return store.getStore() ?? stonesTextFor(null);
}

/** `fn` içindeki bütün yardımcılar verilen çıktı dilini kullanır (senkron kurucular için de geçerli). */
export function withStonesOutput<T>(output: ReportLocale | null | undefined, fn: () => T): T {
  return store.run(stonesTextFor(output), fn);
}

// ── I18N-F1-R5 RAPOR-E (P11/P12/P15) ek yardımcıları ────────────────────────────────────────────────

/**
 * Rapor katmanında kaynak görünen adı: boş/NULL → çıktı dilinde "Kaynak belirtilmemiş".
 * TR'de `lib/dogaltas/stoneSources.sourceDisplayName` ile BİREBİR (o dosyaya dokunulmaz — mod-b #843 alanı).
 */
export function stonesSourceName(name: string | null | undefined): string {
  return (name ?? "").trim() || stonesText().t("source.notSpecified");
}

/** Kayıt içeriği (taş/kategori/kaynak adı — DB'de TR) büyük harfe TR kuralıyla; sistem yedek metni çıktı dilinin kuralıyla. */
export function upperContent(text: string, isSystemText = false): string {
  return isSystemText ? stonesText().output.upper(text) : text.toLocaleUpperCase("tr-TR");
}

/**
 * Doğaltaş Ansiklopedisi (P11) GEÇİŞ KÖPRÜSÜ: rota dosyasında mod-b (#843) değişikliğinin bulunduğu özet satırları
 * ("1. Genel Özet" + kaynak notu) birleşme çakışması olmasın diye satır olarak DEĞİŞTİRİLMEDİ. Bu yardımcı, o satırların
 * sabit TR metnini (hem bugünkü hem mod-b'nin yeni metni) katalogdaki TR değeriyle eşleştirip çıktı dilindeki karşılığını
 * döndürür. TR'de metin AYNEN döner (golden birebir; mod-b birleşince yeni TR metni de aynen basılır).
 * mod-b birleştikten sonra rota satırı doğrudan `t("encyclopedia.summary…")`'a çevrilip bu köprü kaldırılabilir.
 */
const ENCYCLOPEDIA_BRIDGE_KEYS = ["encyclopedia.summaryTitle", "encyclopedia.summaryNote", "encyclopedia.summaryNoteRecords"] as const;
export function encyclopediaBridgeText(text: string): string {
  const x = stonesText();
  if (x.output.isSource) return text;
  const tr = stonesTextFor(null).t;
  const key = ENCYCLOPEDIA_BRIDGE_KEYS.find((k) => tr(k) === text);
  return key ? x.t(key) : text;
}
