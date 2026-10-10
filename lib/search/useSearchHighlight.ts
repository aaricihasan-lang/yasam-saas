"use client";

/**
 * Arama eşleşmelerini detay ekranında SARI vurgular + ilk eşleşmeye bir kez kaydırır (WT8).
 *
 * Kapsam (bilinçli dar): Doğaltaş Detay Arama (taş detayı + taş detay paneli) ve Biyoenerji genel
 * arama → kayıt detayı. Diğer modüllere yayılmaz.
 *
 * Yöntem: CSS Custom Highlight API (`CSS.highlights` + `::highlight(yasam-search-hit)`, globals.css).
 * DOM'a <mark> EKLENMEZ → React'in yönettiği metin düğümleri bozulmaz (yeniden render/düzenleme
 * güvenli); içerik sonradan yüklense de MutationObserver ile yeniden hesaplanır. API'yi desteklemeyen
 * eski tarayıcıda vurgu sessizce atlanır (ilk eşleşmeye kaydırma yine çalışır).
 *
 * Eşleşme kuralı mevcut aramalarla aynıdır: `normalizeTr` (büyük/küçük harf + Türkçe karakter
 * katlamalı) → "mide" = "MİDE" = "Mide"; metindeki HER geçiş ayrı vurgulanır.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { normalizeTr } from "@/lib/text/turkishSearch";

export const SEARCH_HIGHLIGHT_NAME = "yasam-search-hit";
export const SEARCH_HIGHLIGHT_MIN = 2;

/** Bir metindeki tüm eşleşme aralıkları [başlangıç, bitiş) — orijinal metin indeksleriyle. SAF. */
export function findMatchRanges(text: string, terms: readonly string[]): [number, number][] {
  const needles = [...new Set(terms.map((t) => normalizeTr(t.trim())).filter((n) => n.length >= SEARCH_HIGHLIGHT_MIN))];
  if (!text || needles.length === 0) return [];
  // Karakter karakter katla: katlanmış her karakterin orijinaldeki indeksi tutulur.
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const n = normalizeTr(text[i] ?? "");
    for (let j = 0; j < n.length; j += 1) {
      norm += n[j];
      map.push(i);
    }
  }
  const found: [number, number][] = [];
  for (const needle of needles) {
    let from = 0;
    while (from <= norm.length - needle.length) {
      const at = norm.indexOf(needle, from);
      if (at < 0) break;
      const start = map[at] ?? 0;
      const end = (map[at + needle.length - 1] ?? start) + 1;
      found.push([start, end]);
      from = at + needle.length;
    }
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  // Çakışanları birleştir (iki terim üst üste binerse tek vurgu).
  const merged: [number, number][] = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

function highlightApi(): { registry: HighlightRegistry; Ctor: HighlightCtor } | null {
  if (typeof window === "undefined") return null;
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Ctor = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
  return css?.highlights && Ctor ? { registry: css.highlights, Ctor } : null;
}

// Aynı anda birden çok vurgulayıcı olabilir (ör. sayfa + okuyucu penceresi) → tek ortak Highlight.
const activeRanges = new Map<number, Range[]>();
let nextInstance = 1;
function publish(): void {
  const api = highlightApi();
  if (!api) return;
  const all = [...activeRanges.values()].flat();
  if (all.length === 0) api.registry.delete(SEARCH_HIGHLIGHT_NAME);
  else api.registry.set(SEARCH_HIGHLIGHT_NAME, new api.Ctor(...all));
}

function collectRanges(root: HTMLElement, terms: readonly string[]): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,textarea,[data-no-search-highlight]")) return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const [start, end] of findMatchRanges(node.nodeValue ?? "", terms)) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      ranges.push(range);
    }
  }
  return ranges;
}

function isRendered(range: Range): boolean {
  const rect = range.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

export type UseSearchHighlightOptions = {
  enabled?: boolean;
  /** İlk eşleşmeye bir kez kaydır (varsayılan: true). Sonra kullanıcı serbestçe gezinir. */
  scrollToFirst?: boolean;
  /** Değişince "ilk eşleşmeye kaydırma" yeniden yapılır (ör. açılan kayıt kimliği). */
  resetKey?: string;
};

/** `ref` altındaki görünür metinde `terms` eşleşmelerini vurgular; eşleşme sayısını döner. */
export function useSearchHighlight(
  ref: RefObject<HTMLElement | null>,
  terms: readonly string[],
  { enabled = true, scrollToFirst = true, resetKey = "" }: UseSearchHighlightOptions = {},
): number {
  const [count, setCount] = useState(0);
  const termsKey = terms.map((t) => t.trim()).filter(Boolean).join("\u0001");
  const scrolledFor = useRef<string | null>(null);

  useEffect(() => {
    const root = ref.current;
    const list = termsKey ? termsKey.split("\u0001") : [];
    const active = enabled && root && list.some((t) => normalizeTr(t).length >= SEARCH_HIGHLIGHT_MIN);
    if (!active || !root) {
      // Kapanınca (ör. panel kapandı) sıfırla → bir sonraki açılış yine ilk eşleşmeye kaydırır.
      scrolledFor.current = null;
      queueMicrotask(() => setCount(0));
      return;
    }
    const id = nextInstance++;
    const scrollKey = `${resetKey}\u0002${termsKey}`;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const ranges = collectRanges(root, list);
      activeRanges.set(id, ranges);
      publish();
      setCount(ranges.length);
      if (scrollToFirst && scrolledFor.current !== scrollKey) {
        const first = ranges.find(isRendered);
        if (first) {
          scrolledFor.current = scrollKey;
          const el = first.startContainer.parentElement;
          el?.scrollIntoView({ block: "center", behavior: "auto" });
        }
      }
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      activeRanges.delete(id);
      publish();
    };
  }, [ref, termsKey, enabled, scrollToFirst, resetKey]);

  return count;
}
