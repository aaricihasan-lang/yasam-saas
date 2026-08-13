/**
 * Şifa Rehberi — önerilen kategori sözlüğü (soft controlled-vocabulary).
 *
 * KARAR (Faz 1): kategori ZORUNLU DEĞİL, hiyerarşi/çoklu YOK, ICD/tıbbi taksonomi
 * YOK. `category` kolonu serbest metin olarak KORUNUR (migration yok). UI kullanıcıya
 * bu listeyi <datalist> ile önerir; kullanıcı listede olmayan özel değer de yazabilir.
 *
 * Bu liste yalnızca ÖNERİdir; production'daki mevcut kayıtlara BACKFILL YAPILMAZ.
 * Sistem/organ temelli, sade ve genişletilebilir.
 */
export const SUGGESTED_CATEGORIES: readonly string[] = [
  "Solunum Sistemi",
  "Sindirim Sistemi",
  "Dolaşım Sistemi",
  "Sinir Sistemi",
  "Kas-İskelet Sistemi",
  "Cilt",
  "Kulak-Burun-Boğaz",
  "Ağız ve Diş",
  "Göz",
  "Ürogenital Sistem",
  "Kadın Sağlığı",
  "Endokrin / Hormonal",
  "Bağışıklık Sistemi",
  "Psikolojik / Duygusal",
  "Çocuk Sağlığı",
  "Uyku",
  "Genel / Diğer",
];

/** Verilen değer önerilen listede mi (görsel işaretleme vb. için)? */
export function isSuggestedCategory(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLocaleLowerCase("tr-TR");
  return SUGGESTED_CATEGORIES.some((c) => c.toLocaleLowerCase("tr-TR") === v);
}
