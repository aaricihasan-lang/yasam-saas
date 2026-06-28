/**
 * Doğaltaş modülü — ortak arama vurgulama (highlight) yardımcıları.
 *
 * Daha önce bu mantık 6+ sayfada birebir kopyalanmıştı; kopyaların bir kısmında
 * Türkçe `İ` normalizasyonu eksik olduğu için "İYOT" gibi aramalar
 * mineral/kombinasyon sayfalarında eşleşmiyordu (P0-1). Tek kaynak burada:
 * normalizasyon `normalizeTr` üzerinden gelir (İ dahil tüm Türkçe karakterler).
 */

import { Fragment, type ReactNode } from "react";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

/** Vurgulanan eşleşme parçasının (`<mark>`) sınıfı. */
export const HIGHLIGHT_MARK_CLASS =
  "rounded bg-yellow-200 px-1 font-bold text-slate-950";

/** "Eşleşme var" rozetinin standart (geniş) sınıfı. */
export const SEARCH_MATCH_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700";

/** "Eşleşme var" rozetinin kompakt (kart içi) sınıfı. */
export const SEARCH_MATCH_BADGE_COMPACT_CLASS =
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700";

/** Arama eşleşmesi olan kartın vurgulanması için eklenen sınıf. */
export const SEARCH_MATCH_CARD_CLASS = "border-rose-300 ring-2 ring-rose-100";

/** Kart sınıfına, arama eşleşmesi varsa vurgu sınıfını ekler. */
export function mergeMatchCardClass(
  baseClass: string,
  hasSearchMatch: boolean,
): string {
  return hasSearchMatch ? `${baseClass} ${SEARCH_MATCH_CARD_CLASS}` : baseClass;
}

/**
 * Metni Türkçe karakter ve büyük/küçük harf farkı olmadan karşılaştırılabilir
 * forma çevirir. `normalizeTr` ile aynıdır (İ dahil); geriye dönük uyum için
 * sayfaların alışık olduğu isimle dışa verilir.
 */
export function normalizeTrSearch(value: string): string {
  return normalizeTr(value);
}

/**
 * Orijinal metni normalize ederken, normalize edilmiş her karakterin
 * orijinaldeki indeksini tutan bir harita üretir. Vurgulamanın orijinal
 * metin üzerinde doğru aralığı işaretlemesi için gereklidir.
 */
export function buildNormIndexMap(text: string): {
  norm: string;
  indexMap: number[];
} {
  let norm = "";
  const indexMap: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const charNorm = normalizeTrSearch(text[i] ?? "");
    for (let j = 0; j < charNorm.length; j += 1) {
      norm += charNorm[j];
      indexMap.push(i);
    }
  }

  return { norm, indexMap };
}

/**
 * `query`'yi `text` içinde (Türkçe normalize ederek) bulur ve eşleşen
 * parçaları `<mark>` ile sarar. Eşleşme yoksa düz metni döndürür.
 */
export function renderHighlightedText(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const queryNorm = normalizeTrSearch(trimmedQuery);
  if (!queryNorm) return text;

  const { norm, indexMap } = buildNormIndexMap(text);
  const nodes: ReactNode[] = [];
  let lastEnd = 0;
  let searchFrom = 0;

  while (searchFrom <= norm.length - queryNorm.length) {
    const idx = norm.indexOf(queryNorm, searchFrom);
    if (idx < 0) break;

    const startOrig = indexMap[idx] ?? 0;
    const endOrig = (indexMap[idx + queryNorm.length - 1] ?? startOrig) + 1;

    if (startOrig > lastEnd) {
      nodes.push(
        <Fragment key={`p-${lastEnd}`}>{text.slice(lastEnd, startOrig)}</Fragment>,
      );
    }

    nodes.push(
      <mark key={`m-${startOrig}-${idx}`} className={HIGHLIGHT_MARK_CLASS}>
        {text.slice(startOrig, endOrig)}
      </mark>,
    );

    lastEnd = endOrig;
    searchFrom = idx + queryNorm.length;
  }

  if (lastEnd < text.length) {
    nodes.push(<Fragment key="p-end">{text.slice(lastEnd)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : text;
}

/** `text`, `query`'yi (Türkçe normalize ederek) içeriyor mu? */
export function textMatchesQuery(
  text: string | null | undefined,
  query: string,
): boolean {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return false;
  const haystack = normalizeTrSearch(String(text ?? ""));
  const needle = normalizeTrSearch(trimmedQuery);
  return Boolean(needle) && haystack.includes(needle);
}
