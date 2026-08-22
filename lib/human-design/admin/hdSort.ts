/**
 * HD bilgi bankası liste sıralaması — deterministik, DB/migration'sız.
 *
 * Liste API'si (`listCanonical`) `canonical_key` STRING sırasıyla döner → Kapı/Kanal
 * lexical bozuk sıralanır (kapi_1, kapi_10, kapi_11, …, kapi_2). Bu yardımcı
 * canonical_key'ten sayısal/tuple anahtar üretir ve doğru sırayı client-side kurar.
 *
 * - KAPI:  kapi_<N>            → N sayısal ASC (1 → 64)
 * - KANAL: kanal_<A>_<B>       → [A, B] tuple sayısal ASC (önce A, sonra B)
 * - TIP / OTORITE: ürün için sabit kanonik sıra
 * - Bilinmeyen/gelecek anahtar: stabil fallback (sıra sonu, lexical)
 */

import type { HdEntityKind } from "./centralContentTypes";

/** Tip için ürün kanonik sırası (canonical_key). */
export const HD_TYPE_ORDER: readonly string[] = [
  "tip_manifestor",
  "tip_generator",
  "tip_manifesting_generator",
  "tip_projector",
  "tip_reflector",
];

/** Otorite için ürün kanonik sırası (canonical_key). */
export const HD_AUTHORITY_ORDER: readonly string[] = [
  "otorite_emotional",
  "otorite_sacral",
  "otorite_splenic",
  "otorite_ego_heart",
  "otorite_self_projected",
  "otorite_mental_environmental",
  "otorite_lunar",
];

const BIG = Number.MAX_SAFE_INTEGER;

/** Sabit-sıralı türler için index; bulunmazsa BIG (sona atılır, sonra lexical). */
function fixedIndex(order: readonly string[], key: string): number {
  const i = order.indexOf(key);
  return i === -1 ? BIG : i;
}

/** kapi_<N> → N; parse edilemezse BIG. */
function gateNumber(key: string): number {
  const m = key.match(/^kapi_(\d+)$/);
  return m ? Number(m[1]) : BIG;
}

/** kanal_<A>_<B> → [A, B]; parse edilemezse [BIG, BIG]. */
function channelTuple(key: string): [number, number] {
  const m = key.match(/^kanal_(\d+)_(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : [BIG, BIG];
}

/** İki değeri (kind'e göre) deterministik karşılaştırır; eşitlikte canonical_key lexical. */
export function compareCanonicalKeys(kind: HdEntityKind, a: string, b: string): number {
  if (a === b) return 0;
  if (kind === "kapi") {
    const d = gateNumber(a) - gateNumber(b);
    if (d !== 0) return d;
  } else if (kind === "kanal") {
    const [a1, a2] = channelTuple(a);
    const [b1, b2] = channelTuple(b);
    if (a1 !== b1) return a1 - b1;
    if (a2 !== b2) return a2 - b2;
  } else if (kind === "tip") {
    const d = fixedIndex(HD_TYPE_ORDER, a) - fixedIndex(HD_TYPE_ORDER, b);
    if (d !== 0) return d;
  } else if (kind === "otorite") {
    const d = fixedIndex(HD_AUTHORITY_ORDER, a) - fixedIndex(HD_AUTHORITY_ORDER, b);
    if (d !== 0) return d;
  }
  // Stabil fallback: lexical (Türkçe-nötr, kanonik anahtarlar ASCII).
  return a < b ? -1 : 1;
}

/** Verilen kind için satırları canonical_key üzerinden deterministik sıralar (kopyalar). */
export function sortCanonicalRows<T extends { canonical_key: string }>(
  kind: HdEntityKind,
  rows: readonly T[],
): T[] {
  return [...rows].sort((x, y) => compareCanonicalKeys(kind, x.canonical_key, y.canonical_key));
}
