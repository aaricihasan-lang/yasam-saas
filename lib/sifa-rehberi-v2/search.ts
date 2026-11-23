/**
 * Şifa Rehberi V2 — Araştırma Kütüphanem araması (SAF; DOM/ağ yok).
 *
 * Kapsam: yalnız YÜKLÜ çalışma alanı = sunucunun bu uzmana verdiği kayıtlar (kişisel + kendi tenant'ının
 * kurum kayıtları). Yeni sunucu ucu YOK → arama, kullanıcının zaten göremediği hiçbir kaydı içeremez.
 * Çöpteki konu/kutu aranmaz. Diğer Yaşam Sistemi modüllerine yayılmaz.
 *
 * EŞLEŞME KURALI (tek kaynak; liste, vurgulama ve ağaç işareti aynı fonksiyonu kullanır):
 *  1) Büyük/küçük harf Türkçe kuralıyla küçültülür (I→ı, İ→i).
 *  2) Türkçe ve aksanlı harfler kök harfe katlanır: ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, â→a, î→i, û→u
 *     (ayrık yazılmış birleşik işaretler de düşer). Böylece İ, I, ı, i birbirini bulur; "öksürük" ile
 *     "oksuruk" aynıdır. Bilinçli ödünleşim: "kır" araması "kir"i de bulur (Türkçe klavyesiz yazımda
 *     yanlış negatif vermemek için).
 *  3) Ardışık boşluklar tek boşluk sayılır; satır sonu ayrı paragrafları BİRLEŞTİRMEZ (paragraflar arası
 *     eşleşme yok). Noktalama korunur: sorgu metindeki karakter dizisini birebir arar (alt-dizge).
 *  4) Sorgu en az MIN_QUERY katlanmış karakter olmalı (tek harf her şeyi bulur).
 */
