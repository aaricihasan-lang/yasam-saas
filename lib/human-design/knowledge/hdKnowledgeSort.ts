// HD Bilgi Bankası kayıtları — OTOMATİK, KARARLI sıralama (manuel sort_order KULLANILMAZ).
//
//   • Kategori sırası: verilen sıra (varsayılan HD_KNOWLEDGE_CATEGORIES).
//   • Kapılar: teknik kapı numarası (kapi_N) küçükten büyüğe.
//   • Kanallar: kanal kodundaki [ilk, ikinci] sayı.
//   • Tip/Otorite/Profil/Tanım/Merkez: sistemin sabit seçenek sırası.
//   • Serbest kategoriler (Stratejiler, Genel Notlar): Türkçe alfabetik başlık.
//   • Son eşitlik kırıcı: kod, sonra id → her yenilemede aynı sıra.
// Görünen ad, kayıt tarihi veya eski sort_order değeri sırayı ETKİLEMEZ.

import { HD_KNOWLEDGE_CATEGORIES, HD_KNOWLEDGE_CATEGORY_PREFIX, type HdKnowledgeCategory } from "@/lib/human-design/constants";
import { getStructuredCategoryOptions } from "@/lib/human-design/codeHelpers";

export type HdSortableKnowledge = { category?: unknown; code?: unknown; title?: unknown; id?: unknown };

const trCollator = new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function gateNum(code: string): number | null {
  const m = /^kapi_(\d+)$/.exec(code);
  return m ? Number(m[1]) : null;
}

function channelPair(code: string): [number, number] | null {
  const m = /^kanal_(\d+)_(\d+)$/.exec(code);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const structuredIndexCache = new Map<string, Map<string, number>>();
function structuredIndex(category: string): Map<string, number> | null {
  if (structuredIndexCache.has(category)) return structuredIndexCache.get(category)!;
  const opts = getStructuredCategoryOptions(category);
  if (!opts) return null;
  const prefix = HD_KNOWLEDGE_CATEGORY_PREFIX[category as HdKnowledgeCategory];
  const m = new Map<string, number>(opts.map((o, i) => [`${prefix}_${o.code}`, i]));
  structuredIndexCache.set(category, m);
  return m;
}

/** Bilinen anahtarlı kayıt önce (anahtar artan); anahtarı çözülemeyen sonra. */
function cmpKeys(a: number[] | null, b: number[] | null): number {
  if (a && b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  }
  if (a) return -1;
  if (b) return 1;
  return 0;
}

/** AYNI kategorideki iki kaydı karşılaştırır. */
export function compareHdKnowledgeWithinCategory(a: HdSortableKnowledge, b: HdSortableKnowledge): number {
  const category = str(a.category);
  const ca = str(a.code);
  const cb = str(b.code);
  let d = 0;
  if (category === "Kapılar") {
    const ga = gateNum(ca);
    const gb = gateNum(cb);
    d = cmpKeys(ga === null ? null : [ga], gb === null ? null : [gb]);
  } else if (category === "Kanallar") {
    d = cmpKeys(channelPair(ca), channelPair(cb));
  } else {
    const idx = structuredIndex(category);
    if (idx) {
      const ia = idx.get(ca);
      const ib = idx.get(cb);
      d = cmpKeys(ia === undefined ? null : [ia], ib === undefined ? null : [ib]);
    }
  }
  if (d !== 0) return d;
  d = trCollator.compare(str(a.title), str(b.title));
  if (d !== 0) return d;
  d = ca < cb ? -1 : ca > cb ? 1 : 0;
  if (d !== 0) return d;
  const ia = str(a.id);
  const ib = str(b.id);
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

export function compareHdKnowledgeRecords(
  a: HdSortableKnowledge,
  b: HdSortableKnowledge,
  categoryOrder: readonly string[] = HD_KNOWLEDGE_CATEGORIES,
): number {
  const rank = (c: string) => {
    const i = categoryOrder.indexOf(c);
    return i === -1 ? categoryOrder.length : i;
  };
  const d = rank(str(a.category)) - rank(str(b.category));
  if (d !== 0) return d;
  if (str(a.category) !== str(b.category)) return trCollator.compare(str(a.category), str(b.category));
  return compareHdKnowledgeWithinCategory(a, b);
}

/** Yeni dizi döner (girdi değişmez). */
export function sortHdKnowledgeRecords<T extends HdSortableKnowledge>(rows: readonly T[], categoryOrder?: readonly string[]): T[] {
  return [...rows].sort((a, b) => compareHdKnowledgeRecords(a, b, categoryOrder));
}
