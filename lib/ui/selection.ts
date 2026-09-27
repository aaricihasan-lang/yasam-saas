/**
 * Toplu seçim güvenliği — SAF yardımcılar.
 *
 * Kural: filtre/arama değişince seçim, görünür (filtrelenmiş) kayıtlarla kesişime
 * budanır; silme de yalnız "seçili ∩ görünür" üzerinden yapılır. Böylece aramayla
 * gizlenmiş bir kayıt habersizce silinemez.
 */

/**
 * Seçimi görünür id'lerle budar. Hiçbir şey çıkarılmıyorsa AYNI Set referansını
 * döndürür (React state döngüsü oluşturmamak için).
 */
export function pruneSelection<T>(prev: ReadonlySet<T>, visibleIds: Iterable<T>): Set<T> {
  if (prev.size === 0) return prev as Set<T>;
  const visible = visibleIds instanceof Set ? (visibleIds as Set<T>) : new Set(visibleIds);
  let removed = false;
  for (const id of prev) {
    if (!visible.has(id)) {
      removed = true;
      break;
    }
  }
  if (!removed) return prev as Set<T>;
  const next = new Set<T>();
  for (const id of prev) if (visible.has(id)) next.add(id);
  return next;
}

/** Silme için güvenli id listesi: seçili ∩ görünür (sıra görünür listeye göre). */
export function visibleSelection<T>(selected: ReadonlySet<T>, visibleIds: Iterable<T>): T[] {
  const out: T[] = [];
  for (const id of visibleIds) if (selected.has(id)) out.push(id);
  return out;
}
