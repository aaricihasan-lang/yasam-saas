/**
 * Silme onaylarında gösterilecek kayıt adı listesi — SAF (pure) yardımcılar.
 *
 * Amaç: toplu silmede yalnız ADET değil, silinecek kayıtların ADLARI da görünür
 * olsun (aramayla gizlenmiş seçili kaydın habersiz silinmesini engellemek).
 */

/** Onayda en fazla kaç ad listelenir; kalanlar "ve N kayıt daha" olarak özetlenir. */
export const MAX_CONFIRM_NAMES = 10;

function clean(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Türkçe "ve N kayıt daha" satırı (varsayılan; I18N-F1: ekran dili için çağıran kendi metnini verir). */
export const TR_MORE_RECORDS = (n: number): string => `ve ${n} kayıt daha`;

/**
 * I18N (QTM-DY-02 / QTM-DG-05) — ekran dili varsayılan "ve N kayıt daha" satırı. ConfirmProvider (ortak) mount
 * olduğunda katalogdan (common.deleteConfirm.moreRecords) kaydeder; böylece `moreLine` geçmeyen mevcut çağıranlar
 * (modül ekranları) da ekran dilinde gösterilir. Kayıt yoksa (test/sunucu) Türkçe yedek. TR katalog değeri
 * TR_MORE_RECORDS ile birebir aynıdır (birim testi). Listelenecek ad sayısı ve yazılı onay kuralı bundan BAĞIMSIZDIR.
 */
let registeredMoreRecords: ((n: number) => string) | null = null;
export function setDefaultMoreRecordsLine(fn: ((n: number) => string) | null): void {
  registeredMoreRecords = fn;
}
export function defaultMoreRecordsLine(): (n: number) => string {
  return registeredMoreRecords ?? TR_MORE_RECORDS;
}

/**
 * "• Ad" satırları + gerekirse "• ve N kayıt daha".
 * @param total Toplam silinecek kayıt (bazı adlar çözülemese de doğru sayı için).
 * @param moreLine Kalan kayıt satırı metni (dil bağımsızlık; verilmezse kayıtlı ekran dili varsayılanı, o da yoksa Türkçe).
 */
export function buildNameListLines(names: readonly string[], total?: number, moreLine?: (n: number) => string): string[] {
  const more = moreLine ?? defaultMoreRecordsLine();
  const list = names.map(clean).filter((n) => n.length > 0);
  const count = Math.max(total ?? list.length, list.length);
  const shown = list.slice(0, MAX_CONFIRM_NAMES);
  const lines = shown.map((n) => `• ${n}`);
  const remaining = count - shown.length;
  if (remaining > 0) lines.push(`• ${more(remaining)}`);
  return lines;
}

export type BulkDeleteConfirmInput = {
  /** Kayıt türü, çoğul değil: "danışan", "taş", "kayıt"... */
  noun: string;
  names: readonly string[];
  total: number;
  /** Silme kapsamı hakkında ek satırlar (ör. "Bağlı seanslar da silinir."). */
  scopeLines?: readonly string[];
};

/** Toplu silme onay mesajı: "N danışan kalıcı olarak silinecek:\n• ...". */
export function buildBulkDeleteMessage(input: BulkDeleteConfirmInput): string {
  const head =
    input.total === 1
      ? `Şu ${input.noun} kalıcı olarak silinecek:`
      : `${input.total} ${input.noun} kalıcı olarak silinecek:`;
  const parts = [head, buildNameListLines(input.names, input.total).join("\n")];
  if (input.scopeLines && input.scopeLines.length > 0) parts.push(input.scopeLines.join("\n"));
  return parts.join("\n\n");
}