import type { JSONContent } from "@tiptap/core";
import { childrenOf } from "@/lib/sifa-rehberi-v2/tree";
import type { Block, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

export const MIN_QUERY = 2;

const FOLD: Record<string, string> = { ı: "i", ş: "s", ç: "c", ğ: "g", ü: "u", ö: "o", â: "a", î: "i", û: "u" };
const COMBINING = /[̀-ͯ]/g;

/** Karakter başına katlama (önbellekli: metinlerdeki farklı karakter sayısı küçüktür). */
const foldCache = new Map<string, string>();
function foldChar(ch: string): string {
  const hit = foldCache.get(ch);
  if (hit !== undefined) return hit;
  let out: string;
  if (ch === "\n" || ch === "\r") out = "\n";
  else if (/\s/.test(ch)) out = " ";
  else {
    const low = ch.toLocaleLowerCase("tr-TR");
    let o = "";
    for (const c of low) o += FOLD[c] ?? c;
    out = o.normalize("NFD").replace(COMBINING, "");
  }
  if (foldCache.size < 4096) foldCache.set(ch, out);
  return out;
}

export type Folded = {
  /** Katlanmış metin. */
  text: string;
  /** text[i] → özgün metindeki karakterin (UTF-16) başlangıç konumu. */
  start: number[];
  /** text[i] → özgün karakterin bitiş konumu (dahil değil). */
  end: number[];
};

/** Konum haritalı katlama: katlanmış eşleşme, özgün metinde AYNI harflere geri eşlenebilir. */
export function foldWithMap(input: string): Folded {
  let text = "";
  const start: number[] = [];
  const end: number[] = [];
  let i = 0;
  let last = "";
  for (const ch of input) {
    const len = ch.length;
    let f = foldChar(ch);
    if (f === " " && (last === " " || last === "\n")) f = "";
    // UTF-16 birimi başına bir harita girdisi (emoji gibi vekil çiftlerde konum kaymaz).
    for (let k = 0; k < f.length; k++) {
      start.push(i);
      end.push(i + len);
    }
    if (f) {
      text += f;
      last = f[f.length - 1];
    }
    i += len;
  }
  return { text, start, end };
}

export function foldSearch(input: unknown): string {
  return typeof input === "string" ? foldWithMap(input).text : "";
}

/** Sorgu: katlanır, satır sonu boşluğa çevrilir, baş/son boşluk kırpılır. */
export function normalizeQuery(q: unknown): string {
  return typeof q === "string" ? foldSearch(q.replace(/[\r\n]+/g, " ")).trim() : "";
}

export function isSearchable(q: unknown): boolean {
  return normalizeQuery(q).length >= MIN_QUERY;
}

/** Özgün metinde, katlanmış sorgunun TÜM (çakışmasız) eşleşmelerinin [başlangıç, bitiş) aralıkları. */
export function findRanges(text: string, foldedQuery: string): [number, number][] {
  if (!text || foldedQuery.length < MIN_QUERY) return [];
  const f = foldWithMap(text);
  const out: [number, number][] = [];
  let from = 0;
  for (;;) {
    const i = f.text.indexOf(foldedQuery, from);
    if (i < 0) break;
    const j = i + foldedQuery.length - 1;
    out.push([f.start[i], f.end[j]]);
    from = i + foldedQuery.length;
  }
  return out;
}

/** Kutudaki aranabilir metinler: ad + içerik + görsel açıklamaları + kaynak bilgileri. */
function blockTexts(b: Block): string[] {
  const out = [b.title, b.contentText];
  const walk = (n: JSONContent | null | undefined) => {
    if (!n) return;
    if (n.type === "figure") {
      if (n.attrs?.caption) out.push(String(n.attrs.caption));
      if (n.attrs?.alt) out.push(String(n.attrs.alt));
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(b.contentJson);
  for (const s of b.sources) out.push(s.title, s.authors ?? "", s.year ?? "", s.doi ?? "");
  return out.filter(Boolean);
}

export type SearchIndex = {
  /** Ana konu kimliği → katlanmış metinleri (alt ağacın tamamı). */
  roots: Map<string, string[]>;
  /** Başlık kimliği → yalnız o başlığın kendi metinleri (ad + kendi kutuları). */
  nodes: Map<string, string[]>;
};

/** Çalışma alanı dizini (canlı, çöpte olmayan kayıtlar). Ağır iş tek sefer; sorgu başına yalnız indexOf. */
export function buildSearchIndex(ws: Workspace): SearchIndex {
  const live = new Map<string, TopicNode>();
  for (const n of ws.nodes) if (!n.deletedAt) live.set(n.id, n);
  const nodes = new Map<string, string[]>();
  for (const n of live.values()) nodes.set(n.id, [foldSearch(n.title)]);
  for (const b of ws.blocks) {
    if (b.deletedAt) continue;
    const arr = nodes.get(b.nodeId);
    if (!arr) continue; // kutu çöpteki/var olmayan başlıkta
    for (const t of blockTexts(b)) arr.push(foldSearch(t));
  }
  // Kök: üst zinciri canlı olan başlıklar kendi köküne toplanır (döngüye karşı derinlik sınırlı).
  const rootOfId = (id: string): string | null => {
    let cur = live.get(id);
    for (let d = 0; cur && d < 64; d++) {
      if (cur.parentId === null) return cur.id;
      cur = live.get(cur.parentId);
    }
    return null;
  };
  const roots = new Map<string, string[]>();
  for (const [id, texts] of nodes) {
    const r = rootOfId(id);
    if (!r) continue;
    const arr = roots.get(r) ?? [];
    arr.push(...texts);
    roots.set(r, arr);
  }
  return { roots, nodes };
}

const collator = new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });

/** Türkçe alfabetik sıra (A→Z; Ç, Ğ, İ, Ö, Ş, Ü doğru yerde). Eşitlikte kimlikle kararlı. */
export function compareTitlesTr(a: { title: string; id: string }, b: { title: string; id: string }): number {
  return collator.compare(a.title.trim(), b.title.trim()) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Kütüphane listesi: tüm ana konular, Türkçe alfabetik. */
export function libraryRoots(ws: Workspace): TopicNode[] {
  return [...childrenOf(ws, null)].sort(compareTitlesTr);
}

/** Eşleşen ana konular (her konu EN FAZLA BİR KEZ), Türkçe alfabetik. */
export function searchRoots(ws: Workspace, index: SearchIndex, q: string): TopicNode[] {
  const fq = normalizeQuery(q);
  if (fq.length < MIN_QUERY) return [];
  return libraryRoots(ws).filter((r) => (index.roots.get(r.id) ?? []).some((t) => t.includes(fq)));
}

/** Bu başlığın KENDİ içeriğinde (ad + kutular) eşleşme var mı? (ağaç işareti için) */
export function nodeHasMatch(index: SearchIndex, nodeId: string, q: string): boolean {
  const fq = normalizeQuery(q);
  if (fq.length < MIN_QUERY) return false;
  return (index.nodes.get(nodeId) ?? []).some((t) => t.includes(fq));
}

/** Liste baş harfi grubu (Türkçe büyük harf; harf değilse "#"). */
export function initialOf(title: string): string {
  const c = title.trim().charAt(0).toLocaleUpperCase("tr-TR");
  return /\p{L}/u.test(c) ? c : "#";
}
