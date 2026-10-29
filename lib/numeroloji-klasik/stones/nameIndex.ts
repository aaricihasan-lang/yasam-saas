// Klasik Numeroloji · Doğaltaş ad dizini (SAF).
//
// Katlama Doğaltaş Kütüphanesi ile BİREBİR aynıdır: `foldStoneLibraryText` doğrudan içe aktarılır (DB tarafı
// `public.stone_library_fold` ile parity testi kütüphanede: scripts/stone-library/f1-harness.ts).
// Çözüm sırası: tam ad → boşluksuz (compact) ad → yerel takma ad tablosu → (yoksa) kelime içerme = BELİRSİZ.
// Birden çok aday → "ambiguous" (otomatik seçim YOK). Kelime içerme ("Akik" ⊂ "Yosun Akik") ASLA "matched" olmaz.

import { foldStoneLibraryText } from "../../stone-library/fold";
import type { NameMatchVia, StoneCandidate } from "./types";

export const foldStoneName = foldStoneLibraryText;

/** Boşluksuz biçim: "Kaplan Gözü" = "Kaplangözü", "Tiger's Eye" = "Tigers Eye". */
export function compactStoneName(v: string | null | undefined): string {
  return foldStoneLibraryText(v).replace(/ /g, "");
}

/**
 * Yerel (bizim) takma ad tablosu: katlanmış takma ad → katlanmış hedef ad. Hedef dizinde yoksa satır etkisizdir.
 * Yalnız yaygın Türkçe / İngilizce eş adlar; kaynak metni DEĞİLDİR. Ekleme owner onayıyla (bkz. DOGALTAS.md).
 */
export const STONE_NAME_ALIASES: ReadonlyArray<readonly [alias: string, target: string]> = Object.freeze([
  ["Pırlanta", "Elmas"],
  ["Rubi", "Yakut"],
  ["Granat", "Garnet"],
  ["Lal Taşı", "Garnet"],
  ["Zebercet", "Peridot"],
  ["Zeberced", "Peridot"],
  ["Olivin", "Peridot"],
  ["Kaya Kristali", "Berrak Kuvars"],
  ["Dağ Kristali", "Berrak Kuvars"],
  ["Rock Crystal", "Clear Quartz"],
  ["Citrin", "Sitrin"],
  ["Lapis", "Lapis Lazuli"],
  ["Lacivert Taşı", "Lapis Lazuli"],
  ["Firuze", "Turkuaz"],
  ["Kantaşı", "Kan Taşı"],
  ["Heliotrope", "Bloodstone"],
  ["Tiger Eye", "Tigers Eye"],
] as const);

type Entry = { stoneKey: string; nameTr: string; nameEn: string | null };

export type StoneNameIndex = {
  readonly byName: ReadonlyMap<string, readonly Entry[]>;
  readonly byCompact: ReadonlyMap<string, readonly Entry[]>;
  readonly aliasTargets: ReadonlyMap<string, string>;
  readonly entries: readonly Entry[];
  /** Bir katlanmış adın birden çok taşa işaret ettiği durumlar (veri kalitesi raporu). */
  readonly collisions: readonly { key: string; stoneKeys: string[] }[];
};

export type NameResolution =
  | { status: "matched"; entry: Entry; via: NameMatchVia }
  | { status: "ambiguous"; candidates: (Entry & { via: NameMatchVia })[] }
  | { status: "unmatched" };

function push(map: Map<string, Entry[]>, key: string, e: Entry): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.some((x) => x.stoneKey === e.stoneKey)) list.push(e);
  map.set(key, list);
}

export function buildStoneNameIndex(stones: readonly StoneCandidate[], aliases = STONE_NAME_ALIASES): StoneNameIndex {
  const byName = new Map<string, Entry[]>();
  const byCompact = new Map<string, Entry[]>();
  const entries: Entry[] = [];
  for (const s of stones) {
    if (!s || typeof s.stoneKey !== "string" || !s.stoneKey || typeof s.nameTr !== "string") continue;
    const e: Entry = { stoneKey: s.stoneKey, nameTr: s.nameTr, nameEn: s.nameEn ?? null };
    entries.push(e);
    for (const n of [s.nameTr, s.nameEn ?? "", ...(Array.isArray(s.aliases) ? s.aliases : [])]) {
      if (typeof n !== "string") continue;
      push(byName, foldStoneLibraryText(n), e);
      push(byCompact, compactStoneName(n), e);
    }
  }
  const aliasTargets = new Map<string, string>();
  for (const [a, t] of aliases) aliasTargets.set(compactStoneName(a), compactStoneName(t));
  const collisions = [...byName.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({ key, stoneKeys: v.map((x) => x.stoneKey).sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { byName, byCompact, aliasTargets, entries, collisions };
}

function fromList(list: readonly Entry[] | undefined, via: NameMatchVia): NameResolution | null {
  if (!list || list.length === 0) return null;
  if (list.length === 1) return { status: "matched", entry: list[0], via };
  return { status: "ambiguous", candidates: list.map((e) => ({ ...e, via })) };
}

/** Bir serbest metin taş adını dizine çözer. */
export function resolveStoneName(index: StoneNameIndex, raw: string | null | undefined): NameResolution {
  const name = typeof raw === "string" ? raw : "";
  const f = foldStoneLibraryText(name);
  if (!f) return { status: "unmatched" };
  const c = f.replace(/ /g, "");
  const direct = fromList(index.byName.get(f), "name") ?? fromList(index.byCompact.get(c), "compact");
  if (direct) return direct;
  const target = index.aliasTargets.get(c);
  if (target) {
    const viaAlias = fromList(index.byCompact.get(target), "alias");
    if (viaAlias) return viaAlias;
  }
  // Kelime içerme (asla otomatik seçilmez):
  //   partial — girdinin TÜM kelimeleri taş adında tam kelime ("Akik" ⊂ "Yosun Akik");
  //   variant — taş adının TÜM kelimeleri girdide ("Safir" ⊂ "Sarı Safir": çeşit / renk varyantı olabilir).
  const words = f.split(" ");
  const partial: (Entry & { via: NameMatchVia })[] = [];
  for (const e of index.entries) {
    const names = [e.nameTr, e.nameEn ?? ""].map((n) => foldStoneLibraryText(n)).filter(Boolean).map((n) => n.split(" "));
    if (names.some((w) => words.every((x) => w.includes(x)))) partial.push({ ...e, via: "partial" });
    else if (names.some((w) => w.every((x) => words.includes(x)))) partial.push({ ...e, via: "variant" });
  }
  if (partial.length > 0) {
    partial.sort((a, b) => a.nameTr.localeCompare(b.nameTr, "tr") || a.stoneKey.localeCompare(b.stoneKey));
    return { status: "ambiguous", candidates: partial.slice(0, 8) };
  }
  return { status: "unmatched" };
}
