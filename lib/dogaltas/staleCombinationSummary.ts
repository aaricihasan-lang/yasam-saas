/**
 * B6.2 (05.11 canlı denetim, owner kararı A — migration YOK): kombinasyonun taşları değiştirildiğinde
 * kayıt anında üretilmiş OTOMATİK özetler (notes_text = "Arama Koşulları: …", notes_text_2 =
 * "Stok: x/y stokta …") artık eski taş listesine aittir. Bu özetler yeniden HESAPLANMAZ; başına
 * kalıcı bir "güncel değil" satırı eklenir. Özgün özet metni aynen altında kalır (silinmez/ezilmez).
 *
 * Yalnız kombinasyon oluşturucunun ürettiği biçimdeki metinler işaretlenir; kullanıcının veya
 * eski kaynakların serbest metinlerine (ve notes_text_3 notuna) DOKUNULMAZ.
 */

export const STALE_SUMMARY_PREFIX = "⚠ GÜNCEL DEĞİL";

/** Oluşturucunun mineral/koşul özeti biçimi (buildConditionsSummary). */
export function isAutoConditionsSummary(text: string | null | undefined): boolean {
  return String(text ?? "").trimStart().startsWith("Arama Koşulları:");
}

/** Oluşturucunun uyarı/stok özeti biçimi (buildWarningStockSummary). */
export function isAutoStockSummary(text: string | null | undefined): boolean {
  return /^Stok: \d+\/\d+ stokta/.test(String(text ?? "").trimStart());
}

export function isStaleMarkedSummary(text: string | null | undefined): boolean {
  return String(text ?? "").trimStart().startsWith(STALE_SUMMARY_PREFIX);
}

const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr");

/** Taş listesi (sıra önemsiz, Türkçe büyük/küçük harf duyarsız) gerçekten değişti mi? */
export function stoneListsDiffer(before: string | null | undefined, after: string[]): boolean {
  const a = String(before ?? "").split(",").map(normName).filter(Boolean).sort();
  const b = after.map(normName).filter(Boolean).sort();
  return a.length !== b.length || a.some((v, i) => v !== b[i]);
}

/**
 * Otomatik özetin başına "güncel değil" satırını ekler. Boş, zaten işaretli veya otomatik biçimde
 * OLMAYAN (serbest) metin → null (yazılacak bir şey yok).
 */
export function markStaleSummary(
  text: string | null | undefined,
  kind: "conditions" | "stock",
  dateLabel: string,
): string | null {
  const t = String(text ?? "");
  if (!t.trim() || isStaleMarkedSummary(t)) return null;
  const auto = kind === "conditions" ? isAutoConditionsSummary(t) : isAutoStockSummary(t);
  if (!auto) return null;
  return `${STALE_SUMMARY_PREFIX}: Kombinasyonun taşları ${dateLabel} tarihinde değiştirildi. `
    + `Aşağıdaki özet önceki taş listesine aittir ve yeniden hesaplanmadı.\n\n${t}`;
}
