/**
 * DY toplu Word (WT7) — istemci + sunucu ortak sabit/saf yardımcılar.
 *
 * Toplu dosya her danışan için TEKLİ raporun tam içeriğini taşır. Tek dosyada en fazla
 * BULK_WORD_MAX_CLIENTS danışan (1/3/10/50/100 sentetik danışan ölçümüyle belirlendi);
 * aşımda istemci ve sunucu AÇIK hata verir — kayıt asla sessizce kırpılmaz.
 */
export const BULK_WORD_MAX_CLIENTS = 100;

export type BulkWordScope = { mode: "selected" | "all"; count: number; isAll: boolean };

/**
 * Tek dinamik buton kapsamı:
 *   - seçim yok → count 0 (buton pasif)
 *   - seçim = GERÇEK toplam danışan sayısı → "Tümünü Word İndir" (filtre yoksa sunucuya "all")
 *   - aksi → "Seçilenleri Word İndir"
 */
export function resolveBulkWordScope(selectedCount: number, realTotal: number | null, hasActiveFilter: boolean): BulkWordScope {
  const isAll = selectedCount > 0 && realTotal !== null && selectedCount === realTotal;
  return { mode: isAll && !hasActiveFilter ? "all" : "selected", count: selectedCount, isAll };
}
