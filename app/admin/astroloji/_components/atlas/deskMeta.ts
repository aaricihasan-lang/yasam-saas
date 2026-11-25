/**
 * I18N-0008 (Atl-A0): sonuç masası künye öğeleri — SAF (ResultDesk'ten ayrıldı; testte React/yazı tipi yüklemeden doğrulanır).
 */
// i18n-ignore: eski çağıranlar için TR metin yedeği — yeni uyarı öğeleri `{ text, warn: true }` ile işaretlenir (I18N-0008)
const META_WARN_RE = /bilinmiyor|Yüksek enlem|sınırına/i;

/**
 * I18N-0008: künye öğesi. Uyarı niteliği artık metinden değil, çağıranın açık işaretinden (`warn: true`) gelir → metin
 * çevrilse de uyarı çipi kaybolmaz. Düz metin öğelerinde eski TR regex yedeği aynen korunur (TR davranışı birebir).
 */
export type DeskMetaItem = string | { text: string; warn: true } | null | undefined | false;

export function deskMetaTexts(meta: readonly DeskMetaItem[] | undefined): string[] {
  return (meta ?? []).flatMap((m) => (!m ? [] : typeof m === "string" ? [m] : [m.text]));
}

export function deskMetaSplit(meta: readonly DeskMetaItem[] | undefined): { warn: string[]; plain: string[] } {
  const warn: string[] = [];
  const plain: string[] = [];
  for (const m of meta ?? []) {
    if (!m) continue;
    const text = typeof m === "string" ? m : m.text;
    const isWarn = typeof m === "string" ? META_WARN_RE.test(m) : true;
    (isWarn ? warn : plain).push(text);
  }
  return { warn, plain };
}
