"use client";

/**
 * Arama vurgulaması — YALNIZ EKRAN. Kayıtlı içerik/taslak/veritabanı DEĞİŞMEZ:
 *  - React metinleri (başlıklar, kutu adları, kaynaklar) <Hl> ile parçalanarak gösterilir.
 *  - Zengin içerik (RichView) HTML'i ekrana basılmadan ÖNCE bellekte (DOMParser) işaretlenir;
 *    canlı DOM'a/React'in yönettiği düğümlere sonradan dokunulmaz.
 * Eşleşme kuralı lib/sifa-rehberi-v2/search.ts ile AYNI (findRanges).
 */
import { createContext, Fragment, useContext, useEffect, useRef, type ReactNode } from "react";
import { findRanges, normalizeQuery, MIN_QUERY } from "@/lib/sifa-rehberi-v2/search";

/** Etkin arama (katlanmış). Boş = vurgulama yok. */
const HighlightContext = createContext<string>("");

export function HighlightProvider({ query, children }: { query: string; children: ReactNode }) {
  const fq = normalizeQuery(query);
  return <HighlightContext.Provider value={fq.length >= MIN_QUERY ? fq : ""}>{children}</HighlightContext.Provider>;
}

export function useHighlightQuery(): string {
  return useContext(HighlightContext);
}

export const HIT_ATTR = "data-sifa-hit";

/** Düz metin içinde eşleşmeleri sarı işaretler. */
export function Hl({ text }: { text: string }) {
  const fq = useHighlightQuery();
  if (!fq || !text) return <>{text}</>;
  const ranges = findRanges(text, fq);
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e], i) => {
    if (s > at) parts.push(<Fragment key={`t${i}`}>{text.slice(at, s)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className="sifa-v2-hit" {...{ [HIT_ATTR]: "" }}>
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  if (at < text.length) parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{parts}</>;
}

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH", "FIGCAPTION", "BLOCKQUOTE", "DIV", "FIGURE", "BODY"]);

/**
 * Güvenli (şemadan üretilmiş) HTML içinde eşleşmeleri <mark> ile sarar. Paragraflar arası eşleşme yok;
 * aynı paragrafta biçim sınırını aşan eşleşme (ör. kalın + normal) parça parça işaretlenir.
 * Döndürülen HTML yalnız ekrana basılır; hiçbir yere kaydedilmez.
 */
export function highlightHtml(html: string, fq: string): { html: string; hits: number } {
  if (!html || !fq || typeof DOMParser === "undefined") return { html, hits: 0 };
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  const groups = new Map<Element, Text[]>();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    let p = t.parentElement;
    while (p && !BLOCK_TAGS.has(p.tagName)) p = p.parentElement;
    const key = p ?? doc.body;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  let hits = 0;
  for (const nodes of groups.values()) {
    const joined = nodes.map((t) => t.data).join("");
    const ranges = findRanges(joined, fq);
    if (!ranges.length) continue;
    hits += ranges.length;
    // Her metin düğümünü, kendisine düşen aralık parçalarıyla yeniden kur.
    let offset = 0;
    for (const t of nodes) {
      const s0 = offset;
      const e0 = offset + t.data.length;
      offset = e0;
      const local = ranges.filter(([s, e]) => s < e0 && e > s0).map(([s, e]) => [Math.max(s, s0) - s0, Math.min(e, e0) - s0] as const);
      if (!local.length) continue;
      const frag = doc.createDocumentFragment();
      let at = 0;
      for (const [s, e] of local) {
        if (s > at) frag.appendChild(doc.createTextNode(t.data.slice(at, s)));
        const m = doc.createElement("mark");
        m.className = "sifa-v2-hit";
        m.setAttribute(HIT_ATTR, "");
        m.textContent = t.data.slice(s, e);
        frag.appendChild(m);
        at = e;
      }
      if (at < t.data.length) frag.appendChild(doc.createTextNode(t.data.slice(at)));
      t.parentNode?.replaceChild(frag, t);
    }
  }
  return { html: hits ? doc.body.innerHTML : html, hits };
}

/** Kapsayıcıdaki eşleşmeler (belge sırasıyla). */
export function hitsIn(root: ParentNode | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(`mark[${HIT_ATTR}]`)) : [];
}

/**
 * Konu açıldığında İLK eşleşmeye kaydırır — içerik GERÇEKTEN çizildikten sonra (eşleşme belirene kadar
 * bekler; görseller yüklenip yerleşim kayarsa, kullanıcı kendisi kaydırmadıysa bir kez daha ortalar).
 * `token` her "aramadan aç" eyleminde değişir; aynı token için yalnız bir kez çalışır.
 */
export function useScrollToFirstHit(container: () => HTMLElement | null, token: string | null, onFound?: (count: number) => void) {
  const done = useRef<string | null>(null);
  const cb = useRef(onFound);
  useEffect(() => {
    cb.current = onFound;
  });
  useEffect(() => {
    if (!token || done.current === token) return;
    let cancelled = false;
    let userMoved = false;
    const stopAuto = () => {
      userMoved = true;
    };
    window.addEventListener("wheel", stopAuto, { passive: true });
    window.addEventListener("touchmove", stopAuto, { passive: true });
    window.addEventListener("keydown", stopAuto);
    const began = Date.now();
    const center = (el: HTMLElement) => el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" as ScrollBehavior });
    const tick = () => {
      if (cancelled) return;
      const root = container();
      const first = hitsIn(root).find((m) => m.getClientRects().length > 0);
      if (first) {
        done.current = token;
        // İki kare bekle: yerleşim otursun (yazı tipleri / tablolar).
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (cancelled) return;
            center(first);
            first.classList.add("is-current");
            cb.current?.(hitsIn(container()).length);
            // Görseller sonradan yüklenip yerleşimi kaydırırsa: kullanıcı karışmadıysa yeniden ortala.
            const imgs = Array.from(root?.querySelectorAll("img") ?? []).filter((im) => !im.complete);
            if (imgs.length) {
              let left = imgs.length;
              const again = () => {
                left -= 1;
                if (left === 0 && !cancelled && !userMoved && first.isConnected) center(first);
              };
              imgs.forEach((im) => {
                im.addEventListener("load", again, { once: true });
                im.addEventListener("error", again, { once: true });
              });
            }
          }),
        );
        return;
      }
      if (Date.now() - began > 6000) {
        done.current = token; // eşleşme çizilmedi (ör. yalnız çöpte) — sessizce bırak
        cb.current?.(0);
        return;
      }
      window.setTimeout(tick, 80);
    };
    const t0 = window.setTimeout(tick, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.removeEventListener("wheel", stopAuto);
      window.removeEventListener("touchmove", stopAuto);
      window.removeEventListener("keydown", stopAuto);
    };
  }, [token, container]);
}
