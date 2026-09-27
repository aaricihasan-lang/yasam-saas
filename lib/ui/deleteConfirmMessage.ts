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

/**
 * "• Ad" satırları + gerekirse "• ve N kayıt daha".
 * @param total Toplam silinecek kayıt (bazı adlar çözülemese de doğru sayı için).
 */
export function buildNameListLines(names: readonly string[], total?: number): string[] {
  const list = names.map(clean).filter((n) => n.length > 0);
  const count = Math.max(total ?? list.length, list.length);
  const shown = list.slice(0, MAX_CONFIRM_NAMES);
  const lines = shown.map((n) => `• ${n}`);
  const remaining = count - shown.length;
  if (remaining > 0) lines.push(`• ve ${remaining} kayıt daha`);
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
