/**
 * lib/dogaltas/reportSafe.ts — Doğaltaş rapor savunmacı okuma yardımcıları (F-011).
 *
 * Legacy / admin→uzman transfer yoluyla gelmiş satırlarda structured JSONB alanları
 * (chakras, warning_tags, tags, related_stones, related_minerals, fiziksel, …) beklenen
 * `string[]` yerine string / number / object gibi YANLIŞ tipte olabilir. Rapor
 * builder'ındaki guard'sız `.join()/.map()/.filter()/.length` bu durumda TypeError atıp
 * TÜM tenant raporunu ham 500 ile öldürür (kanıtlanmış vektör: F-004 + verbatim transfer).
 *
 * Bu yardımcılar bilinmeyen değerden ANLAM ÜRETMEZ: geçerli bir `string[]` beğeni normalize
 * edilir; array değilse boş kabul edilir (rapor o alanı atlar, ama çökmez).
 */

/**
 * Bir JSONB alanını güvenli `string[]`'e indirger.
 *   - Array değilse → [] (raporda alan atlanır).
 *   - Array ise: her eleman String()'e çevrilip trim'lenir, boşlar atılır.
 * Sayı içeren array ("5" gibi) de kabul edilir (kayıp yerine görünür metin).
 */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (item == null) continue;
    if (typeof item === "object") continue; // iç içe obje/array anlamı bilinmez → atla
    const s = String(item).trim();
    if (s) out.push(s);
  }
  return out;
}

/** Güvenli join: array değilse "" döner (guard'sız `.join` yerine). */
export function safeJoin(value: unknown, sep = ", "): string {
  return asStringArray(value).join(sep);
}

/** Güvenli uzunluk: array değilse 0. (`?.length` string üstünde yanıltıcı olabilir.) */
export function safeLen(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
